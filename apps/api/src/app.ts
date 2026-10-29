import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { logError } from "@westbridge/core";
import type { AppEnv } from "./lib/types";
import { securityHeaders } from "./middleware/security";
import { health } from "./routes/health";
import { discordRoutes } from "./routes/discord";
import { game } from "./routes/game";

export const app = new Hono<AppEnv>();

app.use("*", securityHeaders);
app.use("*", bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: "TOO_LARGE" }, 413) }));
app.route("/", health);
app.route("/", discordRoutes);
app.route("/", game);

app.notFound((c) => c.json({ error: "NOT_FOUND" }, 404));
app.onError((err, c) => {
  logError("unhandled", err, { path: c.req.path });
  return c.json({ error: "INTERNAL" }, 500);
});
