import type { MiddlewareHandler } from "hono";
import { isSetupLocked } from "@westbridge/core";
import { getDb } from "@westbridge/db";

/** Refuses to serve until the setup wizard has been completed and locked. */
export const requireSetupComplete: MiddlewareHandler = async (c, next) => {
  if (!(await isSetupLocked(getDb()))) return c.json({ error: "SETUP_INCOMPLETE" }, 503);
  await next();
};
