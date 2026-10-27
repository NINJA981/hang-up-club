import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveVariant } from '../../src/domain/scenario/expand';
import { pickDaily, type HistoryEntry } from '../../src/domain/schedule/daily';
import { estimateDurationMs, markers, planTimeline } from '../../src/domain/scenario/timeline';
import {
  LATE_WINDOW_MS,
  OUTCOMES,
  VERIFY_BONUS,
  judgementCredit,
  judgementRate30,
  judgementRateOf,
  score,
  type Action,
  type Outcome,
  type ScoreInput,
} from '../../src/domain/scoring/score';
import { addDays } from '../../src/domain/time/dates';
import { FIXTURES } from './helpers/fixtures';
import { realContent } from './helpers/content';

interface Row {
  name: string;
  kind: 'scam' | 'legit';
  action: Action;
  tActionMs?: number;
  callbackIsTheLesson?: boolean;
  outcome: Outcome;
  points: number;
  moment: string;
}
const golden = JSON.parse(readFileSync(join(FIXTURES, 'scoring.json'), 'utf8')) as {
  scamMarkers: { tFlagMs: number; tAskMs: number; tEndMs: number };
  legitMarkers: { tEndMs: number };
  rows: Row[];
};

describe('SPEC 7.2 outcome table (AC-F4-1), golden rows', () => {
  for (const row of golden.rows) {
    it(row.name, () => {
      const input: ScoreInput = {
        kind: row.kind,
        action: row.action,
        ...(row.kind === 'scam' ? golden.scamMarkers : golden.legitMarkers),
      };
      if (row.tActionMs !== undefined) input.tActionMs = row.tActionMs;
      if (row.callbackIsTheLesson !== undefined) input.callbackIsTheLesson = row.callbackIsTheLesson;
      const r = score(input);
      expect(r.outcome).toBe(row.outcome);
      expect(r.points).toBe(row.points);
      expect(r.moment).toBe(row.moment);
      expect(r.right).toBe(['sharp', 'late', 'jumpy', 'verified', 'stayed'].includes(row.outcome));
    });
  }

  it('covers every outcome the table defines', () => {
    expect(new Set(golden.rows.map((r) => r.outcome))).toEqual(new Set(OUTCOMES));
  });
});

describe('scoring details', () => {
  const scam = { kind: 'scam', ...golden.scamMarkers } as const;

  it('exposes the late window and verify bonus from the spec', () => {
    expect(LATE_WINDOW_MS).toBe(10_000);
    expect(VERIFY_BONUS).toBe(10);
  });
  it('reports where the action fell for a scam', () => {
    expect(score({ ...scam, action: 'hangup', tActionMs: 100 }).timing).toBe('before-flag');
    expect(score({ ...scam, action: 'hangup', tActionMs: 10_000 }).timing).toBe('before-ask');
    expect(score({ ...scam, action: 'hangup', tActionMs: 45_000 }).timing).toBe('after-ask');
    expect(score({ ...scam, action: 'none' }).timing).toBeUndefined();
  });
  it('only sharp and verified scam outcomes get the full cut; late and jumpy get the shatter', () => {
    expect(score({ ...scam, action: 'hangup', tActionMs: 10_000 }).moment).toBe('cut');
    expect(score({ ...scam, action: 'callback', tActionMs: 10_000 }).moment).toBe('cut');
    expect(score({ ...scam, action: 'hangup', tActionMs: 45_000 }).moment).toBe('shatter');
    expect(score({ ...scam, action: 'hangup', tActionMs: 100 }).moment).toBe('shatter');
  });
  it('requires tActionMs for a hang-up or call back, and tAskMs for a scam', () => {
    expect(() => score({ ...scam, action: 'hangup' })).toThrow(/tActionMs is required/);
    expect(() => score({ ...scam, action: 'callback', tActionMs: Number.NaN })).toThrow(
      /tActionMs is required/,
    );
    expect(() => score({ kind: 'scam', action: 'none', tEndMs: 1000 })).toThrow(/tAskMs/);
  });
  it('treats a missing flag as the ask, and a flag after the ask as the ask', () => {
    const noFlag = {
      kind: 'scam',
      action: 'hangup',
      tAskMs: 20_000,
      tEndMs: 40_000,
      tActionMs: 19_999,
    } as const;
    expect(score(noFlag).outcome).toBe('jumpy');
    expect(score({ ...noFlag, tActionMs: 20_000 }).outcome).toBe('late');
    expect(score({ ...noFlag, tFlagMs: 30_000, tActionMs: 19_999 }).outcome).toBe('jumpy');
  });
  it('clamps a negative action time to zero', () => {
    expect(score({ ...scam, action: 'hangup', tActionMs: -50 }).outcome).toBe('jumpy');
  });
  it('a call back never scores above 100', () => {
    for (const t of [0, 1000, 6000, 20_000, 39_999, 40_000, 45_000, 55_000]) {
      expect(score({ ...scam, action: 'callback', tActionMs: t }).points).toBeLessThanOrEqual(100);
    }
  });
  it('legitimate calls are never right to hang up on, wherever the time', () => {
    for (const t of [0, 1, 15_000, 29_999]) {
      const r = score({ kind: 'legit', action: 'hangup', tActionMs: t, tEndMs: 30_000 });
      expect(r.outcome).toBe('missed');
      expect(r.right).toBe(false);
    }
  });
});

