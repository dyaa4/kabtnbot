import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useI18n } from '../i18n.js';

type Theme = 'light' | 'dark';

// localStorage can throw in private/locked-down browsers — the toggle must
// keep working (session-only) instead of crashing the header.
function storedTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Sun/moon theme switch. The `light` class on <html> drives the override
 * block in styles.css; an inline script in index.html applies the stored
 * value before first paint so there is no dark flash.
 */
export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    try {
      localStorage.setItem('theme', theme);
    } catch { /* private mode — session-only */ }
  }, [theme]);

  const label = t(theme === 'light' ? 'theme.dark' : 'theme.light');
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5 text-slate-300 backdrop-blur transition hover:border-blue-400/40 hover:bg-white/10 hover:text-blue-200"
    >
      <Sun
        className={`absolute h-4 w-4 transition-all duration-300 ${
          theme === 'light' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-50 opacity-0'
        }`}
      />
      <Moon
        className={`absolute h-4 w-4 transition-all duration-300 ${
          theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'
        }`}
      />
    </button>
  );
}
