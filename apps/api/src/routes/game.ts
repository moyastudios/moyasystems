import { randomBytes, randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import type { z } from "zod";
import { audit, encryptSecret, getSetting, rateLimit, redeemLinkCode, safeEqual } from "@westbridge/core";
import { getDb } from "@westbridge/db";
import { GAME_SESSION_TTL_SECONDS, SettingKeys, gameAckBody, gameLinkBody } from "@westbridge/shared";
import { background } from "../lib/background";
import type { AppEnv } from "../lib/types";
import { requireGameSignature } from "../middleware/game-auth";
import { requireSetupComplete } from "../middleware/setup-guard";

export const game = new Hono<AppEnv>();

const gameAudit = (c: Context<AppEnv>, action: string, payload: Record<string, unknown> = {}) =>
  audit(getDb(), { actor: `game:${c.get("game").jobId}`, action, payload: { placeId: c.get("game").placeId, ...payload }, ip: c.get("ip") }).then((a) =>
    background(a.mirror),
  );

function parseBody<T extends z.ZodType>(c: Context<AppEnv>, schema: T): z.infer<T> | null {
  try {
    const r = schema.safeParse(JSON.parse(c.get("rawBody") || "{}"));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/**
 * Bootstrap: the game proves itself with the Secrets-store value (sent as a header, which is all
 * Roblox allows a Secret to be used for) and receives a short-lived per-server HMAC key.
 */
game.post("/game/session", async (c) => {
  const db = getDb();
  const ip = c.get("ip");
  if (!(await rateLimit(db, `game-session:${ip}`, 30, 60))) return c.json({ error: "RATE_LIMITED" }, 429);

  const expected = await getSetting(db, SettingKeys.signingSecret);
  if (!expected) return c.json({ error: "SETUP_INCOMPLETE" }, 503);

  const presented = c.req.header("x-wb-secret") ?? "";
  const jobId = c.req.header("x-wb-job-id") ?? "";
  const placeId = c.req.header("x-wb-place-id") ?? "";
  if (!/^[A-Za-z0-9-]{1,64}$/.test(jobId) || !/^\d{1,19}$/.test(placeId) || !safeEqual(presented, expected)) {
    const a = await audit(db, { actor: "game:unknown", action: "game.session.denied", payload: { jobId: jobId.slice(0, 64) }, ip });
    background(a.mirror);
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }

  const id = randomUUID();
  const key = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + GAME_SESSION_TTL_SECONDS * 1000);
  await db.gameSession.create({ data: { id, jobId, placeId: BigInt(placeId), keyCiphertext: encryptSecret(key, `game_session:${id}`), expiresAt } });
  // Opportunistic clean-up; safe to run any number of times.
  background(
    Promise.all([
      db.gameSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      db.requestNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      db.idempotencyKey.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]),
  );
  const a = await audit(db, { actor: `game:${jobId}`, action: "game.session.open", payload: { placeId, sessionId: id }, ip });
  background(a.mirror);
  return c.json({ sessionId: id, key, expiresAt: Math.floor(expiresAt.getTime() / 1000) });
});

game.use("/game/*", async (c, next) => (c.req.path === "/game/session" ? next() : requireGameSignature(c, next)));

/** Game → API connectivity test (also sent by every server on boot). */
game.post("/game/ping", async (c) => {
  const done = await getDb().connectivityCheck.updateMany({
    where: { direction: "game_to_api", completedAt: null, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } },
    data: { completedAt: new Date(), detail: c.get("game").jobId },
  });
  await gameAudit(c, "game.ping", { completedChecks: done.count });
  return c.json({ ok: true, serverTime: Math.floor(Date.now() / 1000) });
});

/** Acknowledges an API → game test message received through MessagingService. */
game.post("/game/ack", async (c) => {
  const body = parseBody(c, gameAckBody);
  if (!body) return c.json({ error: "BAD_REQUEST" }, 400);
  const done = await getDb().connectivityCheck.updateMany({
    where: { id: body.checkId, direction: "api_to_game", completedAt: null },
    data: { completedAt: new Date(), detail: c.get("game").jobId },
  });
  // A verified signed ack also proves the game → API direction.
  if (done.count === 1) {
    await getDb().connectivityCheck.updateMany({
      where: { direction: "game_to_api", completedAt: null, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } },
      data: { completedAt: new Date(), detail: c.get("game").jobId },
    });
  }
  await gameAudit(c, "game.ack", { checkId: body.checkId, matched: done.count });
  return c.json({ ok: done.count === 1 });
});

/** Settings the game needs; nothing here is secret. */
game.get("/game/config", requireSetupComplete, async (c) => {
  const db = getDb();
  const [groupId, lowest] = await Promise.all([
    getSetting(db, SettingKeys.groupId),
    db.rank.findFirst({ where: { robloxGroupRank: { not: null } }, orderBy: { robloxGroupRank: "asc" } }),
  ]);
  return c.json({ groupId: Number(groupId), minStaffGroupRank: lowest?.robloxGroupRank ?? 256 });
});

game.post("/game/link", requireSetupComplete, async (c) => {
  const db = getDb();
  const idemKey = c.req.header("x-wb-idempotency-key");
  const idemId = idemKey && /^[A-Za-z0-9-]{8,64}$/.test(idemKey) ? `${c.get("game").jobId}:${idemKey}` : null;
  if (idemId) {
    const prior = await db.idempotencyKey.findUnique({ where: { key: idemId } });
    if (prior) return c.json(prior.response as object, prior.status as 200);
  }

  const respond = async (status: 200 | 400 | 403 | 409 | 429, body: Record<string, unknown>) => {
    if (idemId) await db.idempotencyKey.create({ data: { key: idemId, status, response: body as object, expiresAt: new Date(Date.now() + 3600_000) } }).catch(() => {});
    return c.json(body, status);
  };

  const body = parseBody(c, gameLinkBody);
  if (!body) return respond(400, { ok: false, error: "BAD_REQUEST" });
  if (!(await rateLimit(db, `game-link:${body.robloxId}`, 5, 600)) || !(await rateLimit(db, `game-link-job:${c.get("game").jobId}`, 60, 600))) {
    return respond(429, { ok: false, error: "RATE_LIMITED" });
  }

  // Linking is staff-only: the player must hold a configured staff group rank.
  const lowest = await db.rank.findFirst({ where: { robloxGroupRank: { not: null } }, orderBy: { robloxGroupRank: "asc" } });
  if (!lowest?.robloxGroupRank || body.groupRank < lowest.robloxGroupRank) {
    await gameAudit(c, "game.link.denied", { robloxId: body.robloxId, reason: "NOT_STAFF" });
    return respond(403, { ok: false, error: "NOT_STAFF" });
  }

  const result = await redeemLinkCode(db, body);
  await gameAudit(c, result.ok ? "game.link" : "game.link.failed", {
    robloxId: body.robloxId,
    robloxUsername: body.robloxUsername,
    ...(result.ok ? { discordId: result.discordId, previousRobloxId: result.previousRobloxId } : { reason: result.reason }),
  });
  if (!result.ok) return respond(result.reason === "ROBLOX_TAKEN" ? 409 : 400, { ok: false, error: result.reason });
  return respond(200, { ok: true });
});
