import { useEffect, useState } from 'react';

/**
 * The active dashboard theme, reactive to the ThemeToggle. The toggle stamps a
 * `light` class on <html>; we mirror that and re-render when it changes so
 * components that CAN'T be themed by CSS alone (canvas libraries with inline
 * colors / props, e.g. React Flow's background dots and minimap) can switch.
 */
export function useTheme(): 'light' | 'dark' {
  const read = (): 'light' | 'dark' =>
    document.documentElement.classList.contains('light') ? 'light' : 'dark';
  const [theme, setTheme] = useState<'light' | 'dark'>(read);

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  return theme;
}
