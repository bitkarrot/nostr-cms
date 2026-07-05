/**
 * Resolve the site master pubkey (SRV-03).
 *
 * Priority:
 *   1. `MASTER_PUBKEY` env var (server-side analog of the SPA's
 *      `VITE_MASTER_PUBKEY` — never read `VITE_*` server-side per AGENTS.md).
 *   2. Fetch `${SWARM_BASE_URL}/.well-known/nostr.json` and read `names._`
 *      (matching `src/hooks/useRemoteNostrJson.ts` line 30:
 *      `nostrJson?.names?._?.toLowerCase().trim()`).
 *
 * **Fail closed:** if the master cannot be resolved (fetch fails, non-200,
 * missing `names._`, JSON parse error) return `''` so the `nip98Auth`
 * middleware rejects every admin request — NEVER allow through when the master
 * is unknown (T-01-02).
 *
 * A 5-minute in-memory cache (matching the SPA's `staleTime: 5 * 60 * 1000`)
 * avoids fetching nostr.json on every admin request. The fail-closed empty
 * result is also cached for the TTL so a transient swarm outage doesn't hammer
 * the fetch.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedMaster {
  pubkey: string;
  expiresAt: number;
}

let cache: CachedMaster | null = null;

/** Reset the cache — exported for tests. */
export function resetMasterPubkeyCache(): void {
  cache = null;
}

/**
 * Resolve the master pubkey. Env wins; else fetch nostr.json `names._`; else
 * fail closed (return ''). Result is cached for CACHE_TTL_MS.
 */
export async function resolveMasterPubkey(): Promise<string> {
  // Env always wins and bypasses the cache (it can change between requests in
  // tests; and there's no fetch cost to avoid).
  const env = process.env.MASTER_PUBKEY;
  if (env) {
    return env.toLowerCase().trim();
  }

  // Serve from cache if fresh.
  if (cache && Date.now() < cache.expiresAt) {
    return cache.pubkey;
  }

  const pubkey = await fetchMasterFromNostrJson();
  cache = { pubkey, expiresAt: Date.now() + CACHE_TTL_MS };
  return pubkey;
}

/** Fetch `names._` from `${SWARM_BASE_URL}/.well-known/nostr.json`. Fail closed. */
async function fetchMasterFromNostrJson(): Promise<string> {
  const baseUrl = process.env.SWARM_BASE_URL;
  if (!baseUrl) {
    // No swarm URL configured — fail closed.
    return '';
  }

  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/.well-known/nostr.json`;
    const res = await fetch(url);
    if (!res.ok) {
      return '';
    }
    const data = (await res.json()) as { names?: Record<string, string> };
    const master = data?.names?._;
    if (!master) {
      return '';
    }
    return master.toLowerCase().trim();
  } catch {
    // Network error, JSON parse error, etc. — fail closed.
    return '';
  }
}
