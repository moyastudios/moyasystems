import type { MiddlewareHandler } from "hono";
import { API_CSP, SECURITY_HEADERS, clientIp } from "@westbridge/core";
import type { AppEnv } from "../lib/types";

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("ip", clientIp(c.req.raw.headers));
  await next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
  c.header("Content-Security-Policy", API_CSP);
  c.header("Cache-Control", "no-store");
};
