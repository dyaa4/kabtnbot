// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { GettingStarted } from './GettingStarted.js';

function configWith(over: {
  protection?: boolean;
  welcomeEnabled?: boolean;
  channel?: string | null;
  bannerUrl?: string | null;
  adminRole?: string | null;
}) {
  return {
    admin_role_id: over.adminRole ?? null,
    protection: { enabled: over.protection ?? false },
    welcome: {
      enabled: over.welcomeEnabled ?? false,
      channel_id: over.channel ?? null,
      banner_url: over.bannerUrl ?? null,
    },
  };
}

function stubFetch(config: object, bannerExists: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/assets/welcome-banner')) {
        return bannerExists
          ? new Response(new Blob([new Uint8Array([1])]), { status: 200, headers: { 'Content-Type': 'image/png' } })
          : new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status: 404 });
      }
      return new Response(JSON.stringify(config), { status: 200 });
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <GettingStarted guildId="g1" />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe('GettingStarted', () => {
  it('lists open steps with links and a 0/3 progress for a fresh guild', async () => {
    stubFetch(configWith({}), false);
    renderCard();
    expect(await screen.findByText(/ابدأ هنا|Getting started/)).toBeTruthy();
    expect(screen.getByText('0/3')).toBeTruthy();
    expect(screen.getAllByText(/اضبطه|Set up/)).toHaveLength(4); // 3 required + 1 optional step open
  });

  it('counts partially completed setups', async () => {
    stubFetch(configWith({ protection: true, welcomeEnabled: true, channel: 'c1' }), false);
    renderCard();
    expect(await screen.findByText('2/3')).toBeTruthy();
  });

  it('disappears once all required steps are done (optional admin role may stay unset)', async () => {
    stubFetch(configWith({ protection: true, welcomeEnabled: true, channel: 'c1' }), true);
    const { container } = renderCard();
    // wait for queries to settle, then nothing is rendered
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toBe('');
  });
});
