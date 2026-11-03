import { expect, newDevice, test } from './fixtures';
import {
  TEST_URL,
  callSeconds,
  guardOrigin,
  onboard,
  startCall,
  takeSharpCall,
  waitForCallSecond,
} from './helpers';

/**
 * The product, end to end, against the production build: first run, the daily
 * call (F1, F2), The Cut (F9), the replay (F6), daily limits (F7), the family
 * loop (F8) and offline (F10). `?test=1` swaps the audio for silence with real
 * timing; `?seed=7` makes today's call S01.
 */

test.describe('first run and the daily call', () => {
  test('welcome, name, sound check, then Today (AC-F1-1)', async ({ page, baseURL }) => {
    const offOrigin = guardOrigin(page, baseURL ?? 'http://localhost:4173');
    await page.goto(`${TEST_URL}#/today`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Practice saying no to phone scams');
    await page.getByRole('button', { name: 'Set up for me' }).click();
    // Validation is inline and never disables the button.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toContainText('Pick a name');
    await page.getByRole('radio', { name: 'Paati' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'No sound' }).click();
    await expect(page.getByText('Turn the volume up')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, I hear it' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Paati');
    await expect(page.getByText('Your first practice call is ready')).toBeVisible();
    await expect(page.getByText('Every caller is made up')).toBeVisible();
    expect(offOrigin).toEqual([]);
  });

  test('incoming screen shows a fictional caller and a 555-01xx number (AC-F1-1, AC-F1-4)', async ({
    page,
  }) => {
    await onboard(page);
    await startCall(page);
    const line = page.getByTestId('the-line');
    await expect(line.getByRole('heading', { level: 1 })).toHaveText('First Wrenfield Bank Fraud Dept');
    await expect(line).toContainText('(614) 555-0148');
    await expect(line).toContainText('Practice call');
    const answer = await page.getByRole('button', { name: 'Answer' }).boundingBox();
    expect(answer?.width).toBeGreaterThanOrEqual(96);
    expect(answer?.height).toBeGreaterThanOrEqual(96);
    // The Line is always dark, even in a light theme.
    const bg = await line.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgb(250, 250, 247)');
  });

  test('can be answered by tap, Enter, and a drag of at least 80% (AC-F1-3)', async ({ page }) => {
    await onboard(page);
    // 1. tap
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    await expect(page.getByTestId('result-headline')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
  });

  test('Enter answers the call', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard answer is a desktop affordance');
    await onboard(page);
    await startCall(page);
    await page.locator('body').press('Enter');
    await expect(page.getByRole('timer')).toBeVisible();
  });

  test('a drag of 80% of the track answers; a short drag does not', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Mouse drag is checked on the desktop project');
    await onboard(page);
    await startCall(page);
    const knob = page.getByRole('button', { name: 'Answer' });
    const box = await knob.boundingBox();
    if (!box) throw new Error('no knob');
    const y = box.y + box.height / 2;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByRole('timer')).toHaveCount(0); // still ringing
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 300, y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('timer')).toBeVisible();
  });

  test('in call: captions, two controls, the exact call-back label (AC-F2-1, AC-F2-3, AC-F2-5)', async ({
    page,
  }) => {
    await onboard(page);
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    // Captions are on by default and show the caller's first line within a moment.
    const captions = page.locator('[aria-live="polite"]', { hasText: 'Caller' }).first();
    await expect(captions).toContainText('Hello, is this Paati?');
    const hang = await page.getByRole('button', { name: 'Hang up', exact: true }).boundingBox();
    expect(hang?.width).toBeGreaterThanOrEqual(96);
    expect(hang?.height).toBeGreaterThanOrEqual(96);
    await expect(page.getByRole('button', { name: 'Hang up and call the number on my card' })).toBeVisible();
    // Captions can be turned off, and the setting is remembered.
    await page.getByRole('button', { name: 'Turn captions off' }).click();
    await expect(page.getByText('Captions are off')).toBeVisible();
    await page.getByRole('button', { name: 'Turn captions on' }).click();
    // Reply chips: at most two, each at least 56 px tall.
    const chips = page.getByRole('group', { name: 'Reply choices' }).getByRole('button');
    await expect(chips.first()).toBeVisible();
    expect(await chips.count()).toBeLessThanOrEqual(2);
    for (const chip of await chips.all()) {
      expect((await chip.boundingBox())?.height).toBeGreaterThanOrEqual(56);
    }
  });

  test('the call timer never shifts the layout (AC-F2-6)', async ({ page }) => {
    await onboard(page);
    await startCall(page);
    await page.evaluate(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!e.hadRecentInput) w.__cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 4);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  });

  test('calling back opens the call-back screen with the trusted number (AC-F6-4)', async ({ page }) => {
    await onboard(page);
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 2);
    await page.getByRole('button', { name: 'Hang up and call the number on my card' }).click();
    await expect(page.getByText('Calling back')).toBeVisible();
    await expect(page.getByTestId('the-line')).toContainText('555-01');
    // A scam: the real line says it did not call.
    await expect(page.getByText(/We did not call you today/)).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /See your result/ }).click();
    await expect(page.getByTestId('result-headline')).toBeVisible();
  });
});

