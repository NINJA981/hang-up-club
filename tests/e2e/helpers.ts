import { expect, type BrowserContext, type Page } from '@playwright/test';

/** Records every request that leaves the app's own origin. data: and blob: URLs never touch the network. */
export function guardOrigin(page: Page, baseURL: string): string[] {
  const origin = new URL(baseURL).origin;
  const offOrigin: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== origin) offOrigin.push(req.url());
  });
  return offOrigin;
}

/** `?test=1` is a silent audio engine with real timing; `?seed=7` makes today's call the same every run (S01). */
export const TEST_URL = '/?test=1&seed=7';

/** Walk the welcome flow as a player called Paati. Ends on Today. */
export async function onboard(page: Page, opts: { url?: string; term?: string } = {}): Promise<void> {
  await page.goto(opts.url ?? `${TEST_URL}#/today`);
  await page.getByRole('button', { name: 'Set up for me' }).click();
  await page.getByRole('radio', { name: opts.term ?? 'Paati' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Yes, I hear it' }).click();
  await expect(page.getByRole('button', { name: /^Take today/ })).toBeVisible();
}

export async function startCall(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Take today/ }).click();
  await expect(page.getByTestId('the-line')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Answer' })).toBeVisible();
}

/** The caller's clock, read from the call timer. */
export async function callSeconds(page: Page): Promise<number> {
  const label = (await page.getByRole('timer').getAttribute('aria-label')) ?? '';
  const m = /(\d+):(\d\d)/.exec(label);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Wait until the call clock reaches `s` seconds. */
export async function waitForCallSecond(page: Page, s: number): Promise<void> {
  await expect.poll(() => callSeconds(page), { timeout: 60_000, intervals: [250] }).toBeGreaterThanOrEqual(s);
}

/** Answer, let the first flag pass (about 13 s into S01 with seed 7), hang up. Ends on the result. */
export async function takeSharpCall(page: Page, at = 15): Promise<void> {
  await startCall(page);
  await page.getByRole('button', { name: 'Answer' }).click();
  await waitForCallSecond(page, at);
  await page.getByRole('button', { name: 'Hang up', exact: true }).click();
  await expect(page.getByTestId('result-headline')).toBeVisible();
}

export async function waitForServiceWorker(page: Page, context: BrowserContext): Promise<void> {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw new Error('no active service worker');
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  void context;
}
