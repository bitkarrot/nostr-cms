# Architecture Research — Email Newsletter for nostr-cms

**Date:** 2026-07-04

## Current architecture (recap)

nostr-cms is a client-side SPA (Vite + React 18 + TS). Content lives on Nostr relays. The only server is the optional Go/Swarm ("bkrelay") backend that serves `/api/scheduler/*` and `/api/admin/*`, authenticated via NIP-98 (`fetchWithNip98` in `src/hooks/useScheduledPosts.ts`). Vite proxies `/api` to the relay host in dev (`vite.config.ts`). Production deploys to Vercel (static host).

## Target architecture for email

Add a **new TS serverless layer** + a **Supabase Postgres** subscriber store. Do not modify the Go backend. The SPA gains admin + public UI that calls the new endpoints.

```text
┌──────────────────────── Browser (SPA) ────────────────────────┐
│  Public site: SignupModule (toggleable)                        │
│  Admin: EmailSettings, Subscribers, CSV import, Send composer  │
└───────────────┬──────────────────────────────┬────────────────┘
                │ fetch (NIP-98 for admin)      │ redirect (verify/unsub)
                ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Vercel Serverless Functions  /api/email/*   (Node runtime, TS) │
│  - POST /subscribe        (public, double opt-in enqueue)       │
│  - GET  /verify?token=    (public, confirm subscription)        │
│  - GET  /unsubscribe?t=   (public, opt-out)                     │
│  - POST /admin/import-csv (NIP-98 admin, CSV → Supabase)        │
│  - GET  /admin/subscribers(NIP-98 admin, list/filter/segments)  │
│  - POST /admin/settings   (NIP-98 admin, SMTP key + rate limit) │
│  - POST /admin/send       (NIP-98 admin, targeted send job)     │
│  - POST /admin/trigger-post (NIP-98 admin or internal, new post)│
│  - POST /webhooks/resend  (Resend signature, delivery events)   │
│  - CRON /digest           (Vercel cron, weekly/monthly summary) │
└───────┬───────────────────────────────────────┬─────────────────┘
        │ service role                           │ API key
        ▼                                        ▼
┌──────────────────────┐               ┌──────────────────────┐
│ Supabase Postgres    │               │ Resend (email API)   │
│  subscribers         │               │  - send              │
│  segments            │               │  - delivery webhooks │
│  settings (smtp/rate)│               └──────────────────────┘
│  send_log            │
│  verify_tokens       │
└──────────────────────┘
```

## Component boundaries

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `SignupModule` | `src/components/email/SignupModule.tsx` | Public, toggleable signup form; calls `/api/email/subscribe` |
| `EmailVerifyPage` / `UnsubscribePage` | `src/pages/Email*.tsx` | Route handlers for token links |
| `AdminEmail*` | `src/components/admin/AdminEmail*.tsx` | Settings, subscribers, CSV import, send composer |
| `useEmailSubscribers`, `useEmailSettings` | `src/hooks/useEmail*.ts` | TanStack Query hooks (admin) |
| `emailApi` client | `src/lib/emailApi.ts` | Fetch wrapper + NIP-98 for admin routes |
| Server functions | `api/email/*.ts` (repo root `api/` for Vercel) | All server logic, Resend calls, Supabase writes |
| `supabase` server client | `api/email/_supabase.ts` | Service-role client (server only) |
| `rateLimiter` | `api/email/_rateLimiter.ts` | Token-bucket, reads setting from DB |
| Resend client | `api/email/_resend.ts` | Singleton, keyed by stored API key |

## Data model (Supabase Postgres)

- `subscribers(id uuid pk, site_id text, email text unique per site, name text?, npub text?, status text check in pending/active/unsubscribed, segment text[] , created_at, confirmed_at, bounced_at?, complained_at?)`
- `settings(site_id pk, module_enabled bool, resend_api_key_enc text, from_domain text, from_name text, rate_per_min int check 5..5000, digest_enabled bool, digest_cadence text?)`
- `verify_tokens(id uuid pk, subscriber_id fk, purpose text, expires_at)`
- `send_log(id uuid pk, subject, segment_filter jsonb, recipient_count int, status text, started_at, finished_at, post_event_id text?)`
- `delivery_events(id uuid pk, send_log_id fk, email, event text, at timestamptam)`

All tables carry `site_id` for future multi-tenant isolation; single-tenant now uses a constant site_id.

## Trigger flow: new blog post → email

Two viable triggers (pick during planning):
1. **Admin-initiated** (simplest, ships first): after publishing a NIP-23 post, admin clicks "Send to subscribers" in the blog admin; SPA calls `/api/email/admin/send` with the post event id + segment filter; function fetches the post content from the relay, renders via React Email template, rate-limits the batch send through Resend.
2. **Automatic** (later): a Vercel cron or relay-side webhook watches for new kind 23 events from the master pubkey and auto-triggers. Higher complexity (dedup, retry); defer to a later phase.

Recommend shipping admin-initiated first; automatic trigger is a follow-up phase.

## Auth model

- Public routes (`/subscribe`, `/verify`, `/unsubscribe`, `/webhooks/resend`) — no NIP-98. Verify/unsub use signed single-use tokens. Resend webhook verifies Resend signature.
- Admin routes — reuse the existing NIP-98 pattern (`fetchWithNip98`) and additionally check the signer is the master/owner pubkey (same admin auth the app already uses via `useRemoteNostrJson`).

## Deployment

- Vercel serves the `api/email/*` functions alongside the static SPA build. The existing Go/Swarm backend continues to serve `/api/scheduler/*` and `/api/admin/*` — to avoid path collision, either (a) route `/api/email/*` to Vercel functions and keep `/api/scheduler` + `/api/admin` proxied to the Go host via rewrites, or (b) namespace the new functions under `/api/email/*` only and add a `vercel.json` rewrite. Planning phase must resolve the exact proxy/rewrite split.
