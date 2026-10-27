import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('design QA material', () => {
  it('has a frame strip of at least ten frames of the signature moment (AC-F9-4)', () => {
    const dir = join(import.meta.dirname, '..', '..', 'docs', 'screenshots');
    // 30-cut-<frame>-<width>-<scheme>.jpg: count distinct frames, not files.
    const frames = new Set(
      readdirSync(dir)
        .map((f) => /^30-cut-(\d+)-.*\.(jpg|png)$/.exec(f)?.[1])
        .filter((n): n is string => n !== undefined),
    );
    expect(frames.size).toBeGreaterThanOrEqual(10);
  });
});
