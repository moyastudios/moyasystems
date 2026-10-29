import { audit, discord, EPHEMERAL, getSetting, isSetupLocked, issueLinkCode, rateLimit, syncStaffFromDiscord } from "@westbridge/core";
import { getDb } from "@westbridge/db";
import { SettingKeys } from "@westbridge/shared";
import { env } from "../env";
import { background } from "../lib/background";

export type Interaction = {
  id: string;
  type: number;
  token: string;
  guild_id?: string;
  data?: { name: string };
  member?: { user: { id: string; username: string }; roles: string[] };
  user?: { id: string };
};

/** Runs after the deferred reply has been sent; edits that reply with the result. */
export async function handleCommand(i: Interaction, ip: string | null) {
  const db = getDb();
  const reply = (content: string) => discord.editOriginal(env().DISCORD_APP_ID, i.token, { content, flags: EPHEMERAL });
  const name = i.data?.name ?? "unknown";
  const userId = i.member?.user.id ?? i.user?.id ?? "unknown";

  const a = await audit(db, { actor: `discord:${userId}`, action: `discord.command.${name}`, payload: { guildId: i.guild_id }, ip });
  background(a.mirror);

  if (!(await isSetupLocked(db))) return reply("Westbridge isn't set up yet. An owner needs to finish the setup wizard.");
  if (!i.member || i.guild_id !== (await getSetting(db, SettingKeys.guildId))) return reply("Use this command in the Westbridge staff server.");
  if (!(await rateLimit(db, `discord-cmd:${userId}`, 10, 60))) return reply("Slow down: try again in a minute.");

  const { user, rank } = await syncStaffFromDiscord(db, userId, i.member.roles);

  switch (name) {
    case "link": {
      if (!rank) return reply("Only staff can link a Roblox account.");
      if (!(await rateLimit(db, `discord-link:${userId}`, 3, 600))) return reply("You've asked for too many codes. Try again in 10 minutes.");
      const { code, expiresAt } = await issueLinkCode(db, userId);
      return reply(
        `Your link code is **\`${code}\`**\n` +
          `Join Westbridge, press **Link Discord** and enter it. It expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R> and works once.\n` +
          `Don't share it with anyone.`,
      );
    }
    case "whoami": {
      const roblox = user.robloxId
        ? `**${user.robloxUsername}** (\`${user.robloxId}\`), linked <t:${Math.floor(user.linkedAt!.getTime() / 1000)}:R>`
        : "not linked. Use `/link`.";
      return reply(`Roblox: ${roblox}\nRank: ${rank ? `**${rank.name}**` : "not staff"}`);
    }
    default:
      return reply("Unknown command.");
  }
}
