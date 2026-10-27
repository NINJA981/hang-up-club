/**
 * Generates public/contours.svg: a "field notes" topography drawn offline with
 * d3-contour from a seeded value-noise field (DESIGN.md Appendix B, T16).
 * Used as a CSS mask, so only the stroke's alpha matters; the page colours it
 * with the accent token at 6% (light) / 8% (dark).
 *
 *   node scripts/build-contours.mjs
 */
import { writeFileSync } from 'node:fs';
import { contours } from 'd3-contour';

const W = 1440;
const H = 900;
const N = 54; // grid columns
const M = Math.round((N * H) / W); // grid rows
const CELL = W / N;

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(2026);
const lattice = (n) => Array.from({ length: (n + 2) * (n + 2) }, () => rnd());
const smooth = (t) => t * t * (3 - 2 * t);
function noise(lat, n, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const g = (i, j) => lat[(j % (n + 2)) * (n + 2) + (i % (n + 2))];
  const a = g(xi, yi) * (1 - tx) + g(xi + 1, yi) * tx;
  const b = g(xi, yi + 1) * (1 - tx) + g(xi + 1, yi + 1) * tx;
  return a * (1 - ty) + b * ty;
}
const octaves = [
  { n: 4, amp: 1, lat: lattice(4) },
  { n: 9, amp: 0.5, lat: lattice(9) },
  { n: 18, amp: 0.2, lat: lattice(18) },
];
const values = new Float64Array(N * M);
for (let j = 0; j < M; j++) {
  for (let i = 0; i < N; i++) {
    let v = 0;
    for (const o of octaves) v += o.amp * noise(o.lat, o.n, (i / N) * o.n, (j / M) * o.n);
    values[j * N + i] = v;
  }
}
const min = Math.min(...values);
const max = Math.max(...values);
const levels = Array.from({ length: 12 }, (_, k) => min + ((k + 1) / 13) * (max - min));
const gen = contours().size([N, M]).smooth(true).thresholds(levels);
const f = (n) => (Math.round(n * CELL * 10) / 10).toString();
let d = '';
for (const mp of gen(values)) {
  for (const poly of mp.coordinates) {
    for (const ring of poly) {
      d += 'M' + ring.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
    }
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><path d="${d}" fill="none" stroke="#000" stroke-width="1.25" stroke-linejoin="round"/></svg>\n`;
writeFileSync(new URL('../public/contours.svg', import.meta.url), svg);
console.log(`contours.svg ${(svg.length / 1024).toFixed(1)} KB`);
