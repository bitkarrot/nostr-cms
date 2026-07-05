# Features Research — Email Newsletter for nostr-cms

**Date:** 2026-07-04

Reference: Geyser Fund ties emails to project posts, segments audiences (Followers / Contributors / Reward buyers), shows recipient counts before sending, and offers recurring weekly/monthly notifications. See `how-geyser-manages-email.md`.

## Table Stakes (must ship in this milestone)

1. **Public signup module (toggleable)** — embeddable email signup on the public site; admin can enable/disable the module site-wide. Fields: email (required), name (optional), nostr npub (optional).
2. **Double opt-in** — on signup, store subscriber as `pending`; send a confirmation email with a signed verify link; only on click do they become `active`. Prevents spam/invalid emails.
3. **Unsubscribe** — every sent email includes a one-click unsubscribe link; hitting it sets subscriber `unsubscribed`. Required for CAN-SPAM/GDPR compliance.
4. **Admin CSV upload** — upload a CSV of emails with optional name + npub columns; server-side parse, validate, dedupe, insert as `active` (admin-imported are pre-confirmed) or `pending` (admin choice). Show import summary (added / skipped / invalid).
5. **Admin SMTP/email-API integration** — admin UI to enter + save the Resend API key and verified sending domain (stored server-side, never sent to client). Connection test ("send test email").
6. **Rate limiting** — admin-configurable sends-per-minute, selectable 5–5000. Token-bucket enforced server-side per send job. UI control: a slider/select in admin settings.
7. **Subscriber list admin** — view, search, filter by segment/status, delete, manual segment assignment.
8. **Auto-send new blog posts** — when a new NIP-23 long-form post is published, trigger an email send to active subscribers (with segment targeting option). Shows recipient count before sending (Geyser parity).
9. **Audience segments** — Followers / Contributors / Reward buyers (Geyser parity), plus the ability to target a send to one or more segments. Segments are assignable per subscriber (manual or via CSV column).

## Should-have (differentiators, this milestone if time permits)

10. **Regular summary of Kind 1 notes** — admin-configurable digest (weekly/monthly) that bundles recent Kind 1 notes into one email. Mirrors Geyser's recurring notifications.
11. **Send preview + recipient count** — before any send, show exactly how many active subscribers match the target segment(s), and a preview of the rendered email.
12. **Resend delivery webhook ingestion** — record bounces/complaints/opens per send; auto-disable subscribers on hard bounce or spam complaint.

## Defer to v2+ (out of scope this milestone)

- Plebian Market reward-item sales integration (owner decision — separate future milestone).
- A/B testing, complex automation sequences, referral programs.
- Rich visual email template builder — emails render from CMS post content via React Email templates (code-defined), not a drag-and-drop editor.
- Multi-tenant creator onboarding.
- Paid/premium subscriber tiers (payments).

## Anti-features (explicitly not building)

- A separate newsletter authoring editor — content derives from existing CMS posts/notes. No new editor.
- Storing subscriber emails on Nostr relays — PII must never touch relays; lives only in Supabase.
- Client-side SMTP — impossible; all sending is server-side.
