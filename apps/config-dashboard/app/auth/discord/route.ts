import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { authorizeUrl, newPkce, OAUTH_COOKIE } from "@/lib/oauth";
import { cookieOpts } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Starts Discord OAuth (state + PKCE, single use, 10 min). */
export async function GET() {
  const { state, verifier, challenge } = newPkce();
  const row = await db().authChallenge.create({
    data: { purpose: "OAUTH_STATE", challenge: JSON.stringify({ state, verifier }), expiresAt: new Date(Date.now() + 600_000) },
  });
  (await cookies()).set(OAUTH_COOKIE, row.id, { ...cookieOpts(600), sameSite: "lax" }); // lax: must survive the redirect back from discord.com
  return NextResponse.redirect(authorizeUrl(state, challenge), 303);
}
