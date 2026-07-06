// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { SettingsTab } from './SettingsTab.js';

const config = {
  admin_role_id: null,
  voice: { enabled: true, wake_word: 'يا بوت', dialect: 'gulf', allowed_channel_ids: [], personality_enabled: false },
  quotas: { listen_minutes_per_day: 60, ai_questions_per_day: 50 },
  premium: { active: false, listen_minutes_override: null, ai_questions_override: null },
  language: 'ar',
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse((init.body as string) ?? '{}');
        return new Response(
          JSON.stringify({ ...config, ...body, voice: { ...config.voice, ...(body.voice ?? {}) } }),
          { status: 200 },
        );
      }
      if (url.endsWith('/roles')) {
        return new Response(JSON.stringify([{ id: '123456', name: 'Admins' }]), { status: 200 });
      }
      if (url.endsWith('/voice-channels')) {
        return new Response(JSON.stringify([{ id: 'v1', name: 'Gaming' }, { id: 'v2', name: 'Chill' }]), { status: 200 });
      }
      if (url.endsWith('/channels')) {
        return new Response(JSON.stringify([{ id: 'c1', name: 'general' }]), { status: 200 });
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
        <SettingsTab guildId="g1" />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe('SettingsTab', () => {
  it('shows loaded wake word and rejects a too-short one client-side', async () => {
    const user = userEvent.setup();
    renderTab();
    const input = await screen.findByDisplayValue('يا بوت');
    await user.clear(input);
    await user.type(input, 'x');
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]);
    await waitFor(() => expect(screen.getByTestId('voice-error').textContent?.length).toBeGreaterThan(0));
    // no PATCH sent for invalid form
    const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
    expect(patchCalls).toHaveLength(0);
  });

  it('sends PATCH for a valid change', async () => {
    const user = userEvent.setup();
    renderTab();
    const input = await screen.findByDisplayValue('يا بوت');
    await user.clear(input);
    await user.type(input, 'يا زعيم');
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]);
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      expect(JSON.parse((patchCalls[0][1] as RequestInit).body as string).voice.wake_word).toBe('يا زعيم');
    });
  });

  it('toggling the personality checkbox PATCHes voice.personality_enabled', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByDisplayValue('يا بوت');
    const checkbox = screen.getByLabelText(/الشخصية الكوميدية|Comedic personality/);
    await user.click(checkbox);
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]);
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      expect(JSON.parse((patchCalls[0][1] as RequestInit).body as string).voice.personality_enabled).toBe(true);
    });
  });

  it('toggling an allowed voice channel PATCHes voice.allowed_channel_ids', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByDisplayValue('يا بوت');
    const gaming = await screen.findByLabelText(/🔊 Gaming/);
    await user.click(gaming);
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]);
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.voice.allowed_channel_ids).toEqual(['v1']);
    });
  });

  it('sends a top-level PATCH with the role picked from the dropdown', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByDisplayValue('يا بوت');
    const roleSelect = await screen.findByLabelText(/الرول الإداري|Admin role/);
    await screen.findByRole('option', { name: '@Admins' }); // roles loaded
    await user.selectOptions(roleSelect, '123456');
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[1]);
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      expect(JSON.parse((patchCalls[0][1] as RequestInit).body as string).admin_role_id).toBe('123456');
    });
  });
});
