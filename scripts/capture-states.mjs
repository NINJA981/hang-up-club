// Design QA state sheet: the primary controls at rest, hover, focus-visible, pressed, loading, error, empty and
// success, plus a sheet opening and closing. Writes docs/screenshots/states/*.png from the production build.
// Usage: node scripts/capture-states.mjs [--theme=light|dark]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:4180';
const theme = process.argv.find((a) => a.startsWith('--theme='))?.split('=')[1] ?? 'light';
const OUT = join('docs', 'screenshots', 'states');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: theme,
  serviceWorkers: 'block', // so the delayed audio route below is honoured
});
const page = await ctx.newPage();
const save = async (locator, name) => {
  await page.waitForTimeout(180);
  await locator.screenshot({ path: join(OUT, `${name}-${theme}.png`) });
};

await page.goto(`${BASE}/?test=1&seed=7#/today`);
await page.getByRole('button', { name: 'Set up for me' }).click();

// Primary button: rest, hover, focus-visible, pressed.
const next = page.getByRole('button', { name: 'Continue' });
await save(next, 'btn-primary-1-rest');
await next.hover();
await save(next, 'btn-primary-2-hover');
await page.mouse.move(0, 0);
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await page.waitForTimeout(150);
const focused = await page.locator(':focus-visible').first().boundingBox();
if (focused) {
  await page.screenshot({
    path: join(OUT, `focus-3-visible-${theme}.png`),
    clip: {
      x: Math.max(0, focused.x - 12),
      y: Math.max(0, focused.y - 12),
      width: focused.width + 24,
      height: focused.height + 24,
    },
  });
}
const box = await next.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await save(next, 'btn-primary-4-pressed');
  await page.mouse.up();
}
// Error: Continue with nothing picked.
await page.waitForTimeout(100);
await page.getByRole('alert').waitFor();
await save(page.getByRole('alert'), 'field-5-error');
// Selected toggle.
const paati = page.getByRole('radio', { name: 'Paati' });
await paati.click();
await save(paati, 'toggle-6-selected');
await page.getByRole('radio', { name: 'Something else' }).click();
await save(page.getByLabel('What would you like to be called?'), 'input-7-rest');
await page.getByLabel('What would you like to be called?').focus();
await save(page.getByLabel('What would you like to be called?'), 'input-8-focus');
await page.getByRole('radio', { name: 'Paati' }).click();
await next.click();
await page.getByRole('button', { name: 'Yes, I hear it' }).click();

// Loading: the daily card while the call is prepared (slow the audio down so the bar is visible).
await page.getByRole('button', { name: /^Take today/ }).waitFor();
await page.route('**/audio/**', async (route) => {
  await new Promise((r) => setTimeout(r, 600));
  await route.continue().catch(() => undefined);
});
// Test mode skips the audio fetch; use the real mode for the loading sample.
await page.goto(`${BASE}/?seed=7#/today`);
await page.getByRole('button', { name: /^Take today/ }).click();
await page.waitForTimeout(500);
await save(page.locator('[aria-labelledby="today-title"]'), 'card-9-loading');
await page.unroute('**/audio/**');
await page.waitForTimeout(6000);
await page.goto(`${BASE}/?test=1&seed=7#/today`);

// Empty and success: the Coach inbox and a copied link.
await page.goto(`${BASE}/?test=1&seed=7#/inbox`);
await page.getByRole('heading', { name: 'Coach inbox' }).waitFor();
await save(page.getByRole('main'), 'screen-10-empty-inbox');

// A sheet opening and closing (a bottom sheet on a phone).
await page.goto(`${BASE}/?test=1&seed=7#/settings`);
await page.getByRole('heading', { name: 'Settings' }).waitFor();
await page.getByRole('button', { name: 'Delete everything on this device' }).click();
await page.waitForTimeout(120);
await page.screenshot({ path: join(OUT, `sheet-11-opening-${theme}.png`) });
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, `sheet-12-open-${theme}.png`) });
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
await page.screenshot({ path: join(OUT, `sheet-13-closing-${theme}.png`) });
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, `sheet-14-closed-${theme}.png`) });

await browser.close();
