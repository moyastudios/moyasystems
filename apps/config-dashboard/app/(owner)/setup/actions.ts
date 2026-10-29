"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { applyConfigChange, ConfigError, discord, getSetting, openCloud, replaceRanks, setSetting } from "@westbridge/core";
import {
  DISCORD_CHANNEL_KEYS,
  DISCORD_CHANNEL_LABELS,
  DISCORD_COMMANDS,
  MESSAGING_TOPIC,
  SettingKeys,
  discordStepInput,
  permissionsStepInput,
  quotaStepInput,
  ranksStepInput,
  robloxStepInput,
  type SetupStep,
} from "@westbridge/shared";
import { ownerAction } from "@/lib/action";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { setupState, type OpenCloudTest } from "@/lib/setup";

const none = z.object({}).optional();

async function requireReachable(step: SetupStep) {
  const st = await setupState();
  if (st.locked) return st;
  const order: SetupStep[] = ["claim", "discord", "roblox", "ranks", "permissions", "quota", "review"];
  const blocked = order.slice(0, order.indexOf(step)).find((k) => !st.steps[k]);
  if (blocked) throw new ConfigError(`Finish the ${blocked} step first.`);
  return st;
}

const actor = (discordId: string) => `owner:${discordId}`;

// ── Step 2: Discord ──

export async function saveDiscord(csrf: string, input: unknown) {
  return ownerAction({ name: "discord.save", csrf, input, schema: discordStepInput, stepUp: true }, async (v, s) => {
    await requireReachable("discord");
    const guilds = await discord.botGuilds();
    if (!guilds.some((g) => g.id === v.guildId)) throw new ConfigError("The bot isn't in that server.");
    const channels = new Set((await discord.guildChannels(v.guildId)).filter((c) => c.type === 0 || c.type === 5).map((c) => c.id));
    for (const k of DISCORD_CHANNEL_KEYS) {
      if (!channels.has(v.channels[k])) throw new ConfigError(`${DISCORD_CHANNEL_LABELS[k]}: channel isn't a text channel in that server.`);
    }
    return applyConfigChange(db(), s.discordId, async (tx) => {
      await setSetting(tx, SettingKeys.guildId, v.guildId, actor(s.discordId));
      for (const k of DISCORD_CHANNEL_KEYS) await setSetting(tx, SettingKeys.channel(k), v.channels[k], actor(s.discordId));
    });
  });
}

export async function sendTestMessage(csrf: string) {
  return ownerAction({ name: "discord.test_message", csrf, input: undefined, schema: none, stepUp: false }, async (_v, s) => {
    const channel = await getSetting(db(), SettingKeys.channel("audit"));
    if (!channel) throw new ConfigError("Save the Discord step first.");
    await discord.postMessage(channel, { content: `✅ Westbridge test message, sent by <@${s.discordId}> from the config dashboard.` });
    return true;
  });
}

export async function registerCommands(csrf: string) {
  return ownerAction({ name: "discord.register_commands", csrf, input: undefined, schema: none, stepUp: false }, async () => {
    const guildId = await getSetting(db(), SettingKeys.guildId);
    if (!guildId) throw new ConfigError("Save the Discord step first.");
    await discord.registerGuildCommands(env().DISCORD_APP_ID, guildId, DISCORD_COMMANDS);
    return DISCORD_COMMANDS.length;
  });
}

// ── Step 3: Roblox ──

export async function saveRoblox(csrf: string, input: unknown) {
  return ownerAction({ name: "roblox.save", csrf, input, schema: robloxStepInput, stepUp: true }, async (v, s) => {
    await requireReachable("roblox");
    const hasKey = await getSetting(db(), SettingKeys.openCloudKey);
    if (!v.openCloudKey && !hasKey) throw new ConfigError("Paste your Open Cloud API key.");
    return applyConfigChange(db(), s.discordId, async (tx) => {
      await setSetting(tx, SettingKeys.groupId, v.groupId, actor(s.discordId));
      await setSetting(tx, SettingKeys.universeId, v.universeId, actor(s.discordId));
      if (v.openCloudKey) await setSetting(tx, SettingKeys.openCloudKey, v.openCloudKey, actor(s.discordId));
    });
  });
}

/** Generates a new signing secret. Returned once so it can be pasted into Roblox's Secrets store, never shown again. */
export async function generateSigningSecret(csrf: string) {
  return ownerAction({ name: "roblox.generate_signing_secret", csrf, input: undefined, schema: none, stepUp: true }, async (_v, s) => {
    await requireReachable("roblox");
    const secret = randomBytes(32).toString("base64url");
    await applyConfigChange(db(), s.discordId, (tx) => setSetting(tx, SettingKeys.signingSecret, secret, actor(s.discordId)));
    return secret;
  });
}

