/**
 * Resolve the site master pubkey (SRV-03).
 *
 * Priority:
 *   1. `MASTER_PUBKEY` env var (server-side analog of the SPA's
 *      `VITE_MASTER_PUBKEY` — never read `VITE_*` server-side per AGENTS.md).
 *   2. Fetch `${SWARM_BASE_URL}/.well-known/nostr.json` and read `names._`
 *      (matching `src/hooks/useRemoteNostrJson.ts` line 30).
 *
 * **Fail closed:** if the master cannot be resolved (fetch fails, non-200,
 * missing `names._`, JSON parse error) return `''` so the `nip98Auth`
 * middleware rejects every admin request — NEVER allow through when the master
 * is unknown (T-01-02).
 *
 * Task 01-02-01 ships the env-only path so the middleware compiles and the
 * 401/403 matrix tests can mock the resolver. Task 01-02-04 adds the
 * nostr.json fetch fallback + 5-minute in-memory cache.
 */

/**
 * Resolve the master pubkey. Task 01-02-01: env-only. Task 01-02-04 extends
 * with the nostr.json fetch fallback + cache.
 */
export async function resolveMasterPubkey(): Promise<string> {
  const env = process.env.MASTER_PUBKEY;
  if (env) {
    return env.toLowerCase().trim();
  }
  // 01-02-04 fills the nostr.json fetch fallback. Until then, fail closed.
  return '';
}
