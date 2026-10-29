import type { Db } from "@westbridge/db";

/** Highest configured rank among the member's Discord roles, or null if they hold none. */
export async function rankForDiscordRoles(db: Db, roleIds: string[]) {
  if (!roleIds.length) return null;
  return db.rank.findFirst({ where: { discordRoleId: { in: roleIds } }, orderBy: { order: "desc" } });
}

/** Keeps users/staff in step with the member's current Discord roles. Returns the staff rank, if any. */
export async function syncStaffFromDiscord(db: Db, discordId: string, roleIds: string[]) {
  const rank = await rankForDiscordRoles(db, roleIds);
  const user = await db.user.upsert({ where: { discordId }, create: { discordId }, update: {}, include: { staff: true } });
  if (rank) {
    await db.staff.upsert({
      where: { userId: user.id },
      create: { userId: user.id, rankId: rank.id },
      update: { rankId: rank.id, active: true },
    });
  } else if (user.staff?.active) {
    await db.staff.update({ where: { id: user.staff.id }, data: { active: false } });
  }
  return { user, rank };
}
