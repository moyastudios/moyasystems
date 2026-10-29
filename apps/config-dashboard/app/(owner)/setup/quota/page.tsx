import { getSetting } from "@westbridge/core";
import { QUOTA_TIMEZONE, SettingKeys } from "@westbridge/shared";
import { db } from "@/lib/db";
import { csrfToken, requireOwner } from "@/lib/session";
import { assertStepReachable } from "@/lib/setup";
import { QuotaForm } from "./QuotaForm";

export default async function QuotaStep() {
  const s = await requireOwner();
  await assertStepReachable("quota");
  const [ranks, rules, resetDay] = await Promise.all([
    db().rank.findMany({ orderBy: { order: "asc" } }),
    db().quotaRule.findMany(),
    getSetting(db(), SettingKeys.quotaResetDay),
  ]);
  const rows = ranks.map((r) => {
    const q = rules.find((x) => x.rankId === r.id);
    return { rankId: r.id, name: r.name, minHelpCalls: q?.minHelpCalls ?? 10, minActions: q?.minActions ?? 0, minEvents: q?.minEvents ?? 0, minCallSeconds: q?.minCallSeconds ?? 30, repeatCap: q?.repeatCap ?? 2 };
  });
  return (
    <>
      <p className="eyebrow">Step 6 of 7</p>
      <h1>Quota</h1>
      <p>Weekly targets per rank. The week resets at 00:00 {QUOTA_TIMEZONE} time on the chosen day.</p>
      <QuotaForm csrf={csrfToken(s)} initial={rows} resetDay={resetDay ? Number(resetDay) : 1} />
    </>
  );
}
