"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DISCORD_CHANNEL_KEYS, DISCORD_CHANNEL_LABELS } from "@westbridge/shared";
import { withStepUp } from "@/components/stepup";
import { registerCommands, saveDiscord, sendTestMessage } from "../actions";

type Opt = { id: string; name: string };

export function DiscordForm(p: { csrf: string; guilds: Opt[]; guildId: string | null; channels: Opt[]; current: Record<string, string> }) {
  const router = useRouter();
  const [channels, setChannels] = useState(p.current);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: label } : { ok: false, text: r.error ?? "Failed" });
    if (r.ok) router.refresh();
  }

  if (!p.guilds.length) return <p className="error">The bot isn&apos;t in any server yet.</p>;
  return (
    <div className="card">
      <label>
        Server
        <select value={p.guildId ?? ""} onChange={(e) => router.push(`/setup/discord?guild=${e.target.value}`)}>
          {p.guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      {DISCORD_CHANNEL_KEYS.map((k) => (
        <label key={k}>
          {DISCORD_CHANNEL_LABELS[k]} channel
          <select value={channels[k] ?? ""} onChange={(e) => setChannels({ ...channels, [k]: e.target.value })}>
            <option value="">Choose…</option>
            {p.channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <div className="row">
        <button disabled={busy} onClick={() => run("Saved.", () => withStepUp(p.csrf, () => saveDiscord(p.csrf, { guildId: p.guildId, channels })))}>
          Save
        </button>
        <button className="secondary" disabled={busy} onClick={() => run("Test message sent to the audit channel.", () => sendTestMessage(p.csrf))}>
          Send test message
        </button>
        <button className="secondary" disabled={busy} onClick={() => run("Slash commands registered.", () => registerCommands(p.csrf))}>
          Register slash commands
        </button>
      </div>
      {msg && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}
    </div>
  );
}
