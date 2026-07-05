---
phase: 1
slug: server-foundation-admin-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-04
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already in repo, `package.json` line 27; existing tests at `src/lib/relay.test.ts`) |
| **Config file** | `vite.config.ts` (jsdom env, line 31) — server tests need a Node env, see Wave 0 |
| **Quick run command** | `npm run test` (full pipeline: tsc + eslint + vitest + build) — for fast iteration use `npx vitest run --reporter=dot --silent` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30–60 seconds (small phase; mostly unit + integration against in-memory SQLite) |

**Note:** `npm run test` runs `tsc --noEmit && eslint && vitest run --reporter=dot --silent && vite build`. For tight feedback loops during execution, `npx vitest run` alone is faster (skips tsc/eslint/build). Server-side tests run in Node env (not jsdom) — see Wave 0 for the vitest config tweak.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot --silent` (fast — ~10–20s for the new tests)
- **After every plan wave:** Run `npm run test` (full pipeline including typecheck + lint + build)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds (vitest only) / 120 seconds (full `npm run test`)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 1 | SRV-02 | — | Repository CRUD isolates by `site_id` (cross-site reads/writes blocked) | integration | `npx vitest run server/db/sqlite.repository.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01-01 | 1 | SRV-02 | — | Migration runner is idempotent (re-run is no-op; `schema_migrations` recorded) | integration | `npx vitest run server/db/migrations.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01-01 | 1 | SRV-02 | — | WAL mode enabled after open (`PRAGMA journal_mode` returns `wal`) | integration | `npx vitest run server/db/sqlite.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01-01 | 1 | SRV-02 | — | Online backup produces a valid, openable DB with same row count (even mid-write) | integration | `npx vitest run server/db/backup.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 01-02 | 1 | SRV-03 | T-01-01 | Valid NIP-98 from master → 200; missing header → 401; bad sig → 401; valid sig non-master → 403 | unit+integration | `npx vitest run server/auth/nip98.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 01-02 | 1 | SRV-03 | T-01-02 | Expired (>60s) → 401; wrong URL → 401; wrong method → 401; payload tamper → 401 | unit | `npx vitest run server/auth/nip98.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-03 | 01-02 | 1 | SRV-03 | T-01-03 | Proxy URL reconstruction: `X-Forwarded-Proto`/`X-Forwarded-Host` → public URL matches `u` tag (the #1 bug risk) | unit | `npx vitest run server/auth/nip98.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-04 | 01-02 | 1 | SRV-03 | — | `resolveMasterPubkey`: env wins; nostr.json fetch fallback; fetch fail → fail closed (no allow-through) | unit (mock fetch) | `npx vitest run server/auth/master-pubkey.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-05 | 01-02 | 1 | SRV-01 | — | `GET /api/email/health` → 200 `{"ok":true}`, no auth, no DB details | integration | `npx vitest run server/routes/health.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 01-03 | 1 | SRV-01 | T-01-04 | ESLint guard: `src/` importing `resend`/`better-sqlite3`/`csv-parse`/`pg` or `server/*` → lint error; `server/` importing same → no error | unit (ESLint fixture) | `npx eslint src/__fixtures__/guard-violation.ts --expect-error` (or RuleTester) | ❌ W0 | ⬜ pending |
| 01-03-02 | 01-03 | 1 | SRV-04 | — | `npm run server` starts the process; nginx snippet exists at `server/deploy/nginx.example.conf` with `client_max_body_size 10m` + `proxy_read_timeout 60s` + `EMAIL_PORT` placeholder | source assertion | `grep -c 'client_max_body_size 10m' server/deploy/nginx.example.conf` + `node -e "require('./package.json').scripts.server"` | ❌ W0 | ⬜ pending |
| 01-04-01 | 01-04 | 1 | SRV-05 | — | `useEmailEnabled`: `VITE_EMAIL_ENABLED=true` → true; `=false` → false; unset + meta `true` → true; unset + meta absent → false | unit (jsdom) | `npx vitest run src/hooks/useEmailEnabled.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-02 | 01-04 | 1 | SRV-05 | — | Priority: env + meta both set → env wins (consistency with `getMasterPubkey`); string `"true"` coercion | unit (jsdom) | `npx vitest run src/hooks/useEmailEnabled.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-03 | 01-04 | 1 | SRV-05 | — | `AdminLayout.tsx` `navigation` array gates email nav entry on `useEmailEnabled()` (no email nav when false) | source assertion + unit | `grep -c 'useEmailEnabled' src/components/admin/AdminLayout.tsx` + `npx vitest run src/components/admin/AdminLayout.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The repo has vitest installed (`package.json` line 27) and one existing test (`src/lib/relay.test.ts` using `describe/it/expect`). Server-side tests need Node env (not jsdom). Wave 0 must:

- [ ] `vite.config.ts` — add a Node-environment project or `environmentMatchGlobs` entry so `server/**/*.test.ts` runs in Node (not jsdom). Alternatively, add `// @vitest-environment node` pragmas to server test files (simpler, no config change).
- [ ] `server/db/sqlite.repository.test.ts` — stubs for SRV-02 (repository CRUD, site_id isolation, status transitions, token invalidate-after-use)
- [ ] `server/db/migrations.test.ts` — stubs for SRV-02 (idempotency, ordering, schema_migrations recording)
- [ ] `server/db/backup.test.ts` — stubs for SRV-02 (online backup validity, backup-during-write)
- [ ] `server/auth/nip98.test.ts` — stubs for SRV-03 (valid/missing/bad-sig/non-master/expired/wrong-url/wrong-method/payload-tamper/proxy-reconstruction)
- [ ] `server/auth/master-pubkey.test.ts` — stubs for SRV-03 (env wins, nostr.json fallback, fetch-fail-closed)
- [ ] `server/routes/health.test.ts` — stubs for SRV-01 (200 `{"ok":true}`, no auth, no DB details)
- [ ] `src/hooks/useEmailEnabled.test.ts` — stubs for SRV-05 (env/meta priority, default false, string coercion)
- [ ] ESLint guard test fixture — `src/__fixtures__/guard-violation.ts` (or `eslint-rules/__tests__/guard.test.ts` using RuleTester) for SRV-01
- [ ] `hono` + `@hono/node-server` deps installed (server framework — needed for health + auth integration tests)
- [ ] `better-sqlite3` dep installed (needed for SQLite integration tests)
- [ ] `@nostrify/nostrify` already in `package.json` — confirm `NIP98` is importable from the installed version; if not, add `nostr-tools` `verifyEvent` import explicitly

*If any dep is missing, Wave 0 of plan 01-01 or 01-02 installs it.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| nginx proxies `/api/email/health` to the Node service on a real relay box | SRV-04 | Requires a running nginx + relay box + deployed service | 1. Start `npm run server` on the relay box. 2. Add the `server/deploy/nginx.example.conf` snippet to the nginx server block (substitute `EMAIL_PORT`). 3. `sudo nginx -t && sudo systemctl reload nginx`. 4. `curl https://<relay-domain>/api/email/health` → expect `{"ok":true}`. |
| systemd unit keeps the service alive across a crash | SRV-04 | Requires a real systemd-managed deploy | 1. Install the systemd unit (from `server/deploy/`). 2. `sudo systemctl start nostr-cms-email`. 3. `kill -9 <pid>` the node process. 4. `sleep 2 && systemctl status nostr-cms-email` → expect active (restarted). |
| `email_enabled` toggleable at runtime via swarm-config without a frontend rebuild | SRV-05 | Requires a running swarm injecting the meta tag | 1. Build the SPA once. 2. Set `email_enabled: false` in swarm-config → reload page → no email nav. 3. Set `email_enabled: true` → reload (no rebuild) → email nav appears. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (vitest only) / 120s (full `npm run test`)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
