"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; done?: boolean; number?: number };

export function StepNav({ steps, extra, locked }: { steps: Item[]; extra: Item[]; locked: boolean }) {
  const path = usePathname();
  const done = steps.filter((s) => s.done).length;
  return (
    <>
      <div className="progress" aria-label={`${done} of ${steps.length} complete`}>
        <div className="progress-label">
          <span>{locked ? "Settings" : "Setup"}</span>
          <span>
            {done}/{steps.length}
          </span>
        </div>
        <progress max={steps.length} value={done} />
      </div>
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className={`step${path === s.href ? " current" : ""}${s.done ? " done" : ""}`} aria-current={path === s.href ? "page" : undefined}>
              <span className="step-dot" aria-hidden="true">
                {s.done ? "✓" : s.number}
              </span>
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
      <p className="nav-heading">Security</p>
      <ul className="steps">
        {extra.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className={`step plain-step${path === s.href ? " current" : ""}`} aria-current={path === s.href ? "page" : undefined}>
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
