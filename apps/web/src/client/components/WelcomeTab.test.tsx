// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { WelcomeTab } from './WelcomeTab.js';

const config = {
  welcome: {
    enabled: true,
    channel_id: '123',
    message: 'أهلاً {user} في {server}! أنت العضو رقم {count}',
    banner_url: 'https://example.com/banner.png',
    avatar_x: 0.5,
    avatar_y: 0.4,
    avatar_size: 0.25,
    show_name: true,
  },
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse((init.body as string) ?? '{}');
        return new Response(
          JSON.stringify({ ...config, ...body, welcome: { ...config.welcome, ...(body.welcome ?? {}) } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(config), { status: 200 });
    }),
  );
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
  it('renders the draggable avatar handle once a banner is loaded', async () => {
    renderTab();
    expect(await screen.findByRole('slider', { name: /مقبض الصورة الرمزية|Avatar position handle/ })).toBeTruthy();
  });

  it('adjusting the position number inputs and saving PATCHes avatar_x/avatar_y/avatar_size as numbers in 0-1', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole('slider', { name: /مقبض الصورة الرمزية|Avatar position handle/ });

    const xInput = screen.getByLabelText(/إحداثي X|Avatar X/i);
    const yInput = screen.getByLabelText(/إحداثي Y|Avatar Y/i);
    const sizeInput = screen.getByLabelText(/حجم الصورة الرمزية|Avatar size/i);

    await user.clear(xInput);
    await user.type(xInput, '0.2');
    await user.clear(yInput);
    await user.type(yInput, '0.65');
    await user.clear(sizeInput);
    await user.type(sizeInput, '0.3');

    await user.click(screen.getByRole('button', { name: /حفظ|Save/ }));

    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.welcome.avatar_x).toBe(0.2);
      expect(body.welcome.avatar_y).toBe(0.65);
      expect(body.welcome.avatar_size).toBe(0.3);
      expect(typeof body.welcome.avatar_x).toBe('number');
      expect(typeof body.welcome.avatar_y).toBe('number');
      expect(typeof body.welcome.avatar_size).toBe('number');
      expect(body.welcome.avatar_x).toBeGreaterThanOrEqual(0);
      expect(body.welcome.avatar_x).toBeLessThanOrEqual(1);
    });
  });
});
