# nostr-cms Email Service (server/)

A Node/TypeScript email newsletter service that runs alongside the nostr-cms
SPA. It exposes `/api/email/*` routes, stores subscriber PII in SQLite (WAL
mode), and sends via Resend. Server-only dependencies (`better-sqlite3`,
`resend`, `csv-parse`) are never imported from `src/` (enforced by an ESLint
guard).

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EMAIL_PORT` | `3001` | Port the HTTP service listens on (D-01). nginx proxies `/api/email/*` to `127.0.0.1:${EMAIL_PORT}`. |
| `EMAIL_DB_BACKEND` | `sqlite` | DB backend selector. `sqlite` (default, `better-sqlite3`) or `postgres` (additive, future). |
| `EMAIL_DB_PATH` | `./email.db` (dev) / `/app/email.db` (prod) | SQLite database file path. The installer sets this in prod. |
| `EMAIL_BACKUP_DIR` | `/app/backups` | Directory for daily online backups (`email.db.bak`). |
| `MASTER_PUBKEY` | _(unset)_ | Server-side master pubkey (analog of `VITE_MASTER_PUBKEY`). If unset, resolved from `/.well-known/nostr.json`. |
| `SWARM_BASE_URL` | _(unset)_ | Base URL for fetching `nostr.json` (e.g. `https://relay.example.com`). Falls back to deriving from `X-Forwarded-Host`. |

## Development

```bash
npm run server        # start the email service (tsx server/index.ts)
npm run server:dev    # watch mode (tsx watch)
npm run server:check  # type-check server/ with server/tsconfig.json (no DOM lib)
```

The service starts on port 3001 by default. The public health endpoint is
`GET /api/email/health` → `{"ok":true}` (no auth, no DB details — D-04).

## Production

Run the service as a long-running process on the relay box (systemd unit
provided in `server/deploy/` by plan 01-03). Either run via `tsx` directly or
compile `server/` to `dist-server/` and run `node dist-server/index.js`.

```bash
EMAIL_PORT=3001 EMAIL_DB_PATH=/app/email.db npm run server
```

nginx proxies `/api/email/*` to the service — see `server/deploy/nginx.example.conf`
(plan 01-03) for the snippet to paste into your nginx server block.

## Backups

Online backups use `better-sqlite3`'s native backup API (safe while the DB is
in use — single-connection pattern). A daily cron produces
`${EMAIL_BACKUP_DIR}/email.db.bak` with 7-day retention:

```cron
0 3 * * * cd /app/nostr-cms && EMAIL_DB_PATH=/app/email.db EMAIL_BACKUP_DIR=/app/backups npm run server:backup
```

(`npm run server:backup` runs `tsx server/db/backup.ts`, which opens the source
DB, backs it up to the destination, and deletes `email.db.bak*` files older
than 7 days by mtime.)

## Architecture

- **Framework:** Hono on `@hono/node-server` (Web-standard `Request`/`Response`
  — the NIP-98 verifier takes a real `Request`).
- **DB:** SQLite (`better-sqlite3`, WAL mode + `foreign_keys=ON` +
  `busy_timeout=5000`) behind the `SubscriberRepository` interface. Postgres is
  additive later via `EMAIL_DB_BACKEND=postgres`.
- **Migrations:** raw SQL files in `server/db/migrations/` (`NNN.sqlite.sql`),
  applied by a tiny idempotent runner recording `schema_migrations`.
- **Auth:** admin endpoints verify NIP-98 signatures in Node
  (`@nostrify/nostrify`'s `NIP98.verify`) and require the signer be the site
  master pubkey (plan 01-02).
- **PII:** subscriber emails/PII live only in this DB — never on Nostr relays.
