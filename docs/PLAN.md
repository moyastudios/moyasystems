# Westbridge Staff Bot — Plan & Build Prompt

Oct 29, 2026 · @jacob

## Overview

One staff bot that lets Westbridge staff moderate the game, track quota and see logs from Discord, backed by a config dashboard and a moderation dashboard on the same API.

- **One source of truth:** a backend API and database own every case, help call, rank and setting. The bot, the game and both dashboards are clients of it.
- **Works both ways:** Discord commands reach live servers (kick, ban, announce), and the game reports back (joins, help calls, reports, in-game mod actions).
- **Configured, not coded:** ranks, permissions, quota rules, channels and keys are all set once through a setup procedure on a locked-down config dashboard.
- **Two dashboards:** a config dashboard for owners only, and a separate moderation dashboard for day-to-day staff work.
- **Hosted on Vercel** under your custom domain, with a VPS only for the few features that need an always-on connection.

## Architecture

&#91;embedded content: system architecture · 6 parts\]

The game sends signed events to the API; the API pushes kicks, bans and announcements back through Roblox Open Cloud. Discord, the moderation dashboard and the config dashboard all go through the same API, so they always show the same cases, quota and settings.

## Hosting

Everything runs on Vercel except optional always-on features, because Discord slash commands and buttons can arrive as plain HTTPS requests instead of needing a bot that stays connected ([chat-sdk docs](https://chat-sdk.dev/adapters/discord)).

| Part | Where | Address |
| --- | --- | --- |
| API + Discord interactions endpoint | Vercel project 1 | `api.moya-studios.xyz` (Discord posts to `api.moya-studios.xyz/discord/interactions`) |
| Moderation dashboard | Vercel project 2 | `mod.moya-studios.xyz` |
| Config dashboard | Vercel project 3, isolated | `config.moya-studios.xyz` |
| Database | Neon Postgres via the Vercel Marketplace, which replaced Vercel Postgres ([Vercel docs](https://vercel.com/docs/postgres)) | — |
| Scheduled jobs | Vercel Cron | weekly quota reset, daily rank sync, timeban clean-up |
| Always-on extras (optional) | Small VPS | live status embed, instant role sync, watchlist pings |

- **Vercel plan matters for timing:** on Hobby, cron jobs can only run once a day and may fire any time within the scheduled hour; Pro allows per-minute jobs ([Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)). The weekly reset and daily sync work on Hobby; anything every few minutes needs Pro or the VPS.
- **3-second rule:** Discord expects a reply within 3 seconds, so commands that reach Roblox reply "working on it" first and update the message when done.
- Keeping the config dashboard in its own Vercel project means a bug or leaked key in the public-facing apps can't reach it.

## Setup procedure

Nothing about your server is hard-coded: the first visit to the config dashboard runs a setup wizard, and the system refuses to run until it is finished.

1. **Claim** — enter a one-time setup token from Vercel's environment variables, sign in with Discord, and register a passkey. Only the Discord IDs listed in that environment variable can ever claim it.
2. **Discord** — invite the bot, pick the server, choose the mod log, join log, reports, audit and quota channels.
3. **Roblox** — enter the group ID and universe ID, paste the Open Cloud API key, and copy the generated signing secret into Roblox's Secrets Store. The wizard tests both directions before letting you continue.
4. **Ranks** — create ranks in order (e.g. Moderator, Admin, Senior), and link each to a Discord role and a Roblox group rank.
5. **Permissions** — set each command's minimum rank, maximum ban length and approval rule, starting from the defaults in Moderation below.
6. **Quota** — weekly help-call targets per rank, minimum call length, repeat cap and reset day.
7. **Review and lock** — a summary of everything, then the wizard locks. Later changes happen in the same screens, each needing a fresh passkey check.

After setup, every setting can still be changed from the config dashboard, and each change is saved as a new version you can roll back.

## Features

The first release covers account linking, moderation and quota; logging and rank sync follow.

### Account linking

- `/link` in Discord gives a 6-character code that expires in 10 minutes.
- The player types it into a small in-game GUI; the game sends it to the API, which ties the Discord ID to the Roblox user ID.
- Later, the moderation dashboard can offer official Roblox OAuth sign-in as a second way to link.

### Moderation

Actions are tiered by how far they reach, and each tier is locked to a minimum rank.

| Command | What it does | Default minimum rank |
| --- | --- | --- |
| `/warn` | Logged warning, shown to the player in-game | Moderator |
| `/kick` | Removes the player from their current server | Moderator |
| `/serverban` | Bans the player from one server until it shuts down | Admin |
| `/timeban` | Game-wide ban for a set time (e.g. 1h to 30d, capped per rank) | Admin |
| `/gameban` | Permanent game-wide ban through the Roblox Ban API | Senior staff |
| `/unban` | Lifts a timeban or gameban | Senior staff |

- Every action becomes a numbered case (`#0142`) with moderator, target, reason, evidence link, duration and where it was made (Discord, in-game or dashboard).
- `/history <user>`, `/case <id>` and `/note` for looking up and annotating players.
- Gamebans and timebans ask for a confirm click; a timeban above the moderator's cap goes to a senior for approval instead of failing.
- The same tiers apply in the in-game staff panel, so rank rules can't be bypassed by switching tools.
- `/announce` and `/servers` (live server list with player counts).

### Permissions

- The table above is only the starting point: every command's minimum rank, maximum duration and approval rule is set in the config dashboard, first during setup and then whenever needed.
- Ranks map to Discord roles and Roblox group ranks, so a promotion in the group changes what someone can run.
- Permissions are stored and enforced by the API, so the bot, the game panel and the moderation dashboard always agree.
- Every permission change is versioned and logged in the audit log.

### Quota

Quota counts itself: answering an Adonis help call in-game adds to the staff member's weekly total, with no commands needed.

- A small Adonis server plugin catches the moment a staff member accepts a help request and sends it to the API: staff ID, requester, server and time.
- When the call is closed (or the staff member leaves the requester), the plugin sends the end time, so each call has a duration.
- **Anti-farming:** calls under a minimum length (e.g. 30 seconds) don't count, and repeat calls from the same requester to the same staff member are capped per day. Both limits are set in the config dashboard.
- Each rank has a weekly target of help calls, set in the config dashboard; mod actions and hosted events can be added as optional extra targets.
- `/quota` shows your week; `/quota team` shows everyone, colour-coded.
- Weekly reset Monday 00:00 UK time, with an auto-posted summary of who passed and who failed.
- `/loa` requests leave of absence; an approved LOA exempts that week.

### Logging and reports

- Channels for mod log, join/leave log, in-game player reports and bot audit (who ran which command).
- In-game reports arrive as a Discord embed with Claim and Resolve buttons.

### Rank sync

- Roblox group rank sets Discord roles and bot permissions, so a promotion in the group updates everything.

## More feature ideas

Suggestions beyond the core; tick the ones to keep and they move into a phase.

### Moderation

- [ ] **Chat evidence:** when a report or ban is made, the last 50 chat messages from that server are attached to the case automatically.
- [ ] **Watchlist:** flag a player and staff get a Discord ping whenever they join any server.
- [ ] **Alt detection:** gamebans use the Ban API's alt-account blocking, and flagged alts appear on the case.
- [ ] **Ban appeals:** players submit an appeal through a public form on the moderation dashboard; seniors review it in a queue with the full case history.
- [ ] **Player profile:** `/profile` shows playtime, join history, cases, linked Discord and notes in one embed.
- [ ] **Discord ban sync:** a gameban can also ban the player's linked Discord account from your server, switched on per rank in the config dashboard.

### Staff management

- [ ] **Mid-week nudges:** a DM on Thursday to anyone under 50% of their quota.
- [ ] **Leaderboard and staff of the week:** auto-posted from help calls and cases.
- [ ] **Staff strikes:** seniors log strikes against staff; three in 30 days flags them for review.
- [ ] **Promotion tracker:** quota history and strikes over the last month shown together when reviewing someone for promotion.
- [ ] **Response-time stats:** average time from help call to accept, per staff member and per hour of day, to show when cover is thin.

### Game operations

- [ ] **Live status embed:** one channel message that updates every minute with servers, players and staff online.
- [ ] **Soft shutdown:** `/shutdown` warns players, then restarts servers for updates.
- [ ] **Lockdown:** `/lockdown` stops new joins to a server or the whole game during a raid or exploit.
- [ ] **Economy alerts:** the API flags unusual money movements, such as large delivery payouts or transfers, to a staff channel.
- [ ] **Event scheduling:** staff book events in Discord; attendance is recorded in-game and can count towards quota.

## Data model

Thirteen PostgreSQL tables on Neon; everything the setup wizard collects lives in `ranks`, `permissions`, `quota_rules` and `settings`, so no code changes are needed to reconfigure.

| Table | Holds | Key fields |
| --- | --- | --- |
| `users` | One person across Discord and Roblox | discord\_id, roblox\_id, roblox\_username, linked\_at |
| `link_codes` | Pending link codes | code, discord\_id, expires\_at |
| `ranks` | Ranks created in setup | name, order, discord\_role\_id, roblox\_group\_rank |
| `staff` | Staff membership | user\_id, rank\_id, joined\_at, active |
| `permissions` | Rules per command | command, min\_rank\_id, max\_duration, needs\_approval |
| `cases` | Every moderation action | case\_no, type (warn / kick / serverban / timeban / gameban), target\_roblox\_id, moderator\_id, reason, evidence\_url, duration, expires\_at, source, created\_at |
| `help_calls` | Adonis help calls answered | staff\_id, requester\_roblox\_id, server\_job\_id, accepted\_at, closed\_at, counted |
| `quota_rules` | Weekly targets per rank | rank\_id, min\_help\_calls, min\_actions, min\_events, min\_call\_seconds, repeat\_cap |
| `loa` | Leave of absence | staff\_id, starts, ends, reason, status, approved\_by |
| `settings` | Channels, IDs and keys from setup | key, value, encrypted (Open Cloud key and signing secret are stored encrypted) |
| `config_versions` | A snapshot of every config change | version, changed\_by, diff, created\_at |
| `passkeys` | Config dashboard owners' passkeys | discord\_id, credential\_id, public\_key, last\_used\_at |
| `audit_log` | Every command, API call and config change | actor, action, payload, ip, created\_at |

Quota is calculated from `help_calls` and `cases` for the current week rather than stored, so it can never drift out of sync. A serverban needs no expiry: it ends when that server's job ID shuts down.

## Security

The API, not any client, decides who may do what, and the config dashboard sits behind its own stricter wall, so one leaked password or bug can't hand anyone the keys.

### Config dashboard

- **Separate everything:** its own Vercel project, subdomain, environment variables and database role. Nothing else links to it.
- **Two factors, always:** Discord sign-in, plus a passkey on every session. Only Discord IDs listed in a Vercel environment variable can sign in, so a database leak can't add an owner.
- **Fresh check for risky changes:** changing keys, permissions or ranks asks for the passkey again, even mid-session.
- **Short sessions:** 15 minutes idle, 8 hours maximum, in secure, http-only, same-site cookies with CSRF tokens.
- **Write-only secrets:** the Open Cloud key and signing secret can be replaced but never displayed again, and are encrypted in the database with a key held only in Vercel.
- **Every change is visible:** each save creates a config version, is written to the audit log with IP, and posts to a private Discord channel. Any version can be rolled back.
- **Optional lockdown:** restrict the subdomain to your own IP addresses with a Vercel firewall rule.

### Everything else

- **Discord → API:** every interaction's signature is checked against the bot's public key before anything runs.
- **Game → API:** every request is signed with an HMAC of the body and a timestamp, using the secret held in Roblox's Secrets Store (`HttpService:GetSecret`), never in a script. Requests older than 60 seconds are rejected.
- **API → game:** commands go out through Roblox Open Cloud with an API key scoped to the Westbridge universe and only the permissions it needs.
- **Moderation dashboard:** Discord sign-in, then every page and action is checked against the staff member's rank on the server; the browser is never trusted.
- **Limits:** rate limits per staff member (e.g. 10 bans an hour), confirm clicks on bans, and input validation on every endpoint.
- **Headers:** strict Content Security Policy, HTTPS only (HSTS), no embedding in other sites.
- **Audit:** every command and API call is written to `audit_log` and mirrored to a private channel.

## Build phases

Six phases, each usable on its own; the config dashboard and setup wizard come first because every other part reads its settings.

1. **Foundations and setup** — API on Vercel, Neon database, Discord interactions endpoint, signed game requests, the config dashboard with the full setup wizard and its security, `/link`.
   - Done when: setup completes end to end, the wizard's Discord and Roblox connection tests pass, and `/whoami` shows a linked account.
2. **Moderation** — cases, the five action tiers from Discord and the in-game panel, `/history`, mod log channel, all checked against the permissions set in setup.
   - Done when: a gameban from Discord removes the player from a live server and blocks rejoining, and changing a rule in the config dashboard takes effect immediately.
3. **Quota** — Adonis help-call plugin, anti-farming rules, `/quota`, weekly reset by Vercel Cron, LOA.
   - Done when: a week of answered help calls produces a correct summary post.
4. **Moderation dashboard** — case search, player profiles, quota charts, LOA requests, ban appeals.
5. **Logging, reports, rank sync** — join logs, in-game reports with buttons, group-rank-to-role sync.
6. **Extras** — the ideas you keep from More feature ideas, plus the VPS if any of them need an always-on connection.

**Roblox side:** the Luau scripts, staff panel, link GUI and Adonis plugin are built directly in your place through the Roblox Studio connection, so the existing scripts are read before anything is added. Until Studio is connected, the scripts are written to the repo's /roblox folder, and Code will say when it needs the connection.

- [ ] Phase 1
- [ ] Phase 2
- [ ] Phase 3
- [ ] Phase 4
- [ ] Phase 5
- [ ] Phase 6

## Build prompt

Paste this into Claude Code (or another coding assistant) to start Phase 1, with this document saved in the repo as docs/PLAN.md.

```markdown
You are helping me build the Westbridge Staff System for my Roblox roleplay game, Westbridge: a backend API, a Discord bot, a config dashboard, a moderation dashboard, and in-game Roblox integration for moderation and staff quota. Security is the top priority throughout.

## Hosting
- Everything on Vercel under my custom domain: api.moya-studios.xyz (API + Discord interactions endpoint), mod.moya-studios.xyz (moderation dashboard), config.moya-studios.xyz (config dashboard, as a SEPARATE Vercel project with its own env vars).
- Database: Neon Postgres via the Vercel Marketplace, Prisma ORM.
- Discord bot uses the HTTP Interactions Endpoint (no gateway). Verify every request signature with the app's public key. Reply within 3 seconds; defer and follow up for anything slower.
- Scheduled work via Vercel Cron (weekly quota reset, daily rank sync). I'm on the Hobby plan, so cron jobs can run at most once a day and may fire anywhere within the scheduled hour; design every job to be safe if it runs late or twice. Design so a small VPS can be added later for gateway features without restructuring.

## Stack
- TypeScript everywhere. Monorepo: /apps/api, /apps/mod-dashboard, /apps/config-dashboard (Next.js), /packages/db (Prisma), /packages/shared, /roblox (Luau).
- Game -> API: HttpService with HMAC-signed requests (secret from HttpService:GetSecret), reject timestamps older than 60s.
- API -> game: Roblox Open Cloud. MessagingService for live commands; the user-restrictions (Ban API) endpoint for timebans and gamebans.
- The game uses Adonis admin. Quota comes from an Adonis server plugin that reports help-call accept and close events.
- Roblox Studio is NOT connected yet. Write Luau into /roblox for now. When you reach work that needs the live place (installing scripts, the link GUI, testing signed requests), stop and tell me to connect the Roblox Studio MCP. Once connected, inspect the place first (existing scripts, Adonis setup, ServerScriptService) and build inside it.

## Nothing hard-coded
All configuration comes from the database, written by a setup wizard on the config dashboard: ranks (mapped to Discord roles and Roblox group ranks), per-command permissions (min rank, max duration, approval), quota rules, channels, group ID, universe ID, Open Cloud key, signing secret. The system refuses to run until setup is complete. Every change creates a config_versions row and can be rolled back.

Setup wizard steps: 1 claim (one-time setup token from env + Discord sign-in + register passkey), 2 Discord (server, channels), 3 Roblox (IDs, Open Cloud key, generate signing secret, test both directions), 4 ranks, 5 permissions (seed defaults: warn/kick Moderator, serverban/timeban Admin, gameban/unban Senior), 6 quota rules, 7 review and lock.

## Security requirements
- Config dashboard: allowlist of owner Discord IDs from an env var; Discord OAuth + WebAuthn passkey on every session; passkey re-check for changes to keys, ranks or permissions; 15-min idle / 8-hour max sessions; secure http-only SameSite=strict cookies; CSRF tokens; secrets write-only and encrypted at rest (AES-256-GCM, key in env); separate DB role.
- All apps: server-side permission checks on every action, rate limiting, zod validation on every input, strict CSP, HSTS, frame-ancestors none.
- Every command, API call and config change goes to audit_log (with IP) and is mirrored to a private Discord channel.
- Never log secrets. Provide .env.example files only.

## Data model
- users: discord_id, roblox_id, roblox_username, linked_at
- link_codes: code, discord_id, expires_at
- ranks: name, order, discord_role_id, roblox_group_rank
- staff: user_id, rank_id, joined_at, active
- permissions: command, min_rank_id, max_duration, needs_approval
- cases: case_no, type (warn/kick/serverban/timeban/gameban), target_roblox_id, moderator_id, reason, evidence_url, duration, expires_at, source (discord/in-game/dashboard), created_at
- help_calls: staff_id, requester_roblox_id, server_job_id, accepted_at, closed_at, counted
- quota_rules: rank_id, min_help_calls, min_actions, min_events, min_call_seconds, repeat_cap
- loa: staff_id, starts, ends, reason, status, approved_by
- settings: key, value, encrypted
- config_versions: version, changed_by, diff, created_at
- passkeys: discord_id, credential_id, public_key, last_used_at
- audit_log: actor, action, payload, ip, created_at
Quota is computed from help_calls + cases for the current week (reset day from quota settings, Europe/London), never stored.

## Features (full scope; build in phases)
1. Linking: /link gives a 6-char code (10-min expiry); player enters it in an in-game GUI; API links Discord ID <-> Roblox ID. /whoami.
2. Moderation tiers: /warn, /kick, /serverban (one server until it shuts down), /timeban (game-wide, capped per rank), /gameban (permanent via Ban API), /unban. Numbered cases, /history, /case, /note, /announce, /servers. Confirm on bans; over-cap timebans go to a senior for approval. Same tiers in an in-game staff panel.
3. Quota: Adonis help calls; minimum call length and per-day repeat cap from quota_rules; /quota, /quota team, weekly summary, /loa.
4. Moderation dashboard: case search, player profiles, quota charts, LOA, ban appeals.
5. Logging, reports with Claim/Resolve buttons, group rank -> Discord role sync.

## What I want now: Phase 1 only
- Monorepo scaffold, Prisma schema and migrations for all tables.
- API: health check, Discord interaction verification, HMAC middleware, POST /game/link, setup-complete guard.
- Config dashboard: the full setup wizard with every security requirement above.
- Bot: /link and /whoami.
- Roblox: ApiClient ModuleScript (signing, retries, queue) and the link GUI, written to /roblox first, then installed in my place once I connect Studio.
- README covering Vercel projects, domains, Neon, the Discord developer portal and Roblox Open Cloud keys.

The full plan is in docs/PLAN.md; read it first, and treat this prompt as the priority if they ever disagree. Before writing code, show me the folder structure, the Prisma schema and the setup wizard's screens, and wait for my OK. Ask about anything unclear rather than guessing.
```

## Open decisions

Ranks, targets, channels and keys are no longer open questions: the setup wizard collects them. What's left:

- [ ] Vercel plan: decided — start on Hobby, upgrade to Pro only if a feature needs jobs more often than daily.
- [ ] Domain is moya-studios.xyz; confirm `api.`, `mod.` and `config.` subdomains suit you.
- [ ] Whether to keep any always-on extras, which decides if a VPS is needed at all.
- [ ] Who besides you can own the config dashboard (their Discord IDs go in the environment variable).
- [ ] Bot name and branding.

* [ ] Which Adonis version the game runs, so the plugin hooks the right help-request accept and close events.
* [ ] Which Discord server hosts it: a dedicated moderation server or the main one.
* [ ] Ban appeals open from day one, or wait for the moderation dashboard in Phase 4.
