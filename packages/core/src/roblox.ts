// Roblox Open Cloud client. The API key is passed per call and never logged.
const BASE = "https://apis.roblox.com";

export type OpenCloudResult<T = unknown> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(apiKey: string, method: string, path: string, body?: unknown): Promise<OpenCloudResult<T>> {
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { "x-api-key": apiKey, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200).replace(/[^\x20-\x7e]/g, "");
      return { ok: false, status: res.status, error: text || res.statusText };
    }
    const text = await res.text();
    return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.name : "network error" };
  }
}

export const openCloud = {
  publishMessage: (key: string, universeId: string, topic: string, message: unknown) =>
    call(key, "POST", `/cloud/v2/universes/${universeId}:publishMessage`, { topic, message: JSON.stringify(message) }),
  listUserRestrictions: (key: string, universeId: string) =>
    call(key, "GET", `/cloud/v2/universes/${universeId}/user-restrictions?maxPageSize=1`),
  listGroupRoles: (key: string, groupId: string) =>
    call<{ groupRoles?: { id: string; displayName: string; rank: number }[] }>(key, "GET", `/cloud/v2/groups/${groupId}/roles?maxPageSize=20`),
};
