// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { resolveMasterPubkey, resetMasterPubkeyCache } from './master-pubkey';

/**
 * resolveMasterPubkey (SRV-03, T-01-02 fail-closed).
 *
 * Priority: MASTER_PUBKEY env -> nostr.json fetch names._ -> fail closed ('').
 * 5-minute in-memory cache avoids refetch within TTL.
 */

const SAMPLE_PK = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const SAMPLE_PK_UPPER = 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2';

describe('resolveMasterPubkey (SRV-03, T-01-02 fail-closed)', () => {
  beforeEach(() => {
    resetMasterPubkeyCache();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    resetMasterPubkeyCache();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('MASTER_PUBKEY env set -> returns it (lowercased, trimmed); fetch not called', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('MASTER_PUBKEY', `  ${SAMPLE_PK_UPPER}  `);

    const result = await resolveMasterPubkey();
    expect(result).toBe(SAMPLE_PK);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('env unset + nostr.json fetch returns { names: { _: <pk> } } -> returns lowercased pk', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ names: { _: SAMPLE_PK_UPPER } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SWARM_BASE_URL', 'https://relay.example.com');

    const result = await resolveMasterPubkey();
    expect(result).toBe(SAMPLE_PK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example.com/.well-known/nostr.json',
    );
  });

  it('env unset + fetch rejects (network error) -> fail closed (returns "")', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SWARM_BASE_URL', 'https://relay.example.com');

    const result = await resolveMasterPubkey();
    expect(result).toBe('');
  });

  it('env unset + fetch returns 404 -> fail closed (returns "")', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SWARM_BASE_URL', 'https://relay.example.com');

    const result = await resolveMasterPubkey();
    expect(result).toBe('');
  });

  it('env unset + fetch returns malformed JSON -> fail closed (returns "")', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SWARM_BASE_URL', 'https://relay.example.com');

    const result = await resolveMasterPubkey();
    expect(result).toBe('');
  });

  it('env unset + nostr.json missing names._ -> fail closed (returns "")', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ names: { alice: 'pk1' } }), // no _ key
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SWARM_BASE_URL', 'https://relay.example.com');

    const result = await resolveMasterPubkey();
    expect(result).toBe('');
  });

  it('env set + nostr.json would say otherwise -> env wins (priority)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('MASTER_PUBKEY', SAMPLE_PK);
    vi.stubEnv('SWARM_BASE_URL', 'https://relay.example.com');

    const result = await resolveMasterPubkey();
    expect(result).toBe(SAMPLE_PK);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SWARM_BASE_URL unset -> fail closed (returns ""), fetch not called', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // SWARM_BASE_URL not stubbed (undefined)

    const result = await resolveMasterPubkey();
    expect(result).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cache hit within TTL avoids re-fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ names: { _: SAMPLE_PK } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SWARM_BASE_URL', 'https://relay.example.com');

    // First call fetches.
    const r1 = await resolveMasterPubkey();
    expect(r1).toBe(SAMPLE_PK);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call within TTL serves from cache — no new fetch.
    const r2 = await resolveMasterPubkey();
    expect(r2).toBe(SAMPLE_PK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fail-closed empty result is also cached within TTL', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('down'));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SWARM_BASE_URL', 'https://relay.example.com');

    // First call fails closed (fetch called once).
    const r1 = await resolveMasterPubkey();
    expect(r1).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call within TTL serves the cached empty result — no new fetch
    // (so a transient outage doesn't hammer swarm).
    const r2 = await resolveMasterPubkey();
    expect(r2).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
