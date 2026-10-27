import { describe, expect, it } from 'vitest';
import {
  INTERVALS,
  applyAttempt,
  dueDate,
  dueTactics,
  isDue,
  type TacticBox,
} from '../../src/domain/schedule/srs';
import { calendarMonth, computeStreak, recentDays } from '../../src/domain/streak/streak';
import { addDays, dateRange } from '../../src/domain/time/dates';
import { DST, WEEK, YEAR_END } from '../fixtures/dates';

describe('Leitner boxes (SPEC 7.4)', () => {
  it('review intervals are 1, 2, 4, 8 and 16 days', () => {
    expect(INTERVALS).toEqual({ 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 });
  });
  it('a tactic is due on lastSeen + interval, not before', () => {
    const b: TacticBox = { tactic: 'urgency', box: 3, lastSeen: '2026-10-10' };
    expect(dueDate(b)).toBe('2026-10-14');
    expect(isDue(b, '2026-10-13')).toBe(false);
    expect(isDue(b, '2026-10-14')).toBe(true);
    expect(isDue(b, '2026-12-01')).toBe(true);
  });
  it('lists the due tactics', () => {
    const boxes: TacticBox[] = [
      { tactic: 'urgency', box: 1, lastSeen: '2026-10-19' },
      { tactic: 'fear', box: 5, lastSeen: '2026-10-19' },
    ];
    expect([...dueTactics(boxes, '2026-10-20')]).toEqual(['urgency']);
  });
});

describe('applying an attempt', () => {
  const today = '2026-10-20';
  const boxes: TacticBox[] = [
    { tactic: 'urgency', box: 3, lastSeen: '2026-10-01' },
    { tactic: 'fear', box: 5, lastSeen: '2026-10-01' },
  ];
  const ev = (outcome: Parameters<typeof applyAttempt>[1]['outcome'], kind: 'scam' | 'legit' = 'scam') => ({
    kind,
    outcome,
    tacticsBeforeAsk: ['urgency', 'authority'] as const,
  });
  const byTactic = (b: TacticBox[]): Record<string, TacticBox> =>
    Object.fromEntries(b.map((x) => [x.tactic, x]));

  it('caught resets every pre-ask tactic to box 1', () => {
    const r = byTactic(applyAttempt(boxes, ev('caught'), today));
    expect(r['urgency']).toEqual({ tactic: 'urgency', box: 1, lastSeen: today });
    expect(r['authority']).toEqual({ tactic: 'authority', box: 1, lastSeen: today });
    expect(r['fear']?.box).toBe(5); // not in this call: untouched
  });
  it('late resets them too', () => {
    expect(byTactic(applyAttempt(boxes, ev('late'), today))['urgency']?.box).toBe(1);
  });
  it('sharp and verified promote by one box, starting a new tactic at box 2', () => {
    for (const outcome of ['sharp', 'verified'] as const) {
      const r = byTactic(applyAttempt(boxes, ev(outcome), today));
      expect(r['urgency']?.box).toBe(4);
      expect(r['authority']?.box).toBe(2);
      expect(r['urgency']?.lastSeen).toBe(today);
    }
  });
  it('never promotes past box 5', () => {
    const top: TacticBox[] = [{ tactic: 'urgency', box: 5, lastSeen: '2026-10-01' }];
    expect(byTactic(applyAttempt(top, ev('sharp'), today))['urgency']?.box).toBe(5);
  });
  it('leaves boxes alone for jumpy, stayed, missed and for any legitimate call', () => {
    for (const outcome of ['jumpy', 'stayed', 'missed'] as const) {
      expect(applyAttempt(boxes, ev(outcome), today)).toEqual(boxes);
    }
    expect(applyAttempt(boxes, ev('caught', 'legit'), today)).toEqual(boxes);
  });
  it('does not mutate its input', () => {
    const copy = structuredClone(boxes);
    applyAttempt(boxes, ev('caught'), today);
    expect(boxes).toEqual(copy);
  });
  it('a tactic stamped twice in one call is applied once', () => {
    const r = applyAttempt(
      [],
      { kind: 'scam', outcome: 'sharp', tacticsBeforeAsk: ['urgency', 'urgency'] },
      today,
    );
    expect(r).toEqual([{ tactic: 'urgency', box: 2, lastSeen: today }]);
  });
  it('a missed tactic comes back tomorrow, a mastered one in 16 days', () => {
    const reset = applyAttempt([], { kind: 'scam', outcome: 'caught', tacticsBeforeAsk: ['fear'] }, today);
    expect(isDue(reset[0] as TacticBox, addDays(today, 1))).toBe(true);
    expect(isDue(reset[0] as TacticBox, today)).toBe(false);
    expect(dueDate({ tactic: 'fear', box: 5, lastSeen: today })).toBe(addDays(today, 16));
  });
});

