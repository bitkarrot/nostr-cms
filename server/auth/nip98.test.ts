// @vitest-environment node
import { describe, it } from 'vitest';

describe('NIP-98 verification (stub — owned by plan 01-02)', () => {
  it.todo('valid NIP-98 from master pubkey -> 200');
  it.todo('missing Authorization header -> 401');
  it.todo('bad signature -> 401');
  it.todo('valid signature but non-master pubkey -> 403');
  it.todo('expired event (>60s) -> 401');
  it.todo('wrong URL (u tag mismatch) -> 401');
  it.todo('wrong method (method tag mismatch) -> 401');
  it.todo('payload tag present but body tampered -> 401');
  it.todo('proxy URL reconstruction: X-Forwarded-Proto/Host -> public URL matches u tag');
});
