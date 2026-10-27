import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * The cross-cutting accessibility checks shared by every axe spec (SPEC section 12):
 * AC-X-1 axe, AC-X-2 no text below 18px, and the 56px target floor.
 */

export const SIZES = [
  { w: 375, h: 812 },
  { w: 768, h: 1024 },
  { w: 1440, h: 900 },
] as const;
export const SCHEMES = ['light', 'dark'] as const;

export interface Finding {
  where: string;
  detail: string;
}

/** Text smaller than 18px, and body copy smaller than 20px, among visible text (AC-X-2). */
export async function textSizeFindings(page: Page, screen: string): Promise<Finding[]> {
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
      // Body copy is at least 20px. Only the meta and keycap roles of the type scale are smaller (18px).
      else if (px < 19.99 && !el.closest('.text-meta, .text-keycap'))
        out.push(`body copy ${String(px)}px "${text.slice(0, 40)}"`);
    }
    return out;
  });
  return found.map((detail) => ({ where: screen, detail }));
}

/** Interactive controls smaller than 56 x 56 (a control inside a wider labelled row counts as the row). */
export async function targetFindings(page: Page, screen: string): Promise<Finding[]> {
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

export async function axeFindings(page: Page, screen: string): Promise<Finding[]> {
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

export async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(350);
}

/** Run every check on the current screen; the caller collects what comes back. */
export async function checkScreen(
  page: Page,
  screen: string,
  opts: { targets?: boolean } = {},
): Promise<Finding[]> {
  await settled(page);
  const out: Finding[] = [...(await axeFindings(page, screen)), ...(await textSizeFindings(page, screen))];
  if (opts.targets !== false) out.push(...(await targetFindings(page, screen)));
  return out;
}
