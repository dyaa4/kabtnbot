// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { WelcomeTab } from './WelcomeTab.js';

function configWith(bannerUrl: string | null) {
  return {
    welcome: {
      enabled: true,
      channel_id: '123',
      message: 'أهلاً {user} في {server}! أنت العضو رقم {count}',
      banner_url: bannerUrl,
      avatar_x: 0.5,
      avatar_y: 0.4,
      avatar_size: 0.25,
      show_name: true,
    },
  };
}

const channels = [
  { id: '123', name: 'general' },
  { id: '456', name: 'welcome' },
];

function stubFetch(config: ReturnType<typeof configWith>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/assets/welcome-banner')) {
        if (init?.method === 'PUT') return new Response(JSON.stringify({ ok: true, content_type: 'image/png' }), { status: 200 });
        if (init?.method === 'DELETE') return new Response(JSON.stringify({ ok: true }), { status: 200 });
        return new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), { status: 404 });
      }
      if (init?.method === 'PATCH') {
        const body = JSON.parse((init.body as string) ?? '{}');
        return new Response(
          JSON.stringify({ ...config, ...body, welcome: { ...config.welcome, ...(body.welcome ?? {}) } }),
          { status: 200 },
        );
      }
      if (url.endsWith('/channels')) {
        return new Response(JSON.stringify(channels), { status: 200 });
      }
      return new Response(JSON.stringify(config), { status: 200 });
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <QueryClientProvider client={qc}>
        <WelcomeTab guildId="g1" />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe('WelcomeTab', () => {
  it('shows the upload dropzone (and no drag handle) when no banner exists', async () => {
    stubFetch(configWith(null));
    renderTab();
    expect(await screen.findByRole('button', { name: /ارفع صورة البانر|Upload a banner image/ })).toBeTruthy();
    expect(screen.queryByRole('slider', { name: /مقبض الصورة الرمزية|Avatar position handle/ })).toBeNull();
  });

  it('uploads a picked file with PUT to the asset endpoint', async () => {
    stubFetch(configWith(null));
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole('button', { name: /ارفع صورة البانر|Upload a banner image/ });

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'banner.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('banner-file-input'), file);

    await waitFor(() => {
      const putCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => (c[1] as RequestInit)?.method === 'PUT',
      );
      expect(putCalls).toHaveLength(1);
      expect(String(putCalls[0][0])).toContain('/api/guilds/g1/assets/welcome-banner');
    });
  });

  it('renders the drag handle for a banner, moves via keyboard, resizes via wheel, and saves the position', async () => {
    stubFetch(configWith('https://example.com/banner.png'));
    const user = userEvent.setup();
    renderTab();
    const handle = await screen.findByRole('slider', { name: /مقبض الصورة الرمزية|Avatar position handle/ });

    handle.focus();
    fireEvent.keyDown(handle, { key: 'ArrowRight' }); // x 0.5 → 0.51
    fireEvent.wheel(handle, { deltaY: -100 }); // size 0.25 → 0.27

    await user.click(screen.getByRole('button', { name: /حفظ|Save/ }));

    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.welcome.avatar_x).toBe(0.51);
      expect(body.welcome.avatar_y).toBe(0.4);
      expect(body.welcome.avatar_size).toBe(0.27);
      expect(body.welcome.banner_url).toBeUndefined(); // URL field no longer part of the UI
    });
  });

  it('removes the banner with DELETE', async () => {
    stubFetch(configWith('https://example.com/banner.png'));
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole('slider', { name: /مقبض الصورة الرمزية|Avatar position handle/ });

    await user.click(screen.getByRole('button', { name: /إزالة الصورة|Remove image/ }));

    await waitFor(() => {
      const delCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => (c[1] as RequestInit)?.method === 'DELETE',
      );
      expect(delCalls).toHaveLength(1);
    });
  });
});
