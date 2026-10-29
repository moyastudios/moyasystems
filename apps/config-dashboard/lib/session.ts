import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { hmacSha256Hex, randomToken, safeEqual, sha256Hex } from "@westbridge/core";
import { SESSION_IDLE_SECONDS, SESSION_MAX_SECONDS, STEP_UP_WINDOW_SECONDS } from "@westbridge/shared";
import { db, requestIp } from "./db";
import { isOwner } from "./env";

export const SESSION_COOKIE = "__Host-wb_session";

export const cookieOpts = (maxAge: number) =>
  ({ httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge }) as const;

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function createSession(discordId: string, carry?: { passkeyVerifiedAt?: Date; createdAt?: Date; expiresAt?: Date }) {
  const token = randomToken();
  const now = new Date();
  await db().dashboardSession.create({
    data: {
      idHash: sha256Hex(token),
      discordId,
      csrfSecret: randomToken(),
      ip: await requestIp(),
      userAgent: (await headers()).get("user-agent")?.slice(0, 200) ?? null,
      passkeyVerifiedAt: carry?.passkeyVerifiedAt ?? null,
      createdAt: carry?.createdAt ?? now,
      expiresAt: carry?.expiresAt ?? new Date(now.getTime() + SESSION_MAX_SECONDS * 1000),
    },
  });
  const maxAge = Math.floor(((carry?.expiresAt?.getTime() ?? now.getTime() + SESSION_MAX_SECONDS * 1000) - now.getTime()) / 1000);
  (await cookies()).set(SESSION_COOKIE, token, cookieOpts(maxAge));
}

/** Current session if valid: not revoked, under 8h old, active in the last 15 min, still on the owner allowlist. */
export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const s = await db().dashboardSession.findUnique({ where: { idHash: sha256Hex(token) } });
  if (!s || s.revokedAt) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > SESSION_IDLE_SECONDS * 1000 || !isOwner(s.discordId)) {
    await db().dashboardSession.update({ where: { idHash: s.idHash }, data: { revokedAt: new Date() } });
    return null;
  }
  if (now - s.lastSeenAt.getTime() > 30_000) {
    await db().dashboardSession.update({ where: { idHash: s.idHash }, data: { lastSeenAt: new Date() } });
  }
  return s;
}

/** Signed in with Discord, passkey not necessarily verified yet. */
export async function requireDiscordSession() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Discord + passkey. Use on every page and action past sign-in. */
export async function requireOwner() {
  const s = await requireDiscordSession();
  if (!s.passkeyVerifiedAt) redirect("/passkey");
  return s;
}

/** Replaces the session with a fresh token (on privilege change), keeping its 8h limit. */
export async function rotateSession(s: Session, patch: { passkeyVerifiedAt?: Date }) {
  await db().dashboardSession.update({ where: { idHash: s.idHash }, data: { revokedAt: new Date() } });
  await createSession(s.discordId, { createdAt: s.createdAt, expiresAt: s.expiresAt, passkeyVerifiedAt: patch.passkeyVerifiedAt ?? s.passkeyVerifiedAt ?? undefined });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db().dashboardSession.updateMany({ where: { idHash: sha256Hex(token) }, data: { revokedAt: new Date() } });
  jar.delete(SESSION_COOKIE);
}

export const csrfToken = (s: Session) => hmacSha256Hex(s.csrfSecret, `csrf:${s.idHash}`);
export const verifyCsrf = (s: Session, token: unknown) => typeof token === "string" && safeEqual(csrfToken(s), token);

/** Uses up a recent passkey re-check. Each sensitive change needs its own. */
export async function consumeStepUp(s: Session): Promise<boolean> {
  const r = await db().dashboardSession.updateMany({
    where: { idHash: s.idHash, stepUpAt: { gt: new Date(Date.now() - STEP_UP_WINDOW_SECONDS * 1000) } },
    data: { stepUpAt: null },
  });
  return r.count === 1;
}
