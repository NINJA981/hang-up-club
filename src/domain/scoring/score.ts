import type { Kind } from '../scenario/schema';
import type { LocalDate } from '../time/dates';
import { addDays } from '../time/dates';

export const OUTCOMES = [
  'sharp',
  'late',
  'jumpy',
  'caught',
  'verified',
  'stayed',
  'missed',
  'cautious',
] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type Action = 'hangup' | 'callback' | 'none';

/**
 * SPEC §7.2: "late" pays 70 within this window after the ask, 50 after. Every scam's coda ends
 * 3.7 to 5.4 s after its ask, so the window must be shorter than that for the 50 tier to exist.
 */
export const LATE_WINDOW_MS = 2_000;
/** A call back on a real call that had no lesson in it: safe, but it cost the caller a call. */
export const CAUTIOUS_POINTS = 60;
export const VERIFY_BONUS = 10;

export interface ScoreInput {
  kind: Kind;
  action: Action;
  /** Milliseconds from answer to the player's action. Required unless action is "none". */
  tActionMs?: number;
  tFlagMs?: number;
  tAskMs?: number;
  tEndMs: number;
  /** L04-style legitimate calls whose whole point is "call back": verify scores 100. */
  callbackIsTheLesson?: boolean;
}

/** Which version of the end-of-call moment plays (DESIGN.md §Signature). */
export type Moment = 'cut' | 'shatter' | 'fade';

export interface ScoreResult {
  outcome: Outcome;
  points: number;
  /** A "right call": triggers the family cheer. */
  right: boolean;
  moment: Moment;
  /** For a scam hang-up or call back: where the action fell relative to the markers. */
  timing?: 'before-flag' | 'before-ask' | 'after-ask';
}

function scamTiming(t: number, tFlag: number, tAsk: number): 'before-flag' | 'before-ask' | 'after-ask' {
  if (t < tFlag) return 'before-flag';
  if (t < tAsk) return 'before-ask';
  return 'after-ask';
}

/** The SPEC §7.2 outcome table, exactly. */
export function score(input: ScoreInput): ScoreResult {
  const { kind, action, tEndMs } = input;
  if (action !== 'none' && (input.tActionMs === undefined || !Number.isFinite(input.tActionMs))) {
    throw new Error(`tActionMs is required for action "${action}"`);
  }
  const t = Math.max(0, input.tActionMs ?? tEndMs);

  if (kind === 'legit') {
    if (action === 'none') return { outcome: 'stayed', points: 100, right: true, moment: 'fade' };
    if (action === 'callback') {
      // L04-style calls ask you to call back, so that is the lesson. On any other real call a call
      // back is safe but unneeded: it scores half, so "call back on everything" cannot top the table.
      return input.callbackIsTheLesson === true
        ? { outcome: 'verified', points: 100, right: true, moment: 'fade' }
        : { outcome: 'cautious', points: CAUTIOUS_POINTS, right: true, moment: 'fade' };
    }
    return { outcome: 'missed', points: 20, right: false, moment: 'fade' };
  }

  // Scam. The ask must exist; a missing flag falls back to the ask.
  if (input.tAskMs === undefined) throw new Error('Scam scoring needs tAskMs');
  const tAsk = input.tAskMs;
  const tFlag = Math.min(input.tFlagMs ?? tAsk, tAsk);

  if (action === 'none' || t >= tEndMs) {
    return { outcome: 'caught', points: 0, right: false, moment: 'fade' };
  }
  const timing = scamTiming(t, tFlag, tAsk);
  const base =
    timing === 'before-flag' ? 60 : timing === 'before-ask' ? 100 : t - tAsk <= LATE_WINDOW_MS ? 70 : 50;

  if (action === 'callback') {
    // A call back before any warning sign is as blind as a jumpy hang-up: same outcome, 70 points.
    if (timing === 'before-flag')
      return { outcome: 'jumpy', points: 70, right: true, moment: 'shatter', timing };
    return {
      outcome: 'verified',
      points: Math.min(100, base + VERIFY_BONUS),
      right: true,
      moment: 'cut',
      timing,
    };
  }
  if (timing === 'before-flag')
    return { outcome: 'jumpy', points: base, right: true, moment: 'shatter', timing };
  if (timing === 'before-ask') return { outcome: 'sharp', points: base, right: true, moment: 'cut', timing };
  return { outcome: 'late', points: base, right: true, moment: 'shatter', timing };
}

export interface ScoredAttemptLike {
  localDate: LocalDate;
  scored: boolean;
  outcome: Outcome;
}

/** Contribution of one outcome to the judgement rate. */
export function judgementCredit(outcome: Outcome): number {
  switch (outcome) {
    case 'sharp':
    case 'late':
    case 'verified':
    case 'stayed':
      return 1;
    case 'jumpy':
    case 'cautious':
      return 0.5;
    case 'caught':
    case 'missed':
      return 0;
  }
}

/** Judgement rate over a list of outcomes: (sharp + late + verified + stayed + ½ jumpy + ½ cautious) ÷ calls. */
export function judgementRateOf(outcomes: readonly Outcome[]): number | undefined {
  if (outcomes.length === 0) return undefined;
  return outcomes.reduce((s, o) => s + judgementCredit(o), 0) / outcomes.length;
}

/** The 30-day judgement rate for scored attempts ending on `today` (inclusive). */
export function judgementRate30(
  attempts: readonly ScoredAttemptLike[],
  today: LocalDate,
): number | undefined {
  const from = addDays(today, -29);
  return judgementRateOf(
    attempts.filter((a) => a.scored && a.localDate >= from && a.localDate <= today).map((a) => a.outcome),
  );
}
