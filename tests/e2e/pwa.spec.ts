import type { Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from './fixtures';
import {
  TEST_URL,
  audioEvents,
  instrumentAudio,
  onboard,
  startCall,
  takeSharpCall,
  waitForCallSecond,
  waitForServiceWorker,
} from './helpers';

/**
 * The installable, offline part of the product (F10): installability, icons, theme
 * colour, the offline banner, audio that works with no network (including the
 * "Download for offline" path and the service worker's audio cache), the update
 * prompt that never reloads a call, and the install hint.
 */

const REAL_URL = '/?seed=7#/today';

/**
 * A tiny reverse proxy in front of the preview server. It serves everything unchanged until
 * `release` is flipped, then serves a byte-different /sw.js: all a new release is to the browser.
 * (Playwright's route() does not see the browser's own service-worker update check.)
 */
async function startProxy(
  target: string,
): Promise<{ origin: string; release: () => void; close: () => void }> {
  let released = false;
  const server: Server = createServer((req, res) => {
    void (async () => {
      const upstream = await fetch(new URL(req.url ?? '/', target));
      let body = Buffer.from(await upstream.arrayBuffer());
      if (released && (req.url ?? '').split('?')[0] === '/sw.js') {
        body = Buffer.concat([body, Buffer.from('\n// next release\n')]);
      }
      const headers: Record<string, string> = {};
      upstream.headers.forEach((v, k) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k))
          headers[k] = v;
      });
      headers['cache-control'] = 'no-cache';
      res.writeHead(upstream.status, headers);
      res.end(body);
    })().catch(() => {
      res.writeHead(502).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    release: () => {
      released = true;
    },
    close: () => {
      server.close();
    },
  };
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Buffer): { w: number; h: number } {
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

test.describe('installability (AC-F10-2)', () => {
  test('the browser reports no installability errors once the service worker is active', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await waitForServiceWorker(page, context);
    const cdp = await context.newCDPSession(page);
    await expect
      .poll(
        async () => {
          const r = (await cdp.send('Page.getInstallabilityErrors')) as {
            installabilityErrors: { errorId: string }[];
          };
          return r.installabilityErrors.map((e) => e.errorId);
        },
        { timeout: 15_000 },
      )
      .toEqual([]);
  });

  test('every icon exists at the size it claims; there is a maskable and a monochrome one', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = (await (await request.get(manifestUrl ?? '/manifest.webmanifest')).json()) as {
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
      theme_color: string;
      start_url: string;
      scope: string;
      id: string;
    };
    expect(manifest.id).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url.startsWith('/')).toBe(true);
    for (const icon of manifest.icons) {
      const res = await request.get(`/${icon.src}`);
      expect(res.ok(), icon.src).toBe(true);
      if (icon.type === 'image/png') {
        const [w, h] = icon.sizes.split('x').map(Number);
        expect(pngSize(await res.body()), icon.src).toEqual({ w, h });
      } else {
        expect((await res.text()).includes('<svg'), `${icon.src} is an SVG`).toBe(true);
      }
    }
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.filter((i) => i.purpose === 'maskable')).toHaveLength(1);
    expect(manifest.icons.filter((i) => i.purpose === 'monochrome')).toHaveLength(1);
    expect((await request.get('/apple-touch-icon-180x180.png')).ok()).toBe(true);
  });

  const effectiveThemeColor = (page: Page): Promise<string | undefined> =>
    page.evaluate(() => {
      for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        const media = m.getAttribute('media');
        if (media === null || media === '' || window.matchMedia(media).matches) return m.content;
      }
      return undefined;
    });

  for (const [os, colour] of [
    ['light', '#fafaf7'],
    ['dark', '#131411'],
  ] as const) {
    test(`the theme colour follows the ${os} OS scheme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: os });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await effectiveThemeColor(page)).toBe(colour);
    });
  }

  test('a theme chosen in Settings wins over the OS scheme in the browser chrome too', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await onboard(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect
      .poll(() => effectiveThemeColor(page), { message: 'dark chosen in a light OS' })
      .toBe('#131411');
    // ...and it is the first thing painted on the next visit.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => effectiveThemeColor(page), { message: 'after a reload' }).toBe('#131411');
    await page.getByRole('radio', { name: 'System' }).click();
    await expect.poll(() => effectiveThemeColor(page), { message: 'back to the OS scheme' }).toBe('#fafaf7');
  });
});

test.describe('offline (AC-F10-1, AC-F10-3)', () => {
  test('the banner stays on every screen while offline, with no toast spam', async ({ page, context }) => {
    await onboard(page);
    await waitForServiceWorker(page, context);
    await context.setOffline(true);
    const banner = page.getByText(/You.re offline/);
    await expect(banner).toBeVisible();
    for (const [link, heading] of [
      ['My calls', 'My calls'],
      ['Settings', 'Settings'],
      ['Today', undefined],
    ] as const) {
      await page.getByRole('link', { name: link, exact: true }).click();
      if (heading) await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(banner).toBeVisible();
      await expect(banner).toHaveCount(1);
    }
    for (const route of ['#/coach', '#/inbox', '#/calls', '#/today']) {
      await page.goto(`${TEST_URL}${route}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(banner).toBeVisible();
    }
    await page.waitForTimeout(600);
    await expect(page.locator('[aria-live="polite"].pointer-events-none > *')).toHaveCount(0);
    await context.setOffline(false);
    await expect(banner).toHaveCount(0);
  });

  test('downloaded calls play with the network off, from the cache, with real audio', async ({
    page,
    context,
  }) => {
    test.slow();
    await instrumentAudio(page);
    await onboard(page, { url: REAL_URL });
    await waitForServiceWorker(page, context);
    // Settings -> Download for offline asks the service worker to fetch every clip into its audio cache.
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Download for offline' }).click();
    await expect(page.getByRole('button', { name: 'Downloaded' })).toBeVisible({ timeout: 90_000 });
    const cached = await page.evaluate(async () => (await (await caches.open('huc-audio-v2')).keys()).length);
    expect(cached, 'clips in the audio cache').toBeGreaterThan(300);
    // The manifest is not in the cache-first audio cache: it has its own network-first cache.
    const caches_ = await page.evaluate(async () => ({
      clipCacheHasManifest: (await (await caches.open('huc-audio-v2')).keys()).some((r) =>
        r.url.endsWith('/audio/audio-manifest.json'),
      ),
      manifestCached: (await (await caches.open('huc-audio-manifest')).keys()).length,
      clipUrlsVersioned: (await (await caches.open('huc-audio-v2')).keys()).every((r) =>
        /\?v=[0-9a-f]{12}$/.test(r.url),
      ),
    }));
    expect(caches_).toEqual({ clipCacheHasManifest: false, manifestCached: 1, clipUrlsVersioned: true });

    await context.setOffline(true);
    await page.goto(REAL_URL);
    await expect(page.getByRole('button', { name: /^Take today/ })).toBeVisible();
    const decodedBefore = (await audioEvents(page)).filter((e) => e.kind === 'decode').length;
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await expect(page.getByText('Hello, is this Paati?').first()).toBeVisible();
    await waitForCallSecond(page, 2);
    // The clips were found and decoded; this was not the read-along or a spoken fallback.
    const events = await audioEvents(page);
    expect(events.filter((e) => e.kind === 'decode').length - decodedBefore).toBeGreaterThan(5);
    expect(events.filter((e) => e.kind === 'src-start' && e.loop !== true).length).toBeGreaterThan(0);
    await expect(page.getByText('Read-along call')).toHaveCount(0);
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    await expect(page.getByTestId('result-headline')).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('updates (AC-F10-4)', () => {
  test('a new version waits: it is offered on Today, never applied during a call', async ({
    page,
    context,
    baseURL,
    allowedOrigins,
  }) => {
    test.slow();
    const proxy = await startProxy(baseURL ?? 'http://localhost:4173');
    allowedOrigins.add(proxy.origin);
    try {
      await onboard(page, { url: `${proxy.origin}/?test=1&seed=7#/today` });
      await waitForServiceWorker(page, context);

      // Start a call, and only then let the browser find the new version.
      await startCall(page);
      proxy.release();
      await page.evaluate(() => {
        (window as unknown as { __alive: string }).__alive = 'same page';
        void navigator.serviceWorker.getRegistration().then((r) => r?.update());
      });
      await expect
        .poll(
          () =>
            page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)),
          { timeout: 15_000 },
        )
        .toBe(true);
      await page.getByRole('button', { name: 'Answer' }).click();
      await waitForCallSecond(page, 3);
      expect(await page.evaluate(() => (window as unknown as { __alive?: string }).__alive)).toBe(
        'same page',
      );
      await expect(page.getByTestId('the-line')).toBeVisible();
      // Today is still mounted under the Line, with the prompt in it. It must not be reachable:
      // not by Tab, not by a screen reader, and so not by a stray tap on "Restart now" mid-call.
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll('button')]
            .filter((b) => b.textContent.includes('Restart now'))
            .every((b) => b.closest('[inert]') !== null),
        ),
        'the update button is inert during a call',
      ).toBe(true);
      for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => {
          const el = document.activeElement;
          return el === null || el === document.body || el.closest('[data-testid="the-line"]') !== null;
        }),
        'Tab never lands behind the call',
      ).toBe(true);

      // After the call, the prompt is inline on Today. Restarting is the player's choice.
      await page.getByRole('button', { name: 'Hang up', exact: true }).click();
      await expect(page.getByTestId('result-headline')).toBeVisible();
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(page.getByText('An update is ready.')).toBeVisible();
      await expect(page.locator('[inert]')).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __alive?: string }).__alive)).toBe(
        'same page',
      );
      await page.getByRole('button', { name: 'Restart now' }).click();
      await expect
        .poll(() =>
          page
            .evaluate(() => (window as unknown as { __alive?: string }).__alive ?? 'reloaded')
            .catch(() => 'navigating'),
        )
        .toBe('reloaded');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } finally {
      proxy.close();
    }
  });
});

test.describe('the install hint', () => {
  test('after a good call, a browser that can prompt gets one inline card and one button', async ({
    page,
  }) => {
    test.slow();
    await page.addInitScript(() => {
      // Chromium fires this itself on Android; headless desktop does not, so send the same event.
      window.addEventListener('load', () => {
        setTimeout(() => {
          const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void> };
          (window as unknown as { __prompted: number }).__prompted = 0;
          e.prompt = () => {
            (window as unknown as { __prompted: number }).__prompted++;
            return Promise.resolve();
          };
          window.dispatchEvent(e);
        }, 300);
      });
    });
    await onboard(page);
    await expect(page.getByText('Keep Hang Up Club on your home screen')).toHaveCount(0);
    await takeSharpCall(page);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Keep Hang Up Club on your home screen')).toBeVisible();
    await page.getByRole('button', { name: 'Add to home screen' }).click();
    expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
    // The browser's own prompt is the only thing left to do, so the card goes away.
    await expect(page.getByText('Keep Hang Up Club on your home screen')).toHaveCount(0);
  });
});
