---
phase: 1
reviewed: 2026-07-04T18:25:00Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - eslint-rules/__tests__/guard.test.ts
  - eslint.config.js
  - package.json
  - server/app.ts
  - server/auth/master-pubkey.test.ts
  - server/auth/master-pubkey.ts
  - server/auth/nip98.test.ts
  - server/auth/nip98.ts
  - server/db/backup.test.ts
  - server/db/backup.ts
  - server/db/migrate.ts
  - server/db/migrations.test.ts
  - server/db/migrations/001.sqlite.sql
  - server/db/repository.ts
  - server/db/sqlite.repository.test.ts
  - server/db/sqlite.test.ts
  - server/db/sqlite.ts
  - server/deploy/email.env
  - server/deploy/nginx.example.conf
  - server/deploy/nostr-cms-email.service
  - server/deploy/README.md
  - server/index.ts
  - server/middleware/nip98Auth.ts
  - server/README.md
  - server/routes/admin.ts
  - server/routes/health.test.ts
  - server/routes/health.ts
  - server/tsconfig.json
  - src/AppRouter.tsx
  - src/components/admin/AdminEmail.tsx
  - src/components/admin/AdminLayout.test.tsx
  - src/components/admin/AdminLayout.tsx
  - src/hooks/useEmailEnabled.test.ts
  - src/hooks/useEmailEnabled.ts
  - src/lib/relay.ts
  - src/pages/admin/AdminEmailPage.tsx
  - src/test/setup.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 1: Code Review Report (Re-Audit)

**Reviewed:** 2026-07-04T18:25:00Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

This is a **re-audit** of Phase 1 after 8 warnings (WR-01 through WR-08) were fixed in commits `6dd5030..e5e224f`. The prior review's findings were re-verified against the current source, and the codebase was scanned for regressions or new issues introduced by the fixes.

**Fix verification: all 8 prior warnings are correctly fixed.**

