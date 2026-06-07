/**
 * Dark / light theme.
 *
 * Strategy: a single `theme` value is persisted in localStorage and reflected
 * onto `<html>` as a `dark` class so Tailwind's `dark:` variants and the CSS
 * `.dark` overrides in `index.css` flip the whole UI at once.
 *
 * Initial value resolution (in priority order):
 *   1. localStorage('cursus_theme')  — user has chosen explicitly before
 *   2. `prefers-color-scheme: dark`  — system preference
 *   3. 'light'                       — fallback
 *
 * Exposed as a tiny hook so any component can read/toggle the value without
 * needing a Context provider; the value lives on the DOM so cross-component
 * sync is automatic via a `storage`-style event we dispatch on change.
 */
import { useEffect, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'cursus_theme';
const EVENT_NAME  = 'cursus-theme-change';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Apply the class to <html> so Tailwind's `dark:` variants engage. */
function applyToDom(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

/**
 * Eagerly applies the persisted theme before React mounts so the page never
 * flashes the wrong palette. Called once from `main.tsx`.
 */
export function bootstrapTheme() {
  applyToDom(readInitial());
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT_NAME, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT_NAME, cb);
    window.removeEventListener('storage', cb);
  };
}

function getSnapshot(): Theme {
  return readInitial();
}

function getServerSnapshot(): Theme {
  return 'light';
}

export function useTheme(): [Theme, (next: Theme) => void, () => void] {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keep the DOM class in sync even if something else clobbered it.
  useEffect(() => { applyToDom(theme); }, [theme]);

  const setTheme = (next: Theme) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    applyToDom(next);
    window.dispatchEvent(new Event(EVENT_NAME));
  };
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return [theme, setTheme, toggle];
}
