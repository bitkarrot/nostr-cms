import type { Context, MiddlewareHandler, Env } from 'hono';

import { publicRequest, verifyNip98 } from '../auth/nip98';

/** Hono env binding: admin routes stash the verified signer pubkey here. */
export interface Nip98Env extends Env {
  Variables: {
    pubkey: string;
  };
}

/**
 * Hono middleware that requires a valid NIP-98 signature from the site master
 * pubkey (SRV-03). Mount it on `/api/email/admin/*` AFTER the public health
 * route so `/api/email/health` stays public (D-04).
 *
 * Flow (T-01-02 forgery/expiry mitigation):
 *   1. `verifyNip98(publicRequest(c))` — delegates to `@nostrify/nostrify`
 *      `NIP98.verify` (pure crypto). On any throw (missing header, bad sig,
 *      expired >60s, wrong URL/method, tampered payload) → 401.
 *   2. Resolve the master pubkey via `opts.masterResolver()` (env or
 *      nostr.json fetch, fail-closed). If the master is empty → 401 (fail
 *      closed — never allow through when the master is unknown).
 *   3. Compare `event.pubkey` (lowercased) to the master (lowercased). Mismatch
 *      → 403 (valid signature, but not the site master).
 *   4. On match, stash the signer pubkey on the context (`c.set('pubkey', ...)`)
 *      and call `next()` so downstream admin handlers can read it.
 *
 * `publicRequest(c)` reconstructs the public URL from `X-Forwarded-*` headers
 * (T-01-03) so the `u`-tag check passes behind nginx.
 */
export function nip98Auth(opts: {
  masterResolver: () => Promise<string>;
}): MiddlewareHandler<Nip98Env> {
  return async (c: Context<Nip98Env>, next) => {
    let event;
    try {
      event = await verifyNip98(publicRequest(c));
    } catch {
      return c.json({ error: 'unauthorized' }, 401);
    }

    let master: string;
    try {
      master = (await opts.masterResolver()).toLowerCase().trim();
    } catch {
      // WR-08: a throwing resolver (fetch reject, non-200, malformed JSON,
      // unset SWARM_BASE_URL) must fail closed → 401, not 500.
      return c.json({ error: 'unauthorized' }, 401);
    }
    if (!master) {
      // Fail closed — no resolvable master means no admin access.
      return c.json({ error: 'unauthorized' }, 401);
    }
    if (event.pubkey.toLowerCase() !== master) {
      return c.json({ error: 'forbidden' }, 403);
    }

    c.set('pubkey', event.pubkey);
    await next();
  };
}