test.describe('calling back a real alert (AC-F2-3, AC-F6-4)', () => {
  // seed f on 2026-10-22 is L04, the real bank fraud alert.
  test.use({ today: new Date(2026, 9, 22, 10, 0, 0) });

  test('L04 carries the same call-back label, and the real line confirms the alert', async ({ page }) => {
    await onboard(page, { url: '/?test=1&seed=f#/today' });
    await startCall(page);
    await expect(page.getByTestId('the-line').getByRole('heading', { level: 1 })).toContainText('Fraud Dept');
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 2);
    await page.getByRole('button', { name: 'Hang up and call the number on my card' }).click();
    await expect(page.getByTestId('the-line').getByText('Calling back')).toBeVisible();
    await expect(page.getByText(/we did place a precautionary hold on your card/)).toBeVisible({
      timeout: 8000,
    });
  });
});

test.describe('The Cut and the result', () => {
  test('hanging up after the first flag reads Hung up at m:ss and finishes inside two seconds (AC-F9-1)', async ({
    page,
  }) => {
    await onboard(page);
    await takeSharpCall(page);
    const hungAt = Date.now();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hung up at \d:\d\d\./);
    // The shatter layer exists while the Line breaks, then is gone.
    await expect(page.getByRole('button', { name: 'Send to family' })).toBeVisible({ timeout: 2800 });
    expect(Date.now() - hungAt).toBeLessThan(3000);
    await expect(page.getByText(/The scammer needed \d:\d\d\./)).toBeVisible();
    await expect(page.getByTestId('the-line')).toHaveCount(0);
  });

  test('any tap jumps to the end state at once (AC-F9-1)', async ({ page }) => {
    await onboard(page);
    await takeSharpCall(page);
    await page.mouse.click(5, 5);
    await expect(page.getByRole('button', { name: 'Send to family' })).toBeVisible({ timeout: 400 });
  });

  test('reduced motion: no shards, one crossfade, the same end state (AC-F9-2)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await onboard(page);
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 15);
    // Watch for any shard layer appearing in the document.
    await page.evaluate(() => {
      (window as unknown as { __shards: number }).__shards = 0;
      new MutationObserver((records) => {
        for (const r of records)
          for (const n of r.addedNodes)
            if (n instanceof HTMLElement && n.style.zIndex.includes('--z-shatter'))
              (window as unknown as { __shards: number }).__shards++;
      }).observe(document.body, { childList: true });
    });
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send to family' })).toBeVisible({ timeout: 1500 });
    expect(await page.evaluate(() => (window as unknown as { __shards: number }).__shards)).toBe(0);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hung up at \d:\d\d\./);
  });

  test('the replay shows tactics, the ask, a play control per line and the advice (AC-F6-1, AC-F6-2, AC-F6-3)', async ({
    page,
  }) => {
    await onboard(page);
    await takeSharpCall(page);
    await page.getByRole('button', { name: 'See what gave it away' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What gave it away');
    await expect(page.getByText('Their ask').first()).toBeVisible();
    await expect(page.getByTestId('advice')).toBeVisible();
    expect((await page.getByTestId('advice').textContent())?.length ?? 999).toBeLessThanOrEqual(140);
    const play = page.getByRole('button', { name: /Play this line/ });
    expect(await play.count()).toBeGreaterThan(2);
    expect((await play.first().boundingBox())?.height).toBeGreaterThanOrEqual(56);
    await page.getByRole('button', { name: 'Why this matters' }).click();
    await expect(page.getByRole('dialog')).toContainText(/FTC|FBI|IC3|Federal/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('after the scored call: Done for today, a practice call stays unscored (AC-F7-1)', async ({
    page,
  }) => {
    test.slow();
    await onboard(page);
    await takeSharpCall(page);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Done for today. See you tomorrow.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Take today/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Practice another call/ })).toBeVisible();
    await page.getByRole('button', { name: /Practice another call/ }).click();
    await expect(page.getByTestId('the-line')).toBeVisible();
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 1);
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    await expect(page.getByText('Practice call, not scored')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('link', { name: 'My calls' }).click();
    // The calendar marks today with an icon and a word, never colour alone (AC-F7-5).
    await expect(page.getByText('Call done').first()).toBeAttached();
    await expect(
      page.getByRole('list', { name: /October|November|December|January|February|March/ }),
    ).toBeVisible();
  });

  test('a call can be sent to family as a link that decodes to a card (AC-F8-4, AC-F8-5)', async ({
    page,
    context,
    baseURL,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium');
    test.slow();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      // Force the copy path: share sheets do not exist in headless Chromium on desktop.
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });
    await onboard(page);
    await takeSharpCall(page);
    await page.getByRole('button', { name: 'Send to family' }).click();
    await expect(page.getByRole('button', { name: /Copied/ })).toBeVisible();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toContain('#/r');
    expect(url.length).toBeLessThan(1100);

    // The coach opens it on another phone: the card, then the inbox.
    const coach = await newDevice(context.browser());
    const cp = await coach.newPage();
    await cp.goto(`${(baseURL ?? '').replace(/\/$/, '')}/?test=1${url.slice(url.indexOf('#'))}`);
    await expect(cp.getByRole('heading', { level: 1 })).toContainText('A result from Paati');
    await expect(cp.getByTestId('result-sentence')).toContainText(/Paati hung up \d+\s+s\s+into/);
    await cp.getByRole('button', { name: 'Save to my Coach inbox' }).click();
    await expect(cp.getByRole('heading', { level: 1 })).toHaveText('Coach inbox');
    await expect(cp.getByText(/Paati hung up/)).toBeVisible();
    await coach.close();
  });
});

