"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WEEKDAYS } from "@westbridge/shared";
import { withStepUp } from "@/components/stepup";
import { saveQuota } from "../actions";

type Row = { rankId: string; name: string; minHelpCalls: number; minActions: number; minEvents: number; minCallSeconds: number; repeatCap: number };
const FIELDS: [keyof Row, string][] = [
  ["minHelpCalls", "Help calls / week"],
  ["minActions", "Mod actions / week"],
  ["minEvents", "Events / week"],
  ["minCallSeconds", "Min call length (s)"],
  ["repeatCap", "Repeat cap / day"],
];

export function QuotaForm(p: { csrf: string; initial: Row[]; resetDay: number }) {
  const router = useRouter();
  const [rows, setRows] = useState(p.initial);
  const [resetDay, setResetDay] = useState(p.resetDay);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    const rules = rows.map(({ name: _n, ...r }) => r);
    const r = await withStepUp(p.csrf, () => saveQuota(p.csrf, { resetDay, rules }));
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "Failed" });
    if (r.ok) router.refresh();
  }

  return (
    <div className="card">
      <label>
        Reset day
        <select value={resetDay} onChange={(e) => setResetDay(Number(e.target.value))}>
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            {FIELDS.map(([, label]) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.rankId}>
              <td>{r.name}</td>
              {FIELDS.map(([f]) => (
                <td key={f}>
                  <input
                    type="number"
                    min={0}
                    value={r[f] as number}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [f]: Number(e.target.value) } : x)))}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Calls shorter than the minimum length don&apos;t count. The repeat cap limits counted calls from the same player to the same staff member per day.</p>
      <button onClick={save}>Save</button>
      {msg && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}
    </div>
  );
}
