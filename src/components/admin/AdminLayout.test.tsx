import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock heavy hooks so AdminLayout renders without relay/network/providers.
// useEmailEnabled is mocked with a spy so each test can flip its return value.
vi.mock('@/hooks/useEmailEnabled', () => ({
  useEmailEnabled: vi.fn(),
}));
vi.mock('@/hooks/useRemoteNostrJson', () => ({
  useAdminAuth: () => ({ isAdmin: false, isMaster: false, isLoading: false }),
}));
vi.mock('@/hooks/useSchedulerHealth', () => ({
  useSchedulerHealth: () => ({ data: false }),
}));
vi.mock('@/hooks/useDefaultRelay', () => ({
  useDefaultRelay: () => ({ nostr: null }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: undefined }),
}));
vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({
    config: { siteConfig: { readOnlyAdminAccess: false } },
    updateConfig: vi.fn(),
  }),
}));
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));
vi.mock('@/components/auth/LoginArea', () => ({
  LoginArea: () => null,
}));

import AdminLayout from './AdminLayout';
import { useEmailEnabled } from '@/hooks/useEmailEnabled';

const mockedUseEmailEnabled = vi.mocked(useEmailEnabled);

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin']}>
        <AdminLayout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminLayout email nav gating (SRV-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders no Email nav item when useEmailEnabled returns false', () => {
    mockedUseEmailEnabled.mockReturnValue(false);
    renderLayout();
    expect(screen.queryByText('Email')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Email' })).toBeNull();
  });

  it('renders the Email nav item with href /admin/email when useEmailEnabled returns true', () => {
    mockedUseEmailEnabled.mockReturnValue(true);
    renderLayout();
    // Nav renders in both mobile and desktop sidebars, so expect multiple matches.
    const emailLinks = screen.getAllByRole('link', { name: 'Email' });
    expect(emailLinks.length).toBeGreaterThan(0);
    for (const link of emailLinks) {
      expect(link.getAttribute('href')).toBe('/admin/email');
    }
  });
});
