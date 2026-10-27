import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AC-F5-1 and AC-F5-2 as the CI would run them: `pnpm audio:check` verifies every clip exists in both
 * formats with a manifest sha equal to hash(text, voice, engine, filterVersion), and the size budgets
 * hold. Needs no TTS engine.
 */
describe('the rendered audio library', () => {
  it('passes audio:check: nothing stale or missing, Opus within 4 MB, no call path over 160 KB', () => {
    const root = join(import.meta.dirname, '..', '..');
    const out = execFileSync(process.execPath, ['--import', 'tsx', join(root, 'scripts', 'audio-check.ts')], {
      cwd: root,
      encoding: 'utf8',
    });
    const m = /audio OK: (\d+) clips, opus (\d+) KB, aac (\d+) KB, largest call path (\d+) KB/.exec(out);
    expect(m, out).not.toBeNull();
    const [, clips, opusKb, , pathKb] = (m ?? []).map(Number);
    expect(clips).toBeGreaterThan(300);
    expect(opusKb, 'Opus library (KB)').toBeLessThanOrEqual(4096);
    expect(pathKb, 'largest single call path (KB)').toBeLessThanOrEqual(160);
  });
});
