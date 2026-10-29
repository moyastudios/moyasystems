"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withStepUp } from "@/components/stepup";
import { saveRanks } from "../actions";

type Rank = { id?: string; name: string; discordRoleId: string | null; robloxGroupRank: number | null };
const DEFAULTS: Rank[] = ["Moderator", "Admin", "Senior"].map((name) => ({ name, discordRoleId: null, robloxGroupRank: null }));

export function RanksForm(p: { csrf: string; initial: Rank[]; roles: { id: string; name: string }[]; groupRoles: { rank: number; name: string }[] }) {
  const router = useRouter();
  const [ranks, setRanks] = useState<Rank[]>(p.initial.length ? p.initial : DEFAULTS);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, patch: Partial<Rank>) => setRanks(ranks.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => {
    const next = [...ranks];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    setRanks(next);
  };

  async function save() {
    const r = await withStepUp(p.csrf, () => saveRanks(p.csrf, { ranks }));
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "Failed" });
    if (r.ok) router.refresh();
  }

  return (
    <div className="card">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Discord role</th>
            <th>Roblox group rank</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ranks.map((r, i) => (
            <tr key={r.id ?? `new-${i}`}>
              <td>{i + 1}</td>
              <td>
                <input value={r.name} maxLength={32} onChange={(e) => set(i, { name: e.target.value })} />
              </td>
              <td>
                <select value={r.discordRoleId ?? ""} onChange={(e) => set(i, { discordRoleId: e.target.value || null })}>
                  <option value="">Choose…</option>
                  {p.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      @{role.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {p.groupRoles.length ? (
                  <select value={r.robloxGroupRank ?? ""} onChange={(e) => set(i, { robloxGroupRank: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Choose…</option>
                    {p.groupRoles.map((g) => (
                      <option key={g.rank} value={g.rank}>
                        {g.rank} · {g.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="number" min={1} max={255} value={r.robloxGroupRank ?? ""} onChange={(e) => set(i, { robloxGroupRank: e.target.value ? Number(e.target.value) : null })} />
                )}
              </td>
              <td className="row">
                <button className="secondary" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button className="secondary" disabled={i === ranks.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button className="secondary" disabled={ranks.length === 1} onClick={() => setRanks(ranks.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="secondary" onClick={() => setRanks([...ranks, { name: "", discordRoleId: null, robloxGroupRank: null }])}>
          Add rank
        </button>
        <button onClick={save}>Save</button>
      </div>
      {msg && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}
    </div>
  );
}
