import { discord, getSetting, publicGroupRoles } from "@westbridge/core";
import { SettingKeys } from "@westbridge/shared";
import { db } from "@/lib/db";
import { csrfToken, requireOwner } from "@/lib/session";
import { assertStepReachable } from "@/lib/setup";
import { RanksForm } from "./RanksForm";

export default async function RanksStep() {
  const s = await requireOwner();
  await assertStepReachable("ranks");
  const [guildId, groupId, ranks] = await Promise.all([
    getSetting(db(), SettingKeys.guildId),
    getSetting(db(), SettingKeys.groupId),
    db().rank.findMany({ orderBy: { order: "asc" } }),
  ]);
  const roles = guildId ? (await discord.guildRoles(guildId).catch(() => [])).filter((r) => !r.managed && r.id !== guildId) : [];
  const group = groupId ? await publicGroupRoles(groupId) : null;
  const groupRoles = group?.ok ? group.data.filter((r) => r.rank > 0).sort((a, b) => a.rank - b.rank) : [];
  return (
    <>
      <p className="eyebrow">Step 4 of 7</p>
      <h1>Ranks</h1>
      <p>List staff ranks from most junior to most senior. Each needs a Discord role and a Roblox group rank.</p>
      <RanksForm
        csrf={csrfToken(s)}
        initial={ranks.map((r) => ({ id: r.id, name: r.name, discordRoleId: r.discordRoleId, robloxGroupRank: r.robloxGroupRank }))}
        roles={roles.sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name }))}
        groupRoles={groupRoles.map((r) => ({ rank: r.rank, name: r.name }))}
      />
    </>
  );
}
