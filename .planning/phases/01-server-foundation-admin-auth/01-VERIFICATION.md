---
phase: 1
status: human_needed
score: 5/5
date: 2026-07-04
---

# Phase 1: Server Foundation & Admin Auth — Verification

**Verifier:** gsd-verifier (goal-backward, adversarial)
**Method:** Codebase evidence only — SUMMARY.md claims treated as unverified until falsified.
**Test run:** `npm run test` → exit 0. `npx vitest run` → 15 files, 83 tests passed.

---

## Goal Achievement Assessment

**Phase goal:** "Stand up the Node/TS email service, the subscriber database (SQLite-first via a repository interface), and the admin auth seam so all later phases have a safe place to put secrets and logic. Nothing user-visible ships here."

**Verdict: ACHIEVED (codebase-verified).**

The vertical spine is standing:
- `server/` contains a real Hono app (`server/app.ts`) with a public health route and a NIP-98-gated admin router — not a stub.
- `server/db/repository.ts` defines a backend-agnostic `SubscriberRepository` interface with 16 async methods scoped by `siteId`; `server/db/sqlite.ts` implements it fully against `better-sqlite3` with WAL/foreign_keys/busy_timeout pragmas.
- `server/db/migrations/001.sqlite.sql` creates all 5 entity tables (subscribers, settings, verify_tokens, send_log, delivery_events) carrying `site_id`; `server/db/migrate.ts` is an idempotent runner recording `schema_migrations`.
- `server/auth/nip98.ts` + `server/middleware/nip98Auth.ts` enforce the 401/403 matrix using `@nostrify/nostrify` `NIP98.verify` (no hand-rolled crypto).
- `server/deploy/` ships the nginx snippet, systemd unit, env template, and README.
- `src/hooks/useEmailEnabled.ts` + `src/lib/relay.ts` `getEmailEnabled()` gate the email admin nav (default off).
- Nothing user-visible beyond a "coming soon" stub admin page and a gated nav entry — consistent with "nothing user-visible ships here."

---

## Requirement Traceability

