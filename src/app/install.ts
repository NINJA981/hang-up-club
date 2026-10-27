import { createStore } from '../state/store';

/**
 * Install hint support (SPEC section 11). Android and desktop Chrome offer a
 * `beforeinstallprompt`; iOS has no prompt, so the hint opens an illustrated
 * "Share, then Add to Home Screen" guide instead.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

export interface InstallState {
  canPrompt: boolean;
  standalone: boolean;
  ios: boolean;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export const installStore = createStore<InstallState>({ canPrompt: false, standalone: false, ios: false });
let deferred: InstallPromptEvent | undefined;

export function watchInstall(): void {
  installStore.set({ canPrompt: false, standalone: isStandalone(), ios: isIos() });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    installStore.set((s) => ({ ...s, canPrompt: true }));
  });
  window.addEventListener('appinstalled', () => {
    deferred = undefined;
    installStore.set((s) => ({ ...s, canPrompt: false, standalone: true }));
  });
}

export async function promptInstall(): Promise<void> {
  const e = deferred;
  deferred = undefined;
  installStore.set((s) => ({ ...s, canPrompt: false }));
  await e?.prompt();
}
