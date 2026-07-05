# Pitfalls Research — Email Newsletter for nostr-cms

**Date:** 2026-07-04

## Critical

### P1 — Secrets leaking into the client bundle
**Risk:** The Resend API key or Supabase service-role key accidentally imported by SPA code → anyone can send mail as the creator or read/write all subscriber PII.
**Prevention:**
- Server-only deps (`resend`, `@supabase/supabase-js`) live in `api/email/*` and are never imported from `src/`.
- Use `VITE_*` only for public values (Supabase anon key + URL is fine; service role is not).
- Add an ESLint rule / CI grep forbidding `resend` or `SERVICE_ROLE` imports under `src/`.
- Store the Resend API key in Supabase `settings` (encrypted at rest), not in a `VITE_` env var.

### P2 — Nostr relays must never receive subscriber PII
**Risk:** Someone "stores" emails as a Nostr event → emails are public, permanent, GDPR-violating.
**Prevention:** Subscriber data exists only in Supabase. Document this as a hard constraint in PROJECT.md (done) and in code comments. No NIP for email subscribers.

### P3 — Double opt-in token forgery / reuse
**Risk:** Guessable or non-expiring verify tokens → attackers activate arbitrary emails → list poisoning, or spam sent to unconfirmed victims.
**Prevention:** Tokens are `crypto.randomUUID()` + HMAC-signed, single-use, short TTL (e.g. 24h), invalidated on use. Same for unsubscribe tokens.

### P4 — Rate-limit semantics mismatch
**Risk:** The "5–5000 emails/min" admin knob is interpreted as client-side or per-request, leading to Resend 429s or a frozen send.
**Prevention:** Rate limit is a server-side token bucket governing a **batch send job**, not per HTTP request. The send function iterates subscribers, releasing one email per token, persisting progress so a function timeout can resume. Document that Vercel function timeouts (300s Pro) cap the max batch per invocation; large lists chunk across invocations.

## Moderate

### P5 — CAN-SPAM / GDPR compliance gaps
**Risk:** No physical postal address in footer, no working unsubscribe, no consent record → legal exposure and poor deliverability.
**Prevention:** React Email footer template includes sender name + postal address (admin-configurable) + unsubscribe link. Consent timestamp stored on subscriber. Hard-bounce and spam-complaint auto-suppression.

### P6 — Vercel `/api` path collision with Go/Swarm backend
**Risk:** The SPA already proxies `/api` to the Go relay host. Adding Vercel functions under `/api/email` without explicit rewrites causes routing ambiguity — requests may hit the Go server instead of the function.
**Prevention:** Resolve the exact `vercel.json` rewrite split in planning. Namespace new endpoints strictly under `/api/email/*` and `/api/email-webhooks/*`.

### P7 — CSV import abuse
**Risk:** Admin uploads a 100MB CSV or malformed file → function timeout / OOM; or imports a list they don't have consent for → spam complaints tank deliverability.
**Prevention:** Server-side size cap, streaming parser (`csv-parse` stream), row count limit, validation report, and an admin acknowledgement checkbox for consent. Imported-by-admin defaults to `active` only if the admin explicitly marks them pre-confirmed.

### P8 — Deliverability on a fresh Resend shared pool
**Risk:** New verified domain with no warmup → bulk sends land in spam.
**Prevention:** Document domain verification (SPF/DKIM/DMARC) as a setup step; start with low volume; monitor Resend delivery events; auto-suppress bounces/complaints.

## Minor

### P9 — Triggering sends from Nostr events reliably
**Risk:** Auto-trigger on new kind 23 events can fire multiple times (duplicate events across relays) or miss events.
**Prevention:** `send_log.post_event_id` unique constraint dedupes. Ship admin-initiated trigger first; auto-trigger later with dedup + retry.

### P10 — Test coverage is currently minimal (4 test files)
**Risk:** Email flows (token validation, rate limiter, CSV parse) ship untested.
**Prevention:** Add unit tests for the rate limiter, token sign/verify, and CSV parser as part of the build phase. These are pure functions — cheap to test.

### P11 — Large admin components pattern
**Risk:** Following the existing `AdminForms.tsx` (1886 lines) anti-pattern, the new admin email UI becomes one giant file.
**Prevention:** Split `AdminEmail*` into Settings / Subscribers / Import / SendComposer sub-components from the start.

## Phase research flags

- **Phase that builds the server layer + auth** → needs `--research-phase` (NIP-98 verification in a Vercel function, Vercel rewrite split, Supabase RLS policies).
- **Phase that builds the send pipeline + rate limiter** → needs `--research-phase` (Resend batch send + resume-on-timeout pattern).
- **Public signup + double opt-in phase** → well-documented patterns; standard research sufficient.
