import { randomBytes } from "node:crypto";
import type { Db } from "@westbridge/db";
import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH, LINK_CODE_TTL_SECONDS } from "@westbridge/shared";
import { sha256Hex } from "./crypto";

export function generateLinkCode(): string {
  // 32-char alphabet: masking a random byte with 31 is unbiased.
  return [...randomBytes(LINK_CODE_LENGTH)].map((b) => LINK_CODE_ALPHABET[b & 31]).join("");
}

/** Issues a fresh code for this Discord user, replacing any previous one. */
export async function issueLinkCode(db: Db, discordId: string): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_SECONDS * 1000);
  for (let attempt = 0; ; attempt++) {
    const code = generateLinkCode();
    try {
      await db.linkCode.upsert({
        where: { discordId },
        create: { discordId, codeHash: sha256Hex(code), expiresAt },
        update: { codeHash: sha256Hex(code), expiresAt, usedAt: null, createdAt: new Date() },
      });
      return { code, expiresAt };
    } catch (e) {
      if (attempt >= 2) throw e; // code hash collision is ~1 in 10^9; retry a couple of times
    }
  }
}

export type LinkResult =
  | { ok: true; discordId: string; previousRobloxId: bigint | null }
  | { ok: false; reason: "INVALID_CODE" | "ROBLOX_TAKEN" };

/** Redeems a code (single use) and links the Discord ID to the Roblox account. */
export async function redeemLinkCode(db: Db, input: { code: string; robloxId: bigint; robloxUsername: string }): Promise<LinkResult> {
  const codeHash = sha256Hex(input.code);
  return db.$transaction(async (tx) => {
    const claimed = await tx.linkCode.updateMany({
      where: { codeHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return { ok: false, reason: "INVALID_CODE" } as const;
    const { discordId } = await tx.linkCode.findUniqueOrThrow({ where: { codeHash } });

    const holder = await tx.user.findUnique({ where: { robloxId: input.robloxId } });
    if (holder && holder.discordId !== discordId) return { ok: false, reason: "ROBLOX_TAKEN" } as const;

    const existing = await tx.user.findUnique({ where: { discordId } });
    await tx.user.upsert({
      where: { discordId },
      create: { discordId, robloxId: input.robloxId, robloxUsername: input.robloxUsername, linkedAt: new Date() },
      update: { robloxId: input.robloxId, robloxUsername: input.robloxUsername, linkedAt: new Date() },
    });
    return { ok: true, discordId, previousRobloxId: existing?.robloxId ?? null } as const;
  });
}
