import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { onboard } from './helpers';

/**
 * AC-F10-5 end to end: the generator is unit-tested against an RFC 5545 fixture; this checks the
 * file a player actually gets from Settings, made in the browser and saved as a download.
 */
test('Settings saves a daily calendar reminder at the chosen time, pointing at this app (AC-F10-5)', async ({
  page,
  baseURL,
}) => {
  await onboard(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Time each day').fill('07:30');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Add to my calendar' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('hang-up-club-reminder.ics');
  const ics = (await readFile(await download.path(), 'utf8')).replace(/\r\n[ \t]/g, '');
  expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(ics).toContain('\r\nBEGIN:VEVENT\r\n');
  expect(ics).toContain('\r\nRRULE:FREQ=DAILY\r\n');
  // A floating local time (no Z, no TZID): 7:30 wherever the phone is, on the pinned test day.
  expect(ics).toMatch(/\r\nDTSTART:20261027T073000\r\n/);
  expect(ics).toContain(`\r\nURL:${new URL(baseURL ?? 'http://localhost:4173').origin}`);
  expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  await expect(page.getByText('Reminder file saved.', { exact: false })).toBeVisible();
  // The time is kept for next time.
  await page.reload();
  await expect(page.getByLabel('Time each day')).toHaveValue('07:30');
});
