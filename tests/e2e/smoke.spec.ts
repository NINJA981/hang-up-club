import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Smoke tests: the shell loads from the production build, makes no
 * off-origin request (AC-F10-6), is installable, and still opens offline.
 * The product flows are in app.spec.ts and a11y.spec.ts.
 */

/** Records every request that leaves the app's own origin. data: and blob: URLs never touch the network. */
function guardOrigin(page: Page, baseURL: string): string[] {
  const origin = new URL(baseURL).origin;
  const offOrigin: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== origin) offOrigin.push(req.url());
  });
  return offOrigin;
}

test('loads the shell and the content from this origin only', async ({ page, baseURL }) => {
  const offOrigin = guardOrigin(page, baseURL ?? 'http://localhost:4173');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Practice saying no to phone scams');
  const lib = await page.request.get('/scenarios/library.json');
  expect(lib.ok()).toBe(true);
  expect(offOrigin).toEqual([]);
});

test('declares the CSP and a manifest an installer accepts (AC-F10-2)', async ({ page, request }) => {
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toMatch(/https?:/);

  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = (await res.json()) as {
    id: string;
    scope: string;
    display: string;
    icons: { sizes: string; purpose?: string }[];
  };
  expect(m).toMatchObject({ id: '/', scope: '/', display: 'standalone' });
  const sizes = m.icons.map((i) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  expect(m.icons.some((i) => i.purpose === 'monochrome')).toBe(true);
});

test('serves a valid scenario library and audio manifest', async ({ request }) => {
  const lib = (await (await request.get('/scenarios/library.json')).json()) as { templates: unknown[] };
  expect(lib.templates).toHaveLength(20);
  const manifest = (await (await request.get('/audio/audio-manifest.json')).json()) as {
    clips: Record<string, { opus: string }>;
  };
  const first = Object.values(manifest.clips)[0];
  expect(first).toBeDefined();
  const clip = await request.get(`/audio/${first?.opus ?? ''}`);
  expect(clip.ok()).toBe(true);
  expect((await clip.body()).length).toBeGreaterThan(500);
});

test('still opens offline after the first visit (AC-F10-1, shell)', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Wait for the service worker to take control of the page.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw new Error('no active service worker');
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Practice saying no to phone scams');
  await context.setOffline(false);
});
