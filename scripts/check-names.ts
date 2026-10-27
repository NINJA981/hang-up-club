/**
 * AC-F3-5: zero deny-list hits across scenarios/, src/, site/ and public/, and
 * every phone number inside the fictional block. Exit 1 on any problem.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  findBadPhones,
  findNameHits,
  listScannable,
  parseAllowList,
  parseDenyList,
  readText,
  type DenyEntry,
} from './lib/names';
import { ROOT } from './lib/scenarios';

const DENY_DIR = join(import.meta.dirname, 'deny-list');
const entries: DenyEntry[] = [];
let allow: ReturnType<typeof parseAllowList> = [];
for (const name of readdirSync(DENY_DIR).filter((n) => n.endsWith('.txt'))) {
  const text = readText(join(DENY_DIR, name));
  if (name === 'allow-citations.txt') allow = parseAllowList(text);
  else entries.push(...parseDenyList(text, name.replace('.txt', '')));
}

let problems = 0;
const files = listScannable(ROOT, ['scenarios', 'src', 'site', 'public']);
for (const file of files) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const text = readText(file);
  const allowed = new Set(allow.filter((a) => a.path === rel).map((a) => a.term));
  for (const hit of findNameHits(text, entries, allowed)) {
    console.error(`${rel}:${String(hit.line)}  real name "${hit.term}" (${hit.list})  ${hit.text}`);
    problems++;
  }
  for (const p of findBadPhones(text)) {
    console.error(`${rel}:${String(p.line)}  phone ${p.value} is outside (NXX) 555-01xx`);
    problems++;
  }
}
if (problems) {
  console.error(`\n${String(problems)} problem(s). See scenarios/NAMES-REVIEW.md.`);
  process.exit(1);
}
console.log(`names OK: ${String(files.length)} files scanned, ${String(entries.length)} deny-list terms`);
