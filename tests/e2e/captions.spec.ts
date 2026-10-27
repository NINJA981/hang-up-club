// The pinned day matters: `?seed=7` picks S01 only on 2026-10-27 (see ./fixtures). Imported from
// @playwright/test this spec ran on the real date and got a different call.
import { expect, test } from './fixtures';
import { onboard, startCall } from './helpers';

test.describe('captions (AC-F2-1)', () => {
  test('the live line is 26px or larger, and turning captions off survives a reload', async ({ page }) => {
    await onboard(page);
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();

    const live = page.locator('[aria-live="polite"]', { hasText: 'Caller' }).first();
    await expect(live).toContainText('Hello, is this Paati?');
    const size = await live
      .locator('p')
      .first()
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(26);

    await page.getByRole('button', { name: 'Turn captions off' }).click();
    await expect(page.getByText('Captions are off')).toBeVisible();

    // The choice is stored with the profile, not held in memory: a fresh page load still has them off.
    await page.reload();
    await expect(page.getByRole('button', { name: /^Take today/ })).toBeVisible();
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await expect(page.getByText('Captions are off')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Turn captions on' })).toBeVisible();
  });
});
