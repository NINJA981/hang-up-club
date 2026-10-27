import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { audioEvents, instrumentAudio, onboard, startCall, waitForCallSecond } from './helpers';

/**
 * The Line's own acceptance criteria that the other specs only reach part of:
 * - AC-F1-4 and AC-F2-5: AAA text contrast on the incoming, in-call and call-back screens, measured on
 *   the rendered page by axe's enhanced-contrast rule (the token pairs are also checked by tokens:check),
 *   and Hang up carrying both an icon and its words.
 * - AC-F2-1: a caption appears within 100 ms of its clip starting, on the audio clock, and the line
 *   before it stays on screen at 26 px.
 * - AC-F2-6: the timer is m:ss in the mono face with tabular figures.
 * - AC-F1-3: Enter, Space and the slider each answer, and the first sound follows within 300 ms.
 */

const REAL_URL = '/?seed=7#/today';

/** Wait for one-shot animations (a caption fading up, a chip arriving) to end; the ring halo loops on. */
async function settleAnimations(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)
              .length,
        ),
      { timeout: 5000 },
    )
    .toBe(0);
}

/** AAA contrast (7:1 below 24 px, 4.5:1 at 24 px and up) inside the Line only. */
async function aaaFindings(page: Page, screen: string): Promise<string[]> {
  await settleAnimations(page);
  const res = await new AxeBuilder({ page })
    .include('[data-testid="the-line"]')
    .withRules(['color-contrast-enhanced'])
    .analyze();
  return res.violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${screen}: ${n.target.join(' ')} ${n.any.map((c) => JSON.stringify(c.data)).join(' ')}`,
    ),
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`AAA contrast on the Line, ${scheme} app theme (AC-F1-4, AC-F2-5)`, () => {
    test.use({ colorScheme: scheme });

    test('incoming, in call with reply chips, captions off, and calling back', async ({ page }) => {
      const problems: string[] = [];
      await onboard(page);
      await startCall(page);
      problems.push(...(await aaaFindings(page, 'incoming')));

      await page.getByRole('button', { name: 'Answer' }).click();
      await expect(
        page.getByRole('group', { name: 'Reply choices' }).getByRole('button').first(),
      ).toBeVisible({ timeout: 10_000 });
      problems.push(...(await aaaFindings(page, 'in-call')));

      // Hang up is never colour alone: an icon and the words.
      const hang = page.getByRole('button', { name: 'Hang up', exact: true });
      await expect(hang.locator('svg')).toHaveCount(1);
      await expect(hang).toContainText('Hang up');

      await page.getByRole('button', { name: 'Turn captions off' }).click();
      problems.push(...(await aaaFindings(page, 'captions-off')));
      await page.getByRole('button', { name: 'Turn captions on' }).click();

      await page.getByRole('button', { name: 'Hang up and call the number on my card' }).click();
      await expect(page.getByText(/We did not call you today/)).toBeVisible({ timeout: 8000 });
      problems.push(...(await aaaFindings(page, 'call-back')));

      expect(problems, problems.join('\n')).toEqual([]);
    });
  });
}

test.describe('the call timer (AC-F2-6)', () => {
  test('reads m:ss in the mono face with tabular figures', async ({ page }) => {
    await onboard(page);
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 1);
    const timer = page.getByRole('timer');
    await expect(timer).toHaveText(/^\d+:\d\d$/);
    const style = await timer.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily, numeric: cs.fontVariantNumeric };
    });
    expect(style.family).toContain('Atkinson Hyperlegible Mono');
    expect(style.numeric).toContain('tabular-nums');
  });
});

/**
 * Record every buffer source the app starts with its audio-clock `when`, and the audio clock of
 * each context at the moment a caption node is added. Both sides are then on the same clock.
 */
async function watchCaptions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __ctxs: BaseAudioContext[];
      __starts: { ctx: number; when: number; duration: number; loop: boolean }[];
      __captions: { text: string; at: number[] }[];
    };
    w.__ctxs = [];
    w.__starts = [];
    w.__captions = [];
    const P = BaseAudioContext.prototype;
    const create = P.createBufferSource;
    P.createBufferSource = function (this: BaseAudioContext) {
      if (!w.__ctxs.includes(this)) w.__ctxs.push(this);
      const ctx = w.__ctxs.indexOf(this);
      const src = create.call(this);
      const start = src.start.bind(src);
      src.start = (when?: number, offset?: number, duration?: number) => {
        w.__starts.push({ ctx, when: when ?? 0, duration: src.buffer?.duration ?? 0, loop: src.loop });
        start(when, offset, duration);
      };
      return src;
    };
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLParagraphElement)) continue;
          if (!n.parentElement?.closest('[data-testid="the-line"] [aria-live="polite"]')) continue;
          w.__captions.push({ text: n.textContent, at: w.__ctxs.map((c) => c.currentTime) });
        }
    }).observe(document, { childList: true, subtree: true });
  });
}

test.describe('captions keep time with the voice (AC-F2-1)', () => {
  test('each caption appears within 100 ms of its clip starting, and the line before stays at 26 px', async ({
    page,
  }) => {
    test.slow();
    await watchCaptions(page);
    await onboard(page, { url: REAL_URL });
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    // The first three lines of S01: the greeting, the introduction, the first red flag.
    await expect(page.getByText(/Your account has been compromised/).first()).toBeVisible({
      timeout: 30_000,
    });

    const { starts, captions } = await page.evaluate(() => {
      const w = window as unknown as {
        __starts: { ctx: number; when: number; duration: number; loop: boolean }[];
        __captions: { text: string; at: number[] }[];
      };
      return { starts: w.__starts, captions: w.__captions };
    });
    // The call's clips: not the looping bed, longer than the 120 ms line click, in the order they play.
    const clips = starts.filter((s) => !s.loop && s.duration > 1).sort((a, b) => a.when - b.when);
    expect(clips.length, 'clips scheduled at answer').toBeGreaterThanOrEqual(3);
    expect(captions.length, 'captions shown').toBeGreaterThanOrEqual(3);
    const lags: number[] = [];
    for (let i = 0; i < 3; i++) {
      const clip = clips[i];
      const caption = captions[i];
      if (!clip || !caption) throw new Error(`line ${String(i)} missing`);
      const lagMs = ((caption.at[clip.ctx] ?? 0) - clip.when) * 1000;
      lags.push(Math.round(lagMs));
      expect(lagMs, `caption ${String(i)} "${caption.text.slice(0, 30)}" vs its clip (ms)`).toBeGreaterThan(
        -20,
      );
      expect(lagMs).toBeLessThanOrEqual(100);
    }
    test.info().annotations.push({ type: 'caption lag (ms)', description: lags.join(', ') });

    // The last two lines are on screen, both at the 26 px caption size.
    const sizes = await page
      .getByTestId('the-line')
      .locator('p.text-caption-live')
      .evaluateAll((ps) =>
        ps
          .filter((p) => p.getBoundingClientRect().height > 0)
          .map((p) => Number.parseFloat(getComputedStyle(p).fontSize)),
      );
    expect(sizes.length).toBe(2);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(26);
  });
});

test.describe('every way of answering starts the audio within 300 ms (AC-F1-3)', () => {
  test.skip(({ isMobile }) => isMobile, 'Keys and a mouse drag are the desktop affordances');

  /** performance.now() of the gesture that answered, captured before the app sees it. */
  async function stampGestures(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const w = window as unknown as { __gesture: number[] };
      w.__gesture = [];
      for (const type of ['keydown', 'pointerup'])
        document.addEventListener(
          type,
          () => {
            w.__gesture.push(performance.now());
          },
          true,
        );
    });
  }

  async function latencyAfter(page: Page): Promise<number> {
    await expect(page.getByRole('timer')).toBeVisible();
    await expect
      .poll(async () => (await audioEvents(page)).some((e) => e.kind === 'src-start' && e.loop !== true))
      .toBe(true);
    const gesture = (await page.evaluate(() => (window as unknown as { __gesture: number[] }).__gesture)).at(
      -1,
    );
    if (gesture === undefined) throw new Error('no gesture stamp');
    const first = (await audioEvents(page)).find((e) => e.kind === 'src-start' && e.perf >= gesture);
    if (!first) throw new Error('nothing was scheduled after the gesture');
    return first.perf - gesture + ((first.when ?? 0) - first.ctxNow) * 1000;
  }

  for (const key of ['Enter', 'Space'] as const) {
    test(key, async ({ page }) => {
      await instrumentAudio(page);
      await stampGestures(page);
      await onboard(page, { url: REAL_URL });
      await startCall(page);
      await page.locator('body').press(key);
      expect(await latencyAfter(page), `${key} to first sound (ms)`).toBeLessThan(300);
    });
  }

  test('a drag of the slider past 80%', async ({ page }) => {
    await instrumentAudio(page);
    await stampGestures(page);
    await onboard(page, { url: REAL_URL });
    await startCall(page);
    const box = await page.getByRole('button', { name: 'Answer' }).boundingBox();
    if (!box) throw new Error('no knob');
    const y = box.y + box.height / 2;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 300, y, { steps: 8 });
    await page.mouse.up();
    expect(await latencyAfter(page), 'drag release to first sound (ms)').toBeLessThan(300);
  });
});
