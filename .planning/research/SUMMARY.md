# Project Research Summary — nostr-cms Email Newsletter

**Date:** 2026-07-04

## Executive Summary

nostr-cms is a production, single-tenant, client-side Nostr CMS (Vite + React 18 + TS) that deploys to Vercel alongside an optional Go/Swarm backend serving `/api/scheduler/*` and `/api/admin/*` with NIP-98 auth. The email-newsletter milestone adds a server-side capability the SPA cannot provide: subscriber storage, double opt-in, SMTP-via-API sending, rate-limited batch sends, CSV ingest, and Geyser-style audience segments.

Experts build this as a thin serverless layer + a transactional email API + a managed Postgres store — not a self-hosted MTA and not a hosted newsletter platform (which would move the audience out of nostr-cms). The recommended approach: **Vercel Serverless Functions (Node, TS) under `/api/email/*`**, calling **Resend** for delivery, with **Supabase Postgres** for subscribers/settings/send-log. This reuses the project's existing Vercel deploy target and the existing NIP-98 admin-auth pattern, keeps everything in TypeScript, and leaves the Go backend untouched.

Key risks are secrets leaking into the client bundle, PII accidentally touching Nostr relays, double-opt-in token forgery, and a Vercel `/api` path collision with the Go backend. All are preventable with hard namespace boundaries, server-only imports, signed single-use tokens, and an explicit `vercel.json` rewrite split — resolved during planning.

## Key Findings

### Stack
- **Resend** for the email API: first-class TS SDK, React Email templates match the codebase, 3k free / $20 for 50k, SOC 2. Rejected SendGrid (free tier retired May 2025), Mailgun (no free tier, 4x cost), Buttondown/Kit (hosted platforms, not APIs — would move the list out of nostr-cms), SES (raw infra, overkill).
- **Vercel Serverless Functions (Node runtime)** for the server layer: full npm + 300s timeout for rate-limited batch sends; project already deploys to Vercel. Edge runtime rejected (10s timeout, restricted APIs).
- **Supabase Postgres** for subscribers/settings/send-log: RLS, free tier, SQL segments, `site_id` column makes future multi-tenant additive.
- No new client deps; reuse shadcn/ui, react-hook-form, zod, TanStack Query. `resend` + `@supabase/supabase-js` + `csv-parse` are server-only.

### Features
- **Table stakes:** toggleable public signup, double opt-in, unsubscribe, admin CSV import, admin SMTP/API-key config + test, rate limit (5–5000/min), subscriber list admin, auto-send new blog posts, audience segments (Followers/Contributors/Reward buyers).
- **Should-have:** Kind 1 digest (weekly/monthly), send preview + recipient count, Resend delivery webhook ingestion (bounce/complaint suppression).
- **Deferred:** Plebian Market sales, A/B testing, visual template builder, multi-tenant, paid tiers.

### Architecture
- New TS serverless layer + Supabase; Go backend untouched. SPA gains `SignupModule`, verify/unsubscribe pages, and `AdminEmail*` components.
- Admin routes reuse NIP-98 + master-pubkey check; public routes use signed single-use tokens; Resend webhook verifies signature.
- **Trigger:** ship admin-initiated "Send to subscribers" first (simple, deduped by `send_log.post_event_id`); automatic kind-23 trigger is a later phase.
- Data model: `subscribers`, `settings`, `verify_tokens`, `send_log`, `delivery_events` — all carry `site_id`.

### Pitfalls
- Critical: secrets in client bundle (server-only imports + ESLint guard), PII on relays (hard no), token forgery (HMAC + single-use + TTL), rate-limit semantics (server token bucket over a batch job, not per request).
- Moderate: CAN-SPAM/GDPR footer + consent record, Vercel `/api` rewrite split, CSV size/consent guardrails, deliverability warmup.
- Minor: duplicate-event triggers, low test coverage (add unit tests for rate limiter/tokens/CSV), split admin components to avoid the 1886-line `AdminForms` anti-pattern.

## Implications for Roadmap

Suggested phase order (Standard granularity → 5–8 phases). Dependencies flow top-down:

1. **Server foundation + Supabase schema + admin auth** — Vercel function scaffold, Supabase tables + RLS, NIP-98 admin verification, `vercel.json` rewrite split, settings storage. *Nothing user-visible yet.* Research flag: yes (NIP-98 in function, rewrite split).
2. **Admin SMTP/API config + rate-limit setting UI** — admin enters Resend key + sending domain + rate limit; connection test email. First user-visible admin surface; depends on Phase 1.
3. **Public signup + double opt-in + unsubscribe** — toggleable `SignupModule`, subscribe endpoint, confirmation email, verify + unsubscribe pages. First public-facing surface. Standard patterns; light research.
4. **Admin CSV import + subscriber list management + segments** — CSV upload/parse/validate, subscriber table UI, segment assignment (Followers/Contributors/Reward buyers).
5. **Send pipeline: post → email + rate-limited batch send + send preview/recipient count** — admin-initiated send of a NIP-23 post to a segment, React Email template, token-bucket rate limiter, send_log. Research flag: yes (batch send + resume-on-timeout).
6. **Kind 1 digest + Resend delivery webhooks + bounce/complaint suppression** — recurring summary emails, webhook ingestion, auto-suppression. Should-have polish.
7. **Automatic new-post trigger + hardening** — kind-23 auto-trigger with dedup/retry, deliverability warmup docs, test coverage for limiter/tokens/CSV. (Optional; can merge into 5 if scope allows.)

Phases 1–2 are the vertical spine (server + config). Phases 3–4 are the audience-acquisition half. Phases 5–6 are the distribution half. Phase 7 is automation + hardening.

## Research Flags (which phases need deeper research)

| Phase | Research? | Why |
|-------|-----------|-----|
| 1 Server foundation | Yes | NIP-98 verification in a Vercel function; Vercel/Go `/api` rewrite split; Supabase RLS policies |
| 2 Admin config UI | No | Standard shadcn form patterns |
| 3 Signup + double opt-in | Light | Standard; confirm token pattern |
| 4 CSV import + segments | Light | csv-parse streaming; standard table UI |
| 5 Send pipeline + rate limiter | Yes | Resend batch send + resume across function timeouts; token-bucket correctness |
| 6 Digest + webhooks | Light | Vercel cron; Resend webhook signature |
| 7 Auto-trigger + hardening | Light | Nostr event dedup; mostly testing/docs |

## Confidence

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | High | Resend + Vercel + Supabase are mainstream, well-documented, fit the existing deploy model |
| Features | High | Geyser reference doc + clear owner requirements |
| Architecture | Medium-High | Clean seam via existing `/api` + NIP-98; the only open question is the exact Vercel/Go rewrite split (planning resolves) |
| Pitfalls | High | Standard email-compliance + secrets pitfalls, all have known mitigations |

## Gaps to Address During Planning

- Exact `vercel.json` rewrite split between Vercel functions (`/api/email/*`) and the Go/Swarm backend (`/api/scheduler/*`, `/api/admin/*`).
- Whether the Resend API key is stored encrypted in Supabase `settings` or only in Vercel env vars (admin-editable implies DB; simpler implies env var — planning decides).
- React Email template strategy: render from NIP-23 markdown content vs. a fixed template that links back to the site.
- Whether to ship admin-initiated send only in Phase 5 and defer auto-trigger to Phase 7, or combine.
