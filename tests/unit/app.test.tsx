// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { AppProvider, useApp, useAppState } from '../../src/app/AppContext';
import { applyTextSize, applyTheme, readThemePreference } from '../../src/app/theme';
import { useStore } from '../../src/state/hooks';
import { createStore } from '../../src/state/store';
import { realLibrary, realManifest } from './helpers/content';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-text-size');
});

const respond = (body: unknown, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });

describe('useStore', () => {
  it('re-renders only when the selected slice changes', () => {
    const store = createStore({ a: 1, b: 1 });
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useStore(store, (s) => s.a);
    });
    expect(result.current).toBe(1);
    const base = renders;
    act(() => {
      store.set((s) => ({ ...s, b: 2 })); // unrelated slice
    });
    expect(renders).toBe(base);
    act(() => {
      store.set((s) => ({ ...s, a: 5 }));
    });
    expect(result.current).toBe(5);
    expect(renders).toBe(base + 1);
  });
  it('unsubscribes on unmount', () => {
    const store = createStore(0);
    const { unmount } = renderHook(() => useStore(store, (s) => s));
    unmount();
    expect(() => {
      store.set(1);
    }).not.toThrow();
  });
});

describe('placeholder App', () => {
  it('loads the library and manifest from the same origin and reports real numbers', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return respond(url.endsWith('library.json') ? realLibrary() : realManifest());
    });
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Hang Up Club' })).toBeTruthy();
    const summary = await screen.findByTestId('library-summary');
    expect(summary.textContent).toContain('20 calls ready');
    expect(summary.textContent).toContain(`${String(Object.keys(realManifest().clips).length)} voice clips`);
    expect(urls.every((u) => u.startsWith('/'))).toBe(true);
  });
  it('shows a plain, non-technical error when the calls cannot load', async () => {
    vi.stubGlobal('fetch', () => respond({}, false));
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    });
  });
});

describe('theme', () => {
  it('defaults to the system theme and survives blocked storage', () => {
    expect(readThemePreference()).toBe('system');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readThemePreference()).toBe('system');
  });
  it('applies and remembers an explicit choice, and ignores junk', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(readThemePreference()).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    window.localStorage.setItem('huc-theme', 'neon');
    expect(readThemePreference()).toBe('system');
  });
  it('follows the system when asked, and still applies when storage is blocked', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    applyTheme('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
  it('sets the text size attribute the CSS scales from', () => {
    applyTextSize('larger');
    expect(document.documentElement.getAttribute('data-text-size')).toBe('larger');
    applyTextSize('standard');
    expect(document.documentElement.getAttribute('data-text-size')).toBe('standard');
  });
});

describe('AppProvider', () => {
  const stubFetch = (): void => {
    vi.stubGlobal('fetch', (url: string) =>
      respond(url.endsWith('library.json') ? realLibrary() : realManifest()),
    );
  };

  it('boots the database and content, then exposes state, actions and meta', async () => {
    stubFetch();
    const { result } = renderHook(() => ({ app: useApp(), profile: useAppState((s) => s.profile) }), {
      wrapper: AppProvider,
    });
    expect(result.current.app.state.boot).toBe('loading');
    expect(result.current.profile).toBeUndefined();
    await waitFor(() => {
      expect(result.current.app.state.boot).toBe('ready');
    });
    expect(result.current.app.state.content?.library.templates).toHaveLength(20);

    await act(async () => {
      await result.current.app.actions.setupProfile({ addressTerm: 'Paati' });
    });
    expect(result.current.profile?.addressTerm).toBe('Paati');
  });
  it('refuses actions before it has started, with a clear error', () => {
    stubFetch();
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    expect(() => result.current.actions.clearInbox()).toThrow(/still starting/);
  });
  it('is required: using the hook outside the provider throws', () => {
    expect(() => renderHook(() => useApp())).toThrow(/inside <AppProvider>/);
  });
});
