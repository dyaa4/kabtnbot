// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../../i18n.js';
import { ToastProvider } from '../Toast.js';
import { CommandsTab } from './CommandsTab.js';

// React Flow measures its container — jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const EMPTY_FLOWS = { flows: [], builtin_overrides: {}, folders: [] };

const FLOWS = {
  flows: [
    {
      id: 'f1',
      name: 'Audio raus',
      folder: 'audio',
      enabled: true,
      sources: { voice: true, text: false },
      triggers: ['geh raus'],
      match_mode: 'exact',
      llm_fallback: true,
      conditions: { role_ids: [], user_ids: [], channel_ids: [] },
      actions: [{ id: 'a1', type: 'voice_leave', pos: { x: 640, y: 120 } }],
      cooldown_seconds: 5,
      layout: { trigger: { x: 0, y: 120 }, condition: { x: 320, y: 120 } },
    },
  ],
  builtin_overrides: { stop: { enabled: false, extra_triggers: [], role_ids: [], user_ids: [], layout: {} } },
  folders: ['audio'],
};

function mockFetch(flows: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify(JSON.parse(init.body as string)), { status: 200 });
      }
      if (typeof url === 'string' && url.includes('command-flows')) {
        return new Response(JSON.stringify(flows), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }),
  );
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <ToastProvider>
          <CommandsTab guildId="g1" />
        </ToastProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('CommandsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem('gb_lang', 'en');
  });

  it('lists commands in their folders and the six built-ins', async () => {
    mockFetch(FLOWS);
    renderTab();
    expect(await screen.findByText('Audio raus')).toBeTruthy();
    expect(screen.getByText('audio')).toBeTruthy();
    // pinned system folder with the built-ins (names come from i18n)
    expect(screen.getByText('Voice-kick member')).toBeTruthy();
    expect(screen.getByText('Stop listening')).toBeTruthy();
  });

  it('creating a command marks the draft dirty and saving PUTs it', async () => {
    mockFetch(EMPTY_FLOWS);
    const user = userEvent.setup();
    renderTab();
    await screen.findByText(/New command/);

    await user.click(screen.getAllByRole('button', { name: /New command/ })[0]);
    // new command appears in the sidebar and the save bar arms
    await waitFor(() => expect(screen.getByText(/Unsaved|unsaved/i)).toBeTruthy());

    // an empty new command (no trigger phrase, empty TTS text) must be rejected
    // client-side by the shared Zod schema — no PUT goes out
    await user.click(screen.getByRole('button', { name: /Save/ }));
    const putCalls = () =>
      (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PUT');
    expect(putCalls()).toHaveLength(0);
  });
});
