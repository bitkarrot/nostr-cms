// @vitest-environment node
import { describe, it } from 'vitest';

describe('resolveMasterPubkey (stub — owned by plan 01-02)', () => {
  it.todo('MASTER_PUBKEY env set -> returns it (lowercased, trimmed)');
  it.todo('env unset + nostr.json fetch -> returns names._ entry');
  it.todo('env unset + fetch fails -> fail closed (rejects, no allow-through)');
  it.todo('cache hit within TTL avoids re-fetch');
});
