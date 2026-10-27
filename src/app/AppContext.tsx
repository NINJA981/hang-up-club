import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { realClock } from '../domain/time/clock';
import { openHucDb } from '../storage/db';
import { Repo } from '../storage/repo';
import { AppController, type AppState } from '../state/app';
import { loadContent, type Content } from '../state/library';
import { useStore } from '../state/hooks';
import { createStore } from '../state/store';

/**
 * The one provider that knows how state is managed (composition patterns:
 * state-context-interface, state-decouple-implementation). Screens depend on
 * this interface of `state`, `actions` and `meta`, never on IndexedDB or fetch,
 * so a test or the landing-page demo can supply a different provider.
 */
export interface AppContextValue {
  state: {
    /** Loading, ready or failed to start. */
    boot: 'loading' | 'ready' | 'error';
    content: Content | undefined;
  };
  actions: Pick<
    AppController,
    | 'setupProfile'
    | 'applyJoin'
    | 'updateSettings'
    | 'recordCall'
    | 'acceptCheer'
    | 'acceptFamilyCall'
    | 'markFamilyCallPlayed'
    | 'saveResultCard'
    | 'removeInbox'
    | 'clearInbox'
    | 'removeCheer'
    | 'deleteEverything'
    | 'refreshToday'
  >;
  meta: { controller: AppController | undefined };
}

const AppContext = createContext<AppContextValue | null>(null);

/** React 19: `use()` instead of `useContext()`. */
export function useApp(): AppContextValue {
  const value = use(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}

/** Subscribe to one slice of persisted app state (e.g. `useAppState((s) => s.profile)`). */
export function useAppState<S>(select: (state: AppState) => S): S | undefined {
  const { meta } = useApp();
  const controller = meta.controller;
  // Hooks cannot be conditional, so fall back to a constant store before boot.
  return useStore(controller?.store ?? EMPTY_STORE, (s) => (controller ? select(s) : undefined));
}

const EMPTY_STORE = createStore<AppState>({
  status: 'loading',
  profile: undefined,
  settings: { theme: 'system', textSize: 'standard', captions: true, vibrate: true, sound: true },
  attempts: [],
  tacticBoxes: [],
  cheers: [],
  familyCalls: [],
  inbox: [],
  today: '1970-01-01',
});

interface Boot {
  boot: 'loading' | 'ready' | 'error';
  content?: Content;
  controller?: AppController;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ boot: 'loading' });

  useEffect(() => {
    const run = { cancelled: false };
    (async () => {
      // Independent work starts together (async-parallel): the library fetch and the database open.
      const [content, db] = await Promise.all([loadContent((url) => fetch(url)), openHucDb()]);
      const controller = new AppController({
        repo: new Repo(db),
        clock: realClock(),
        newId: () => crypto.randomUUID(),
      });
      await controller.load();
      if (!run.cancelled) setBoot({ boot: 'ready', content, controller });
    })().catch(() => {
      if (!run.cancelled) setBoot({ boot: 'error' });
    });
    return () => {
      run.cancelled = true;
    };
  }, []);

  const controller = boot.controller;
  const value: AppContextValue = {
    state: { boot: boot.boot, content: boot.content },
    actions: {
      setupProfile: (i) => need(controller).setupProfile(i),
      applyJoin: (l) => need(controller).applyJoin(l),
      updateSettings: (p) => need(controller).updateSettings(p),
      recordCall: (i) => need(controller).recordCall(i),
      acceptCheer: (l) => need(controller).acceptCheer(l),
      acceptFamilyCall: (l) => need(controller).acceptFamilyCall(l),
      markFamilyCallPlayed: (id) => need(controller).markFamilyCallPlayed(id),
      saveResultCard: (c) => need(controller).saveResultCard(c),
      removeInbox: (id) => need(controller).removeInbox(id),
      clearInbox: () => need(controller).clearInbox(),
      removeCheer: (id) => need(controller).removeCheer(id),
      deleteEverything: () => need(controller).deleteEverything(),
      refreshToday: () => {
        controller?.refreshToday();
      },
    },
    meta: { controller },
  };
  return <AppContext value={value}>{children}</AppContext>;
}

function need(controller: AppController | undefined): AppController {
  if (!controller) throw new Error('The app is still starting');
  return controller;
}
