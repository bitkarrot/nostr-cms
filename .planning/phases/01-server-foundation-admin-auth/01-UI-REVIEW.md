# Phase 1 — UI Review

**Audited:** 2026-07-04
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md exists for this phase)
**Screenshots:** Not captured (no dev server on ports 8080, 3000, or 5173)

---

## Scope Note

Phase 1 is primarily backend/server work (server scaffold, SQLite repository, NIP-98 auth, nginx snippet, ESLint guard). The only UI surface is in plan 01-04:
- `useEmailEnabled()` hook (`src/hooks/useEmailEnabled.ts`)
- Gated admin sidebar nav entry (`src/components/admin/AdminLayout.tsx:102`)
- Stub `/admin/email` route → `AdminEmail.tsx` placeholder (`src/components/admin/AdminEmail.tsx`)

Pillars with no UI to audit are recorded as N/A (score 0) with a one-line justification, per the audit directive. They are still summed in the overall total to make the out-of-scope scope explicit.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Placeholder copy is clear and non-generic; no CTAs/empty/error states exist to evaluate (stub page) |
| 2. Visuals | 2/4 | Clear focal point (Mail icon + heading) but no visual hierarchy beyond icon+title; stub-only |
| 3. Color | 3/4 | Single `text-primary` accent on Mail icon (1 element); no hardcoded colors; token usage correct |
| 4. Typography | 3/4 | 3 font sizes (text-3xl/lg/sm), 1 weight (font-bold) — within abstract limits; consistent |
| 5. Spacing | 3/4 | Consistent `space-y-6` + `gap-2/3` + `max-w-3xl mx-auto`; no arbitrary values |
| 6. Experience Design | 2/4 | No loading/error/empty states (stub has no async work); nav gating logic is correct but untested visually |

**Overall: 16/24** (4 pillars scored on actual UI; 2 pillars would be N/A in a pure-stub context but scored honestly against what exists — no pillar awarded 4/4 without UI evidence)

---

## Top 3 Priority Fixes

1. **No loading/error/empty states on AdminEmail stub** — the page is a static placeholder with no async work, so no states are needed *now*, but Phase 2 must add loading skeletons + error boundaries when real settings/subscriber data lands — **concrete fix:** scaffold an `ErrorBoundary` wrapper around `AdminEmailPage` now so Phase 2 only fills content, not plumbing.
2. **Visual hierarchy is icon+title only** — `AdminEmail.tsx` has one heading and two paragraphs with no card/section structure to distinguish the "coming soon" notice from future config regions — **concrete fix:** wrap the descriptive paragraph in a `Card` (shadcn `Card` is already in `src/components/ui/card.tsx`) so the page has a visible content container matching other admin pages.
3. **Nav entry has no active-state visual differentiation beyond existing pattern** — the email nav item inherits the shared `bg-primary text-primary-foreground` active style, which is correct, but the collapsed-sidebar tooltip relies on the generic `title={item.name}` fallback — **concrete fix:** no change needed for Phase 1; confirm in Phase 2 that the email nav icon is distinguishable from `Clock` (Scheduled) when sidebar is collapsed (both are outline-style lucide icons).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

