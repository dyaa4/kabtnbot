// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { ToastProvider } from './Toast.js';
import { ProtectionTab } from './ProtectionTab.js';

const config = {
  protection: {
    enabled: false,
    voice_moderation: true,
    text_protection: false,
    custom_words: ['كلمة1', 'كلمة2'],
    anti_spam: false,
    blocked_domains: ['example.com'],
    log_channel_id: null,
  },
};

const channels = [
  { id: '111', name: 'general' },
  { id: '222', name: 'logs' },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse((init.body as string) ?? '{}');
        return new Response(
          JSON.stringify({ ...config, ...body, protection: { ...config.protection, ...(body.protection ?? {}) } }),
          { status: 200 },
        );
      }
      if (url.endsWith('/channels')) {
        return new Response(JSON.stringify(channels), { status: 200 });
      }
      return new Response(JSON.stringify(config), { status: 200 });
    }),
  );
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <ToastProvider>
        <QueryClientProvider client={qc}>
          <ProtectionTab guildId="g1" />
        </QueryClientProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('ProtectionTab', () => {
  it('loads the current config into the form', async () => {
    renderTab();
    const textarea = await screen.findByDisplayValue('كلمة1\nكلمة2', { collapseWhitespace: false });
    expect(textarea).toBeTruthy();
    expect(screen.getByDisplayValue('example.com')).toBeTruthy();
  });

  it('toggling enabled and saving PATCHes protection.enabled', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByDisplayValue('كلمة1\nكلمة2', { collapseWhitespace: false });
    const checkbox = screen.getByLabelText(/تفعيل الحماية|Enable protection/);
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: /حفظ|Save/ }));
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.protection.enabled).toBe(true);
    });
    expect(await screen.findByTestId('toast-success')).toBeTruthy(); // success toast pops
  });

  it('lists text channels by name and PATCHes the selected channel id', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByDisplayValue('كلمة1\nكلمة2', { collapseWhitespace: false });
    const select = await screen.findByRole('combobox');
    await screen.findByRole('option', { name: '#logs' });
    await user.selectOptions(select, '222');
    await user.click(screen.getByRole('button', { name: /حفظ|Save/ }));
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.protection.log_channel_id).toBe('222');
    });
  });

  it('splits custom_words / blocked_domains on newline and comma, trims, and drops empties', async () => {
    const user = userEvent.setup();
    renderTab();
    const wordsBox = await screen.findByDisplayValue('كلمة1\nكلمة2', { collapseWhitespace: false });
    await user.clear(wordsBox);
    await user.type(wordsBox, ' كلمة3 ,كلمة4{enter}  {enter}كلمة5');
    await user.click(screen.getByRole('button', { name: /حفظ|Save/ }));
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.protection.custom_words).toEqual(['كلمة3', 'كلمة4', 'كلمة5']);
    });
  });
});
