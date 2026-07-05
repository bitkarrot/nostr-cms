# AGENTS.md — nostr-cms

Project guidance for AI agents working in this repo.

## What this is

A Nostr-based CMS for meetups and small organizations. Client-side SPA (Vite + React 18 + TS) backed by Nostr relays, with an optional Go/Swarm ("bkrelay") backend serving `/api/scheduler/*` and `/api/admin/*` (NIP-98 auth). Deploys to Vercel (static host) and to a self-hosted Go relay. Currently in production, single-tenant.

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
- Server-side code (email milestone): `api/email/*.ts` Vercel functions (Node runtime). Server-only deps (`resend`, `@supabase/supabase-js`, `csv-parse`) must NEVER be imported from `src/`.
- Admin auth on new endpoints: reuse the NIP-98 + master-pubkey check pattern from `src/hooks/useScheduledPosts.ts` (`fetchWithNip98`).

## Hard constraints

- Nostr relays are the content store for CMS content. Subscriber emails/PII must NEVER be stored on relays — they live only in Supabase Postgres.
- Secrets (Resend API key, Supabase service role) are server-only; never `VITE_*`.
- Don't break the existing Vercel static deploy or the Go/Swarm `/api` proxy.

## Current milestone: Email Newsletter

See `.planning/ROADMAP.md` for the 6-phase plan. Phase 1 (Server Foundation & Admin Auth) is ready to plan.
