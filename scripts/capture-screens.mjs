// Design QA: walks the real production build and saves a screenshot of every screen
// at 375, 768 and 1440 px in light and dark. Run `pnpm build`, start `pnpm preview`
// (or pass BASE), then `node scripts/capture-screens.mjs [--only=375:light] [--out=docs/screenshots]`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:4180';
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const OUT = args.out ?? 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { w: 375, h: 812 },
  { w: 768, h: 1024 },
  { w: 1440, h: 900 },
];
const THEMES = ['light', 'dark'];

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});

async function run({ w, h }, theme) {
  if (args.only && args.only !== `${String(w)}:${theme}`) return;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: w < 500 ? 2 : 1,
    colorScheme: theme,
    reducedMotion: args.reduced ? 'reduce' : 'no-preference',
    permissions: [],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    console.log('PAGEERROR', e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE', m.text());
  });
  const tag = `${String(w)}-${theme}`;
  const shot = async (name) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${name}-${tag}.png`) });
  };

  await page.goto(`${BASE}/?test=1&seed=7#/today`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await shot('01-welcome');

  await page.getByRole('button', { name: 'Set up for me' }).click();
  await shot('02-welcome-name');
  await page.getByRole('radio', { name: 'Paati' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await shot('03-welcome-sound');
  await page.getByRole('button', { name: 'No sound' }).click();
  await shot('04-welcome-nosound');
  await page.getByRole('button', { name: 'Yes, I hear it' }).click();
  await page.getByRole('button', { name: /Take today/ }).waitFor();
  await shot('05-today');

  await page.getByRole('button', { name: /Take today/ }).click();
  await page.getByTestId('the-line').waitFor();
  await page.getByRole('button', { name: 'Answer' }).waitFor();
  await shot('06-incoming');

  await page.getByRole('button', { name: 'Answer' }).click();
  await page.waitForTimeout(3500);
  await shot('07-incall');
  await page.waitForTimeout(Number(args.hang ?? 13000) - 3500);

  // The Cut: capture frames while it runs.
  await page
    .getByRole('button', { name: /^Hang up/ })
    .first()
    .click();
  const frames = args.frames ? [60, 180, 300, 500, 800] : [];
  let last = 0;
  for (const t of frames) {
    await page.waitForTimeout(t - last);
    last = t;
    await page.screenshot({ path: join(OUT, `08-cut-${String(t).padStart(4, '0')}-${tag}.png`) });
  }
  await page.getByTestId('result-headline').waitFor();
  await page.waitForTimeout(2600);
  await shot('09-result');

  await page.getByRole('button', { name: /See what gave it away/ }).click();
  await page.getByTestId('advice').waitFor();
  await shot('10-replay');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot('11-replay-end');

  await page.goto(`${BASE}/?test=1&seed=7#/calls`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await shot('12-calls');
  await page.goto(`${BASE}/?test=1&seed=7#/settings`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await shot('13-settings');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot('14-settings-end');

  await page.goto(`${BASE}/?test=1&seed=7#/coach`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await shot('15-coach');
  await page.goto(`${BASE}/?test=1&seed=7#/coach/call`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await shot('16-family-call');
  await page.goto(`${BASE}/?test=1&seed=7#/inbox`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await shot('17-inbox');
  await page.goto(`${BASE}/?test=1&seed=7#/join?d=garbage`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await shot('18-link-error');

  await ctx.close();
  await coachFlow({ w, h }, theme);
  await demoFlow({ w, h }, theme);
}

// The coach's phone: no profile, a fake microphone, then the setup link opened on a fresh player profile.
async function coachFlow({ w, h }, theme) {
  const tag = `${String(w)}-${theme}`;
  const open = (extra = {}) =>
    browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: w < 500 ? 2 : 1,
      colorScheme: theme,
      permissions: ['microphone', 'clipboard-read', 'clipboard-write'],
      ...extra,
    });
  const ctx = await open();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    console.log('PAGEERROR(coach)', e.message);
  });
  const shot = async (name) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${name}-${tag}.png`) });
  };
  await page.goto(`${BASE}/?test=1#/coach`);
  await page.getByRole('radio', { name: 'Paati' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Your name').fill('Arjun');
  await shot('20-coach-name');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await shot('21-coach-cheer');
  await page.getByRole('button', { name: 'Record a cheer' }).click();
  await page.waitForTimeout(500);
  await shot('22-coach-recording');
  await page.getByText('Cheer recorded').waitFor({ timeout: 6000 });
  await shot('23-coach-recorded');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await shot('24-coach-cats');
  await page.getByRole('button', { name: 'Make the setup link' }).click();
  await page.getByRole('heading', { name: 'Setup link ready' }).waitFor();
  await shot('25-coach-ready');
  await page.getByRole('button', { name: 'Copy', exact: true }).first().click();
  await shot('26-coach-copied');
  const joinUrl = await page.evaluate(() => navigator.clipboard.readText());
  await ctx.close();

  // The player opens it.
  const ctx2 = await open();
  const p2 = await ctx2.newPage();
  await p2.goto(joinUrl.replace(/^https?:\/\/[^/]+/, BASE).replace('/#', '/?test=1#'));
  await p2.getByRole('heading', { level: 1 }).waitFor();
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: join(OUT, `27-join-${tag}.png`) });
  await ctx2.close();
}

for (const size of WIDTHS) for (const theme of THEMES) await run(size, theme);
await browser.close();

// The signature moment in demo mode (?demo=signature&seed=7): a frame strip of The Cut, then the settled result.
async function demoFlow({ w, h }, theme) {
  const tag = `${String(w)}-${theme}`;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: w < 500 ? 2 : 1,
    colorScheme: theme,
    reducedMotion: args.reduced ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    console.log('PAGEERROR(demo)', e.message);
  });
  await page.goto(`${BASE}/?demo=signature&seed=7#/today`);
  await page.getByRole('button', { name: /^Take today/ }).click();
  await page.getByRole('button', { name: 'Answer' }).click();
  await page.waitForTimeout(13500);
  // Real frames from the compositor (CDP screencast), picked at fixed offsets from the press.
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ t: f.metadata.timestamp ?? 0, data: f.data });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
  await page.waitForTimeout(150);
  const pressed = Date.now() / 1000;
  await page.getByRole('button', { name: 'Hang up', exact: true }).click();
  await page.waitForTimeout(2800);
  await cdp.send('Page.stopScreencast');
  const offsets = [0.03, 0.08, 0.15, 0.25, 0.35, 0.5, 0.7, 0.9, 1.1, 1.3, 1.6, 2.0, 2.4];
  offsets.forEach((o, i) => {
    const want = pressed + o;
    const best = frames.reduce((a, f) => (Math.abs(f.t - want) < Math.abs(a.t - want) ? f : a), frames[0]);
    if (best)
      writeFileSync(
        join(OUT, `30-cut-${String(i).padStart(2, '0')}-${tag}.jpg`),
        Buffer.from(best.data, 'base64'),
      );
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `31-cut-end-${tag}.png`) });
  await ctx.close();
}
