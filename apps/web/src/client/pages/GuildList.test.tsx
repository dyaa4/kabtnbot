// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { ToastProvider } from '../components/Toast.js';
import { GuildList } from './GuildList.js';

const INVITE = 'https://discord.com/oauth2/x';

let guilds: Array<{ id: string; name: string; icon: string | null }> = [];
let plan = { premium: false, max_links: 1, max_guilds: 1, linked_guild_ids: [] as string[], invited_guild_count: 0 };

beforeEach(() => {
  guilds = [{ id: 'g1', name: 'Alpha', icon: null }];
  plan = { premium: false, max_links: 1, max_guilds: 1, linked_guild_ids: [], invited_guild_count: 0 };
  vi.unstubAllGlobals();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (url.includes('/api/guilds')) return json(guilds);
      if (url.includes('/api/me/plan')) return json(plan);
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

  it('refetches the list cache-busted when returning from an invite', async () => {
    renderPage();
    const [headerLink] = await screen.findAllByRole('link', { name: /أضف سيرفر|Add server/ });
    fireEvent.click(headerLink);
    fireEvent(window, new Event('focus'));
    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
      expect(calls).toContain('/api/guilds?fresh=1');
    });
  });

  it('disables both add-server entry points when the invite cap is reached', async () => {
    plan = { premium: false, max_links: 1, max_guilds: 1, linked_guild_ids: [], invited_guild_count: 1 };
    renderPage();
    // The add label is still visible (with the limit explained)…
    const labels = await screen.findAllByText(/أضف سيرفر|Add server/);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    // …but no clickable invite link remains.
    expect(screen.queryAllByRole('link', { name: /أضف سيرفر|Add server/ }).length).toBe(0);
  });

  it('a plain window focus without an invite click does not cache-bust', async () => {
    renderPage();
    await screen.findAllByRole('link', { name: /أضف سيرفر|Add server/ });
    fireEvent(window, new Event('focus'));
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls).not.toContain('/api/guilds?fresh=1');
  });
});
