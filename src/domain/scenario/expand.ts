import { hash53Hex } from '../schedule/rng';
import type { Callback, Caller, Line, ScenarioTemplate } from './schema';

/** The shared variable filled from the 15 pre-rendered address terms. */
export const ADDRESS_VAR = 'address';

const PLACEHOLDER_RE = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

export function placeholders(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const name = m[1];
    if (name !== undefined && !out.includes(name)) out.push(name);
  }
  return out;
}

export function interpolate(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(PLACEHOLDER_RE, (whole, name: string) => vars[name] ?? whole);
}

/** Every text field that may contain `{var}` placeholders. */
function templatedTexts(t: Pick<ScenarioTemplate, 'caller' | 'lines' | 'callback'>): string[] {
  return [t.caller.display, ...t.lines.map((l) => l.say), ...t.callback.ivr.map((l) => l.say)];
}

/** Variable names the template actually uses, in a stable (sorted) order. */
export function usedVars(t: Pick<ScenarioTemplate, 'caller' | 'lines' | 'callback'>): string[] {
  const set = new Set<string>();
  for (const text of templatedTexts(t)) for (const p of placeholders(text)) set.add(p);
  return [...set].sort();
}

export type VarDomains = Record<string, readonly string[]>;

/**
 * The value list for each used variable. `address` comes from the shared
 * address terms unless the template declares its own list.
 */
export function varDomains(
  t: Pick<ScenarioTemplate, 'caller' | 'lines' | 'callback' | 'vars'>,
  addressTerms: readonly string[],
): VarDomains {
  const out: Record<string, readonly string[]> = {};
  for (const name of usedVars(t)) {
    const declared = t.vars[name];
    if (declared) out[name] = declared;
    else if (name === ADDRESS_VAR) out[name] = addressTerms;
    else throw new Error(`Template uses {${name}} but does not declare it in vars`);
  }
  return out;
}

export function variantCount(domains: VarDomains): number {
  let n = 1;
  for (const values of Object.values(domains)) n *= values.length;
  return n;
}

/** Index tuple (one per sorted var name) for a variant number (mixed radix). */
export function variantIndices(domains: VarDomains, variant: number): number[] {
  const names = Object.keys(domains).sort();
  const total = variantCount(domains);
  if (!Number.isInteger(variant) || variant < 0 || variant >= total) {
    throw new RangeError(`Variant ${variant} out of range 0..${total - 1}`);
  }
  const idx: number[] = [];
  let rest = variant;
  for (const name of names) {
    const len = domains[name]?.length ?? 1;
    idx.push(rest % len);
    rest = Math.floor(rest / len);
  }
  return idx;
}

export function variantFromIndices(domains: VarDomains, indices: readonly number[]): number {
  const names = Object.keys(domains).sort();
  let variant = 0;
  let mult = 1;
  names.forEach((name, i) => {
    const len = domains[name]?.length ?? 1;
    const v = indices[i] ?? 0;
    if (v < 0 || v >= len) throw new RangeError(`Index ${v} out of range for ${name}`);
    variant += v * mult;
    mult *= len;
  });
  return variant;
}

export function varsForVariant(domains: VarDomains, variant: number): Record<string, string> {
  const names = Object.keys(domains).sort();
  const idx = variantIndices(domains, variant);
  const vars: Record<string, string> = {};
  names.forEach((name, i) => {
    vars[name] = domains[name]?.[idx[i] ?? 0] ?? '';
  });
  return vars;
}

/** Stable, human-readable variant key: "S01-bank-code#org=1,amount=0". */
export function variantKey(templateId: string, domains: VarDomains, variant: number): string {
  const names = Object.keys(domains).sort();
  if (names.length === 0) return `${templateId}#-`;
  const idx = variantIndices(domains, variant);
  return `${templateId}#${names.map((n, i) => `${n}=${String(idx[i])}`).join(',')}`;
}

