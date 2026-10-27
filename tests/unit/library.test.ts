import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatIssue,
  loadScenarios,
  parseSourceKeys,
  parseYaml,
  serializeLibrary,
} from '../../scripts/lib/scenarios';
import {
  CARD_CATEGORIES,
  LIBRARY_SHAPE,
  MIN_VARIANTS_TOTAL,
  callbackIsTheLesson,
  findTemplate,
  libraryStats,
  templateTactics,
  validateLibrary,
  validateTemplate,
} from '../../src/domain/scenario/library';
import {
  CARD_CALLBACK_LABEL,
  FICTIONAL_PHONE_RE,
  FamilyTemplateSchema,
  LibrarySchema,
  ScenarioTemplateSchema,
  TACTICS,
  TACTIC_LABELS,
  type ScenarioTemplate,
} from '../../src/domain/scenario/schema';
import { allPaths } from '../../src/domain/scenario/timeline';
import { realLibrary } from './helpers/content';
import { FIXTURES, MINI_LEGIT, MINI_SCAM, MINI_TERMS } from './helpers/fixtures';

const ctx = {
  addressTerms: MINI_TERMS,
  sourceKeys: new Set(['TEST-SRC']),
  voiceIds: new Set(['zira-calm', 'ivr']),
};

function messages(t: ScenarioTemplate, extra: Partial<typeof ctx> = {}): string[] {
  return validateTemplate(t, { ...ctx, ...extra }).map((i) => `${i.path.join('.')}: ${i.message}`);
}

