/**
 * YAML → zod-validated JSON (ADR §2).
 *
 *   pnpm scenarios:build   write public/scenarios/library.json
 *   pnpm scenarios:check   validate everything and fail if library.json is stale (AC-F3-1..6)
 *   pnpm scenarios:stats   print template and variant counts (AC-F3-4)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { libraryStats } from '../src/domain/scenario/library';
import { ROOT, formatIssue, loadScenarios, serializeLibrary } from './lib/scenarios';

const OUT = join(ROOT, 'public', 'scenarios', 'library.json');
const args = new Set(process.argv.slice(2));

const { library, issues } = loadScenarios();

if (issues.length) {
  for (const i of issues) console.error(formatIssue(i));
  console.error(`\n${String(issues.length)} problem(s) in scenarios/`);
  process.exit(1);
}

const json = serializeLibrary(library);

if (args.has('--stats')) {
  const s = libraryStats(library);
  console.log(
    `Templates: ${String(s.templates)} (${String(s.byKind.scam)} scam, ${String(s.byKind.legit)} legitimate)`,
  );
  for (const v of s.variants) {
    console.log(`  ${v.id.padEnd(26)} ${String(v.count).padStart(4)} variants  ${String(v.paths)} path(s)`);
  }
  console.log(`Total playable variants: ${String(s.totalVariants)}`);
  process.exit(0);
}

if (args.has('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== json) {
    console.error('public/scenarios/library.json is stale. Run: pnpm scenarios:build');
    process.exit(1);
  }
  console.log(`scenarios OK: ${String(library.templates.length)} templates, library ${library.version}`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, json);
console.log(`Wrote ${OUT} (${String(library.templates.length)} templates, version ${library.version})`);
