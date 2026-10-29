# Roblox scripts

Written here first; installed into the Westbridge place through Roblox Studio (not done yet).

| File | Instance | Goes in |
|---|---|---|
| `ServerScriptService/Westbridge/` | Folder | ServerScriptService |
| `…/Boot.server.luau` | Script | ServerScriptService.Westbridge |
| `…/Config.luau`, `Crypto.luau`, `ApiClient.luau`, `LinkService.luau` | ModuleScript | ServerScriptService.Westbridge |
| `StarterPlayer/StarterPlayerScripts/LinkGui.client.luau` | LocalScript | StarterPlayer.StarterPlayerScripts |

`WestbridgeRemotes` (in ReplicatedStorage) is created by the server at runtime.

Before testing: Game Settings → Security → **Allow HTTP Requests** on; secret `westbridge_api` created (see the main README, step 3).

- **ApiClient**: opens a per-server session with the Secrets-store value, signs every request (HMAC-SHA256), queues them (3 at a time, 300/min), retries network errors / 429 / 5xx with backoff, and re-opens the session once if it's rejected.
- **Crypto**: pure-Luau SHA-256 + HMAC. `pnpm --filter @westbridge/roblox test` checks it against Node's crypto.
- **LinkService**: the `Link Discord` button only appears for players whose group rank is at least the lowest staff rank set in the wizard. The server and API both re-check that.
