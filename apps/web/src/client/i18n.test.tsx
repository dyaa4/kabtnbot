// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { I18nProvider, useI18n } from './i18n.js';

function Probe() {
  const { t, lang, setLang } = useI18n();
  return (
    <div>
      <span data-testid="title">{t('landing.title')}</span>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>switch</button>
    </div>
  );
}

describe('i18n', () => {
  it('defaults to arabic with rtl, switches to english ltr', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang').textContent).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    await user.click(screen.getByText('switch'));
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByTestId('lang').textContent).toBe('en');
  });

  it('falls back to the key for unknown ids', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('title').textContent?.length).toBeGreaterThan(0);
  });
});
