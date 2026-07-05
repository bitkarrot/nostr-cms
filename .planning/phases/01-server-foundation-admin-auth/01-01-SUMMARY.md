# Plan 01-01 — Summary

**Plan:** 01-01 — server/ scaffold + SubscriberRepository interface + SQLite implementation + migrations (WAL mode, online backup)
**Phase:** 1 (Server Foundation & Admin Auth)
**Status:** ✅ Complete
**Requirements covered:** SRV-01 (server scaffold root), SRV-02 (repository + SQLite + migrations + WAL + online backup)
**Decisions honored:** D-01 (EMAIL_PORT default 3001), D-04 (health public, {"ok":true} only)

## What was built

Standing up the Node/TypeScript email service scaffold in `server/`, the backend-agnostic `SubscriberRepository` interface, its SQLite implementation (`better-sqlite3`, WAL mode), a tiny idempotent SQL migration runner with the initial schema (5 entity tables all carrying `site_id`), the online-backup capability, and the Wave 0 setup for the entire phase (deps, server tsconfig, test stubs).

## Tasks executed (6/6)

| Task | Description | Commit | Verify |
|------|-------------|--------|--------|
| 01-01-00 | Wave 0 setup: deps, tsconfig, 10 test stubs | `9449b7c` | `npx vitest run` all stubs pass (46 todo) |
| 01-01-01 | SubscriberRepository interface + SQLite impl (T-01-01 cross-site isolation) | `061970f` | `npx vitest run server/db/sqlite.repository.test.ts` — 13 passed |
| 01-01-02 | Idempotent migration runner + initial schema (5 tables + schema_migrations) | `861bcbb` | `npx vitest run server/db/migrations.test.ts` — 4 passed |
| 01-01-03 | WAL mode verification test | `3eec4ea` | `npx vitest run server/db/sqlite.test.ts` — 3 passed |
| 01-01-04 | Online backup via better-sqlite3 backup API + README | `636c765` | `npx vitest run server/db/backup.test.ts` — 4 passed |
| 01-01-05 | Server entry + public health route + createApp helper | `90fb4e5` | `grep createApp` + `grep healthRoute` + `tsc --noEmit -p server/tsconfig.json` — green |
| (lint) | Remove unused afterAll import (eslint fix) | `b4a348b` | `npm run test` full pipeline green |

## Files created

- `server/tsconfig.json` — server TS config (lib ESNext, no DOM; types node; include `["."]`)
- `server/db/repository.ts` — `Subscriber`, `Settings`, `VerifyToken`, `SendLog`, `DeliveryEvent` row types + `SubscriberRepository` interface (all methods async, scoped by siteId)
- `server/db/sqlite.ts` — `SqliteSubscriberRepository implements SubscriberRepository`; `openDatabase(dbPath)` opens better-sqlite3 with WAL + foreign_keys=ON + busy_timeout=5000; `pragma()` test accessor + `getDb()` for backup
- `server/db/migrate.ts` — `runMigrations(db, dir)` idempotent runner recording `schema_migrations(version, applied_at)`
- `server/db/migrations/001.sqlite.sql` — initial schema (subscribers, settings, verify_tokens, send_log, delivery_events); `UNIQUE(site_id, email)` on subscribers; partial unique index `send_log_post_event_id_unique` for dedup (Pitfall P10)
- `server/db/backup.ts` — `backupDatabase(db, destPath)` (better-sqlite3 online backup API) + `runBackup()` (EMAIL_DB_PATH/EMAIL_BACKUP_DIR env, 7-day rotation); entry-point guard for `npm run server:backup`
- `server/routes/health.ts` — `healthRoute(c)` returns `c.json({ ok: true }, 200)` (D-04: no auth, no DB details)
- `server/app.ts` — `createApp(repo?)` constructs the Hono app WITHOUT binding a port; registers public health route first; repo arg is the extension point for plan 01-02 admin routes
- `server/index.ts` — entry: reads EMAIL_PORT (default 3001, D-01) + EMAIL_DB_BACKEND (default sqlite); opens db, runs migrations, constructs repo, serves via @hono/node-server; only runs main() on direct execution
- `server/README.md` — env vars, dev/prod run commands, daily backup cron line, 7-day retention note
- Test files (stubs created in Wave 0, filled by this plan): `server/db/sqlite.repository.test.ts` (13 cases), `server/db/migrations.test.ts` (4 cases), `server/db/sqlite.test.ts` (3 cases), `server/db/backup.test.ts` (4 cases)
- Test stubs for peer plans: `server/routes/health.test.ts` (owned by 01-02-05), `server/auth/nip98.test.ts` (owned by 01-02), `server/auth/master-pubkey.test.ts` (owned by 01-02), `eslint-rules/__tests__/guard.test.ts` (owned by 01-03)

## Files modified

