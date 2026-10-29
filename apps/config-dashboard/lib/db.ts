import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { audit, clientIp } from "@westbridge/core";
import { getDb } from "@westbridge/db";

export const db = () => getDb();

export async function requestIp() {
  return clientIp(await headers());
}

/** Audit + mirror to the private Discord channel after the response is sent. */
export async function auditConfig(actor: string, action: string, payload: Record<string, unknown> = {}) {
  const a = await audit(db(), { actor, action, payload, ip: await requestIp() });
  after(a.mirror);
}
