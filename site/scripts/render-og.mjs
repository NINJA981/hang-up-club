/**
 * Renders public/og.jpg (1200 x 630) from the real page: the real result screen is captured from the
 * production build (reduced-motion path, so the call finishes without the shatter), and the headline
 * is set in DOM with the page's own tokens and webfont. No stock art, no invented numbers.
 *
 *   pnpm build && pnpm og
 */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const SITE = join(import.meta.dirname, '..');
const DIST = join(SITE, 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(DIST, p));
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile())
    return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();

// 1. Capture the real result screen.
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
});
const page = await ctx.newPage();
await page.goto(ORIGIN, { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.click('#pause');
await page.waitForFunction(() => document.getElementById('handset').dataset.state === 'result', null, {
  timeout: 15000,
});
await page.waitForTimeout(1500);
const shot = await page.locator('.handset__bezel').screenshot({ type: 'png' });
const head = await page.locator('#res-head').innerText();
const sub = await page.locator('#res-sub').innerText();
await ctx.close();

// 2. Compose the card.
const fonts = readdirSync(join(DIST, 'assets')).filter((n) => n.endsWith('.woff2'));
const sans = fonts.find((n) => n.includes('next'));
const mono = fonts.find((n) => n.includes('mono'));
const b64 = (n) => readFileSync(join(DIST, 'assets', n)).toString('base64');
const tokens = readFileSync(join(SITE, 'src', 'styles', 'tokens.css'), 'utf8').split(
  '/* ── Notebook, dark',
)[0];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${tokens}
@font-face{font-family:'Atkinson Hyperlegible Next Variable';font-weight:200 800;src:url(data:font/woff2;base64,${b64(sans)}) format('woff2')}
@font-face{font-family:'Atkinson Hyperlegible Mono Variable';font-weight:200 800;src:url(data:font/woff2;base64,${b64(mono)}) format('woff2')}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:var(--bg);color:var(--text);font-family:var(--font-sans);position:relative;overflow:hidden}
.in{position:absolute;inset:0;padding:64px 72px;display:grid;grid-template-columns:1fr 300px;gap:56px;align-items:center}
.word{position:absolute;left:72px;top:48px;font-weight:650;font-size:26px;letter-spacing:-0.01em}
h1{font-size:76px;line-height:.98;letter-spacing:-.035em;font-weight:650;margin-top:40px}
.sub{margin-top:28px;font-size:28px;line-height:1.3;color:var(--text-muted);max-width:660px}
.shot{height:540px;border-radius:30px;box-shadow:var(--shadow-e4)}
</style></head><body>
<div class="word">Hang Up Club</div>
<div class="in"><div>
<h1>Practise hanging up on scammers. Not on your pharmacy.</h1>
<p class="sub">One practice call a day. Some calls are real. Free, open source, no server.</p>
</div>
<img class="shot" src="data:image/png;base64,${shot.toString('base64')}"></div>
</body></html>`;
const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await card.setContent(html);
await card.evaluate(() => document.fonts.ready);
await card.waitForTimeout(300);
const jpg = await card.screenshot({ type: 'jpeg', quality: 82 });
writeFileSync(join(SITE, 'public', 'og.jpg'), jpg);
console.log(`public/og.jpg  ${(jpg.length / 1024).toFixed(1)} KB  (${head} ${sub})`);
await browser.close();
server.close();
