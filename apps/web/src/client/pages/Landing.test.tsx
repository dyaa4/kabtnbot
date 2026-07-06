// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n.js';
import { Landing } from './Landing.js';

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ clientId: 'c1', inviteUrl: 'https://discord.com/oauth2/x', guilds: 5 }),
          { status: 200 },
        ),
    ),
  );
});

function renderLanding() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nProvider>
      <QueryClientProvider client={qc}>
        <Landing />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

describe('Landing', () => {
  it('shows the free vs premium plan comparison with the daily limits', async () => {
    renderLanding();
    expect(await screen.findByRole('heading', { name: /الخطط والمزايا|Plans & features/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /مجاني|Free/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /بريميوم|Premium/ })).toBeTruthy();
    expect(screen.getByText(/قريباً|Coming soon/)).toBeTruthy();
    expect(screen.getByText(/60 دقيقة|60 voice-listening/)).toBeTruthy(); // free daily limits spelled out
    expect(screen.getByText(/كل مزايا الخطة المجانية|Everything in the free plan/)).toBeTruthy();
  });

  it('shows the guild-count social proof once meta loads', async () => {
    renderLanding();
    expect(await screen.findByText(/نشط الآن على 5|Active on 5/)).toBeTruthy();
  });
});
