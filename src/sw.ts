/// <reference lib="webworker" />
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { RangeRequestsPlugin } from 'workbox-range-requests';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

/**
 * ADR §3.3. Precache the app shell and scenario JSON; cache audio at runtime
 * with range support (Safari asks for ranges). The new worker waits for the
 * UI's explicit SKIP_WAITING, so an update never activates during a call.
 */
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

/**
 * Clip URLs carry their render sha (`?v=`, see clipUrl), so cache-first is safe for them. Bump the
 * version when the URL scheme changes; older audio caches are deleted on activate.
 */
export const AUDIO_CACHE = 'huc-audio-v2';
export const MANIFEST_CACHE = 'huc-audio-manifest';
const MANIFEST_PATH = '/audio/audio-manifest.json';

// The manifest names the current clips, so it must follow updates: network first, cache offline.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname === MANIFEST_PATH,
  new NetworkFirst({ cacheName: MANIFEST_CACHE, networkTimeoutSeconds: 4 }),
);

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/audio/'),
  new CacheFirst({
    cacheName: AUDIO_CACHE,
    plugins: [new RangeRequestsPlugin(), new ExpirationPlugin({ maxEntries: 1500, purgeOnQuotaError: true })],
  }),
);

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('huc-audio-v') && n !== AUDIO_CACHE).map((n) => caches.delete(n)),
      );
    })(),
  );
});
interface WarmMessage {
  type: 'WARM_AUDIO';
  urls: string[];
}

function isWarm(data: unknown): data is WarmMessage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return d.type === 'WARM_AUDIO' && Array.isArray(d.urls) && d.urls.every((u) => typeof u === 'string');
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data: unknown = event.data;
  if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'SKIP_WAITING') {
    void self.skipWaiting();
    return;
  }
  if (isWarm(data)) {
    // "Download all calls for offline": same-origin audio only.
    const urls = data.urls.filter((u) => u.startsWith('/audio/') && !u.startsWith(MANIFEST_PATH));
    event.waitUntil(
      (async () => {
        // The manifest that names these clips goes into its own cache, so an offline start finds both.
        try {
          await (await caches.open(MANIFEST_CACHE)).add(MANIFEST_PATH);
        } catch {
          /* offline: the network-first route caches it on the next online start */
        }
        const cache = await caches.open(AUDIO_CACHE);
        let done = 0;
        for (const url of urls) {
          if (!(await cache.match(url))) {
            try {
              await cache.add(url);
            } catch {
              /* offline or missing: the player retries later */
            }
          }
          done += 1;
          const clients = await self.clients.matchAll();
          for (const c of clients) c.postMessage({ type: 'WARM_PROGRESS', done, total: urls.length });
        }
      })(),
    );
  }
});
