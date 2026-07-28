import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'madrasty_theme';

// Kept in sync with --color-primary-container (light) and --color-surface
// (dark) so the mobile browser chrome matches the page it frames.
const THEME_COLOR: Record<Theme, string> = {
  light: '#2563eb',
  dark: '#0d1a2b',
};

function readInitialTheme(): Theme {
  // index.html's inline script already applied the class before first paint —
  // reading it back keeps React and the DOM in agreement on the first render.
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  return 'light';
}

// Class-based dark mode. The `.dark` class on <html> re-points every colour
// role (styles/index.css), so nothing else in the app needs to know the theme.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage unavailable — the toggle still works for this session.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