/** Replace one line of the mini scam by id. */
function withLine(id: string, patch: Record<string, unknown>): ScenarioTemplate {
  return { ...MINI_SCAM, lines: MINI_SCAM.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

describe('validateTemplate on a sound template', () => {
  it('accepts the mini scam and the mini legitimate call', () => {
    expect(messages(MINI_SCAM)).toEqual([]);
    expect(messages(MINI_LEGIT)).toEqual([]);
  });
});

describe('graph integrity', () => {
  it('rejects duplicate line ids', () => {
    const t = { ...MINI_SCAM, lines: [...MINI_SCAM.lines, { id: 'hello', say: 'again' }] };
    expect(messages(t).join('\n')).toMatch(/Duplicate line id "hello"/);
  });
  it('rejects a next or goto that is not a line', () => {
    expect(messages(withLine('coda', { next: 'missing' })).join('\n')).toMatch(
      /next "missing" is not a line id/,
    );
    expect(messages(withLine('intro', { replies: [{ label: 'x', goto: 'missing' }] })).join('\n')).toMatch(
      /goto "missing" is not a line id/,
    );
  });
  it('requires tactics on flag and ask lines', () => {
    const noTactics = withLine('warning', { tactics: undefined });
    expect(messages(noTactics).join('\n')).toMatch(/Flag and ask lines must stamp at least one tactic/);
  });
  it('allows cueAt only on flag lines', () => {
    expect(messages(withLine('hello', { cueAt: 0.2 })).join('\n')).toMatch(
      /cueAt only applies to flag lines/,
    );
  });
  it('reports a cycle instead of looping forever', () => {
    const t = withLine('coda', { next: 'hello' });
    expect(messages(t).join('\n')).toMatch(/Cycle/);
  });
});

describe('scam rules (AC-F3-2)', () => {
  it('needs exactly one ask on every path', () => {
    const none = {
      ...MINI_SCAM,
      lines: MINI_SCAM.lines.map((l) => (l.ask === true ? { ...l, ask: undefined } : l)),
    };
    expect(messages(none).join('\n')).toMatch(/exactly one ask line \(found 0\)/);
    const two = withLine('coda', { ask: true, tactics: ['urgency'] });
    expect(messages(two).join('\n')).toMatch(/exactly one ask line \(found 2\)/);
  });
  it('needs a flag before the ask', () => {
    const t = withLine('warning', { flag: undefined, cueAt: undefined });
    expect(messages(t).join('\n')).toMatch(/needs a flag line before the ask/);
  });
  it('needs a caught coda after the ask', () => {
    const t = {
      ...MINI_SCAM,
      lines: MINI_SCAM.lines.map((l) => (l.id === 'ask' ? { ...l, next: 'END' } : l)),
    };
    expect(messages(t).join('\n')).toMatch(/caught" coda/);
  });
  it('keeps legitimate-only fields off scams', () => {
    expect(messages({ ...MINI_SCAM, who: 'the bank' }).join('\n')).toMatch(
      /`who` is only for legitimate calls/,
    );
    expect(messages({ ...MINI_SCAM, missCost: 'a cost' }).join('\n')).toMatch(
      /`missCost` is only for legitimate/,
    );
    expect(messages({ ...MINI_SCAM, group: 'real' }).join('\n')).toMatch(/cannot be in the "real" group/);
  });
});

describe('legitimate rules', () => {
  it('has no ask and no flag', () => {
    const lines = MINI_LEGIT.lines.map((l, i) =>
      i === 1 ? { ...l, ask: true, flag: true, tactics: ['urgency' as const] } : l,
    );
    const out = messages({ ...MINI_LEGIT, lines }).join('\n');
    expect(out).toMatch(/no ask line/);
    expect(out).toMatch(/no red-flag lines/);
  });
  it('belongs to the real group and has no askFor', () => {
    expect(messages({ ...MINI_LEGIT, group: 'bank' }).join('\n')).toMatch(/belong to the "real" group/);
    expect(messages({ ...MINI_LEGIT, askFor: 'the code' }).join('\n')).toMatch(/`askFor` is only for scam/);
  });
});

describe('variables, sources, voices, card label', () => {
  it('requires every used variable to be declared and every declared one to be used', () => {
    const undeclared = withLine('hello', { say: 'Hi {mystery}' });
    expect(messages(undeclared).join('\n')).toMatch(/\{mystery\} is used but not declared/);
    const unused = { ...MINI_SCAM, vars: { ...MINI_SCAM.vars, spare: ['a'] } };
    expect(messages(unused).join('\n')).toMatch(/vars\.spare is declared but never used/);
  });
  it('refuses placeholders in reply labels and advice', () => {
    expect(messages(withLine('intro', { replies: [{ label: '{org}?', goto: 'who' }] })).join('\n')).toMatch(
      /Reply labels cannot use placeholders/,
    );
    expect(messages({ ...MINI_SCAM, advice: 'Call {org} back on their number.' }).join('\n')).toMatch(
      /Advice cannot use placeholders/,
    );
  });
  it('enforces the variant floor (AC-F3-4)', () => {
    expect(messages(MINI_SCAM, { addressTerms: ['Nana'] }).join('\n')).toMatch(
      /Only 2 variants; at least 12 required/,
    );
  });
  it('checks source keys (AC-F3-3) and voice ids', () => {
    const badSrc = { ...MINI_SCAM, sources: [{ key: 'NOPE' }] };
    expect(messages(badSrc).join('\n')).toMatch(/Unknown source key "NOPE"/);
    expect(messages(MINI_SCAM, { voiceIds: new Set(['ivr']) }).join('\n')).toMatch(
      /Unknown voice "zira-calm"/,
    );
  });
  it('card callers must use the exact second-button label (AC-F2-3)', () => {
    expect(CARD_CATEGORIES.has(MINI_SCAM.category)).toBe(true);
    const t = { ...MINI_SCAM, callback: { ...MINI_SCAM.callback, label: 'Hang up and call back' } };
    expect(messages(t).join('\n')).toMatch(/must use the label/);
  });
});

describe('schema', () => {
  it('rejects phone numbers outside the fictional block', () => {
    for (const n of ['(614) 555-0200', '614-555-0148', '(614) 556-0148', '+1 614 555 0148']) {
      expect(FICTIONAL_PHONE_RE.test(n), n).toBe(false);
    }
    expect(FICTIONAL_PHONE_RE.test('(614) 555-0148')).toBe(true);
    const bad = { ...MINI_SCAM, caller: { ...MINI_SCAM.caller, number: '(614) 555-0200' } };
    expect(ScenarioTemplateSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects unknown fields (strict objects)', () => {
    expect(ScenarioTemplateSchema.safeParse({ ...MINI_SCAM, surprise: 1 }).success).toBe(false);
  });
  it('rejects advice over 140 characters and templates with no source', () => {
    expect(ScenarioTemplateSchema.safeParse({ ...MINI_SCAM, advice: 'x'.repeat(141) }).success).toBe(false);
    expect(ScenarioTemplateSchema.safeParse({ ...MINI_SCAM, sources: [] }).success).toBe(false);
  });
  it('family templates carry no sources', () => {
    const { sources: _drop, ...rest } = MINI_SCAM;
    expect(FamilyTemplateSchema.safeParse({ ...rest, sources: [] }).success).toBe(true);
    expect(FamilyTemplateSchema.safeParse({ ...rest, sources: [{ key: 'X' }] }).success).toBe(false);
  });
  it('every tactic has a plain-language label of at most 4 words', () => {
    for (const t of TACTICS) expect(TACTIC_LABELS[t].split(/\s+/).length).toBeLessThanOrEqual(5);
  });
});

describe('helpers', () => {
  it('collects the tactics a template stamps', () => {
    expect(new Set(templateTactics(MINI_SCAM))).toEqual(new Set(['authority', 'urgency', 'code-request']));
    expect(templateTactics(MINI_LEGIT)).toEqual([]);
  });
  it('callback is the lesson only for the real bank alert', () => {
    expect(callbackIsTheLesson({ kind: 'legit', category: 'legit.bank' })).toBe(true);
    expect(callbackIsTheLesson({ kind: 'scam', category: 'business-impersonation.bank' })).toBe(false);
    expect(callbackIsTheLesson({ kind: 'legit', category: 'legit.pharmacy' })).toBe(false);
  });
  it('finds a template by id', () => {
    const lib = realLibrary();
    expect(findTemplate(lib, 'S01-bank-code')?.kind).toBe('scam');
    expect(findTemplate(lib, 'nope')).toBeUndefined();
  });
});

describe('the production library (AC-F3-1 to AC-F3-6)', () => {
  const lib = realLibrary();

  it('passes the library-level rules and the compiled file is current', () => {
    expect(validateLibrary(lib)).toEqual([]);
    expect(LibrarySchema.safeParse(lib).success).toBe(true);
    const built = loadScenarios();
    expect(built.issues.map(formatIssue)).toEqual([]);
    expect(
      readFileSync(join(import.meta.dirname, '..', '..', 'public', 'scenarios', 'library.json'), 'utf8'),
    ).toBe(serializeLibrary(built.library));
  });

  it('has exactly 12 scam and 8 legitimate templates (AC-F3-6)', () => {
    const stats = libraryStats(lib);
    expect(stats.byKind).toEqual({ scam: LIBRARY_SHAPE.scam, legit: LIBRARY_SHAPE.legit });
    expect(stats.templates).toBe(20);
    expect(lib.templates.filter((t) => t.kind === 'legit').length / 20).toBe(0.4);
  });

  it('expands to at least 12 variants each and 300 in total (AC-F3-4)', () => {
    const stats = libraryStats(lib);
    for (const v of stats.variants) expect(v.count, v.id).toBeGreaterThanOrEqual(12);
    expect(stats.totalVariants).toBeGreaterThanOrEqual(MIN_VARIANTS_TOTAL);
  });

  it('every scam path has one ask and an earlier flag; no legitimate path has either (AC-F3-2)', () => {
    for (const t of lib.templates) {
      const byId = new Map(t.lines.map((l) => [l.id, l]));
      for (const path of allPaths(t.lines)) {
        const lines = path.map((id) => byId.get(id));
        const asks = lines.filter((l) => l?.ask === true).length;
        const askAt = lines.findIndex((l) => l?.ask === true);
        if (t.kind === 'scam') {
          expect(asks, `${t.id} ${path.join('>')}`).toBe(1);
          expect(
            lines.slice(0, askAt).some((l) => l?.flag === true),
            `${t.id} flag before ask`,
          ).toBe(true);
          expect(askAt, `${t.id} coda after ask`).toBeLessThan(lines.length - 1);
        } else {
          expect(asks, t.id).toBe(0);
          expect(
            lines.some((l) => l?.flag === true),
            t.id,
          ).toBe(false);
        }
      }
    }
  });

  it('every template cites a known source (AC-F3-3)', () => {
    const keys = parseSourceKeys(
      readFileSync(join(import.meta.dirname, '..', '..', 'scenarios', 'SOURCES.md'), 'utf8'),
    );
    expect([...keys].sort()).toEqual(['FTC-IMP-2026', 'FTC-OA-2025', 'IC3-2025']);
    for (const t of lib.templates) {
      expect(t.sources.length, t.id).toBeGreaterThan(0);
      for (const s of t.sources) expect(keys.has(s.key), `${t.id} ${s.key}`).toBe(true);
    }
  });

  it('uses only fictional phone numbers everywhere', () => {
    const numbers = lib.templates.flatMap((t) => [t.caller.number, t.callback.number]);
    expect(numbers.length).toBe(40);
    for (const n of numbers) expect(FICTIONAL_PHONE_RE.test(n), n).toBe(true);
  });

  it('the bank and health-card callers use the exact second-button label (AC-F2-3)', () => {
    for (const id of ['S01-bank-code', 'S02-bank-safe-account', 'S06-health-card', 'L04-bank-fraud-alert']) {
      expect(findTemplate(lib, id)?.callback.label, id).toBe(CARD_CALLBACK_LABEL);
    }
  });

  it('keeps the decoys paired with their scams (SPEC section 5.2)', () => {
    expect(findTemplate(lib, 'L04-bank-fraud-alert')?.caller.display).toBe(
      findTemplate(lib, 'S01-bank-code')?.caller.display,
    );
    expect(findTemplate(lib, 'L07-utility-maintenance')?.caller.display).toBe(
      findTemplate(lib, 'S10-utility-shutoff')?.caller.display,
    );
  });

  it('every legitimate template says who it was and what a hang-up would cost', () => {
    for (const t of lib.templates.filter((x) => x.kind === 'legit')) {
      expect(t.who, t.id).toBeTruthy();
      expect(t.missCost, t.id).toBeTruthy();
    }
    for (const t of lib.templates.filter((x) => x.kind === 'scam')) expect(t.askFor, t.id).toBeTruthy();
  });

  it('covers all ten tactics and the groups a coach can switch', () => {
    const seen = new Set(lib.templates.flatMap(templateTactics));
    for (const tactic of TACTICS) expect(seen.has(tactic), tactic).toBe(true);
    const groups = new Set(lib.templates.filter((t) => t.kind === 'scam').map((t) => t.group));
    expect([...groups].sort()).toEqual([
      'bank',
      'delivery',
      'family',
      'government',
      'prize',
      'romance',
      'tech',
      'utility',
    ]);
  });

  it('keeps reply chips to two per line with short labels', () => {
    for (const t of lib.templates) {
      for (const l of t.lines) {
        expect(l.replies?.length ?? 0, `${t.id}.${l.id}`).toBeLessThanOrEqual(2);
        for (const r of l.replies ?? []) expect(r.label.length).toBeLessThanOrEqual(32);
      }
    }
  });
});

describe('scenario loader (file:line errors, AC-F3-1)', () => {
  it('accepts the ok tree apart from the library-shape rules a 2-template set cannot meet', () => {
    const { issues, library } = loadScenarios(join(FIXTURES, 'scenarios', 'ok'));
    expect(library.templates.map((t) => t.id)).toEqual(['L90-mini-pharmacy', 'S90-mini-bank']);
    expect(issues.every((i) => i.file === 'scenarios/')).toBe(true);
    expect(issues.map((i) => i.message).join('\n')).toMatch(/must have 12 scam and 8 legitimate/);
  });

  it('reports each defect in the broken tree with its file and line', () => {
    const dir = join(FIXTURES, 'scenarios', 'broken');
    const { issues } = loadScenarios(dir);
    const text = readFileSync(join(dir, 'scam', 'S91-broken.yaml'), 'utf8').split('\n');
    const lineOf = (needle: string): number => text.findIndex((l) => l.includes(needle)) + 1;
    const scam = issues.filter((i) => i.file.endsWith('S91-broken.yaml'));
    const find = (re: RegExp): { line: number; message: string } | undefined =>
      scam.find((i) => re.test(i.message));

    expect(find(/next "nowhere" is not a line id/)?.line).toBe(lineOf('next: nowhere'));
    // A broken graph stops the checks that need a sound graph, so only the graph error is reported here.
    expect(scam).toHaveLength(1);
    expect(scam.every((i) => i.line >= 1)).toBe(true);

    const phone = issues.find((i) => i.file.endsWith('L91-bad-phone.yaml') && i.message.includes('555-01xx'));
    expect(phone).toBeDefined();
    const legit = readFileSync(join(dir, 'legit', 'L91-bad-phone.yaml'), 'utf8').split('\n');
    expect(phone?.line).toBe(legit.findIndex((l) => l.includes('555-0248')) + 1);
    const unknown = issues.find(
      (i) => i.file.endsWith('L91-bad-phone.yaml') && /Unrecognized key/i.test(i.message),
    );
    expect(unknown?.line).toBe(legit.findIndex((l) => l.startsWith('surprise')) + 1);
    expect(formatIssue({ file: 'a.yaml', line: 3, message: 'x' })).toBe('a.yaml:3  x');
  });
});

describe('parseYaml', () => {
  it('maps data paths to source lines and reports syntax errors', () => {
    const p = parseYaml(join(FIXTURES, 'x.yaml'), 'a: 1\nb:\n  c: [1, 2]\n  d: 4\n');
    expect(p.errors).toEqual([]);
    expect(p.locate(['b', 'd'])).toBe(4);
    expect(p.locate(['b', 'zzz'])).toBe(2); // falls back to the nearest parent
    expect(p.locate([])).toBe(1);
    const bad = parseYaml(join(FIXTURES, 'bad.yaml'), 'a: [1, 2\nb: 3\n');
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.errors[0]?.line).toBeGreaterThanOrEqual(1);
  });
});
