import type { Db, Tx } from "@westbridge/db";
import { ENCRYPTED_SETTING_KEYS, SettingKeys, VERSIONED_SETTING_PREFIXES } from "@westbridge/shared";
import { decryptSecret, encryptSecret } from "./crypto";

type Client = Db | Tx;

export async function getSetting(db: Client, key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return null;
  return row.encrypted ? decryptSecret(row.value, key) : row.value;
}

/** Non-secret settings only; encrypted values come back as "set" markers. */
export async function getPublicSettings(db: Client): Promise<Record<string, string>> {
  const rows = await db.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.encrypted ? "[set]" : r.value]));
}

export async function setSetting(tx: Tx, key: string, value: string, actor: string) {
  const encrypted = ENCRYPTED_SETTING_KEYS.includes(key);
  const stored = encrypted ? encryptSecret(value, key) : value;
  await tx.setting.upsert({
    where: { key },
    create: { key, value: stored, encrypted, updatedBy: actor },
    update: { value: stored, encrypted, updatedBy: actor },
  });
}

export async function isSetupLocked(db: Client): Promise<boolean> {
  return (await db.setting.count({ where: { key: SettingKeys.setupLockedAt } })) > 0;
}

// ── Versioning ──

export type ConfigSnapshot = {
  settings: Record<string, { value: string; encrypted: boolean }>;
  ranks: { id: string; name: string; order: number; discordRoleId: string | null; robloxGroupRank: number | null }[];
  permissions: { command: string; minRankId: string; maxDuration: number | null; needsApproval: boolean }[];
  quotaRules: { rankId: string; minHelpCalls: number; minActions: number; minEvents: number; minCallSeconds: number; repeatCap: number }[];
};

const isVersioned = (key: string) => VERSIONED_SETTING_PREFIXES.some((p) => key.startsWith(p));

export async function snapshotConfig(tx: Client): Promise<ConfigSnapshot> {
  const [settings, ranks, permissions, quotaRules] = await Promise.all([
    tx.setting.findMany({ orderBy: { key: "asc" } }),
    tx.rank.findMany({ orderBy: { order: "asc" } }),
    tx.permission.findMany({ orderBy: { command: "asc" } }),
    tx.quotaRule.findMany({ orderBy: { rankId: "asc" } }),
  ]);
  return {
    settings: Object.fromEntries(settings.filter((s) => isVersioned(s.key)).map((s) => [s.key, { value: s.value, encrypted: s.encrypted }])),
    ranks: ranks.map(({ id, name, order, discordRoleId, robloxGroupRank }) => ({ id, name, order, discordRoleId, robloxGroupRank })),
    permissions: permissions.map(({ command, minRankId, maxDuration, needsApproval }) => ({ command, minRankId, maxDuration, needsApproval })),
    quotaRules: quotaRules.map(({ id: _id, ...r }) => r),
  };
}

type Diff = Record<string, unknown>;

function diffList<T extends Record<string, unknown>>(before: T[], after: T[], keyOf: (t: T) => string): Diff | undefined {
  const b = new Map(before.map((x) => [keyOf(x), x]));
  const a = new Map(after.map((x) => [keyOf(x), x]));
  const added = [...a.keys()].filter((k) => !b.has(k)).map((k) => a.get(k));
  const removed = [...b.keys()].filter((k) => !a.has(k)).map((k) => b.get(k));
  const changed: Record<string, Record<string, { from: unknown; to: unknown }>> = {};
  for (const [k, av] of a) {
    const bv = b.get(k);
    if (!bv) continue;
    for (const f of Object.keys(av)) {
      if (JSON.stringify(av[f]) !== JSON.stringify(bv[f])) (changed[k] ??= {})[f] = { from: bv[f], to: av[f] };
    }
  }
  if (!added.length && !removed.length && !Object.keys(changed).length) return undefined;
  return { added, removed, changed };
}

