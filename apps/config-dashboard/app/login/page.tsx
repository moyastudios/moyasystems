import { Brand } from "@/components/Brand";
import { SettingKeys } from "@westbridge/shared";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  denied: "That Discord account isn't allowed to manage this system.",
  state: "Sign-in expired or was tampered with. Try again.",
  discord: "Discord sign-in failed. Try again.",
  rate: "Too many attempts. Wait a few minutes.",
  invite: "That invite link isn't valid.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const claimed = (await db().setting.count({ where: { key: SettingKeys.setupClaimedBy } })) > 0;
  return (
    <main className="narrow">
      <Brand />
      <h1>Sign in</h1>
      <p>Owner access only. You&apos;ll confirm with your passkey after signing in.</p>
      {error && ERRORS[error] && <p className="error">{ERRORS[error]}</p>}
      <a className="button discord" href="/auth/discord">
        Sign in with Discord
      </a>
      {!claimed && (
        <p>
          First time? <a href="/claim">Claim this system</a>.
        </p>
      )}
    </main>
  );
}
