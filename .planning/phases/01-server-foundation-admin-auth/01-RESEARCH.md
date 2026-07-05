# Phase 1 Research — Server Foundation & Admin Auth

**Researched:** 2026-07-05
**Goal:** Answer "What do I need to know to PLAN this phase well?" for the Server Foundation & Admin Auth phase (SRV-01..05).

This research is grounded in the actual codebase (files cited with paths + line numbers) and the latest library docs (fetched, not training-data). All user-locked decisions from `01-CONTEXT.md` are honored; gray areas are resolved with a recommendation + rationale.

---

## 1. Node/TS Server Scaffold in `server/`

### 1.1 Keeping `server/` out of the Vite client build

The existing build is a pure SPA. `vite.config.ts` (lines 8-45) has no `server/` awareness — Vite only bundles what `index.html` and `src/` import. Because `server/` will never be imported by `src/` (enforced by the ESLint guard in §5), Vite will never see it. Two belt-and-suspenders measures:

1. **`tsconfig.json` currently `include: ["src"]`** (line 30) — the client type-check already ignores `server/`. Keep this. Add a **separate `server/tsconfig.json`** that extends a base but targets `server/` with Node types (`"types": ["node"]`), `"lib": ["ESNext"]` (NO `DOM`), and its own `include: ["server"]`. This prevents accidental `window`/`document` use server-side and keeps `tsc --noEmit` (run by `npm run test`, package.json line 10) from type-checking server files with DOM libs.
2. **Vite will not bundle `server/`** unless imported. No change to `vite.config.ts` is needed. (Optional: add `server/` to a build ignore, but it's unnecessary since nothing imports it.)

**Important `npm run test` interaction:** `package.json` line 10 runs `tsc --noEmit` (client), `eslint`, `vitest run`, then `vite build`. The server needs its own type-check + lint pass. Add a `"server:check"` script (`tsc --noEmit -p server/tsconfig.json`) and fold it into `test` or a separate `server:test` so server code is verified in CI without mixing DOM and Node type environments. **Recommendation:** add `"server": "tsx server/index.ts"` and `"server:check": "tsc --noEmit -p server/tsconfig.json"`; wire `server:check` + server vitest into the main `test` script so a server type error fails CI.

### 1.2 Dev workflow: `tsx` (recommended)

- **Dev:** run `tsx server/index.ts` (or `tsx watch` for reload). `tsx` is a zero-config TypeScript-on-Node runner (esbuild-based, fast, no separate build step). It's a devDependency. This avoids the ts-node config tax and matches the ESM `"type": "module"` in `package.json` line 5.
- **Prod:** either `tsx server/index.ts` directly, or compile `server/` to `dist-server/` via `tsc -p server/tsconfig.json` and run `node dist-server/index.js`. **Recommendation:** ship `tsx` in prod for simplicity in v1 (one less build step, one less artifact); the relay box has Node 20+ and `tsx` is a tiny dep. If cold-start matters later, switch to compiled JS. Document both in `server/README.md`.

### 1.3 Server framework: Hono (recommended)

**Recommendation: [Hono](https://hono.dev/) on `@hono/node-server`.** Rationale:

- **Web-standard `Request`/`Response`** — this is the decisive factor. The NIP-98 verifier (`@nostrify/nostrify`'s `NIP98.verify`, see §3.1) takes a Web `Request` object and reads `request.headers.get("authorization")`, `request.url`, `request.method`, and `request.clone().arrayBuffer()`. Hono's context gives you `c.req.raw` (a real `Request`). Express uses Node's `IncomingMessage`/`ServerResponse`, which would require manual reconstruction of a `Request` to call `NIP98.verify` — friction and a source of bugs. Hono eliminates that seam.
- **Middleware model** — a `nip98Auth` middleware wraps cleanly: `app.use('/api/email/admin/*', nip98Auth({ masterResolver }))`. Future phases add body-parser (CSV upload), webhook signature verification, and cron routes as more middleware/handlers — all on the same Web-standard primitives.
- **Tiny, no opinionated deps** — Hono core is ~20kb, no Express-style middleware ecosystem baggage. Works on Node via `@hono/node-server` (a 1-file adapter).
- **Future-proof** — if the hosted path ever moves to a serverless/edge runtime, Hono code ports unchanged (it already runs on Cloudflare/Bun/Deno); Express does not.

Rejected alternatives:
- **Express** — most familiar, but Node req/res model fights `NIP98.verify`'s Web `Request` API; would need a `req`→`Request` shim. Heavier.
- **Fastify** — fast, but same req/res mismatch and more plugin ceremony than needed for ~10 routes.
- **Bare `node:http`** — maximum control, but you'd hand-roll routing, body parsing, and the `Request` reconstruction. Not worth it for the route count ahead.

**Add to `package.json`:** `hono` + `@hono/node-server` as dependencies (both server-usable; they are NOT server-only in the security sense since they have no secrets, but they should still live under `server/` and not be imported from `src/` — the ESLint guard in §5 covers the `server/` path boundary).

### 1.4 `npm run server` entry

Add to `package.json` scripts:
```json
"server": "tsx server/index.ts",
"server:dev": "tsx watch server/index.ts",
"server:check": "tsc --noEmit -p server/tsconfig.json"
```
`server/index.ts` is the single entry: reads `EMAIL_PORT` (default 3001, per D-01), selects the DB backend (`EMAIL_DB_BACKEND`, default `sqlite`), runs migrations, registers routes, and starts `@hono/node-server`'s `serve({ fetch: app.fetch, port })`. Health endpoint `/api/email/health` returns `{"ok":true}` (D-04: no secrets, no DB details).

---

## 2. `SubscriberRepository` Interface + SQLite Implementation

### 2.1 Interface design (backend-agnostic)

The interface must be satisfiable by both SQLite (`better-sqlite3`, synchronous) and Postgres (`pg`, async). **Recommendation: make all methods `async` (return `Promise`)** even though `better-sqlite3` is sync. The SQLite impl wraps sync calls in `Promise.resolve()` (or just awaits a trivial microtask). This keeps the interface uniform and lets the Postgres impl be naturally async. The cost (a microtask per call) is negligible at creator scale.

**File:** `server/db/repository.ts` — defines the `SubscriberRepository` interface and the row types. Sketch (grounded in the data model in `ARCHITECTURE.md` lines 86-92):

```ts
// All tables carry site_id (single-tenant now uses a constant; multi-tenant-ready later)
export interface Subscriber {
  id: string; site_id: string; email: string; name: string | null;
  npub: string | null; status: 'pending' | 'active' | 'unsubscribed' | 'bounced';
  segment: string[]; created_at: string; confirmed_at: string | null;
  bounced_at: string | null; complained_at: string | null;
}
export interface Settings { /* site_id pk, module_enabled, resend_api_key_enc, ... */ }
export interface VerifyToken { id: string; subscriber_id: string; purpose: string; expires_at: string; }
export interface SendLog { /* ... */ }
export interface DeliveryEvent { /* ... */ }

export interface SubscriberRepository {
  // subscribers
  getSubscriber(siteId: string, id: string): Promise<Subscriber | null>;
  getSubscriberByEmail(siteId: string, email: string): Promise<Subscriber | null>;
  listSubscribers(siteId: string, opts?: { status?: string; segment?: string; limit?: number; offset?: number }): Promise<Subscriber[]>;
  countSubscribers(siteId: string, opts?: { status?: string; segment?: string }): Promise<number>;
  insertSubscriber(siteId: string, sub: Omit<Subscriber, 'id' | 'created_at'>): Promise<Subscriber>;
  updateSubscriberStatus(siteId: string, id: string, status: Subscriber['status']): Promise<void>;
  deleteSubscriber(siteId: string, id: string): Promise<void>;
  // settings
  getSettings(siteId: string): Promise<Settings | null>;
  upsertSettings(siteId: string, settings: Partial<Settings>): Promise<Settings>;
  // verify_tokens
  createToken(token: Omit<VerifyToken, 'id'>): Promise<VerifyToken>;
  getToken(id: string): Promise<VerifyToken | null>;
  invalidateToken(id: string): Promise<void>;
  // send_log
  createSendLog(entry: Omit<SendLog, 'id'>): Promise<SendLog>;
  updateSendLog(id: string, patch: Partial<SendLog>): Promise<void>;
  findSendLogByPostEventId(siteId: string, postEventId: string): Promise<SendLog | null>;
  // delivery_events
  recordDeliveryEvent(ev: Omit<DeliveryEvent, 'id'>): Promise<DeliveryEvent>;
  // maintenance
  close(): Promise<void>;
}
```

**Why this shape:** every method is scoped by `site_id` (multi-tenant-ready, per the locked decision). The interface is the contract that both impls must pass — Pitfall P9 (DB drift) is prevented by a **shared repository test suite** parameterized by backend (see §7).

### 2.2 SQLite implementation + WAL mode + migrations

**File:** `server/db/sqlite.ts` — `SqliteSubscriberRepository implements SubscriberRepository`.

- **WAL mode:** on open, run `db.pragma('journal_mode = WAL')` (and `db.pragma('foreign_keys = ON')`). WAL lets readers not block writers and vice versa (Pitfall P6). `better-sqlite3` is synchronous, so the impl wraps returns in `Promise.resolve(...)`.
- **DB path:** `EMAIL_DB_PATH` env var, default `/app/email.db` (per CONTEXT.md deferred defaults). For local dev, default to `./email.db` if not set and not production — or just always honor `EMAIL_DB_PATH` and document the dev default. **Recommendation:** `process.env.EMAIL_DB_PATH || './email.db'` (dev-friendly; the installer sets `EMAIL_DB_PATH=/app/email.db` in prod).
- **Single connection:** `better-sqlite3` is single-connection by design; open one `Database` instance at startup and reuse it. This matters for online backup (§2.3) — the docs say a *different* connection mutating during backup restarts it; a single connection is the safe pattern.

**Migrations:** **raw SQL files + a tiny runner** (not a library). Rationale: two dialects (SQLite, Postgres) with the same schema; a library like `node-pg-migrate` or `knex` would either be dialect-specific or pull a heavy abstraction. A 30-line runner is enough.

- **Layout:** `server/db/migrations/001.sqlite.sql`, `001.postgres.sql`, `002.*.sql`, etc. Files named `NNN.<dialect>.sql`, applied in order, tracked in a `schema_migrations(version, applied_at)` table.
- **Runner:** `server/db/migrate.ts` — reads the `NNN` prefix, checks `schema_migrations`, runs unapplied files in a transaction (SQLite: `db.transaction(...)`; Postgres: `BEGIN/COMMIT`). Idempotent: re-running skips already-applied versions. The runner is invoked at startup before the server listens.
- **Schema (from ARCHITECTURE.md lines 86-92):** `subscribers`, `settings`, `verify_tokens`, `send_log`, `delivery_events` — all carry `site_id`. SQLite dialect uses `TEXT`, `INTEGER` booleans, `TEXT` for timestamps (ISO strings). `unique(site_id, email)` on subscribers; `unique(post_event_id)` on send_log where not null (dedup, Pitfall P10).

### 2.3 Online backup (Pitfall P6)

`better-sqlite3` exposes `db.backup(destination, { progress })` returning a Promise — a true online backup (SQLite's backup API under the hood). Verified from the official docs (fetched): "You can continue to use the database normally while a backup is in progress... if a *different* connection mutates the database during a backup, the backup will be forcefully restarted. Therefore, it's recommended that only a single connection is responsible for mutating the database."

**Implementation:** `server/db/backup.ts` — a function `backupDatabase(db, destPath)` that calls `db.backup(destPath)`. Wire to a cron (Phase 1 can ship the function + docs; the scheduler is a Phase 5/6 concern, but the *capability* + documented path satisfies SRV-02's "online-backup path is documented"). **Recommended defaults (per CONTEXT.md deferred):** `EMAIL_DB_PATH` default `/app/email.db`; daily backup to `${EMAIL_BACKUP_DIR}/email.db.bak` (default `/app/backups/`), 7-day retention (rotate via mtime). Document the cron line in `server/deploy/README.md`:
```
0 3 * * * cd /app/nostr-cms && EMAIL_DB_PATH=/app/email.db node -e "require('./server/db/backup').runBackup()" 
```
(Or, simpler: a `npm run server:backup` script that calls the backup function, invoked by the system cron.)

### 2.4 Backend selection

`EMAIL_DB_BACKEND=sqlite|postgres` (default `sqlite`). `server/index.ts` branches:
```ts
const backend = process.env.EMAIL_DB_BACKEND || 'sqlite';
const repo: SubscriberRepository = backend === 'postgres'
  ? new PostgresSubscriberRepository(process.env.DATABASE_URL!)
  : new SqliteSubscriberRepository(process.env.EMAIL_DB_PATH || './email.db');
```
**Phase 1 ships only the SQLite impl + the interface.** The Postgres impl is additive (P9: prove the interface with one impl before writing the second). The `PostgresSubscriberRepository` file can be a stub that throws "not implemented in this phase" — or simply not exist yet; the branch is there for later.

---

## 3. NIP-98 Verification in Node

### 3.1 The key finding: `@nostrify/nostrify` ships a `NIP98` class

**This is the most important discovery of this research.** `@nostrify/nostrify` (already in `package.json` line 20, version `^0.48.2`) has a built-in `NIP98` class at `node_modules/@nostrify/nostrify/NIP98.ts` that does *all* of NIP-98 server-side verification. Verified by reading the source (fetched from node_modules):

```ts
// node_modules/@nostrify/nostrify/NIP98.ts (lines 40-110)
export class NIP98 {
  static async verify(
    request: Request,
    opts?: { maxAge?: number; validatePayload?: boolean; verifyEvent?: (event: NostrEvent) => boolean; },
  ): Promise<NostrEvent> { /* ... */ }
}
```

`NIP98.verify(request)` performs, in order (NIP-98 spec, fetched from nips.nostr.com/98):
1. Reads `Authorization: Nostr <token>` header (throws "Missing Nostr authorization header" / "Missing Nostr authorization token" if absent/malformed).
2. Base64-decodes the token into a Nostr event (via `N64.decodeEvent`).
3. **Verifies the Schnorr signature** using `nostr-tools`' `verifyEvent` (default, overridable) — pure crypto via `@noble/curves/secp256k1` (confirmed in `nostr-tools/pure.ts`: `schnorr.verify(sig, hash, pubkey)`). Works in Node with no browser APIs.
4. Checks `kind === 27235`.
5. Checks the `u` tag equals `request.url` (the absolute request URL).
6. Checks the `method` tag equals `request.method`.
7. Checks `created_at` is within `maxAge` (default **60_000 ms = 60s**, matching the NIP-98 "suggestion 60 seconds").
8. For POST/PUT/PATCH, optionally validates the `payload` tag (SHA-256 of the request body) — on by default for those methods.

It returns the verified `NostrEvent` (from which you read `event.pubkey`) or throws a human-readable `Error`.

**This means the server-side NIP-98 verifier is ~5 lines of glue, not a from-scratch crypto implementation.** Use `@nostrify/nostrify`'s `NIP98.verify` — do NOT hand-roll Schnorr verification with `@noble/curves` and do NOT pull a separate NIP-98 library. Both `@nostrify/nostrify` and `nostr-tools` are already dependencies; `NIP98.verify` uses `nostr-tools`' `verifyEvent` under the hood, so the crypto path is the same one the SPA trusts.

**Why not raw `nostr-tools.verifyEvent` alone?** `verifyEvent` only checks the signature + id hash. NIP-98 also requires kind, URL, method, and freshness checks. `NIP98.verify` does all of them. Building those checks by hand is reinventing `NIP98.verify`. Use the library.

### 3.2 The nginx-proxy URL reconstruction caveat (critical implementation detail)

`NIP98.verify` checks `u !== request.url` — the `u` tag the SPA signed vs. `request.url` the server sees. **Behind nginx, `request.url` in the Node process is the *local* proxied URL** (e.g. `http://127.0.0.1:3001/api/email/admin/settings`), but the SPA signed the *public* URL (e.g. `https://relay.example.com/api/email/admin/settings`). These differ → every legit request fails verification.

**Fix:** reconstruct the public URL from forwarded headers before calling `NIP98.verify`. Hono on `@hono/node-server` exposes the raw request; build a new `Request` with the public URL:
```ts
function publicRequest(c: Context): Request {
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || '';
  const path = c.req.raw.url.replace(/^https?:\/\/[^/]+/, ''); // strip any local origin
  const url = `${proto}://${host}${path}`;
  return new Request(url, c.req.raw);
}
```
The nginx snippet (D-02/D-03) must send `X-Forwarded-Proto` and `X-Forwarded-Host` (or `Host`) — standard forwarded headers. **This is the single most likely bug in this phase; flag it in the plan and test it explicitly** (§7: a test that signs against the public URL and verifies through a proxied-style request).

### 3.3 Master-pubkey resolution (server-side)

The SPA pattern (`src/hooks/useRemoteNostrJson.ts` lines 28-44) resolves the master pubkey from `nostr.json`'s `names._` entry, falling back to `getMasterPubkey()`. The server parallels this but has no `VITE_*` env (those are build-time, baked into the SPA bundle). **Server-side resolution:**

1. **`MASTER_PUBKEY` env var** (server-side, NOT `VITE_` — secrets/server config are never `VITE_*` per AGENTS.md hard constraint). If set, use it (lowercased, trimmed). This is the server analog of `VITE_MASTER_PUBKEY`.
2. **Else fetch `/.well-known/nostr.json` over HTTP from swarm** and read `names._` (matching `useRemoteNostrJson` line 30: `nostrJson?.names?._?.toLowerCase().trim()`). The fetch URL: `SWARM_BASE_URL` env var (e.g. `https://relay.example.com`) + `/.well-known/nostr.json`, OR derive from the request's own host (the email service and swarm share the domain in a unified self-hosted deploy). **Recommendation:** `SWARM_BASE_URL` env (explicit, testable); fall back to deriving from `X-Forwarded-Host` if unset. Cache the result (5 min TTL, matching the SPA's `staleTime: 5 * 60 * 1000` on line 24) so we don't fetch nostr.json on every admin request.

**File:** `server/auth/masterPubkey.ts` — `resolveMasterPubkey(): Promise<string>` with the env-then-fetch + cache logic. **File:** `server/auth/nip98.ts` — the Hono middleware:
```ts
import { NIP98 } from '@nostrify/nostrify';
export function nip98AdminAuth() {
  return async (c: Context, next: Next) => {
    try {
      const event = await NIP98.verify(publicRequest(c), { maxAge: 60_000 });
      const master = await resolveMasterPubkey();
      if (event.pubkey.toLowerCase() !== master.toLowerCase()) {
        return c.json({ error: 'not authorized' }, 403);
      }
      c.set('adminPubkey', event.pubkey); // for downstream handlers
      await next();
    } catch (e) {
      return c.json({ error: (e as Error).message }, 401);
    }
  };
}
```
**SRV-03 satisfied:** rejects unsigned (401), rejects non-master (403), accepts valid NIP-98 from master (200).

### 3.4 SPA-side: reuse `fetchWithNip98` unchanged

The existing `fetchWithNip98` in `src/hooks/useScheduledPosts.ts` (lines 26-88) already produces exactly the token format `NIP98.verify` consumes: kind 27235, `['u', url]`, `['method', method]`, base64 of the signed event, `Authorization: Nostr <token>` header. **No SPA changes needed for auth** — new admin email hooks (`useEmailSettings`, etc., Phase 2+) will call `fetchWithNip98` against `/api/email/admin/*`. Phase 1 only needs the server verifier + a test that the SPA's token format round-trips through `NIP98.verify`.

---

## 4. nginx Routing + Process Supervisor

### 4.1 nginx snippet (D-02, D-03)

**File:** `server/deploy/nginx.example.conf` — a static, copy-paste reference (per CONTEXT.md "specifics": explicit and static, not magic). Content:

```nginx
# Email service — copy into your existing server { } block.
# Substitute EMAIL_PORT (default 3001) and ensure the Node process is running.
location /api/email/ {
    proxy_pass http://127.0.0.1:${EMAIL_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    client_max_body_size 10m;     # covers future Phase 4 CSV uploads
    proxy_read_timeout 60s;       # covers slow admin operations
}
```

**Routing logic:** nginx longest-prefix-match means `location /api/email/` wins over a broader `location /api/` (swarm). So `/api/email/*` → Node service, everything else under `/api/` → swarm. No nginx-level rate limiting (D-03: rate limiting is server-side, Phase 5). No WebSocket upgrade headers (email API is HTTP-only). `X-Forwarded-Host` + `X-Forwarded-Proto` are present so the URL-reconstruction in §3.2 works.

**Health endpoint (D-04):** `/api/email/health` is public, no auth, proxied through nginx, returns `{"ok":true}` with no DB details/subscriber counts. A deeper admin health (DB + config) is Phase 2 behind auth. Register it *before* the `nip98AdminAuth` middleware in Hono so it's excluded from auth.

### 4.2 Process supervisor: systemd (recommended)

The relay box already runs swarm (a long-running Go process). **Recommendation: systemd** for the email service. Rationale:
- **No new runtime dependency** — systemd is already the init system on any modern Linux relay box. PM2 would add a Node process manager + its own update surface; docker adds a daemon + image build. swarm is presumably already supervised (systemd or a bare process); matching that is simplest.
- **Survives reboots, captures logs to journald, has restart-on-failure** — all built in.
- **One unit file** — `server/deploy/nostr-cms-email.service` (a template the installer edits for paths/env):

```ini
[Unit]
Description=nostr-cms email service
After=network.target

[Service]
Type=simple
WorkingDirectory=/app/nostr-cms
EnvironmentFile=/app/nostr-cms/server/deploy/email.env
ExecStart=/usr/bin/npx tsx server/index.ts
Restart=on-failure
RestartSec=5
User=nostr-cms

[Install]
WantedBy=multi-user.target
```
With `email.env` containing `EMAIL_PORT=3001`, `EMAIL_DB_PATH=/app/email.db`, `EMAIL_DB_BACKEND=sqlite`, `MASTER_PUBKEY=...`, `SWARM_BASE_URL=https://relay.example.com`, `RESEND_API_KEY=...` (Phase 2). The installer enables it only if they want email (SRV-05: opt-in).

Rejected: **PM2** (extra dep, cluster mode unnecessary for one process), **docker** (overkill for one Node process on a box that already runs swarm bare), **bare `node` + nohup** (no restart-on-failure, no log management). The planner can confirm, but systemd is the lowest-friction choice for a relay box already running a long-lived process.

---

## 5. ESLint Guard for Server-Only Imports

### 5.1 Mechanism: `no-restricted-imports` (recommended) + path-boundary via custom rule

The codebase uses ESLint flat config (`eslint.config.js`, lines 1-74) with a `custom` plugin loaded from `eslint-rules/index.js` (lines 1-11). Two things to enforce:

1. **`src/` must not import server-only npm packages** (`resend`, `better-sqlite3`, `csv-parse`, `pg`). → Use ESLint's built-in **`no-restricted-imports`** rule, scoped to `src/**` files. No new plugin needed.
2. **`src/` must not import from `server/`** (the path boundary). → Either `no-restricted-imports` with path patterns, or a tiny custom rule in `eslint-rules/` (the infra already exists — see `no-inline-script.js` as a template).

**Recommendation:** use `no-restricted-imports` for both (simplest, built-in, no custom rule maintenance). Add a new config block in `eslint.config.js` scoped to `src/**`:

```js
// Add this block inside tseslint.config(...), after the existing TS block:
{
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        { name: "resend", message: "resend is server-only. Import it from server/ only." },
        { name: "better-sqlite3", message: "better-sqlite3 is server-only. Import it from server/ only." },
        { name: "csv-parse", message: "csv-parse is server-only. Import it from server/ only." },
        { name: "pg", message: "pg is server-only. Import it from server/ only." },
      ],
      patterns: [
        { group: ["server/*", "../server/*", "../../server/*"], message: "Importing from server/ is forbidden in src/ (server-only boundary)." },
      ],
    }],
  },
},
```

**Why `no-restricted-imports` over `eslint-plugin-import`'s `no-restricted-paths`:** `eslint-plugin-import` is not installed (not in `package.json` devDeps, lines 94-119) and brings a heavy dependency + resolver config. `no-restricted-imports` is built into ESLint core and handles both the package-name and path-pattern cases. The `patterns` option catches `server/` relative imports.

**Why not a custom rule in `eslint-rules/`:** the infra exists (`eslint-rules/index.js`), but a custom rule for "don't import these packages" is reinventing `no-restricted-imports`. Save custom rules for things ESLint can't do natively (the existing `no-inline-script`, `no-placeholder-comments`, `require-webmanifest` are good examples). The planner can choose a custom rule if they want a smarter path-boundary check (e.g. resolving `@/` aliases), but `no-restricted-imports` covers SRV-01's "never importable from `src/`" requirement directly.

**Note on `server/` linting:** the existing config block (lines 13-47) applies to `**/*.{ts,tsx}` — that includes `server/`. Server files legitimately import `better-sqlite3` etc., so the guard must be scoped to `src/**` only (as above). Server files get their own lint pass (the `server:check` script + eslint on `server/`); consider a separate flat-config block for `server/**` with Node globals (`globals.node`) instead of browser globals.

---

## 6. `useEmailEnabled()` Hook + Config Flag

### 6.1 Mirror `getMasterPubkey()` exactly (env wins over meta tag)

The existing pattern in `src/lib/relay.ts` (lines 38-57): `getMasterPubkey()` checks `import.meta.env.VITE_MASTER_PUBKEY` first, then `getSwarmConfig().masterPubkey`, then returns `''`. `getSwarmConfig()` (lines 20-32) parses `<meta name="swarm-config">` JSON. **`useEmailEnabled()` mirrors this:**

**Step 1 — extend `SwarmConfig` interface** (`src/lib/relay.ts` lines 12-15):
```ts
interface SwarmConfig {
  masterPubkey?: string;
  relayName?: string;
  email_enabled?: boolean;  // NEW
}
```

**Step 2 — add `getEmailEnabled()` to `src/lib/relay.ts`** (pure function, testable like `getMasterPubkey`):
```ts
export function getEmailEnabled(): boolean {
  const envEnabled = import.meta.env.VITE_EMAIL_ENABLED;
  if (envEnabled !== undefined) {
    return String(envEnabled).toLowerCase() === 'true';
  }
  const injected = getSwarmConfig().email_enabled;
  if (injected !== undefined) return !!injected;
  return false; // default off (SRV-05)
}
```
**Priority: env wins over meta tag** (per CONTEXT.md deferred: follow `getMasterPubkey` for consistency). **Default: false** when neither set (SRV-05: opt-in, default off). Note: `VITE_EMAIL_ENABLED` is a *public* value (it only controls UI visibility, not secrets), so it's a legitimate `VITE_*` var — unlike the Resend key.

**Step 3 — `useEmailEnabled()` hook** (`src/hooks/useEmailEnabled.ts`):
```ts
import { getEmailEnabled } from '@/lib/relay';
export function useEmailEnabled(): boolean {
  return getEmailEnabled();
}
```
It's a thin hook (no TanStack Query needed — the value is read synchronously from env/meta at render, like `getMasterPubkey` is used directly in `useAdminAuth` at `useRemoteNostrJson.ts` line 31). If the meta tag can change at runtime without a reload (it can't — it's baked into `index.html` by swarm at serve time), no refetch is needed; a page reload picks up changes. This matches the existing pattern's simplicity.

### 6.2 Gate the admin nav entry

In `src/components/admin/AdminLayout.tsx`, the `navigation` array (lines 94-114) already uses conditional spread for `isSchedulerHealthy` (line 98) and `canAccessSettings` (lines 108-111). **Add the email nav entry gated on `useEmailEnabled()`:**

```tsx
import { useEmailEnabled } from '@/hooks/useEmailEnabled';
import { Mail } from 'lucide-react'; // add to the lucide import block (lines 16-37)
// ...
const emailEnabled = useEmailEnabled();
// in the navigation array, after the Scheduled entry (line 98) or near Settings:
...(emailEnabled ? [{ name: 'Email', href: '/admin/email', icon: Mail }] : []),
```

**Phase 1 only adds the sidebar gating hook + the nav entry.** The `/admin/email` route + page (`AdminEmailPage.tsx`) are Phase 2+ (per CONTEXT.md "Established Patterns": Phase 1 only adds the sidebar gating hook, not pages). If the nav entry links to a route that doesn't exist yet, either (a) defer adding the nav entry until Phase 2, or (b) add the nav entry now and a stub route in `AppRouter.tsx` that renders "coming soon". **Recommendation:** add the `useEmailEnabled()` hook + the `getEmailEnabled()` function in Phase 1 (SRV-05 requires the toggle to exist and work), but **defer the nav entry itself to Phase 2** when the route exists — otherwise the link 404s. The success criterion (SRV-05: "no email admin nav item" when false) is satisfied by the hook existing and being ready; the *visible* nav entry lands with the page. The planner should confirm this interpretation — the criterion says "renders no email admin nav item" which is trivially true if the item isn't added yet, but the *gating mechanism* must exist in Phase 1.

**Public signup gating** (the `SignupModule`) is Phase 3; Phase 1 only establishes `useEmailEnabled()` so Phase 3 can gate on it.

### 6.3 swarm-config meta tag + runtime toggle without rebuild

The `<meta name="swarm-config">` tag is injected by swarm's Go server at serve time (`relay.ts` lines 6-9 comment). Adding `email_enabled` to that JSON lets an installer toggle email at runtime without a frontend rebuild — they edit the swarm-config (in swarm's config, separate repo) and reload. `VITE_EMAIL_ENABLED=true` is the build-time override (baked into the bundle). This matches the `masterPubkey` dual-path exactly. **No swarm code change is needed in this repo** — the swarm repo's config template is a separate-repo follow-up (per AGENTS.md: swarm is separate).

---

## 7. Validation Architecture

This section exists so the Nyquist validation strategy can be created from it. It covers what to test, how to test, and edge cases.

### 7.1 What to test (by component)

| Component | Test target | Type |
|---|---|---|
| `NIP98.verify` glue + URL reconstruction | Valid NIP-98 from master → 200; missing header → 401; bad signature → 401; valid sig but non-master pubkey → 403; expired (>60s) → 401; wrong URL → 401; wrong method → 401; proxied URL reconstruction (X-Forwarded-*) | Unit + integration |
| `resolveMasterPubkey` | `MASTER_PUBKEY` env set → returns it; env unset + nostr.json fetch → returns `names._`; env unset + fetch fails → graceful error; cache hit (5 min) | Unit (mock fetch) |
| `SubscriberRepository` (SQLite impl) | CRUD for each entity (subscribers, settings, tokens, send_log, delivery_events); `unique(site_id, email)` enforced; `site_id` scoping (cross-site isolation); status transitions; token invalidate-after-use | Integration (in-memory SQLite) |
| Migration runner | Idempotency (run twice → second is no-op); applies in order; `schema_migrations` recorded; missing file → error | Integration |
| WAL mode | `PRAGMA journal_mode` returns `wal` after open | Integration (one assertion) |
| Online backup | `db.backup(dest)` produces a valid, openable DB file with the same row count; backup works while a write is in progress | Integration |
| ESLint guard | `src/` file importing `resend` → lint error; `src/` file importing `better-sqlite3` → error; `src/` file importing from `server/` → error; `server/` file importing `better-sqlite3` → no error | Unit (ESLint rule test) |
| `getEmailEnabled` / `useEmailEnabled` | `VITE_EMAIL_ENABLED=true` → true; `=false` → false; unset + meta `email_enabled:true` → true; unset + meta absent → false; env set + meta set → env wins (priority); env=`"true"` string coercion | Unit (jsdom, set `import.meta.env` + meta tag) |
| Health endpoint | `GET /api/email/health` → 200 `{"ok":true}`, no auth required, no DB details in body | Integration (Hono app) |

### 7.2 How to test

- **Pure functions** (`getEmailEnabled`, `resolveMasterPubkey` with mocked fetch, URL reconstruction helper) → **Vitest unit tests**, co-located (`*.test.ts`), matching the existing pattern (`src/lib/relay.test.ts` lines 1-27 uses `vitest` + `describe/it/expect`). Set `import.meta.env.VITE_*` via Vitest's env or `vi.stubEnv`; set the meta tag via `document.head.innerHTML` in jsdom (the existing test setup is jsdom, `vite.config.ts` line 31).
- **Repository against SQLite** → **Vitest integration tests** using a *temporary in-memory or temp-file SQLite DB* (`:memory:` or `tmpdir`/`email.test.db`), run migrations, exercise the interface. These double as the shared contract suite for the future Postgres impl (P9) — structure them as `describeEachBackend([sqlite])` so adding `postgres` later is one line.
- **NIP-98 verify/reject** → unit test the middleware by constructing a Hono app with the auth middleware, signing a real kind 27235 event with `nostr-tools`' `generateSecretKey`/`finalizeEvent` (pure crypto, works in Node), and asserting status codes. Test the proxy-URL reconstruction by passing a `Request` with `X-Forwarded-*` headers and a `u` tag matching the *public* URL.
- **ESLint guard** → a RuleTester-style test (ESLint's `RuleTester`) that feeds sample `src/` files and asserts the rule fires/doesn't fire. The codebase doesn't have an existing ESLint rule test, but `RuleTester` is standard; add `eslint-rule.test.ts` alongside `eslint-rules/`. (If using `no-restricted-imports`, the test is just "run ESLint on a fixture file and assert errors" — simpler.)
- **Migration idempotency** → call the runner twice on the same temp DB; assert `schema_migrations` rows == file count and no error on second run.
- **Health endpoint** → `@hono/node-server` in a test, fetch `/api/email/health`, assert 200 + body.

### 7.3 Edge cases to cover

- **NIP-98 forged tokens:** valid signature from a *non-master* pubkey (→ 403, not 200); tampered `sig` (→ 401); `created_at` skewed +61s (→ 401); `u` tag pointing at a different endpoint (replay attempt → 401); `method` mismatch (GET event on a POST route → 401); payload tag present but body tampered (→ 401).
- **Missing nostr.json:** swarm down or `/.well-known/nostr.json` 404 → `resolveMasterPubkey` should fail closed (reject all admin requests with 500/503) rather than allow through. Test this.
- **DB locked:** SQLite `SQLITE_BUSY` under contention — `better-sqlite3` throws synchronously; the repo should set a `busy_timeout` pragma (`db.pragma('busy_timeout = 5000')`) and the test should assert a write during a (simulated) long op doesn't corrupt. WAL makes this rare; test the timeout path.
- **env + meta both set:** `VITE_EMAIL_ENABLED=true` + meta `email_enabled:false` → env wins → `true` (priority test). The reverse (`VITE=false`, meta `true`) → `false` (env wins). This is the consistency guarantee with `getMasterPubkey`.
- **`email_enabled` absent everywhere:** → `false` (default off, SRV-05). No email nav, no signup. Test the default.
- **Proxy URL mismatch:** SPA signs `https://relay.example.com/api/email/admin/settings`; server sees `http://127.0.0.1:3001/api/email/admin/settings` without reconstruction → would 401. Test that with `X-Forwarded-Proto`/`X-Forwarded-Host` reconstruction it 200s. (This is the §3.2 caveat — the highest-risk bug.)
- **Migration re-run after a manual DB edit:** runner must not re-apply already-recorded versions even if the file still exists.
- **Backup during write:** start a backup, insert a row mid-backup, assert backup completes and contains the new row (single-connection guarantee).

---

## 8. Key Findings Summary (for the planner)

1. **Use `@nostrify/nostrify`'s `NIP98.verify(request)`** for server-side NIP-98 — it's already a dependency, does all spec checks (kind/sig/URL/method/age/payload), and uses `nostr-tools`' pure-crypto `verifyEvent` underneath. Do NOT hand-roll Schnorr. The SPA's existing `fetchWithNip98` token format round-trips through it unchanged.
2. **The nginx proxy-URL reconstruction is the #1 bug risk.** `NIP98.verify` checks `u === request.url`; behind nginx the server sees a local URL. Reconstruct the public URL from `X-Forwarded-Proto`/`X-Forwarded-Host` before verifying. Test this explicitly.
3. **Use Hono + `@hono/node-server`** as the server framework — its Web-standard `Request`/`Response` matches `NIP98.verify`'s API directly (Express's Node req/res would need a shim). Add `hono` + `@hono/node-server` deps.
4. **`SubscriberRepository` methods should all be `async`** so SQLite (sync) and Postgres (async) share one interface. Ship only SQLite in Phase 1; the interface is proven by one impl before the second exists (P9).
5. **Migrations = raw SQL files (`NNN.sqlite.sql` / `NNN.postgres.sql`) + a ~30-line runner**, tracked in `schema_migrations`. No migration library (two dialects, same schema).
6. **WAL + online backup:** `db.pragma('journal_mode=WAL')` on open; `db.backup(dest)` for online backup (single-connection, safe during writes). Document the cron line; ship the backup function + `server/deploy/README.md`.
7. **ESLint guard = built-in `no-restricted-imports`** scoped to `src/**`, forbidding `resend`/`better-sqlite3`/`csv-parse`/`pg` + `server/*` path patterns. No new ESLint plugin. Server files get a separate config block with Node globals.
8. **`useEmailEnabled()` mirrors `getMasterPubkey()` exactly:** `VITE_EMAIL_ENABLED` (env) wins over `email_enabled` (meta tag); default false. Add `email_enabled?: boolean` to `SwarmConfig` in `src/lib/relay.ts`.
9. **Process supervisor = systemd** (lowest friction on a relay box already running swarm). Ship a template unit file in `server/deploy/`.
10. **`server/` needs its own `tsconfig.json`** (Node types, no DOM lib) and a `server:check` script wired into CI, so server type errors fail `npm run test` without polluting the client type environment.

## RESEARCH COMPLETE
