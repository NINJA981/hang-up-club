/**
 * Deterministic hashing and seeded randomness. No crypto strength is needed:
 * these only make daily selection reproducible per device per day.
 */

/**
 * cyrb53: a fast 53-bit string hash with good avalanche behaviour.
 * Returns a non-negative safe integer.
 */
export function hash53(input: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** 14-character, zero-padded base-16 form of {@link hash53}. */
export function hash53Hex(input: string, seed = 0): string {
  return hash53(input, seed).toString(16).padStart(14, '0');
}

/** A 32-bit seed from any number of string parts. */
export function seedFrom(...parts: (string | number)[]): number {
  return hash53(parts.map(String).join('␟')) >>> 0;
}

export type Rng = () => number;

/** mulberry32: a small, fast 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFrom(...parts: (string | number)[]): Rng {
  return mulberry32(seedFrom(...parts));
}

/** Integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError(`randInt needs n > 0, got ${n}`);
  return Math.min(n - 1, Math.floor(rng() * n));
}

/**
 * Pick an index by non-negative weights. Returns -1 when every weight is 0.
 */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) {
    if (w < 0 || !Number.isFinite(w)) throw new RangeError(`Bad weight ${w}`);
    total += w;
  }
  if (total === 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] ?? 0;
    if (r < w) return i;
    r -= w;
  }
  // Floating-point edge: fall back to the last positive weight.
  for (let i = weights.length - 1; i >= 0; i--) if ((weights[i] ?? 0) > 0) return i;
  return -1;
}
