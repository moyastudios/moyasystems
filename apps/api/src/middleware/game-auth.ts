import type { MiddlewareHandler } from "hono";
import { decryptSecret, gameSigningString, hmacSha256Hex, safeEqual } from "@westbridge/core";
import { getDb, Prisma } from "@westbridge/db";
import { GAME_MAX_CLOCK_SKEW_SECONDS } from "@westbridge/shared";
import type { AppEnv } from "../lib/types";

const MAX_BODY = 16 * 1024;

/**
 * Verifies a request signed by a game server with its per-server session key:
 *   X-WB-Session, X-WB-Timestamp (unix seconds), X-WB-Nonce, X-WB-Signature = hex HMAC-SHA256(key, signing string)
 * Rejects stale timestamps (> 60s), replayed nonces and expired sessions.
 */
export const requireGameSignature: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessionId = c.req.header("x-wb-session") ?? "";
  const ts = c.req.header("x-wb-timestamp") ?? "";
  const nonce = c.req.header("x-wb-nonce") ?? "";
  const signature = c.req.header("x-wb-signature") ?? "";
  const deny = (reason: string) => c.json({ error: "UNAUTHORIZED", reason }, 401);

  if (!/^[0-9a-f-]{36}$/.test(sessionId) || !/^\d{10}$/.test(ts) || !/^[A-Za-z0-9-]{16,64}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) {
    return deny("BAD_HEADERS");
  }
  if (Math.abs(Date.now() / 1000 - Number(ts)) > GAME_MAX_CLOCK_SKEW_SECONDS) return deny("STALE");

  const raw = await c.req.text();
  if (raw.length > MAX_BODY) return c.json({ error: "TOO_LARGE" }, 413);

  const db = getDb();
  const session = await db.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.expiresAt < new Date()) return deny("SESSION");

  const key = Buffer.from(decryptSecret(session.keyCiphertext, `game_session:${session.id}`), "hex");
  const expected = hmacSha256Hex(key, gameSigningString(ts, nonce, c.req.method, c.req.path, raw));
  if (!safeEqual(expected, signature)) return deny("SIGNATURE");

  try {
    await db.requestNonce.create({
      data: { nonce: `${sessionId}:${nonce}`, expiresAt: new Date(Date.now() + 2 * GAME_MAX_CLOCK_SKEW_SECONDS * 1000) },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return deny("REPLAY");
    throw e;
  }

  c.set("game", { sessionId: session.id, jobId: session.jobId, placeId: session.placeId });
  c.set("rawBody", raw);
  await next();
};
