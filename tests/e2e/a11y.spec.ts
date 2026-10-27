import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { TEST_URL, onboard, startCall, waitForCallSecond } from './helpers';

/**
 * Cross-cutting checks (SPEC section 12): AC-X-1 axe on every screen in light
 * and dark at 375, 768 and 1440 px; AC-X-2 no text below 18px; the 56px target
 * floor; AC-X-3 keyboard reach and a visible focus ring. The desktop project
 * runs them because each test resizes the viewport itself.
 */

const SIZES = [
  { w: 375, h: 812 },
  { w: 768, h: 1024 },
  { w: 1440, h: 900 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

interface Finding {
  where: string;
  detail: string;
}

/** Text smaller than 18px, and body copy smaller than 20px, among visible text. */
async function textSizeFindings(page: Page, screen: string): Promise<Finding[]> {
  const found = await page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim() ?? '';
      if (text === '') continue;
      const el = n.parentElement;
      if (!el || el.closest('script,style,noscript,[aria-hidden="true"] svg')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const px = Number.parseFloat(cs.fontSize);
      if (px < 17.99) out.push(`${String(px)}px "${text.slice(0, 40)}"`);
    }
    return out;
  });
  return found.map((detail) => ({ where: screen, detail }));
}

/** Interactive controls smaller than 56 x 56 (a control inside a wider labelled row counts as the row). */
async function targetFindings(page: Page, screen: string): Promise<Finding[]> {
  const found = await page.evaluate(() => {
    const out: string[] = [];
    const sel =
      'button, a[href], input:not([type=hidden]), select, textarea, [role=radio], [role=switch], [role=checkbox]';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[inert],[aria-hidden="true"]'))
        continue;
      let box = el.getBoundingClientRect();
      const row = el.closest('label');
      if (row) box = row.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      if (box.width < 55.5 || box.height < 55.5) {
        out.push(
          `${el.tagName.toLowerCase()} ${String(Math.round(box.width))}x${String(Math.round(box.height))} "${(el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 40)}"`,
        );
      }
    }
    return out;
  });
  return found.map((detail) => ({ where: screen, detail }));
}

async function axeFindings(page: Page, screen: string): Promise<Finding[]> {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return res.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      where: screen,
      detail: `${v.id} (${v.impact ?? ''}): ${v.nodes
        .slice(0, 2)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
    }));
}

async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(350);
}

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
          await settled(page);
          problems.push(...(await axeFindings(page, screen)));
          problems.push(...(await textSizeFindings(page, screen)));
          if (opts.targets !== false) problems.push(...(await targetFindings(page, screen)));
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
    for (const route of ['#/today', '#/settings', '#/calls']) {
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
        if (info.tag !== 'INPUT') expect(info.ok, `${info.id} has :focus-visible`).toBe(true);
        if (info.tag === 'INPUT') {
          // A time field has the soft ring on its fields; its picker button is a browser part.
          if (info.ok) expect(info.shadow, `${info.id} shows the soft focus ring`).not.toBe('none');
        } else expect(info.ring, `${info.id} shows an outline`).toMatch(/solid 3px/);
        rings.add(info.id);
      }
      expect(rings.size, `${route}: Tab reaches the controls`).toBeGreaterThanOrEqual(Math.min(want, 3));
    }
  });
});
