import { gzipSync } from 'node:zlib';
import { expect, test } from './fixtures';
import { onboard, startCall, waitForCallSecond } from './helpers';

/**
 * AC-X-4: the first route's JavaScript is at most 170 KB gzipped, LCP is at most 2.0 s on a
 * mid-tier phone (Lighthouse's mobile profile: 4x CPU slowdown, 1.6 Mbit/s, 150 ms round trip),
 * CLS is 0 and INP is at most 200 ms. Measured against the production build, cold cache.
 */

test.describe('performance budget (AC-X-4)', () => {
  test('the first route ships at most 170 KB of gzipped JavaScript', async ({ page, request }) => {
    const loaded: string[] = [];
    page.on('response', (res) => {
      if (res.request().resourceType() === 'script' || res.url().endsWith('.js')) loaded.push(res.url());
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const entry = loaded.filter((u) => !u.endsWith('/sw.js') && !u.includes('registerSW'));
    expect(entry.length).toBeGreaterThan(0);
    let total = 0;
    for (const url of entry) total += gzipSync(await (await request.get(url)).body()).length;
    test.info().annotations.push({
      type: 'first-route-js',
      description: `${String(Math.round(total / 1024))} KB gzip in ${String(entry.length)} file(s)`,
    });
    expect(total, 'gzipped bytes of JS on the first route').toBeLessThanOrEqual(170 * 1024);
  });

  test('LCP on a throttled phone is at most 2.0 s, with no layout shift', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: number; __cls: number };
      w.__lcp = 0;
      w.__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__lcp = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
          if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/?seed=7');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const w = window as unknown as { __lcp: number; __cls: number };
      return { lcp: w.__lcp, cls: w.__cls };
    });
    test.info().annotations.push({
      type: 'lcp',
      description: `LCP ${String(Math.round(m.lcp))} ms, CLS ${m.cls.toFixed(5)} (4x CPU, 1.6 Mbit/s, 150 ms RTT)`,
    });
    expect(m.lcp, 'largest contentful paint (ms)').toBeGreaterThan(0);
    // The cold welcome screen's H1 waits for the entry script, the library, the manifest and the font. With
    // the two JSON files fetched one after the other it measured 2.2 to 2.6 s; fetched together, 2.09 to
    // 2.12 s; preloaded from index.html so they overlap the JS, 1.86 to 1.93 s (2026-10-28, this profile,
    // measured alone). The margin is under 150 ms, so this gate fails if anything is put back in that path.
    expect(m.lcp).toBeLessThanOrEqual(2000);
    expect(m.cls, 'cumulative layout shift').toBeLessThan(0.001);
  });

  test('every tap in a call answers within 200 ms (INP)', async ({ page }) => {
    test.slow();
    await page.addInitScript(() => {
      const w = window as unknown as { __inp: { name: string; duration: number }[] };
      w.__inp = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__inp.push({ name: e.name, duration: e.duration });
      }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    });
    await onboard(page);
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 15);
    await page.getByRole('button', { name: 'Turn captions off' }).click();
    await page.getByRole('button', { name: 'Turn captions on' }).click();
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send to family' })).toBeVisible({ timeout: 4000 });
    const events = await page.evaluate(
      () => (window as unknown as { __inp: { name: string; duration: number }[] }).__inp,
    );
    const worst = events.reduce((a, e) => Math.max(a, e.duration), 0);
    test.info().annotations.push({
      type: 'inp',
      description: `slowest interaction ${String(worst)} ms over ${String(events.length)} slow events`,
    });
    expect(worst, 'slowest interaction (ms)').toBeLessThanOrEqual(200);
  });
});
