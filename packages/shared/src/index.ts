import { z } from "zod";

// Browser-safe: constants, types and zod schemas only. No secrets, no Node APIs.

export const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I
export const LINK_CODE_LENGTH = 6;
export const LINK_CODE_TTL_SECONDS = 10 * 60;

export const GAME_MAX_CLOCK_SKEW_SECONDS = 60;
export const GAME_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const MESSAGING_TOPIC = "westbridge";
export const ROBLOX_SECRET_NAME = "westbridge_api";

export const SESSION_IDLE_SECONDS = 15 * 60;
export const SESSION_MAX_SECONDS = 8 * 60 * 60;
export const STEP_UP_WINDOW_SECONDS = 5 * 60;
export const OWNER_INVITE_TTL_SECONDS = 24 * 60 * 60;
export const CONNECTIVITY_TEST_VALID_SECONDS = 30 * 60;
export const QUOTA_TIMEZONE = "Europe/London";

export const MODERATION_COMMANDS = ["warn", "kick", "serverban", "timeban", "gameban", "unban"] as const;
export type ModerationCommand = (typeof MODERATION_COMMANDS)[number];

/** Default tier per command; matched to rank names during setup step 5. */
export const DEFAULT_PERMISSION_TIERS: Record<ModerationCommand, "Moderator" | "Admin" | "Senior"> = {
  warn: "Moderator",
  kick: "Moderator",
  serverban: "Admin",
  timeban: "Admin",
  gameban: "Senior",
  unban: "Senior",
};

export const DISCORD_CHANNEL_KEYS = ["audit", "modLog", "joinLog", "reports", "quota"] as const;
export type DiscordChannelKey = (typeof DISCORD_CHANNEL_KEYS)[number];
export const DISCORD_CHANNEL_LABELS: Record<DiscordChannelKey, string> = {
  audit: "Audit (private)",
  modLog: "Mod log",
  joinLog: "Join log",
  reports: "Reports",
  quota: "Quota",
};

export const SETUP_STEPS = ["claim", "discord", "roblox", "ranks", "permissions", "quota", "review"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export const SETUP_STEP_TITLES: Record<SetupStep, string> = {
  claim: "Claim",
  discord: "Discord",
  roblox: "Roblox",
  ranks: "Ranks",
  permissions: "Permissions",
  quota: "Quota",
  review: "Review & lock",
};

/** Setting keys. Keys under these prefixes are versioned; `setup.*` and `status.*` are not. */
export const SettingKeys = {
  guildId: "discord.guildId",
  channel: (k: DiscordChannelKey) => `discord.channel.${k}`,
  groupId: "roblox.groupId",
  universeId: "roblox.universeId",
  openCloudKey: "roblox.openCloudKey",
  signingSecret: "roblox.signingSecret",
  quotaResetDay: "quota.resetDay",
  setupClaimedBy: "setup.claimedBy",
  setupClaimedAt: "setup.claimedAt",
  setupLockedAt: "setup.lockedAt",
  setupLockedBy: "setup.lockedBy",
  testOpenCloud: "status.test.openCloud",
} as const;
export const VERSIONED_SETTING_PREFIXES = ["discord.", "roblox.", "quota."];
export const ENCRYPTED_SETTING_KEYS: string[] = [SettingKeys.openCloudKey, SettingKeys.signingSecret];

// ── Validation schemas ──

export const snowflake = z.string().regex(/^\d{17,20}$/, "Must be a Discord ID");
export const robloxId = z.union([z.string().regex(/^\d{1,19}$/), z.number().int().positive()]).transform((v) => BigInt(v));
export const linkCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(LINK_CODE_LENGTH)
  .regex(new RegExp(`^[${LINK_CODE_ALPHABET}]+$`), "Invalid code");

export const gameLinkBody = z.object({
  code: linkCode,
  robloxId,
  robloxUsername: z.string().regex(/^[A-Za-z0-9_]{3,20}$/),
  groupRank: z.number().int().min(0).max(255),
});

export const gameAckBody = z.object({ checkId: z.string().uuid() });

export const discordStepInput = z.object({
  guildId: snowflake,
  channels: z.object(Object.fromEntries(DISCORD_CHANNEL_KEYS.map((k) => [k, snowflake])) as Record<DiscordChannelKey, typeof snowflake>),
});

export const robloxStepInput = z.object({
  groupId: z.string().regex(/^\d{1,15}$/),
  universeId: z.string().regex(/^\d{1,15}$/),
  // Blank = keep existing (write-only field).
  openCloudKey: z.string().trim().max(2048).optional().transform((v) => (v ? v : undefined)),
});

export const rankInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(32),
  discordRoleId: snowflake.nullable(),
  robloxGroupRank: z.number().int().min(1).max(255).nullable(),
});
export const ranksStepInput = z
  .object({ ranks: z.array(rankInput).min(1).max(25) })
  .refine((v) => new Set(v.ranks.map((r) => r.name.toLowerCase())).size === v.ranks.length, "Rank names must be unique");

/** Durations like "30m", "12h", "7d"; returns seconds. */
export const duration = z
  .string()
  .trim()
  .regex(/^\d{1,4}[mhd]$/, "Use e.g. 30m, 12h or 7d")
  .transform((v) => Number(v.slice(0, -1)) * { m: 60, h: 3600, d: 86400 }[v.slice(-1) as "m" | "h" | "d"]);

export const permissionsStepInput = z.object({
  permissions: z
    .array(
      z.object({
        command: z.enum(MODERATION_COMMANDS),
        minRankId: z.string().uuid(),
        maxDuration: duration.nullable(),
        needsApproval: z.boolean(),
      }),
    )
    .length(MODERATION_COMMANDS.length),
});

const count = z.number().int().min(0).max(10_000);
export const quotaStepInput = z.object({
  resetDay: z.number().int().min(0).max(6), // 0 = Sunday … 1 = Monday
  rules: z
    .array(
      z.object({
        rankId: z.string().uuid(),
        minHelpCalls: count,
        minActions: count,
        minEvents: count,
        minCallSeconds: z.number().int().min(0).max(3600),
        repeatCap: z.number().int().min(1).max(100),
      }),
    )
    .min(1),
});

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatDuration(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  return `${Math.round(seconds / 60)}m`;
}

// ── Discord slash commands (registered from the config dashboard) ──
export const DISCORD_COMMANDS = [
  { name: "link", description: "Get a code to link your Roblox account (staff only)", type: 1, contexts: [0] },
  { name: "whoami", description: "Show your linked Roblox account and rank", type: 1, contexts: [0] },
];
