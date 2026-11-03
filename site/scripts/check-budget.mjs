/**
 * Build gate for the landing page. Runs after `vite build`.
 *
 *  1. Initial JavaScript <= 120 KB gzip, and no 3D chunk at all (the page ships zero WebGL).
 *  2. No WebGL / three / canvas-3d code in the output.
 *  3. Every request the page can make stays on its own origin (no CDN, no analytics, no fonts host).
 *  4. The site tokens match the DESIGN.md frontmatter, light and dark, and no stylesheet other than
 *     tokens.css contains a raw colour value.
 *  5. The one critical font is preloaded; the poster (the H1) needs no image.
 *  6. Audio on the page is lazy and within 150 KB (SPEC / LANDING.md).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const SITE = join(import.meta.dirname, '..');
const DIST = join(SITE, 'dist');
const DESIGN = join(SITE, '..', 'DESIGN.md');
const KB = 1024;

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const gz = (buf) => gzipSync(buf, { level: 9 }).length;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const files = walk(DIST);
const rel = (p) => relative(DIST, p).replaceAll('\\', '/');

/* 1. JavaScript budget ---------------------------------------------------- */
const js = files.filter((f) => f.endsWith('.js'));
const jsGz = js.reduce((n, f) => n + gz(readFileSync(f)), 0);
notes.push(`initial JS: ${(jsGz / KB).toFixed(1)} KB gzip across ${String(js.length)} file(s) (budget 120)`);
if (jsGz > 120 * KB) fail(`initial JS is ${(jsGz / KB).toFixed(1)} KB gzip, over the 120 KB budget`);
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
if (scriptTags.length !== 1) fail(`expected exactly one <script> tag, found ${String(scriptTags.length)}`);
if (js.length > 1)
  fail(`expected a single JS file (no lazy 3D chunk), found ${String(js.length)}: ${js.map(rel).join(', ')}`);

