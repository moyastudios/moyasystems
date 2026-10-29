"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withStepUp } from "@/components/stepup";
import { rollback } from "./actions";

export function RollbackButton({ csrf, version }: { csrf: string; version: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function go() {
    if (!confirm(`Restore the config as it was at v${version}?`)) return;
    const r = await withStepUp(csrf, () => rollback(csrf, version));
    if (r.ok) router.refresh();
    else setError(r.error ?? "Failed");
  }
  return (
    <>
      <button className="secondary" onClick={go}>Roll back to v{version}</button>
      {error && <p className="error">{error}</p>}
    </>
  );
}
