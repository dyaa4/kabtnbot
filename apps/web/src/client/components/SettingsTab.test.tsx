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
  language: 'ar',
  summary: { enabled: false, channel_id: null },
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse((init.body as string) ?? '{}');
        return new Response(JSON.stringify({ ...config, ...body }), { status: 200 });
      }
      if (url.endsWith('/roles')) {
        return new Response(JSON.stringify([{ id: '123456', name: 'Admins' }]), { status: 200 });
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

async function loaded() {
  return screen.findByLabelText(/لغة البوت|Bot language/);
}

describe('SettingsTab (general settings)', () => {
  it('no longer contains voice assistant fields (they moved to the voice tab)', async () => {
    renderTab();
    await loaded();
    expect(screen.queryByDisplayValue('يا بوت')).toBeNull();
    expect(screen.queryByLabelText(/الشخصية الكوميدية|Comedic personality/)).toBeNull();
  });

  it('sends a top-level PATCH with the role picked from the dropdown', async () => {
    const user = userEvent.setup();
    renderTab();
    await loaded();
    const roleSelect = await screen.findByLabelText(/الرول الإداري|Admin role/);
    await screen.findByRole('option', { name: '@Admins' });
    await user.selectOptions(roleSelect, '123456');
    await user.click(screen.getAllByRole('button', { name: /حفظ|Save/ })[0]);
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.admin_role_id).toBe('123456');
      expect(body.voice).toBeUndefined(); // voice PATCHes come from the voice tab only
    });
  });

  it('offers all six bot languages with native names and saves the pick via PATCH', async () => {
    const user = userEvent.setup();
    renderTab();
    const select = await loaded();
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
    const select = await loaded();

    const save = screen.getAllByRole('button', { name: /حفظ|Save/ })[0] as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/كل التغييرات محفوظة|All changes saved/)).toBeTruthy();

    await user.selectOptions(select, 'en');
    expect(save.disabled).toBe(false);
    expect(screen.getByText(/لديك تغييرات غير محفوظة|You have unsaved changes/)).toBeTruthy();

    await user.click(save);
    await waitFor(() => {
      const patchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.language).toBe('en');
      expect(body.admin_role_id).toBeNull();
      expect(body.summary).toEqual({ enabled: false, channel_id: null });
    });
    expect(await screen.findByTestId('toast-success')).toBeTruthy();
  });
});
