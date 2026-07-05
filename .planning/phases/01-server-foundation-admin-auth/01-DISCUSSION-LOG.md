# Phase 1: Server Foundation & Admin Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 01-server-foundation-admin-auth
**Areas discussed:** Port + nginx config location

---

## Port + nginx config location

### Question 1: Email service port

| Option | Description | Selected |
|--------|-------------|----------|
| 3001 | Common Node app port, no known conflict with swarm/nginx/vite. Memorable. | |
| 3100 | Less commonly used, leaves 3001 free if you run other Node tools. Slightly less "default". | |
| 4001 | Clearly separated from the 3xxx Node range; signals "this is the email service, not the relay". | |
| Env-configurable (default 3001) | Pick at install time via an env var (e.g. `EMAIL_PORT`, default 3001). nginx block uses a placeholder. More flexible, slightly more install friction. | ✓ |

**User's choice:** Env-configurable (default 3001)
**Notes:** Port selected via `EMAIL_PORT` env var; nginx snippet uses `${EMAIL_PORT}` placeholder. Default 3001 avoids conflicts with nginx (80/443), swarm WS (3334), Vite dev (8080).

---

### Question 2: nginx config location

| Option | Description | Selected |
|--------|-------------|----------|
| Static snippet in server/ | A static reference snippet in `server/deploy/nginx.example.conf` (or `.md`) that the installer copy-pastes into their nginx server block. Simple, explicit, no runtime magic. Uses `$EMAIL_PORT` placeholder they substitute. | ✓ |
| Printed on first run | The email service prints the exact nginx block (with the resolved `EMAIL_PORT`) to stdout on first run, so the installer copies from the log. Less to remember, but requires running the service once before nginx is configured. | |
| Both (snippet + printed) | Static snippet in `server/deploy/` is the source of truth, AND the service prints it on first run for convenience. Belt-and-suspenders; tiny extra code. | |

**User's choice:** Static snippet in server/
**Notes:** Per `AGENTS.md`, swarm is a separate repo and is not modified for email features — so the nginx config belongs to nostr-cms. Installer copy-pastes the snippet into their existing nginx server block.

---

### Question 3: nginx hardening level

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal (proxy only) | Just `proxy_pass` + standard forwarded headers (Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto). Smallest snippet. CSV upload size limit and timeout tuning happen later when Phase 4 ships. | |
| Hardened (size + timeout) | Add `client_max_body_size 10m` (covers future CSV uploads) + `proxy_read_timeout 60s` now, so installers don't have to revisit nginx in Phase 4. Slightly larger snippet, forward-looking. | ✓ |
| Minimal + commented future | Minimal proxy now, but the snippet is structured with commented sections (`# CSV upload: uncomment in Phase 4`) so the future hardening is documented but inactive. Best of both, slightly more to read. | |

**User's choice:** Hardened (size + timeout)
**Notes:** Forward-looking hardening preferred — write the nginx snippet once and don't touch it again. `client_max_body_size 10m` covers Phase 4 CSV uploads; `proxy_read_timeout 60s` covers slow admin operations. No nginx-level rate limiting (server-side token bucket in Phase 5). No WebSocket upgrade headers (email API is HTTP-only).

---

### Question 4: Health route exposure

| Option | Description | Selected |
|--------|-------------|----------|
| External (proxied, public) | `/api/email/health` is proxied through nginx like the rest of `/api/email/*`. External uptime monitors (UptimeRobot, etc.) can hit it. Returns minimal JSON `{"ok":true}` — no secrets, no DB details. Simplest monitoring. | ✓ |
| Localhost-only | `/api/email/health` is NOT proxied; only reachable via `curl http://127.0.0.1:$EMAIL_PORT/api/email/health` on the relay box. Monitoring must run locally (cron + alert script). More private, slightly more monitoring setup. | |
| Both (public + admin) | Two health endpoints: `/api/email/health` (public, proxied, returns `{"ok":true}`) and `/api/email/admin/health` (NIP-98 auth, returns DB + config status). Public for uptime, admin for deep checks. | |

**User's choice:** External (proxied, public) — go with recommendation
**Notes:** User initially answered "i'm not sure" via Other. Claude recommended External (proxied) because: swarm already exposes `/api/*` through nginx (same pattern); `{"ok":true}` leaks nothing; creators typically use external uptime monitors; deep admin health endpoint deferred to Phase 2 when settings exist. User accepted the recommendation.

---

## Claude's Discretion

The following gray areas were identified but deferred to research/planning discretion (user did not select them for discussion):

- **Process supervisor** — how `npm run server` stays alive in production (systemd vs PM2 vs docker vs bare node). Research locks "long-running process"; supervisor choice is an ops detail.
- **SQLite DB file path + backup cadence** — `/app/email.db` (or configured path); online backup via `better-sqlite3` `backup` API; schedule/destination/retention TBD by planner.
- **`useEmailEnabled()` priority** — env vs meta tag priority when both set; follow `getMasterPubkey` pattern (env wins) for consistency; default off when neither set.
- **NIP-98 verification library** — `@nostrify/nostrify` vs `nostr-tools` vs `@noble/curves` for server-side pure-crypto verification.
- **SQLite migrations approach** — raw SQL with a tiny runner vs a library; research implies hand-rolled dialect-specific SQL.
- **Server framework** — Express/Fastify/Hono/bare http; technical impl detail.
- **ESLint guard mechanism** — custom rule (extending `eslint-rules/index.js`) vs `no-restricted-imports` vs `eslint-plugin-import` no-restricted-paths.

## Deferred Ideas

- **Process supervisor choice** — deferred to planning/research discretion.
- **SQLite DB path + backup cadence** — deferred to planning discretion (suggested defaults: `EMAIL_DB_PATH` env var default `/app/email.db`; daily online backup to `/app/backups/email.db.bak`; 7-day retention).
- **`useEmailEnabled()` env-vs-meta priority** — deferred to planning discretion (suggested: follow `getMasterPubkey` pattern; env wins over meta tag; default off).
- **Deep admin health endpoint (DB + config status)** — deferred to Phase 2 when settings exist.
- **swarm install script `--with-email`/`--without-email` flag** — lives in the swarm repo (separate), not nostr-cms. Out of scope per `AGENTS.md`.
