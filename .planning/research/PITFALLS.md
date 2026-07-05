# Pitfalls Research — Email Newsletter for nostr-cms

**Date:** 2026-07-04
**Revised:** 2026-07-04 — reflects Node/TS service + SQLite-first design.

## Critical

### P1 — Secrets leaking into the client bundle
**Risk:** The Resend API key or DB credentials accidentally imported by SPA code → anyone can send mail as the creator or read/write all subscriber PII.
**Prevention:**
- Server-only deps (`resend`, `better-sqlite3`, `pg`) live in `server/` and are never imported from `src/`.
- Use `VITE_*` only for public values. The Resend API key is stored in the DB `settings` table (encrypted at rest), not in a `VITE_` env var.
- Add an ESLint rule / CI grep forbidding `resend`, `better-sqlite3`, `pg`, or `SERVICE_ROLE` imports under `src/`.
- The `server/` folder is a separate Node entry point (`npm run server`); it is not part of the Vite client build.

### P2 — Nostr relays must never receive subscriber PII
**Risk:** Someone "stores" emails as a Nostr event → emails are public, permanent, GDPR-violating.
**Prevention:** Subscriber data exists only in SQLite/Postgres. Document this as a hard constraint in PROJECT.md (done) and in code comments. No NIP for email subscribers.

### P3 — Double opt-in token forgery / reuse
**Risk:** Guessable or non-expiring verify tokens → attackers activate arbitrary emails → list poisoning, or spam sent to unconfirmed victims.
**Prevention:** Tokens are `crypto.randomUUID()` + HMAC-signed, single-use, short TTL (e.g. 24h), invalidated after use. Same for unsubscribe tokens.

### P4 — Rate-limit semantics mismatch
**Risk:** The "5–5000 emails/min" admin knob is interpreted as client-side or per-request, leading to Resend 429s or a frozen send.
**Prevention:** Rate limit is a server-side token bucket governing a **batch send job**, not per HTTP request. The send loop iterates subscribers, releasing one email per token. Because the email service is a long-running Node process (not a Vercel function), there is no function-timeout pressure — the loop can run as long as needed. Persist progress to `send_log` anyway so a process restart resumes without duplicate sends.

## Moderate

### P5 — CAN-SPAM / GDPR compliance gaps
**Risk:** No physical postal address in footer, no working unsubscribe, no consent record → legal exposure and poor deliverability.
**Prevention:** React Email footer template includes sender name + postal address (admin-configurable in `settings.postal_address`) + unsubscribe link. Consent timestamp stored on subscriber. Hard-bounce and spam-complaint auto-suppression.

### P6 — SQLite concurrency and backup
**Risk:** SQLite has a single writer at a time; a long batch send holding a write transaction could block signup inserts. Also, copying a live SQLite file mid-write can produce a corrupt backup.
**Prevention:**
- Use WAL mode (`PRAGMA journal_mode=WAL`) — readers don't block writers, writers don't block readers. Signup inserts and send-log writes are short transactions; the send loop only writes to `send_log` per batch, not per email.
- Backups use `better-sqlite3`'s `backup` API (online backup) or sqlite3 `.backup`, not a raw file copy.
- At >10k subscribers or high write concurrency, the Postgres backend becomes the recommended path — document this threshold.

### P7 — CSV import abuse
**Risk:** Admin uploads a 100MB CSV or malformed file → service OOM; or imports a list they don't have consent for → spam complaints tank deliverability.
**Prevention:** Server-side size cap, streaming parser (`csv-parse` stream), row count limit, validation report, and an admin acknowledgement checkbox for consent. Imported-by-admin defaults to `active` only if the admin explicitly marks them pre-confirmed.

### P8 — Deliverability on a fresh Resend shared pool
**Risk:** New verified domain with no warmup → bulk sends land in spam.
**Prevention:** Document domain verification (SPF/DKIM/DMARC) as a setup step; start with low volume; monitor Resend delivery events; auto-suppress bounces/complaints.

### P9 — DB backend drift between SQLite and Postgres implementations
**Risk:** The two `SubscriberRepository` implementations drift in behavior (e.g. one handles a segment filter, the other doesn't) → bugs that only manifest in one deploy mode.
**Prevention:** Define the interface contract with tests; both implementations must pass the same repository test suite (parameterized by backend). Ship SQLite first; only build Postgres when someone needs it, so the interface is proven by one implementation before the second is written.

## Minor

### P10 — Triggering sends from Nostr events reliably
**Risk:** Auto-trigger on new kind 23 events can fire multiple times (duplicate events across relays) or miss events.
**Prevention:** `send_log.post_event_id` unique constraint dedupes. Ship admin-initiated trigger first; auto-trigger later with dedup + retry.

### P11 — Test coverage is currently minimal (4 test files)
**Risk:** Email flows (token validation, rate limiter, CSV parse, repository) ship untested.
**Prevention:** Add unit tests for the rate limiter, token sign/verify, CSV parser, and the `SubscriberRepository` contract as part of the build phase. These are pure functions / interface tests — cheap to cover.

### P12 — Large admin components pattern
**Risk:** Following the existing `AdminForms.tsx` (1886 lines) anti-pattern, the new admin email UI becomes one giant file.
**Prevention:** Split `AdminEmail*` into Settings / Subscribers / Import / SendComposer sub-components from the start.

### P13 — swarm repo coupling temptation
**Risk:** A future feature tempts you to modify swarm's Go code to support email, eroding the clean HTTP/WS boundary and the upstream-trackability of `bitvora/team-relay`.
**Prevention:** Keep the email service's dependency on swarm strictly over HTTP/WS (nostr.json fetch, relay WS reads). If a feature genuinely requires relay-side changes, evaluate then whether to fork further or contribute upstream — don't silently couple.

## Phase research flags

- **Phase that builds the server layer + auth + DB interface** → needs `--research-phase` (NIP-98 verification in Node, `SubscriberRepository` interface design, SQLite WAL + online backup, nginx location block).
- **Phase that builds the send pipeline + rate limiter** → needs `--research-phase` (Resend batch send + persistent progress across process restarts, token-bucket correctness).
- **Public signup + double opt-in phase** → well-documented patterns; standard research sufficient.
