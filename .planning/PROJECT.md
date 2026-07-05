# nostr-cms

## What This Is

A Nostr-based content management system for meetups and small organizations. An admin CMS (blogs, events, feeds, static pages, media) backed by Nostr relays, paired with a public-facing community website with Lightning zaps, RSVPs, and customizable branding. Single-tenant: one deployment serves one creator/organization. Currently in production.

## Core Value

Let a creator run a full community site (content + events + payments) entirely on Nostr, with a rich admin panel and a polished public front end — no traditional backend required for the CMS itself.

## Business Context

- **Customer**: Meetup organizers and small Bitcoin/Nostr-native organizations running a community site.
- **Revenue model**: Open-source self-host; future monetization via hosted offering and integrations.
- **Success metric**: Creators replacing Geyser Fund + Substack with nostr-cms for content, updates, and audience email.
- **Strategy notes**: nostr-cms aims to replace Geyser Fund plus add social media content creation and a custom front end.

## Requirements

### Validated

<!-- Shipped and confirmed valuable — inferred from existing production codebase. -->

- [x] Admin CMS with TipTap rich-text editor for blogs (NIP-23) and events (NIP-52) — in production
- [x] Remote `nostr.json` admin auth with Primary/Secondary admin roles — in production
- [x] Static pages via Kind 34128 (nsite) + Blossom storage — in production
- [x] Relay management (primary + publishing relays) — in production
- [x] Media library via Blossom servers — in production
- [x] Lightning Zaps (NIP-57) + NWC (NIP-47) integration — in production
- [x] Zaplytics analytics dashboard — in production
- [x] Site config: logos, titles, favicons, navigation menus — in production
- [x] Optional Go/Swarm ("bkrelay") backend serving `/api` routes + `<meta name="swarm-config">` injection — in production

### Active

<!-- Current milestone: Email Newsletter + Geyser-style audience segments. -->

- [ ] Email newsletter signup on the public site (toggleable module)
- [ ] Double opt-in: confirmation email with verify link before a subscriber is active
- [ ] Admin CSV upload of emails (with optional names + nostr npubs)
- [ ] Admin SMTP integration via a third-party email API for sending
- [ ] Configurable send rate limit (5–5000 emails per minute)
- [ ] Auto-send new blog posts to subscribers by email
- [ ] Regular summary emails of Kind 1 notes
- [ ] Geyser-style subscriber segments (Followers / Contributors / Reward buyers) as enablers for targeted sends
- [ ] Targeted email sends to specific segments (e.g. contributors, reward buyers)

### Out of Scope

- Plebian Market integration for reward-item sales — explicitly deferred to a future milestone per owner decision
- Multi-tenant support (many creators on one instance) — single-tenant now; schema should not preclude adding it later
- Custom SMTP server implementation — sending handled by a third-party email API, not self-hosted MTA
- A standalone newsletter authoring tool — email content derives from existing CMS posts/notes, not a separate editor

## Context

- **Architecture**: Client-side SPA (Vite + React 18 + TypeScript). Nostr relays are the content store. TanStack Query for caching, shadcn/ui + Tailwind for UI, @nostrify/react for Nostr. See `.planning/codebase/ARCHITECTURE.md`.
- **Backend**: The only server component is the optional Go/Swarm ("bkrelay") backend that proxies `/api` routes and injects runtime config via `<meta name="swarm-config">`. The email feature requires server-side capabilities (SMTP sending, subscriber storage, rate limiting, CSV ingest, opt-in tokens) that cannot run in the browser.
- **Email approach (decided)**: Use a third-party email API (e.g. Resend/Mailgun/SendGrid/Buttondown) for delivery and list management, with a thin server/edge layer for opt-in confirmation and CSV ingest. Specific provider and subscriber-DB choice to be resolved during phase research/planning.
- **Geyser reference**: Geyser Fund ties emails to project posts, segments audiences (Followers, Contributors, Reward buyers), shows recipient counts before sending, and offers recurring weekly/monthly notification emails. See `how-geyser-manages-email.md`.
- **Known concerns**: Limited test coverage (4 test files), some XSS surface via `dangerouslySetInnerHTML`, large admin component files. See `.planning/codebase/CONCERNS.md`.

## Constraints

- **Tech stack**: Frontend must stay React + Vite + TypeScript + shadcn/ui + @nostrify. No rewrite of the SPA.
- **Nostr-native**: CMS content continues to live on Nostr relays; email is a derived distribution channel, not a new content store.
- **Single-tenant**: One deployment = one creator. Subscriber data belongs to that one site.
- **Secrets**: SMTP/API keys and subscriber PII must never reach the client bundle or Nostr relays; they live server-side only.
- **Rate limiting**: Admin-configurable, 5–5000 emails/minute range.
- **Compatibility**: Must not break the existing production deploy model (static host + optional Go backend).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Email delivery via third-party email API (not self-hosted MTA) | Avoids running an SMTP server; leverages provider deliverability, rate limiting, and compliance | — Pending |
| Subscriber DB choice deferred to phase planning | Need research on provider/list-management trade-offs vs. own DB before committing | — Pending |
| Single-tenant now, schema multi-tenant-ready later | Matches current deploy model; avoids premature complexity | — Pending |
| Email content derives from CMS posts/Kind 1 notes (no separate editor) | Reuses existing authoring flow; matches Geyser's post-based email model | — Pending |
| Reward-item sales (Plebian Market) out of scope this milestone | Owner decision; focus on email + segments first | — Pending |

---
*Last updated: 2026-07-04 after project initialization*
