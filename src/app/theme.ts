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
}

export function applyTextSize(size: 'standard' | 'larger'): void {
  document.documentElement.setAttribute('data-text-size', size);
}
