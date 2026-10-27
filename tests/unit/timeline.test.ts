import { describe, expect, it } from 'vitest';
import { resolveVariant } from '../../src/domain/scenario/expand';
import {
  DEFAULT_PAUSE_MS,
  LEAD_IN_MS,
  REPLY_RESUME_MS,
  allPaths,
  defaultNext,
  estimateDurationMs,
  indexById,
  lineAt,
  markers,
  nextLineId,
  planTimeline,
  replanAfterReply,
  walkPath,
} from '../../src/domain/scenario/timeline';
import { MINI_LEGIT, MINI_SCAM, MINI_TERMS } from './helpers/fixtures';

/** Hand-set durations so every expected time below can be checked on paper. */
const DURATIONS: Record<string, number> = {
  hello: 1000,
  intro: 2000,
  who: 1000,
  warning: 2400,
  ask: 3000,
  coda: 1500,
};
const durationOf = (l: { id: string }): number => DURATIONS[l.id] ?? 1000;

const scam = resolveVariant(MINI_SCAM, MINI_TERMS, 0);

describe('line graph', () => {
  it('follows the next-line rules', () => {
    expect(defaultNext(scam.lines, 0)).toBe('intro');
    expect(defaultNext(scam.lines, 1)).toBe('warning'); // explicit next skips over the "who" detour
    expect(defaultNext(scam.lines, 4)).toBeNull(); // coda: next END
    expect(defaultNext(scam.lines, 99)).toBeNull();
  });
  it('a reply overrides the default and END ends the call', () => {
    expect(nextLineId(scam.lines, 1, 0)).toBe('who');
    expect(nextLineId(scam.lines, 1, 1)).toBe('warning');
    expect(() => nextLineId(scam.lines, 1, 5)).toThrow(RangeError);
    const ending = [{ id: 'a', replies: [{ label: 'Stop', goto: 'END' }] }, { id: 'b' }];
    expect(nextLineId(ending, 0, 0)).toBeNull();
  });
  it('indexes lines by id', () => {
    expect(indexById(scam.lines).get('ask')).toBe(3);
  });
  it('walks the default path and a chosen path', () => {
    expect(walkPath(scam.lines)).toEqual(['hello', 'intro', 'warning', 'ask', 'coda']);
    expect(walkPath(scam.lines, { intro: 0 })).toEqual(['hello', 'intro', 'who', 'warning', 'ask', 'coda']);
    expect(walkPath(scam.lines, {}, 'warning')).toEqual(['warning', 'ask', 'coda']);
  });
  it('enumerates every distinct path', () => {
    const paths = allPaths(scam.lines);
    expect(paths).toHaveLength(2);
    expect(paths).toContainEqual(['hello', 'intro', 'warning', 'ask', 'coda']);
    expect(paths).toContainEqual(['hello', 'intro', 'who', 'warning', 'ask', 'coda']);
    expect(allPaths(resolveVariant(MINI_LEGIT, MINI_TERMS, 0).lines)).toEqual([['hello', 'news', 'goodbye']]);
  });
  it('detects cycles and unknown targets', () => {
    const cycle = [
      { id: 'a', next: 'b' },
      { id: 'b', next: 'a' },
    ];
    expect(() => allPaths(cycle)).toThrow(/Cycle/);
    expect(() => walkPath(cycle)).toThrow(/too long/i);
    expect(() => allPaths([{ id: 'a', next: 'zzz' }])).toThrow(/Unknown line id/);
    expect(() => walkPath([{ id: 'a', next: 'zzz' }])).toThrow(/Unknown line id/);
  });
  it('handles an empty script', () => {
    expect(allPaths([])).toEqual([[]]);
    expect(walkPath([])).toEqual([]);
  });
});

