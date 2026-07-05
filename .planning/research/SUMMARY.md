# Project Research Summary — nostr-cms Email Newsletter

**Date:** 2026-07-04
**Revised:** 2026-07-04 — server layer is now a Node/TS service in `nostr-cms/server/` (not Vercel functions); DB is SQLite-first with Postgres additive via a repository interface; swarm stays a separate, untouched repo.

## Executive Summary

nostr-cms is a production, single-tenant, client-side Nostr CMS (Vite + React 18 + TS) that deploys either self-hosted (relay box + nginx) or to Vercel (static host + InsForge/Postgres for `scheduled_posts`). The relay is **swarm** (`github.com/hivetalk/swarm`, a fork of `bitvora/team-relay`) — a separate Go repo using Badger (KV store), serving `/api/scheduler/*` and `/api/admin/*` with NIP-98 auth, plus `/.well-known/nostr.json`. The two repos are independent at code time, coupled at deploy time.

The email-newsletter milestone adds a server-side capability the SPA cannot provide: subscriber storage, double opt-in, SMTP-via-API sending, rate-limited batch sends, CSV ingest, and Geyser-style audience segments. Experts build this as a thin server layer + a transactional email API + a local relational store — not a self-hosted MTA and not a hosted newsletter platform (which would move the audience out of nostr-cms).

The recommended approach: **a Node/TS email service in a new `server/` folder inside the nostr-cms repo**, calling **Resend** for delivery, with **SQLite as the default subscriber database** (`better-sqlite3`) behind a `SubscriberRepository` interface so **Postgres is additive later**. The service verifies NIP-98 signatures itself (pure crypto), fetches `nostr.json` over HTTP from swarm, and reads post events from the relay as a websocket client — it has no code dependency on swarm. swarm stays a separate, upstream-trackable repo.

This shape was chosen over the earlier Vercel-functions + new-Supabase design because: a long-running Node process has a persistent filesystem (SQLite viable) and no function timeout (rate-limited batch sends of any size just work); SQLite is the simplest DB for single-tenant creator scale and drops a network dependency + a bill; and keeping swarm separate preserves its standalone utility and upstream trackability.

Key risks are secrets leaking into the client bundle, PII accidentally touching Nostr relays, double-opt-in token forgery, SQLite concurrency/backup, and DB-backend drift between the two repository implementations. All are preventable with hard `server/` vs `src/` boundaries, server-only imports + an ESLint guard, signed single-use tokens, WAL mode + online backup, and a shared repository contract test suite.

## Key Findings

### Stack
- **Resend** for the email API: first-class TS SDK, React Email templates match the codebase, 3k free / $20 for 50k, SOC 2. Rejected SendGrid (free tier retired May 2025), Mailgun (no free tier, 4x cost), Buttondown/Kit (hosted platforms, not APIs — would move the list out of nostr-cms), SES (raw infra, overkill).
- **Node/TS service in `nostr-cms/server/`** for the server layer: same language as frontend, full npm, long-running (no timeout), persistent FS (SQLite viable). Rejected Vercel functions (ephemeral FS rules out SQLite, timeout forces resume complexity), rejected extending swarm (Go work, harms upstream tracking).
- **SQLite (`better-sqlite3`) default**, Postgres additive via `SubscriberRepository` interface: SQLite is simplest for single-tenant creator scale, no network hop, backup = copy the file. Postgres available for deployers who already have InsForge/Postgres or outgrow single-host SQLite. `EMAIL_DB_BACKEND=sqlite|postgres` selects.
- No new client deps; reuse shadcn/ui, react-hook-form, zod, TanStack Query. `resend` + `better-sqlite3` + `csv-parse` are server-only.

### Features
- **Table stakes:** toggleable public signup, double opt-in, unsubscribe, admin CSV import, admin SMTP/API-key config + test, rate limit (5–5000/min), subscriber list admin, auto-send new blog posts, audience segments (Followers/Contributors/Reward buyers).
- **Should-have:** Kind 1 digest (weekly/monthly), send preview + recipient count, Resend delivery webhook ingestion (bounce/complaint suppression).
- **Deferred:** Plebian Market sales, A/B testing, visual template builder, multi-tenant, paid tiers.

