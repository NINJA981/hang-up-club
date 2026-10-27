import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { SCHEMES, SIZES, checkScreen, type Finding } from './a11y-helpers';
import { TEST_URL, onboard, startCall, waitForCallSecond } from './helpers';

/**
 * AC-X-1, AC-X-2 and the 56 px floor on the surfaces a11y.spec.ts does not reach: the
 * ringing and in-call states with reply chips and captions off, the call-back, the
 * result, the sheets, every link screen, the coach steps, the coach inbox with a
 * card in it, the family-call builder with its errors, the offline banner and the
 * iOS install guide. Light and dark at 375, 768 and 1440.
 */

const link = (name: string): string =>
  readFileSync(join(import.meta.dirname, '..', 'fixtures', 'links', `v1-${name}.txt`), 'utf8').trim();

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

for (const scheme of SCHEMES) {
  for (const { w, h } of SIZES) {
    test.describe(`${String(w)}px ${scheme}`, () => {
      test.use({ colorScheme: scheme, viewport: { width: w, height: h } });
      test.skip(({ isMobile }) => isMobile, 'These checks resize the viewport themselves');
      test.setTimeout(150_000);

      test('the call states, the sheets, the link screens, the coach steps and the inbox pass axe (AC-X-1, AC-X-2)', async ({
        page,
        context,
      }) => {
        const problems: Finding[] = [];
        const check = async (screen: string): Promise<void> => {
          problems.push(...(await checkScreen(page, screen)));
        };

        await onboard(page);
        await startCall(page);
        await check('incoming');

        // In call: reply chips showing, then captions off.
        await page.getByRole('button', { name: 'Answer' }).click();
        await expect(
          page.getByRole('group', { name: 'Reply choices' }).getByRole('button').first(),
        ).toBeVisible({
          timeout: 10_000,
        });
        await check('in-call-reply-chips');
        await page.getByRole('button', { name: 'Turn captions off' }).click();
        await expect(page.getByText('Captions are off')).toBeVisible();
        await check('in-call-captions-off');
        await page.getByRole('button', { name: 'Turn captions on' }).click();

        // Call back: dialling, then the real line speaking.
        await page.getByRole('button', { name: 'Hang up and call the number on my card' }).click();
        await expect(page.getByTestId('the-line').getByText('Calling back')).toBeVisible();
        await check('call-back-dialling');
        await expect(page.getByText(/We did not call you today/)).toBeVisible({ timeout: 8000 });
        await check('call-back-line');
        await page.getByRole('button', { name: /See your result/ }).click();
        await expect(page.getByRole('button', { name: 'Send to family' })).toBeVisible({ timeout: 5000 });
        await check('result-after-call-back');

        // The replay's sources sheet, and a past call opened from My calls.
        await page.getByRole('button', { name: 'See what gave it away' }).click();
        await page.getByRole('button', { name: 'Why this matters' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await check('sources-sheet');
        await page.keyboard.press('Escape');
        await page.goto(`${TEST_URL}#/calls/0`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await check('past-call-replay');

        // Today with the offline banner, and with an install prompt on offer.
        await page.goto(`${TEST_URL}#/today`);
        await context.setOffline(true);
        await expect(page.getByText(/You.re offline/)).toBeVisible();
        await check('today-offline');
        await context.setOffline(false);
        await page.evaluate(() => {
          const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void> };
          e.prompt = () => Promise.resolve();
          window.dispatchEvent(e);
        });
        await expect(page.getByText('Keep Hang Up Club on your home screen')).toBeVisible();
        await check('today-install-hint');

        // Every link screen, from the committed v1 fixtures.
        await page.goto(`${TEST_URL}#/join?d=${link('join-full')}`);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('set this up for you');
        await check('link-join');
        await page.goto(`${TEST_URL}#/cheer?d=${link('cheer-aac')}`);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('sent you a cheer');
        await check('link-cheer');
        await page.goto(`${TEST_URL}#/family?d=${link('family-scam')}`);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('wrote you a practice call');
        await check('link-family-call');
        await page.goto(`${TEST_URL}#/r?d=${link('result-sharp')}`);
        await expect(page.getByTestId('result-sentence')).toBeVisible();
        await check('link-result-card');

        // The coach inbox with a card in it.
        await page.getByRole('button', { name: 'Save to my Coach inbox' }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Coach inbox');
        await check('inbox-with-card');

        // Coach setup, every step, including the finished screen with its QR code.
        await page.goto(`${TEST_URL}#/coach`);
        await check('coach-step-1');
        await page.getByRole('radio', { name: 'Paati' }).click();
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await check('coach-step-2');
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.getByRole('alert').first()).toBeVisible();
        await check('coach-step-2-error');
        await page.getByLabel('Your name').fill('Arjun');
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await check('coach-step-3-record');
        await page.getByRole('button', { name: 'Next, without a cheer' }).click();
        await check('coach-step-4-categories');
        await page.getByRole('button', { name: 'Make the setup link' }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Setup link ready');
        await check('coach-link-ready');

        // The family-call builder, empty and with its inline errors.
        await page.goto(`${TEST_URL}#/coach/call`);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Write a practice call');
        await page
          .getByRole('button', { name: /Make the family call/ })
          .first()
          .click();
        await expect(page.getByRole('alert').first()).toBeVisible();
        await check('family-call-errors');

        expect(problems, problems.map((p) => `${p.where}: ${p.detail}`).join('\n')).toEqual([]);
      });
    });
  }
}

test.describe('the iOS install guide (AC-X-1, AC-X-2)', () => {
  test.use({ userAgent: IPHONE_UA });
  test.skip(({ isMobile }) => isMobile, 'These checks resize the viewport themselves');

  for (const scheme of SCHEMES) {
    for (const { w, h } of SIZES) {
      test(`${String(w)}px ${scheme}`, async ({ page }) => {
        test.slow();
        await page.setViewportSize({ width: w, height: h });
        await page.emulateMedia({ colorScheme: scheme });
        await onboard(page);
        // A quick call back is a good call, which is what earns the install card.
        await startCall(page);
        await page.getByRole('button', { name: 'Answer' }).click();
        await waitForCallSecond(page, 2);
        await page.getByRole('button', { name: 'Hang up and call the number on my card' }).click();
        await page.getByRole('button', { name: /See your result/ }).click();
        await expect(page.getByRole('button', { name: 'Done' })).toBeVisible({ timeout: 5000 });
        await page.getByRole('button', { name: 'Done' }).click();
        await expect(page.getByText('Keep Hang Up Club on your home screen')).toBeVisible();
        await page.getByRole('button', { name: 'Add to home screen' }).click();
        await expect(page.getByText(/Share/).first()).toBeVisible();
        const problems = await checkScreen(page, 'install-guide');
        expect(problems, problems.map((p) => `${p.where}: ${p.detail}`).join('\n')).toEqual([]);
      });
    }
  }
});

test.describe('the checks themselves', () => {
  test('flag a page that breaks each rule, so a clean result means something', async ({ page }) => {
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>x</title></head><body><main>' +
        '<h1 style="font-size:12px;color:#ccc;background:#fff">Tiny pale heading</h1>' +
        '<button style="width:20px;height:20px;font-size:12px;color:#ccc;background:#fff">go</button>' +
        '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">' +
        '<p style="font-size:18px">Body copy at eighteen pixels</p>' +
        '<p class="text-meta" style="font-size:18px">A meta line may be eighteen</p>' +
        '</main></body></html>',
    );
    const found = await checkScreen(page, 'bad');
    const text = found.map((f) => f.detail).join('\n');
    expect(text).toMatch(/color-contrast/);
    expect(text).toMatch(/image-alt/);
    expect(text).toMatch(/12px/);
    expect(text).toMatch(/button 20x20/);
    expect(text).toMatch(/body copy 18px "Body copy at eighteen/);
    expect(text).not.toMatch(/A meta line/);
  });
});
