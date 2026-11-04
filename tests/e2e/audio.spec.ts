import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import {
  audioEvents,
  clickStamps,
  instrumentAudio,
  onboard,
  savedAttempts,
  stampClicks,
  startCall,
  takeSharpCall,
  waitForCallSecond,
} from './helpers';

/**
 * The real audio path. Every other spec runs with `?test=1` (a silent engine), so
 * nothing there proves the ring, the clips, the hang-up cut or the speech fallback
 * work. These tests drop `?test=1`: headless Chromium has a null audio sink but a
 * real Web Audio graph, so the app really fetches, decodes and schedules the clips.
 * `instrumentAudio` records what it asks the audio clock to do. Nothing here can
 * judge how it SOUNDS; that still needs a pair of ears (HANDOFF).
 */

const REAL_URL = '/?seed=7#/today';
const VOICE = { name: 'Test voice', lang: 'en-US', localService: true, default: true };
const RING_VIBRATE = [800, 400, 800];

test.describe('ring and vibrate (AC-F1-2)', () => {
  test('the ringtone is two synthesised tones that stop after 20 s, and the screen keeps waiting', async ({
    page,
  }) => {
    await instrumentAudio(page, { vibrate: true });
    await onboard(page, { url: REAL_URL });
    const before = (await audioEvents(page)).length;
    await startCall(page);

    await expect
      .poll(async () => (await audioEvents(page)).slice(before).filter((e) => e.kind === 'osc-start').length)
      .toBe(2);
    const events = (await audioEvents(page)).slice(before);
    const starts = events.filter((e) => e.kind === 'osc-start');
    expect(starts.map((e) => e.freq).sort()).toEqual([440, 480]);
    const stops = events.filter((e) => e.kind === 'osc-stop' && (e.when ?? 0) > 5);
    expect(stops).toHaveLength(2);
    for (const stop of stops) {
      const start = starts.find((s) => s.freq === stop.freq);
      const length = (stop.when ?? 0) - (start?.when ?? 0);
      expect(length, 'ringing is cut off at 20 s').toBeGreaterThanOrEqual(20);
      expect(length).toBeLessThan(20.5);
    }
    // 2 s on / 4 s off: four on-windows fit in 20 s.
    expect(events.filter((e) => e.kind === 'gain-target' && e.value === 0.12)).toHaveLength(4);

    // Vibration: once per ring cycle, with the ring pattern, and then it stops. The screen waits.
    await page.clock.runFor(21_000);
    const vibes = (await audioEvents(page)).filter((e) => e.kind === 'vibrate');
    expect(
      vibes.filter((e) => Array.isArray(e.pattern) && e.pattern.join() === RING_VIBRATE.join()),
    ).toHaveLength(4);
    await expect(page.getByRole('button', { name: 'Answer' })).toBeVisible();
    await expect(page.getByRole('timer')).toHaveCount(0);
  });

  test('with Vibrate off in Settings the phone does not buzz', async ({ page }) => {
    await instrumentAudio(page, { vibrate: true });
    await onboard(page, { url: REAL_URL });
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('switch', { name: 'Vibrate when it rings' }).click();
    await expect(page.getByRole('switch', { name: 'Vibrate when it rings' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.getByRole('link', { name: 'Today' }).click();
    await startCall(page);
    await page.clock.runFor(13_000);
    const buzzes = (await audioEvents(page)).filter(
      (e) => e.kind === 'vibrate' && Array.isArray(e.pattern) && e.pattern.length > 1,
    );
    expect(buzzes).toEqual([]);
  });
});

test.describe('answer, hang up, and the clips (AC-F1-3, AC-F2-2, AC-F6-3)', () => {
  test('audio starts within 300 ms of Answer; Hang up is silent within 50 ms and the time is exact', async ({
    page,
  }) => {
    test.slow();
    await instrumentAudio(page);
    await stampClicks(page);
    await onboard(page, { url: REAL_URL });
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 3);
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    await expect(page.getByTestId('result-headline')).toBeVisible();

    const clicks = await clickStamps(page);
    const answered = clicks.find((c) => c.label.startsWith('Answer'));
    const hung = clicks.find((c) => /^Hang up(?! and)/.test(c.label));
    if (!answered || !hung) throw new Error(`missing click stamps: ${JSON.stringify(clicks)}`);
    const events = await audioEvents(page);

    // Audio starts: the first clip or the ambience bed scheduled after the tap, no later than 300 ms.
    const first = events.find((e) => e.kind === 'src-start' && e.perf >= answered.perf);
    if (!first) throw new Error('no clip was scheduled after Answer');
    const latencyMs = first.perf - answered.perf + ((first.when ?? 0) - first.ctxNow) * 1000;
    expect(latencyMs, 'Answer to first sound (ms)').toBeLessThan(300);

    // Hang up: the master gain heads to 0 with a short time constant, and every source is told to stop at once.
    const gain = events.find((e) => e.kind === 'gain-target' && e.value === 0 && e.perf >= hung.perf);
    if (!gain) throw new Error('hang-up did not ramp the gain down');
    expect(gain.perf - hung.perf, 'tap to cut (ms)').toBeLessThan(50);
    expect((gain.tc ?? 1) * 3, 'three time constants is the ramp, under 30 ms').toBeLessThanOrEqual(0.03);
    const stops = events.filter((e) => e.kind === 'src-stop' && e.perf >= hung.perf);
    expect(stops.length).toBeGreaterThan(0);
    for (const s of stops) expect((s.when ?? 0) - s.ctxNow).toBeLessThanOrEqual(0.06);

    // tActionMs is the call clock at the tap. That clock is the audio clock, started 50 ms after the
    // Answer tap (the scheduling lead), so the expected value is read off the same clock: Hang up's
    // audio-time minus Answer's audio-time minus the lead.
    const attempts = await savedAttempts(page);
    const t = Number(attempts.at(-1)?.tActionMs);
    const expected = (gain.ctxNow - first.ctxNow - 0.05) * 1000;
    expect(
      Math.abs(t - expected),
      `tActionMs ${String(t)} vs audio-clock ${String(Math.round(expected))}`,
    ).toBeLessThanOrEqual(50);
    // Wall time between the taps, for the record: how far the headless audio clock drifts from it.
    test.info().annotations.push({
      type: 'tap-to-tap',
      description: `wall ${String(Math.round(hung.perf - answered.perf))} ms, audio clock ${String(Math.round(expected))} ms, tActionMs ${String(t)}`,
    });
  });

  test('"Play this line" in the replay plays just that clip', async ({ page }) => {
    test.slow();
    await instrumentAudio(page);
    await onboard(page, { url: REAL_URL });
    await takeSharpCall(page);
    await page.getByRole('button', { name: 'See what gave it away' }).click();
    const play = page.getByRole('button', { name: /Play this line/ });
    await expect(play.first()).toBeVisible();
    const starts = async (): Promise<number> =>
      (await audioEvents(page)).filter((e) => e.kind === 'src-start' && e.loop !== true).length;
    const before = await starts();
    await play.nth(1).click();
    await expect.poll(starts).toBe(before + 1);
    await play.nth(2).click();
    await expect.poll(starts).toBe(before + 2);
  });
});

test.describe('when a clip cannot be fetched (AC-F5-4)', () => {
  // Route interception does not see requests the service worker answers, so keep it out of the way.
  test.use({ serviceWorkers: 'block' });
  // Clip URLs carry their render sha as ?v=..., so the pattern allows a query.
  const CLIPS = /\/audio\/.*\.(webm|m4a)(\?.*)?$/;

  test('the phone speaks the line with a local voice', async ({ page }) => {
    await instrumentAudio(page, { voices: [VOICE] });
    await page.route(CLIPS, (route) => route.abort());
    await onboard(page, { url: REAL_URL });
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await expect(page.getByText('Hello, is this Paati?').first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await audioEvents(page)).filter((e) => e.kind === 'speak').map((e) => e.text))
      .toContain('Hello, is this Paati?');
    await expect(page.getByText('Read-along call')).toHaveCount(0);
  });

  test('with no built-in voice the call carries on as captions, with a banner', async ({ page }) => {
    await instrumentAudio(page, { voices: [] });
    await page.route(CLIPS, (route) => route.abort());
    await onboard(page, { url: REAL_URL });
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await expect(page.getByText('Read-along call: your phone has no built-in voice.')).toBeVisible();
    await expect(page.getByText('Hello, is this Paati?').first()).toBeVisible({ timeout: 15_000 });
    await waitForCallSecond(page, 2);
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    await expect(page.getByTestId('result-headline')).toBeVisible();
    expect((await audioEvents(page)).filter((e) => e.kind === 'speak')).toEqual([]);
  });
});

test.describe('a family call (AC-F5-5)', () => {
  test('is spoken by the phone when there is no voice pack, and nothing leaves the origin', async ({
    page,
  }) => {
    const link = readFileSync(
      join(import.meta.dirname, '..', 'fixtures', 'links', 'v1-family-scam.txt'),
      'utf8',
    ).trim();
    await instrumentAudio(page, { voices: [VOICE] });
    await onboard(page, { url: REAL_URL });
    await page.goto(`/?seed=7#/family?d=${link}`);
    await page.getByRole('button', { name: 'Add to my calls' }).click();
    // A family call arrives 0 to 3 days after it is added (SPEC F8): three days on it is certainly due,
    // and that day's planned call is a scam, which is what this one is.
    await page.goto('/?seed=7#/today');
    await page.clock.setSystemTime(new Date(2026, 9, 30, 10, 0, 0));
    // The app re-reads the date when it returns to the foreground.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await startCall(page);
    await expect(page.getByTestId('the-line')).toContainText('Sam');
    await page.getByRole('button', { name: 'Answer' }).click();
    await expect
      .poll(async () =>
        (await audioEvents(page))
          .filter((e) => e.kind === 'speak')
          .map((e) => e.text)
          .join(' | '),
      )
      .toContain('Please do not hang up');
    // The origin guard in ./fixtures fails this test if any request left the origin.
  });
});
