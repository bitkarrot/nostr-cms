import type { Context } from 'hono';
import type { NostrEvent } from '@nostrify/types';

import { NIP98 } from '@nostrify/nostrify';

/**
 * NIP-98 HTTP auth verification (SRV-03).
 *
 * This module is thin glue around `@nostrify/nostrify`'s `NIP98.verify`, which
 * performs the full NIP-98 check using `nostr-tools`' `verifyEvent` (pure
 * Schnorr crypto via `@noble/curves`). We do NOT hand-roll signature
 * verification.
 *
 * `NIP98.verify(request)` checks, in order:
 *   1. `Authorization: Nostr <base64-token>` header present + parseable.
 *   2. Base64-decodes to a Nostr event (`N64.decodeEvent`).
 *   3. `verifyEvent(event)` — Schnorr signature valid.
 *   4. `kind === 27235`.
 *   5. `u` tag === `request.url` (the absolute request URL).
 *   6. `method` tag === `request.method`.
 *   7. `created_at` within `maxAge` (default 60_000ms — the NIP-98 suggestion).
 *   8. For POST/PUT/PATCH, the `payload` tag (SHA-256 of the body) matches.
 *
 * It returns the verified `NostrEvent` or throws a human-readable `Error`. The
 * `nip98Auth` middleware maps any throw to a 401 (T-01-02 forgery/expiry
 * mitigation).
 */

/**
 * Reconstruct the *public* request URL from `X-Forwarded-*` headers so that
 * `NIP98.verify`'s `u`-tag check passes behind nginx (T-01-03 — the #1 bug
 * risk in this phase).
 *
 * Behind a reverse proxy, `c.req.raw.url` is the *local* proxied URL
 * (e.g. `http://127.0.0.1:3001/api/email/admin/ping`), but the SPA signed the
 * *public* URL (e.g. `https://relay.example.com/api/email/admin/ping`). Without
 * reconstruction every legit request fails the `u`-tag check.
 *
 * The nginx snippet (plan 01-03, D-03) sends `X-Forwarded-Proto` and
 * `X-Forwarded-Host`. We fall back to `http` / the `Host` header when they are
 * absent (direct dev access).
 *
 * Returns a new `Request` whose `.url` is the public URL, carrying the original
 * method, headers (including the `Authorization` token), and body.
 */
export function publicRequest(c: Context): Request {
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || '';
  // Strip any leading origin from the raw url so we keep only the path+query.
  // `c.req.raw.url` is normally a path (`/api/email/admin/ping?x=1`) but be
  // defensive in case a runtime gives an absolute URL.
  const path = c.req.raw.url.replace(/^https?:\/\/[^/]+/, '');
  const url = `${proto}://${host}${path}`;
  return new Request(url, c.req.raw);
}

/**
 * Verify a NIP-98 `Authorization: Nostr <token>` header on the given `Request`.
 *
 * Thin glue over `NIP98.verify` (default `maxAge` 60s, payload validation on
 * for POST/PUT/PATCH). Returns the verified event (from which the caller reads
 * `event.pubkey`) or re-throws the human-readable `Error` on any failure — the
 * middleware maps that to a 401.
 */
export async function verifyNip98(request: Request): Promise<NostrEvent> {
  return NIP98.verify(request);
}