| Req | Plan(s) | Status | Evidence |
|-----|---------|--------|----------|
| SRV-01 | 01-01, 01-02, 01-03 | VERIFIED | `server/index.ts` entry (EMAIL_PORT default 3001, Hono on @hono/node-server); `server/routes/health.ts` returns `{"ok":true}`; `eslint.config.js` `no-restricted-imports` block scoped to `src/**` forbids resend/better-sqlite3/csv-parse/pg + server/* paths; `eslint-rules/__tests__/guard.test.ts` (9 cases) verifies the guard fires on src fixtures and not on server fixtures; `server:check` wired into `npm run test`. |
| SRV-02 | 01-01 | VERIFIED | `server/db/repository.ts` interface (16 async methods, siteId-scoped); `server/db/sqlite.ts` `SqliteSubscriberRepository` (WAL via `db.pragma('journal_mode = WAL')`, foreign_keys=ON, busy_timeout=5000); `server/db/migrate.ts` idempotent runner; `server/db/migrations/001.sqlite.sql` 5 tables all with `site_id`; `server/db/backup.ts` online backup via `db.backup()` + 7-day rotation; `server/README.md` documents WAL + daily cron backup. `EMAIL_DB_BACKEND` selects backend (postgres branch stubbed for future). |
| SRV-03 | 01-02 | VERIFIED | `server/auth/nip98.ts` `verifyNip98` delegates to `NIP98.verify` (pure crypto via nostr-tools verifyEvent); `server/auth/master-pubkey.ts` `resolveMasterPubkey` reads `MASTER_PUBKEY` env → nostr.json `names._` fetch (fail-closed `''`); `server/middleware/nip98Auth.ts` enforces 401 (verify fail / empty master) + 403 (non-master); `server/routes/admin.ts` scaffold `/api/email/admin/ping` behind the middleware. 11 nip98 tests + 10 master-pubkey tests green. |
| SRV-04 | 01-03 | VERIFIED | `server/deploy/nginx.example.conf` `location /api/email/` with `proxy_pass http://127.0.0.1:${EMAIL_PORT}`; `server/deploy/nostr-cms-email.service` systemd unit (Restart=on-failure); `server/deploy/email.env` template; `npm run server` script = `tsx server/index.ts`. swarm repo is separate (`../swarm` outside nostr-cms git root) — not modified. |
| SRV-05 | 01-04 | VERIFIED | `src/lib/relay.ts` `getEmailEnabled()` (VITE_EMAIL_ENABLED env wins over swarm-config meta `email_enabled`, default false, string "true" coercion); `src/hooks/useEmailEnabled.ts` thin wrapper; `src/components/admin/AdminLayout.tsx` conditional spread `...(emailEnabled ? [{name:'Email',href:'/admin/email',icon:Mail}] : [])`; `src/AppRouter.tsx` `/admin/email` route; 9 useEmailEnabled tests + 2 AdminLayout gating tests green. |

---

## Success Criteria Checklist (ROADMAP Phase 1)

| SC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| SC1 | Node/TS service in `server/` responds to `/api/email/health`; server-only deps never importable from `src/` (ESLint guard enforced) | VERIFIED | `server/routes/health.ts` returns `{"ok":true}`; `health.test.ts` asserts 200 + single-key body; `eslint.config.js` src-scoped `no-restricted-imports` guard; `guard.test.ts` 9 cases; `npm run test` runs eslint + passes. |
| SC2 | `SubscriberRepository` interface + SQLite impl + migrations for subscribers/settings/verify_tokens/send_log/delivery_events (all `site_id`); WAL mode + online backup documented | VERIFIED | All 5 tables present in `001.sqlite.sql` with `site_id` columns; `openDatabase` sets WAL; `server/README.md` §"Online backups" documents daily cron + 7-day retention; `backup.test.ts` asserts same row count + backup-during-write. |
| SC3 | Admin endpoint rejects lacking NIP-98 (401), accepts valid NIP-98 from master pubkey (resolved from `VITE_MASTER_PUBKEY` or `nostr.json`) | VERIFIED | `nip98.test.ts`: missing header→401, tampered→401, non-master→403, valid master→200, expired→401, wrong URL/method→401, payload tamper→401, proxy reconstruction→200/401. `master-pubkey.test.ts`: env wins, nostr.json fetch, fail-closed (10 cases). Note: server reads `MASTER_PUBKEY` env (server analog of `VITE_MASTER_PUBKEY`) per AGENTS.md — `VITE_*` never read server-side. |
| SC4 | Long-running process + nginx routing `/api/email/*`; swarm not modified | VERIFIED (code) / HUMAN (deploy) | `server/deploy/nginx.example.conf` + `nostr-cms-email.service` systemd unit present and correct; swarm repo untouched. Real-box nginx reload + systemd restart test is manual (see Human Verification). |
| SC5 | `email_enabled` false (default) → no email nav/signup; true → surfaces appear; runtime toggle via swarm-config without rebuild | VERIFIED (code) / HUMAN (runtime toggle) | `getEmailEnabled()` default false; `AdminLayout.test.tsx` asserts no Email nav when false, Email nav present when true. Runtime swarm-config toggle without rebuild requires a running swarm injecting the meta tag (manual). |

---

## Decision Fidelity Check

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01 (EMAIL_PORT default 3001) | HONORED | `server/index.ts` `Number(process.env.EMAIL_PORT \|\| 3001)`; `server/deploy/email.env` `EMAIL_PORT=3001`; nginx snippet `${EMAIL_PORT}` placeholder. |
| D-02 (nginx in `server/deploy/` not swarm) | HONORED | `server/deploy/nginx.example.conf` lives in nostr-cms repo; swarm repo (`../swarm`) outside nostr-cms git root, unmodified. |
| D-03 (hardened snippet) | HONORED | nginx snippet includes `client_max_body_size 10m`, `proxy_read_timeout 60s`, forwarded headers (Host/X-Real-IP/X-Forwarded-For/X-Forwarded-Proto/X-Forwarded-Host); no `limit_req`/`limit_conn`; no WebSocket upgrade headers. |
| D-04 (health public `{"ok":true}` only) | HONORED | `server/routes/health.ts` `c.json({ ok: true }, 200)`; registered in `createApp` BEFORE admin auth middleware; `health.test.ts` asserts `Object.keys(body).sort() === ['ok']`. |

---

## Threat Mitigation Check

| Threat | Status | Evidence |
|--------|--------|----------|
| T-01-01 (site_id isolation) | MITIGATED | Every `SqliteSubscriberRepository` SELECT/UPDATE/DELETE includes `AND site_id = ?`; `sqlite.repository.test.ts` case "isolates by site_id — row under site A invisible to site B (T-01-01)" asserts getSubscriber/getSubscriberByEmail/listSubscribers under site B return null/empty for site A's row; `UNIQUE(site_id, email)` allows same email under different site_id. |
| T-01-02 (NIP-98 forgery/expiry) | MITIGATED | `verifyNip98` uses `NIP98.verify` (nostr-tools verifyEvent — pure Schnorr); checks kind 27235, u tag, method tag, created_at within 60s, payload SHA-256 for POST/PUT/PATCH; 11 test cases cover each reject path (401). |
| T-01-03 (proxy URL reconstruction) | MITIGATED | `publicRequest(c)` reconstructs URL from `X-Forwarded-Proto` + `X-Forwarded-Host`/`Host` + path; `nip98.test.ts` proxy cases: with X-Forwarded-* → 200, without → 401. nginx snippet sends both forwarded headers. |
| T-01-04 (server-only import leak) | MITIGATED | `eslint.config.js` `no-restricted-imports` scoped to `src/**` forbids resend/better-sqlite3/csv-parse/pg + server/* relative patterns; `guard.test.ts` 9 Linter-based cases; `npm run test` runs eslint so CI enforces it. |

---

## Hard Constraints Check (AGENTS.md)

| Constraint | Status | Evidence |
|------------|--------|----------|
| No PII on relays | VERIFIED | Subscriber PII lives only in SQLite (`server/db/`); no relay write code in server/; repository is the only PII store. |
| Secrets server-only, never `VITE_*` | VERIFIED | `MASTER_PUBKEY` (not `VITE_MASTER_PUBKEY`) read server-side in `master-pubkey.ts`; `email.env` notes RESEND_API_KEY deferred to Phase 2; `VITE_EMAIL_ENABLED` is a public UI flag (documented as such). |
| No swarm modification | VERIFIED | swarm is a separate repo outside nostr-cms git root; nginx snippet lives in `server/deploy/`; no swarm file paths in any commit. |
| Email opt-in default off | VERIFIED | `getEmailEnabled()` returns `false` when both env and meta unset; `AdminLayout.test.tsx` asserts no Email nav when false. |
| Server-only deps never in `src/` | VERIFIED | ESLint guard enforces; `npm run test` (which runs eslint) passes. |

---

## must_haves Verification

### Plan 01-01 must_haves

| Truth | Status | Evidence |
|-------|--------|----------|
| SubscriberRepository interface + SQLite impl (better-sqlite3) | VERIFIED | `server/db/repository.ts` + `server/db/sqlite.ts` |
| WAL mode enabled after open | VERIFIED | `openDatabase` `db.pragma('journal_mode = WAL')`; `sqlite.test.ts` asserts `pragma('journal_mode')` === 'wal' |
| Migration runner idempotent | VERIFIED | `migrate.ts` skips applied versions via `schema_migrations` set; `migrations.test.ts` re-run no-op case |
| Online backup produces valid openable file, same row count, mid-write | VERIFIED | `backup.test.ts` 4 cases (same row count, backup-during-write, env vars, 7-day rotation) |
| Server entry reads EMAIL_PORT (default 3001) + Hono on @hono/node-server | VERIFIED | `server/index.ts` |
| GET /api/email/health returns {"ok":true}, no auth, no DB details | VERIFIED | `health.ts` + `health.test.ts` single-key assertion |
| Server-only deps installed + server tests run in Node env | VERIFIED | `@vitest-environment node` pragmas in server tests; `src/test/setup.ts` window-guarded |

**Prohibitions (01-01):** No server-only dep in src/ (guard enforces) ✓; no PII on relays ✓; no DB details in health ✓; no DOM lib in server/tsconfig.json (`"lib": ["ESNext"]`, no DOM) ✓.

### Plan 01-02 must_haves

| Truth | Status | Evidence |
|-------|--------|----------|
| Valid NIP-98 from master → 200 | VERIFIED | `nip98.test.ts` "valid NIP-98 from master pubkey -> 200" |
| Missing Authorization → 401 | VERIFIED | test case green |
| Bad/tampered signature → 401 | VERIFIED | test case green |
| Valid sig non-master → 403 | VERIFIED | test case green |
| Expired >60s → 401 | VERIFIED | test case green |
| u tag / method tag mismatch → 401 | VERIFIED | test cases green |
| Proxy URL reconstruction (X-Forwarded-*) accepted; without → 401 | VERIFIED | proxy test cases green |
| resolveMasterPubkey: env → nostr.json → fail closed | VERIFIED | `master-pubkey.test.ts` 10 cases |
| Health remains public {"ok":true} | VERIFIED | registered before admin middleware in `createApp` |

**Prohibitions (01-02):** No admin endpoint without valid master NIP-98 ✓; no allow-through on fetch fail (fail-closed `''`→401) ✓; no VITE_ read server-side (uses `MASTER_PUBKEY`) ✓; no hand-rolled Schnorr (uses `NIP98.verify`) ✓.

### Plan 01-03 must_haves

| Truth | Status | Evidence |
|-------|--------|----------|
| src/ importing resend/better-sqlite3/csv-parse/pg → ESLint error | VERIFIED | `guard.test.ts` 7 error cases |
| src/ importing server/* → ESLint error | VERIFIED | guard test pattern case |
| server/ importing better-sqlite3 → no error | VERIFIED | guard test 2 no-error cases |
| nginx.example.conf with client_max_body_size 10m + proxy_read_timeout 60s + EMAIL_PORT placeholder | VERIFIED | `grep -c 'client_max_body_size 10m'` → 2; `${EMAIL_PORT}` in proxy_pass |
| npm run server starts Node process | VERIFIED | `package.json` scripts.server = `tsx server/index.ts` |
| server:check wired into test script | VERIFIED | `test` script ends `&& npm run server:check` |

**Prohibitions (01-03):** No swarm modification ✓; no nginx rate limiting ✓; no WebSocket upgrade headers ✓; no server-only package importable from src/ ✓.

### Plan 01-04 must_haves

| Truth | Status | Evidence |
|-------|--------|----------|
| useEmailEnabled true when VITE_EMAIL_ENABLED=true, false when =false | VERIFIED | `useEmailEnabled.test.ts` |
| Unset env + meta true → true | VERIFIED | test case |
| Both unset → false (default off) | VERIFIED | test case |
| Both set → env wins | VERIFIED | priority test cases (01-04-02) |
| "true" string coerces to true; others to false | VERIFIED | string coercion test cases |
| AdminLayout no email nav when false | VERIFIED | `AdminLayout.test.tsx` |
| AdminLayout email nav when true | VERIFIED | `AdminLayout.test.tsx` |

**Prohibitions (01-04):** No server-only dep in src/ ✓; no email nav when false ✓; no secret via VITE_EMAIL_ENABLED (public UI flag) ✓; no swarm repo modification ✓.

---

## Test Coverage

- **Total:** 15 test files, 83 tests, all green (`npx vitest run` exit 0).
- **Full pipeline:** `npm run test` (tsc + eslint + vitest + build + server:check) exit 0.
- **VALIDATION.md Per-Task Verification Map:** all 13 task IDs have corresponding test files and automated commands — all green.

| Test File | Tests | Covers |
|-----------|-------|--------|
| server/db/sqlite.repository.test.ts | 13 | SRV-02, T-01-01 |
| server/db/migrations.test.ts | 4 | SRV-02 |
| server/db/sqlite.test.ts | 3 | SRV-02 (WAL) |
| server/db/backup.test.ts | 4 | SRV-02 (backup) |
| server/auth/nip98.test.ts | 11 | SRV-03, T-01-02, T-01-03 |
| server/auth/master-pubkey.test.ts | 10 | SRV-03 |
| server/routes/health.test.ts | 2 | SRV-01, D-04 |
| eslint-rules/__tests__/guard.test.ts | 9 | SRV-01, T-01-04 |
| src/hooks/useEmailEnabled.test.ts | 9 | SRV-05 |
| src/components/admin/AdminLayout.test.tsx | 2 | SRV-05 |
| (existing pre-phase tests) | 16 | regression |

---

## Human Verification Items

These require manual testing on a real relay box / running swarm (per VALIDATION.md "Manual-Only Verifications") and cannot be automated in this environment:

1. **nginx proxies `/api/email/health` on a real relay box (SRV-04):** Start `npm run server` on the relay box, add the `server/deploy/nginx.example.conf` snippet to the nginx server block (substitute EMAIL_PORT), `sudo nginx -t && sudo systemctl reload nginx`, `curl https://<relay-domain>/api/email/health` → expect `{"ok":true}`.
2. **systemd unit keeps service alive across a crash (SRV-04):** Install the systemd unit, `sudo systemctl start nostr-cms-email`, `kill -9 <pid>`, `sleep 2 && systemctl status nostr-cms-email` → expect active (restarted).
3. **`email_enabled` runtime toggle via swarm-config without rebuild (SRV-05):** Build SPA once, set `email_enabled: false` in swarm-config → reload → no email nav; set `email_enabled: true` → reload (no rebuild) → email nav appears.

---

## Gaps Found

None. All must_haves verified, all requirements covered, all decisions honored, all threats mitigated, all hard constraints respected, all 83 tests green. The only outstanding items are the 3 manual-only verifications listed above (real-box nginx, systemd restart, runtime swarm-config toggle) — these are inherent to the deploy-target nature of SRV-04/SC5 and are explicitly listed in VALIDATION.md as Manual-Only.
