/*
 * The Cut (DESIGN.md → Signature component): the Line breaks into 14 seeded
 * shards and falls away to show the notebook underneath. Only transform and
 * opacity are animated, through the Web Animations API.
 */

type Pt = readonly [number, number];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLS = 3;
const ROWS = 5;

/** A jittered 3 x 5 grid, with the Hang Up button's cell merged with the one below it: 14 polygons. */
export function shardPolygons(seed = 7): Pt[][] {
  const rnd = mulberry32(seed);
  const v: Pt[][] = [];
  for (let r = 0; r <= ROWS; r++) {
    const row: Pt[] = [];
    for (let c = 0; c <= COLS; c++) {
      const edgeX = c === 0 || c === COLS;
      const edgeY = r === 0 || r === ROWS;
      const jx = edgeX ? 0 : (rnd() - 0.5) * 0.5 * (1 / COLS);
      const jy = edgeY ? 0 : (rnd() - 0.5) * 0.5 * (1 / ROWS);
      row.push([c / COLS + jx, r / ROWS + jy]);
    }
    v.push(row);
  }
  const at = (r: number, c: number): Pt => v[r]?.[c] ?? [0, 0];
  const quad = (r: number, c: number): Pt[] => [at(r, c), at(r, c + 1), at(r + 1, c + 1), at(r + 1, c)];
  const polys: Pt[][] = [];
  const MERGE_C = 1;
  const MERGE_R = 3;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c === MERGE_C && r === MERGE_R + 1) continue;
      if (c === MERGE_C && r === MERGE_R) {
        polys.push([at(r, c), at(r, c + 1), at(r + 1, c + 1), at(r + 2, c + 1), at(r + 2, c), at(r + 1, c)]);
      } else polys.push(quad(r, c));
    }
  }
  return polys;
}

const centroid = (p: readonly Pt[]): Pt => [
  p.reduce((s, q) => s + q[0], 0) / p.length,
  p.reduce((s, q) => s + q[1], 0) / p.length,
];

export interface ShatterOptions {
  /** Centre of the Hang Up button in screen pixels. */
  origin: { x: number; y: number };
  width: number;
  height: number;
}

/**
 * Clone the Line into one shard per polygon and drop them. Returns the running
 * animations so the caller can pause, finish or await them.
 */
export function shatter(host: HTMLElement, line: HTMLElement, o: ShatterOptions): Animation[] {
  const rnd = mulberry32(11);
  host.replaceChildren();
  const polys = shardPolygons(7);
  const anims: Animation[] = [];
  const maxDist = Math.hypot(o.width, o.height);
  for (const poly of polys) {
    const shard = document.createElement('div');
    shard.className = 'shard';
    shard.style.clipPath = `polygon(${poly.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(',')})`;
    const copy = line.cloneNode(true) as HTMLElement;
    copy.removeAttribute('id');
    copy.removeAttribute('aria-label');
    copy.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    copy.querySelectorAll('button').forEach((b) => b.setAttribute('tabindex', '-1'));
    shard.append(copy);
    host.append(shard);

    const [cx, cy] = centroid(poly);
    const dist = Math.hypot(cx * o.width - o.origin.x, cy * o.height - o.origin.y) / maxDist;
    const rot = (8 + rnd() * 17) * (rnd() < 0.5 ? -1 : 1);
    const dx = (rnd() * 2 - 1) * 40;
    const duration = 520 + rnd() * 240;
    shard.style.transformOrigin = `${(cx * 100).toFixed(1)}% ${(cy * 100).toFixed(1)}%`;
    anims.push(
      shard.animate(
        [
          { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 },
          {
            transform: `translate(${dx.toFixed(1)}px, ${(o.height * 1.1).toFixed(0)}px) rotate(${rot.toFixed(1)}deg)`,
            opacity: 1,
          },
        ],
        {
          duration,
          delay: 40 + dist * 120,
          easing: 'cubic-bezier(0.55, 0, 1, 0.45)',
          fill: 'both',
        },
      ),
    );
  }
  return anims;
}

/* ── confetti: at most 60 particles, drawn from the Hang Up button, never red ── */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
}

export function confetti(
  canvas: HTMLCanvasElement,
  origin: { x: number; y: number },
  colors: string[],
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);
  const rnd = mulberry32(23);
  const parts: Particle[] = Array.from({ length: 60 }, (_, i) => {
    const angle = ((90 + (rnd() - 0.5) * 70) * Math.PI) / 180;
    const speed = 9 + rnd() * 9;
    return {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      w: 6 + rnd() * 5,
      h: 4 + rnd() * 4,
      rot: rnd() * Math.PI * 2,
      vr: (rnd() - 0.5) * 0.4,
      color: colors[i % colors.length] ?? 'currentColor',
    };
  });
  const LIFE = 1200;
  let start = 0;
  let last = 0;
  let raf = 0;
  const frame = (now: number): void => {
    if (!start) {
      start = now;
      last = now;
    }
    const age = now - start;
    const k = Math.min(3, (now - last) / 16.67);
    last = now;
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const p of parts) {
      p.vy += 0.5 * k;
      p.vx *= Math.pow(0.99, k);
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.rot += p.vr * k;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, (LIFE - age) / (LIFE * 0.4)));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (age < LIFE) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, rect.width, rect.height);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, rect.width, rect.height);
  };
}
