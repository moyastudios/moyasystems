import type { Db } from "@westbridge/db";
import { SettingKeys } from "@westbridge/shared";
import { discord } from "./discord";
import { redact, logError } from "./redact";

export type AuditEntry = { actor: string; action: string; payload?: Record<string, unknown>; ip?: string | null };

/**
 * Writes an audit row (payload redacted) and returns a promise that mirrors it to the private
 * audit channel. Pass that promise to waitUntil()/after() so the response isn't delayed.
 * Uses raw SQL because the app roles only have INSERT + column-level SELECT/UPDATE on audit_log.
 */
export async function audit(db: Db, entry: AuditEntry): Promise<{ id: bigint; mirror: Promise<void> }> {
  const payload = JSON.stringify(redact(entry.payload ?? {}));
  const rows = await db.$queryRaw<{ id: bigint }[]>`
    INSERT INTO audit_log (actor, action, payload, ip) VALUES (${entry.actor}, ${entry.action}, ${payload}::jsonb, ${entry.ip ?? null})
    RETURNING id`;
  const id = rows[0]!.id;
  return { id, mirror: mirrorAudit(db, id, entry, payload) };
}

async function mirrorAudit(db: Db, id: bigint, entry: AuditEntry, payload: string) {
  try {
    const channel = await db.setting.findUnique({ where: { key: SettingKeys.channel("audit") } });
    if (!channel) return; // Before setup step 2 there is nowhere to mirror; rows stay unmirrored for a later flush.
    await discord.postMessage(channel.value, {
      embeds: [
        {
          title: entry.action.slice(0, 250),
          color: 0x5865f2,
          fields: [
            { name: "Actor", value: entry.actor.slice(0, 200), inline: true },
            { name: "IP", value: entry.ip ?? "n/a", inline: true },
            { name: "Payload", value: "```json\n" + payload.slice(0, 950) + "\n```" },
          ],
          footer: { text: `audit #${id}` },
          timestamp: new Date().toISOString(),
        },
      ],
    });
    await db.$executeRaw`UPDATE audit_log SET mirrored_at = now() WHERE id = ${id}`;
  } catch (e) {
    logError("audit mirror failed", e, { auditId: id.toString() });
  }
}
