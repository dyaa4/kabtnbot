// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { ToastProvider } from '../components/Toast.js';
import { GuildList } from './GuildList.js';

const INVITE = 'https://discord.com/oauth2/x';

let guilds: Array<{ id: string; name: string; icon: string | null }> = [];

beforeEach(() => {
  guilds = [{ id: 'g1', name: 'Alpha', icon: null }];
  vi.unstubAllGlobals();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (url.includes('/api/guilds')) return json(guilds);
      if (url.includes('/api/me/plan')) return json({ premium: false, max_links: 1, linked_guild_ids: [] });
      if (url.includes('/api/meta')) return json({ clientId: 'c1', inviteUrl: INVITE });
      if (url.includes('/api/me')) return json({ uid: 'u1', uname: 'dyaa', avatar: null });
      if (url.includes('/api/admin/me')) return json({ isSuperAdmin: false });
      if (url.includes('/api/status')) return json({ online: true, last_seen: null, guild_count: 1 });
      return json({});
    }),
  );
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <ToastProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <GuildList />
          </MemoryRouter>
        </QueryClientProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('GuildList add-server entry points', () => {
  it('shows a header button and a plus tile, both pointing at the invite URL', async () => {
    renderPage();
    const links = await screen.findAllByRole('link', { name: /أضف سيرفر|Add server/ });
    expect(links.length).toBe(2); // header button + grid tile
    for (const link of links) {
      expect(link.getAttribute('href')).toBe(INVITE);
      expect(link.getAttribute('target')).toBe('_blank');
    }
  });

  it('still offers the plus tile when the user has no guilds', async () => {
    guilds = [];
    renderPage();
    const links = await screen.findAllByRole('link', { name: /أضف سيرفر|Add server/ });
    expect(links.length).toBe(2);
  });
});
