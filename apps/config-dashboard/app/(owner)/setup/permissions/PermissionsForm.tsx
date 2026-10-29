"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withStepUp } from "@/components/stepup";
import { savePermissions } from "../actions";

type Row = { command: string; minRankId: string; maxDuration: string; needsApproval: boolean };

export function PermissionsForm(p: { csrf: string; ranks: { id: string; name: string }[]; initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(p.initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    const permissions = rows.map((r) => ({ ...r, maxDuration: r.maxDuration.trim() || null }));
    const r = await withStepUp(p.csrf, () => savePermissions(p.csrf, { permissions }));
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "Failed" });
    if (r.ok) router.refresh();
  }

  return (
    <div className="card">
      <table>
        <thead>
          <tr>
            <th>Command</th>
            <th>Minimum rank</th>
            <th>Max duration</th>
            <th>Needs approval</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.command}>
              <td>
                <code>/{r.command}</code>
              </td>
              <td>
                <select value={r.minRankId} onChange={(e) => set(i, { minRankId: e.target.value })}>
                  {p.ranks.map((rank) => (
                    <option key={rank.id} value={rank.id}>
                      {rank.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input value={r.maxDuration} placeholder="e.g. 7d" maxLength={6} onChange={(e) => set(i, { maxDuration: e.target.value })} />
              </td>
              <td>
                <input type="checkbox" checked={r.needsApproval} onChange={(e) => set(i, { needsApproval: e.target.checked })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={save}>Save</button>
      {msg && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}
    </div>
  );
}
