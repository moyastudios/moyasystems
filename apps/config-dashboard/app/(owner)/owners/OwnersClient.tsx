"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { withStepUp } from "@/components/stepup";
import { beginAddPasskey, createInvite, finishAddPasskey, removePasskey, revokeOtherSessions } from "./actions";

type Key = { id: string; nickname: string | null; createdAt: string; lastUsedAt: string | null };
type Sess = { current: boolean; ip: string | null; userAgent: string | null; lastSeenAt: string };

export function OwnersClient({ csrf, passkeys, sessions }: { csrf: string; passkeys: Key[]; sessions: Sess[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteId, setInviteId] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const report = (r: { ok: boolean; error?: string }, text: string) => {
    setMsg(r.ok ? { ok: true, text } : { ok: false, text: r.error ?? "Failed" });
    if (r.ok) router.refresh();
  };

  async function addKey() {
    const begin = await withStepUp(csrf, () => beginAddPasskey(csrf));
    if (!begin.ok || !("data" in begin)) return report(begin, "");
    try {
      const response = await startRegistration({ optionsJSON: begin.data as never });
      report(await finishAddPasskey(csrf, response, prompt("Name this passkey (optional)") ?? null), "Passkey added.");
    } catch {
      setMsg({ ok: false, text: "The passkey prompt was cancelled." });
    }
  }

  async function invite() {
    const r = await withStepUp(csrf, () => createInvite(csrf, inviteId.trim()));
    if (r.ok && "data" in r) setInviteUrl(r.data as string);
    report(r, "Invite created. It works once and expires in 24 hours.");
  }

  return (
    <>
      <div className="card">
        <h2>Your passkeys</h2>
        <ul className="plain">
          {passkeys.map((k) => (
            <li key={k.id}>
              {k.nickname ?? "Passkey"} · added {new Date(k.createdAt).toLocaleDateString("en-GB")} · last used{" "}
              {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("en-GB") : "never"}{" "}
              <button className="link" onClick={async () => report(await withStepUp(csrf, () => removePasskey(csrf, k.id)), "Removed.")}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button className="secondary" onClick={addKey}>Add a passkey</button>
      </div>
      <div className="card">
        <h2>Invite another owner</h2>
        <p className="muted">Their Discord ID must already be in OWNER_DISCORD_IDS.</p>
        <label>
          Discord ID
          <input value={inviteId} onChange={(e) => setInviteId(e.target.value)} inputMode="numeric" />
        </label>
        <button className="secondary" onClick={invite}>Create invite link</button>
        {inviteUrl && <code className="block">{inviteUrl}</code>}
      </div>
      <div className="card">
        <h2>Active sessions</h2>
        <ul className="plain">
          {sessions.map((x, i) => (
            <li key={i}>
              {x.current ? "This session" : "Other"} · {x.ip ?? "?"} · {x.userAgent?.slice(0, 60) ?? "?"} · active {new Date(x.lastSeenAt).toLocaleTimeString("en-GB")}
            </li>
          ))}
        </ul>
        <button className="secondary" onClick={async () => report(await revokeOtherSessions(csrf), "Other sessions signed out.")}>
          Sign out other sessions
        </button>
      </div>
      {msg && msg.text && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}
    </>
  );
}
