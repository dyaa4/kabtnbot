// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../i18n.js';
import { Terms } from './Terms.js';
import { Privacy } from './Privacy.js';

function renderPage(el: React.ReactElement) {
  return render(<I18nProvider>{el}</I18nProvider>);
}

describe('legal pages', () => {
  it('renders the terms of service in the active language', () => {
    renderPage(<Terms />);
    expect(screen.getByRole('heading', { name: /شروط الاستخدام|Terms of Service/ })).toBeTruthy();
    expect(screen.getByText(/قبول الشروط|Acceptance/)).toBeTruthy();
  });

  it('renders the privacy policy including retention and third parties', () => {
    renderPage(<Privacy />);
    expect(screen.getByRole('heading', { name: /سياسة الخصوصية|Privacy Policy/ })).toBeTruthy();
    expect(screen.getByText(/مدة الاحتفاظ|Retention/)).toBeTruthy();
    expect(screen.getByText(/Groq/)).toBeTruthy(); // third-party disclosure present
  });
});
