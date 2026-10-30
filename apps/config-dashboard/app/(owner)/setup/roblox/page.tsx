import { ROBLOX_SECRET_NAME, SettingKeys } from "@westbridge/shared";
import { db } from "@/lib/db";
import { csrfToken, requireOwner } from "@/lib/session";
import { assertStepReachable } from "@/lib/setup";
import { RobloxForm } from "./RobloxForm";

export default async function RobloxStep() {
  const s = await requireOwner();
  const st = await assertStepReachable("roblox");
  const rows = await db().setting.findMany({ where: { key: { startsWith: "roblox." } } });
  const get = (k: string) => rows.find((r) => r.key === k);
  return (
    <>
      <p className="eyebrow">Step 3 of 7</p>
      <h1>Roblox</h1>
      <p>
        Create an Open Cloud API key at <a href="https://create.roblox.com/dashboard/credentials">create.roblox.com → Credentials</a> limited
        to the Westbridge universe and group, with: <code>universe-messaging-service:publish</code>,{" "}
        <code>universe.user-restriction:read</code> and <code>universe.user-restriction:write</code>. No group permissions are needed.
      </p>
      <RobloxForm
        csrf={csrfToken(s)}
        secretName={ROBLOX_SECRET_NAME}
        groupId={get(SettingKeys.groupId)?.value ?? ""}
        universeId={get(SettingKeys.universeId)?.value ?? ""}
        keySetAt={get(SettingKeys.openCloudKey)?.updatedAt.toISOString() ?? null}
        secretSetAt={get(SettingKeys.signingSecret)?.updatedAt.toISOString() ?? null}
        tests={st.tests}
      />
    </>
  );
}
