import { Hono } from "hono";
import { EPHEMERAL, verifyDiscordSignature } from "@westbridge/core";
import { env } from "../env";
import { background } from "../lib/background";
import type { AppEnv } from "../lib/types";
import { handleCommand, type Interaction } from "../discord/commands";

export const discordRoutes = new Hono<AppEnv>();

discordRoutes.post("/discord/interactions", async (c) => {
  const raw = await c.req.text();
  if (raw.length > 64 * 1024) return c.json({ error: "TOO_LARGE" }, 413);
  const ts = c.req.header("x-signature-timestamp") ?? null;
  const ok =
    verifyDiscordSignature(env().DISCORD_PUBLIC_KEY, c.req.header("x-signature-ed25519") ?? null, ts, raw) &&
    Math.abs(Date.now() / 1000 - Number(ts)) < 300;
  if (!ok) return c.text("invalid request signature", 401);

  const i = JSON.parse(raw) as Interaction;
  if (i.type === 1) return c.json({ type: 1 }); // PING: must always answer, even before setup.
  if (i.type === 2) {
    // Defer immediately (well inside Discord's 3s window), then do the work and edit the reply.
    background(handleCommand(i, c.get("ip")));
    return c.json({ type: 5, data: { flags: EPHEMERAL } });
  }
  return c.json({ type: 4, data: { content: "Not supported yet.", flags: EPHEMERAL } });
});
