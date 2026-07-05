# Stack Research — Email Newsletter for nostr-cms

**Date:** 2026-07-04
**Revised:** 2026-07-04 — moved from Vercel-functions + new-Supabase to a Node/TS email service in the nostr-cms repo with SQLite-first pluggable DB.

## Recommendation

Build the email layer as a **Node/TS service in a new `server/` folder inside the nostr-cms repo**, calling **Resend** as the third-party email API, with **SQLite as the default subscriber database** (`better-sqlite3`) behind a `SubscriberRepository` interface so **Postgres is additive later**. Keep the Go/Swarm ("bkrelay") backend untouched as a separate, upstream-trackable repo. The email service verifies NIP-98 signatures itself (pure crypto), fetches `nostr.json` over HTTP from swarm, and reads post events from the relay as a websocket client — it has no code dependency on swarm.

## Email API — Resend

**Use Resend** because:
- First-class TypeScript SDK + native React Email templates — matches the React/TS codebase and lets posts render as emails from the same JSX mental model.
- Clean API, minutes to integrate. 3,000 emails/mo free, $20/mo for 50,000 — fits a single-tenant creator newsletter.
- SOC 2 Type II, good deliverability on shared pool, 99.9% webhook uptime SLA.
- Per-email sending rate is controlled by a token-bucket limiter we own (Resend does not expose a "5–5000/min" admin knob), which is exactly what the requirement asks for.

**Rejected alternatives:**
- **SendGrid** — retired its free tier in May 2025; heavier SDK; no React Email.
- **Mailgun** — no ongoing free tier, manual SPF/DKIM/DMARC, community-maintained TS SDK, ~4x cost of Resend at entry.
- **Buttondown / Kit / Beehiiv** — these are hosted newsletter *platforms*, not send APIs. Using one means the list/audience lives in their UI, not nostr-cms, which breaks the requirement that admins manage subscribers (CSV upload, segments) inside nostr-cms.
- **AWS SES** — cheapest at volume but raw infra, no React Email, more setup; overkill for single-tenant creator scale.
- **Self-hosted MTA** — explicitly out of scope (deliverability + compliance burden).

## Server layer — Node/TS service in `nostr-cms/server/`

**Use a Node/TS service colocated in the nostr-cms repo** because:
- Same language as the frontend — shared zod schemas, shared types where useful.
- Full npm ecosystem — Resend SDK, `better-sqlite3`, `csv-parse`, `crypto` all work.
- Long-running process → no function timeout → rate-limited batch sends of any size just work (no resume-across-invocations complexity).
- Persistent filesystem → SQLite is viable, which is the simplest DB for single-tenant creator scale.
- The nostr-cms repo already deploys as a unit; adding a `server/` subfolder keeps one repo, one PR per email feature.
- swarm stays a separate, upstream-trackable repo (`bitvora/team-relay` fork). No merge tax.

**Why not Vercel Serverless Functions (earlier research):** ephemeral filesystem rules out SQLite without an external layer (Turso/LiteFS) that re-introduces a network service; 300s timeout forces resume-across-invocations complexity for batch sends; splits the email codebase from the frontend repo unless you also adopt Vercel-only deploy.

**Why not extend the Go/Swarm backend:** would require Go work and a Go Resend client, splitting the email codebase from the TS frontend; harms swarm's standalone-utility and upstream-tracking of `bitvora/team-relay`.

**Deploy modes (same codebase):**
- **Self-hosted (primary):** run `npm run server` on the relay box, SQLite file next to Badger at `/app/email.db` (or a configured path). nginx adds one `location /api/email/ { proxy_pass http://127.0.0.1:<port>; }` block. One more long-lived process on a box you already operate.
- **Hosted/Vercel:** run the same Node service as a long-running function or on a small VPS; set `EMAIL_DB_BACKEND=postgres` against the existing InsForge/Postgres already provisioned for `scheduled_posts`. SQLite is not available on Vercel ephemeral FS.

## Subscriber DB — SQLite first, Postgres additive

**Use SQLite (`better-sqlite3`) as the default** because:
- Single-tenant, single-host, likely <10k subscribers — SQLite handles this trivially.
- No network hop, no extra credentials, no extra bill. Backup = copy the file.
- Colocated with the email service on the relay box — zero-latency local queries.
- The relay box already has persistent storage (`/app/db` for Badger); one more file costs nothing.

**Postgres is additive, not the default**, via a `SubscriberRepository` interface:
- `SqliteSubscriberRepository` ships first.
- `PostgresSubscriberRepository` ships later for deployers who already have InsForge/Postgres (the `scheduled_posts` table already lives there) or who outgrow single-host SQLite.
- `EMAIL_DB_BACKEND=sqlite|postgres` env var selects the implementation at startup.
- Two migration files (dialect differences only); same schema.

**Why not SQLite-in-swarm (Go):** would require Go work and split email logic from TS. The email service is TS in the nostr-cms repo; SQLite lives next to it, not inside swarm.

**Why not Supabase/Postgres as the default (earlier research):** overkill for single-tenant creator scale; adds a network dependency + a bill for a use case SQLite covers locally. Postgres remains available behind the same interface for deployers who want it.

## Frontend (no new deps)

- Reuse shadcn/ui (Switch, Dialog, Form, Table, Slider) for admin + signup UI.
- Reuse react-hook-form + zod for signup/CSV forms.
- Reuse TanStack Query for subscriber list / send-status mutations.
- Add `resend` only as a server-side dep, never imported by the client bundle.

## Versions to pin (server-side, new)

- `resend` — latest stable published ≥ 7 days ago at install time.
- `better-sqlite3` — latest stable.
- `csv-parse` — for CSV ingest server-side.
- `zod` — already a client dep; reuse on server.
- (additive, later) `pg` or `@supabase/supabase-js` for the Postgres implementation.

## Secrets layout (server-only env vars)

- `RESEND_API_KEY` — never in `VITE_*`.
- `EMAIL_DB_BACKEND` — `sqlite` (default) or `postgres`.
- `EMAIL_DB_PATH` — SQLite file path (self-hosted).
- `POSTGRES_URL` / `INSFORGE_BASE_URL` + `INSFORGE_ANON_KEY` — only when `EMAIL_DB_BACKEND=postgres`.
- `EMAIL_FROM_DOMAIN` — verified sending domain.
- `NOSTR_JSON_URL` — where to fetch `nostr.json` for admin pubkey verification (defaults to the relay's `/.well-known/nostr.json`).
- Rate limit + module toggle stored in the DB `settings` table, editable from admin UI (not env vars).
