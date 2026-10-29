# Westbridge Staff System

Moderation, staff quota and logging for Westbridge, run from Discord, two dashboards and in-game. The full plan is in [docs/PLAN.md](docs/PLAN.md).

**Phase 1 (this code):** monorepo, database, API (health, Discord interactions, signed game requests, `/game/link`), the config dashboard's setup wizard, `/link` and `/whoami`, and the Roblox API client + link GUI.

```
apps/api               Hono API on Vercel → api.moya-studios.xyz (also runs on a plain Node VPS: pnpm --filter @westbridge/api start)
apps/config-dashboard  Next.js setup wizard → config.moya-studios.xyz (separate Vercel project)
apps/mod-dashboard     Next.js placeholder → mod.moya-studios.xyz (phase 4)
packages/db            Prisma schema, migrations, sql/roles.sql
packages/shared        Browser-safe constants and zod schemas
packages/core          Server-only logic: encryption, audit, config versioning, linking, Discord/Roblox clients
roblox/                Luau scripts (install into the place via Roblox Studio)
```

## How it fits together

- **Discord → API:** Discord posts slash commands to `https://api.moya-studios.xyz/discord/interactions`. Every request's Ed25519 signature is checked; commands are deferred immediately and finished in the background, so the 3-second limit is never hit.
- **Game → API:** Roblox only lets a script send a Secrets-store value in a header; it can't read it, so it can't compute an HMAC with it. So each game server opens a session: `POST /game/session` with the secret in `X-WB-Secret` returns a random per-server key (24h). Every later request is signed with HMAC-SHA256 over `v1\n<ts>\n<nonce>\n<METHOD>\n<path>\n<sha256(body)>`. Requests older than 60s, replayed nonces and expired sessions are rejected.
- **API → game:** Roblox Open Cloud (MessagingService publish; Ban API in phase 2).
- **Config:** everything (server, channels, IDs, keys, ranks, permissions, quota) is written by the setup wizard into the database. The API answers `503 SETUP_INCOMPLETE` (and the bot says so) until the wizard is locked. Every change writes a `config_versions` row and can be rolled back from **Versions**.
- **Audit:** every command, game call and config change is written to `audit_log` (with IP, secrets redacted) and mirrored to the private audit channel.

## 1. Neon database

1. In Vercel → **Storage** → **Create** → **Neon** (Marketplace). Pick a region near your players (e.g. London `eu-west-2`).
2. Skip connecting it to a project: the integration would inject the *owner* connection string, which must never be used at runtime. Each app gets a restricted-role `DATABASE_URL` instead (below).
3. Copy the owner connection string from the Neon console (**direct** host, not `-pooler`). Keep it on your machine as `MIGRATE_DATABASE_URL` (or as a GitHub Actions secret). It is only for migrations.
4. Add GitHub secrets (repo → Settings → Secrets and variables → Actions): `MIGRATE_DATABASE_URL` (the owner string from step 3), and two different random passwords, `WB_API_DB_PASSWORD` and `WB_CONFIG_DB_PASSWORD` (`openssl rand -hex 24`).
5. Actions → **Migrate database** → **Run workflow**. It applies migrations, creates the `wb_api` / `wb_config` roles and grants, and sets their passwords. (Locally instead: `pnpm db:migrate && pnpm db:roles` with `MIGRATE_DATABASE_URL` exported, then `ALTER ROLE … PASSWORD` in the Neon SQL editor.)
6. Build the two runtime URLs from the **pooled** host (`ep-…-pooler…`): `postgresql://wb_api:<pw>@<pooled-host>/neondb?sslmode=require` and the same for `wb_config`.

Re-run the **Migrate database** workflow after every schema change. What each role can do:

| Role | Used by | Access |
|---|---|---|
| owner | migrations only | everything |
| `wb_api` | API | reads config; writes users, links, cases, help calls, game sessions; **append-only** audit log; no passkeys or dashboard sessions |
| `wb_config` | config dashboard | writes config, versions, passkeys, sessions; reads users/staff; **append-only** audit log; no moderation data |

## 2. Discord developer portal

1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application** ("Westbridge").
2. **General Information:** copy **Application ID** and **Public Key**. Set **Interactions Endpoint URL** to `https://api.moya-studios.xyz/discord/interactions` *after* the API is deployed with its env vars. Discord sends a signed PING to verify it.
3. **Bot:** **Reset Token** and copy it. Leave all privileged gateway intents **off** (nothing uses the gateway). Turn **Public Bot** off.
4. **OAuth2:** copy the **Client Secret**. Add redirect `https://config.moya-studios.xyz/auth/discord/callback`.
5. The bot is invited from wizard step 2 (it needs View Channels, Send Messages, Embed Links). Slash commands are registered from the same step.

