import { createPublicKey, verify } from "node:crypto";

const API = "https://discord.com/api/v10";
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Verifies an interaction's Ed25519 signature over timestamp + raw body. */
export function verifyDiscordSignature(publicKeyHex: string, signatureHex: string | null, timestamp: string | null, rawBody: string): boolean {
  if (!signatureHex || !timestamp || !/^[0-9a-f]{128}$/i.test(signatureHex) || !/^\d{1,12}$/.test(timestamp)) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

export class DiscordApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (auth && !token) throw new Error("DISCORD_BOT_TOKEN is not set");
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bot ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new DiscordApiError(res.status, `Discord ${method} ${path.split("?")[0]} failed: ${res.status}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export type DiscordMessage = { content?: string; embeds?: unknown[]; flags?: number; components?: unknown[] };
const noPings = { allowed_mentions: { parse: [] as string[] } };

export const discord = {
  postMessage: (channelId: string, msg: DiscordMessage) => call("POST", `/channels/${channelId}/messages`, { ...msg, ...noPings }),
  /** Edits the deferred reply. Uses the interaction token, not the bot token. */
  editOriginal: (appId: string, interactionToken: string, msg: DiscordMessage) =>
    call("PATCH", `/webhooks/${appId}/${interactionToken}/messages/@original`, { ...msg, ...noPings }, false),
  botGuilds: () => call<{ id: string; name: string }[]>("GET", "/users/@me/guilds"),
  guildChannels: (guildId: string) => call<{ id: string; name: string; type: number; position: number }[]>("GET", `/guilds/${guildId}/channels`),
  guildRoles: (guildId: string) => call<{ id: string; name: string; position: number; managed: boolean }[]>("GET", `/guilds/${guildId}/roles`),
  registerGuildCommands: (appId: string, guildId: string, commands: unknown[]) => call("PUT", `/applications/${appId}/guilds/${guildId}/commands`, commands),
};

export const EPHEMERAL = 1 << 6;