export function parseVariantKey(
  key: string,
  domains: VarDomains,
): { templateId: string; variant: number } | null {
  const hashAt = key.lastIndexOf('#');
  if (hashAt <= 0) return null;
  const templateId = key.slice(0, hashAt);
  const body = key.slice(hashAt + 1);
  const names = Object.keys(domains).sort();
  if (body === '-') return names.length === 0 ? { templateId, variant: 0 } : null;
  const pairs = body.split(',').map((p) => p.split('='));
  if (pairs.length !== names.length) return null;
  const indices: number[] = [];
  for (const [i, name] of names.entries()) {
    const pair = pairs[i];
    if (pair?.[0] !== name || pair[1] === undefined || !/^\d+$/.test(pair[1])) return null;
    indices.push(Number(pair[1]));
  }
  try {
    return { templateId, variant: variantFromIndices(domains, indices) };
  } catch {
    return null;
  }
}

export interface ResolvedLine extends Omit<Line, 'say'> {
  text: string;
  speaker: string;
  voice: string;
}

export interface ResolvedScenario {
  templateId: string;
  variantKey: string;
  kind: ScenarioTemplate['kind'];
  group: ScenarioTemplate['group'];
  category: string;
  summary: string;
  who?: string;
  askFor?: string;
  missCost?: string;
  caller: Caller;
  vars: Record<string, string>;
  lines: ResolvedLine[];
  callback: Callback;
  advice: string;
  sources: ScenarioTemplate['sources'];
}

export const DEFAULT_SPEAKER = 'Caller';

/** Fill every placeholder for one variant. */
export function resolveVariant(
  t: ScenarioTemplate,
  addressTerms: readonly string[],
  variant: number,
): ResolvedScenario {
  const domains = varDomains(t, addressTerms);
  const vars = varsForVariant(domains, variant);
  return resolveWithVars(t, vars, variantKey(t.id, domains, variant));
}

export function resolveWithVars(
  t: ScenarioTemplate,
  vars: Record<string, string>,
  key: string,
): ResolvedScenario {
  const resolved: ResolvedScenario = {
    templateId: t.id,
    variantKey: key,
    kind: t.kind,
    group: t.group,
    category: t.category,
    summary: t.summary,
    caller: { ...t.caller, display: interpolate(t.caller.display, vars) },
    vars,
    lines: t.lines.map(({ say, ...line }) => ({
      ...line,
      text: interpolate(say, vars),
      speaker: line.speaker ?? DEFAULT_SPEAKER,
      voice: line.voice ?? t.caller.voice,
    })),
    callback: {
      ...t.callback,
      ivr: t.callback.ivr.map((l) => ({ ...l, say: interpolate(l.say, vars) })),
    },
    advice: t.advice,
    sources: t.sources,
  };
  if (t.who !== undefined) resolved.who = t.who;
  if (t.askFor !== undefined) resolved.askFor = t.askFor;
  if (t.missCost !== undefined) resolved.missCost = t.missCost;
  return resolved;
}

/** Clip identity at runtime: voice plus normalised text. */
export function normaliseClipText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function clipKey(voice: string, text: string): string {
  return `${voice}-${hash53Hex(normaliseClipText(text))}`;
}

export interface ClipSpec {
  key: string;
  voice: string;
  text: string;
}

/**
 * Every distinct clip a template can play across all variants: each line is
 * expanded only over the variables it uses, so a line without placeholders
 * yields exactly one clip.
 */
export function clipsForTemplate(t: ScenarioTemplate, addressTerms: readonly string[]): ClipSpec[] {
  const domains = varDomains(t, addressTerms);
  const out = new Map<string, ClipSpec>();
  const add = (voice: string, raw: string): void => {
    const names = placeholders(raw);
    const sub: Record<string, readonly string[]> = {};
    for (const n of names) sub[n] = domains[n] ?? [];
    const count = variantCount(sub);
    for (let v = 0; v < count; v++) {
      const text = normaliseClipText(interpolate(raw, varsForVariant(sub, v)));
      const key = clipKey(voice, text);
      if (!out.has(key)) out.set(key, { key, voice, text });
    }
  };
  for (const line of t.lines) add(line.voice ?? t.caller.voice, line.say);
  for (const line of t.callback.ivr) add(t.callback.voice, line.say);
  return [...out.values()];
}
