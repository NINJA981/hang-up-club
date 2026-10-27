/**
 * End-to-end checks against the production build in dist/ (serves it from a tiny
 * static server on a random port, so it never collides with another project).
 *
 *   pnpm build && pnpm verify
 *
 * Writes screenshots to qa/ (tier-0 / reduced-motion / no-JS paths, desktop and phone).
 * Exits 1 if any check fails. Needs Playwright's Chromium (pnpm exec playwright install chromium).
 */
import AxeBuilder from '@axe-core/playwright';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const DIST = join(import.meta.dirname, '..', 'dist');
const QA = join(import.meta.dirname, '..', 'qa');
mkdirSync(QA, { recursive: true });
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(DIST, p));
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();

async function open(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...opts,
  });
  const page = await ctx.newPage();
  const requests = [];
  const errors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, requests, errors };
}

/* ── 1. desktop: poster-first, LCP = H1, CLS 0, no third party ─────────── */
{
  const { ctx, page, requests, errors } = await open();
  await page.addInitScript(() => {
    window.__lcp = null;
    window.__cls = 0;
    new PerformanceObserver((l) => {
      const e = l.getEntries().at(-1);
      window.__lcp = { tag: e.element?.tagName, t: Math.round(e.startTime) };
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(ORIGIN, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const lcp = await page.evaluate(() => window.__lcp);
  const cls = await page.evaluate(() => window.__cls);
  check('LCP element is the H1', lcp?.tag === 'H1', JSON.stringify(lcp));
  check('CLS < 0.001 (0.00 at two decimals)', cls < 0.001, String(cls));
  check('no off-origin request', requests.every((u) => u.startsWith(ORIGIN) || u.startsWith('data:')), requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:')).join(' '));
  check('no console errors', errors.length === 0, errors.join(' | '));
  check('CSP meta present', (await page.locator('meta[http-equiv="Content-Security-Policy"]').count()) === 1);
  check('exactly one h1', (await page.locator('h1').count()) === 1);
  const sound = requests.filter((u) => u.includes('/audio/'));
  check('no audio fetched before Sound is turned on', sound.length === 0, sound.join(' '));
  await page.screenshot({ path: join(QA, 'desktop-hero.png') });
  const axe = await new AxeBuilder({ page }).analyze();
  check('axe: no violations (desktop, loop running)', axe.violations.length === 0, axe.violations.map((v) => `${v.id}:${v.nodes.length}`).join(' '));
  await ctx.close();
}

/* ── 1b. worst case for layout shift: the webfont arrives 700 ms late ──── */
{
  const { ctx, page } = await open();
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.route('**/*.woff2', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  await page.goto(ORIGIN, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const cls = await page.evaluate(() => window.__cls);
  check('CLS < 0.001 even when the webfont arrives 700 ms late (metric-matched fallback)', cls < 0.001, String(cls));
  await ctx.close();
}

/* ── 2. widths: no horizontal scroll, call screen content fits ─────────── */
for (const w of [320, 375, 768, 1024, 1920]) {
  const { ctx, page } = await open({ viewport: { width: w, height: 800 } });
  await page.goto(ORIGIN, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const m = await page.evaluate(() => {
    const line = document.getElementById('line');
    const caps = document.getElementById('captions');
    return {
      sw: document.documentElement.scrollWidth,
      iw: innerWidth,
      lineFits: line.scrollHeight <= line.clientHeight + 1,
      capsFit: caps.scrollHeight <= caps.clientHeight + 1,
    };
  });
  check(`${w}px: no horizontal scroll`, m.sw <= m.iw, `${m.sw} vs ${m.iw}`);
  check(`${w}px: call screen content fits its frame`, m.lineFits, JSON.stringify(m));
  if (w === 375 || w === 320) await page.screenshot({ path: join(QA, `phone-${w}.png`) });
  await ctx.close();
}

/* ── 3. reduced motion: poster only until Play, then crossfade, no shards ─ */
{
  const { ctx, page } = await open({ reducedMotion: 'reduce' });
  await page.goto(ORIGIN, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => ({
    view: document.getElementById('handset').dataset.state,
    timer: document.getElementById('timer').textContent,
    label: document.getElementById('pause-label').textContent,
    transform: getComputedStyle(document.getElementById('handset')).transform,
  }));
  check('reduced motion: demo does not autoplay', state.view === 'incall' && state.timer === '0:09', JSON.stringify(state));
  check('reduced motion: offers Play', state.label === 'Play the demo');
  check('reduced motion: no resting tilt', state.transform === 'none', state.transform);
  await page.screenshot({ path: join(QA, 'reduced-motion-hero.png') });
  await page.click('#pause');
  let sawShards = false;
  for (let i = 0; i < 70; i++) {
    await page.waitForTimeout(100);
    if ((await page.locator('.shard').count()) > 0) sawShards = true;
  }
  const view = await page.evaluate(() => document.getElementById('handset').dataset.state);
  check('reduced motion: Play runs the call and ends on the result with no shards', view === 'result' && !sawShards, `${view} shards:${sawShards}`);
  await page.screenshot({ path: join(QA, 'reduced-motion-result.png') });
  await ctx.close();
}

/* ── 4. no JavaScript: the poster and every word of copy are there ─────── */
{
  const { ctx, page } = await open({ javaScriptEnabled: false });
  await page.goto(ORIGIN, { waitUntil: 'load' });
  const h1 = await page.locator('h1').innerText();
  const jsOnlyVisible = await page.locator('.js-only').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);
  check('no JS: H1 present', h1.startsWith('Practise hanging up on scammers.'));
  check('no JS: controls that need JS are hidden', jsOnlyVisible === 0, String(jsOnlyVisible));
  check('no JS: poster shows the call screen', await page.locator('#line').isVisible());
  await page.screenshot({ path: join(QA, 'no-js-hero.png') });
  await ctx.close();
}

/* ── 5. take the call: reply chip, Hang up after the first warning, result ─ */
{
  const { ctx, page, errors } = await open();
  await page.goto(ORIGIN, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#try-call');
  check('Try the call: starts at the ringing screen', (await page.locator('#handset').getAttribute('data-state')) === 'ringing');
  await page.click('#btn-answer');
  await page.waitForSelector('.chip', { timeout: 8000 });
  const chips = await page.locator('.chip').allInnerTexts();
  check('reply chips appear on the intro line', chips.join('|') === 'Who is this?|Go ahead', chips.join('|'));
  await page.click('.chip >> text=Who is this?');
  await page.waitForFunction(() => document.getElementById('cap-now').textContent.includes('fraud alert'), null, { timeout: 12000 });
  check('"Who is this?" branches to the verify line', true);
  await page.waitForFunction(() => document.getElementById('cap-now').textContent.includes('compromised'), null, { timeout: 14000 });
  await page.waitForTimeout(2300);
  await page.click('#btn-hangup');
  await page.waitForFunction(() => document.getElementById('handset').dataset.state === 'result', null, { timeout: 6000 });
  const head = await page.locator('#res-head').innerText();
  const sub = await page.locator('#res-sub').innerText();
  check('hanging up after the first warning, before the ask, scores "sharp"', /^Hung up at 0:\d\d\.$/.test(head) && /^The scammer needed 0:\d\d\.$/.test(sub), `${head} / ${sub}`);
  await page.waitForTimeout(2400);
  await page.screenshot({ path: join(QA, 'play-result-sharp.png') });
  check('result offers Try another call', await page.locator('#again').isVisible());
  // call back path
  await page.click('#again');
  await page.click('#btn-answer');
  await page.waitForFunction(() => document.getElementById('timer').textContent >= '0:02', null, { timeout: 8000 });
  await page.click('#btn-callback');
  await page.waitForFunction(() => document.getElementById('handset').dataset.state === 'ivr', null, { timeout: 4000 });
  await page.waitForFunction(() => document.getElementById('handset').dataset.state === 'result' || document.getElementById('handset').dataset.state === 'cut', null, { timeout: 12000 });
  await page.waitForTimeout(2400);
  const vhead = await page.locator('#res-head').innerText();
  check('calling the number on the card scores "verified"', vhead === 'You called the number on your card.', vhead);
  await page.screenshot({ path: join(QA, 'play-result-verified.png') });
  // jumpy path: hang up early
  await page.click('#again');
  await page.click('#btn-answer');
  await page.waitForTimeout(1500);
  await page.click('#btn-hangup');
  await page.waitForTimeout(3000);
  const jhead = await page.locator('#res-head').innerText();
  check('hanging up before any warning scores "jumpy"', jhead === 'You hung up before they gave anything away.', jhead);
  check('no console errors while playing', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ── 6. sound: nothing until asked; then only same-origin clips, <= 150 KB ─ */
{
  const { ctx, page, requests } = await open();
  await page.goto(ORIGIN, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#sound');
  await page.waitForFunction(() => document.getElementById('sound').getAttribute('aria-pressed') === 'true', null, { timeout: 8000 });
  const clips = requests.filter((u) => u.includes('/audio/demo/'));
  let bytes = 0;
  for (const u of new Set(clips)) {
    const r = await page.request.get(u);
    bytes += (await r.body()).length;
  }
  check('Sound on: only same-origin demo clips fetched', clips.length > 0 && clips.every((u) => u.startsWith(ORIGIN)), `${clips.length} requests`);
  check('Sound on: clips total <= 150 KB', bytes <= 150 * 1024, `${(bytes / 1024).toFixed(1)} KB`);
  await ctx.close();
}

/* ── 7. dark scheme: contrast and no leakage of light tokens ───────────── */
{
  const { ctx, page } = await open({ colorScheme: 'dark' });
  await page.goto(ORIGIN, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(QA, 'desktop-dark-hero.png') });
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  check('axe: no violations in dark scheme', axe.violations.length === 0, axe.violations.map((v) => `${v.id}:${v.nodes.length}`).join(' '));
  await ctx.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
