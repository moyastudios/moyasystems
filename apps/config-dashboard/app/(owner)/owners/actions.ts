"use server";

import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { ConfigError, randomToken, sha256Hex } from "@westbridge/core";
import { OWNER_INVITE_TTL_SECONDS, snowflake } from "@westbridge/shared";
import { ownerAction } from "@/lib/action";
import { db } from "@/lib/db";
import { env, isOwner } from "@/lib/env";
import { registrationOptions, verifyRegistration } from "@/lib/webauthn";

/** Invite link for another allowlisted owner to register their passkey. Shown once. */
export async function createInvite(csrf: string, discordId: unknown) {
  return ownerAction({ name: "owner.invite", csrf, input: discordId, schema: snowflake, stepUp: true }, async (id, s) => {
    if (!isOwner(id)) throw new ConfigError("That Discord ID isn't in OWNER_DISCORD_IDS. Add it in Vercel first.");
    const token = randomToken();
    await db().ownerInvite.create({
      data: { tokenHash: sha256Hex(token), forDiscordId: id, createdBy: s.discordId, expiresAt: new Date(Date.now() + OWNER_INVITE_TTL_SECONDS * 1000) },
    });
    return `${env().PUBLIC_ORIGIN}/invite/${token}`;
  });
}

/** Adding another passkey to your own account: starts with a re-check of an existing one. */
export async function beginAddPasskey(csrf: string) {
  return ownerAction({ name: "passkey.add.begin", csrf, input: undefined, schema: z.undefined(), stepUp: true }, async (_v, s) =>
    registrationOptions(s.discordId),
  );
}

export async function finishAddPasskey(csrf: string, response: unknown, nickname: unknown) {
  return ownerAction(
    { name: "passkey.add", csrf, input: { nickname }, schema: z.object({ nickname: z.string().trim().max(40).nullable() }), stepUp: false },
    async (v, s) => {
      if (!(await verifyRegistration(s.discordId, response as RegistrationResponseJSON, v.nickname || null))) throw new ConfigError("Passkey registration failed.");
      return true;
    },
  );
}

export async function removePasskey(csrf: string, id: unknown) {
  return ownerAction({ name: "passkey.remove", csrf, input: id, schema: z.string().uuid(), stepUp: true }, async (pid, s) => {
    if ((await db().passkey.count({ where: { discordId: s.discordId } })) <= 1) throw new ConfigError("You can't remove your only passkey.");
    const r = await db().passkey.deleteMany({ where: { id: pid, discordId: s.discordId } });
    if (!r.count) throw new ConfigError("Passkey not found.");
    return true;
  });
}

export async function revokeOtherSessions(csrf: string) {
  return ownerAction({ name: "sessions.revoke_others", csrf, input: undefined, schema: z.undefined(), stepUp: false }, async (_v, s) => {
    const r = await db().dashboardSession.updateMany({ where: { discordId: s.discordId, revokedAt: null, idHash: { not: s.idHash } }, data: { revokedAt: new Date() } });
    return r.count;
  });
}
