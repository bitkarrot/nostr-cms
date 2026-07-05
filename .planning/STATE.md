---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1
current_phase_name: Server Foundation & Admin Auth
status: planned
stopped_at: Phase 1 planned (4 PLAN.md files written, plan-checker approved)
last_updated: "2026-07-05T05:00:00.000Z"
last_activity: 2026-07-04
last_activity_desc: Phase 1 planned — 4 PLAN.md files written (01-01..01-04) and plan-checker approved
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 4
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-04)

**Core value:** Let a creator run a full community site (content + events + payments) entirely on Nostr, with a rich admin panel and a polished public front end — and now reach that audience by email.
**Current focus:** Phase 1 — Server Foundation & Admin Auth

## Current Position

Phase: 1 of 6 (Server Foundation & Admin Auth)
Plan: 0 of 4 in current phase (planned, not yet executed)
Status: Planned — ready for /gsd-execute-phase
Last activity: 2026-07-04 — Phase 1 planned: 4 PLAN.md files written (01-01..01-04), plan-checker approved

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

- Email delivery via Resend (third-party API), not self-hosted MTA — avoids deliverability/compliance burden, fits TS codebase via React Email
- Server layer = Node/TS email service in `nostr-cms/server/` (long-running process, not Vercel functions); same language as frontend, full npm, persistent FS, no function timeout
- Subscriber DB = SQLite first (`better-sqlite3`, WAL mode) behind a `SubscriberRepository` interface; Postgres additive later via `EMAIL_DB_BACKEND` env var. SQLite is the self-hosted default; Postgres is the hosted/Vercel path (reuses existing InsForge/Postgres provisioned for `scheduled_posts`)
- swarm (Go relay, separate repo, fork of `bitvora/team-relay`) stays untouched; email service talks to it only over HTTP/WS (nostr.json fetch, relay WS reads). No monorepo merge — preserves swarm's standalone utility + upstream trackability
- Single-tenant now; schema multi-tenant-ready later (`site_id` on all tables)
- Email content derives from CMS posts/Kind 1 notes (no separate newsletter editor)
- Plebian Market reward sales deferred to a future milestone
- Trigger model: admin-initiated send first (Phase 5); automatic kind-23 trigger deferred to v2
- Email module is opt-in at install time, default off — `VITE_EMAIL_ENABLED` (build-time) or `email_enabled` in swarm-config meta tag (runtime, no rebuild); installer who doesn't want email runs no server process and sees no email UI. Layered with CFG-04 runtime toggle (signup visibility)

### Surprises

- (none yet)

### Patterns

- Reuse existing NIP-98 `fetchWithNip98` pattern from `src/hooks/useScheduledPosts.ts` for admin auth on new endpoints (SPA side); server-side NIP-98 verification is pure crypto in `server/auth/nip98.ts`
- Reuse shadcn/ui + react-hook-form + zod + TanStack Query for all new admin/public UI
- Split admin components into sub-files to avoid the existing 1886-line `AdminForms.tsx` anti-pattern
- `server/` is a separate Node entry point (`npm run server`), not part of the Vite client build; server-only deps never imported from `src/`

### Learnings

- (none yet)

## Phase History

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| 1. Server Foundation & Admin Auth | Planned | 2026-07-04 | - |
| 2. Admin Email Configuration | Not started | - | - |
| 3. Public Signup & Double Opt-in | Not started | - | - |
| 4. Subscriber Management & Segments | Not started | - | - |
| 5. Send Pipeline | Not started | - | - |
| 6. Digests & Delivery Feedback | Not started | - | - |

## File Index

| Artifact | Location |
|----------|----------|
| Project context | `.planning/PROJECT.md` |
| Requirements | `.planning/REQUIREMENTS.md` |
| Roadmap | `.planning/ROADMAP.md` |
| Research summary | `.planning/research/SUMMARY.md` |
| Stack research | `.planning/research/STACK.md` |
| Features research | `.planning/research/FEATURES.md` |
| Architecture research | `.planning/research/ARCHITECTURE.md` |
| Pitfalls research | `.planning/research/PITFALLS.md` |
| Codebase map | `.planning/codebase/*.md` |

## Session

**Last session:** 2026-07-05T05:00:00.000Z
**Stopped at:** Phase 1 planned (4 PLAN.md files written, plan-checker approved)
**Resume file:** .planning/phases/01-server-foundation-admin-auth/01-01-PLAN.md