export function diffConfig(before: ConfigSnapshot, after: ConfigSnapshot): Diff {
  const diff: Diff = {};
  const settings: Diff = {};
  for (const key of new Set([...Object.keys(before.settings), ...Object.keys(after.settings)])) {
    const b = before.settings[key];
    const a = after.settings[key];
    if (b?.value === a?.value) continue;
    // Never put secret values (even ciphertext) in a diff.
    settings[key] = a?.encrypted || b?.encrypted ? (a ? "changed" : "removed") : { from: b?.value ?? null, to: a?.value ?? null };
  }
  if (Object.keys(settings).length) diff.settings = settings;
  const ranks = diffList(before.ranks, after.ranks, (r) => r.id);
  if (ranks) diff.ranks = ranks;
  const perms = diffList(before.permissions, after.permissions, (p) => p.command);
  if (perms) diff.permissions = perms;
  const quota = diffList(before.quotaRules, after.quotaRules, (q) => q.rankId);
  if (quota) diff.quotaRules = quota;
  return diff;
}

/**
 * Runs a config mutation in a serialized transaction and records a config_versions row with the diff.
 * Returns the new version number, or null if nothing changed.
 */
export async function applyConfigChange(
  db: Db,
  changedBy: string,
  mutate: (tx: Tx) => Promise<void>,
  opts: { rolledBackFrom?: number } = {},
): Promise<{ version: number | null; diff: Diff }> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(727001)`;
      const before = await snapshotConfig(tx);
      await mutate(tx);
      const after = await snapshotConfig(tx);
      const diff = diffConfig(before, after);
      if (!Object.keys(diff).length) return { version: null, diff };
      const row = await tx.configVersion.create({
        data: { changedBy, diff: diff as object, snapshot: after as object, rolledBackFrom: opts.rolledBackFrom },
      });
      return { version: row.version, diff };
    },
    { timeout: 15_000 },
  );
}

export class ConfigError extends Error {}

/** Replaces the rank list. Ranks are ordered junior → senior (order = index + 1). */
export async function replaceRanks(tx: Tx, ranks: ConfigSnapshot["ranks"] | { id?: string; name: string; discordRoleId: string | null; robloxGroupRank: number | null }[]) {
  const existing = await tx.rank.findMany({ include: { _count: { select: { staff: true, permissions: true } } } });
  const keepIds = new Set(ranks.map((r) => r.id).filter(Boolean));
  for (const r of existing) {
    if (keepIds.has(r.id)) continue;
    if (r._count.staff) throw new ConfigError(`Rank "${r.name}" still has staff assigned`);
    if (r._count.permissions) throw new ConfigError(`Rank "${r.name}" is used by a permission; change permissions first`);
  }
  // Move existing rows out of the way of the unique name/order constraints, then write the final values.
  await tx.$executeRaw`UPDATE ranks SET "order" = -"order" - 1000, name = '~' || id`;
  await tx.rank.deleteMany({ where: { id: { notIn: [...keepIds] as string[] } } });
  for (const [i, r] of ranks.entries()) {
    const data = { name: r.name, order: i + 1, discordRoleId: r.discordRoleId, robloxGroupRank: r.robloxGroupRank };
    if (r.id && existing.some((e) => e.id === r.id)) await tx.rank.update({ where: { id: r.id }, data });
    else await tx.rank.create({ data: r.id ? { id: r.id, ...data } : data });
  }
}

/** Restores the config from a version's snapshot, recorded as a new version. */
export async function rollbackConfig(db: Db, changedBy: string, version: number) {
  const target = await db.configVersion.findUnique({ where: { version } });
  if (!target) throw new ConfigError("Version not found");
  const snap = target.snapshot as unknown as ConfigSnapshot;
  return applyConfigChange(
    db,
    changedBy,
    async (tx) => {
      const current = await tx.setting.findMany();
      const versionedNow = current.filter((s) => isVersioned(s.key)).map((s) => s.key);
      await tx.setting.deleteMany({ where: { key: { in: versionedNow.filter((k) => !(k in snap.settings)) } } });
      for (const [key, s] of Object.entries(snap.settings)) {
        // Ciphertext is restored as-is; it is bound to the same key via AAD.
        await tx.setting.upsert({ where: { key }, create: { key, ...s, updatedBy: changedBy }, update: { ...s, updatedBy: changedBy } });
      }
      await tx.permission.deleteMany();
      await tx.quotaRule.deleteMany();
      await replaceRanks(tx, snap.ranks);
      if (snap.permissions.length) await tx.permission.createMany({ data: snap.permissions });
      if (snap.quotaRules.length) await tx.quotaRule.createMany({ data: snap.quotaRules });
    },
    { rolledBackFrom: version },
  );
}
