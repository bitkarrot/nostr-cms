import { ReactNode, useEffect, useCallback, useMemo } from 'react';
import { z } from 'zod';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme, type RelayMetadata } from '@/contexts/AppContext';

interface AppProviderProps {
  children: ReactNode;
  /** Application storage key */
  storageKey: string;
  /** Default app configuration */
  defaultConfig: AppConfig;
}

// Zod schema for RelayMetadata validation
const RelayMetadataSchema = z.object({
  relays: z.array(z.object({
    url: z.string().url(),
    read: z.boolean(),
    write: z.boolean(),
  })),
  updatedAt: z.number(),
}) satisfies z.ZodType<RelayMetadata>;

// Zod schema for AppConfig validation
const AppConfigSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']),
  relayMetadata: RelayMetadataSchema,
  siteConfig: z.object({
    title: z.string().optional(),
    logo: z.string().optional(),
    favicon: z.string().optional(),
    ogImage: z.string().optional(),
    heroTitle: z.string().optional(),
    heroSubtitle: z.string().optional(),
    heroBackground: z.string().optional(),
    showEvents: z.boolean().optional(),
    showBlog: z.boolean().optional(),
    maxEvents: z.number().optional(),
    maxBlogPosts: z.number().optional(),
    defaultRelay: z.string().optional(),
    publishRelays: z.array(z.string()).optional(),
  }).optional(),
  navigation: z.array(z.object({
    id: z.string(),
    name: z.string(),
    href: z.string(),
    isSubmenu: z.boolean(),
    parentId: z.string().optional(),
  })).optional(),
}) satisfies z.ZodType<AppConfig>;

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
  } = props;

  // App configuration state with localStorage persistence
  const [rawConfig, setConfig] = useLocalStorage<Partial<AppConfig>>(
    storageKey,
    {},
    {
      serialize: JSON.stringify,
      deserialize: (value: string) => {
        const parsed = JSON.parse(value);
        
        // Data migration: Handle old navigation object format
        if (parsed && typeof parsed === 'object' && parsed.navigation && typeof parsed.navigation === 'object' && !Array.isArray(parsed.navigation) && 'navigation' in parsed.navigation) {
          parsed.navigation = (parsed.navigation as Record<string, unknown>).navigation;
        }
        
        return AppConfigSchema.partial().parse(parsed);
      }
    }
  );

  // Generic config updater with callback pattern
  const updateConfig = useCallback((updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => {
    setConfig(updater);
  }, [setConfig]);

  const config = useMemo(() => {
    // Start with defaultConfig
    const merged = { ...defaultConfig };
    
    console.log('[AppProvider] rawConfig from localStorage:', rawConfig);

    // Merge rawConfig (localStorage)
    if (rawConfig.theme) merged.theme = rawConfig.theme;
    if (rawConfig.relayMetadata) merged.relayMetadata = rawConfig.relayMetadata;
    
    // Deep merge siteConfig to ensure we don't lose defaults
    if (defaultConfig.siteConfig || rawConfig.siteConfig) {
      merged.siteConfig = {
        ...(defaultConfig.siteConfig || {}),
        ...(rawConfig.siteConfig || {}),
      };
    }
    
    // Use rawConfig navigation if it exists, otherwise defaultConfig
    if (rawConfig.navigation) merged.navigation = rawConfig.navigation;
    
    console.log('[AppProvider] Final merged config:', merged);
    return merged;
  }, [defaultConfig, rawConfig]);

  const appContextValue: AppContextType = useMemo(() => ({
    config,
    updateConfig,
  }), [config, updateConfig]);

  // Apply theme effects to document
  useApplyTheme(config.theme);

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to apply theme changes to the document root
 */
function useApplyTheme(theme: Theme) {
  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  // Handle system theme changes when theme is set to "system"
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');

      const systemTheme = mediaQuery.matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);
}