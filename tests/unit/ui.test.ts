import { describe, expect, it } from 'vitest';
import { SHARD_COUNT, shardPolygons } from '../../src/ui/call/cut';
import { youLabel } from '../../src/ui/parts/timeline';

describe('The Cut: shard geometry (DESIGN.md Shapes)', () => {
  it('makes 14 shards from a jittered 3 x 5 grid with the Hang up cells merged', () => {
    const polys = shardPolygons('profile-1');
    expect(SHARD_COUNT).toBe(14);
    expect(polys).toHaveLength(14);
    // 15 cells, two of them merged into one six-sided shard.
    expect(polys.filter((p) => p.length === 6)).toHaveLength(1);
    expect(polys.filter((p) => p.length === 4)).toHaveLength(13);
  });

  it('is the same every time for the same profile, and different for another', () => {
    expect(shardPolygons('profile-1')).toEqual(shardPolygons('profile-1'));
    expect(shardPolygons('profile-1')).not.toEqual(shardPolygons('profile-2'));
  });

  it('keeps every vertex on the screen and the outer edge straight', () => {
    for (const poly of shardPolygons('anyone')) {
      for (const { x, y } of poly) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
  });

  it('covers the whole screen: the shard areas add up to the full square', () => {
    const area = (poly: { x: number; y: number }[]): number => {
      let sum = 0;
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length];
        if (q) sum += p.x * q.y - q.x * p.y;
      });
      return Math.abs(sum) / 2;
    };
    const total = shardPolygons('seed').reduce((a, p) => a + area(p), 0);
    expect(total).toBeCloseTo(100 * 100, 0);
  });
});

describe('Timeline labels', () => {
  it('names what the player did, in words', () => {
    expect(youLabel('hangup', 6000)).toBe('You hung up · 0:06');
    expect(youLabel('callback', 71_000)).toBe('You called back · 1:11');
    expect(youLabel('none', undefined)).toBe('You stayed on');
    expect(youLabel('hangup', undefined)).toBe('You stayed on');
  });
});
