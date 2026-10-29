import { redirect } from "next/navigation";
import { SettingKeys } from "@westbridge/shared";
import { db } from "@/lib/db";
import { ClaimForm } from "./ClaimForm";

export const dynamic = "force-dynamic";

export default async function ClaimPage() {
  if (await db().setting.count({ where: { key: SettingKeys.setupClaimedBy } })) redirect("/login");
  return (
    <main className="narrow">
      <p className="eyebrow">Step 1 of 7 · Claim</p>
      <h1>Claim this system</h1>
      <p>
        Enter the <code>SETUP_TOKEN</code> from this project&apos;s Vercel environment variables. You&apos;ll then sign in with Discord and
        register a passkey. This only works once, and only for Discord accounts on the owner allowlist.
      </p>
      <ClaimForm />
    </main>
  );
}
