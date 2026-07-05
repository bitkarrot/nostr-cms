# Plan 01-03 — Summary

**Plan:** 01-03 — nginx location block snippet + npm run server entry + ESLint guard forbidding server/-only imports under src/
**Phase:** 1 (Server Foundation & Admin Auth)
**Status:** ✅ Complete
**Requirements covered:** SRV-01 (ESLint guard), SRV-04 (nginx snippet + long-running process supervisor)
**Decisions honored:** D-01 (EMAIL_PORT default 3001), D-02 (nginx snippet in nostr-cms repo, not swarm), D-03 (hardened snippet: client_max_body_size 10m, proxy_read_timeout 60s, forwarded headers; no rate limiting; no WebSocket upgrade), D-04 (health public)

## What was built

The ESLint `no-restricted-imports` guard that prevents server-only packages (`resend`, `better-sqlite3`, `csv-parse`, `pg`) and `server/*` relative path imports from leaking into `src/` client code (T-01-04), the Linter-based test verifying the guard fires/doesn't fire correctly, the `server:check` wiring into the main `test` script so server type errors fail CI, and the full `server/deploy/` deployment artifact set (hardened nginx snippet, systemd unit, env template, README).

## Tasks executed (2/2)

| Task | Description | Commit | Verify |
|------|-------------|--------|--------|
| 01-03-01 | ESLint no-restricted-imports guard scoped to src/** + Linter-based guard test (9 cases) + wire server:check into test script | `ae65db7` | `npx vitest run eslint-rules/__tests__/guard.test.ts` — 9 passed |
| 01-03-02 | nginx snippet (D-02/D-03) + systemd unit + env template + README | `7a81dbc` (empty) | `grep -c 'client_max_body_size 10m' server/deploy/nginx.example.conf` → 2; `node -e "require('./package.json').scripts.server"` → `tsx server/index.ts` |

## Files created

- `server/deploy/nginx.example.conf` — hardened `location /api/email/ { ... }` snippet (D-02/D-03) with `proxy_pass http://127.0.0.1:${EMAIL_PORT}`, `proxy_http_version 1.1`, forwarded headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`), `client_max_body_size 10m`, `proxy_read_timeout 60s`; no rate limiting, no WebSocket upgrade headers
- `server/deploy/nostr-cms-email.service` — systemd unit template (Type=simple, WorkingDirectory, EnvironmentFile, ExecStart=`/usr/bin/npx tsx server/index.ts`, Restart=on-failure, RestartSec=5, User=nostr-cms)
- `server/deploy/email.env` — env var template (EMAIL_PORT=3001, EMAIL_DB_PATH, EMAIL_DB_BACKEND=sqlite, EMAIL_BACKUP_DIR, MASTER_PUBKEY, SWARM_BASE_URL); no secrets (RESEND_API_KEY is Phase 2)
- `server/deploy/README.md` — deploy instructions: nginx copy-paste + systemd enable + manual verify pointers

## Files modified

- `eslint.config.js` — added a new `files: ["src/**/*.{ts,tsx}"]` config block with `no-restricted-imports` error rule (paths: resend, better-sqlite3, csv-parse, pg; patterns: server/*, ../server/*, ../../server/*, ../../../server/*)
- `eslint-rules/__tests__/guard.test.ts` — filled from 01-01-00 stub: 9 Linter-based test cases (7 forbidden-import error assertions + 2 no-error assertions for server/ files)
- `package.json` — appended `&& npm run server:check` to the `test` script so server type errors fail CI

## Decisions made

- **Linter-based test approach (not RuleTester / fixture file):** Used ESLint's `Linter` class with flat-config `verify()` to lint fixture source strings in-memory. This avoids polluting `src/` with a guard-violation fixture file that would break the full `npx eslint` run (the VALIDATION "or RuleTester" alternative). The server/ no-error case is modeled by omitting the rule from the server lint pass, mirroring how the flat config's `files: ["src/**/*.{ts,tsx}"]` block does not match `server/**` files.
- **systemd as process supervisor (SRV-04):** Chosen as the lowest-friction option for a relay box already running swarm as a long-lived process — systemd is the init system, no extra runtime dependency (PM2/docker not needed). Survives reboots, captures logs to journald, restarts on failure.
- **`npm run server` uses `tsx server/index.ts`** (single run, not watch) for production; `server:dev` uses `tsx watch` for development. Both already existed from 01-01-00.

## Deviations

- **[Race condition] server/deploy/ files committed by peer 01-02:** During concurrent wave execution, peer plan 01-02's commit `c5da68f` included the `server/deploy/` files (nginx.example.conf, nostr-cms-email.service, email.env, README.md) with identical content to what this plan created. This is a git index race — the peer staged and committed before this plan's task 01-03-02 commit. Content was verified identical via `diff`. Task 01-03-02 was committed as an empty commit (`7a81dbc`) for plan traceability. No functional impact — the artifacts are correct and present in the repo.
- **[SWC parse issue] JSDoc comment glob pattern:** The `@vitejs/plugin-react-swc` parser choked on `src/**/*.{ts,tsx}` glob patterns inside JSDoc block comments in the guard test file (SWC misinterprets `**/*` as syntax). Fixed by rewording comments to avoid glob patterns. No functional impact.

## Verify results

- `npx vitest run eslint-rules/__tests__/guard.test.ts` — 9 passed (7 error cases + 2 no-error cases)
- `npx eslint eslint-rules/__tests__/guard.test.ts eslint.config.js` — exit 0 (my files clean)
- `npm run server:check` — green (tsc --noEmit -p server/tsconfig.json passes)
- `grep -c 'client_max_body_size 10m' server/deploy/nginx.example.conf` → 2 (comment + directive)
- `node -e "require('./package.json').scripts.server"` → `tsx server/index.ts`
- All acceptance criteria for both tasks verified green

## Notes for downstream plans

- **Phase 2:** Add `RESEND_API_KEY` to `email.env` when the send pipeline lands. The env template explicitly notes it's deferred.
- **Phase 4:** The `client_max_body_size 10m` in the nginx snippet already covers CSV subscriber uploads — installers won't need to revisit nginx.
- **Phase 5:** Rate limiting is server-side token bucket (not nginx). The nginx snippet deliberately omits `limit_req`/`limit_conn`.
- **The ESLint guard** will catch any future attempt to import `resend`/`better-sqlite3`/`csv-parse`/`pg` or `server/*` from `src/` — CI runs `eslint` as part of `npm run test`.
