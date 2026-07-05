// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { createApp } from '../app';

/**
 * GET /api/email/health (D-04, SRV-01).
 *
 * The health route is public (no auth), registered BEFORE the NIP-98 admin
 * middleware, and returns exactly `{"ok":true}` — no DB path, no subscriber
 * count, no config fields. Deeper admin health is deferred to Phase 2.
 */
describe('GET /api/email/health (D-04 — public, no auth, {ok:true} only)', () => {
  it('returns 200 with body {"ok":true} and no auth required', async () => {
    const app = createApp();
    // No Authorization header sent — the route is public.
    const res = await app.request('/api/email/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('response body contains exactly one key "ok" — no DB/config/subscriber fields', async () => {
    const app = createApp();
    const res = await app.request('/api/email/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Single-key assertion: the body has exactly { ok: true } and nothing else
    // (no db path, no subscriber count, no config — D-04).
    expect(Object.keys(body).sort()).toEqual(['ok']);
    expect(body.ok).toBe(true);
  });
});