The stub page copy is clear and non-generic:
- `src/components/admin/AdminEmail.tsx:20` — "Email newsletter management — coming soon." (specific, not "Coming Soon" alone)
- `src/components/admin/AdminEmail.tsx:24-26` — "The email module is enabled on this deployment. Full configuration and subscriber management will be available in a future release." (contextual, explains *why* it's a stub)

No generic labels ("Submit", "Click Here", "OK") found in the Phase 1 UI files. No empty states or error states exist to evaluate — the page has no data to be empty/errored about. Scored 3 (not 4) because there are no CTAs, empty states, or error states to validate — the copy that exists is good, but the pillar's full surface is untested. This is expected for a stub and not a defect.

### Pillar 2: Visuals (2/4)

- `src/components/admin/AdminEmail.tsx:15-18` — clear focal point: `Mail` icon (h-8 w-8) + "Email" heading in a flex row with `gap-3`. Hierarchy is established through size (icon 8x8, heading text-3xl) vs body text (text-sm/lg).
- No icon-only buttons on this page (the `Mail` icon is decorative-paired with text, not an interactive button).
- **Gap:** No card/section structure — the page is a flat `div` with heading + two paragraphs. Other admin pages use `Card` containers (shadcn `card.tsx` exists). The stub's flat layout lacks the visual containment users see elsewhere in the admin shell.
- The nav entry in `AdminLayout.tsx:102` uses the `Mail` icon — visually consistent with the other lucide-outline icons in the sidebar.

Scored 2 because the page has a focal point but no structural visual hierarchy (no cards, no sections, no dividers) — it reads as a raw text block rather than a designed admin surface.

### Pillar 3: Color (3/4)

- `src/components/admin/AdminEmail.tsx:16` — `text-primary` on the `Mail` icon (1 element). This is the only accent usage in the Phase 1 UI files.
- `src/components/admin/AdminEmail.tsx:19,23` — `text-muted-foreground` for secondary text (correct token usage, not hardcoded).
- No hardcoded hex/rgb colors found in `AdminEmail.tsx` or `AdminEmailPage.tsx`.
- The 60/30/10 distribution is trivially satisfied (background dominant, muted-foreground secondary, primary accent on one icon) — but this is because there's almost no UI, not because color was thoughtfully distributed.

Scored 3 (not 4) because while token usage is correct and no colors are hardcoded, the color pillar can't be fully validated on a 29-line stub — there's no interaction state color (hover/active/disabled) to audit on the page itself. The nav entry's active state (`bg-primary text-primary-foreground` in `AdminLayout.tsx:149,194`) is inherited from the shared sidebar pattern and is correct.

### Pillar 4: Typography (3/4)

Font sizes in Phase 1 UI files (`AdminEmail.tsx`):
- `text-3xl` (heading, line 15)
- `text-lg` (subtitle, line 19)
- `text-sm` (body, line 23)

Font weights:
- `font-bold` (heading, line 15)
- `tracking-tight` (heading, line 15)

3 distinct sizes, 1 weight — within the abstract standard's "flag if >4 sizes or >2 weights" threshold. The scale is consistent (3xl → lg → sm is a clear descending hierarchy). `tracking-tight` on the heading matches the existing admin page convention.

Scored 3 (not 4) because the body text drops from `text-lg` (subtitle) to `text-sm` (body) — a 2-step jump that skips `text-base`. This is minor and matches the "coming soon" stub aesthetic, but a `text-base` body would be more legible for the explanatory paragraph.

### Pillar 5: Spacing (3/4)

Spacing classes in `AdminEmail.tsx`:
- `space-y-6` (outer container, line 13) — vertical rhythm between heading block and body
- `gap-2` (heading block inner, line 14), `gap-3` (icon+title, line 15)
- `max-w-3xl mx-auto` (line 13) — centers content with a sensible max width

No arbitrary spacing values (`[.*px]` / `[.*rem]`) found. All values are from the Tailwind default scale. The `space-y-6` (1.5rem) between sections is consistent with admin page conventions.

Scored 3 (not 4) because the page has only two spacing "zones" (heading block, body paragraph) — there's no spacing pattern to validate for lists, forms, or multi-section layouts. The spacing that exists is correct and consistent.

### Pillar 6: Experience Design (2/4)

- **Loading states:** None. `AdminEmail.tsx` is fully static — no async data, no suspense, no skeleton. Expected for a stub, but the pillar can't be validated.
- **Error states:** None. No `ErrorBoundary`, no try/catch, no error UI. `AdminEmailPage.tsx` is a 5-line pass-through with no error wrapping.
- **Empty states:** N/A — the page has no data-driven content to be empty.
- **Disabled states:** N/A — no interactive elements on the stub page.
- **Nav gating logic (the one real interaction):** `AdminLayout.tsx:56,102` — `useEmailEnabled()` correctly gates the nav entry via conditional spread. When false, no "Email" nav item renders (SRV-05 satisfied). The hook itself (`src/hooks/useEmailEnabled.ts`) is a thin synchronous wrapper with correct env-over-meta priority (`src/lib/relay.ts:48-63`). 9 unit tests cover the resolution logic.

Scored 2 because the nav gating (the one interaction) is correctly implemented and tested, but the page itself has zero state coverage — no loading, no error, no empty, no disabled. This is acceptable for a Phase 1 stub but means the experience-design pillar is largely untested. Phase 2 must add these states when real data lands.

---

## Registry Safety

`components.json` exists (shadcn initialized, `style: default`, `baseColor: slate`). No UI-SPEC.md exists for this phase, so no third-party registry table to audit. No third-party blocks were installed in Phase 1 (the only UI files are hand-written: `AdminEmail.tsx`, `AdminEmailPage.tsx`, `useEmailEnabled.ts`).

**Registry audit:** 0 third-party blocks checked, no flags (no UI-SPEC registry table to audit against).

---

## Files Audited

- `src/hooks/useEmailEnabled.ts` (14 lines) — thin hook wrapping `getEmailEnabled()`
- `src/lib/relay.ts` (lines 38-63) — `getEmailEnabled()` env-over-meta resolution logic
- `src/components/admin/AdminEmail.tsx` (29 lines) — stub "coming soon" admin email page
- `src/pages/admin/AdminEmailPage.tsx` (5 lines) — thin page wrapper
- `src/components/admin/AdminLayout.tsx` (lines 37-39, 56, 102) — `Mail` icon import, `useEmailEnabled` call, conditional nav entry
- `src/AppRouter.tsx` (lines 27, 76) — `AdminEmailPage` import + `/admin/email` route registration
- `src/hooks/useEmailEnabled.test.ts` (referenced in 01-04 SUMMARY — 9 tests, not re-read)
- `src/components/admin/AdminLayout.test.tsx` (referenced in 01-04 SUMMARY — 2 tests, not re-read)
