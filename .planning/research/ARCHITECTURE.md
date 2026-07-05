# Architecture Research — Email Newsletter for nostr-cms

**Date:** 2026-07-04
**Revised:** 2026-07-04 — email service is now a Node/TS service in `nostr-cms/server/`, not Vercel functions; DB is SQLite-first with Postgres additive via a repository interface.

## Current architecture (recap)

nostr-cms is a client-side SPA (Vite + React 18 + TS). Content lives on Nostr relays. The relay is **swarm** (`github.com/hivetalk/swarm`, a fork of `bitvora/team-relay`) — a separate Go repo using Badger (KV store) for Nostr events, serving `/api/scheduler/*` and `/api/admin/*` with NIP-98 auth, plus `/.well-known/nostr.json`. The two repos are independent (no submodule, no shared code) but coupled at deploy time via `setup/install-meetup-space.sh` and an nginx reverse-proxy template. Vite proxies `/api` to the relay host in dev. Production deploys either self-hosted (relay box + nginx) or to Vercel (static host + InsForge/Postgres for `scheduled_posts`).

## Target architecture for email

Add a **Node/TS email service in a new `server/` folder inside the nostr-cms repo**, with a **pluggable DB** (SQLite default, Postgres additive). Do not modify swarm. The SPA gains admin + public UI that calls the new service. The service talks to swarm only over the same HTTP/WS interfaces any external client uses.

```text
┌──────────────────────── Browser (SPA) ────────────────────────┐
│  Public site: SignupModule (toggleable)                        │
│  Admin: EmailSettings, Subscribers, CSV import, Send composer  │
└───────────────┬──────────────────────────────┬────────────────┘
                │ fetch (NIP-98 for admin)      │ redirect (verify/unsub)
                ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Node/TS email service  (nostr-cms/server/, long-running)       │
│  /api/email/subscribe        (public, double opt-in enqueue)    │
│  /api/email/verify?token=    (public, confirm subscription)     │
│  /api/email/unsubscribe?t=   (public, opt-out)                  │
│  /api/email/admin/import-csv (NIP-98 admin, CSV → DB)           │
│  /api/email/admin/subscribers(NIP-98 admin, list/filter/segment)│
│  /api/email/admin/settings   (NIP-98 admin, SMTP key + rate)    │
│  /api/email/admin/send       (NIP-98 admin, targeted send job)  │
│  /api/email/admin/trigger-post (NIP-98 admin, new post)         │
│  /api/email/webhooks/resend  (Resend signature, delivery events)│
│  /api/email/cron/digest      (internal cron, weekly/monthly)    │
│                                                                 │
│  auth/      — NIP-98 verify (pure crypto) + master-pubkey check │
│              against nostr.json fetched over HTTP from swarm    │
│  db/        — SubscriberRepository interface                    │
│              ├── SqliteSubscriberRepository (better-sqlite3)    │
│              └── PostgresSubscriberRepository (additive later)  │
│  email/     — Resend client + React Email templates             │
│  rateLimiter— token bucket, reads rate from DB settings         │
└───────┬───────────────────────────────────────┬─────────────────┘
        │ reads post events (WS client)          │ API key
        ▼                                        ▼
┌──────────────────────┐               ┌──────────────────────┐
│ swarm (Go relay,     │               │ Resend (email API)   │
│  SEPARATE repo,      │  HTTP/WS only │  - send              │
│  Badger KV, untouched)│ ◄──────────  │  - delivery webhooks │
│  /.well-known/       │  nostr.json   └──────────────────────┘
│  nostr.json          │  fetch + WS
└──────────────────────┘
        ▲
        │ SQLite file (default) lives next to Badger at /app/email.db
        │ OR Postgres (additive) — existing InsForge/Postgres for scheduled_posts
```

## Why this shape (vs. the earlier Vercel-functions + new-Supabase design)

- **SQLite viability:** a long-running Node process has a persistent filesystem; Vercel functions don't. SQLite is the simplest DB for single-tenant creator scale and drops a network dependency + a bill.
- **No batch-send timeout pressure:** long-running process means rate-limited sends of any size just work — no resume-across-invocations complexity.
- **swarm stays clean:** no Go work, no upstream-tracking tax on `bitvora/team-relay`, no harm to swarm's standalone-utility.
- **One repo per feature:** email features are entirely in nostr-cms repo → one PR, one CI, atomic commits.
- **Deploy flexibility preserved:** self-hosters run `npm run server` on the relay box (SQLite); Vercel/hosted deployers run the same code with `EMAIL_DB_BACKEND=postgres` against existing InsForge/Postgres.

