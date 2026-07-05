# Requirements: nostr-cms Email Newsletter

**Defined:** 2026-07-04
**Core Value:** Let a creator run a full community site on Nostr — and now reach their audience by email (newsletter, post updates, summaries) without a separate tool.

## v1 Requirements

Requirements for the Email Newsletter milestone. Each maps to roadmap phases below.

### Server Foundation & Auth

- [ ] **SRV-01**: A TypeScript serverless layer exists under `/api/email/*` on Vercel, deployed alongside the SPA, with no secrets in the client bundle
- [ ] **SRV-02**: Supabase Postgres schema exists for subscribers, settings, verify_tokens, send_log, delivery_events (all carrying `site_id`), with RLS policies
- [ ] **SRV-03**: Admin endpoints verify NIP-98 signatures and require the signer be the site master/owner pubkey
- [ ] **SRV-04**: A `vercel.json` rewrite split cleanly routes `/api/email/*` to Vercel functions while preserving existing `/api/scheduler/*` and `/api/admin/*` proxying to the Go backend

### Admin Email Configuration

- [ ] **CFG-01**: Admin can enter and save the Resend API key + verified sending domain + from-name (stored server-side, never exposed to the client)
- [ ] **CFG-02**: Admin can trigger a connection test that sends a test email and reports success/failure
- [ ] **CFG-03**: Admin can set the send rate limit via a control selectable from 5 to 5000 emails per minute
- [ ] **CFG-04**: Admin can enable/disable the public signup module site-wide

### Public Signup & Double Opt-in

- [ ] **SUB-01**: A toggleable signup module renders on the public site accepting email (required), name (optional), and nostr npub (optional)
- [ ] **SUB-02**: Submitting signup stores a `pending` subscriber and sends a confirmation email with a signed, single-use, time-limited verify link
- [ ] **SUB-03**: Clicking the verify link marks the subscriber `active` and shows a confirmation page; the token is invalidated after use
- [ ] **SUB-04**: Every sent email includes a working one-click unsubscribe link that sets the subscriber `unsubscribed`

### Subscriber Management & Segments

- [ ] **MGR-01**: Admin can upload a CSV of emails with optional name and npub columns; the server parses, validates, dedupes, and inserts, returning an import summary (added/skipped/invalid)
- [ ] **MGR-02**: Admin can view, search, filter, and delete subscribers in a table UI
- [ ] **MGR-03**: Subscribers can be assigned to segments: Followers, Contributors, Reward buyers
- [ ] **MGR-04**: CSV import size and row count are capped; malformed files are rejected with a clear error

### Send Pipeline

- [ ] **SND-01**: Admin can send a published NIP-23 blog post as an email to active subscribers, optionally targeting one or more segments
- [ ] **SND-02**: Before sending, the admin sees the recipient count for the selected segment(s) and a preview of the rendered email
- [ ] **SND-03**: Sends are rate-limited server-side by a token bucket honoring the configured emails-per-minute (5–5000)
- [ ] **SND-04**: A send job persists progress so a function timeout can resume without duplicate sends; each send is recorded in send_log
- [ ] **SND-05**: Email content renders from the CMS post via a React Email template with a compliant footer (sender name, postal address, unsubscribe link)

### Digests & Delivery Feedback

- [ ] **DGT-01**: Admin can enable a recurring digest (weekly or monthly) of recent Kind 1 notes sent to active subscribers
- [ ] **DGT-02**: Resend delivery webhook events (sent/delivered/bounced/complaint) are ingested and recorded in delivery_events
- [ ] **DGT-03**: Hard bounces and spam complaints auto-suppress the affected subscriber (set to unsubscribed/bounced)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Automation & Monetization

- **AUT-01**: New kind 23 posts from the master pubkey auto-trigger an email send without admin action (deduped via send_log.post_event_id)
- **AUT-02**: Plebian Market integration for reward-item sales with buyer email segment
- **AUT-03**: Paid/premium subscriber tiers via Lightning payments
- **AUT-04**: Multi-tenant support (many creators per deployment, isolated by site_id)
- **AUT-05**: A/B testing and automation sequences for email campaigns

## Out of Scope

| Feature | Reason |
|---------|--------|
| Self-hosted MTA / SMTP server | Deliverability + compliance burden; sending handled by Resend |
| Hosted newsletter platform (Buttondown/Kit/ConvertKit) | Would move the audience list out of nostr-cms; requirement is to manage subscribers inside nostr-cms |
| Storing subscriber emails on Nostr relays | PII must never touch relays; GDPR + permanence risk |
| Separate newsletter authoring editor | Email content derives from existing CMS posts/notes |
| Visual drag-and-drop email template builder | Emails render from post content via code-defined React Email templates |
| Client-side SMTP sending | Impossible; all sending is server-side |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRV-01 | Phase 1 | Pending |
| SRV-02 | Phase 1 | Pending |
| SRV-03 | Phase 1 | Pending |
| SRV-04 | Phase 1 | Pending |
| CFG-01 | Phase 2 | Pending |
| CFG-02 | Phase 2 | Pending |
| CFG-03 | Phase 2 | Pending |
| CFG-04 | Phase 2 | Pending |
| SUB-01 | Phase 3 | Pending |
| SUB-02 | Phase 3 | Pending |
| SUB-03 | Phase 3 | Pending |
| SUB-04 | Phase 3 | Pending |
| MGR-01 | Phase 4 | Pending |
| MGR-02 | Phase 4 | Pending |
| MGR-03 | Phase 4 | Pending |
| MGR-04 | Phase 4 | Pending |
| SND-01 | Phase 5 | Pending |
| SND-02 | Phase 5 | Pending |
| SND-03 | Phase 5 | Pending |
| SND-04 | Phase 5 | Pending |
| SND-05 | Phase 5 | Pending |
| DGT-01 | Phase 6 | Pending |
| DGT-02 | Phase 6 | Pending |
| DGT-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-04*
*Last updated: 2026-07-04 after initial definition*
