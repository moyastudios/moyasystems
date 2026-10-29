import "server-only";
import { redirect } from "next/navigation";
import { CONNECTIVITY_TEST_VALID_SECONDS, DISCORD_CHANNEL_KEYS, MODERATION_COMMANDS, SETUP_STEPS, SettingKeys, type SetupStep } from "@westbridge/shared";
import { db } from "./db";

export type OpenCloudTest = { at: string; messaging: boolean; bans: boolean; groups: boolean; detail: string[] };

/** Setup progress, derived from the data itself (nothing to drift out of sync). */
export async function setupState() {
  const d = db();
  const [settingRows, ranks, perms, rules] = await Promise.all([
    d.setting.findMany(),
    d.rank.findMany(),
    d.permission.findMany(),
    d.quotaRule.findMany(),
  ]);
  const s = new Map(settingRows.map((r) => [r.key, r]));
  const has = (k: string) => s.has(k);

  // Tests only count if they ran after the last change to the key or secret.
  const keysChangedAt = Math.max(s.get(SettingKeys.openCloudKey)?.updatedAt.getTime() ?? 0, s.get(SettingKeys.signingSecret)?.updatedAt.getTime() ?? 0);
  const since = new Date(Math.max(keysChangedAt, Date.now() - CONNECTIVITY_TEST_VALID_SECONDS * 1000));
  const oc = s.get(SettingKeys.testOpenCloud);
  const openCloud = oc ? (JSON.parse(oc.value) as OpenCloudTest) : null;
  const openCloudOk = !!openCloud && new Date(openCloud.at) > since && openCloud.messaging && openCloud.bans && openCloud.groups;
  const [a2g, g2a] = await Promise.all(
    ["api_to_game", "game_to_api"].map((direction) =>
      d.connectivityCheck.findFirst({ where: { direction, completedAt: { not: null }, createdAt: { gt: since } } }),
    ),
  );
  const locked = has(SettingKeys.setupLockedAt);
  const robloxConfigured = [SettingKeys.groupId, SettingKeys.universeId, SettingKeys.openCloudKey, SettingKeys.signingSecret].every(has);

  const steps: Record<SetupStep, boolean> = {
    claim: has(SettingKeys.setupClaimedBy),
    discord: has(SettingKeys.guildId) && DISCORD_CHANNEL_KEYS.every((k) => has(SettingKeys.channel(k))),
    roblox: robloxConfigured && (locked || (openCloudOk && !!a2g && !!g2a)),
    ranks: ranks.length > 0 && ranks.every((r) => r.discordRoleId && r.robloxGroupRank),
    permissions: MODERATION_COMMANDS.every((c) => perms.some((p) => p.command === c)),
    quota: has(SettingKeys.quotaResetDay) && ranks.every((r) => rules.some((q) => q.rankId === r.id)),
    review: locked,
  };
  const firstIncomplete = SETUP_STEPS.find((k) => !steps[k]) ?? "review";
  return { locked, steps, firstIncomplete, tests: { openCloud, openCloudOk, apiToGame: !!a2g, gameToApi: !!g2a } };
}

/** Server-side gate: a step is only reachable once every earlier step is complete (or setup is locked). */
export async function assertStepReachable(step: SetupStep) {
  const st = await setupState();
  if (st.locked) return st;
  const idx = SETUP_STEPS.indexOf(step);
  const blocked = SETUP_STEPS.slice(0, idx).find((k) => !st.steps[k]);
  if (blocked) redirect(`/setup/${blocked}`);
  return st;
}
