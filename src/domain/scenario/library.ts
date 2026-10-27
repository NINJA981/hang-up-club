import {
  CARD_CALLBACK_LABEL,
  END,
  type Kind,
  type Library,
  type ScenarioTemplate,
  type Tactic,
} from './schema';
import { placeholders, usedVars, varDomains, variantCount, ADDRESS_VAR } from './expand';
import { allPaths, indexById } from './timeline';

export type IssuePath = (string | number)[];
export interface Issue {
  path: IssuePath;
  message: string;
}

export interface ValidationContext {
  addressTerms: readonly string[];
  /** Known source keys (from scenarios/SOURCES.md). Skipped when undefined. */
  sourceKeys?: ReadonlySet<string>;
  /** Known voice ids (from scenarios/shared/voices.yaml). Skipped when undefined. */
  voiceIds?: ReadonlySet<string>;
  /** Minimum variants per template (AC-F3-4). */
  minVariants?: number;
}

/** Categories whose second button must read exactly CARD_CALLBACK_LABEL (AC-F2-3). */
export const CARD_CATEGORIES: ReadonlySet<string> = new Set([
  'business-impersonation.bank',
  'government-impersonation.health-card',
  'legit.bank',
]);

export const MIN_VARIANTS_PER_TEMPLATE = 12;
export const MIN_VARIANTS_TOTAL = 300;
export const LIBRARY_SHAPE = { scam: 12, legit: 8 } as const;

/**
 * Semantic checks that zod cannot express: graph integrity, the ASK and flag
 * rules (AC-F3-2), placeholders, sources (AC-F3-3), the card label (AC-F2-3)
 * and the variant floor (AC-F3-4).
 */
export function validateTemplate(t: ScenarioTemplate, ctx: ValidationContext): Issue[] {
  const issues: Issue[] = [];
  const push = (path: IssuePath, message: string): void => {
    issues.push({ path, message });
  };

  // ── Graph integrity ─────────────────────────────────────────────────────
  const byId = indexById(t.lines);
  if (byId.size !== t.lines.length) {
    const seen = new Set<string>();
    t.lines.forEach((l, i) => {
      if (seen.has(l.id)) push(['lines', i, 'id'], `Duplicate line id "${l.id}"`);
      seen.add(l.id);
    });
  }
  t.lines.forEach((l, i) => {
    if (l.next !== undefined && l.next !== END && !byId.has(l.next)) {
      push(['lines', i, 'next'], `next "${l.next}" is not a line id`);
    }
    l.replies?.forEach((r, j) => {
      if (r.goto !== END && !byId.has(r.goto)) {
        push(['lines', i, 'replies', j, 'goto'], `goto "${r.goto}" is not a line id`);
      }
    });
    if ((l.flag === true || l.ask === true) && !l.tactics?.length) {
      push(['lines', i, 'tactics'], 'Flag and ask lines must stamp at least one tactic');
    }
    if (l.cueAt !== undefined && l.flag !== true) {
      push(['lines', i, 'cueAt'], 'cueAt only applies to flag lines');
    }
  });
  if (issues.length) return issues; // paths below need a sound graph

  let paths: string[][];
  try {
    paths = allPaths(t.lines);
  } catch (err) {
    push(['lines'], err instanceof Error ? err.message : String(err));
    return issues;
  }
  const lineOf = (id: string): ScenarioTemplate['lines'][number] => {
    const line = t.lines[byId.get(id) ?? -1];
    if (!line) throw new Error(`Unknown line ${id}`);
    return line;
  };

  // ── Kind rules ──────────────────────────────────────────────────────────
  if (t.kind === 'scam') {
    paths.forEach((path) => {
      const label = path.join(' → ');
      const asks = path.filter((id) => lineOf(id).ask === true);
      if (asks.length !== 1) {
        push(['lines'], `Scam path must contain exactly one ask line (found ${asks.length}): ${label}`);
        return;
      }
      const askAt = path.findIndex((id) => lineOf(id).ask === true);
      if (!path.slice(0, askAt).some((id) => lineOf(id).flag === true)) {
        push(['lines'], `Scam path needs a flag line before the ask: ${label}`);
      }
      if (askAt === path.length - 1) {
        push(['lines'], `Scam path must end with a "caught" coda after the ask: ${label}`);
      }
    });
    if (t.who !== undefined) push(['who'], '`who` is only for legitimate calls');
    if (t.missCost !== undefined) push(['missCost'], '`missCost` is only for legitimate calls');
  } else {
    t.lines.forEach((l, i) => {
      if (l.ask === true) push(['lines', i, 'ask'], 'Legitimate calls have no ask line');
      if (l.flag === true) push(['lines', i, 'flag'], 'Legitimate calls have no red-flag lines');
    });
    if (t.group !== 'real') push(['group'], 'Legitimate calls belong to the "real" group');
    if (t.askFor !== undefined) push(['askFor'], '`askFor` is only for scam calls');
  }
  if (t.kind === 'scam' && t.group === 'real') push(['group'], 'Scam calls cannot be in the "real" group');

  // ── Placeholders and variants ───────────────────────────────────────────
  const used = usedVars(t);
  for (const name of used) {
    if (!(name in t.vars) && name !== ADDRESS_VAR) push(['vars'], `{${name}} is used but not declared`);
  }
  for (const name of Object.keys(t.vars)) {
    if (!used.includes(name)) push(['vars', name], `vars.${name} is declared but never used`);
  }
  for (const r of t.lines.flatMap((l) => l.replies ?? [])) {
    if (placeholders(r.label).length) push(['lines'], `Reply labels cannot use placeholders: "${r.label}"`);
  }
  if (placeholders(t.advice).length) push(['advice'], 'Advice cannot use placeholders');
  if (!issues.some((i) => i.path[0] === 'vars')) {
    const n = variantCount(varDomains(t, ctx.addressTerms));
    const min = ctx.minVariants ?? MIN_VARIANTS_PER_TEMPLATE;
    if (n < min) push(['vars'], `Only ${n} variants; at least ${min} required`);
  }

  // ── Sources, voices, card label ─────────────────────────────────────────
  if (ctx.sourceKeys) {
    t.sources.forEach((s, i) => {
      if (!ctx.sourceKeys?.has(s.key)) push(['sources', i, 'key'], `Unknown source key "${s.key}"`);
    });
  }
  if (ctx.voiceIds) {
    const check = (voice: string, path: IssuePath): void => {
      if (!ctx.voiceIds?.has(voice)) push(path, `Unknown voice "${voice}"`);
    };
    check(t.caller.voice, ['caller', 'voice']);
    check(t.callback.voice, ['callback', 'voice']);
    t.lines.forEach((l, i) => {
      if (l.voice) check(l.voice, ['lines', i, 'voice']);
    });
  }
  if (CARD_CATEGORIES.has(t.category) && t.callback.label !== CARD_CALLBACK_LABEL) {
    push(['callback', 'label'], `Card callers must use the label "${CARD_CALLBACK_LABEL}"`);
  }
  return issues;
}

