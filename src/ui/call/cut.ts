import { rngFrom, type Rng } from '../../domain/schedule/rng';
import type { Moment } from '../../domain/scoring/score';
import { tokenToRgb } from '../color';

/**
 * The Cut (DESIGN.md Signature component). The Line is frozen, cloned into 14
 * shards clipped by seeded polygons, and the shards fall away to show the
 * result that is already mounted underneath. Only transform and opacity are
 * animated (WAAPI). Confetti is lazy-loaded and capped at 60 particles.
 */

const COLS = 3;
const ROWS = 5;
export const SHARD_COUNT = 14;

export interface Point {
  x: number;
  y: number;
}

/**
 * A jittered 3 x 5 grid. The two vertically adjacent cells in the centre
 * column nearest the Hang up button merge, so 15 cells become 14 shards.
 * The jitter is seeded from the profile id, so each person's break is the same every day.
 */
export function shardPolygons(seed: string): Point[][] {
  const rng: Rng = rngFrom('shards', seed);
  const v: Point[][] = [];
  for (let r = 0; r <= ROWS; r++) {
    const row: Point[] = [];
    for (let c = 0; c <= COLS; c++) {
      const edgeX = c === 0 || c === COLS;
      const edgeY = r === 0 || r === ROWS;
      const jx = edgeX ? 0 : (rng() - 0.5) * 12;
      const jy = edgeY ? 0 : (rng() - 0.5) * 8;
      row.push({ x: (c / COLS) * 100 + jx, y: (r / ROWS) * 100 + jy });
    }
    v.push(row);
  }
  const at = (r: number, c: number): Point => {
    const p = v[r]?.[c];
    if (!p) throw new RangeError('grid index');
    return p;
  };
  const cells: Point[][] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // The merged shard replaces cells (3,1) and (4,1).
      if (c === 1 && r === 4) continue;
      if (c === 1 && r === 3) {
        cells.push([at(3, 1), at(3, 2), at(4, 2), at(5, 2), at(5, 1), at(4, 1)]);
        continue;
      }
      cells.push([at(r, c), at(r, c + 1), at(r + 1, c + 1), at(r + 1, c)]);
    }
  }
  return cells;
}

function centroid(poly: readonly Point[]): Point {
  const n = poly.length;
  return {
    x: poly.reduce((a, p) => a + p.x, 0) / n,
    y: poly.reduce((a, p) => a + p.y, 0) / n,
  };
}

export interface CutOptions {
  /** The element to break (the Line). It is hidden once the shards exist. */
  root: HTMLElement;
  /** Where the press happened, in viewport pixels. */
  origin: Point;
  moment: Moment;
  reducedMotion: boolean;
  seed: string;
}

export interface CutHandle {
  finished: Promise<void>;
  /** Any tap jumps to the end state. */
  skip(): void;
}

/** Build the shard layer and run it. Resolves when the Line is gone. */
export function playCut(o: CutOptions): CutHandle {
  const { root } = o;
  const done = (): void => {
    root.style.visibility = 'hidden';
  };

  // The crossfade: stayed, missed, caught, and reduced motion (150ms, --dur-2).
  if (o.moment === 'fade' || o.reducedMotion) {
    const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 150,
      easing: 'ease-out',
      fill: 'forwards',
    });
    const finished = fade.finished.then(done).catch(done);
    return {
      finished,
      skip() {
        fade.finish();
      },
    };
  }

  const rect = root.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('inert', '');
  layer.style.cssText = 'position:fixed;inset:0;z-index:var(--z-shatter);pointer-events:none;overflow:hidden';

  const polys = shardPolygons(o.seed);
  const rng = rngFrom('fall', o.seed);
  const originPct: Point = {
    x: ((o.origin.x - rect.left) / Math.max(1, rect.width)) * 100,
    y: ((o.origin.y - rect.top) / Math.max(1, rect.height)) * 100,
  };
  const maxDist = Math.hypot(100, 100);
  const fallPx = window.innerHeight * 1.1;
  const animations: Animation[] = [];

  for (const poly of polys) {
    const shard = document.createElement('div');
    const c = centroid(poly);
    shard.style.cssText = [
      'position:absolute',
      'inset:0',
      `clip-path:polygon(${poly.map((p) => `${p.x.toFixed(2)}% ${p.y.toFixed(2)}%`).join(',')})`,
      `transform-origin:${c.x.toFixed(1)}% ${c.y.toFixed(1)}%`,
      'will-change:transform',
    ].join(';');
    const clone = root.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    for (const el of clone.querySelectorAll('[id]')) el.removeAttribute('id');
    for (const el of clone.querySelectorAll('[autofocus],[tabindex]')) el.removeAttribute('tabindex');
    clone.style.position = 'absolute';
    clone.style.inset = '0';
    clone.style.zIndex = 'auto';
    clone.style.visibility = 'visible';
    shard.appendChild(clone);
    layer.appendChild(shard);

    const dist = Math.hypot(c.x - originPct.x, c.y - originPct.y) / maxDist;
    const delay = 40 + dist * 120;
    const duration = 520 + rng() * 240;
    const dir = rng() < 0.5 ? -1 : 1;
    const rotate = dir * (8 + rng() * 17);
    const dx = dir * rng() * 40;
    animations.push(
      shard.animate(
        [
          { transform: 'translate(0px, 0px) rotate(0deg)' },
          {
            transform: `translate(${dx.toFixed(1)}px, ${fallPx.toFixed(0)}px) rotate(${rotate.toFixed(1)}deg)`,
          },
        ],
        { duration, delay, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'both' },
      ),
    );
  }

  document.body.appendChild(layer);
  done(); // the original is hidden the same frame the shards appear

  const settle = Promise.all(animations.map((a) => a.finished.catch(() => undefined))).then(() => {
    layer.remove();
  });

  if (o.moment === 'cut') void burst(o.origin);

  return {
    finished: settle,
    skip() {
      for (const a of animations) a.finish();
    },
  };
}

/** Confetti from the press point: 60 particles, no red (DESIGN.md Signature). */
async function burst(origin: Point): Promise<void> {
  const { default: confetti } = await import('canvas-confetti');
  const colors = [
    '--accent',
    '--call-answer',
    '--accent-soft',
    '--surface-2',
    '--border-strong',
    '--call-text',
  ].map((t) => tokenToRgb(t));
  void confetti({
    particleCount: 60,
    spread: 70,
    startVelocity: 38,
    gravity: 1.1,
    ticks: 160,
    origin: { x: origin.x / window.innerWidth, y: origin.y / window.innerHeight },
    colors,
    disableForReducedMotion: true,
    zIndex: 95,
  });
}
