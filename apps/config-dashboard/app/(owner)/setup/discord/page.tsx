import { discord } from "@westbridge/core";
import { DISCORD_CHANNEL_KEYS, SettingKeys } from "@westbridge/shared";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { csrfToken, requireOwner } from "@/lib/session";
import { assertStepReachable } from "@/lib/setup";
import { DiscordForm } from "./DiscordForm";

export default async function DiscordStep({ searchParams }: { searchParams: Promise<{ guild?: string }> }) {
  const s = await requireOwner();
  await assertStepReachable("discord");
  const settings = Object.fromEntries((await db().setting.findMany({ where: { key: { startsWith: "discord." } } })).map((r) => [r.key, r.value]));
  const guilds = await discord.botGuilds().catch(() => []);
  const q = (await searchParams).guild;
  const guildId = q && guilds.some((g) => g.id === q) ? q : (settings[SettingKeys.guildId] ?? guilds[0]?.id ?? null);
  const channels = guildId
    ? (await discord.guildChannels(guildId).catch(() => [])).filter((c) => c.type === 0 || c.type === 5).sort((a, b) => a.position - b.position)
    : [];
  const current = Object.fromEntries(DISCORD_CHANNEL_KEYS.map((k) => [k, settings[SettingKeys.channel(k)] ?? ""]));
  const invite = `https://discord.com/oauth2/authorize?client_id=${env().DISCORD_APP_ID}&scope=bot%20applications.commands&permissions=19456`;

  return (
    <>
      <p className="eyebrow">Step 2 of 7</p>
      <h1>Discord</h1>
      <p>
        <a href={invite} target="_blank" rel="noreferrer">
          Invite the bot
        </a>{" "}
        to your staff server (View Channels, Send Messages, Embed Links), then reload this page.
      </p>
      <DiscordForm
        csrf={csrfToken(s)}
        guilds={guilds.map((g) => ({ id: g.id, name: g.name }))}
        guildId={guildId}
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        current={current}
      />
    </>
  );
}