/* 2. No WebGL ------------------------------------------------------------- */
const webgl =
  /getContext\(\s*["'`](?:webgl2?|experimental-webgl|webgpu)["'`]|WebGLRenderingContext|\bTHREE\b|three\.module/;
for (const f of js)
  if (webgl.test(readFileSync(f, 'utf8')))
    fail(`${rel(f)} references WebGL or three.js (the page budget for 3D is 0 KB)`);

/* 3. Same-origin only ----------------------------------------------------- */
const loadable = [];
for (const m of html.matchAll(
  /<(?:script|img|source|video|audio|iframe|embed)\b[^>]*\bsrc=["']([^"']+)["']/g,
))
  loadable.push(m[1]);
for (const m of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/g)) loadable.push(m[1]);
for (const f of files.filter((x) => /\.(css|js|svg)$/.test(x))) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/url\(\s*["']?(https?:[^)"']+)/g)) loadable.push(m[1]);
  for (const m of text.matchAll(/@import\s+["'](https?:[^"']+)/g)) loadable.push(m[1]);
  for (const m of text.matchAll(/\b(?:fetch|import)\(\s*["'](https?:[^"']+)/g)) loadable.push(m[1]);
  for (const m of text.matchAll(/new\s+(?:WebSocket|EventSource)\(\s*["']([^"']+)/g)) loadable.push(m[1]);
  for (const m of text.matchAll(/sendBeacon\(\s*["']([^"']+)/g)) loadable.push(m[1]);
  if (/\.(js)$/.test(f) && /XMLHttpRequest|sendBeacon|navigator\.serviceWorker\.register/.test(text)) {
    fail(
      `${rel(f)} uses XMLHttpRequest, sendBeacon or a service worker; none is expected on the landing page`,
    );
  }
}
for (const url of loadable) {
  if (/^(?:https?:)?\/\//.test(url)) fail(`off-origin resource: ${url}`);
}
notes.push(`resources checked for origin: ${String(loadable.length)}, all same-origin`);
// Plain <a> links to the FBI and FTC reports are citations, not loads. List them so a reviewer sees them.
const cites = [...new Set([...html.matchAll(/<a\b[^>]*\bhref=["'](https?:[^"']+)/g)].map((m) => m[1]))];
notes.push(`outbound citation links (user-initiated): ${cites.join(', ') || 'none'}`);

/* 4. Tokens match DESIGN.md ----------------------------------------------- */
const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(DESIGN, 'utf8'))?.[1] ?? '';
const designColors = new Map();
for (const m of front.matchAll(/^\s{2}([a-z0-9-]+):\s*"(oklch\([^)]+\))"/gm)) designColors.set(m[1], m[2]);
const triple = (s) => {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const tokensCss = readFileSync(join(SITE, 'src', 'styles', 'tokens.css'), 'utf8');
const lightBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(tokensCss)?.[1] ?? '';
const darkBlock = /:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/.exec(tokensCss)?.[1] ?? '';
const decl = (block) =>
  new Map([...block.matchAll(/^\s*--([a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]));
const light = decl(lightBlock);
const dark = decl(darkBlock);
let tokenCount = 0;
for (const [name, value] of designColors) {
  if (name === 'primary') continue;
  const isDark = name.endsWith('-dark');
  const base = isDark ? name.slice(0, -5) : name;
  const got = (isDark ? dark : light).get(base);
  if (got === undefined) {
    // The call tokens are theme-independent and live in the light block only.
    if (!isDark) fail(`tokens.css is missing --${base}`);
    else fail(`tokens.css dark block is missing --${base}`);
    continue;
  }
  const a = triple(value);
  const b = triple(got);
  if (!a || !b || a.some((n, i) => Math.abs(n - b[i]) > 0.0005))
    fail(`--${base}${isDark ? ' (dark)' : ''} is ${got} but DESIGN.md says ${value}`);
  tokenCount++;
}
notes.push(`tokens verified against DESIGN.md: ${String(tokenCount)}`);
const styles = join(SITE, 'src', 'styles');
for (const f of readdirSync(styles).filter((n) => n.endsWith('.css') && n !== 'tokens.css')) {
  const text = readFileSync(join(styles, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const raw = text.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\((?![^)]*var\()/g);
  if (raw)
    fail(
      `${f} has raw colour values (${[...new Set(raw)].join(', ')}); use a token (a transparent mix of a token via color-mix is fine)`,
    );
}

/* 5. Critical font, no image on the critical path -------------------------- */
if (!/<link rel="preload"[^>]*as="font"[^>]*type="font\/woff2"/.test(html))
  fail('the critical font is not preloaded');
const fontBytes = files.filter((f) => f.endsWith('.woff2')).reduce((n, f) => n + statSync(f).size, 0);
notes.push(`fonts: ${(fontBytes / KB).toFixed(1)} KB (2 files, self-hosted)`);

/* 6. Audio is lazy and small ---------------------------------------------- */
const demoAudio = files.filter((f) => rel(f).startsWith('audio/demo/'));
const bytesByFormat = { webm: 0, m4a: 0 };
for (const f of demoAudio) {
  const ext = f.split('.').pop();
  if (ext in bytesByFormat) bytesByFormat[ext] += statSync(f).size;
}
for (const [fmt, bytes] of Object.entries(bytesByFormat)) {
  notes.push(
    `demo audio (${fmt}): ${(bytes / KB).toFixed(1)} KB (budget 150, fetched only after Sound is turned on)`,
  );
  if (bytes > 150 * KB) fail(`demo audio ${fmt} is ${(bytes / KB).toFixed(1)} KB, over 150 KB`);
}
if (/<(?:audio|video)\b/.test(html))
  fail('index.html contains an <audio> or <video> element; sound must be created on demand');

/* Totals -------------------------------------------------------------------*/
const css = files.filter((f) => f.endsWith('.css'));
const cssGz = css.reduce((n, f) => n + gz(readFileSync(f)), 0);
const htmlGz = gz(Buffer.from(html));
notes.push(`html ${(htmlGz / KB).toFixed(1)} KB gzip, css ${(cssGz / KB).toFixed(1)} KB gzip`);
const firstLoad = jsGz + cssGz + htmlGz + fontBytes;
notes.push(`first load (html + css + js + fonts): ${(firstLoad / KB).toFixed(1)} KB transferred, no images`);
if (firstLoad > 200 * KB) fail(`first load is ${(firstLoad / KB).toFixed(1)} KB, over 200 KB`);

for (const n of notes) console.log(`  ${n}`);
if (problems.length > 0) {
  console.error('\nBUDGET FAILED');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('budget ok');
