import { waitUntil } from "@vercel/functions";
import { logError } from "@westbridge/core";

/** Keeps work running after the response is sent (Vercel waitUntil; plain promise elsewhere, e.g. a VPS). */
export function background(p: Promise<unknown>) {
  const guarded = p.catch((e) => logError("background task failed", e));
  try {
    waitUntil(guarded);
  } catch {
    /* not on Vercel */
  }
}
