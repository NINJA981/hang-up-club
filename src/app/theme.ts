// The theme is the one value mirrored to localStorage (SPEC §10.1) so that
// public/theme-init.js can paint the first frame in the right theme.
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'huc-theme';

export function readThemePreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage blocked: follow the system */
  }
  return 'system';
}

export function applyTheme(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    /* storage blocked: the theme still applies for this session */
  }
  const dark =
    pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  syncThemeColor(pref);
}

/**
 * The browser picks the first `theme-color` meta whose media query matches the OS scheme, so an
 * in-app choice that differs from the OS would leave the wrong colour in the status bar (AC-F10-2).
 * For an explicit choice, only the matching meta may match; for "system", the queries are restored.
 * public/theme-init.js does the same before first paint.
 */
function syncThemeColor(pref: ThemePreference): void {
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    m.dataset.media ??= m.getAttribute('media') ?? '';
    const scheme = m.dataset.media.includes('dark') ? 'dark' : 'light';
    m.setAttribute('media', pref === 'system' ? m.dataset.media : pref === scheme ? 'all' : 'not all');
  }
}

export function applyTextSize(size: 'standard' | 'larger'): void {
  document.documentElement.setAttribute('data-text-size', size);
}
