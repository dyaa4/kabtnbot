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
      schedule: { enabled: false, every_minutes: 60, channel_id: '' },
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

// Two-action flow for the canvas toolbar tests (reorder/duplicate/type).
const FLOWS_TWO = {
  flows: [
    {
      ...FLOWS.flows[0],
      id: 'f2',
      name: 'Zwei Aktionen',
      folder: '',
      actions: [
        { id: 'a1', type: 'speak_tts', text: 'hallo', pos: { x: 640, y: 120 } },
        { id: 'a2', type: 'send_message', channel_id: 'c1', text: 'hi', pos: { x: 960, y: 120 } },
      ],
    },
  ],
  builtin_overrides: {},
  folders: [],
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
    await screen.findByText(/New automation/);

    await user.click(screen.getAllByRole('button', { name: /New automation/ })[0]);
    // new automation appears in the sidebar and the save bar arms
    await waitFor(() => expect(screen.getByText(/Unsaved|unsaved/i)).toBeTruthy());

    // an empty new automation (no trigger phrase, empty TTS text) must be
    // rejected client-side by the shared Zod schema — no PUT goes out
    await user.click(screen.getByRole('button', { name: /Save/ }));
    const putCalls = () =>
      (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'PUT');
    expect(putCalls()).toHaveLength(0);
  });

  it('action nodes are numbered by chain order and reorder via the toolbar', async () => {
    mockFetch(FLOWS_TWO);
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByText('Zwei Aktionen'));
    const selects = (await screen.findAllByLabelText('Change action type')) as HTMLSelectElement[];
    expect(selects.map((s) => s.value)).toEqual(['speak_tts', 'send_message']);
    // step badges continue after trigger(1) + condition(2)
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();

    // move the SECOND action earlier — chain order flips
    await user.click(screen.getAllByTitle('Run earlier')[1]);
    await waitFor(() => {
      const after = screen.getAllByLabelText('Change action type') as HTMLSelectElement[];
      expect(after.map((s) => s.value)).toEqual(['send_message', 'speak_tts']);
    });
  });

  it('duplicating an action inserts a copy right after it', async () => {
    mockFetch(FLOWS_TWO);
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByText('Zwei Aktionen'));
    await user.click((await screen.findAllByTitle('Duplicate action'))[0]);
    await waitFor(() => {
      const after = screen.getAllByLabelText('Change action type') as HTMLSelectElement[];
      expect(after.map((s) => s.value)).toEqual(['speak_tts', 'speak_tts', 'send_message']);
    });
  });

  it('changing an action type in place keeps shared fields', async () => {
    mockFetch(FLOWS_TWO);
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByText('Zwei Aktionen'));
    const selects = (await screen.findAllByLabelText('Change action type')) as HTMLSelectElement[];
    // speak_tts → dm_user: the text carries over into the DM body
    await user.selectOptions(selects[0], 'dm_user');
    await waitFor(() => {
      const after = screen.getAllByLabelText('Change action type') as HTMLSelectElement[];
      expect(after.map((s) => s.value)).toEqual(['dm_user', 'send_message']);
    });
    expect(screen.getByDisplayValue('hallo')).toBeTruthy();
  });

  it('the scheduled template creates a schedule-enabled flow with the interval editor', async () => {
    mockFetch(EMPTY_FLOWS);
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: /Scheduled message/ }));
    // trigger node shows the schedule section, already enabled with its interval + channel inputs
    const toggle = (await screen.findByLabelText(/Scheduled run/)) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(screen.getByText(/Output channel/)).toBeTruthy();
    // 1440 min template default reads as "1 day"
    expect((screen.getByDisplayValue('1') as HTMLInputElement).type).toBe('number');
  });
});
