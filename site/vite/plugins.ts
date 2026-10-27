import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QRCode from 'qrcode';
import type { Plugin } from 'vite';

const root = resolve(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(resolve(root, 'src/demo/scenarios.json'), 'utf8')) as Scenarios;

interface Plan {
  id: string;
  startMs: number;
  endMs: number;
  cueMs: number;
}
interface Line {
  id: string;
  text: string;
  speaker: string;
  tactics: string[];
}
interface Scenario {
  caller: { display: string; number: string };
  lines: Line[];
  plan: Plan[];
  markers: { tFlagMs: number | null; tAskMs: number | null; tEndMs: number };
  advice: string;
  callback: { label: string };
}
interface Scenarios {
  s01: Scenario;
  l01: Scenario;
  tacticLabels: Record<string, string>;
}

/** Configuration read at build time. Nothing here is a secret. */
export interface SiteConfig {
  appUrl: string;
  repoUrl: string | undefined;
  siteUrl: string | undefined;
}
export function readConfig(env: NodeJS.ProcessEnv): SiteConfig {
  return {
    appUrl: env.SITE_APP_URL || '/app/',
    repoUrl: env.SITE_REPO_URL || undefined,
    siteUrl: env.SITE_URL || undefined,
  };
}

const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
};
const pct = (ms: number, domain: number): string =>
  `${(Math.round((ms / domain) * 1000) / 10).toString()}%`;

