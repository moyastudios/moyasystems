import { SETUP_STEPS, SETUP_STEP_TITLES } from "@westbridge/shared";
import { Brand } from "@/components/Brand";
import { StepNav } from "@/components/StepNav";
import { requireOwner } from "@/lib/session";
import { setupState } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const s = await requireOwner();
  const st = await setupState();
  const steps = SETUP_STEPS.filter((k) => k !== "claim").map((k, i) => ({
    href: `/setup/${k}`,
    label: SETUP_STEP_TITLES[k],
    done: st.steps[k],
    number: i + 2,
  }));
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <StepNav
          steps={steps}
          locked={st.locked}
          extra={[
            { href: "/versions", label: "Versions" },
            { href: "/owners", label: "Owners & passkeys" },
          ]}
        />
        <div className="sidebar-foot">
          <span className="muted">
            Signed in as <code>{s.discordId}</code>
          </span>
          <form action="/auth/logout" method="post">
            <button className="ghost small">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
