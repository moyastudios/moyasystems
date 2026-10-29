import "server-only";
import type { z } from "zod";
import { ConfigError, logError, rateLimit } from "@westbridge/core";
import { auditConfig, db } from "./db";
import { consumeStepUp, requireOwner, verifyCsrf, type Session } from "./session";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; stepUp?: true };

/**
 * Every config-dashboard mutation goes through here:
 * owner session (Discord + passkey) → CSRF → rate limit → zod → passkey re-check (single use) → run → audit.
 */
export async function ownerAction<S extends z.ZodType, T>(
  opts: { name: string; csrf: unknown; input: unknown; schema: S; stepUp: boolean },
  run: (input: z.infer<S>, s: Session) => Promise<T>,
): Promise<ActionResult<T>> {
  const s = await requireOwner();
  if (!verifyCsrf(s, opts.csrf)) return { ok: false, error: "Your session token is out of date. Reload the page." };
  if (!(await rateLimit(db(), `config-action:${s.discordId}`, 60, 60))) return { ok: false, error: "Too many requests. Wait a minute." };
  const parsed = opts.schema.safeParse(opts.input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  if (opts.stepUp && !(await consumeStepUp(s))) return { ok: false, error: "Confirm with your passkey.", stepUp: true };
  try {
    const data = await run(parsed.data, s);
    await auditConfig(`owner:${s.discordId}`, `config.${opts.name}`, { ok: true });
    return { ok: true, data };
  } catch (e) {
    await auditConfig(`owner:${s.discordId}`, `config.${opts.name}`, { ok: false, error: e instanceof ConfigError ? e.message : "internal" });
    if (e instanceof ConfigError) return { ok: false, error: e.message };
    logError(`action ${opts.name} failed`, e);
    return { ok: false, error: "Something went wrong. Nothing was changed." };
  }
}
