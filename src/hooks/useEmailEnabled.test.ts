import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * useEmailEnabled() / getEmailEnabled() tests (SRV-05).
 *
 * Priority: VITE_EMAIL_ENABLED env → swarm-config meta tag `email_enabled`.
 * Default when neither is set: false (opt-in, default off).
 * String "true" (case-insensitive) coerces to true; other strings → false.
 *
 * jsdom env (SPA test). Env is stubbed via vi.stubEnv + vi.resetModules so the
 * freshly imported getEmailEnabled picks up the new import.meta.env value; the
 * meta tag is set by injecting <meta name="swarm-config"> into document.head.
 */

interface EmailEnabledModule {
  getEmailEnabled: () => boolean;
  useEmailEnabled: () => boolean;
}

async function loadModule(): Promise<EmailEnabledModule> {
  vi.resetModules();
  const relay = await import('@/lib/relay');
  const hook = await import('@/hooks/useEmailEnabled');
  return {
    getEmailEnabled: relay.getEmailEnabled,
    useEmailEnabled: hook.useEmailEnabled,
  };
}

function setMetaConfig(config: Record<string, unknown> | null): void {
  document.head.querySelectorAll('meta[name="swarm-config"]').forEach(m => m.remove());
  if (config !== null) {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'swarm-config');
    meta.setAttribute('content', JSON.stringify(config));
    document.head.appendChild(meta);
  }
}

describe('useEmailEnabled / getEmailEnabled', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    setMetaConfig(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setMetaConfig(null);
    vi.resetModules();
  });

  it('returns true when VITE_EMAIL_ENABLED=true', async () => {
    vi.stubEnv('VITE_EMAIL_ENABLED', 'true');
    const { getEmailEnabled, useEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(true);
    expect(useEmailEnabled()).toBe(true);
  });

  it('returns false when VITE_EMAIL_ENABLED=false', async () => {
    vi.stubEnv('VITE_EMAIL_ENABLED', 'false');
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(false);
  });

  it('returns true when env unset and meta tag email_enabled is true', async () => {
    setMetaConfig({ email_enabled: true });
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(true);
  });

  it('returns false when meta tag email_enabled is the string "false" (WR-07 strict coercion)', async () => {
    // WR-07: a string "false" in the meta tag must NOT enable the module
    // (the old !!injected coercion treated "false" as truthy — default-off
    // violation). Only boolean true or string "true" (case-insensitive) enable.
    setMetaConfig({ email_enabled: 'false' });
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(false);
  });

  it('returns true when meta tag email_enabled is the string "true" (WR-07)', async () => {
    setMetaConfig({ email_enabled: 'true' });
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(true);
  });

  it('returns false when meta tag email_enabled is the string "TRUE" (WR-07 case-insensitive true)', async () => {
    setMetaConfig({ email_enabled: 'TRUE' });
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(true);
  });

  it('returns false when both env and meta are unset (default off, SRV-05)', async () => {
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(false);
  });

  it('coerces the string "true" (case-insensitive) to boolean true', async () => {
    vi.stubEnv('VITE_EMAIL_ENABLED', 'TRUE');
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(true);
  });

  it('coerces the string "false" to boolean false', async () => {
    vi.stubEnv('VITE_EMAIL_ENABLED', 'false');
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(false);
  });

  // --- 01-04-02: priority cases — env wins over meta when both set ---

  it('env=true wins over meta email_enabled=false (env wins)', async () => {
    vi.stubEnv('VITE_EMAIL_ENABLED', 'true');
    setMetaConfig({ email_enabled: false });
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(true);
  });

  it('env=false wins over meta email_enabled=true (env wins, reverse case)', async () => {
    vi.stubEnv('VITE_EMAIL_ENABLED', 'false');
    setMetaConfig({ email_enabled: true });
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(false);
  });

  it('env set to non-"true" string + meta=true → false (env short-circuits, string coercion)', async () => {
    // env="1" is set but is not the literal "true" string, so it resolves false.
    // Because env is set, meta is NOT consulted — assert false proves env-wins
    // short-circuits before meta (otherwise meta=true would yield true).
    vi.stubEnv('VITE_EMAIL_ENABLED', '1');
    setMetaConfig({ email_enabled: true });
    const { getEmailEnabled } = await loadModule();
    expect(getEmailEnabled()).toBe(false);
  });
});
