# Plan 01-02 — Summary

**Plan:** 01-02 — NIP-98 verification in Node + master-pubkey check via nostr.json fetch + admin endpoint scaffold
**Phase:** 1 (Server Foundation & Admin Auth)
**Status:** ✅ Complete
**Requirements covered:** SRV-03 (NIP-98 admin auth), SRV-01 (health endpoint acceptance)
**Decisions honored:** D-04 (health public, {"ok":true} only)
**Threats mitigated:** T-01-02 (forgery/expiry — 401/403 matrix), T-01-03 (proxy URL reconstruction — #1 bug risk)

## What was built

Server-side NIP-98 HTTP auth verification using `@nostrify/nostrify`'s `NIP98.verify` (pure crypto via `nostr-tools` `verifyEvent` — no hand-rolled Schnorr), a `publicRequest(c)` helper that reconstructs the public request URL from `X-Forwarded-Proto`/`X-Forwarded-Host` headers so verification succeeds behind nginx (T-01-03), master-pubkey resolution from `MASTER_PUBKEY` env or `/.well-known/nostr.json` fetch (fail-closed), a Hono `nip98Auth` middleware enforcing the 401/403 matrix, and a scaffold admin endpoint (`GET/POST /api/email/admin/ping`) proving the auth seam works end-to-end. The public health route stays public (registered before the middleware, D-04).

## Tasks executed (5/5)

| Task | Description | Commit | Verify |
|------|-------------|--------|--------|
| 01-02-01 | NIP-98 verify glue + middleware + admin scaffold + 401/403 matrix | `89ac3ce` | `npx vitest run server/auth/nip98.test.ts` — 5 passed |
| 01-02-02 | Expiry / wrong-URL / wrong-method / payload-tamper reject cases | `e214cb4` | `npx vitest run server/auth/nip98.test.ts` — 9 passed |
| 01-02-03 | Proxy URL reconstruction test (T-01-03, #1 bug risk) | `da208dd` | `npx vitest run server/auth/nip98.test.ts` — 11 passed |
| 01-02-04 | resolveMasterPubkey: env + nostr.json fetch + fail-closed + cache | `34ee700` | `npx vitest run server/auth/master-pubkey.test.ts` — 10 passed |
| 01-02-05 | Health endpoint integration test (200 {ok:true}, no auth, D-04) | `2110510` | `npx vitest run server/routes/health.test.ts` — 2 passed |

**Final:** `npx vitest run server/` — 7 files, 47 tests, all green.

## Files created

- `server/auth/nip98.ts` — `publicRequest(c: Context): Request` (reconstructs the public URL from `X-Forwarded-Proto` + `X-Forwarded-Host`/`Host` + the request path, T-01-03) and `verifyNip98(request: Request): Promise<NostrEvent>` (thin glue over `@nostrify/nostrify` `NIP98.verify`, default maxAge 60s, re-throws on failure).
- `server/auth/master-pubkey.ts` — `resolveMasterPubkey(): Promise<string>` (MASTER_PUBKEY env → nostr.json fetch `names._` → fail-closed `''`), 5-minute in-memory cache (matching SPA `staleTime`), `resetMasterPubkeyCache()` for tests.
- `server/middleware/nip98Auth.ts` — `nip98Auth({ masterResolver })` Hono middleware: `verifyNip98(publicRequest(c))` throw → 401, empty master → 401 (fail closed), non-master → 403, match → `c.set('pubkey', ...)` + `next()`. Exports `Nip98Env` (Hono env binding with `Variables: { pubkey: string }`).
- `server/routes/admin.ts` — `createAdminRouter()` scaffold with `GET /ping` and `POST /ping` behind `nip98Auth` (masterResolver = `resolveMasterPubkey`).
- `server/auth/nip98.test.ts` — 11 cases: valid master 200, missing header 401, tampered sig 401, non-master 403, fail-closed empty master 401, expired >60s 401, wrong URL 401, wrong method 401, payload tamper 401, proxy reconstruction positive (200 with X-Forwarded-*), proxy reconstruction negative (401 without).
- `server/auth/master-pubkey.test.ts` — 10 cases: env wins (lowercased/trimmed, fetch not called), nostr.json fetch ok, fetch rejects → '', 404 → '', malformed JSON → '', missing names._ → '', env priority, SWARM_BASE_URL unset → '', cache hit within TTL, fail-closed empty cached.
- `server/routes/health.test.ts` — 2 cases: 200 {ok:true} no auth, single-key body assertion (no DB/config/subscriber fields, D-04).

## Files modified

- `server/app.ts` — `createApp()` now registers the admin router under `/api/email/admin` AFTER the public health route (D-04 — health stays public). Removed the "extension point" placeholder comments.

## Decisions made

- **`Nip98Env` typed Hono env** — `c.set('pubkey', ...)` / `c.get('pubkey')` requires a typed `Variables` binding. Defined `Nip98Env` in `server/middleware/nip98Auth.ts` and threaded it through `createAdminRouter()` and the test app so `tsc --noEmit -p server/tsconfig.json` passes with strict null checks.
- **POST /ping scaffold** — added a `POST /api/email/admin/ping` route (reads the body) alongside the GET scaffold so the 01-02-02 payload-tamper test can exercise `NIP98.verify`'s payload SHA-256 digest check without needing a real settings endpoint.
- **Env bypasses cache** — `MASTER_PUBKEY` env is checked on every call (bypasses the cache) because env can change between requests in tests and there's no fetch cost to avoid. The nostr.json fetch result (including the fail-closed empty string) is cached for 5 minutes.

## Deviations

- **[Rule 3] Git index race with peer 01-03:** During task 01-02-01, the peer's untracked `server/deploy/*` files were accidentally staged by the peer between my `git add` and `git commit`, landing in my commit. Detected immediately, removed them from my commit via an interactive rebase (`git rebase -i`, edit my commit, `git rm --cached server/deploy/*`, `--amend`, `--continue`). The peer's deploy files were preserved in the working tree (untracked) for the peer to commit. No content was lost; the final commit `89ac3ce` contains only the 6 files this plan owns.
- **Stray truncated-name files:** The `write` tool intermittently created copies of file contents under truncated names (e.g. `server/auth/n`, `server/auth/nip`, `server/routes/health`). These confused the Vitest module resolver (it picked up the extensionless copy instead of the `.ts` file). Removed them with `rm` as they appeared. No impact on committed artifacts (they were never staged).

## Verify results

```
npx vitest run server/ — 7 files, 47 tests, all green
npx tsc --noEmit -p server/tsconfig.json — green
```

## Test count

- `server/auth/nip98.test.ts` — 11 tests
- `server/auth/master-pubkey.test.ts` — 10 tests
- `server/routes/health.test.ts` — 2 tests
- (01-01's tests still green: sqlite.repository 13, migrations 4, sqlite 3, backup 4 = 24)
- **Total server tests: 47**
