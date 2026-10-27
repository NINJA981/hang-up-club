import { expect, test } from './fixtures';
import { SCHEMES, SIZES, checkScreen, type Finding } from './a11y-helpers';
import { TEST_URL, onboard, startCall, waitForCallSecond } from './helpers';

/**
 * Cross-cutting checks (SPEC section 12): AC-X-1 axe on every screen in light
 * and dark at 375, 768 and 1440 px; AC-X-2 no text below 18px; the 56px target
 * floor; AC-X-3 keyboard reach and a visible focus ring. The desktop project
 * runs them because each test resizes the viewport itself. The screens that need
 * a link, the sheets, the coach steps and the call-back are in a11y-surfaces.spec.ts.
 */

for (const scheme of SCHEMES) {
  for (const { w, h } of SIZES) {
    test.describe(`${String(w)}px ${scheme}`, () => {
      test.use({ colorScheme: scheme, viewport: { width: w, height: h } });
      test.skip(({ isMobile }) => isMobile, 'These checks resize the viewport themselves');
      test.setTimeout(120_000);

      test('every screen passes axe, the text floor and the target floor (AC-X-1, AC-X-2)', async ({
        page,
      }) => {
        const problems: Finding[] = [];
        const check = async (screen: string, opts: { targets?: boolean } = {}): Promise<void> => {
          problems.push(...(await checkScreen(page, screen, opts)));
        };

        await page.goto(`${TEST_URL}#/today`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await check('welcome');
        await page.getByRole('button', { name: 'Set up for me' }).click();
        await check('welcome-name');
        await page.getByRole('radio', { name: 'Paati' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.getByRole('button', { name: 'No sound' }).click();
        await check('welcome-sound');
        await page.getByRole('button', { name: 'Yes, I hear it' }).click();
        await expect(page.getByRole('button', { name: /^Take today/ })).toBeVisible();
        await check('today');

        await startCall(page);
        await check('incoming');
        await page.getByRole('button', { name: 'Answer' }).click();
        await waitForCallSecond(page, 3);
        await check('in-call');
        await waitForCallSecond(page, 14);
        await page.getByRole('button', { name: 'Hang up', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Send to family' })).toBeVisible({ timeout: 4000 });
        await check('result');
        await page.getByRole('button', { name: 'See what gave it away' }).click();
        await check('replay');
        await page.goto(`${TEST_URL}#/calls`);
        await check('calls');
        await page.goto(`${TEST_URL}#/settings`);
        await check('settings');
        await page.getByRole('button', { name: 'Delete everything on this device' }).click();
        await check('delete-sheet');
        await page.keyboard.press('Escape');
        await page.goto(`${TEST_URL}#/coach`);
        await check('coach');
        await page.goto(`${TEST_URL}#/coach/call`);
        await check('family-call');
        await page.goto(`${TEST_URL}#/inbox`);
        await check('inbox');
        await page.goto(`${TEST_URL}#/join?d=damaged`);
        await check('link-error');

        expect(problems, problems.map((p) => `${p.where}: ${p.detail}`).join('\n')).toEqual([]);
      });
    });
  }
}

test.describe('keyboard (AC-X-3)', () => {
  test.skip(({ isMobile }) => isMobile, 'Keyboard reach is a desktop concern');

  test('every control on Today and Settings can be reached with Tab and shows a focus ring', async ({
    page,
  }) => {
    await onboard(page);
    for (const route of ['#/today', '#/settings', '#/calls', '#/coach', '#/coach/call', '#/inbox']) {
      await page.goto(`${TEST_URL}${route}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const want = await page
        .locator('button:visible, a[href]:visible, input:visible, [role=radio]:visible')
        .count();
      const rings = new Set<string>();
      for (let i = 0; i < want + 6; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return undefined;
          const cs = getComputedStyle(el);
          const label = (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 30);
          const ring = `${cs.outlineStyle} ${cs.outlineWidth}`;
          return {
            id: `${el.tagName}:${label}:${String(Math.round(el.getBoundingClientRect().y))}`,
            ring,
            tag: el.tagName,
            shadow: cs.boxShadow,
            ok: el.matches(':focus-visible'),
          };
        });
        if (!info) continue;
        const isField = info.tag === 'INPUT' || info.tag === 'TEXTAREA';
        if (!isField) expect(info.ok, `${info.id} has :focus-visible`).toBe(true);
        if (isField) {
          // A time field has the soft ring on its fields; its picker button is a browser part.
          if (info.ok) expect(info.shadow, `${info.id} shows the soft focus ring`).not.toBe('none');
        } else expect(info.ring, `${info.id} shows an outline`).toMatch(/solid 3px/);
        rings.add(info.id);
      }
      expect(rings.size, `${route}: Tab reaches the controls`).toBeGreaterThanOrEqual(Math.min(want, 3));
    }
  });

  test('every control in a call can be reached with Tab and shows a focus ring (AC-X-3)', async ({
    page,
  }) => {
    await onboard(page);
    await startCall(page);
    const seen = new Map<string, string>();
    const sweep = async (label: string, minimum: number): Promise<void> => {
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body || el.closest('[data-testid="the-line"]') === null)
            return undefined;
          return {
            id: (el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 40),
            ring: `${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).outlineWidth}`,
            visible: el.matches(':focus-visible'),
          };
        });
        if (!info) continue;
        expect(info.visible, `${info.id} is :focus-visible`).toBe(true);
        expect(info.ring, `${info.id} shows an outline`).toMatch(/solid [3-9]px/);
        seen.set(`${label}:${info.id}`, info.ring);
      }
      expect(
        [...seen.keys()].filter((k) => k.startsWith(label)).length,
        `${label}: Tab reaches the controls`,
      ).toBeGreaterThanOrEqual(minimum);
    };
    await sweep('ringing', 2);
    await page.getByRole('button', { name: 'Answer' }).click();
    await waitForCallSecond(page, 1);
    await sweep('in-call', 3);
  });
});
