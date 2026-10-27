import type { Kind, Tactic } from '../scenario/schema';
import type { Outcome } from '../scoring/score';
import { addDays, type LocalDate } from '../time/dates';

export type BoxNumber = 1 | 2 | 3 | 4 | 5;

export interface TacticBox {
  tactic: Tactic;
  box: BoxNumber;
  lastSeen: LocalDate;
}

/** Leitner review intervals in days for boxes 1–5 (SPEC §7.4). */
export const INTERVALS: Record<BoxNumber, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };

export function dueDate(b: TacticBox): LocalDate {
  return addDays(b.lastSeen, INTERVALS[b.box]);
}

export function isDue(b: TacticBox, today: LocalDate): boolean {
  return today >= dueDate(b);
}

export function dueTactics(boxes: readonly TacticBox[], today: LocalDate): Set<Tactic> {
  return new Set(boxes.filter((b) => isDue(b, today)).map((b) => b.tactic));
}

export interface SrsEvent {
  kind: Kind;
  outcome: Outcome;
  tacticsBeforeAsk: readonly Tactic[];
}

/**
 * Apply one scored attempt:
 * - caught / late on a scam → every pre-ask tactic back to box 1;
 * - sharp / verified on a scam → those tactics move up one box;
 * - anything else leaves boxes unchanged.
 * Returns a new array; the input is not mutated.
 */
export function applyAttempt(boxes: readonly TacticBox[], ev: SrsEvent, today: LocalDate): TacticBox[] {
  if (ev.kind !== 'scam') return [...boxes];
  const reset = ev.outcome === 'caught' || ev.outcome === 'late';
  const promote = ev.outcome === 'sharp' || ev.outcome === 'verified';
  if (!reset && !promote) return [...boxes];

  const map = new Map(boxes.map((b) => [b.tactic, b]));
  for (const tactic of new Set(ev.tacticsBeforeAsk)) {
    const prev = map.get(tactic);
    if (reset) {
      map.set(tactic, { tactic, box: 1, lastSeen: today });
    } else {
      const from = prev?.box ?? 1;
      const box = Math.min(5, from + 1) as BoxNumber;
      map.set(tactic, { tactic, box, lastSeen: today });
    }
  }
  return [...map.values()];
}
