import { beforeEach, describe, expect, it } from 'vitest';
import { resolveVariant } from '../../src/domain/scenario/expand';
import {
  BAND_WIDTH,
  DEFAULT_LEGIT_RATE,
  FAMILY_GAP_DAYS,
  MAX_LEGIT_RUN,
  MAX_SCAM_RUN,
  NOVELTY_PENALTY,
  SEQUENCE_ANCHOR,
  SRS_BOOST,
  clampLegitRate,
  clearScheduleCache,
  familyDueFrom,
  pickDaily,
  pickPractice,
  plannedKind,
  plannedKinds,
  templateWeights,
  totalVariants,
  type FamilyCallInfo,
  type HistoryEntry,
  type ScheduleInput,
} from '../../src/domain/schedule/daily';
import type { TacticBox } from '../../src/domain/schedule/srs';
import { addDays, diffDays } from '../../src/domain/time/dates';
import { realContent } from './helpers/content';

const content = realContent();
const ALL_GROUPS = [
  'bank',
  'government',
  'family',
  'tech',
  'delivery',
  'utility',
  'prize',
  'romance',
] as const;

function input(over: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    profileId: 'profile-1',
    today: '2026-10-20',
    templates: content.infos,
    history: [],
    tacticBoxes: [],
    enabledGroups: [...ALL_GROUPS],
    ...over,
  };
}

beforeEach(() => {
  clearScheduleCache();
});

describe('legitimate-call rate', () => {
  it('defaults to 40% and clamps to the allowed 30-50%', () => {
    expect(DEFAULT_LEGIT_RATE).toBe(0.4);
    expect(clampLegitRate(undefined)).toBe(0.4);
    expect(clampLegitRate(Number.NaN)).toBe(0.4);
    expect(clampLegitRate(0.1)).toBe(0.3);
    expect(clampLegitRate(0.9)).toBe(0.5);
    expect(clampLegitRate(0.45)).toBe(0.45);
  });
});

describe('planned kind sequence (AC-F7-2)', () => {
  it('is deterministic per profile and does not depend on history or call order', () => {
    const a = plannedKinds('p', 0.4, '2026-06-01');
    clearScheduleCache();
    const b = plannedKinds('p', 0.4, '2026-06-01');
    expect(a).toEqual(b);
    // asking for a later date first, then an earlier one, gives a consistent prefix
    clearScheduleCache();
    const later = plannedKinds('p', 0.4, '2026-09-01');
    const earlier = plannedKinds('p', 0.4, '2026-06-01');
    expect(later.slice(0, earlier.length)).toEqual(earlier);
    expect(plannedKind('p', 0.4, '2026-06-01')).toBe(a.at(-1));
  });
  it('differs between profiles', () => {
    expect(plannedKinds('alice', 0.4, '2026-03-01')).not.toEqual(plannedKinds('bob', 0.4, '2026-03-01'));
  });
  it('rejects dates before the anchor', () => {
    expect(() => plannedKinds('p', 0.4, addDays(SEQUENCE_ANCHOR, -1))).toThrow(RangeError);
  });

  it('every 30-day window holds 35-45% legitimate calls at the default rate', () => {
    for (let p = 0; p < 40; p++) {
      const kinds = plannedKinds(`profile-${String(p)}`, 0.4, addDays(SEQUENCE_ANCHOR, 500));
      for (let start = 0; start + 30 <= kinds.length; start++) {
        const legit = kinds.slice(start, start + 30).filter((k) => k === 'legit').length;
        expect(legit / 30, `profile-${String(p)} window ${String(start)}`).toBeGreaterThanOrEqual(0.35);
        expect(legit / 30, `profile-${String(p)} window ${String(start)}`).toBeLessThanOrEqual(0.45);
      }
    }
  });

  it('never runs more than 3 scams or 2 legitimate calls in a row', () => {
    for (const rate of [0.3, 0.4, 0.5]) {
      for (let p = 0; p < 25; p++) {
        const kinds = plannedKinds(`run-${String(p)}`, rate, addDays(SEQUENCE_ANCHOR, 600));
        let run = 0;
        let prev = '';
        for (const k of kinds) {
          run = k === prev ? run + 1 : 1;
          prev = k;
          expect(run).toBeLessThanOrEqual(k === 'scam' ? MAX_SCAM_RUN : MAX_LEGIT_RUN);
        }
      }
    }
  });

  it('tracks other rates within a tolerance', () => {
    for (const rate of [0.3, 0.5]) {
      const kinds = plannedKinds('rate-test', rate, addDays(SEQUENCE_ANCHOR, 1000));
      const share = kinds.filter((k) => k === 'legit').length / kinds.length;
      expect(Math.abs(share - rate)).toBeLessThan(0.03);
    }
    expect(BAND_WIDTH).toBeGreaterThan(1);
  });
});

