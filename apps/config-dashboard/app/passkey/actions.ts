"use server";

import { cookies } from "next/headers";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { rateLimit, sha256Hex } from "@westbridge/core";
import { SettingKeys } from "@westbridge/shared";
import { auditConfig, db } from "@/lib/db";
import { CLAIM_COOKIE, INVITE_COOKIE } from "@/lib/oauth";
import { requireDiscordSession, requireOwner, rotateSession, verifyCsrf, type Session } from "@/lib/session";
import { authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration } from "@/lib/webauthn";

type Mode = "login" | "claim" | "invite" | "none";

async function claimChallengeId(): Promise<string | null> {
  const id = (await cookies()).get(CLAIM_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row, claimed] = await Promise.all([
    db().authChallenge.findFirst({ where: { id, purpose: "CLAIM", usedAt: null, expiresAt: { gt: new Date() } } }),
    db().setting.count({ where: { key: SettingKeys.setupClaimedBy } }),
  ]);
  return row && !claimed ? row.id : null;
}

async function inviteFor(s: Session) {
  const token = (await cookies()).get(INVITE_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  return db().ownerInvite.findFirst({ where: { tokenHash: sha256Hex(token), usedAt: null, expiresAt: { gt: new Date() }, forDiscordId: s.discordId } });
}

async function modeFor(s: Session): Promise<Mode> {
  if (await db().passkey.count({ where: { discordId: s.discordId } })) return "login";
  if (await claimChallengeId()) return "claim";
  if (await inviteFor(s)) return "invite";
  return "none";
}

export async function getPasskeyMode() {
  return modeFor(await requireDiscordSession());
}

export async function beginPasskey(csrf: string) {
  const s = await requireDiscordSession();
  if (!verifyCsrf(s, csrf)) return { ok: false as const, error: "Reload the page." };
  if (!(await rateLimit(db(), `passkey:${s.discordId}`, 20, 600))) return { ok: false as const, error: "Too many attempts. Wait 10 minutes." };
  const mode = await modeFor(s);
  if (mode === "none") return { ok: false as const, error: "No passkey is registered for this account. Ask an existing owner for an invite." };
  const options = mode === "login" ? await authenticationOptions(s.discordId, "PASSKEY_LOGIN") : await registrationOptions(s.discordId);
  return { ok: true as const, mode, options };
}

export async function finishPasskey(csrf: string, response: unknown, nickname: string | null) {
  const s = await requireDiscordSession();
  if (!verifyCsrf(s, csrf)) return { ok: false as const, error: "Reload the page." };
  const mode = await modeFor(s);
  const name = typeof nickname === "string" ? nickname.trim().slice(0, 40) || null : null;

  if (mode === "login") {
    if (!(await verifyAuthentication(s.discordId, "PASSKEY_LOGIN", response as AuthenticationResponseJSON))) {
      await auditConfig(`owner:${s.discordId}`, "config.login.passkey_failed");
      return { ok: false as const, error: "Passkey check failed." };
    }
  } else if (mode === "claim") {
    const id = await claimChallengeId();
    if (!id || !(await verifyRegistration(s.discordId, response as RegistrationResponseJSON, name))) return { ok: false as const, error: "Passkey registration failed." };
    await db().$transaction(async (tx) => {
      const used = await tx.authChallenge.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count !== 1 || (await tx.setting.count({ where: { key: SettingKeys.setupClaimedBy } }))) throw new Error("already claimed");
      await tx.setting.createMany({
        data: [
          { key: SettingKeys.setupClaimedBy, value: s.discordId, updatedBy: s.discordId },
          { key: SettingKeys.setupClaimedAt, value: new Date().toISOString(), updatedBy: s.discordId },
        ],
      });
    });
    (await cookies()).delete(CLAIM_COOKIE);
    await auditConfig(`owner:${s.discordId}`, "config.setup.claimed");
  } else if (mode === "invite") {
    const invite = await inviteFor(s);
    if (!invite || !(await verifyRegistration(s.discordId, response as RegistrationResponseJSON, name))) return { ok: false as const, error: "Passkey registration failed." };
    await db().ownerInvite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
    (await cookies()).delete(INVITE_COOKIE);
    await auditConfig(`owner:${s.discordId}`, "config.owner.invite_accepted", { createdBy: invite.createdBy });
  } else {
    return { ok: false as const, error: "Not allowed." };
  }

  await rotateSession(s, { passkeyVerifiedAt: new Date() });
  await auditConfig(`owner:${s.discordId}`, "config.login.passkey", { mode });
  return { ok: true as const };
}

/** Passkey re-check before a sensitive change. */
export async function beginStepUp(csrf: string) {
  const s = await requireOwner();
  if (!verifyCsrf(s, csrf)) return null;
  if (!(await rateLimit(db(), `stepup:${s.discordId}`, 30, 600))) return null;
  return authenticationOptions(s.discordId, "STEP_UP");
}

export async function finishStepUp(csrf: string, response: unknown) {
  const s = await requireOwner();
  if (!verifyCsrf(s, csrf)) return false;
  const ok = await verifyAuthentication(s.discordId, "STEP_UP", response as AuthenticationResponseJSON);
  if (ok) await db().dashboardSession.update({ where: { idHash: s.idHash }, data: { stepUpAt: new Date() } });
  await auditConfig(`owner:${s.discordId}`, ok ? "config.stepup" : "config.stepup.failed");
  return ok;
}