### Architecture
- New Node/TS service in `nostr-cms/server/`; swarm untouched, separate repo. SPA gains `SignupModule`, verify/unsubscribe pages, and `AdminEmail*` components.
- Service talks to swarm only over HTTP/WS: fetches `nostr.json` for admin pubkey verification, reads post events from the relay as a WS client.
- Admin routes use NIP-98 verified in Node + master-pubkey check; public routes use signed single-use tokens; Resend webhook verifies signature.
- **Trigger:** ship admin-initiated "Send to subscribers" first (simple, deduped by `send_log.post_event_id`); automatic kind-23 trigger is a later phase.
- Data model: `subscribers`, `settings`, `verify_tokens`, `send_log`, `delivery_events` — all carry `site_id`. Same schema, two migration dialects (SQLite, Postgres).
- **Deploy:** self-hosted runs `npm run server` on the relay box (SQLite at `/app/email.db`, nginx adds one `location /api/email/` block); hosted runs the same code with `EMAIL_DB_BACKEND=postgres` against existing InsForge/Postgres.

### Pitfalls
- Critical: secrets in client bundle (server-only imports + ESLint guard), PII on relays (hard no), token forgery (HMAC + single-use + TTL), rate-limit semantics (server token bucket over a batch job, not per request).
- Moderate: CAN-SPAM/GDPR footer + consent record, SQLite WAL + online backup (not raw file copy), CSV size/consent guardrails, deliverability warmup, DB-backend drift (shared repository contract test suite).
- Minor: duplicate-event triggers, low test coverage (add unit tests for rate limiter/tokens/CSV/repository), split admin components to avoid the 1886-line `AdminForms` anti-pattern, resist the temptation to modify swarm's Go code for email features.

## Implications for Roadmap

Suggested phase order (Standard granularity → 6 phases). Dependencies flow top-down:

1. **Server foundation + DB interface + admin auth** — Node/TS service scaffold in `server/`, `SubscriberRepository` interface + SQLite implementation + migrations, NIP-98 verification in Node, nginx location block, ESLint guard. *Nothing user-visible yet.* Research flag: yes.
2. **Admin SMTP/API config + rate-limit setting UI** — admin enters Resend key + sending domain + rate limit + postal address; connection test email. First user-visible admin surface; depends on Phase 1.
3. **Public signup + double opt-in + unsubscribe** — toggleable `SignupModule`, subscribe endpoint, confirmation email, verify + unsubscribe pages. First public-facing surface. Standard patterns; light research.
4. **Admin CSV import + subscriber list management + segments** — CSV upload/parse/validate, subscriber table UI, segment assignment (Followers/Contributors/Reward buyers).
5. **Send pipeline: post → email + rate-limited batch send + send preview/recipient count** — admin-initiated send of a NIP-23 post to a segment, React Email template, token-bucket rate limiter, send_log with persistent progress. Research flag: yes.
6. **Kind 1 digest + Resend delivery webhooks + bounce/complaint suppression** — recurring summary emails, webhook ingestion, auto-suppression. Should-have polish.

Phases 1–2 are the vertical spine (server + config). Phases 3–4 are the audience-acquisition half. Phases 5–6 are the distribution half.

## Research Flags (which phases need deeper research)

| Phase | Research? | Why |
|-------|-----------|-----|
| 1 Server foundation + DB interface | Yes | NIP-98 verification in Node; `SubscriberRepository` interface design; SQLite WAL + online backup; nginx location block; ESLint guard for `server/`-only imports |
| 2 Admin config UI | No | Standard shadcn form patterns |
| 3 Signup + double opt-in | Light | Standard; confirm token pattern |
| 4 CSV import + segments | Light | csv-parse streaming; standard table UI |
| 5 Send pipeline + rate limiter | Yes | Resend batch send + persistent progress across process restarts; token-bucket correctness |
| 6 Digest + webhooks | Light | In-process cron; Resend webhook signature |

## Confidence

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | High | Resend + Node service + SQLite are mainstream, well-documented, fit the existing self-hosted deploy model |
| Features | High | Geyser reference doc + clear owner requirements |
| Architecture | High | Clean seam: service talks to swarm over HTTP/WS only; SQLite colocated on relay box; Postgres additive for hosted deploy |
| Pitfalls | High | Standard email-compliance + secrets + SQLite-concurrency pitfalls, all have known mitigations |

## Gaps to Address During Planning

- Exact nginx location block + port for the email service on the relay box (and whether `install-meetup-space.sh` in swarm gets a one-line addition now or later).
- Whether the Resend API key is stored encrypted in the DB `settings` table (admin-editable) or only in env vars (simpler, not admin-editable) — planning decides.
- React Email template strategy: render from NIP-23 markdown content vs. a fixed template that links back to the site.
- Whether to ship admin-initiated send only in Phase 5 and defer auto-trigger to a v2 phase, or combine.
- SQLite → Postgres migration path: do we ship the Postgres implementation in Phase 1 (behind the interface) or defer until a deployer actually needs it? Recommendation: defer (ship SQLite first, prove the interface, build Postgres on demand).
