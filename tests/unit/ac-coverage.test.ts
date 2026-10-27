import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SPEC section 12 is the contract. Every acceptance criterion in it must be named by at least one test
 * (in its title, a describe or a comment), so a criterion cannot be added or renamed without a test
 * following. This checks that a test names the criterion, not that the test is good: the mapping in
 * HANDOFF.md says what each one actually asserts.
 */
const root = join(import.meta.dirname, '..', '..');
const self = join('tests', 'unit', 'ac-coverage.test.ts');

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'fixtures' ? [] : testFiles(path);
    return /\.(test|spec)\.tsx?$/.test(name) ? [path] : [];
  });
}

const spec = readFileSync(join(root, 'SPEC.md'), 'utf8');
const section12 = spec.slice(spec.indexOf('## 12. Acceptance criteria'), spec.indexOf('## 13.'));
const criteria = [...section12.matchAll(/\*\*(AC-[A-Z0-9]+-\d+)(?: \(([A-Z/]+)\))?\*\*/g)].map((m) => ({
  id: m[1] ?? '',
  level: m[2] ?? '',
}));

const sources = testFiles(join(root, 'tests'))
  .filter((p) => relative(root, p) !== self)
  .map((p) => readFileSync(p, 'utf8'));

describe('SPEC section 12 is covered by tests', () => {
  it('finds the criteria it is meant to check', () => {
    // 6 + 6 + 6 + 3 + 5 + 4 + 5 + 7 + 4 + 6 + 3 (X-4 has no level tag in the spec) = 55 at the time of writing.
    expect(criteria.length).toBeGreaterThanOrEqual(54);
    expect(new Set(criteria.map((c) => c.id)).size).toBe(criteria.length);
  });

  it.each(criteria.map((c) => [c.id, c.level] as const))('%s (%s) is named by a test', (id) => {
    const named = sources.some((src) => new RegExp(`${id}(?![0-9])`).test(src));
    expect(named, `${id} is not named by any file under tests/`).toBe(true);
  });
});
