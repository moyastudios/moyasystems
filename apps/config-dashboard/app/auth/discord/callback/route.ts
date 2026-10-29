import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { logError, rateLimit, safeEqual } from "@westbridge/core";
import { auditConfig, db, requestIp } from "@/lib/db";
import { env, isOwner } from "@/lib/env";
import { exchangeCode, OAUTH_COOKIE } from "@/lib/oauth";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = env().PUBLIC_ORIGIN;
  const fail = (reason: string) => NextResponse.redirect(`${origin}/login?error=${reason}`, 303);
  const jar = await cookies();
  const challengeId = jar.get(OAUTH_COOKIE)?.value;
  jar.delete(OAUTH_COOKIE);

  if (!(await rateLimit(db(), `oauth-cb:${await requestIp()}`, 20, 600))) return fail("rate");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!challengeId || !code || !state || code.length > 200 || !/^[0-9a-f-]{36}$/.test(challengeId)) return fail("state");

  // Single use: only the first request can claim the challenge.
  const used = await db().authChallenge.updateMany({
    where: { id: challengeId, purpose: "OAUTH_STATE", usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (used.count !== 1) return fail("state");
  const row = await db().authChallenge.findUniqueOrThrow({ where: { id: challengeId } });
  const stored = JSON.parse(row.challenge) as { state: string; verifier: string };
  if (!safeEqual(stored.state, state)) return fail("state");

  let discordId: string;
  try {
    discordId = await exchangeCode(code, stored.verifier);
  } catch (e) {
    logError("oauth exchange", e);
    return fail("discord");
  }
  if (!isOwner(discordId)) {
    await auditConfig(`discord:${discordId}`, "config.login.denied", { reason: "not on owner allowlist" });
    return fail("denied");
  }
  await createSession(discordId);
  await auditConfig(`owner:${discordId}`, "config.login.discord", {});
  // The session cookie is SameSite=Strict, so it isn't sent on a redirect chain that started at discord.com.
  // A same-origin refresh makes the next request first-party.
  return new NextResponse('<!doctype html><meta http-equiv="refresh" content="0;url=/passkey"><a href="/passkey">Continue</a>', {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
