import { useNostr } from '@nostrify/react';
import { useAppContext } from '@/hooks/useAppContext';
import { DEFAULT_PUBLISH_RELAYS } from '@/App';

export function useDefaultRelay() {
  const { config } = useAppContext();
  const { nostr: poolNostr } = useNostr();

  // Get the default relay from env var ONLY
  // This is the single source of truth - cannot be overridden by localStorage
  const defaultRelayUrl = import.meta.env.VITE_DEFAULT_RELAY ||
    config.relayMetadata?.relays?.[0]?.url;

  // Create a dedicated connection to the default relay only
  const defaultRelay = poolNostr.relay(defaultRelayUrl);

  // Get publishing relays: always include the default relay first,
  // then add additional relays from relayMetadata or defaults
  const metadataWriteRelays = config.relayMetadata?.relays?.filter(r => r.write).map(r => r.url) || [];
  const additionalRelays = metadataWriteRelays.filter(r => r !== defaultRelayUrl);

  const publishRelays = defaultRelayUrl
    ? [defaultRelayUrl, ...DEFAULT_PUBLISH_RELAYS, ...additionalRelays]
    : [...DEFAULT_PUBLISH_RELAYS, ...additionalRelays];

  // Remove duplicates
  const uniquePublishRelays = Array.from(new Set(publishRelays.filter(Boolean)));

  return {
    defaultRelay,
    defaultRelayUrl,
    publishRelays: uniquePublishRelays,
    nostr: defaultRelay, // Use the dedicated relay for reading
    poolNostr, // Expose the pool for publishing if needed
  };
}