"use client";

import { useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { beginPasskey, finishPasskey } from "./actions";

export function PasskeyClient({ csrf, register }: { csrf: string; register: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState("");

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const begin = await beginPasskey(csrf);
      if (!begin.ok) return setError(begin.error);
      const response =
        begin.mode === "login"
          ? await startAuthentication({ optionsJSON: begin.options as never })
          : await startRegistration({ optionsJSON: begin.options as never });
      const done = await finishPasskey(csrf, response, nickname || null);
      if (!done.ok) return setError(done.error);
      window.location.assign("/");
    } catch {
      setError("The passkey prompt was cancelled or failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {register && (
        <label>
          Passkey name (optional)
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} placeholder="e.g. MacBook Touch ID" />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button onClick={go} disabled={busy}>
        {register ? "Register passkey" : "Use passkey"}
      </button>
    </div>
  );
}