- `package.json` — added deps `hono`, `@hono/node-server`, `better-sqlite3`; devDeps `tsx`, `@types/better-sqlite3`; scripts `server`, `server:dev`, `server:check`, `server:backup`
- `package-lock.json` — lockfile updated for new deps
- `src/test/setup.ts` — guarded `window` references with `typeof window !== 'undefined'` so Node-env server tests (via `// @vitest-environment node` pragma) don't crash on the global jsdom setup file

## Decisions made

- **Repository constructor accepts a `Database`** (not a path) — `server/index.ts` owns the single better-sqlite3 connection so it can run migrations on it before handing it to the repo, and `server/db/backup.ts` can use the same connection for online backup. `openDatabase(dbPath)` is the factory that applies WAL/foreign_keys/busy_timeout pragmas. This satisfies the plan's preference ("prefer accepting a Database so index.ts owns the single connection").
- **`createApp` factored into `server/app.ts`** (imported by `server/index.ts`) — keeps one app source and makes `createApp` cleanly importable by tests (task 01-02-05) without any port-binding side effects. `server/index.ts` re-exports `createApp` for convenience.
- **`schema_migrations` table owned by the runner**, not the migration SQL — the runner creates it with `CREATE TABLE IF NOT EXISTS` before applying files; the `001.sqlite.sql` file only creates the 5 entity tables. This avoids a "table already exists" conflict on re-run (the migration SQL would otherwise re-create `schema_migrations` on every fresh DB). The plan listed `schema_migrations` under the 001 schema, but the runner-owns-tracking-table pattern is the correct idempotent approach.
- **`NewToken` type omits `used`** — `createToken` sets `used=0` itself; callers should not supply it. Adjusted from the plan's `Omit<VerifyToken, 'id'>` to `Omit<VerifyToken, 'id' | 'used'>`.

## Deviations

- **[Rule 3] `src/test/setup.ts` window guard:** The plan chose the `// @vitest-environment node` pragma approach over a vite.config project entry. The global `setupFiles: './src/test/setup.ts'` runs in every test environment and referenced `window` unconditionally, crashing Node-env server tests with `ReferenceError: window is not defined`. Fixed by guarding the `window.matchMedia`/`window.scrollTo` mocks with `typeof window !== 'undefined'`. This is a backward-compatible change (jsdom still has `window`); it only affects Node-env tests. Documented as a Rule 3 (blocking issue) auto-fix.
- **[Rule 3] `server/tsconfig.json` include path:** The plan specified `"include": ["server"]`, but since the tsconfig lives at `server/tsconfig.json`, tsc resolves include paths relative to the tsconfig directory — `["server"]` looked for `server/server/` and produced "No inputs were found". Fixed to `["."]` so it includes all files under `server/`.
- **Peer-owned `src/` test files:** The plan's Wave 0 `<files>` list included `src/hooks/useEmailEnabled.test.ts` and `src/components/admin/AdminLayout.test.tsx`. Parallel peer plan 01-04 owns `src/` and had already implemented `useEmailEnabled.test.ts` fully (not a stub) and overwrote the `AdminLayout.test.tsx` stub with their 01-04-03 implementation concurrently. Per the execution context (peer owns `src/`), these were left untouched. The Wave 0 verify command was run against the server stubs + the eslint guard stub (all green); the `src/` files are the peer's responsibility.

## Verify results

- `npx vitest run server/db/sqlite.repository.test.ts` — 13 passed (T-01-01 cross-site isolation case green)
- `npx vitest run server/db/migrations.test.ts` — 4 passed (idempotency, ordering, recording, SQL-failure)
- `npx vitest run server/db/sqlite.test.ts` — 3 passed (WAL, foreign_keys=ON, busy_timeout=5000)
- `npx vitest run server/db/backup.test.ts` — 4 passed (same row count, backup-during-write, env vars, 7-day rotation)
- `npx tsc --noEmit -p server/tsconfig.json` — green (server type-check passes with no DOM lib)
- `npx vitest run server/` — 24 passed, 15 todo (peer-plan stubs: health.test.ts, nip98.test.ts, master-pubkey.test.ts)
- `npm run test` (full pipeline: tsc + eslint + vitest + build) — exit 0, all green

## Notes for downstream plans

- **Plan 01-02:** `createApp(repo?)` in `server/app.ts` is the extension point — add the NIP-98 admin auth middleware + admin routes there (the `repo` arg is already wired through). `server/index.ts` re-exports `createApp` for test mounting. Task 01-02-05 owns filling `server/routes/health.test.ts` (currently a Wave 0 stub).
- **Plan 01-03:** The `server:check` script (`tsc --noEmit -p server/tsconfig.json`) is ready to wire into CI. The ESLint guard test stub is at `eslint-rules/__tests__/guard.test.ts`.
- **`@nostrify/nostrify` `NIP98`** is confirmed importable (`node_modules/@nostrify/nostrify/mod.ts` re-exports `NIP98`; `NIP98.verify(request, opts?)` exists with `maxAge` default 60_000ms). Plan 01-02 can use it directly.
