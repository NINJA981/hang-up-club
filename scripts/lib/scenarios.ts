import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LineCounter, isMap, isScalar, parseDocument } from 'yaml';
import { type z } from 'zod';
import { hash53Hex } from '../../src/domain/schedule/rng';
import {
  AddressTermsSchema,
  LibrarySchema,
  ScenarioTemplateSchema,
  VoicesSchema,
  type Library,
  type ScenarioTemplate,
  type VoiceDef,
} from '../../src/domain/scenario/schema';
import { validateLibrary, validateTemplate, type Issue } from '../../src/domain/scenario/library';

export const ROOT = join(import.meta.dirname, '..', '..');
export const SCENARIO_DIR = join(ROOT, 'scenarios');

export interface LocatedIssue {
  file: string;
  line: number;
  message: string;
}

export function formatIssue(i: LocatedIssue): string {
  return `${i.file}:${String(i.line)}  ${i.message}`;
}

interface Parsed {
  value: unknown;
  locate(path: readonly (string | number)[]): number;
  errors: LocatedIssue[];
}

/** Parse YAML and keep a way to map a data path back to a source line. */
export function parseYaml(file: string, text: string): Parsed {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc, prettyErrors: false });
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const errors = doc.errors.map((e) => ({
    file: rel,
    line: e.linePos?.[0].line ?? 1,
    message: e.message.split('\n')[0] ?? 'YAML error',
  }));
  const lineOf = (
    node: { range?: [number, number, number] | null } | null | undefined,
  ): number | undefined => (node?.range ? lc.linePos(node.range[0]).line : undefined);
  const locate = (path: readonly (string | number)[]): number => {
    for (let n = path.length; n >= 0; n--) {
      const sub = path.slice(0, n);
      const last = sub.at(-1);
      if (typeof last === 'string') {
        // Prefer the key's own line: a nested value starts on the line after its key.
        const parent: unknown = n === 1 ? doc.contents : doc.getIn(sub.slice(0, -1), true);
        if (isMap(parent)) {
          const pair = parent.items.find((item) => isScalar(item.key) && item.key.value === last);
          const found = lineOf(pair?.key as { range?: [number, number, number] } | undefined);
          if (found !== undefined) return found;
        }
      }
      const found = lineOf(doc.getIn(sub, true) as { range?: [number, number, number] } | undefined);
      if (found !== undefined) return found;
    }
    return 1;
  };
  return { value: doc.toJS() as unknown, locate, errors };
}

function readYaml(file: string): Parsed {
  return parseYaml(file, readFileSync(file, 'utf8'));
}

export function parseSourceKeys(markdown: string): Set<string> {
  const keys = new Set<string>();
  for (const m of markdown.matchAll(/\*\*\[([A-Z0-9-]+)\]\*\*/g)) if (m[1]) keys.add(m[1]);
  return keys;
}

export interface LoadedScenarios {
  library: Library;
  voices: Record<string, VoiceDef>;
  issues: LocatedIssue[];
}

function zodToIssues(err: z.ZodError): Issue[] {
  return err.issues.flatMap((i): Issue[] => {
    const path = i.path.filter((p): p is string | number => typeof p !== 'symbol');
    // A strict object reports unknown keys on the parent; point at each key's own line instead.
    if (i.code === 'unrecognized_keys') {
      return i.keys.map((key) => ({ path: [...path, key], message: `Unrecognized key "${key}"` }));
    }
    return [{ path, message: i.message }];
  });
}

/** Load, schema-validate and semantically validate every file under scenarios/. */
export function loadScenarios(dir = SCENARIO_DIR): LoadedScenarios {
  const issues: LocatedIssue[] = [];
  const rel = (f: string): string => relative(ROOT, f).replaceAll('\\', '/');

  const termsFile = join(dir, 'shared', 'address-terms.yaml');
  const voicesFile = join(dir, 'shared', 'voices.yaml');
  const sourcesFile = join(dir, 'SOURCES.md');

  const terms = readYaml(termsFile);
  issues.push(...terms.errors);
  const termsResult = AddressTermsSchema.safeParse(terms.value);
  if (!termsResult.success) {
    for (const i of zodToIssues(termsResult.error)) {
      issues.push({ file: rel(termsFile), line: terms.locate(i.path), message: i.message });
    }
  }
  const addressTerms = termsResult.success ? termsResult.data : [];

  const voicesParsed = readYaml(voicesFile);
  issues.push(...voicesParsed.errors);
  const voicesResult = VoicesSchema.safeParse(voicesParsed.value);
  if (!voicesResult.success) {
    for (const i of zodToIssues(voicesResult.error)) {
      issues.push({ file: rel(voicesFile), line: voicesParsed.locate(i.path), message: i.message });
    }
  }
  const voices = voicesResult.success ? voicesResult.data : {};

  const sourceKeys = existsSync(sourcesFile)
    ? parseSourceKeys(readFileSync(sourcesFile, 'utf8'))
    : new Set<string>();
  if (sourceKeys.size === 0)
    issues.push({ file: rel(sourcesFile), line: 1, message: 'No [KEY] sources found' });

  const templates: ScenarioTemplate[] = [];
  for (const kindDir of ['scam', 'legit'] as const) {
    const folder = join(dir, kindDir);
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder)
      .filter((n) => n.endsWith('.yaml'))
      .sort()) {
      const file = join(folder, name);
      const parsed = readYaml(file);
      issues.push(...parsed.errors);
      if (parsed.errors.length) continue;
      const result = ScenarioTemplateSchema.safeParse(parsed.value);
      if (!result.success) {
        for (const i of zodToIssues(result.error)) {
          issues.push({ file: rel(file), line: parsed.locate(i.path), message: i.message });
        }
        continue;
      }
      const t = result.data;
      const before = issues.length;
      const place = (i: Issue): LocatedIssue => ({
        file: rel(file),
        line: parsed.locate(i.path),
        message: i.message,
      });
      if (name !== `${t.id}.yaml`)
        issues.push(place({ path: ['id'], message: `File name must be ${t.id}.yaml` }));
      if (t.kind !== kindDir)
        issues.push(place({ path: ['kind'], message: `Template is in ${kindDir}/ but kind is ${t.kind}` }));
      if (!t.id.startsWith(kindDir === 'scam' ? 'S' : 'L')) {
        issues.push(
          place({ path: ['id'], message: `Ids in ${kindDir}/ start with ${kindDir === 'scam' ? 'S' : 'L'}` }),
        );
      }
      for (const i of validateTemplate(t, {
        addressTerms,
        sourceKeys,
        voiceIds: new Set(Object.keys(voices)),
      })) {
        issues.push(place(i));
      }
      // Only sound templates join the library, so one broken file cannot crash the library-level checks.
      if (issues.length === before) templates.push(t);
    }
  }
  templates.sort((a, b) => (a.id < b.id ? -1 : 1));

  const content = { addressTerms, templates };
  const library: Library = { version: hash53Hex(JSON.stringify(content)), ...content };
  for (const i of validateLibrary(library)) {
    issues.push({ file: 'scenarios/', line: 1, message: i.message });
  }
  return { library, voices, issues };
}

export function serializeLibrary(library: Library): string {
  LibrarySchema.parse(library);
  return JSON.stringify(library, null, 2) + '\n';
}