/** Union of tactics stamped anywhere in a template. */
export function templateTactics(t: Pick<ScenarioTemplate, 'lines'>): Tactic[] {
  const set = new Set<Tactic>();
  for (const l of t.lines) for (const tac of l.tactics ?? []) set.add(tac);
  return [...set];
}

export interface LibraryStats {
  templates: number;
  byKind: Record<Kind, number>;
  variants: { id: string; count: number; paths: number }[];
  totalVariants: number;
}

export function libraryStats(lib: Library): LibraryStats {
  const byKind: Record<Kind, number> = { scam: 0, legit: 0 };
  const variants = lib.templates.map((t) => {
    byKind[t.kind] += 1;
    return {
      id: t.id,
      count: variantCount(varDomains(t, lib.addressTerms)),
      paths: allPaths(t.lines).length,
    };
  });
  return {
    templates: lib.templates.length,
    byKind,
    variants,
    totalVariants: variants.reduce((s, v) => s + v.count, 0),
  };
}

/** Library-level rules: 12 scam + 8 legit (AC-F3-6), ≥ 300 variants (AC-F3-4), unique ids. */
export function validateLibrary(lib: Library): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  lib.templates.forEach((t, i) => {
    if (ids.has(t.id))
      issues.push({ path: ['templates', i, 'id'], message: `Duplicate template id ${t.id}` });
    ids.add(t.id);
  });
  const stats = libraryStats(lib);
  if (stats.byKind.scam !== LIBRARY_SHAPE.scam || stats.byKind.legit !== LIBRARY_SHAPE.legit) {
    issues.push({
      path: ['templates'],
      message: `Library must have ${LIBRARY_SHAPE.scam} scam and ${LIBRARY_SHAPE.legit} legitimate templates (has ${stats.byKind.scam} and ${stats.byKind.legit})`,
    });
  }
  if (stats.totalVariants < MIN_VARIANTS_TOTAL) {
    issues.push({
      path: ['templates'],
      message: `Library expands to ${stats.totalVariants} variants; at least ${MIN_VARIANTS_TOTAL} required`,
    });
  }
  return issues;
}

/** SPEC §7.2: on the real bank fraud alert (L04), calling back *is* the lesson, so it scores 100. */
export function callbackIsTheLesson(t: Pick<ScenarioTemplate, 'kind' | 'category'>): boolean {
  return t.kind === 'legit' && t.category === 'legit.bank';
}

export function findTemplate(lib: Library, id: string): ScenarioTemplate | undefined {
  return lib.templates.find((t) => t.id === id);
}
