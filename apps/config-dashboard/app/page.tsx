import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { setupState } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.passkeyVerifiedAt) redirect("/passkey");
  const st = await setupState();
  redirect(st.locked ? "/setup/review" : `/setup/${st.firstIncomplete === "claim" ? "discord" : st.firstIncomplete}`);
}
