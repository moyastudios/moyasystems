import "server-only";
import { createHash } from "node:crypto";
import { randomToken } from "@westbridge/core";
import { env } from "./env";

export const OAUTH_COOKIE = "__Host-wb_oauth";
export const CLAIM_COOKIE = "__Host-wb_claim";
export const INVITE_COOKIE = "__Host-wb_invite";

export const redirectUri = () => `${env().PUBLIC_ORIGIN}/auth/discord/callback`;

export function newPkce() {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state: randomToken(24), verifier, challenge };
}

export function authorizeUrl(state: string, codeChallenge: string) {
  const u = new URL("https://discord.com/oauth2/authorize");
  u.search = new URLSearchParams({
    response_type: "code",
    client_id: env().DISCORD_APP_ID,
    scope: "identify",
    redirect_uri: redirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "consent",
  }).toString();
  return u.toString();
}

/** Exchanges the code and returns the Discord user ID. The access token is discarded immediately. */
export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: "Basic " + Buffer.from(`${env().DISCORD_APP_ID}:${env().DISCORD_CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const { access_token } = (await res.json()) as { access_token: string };
  const me = await fetch("https://discord.com/api/v10/users/@me", { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(8000) });
  if (!me.ok) throw new Error(`users/@me failed: ${me.status}`);
  const { id } = (await me.json()) as { id: string };
  if (!/^\d{17,20}$/.test(id)) throw new Error("bad user id");
  return id;
}
