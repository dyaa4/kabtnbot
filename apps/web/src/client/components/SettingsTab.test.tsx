// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { ToastProvider } from './Toast.js';
import { SettingsTab } from './SettingsTab.js';

const config = {
  admin_role_id: null,
  voice: { enabled: true, wake_word: 'يا بوت', tts_voice: 'fahad', allowed_channel_ids: [], personality_enabled: false },
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
      <ToastProvider>
        <QueryClientProvider client={qc}>
          <SettingsTab guildId="g1" />
        </QueryClientProvider>
      </ToastProvider>
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
    const gaming = await screen.findByLabelText(/Gaming/);
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
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]); // single sticky save bar
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      expect(JSON.parse((patchCalls[0][1] as RequestInit).body as string).admin_role_id).toBe('123456');
    });
  });

  it('offers all six bot languages with native names and saves the pick via PATCH', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByDisplayValue('يا بوت');

    const select = screen.getByLabelText(/لغة البوت|Bot language/);
    for (const name of ['العربية', 'English', 'Deutsch', 'Türkçe', 'Français', 'Русский']) {
      expect(screen.getAllByRole('option', { name }).length).toBeGreaterThanOrEqual(1);
    }

    await user.selectOptions(select, 'de');
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]);

    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      expect(JSON.parse((patchCalls[0][1] as RequestInit).body as string).language).toBe('de');
    });
  });

  it('save button is disabled until something changes, then saves everything at once', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByDisplayValue('يا بوت');

    const save = screen.getAllByRole('button', { name: /حفظ|Save/ })[0] as HTMLButtonElement;
    expect(save.disabled).toBe(true); // nothing changed yet
    expect(screen.getByText(/كل التغييرات محفوظة|All changes saved/)).toBeTruthy();

    await user.click(screen.getByLabelText(/الشخصية الكوميدية|Comedic personality/));
    expect(save.disabled).toBe(false);
    expect(screen.getByText(/لديك تغييرات غير محفوظة|You have unsaved changes/)).toBeTruthy();

    await user.click(save);
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      // one combined PATCH carries every section
      expect(body.voice.personality_enabled).toBe(true);
      expect(body.language).toBe('ar');
      expect(body.admin_role_id).toBeNull();
      expect(body.summary).toEqual({ enabled: false, channel_id: null });
    });
    expect(await screen.findByTestId('toast-success')).toBeTruthy();
  });
});
