/**
 * Launch assets from the real production build: four phone screenshots (390 x 844 viewport, 2x) and the
 * 1280 x 640 social preview, written to docs/launch/. It serves dist/ itself, drives one Chromium, and
 * closes both when done, so no other server is needed:
 *
 *   pnpm build && node scripts/capture-launch.mjs
 *
 * The flow is the deterministic demo (`?demo=signature&seed=7`): S01 with a demo cheer, in a throw-away
 * database. Demo mode is silent, so nothing here depends on audio.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'docs', 'launch');
mkdirSync(OUT, { recursive: true });
if (!existsSync(join(DIST, 'index.html')))
  throw new Error('Run pnpm build first: dist/index.html is missing');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.txt': 'text/plain',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const address = server.address();
const BASE = `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}`;

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  const offOrigin = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:'))
      offOrigin.push(r.url());
  });
  page.on('pageerror', (e) => {
    console.log('PAGEERROR', e.message);
  });
  const shot = async (name) => {
    await page.screenshot({ path: join(OUT, name) });
    console.log('wrote', name);
  };

  await page.goto(`${BASE}/?demo=signature&seed=7#/today`);
  await page.getByRole('button', { name: /^Take today/ }).click();
  await page.getByRole('button', { name: 'Answer' }).waitFor();
  await page.waitForTimeout(1400);
  await shot('screen-1-incoming.png');

  await page.getByRole('button', { name: 'Answer' }).click();
  await page.getByText('Your account has been compromised').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1800);
  await shot('screen-2-in-call.png');

  await page.getByRole('button', { name: 'Hang up', exact: true }).click();
  await page.getByTestId('result-headline').waitFor();
  await page.waitForTimeout(3200);
  await shot('screen-3-result.png');

  await page.getByRole('button', { name: /See what gave it away/ }).click();
  await page.getByTestId('advice').waitFor();
  await page.waitForTimeout(1200);
  await shot('screen-4-replay.png');
  await ctx.close();

  if (offOrigin.length > 0) throw new Error(`Requests left the origin: ${offOrigin.join(', ')}`);

  // Social preview: the real screenshots above, set on the app's own paper colour and type.
  const b64 = (p) => readFileSync(p).toString('base64');
  const font = b64(
    join(
      ROOT,
      'node_modules/@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2',
    ),
  );
  const img = (n) => `data:image/png;base64,${b64(join(OUT, n))}`;
  const card = await browser.newContext({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  const p2 = await card.newPage();
  await p2.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: AHN; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 200 800; }
    * { margin: 0; box-sizing: border-box; }
    body { width: 1280px; height: 640px; overflow: hidden; background: oklch(0.985 0.004 110);
      color: oklch(0.24 0.012 120); font-family: AHN, system-ui, sans-serif; display: flex; }
    .copy { width: 640px; padding: 72px 0 64px 80px; display: flex; flex-direction: column; justify-content: space-between; }
    .mark { font-size: 30px; font-weight: 700; letter-spacing: -0.01em; color: oklch(0.48 0.1 140); }
    h1 { font-size: 60px; line-height: 1.02; font-weight: 650; letter-spacing: -0.03em; text-wrap: balance; }
    p { font-size: 26px; line-height: 1.35; color: oklch(0.44 0.012 120); max-width: 30ch; }
    .meta { font-size: 22px; color: oklch(0.44 0.012 120); }
    .phones { position: relative; flex: 1; }
    .phone { position: absolute; width: 264px; height: 571px; border-radius: 34px; overflow: hidden;
      border: 6px solid oklch(0.24 0.012 120); box-shadow: 0 24px 60px oklch(0.24 0.012 120 / 0.18); background: #000; }
    .phone img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
    .a { left: 36px; top: 54px; } .b { left: 330px; top: 24px; }
  </style></head><body>
    <div class="copy">
      <div class="mark">Hang Up Club</div>
      <div style="display:flex;flex-direction:column;gap:24px">
        <h1>A flight simulator for phone scams.</h1>
        <p>One practice call a day. Some calls are real, so you can&rsquo;t just hang up on everything.</p>
      </div>
      <div class="meta">Free, open source, offline. No account, no server.</div>
    </div>
    <div class="phones">
      <div class="phone a"><img src="${img('screen-1-incoming.png')}" alt=""></div>
      <div class="phone b"><img src="${img('screen-3-result.png')}" alt=""></div>
    </div>
  </body></html>`);
  await p2.evaluate(() => document.fonts.ready);
  await p2.screenshot({ path: join(OUT, 'social-preview.png') });
  console.log('wrote social-preview.png');
  await card.close();
} finally {
  await browser.close();
  server.close();
}
