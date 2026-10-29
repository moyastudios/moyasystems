import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// AES-256-GCM for secrets at rest. Format: v1:<keyId>:<iv>:<tag>:<ciphertext> (base64url parts).
// `aad` binds a ciphertext to where it is stored (e.g. the setting key) so it can't be swapped elsewhere.

type KeyRing = { currentId: string; keys: Map<string, Buffer> };
let ring: KeyRing | undefined;

function loadKey(b64: string, name: string): Buffer {
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded`);
  return key;
}

function keyRing(): KeyRing {
  if (ring) return ring;
  const current = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!current) throw new Error("SETTINGS_ENCRYPTION_KEY is not set");
  const currentId = process.env.SETTINGS_ENCRYPTION_KEY_ID ?? "k1";
  const keys = new Map([[currentId, loadKey(current, "SETTINGS_ENCRYPTION_KEY")]]);
  // Optional previous key, so values can still be read during a rotation.
  const prev = process.env.SETTINGS_ENCRYPTION_KEY_PREVIOUS;
  const prevId = process.env.SETTINGS_ENCRYPTION_KEY_PREVIOUS_ID;
  if (prev && prevId) keys.set(prevId, loadKey(prev, "SETTINGS_ENCRYPTION_KEY_PREVIOUS"));
  ring = { currentId, keys };
  return ring;
}

export function encryptSecret(plaintext: string, aad: string): string {
  const { currentId, keys } = keyRing();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.get(currentId)!, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", currentId, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

export function decryptSecret(payload: string, aad: string): string {
  const [v, keyId, iv, tag, ct] = payload.split(":");
  if (v !== "v1" || !keyId || !iv || !tag || ct === undefined) throw new Error("Bad ciphertext format");
  const key = keyRing().keys.get(keyId);
  if (!key) throw new Error(`Unknown encryption key id ${keyId}`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export const hmacSha256Hex = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Compare digests so length differences don't short-circuit.
  return timingSafeEqual(createHash("sha256").update(ab).digest(), createHash("sha256").update(bb).digest()) && ab.length === bb.length;
}

/** Canonical string the game signs. Must match roblox/.../ApiClient.luau. */
export function gameSigningString(ts: string, nonce: string, method: string, path: string, body: string): string {
  return ["v1", ts, nonce, method.toUpperCase(), path, sha256Hex(body)].join("\n");
}
