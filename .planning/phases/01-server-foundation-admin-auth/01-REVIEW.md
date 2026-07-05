---
phase: 1
status: fixed
date: 2026-07-04
depth: standard
files_reviewed: 31
files_reviewed_list:
  - server/index.ts
  - server/app.ts
  - server/tsconfig.json
  - server/README.md
  - server/db/repository.ts
  - server/db/sqlite.ts
  - server/db/migrate.ts
  - server/db/migrations/001.sqlite.sql
  - server/db/backup.ts
  - server/db/sqlite.repository.test.ts
  - server/db/migrations.test.ts
  - server/db/sqlite.test.ts
  - server/db/backup.test.ts
  - server/routes/health.ts
  - server/routes/health.test.ts
  - server/routes/admin.ts
  - server/auth/nip98.ts
  - server/auth/nip98.test.ts
  - server/auth/master-pubkey.ts
  - server/auth/master-pubkey.test.ts
  - server/middleware/nip98Auth.ts
  - server/deploy/nginx.example.conf
  - server/deploy/nostr-cms-email.service
  - server/deploy/email.env
  - server/deploy/README.md
  - src/lib/relay.ts
  - src/hooks/useEmailEnabled.ts
  - src/hooks/useEmailEnabled.test.ts
  - src/components/admin/AdminLayout.tsx
  - src/components/admin/AdminLayout.test.tsx
  - src/components/admin/AdminEmail.tsx
  - src/pages/admin/AdminEmailPage.tsx
  - src/AppRouter.tsx
  - src/test/setup.ts
  - eslint.config.js
  - eslint-rules/__tests__/guard.test.ts
  - package.json
findings:
  critical: 0
  warning: 8
  info: 5
  total: 13
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-04
**Depth:** standard
**Files Reviewed:** 31
**Status:** findings_found

## Summary

Phase 1 stands up the email service foundation: SQLite repository with site_id isolation, idempotent migrations, WAL mode, online backup, NIP-98 admin auth with proxy-URL reconstruction, master-pubkey fail-closed resolution, an ESLint server-only-import guard, nginx/systemd deploy artifacts, and the SPA `useEmailEnabled` gating hook.

The security-critical seams are **sound**: NIP-98 verification is delegated to `@nostrify/nostrify`'s `NIP98.verify` (pure Schnorr via `nostr-tools` `verifyEvent`, 60s `maxAge` default, payload digest check) — no hand-rolled crypto. The 401/403 matrix is correct (missing/bad sig/expiry/wrong-url → 401; valid sig non-master → 403; empty master → 401 fail-closed). Master-pubkey resolution is fail-closed on every error path (fetch reject, non-200, malformed JSON, missing `names._`, unset `SWARM_BASE_URL`). The health route is registered before the admin middleware and leaks nothing (`{"ok":true}` only). The ESLint guard catches the four server-only packages and shallow `server/*` relative imports. All 67 tests pass.

The findings are **design-level gaps and latent issues**, not active exploits — no Phase 1 HTTP route exercises the un-scoped repository methods with untrusted input yet. They should be fixed before the Phase 2 routes that do.

## Warnings

### WR-01: Repository methods `getToken`, `invalidateToken`, `updateSendLog` are NOT scoped by site_id (T-01-01 gap)

**File:** `server/db/sqlite.ts:340-345`, `347-351`, `376-387`
**Issue:** The T-01-01 mitigation requires *every* query to key on `site_id`. Three methods violate this:
- `getToken(id)` — `SELECT * FROM verify_tokens WHERE id = ?` (no `site_id` filter)
- `invalidateToken(id)` — `UPDATE verify_tokens SET used = 1 WHERE id = ?` (no `site_id` filter)
- `updateSendLog(id, patch)` — `UPDATE send_log SET ... WHERE id = ?` (no `site_id` filter)