describe('planning a path in time (AC-F4-3)', () => {
  it('starts after the lead-in and adds each line plus its pause', () => {
    const plan = planTimeline(scam.lines, durationOf);
    expect(plan.map((l) => [l.id, l.startMs, l.endMs])).toEqual([
      ['hello', LEAD_IN_MS, 1600],
      ['intro', 1600 + DEFAULT_PAUSE_MS, 4050],
      ['warning', 4050 + DEFAULT_PAUSE_MS, 6900],
      ['ask', 6900 + DEFAULT_PAUSE_MS, 10350],
      ['coda', 10350 + DEFAULT_PAUSE_MS, 12300],
    ]);
  });
  it('places the red flag at cueAt of the flag line (golden)', () => {
    const plan = planTimeline(scam.lines, durationOf);
    const warning = plan.find((l) => l.id === 'warning');
    expect(warning?.flag).toBe(true);
    expect(warning?.cueMs).toBe(4500 + 1200); // cueAt 0.5 of 2400 ms
    expect(plan.find((l) => l.id === 'hello')?.cueMs).toBe(LEAD_IN_MS); // non-flag lines cue at their start
  });
  it('computes the markers of the default path (golden)', () => {
    expect(markers(planTimeline(scam.lines, durationOf))).toEqual({
      tFlagMs: 5700,
      tAskMs: 10350,
      tEndMs: 12300,
      tacticsBeforeAsk: ['authority', 'urgency', 'code-request'],
    });
  });
  it('a reply branch changes the times along the path (golden)', () => {
    const plan = planTimeline(scam.lines, durationOf, { choices: { intro: 0 } });
    expect(plan.map((l) => l.id)).toEqual(['hello', 'intro', 'who', 'warning', 'ask', 'coda']);
    expect(markers(plan)).toMatchObject({ tFlagMs: 7150, tAskMs: 11800, tEndMs: 13750 });
  });
  it('is deterministic', () => {
    expect(planTimeline(scam.lines, durationOf)).toEqual(planTimeline(scam.lines, durationOf));
  });
  it('honours per-line pauses and a custom start', () => {
    const lines = [
      { ...scam.lines[0], pauseAfterMs: 2000 },
      { ...scam.lines[1], pauseAfterMs: 0, next: 'END' },
    ] as typeof scam.lines;
    const plan = planTimeline(lines, durationOf, { startMs: 0 });
    expect(plan[0]?.startMs).toBe(0);
    expect(plan[1]?.startMs).toBe(1000 + 2000);
    expect(plan[1]?.pauseAfterMs).toBe(0);
  });
  it('rounds and clamps odd durations', () => {
    const plan = planTimeline(scam.lines.slice(0, 1), () => -50.4);
    expect(plan[0]?.durationMs).toBe(0);
    const plan2 = planTimeline(scam.lines.slice(0, 1), () => 1000.6);
    expect(plan2[0]?.durationMs).toBe(1001);
  });
  it('a legitimate call has no flag or ask marker', () => {
    const legit = resolveVariant(MINI_LEGIT, MINI_TERMS, 0);
    const m = markers(planTimeline(legit.lines, () => 1000));
    expect(m.tFlagMs).toBeUndefined();
    expect(m.tAskMs).toBeUndefined();
    expect(m.tEndMs).toBeGreaterThan(0);
    expect(m.tacticsBeforeAsk).toEqual([]);
  });
  it('an empty plan ends at zero', () => {
    expect(markers([])).toEqual({ tEndMs: 0, tacticsBeforeAsk: [] });
  });
});

describe('re-planning after a reply tap', () => {
  const plan = planTimeline(scam.lines, durationOf);
  it('keeps the played prefix and waits for the current line to finish', () => {
    const next = replanAfterReply(plan, scam.lines, durationOf, 'intro', 0, 3000);
    // tap + 250 = 3250, but the intro line runs to 4050: the branch starts there
    expect(next.map((l) => l.id)).toEqual(['hello', 'intro', 'who', 'warning', 'ask', 'coda']);
    expect(next.find((l) => l.id === 'who')?.startMs).toBe(4050);
  });
  it('starts the branch after the tap when the line is already over', () => {
    const next = replanAfterReply(plan, scam.lines, durationOf, 'intro', 0, 4300);
    expect(next.find((l) => l.id === 'who')?.startMs).toBe(4300 + REPLY_RESUME_MS);
  });
  it('choosing the default reply rejoins the main path', () => {
    const next = replanAfterReply(plan, scam.lines, durationOf, 'intro', 1, 3000);
    expect(next.map((l) => l.id)).toEqual(['hello', 'intro', 'warning', 'ask', 'coda']);
  });
  it('rejects unknown lines and replies', () => {
    expect(() => replanAfterReply(plan, scam.lines, durationOf, 'nope', 0, 0)).toThrow(/not in the plan/);
    expect(() => replanAfterReply(plan, scam.lines, durationOf, 'intro', 9, 0)).toThrow(RangeError);
  });
  it('a reply that goes to END cuts the plan there', () => {
    const lines = scam.lines.map((l) =>
      l.id === 'intro' ? { ...l, replies: [{ label: 'Goodbye', goto: 'END' }] } : l,
    );
    const p = planTimeline(lines, durationOf);
    expect(replanAfterReply(p, lines, durationOf, 'intro', 0, 3000).map((l) => l.id)).toEqual([
      'hello',
      'intro',
    ]);
  });
});

describe('line lookup and estimates', () => {
  const plan = planTimeline(scam.lines, durationOf);
  it('finds the line being spoken, or just spoken, at a time', () => {
    expect(lineAt(plan, 0)).toBeUndefined();
    expect(lineAt(plan, 600)?.id).toBe('hello');
    expect(lineAt(plan, 1700)?.id).toBe('hello'); // in the pause after hello
    expect(lineAt(plan, 2050)?.id).toBe('intro');
    expect(lineAt(plan, 99_999)?.id).toBe('coda');
  });
  it('estimates duration from word count', () => {
    expect(estimateDurationMs('')).toBe(300 + 360 * 0);
    expect(estimateDurationMs('one two three')).toBe(3 * 360 + 300);
    expect(estimateDurationMs('  spaced   out  ')).toBe(2 * 360 + 300);
  });
});
