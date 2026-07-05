# Roadmap: nostr-cms Email Newsletter

## Overview

Add an email-newsletter capability to the production, single-tenant nostr-cms so a creator can collect subscribers (public signup with double opt-in, or admin CSV import), segment them Geyser-style (Followers / Contributors / Reward buyers), and send new blog posts and Kind 1 digests to those subscribers via a third-party email API (Resend) at an admin-configured rate (5–5000/min). The capability is delivered by a new Node/TS email service in `nostr-cms/server/` with a SQLite-first subscriber database (Postgres additive via a repository interface); the swarm relay (separate Go repo) and the SPA's Nostr-as-database model are untouched. Six phases build the vertical spine (server + config), then audience acquisition (signup + management), then distribution (send pipeline + digests).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Server Foundation & Admin Auth** - Node/TS service in `server/`, `SubscriberRepository` interface + SQLite impl, NIP-98 admin verification in Node, nginx routing
- [ ] **Phase 2: Admin Email Configuration** - Resend API key + sending domain + rate-limit setting UI, connection test
- [ ] **Phase 3: Public Signup & Double Opt-in** - Toggleable signup module, confirmation email, verify + unsubscribe pages
- [ ] **Phase 4: Subscriber Management & Segments** - CSV import, subscriber table UI, segment assignment
- [ ] **Phase 5: Send Pipeline** - Post-to-email with segment targeting, recipient preview, rate-limited batch send, send_log
- [ ] **Phase 6: Digests & Delivery Feedback** - Kind 1 digest, Resend webhook ingestion, bounce/complaint suppression

## Phase Details

### Phase 1: Server Foundation & Admin Auth
**Goal**: Stand up the Node/TS email service, the subscriber database (SQLite-first via a repository interface), and the admin auth seam so all later phases have a safe place to put secrets and logic. Nothing user-visible ships here.
**Depends on**: Nothing (first phase)
**Requirements**: SRV-01, SRV-02, SRV-03, SRV-04
**Success Criteria** (what must be TRUE):
  1. A Node/TS service in `nostr-cms/server/` responds to a `/api/email/health` check, with server-only deps (`resend`, `better-sqlite3`) never importable from `src/` (ESLint guard enforced)
  2. A `SubscriberRepository` interface exists with a SQLite implementation and migrations for subscribers, settings, verify_tokens, send_log, delivery_events (all carrying `site_id`); WAL mode is enabled and an online-backup path is documented
  3. An admin endpoint rejects requests lacking a valid NIP-98 signature from the site master pubkey (resolved from `VITE_MASTER_PUBKEY` or `/.well-known/nostr.json`), and accepts one with it
  4. The service runs as a long-running process on the relay box with nginx routing `/api/email/*` to it; swarm is not modified
**Plans**: 3 plans

Plans:
- [ ] 01-01: `server/` scaffold + `SubscriberRepository` interface + SQLite implementation + migrations (WAL mode, online backup)
- [ ] 01-02: NIP-98 verification in Node + master-pubkey check via `nostr.json` fetch + admin endpoint scaffold
- [ ] 01-03: nginx location block + `npm run server` entry + ESLint guard forbidding `server/`-only imports under `src/`

### Phase 2: Admin Email Configuration
**Goal**: Give the admin the first user-visible surface — entering and testing the email provider config and setting the rate limit + module toggle — so sending becomes possible.
**Depends on**: Phase 1
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04
**Success Criteria** (what must be TRUE):
  1. Admin can save Resend API key, verified sending domain, and from-name in the admin UI; the values persist server-side and are never returned to the client
  2. Admin can send a test email that arrives at an address they choose, with success/failure surfaced in the UI
  3. Admin can set the send rate limit via a control bounded between 5 and 5000 emails per minute
  4. Admin can toggle the public signup module on/off site-wide and the public site reflects the change
**Plans**: 2 plans

Plans:
- [ ] 02-01: Settings storage + admin Settings UI (Resend key, domain, from-name, rate limit, module toggle)
- [ ] 02-02: Connection-test endpoint + Resend client singleton keyed by stored API key

### Phase 3: Public Signup & Double Opt-in
**Goal**: Let visitors subscribe on the public site with double opt-in and a working unsubscribe — the audience-acquisition half begins.
**Depends on**: Phase 1, Phase 2 (module toggle)
**Requirements**: SUB-01, SUB-02, SUB-03, SUB-04
**Success Criteria** (what must be TRUE):
  1. With the module enabled, a visitor sees a signup form (email required; name + npub optional) on the public site; with it disabled, the form is absent
  2. Submitting creates a `pending` subscriber and sends a confirmation email containing a signed, single-use, time-limited verify link
  3. Clicking the verify link activates the subscriber and renders a confirmation page; reusing or forging a token fails
  4. Every sent email includes a one-click unsubscribe link that sets the subscriber to `unsubscribed`