describe('pickDaily', () => {
  it('is deterministic for the same inputs', () => {
    expect(pickDaily(input())).toEqual(pickDaily(input()));
  });
  it('gives a different day a (usually) different call and different profiles different calls', () => {
    const days = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const p = pickDaily(input({ today: addDays('2026-10-01', i) }));
      if (p.source === 'library') days.add(p.variantKey);
    }
    expect(days.size).toBeGreaterThan(20);
    const p1 = pickDaily(input({ profileId: 'one' }));
    const p2 = pickDaily(input({ profileId: 'two' }));
    expect(p1).not.toEqual(p2);
  });
  it('never changes during the day, whatever is recorded for today', () => {
    const before = pickDaily(input());
    const todayEntry: HistoryEntry = { localDate: '2026-10-20', scenarioId: 'S01-bank-code', kind: 'scam' };
    expect(pickDaily(input({ history: [todayEntry] }))).toEqual(before);
  });
  it('picks the kind the plan calls for, and a variant that exists', () => {
    for (let i = 0; i < 60; i++) {
      const today = addDays('2026-05-01', i);
      const pick = pickDaily(input({ today }));
      expect(pick.source).toBe('library');
      if (pick.source !== 'library') continue;
      expect(pick.kind).toBe(plannedKind('profile-1', 0.4, today));
      const t = content.byId.get(pick.templateId);
      expect(t?.kind).toBe(pick.kind);
      expect(t && resolveVariant(t, content.library.addressTerms, pick.variant).variantKey).toBe(
        pick.variantKey,
      );
    }
  });
  it('never picks a scam group the coach switched off, but legitimate calls stay on', () => {
    let scams = 0;
    let legit = 0;
    for (let i = 0; i < 200; i++) {
      const pick = pickDaily(input({ today: addDays('2026-01-01', i), enabledGroups: ['bank'] }));
      if (pick.source !== 'library') continue;
      const t = content.byId.get(pick.templateId);
      if (pick.kind === 'scam') {
        scams++;
        expect(t?.group).toBe('bank');
      } else legit++;
    }
    expect(scams).toBeGreaterThan(50);
    expect(legit).toBeGreaterThan(50);
  });
  it('falls back to legitimate calls when no scam group is enabled', () => {
    for (let i = 0; i < 40; i++) {
      const pick = pickDaily(input({ today: addDays('2026-01-01', i), enabledGroups: [] }));
      expect(pick.kind).toBe('legit');
    }
  });
  it('pins the address term the coach chose', () => {
    let seen = 0;
    for (let i = 0; i < 80; i++) {
      const pick = pickDaily(input({ today: addDays('2026-03-01', i), addressTerm: 'Paati' }));
      if (pick.source !== 'library') continue;
      const t = content.byId.get(pick.templateId);
      if (!t) continue;
      const r = resolveVariant(t, content.library.addressTerms, pick.variant);
      if (r.vars['address'] !== undefined) {
        expect(r.vars['address']).toBe('Paati');
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(30);
  });
  it('throws when the library has nothing playable', () => {
    expect(() => pickDaily(input({ templates: [] }))).toThrow(/no playable templates/);
  });
  it('avoids repeating a template played in the last five days', () => {
    // Across many profiles, yesterday's template is picked far less often than 1/12.
    let repeats = 0;
    let total = 0;
    for (let p = 0; p < 1500; p++) {
      const profileId = `novelty-${String(p)}`;
      const yesterday = pickDaily(input({ profileId, today: '2026-10-19' }));
      if (yesterday.source !== 'library') continue;
      const today = pickDaily(
        input({
          profileId,
          today: '2026-10-20',
          history: [{ localDate: '2026-10-19', scenarioId: yesterday.templateId, kind: yesterday.kind }],
        }),
      );
      if (today.source === 'library' && today.kind === yesterday.kind) {
        total++;
        if (today.templateId === yesterday.templateId) repeats++;
      }
    }
    expect(total).toBeGreaterThan(400);
    expect(repeats / total).toBeLessThan(0.06);
  });
});

describe('template weights (SPEC 7.3)', () => {
  const scams = content.infos.filter((t) => t.kind === 'scam');
  const base = {
    history: [] as HistoryEntry[],
    tacticBoxes: [] as TacticBox[],
    enabledGroups: [...ALL_GROUPS],
    today: '2026-10-20',
  };

  it('is 1 for every enabled template with nothing special', () => {
    expect(templateWeights(scams, base)).toEqual(scams.map(() => 1));
  });
  it('is 0 for a disabled group and unaffected for legitimate calls', () => {
    const w = templateWeights(content.infos, { ...base, enabledGroups: ['bank'] });
    content.infos.forEach((t, i) => {
      expect(w[i]).toBe(t.kind === 'legit' || t.group === 'bank' ? 1 : 0);
    });
  });
  it('boosts templates with a due tactic by 3', () => {
    const due: TacticBox = { tactic: 'code-request', box: 1, lastSeen: '2026-10-10' };
    const w = templateWeights(scams, { ...base, tacticBoxes: [due] });
    scams.forEach((t, i) => expect(w[i], t.id).toBe(t.tactics.includes('code-request') ? SRS_BOOST : 1));
    expect(w.some((x) => x === SRS_BOOST)).toBe(true);
  });
  it('does not boost a tactic that is not yet due', () => {
    const notDue: TacticBox = { tactic: 'code-request', box: 5, lastSeen: '2026-10-19' };
    expect(templateWeights(scams, { ...base, tacticBoxes: [notDue] })).toEqual(scams.map(() => 1));
  });
  it('cuts a template played in the last five days to 0.2, but not after that', () => {
    const id = scams[0]?.id ?? '';
    const recent: HistoryEntry[] = [{ localDate: '2026-10-15', scenarioId: id, kind: 'scam' }]; // 5 days ago
    const old: HistoryEntry[] = [{ localDate: '2026-10-14', scenarioId: id, kind: 'scam' }]; // 6 days ago
    expect(templateWeights(scams, { ...base, history: recent })[0]).toBe(NOVELTY_PENALTY);
    expect(templateWeights(scams, { ...base, history: old })[0]).toBe(1);
  });
  it('multiplies the effects together', () => {
    const t = scams.find((s) => s.tactics.includes('code-request'));
    expect(t).toBeDefined();
    const w = templateWeights([t ?? scams[0]!], {
      ...base,
      tacticBoxes: [{ tactic: 'code-request', box: 1, lastSeen: '2026-10-01' }],
      history: [{ localDate: '2026-10-19', scenarioId: t?.id ?? '', kind: 'scam' }],
    });
    expect(w[0]).toBeCloseTo(SRS_BOOST * NOVELTY_PENALTY);
  });
});

describe('spaced repetition steers selection (AC-F7-4)', () => {
  it('a due tactic makes its templates at least twice as likely to be picked', () => {
    const due: TacticBox[] = [{ tactic: 'code-request', box: 1, lastSeen: '2026-10-01' }];
    const codeTemplates = new Set(
      content.infos.filter((t) => t.tactics.includes('code-request')).map((t) => t.id),
    );
    expect(codeTemplates.size).toBe(1);
    let withBoost = 0;
    let without = 0;
    let scams = 0;
    for (let p = 0; p < 1500; p++) {
      const profileId = `srs-${String(p)}`;
      const a = pickDaily(input({ profileId, tacticBoxes: due }));
      const b = pickDaily(input({ profileId }));
      if (a.source === 'library' && a.kind === 'scam') {
        scams++;
        if (codeTemplates.has(a.templateId)) withBoost++;
      }
      if (b.source === 'library' && b.kind === 'scam' && codeTemplates.has(b.templateId)) without++;
    }
    expect(scams).toBeGreaterThan(700);
    expect(withBoost / Math.max(1, without)).toBeGreaterThanOrEqual(2);
  });
});

describe('family calls', () => {
  const call = (over: Partial<FamilyCallInfo> = {}): FamilyCallInfo => ({
    id: 'fam00001',
    kind: 'scam',
    receivedAt: '2026-10-01',
    played: false,
    ...over,
  });

  it('become eligible 0-3 days after they arrive, never before', () => {
    for (let n = 0; n < 40; n++) {
      const c = call({ id: `fam${String(n).padStart(5, '0')}` });
      const due = familyDueFrom('profile-1', c);
      const gap = diffDays(c.receivedAt, due);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(3);
    }
  });
  it('are scheduled on a day whose planned kind matches, once due', () => {
    let used = 0;
    for (let i = 0; i < 60; i++) {
      const today = addDays('2026-11-01', i);
      const wanted = plannedKind('profile-1', 0.4, today);
      const pick = pickDaily(input({ today, familyCalls: [call({ kind: wanted })] }));
      expect(pick.kind).toBe(wanted);
      if (pick.source === 'family') {
        used++;
        expect(pick.familyCallId).toBe('fam00001');
      }
    }
    expect(used).toBeGreaterThan(0);
  });
  it('are never picked before they are due or after they are played', () => {
    const pick = pickDaily(input({ today: '2026-09-30', familyCalls: [call()] }));
    expect(pick.source).toBe('library');
    for (let i = 0; i < 30; i++) {
      const today = addDays('2026-11-01', i);
      expect(pickDaily(input({ today, familyCalls: [call({ played: true })] })).source).toBe('library');
    }
  });
  it('allow at most one per seven days', () => {
    const history: HistoryEntry[] = [
      { localDate: '2026-11-10', scenarioId: 'F-fam00001', kind: 'scam', family: true },
    ];
    for (let i = 1; i < FAMILY_GAP_DAYS; i++) {
      const today = addDays('2026-11-10', i);
      const wanted = plannedKind('profile-1', 0.4, today);
      expect(
        pickDaily(input({ today, history, familyCalls: [call({ id: 'fam00002', kind: wanted })] })).source,
      ).toBe('library');
    }
  });
});

describe('practice calls', () => {
  it('are deterministic per n, and differ between n', () => {
    const a = pickPractice(input(), 1);
    expect(pickPractice(input(), 1)).toEqual(a);
    const seen = new Set<string>();
    for (let n = 1; n <= 12; n++) {
      const p = pickPractice(input(), n);
      if (p.source === 'library') seen.add(p.templateId);
    }
    expect(seen.size).toBeGreaterThan(4);
  });
  it('avoid the templates they are told to', () => {
    for (let n = 1; n <= 40; n++) {
      const p = pickPractice(input(), n, ['S01-bank-code', 'L04-bank-fraud-alert']);
      expect(p.source === 'library' && ['S01-bank-code', 'L04-bank-fraud-alert'].includes(p.templateId)).toBe(
        false,
      );
    }
  });
  it('fall back to the whole library when everything is avoided', () => {
    const only = content.infos.slice(0, 2);
    const p = pickPractice(
      input({ templates: only }),
      1,
      only.map((t) => t.id),
    );
    expect(p.source).toBe('library');
  });
});

describe('library totals', () => {
  it('sums the variants over templates', () => {
    expect(totalVariants(content.infos)).toBeGreaterThanOrEqual(300);
    expect(totalVariants([])).toBe(0);
  });
});
