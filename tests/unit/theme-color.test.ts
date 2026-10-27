// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme } from '../../src/app/theme';

/**
 * The browser picks the first `theme-color` meta whose media query matches the OS scheme.
 * An in-app theme that differs from the OS must therefore switch the metas off (AC-F10-2).
 */

const LIGHT = '(prefers-color-scheme: light)';
const DARK = '(prefers-color-scheme: dark)';

function metas(): { light: HTMLMetaElement; dark: HTMLMetaElement } {
  const light = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][content="#fafaf7"]');
  const dark = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][content="#131411"]');
  if (!light || !dark) throw new Error('metas missing');
  return { light, dark };
}

/** What a browser does: the content of the first meta whose media matches. */
function effective(os: 'light' | 'dark'): string | undefined {
  const matches = (media: string | null): boolean =>
    media === null ||
    media === 'all' ||
    (media === LIGHT && os === 'light') ||
    (media === DARK && os === 'dark');
  return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].find((m) =>
    matches(m.getAttribute('media')),
  )?.content;
}

beforeEach(() => {
  document.head.innerHTML = `<meta name="theme-color" content="#fafaf7" media="${LIGHT}"><meta name="theme-color" content="#131411" media="${DARK}">`;
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.head.innerHTML = '';
});

describe('theme-color follows the chosen theme', () => {
  it('follows the OS under "system"', () => {
    applyTheme('system');
    expect(effective('light')).toBe('#fafaf7');
    expect(effective('dark')).toBe('#131411');
  });
  it('an explicit Dark wins in a light OS, and an explicit Light in a dark OS', () => {
    applyTheme('dark');
    expect(effective('light')).toBe('#131411');
    applyTheme('light');
    expect(effective('dark')).toBe('#fafaf7');
  });
  it('returning to "system" restores both media queries, however often it is toggled', () => {
    applyTheme('dark');
    applyTheme('light');
    applyTheme('system');
    const { light, dark } = metas();
    expect(light.getAttribute('media')).toBe(LIGHT);
    expect(dark.getAttribute('media')).toBe(DARK);
  });
});
