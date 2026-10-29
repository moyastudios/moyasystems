import { db } from "@/lib/db";
import { csrfToken, requireOwner } from "@/lib/session";
import { RollbackButton } from "./RollbackButton";

export default async function VersionsPage() {
  const s = await requireOwner();
  const versions = await db().configVersion.findMany({ orderBy: { version: "desc" }, take: 50, select: { version: true, changedBy: true, diff: true, createdAt: true, rolledBackFrom: true } });
  return (
    <>
      <h1>Config versions</h1>
      <p>Every change is recorded here. Rolling back creates a new version; secret values are never shown.</p>
      {versions.map((v, i) => (
        <details key={v.version} className="card">
          <summary>
            v{v.version} · {v.createdAt.toLocaleString("en-GB")} · by <code>{v.changedBy}</code>
            {v.rolledBackFrom ? ` · rollback to v${v.rolledBackFrom}` : ""}
            {i === 0 ? " · current" : ""}
          </summary>
          <pre>{JSON.stringify(v.diff, null, 2)}</pre>
          {i > 0 && <RollbackButton csrf={csrfToken(s)} version={v.version} />}
        </details>
      ))}
      {!versions.length && <p className="muted">No changes yet.</p>}
    </>
  );
}
