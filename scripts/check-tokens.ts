/**
 * pnpm tokens:check  (ADR §5 Token CI)
 *
 *  1. src/ui/tokens.css matches the DESIGN.md frontmatter, light and dark.
 *  2. Every role pair meets its contrast target (AAA on the call screen).
 *  3. src/ has no off-token colour values, raw palette utilities or text under 18px.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { converter, formatHex, parse, wcagContrast } from 'culori';
import { parse as parseYaml } from 'yaml';
import { ROOT } from './lib/scenarios';

const design = readFileSync(join(ROOT, 'DESIGN.md'), 'utf8');
const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(design);
if (!front?.[1]) throw new Error('DESIGN.md has no frontmatter');
const colors = (parseYaml(front[1]) as { colors: Record<string, string> }).colors;

const css = readFileSync(join(ROOT, 'src', 'ui', 'tokens.css'), 'utf8');
const lightBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
const darkBlock = /:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';

function declarations(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of block.matchAll(/^\s*--([a-z0-9-]+):\s*([^;]+);/gm)) {
    if (m[1] && m[2]) map.set(m[1], m[2].trim());
  }
  return map;
}
const light = declarations(lightBlock);
const dark = declarations(darkBlock);
const toOklch = converter('oklch');

const problems: string[] = [];

function same(a: string, b: string): boolean {
  const ca = toOklch(parse(a));
  const cb = toOklch(parse(b));
  if (!ca || !cb) return false;
  const dh = Math.abs((ca.h ?? 0) - (cb.h ?? 0));
  return (
    Math.abs(ca.l - cb.l) < 0.001 &&
    Math.abs(ca.c - cb.c) < 0.001 &&
    (ca.c < 0.01 || Math.min(dh, 360 - dh) < 0.5)
  );
}

const ROLE =
  /^(bg|surface|surface-2|border|border-strong|text|text-muted|text-subtle|accent|accent-hover|on-accent|accent-soft|accent-text|danger|danger-soft|on-danger|warning|warning-soft|ring|call-[a-z0-9-]+|on-call-[a-z0-9-]+)$/;
let checked = 0;
for (const [name, value] of Object.entries(colors)) {
  if (name === 'primary') continue;
  const isDark = name.endsWith('-dark');
  const base = isDark ? name.slice(0, -5) : name;
  if (!ROLE.test(base)) continue;
  const css = (isDark ? dark : light).get(base);
  if (css === undefined) {
    problems.push(`tokens.css is missing --${base} (${isDark ? 'dark' : 'light'})`);
    continue;
  }
  checked++;
  if (!same(value, css))
    problems.push(`--${base} (${isDark ? 'dark' : 'light'}) is ${css}, DESIGN.md says ${value}`);
}

// Contrast targets from DESIGN.md: AA for the notebook, AAA for the call screen.
const pairs: { fg: string; bg: string; min: number; theme: 'light' | 'dark' | 'call' }[] = [];
for (const theme of ['light', 'dark'] as const) {
  for (const [fg, bg, min] of [
    ['text', 'bg', 7],
    ['text', 'surface', 7],
    ['text-muted', 'bg', 4.5],
    ['text-muted', 'surface', 4.5],
    ['text-subtle', 'bg', 4.5],
    ['on-accent', 'accent', 4.5],
    ['accent-text', 'bg', 4.5],
    ['on-danger', 'danger', 4.5],
    ['danger', 'bg', 4.5],
    ['warning', 'bg', 4.5],
  ] as const) {
    pairs.push({ fg, bg, min, theme });
  }
}
for (const [fg, bg, min] of [
  ['call-text', 'call-bg', 7],
  ['call-muted', 'call-bg', 7],
  ['call-text', 'call-surface', 7],
  ['on-call-answer', 'call-answer', 7],
  ['on-call-hangup', 'call-hangup', 4.5],
  ['call-answer', 'call-bg', 4.5],
] as const) {
  pairs.push({ fg, bg, min, theme: 'call' });
}
for (const p of pairs) {
  const table = p.theme === 'dark' ? dark : light;
  const f = table.get(p.fg);
  const b = table.get(p.bg);
  if (f === undefined || b === undefined) {
    problems.push(`contrast pair ${p.fg}/${p.bg} (${p.theme}) has an undefined token`);
    continue;
  }
  const ratio = wcagContrast(parse(f) ?? '#000', parse(b) ?? '#fff');
  if (ratio < p.min) {
    problems.push(`${p.fg} on ${p.bg} (${p.theme}) is ${ratio.toFixed(2)}:1, needs ${String(p.min)}:1`);
  }
}

// Source scan: no off-token values.
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const RAW_PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|black|white)(?:-\d{2,3})?\b/;
const SMALL_TEXT = /\btext-\[(\d+(?:\.\d+)?)px\]/g;
const RAW_COLOR_FN = /\b(?:rgb|rgba|hsl|hsla)\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(full);
  }
  return out;
}
for (const file of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  if (rel === 'src/ui/tokens.css') continue;
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      const where = `${rel}:${String(i + 1)}`;
      if (HEX.test(line)) problems.push(`${where}  hex colour (use a token)`);
      if (RAW_COLOR_FN.test(line)) problems.push(`${where}  raw rgb()/hsl() colour (use a token)`);
      if (RAW_PALETTE.test(line)) problems.push(`${where}  raw palette utility (use a role token)`);
      for (const m of line.matchAll(SMALL_TEXT)) {
        if (Number(m[1]) < 18) problems.push(`${where}  text-[${m[1] ?? ''}px] is below 18px`);
      }
    });
}

if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\n${String(problems.length)} token problem(s)`);
  process.exit(1);
}
console.log(
  `tokens OK: ${String(checked)} colours match DESIGN.md, ${String(pairs.length)} contrast pairs pass (${formatHex(parse('oklch(0.48 0.1 140)'))} accent)`,
);
