import Link from "next/link";
import { SETUP_STEPS, SETUP_STEP_TITLES } from "@westbridge/shared";
import { requireOwner } from "@/lib/session";
import { setupState } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  const st = await setupState();
  return (
    <div className="shell">
      <nav>
        <strong>Westbridge config</strong>
        <p className="eyebrow">{st.locked ? "Settings" : "Setup"}</p>
        <ol>
          {SETUP_STEPS.filter((k) => k !== "claim").map((k) => (
            <li key={k} className={st.steps[k] ? "done" : ""}>
              <Link href={`/setup/${k}`}>{SETUP_STEP_TITLES[k]}</Link>
            </li>
          ))}
        </ol>
        <p className="eyebrow">Security</p>
        <ul>
          <li>
            <Link href="/versions">Versions</Link>
          </li>
          <li>
            <Link href="/owners">Owners &amp; passkeys</Link>
          </li>
        </ul>
        <form action="/auth/logout" method="post">
          <button className="link">Sign out</button>
        </form>
      </nav>
      <main>{children}</main>
    </div>
  );
}
