# AGENTS.md — nostr-cms

Project guidance for AI agents working in this repo.

## What this is

A Nostr-based CMS for meetups and small organizations. Client-side SPA (Vite + React 18 + TS) backed by Nostr relays, with the **swarm** relay (`github.com/hivetalk/swarm`, a separate Go repo, fork of `bitvora/team-relay`) serving `/api/scheduler/*` and `/api/admin/*` (NIP-98 auth) plus `/.well-known/nostr.json`. Deploys self-hosted (relay box + nginx) or to Vercel (static host + InsForge/Postgres for `scheduled_posts`). Currently in production, single-tenant.

## Planning artifacts

All planning lives in `.planning/`:
- `PROJECT.md` — project context and core value
- `REQUIREMENTS.md` — v1 requirements with REQ-IDs
- `ROADMAP.md` — phased roadmap (current milestone: Email Newsletter, 6 phases)
- `STATE.md` — living project memory
- `research/` — domain research (STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY)
- `codebase/` — codebase map (ARCHITECTURE, STACK, STRUCTURE, CONVENTIONS, INTEGRATIONS, TESTING, CONCERNS)

## Commands

- `npm run dev` — dev server (port 8080, proxies `/api` to the relay host)
- `npm run build` — production build
- `npm run test` — type check + eslint + vitest + build

## Conventions

- Frontend: React + TypeScript + shadcn/ui + Tailwind + @nostrify/react + TanStack Query. Path alias `@/*` → `./src/*`.
- New admin page: `src/components/admin/Admin[Feature].tsx` + thin wrapper `src/pages/admin/Admin[Feature]Page.tsx` + route in `src/AppRouter.tsx` + sidebar entry in `src/components/admin/AdminLayout.tsx`.
- New hook: `src/hooks/use[Feature].ts`, named export.
- Server-side code (email milestone): `server/` folder in this repo, a separate Node entry point (`npm run server`), NOT part of the Vite client build. Server-only deps (`resend`, `better-sqlite3`, `csv-parse`) must NEVER be imported from `src/` (enforced by ESLint guard).
- Admin auth on new endpoints: SPA side reuses the NIP-98 `fetchWithNip98` pattern from `src/hooks/useScheduledPosts.ts`; server side verifies NIP-98 in `server/auth/nip98.ts` (pure crypto) + master-pubkey check via `nostr.json` fetch.
- DB: SQLite (`better-sqlite3`, WAL mode) is the default behind a `SubscriberRepository` interface; Postgres is additive via `EMAIL_DB_BACKEND=postgres`. Same schema, two migration dialects.
- swarm is a separate repo — do not modify it for email features. The email service talks to swarm only over HTTP/WS.

## Hard constraints

- Nostr relays are the content store for CMS content. Subscriber emails/PII must NEVER be stored on relays — they live only in the email service's SQLite/Postgres DB.
- Secrets (Resend API key, DB credentials) are server-only; never `VITE_*`.
- Don't break the existing Vercel static deploy or the swarm `/api` proxy. The email service is additive (`/api/email/*`), routed via a new nginx location block on self-hosted deploys.
- Email module is opt-in at install time, default off. Gate email admin nav + public signup on `useEmailEnabled()` (reads `VITE_EMAIL_ENABLED` or `email_enabled` in swarm-config). Installers who don't want email don't start `npm run server` and see no email UI.

## Current milestone: Email Newsletter

See `.planning/ROADMAP.md` for the 6-phase plan. Phase 1 (Server Foundation & Admin Auth) is ready to plan.
