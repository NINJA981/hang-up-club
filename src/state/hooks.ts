import { useSyncExternalStore } from 'react';
import type { Store } from './store';

/**
 * Subscribe a component to one slice of a store. The selector must return a
 * stable reference for unchanged data (pick a field; do not build new objects),
 * or the component re-renders on every store update.
 */
export function useStore<T, S>(store: Store<T>, select: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}