The interface in `server/db/repository.ts:103-108` also lacks `siteId` params for these three methods, unlike `getSubscriber(siteId, id)`, `findSendLogByPostEventId(siteId, ...)`, etc. which are all scoped. A caller that obtains a token/send_log id from one site could read/mutate it without the site_id check. The `verify_tokens` and `send_log` tables both carry a `site_id` column, so the data is available — the queries just don't use it. No Phase 1 route calls these with untrusted input, so this is latent, but the interface contract itself is wrong and will propagate to Phase 2.
**Recommendation:** Add `siteId` as the first parameter to `getToken`, `invalidateToken`, and `updateSendLog` in the `SubscriberRepository` interface, and add `AND site_id = ?` to all three SQL statements. This matches the pattern already established by `getSubscriber`/`deleteSubscriber`/`findSendLogByPostEventId`.

### WR-02: `updateSendLog` interpolates column names from `Object.entries(patch)` — potential SQL injection

**File:** `server/db/sqlite.ts:379-386`
**Issue:** `for (const [key, value] of Object.entries(patch)) { ... sets.push(\`${key} = ?\`); }` interpolates the object key directly into the SQL column position. The values are parameterized, but the column name is not. `patch` is typed `Partial<SendLog>`, so TypeScript constrains keys at compile time, but at runtime (e.g., a JSON request body spread into `patch` in a future Phase 2 handler) arbitrary keys could be present — e.g. `{"id = 'x'; DROP TABLE send_log--": 1}` would inject. The `id` and `site_id` keys are skipped, but no allowlist guards the rest.
**Recommendation:** Validate `key` against an explicit allowlist of updatable columns before interpolating:
```ts
const ALLOWED = new Set(['post_event_id','subject','recipient_count','sent_count','status','completed_at']);
for (const [key, value] of Object.entries(patch)) {
  if (!ALLOWED.has(key)) continue;
  sets.push(`${key} = ?`);
  params.push(value);
}
```

### WR-03: `listSubscribers`/`countSubscribers` segment filter — LIKE wildcard and quote injection (correctness)

**File:** `server/db/sqlite.ts:208-209`, `228-229`
**Issue:** The segment filter builds `params.push(\`%"${opts.segment}"%\`)` — the segment value is interpolated into the LIKE pattern string (then bound as a parameter, so this is *not* SQL injection). However, if `opts.segment` contains `%`, `_`, or `"`, the LIKE match becomes incorrect: a segment named `a%` would match `abc`; a segment containing `"` would break the JSON-string-quote matching and match nothing or the wrong rows. This is a data-correctness defect, not a security hole.
**Recommendation:** Escape LIKE metacharacters and embedded quotes before interpolation:
```ts
const esc = opts.segment.replace(/[%_"\\]/g, (c) => `\\${c}`);
params.push(`%"${esc}"%`);
```
and add `ESCAPE '\\'` to the LIKE clause, or use `json_each(segment)` for exact segment matching.

### WR-04: `runBackup` overwrites a single file — no real 7-day retention

**File:** `server/db/backup.ts:34`
**Issue:** `runBackup` writes to a fixed filename `email.db.bak` (no timestamp). Every backup run overwrites the previous backup. The 7-day rotation loop (lines 39-50) looks for `email.db.bak*` files older than 7 days, but since there is only ever one file (`email.db.bak`) and it is just rewritten (mtime refreshed), the rotation never deletes anything. The README and summary claim "7-day retention," but the implementation provides only a single, constantly-overwritten backup. If the DB corrupts and the next backup runs, the good backup is overwritten with the corrupt state — data loss risk.
**Recommendation:** Stamp backup filenames with a timestamp (e.g. `email.db.${YYYYMMDD-HHMMSS}.bak`) so each run produces a distinct file; the existing rotation loop will then actually age out old files. Keep `email.db.bak` as a symlink to the latest if a stable path is needed.

### WR-05: `backup.ts` default `EMAIL_DB_PATH` (`/app/email.db`) diverges from `index.ts` default (`./email.db`)

