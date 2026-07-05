// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import type { NostrEvent } from '@nostrify/types';

import { generateSecretKey, finalizeEvent, getPublicKey } from 'nostr-tools/pure';

import { nip98Auth, type Nip98Env } from '../middleware/nip98Auth';

/**
 * NIP-98 verification (SRV-03, T-01-02, T-01-03).
 *
 * These tests build a Hono app with the `nip98Auth` middleware + a dummy admin
 * route, sign real kind 27235 events with `nostr-tools/pure` (pure crypto,
 * works in Node), and assert the 401/403/200 matrix. The token format matches
 * the SPA's `fetchWithNip98` (`btoa(JSON.stringify(signed))`,
 * `Authorization: Nostr <token>`).
 */

// Fixed master keypair for the matrix tests. The middleware's masterResolver
// is mocked to return this pubkey so we can test master vs non-master without
// touching env/fetch.
const MASTER_SK = generateSecretKey();
const MASTER_PK = getPublicKey(MASTER_SK);
// A second keypair that is NOT the master (for the 403 case).
const OTHER_SK = generateSecretKey();
const OTHER_PK = getPublicKey(OTHER_SK);

const PUBLIC_URL = 'https://relay.example.com/api/email/admin/ping';

/** Build a kind 27235 event template matching the SPA's fetchWithNip98 format. */
function buildTemplate(
  url: string,
  method: string,
  createdAt: number,
  payload?: string,
): Omit<NostrEvent, 'id' | 'pubkey' | 'sig'> {
  const tags: string[][] = [
    ['u', url],
    ['method', method],
  ];
  if (payload !== undefined) {
    tags.push(['payload', payload]);
  }
  return {
    kind: 27235,
    created_at: createdAt,
    tags,
    content: '',
  };
}

/** Sign a template with a secret key and return the base64 token the SPA sends. */
function signToken(
  template: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>,
  sk: Uint8Array,
): string {
  const signed = finalizeEvent(template, sk);
  return Buffer.from(JSON.stringify(signed)).toString('base64');
}

/** Build a Hono app with the nip98Auth middleware + GET/POST ping routes. */
function buildApp(masterResolver: () => Promise<string>): Hono<Nip98Env> {
  const app = new Hono<Nip98Env>();
  app.use('/*', nip98Auth({ masterResolver }));
  app.get('/api/email/admin/ping', (c) =>
    c.json({ ok: true, pubkey: c.get('pubkey') }, 200),
  );
  app.post('/api/email/admin/ping', async (c) => {
    await c.req.text();
    return c.json({ ok: true, pubkey: c.get('pubkey') }, 200);
  });
  return app;
}

/** Default master resolver for the 01-02-01 matrix (returns the fixed master). */
const masterResolver = () => Promise.resolve(MASTER_PK);

/** Default forwarded headers so publicRequest reconstructs PUBLIC_URL. */
const FORWARDED_HEADERS = {
  'x-forwarded-proto': 'https',
  'x-forwarded-host': 'relay.example.com',
};

/** Shorthand: fire a request at the app with optional headers/body. */
async function req(
  app: Hono<Nip98Env>,
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: string } = {},
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: { ...FORWARDED_HEADERS, ...opts.headers },
  };
  if (opts.body !== undefined) {
    (init as RequestInit).body = opts.body;
  }
  return app.request(path, init);
}

