// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../i18n.js';
import { ThemeToggle } from './ThemeToggle.js';

function renderToggle() {
  return render(
    <I18nProvider>
      <ThemeToggle />
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('light');
});

describe('ThemeToggle', () => {
  it('toggles the light class on <html> and persists the choice', () => {
    renderToggle();
    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('light');

    fireEvent.click(button);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('applies a stored light theme on mount', () => {
    localStorage.setItem('theme', 'light');
    renderToggle();
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
