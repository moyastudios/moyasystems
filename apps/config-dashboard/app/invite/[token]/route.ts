import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { rateLimit } from "@westbridge/core";
import { db, requestIp } from "@/lib/db";
import { env } from "@/lib/env";
import { INVITE_COOKIE } from "@/lib/oauth";
import { cookieOpts } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Owner invite link: remembers the token, then goes to Discord sign-in. Checked again at passkey registration. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!(await rateLimit(db(), `invite:${await requestIp()}`, 10, 3600)) || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    return NextResponse.redirect(`${env().PUBLIC_ORIGIN}/login?error=invite`, 303);
  }
  (await cookies()).set(INVITE_COOKIE, token, cookieOpts(15 * 60));
  return NextResponse.redirect(`${env().PUBLIC_ORIGIN}/auth/discord`, 303);
}
