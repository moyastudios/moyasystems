// Integration test against a real Postgres with the restricted roles applied (packages/db/sql/roles.sql).
// Use a freshly migrated database. Runs only when TEST_API_DATABASE_URL (wb_api) and TEST_CONFIG_DATABASE_URL (wb_config) are set.
import { createHmac, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import * as core from "@westbridge/core";
import { createDb, getDb } from "@westbridge/db";
import { app } from "../src/app";

const API_URL = process.env.TEST_API_DATABASE_URL;
const CONFIG_URL = process.env.TEST_CONFIG_DATABASE_URL;
const run = API_URL && CONFIG_URL ? describe : describe.skip;

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");

process.env.DATABASE_URL = API_URL;
process.env.SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.DISCORD_APP_ID = "100000000000000001";
process.env.DISCORD_PUBLIC_KEY = rawPub;
process.env.DISCORD_BOT_TOKEN = "x".repeat(60);

const SECRET = "test-signing-secret-value";

run("api integration", () => {
  const configDb = createDb(CONFIG_URL ?? "postgresql://unused");
  const apiDb = getDb(API_URL ?? "postgresql://unused");

  let session: { sessionId: string; key: string };

  async function signed(path: string, body: unknown, opts: { ts?: number; nonce?: string } = {}) {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
    const nonce = opts.nonce ?? randomBytes(12).toString("hex");
    const method = body === undefined ? "GET" : "POST";
    const sig = createHmac("sha256", Buffer.from(session.key, "hex")).update(core.gameSigningString(ts, nonce, method, path, raw)).digest("hex");
    const headers = { "x-wb-session": session.sessionId, "x-wb-timestamp": ts, "x-wb-nonce": nonce, "x-wb-signature": sig, "content-type": "application/json" };
    return { res: await app.request(path, { method, headers, body: method === "POST" ? raw : undefined }), headers, raw };
  }

  beforeAll(async () => {
    // Simulate the wizard, writing as the config role.
    await core.applyConfigChange(configDb, "owner-test", async (tx) => {
      await core.setSetting(tx, "discord.guildId", "200000000000000001", "t");
      await core.setSetting(tx, "roblox.groupId", "123", "t");
      await core.setSetting(tx, "roblox.universeId", "456", "t");
      await core.setSetting(tx, "roblox.signingSecret", SECRET, "t");
      await core.replaceRanks(tx, [
        { name: "Moderator", discordRoleId: "300000000000000001", robloxGroupRank: 100 },
        { name: "Admin", discordRoleId: "300000000000000002", robloxGroupRank: 200 },
      ]);
    });
  });

  it("health works and reports incomplete setup", async () => {
    const res = await app.request("/health");
    expect(await res.json()).toMatchObject({ ok: true, setup: "incomplete" });
    expect(res.headers.get("strict-transport-security")).toContain("max-age");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("verifies Discord signatures", async () => {
    const body = JSON.stringify({ type: 1 });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");
    const ok = await app.request("/discord/interactions", { method: "POST", body, headers: { "x-signature-ed25519": sig, "x-signature-timestamp": ts } });
    expect(await ok.json()).toEqual({ type: 1 });
    const bad = await app.request("/discord/interactions", { method: "POST", body: body + " ", headers: { "x-signature-ed25519": sig, "x-signature-timestamp": ts } });
    expect(bad.status).toBe(401);
  });

  it("rejects a wrong game secret and issues a session for the right one", async () => {
    const h = { "x-wb-job-id": "job-1", "x-wb-place-id": "789" };
    expect((await app.request("/game/session", { method: "POST", headers: { ...h, "x-wb-secret": "nope" } })).status).toBe(401);
    const res = await app.request("/game/session", { method: "POST", headers: { ...h, "x-wb-secret": SECRET } });
    expect(res.status).toBe(200);
    session = (await res.json()) as typeof session;
    expect(session.key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts signed requests and rejects replays, stale and tampered ones", async () => {
    const { res, headers, raw } = await signed("/game/ping", {});
    expect(res.status).toBe(200);
    const replay = await app.request("/game/ping", { method: "POST", headers, body: raw });
    expect(await replay.json()).toMatchObject({ reason: "REPLAY" });
    const stale = await signed("/game/ping", {}, { ts: Math.floor(Date.now() / 1000) - 61 });
    expect(await stale.res.json()).toMatchObject({ reason: "STALE" });
    const t = await signed("/game/ping", { a: 1 });
    const tampered = await app.request("/game/ping", { method: "POST", headers: { ...t.headers, "x-wb-nonce": randomBytes(12).toString("hex") }, body: t.raw });
    expect(await tampered.json()).toMatchObject({ reason: "SIGNATURE" });
  });

  it("guards /game/link until setup is locked", async () => {
    const { res } = await signed("/game/link", { code: "ABCDEF", robloxId: 1, robloxUsername: "Tester", groupRank: 100 });
    expect(res.status).toBe(503);
  });

  it("links a staff account with a one-time code", async () => {
    await configDb.setting.create({ data: { key: "setup.lockedAt", value: new Date().toISOString() } });
    const { code } = await core.issueLinkCode(apiDb, "400000000000000001");
    const notStaff = await signed("/game/link", { code, robloxId: 42, robloxUsername: "Tester", groupRank: 50 });
    expect(notStaff.res.status).toBe(403);
    const ok = await signed("/game/link", { code: code.toLowerCase(), robloxId: 42, robloxUsername: "Tester", groupRank: 100 });
    expect(await ok.res.json()).toEqual({ ok: true });
    const reuse = await signed("/game/link", { code, robloxId: 42, robloxUsername: "Tester", groupRank: 100 });
    expect(await reuse.res.json()).toMatchObject({ error: "INVALID_CODE" });
    const user = await apiDb.user.findUnique({ where: { discordId: "400000000000000001" } });
    expect(user?.robloxId).toBe(42n);
    const cfg = await signed("/game/config", undefined);
    expect(await cfg.res.json()).toEqual({ groupId: 123, minStaffGroupRank: 100 });
  });

  it("versions config changes and rolls back", async () => {
    const before = await configDb.configVersion.findFirstOrThrow({ orderBy: { version: "desc" } });
    const changed = await core.applyConfigChange(configDb, "owner-test", (tx) => core.setSetting(tx, "roblox.groupId", "999", "t"));
    expect(changed.diff).toEqual({ settings: { "roblox.groupId": { from: "123", to: "999" } } });
    const secret = await core.applyConfigChange(configDb, "owner-test", (tx) => core.setSetting(tx, "roblox.signingSecret", "new", "t"));
    expect(secret.diff).toEqual({ settings: { "roblox.signingSecret": "changed" } });
    await core.rollbackConfig(configDb, "owner-test", before.version);
    expect(await core.getSetting(apiDb, "roblox.groupId")).toBe("123");
    expect(await core.getSetting(apiDb, "roblox.signingSecret")).toBe(SECRET);
  });

  it("keeps the roles separated", async () => {
    await expect(apiDb.setting.create({ data: { key: "x", value: "y" } })).rejects.toThrow();
    await expect(apiDb.passkey.findMany()).rejects.toThrow();
    await expect(configDb.case.findMany()).rejects.toThrow();
    await expect(apiDb.$executeRawUnsafe("DELETE FROM audit_log")).rejects.toThrow();
    expect(await apiDb.$queryRawUnsafe<{ n: bigint }[]>("SELECT count(*) AS n FROM audit_log").then((r) => r[0]!.n > 0n)).toBe(true);
  });
});
