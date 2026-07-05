// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { BotProfileCard } from './BotProfileCard.js';

function stubFetch(opts: { avatarScope?: 'guild' | 'global'; forbidNick?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/bot-profile/avatar')) {
        return new Response(JSON.stringify({ ok: true, scope: opts.avatarScope ?? 'guild' }), { status: 200 });
      }
      if (url.includes('/bot-profile')) {
        if (init?.method === 'PATCH') {
          if (opts.forbidNick) {
            return new Response(
              JSON.stringify({ error: { code: 'MISSING_PERMISSIONS', message: 'nope' } }),
              { status: 403 },
            );
          }
          const body = JSON.parse((init.body as string) ?? '{}');
          return new Response(JSON.stringify({ nickname: body.nickname }), { status: 200 });
        }
        return new Response(JSON.stringify({ nickname: null, username: 'kabtn', avatar_url: null }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <I18nProvider>
      <QueryClientProvider client={qc}>
        <BotProfileCard guildId="g1" />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe('BotProfileCard', () => {
  it('saves the nickname via PATCH', async () => {
    stubFetch();
    const user = userEvent.setup();
    renderCard();
    const input = await screen.findByLabelText(/اسم البوت|Bot name/);
    await user.type(input, 'كابتن الحماس');
    await user.click(screen.getByRole('button', { name: /حفظ|Save/ }));
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCalls).toHaveLength(1);
      expect(JSON.parse((patchCalls[0][1] as RequestInit).body as string).nickname).toBe('كابتن الحماس');
    });
  });

  it('shows the global-scope note when Discord applies the avatar globally', async () => {
    stubFetch({ avatarScope: 'global' });
    const user = userEvent.setup();
    renderCard();
    await screen.findByLabelText(/اسم البوت|Bot name/);
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'avatar.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('bot-avatar-input'), file);
    expect(await screen.findByText(/الملف العام|global profile/)).toBeTruthy();
  });

  it('shows a friendly error when the bot lacks permission', async () => {
    stubFetch({ forbidNick: true });
    const user = userEvent.setup();
    renderCard();
    await screen.findByLabelText(/اسم البوت|Bot name/);
    await user.click(screen.getByRole('button', { name: /حفظ|Save/ }));
    await waitFor(() => {
      expect(screen.getByTestId('bot-nick-error').textContent).toMatch(/صلاحية|permission/);
    });
  });
});