- **WR-01** (scope getToken/invalidateToken/updateSendLog by siteId): ✅ Fixed. All three methods now take `siteId` as the first parameter and include `AND site_id = ?` in their SQL (`sqlite.ts:349-359`, `356-360`, `385-407`). The interface in `repository.ts:104-108` matches. Cross-site isolation tests in `sqlite.repository.test.ts:274,276,297` confirm site B cannot read/mutate site A's rows.
- **WR-02** (allowlist updateSendLog columns): ✅ Fixed. `ALLOWED_COLUMNS` set at `sqlite.ts:391-394` rejects unknown keys with a thrown error (`sqlite.ts:399-401`). Test at `sqlite.repository.test.ts:303-319` confirms a SQL-injection-style key is rejected and the table survives.
- **WR-03** (escape LIKE wildcards/quotes): ✅ Fixed. Both `listSubscribers` (`sqlite.ts:214`) and `countSubscribers` (`sqlite.ts:236`) escape `%`, `_`, `"`, `\` and add `ESCAPE '\\'`. Test at `sqlite.repository.test.ts:147-170` confirms `a%b` matches only the literal, not `axb`.
- **WR-04** (timestamped backups + 7-day pruning): ✅ Partially fixed — see WR-09 below for a residual same-day overwrite risk.
- **WR-05** (unify EMAIL_DB_PATH default): ✅ Fixed. `DEFAULT_EMAIL_DB_PATH` exported from `backup.ts:28`, imported by `index.ts:6,32`. Test at `backup.test.ts:148-161` confirms no divergence.
- **WR-06** (deepen ESLint guard to any depth): ✅ Fixed. The `**/server/*` glob pattern catches imports at any depth (verified empirically: 6, 7, and 10 levels deep all produce lint errors). The finite patterns up to 5 levels are redundant but harmless.
- **WR-07** (strict coercion for getEmailEnabled meta path): ✅ Fixed. `relay.ts:59` uses `injected === true || (typeof injected === 'string' && injected.toLowerCase() === 'true')`. `SwarmConfig.email_enabled` widened to `boolean | string` (`relay.ts:18`). Tests at `useEmailEnabled.test.ts:71-90` cover `"false"`, `"true"`, and `"TRUE"`.
- **WR-08** (try/catch masterResolver): ✅ Fixed. `nip98Auth.ts:43-50` wraps the resolver call in try/catch and returns 401 on throw. Test at `nip98.test.ts:172-184` confirms a throwing resolver yields 401, not 500.

**Full test suite:** 15 files, 93 tests, all passing.

The 5 Info findings from the prior review (IN-01 through IN-05) were not in scope for the fix and remain unchanged; they are not re-listed here. Two new warnings and four new info items were found during this re-audit.

## Warnings

### WR-09: `runBackup` timestamp granularity is day-level — same-day backups still overwrite (residual WR-04 risk)

**File:** `server/db/backup.ts:48`
**Issue:** The WR-04 fix stamps filenames with `YYYY-MM-DD` only (`new Date().toISOString().slice(0, 10)`), not the full `YYYYMMDD-HHMMSS` granularity recommended in the original finding. The test at `backup.test.ts:106-119` explicitly acknowledges this: "Two runs on the same day produce the same timestamped filename, so the file is overwritten within a day." This means the original data-loss scenario is only partially mitigated:

1. If the DB corrupts and an operator manually runs `npm run server:backup` on the same day as the last good automated backup, the good backup is overwritten with the corrupt state.
2. If the cron is accidentally configured to run more frequently than daily (e.g., hourly), same-day backups silently overwrite each other — only one backup per day survives.

The original WR-04 recommendation was `email.db.${YYYYMMDD-HHMMSS}.bak` (second-level granularity) to guarantee every run produces a distinct file. The day-level fix reduces but does not eliminate the overwrite risk.
**Fix:**
```ts
const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-').slice(0, 15); // YYYY-MM-DD-HHMM
// or simpler:
const now = new Date();
const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
const dest = join(backupDir, `email.db.${stamp}.bak`);
```
This guarantees every run produces a distinct file. The 7-day rotation loop already handles pruning by mtime, so more frequent backups just produce more files (all pruned after 7 days).

### WR-10: `createSendLog` and `recordDeliveryEvent` post-insert reads are NOT scoped by site_id (T-01-01 inconsistency)

**File:** `server/db/sqlite.ts:381`, `server/db/sqlite.ts:426`
**Issue:** After inserting a new row, both methods read it back with `SELECT * FROM send_log WHERE id = ?` (line 381) and `SELECT * FROM delivery_events WHERE id = ?` (line 426) — without `AND site_id = ?`. This is inconsistent with the T-01-01 mitigation pattern that every query keys on `site_id`. The `id` is a locally-generated `crypto.randomUUID()`, so there is no cross-site data leakage risk today (the id is not derived from untrusted input). However, the pattern is wrong: if a future refactor passes an externally-supplied id, or if UUID collision occurs (astronomically unlikely but the pattern should be defense-in-depth), the unscoped read would return the wrong site's row. The WR-01 fix scoped `getToken`'s post-insert read (`createToken` at line 344 calls `this.getToken(token.site_id, id)`), but `createSendLog` and `recordDeliveryEvent` were not updated symmetrically.
**Fix:**
```ts
// createSendLog (line 381):
const row = this.db.prepare('SELECT * FROM send_log WHERE site_id = ? AND id = ?').get(entry.site_id, id) as SendLogRow;

// recordDeliveryEvent (line 426):
const row = this.db.prepare('SELECT * FROM delivery_events WHERE site_id = ? AND id = ?').get(ev.site_id, id) as DeliveryEventRow;
```

## Info

### IN-06: Test description mismatch — `useEmailEnabled.test.ts:86` says "returns false" but asserts `true`

**File:** `src/hooks/useEmailEnabled.test.ts:86`
**Issue:** The test case description reads `returns false when meta tag email_enabled is the string "TRUE" (WR-07 case-insensitive true)` but the assertion at line 89 is `expect(getEmailEnabled()).toBe(true)`. The assertion is correct (`"TRUE"` should coerce to `true` case-insensitively), but the description says "false." This is a copy-paste error in the test description that could mislead a future reader into thinking the test proves the opposite behavior.
**Fix:** Change the description to `returns true when meta tag email_enabled is the string "TRUE" (WR-07 case-insensitive true)`.

### IN-07: `updateSendLog` silently skips `id` and `site_id` keys instead of rejecting them

**File:** `server/db/sqlite.ts:398`
**Issue:** The WR-02 allowlist fix throws on unknown column names, but `id` and `site_id` are silently skipped (`if (key === 'id' || key === 'site_id') continue;`) rather than rejected. This is a deliberate safety measure (preventing callers from mutating primary key / partition key), but it is inconsistent with the "reject unknown keys loudly" approach. A caller passing `site_id` in the patch gets a silent no-op on that key with no feedback. Not a bug — the behavior is safe — but the inconsistency could confuse a future maintainer.
**Fix:** Either add a comment explaining why `id`/`site_id` are silently skipped (not rejected), or reject them with the same `throw new Error(...)` pattern for consistency. The silent-skip is the safer choice; just document it.

### IN-08: WR-06 finite depth patterns are redundant — `**/server/*` already matches any depth

**File:** `eslint.config.js:69`
**Issue:** The WR-06 fix added `**/server/*` and `**/../server/*` alongside the existing finite patterns (`../../server/*` through `../../../../../server/*`). Empirical testing confirms that `**/server/*` alone catches relative imports at any depth (tested 6, 7, and 10 levels deep — all produce lint errors). The finite patterns are redundant dead config. This is not a bug (the guard works correctly), but the redundant entries add noise and imply the `**` patterns alone are insufficient when they are.
**Fix:** Remove the finite patterns, keeping only `**/server/*` and `**/../server/*`:
```js
group: ["**/server/*", "**/../server/*"],
```

### IN-09: `backup.test.ts:128` `staleStat` variable is assigned but never meaningfully used

**File:** `server/db/backup.test.ts:128,144`
**Issue:** The rotation test captures `const staleStat = statSync(stale)` at line 128 (before backdating) and then asserts `expect(staleStat).toBeDefined()` at line 144 with a comment "staleStat is just for linter." The variable serves no test purpose — it's only there to satisfy the `no-unused-vars` lint rule for the `statSync` import. The actual rotation assertion (`expect(existsSync(stale)).toBe(false)` at line 137) does not use `staleStat`.
**Fix:** Remove the `staleStat` variable and the `expect(staleStat).toBeDefined()` assertion. If the `statSync` import becomes unused, remove it from the import statement.

---

## Hard-constraint check (re-verified)

- **No swarm modification:** Confirmed — no swarm-repo files touched; the email service talks to swarm over HTTP (nostr.json fetch) only.
- **PII never on relays:** Confirmed — subscriber emails/PII live only in SQLite (`subscribers`, `verify_tokens`, `delivery_events` tables); no relay publish path exists in Phase 1.
- **Email opt-in default off:** Confirmed — `getEmailEnabled()` returns `false` when neither env nor meta is set; WR-07 fix ensures string `"false"` no longer enables the module; `useEmailEnabled` gates the nav; the server is a separate opt-in process.
- **Server-only deps never in `src/`:** Confirmed — WR-06 fix verified empirically: `**/server/*` glob catches imports at any depth (tested up to 10 levels). The four server-only packages (`resend`, `better-sqlite3`, `csv-parse`, `pg`) are all guarded.
- **Secrets server-only:** Confirmed — no `VITE_` secret vars; `RESEND_API_KEY` deferred to Phase 2; `email.env` contains no secrets.

_Reviewed: 2026-07-04T18:25:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
