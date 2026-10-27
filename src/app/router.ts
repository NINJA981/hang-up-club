import { useSyncExternalStore } from 'react';
import { parseLinkFragment, type LinkRoute } from '../domain/links/links';

/**
 * Hash routing: `#/today`, `#/calls`, `#/calls/12`, `#/settings`, ... and the
 * link routes `#/join?d=...`. The fragment never reaches a server (SPEC 10.2).
 */
export type Route =
  | { name: 'today' }
  | { name: 'welcome' }
  | { name: 'calls' }
  | { name: 'replay-attempt'; index: number }
  | { name: 'settings' }
  | { name: 'result' }
  | { name: 'replay' }
  | { name: 'coach' }
  | { name: 'coach-call' }
  | { name: 'inbox' }
  | { name: 'link'; link: LinkRoute }
  | { name: 'link-error' };

const SIMPLE: Record<string, Route> = {
  '/today': { name: 'today' },
  '/welcome': { name: 'welcome' },
  '/calls': { name: 'calls' },
  '/settings': { name: 'settings' },
  '/result': { name: 'result' },
  '/replay': { name: 'replay' },
  '/coach': { name: 'coach' },
  '/coach/call': { name: 'coach-call' },
  '/inbox': { name: 'inbox' },
};

export function parseRoute(hash: string): Route {
  const link = parseLinkFragment(hash);
  if (link) return { name: 'link', link };
  // A link route without a payload, or with a bad one, is a damaged link.
  if (/^#\/(join|cheer|family|r)(\?|$)/.test(hash)) return { name: 'link-error' };
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  const simple = SIMPLE[path];
  if (simple) return simple;
  const m = /^\/calls\/(\d{1,6})$/.exec(path);
  if (m?.[1] !== undefined) return { name: 'replay-attempt', index: Number(m[1]) };
  return { name: 'today' };
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
  };
}

/** The current hash string; routes are derived from it with useMemo-free parsing in `useRoute`. */
export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const hash = path.startsWith('#') ? path : `#${path}`;
  if (window.location.hash === hash) return;
  if (opts.replace === true) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

export function appBaseUrl(): string {
  return `${window.location.origin}/`;
}