/** Checks the Open Cloud key (messaging, Ban API read, group read) and sends a probe the game must acknowledge. */
export async function runConnectionTest(csrf: string) {
  return ownerAction({ name: "roblox.test", csrf, input: undefined, schema: none, stepUp: false }, async (_v, s) => {
    const [key, universeId, groupId] = await Promise.all([
      getSetting(db(), SettingKeys.openCloudKey),
      getSetting(db(), SettingKeys.universeId),
      getSetting(db(), SettingKeys.groupId),
    ]);
    if (!key || !universeId || !groupId) throw new ConfigError("Save the IDs and the Open Cloud key first.");
    if (!(await getSetting(db(), SettingKeys.signingSecret))) throw new ConfigError("Generate the signing secret first.");

    const [a2g] = await db().$transaction([
      db().connectivityCheck.create({ data: { direction: "api_to_game" } }),
      db().connectivityCheck.create({ data: { direction: "game_to_api" } }),
    ]);
    const [msg, bans, groups] = await Promise.all([
      openCloud.publishMessage(key, universeId, MESSAGING_TOPIC, { type: "probe", checkId: a2g.id }),
      openCloud.listUserRestrictions(key, universeId),
      openCloud.listGroupRoles(key, groupId),
    ]);
    const detail = [
      msg.ok ? "MessagingService publish: OK" : `MessagingService publish failed (${msg.status}): check the universe-messaging-service:publish scope`,
      bans.ok ? "Ban API read: OK" : `Ban API read failed (${bans.status}): check the user-restrictions scopes`,
      groups.ok ? "Group roles read: OK" : `Group roles read failed (${groups.status}): check the group ID and group:read scope`,
    ];
    const result: OpenCloudTest = { at: new Date().toISOString(), messaging: msg.ok, bans: bans.ok, groups: groups.ok, detail };
    await db().setting.upsert({
      where: { key: SettingKeys.testOpenCloud },
      create: { key: SettingKeys.testOpenCloud, value: JSON.stringify(result), updatedBy: actor(s.discordId) },
      update: { value: JSON.stringify(result), updatedBy: actor(s.discordId) },
    });
    return result;
  });
}

export async function getTestStatus(csrf: string) {
  return ownerAction({ name: "roblox.test_status", csrf, input: undefined, schema: none, stepUp: false }, async () => (await setupState()).tests);
}

// ── Step 4: Ranks ──

export async function saveRanks(csrf: string, input: unknown) {
  return ownerAction({ name: "ranks.save", csrf, input, schema: ranksStepInput, stepUp: true }, async (v, s) => {
    await requireReachable("ranks");
    const guildId = await getSetting(db(), SettingKeys.guildId);
    const roles = new Set((await discord.guildRoles(guildId!)).map((r) => r.id));
    for (const r of v.ranks) {
      if (!r.discordRoleId || !roles.has(r.discordRoleId)) throw new ConfigError(`${r.name}: pick a Discord role from the server.`);
      if (!r.robloxGroupRank) throw new ConfigError(`${r.name}: pick a Roblox group rank.`);
    }
    return applyConfigChange(db(), s.discordId, (tx) => replaceRanks(tx, v.ranks));
  });
}

// ── Step 5: Permissions ──

export async function savePermissions(csrf: string, input: unknown) {
  return ownerAction({ name: "permissions.save", csrf, input, schema: permissionsStepInput, stepUp: true }, async (v, s) => {
    await requireReachable("permissions");
    const rankIds = new Set((await db().rank.findMany({ select: { id: true } })).map((r) => r.id));
    if (new Set(v.permissions.map((p) => p.command)).size !== v.permissions.length) throw new ConfigError("Each command must appear once.");
    if (v.permissions.some((p) => !rankIds.has(p.minRankId))) throw new ConfigError("Unknown rank.");
    return applyConfigChange(db(), s.discordId, async (tx) => {
      await tx.permission.deleteMany();
      await tx.permission.createMany({ data: v.permissions });
    });
  });
}

// ── Step 6: Quota ──

export async function saveQuota(csrf: string, input: unknown) {
  return ownerAction({ name: "quota.save", csrf, input, schema: quotaStepInput, stepUp: true }, async (v, s) => {
    await requireReachable("quota");
    const rankIds = (await db().rank.findMany({ select: { id: true } })).map((r) => r.id);
    if (v.rules.length !== rankIds.length || !rankIds.every((id) => v.rules.some((r) => r.rankId === id))) {
      throw new ConfigError("Set a quota rule for every rank.");
    }
    return applyConfigChange(db(), s.discordId, async (tx) => {
      await setSetting(tx, SettingKeys.quotaResetDay, String(v.resetDay), actor(s.discordId));
      await tx.quotaRule.deleteMany();
      await tx.quotaRule.createMany({ data: v.rules });
    });
  });
}

// ── Step 7: Review & lock ──

export async function lockSetup(csrf: string) {
  return ownerAction({ name: "setup.lock", csrf, input: undefined, schema: none, stepUp: true }, async (_v, s) => {
    const st = await setupState();
    if (st.locked) throw new ConfigError("Setup is already locked.");
    const missing = Object.entries(st.steps).filter(([k, done]) => k !== "review" && !done);
    if (missing.length) throw new ConfigError(`Not finished: ${missing.map(([k]) => k).join(", ")}.`);
    await db().setting.createMany({
      data: [
        { key: SettingKeys.setupLockedAt, value: new Date().toISOString(), updatedBy: actor(s.discordId) },
        { key: SettingKeys.setupLockedBy, value: s.discordId, updatedBy: actor(s.discordId) },
      ],
    });
    return true;
  });
}
