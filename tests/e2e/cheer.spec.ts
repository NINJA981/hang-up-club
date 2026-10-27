import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, newDevice, test } from './fixtures';
import {
  audioEvents,
  clickStamps,
  instrumentAudio,
  onboard,
  stampClicks,
  startCall,
  waitForCallSecond,
} from './helpers';

/**
 * The cheer: a coach records a few words (F8), the player keeps them, and the
 * words play in the signature moment (F9). A fake microphone stands in for the
 * coach's voice, so the real MediaRecorder, the real link encoder and the real
 * Web Audio decode all run. Real audio (no `?test=1`) for the player's call.
 */

test.use({
  permissions: ['microphone', 'clipboard-read', 'clipboard-write'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

const REAL_URL = '/?seed=7#/today';
const CHEER_TEXT = 'Nice one, Paati!';

/** Record a cheer in Coach setup, finish the steps, and return the two links. */
async function makeCheerLink(page: Page): Promise<{ cheer: string; recordedMs: number }> {
  await page.goto('/?test=1#/coach');
  await page.getByRole('radio', { name: 'Paati' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Your name').fill('Arjun');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Record a cheer' }).click();
  await expect(page.getByText('Recording')).toBeVisible();
  const t0 = Date.now();
  // No Stop tap: the recorder must stop on its own.
  await expect(page.getByText('Cheer recorded')).toBeVisible({ timeout: 6000 });
  const recordedMs = Date.now() - t0;
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Make the setup link' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Setup link ready');
  await page.getByRole('button', { name: 'Copy the cheer link' }).click();
  await expect(page.getByRole('button', { name: /Copied/ })).toBeVisible();
  return { cheer: await page.evaluate(() => navigator.clipboard.readText()), recordedMs };
}

test.describe('recording a cheer (AC-F8-2)', () => {
  test('stops by itself at 2.5 s and makes a link of at most 8 KB', async ({ page }) => {
    const { cheer, recordedMs } = await makeCheerLink(page);
    expect(recordedMs, 'ms from Record to Cheer recorded').toBeGreaterThanOrEqual(2000);
    expect(recordedMs).toBeLessThan(5000);
    expect(cheer).toContain('#/cheer?d=');
    expect(cheer.length, 'cheer link length').toBeLessThanOrEqual(8 * 1024);
  });
});

test.describe('the cheer in the signature moment (AC-F8-2, AC-F9-3, AC-F8-6)', () => {
  test('a kept cheer plays at +1.6 s with its bubble', async ({ page, context, baseURL }) => {
    test.slow();
    const { cheer } = await makeCheerLink(page);

    const player = await newDevice(context.browser(), baseURL);
    const p = await player.newPage();
    await instrumentAudio(p);
    await stampClicks(p);
    await onboard(p, { url: REAL_URL });
    await p.goto(`/?seed=7${cheer.slice(cheer.indexOf('#'))}`);
    await expect(p.getByRole('heading', { level: 1 })).toContainText('Arjun sent you a cheer');
    await p.getByRole('button', { name: 'Keep this cheer' }).click();
    await expect(p.getByRole('button', { name: /^Take today/ })).toBeVisible();

    await startCall(p);
    await p.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(p, 15);
    await p.getByRole('button', { name: 'Hang up', exact: true }).click();
    await expect(p.getByTestId('result-headline')).toBeVisible();
    const bubble = p.getByTestId('cheer-bubble');
    await expect(bubble).toBeVisible({ timeout: 10_000 });
    await expect(bubble).toContainText(`Arjun: ${CHEER_TEXT}`);

    const hung = (await clickStamps(p)).find((c) => /^Hang up(?! and)/.test(c.label));
    if (!hung) throw new Error('no Hang up stamp');
    const cheerStart = async () =>
      (await audioEvents(p)).find(
        (e) => e.kind === 'src-start' && (e.duration ?? 0) > 1 && e.loop !== true && e.perf > hung.perf,
      );
    await expect.poll(async () => (await cheerStart()) !== undefined, { timeout: 15_000 }).toBe(true);
    const cheerPlay = await cheerStart();
    const after = (cheerPlay?.perf ?? 0) - hung.perf;
    expect(after, 'ms from Hang up to the cheer').toBeGreaterThanOrEqual(1500);
    // It cannot start early. How late depends on decoding the voice, which a busy machine stretches
    // (1.6 to 2.7 s seen with 16 browsers running at once), so the upper bound only catches "never".
    expect(after).toBeLessThan(8000);
    await player.close();
  });

  test('with no cheer there is no bubble and no voice', async ({ page }) => {
    test.slow();
    await instrumentAudio(page);
    await stampClicks(page);
    await onboard(page, { url: REAL_URL });
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 15);
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send to family' })).toBeVisible({ timeout: 4000 });
    await page.waitForTimeout(500);
    await expect(page.getByTestId('cheer-bubble')).toHaveCount(0);
    const longSounds = (await audioEvents(page)).filter(
      (e) => e.kind === 'src-start' && (e.duration ?? 0) > 1 && e.loop !== true,
    );
    // Only the caller's own clips (longer than a second) played, and all of them before the tap.
    const hung = (await clickStamps(page)).find((c) => /^Hang up(?! and)/.test(c.label));
    expect(longSounds.filter((e) => e.perf > (hung?.perf ?? Infinity))).toEqual([]);
  });

  test('a cheer this browser cannot decode shows the coach words, with no dialog (AC-F8-6)', async ({
    page,
  }) => {
    test.slow();
    const link = readFileSync(
      join(import.meta.dirname, '..', 'fixtures', 'links', 'v1-cheer-aac.txt'),
      'utf8',
    ).trim();
    await instrumentAudio(page);
    await onboard(page, { url: REAL_URL });
    await page.goto(`/?seed=7#/cheer?d=${link}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Arjun sent you a cheer');
    // The link screen: Listen fails quietly and says what will be shown instead.
    await page.evaluate(() => {
      (window as unknown as { __failDecode: boolean }).__failDecode = true;
    });
    await page.getByRole('button', { name: 'Listen' }).click();
    await expect(page.getByText(/can.t play the voice/)).toBeVisible();
    await page.getByRole('button', { name: 'Keep this cheer' }).click();
    await expect(page.getByRole('button', { name: /^Take today/ })).toBeVisible();

    // The signature moment: the same words, as text from the coach.
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 15);
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    const bubble = page.getByTestId('cheer-bubble');
    await expect(bubble).toBeVisible({ timeout: 10_000 });
    await expect(bubble).toContainText(`Arjun says: ${CHEER_TEXT}`, { timeout: 15_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });
});