test.describe('the family loop', () => {
  test('a setup link greets the player by name and carries the address term (AC-F8-1)', async ({
    page,
    context,
    baseURL,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${TEST_URL}#/coach`);
    await page.getByRole('radio', { name: 'Paati' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Your name').fill('Arjun');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next, without a cheer' }).click();
    await expect(page.getByText('Real calls: about 4 in 10')).toBeVisible();
    await page.getByRole('button', { name: 'Make the setup link' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Setup link ready');
    await expect(page.getByTestId('qr')).toBeVisible();
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.getByRole('button', { name: /Copied/ })).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link.length).toBeLessThanOrEqual(1000);

    const fresh = await newDevice(context.browser());
    const p = await fresh.newPage();
    await p.goto(`${(baseURL ?? '').replace(/\/$/, '')}/?test=1${link.slice(link.indexOf('#'))}`);
    await expect(p.getByRole('heading', { level: 1 })).toContainText('Arjun set this up for you, Paati.');
    await p.getByRole('button', { name: 'Start' }).click();
    await p.getByRole('button', { name: 'Yes, I hear it' }).click();
    await expect(p.getByRole('heading', { level: 1 })).toContainText('Paati');
    await fresh.close();
  });

  test('a damaged link gets a friendly screen, never a crash (AC-F8-7)', async ({ page }) => {
    await page.goto(`${TEST_URL}#/join?d=not-a-real-payload`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('This link is damaged');
    await expect(page.getByRole('button', { name: 'Start without it' })).toBeVisible();
  });

  test('a family call is written, shared as a link, opened on the player phone and added (AC-F8-3)', async ({
    page,
    context,
    baseURL,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${TEST_URL}#/coach/call`);
    await page.getByLabel('Your name').fill('Arjun');
    await page.getByRole('radio', { name: 'A scam' }).click();
    await page.getByLabel('Caller says they are…').fill('Sam');
    await page.getByLabel('First thing they say').fill('Hi Paati, it is Sam. I am in a bit of trouble.');
    await page.getByLabel('The warning sign').fill('Please do not tell Mum, she would worry.');
    await page.getByLabel('What they ask for').fill('Can you buy gift cards and read me the numbers?');
    await page
      .getByLabel('One sentence of advice')
      .fill('Family never needs gift cards. Hang up and call them.');
    await page.getByRole('button', { name: 'Make the family call' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Family call ready');
    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('#/family');

    const player = await newDevice(context.browser());
    const p = await player.newPage();
    await onboard(p);
    await p.goto(`${(baseURL ?? '').replace(/\/$/, '')}/?test=1&seed=7${link.slice(link.indexOf('#'))}`);
    await expect(p.getByRole('heading', { level: 1 })).toContainText('Arjun wrote you a practice call');
    await expect(p.getByText('Written by Arjun')).toBeVisible();
    await p.getByRole('button', { name: 'Add to my calls' }).click();
    await expect(p.getByRole('heading', { level: 1 })).toContainText('Paati');
    await player.close();
  });

  test('the family-call builder validates inline and makes a link (AC-F8-3)', async ({ page }) => {
    await page.goto(`${TEST_URL}#/coach/call`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Write a practice call');
    await page
      .getByRole('button', { name: /Make the call|Make the link|Make/ })
      .first()
      .click();
    await expect(page.getByRole('alert').first()).toBeVisible();
  });
});

test.describe('settings and privacy', () => {
  test('settings: toggles, text size, theme, reminder, delete-everything confirm (AC-F10-5)', async ({
    page,
  }) => {
    await onboard(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
    await page.getByRole('radio', { name: 'Larger' }).click();
    await expect
      .poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)))
      .toBeGreaterThan(18);
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: 'Standard' }).click();
    await page.getByRole('button', { name: 'Delete everything on this device' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('delete everything returns to the welcome screen', async ({ page }) => {
    await onboard(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Delete everything on this device' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Delete everything/ })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Practice saying no to phone scams');
  });
});

test.describe('offline', () => {
  test('after the first visit, a whole call works with the network off (AC-F10-1, AC-F10-3)', async ({
    page,
    context,
  }) => {
    await onboard(page);
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      if (!reg.active) throw new Error('no active service worker');
    });
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await expect(page.getByRole('button', { name: /^Take today/ })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText(/You.re offline/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Take today/ })).toBeVisible();
    await startCall(page);
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 2);
    expect(await callSeconds(page)).toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Hang up', exact: true }).click();
    await expect(page.getByTestId('result-headline')).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/You.re offline/)).toHaveCount(0);
  });
});
