// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { StatsTab } from './StatsTab.js';

const statsResponse = {
  memberCount: 250,
  joinedRecent: [{ id: 'm1', username: 'Alice', avatar: null, joined_at: new Date().toISOString() }],
  memberSeries: [
    { date: '2026-06-27', member_count: 190 },
    { date: '2026-06-28', member_count: 190 },
    { date: '2026-06-29', member_count: 190 },
    { date: '2026-06-30', member_count: 190 },
    { date: '2026-07-01', member_count: 200 },
  ],
  memberSeriesSource: 'snapshots',
  matchesPerDay: [
    { date: '2026-06-27', count: 0 },
    { date: '2026-06-28', count: 0 },
    { date: '2026-06-29', count: 0 },
    { date: '2026-06-30', count: 0 },
    { date: '2026-07-01', count: 3 },
  ],
  usageDaily: [
    { date: '2026-06-27', ai_questions: 0, listen_seconds: 0 },
    { date: '2026-06-28', ai_questions: 0, listen_seconds: 0 },
    { date: '2026-06-29', ai_questions: 0, listen_seconds: 0 },
    { date: '2026-06-30', ai_questions: 0, listen_seconds: 0 },
    { date: '2026-07-01', ai_questions: 5, listen_seconds: 120 },
  ],
  newPlayersPerDay: [
    { date: '2026-06-27', count: 0 },
    { date: '2026-06-28', count: 0 },
    { date: '2026-06-29', count: 0 },
    { date: '2026-06-30', count: 0 },
    { date: '2026-07-01', count: 1 },
  ],
  topPlayers: [{ user_id: 'a', name: 'Alice', points: 25, wins: 1, losses: 0 }],
  mostActive: [{ user_id: 'a', name: 'Alice', matches: 3 }],
  totals: { newMembers: 7, matches: 3, aiQuestions: 5 },
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(statsResponse), { status: 200 })),
  );
  // jsdom has no ResizeObserver; recharts' ResponsiveContainer needs a stub to mount without throwing.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <QueryClientProvider client={qc}>
        <StatsTab guildId="g1" />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe('StatsTab', () => {
  it('renders stat tiles from the stubbed response', async () => {
    renderTab();
    expect(await screen.findByText('250')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('clicking the 7-days pill triggers a refetch with days=7', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('250');
    const pills = screen.getAllByRole('button').filter((b) => /٧|7/.test(b.textContent ?? ''));
    await user.click(pills[0]);
    await vi.waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
      expect(calls.some((url) => url.includes('days=7'))).toBe(true);
    });
  });
});
