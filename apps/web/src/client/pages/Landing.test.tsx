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
    expect(screen.getByRole('heading', { name: /^(برو|Pro)$/ })).toBeTruthy();
    expect(screen.getAllByText(/قريباً|Coming soon/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/120 دقيقة|120 voice-listening/)).toBeTruthy(); // Pro daily limits spelled out
    expect(screen.getByText(/كل مزايا الخطة المجانية|Everything in the free plan/)).toBeTruthy();
  });

  it('shows the guild-count social proof once meta loads', async () => {
    renderLanding();
    expect(await screen.findByText(/نشط الآن على 5|Active on 5/)).toBeTruthy();
  });

  it('has a sticky header with anchor navigation to every section', async () => {
    renderLanding();
    const header = await screen.findByRole('banner');
    const hrefs = Array.from(header.querySelectorAll('nav a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['#features', '#how', '#pricing', '#faq']));
  });

  it('renders the bento voice card with the wake word and the six language pills', async () => {
    renderLanding();
    expect((await screen.findAllByText(/يا كابتن/)).length).toBeGreaterThanOrEqual(1);
    for (const lang of ['العربية', 'English', 'Deutsch', 'Türkçe', 'Français', 'Русский']) {
      expect(screen.getAllByText(lang).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('renders the three how-it-works steps', async () => {
    renderLanding();
    expect(await screen.findByRole('heading', { name: /كيف يعمل|How it works/ })).toBeTruthy();
    expect(screen.getAllByText(/أضف البوت|Invite the bot/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/لوحة التحكم|dashboard/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders the FAQ as native details accordions', async () => {
    renderLanding();
    expect(await screen.findByRole('heading', { name: /الأسئلة الشائعة|FAQ/ })).toBeTruthy();
    const faq = document.getElementById('faq');
    expect(faq?.querySelectorAll('details').length).toBeGreaterThanOrEqual(5);
  });

  it('points every invite CTA at the meta invite URL', async () => {
    renderLanding();
    await screen.findByText(/نشط الآن على 5|Active on 5/);
    const inviteLinks = screen.getAllByRole('link', { name: /أضف البوت لسيرفرك|Add the bot to your server/ });
    expect(inviteLinks.length).toBeGreaterThanOrEqual(2); // hero + CTA band at minimum
    for (const link of inviteLinks) {
      expect(link.getAttribute('href')).toBe('https://discord.com/oauth2/x');
    }
  });

  it('renders footer with legal links and product anchors', async () => {
    renderLanding();
    const footer = await screen.findByRole('contentinfo');
    const hrefs = Array.from(footer.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/terms', '/privacy', '#features', '#pricing']));
  });
});
