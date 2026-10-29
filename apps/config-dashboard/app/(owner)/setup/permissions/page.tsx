import { DEFAULT_PERMISSION_TIERS, MODERATION_COMMANDS, formatDuration } from "@westbridge/shared";
import { db } from "@/lib/db";
import { csrfToken, requireOwner } from "@/lib/session";
import { assertStepReachable } from "@/lib/setup";
import { PermissionsForm } from "./PermissionsForm";

export default async function PermissionsStep() {
  const s = await requireOwner();
  await assertStepReachable("permissions");
  const [ranks, perms] = await Promise.all([db().rank.findMany({ orderBy: { order: "asc" } }), db().permission.findMany()]);

  // Seed defaults by rank name; fall back to junior / middle / senior by position.
  const byTier = (tier: "Moderator" | "Admin" | "Senior") =>
    ranks.find((r) => r.name.toLowerCase().startsWith(tier.toLowerCase())) ??
    ranks[{ Moderator: 0, Admin: Math.floor((ranks.length - 1) / 2), Senior: ranks.length - 1 }[tier]]!;
  const rows = MODERATION_COMMANDS.map((command) => {
    const p = perms.find((x) => x.command === command);
    return {
      command,
      minRankId: p?.minRankId ?? byTier(DEFAULT_PERMISSION_TIERS[command]).id,
      maxDuration: p?.maxDuration ? formatDuration(p.maxDuration) : command === "timeban" ? "7d" : "",
      needsApproval: p?.needsApproval ?? false,
    };
  });
  return (
    <>
      <p className="eyebrow">Step 5 of 7</p>
      <h1>Permissions</h1>
      <p>
        Minimum rank for each command. Max duration caps timebans for that rank; longer requests go to a more senior rank for
        approval. Leave blank for no cap.
      </p>
      <PermissionsForm csrf={csrfToken(s)} ranks={ranks.map((r) => ({ id: r.id, name: r.name }))} initial={rows} />
    </>
  );
}
