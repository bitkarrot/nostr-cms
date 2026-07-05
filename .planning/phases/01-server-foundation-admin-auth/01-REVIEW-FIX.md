---
phase: 1
status: fixed
date: 2026-07-04
scope: critical + warning
findings_fixed: 8
findings_skipped: 0
info_skipped: 5
commits: 9
verify: npm run test exit 0 (15 files, 93 tests — up from 83 baseline)
---

# Phase 1: Code Review Fix Report

**Scope:** Critical + Warning only (8 Warnings). 5 Info findings skipped per fix scope.
**Result:** 8/8 Warnings fixed. 0 skipped. Full `npm run test` green (exit 0).

## Per-Finding Status

### WR-01: Repository methods `getToken`, `invalidateToken`, `updateSendLog` NOT scoped by site_id — fixed

**Files changed:**
- `server/db/repository.ts` — added `siteId: string` first param to `getToken`, `invalidateToken`, `updateSendLog` in the `SubscriberRepository` interface.
- `server/db/sqlite.ts` — added `AND site_id = ?` to all three SQL statements; updated `createToken`'s internal `this.getToken(...)` call to pass `token.site_id`; `updateSendLog` WHERE clause now keys on `site_id` AND `id`.
- `server/db/sqlite.repository.test.ts` — updated existing callers; added cross-site isolation assertions: `getToken('B', token.id)` → null, `invalidateToken('B', ...)` is a no-op, `updateSendLog('B', ...)` does not mutate site A's row.

**Tests added:** cross-site isolation assertions on `getToken`, `invalidateToken`, `updateSendLog`.
**Verify:** `npx vitest run server/db/sqlite.repository.test.ts` — 15 passed.

### WR-02: `updateSendLog` interpolates column names — potential SQL injection — fixed

**Files changed:**
- `server/db/sqlite.ts` — added `ALLOWED_COLUMNS` set (`post_event_id`, `subject`, `recipient_count`, `sent_count`, `status`, `completed_at`); throws `Error("updateSendLog: unknown column ...")` on any key not in the allowlist (after skipping `id`/`site_id`). Values remain parameterized.
- `server/db/sqlite.repository.test.ts` — added test: a malicious key `"id = 'x'; DROP TABLE send_log--"` is rejected with `/unknown column/`, and the table still exists afterward (no injection).

**Tests added:** `updateSendLog rejects unknown column names (WR-02 SQL-injection guard)`.
**Verify:** `npx vitest run server/db/sqlite.repository.test.ts` — 15 passed.

### WR-03: segment LIKE filter — wildcard/quote injection — fixed

