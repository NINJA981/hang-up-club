import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { FICTIONAL_PHONE_RE } from '../../src/domain/scenario/schema';

/**
 * Fictional-name enforcement (SPEC §4.5a, AC-F3-5): a deny-list of real
 * institutions, plus the "(NXX) 555-01xx" rule for every phone number.
 */

export interface DenyEntry {
  term: string;
  caseSensitive: boolean;
  list: string;
}

/** `#` comments and blanks are ignored; a leading `=` makes the term case-sensitive. */
export function parseDenyList(text: string, list: string): DenyEntry[] {
  const out: DenyEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const caseSensitive = line.startsWith('=');
    out.push({ term: caseSensitive ? line.slice(1) : line, caseSensitive, list });
  }
  return out;
}

/** `path|term` pairs: that deny term is ignored in that one file. */
export function parseAllowList(text: string): { path: string; term: string }[] {
  const out: { path: string; term: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [path, term] = line.split('|');
    if (path && term) out.push({ path: path.trim(), term: term.trim() });
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const compiled = new WeakMap<DenyEntry, RegExp>();

function regexFor(e: DenyEntry): RegExp {
  let re = compiled.get(e);
  if (!re) {
    // Unicode-aware word boundaries; a straight apostrophe in a term also matches the curly one.
    const body = escapeRe(e.term).replaceAll("'", "['’]");
    re = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, e.caseSensitive ? 'gu' : 'giu');
    compiled.set(e, re);
  }
  return re;
}

export interface NameHit {
  term: string;
  list: string;
  line: number;
  text: string;
}

export function findNameHits(
  text: string,
  entries: readonly DenyEntry[],
  allowedTerms: ReadonlySet<string> = new Set(),
): NameHit[] {
  const hits: NameHit[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const e of entries) {
      if (allowedTerms.has(e.term)) continue;
      const re = regexFor(e);
      re.lastIndex = 0;
      if (re.test(line))
        hits.push({ term: e.term, list: e.list, line: i + 1, text: line.trim().slice(0, 100) });
    }
  });
  return hits;
}

const PHONE_LIKE = /(?<![\d])(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]\d{4}(?![\d])/g;

export interface PhoneHit {
  line: number;
  value: string;
}

/** Any phone-looking number that is not in the fictional block "(NXX) 555-01xx". */
export function findBadPhones(text: string): PhoneHit[] {
  const out: PhoneHit[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(PHONE_LIKE)) {
      if (!FICTIONAL_PHONE_RE.test(m[0])) out.push({ line: i + 1, value: m[0] });
    }
  });
  return out;
}

export const SCANNED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.yaml',
  '.yml',
  '.ts',
  '.tsx',
  '.css',
  '.json',
  '.html',
  '.md',
  '.webmanifest',
  '.txt',
]);

/** Files that legitimately name real institutions or are generated lockfiles. */
export const EXCLUDED_FILES: ReadonlySet<string> = new Set([
  'scenarios/NAMES-REVIEW.md',
  // Build-tool config: names the OS text-to-speech voices, never shown to a player.
  'scenarios/shared/voices.yaml',
]);

export function listScannable(root: string, dirs: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (SCANNED_EXTENSIONS.has(extname(name))) {
        const rel = relative(root, full).replaceAll('\\', '/');
        if (!EXCLUDED_FILES.has(rel)) out.push(full);
      }
    }
  };
  for (const d of dirs) walk(join(root, d));
  return out;
}

export function readText(file: string): string {
  return readFileSync(file, 'utf8');
}
