"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { withStepUp } from "@/components/stepup";
import { generateSigningSecret, getTestStatus, runConnectionTest, saveRoblox } from "../actions";

type Tests = { openCloud: { detail: string[] } | null; openCloudOk: boolean; apiToGame: boolean; gameToApi: boolean };

export function RobloxForm(p: {
  csrf: string;
  secretName: string;
  groupId: string;
  universeId: string;
  keySetAt: string | null;
  secretSetAt: string | null;
  tests: Tests;
}) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(p.groupId);
  const [universeId, setUniverseId] = useState(p.universeId);
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [tests, setTests] = useState(p.tests);
  const [polling, setPolling] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!polling) return;
    const started = Date.now();
    timer.current = setInterval(async () => {
      const r = await getTestStatus(p.csrf);
      if (r.ok) setTests(r.data);
      if ((r.ok && r.data.apiToGame && r.data.gameToApi) || Date.now() - started > 120_000) {
        setPolling(false);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(timer.current);
  }, [polling, p.csrf, router]);

  async function save() {
    const r = await withStepUp(p.csrf, () => saveRoblox(p.csrf, { groupId, universeId, openCloudKey: key || undefined }));
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "Failed" });
    if (r.ok) {
      setKey("");
      router.refresh();
    }
  }

  async function genSecret() {
    if (p.secretSetAt && !confirm("Replace the signing secret? Game servers will stop working until you update the Roblox secret.")) return;
    const r = await withStepUp(p.csrf, () => generateSigningSecret(p.csrf));
    if (r.ok && "data" in r) setSecret(r.data as string);
    else setMsg({ ok: false, text: r.error ?? "Failed" });
  }

  async function test() {
    setMsg(null);
    const r = await runConnectionTest(p.csrf);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setTests({ ...tests, openCloud: r.data, openCloudOk: r.data.messaging && r.data.bans && r.data.groups, apiToGame: false, gameToApi: false });
    setPolling(true);
  }

  const tick = (b: boolean) => (b ? "✅" : polling ? "⏳" : "❌");

  return (
    <>
      <div className="card">
        <label>
          Group ID
          <input value={groupId} onChange={(e) => setGroupId(e.target.value.trim())} inputMode="numeric" />
        </label>
        <label>
          Universe ID
          <input value={universeId} onChange={(e) => setUniverseId(e.target.value.trim())} inputMode="numeric" />
        </label>
        <label>
          Open Cloud API key {p.keySetAt && <span className="muted">(set {new Date(p.keySetAt).toLocaleString()}; leave blank to keep)</span>}
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={p.keySetAt ? "••••••••" : ""} />
        </label>
        <button onClick={save}>Save</button>
      </div>

      <div className="card">
        <h2>Signing secret</h2>
        <p>
          {p.secretSetAt ? `Set ${new Date(p.secretSetAt).toLocaleString()}. It can't be shown again; generate a new one to replace it.` : "Not set yet."}
        </p>
        {secret ? (
          <div className="secret">
            <p>
              <strong>Copy this now. It won&apos;t be shown again.</strong>
            </p>
            <code className="block">{secret}</code>
            <ol>
              <li>Open Creator Dashboard → Westbridge → Secrets → Create secret.</li>
              <li>
                Name: <code>{p.secretName}</code>, Domain: <code>api.moya-studios.xyz</code>, Secret: the value above.
              </li>
              <li>For Studio testing, add the same secret under Game Settings → Security → Secrets.</li>
            </ol>
            <button className="secondary" onClick={() => { setSecret(null); router.refresh(); }}>
              I&apos;ve stored it
            </button>
          </div>
        ) : (
          <button className="secondary" onClick={genSecret}>
            {p.secretSetAt ? "Rotate signing secret" : "Generate signing secret"}
          </button>
        )}
      </div>

      <div className="card">
        <h2>Connection test</h2>
        <p>Join the live game first so a server is running, then run the test.</p>
        <ul className="plain">
          <li>{tick(tests.openCloudOk)} Open Cloud key (messaging, Ban API, group)</li>
          {tests.openCloud?.detail.map((d) => <li key={d} className="muted">{d}</li>)}
          <li>{tick(tests.apiToGame)} API → game (MessagingService probe received by a server)</li>
          <li>{tick(tests.gameToApi)} Game → API (signed request verified)</li>
        </ul>
        <button className="secondary" onClick={test} disabled={polling}>
          {polling ? "Waiting for the game…" : "Run connection test"}
        </button>
      </div>
      {msg && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}
    </>
  );
}