## 3. Roblox Open Cloud key and secret

1. [create.roblox.com/dashboard/credentials](https://create.roblox.com/dashboard/credentials) → **Create API key**, owned by the group that owns Westbridge.
2. Add these permissions, each restricted to the Westbridge **experience** (or the group for group:read):
   - `universe-messaging-service:publish`
   - `universe.user-restriction:read` and `universe.user-restriction:write` (Ban API)
   - `group:read`
3. Set an **IP allowlist** of `0.0.0.0/0` (Vercel has no fixed outbound IPs) and an expiry you'll remember to rotate.
4. Paste the key into wizard step 3. It's stored encrypted and never shown again.
5. In wizard step 3, **Generate signing secret**. It's shown once. In Creator Dashboard → Westbridge → **Secrets**, create a secret named `westbridge_api`, domain `api.moya-studios.xyz`, value = the generated secret. For Studio testing, add the same under **Game Settings → Security → Secrets**.
6. In Game Settings → Security, turn on **Allow HTTP Requests**.

## 4. Vercel projects and domains

Create three projects from this repo (Vercel → Add New → Project → import, then set **Root Directory**):

| Project | Root directory | Framework | Domain |
|---|---|---|---|
| westbridge-api | `apps/api` | Hono | `api.moya-studios.xyz` |
| westbridge-config | `apps/config-dashboard` | Next.js | `config.moya-studios.xyz` |
| westbridge-mod | `apps/mod-dashboard` | Next.js | `mod.moya-studios.xyz` |

Keep "Include files outside the root directory" on (default) so the workspace packages build. For each, add the domain under **Settings → Domains** and create the CNAME it shows at your DNS provider for `moya-studios.xyz`.

Environment variables (Production). See each app's `.env.example`:

- **westbridge-api:** `DATABASE_URL` (wb_api, pooled), `SETTINGS_ENCRYPTION_KEY`, `SETTINGS_ENCRYPTION_KEY_ID`, `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`.
- **westbridge-config:** `DATABASE_URL` (wb_config, pooled), the **same** `SETTINGS_ENCRYPTION_KEY`/`_ID`, `SETUP_TOKEN`, `OWNER_DISCORD_IDS`, `DISCORD_APP_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `PUBLIC_ORIGIN=https://config.moya-studios.xyz`, `WEBAUTHN_RP_ID=config.moya-studios.xyz`.

Generate keys with `openssl rand -base64 32` (encryption key) and `openssl rand -base64 48` (setup token). Mark them **Sensitive** in Vercel.

Optional hardening: on **westbridge-config**, add a Firewall rule (Settings → Firewall → Custom rule) that denies requests unless the IP is yours. Enable **Deployment Protection** for preview deployments of all three projects.

## 5. Run the setup wizard

Open `https://config.moya-studios.xyz` and:

1. **Claim:** enter `SETUP_TOKEN`, sign in with Discord (must be in `OWNER_DISCORD_IDS`), register a passkey. Works once.
2. **Discord:** invite the bot, pick the server and the audit / mod log / join log / reports / quota channels. Send a test message, register slash commands.
3. **Roblox:** group ID, universe ID, Open Cloud key, signing secret. Join the live game, then **Run connection test**. It needs all three ticks.
4. **Ranks:** junior → senior, each with a Discord role and a group rank.
5. **Permissions:** seeded with warn/kick → Moderator, serverban/timeban → Admin, gameban/unban → Senior.
6. **Quota:** targets per rank, minimum call length, repeat cap, reset day (Europe/London).
7. **Review & lock:** after this the API and bot go live.

Every save asks for your passkey again. Sessions end after 15 minutes idle or 8 hours. Other owners: add their ID to `OWNER_DISCORD_IDS`, redeploy, then create an invite under **Owners & passkeys**.

## 6. Roblox scripts

See [roblox/README.md](roblox/README.md). Install them through Roblox Studio (to be done with the Studio connection).

## Development

```bash
pnpm install
pnpm typecheck
pnpm test                      # unit tests; Luau crypto is checked against Node's crypto
pnpm --filter @westbridge/api dev
pnpm --filter @westbridge/config-dashboard dev
```

The API integration test needs a migrated Postgres with `roles.sql` applied (CI does this):
`TEST_API_DATABASE_URL=postgresql://wb_api:…  TEST_CONFIG_DATABASE_URL=postgresql://wb_config:…  pnpm --filter @westbridge/api test`.

Never commit `.env` files; only `.env.example` is tracked.
