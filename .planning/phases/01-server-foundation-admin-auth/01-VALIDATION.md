---
phase: 1
slug: server-foundation-admin-auth
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-04
audited: 2026-07-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already in repo, `package.json` line 27; existing tests at `src/lib/relay.test.ts`) |
| **Config file** | `vite.config.ts` (jsdom env, line 31) — server tests use `// @vitest-environment node` pragmas |
| **Quick run command** | `npx vitest run --reporter=dot --silent` |
| **Full suite command** | `npm run test` (tsc + eslint + vitest + build) |
| **Estimated runtime** | ~3 seconds (vitest only) / ~30–60 seconds (full `npm run test`) |

**Note:** `npm run test` runs `tsc --noEmit && eslint && vitest run --reporter=dot --silent && vite build`. Server-side tests run in Node env via `// @vitest-environment node` pragmas (no jsdom config change needed).

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot --silent` (fast — ~3s for the full suite)
- **After every plan wave:** Run `npm run test` (full pipeline including typecheck + lint + build)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds (vitest only) / 120 seconds (full `npm run test`)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 1 | SRV-02 | — | Repository CRUD isolates by `site_id` (cross-site reads/writes blocked) | integration | `npx vitest run server/db/sqlite.repository.test.ts` | ✅ | ✅ green |
| 01-01-02 | 01-01 | 1 | SRV-02 | — | Migration runner is idempotent (re-run is no-op; `schema_migrations` recorded) | integration | `npx vitest run server/db/migrations.test.ts` | ✅ | ✅ green |
| 01-01-03 | 01-01 | 1 | SRV-02 | — | WAL mode enabled after open (`PRAGMA journal_mode` returns `wal`) | integration | `npx vitest run server/db/sqlite.test.ts` | ✅ | ✅ green |
| 01-01-04 | 01-01 | 1 | SRV-02 | — | Online backup produces a valid, openable DB with same row count (even mid-write) | integration | `npx vitest run server/db/backup.test.ts` | ✅ | ✅ green |
| 01-02-01 | 01-02 | 1 | SRV-03 | T-01-02 | Valid NIP-98 from master → 200; missing header → 401; bad sig → 401; valid sig non-master → 403; fail-closed empty master → 401; fail-closed throwing master → 401 (WR-08) | unit+integration | `npx vitest run server/auth/nip98.test.ts` | ✅ | ✅ green |
| 01-02-02 | 01-02 | 1 | SRV-03 | T-01-02 | Expired (>60s) → 401; wrong URL → 401; wrong method → 401; payload tamper → 401 | unit | `npx vitest run server/auth/nip98.test.ts` | ✅ | ✅ green |
| 01-02-03 | 01-02 | 1 | SRV-03 | T-01-03 | Proxy URL reconstruction: `X-Forwarded-Proto`/`X-Forwarded-Host` → public URL matches `u` tag (the #1 bug risk) | unit | `npx vitest run server/auth/nip98.test.ts` | ✅ | ✅ green |
| 01-02-04 | 01-02 | 1 | SRV-03 | — | `resolveMasterPubkey`: env wins; nostr.json fetch fallback; fetch fail → fail closed (no allow-through) | unit (mock fetch) | `npx vitest run server/auth/master-pubkey.test.ts` | ✅ | ✅ green |
| 01-02-05 | 01-02 | 1 | SRV-01 | — | `GET /api/email/health` → 200 `{"ok":true}`, no auth, no DB details | integration | `npx vitest run server/routes/health.test.ts` | ✅ | ✅ green |
| 01-03-01 | 01-03 | 1 | SRV-01 | T-01-04 | ESLint guard: `src/` importing `resend`/`better-sqlite3`/`csv-parse`/`pg` or `server/*` (any depth, WR-06) → lint error; `server/` importing same → no error | unit (Linter-based) | `npx vitest run eslint-rules/__tests__/guard.test.ts` | ✅ | ✅ green |
| 01-03-02 | 01-03 | 1 | SRV-04 | — | `npm run server` starts the process; nginx snippet exists at `server/deploy/nginx.example.conf` with `client_max_body_size 10m` + `proxy_read_timeout 60s` + `EMAIL_PORT` placeholder | source assertion | `grep -c 'client_max_body_size 10m' server/deploy/nginx.example.conf` + `node -e "require('./package.json').scripts.server"` | ✅ | ✅ green |
| 01-04-01 | 01-04 | 1 | SRV-05 | — | `useEmailEnabled`: `VITE_EMAIL_ENABLED=true` → true; `=false` → false; unset + meta `true` → true; unset + meta absent → false | unit (jsdom) | `npx vitest run src/hooks/useEmailEnabled.test.ts` | ✅ | ✅ green |
| 01-04-02 | 01-04 | 1 | SRV-05 | — | Priority: env + meta both set → env wins (consistency with `getMasterPubkey`); string `"true"` coercion (WR-07 strict, case-insensitive) | unit (jsdom) | `npx vitest run src/hooks/useEmailEnabled.test.ts` | ✅ | ✅ green |
| 01-04-03 | 01-04 | 1 | SRV-05 | — | `AdminLayout.tsx` `navigation` array gates email nav entry on `useEmailEnabled()` (no email nav when false) | source assertion + unit | `grep -c 'useEmailEnabled' src/components/admin/AdminLayout.tsx` + `npx vitest run src/components/admin/AdminLayout.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The repo has vitest installed (`package.json` line 27) and one existing test (`src/lib/relay.test.ts` using `describe/it/expect`). Server-side tests need Node env (not jsdom). Wave 0 status:

- [x] `vite.config.ts` — `// @vitest-environment node` pragmas added to server test files (simpler, no config change)
- [x] `server/db/sqlite.repository.test.ts` — 15 tests for SRV-02 (repository CRUD, site_id isolation, status transitions, token invalidate-after-use, WR-02/WR-03 guards)
- [x] `server/db/migrations.test.ts` — 4 tests for SRV-02 (idempotency, ordering, schema_migrations recording, SQL-failure)
- [x] `server/db/backup.test.ts` — 6 tests for SRV-02 (online backup validity, backup-during-write, env vars, WR-04 timestamped filenames, 7-day rotation, WR-05 default path consistency)
- [x] `server/db/sqlite.test.ts` — 3 tests for SRV-02 (WAL, foreign_keys=ON, busy_timeout=5000)
- [x] `server/auth/nip98.test.ts` — 11 tests for SRV-03 (valid/missing/bad-sig/non-master/expired/wrong-url/wrong-method/payload-tamper/proxy-reconstruction/fail-closed-throwing WR-08)
- [x] `server/auth/master-pubkey.test.ts` — 10 tests for SRV-03 (env wins, nostr.json fallback, fetch-fail-closed, cache TTL, malformed JSON, missing names._)
- [x] `server/routes/health.test.ts` — 2 tests for SRV-01 (200 `{"ok":true}`, no auth, no DB details)
- [x] `src/hooks/useEmailEnabled.test.ts` — 12 tests for SRV-05 (env/meta priority, default false, WR-07 strict string coercion, case-insensitive)
- [x] `src/components/admin/AdminLayout.test.tsx` — tests for SRV-05 (nav gating on useEmailEnabled)
- [x] `eslint-rules/__tests__/guard.test.ts` — 9 Linter-based tests for SRV-01 (7 forbidden-import error cases + 2 no-error cases, WR-06 any-depth patterns)
- [x] `hono` + `@hono/node-server` deps installed
- [x] `better-sqlite3` dep installed
- [x] `@nostrify/nostrify` `NIP98` importable — confirmed via passing nip98.test.ts

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| nginx proxies `/api/email/health` to the Node service on a real relay box | SRV-04 | Requires a running nginx + relay box + deployed service | 1. Start `npm run server` on the relay box. 2. Add the `server/deploy/nginx.example.conf` snippet to the nginx server block (substitute `EMAIL_PORT`). 3. `sudo nginx -t && sudo systemctl reload nginx`. 4. `curl https://<relay-domain>/api/email/health` → expect `{"ok":true}`. |
| systemd unit keeps the service alive across a crash | SRV-04 | Requires a real systemd-managed deploy | 1. Install the systemd unit (from `server/deploy/`). 2. `sudo systemctl start nostr-cms-email`. 3. `kill -9 <pid>` the node process. 4. `sleep 2 && systemctl status nostr-cms-email` → expect active (restarted). |
| `email_enabled` toggleable at runtime via swarm-config without a frontend rebuild | SRV-05 | Requires a running swarm injecting the meta tag | 1. Build the SPA once. 2. Set `email_enabled: false` in swarm-config → reload page → no email nav. 3. Set `email_enabled: true` → reload (no rebuild) → email nav appears. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (vitest only) / 120s (full `npm run test`)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — 14/14 tasks covered, 93/93 tests green, 3 manual-only items deferred to deploy-time verification.

---

## Validation Audit 2026-07-05

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Audit result:** State A audit (VALIDATION.md existed but was stale — `status: draft`, all tasks marked `❌ W0` / `⬜ pending`). Post-execution the test suite was written and passing but the VALIDATION.md was never updated. Audit verified all 14 tasks have corresponding test files (10 test files, 93 tests, all green via `npx vitest run`). Updated all task statuses to `✅ green`, marked Wave 0 complete, set `nyquist_compliant: true`, `status: complete`. No auditor spawn needed — no gaps to fill.
