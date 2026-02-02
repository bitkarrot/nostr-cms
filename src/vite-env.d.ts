/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_RELAY: string;
  readonly VITE_MASTER_PUBKEY: string;
  readonly VITE_REMOTE_NOSTR_JSON_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
