import { DISCORD_CHANNEL_KEYS, DISCORD_CHANNEL_LABELS, SETUP_STEPS, SETUP_STEP_TITLES, SettingKeys, WEEKDAYS, formatDuration } from "@westbridge/shared";
import { db } from "@/lib/db";
import { csrfToken, requireOwner } from "@/lib/session";
import { assertStepReachable } from "@/lib/setup";
import { LockButton } from "./LockButton";

export default async function ReviewStep() {
  const s = await requireOwner();
  const st = await assertStepReachable("review");
  const [settings, ranks, perms, rules] = await Promise.all([
    db().setting.findMany(),
    db().rank.findMany({ orderBy: { order: "asc" } }),
    db().permission.findMany({ include: { minRank: true } }),
    db().quotaRule.findMany(),
  ]);
  const v = (k: string) => {
    const row = settings.find((x) => x.key === k);
    return row ? (row.encrypted ? `set ${row.updatedAt.toLocaleDateString("en-GB")}` : row.value) : "missing";
  };
  return (
    <>
      <p className="eyebrow">Step 7 of 7</p>
      <h1>{st.locked ? "Overview" : "Review & lock"}</h1>
      {st.locked && <p className="ok">Setup locked {new Date(v(SettingKeys.setupLockedAt)).toLocaleString("en-GB")}. Changes need a passkey check and are versioned.</p>}
      <ul className="plain">
        {SETUP_STEPS.filter((k) => k !== "review").map((k) => (
          <li key={k}>
            {st.steps[k] ? "✅" : "❌"} {SETUP_STEP_TITLES[k]}
          </li>
        ))}
      </ul>
      <div className="card">
        <h2>Discord</h2>
        <p>Server: <code>{v(SettingKeys.guildId)}</code></p>
        <ul className="plain">
          {DISCORD_CHANNEL_KEYS.map((k) => (
            <li key={k}>{DISCORD_CHANNEL_LABELS[k]}: <code>{v(SettingKeys.channel(k))}</code></li>
          ))}
        </ul>
        <h2>Roblox</h2>
        <ul className="plain">
          <li>Group: <code>{v(SettingKeys.groupId)}</code> · Universe: <code>{v(SettingKeys.universeId)}</code></li>
          <li>Open Cloud key: {v(SettingKeys.openCloudKey)} · Signing secret: {v(SettingKeys.signingSecret)}</li>
          <li>Connection tests: {st.tests.openCloudOk && st.tests.apiToGame && st.tests.gameToApi ? "passed" : st.locked ? "not re-run since lock" : "not passed"}</li>
        </ul>
        <h2>Ranks</h2>
        <ol>
          {ranks.map((r) => (
            <li key={r.id}>
              {r.name}: role <code>{r.discordRoleId ?? "none"}</code>, group rank {r.robloxGroupRank ?? "none"}
              {(() => {
                const q = rules.find((x) => x.rankId === r.id);
                return q ? ` · quota ${q.minHelpCalls} calls, ${q.minCallSeconds}s min, cap ${q.repeatCap}/day` : " · no quota rule";
              })()}
            </li>
          ))}
        </ol>
        <h2>Permissions</h2>
        <ul className="plain">
          {perms.map((p) => (
            <li key={p.command}>
              <code>/{p.command}</code>: {p.minRank.name}+{p.maxDuration ? `, max ${formatDuration(p.maxDuration)}` : ""}
              {p.needsApproval ? ", needs approval" : ""}
            </li>
          ))}
        </ul>
        <p>Quota resets {WEEKDAYS[Number(v(SettingKeys.quotaResetDay))] ?? "?"} 00:00 Europe/London.</p>
      </div>
      {!st.locked && <LockButton csrf={csrfToken(s)} />}
    </>
  );
}
