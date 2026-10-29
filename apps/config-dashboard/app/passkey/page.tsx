import { redirect } from "next/navigation";
import { csrfToken, requireDiscordSession } from "@/lib/session";
import { getPasskeyMode } from "./actions";
import { PasskeyClient } from "./PasskeyClient";

export const dynamic = "force-dynamic";

export default async function PasskeyPage() {
  const s = await requireDiscordSession();
  if (s.passkeyVerifiedAt) redirect("/");
  const mode = await getPasskeyMode();
  return (
    <main className="narrow">
      {mode === "login" && <h1>Confirm with your passkey</h1>}
      {mode === "claim" && (
        <>
          <p className="eyebrow">Step 1 of 7 · Claim</p>
          <h1>Register your passkey</h1>
          <p>This passkey is required every time you sign in, and again before any sensitive change.</p>
        </>
      )}
      {mode === "invite" && <h1>Register your passkey</h1>}
      {mode === "none" ? (
        <p className="error">No passkey is registered for this Discord account. Ask an existing owner to send you an invite link.</p>
      ) : (
        <PasskeyClient csrf={csrfToken(s)} register={mode !== "login"} />
      )}
      <form action="/auth/logout" method="post">
        <button className="link">Sign out</button>
      </form>
    </main>
  );
}