**File:** `server/db/backup.ts:28` vs `server/index.ts:31`
**Issue:** `runBackup` defaults `EMAIL_DB_PATH` to `/app/email.db`, while `server/index.ts` defaults it to `./email.db`. If an installer runs the cron backup without setting `EMAIL_DB_PATH` (relying on defaults), but the server was started without it either, the backup opens `/app/email.db` (likely nonexistent or empty) while the live DB is at `./email.db`. The backup silently succeeds on an empty/wrong DB — a false sense of safety.
**Recommendation:** Use the same default in both files. Prefer `./email.db` (or document that `EMAIL_DB_PATH` must be set explicitly in production and omit the default entirely, failing closed if unset).

### WR-06: ESLint `no-restricted-imports` pattern list has a depth ceiling — deep relative imports bypass the guard

**File:** `eslint.config.js:65`
**Issue:** The `patterns.group` lists `server/*`, `../server/*`, `../../server/*`, `../../../server/*` — covering relative imports up to 3 levels deep. A file 4+ levels deep in `src/` (e.g. `src/a/b/c/d/file.ts`) importing `../../../../server/db/sqlite` would NOT match any pattern and would pass the guard silently. The guard is the T-01-04 mitigation for keeping server-only code out of the client bundle; a bypass path undermines it.
**Recommendation:** Replace the finite list with a single pattern that matches any depth: `**/server/**` (or `**/server/*` if ESLint's minimatch globs depth). Verify with a test fixture at 4 levels deep. Alternatively, add a custom ESLint rule that rejects any resolved path containing `/server/`.

### WR-07: `getEmailEnabled` meta-tag path coerces with `!!injected` — a string `"false"` enables the module

**File:** `src/lib/relay.ts:51-54`
**Issue:** The env path uses `String(env).toLowerCase() === 'true'` (only literal `"true"` → true), but the meta-tag path uses `!!injected` (truthy coercion). If the swarm-config meta tag injects `"email_enabled": "false"` (string, not boolean), `!!"false"` is `true` — the email module would be enabled when the installer intended it off. This is inconsistent with the env path's strict string coercion and with the "default off" hard constraint. The type is declared `email_enabled?: boolean` but JSON meta content is untyped at runtime.
**Recommendation:** Coerce the meta value symmetrically with the env path: if `typeof injected === 'string'`, return `injected.toLowerCase() === 'true'`; if boolean, return `injected`; else false.

### WR-08: `nip98Auth` does not wrap `masterResolver()` in try/catch — an unhandled throw becomes a 500

**File:** `server/middleware/nip98Auth.ts:43`
**Issue:** `const master = (await opts.masterResolver()).toLowerCase().trim();` is not wrapped in try/catch. The default `resolveMasterPubkey` catches all internal errors and returns `''`, so it cannot throw. But the middleware accepts an injectable `masterResolver` — a custom resolver (or a future bug in the default) that throws would propagate as an unhandled rejection → Hono returns a 500, leaking a stack trace in non-prod modes and failing open-ish (500 rather than the fail-closed 401). The NIP-98 verify path is wrapped; the master resolution path is not.
**Recommendation:** Wrap the master resolution in try/catch and return 401 on any throw (fail closed):
```ts
let master: string;
try { master = (await opts.masterResolver()).toLowerCase().trim(); }
catch { return c.json({ error: 'unauthorized' }, 401); }
```

## Info

### IN-01: `publicRequest` trusts `X-Forwarded-Proto`/`X-Forwarded-Host` without validation

**File:** `server/auth/nip98.ts:47-53`
**Issue:** The reconstructed URL is built from `x-forwarded-proto` and `x-forwarded-host` headers with no validation. A malformed proto (e.g. `javascript:`) or host would produce an invalid URL; `new Request(url, ...)` would throw and the middleware maps that to 401 — so this is not exploitable. Security depends on the nginx snippet overwriting these headers (it does: `proxy_set_header X-Forwarded-Host $host;`), which prevents client-supplied values from reaching the service. If an installer misconfigures nginx (forwards client headers), a client could shift the validated URL, but the master-signature check is still the real gate.
**Recommendation:** Consider validating `proto` against `['http','https']` and rejecting hosts containing path/whitespace characters, as defense-in-depth for misconfigured proxies.

### IN-02: `createApp(repo?)` accepts a repo it does not use

**File:** `server/app.ts:17-29`
**Issue:** `createApp(repo?)` takes a `SubscriberRepository` argument but discards it (`void repo;`). It is described as a "reserved extension point" for Phase 2. This is fine for Phase 1 but is dead surface area; a future reader may assume the admin routes already use it.
**Recommendation:** Leave as-is for Phase 1, but add a TODO-free comment noting Phase 2 wires it into the admin router, or remove the param until needed.

### IN-03: `resolveMasterPubkey` nostr.json cache serves stale master for up to 5 minutes after rotation

**File:** `server/auth/master-pubkey.ts:48-55`
**Issue:** The env path bypasses the cache (good — env wins every call), but the nostr.json fetch result (including fail-closed `''`) is cached for 5 minutes. If the master pubkey is rotated in nostr.json, admin auth continues to admit the old master (or reject all, if rotated to empty) for up to 5 minutes. This matches the SPA's `staleTime: 5 * 60 * 1000` and is a conscious decision, but it means a revoked master retains access for the TTL window.
**Recommendation:** Acceptable as documented. If faster revocation is ever needed, expose a cache-invalidation endpoint or shorten the TTL.

### IN-04: systemd `ExecStart=/usr/bin/npx tsx server/index.ts` runs JIT in production

**File:** `server/deploy/nostr-cms-email.service:19`
**Issue:** Production runs via `npx tsx` (esbuild JIT on every start). For a long-running process this is fine (startup cost is one-time), but it requires the full `node_modules` + TypeScript source on the relay box and a working `npx` resolution at boot.
**Recommendation:** Acceptable for Phase 1. If cold-start time or source-on-box becomes a concern, pre-compile `server/` to `dist-server/` and `ExecStart=/usr/bin/node dist-server/index.js`.

### IN-05: `src/test/setup.ts` assigns `IntersectionObserver`/`ResizeObserver` to `global` unconditionally

**File:** `src/test/setup.ts:45-59`
**Issue:** The `window` references are correctly guarded with `typeof window !== 'undefined'` for Node-env server tests, but `global.IntersectionObserver` and `global.ResizeObserver` are assigned unconditionally. In the Node test environment these are harmless (mocks that are never called), but they do pollute the Node global scope.
**Recommendation:** Guard these the same way as `window` (`if (typeof window !== 'undefined')`) or move them inside the jsdom-only block. Minor.

---

## Hard-constraint check

- **No swarm modification:** Confirmed — no swarm-repo files touched; the email service talks to swarm over HTTP (nostr.json fetch) only.
- **PII never on relays:** Confirmed — subscriber emails/PII live only in SQLite (`subscribers`, `verify_tokens`, `delivery_events` tables); no relay publish path exists in Phase 1.
- **Email opt-in default off:** Confirmed — `getEmailEnabled()` returns `false` when neither env nor meta is set; `useEmailEnabled` gates the nav; the server is a separate opt-in process. (See WR-07 for a string-coercion edge case in the meta path.)
- **Server-only deps never in `src/`:** Confirmed at the source level (grep found no `server/`, `better-sqlite3`, `resend`, `csv-parse`, `pg` imports in `src/`). The ESLint guard enforces it (see WR-06 for a depth-limit bypass).
- **Secrets server-only:** Confirmed — no `VITE_` secret vars; `RESEND_API_KEY` deferred to Phase 2; `email.env` contains no secrets.

_Reviewed: 2026-07-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
