# Phase 1: Server Foundation & Admin Auth - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the Node/TS email service in `nostr-cms/server/`, the SQLite-first `SubscriberRepository` + migrations, NIP-98 admin auth verified in Node, nginx routing for `/api/email/*`, the ESLint guard forbidding `server/`-only imports under `src/`, and the `useEmailEnabled()` toggle that gates all email UI. **Nothing user-visible ships here** — this is the vertical spine that all later phases build on. The service responds to `/api/email/health`, the repository interface exists with a SQLite implementation, admin endpoints reject unsigned/non-master requests and accept valid NIP-98 from the master pubkey, and the email module is opt-in (default off) at install time.

</domain>

<decisions>
## Implementation Decisions

### Port + nginx routing
- **D-01:** The email service listens on an env-configurable port, default **3001**, selected via `EMAIL_PORT` env var. nginx proxies `/api/email/*` to `127.0.0.1:${EMAIL_PORT}`. Default 3001 avoids conflicts with nginx (80/443), swarm's default WS relay (3334 per `src/lib/relay.ts`), and Vite dev (8080). Installers who need a different port set `EMAIL_PORT` and substitute in the nginx snippet.
- **D-02:** The nginx `location /api/email/` block lives as a **static reference snippet in `server/deploy/`** inside the nostr-cms repo (e.g. `server/deploy/nginx.example.conf`). The installer copy-pastes it into their existing nginx server block. Per `AGENTS.md`, swarm is a separate repo and is **not modified** for email features — so the nginx config belongs to nostr-cms, not swarm's `install-meetup-space.sh`. The snippet uses a `${EMAIL_PORT}` placeholder the installer substitutes.
- **D-03:** The nginx snippet is **hardened up front**, not minimal: it includes `client_max_body_size 10m` (covers future Phase 4 CSV uploads so installers don't revisit nginx later) and `proxy_read_timeout 60s` (covers slow admin operations), plus standard forwarded headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`). No nginx-level rate limiting — rate limiting is server-side token bucket (Phase 5). No WebSocket upgrade headers — the email API is HTTP-only.
- **D-04:** `/api/email/health` is **external (proxied through nginx, public, no auth)** and returns minimal `{"ok":true}` JSON with no secrets, no DB details, no subscriber counts. This matches how swarm already exposes `/api/*` through nginx and lets creators use external uptime monitors (UptimeRobot, BetterStack). A deeper admin health endpoint (DB + config status) is **deferred to Phase 2** when settings exist — Phase 1 only needs "is the process up?".

### Claude's Discretion
The following gray areas were identified but left to research/planning discretion (not user-locked):
- **Process supervisor** — how `npm run server` stays alive in production (systemd vs PM2 vs docker vs bare node). Research locks "long-running process" but the supervisor choice is an ops detail the planner can recommend based on the relay box's existing setup. User expressed no preference.
- **SQLite DB file path + backup cadence** — research suggests `/app/email.db` (or configured path) next to Badger, with online backup via `better-sqlite3`'s `backup` API. The exact path, backup schedule (cron daily/hourly), destination, and retention are ops details the planner can default (e.g. `EMAIL_DB_PATH` env var, default `/app/email.db`; daily backup to `/app/backups/email.db.bak` with 7-day retention).
- **`useEmailEnabled()` priority** — when both `VITE_EMAIL_ENABLED` (build-time) and `email_enabled` in the swarm-config meta tag (runtime) are set, which wins. The existing `getMasterPubkey` pattern in `src/lib/relay.ts` lets env win over meta tag; the planner should follow the same pattern for consistency unless research surfaces a reason to diverge. Default when neither is set: **off** (per SRV-05).
- **NIP-98 verification library** — `@nostrify/nostrify` and `nostr-tools` are both already in the codebase; the planner/researcher picks the right one for server-side pure-crypto verification.
- **SQLite migrations approach** — raw SQL migrations with a tiny runner vs a library; research implies hand-rolled dialect-specific SQL (`001.sqlite.sql`, `001.postgres.sql`).
- **Server framework** — Express/Fastify/Hono/bare http; technical impl detail for the planner.
- **ESLint guard mechanism** — the codebase already has custom ESLint rules at `eslint-rules/index.js`; the planner can add a `no-restricted-imports` or custom rule forbidding `resend`/`better-sqlite3`/`csv-parse` under `src/`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project planning
- `.planning/PROJECT.md` — project context, core value, key decisions (email via Resend, Node/TS service, SQLite-first, swarm untouched)
- `.planning/REQUIREMENTS.md` — SRV-01 through SRV-05 are the Phase 1 requirements
- `.planning/ROADMAP.md` §"Phase 1: Server Foundation & Admin Auth" — goal, success criteria, 4 plan list
- `.planning/STATE.md` §"Accumulated Context" — locked decisions (server layer, DB, auth pattern, opt-in gating)

### Research
- `.planning/research/SUMMARY.md` — executive summary + stack/architecture/pitfalls findings
- `.planning/research/ARCHITECTURE.md` — target architecture diagram, component boundaries, data model, auth model, deploy model, install-time opt-out
- `.planning/research/PITFALLS.md` — P1 (secrets in client bundle), P6 (SQLite WAL + online backup), P9 (DB backend drift), P11 (test coverage) are most relevant to Phase 1

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — SPA layer overview, provider-per-feature pattern
- `.planning/codebase/INTEGRATIONS.md` — swarm `/api` integration, admin auth via `useRemoteNostrJson`, env vars
- `.planning/codebase/CONVENTIONS.md` — frontend conventions (path alias `@/*`, shadcn/ui, TanStack Query)

### Existing code to mirror (from codebase scout)
- `src/hooks/useScheduledPosts.ts` — the `fetchWithNip98` pattern (kind 27235 event, base64 token, `Authorization: Nostr <token>` header) the SPA reuses for admin email endpoints
- `src/lib/relay.ts` — `getMasterPubkey()` (env var `VITE_MASTER_PUBKEY` → swarm-config meta tag priority) and `getSwarmConfig()` (`<meta name="swarm-config">` JSON parse) patterns to mirror in `useEmailEnabled()`
- `src/hooks/useRemoteNostrJson.ts` — `useAdminAuth` (master pubkey from `nostr.json` `names._` entry) — the SPA-side pattern the server-side NIP-98 + master check parallels
- `eslint.config.js` + `eslint-rules/index.js` — existing custom ESLint rule setup; the `server/`-only import guard extends this
- `src/components/admin/AdminLayout.tsx` — the admin sidebar `navigation` array where the email admin nav entry will be gated by `useEmailEnabled()`
- `src/AppRouter.tsx` — route registration pattern for the (Phase 2+) email admin pages

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchWithNip98` in `src/hooks/useScheduledPosts.ts` — the SPA-side NIP-98 fetch wrapper (kind 27235, base64 token, `Authorization: Nostr <token>` header). New admin email hooks (`useEmailSettings`, `useEmailSubscribers`) reuse this pattern; the server-side verifier in `server/auth/nip98.ts` must accept the same token format.
- `getMasterPubkey()` + `getSwarmConfig()` in `src/lib/relay.ts` — the env-var-over-meta-tag config resolution pattern. `useEmailEnabled()` mirrors this for `VITE_EMAIL_ENABLED` / `email_enabled`.
- `useAdminAuth` in `src/hooks/useRemoteNostrJson.ts` — resolves master pubkey from `nostr.json` `names._`. The server-side master check parallels this by fetching `/.well-known/nostr.json` over HTTP.
- `eslint-rules/index.js` — existing custom ESLint rule infrastructure. The `server/`-only import guard adds a rule here (or uses `no-restricted-imports`).
- shadcn/ui + react-hook-form + zod + TanStack Query — reused for all future email admin/public UI (Phase 2+).

### Established Patterns
- **Provider-per-feature + Context-based state** — `AppProvider`, `NostrProvider`, `AdminAuthContext`. The email feature adds `useEmailEnabled()` (a hook, not necessarily a provider) gated on the config flag.
- **Nostr-as-database** — CMS content stays on relays; the email service reads post events from the relay as a WS client (Phase 5). Subscriber PII never touches relays (hard constraint).
- **`<meta name="swarm-config">` runtime config** — avoids CSP inline-script violations; `email_enabled` joins `masterPubkey`/`relayName` in this JSON.
- **Path alias `@/*` → `./src/*`** — frontend-only; `server/` uses relative or its own tsconfig paths.
- **Admin page convention** — `src/components/admin/Admin[Feature].tsx` + thin wrapper `src/pages/admin/Admin[Feature]Page.tsx` + route in `src/AppRouter.tsx` + sidebar entry in `AdminLayout.tsx`. Phase 1 only adds the sidebar gating hook, not pages.

### Integration Points
- **nginx** — adds `location /api/email/ { proxy_pass http://127.0.0.1:${EMAIL_PORT}; ... }` as a sibling to the existing `location /api/` (nginx longest-prefix-match routes `/api/email/*` to the Node service, everything else under `/api/` to swarm). Snippet lives in `server/deploy/nginx.example.conf`.
- **swarm** — untouched. The email service fetches `/.well-known/nostr.json` over HTTP for master-pubkey verification and reads post events as a WS client. No code dependency on swarm.
- **SPA** — `useEmailEnabled()` hook gates the email admin nav entry in `AdminLayout.tsx`'s `navigation` array (and, in Phase 3, the public `SignupModule`). No email UI renders when false.
- **Vite build** — `server/` is excluded from the Vite client build; `npm run server` is a separate Node entry point. Server-only deps (`resend`, `better-sqlite3`, `csv-parse`) are never imported from `src/` (ESLint guard).

</code_context>

<specifics>
## Specific Ideas

- The nginx snippet should be a drop-in reference file the installer copies, not something auto-generated or printed at runtime — explicit and static is preferred over "magic".
- Forward-looking hardening in the nginx snippet (10MB body limit, 60s read timeout) is preferred over a minimal snippet that installers have to revisit in Phase 4 — even though Phase 1 has no CSV uploads, the snippet should be written once and not touched again.
- The health endpoint should leak nothing — just `{"ok":true}`. Deep status (DB reachable, config loaded) belongs behind admin auth in Phase 2.

</specifics>

<deferred>
## Deferred Ideas

- **Process supervisor choice (systemd/PM2/docker/bare node)** — deferred to planning/research discretion. User expressed no preference; the planner should recommend based on the relay box's existing process model (swarm is already a long-running Go process there).
- **SQLite DB path + backup cadence** — deferred to planning discretion. Suggested defaults: `EMAIL_DB_PATH` env var (default `/app/email.db`), daily online backup via `better-sqlite3` `backup` API to `/app/backups/email.db.bak`, 7-day retention. Planner to confirm.
- **`useEmailEnabled()` env-vs-meta priority** — deferred to planning discretion. Suggested: follow `getMasterPubkey` pattern (env wins over meta tag) for consistency; default off when neither set.
- **Deep admin health endpoint (DB + config status)** — deferred to Phase 2 when settings exist.
- **swarm install script `--with-email`/`--without-email` flag** — lives in the swarm repo (separate), not nostr-cms. Out of scope for this repo per `AGENTS.md`. Documented as a follow-up in the swarm repo's install template.

</deferred>

---

*Phase: 01-server-foundation-admin-auth*
*Context gathered: 2026-07-04*