**Files changed:**
- `server/db/sqlite.ts` — both `listSubscribers` and `countSubscribers` now escape `%`, `_`, `"`, and `\` in `opts.segment` via `replace(/[%_"\\]/g, (c) => \\${c})` and add `ESCAPE '\\'` to the LIKE clause. The value remains parameterized (data-correctness fix, not SQL injection).
- `server/db/sqlite.repository.test.ts` — added test: a segment named `a%b` matches only the literal `a%b` subscriber, not `axb` (wildcard escaped); count agrees.

**Tests added:** `segment filter escapes LIKE wildcards and quotes (WR-03)`.
**Verify:** `npx vitest run server/db/sqlite.repository.test.ts` — 15 passed.

### WR-04: `runBackup` overwrites a single file — no real 7-day retention — fixed

**Files changed:**
- `server/db/backup.ts` — `runBackup` now writes `email.db.YYYY-MM-DD.bak` (timestamped, distinct per day); rotation loop matches `email.db.*.bak` (prefix + `.bak` suffix) and prunes files older than 7 days by mtime. Updated JSDoc.
- `server/db/backup.test.ts` — updated existing tests to expect the timestamped filename; added `produces a distinct timestamped file each run (WR-04)` test asserting the old fixed `email.db.bak` name is NOT produced; updated rotation test to use a timestamped stale file `email.db.2020-01-01.bak`.
- `server/README.md` — updated backups section: filename is now `email.db.YYYY-MM-DD.bak`, "true 7-day retention", rotation deletes `email.db.*.bak` files older than 7 days. Updated env-var table row for `EMAIL_BACKUP_DIR`.

**Tests added:** `produces a distinct timestamped file each run (WR-04)`; updated rotation test.
**Verify:** `npx vitest run server/db/backup.test.ts` — 6 passed.

### WR-05: `EMAIL_DB_PATH` default diverges (`/app/email.db` vs `./email.db`) — fixed

**Files changed:**
- `server/db/backup.ts` — exported `DEFAULT_EMAIL_DB_PATH = './email.db'` as the single source of truth; `runBackup` uses it.
- `server/index.ts` — imports `DEFAULT_EMAIL_DB_PATH` from `./db/backup` and uses it instead of a hardcoded string. Both files now resolve to the same default.
- `server/db/backup.test.ts` — added test asserting `DEFAULT_EMAIL_DB_PATH === './email.db'` and that `server/index.ts` imports successfully (no divergence).
- `server/deploy/email.env` — unchanged (already overrides to `/app/email.db` for prod, keeping prod at the absolute path).

**Tests added:** `is the same default used by server/index.ts (no divergence)`.
**Verify:** `npx vitest run server/db/backup.test.ts` — 6 passed.

### WR-06: ESLint `no-restricted-imports` pattern list has a depth ceiling — fixed

**Files changed:**
- `eslint.config.js` — expanded the `patterns.group` to cover any depth: added `**/server/*`, `**/../server/*`, `../../../../server/*`, `../../../../../server/*` alongside the existing shallow patterns. A 4+-deep `src/` file can no longer bypass the guard.
- `eslint-rules/__tests__/guard.test.ts` — mirrored the updated config; added two test cases: 4-level-deep (`../../../../server/db/sqlite`) and 5-level-deep (`../../../../../server/db/sqlite`) relative imports both produce lint errors.
- `server/db/sqlite.repository.test.ts` — fixed a misplaced `eslint-disable-next-line` directive (from WR-02 test) so `npx eslint` stays green.

**Tests added:** `src/ importing from server/* 4 levels deep` and `5 levels deep` → lint error.
**Verify:** `npx vitest run eslint-rules/__tests__/guard.test.ts` — 11 passed; `npx eslint` exit 0.

### WR-07: `getEmailEnabled` meta-tag path coerces `"false"` to true — fixed

**Files changed:**
- `src/lib/relay.ts` — meta path now uses strict coercion: `injected === true || (typeof injected === 'string' && injected.toLowerCase() === 'true')` (mirrors the env path). A string `"false"` no longer enables the module. Widened `SwarmConfig.email_enabled` type to `boolean | string` so the runtime string case (JSON.parse'd meta tag) type-checks.
- `src/hooks/useEmailEnabled.test.ts` — added 3 test cases: meta `{ email_enabled: "false" }` → false; meta `{ email_enabled: "true" }` → true; meta `{ email_enabled: "TRUE" }` → true (case-insensitive).

**Tests added:** `returns false when meta tag email_enabled is the string "false"`, `returns true ... "true"`, `returns true ... "TRUE"`.
**Verify:** `npx vitest run src/hooks/useEmailEnabled.test.ts` — 12 passed.

### WR-08: `masterResolver()` not try/catch-wrapped — throwing → 500 — fixed

**Files changed:**
- `server/middleware/nip98Auth.ts` — wrapped `opts.masterResolver()` call in try/catch; on throw returns 401 (fail-closed) instead of propagating an unhandled 500.
- `server/auth/nip98.test.ts` — added test: a resolver that throws (`Promise.reject(new Error('nostr.json fetch failed'))`) with a valid master signature → 401, not 500.

**Tests added:** `fail-closed: throwing master resolver -> 401 (WR-08, not 500)`.
**Verify:** `npx vitest run server/auth/nip98.test.ts` — 12 passed.

## Skipped Findings (Info — out of scope)

The 5 Info findings were NOT fixed per the fix scope (Critical + Warning only):

- **IN-01** through **IN-05** — documented in `01-REVIEW.md`. No action taken.

## Verification

**Full suite:** `npm run test` (tsc --noEmit + eslint + vitest run + vite build + server:check) — exit 0.
- Test files: 15 passed
- Tests: 93 passed (baseline was 83; +10 new tests across the 8 fixes)
- ESLint: 0 errors (1 pre-existing react-refresh warning in `AdminAuthContext.tsx`, unrelated)
- TypeScript: clean (client `tsc --noEmit` + `server:check`)
- Vite build: success

## Commits

1. `fix(01): WR-01 scope getToken/invalidateToken/updateSendLog by siteId`
2. `fix(01): WR-02 allowlist updateSendLog columns, reject unknown keys`
3. `fix(01): WR-03 escape LIKE wildcards/quotes in segment filter`
4. `fix(01): WR-04 timestamped backup filenames + real 7-day pruning`
5. `fix(01): WR-05 unify EMAIL_DB_PATH default via shared constant`
6. `fix(01): WR-06 deepen ESLint server-only import guard to any depth`
7. `fix(01): WR-07 strict coercion for getEmailEnabled meta path`
8. `fix(01): WR-07 widen SwarmConfig.email_enabled type to boolean|string`
9. `fix(01): WR-08 try/catch masterResolver, fail-closed 401 on throw`

No push performed. STATE.md not updated.
