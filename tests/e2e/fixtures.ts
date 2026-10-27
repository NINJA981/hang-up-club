import { expect, test as base, type Browser, type BrowserContext } from '@playwright/test';

/**
 * The day every e2e test runs on. `?seed=7` makes the scheduler deterministic only
 * for a given local date (the pick is seeded by profile id AND date), so without a
 * pinned date "today's call is S01" is true on one calendar day only. On 2026-10-27
 * the seeded pick is S01 "First Meridian Bank Fraud Dept" (variant org=0).
 *
 * The clock is installed, not frozen: time flows from this instant, so timers,
 * animation and the call clock behave normally.
 */
export const FIXED_NOW = new Date(2026, 9, 27, 10, 0, 0);

/**
 * Every e2e test runs with the pinned day and with a guard that fails the test if
 * any request left the app's own origin (AC-F10-6). `data:` and `blob:` URLs never
 * touch the network.
 */
export const test = base.extend<{ originGuard: undefined; allowedOrigins: Set<string>; today: Date }>({
  /** The pinned day. Override with `test.use({ today })` to reach a different seeded call. */
  today: [FIXED_NOW, { option: true }],
  /** Extra origins a test may talk to on purpose (for example a local proxy it starts itself). */
  // eslint-disable-next-line no-empty-pattern
  allowedOrigins: async ({}, use) => {
    await use(new Set<string>());
  },
  context: async ({ context, today }, use) => {
    await context.clock.install({ time: today });
    await use(context);
  },
  originGuard: [
    async ({ context, baseURL, allowedOrigins }, use) => {
      const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
      const offOrigin: string[] = [];
      context.on('request', (req) => {
        const url = new URL(req.url());
        if (url.protocol === 'data:' || url.protocol === 'blob:') return;
        if (url.origin !== origin && !allowedOrigins.has(url.origin)) offOrigin.push(req.url());
      });
      await use(undefined);
      expect(offOrigin, 'no request may leave the origin (AC-F10-6)').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** A second device (the coach's phone, or a fresh player), on the same pinned day. */
export async function newDevice(
  browser: Browser | null | undefined,
  baseURL?: string,
  viewport = { width: 390, height: 844 },
): Promise<BrowserContext> {
  if (!browser) throw new Error('no browser');
  const ctx = await browser.newContext(baseURL === undefined ? { viewport } : { viewport, baseURL });
  await ctx.clock.install({ time: FIXED_NOW });
  return ctx;
}
