# Plan 01-04 — Summary

**Plan:** 01-04 — useEmailEnabled() hook + email_enabled config flag + SPA gating of email admin nav
**Phase:** 1 (Server Foundation & Admin Auth)
**Status:** ✅ Complete
**Requirements covered:** SRV-05
**Commits:** 3 (one per task, atomic)

## Objective

Add the `email_enabled` config flag and `useEmailEnabled()` hook that gates all email UI, mirroring the existing `getMasterPubkey()` priority (env wins over swarm-config meta tag, default off). Gate the admin sidebar email nav entry on the hook so no email nav renders when the module is off (SRV-05), and add a stub `/admin/email` route so the gated link does not 404 when enabled. SPA-only plan (no server files).

## Tasks executed

### 01-04-01 — getEmailEnabled() + useEmailEnabled() hook (env wins over meta, default off)
- **Files:** `src/lib/relay.ts` (edit), `src/hooks/useEmailEnabled.ts` (new), `src/hooks/useEmailEnabled.test.ts` (new)
- **Commit:** `feat(01-04): 01-04-01 useEmailEnabled hook (env wins over meta, default off)`
- **Verify:** `npx vitest run src/hooks/useEmailEnabled.test.ts` — 6 tests green ✅
- **Details:** Added `email_enabled?: boolean` to the `SwarmConfig` interface and a new exported `getEmailEnabled(): boolean` in `relay.ts` mirroring `getMasterPubkey`'s env-over-meta priority. `VITE_EMAIL_ENABLED` (public UI flag) is read first; if set, `String(env).toLowerCase() === 'true'` is returned (only the literal "true" string yields true). Else the swarm-config meta tag `email_enabled` is read; if set, `!!injected` is returned. Default: `false` (SRV-05 opt-in). The `useEmailEnabled()` hook is a thin synchronous wrapper (no TanStack Query — mirrors how `getMasterPubkey` is consumed in `useRemoteNostrJson`).

### 01-04-02 — Priority test (env wins over meta when both set; string coercion)
- **Files:** `src/hooks/useEmailEnabled.test.ts` (edit)
- **Commit:** `test(01-04): 01-04-02 priority cases — env wins over meta, string coercion`
- **Verify:** `npx vitest run src/hooks/useEmailEnabled.test.ts` — 9 tests green ✅
- **Details:** Added 3 priority cases locking the consistency guarantee with `getMasterPubkey`: (1) env=true + meta=false → true (env wins); (2) env=false + meta=true → false (env wins, reverse); (3) env="1" (non-"true" string) + meta=true → false (env short-circuits before meta is consulted — string coercion means only literal "true" yields true, proving env-wins short-circuits).

### 01-04-03 — Gate AdminLayout email nav + stub /admin/email route
- **Files:** `src/components/admin/AdminLayout.tsx` (edit), `src/components/admin/AdminEmail.tsx` (new), `src/pages/admin/AdminEmailPage.tsx` (new), `src/AppRouter.tsx` (edit), `src/components/admin/AdminLayout.test.tsx` (new)
- **Commit:** `feat(01-04): 01-04-03 gate AdminLayout email nav + stub /admin/email route`
- **Verify:** `grep -c 'useEmailEnabled' src/components/admin/AdminLayout.tsx` (≥1 ✅) && `npx vitest run src/components/admin/AdminLayout.test.tsx` — 2 tests green ✅
- **Details:** Added `Mail` icon import and `useEmailEnabled` import to `AdminLayout.tsx`; call `const emailEnabled = useEmailEnabled()` in the component body; added conditional spread `...(emailEnabled ? [{ name: 'Email', href: '/admin/email', icon: Mail }] : [])` after the Scheduled entry, matching the existing conditional-spread style. When false, no email nav item renders (SRV-05). Created stub `AdminEmail.tsx` (coming-soon placeholder) + thin `AdminEmailPage.tsx` wrapper per AGENTS.md admin page convention. Registered `/admin/email` route in `AppRouter.tsx`. Test mocks heavy hooks (`useAdminAuth`, `useSchedulerHealth`, `useDefaultRelay`, `useCurrentUser`, `useAppContext`, `useTheme`, `LoginArea`) to avoid relay/network/provider setup, wrapped in `QueryClientProvider` + `MemoryRouter`.

## Final verification

```
npx vitest run src/hooks/useEmailEnabled.test.ts src/components/admin/AdminLayout.test.tsx
→ 2 files passed, 11 tests passed (9 useEmailEnabled + 2 AdminLayout)
```

## Files created

- `src/hooks/useEmailEnabled.ts` — thin hook returning `getEmailEnabled()`
- `src/hooks/useEmailEnabled.test.ts` — 9 tests (env/meta resolution, priority, string coercion, default off)
- `src/components/admin/AdminEmail.tsx` — stub "coming soon" email admin component
- `src/pages/admin/AdminEmailPage.tsx` — thin page wrapper for `AdminEmail`
- `src/components/admin/AdminLayout.test.tsx` — 2 tests (nav gating on/off)

## Files edited

- `src/lib/relay.ts` — added `email_enabled?: boolean` to `SwarmConfig`; added `getEmailEnabled()` export
- `src/components/admin/AdminLayout.tsx` — `Mail` icon import, `useEmailEnabled` import + call, conditional email nav entry
- `src/AppRouter.tsx` — `AdminEmailPage` import + `/admin/email` route registration

## Deviations

None. All 3 tasks executed as written; all `<verify><automated>` commands green. The test stubs referenced in the plan (`useEmailEnabled.test.ts`, `AdminLayout.test.tsx`) did not yet exist in the working tree (peer 01-01 had not created them), so they were created from scratch per Rule 2 (auto-add missing critical functionality) — this is consistent with the plan's `files_modified` list which assigns these files to this plan.

## Notes for downstream phases

- The stub `AdminEmailPage` is intentionally minimal — Phase 2 replaces it with the real email admin settings UI (Resend config, subscriber management).
- `useEmailEnabled()` is synchronous (env/meta read at render); a page reload picks up meta-tag changes. No TanStack Query needed.
- `VITE_EMAIL_ENABLED` is a public UI flag (controls UI visibility only, no secrets) — safe as a `VITE_` var, unlike the Resend API key which is server-only.
- The swarm-config meta tag template (`email_enabled` field) is a separate-repo follow-up per AGENTS.md — this plan does not modify the swarm repo.