describe('judgement rate', () => {
  it('credits right calls fully, jumpy by half and the rest not at all', () => {
    expect(OUTCOMES.map(judgementCredit)).toEqual([1, 1, 0.5, 0, 1, 1, 0]);
  });
  it('is the mean credit', () => {
    expect(judgementRateOf(['sharp', 'stayed', 'caught', 'missed'])).toBe(0.5);
    expect(judgementRateOf(['jumpy', 'jumpy'])).toBe(0.5);
    expect(judgementRateOf([])).toBeUndefined();
  });
  it('covers the 30 days ending today, scored attempts only', () => {
    const today = '2026-10-30';
    const attempts = [
      { localDate: addDays(today, -29), scored: true, outcome: 'sharp' as const }, // in
      { localDate: addDays(today, -30), scored: true, outcome: 'caught' as const }, // out (31 days ago)
      { localDate: today, scored: true, outcome: 'missed' as const }, // in
      { localDate: addDays(today, -3), scored: false, outcome: 'caught' as const }, // practice: out
      { localDate: addDays(today, 1), scored: true, outcome: 'caught' as const }, // future: out
    ];
    expect(judgementRate30(attempts, today)).toBe(0.5);
    expect(judgementRate30([], today)).toBeUndefined();
  });
});

describe('anti-gaming simulation (AC-F4-2)', () => {
  const content = realContent();
  const START = '2026-01-01';
  const DAYS = 1000;

  /** Play 1000 seeded days under a policy and return the 30-day-style judgement rate over all of them. */
  function simulate(
    profileId: string,
    policy: (m: ReturnType<typeof markers>, kind: 'scam' | 'legit') => { action: Action; t?: number },
  ) {
    const history: HistoryEntry[] = [];
    const outcomes: Outcome[] = [];
    let legit = 0;
    for (let i = 0; i < DAYS; i++) {
      const today = addDays(START, i);
      const pick = pickDaily({
        profileId,
        today,
        templates: content.infos,
        history,
        tacticBoxes: [],
        enabledGroups: ['bank', 'government', 'family', 'tech', 'delivery', 'utility', 'prize', 'romance'],
      });
      if (pick.source !== 'library') throw new Error('no family calls in this simulation');
      const t = content.byId.get(pick.templateId);
      if (!t) throw new Error(`missing ${pick.templateId}`);
      const r = resolveVariant(t, content.library.addressTerms, pick.variant);
      const m = markers(planTimeline(r.lines, (l) => estimateDurationMs(l.text)));
      const move = policy(m, r.kind);
      const input: ScoreInput = { kind: r.kind, action: move.action, tEndMs: m.tEndMs };
      if (move.t !== undefined) input.tActionMs = move.t;
      if (m.tFlagMs !== undefined) input.tFlagMs = m.tFlagMs;
      if (m.tAskMs !== undefined) input.tAskMs = m.tAskMs;
      outcomes.push(score(input).outcome);
      if (r.kind === 'legit') legit++;
      history.push({ localDate: today, scenarioId: pick.templateId, kind: r.kind });
    }
    return { rate: judgementRateOf(outcomes) ?? 0, legitShare: legit / DAYS, outcomes };
  }

  it('hanging up on everything at 0.5 s scores at most 0.65', () => {
    for (const id of ['sim-a', 'sim-b', 'sim-c']) {
      const { rate, legitShare } = simulate(id, () => ({ action: 'hangup', t: 500 }));
      expect(rate, id).toBeLessThanOrEqual(0.65);
      expect(legitShare).toBeGreaterThan(0.35);
      expect(legitShare).toBeLessThan(0.45);
    }
  });

  it('hanging up on everything is 0.3 here: every real call is missed and every scam is jumpy', () => {
    const { rate, outcomes } = simulate('sim-a', () => ({ action: 'hangup', t: 500 }));
    expect(new Set(outcomes)).toEqual(new Set(['jumpy', 'missed']));
    expect(rate).toBeCloseTo(0.3, 1);
  });

  it('a thoughtful policy (hang up at the first flag, stay on calls with none) scores at least 0.95', () => {
    for (const id of ['sim-a', 'sim-b', 'sim-c']) {
      const { rate } = simulate(id, (m, kind) =>
        kind === 'scam' && m.tFlagMs !== undefined
          ? { action: 'hangup', t: m.tFlagMs + 200 }
          : { action: 'none' },
      );
      expect(rate, id).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('never hanging up is penalised too: scams are caught', () => {
    const { rate } = simulate('sim-a', () => ({ action: 'none' }));
    expect(rate).toBeLessThan(0.5);
  });
});
