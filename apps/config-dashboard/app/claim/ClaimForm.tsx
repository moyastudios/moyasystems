"use client";

import { useActionState } from "react";
import { claimWithToken } from "./actions";

export function ClaimForm() {
  const [state, action, pending] = useActionState(claimWithToken, {});
  return (
    <form action={action} className="card">
      <label>
        Setup token
        <input name="token" type="password" autoComplete="off" required maxLength={200} />
      </label>
      {state.error && <p className="error">{state.error}</p>}
      <button disabled={pending}>Continue with Discord</button>
    </form>
  );
}