describe('NIP-98 verification — 01-02-01 accept/reject matrix (T-01-02)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('valid NIP-98 from master pubkey -> 200', async () => {
    const app = buildApp(masterResolver);
    const token = signToken(
      buildTemplate(PUBLIC_URL, 'GET', Math.floor(Date.now() / 1000)),
      MASTER_SK,
    );
    const res = await req(app, 'GET', '/api/email/admin/ping', {
      headers: { authorization: `Nostr ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; pubkey: string };
    expect(body.ok).toBe(true);
    expect(body.pubkey).toBe(MASTER_PK);
  });

  it('missing Authorization header -> 401', async () => {
    const app = buildApp(masterResolver);
    const res = await req(app, 'GET', '/api/email/admin/ping');
    expect(res.status).toBe(401);
  });

  it('bad/tampered signature -> 401', async () => {
    const app = buildApp(masterResolver);
    const template = buildTemplate(
      PUBLIC_URL,
      'GET',
      Math.floor(Date.now() / 1000),
    );
    const signed = finalizeEvent(template, MASTER_SK) as NostrEvent;
    // Flip a byte in the signature to invalidate it.
    const sigBytes = Buffer.from(signed.sig, 'hex');
    sigBytes[0] = sigBytes[0] ^ 0xff;
    signed.sig = sigBytes.toString('hex');
    const token = Buffer.from(JSON.stringify(signed)).toString('base64');
    const res = await req(app, 'GET', '/api/email/admin/ping', {
      headers: { authorization: `Nostr ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('valid signature from a non-master pubkey -> 403', async () => {
    const app = buildApp(masterResolver);
    const token = signToken(
      buildTemplate(PUBLIC_URL, 'GET', Math.floor(Date.now() / 1000)),
      OTHER_SK,
    );
    const res = await req(app, 'GET', '/api/email/admin/ping', {
      headers: { authorization: `Nostr ${token}` },
    });
    expect(res.status).toBe(403);
    expect(OTHER_PK).not.toBe(MASTER_PK); // sanity: the keys really differ
  });

  it('fail-closed: empty master resolver -> 401 even with valid sig', async () => {
    const app = buildApp(() => Promise.resolve(''));
    const token = signToken(
      buildTemplate(PUBLIC_URL, 'GET', Math.floor(Date.now() / 1000)),
      MASTER_SK,
    );
    const res = await req(app, 'GET', '/api/email/admin/ping', {
      headers: { authorization: `Nostr ${token}` },
    });
    expect(res.status).toBe(401);
  });
});

describe('NIP-98 verification — 01-02-02 remaining reject paths (T-01-02)', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('expired event (>60s) -> 401', async () => {
    const app = buildApp(masterResolver);
    // created_at 61 seconds in the past -> age >= 60000ms -> NIP98.verify throws.
    const token = signToken(
      buildTemplate(PUBLIC_URL, 'GET', Math.floor(Date.now() / 1000) - 61),
      MASTER_SK,
    );
    const res = await req(app, 'GET', '/api/email/admin/ping', {
      headers: { authorization: `Nostr ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('wrong URL (u tag mismatch) -> 401', async () => {
    const app = buildApp(masterResolver);
    // Sign against a different endpoint than the request targets.
    const token = signToken(
      buildTemplate(
        'https://relay.example.com/api/email/admin/settings',
        'GET',
        Math.floor(Date.now() / 1000),
      ),
      MASTER_SK,
    );
    const res = await req(app, 'GET', '/api/email/admin/ping', {
      headers: { authorization: `Nostr ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('wrong method (method tag mismatch) -> 401', async () => {
    const app = buildApp(masterResolver);
    // Sign with method=POST but send a GET request.
    const token = signToken(
      buildTemplate(PUBLIC_URL, 'POST', Math.floor(Date.now() / 1000)),
      MASTER_SK,
    );
    const res = await req(app, 'GET', '/api/email/admin/ping', {
      headers: { authorization: `Nostr ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it('payload tag present but body tampered -> 401', async () => {
    const app = buildApp(masterResolver);
    // Compute the SHA-256 of the original body, sign with a payload tag, then
    // send a DIFFERENT body so the digest check fails.
    const originalBody = JSON.stringify({ hello: 'world' });
    const tamperedBody = JSON.stringify({ hello: 'TAMPERED' });
    const digest = await sha256Hex(originalBody);
    const token = signToken(
      buildTemplate(
        PUBLIC_URL,
        'POST',
        Math.floor(Date.now() / 1000),
        digest,
      ),
      MASTER_SK,
    );
    const res = await req(app, 'POST', '/api/email/admin/ping', {
      headers: {
        authorization: `Nostr ${token}`,
        'content-type': 'application/json',
      },
      body: tamperedBody,
    });
    expect(res.status).toBe(401);
  });
});

/** Compute the SHA-256 hex digest of a string (for the payload tag). */
async function sha256Hex(text: string): Promise<string> {
  const buffer = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Buffer.from(new Uint8Array(digest)).toString('hex');
}
