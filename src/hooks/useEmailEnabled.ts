import { getEmailEnabled } from '@/lib/relay';

/**
 * Whether the email newsletter module is enabled (SRV-05).
 *
 * Resolves `VITE_EMAIL_ENABLED` (build-time env) over `email_enabled` in the
 * swarm-config meta tag (runtime), defaulting to false when neither is set.
 * The value is read synchronously from env/meta at render — a page reload
 * picks up meta-tag changes (mirrors how `getMasterPubkey` is consumed in
 * `useRemoteNostrJson`). No TanStack Query: the inputs are static per page load.
 */
export function useEmailEnabled(): boolean {
  return getEmailEnabled();
}