/* ── icons (Lucide, ISC) read from lucide-static ──────────────────────── */
const iconCache = new Map<string, string>();
function iconInner(name: string): string {
  let v = iconCache.get(name);
  if (v === undefined) {
    const svg = readFileSync(resolve(root, 'node_modules/lucide-static/icons', `${name}.svg`), 'utf8');
    v = svg
      .replace(/^[\s\S]*?<svg[^>]*>/, '')
      .replace(/<\/svg>[\s\S]*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    iconCache.set(name, v);
  }
  return v;
}
export function icon(name: string, size = 24): string {
  const cls = size === 24 ? 'icon' : `icon icon-${String(size)}`;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconInner(name)}</svg>`;
}

/* ── the coiled handset cord: one 1.75px monoline (DESIGN.md Shapes → Motif) ─ */
export function cord(width = 96): string {
  const rx = 9; // loop half-width
  const ry = 5.5; // loop half-height
  const pitch = 7; // how far each turn advances
  const h = 2 * ry + 4;
  const loops = Math.max(2, Math.round((width - 2 * rx) / pitch));
  const k = (width - 2 * rx) / (2 * Math.PI * loops);
  const steps = loops * 24;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI * loops;
    const x = rx + k * t - rx * Math.cos(t) + rx;
    const y = h / 2 + ry * Math.sin(t);
    pts.push(`${i === 0 ? 'M' : 'L'}${(x - rx).toFixed(1)} ${y.toFixed(1)}`);
  }
  return `<svg class="cord" viewBox="0 0 ${String(width)} ${String(h)}" width="${String(width)}" height="${String(h)}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${pts.join('')}"/></svg>`;
}

/* ── QR (build-time, no runtime library) ──────────────────────────────── */
export function qrSvg(text: string): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const q = 2;
  let d = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (qr.modules.get(x, y)) {
        let w = 1;
        while (x + w < n && qr.modules.get(x + w, y)) w++;
        d += `M${String(x + q)} ${String(y + q)}h${String(w)}v1h-${String(w)}z`;
        x += w;
      } else x++;
    }
  }
  const size = n + 2 * q;
  return `<svg class="qr" viewBox="0 0 ${String(size)} ${String(size)}" shape-rendering="crispEdges" role="img" aria-label="QR code that opens Hang Up Club"><path fill="currentColor" d="${d}"/></svg>`;
}

/* ── the Timeline component (DESIGN.md Components → Timeline) ──────────── */
interface TlFlag {
  ms: number;
  tactic: string;
}
interface TlOpts {
  id: string;
  domainMs: number;
  youMs: number;
  askMs: number | null;
  youWord: string;
  youIcon: string;
  flags: TlFlag[];
}
const TACTIC_ICON: Record<string, string> = {
  urgency: 'clock',
  authority: 'landmark',
  fear: 'triangle-alert',
  isolation: 'phone-off',
  'code-request': 'key-round',
};
function timeline(o: TlOpts): string {
  const you = pct(o.youMs, o.domainMs);
  const ask = o.askMs === null ? null : pct(o.askMs, o.domainMs);
  const ticks: string[] = [];
  for (let s = 0; s * 1000 <= o.domainMs; s += 10) {
    ticks.push(
      `<span class="tl__scale-n mono-number" style="--at:${pct(s * 1000, o.domainMs)}" data-first="${String(s === 0)}">${clock(s * 1000)}</span>`,
    );
  }
  const flags = o.flags
    .map(
      (f) =>
        `<span class="tl__flag" style="--at:${pct(f.ms, o.domainMs)}" data-anim="flag"><i class="tl__flag-tick"></i>${icon(TACTIC_ICON[f.tactic] ?? 'flag', 20)}</span>`,
    )
    .join('');
  const sr = [
    ...o.flags.map((f) => `<li>${clock(f.ms)}: ${data.tacticLabels[f.tactic] ?? f.tactic}</li>`),
    `<li>${o.youWord} at ${clock(o.youMs)}</li>`,
    ...(o.askMs === null ? [] : [`<li>Their ask at ${clock(o.askMs)}</li>`]),
  ].join('');
  const youPos = parseFloat(you) < 14 ? 'start' : parseFloat(you) > 78 ? 'end' : 'mid';
  const askPos = ask !== null && parseFloat(ask) > 78 ? 'end' : 'mid';
  return `<div class="tl" id="${o.id}" data-tl style="--you:${you};${ask === null ? '' : `--ask:${ask};`}" data-ask="${String(o.askMs !== null)}">
  <div class="tl__stage">
    <div class="tl__label tl__label--you" data-pos="${youPos}" data-anim="you-label"><span class="meta" data-tl-word>${o.youWord}</span><span class="mono-number" data-tl-you>${clock(o.youMs)}</span></div>
    ${ask === null ? '' : `<div class="tl__label tl__label--ask" data-pos="${askPos}" data-anim="ask-label"><span class="meta">Their ask</span><span class="mono-number" data-tl-ask>${clock(o.askMs ?? 0)}</span></div>`}
    <span class="tl__stem" data-anim="you-stem"></span>
    <span class="tl__dot" data-anim="you-dot" data-tl-dot>${icon(o.youIcon, 20)}</span>
    ${ask === null ? '' : '<span class="tl__askbar" data-anim="ask-bar"></span>'}
    <div class="tl__track" data-anim="track"><span class="tl__fill" data-anim="fill"></span>${ask === null ? '' : '<span class="tl__gift" data-anim="gift"></span>'}</div>
    ${flags}
    <div class="tl__scale" aria-hidden="true">${ticks.join('')}</div>
  </div>
  <ol class="sr-only">${sr}</ol>
</div>`;
}

const s01 = data.s01;
const askLine = s01.lines.find((l) => l.id === 'ask');
export const HERO_HANG_MS = 13000;
/** Tick marks: the cue second of the first two tactic-bearing lines before the ask. */
const S01_FLAGS: TlFlag[] = [
  { ms: s01.plan.find((p) => p.id === 'warning')?.cueMs ?? 0, tactic: 'urgency' },
  { ms: s01.plan.find((p) => p.id === 'pressure')?.cueMs ?? 0, tactic: 'isolation' },
];

/** The replay transcript (DESIGN.md → Replay): time, speaker, line, tactic stamps. */
function replay(): string {
  return s01.plan
    .filter((p) => p.id !== 'hello' && p.id !== 'coda')
    .map((p) => {
      const line = s01.lines.find((l) => l.id === p.id);
      if (!line) return '';
      const isAsk = p.id === 'ask';
      const stamps = line.tactics
        .map(
          (t) =>
            `<li class="stamp">${icon(TACTIC_ICON[t] ?? 'flag', 20)}<span class="meta">${data.tacticLabels[t] ?? t}</span></li>`,
        )
        .join('');
      return `<li class="rp__row"${isAsk ? ' data-ask="true"' : ''}>
  <span class="mono-number rp__t">${clock(p.startMs)}</span>
  <div class="rp__body">
    <p class="meta rp__who">${line.speaker}${isAsk ? '<span class="rp__ask">' + icon('triangle-alert', 20) + 'Their ask</span>' : ''}</p>
    <p class="rp__line">${line.text}</p>
    ${stamps ? `<ul class="rp__stamps">${stamps}</ul>` : ''}
  </div>
</li>`;
    })
    .join('\n');
}

const templates: Record<string, () => string> = {
  replay,
  'timeline:screen': () =>
    timeline({
      id: 'tl-screen',
      domainMs: 35000,
      youMs: HERO_HANG_MS,
      askMs: s01.markers.tAskMs,
      youWord: 'You hung up',
      youIcon: 'check',
      flags: S01_FLAGS,
    }),
  'timeline:big': () =>
    timeline({
      id: 'tl-big',
      domainMs: 35000,
      youMs: HERO_HANG_MS,
      askMs: s01.markers.tAskMs,
      youWord: 'You hung up',
      youIcon: 'check',
      flags: S01_FLAGS,
    }),
  'timeline:legit': () =>
    timeline({
      id: 'tl-legit',
      domainMs: 25000,
      youMs: data.l01.markers.tEndMs,
      askMs: null,
      youWord: 'You stayed on',
      youIcon: 'check',
      flags: [],
    }),
};

/** Values the HTML and the scripts share, so copy never drifts from the data. */
export function facts(): Record<string, string> {
  return {
    hangClock: clock(HERO_HANG_MS),
    askClock: clock(s01.markers.tAskMs ?? 0),
    askQuote: (askLine?.text ?? '').split(/(?<=[.!?])\s/)[0] ?? '',
    callerName: s01.caller.display,
    callerNumber: s01.caller.number,
    callbackLabel: s01.callback.label,
    advice: s01.advice,
  };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function htmlTemplates(cfg: SiteConfig): Plugin {
  const f = facts();
  const abs = (p: string): string => (cfg.siteUrl ? new URL(p, cfg.siteUrl).href : p);
  const qrTarget = cfg.siteUrl
    ? new URL(cfg.appUrl, cfg.siteUrl).href
    : /^https?:/.test(cfg.appUrl)
      ? cfg.appUrl
      : `https://hangupclub.invalid${cfg.appUrl}`;
  return {
    name: 'huc-site-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html
          .replace(/\{\{icon:([a-z0-9-]+)(?::(\d+))?\}\}/g, (_m, name: string, size?: string) =>
            icon(name, size ? Number(size) : 24),
          )
          .replace(/\{\{cord:(\d+)\}\}/g, (_m, w: string) => cord(Number(w)))
          .replace(/\{\{qr\}\}/g, () => qrSvg(qrTarget))
          .replace(/\{\{(timeline:[a-z]+|replay)\}\}/g, (_m, k: string) => (templates[k] ?? (() => ''))())
          .replace(/\{\{fact:([a-zA-Z]+)\}\}/g, (_m, k: string) => f[k] ?? '')
          .replaceAll('{{app_url}}', cfg.appUrl)
          .replaceAll('{{csp}}', CSP)
          .replaceAll('{{og_image}}', abs('/og.jpg'))
          .replaceAll(
            '{{canonical}}',
            cfg.siteUrl ? `<link rel="canonical" href="${cfg.siteUrl}" />` : '',
          )
          .replaceAll('{{repo_href}}', cfg.repoUrl ?? '#run-it')
          .replaceAll('{{repo_label}}', cfg.repoUrl ? 'View the code on GitHub' : 'Run it from source')
          .replaceAll(
            '{{repo_source_link}}',
            cfg.repoUrl
              ? `<a href="${cfg.repoUrl}/blob/main/SPEC.md#5-scenario-library-and-source-mapping">the script library and its sources</a>`
              : 'the script library and its sources (in <code>scenarios/</code> and <code>SPEC.md</code>)',
          );
      },
    },
  };
}

/** Adds <link rel=preload> for the one critical font after Vite has hashed it. */
export function fontPreload(): Plugin {
  return {
    name: 'huc-font-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const names = Object.keys(ctx.bundle ?? {});
        const hit = names.find((n) => /atkinson-hyperlegible-next-latin-wght-normal.*\.woff2$/.test(n));
        if (!hit) return html;
        const tag = `<link rel="preload" href="./${hit}" as="font" type="font/woff2" crossorigin />`;
        return html.replace('</head>', `    ${tag}\n  </head>`);
      },
    },
  };
}
