import { registerSW } from 'virtual:pwa-register';
import { pwaStore, setUpdateApplier } from './pwaStore';

export { applyPwaUpdate, pwaStore, type PwaState } from './pwaStore';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const update = registerSW({
    onNeedRefresh() {
      pwaStore.set((s) => ({ ...s, updateReady: true }));
    },
    onOfflineReady() {
      pwaStore.set((s) => ({ ...s, offlineReady: true }));
    },
  });
  setUpdateApplier(() => update(true));
}