describe('streak (SPEC 7.5, AC-F7-3)', () => {
  const run = (from: string, n: number): string[] => dateRange(from, addDays(from, n - 1));

  it('is zero with no history', () => {
    expect(computeStreak([], '2026-10-20')).toMatchObject({ current: 0, best: 0, todayDone: false });
  });
  it('counts consecutive days, and a miss in the outcome never matters (only completion does)', () => {
    const r = computeStreak(run('2026-10-14', 7), '2026-10-20');
    expect(r.current).toBe(7);
    expect(r.todayDone).toBe(true);
    expect(r.best).toBe(7);
  });
  it('today not yet played is neutral: the streak is still alive from yesterday', () => {
    const r = computeStreak(run('2026-10-14', 6), '2026-10-20');
    expect(r.current).toBe(6);
    expect(r.todayDone).toBe(false);
    expect(r.days.get('2026-10-20')).toBe('today');
  });
  it('uses one automatic rest day per Mon-Sun week', () => {
    // Mon 19 done, Tue 20 missed (rest day), Wed 21 done
    const r = computeStreak(['2026-10-19', '2026-10-21'], '2026-10-21');
    expect(r.current).toBe(2);
    expect(r.days.get('2026-10-20')).toBe('rest');
  });
  it('a second missed day in the same week breaks the streak', () => {
    // Mon done, Tue rest, Wed missed (second miss this week), Thu done: streak restarts at 1
    const r = computeStreak(['2026-10-19', '2026-10-22'], '2026-10-22');
    expect(r.days.get('2026-10-20')).toBe('rest');
    expect(r.days.get('2026-10-21')).toBe('missed');
    expect(r.current).toBe(1);
    expect(r.best).toBe(1);
  });
  it('a new week brings a new rest day', () => {
    // Mon19 done; Tue20 rest; Wed-Sun done; Mon26 missed (rest again, new week); Tue27 done
    const done = ['2026-10-19', ...run('2026-10-21', 5), '2026-10-27'];
    const r = computeStreak(done, '2026-10-27');
    expect(r.days.get(WEEK.nextMonday)).toBe('rest');
    expect(r.current).toBe(7);
  });
  it('the week boundary falls on Sunday night, not Saturday', () => {
    // miss Sunday (rest), miss Monday (new week: rest again), then play Tuesday
    const done = [...run('2026-10-19', 6), '2026-10-27'];
    const r = computeStreak(done, '2026-10-27');
    expect(r.days.get(WEEK.sunday)).toBe('rest');
    expect(r.days.get(WEEK.nextMonday)).toBe('rest');
    expect(r.current).toBe(6 + 1);
  });
  it('a long gap breaks the streak and the best is remembered', () => {
    const r = computeStreak([...run('2026-09-01', 10), ...run('2026-10-18', 3)], '2026-10-20');
    expect(r.current).toBe(3);
    expect(r.best).toBe(10);
  });
  it('ignores future dates', () => {
    expect(computeStreak(['2026-10-21', '2026-10-22'], '2026-10-20').current).toBe(0);
  });
  it('is not disturbed by daylight-saving days: they are ordinary civil dates', () => {
    for (const d of Object.values(DST)) {
      const r = computeStreak(run(addDays(d, -3), 7), addDays(d, 3));
      expect(r.current, d).toBe(7);
    }
  });
  it('a time-zone change between days cannot skip or repeat a civil date', () => {
    // Played 2026-05-09 (Chicago), opened 2026-05-10 (Kolkata): consecutive dates, streak of 2.
    expect(computeStreak(['2026-05-09', '2026-05-10'], '2026-05-10').current).toBe(2);
  });
  it('carries across the year end', () => {
    const r = computeStreak(YEAR_END, '2027-01-02');
    expect(r.current).toBe(4);
    expect(r.days.get('2027-01-01')).toBe('done');
  });
  it('de-duplicates two scored calls on one date', () => {
    expect(computeStreak(['2026-10-20', '2026-10-20'], '2026-10-20').current).toBe(1);
  });
});

describe('calendar views (AC-F7-5)', () => {
  const streak = computeStreak(['2026-10-19', '2026-10-21'], '2026-10-21');
  it('labels every day of the month with a status, never colour alone', () => {
    const month = calendarMonth(2026, 10, streak, '2026-10-21');
    expect(month).toHaveLength(31);
    const byDate = Object.fromEntries(month.map((d) => [d.date, d]));
    expect(byDate['2026-10-19']?.status).toBe('done');
    expect(byDate['2026-10-20']?.status).toBe('rest');
    expect(byDate['2026-10-21']).toMatchObject({ status: 'done', isToday: true });
    expect(byDate['2026-10-22']?.status).toBe('future');
    expect(byDate['2026-10-01']?.status).toBe('none');
  });
  it('shows today as "today" while it is still open', () => {
    const open = computeStreak(['2026-10-19'], '2026-10-20');
    expect(calendarMonth(2026, 10, open, '2026-10-20').find((d) => d.date === '2026-10-20')?.status).toBe(
      'today',
    );
  });
  it('lists the last seven days for the Today card', () => {
    const days = recentDays(streak, '2026-10-21');
    expect(days.map((d) => d.date)).toEqual(dateRange('2026-10-15', '2026-10-21'));
    expect(days.at(-1)?.isToday).toBe(true);
    expect(recentDays(streak, '2026-10-21', 3)).toHaveLength(3);
  });
});
