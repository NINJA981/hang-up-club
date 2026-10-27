import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke test for the landing page (site/), run against its production build. It
 * is deliberately shallow and fast: the page loads, says the right thing, talks
 * only to its own origin, has no console errors, does not scroll sideways, has
 * working in-page links, and passes axe in both colour schemes. The deep checks
 * (LCP, CLS, the playable call, reduced motion, no-JS, the demo audio budget) are
 * `pnpm verify` in site/.
 */

interface Watch {
  offOrigin: string[];
  errors: string[];
}

function watch(page: Page, baseURL: string): Watch {
  const origin = new URL(baseURL).origin;
  const w: Watch = { offOrigin: [], errors: [] };
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== origin) w.offOrigin.push(req.url());
  });
  page.on('console', (m) => {
    if (m.type() === 'error') w.errors.push(m.text());
  });
  page.on('pageerror', (e) => w.errors.push(String(e)));
  return w;
}

/** Scroll to the bottom in steps so lazily painted sections (content-visibility) get rendered. */
async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight * 0.8) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
}

/**
 * Wait until every one-shot animation scrolling started (the timeline drawing in, labels fading up)
 * has finished. axe measures contrast with the opacity of the moment, so a label caught half way
 * through its fade reads as low contrast even though its end state passes. The hero's looping
 * animations are left running.
 */
async function settleAnimations(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)
              .filter((a) => !(a.effect as KeyframeEffect | null)?.target?.closest('#handset')).length,
        ),
      { timeout: 10_000 },
    )
    .toBe(0);
}

test('loads, says what the product is, and stays on its own origin with a clean console', async ({
  page,
  baseURL,
}) => {
  const w = watch(page, baseURL ?? 'http://localhost:47213');
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(/Hang Up Club/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Practise hanging up on scammers');
  await expect(page.getByRole('link', { name: 'Open the app' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  expect(await page.locator('meta[name="description"]').getAttribute('content')).toMatch(
    /practice|practise/i,
  );
  await scrollThrough(page);
  await page.waitForLoadState('networkidle');
  expect(w.offOrigin, 'requests that left the origin').toEqual([]);
  expect(w.errors, 'console errors').toEqual([]);
});

test('no placeholder is left unfilled and no link is dead', async ({ page, request }) => {
  await page.goto('/');
  const html = await page.content();
  expect(html, 'unfilled {{template}} tokens').not.toMatch(/\{\{[^}]+\}\}/);
  expect(html).not.toMatch(/lorem ipsum/i);

  const hrefs = await page
    .locator('a[href]')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  expect(hrefs.length).toBeGreaterThan(5);
  for (const href of hrefs) {
    expect(href, 'every link has a destination').not.toBe('');
    expect(href.startsWith('javascript:'), href).toBe(false);
    if (href.startsWith('#') && href.length > 1) {
      expect(await page.locator(href).count(), `in-page target ${href} exists`).toBeGreaterThan(0);
    }
  }
  for (const path of ['/robots.txt', '/llms.txt', '/og.jpg', '/favicon.svg']) {
    const res = await request.get(path);
    expect(res.ok(), path).toBe(true);
  }
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(og, 'og:image is declared').toBeTruthy();
  const ogPath = new URL(og ?? '', 'http://localhost').pathname;
  const img = await request.get(ogPath);
  expect(img.headers()['content-type']).toContain('image/');
});

test('the playable call starts from the button (the deep path is `pnpm verify` in site/)', async ({
  page,
}) => {
  await page.goto('/');
  const tryCall = page.getByRole('button', { name: /Try the call/ });
  await expect(tryCall).toBeVisible();
  await tryCall.click();
  await expect(page.getByRole('button', { name: /Answer/ }).first()).toBeVisible();
});

for (const width of [320, 375, 768, 1440]) {
  test(`does not scroll sideways at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await scrollThrough(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe finds no serious or critical violation (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await scrollThrough(page);
    await settleAnimations(page);
    const res = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      'serious or critical axe violations',
    ).toEqual([]);
  });
}