## Component boundaries

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `SignupModule` | `src/components/email/SignupModule.tsx` | Public, toggleable signup form; calls `/api/email/subscribe` |
| `EmailVerifyPage` / `UnsubscribePage` | `src/pages/Email*.tsx` | Route handlers for token links |
| `AdminEmail*` | `src/components/admin/AdminEmail*.tsx` | Settings, subscribers, CSV import, send composer (split into sub-files) |
| `useEmailSubscribers`, `useEmailSettings` | `src/hooks/useEmail*.ts` | TanStack Query hooks (admin) |
| `emailApi` client | `src/lib/emailApi.ts` | Fetch wrapper + NIP-98 for admin routes |
| Server entry | `server/index.ts` | HTTP server, route registration, startup (DB backend selection) |
| `auth/nip98.ts` | `server/auth/nip98.ts` | NIP-98 signature verification (pure crypto) + master-pubkey check via `nostr.json` fetch |
| `db/repository.ts` | `server/db/repository.ts` | `SubscriberRepository` interface |
| `db/sqlite.ts` | `server/db/sqlite.ts` | `SqliteSubscriberRepository` (better-sqlite3) — default |
| `db/postgres.ts` | `server/db/postgres.ts` | `PostgresSubscriberRepository` — additive later |
| `db/migrations/` | `server/db/migrations/{001.sqlite.sql, 001.postgres.sql}` | Dialect-specific migrations, same schema |
| `email/resend.ts` | `server/email/resend.ts` | Resend client singleton, keyed by stored API key |
| `email/templates/` | `server/email/templates/*.tsx` | React Email templates (post, digest, confirmation, unsubscribe footer) |
| `rateLimiter.ts` | `server/rateLimiter.ts` | Token-bucket, reads rate from DB settings |
| `cron/digest.ts` | `server/cron/digest.ts` | Weekly/monthly Kind 1 digest trigger |

## Data model (same schema, two dialects)

- `subscribers(id text pk, site_id text, email text, name text?, npub text?, status text check in pending/active/unsubscribed/bounced, segment text[], created_at, confirmed_at?, bounced_at?, complained_at?)` — `unique(site_id, email)`
- `settings(site_id pk, module_enabled bool, resend_api_key_enc text, from_domain text, from_name text, rate_per_min int check 5..5000, digest_enabled bool, digest_cadence text?, postal_address text?)`
- `verify_tokens(id text pk, subscriber_id fk, purpose text, expires_at)`
- `send_log(id text pk, subject, segment_filter json, recipient_count int, status text, started_at, finished_at, post_event_id text?)` — `unique(post_event_id)` where not null (dedup)
- `delivery_events(id text pk, send_log_id fk, email, event text, at timestamp)`

All tables carry `site_id` for future multi-tenant isolation; single-tenant now uses a constant site_id.

## Trigger flow: new blog post → email

Two viable triggers (pick during planning):
1. **Admin-initiated** (simplest, ships first): after publishing a NIP-23 post, admin clicks "Send to subscribers" in the blog admin; SPA calls `/api/email/admin/send` with the post event id + segment filter; service fetches the post content from the relay over WS, renders via React Email template, rate-limits the batch send through Resend.
2. **Automatic** (later): a cron in the email service polls the relay for new kind 23 events from the master pubkey and auto-triggers. Deduped via `send_log.post_event_id`. Higher complexity; defer to a later phase.

Recommend shipping admin-initiated first; automatic trigger is a follow-up phase.

## Auth model

- Public routes (`/subscribe`, `/verify`, `/unsubscribe`, `/webhooks/resend`) — no NIP-98. Verify/unsub use signed single-use tokens. Resend webhook verifies Resend signature.
- Admin routes — NIP-98 verified in Node (`server/auth/nip98.ts`, pure crypto, no swarm dependency) + check the signer is the master/owner pubkey. Master pubkey resolved from `VITE_MASTER_PUBKEY` (existing pattern) or by fetching `/.well-known/nostr.json` from swarm over HTTP and reading the `_` owner entry (matches the existing `useRemoteNostrJson` pattern in the SPA).

## Install-time opt-out (email module is optional)

The email module is **opt-in, default off** — not all nostr-cms installers want email. Two layers of gating:

1. **Install-time (this section):** controls whether email exists at all.
   - SPA: `VITE_EMAIL_ENABLED=true` (build-time override) or `email_enabled: true` in the `<meta name="swarm-config">` JSON (runtime, no rebuild) — same priority pattern as `masterPubkey` in `src/lib/relay.ts`. A `useEmailEnabled()` hook exposes the flag; email admin nav items and the public `SignupModule` gate on it. When false, no email UI renders and no email API calls are made.
   - Server: the email server is a separate process (`npm run server`). An installer who doesn't want email simply doesn't start it — no DB provisioned, no nginx location block added.
   - Installer: `install-meetup-space.sh` (in swarm) gets `--with-email` / `--without-email` (default `--without-email`), which writes the swarm-config `email_enabled` value and starts/not-starts the email server.

2. **Runtime (CFG-04, separate):** once email is installed, the site admin can toggle the public signup module on/off from the admin UI. This is stored in the DB `settings` table. It does not affect whether the email server runs — only whether the public signup form is shown.

The two toggles are layered: install-time decides existence; runtime decides signup visibility. An installer who opts out gets neither; an installer who opts in can still hide the signup form via CFG-04.

## Deployment

- **Self-hosted (primary):** `npm run server` on the relay box. SQLite file at `/app/email.db` (or configured path) next to Badger. nginx adds `location /api/email/ { proxy_pass http://127.0.0.1:<port>; }`. One more long-lived process on a box already running swarm.
- **Hosted/Vercel:** run the same Node service as a long-running process (Vercel doesn't run arbitrary long-lived Node, so this means a small VPS or a containerized deploy); set `EMAIL_DB_BACKEND=postgres` against the existing InsForge/Postgres. SQLite is not available on Vercel ephemeral FS — this is the honest constraint that makes SQLite the self-hosted default and Postgres the hosted path.
- **swarm install script update:** `setup/install-meetup-space.sh` (lives in swarm repo) gets a `--with-email` / `--without-email` flag (default `--without-email`) that writes the swarm-config `email_enabled` value and starts/not-starts the nostr-cms email server. That's a docs/config change in swarm, not a code merge.
