import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { csrfToken, requireOwner } from "@/lib/session";
import { OwnersClient } from "./OwnersClient";

export default async function OwnersPage() {
  const s = await requireOwner();
  const [keys, sessions] = await Promise.all([
    db().passkey.findMany({ where: { discordId: s.discordId }, orderBy: { createdAt: "asc" } }),
    db().dashboardSession.findMany({ where: { discordId: s.discordId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
  ]);
  return (
    <>
      <h1>Owners &amp; passkeys</h1>
      <p>
        Allowed owners (from <code>OWNER_DISCORD_IDS</code>): {env().OWNER_DISCORD_IDS.map((id) => <code key={id}>{id} </code>)}
      </p>
      <OwnersClient
        csrf={csrfToken(s)}
        passkeys={keys.map((k) => ({ id: k.id, nickname: k.nickname, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null }))}
        sessions={sessions.map((x) => ({ current: x.idHash === s.idHash, ip: x.ip, userAgent: x.userAgent, lastSeenAt: x.lastSeenAt.toISOString() }))}
      />
    </>
  );
}
