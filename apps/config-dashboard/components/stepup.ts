"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { beginStepUp, finishStepUp } from "@/app/passkey/actions";

type Result = { ok: boolean; error?: string; stepUp?: true };

/** Runs a server action; if it asks for a passkey re-check, does the ceremony and retries once. */
export async function withStepUp<T extends Result>(csrf: string, run: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  const first = await run();
  if (first.ok || !first.stepUp) return first;
  try {
    const options = await beginStepUp(csrf);
    if (!options) return { ok: false, error: "Couldn't start the passkey check." };
    const response = await startAuthentication({ optionsJSON: options });
    if (!(await finishStepUp(csrf, response))) return { ok: false, error: "Passkey check failed." };
  } catch {
    return { ok: false, error: "The passkey prompt was cancelled." };
  }
  return run();
}
