import { Hono } from "hono";
import { getDb } from "@westbridge/db";
import { isSetupLocked, logError } from "@westbridge/core";

export const health = new Hono().get("/health", async (c) => {
  try {
    const locked = await isSetupLocked(getDb());
    return c.json({ ok: true, db: "up", setup: locked ? "complete" : "incomplete" });
  } catch (e) {
    logError("health: database check failed", e);
    return c.json({ ok: false, db: "down" }, 503);
  }
});