**Plans**: 3 plans

Plans:
- [ ] 03-01: `SignupModule` component + `/subscribe` endpoint + module-toggle respect
- [ ] 03-02: Signed token utility + `/verify` and `/unsubscribe` pages + endpoints
- [ ] 03-03: Confirmation + unsubscribe React Email templates with compliant footer

### Phase 4: Subscriber Management & Segments
**Goal**: Let the admin grow and organize the list — CSV import and a searchable, segmentable subscriber table.
**Depends on**: Phase 1, Phase 3 (subscriber states exist)
**Requirements**: MGR-01, MGR-02, MGR-03, MGR-04
**Success Criteria** (what must be TRUE):
  1. Admin can upload a CSV (emails + optional name/npub); the server parses, validates, dedupes, inserts, and returns an added/skipped/invalid summary
  2. Admin can view, search, filter by status/segment, and delete subscribers in a table UI
  3. Admin can assign subscribers to segments: Followers, Contributors, Reward buyers
  4. Oversized or malformed CSVs are rejected with a clear error; row count and file size are capped
**Plans**: 3 plans

Plans:
- [ ] 04-01: `/admin/import-csv` endpoint with streaming csv-parse, validation, dedupe, size/count caps
- [ ] 04-02: Subscriber table admin UI (search, filter, delete, segment assignment)
- [ ] 04-03: Segment schema + assignment endpoints + segment filter helpers

### Phase 5: Send Pipeline
**Goal**: The core distribution capability — admin sends a published blog post to active subscribers, optionally targeted by segment, rate-limited, with preview and persistent progress.
**Depends on**: Phase 2 (config + rate limit), Phase 4 (segments)
**Requirements**: SND-01, SND-02, SND-03, SND-04, SND-05
**Success Criteria** (what must be TRUE):
  1. Admin can choose a published NIP-23 post and send it as an email to active subscribers, optionally filtered to one or more segments
  2. Before sending, the admin sees the recipient count for the selected segment(s) and a preview of the rendered email
  3. Sends are governed by a server-side token bucket honoring the configured emails-per-minute (5–5000); the rate is not bypassable from the client
  4. A send job persists progress so a function timeout resumes without duplicate sends; every send is recorded in send_log
  5. The rendered email uses a React Email template with a compliant footer (sender name, postal address, unsubscribe link)
**Plans**: 4 plans

Plans:
- [ ] 05-01: Post-to-email React Email template + post content fetch from relay
- [ ] 05-02: Token-bucket rate limiter reading the configured rate from settings
- [ ] 05-03: `/admin/send` endpoint with recipient-count preview, segment filter, persistent-progress batch send (resumable across process restarts)
- [ ] 05-04: Send composer admin UI (post picker, segment selector, preview, recipient count, send button)

### Phase 6: Digests & Delivery Feedback
**Goal**: Close the loop — recurring Kind 1 digests and Resend delivery webhook ingestion with bounce/complaint suppression.
**Depends on**: Phase 5 (send pipeline + templates)
**Requirements**: DGT-01, DGT-02, DGT-03
**Success Criteria** (what must be TRUE):
  1. Admin can enable a weekly or monthly digest of recent Kind 1 notes that sends to active subscribers on schedule
  2. Resend delivery webhook events (sent/delivered/bounced/complaint) are received, signature-verified, and recorded in delivery_events
  3. Hard bounces and spam complaints automatically suppress the affected subscriber
**Plans**: 3 plans

Plans:
- [ ] 06-01: In-process cron + digest builder (recent Kind 1 notes → React Email template)
- [ ] 06-02: `/webhooks/resend` endpoint with signature verification + delivery_events writes
- [ ] 06-03: Bounce/complaint auto-suppression rule + admin delivery dashboard

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Server Foundation & Admin Auth (Node/TS service + SQLite) | 0/3 | Not started | - |
| 2. Admin Email Configuration | 0/2 | Not started | - |
| 3. Public Signup & Double Opt-in | 0/3 | Not started | - |
| 4. Subscriber Management & Segments | 0/3 | Not started | - |
| 5. Send Pipeline | 0/4 | Not started | - |
| 6. Digests & Delivery Feedback | 0/3 | Not started | - |
