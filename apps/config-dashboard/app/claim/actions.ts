"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { rateLimit, safeEqual } from "@westbridge/core";
import { SettingKeys } from "@westbridge/shared";
import { auditConfig, db, requestIp } from "@/lib/db";
import { env } from "@/lib/env";
import { CLAIM_COOKIE } from "@/lib/oauth";
import { cookieOpts } from "@/lib/session";

/** Step 1a: check the one-time setup token, then continue to Discord sign-in. */
export async function claimWithToken(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const ip = await requestIp();
  if (!(await rateLimit(db(), `claim:${ip}`, 5, 3600))) return { error: "Too many attempts. Try again in an hour." };
  if (await db().setting.count({ where: { key: SettingKeys.setupClaimedBy } })) return { error: "This system has already been claimed." };
  const token = form.get("token");
  if (typeof token !== "string" || token.length > 200 || !safeEqual(token.trim(), env().SETUP_TOKEN)) {
    await auditConfig("anonymous", "config.claim.bad_token");
    return { error: "That setup token is wrong." };
  }
  const row = await db().authChallenge.create({ data: { purpose: "CLAIM", challenge: "claim", expiresAt: new Date(Date.now() + 15 * 60_000) } });
  (await cookies()).set(CLAIM_COOKIE, row.id, cookieOpts(15 * 60));
  await auditConfig("anonymous", "config.claim.token_ok");
  redirect("/auth/discord");
}
