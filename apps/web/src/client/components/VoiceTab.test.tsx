// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { ToastProvider } from './Toast.js';
import { VoiceTab } from './VoiceTab.js';

let configLanguage = 'ar';
const config = {
  get language() { return configLanguage; },
  voice: { enabled: true, wake_word: 'يا بوت', tts_voice: 'marin', dialect: 'msa', allowed_channel_ids: [], personality_enabled: false, follow_up_seconds: 0, focus_active_speaker: true },
};

let premiumActive = true;

beforeEach(() => {
  premiumActive = true;
  configLanguage = 'ar';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse((init.body as string) ?? '{}');
        return new Response(
          JSON.stringify({ ...config, voice: { ...config.voice, ...(body.voice ?? {}) } }),
          { status: 200 },
        );
      }
      if (url.endsWith('/info')) {
        // Voice gates on premiumActive (premium-account link); a plain link
        // (premiumLinked) is deliberately NOT enough.
        return new Response(JSON.stringify({ name: 'g', icon: null, premiumLinked: true, premiumActive }), { status: 200 });
      }
      if (url.endsWith('/api/admin/me')) {
        return new Response(JSON.stringify({ isSuperAdmin: false }), { status: 200 });
      }
      if (url.endsWith('/voice-channels')) {
        return new Response(JSON.stringify([{ id: 'v1', name: 'Gaming' }, { id: 'v2', name: 'Chill' }]), { status: 200 });
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
          <VoiceTab guildId="g1" />
        </QueryClientProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('VoiceTab', () => {
  it('shows the premium upsell instead of the form on a guild without a premium link', async () => {
    premiumActive = false;
    renderTab();
    expect(await screen.findByText(/ميزة بريميوم|premium feature/)).toBeTruthy();
    expect(screen.queryByDisplayValue('يا بوت')).toBeNull();
  });

  it('shows loaded wake word and rejects a too-short one client-side', async () => {
    const user = userEvent.setup();
    renderTab();
    const input = await screen.findByDisplayValue('يا بوت');
    await user.clear(input);
    await user.type(input, 'x');
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]);
    await waitFor(() => expect(screen.getByTestId('voice-error').textContent?.length).toBeGreaterThan(0));
    const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
    expect(patchCalls).toHaveLength(0);
  });

  it('sends a voice-only PATCH for a valid change', async () => {
    const user = userEvent.setup();
    renderTab();
    const input = await screen.findByDisplayValue('يا بوت');
    await user.clear(input);
    await user.type(input, 'يا زعيم');
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]);
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.voice.wake_word).toBe('يا زعيم');
      expect(body.language).toBeUndefined(); // general settings live elsewhere now
    });
  });

  it('shows the Arabic dialect picker for an Arabic guild and PATCHes voice.dialect', async () => {
    const user = userEvent.setup();
    renderTab();
    const select = (await screen.findByText(/اللهجة العربية|Arabic dialect|Arabischer Dialekt/)).parentElement!.querySelector('select')!;
    await user.selectOptions(select, 'gulf');
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]);
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      expect(JSON.parse((patchCalls[0][1] as RequestInit).body as string).voice.dialect).toBe('gulf');
    });
  });

  it('hides the dialect picker for a non-Arabic guild', async () => {
    configLanguage = 'en';
    renderTab();
    await screen.findByDisplayValue('يا بوت');
    expect(screen.queryByText(/اللهجة العربية|Arabic dialect|Arabischer Dialekt/)).toBeNull();
  });

  it('toggling an allowed voice channel PATCHes voice.allowed_channel_ids', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByDisplayValue('يا بوت');
    const gaming = await screen.findByLabelText(/Gaming/);
    await user.click(gaming);
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]);
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      expect(JSON.parse((patchCalls[0][1] as RequestInit).body as string).voice.allowed_channel_ids).toEqual(['v1']);
    });
  });
});
