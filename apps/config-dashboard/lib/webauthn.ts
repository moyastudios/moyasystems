import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { ChallengePurpose } from "@westbridge/db";
import { db } from "./db";
import { env } from "./env";

const CHALLENGE_TTL_MS = 5 * 60_000;

async function storeChallenge(purpose: ChallengePurpose, discordId: string, challenge: string) {
  // Only the newest challenge per user + purpose is valid.
  await db().authChallenge.deleteMany({ where: { purpose, discordId } });
  await db().authChallenge.create({ data: { purpose, discordId, challenge, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) } });
}

async function takeChallenge(purpose: ChallengePurpose, discordId: string): Promise<string | null> {
  const row = await db().authChallenge.findFirst({ where: { purpose, discordId, usedAt: null, expiresAt: { gt: new Date() } } });
  if (!row) return null;
  const used = await db().authChallenge.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return used.count === 1 ? row.challenge : null;
}

export async function registrationOptions(discordId: string) {
  const existing = await db().passkey.findMany({ where: { discordId } });
  const options = await generateRegistrationOptions({
    rpName: "Westbridge Config",
    rpID: env().WEBAUTHN_RP_ID,
    userName: `owner-${discordId}`,
    userID: new TextEncoder().encode(discordId),
    attestationType: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports as never })),
  });
  await storeChallenge("PASSKEY_REGISTER", discordId, options.challenge);
  return options;
}

export async function verifyRegistration(discordId: string, response: RegistrationResponseJSON, nickname: string | null) {
  const expectedChallenge = await takeChallenge("PASSKEY_REGISTER", discordId);
  if (!expectedChallenge) return false;
  const v = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env().PUBLIC_ORIGIN,
    expectedRPID: env().WEBAUTHN_RP_ID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!v?.verified) return false;
  const { credential } = v.registrationInfo;
  await db().passkey.create({
    data: {
      discordId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      nickname,
      lastUsedAt: new Date(),
    },
  });
  return true;
}

export async function authenticationOptions(discordId: string, purpose: "PASSKEY_LOGIN" | "STEP_UP") {
  const keys = await db().passkey.findMany({ where: { discordId } });
  if (!keys.length) return null;
  const options = await generateAuthenticationOptions({
    rpID: env().WEBAUTHN_RP_ID,
    userVerification: "required",
    allowCredentials: keys.map((k) => ({ id: k.credentialId, transports: k.transports as never })),
  });
  await storeChallenge(purpose, discordId, options.challenge);
  return options;
}

export async function verifyAuthentication(discordId: string, purpose: "PASSKEY_LOGIN" | "STEP_UP", response: AuthenticationResponseJSON) {
  const expectedChallenge = await takeChallenge(purpose, discordId);
  if (!expectedChallenge || typeof response?.id !== "string") return false;
  // The credential must belong to this Discord account.
  const key = await db().passkey.findFirst({ where: { credentialId: response.id, discordId } });
  if (!key) return false;
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env().PUBLIC_ORIGIN,
    expectedRPID: env().WEBAUTHN_RP_ID,
    credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: Number(key.counter), transports: key.transports as never },
    requireUserVerification: true,
  }).catch(() => null);
  if (!v?.verified) return false;
  await db().passkey.update({ where: { id: key.id }, data: { counter: BigInt(v.authenticationInfo.newCounter), lastUsedAt: new Date() } });
  return true;
}
