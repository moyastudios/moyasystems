"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withStepUp } from "@/components/stepup";
import { lockSetup } from "../actions";

export function LockButton({ csrf }: { csrf: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function lock() {
    if (!confirm("Lock setup and go live? The API and bot start serving immediately.")) return;
    const r = await withStepUp(csrf, () => lockSetup(csrf));
    if (r.ok) router.refresh();
    else setError(r.error ?? "Failed");
  }
  return (
    <>
      <button onClick={lock}>Lock &amp; go live</button>
      {error && <p className="error">{error}</p>}
    </>
  );
}
