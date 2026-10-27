import { createStore } from '../state/store';

/** Update lifecycle read by the UI (SPEC AC-F10-4): an update is offered, never applied mid-call. */
export interface PwaState {
  /** A new version is installed and waiting. */
  updateReady: boolean;
  /** The app shell is cached and works offline. */
  offlineReady: boolean;
}

export const pwaStore = createStore<PwaState>({ updateReady: false, offlineReady: false });

let applier: (() => Promise<void>) | undefined;

export function setUpdateApplier(fn: () => Promise<void>): void {
  applier = fn;
}

/** Activate the waiting worker and reload. The UI calls this only from the Today screen. */
export async function applyPwaUpdate(): Promise<void> {
  await applier?.();
}
