import { describe, expect, it } from 'vitest';
import {
  hash53,
  hash53Hex,
  mulberry32,
  randInt,
  rngFrom,
  seedFrom,
  weightedIndex,
} from '../../src/domain/schedule/rng';

describe('hash53', () => {
  it('is deterministic and non-negative', () => {
    expect(hash53('hello')).toBe(hash53('hello'));
    expect(hash53('hello')).toBeGreaterThanOrEqual(0);
    expect(Number.isSafeInteger(hash53('hello'))).toBe(true);
  });
  it('matches known cyrb53 values (frozen so hashes never silently change)', () => {
    expect(hash53('')).toBe(3338908027751811);
    expect(hash53('hang up club')).toBe(2213204930896335);
    expect(hash53Hex('hang up club')).toBe('07dce5edb8a1cf');
    expect(seedFrom('daily', 'p1', '2026-10-20')).toBe(2804285182);
    expect(hash53('a')).not.toBe(hash53('b'));
    expect(hash53('abc', 1)).not.toBe(hash53('abc', 2));
  });
  it('spreads similar inputs apart', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(hash53(`2026-10-${String(i)}`));
    expect(seen.size).toBe(2000);
  });
  it('hex form is 14 zero-padded characters', () => {
    expect(hash53Hex('x')).toMatch(/^[0-9a-f]{14}$/);
    expect(hash53Hex('')).toHaveLength(14);
  });
});

describe('seeds and generators', () => {
  it('seedFrom depends on every part and on order', () => {
    expect(seedFrom('a', 'b')).not.toBe(seedFrom('b', 'a'));
    expect(seedFrom('ab', 'c')).not.toBe(seedFrom('a', 'bc'));
    expect(seedFrom('a', 1)).toBe(seedFrom('a', '1'));
  });
  it('mulberry32 repeats for a seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('is roughly uniform', () => {
    const r2 = rngFrom('uniform2');
    const counts = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const k = Math.floor(r2() * 10);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeGreaterThan(1700);
    for (const c of counts) expect(c).toBeLessThan(2300);
  });
});

describe('randInt', () => {
  it('stays in range', () => {
    const r = rngFrom('int');
    for (let i = 0; i < 1000; i++) {
      const n = randInt(r, 7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });
  it('rejects a non-positive or fractional bound', () => {
    const r = rngFrom('x');
    expect(() => randInt(r, 0)).toThrow(RangeError);
    expect(() => randInt(r, -1)).toThrow(RangeError);
    expect(() => randInt(r, 1.5)).toThrow(RangeError);
  });
  it('always returns 0 for a bound of 1', () => {
    const r = rngFrom('one');
    for (let i = 0; i < 50; i++) expect(randInt(r, 1)).toBe(0);
  });
});

describe('weightedIndex', () => {
  it('never picks a zero weight', () => {
    const r = rngFrom('w');
    for (let i = 0; i < 2000; i++)
      expect(weightedIndex(r, [0, 1, 0, 2, 0])).toSatisfy((n: number) => n === 1 || n === 3);
  });
  it('follows the weights', () => {
    const r2 = rngFrom('ratio2');
    const c = [0, 0];
    for (let i = 0; i < 20000; i++) {
      const k = weightedIndex(r2, [1, 3]);
      c[k] = (c[k] ?? 0) + 1;
    }
    expect((c[1] ?? 0) / (c[0] ?? 1)).toBeGreaterThan(2.7);
    expect((c[1] ?? 0) / (c[0] ?? 1)).toBeLessThan(3.3);
  });
  it('returns -1 when every weight is zero or the list is empty', () => {
    expect(weightedIndex(() => 0.3, [0, 0])).toBe(-1);
    expect(weightedIndex(() => 0.3, [])).toBe(-1);
  });
  it('rejects negative and non-finite weights', () => {
    expect(() => weightedIndex(() => 0.3, [1, -1])).toThrow(RangeError);
    expect(() => weightedIndex(() => 0.3, [Number.NaN])).toThrow(RangeError);
    expect(() => weightedIndex(() => 0.3, [Number.POSITIVE_INFINITY])).toThrow(RangeError);
  });
  it('falls back to the last positive weight at the floating-point edge', () => {
    expect(weightedIndex(() => 0.9999999999999999, [1, 1, 0])).toBe(1);
  });
});
