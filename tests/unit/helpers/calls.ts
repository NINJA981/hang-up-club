import {
  callReducer,
  initialCallState,
  type CallEvent,
  type CallState,
} from '../../../src/domain/call/session';
import type { ResolvedScenario } from '../../../src/domain/scenario/expand';
import { estimateDurationMs, markers, planTimeline } from '../../../src/domain/scenario/timeline';

export type EndedCall = Extract<CallState, { status: 'ended' }>;

/** Drive the pure session reducer through a script of events and return the ended state. */
export function playCall(scenario: ResolvedScenario, ...events: CallEvent[]): EndedCall {
  const ctx = { lines: scenario.lines, durationOf: (l: { text: string }) => estimateDurationMs(l.text) };
  const all: CallEvent[] = [{ type: 'RING' }, { type: 'ANSWER' }, ...events];
  const end = all.reduce((s, e) => callReducer(s, e, ctx), initialCallState);
  if (end.status !== 'ended') throw new Error(`call did not end (${end.status})`);
  return end;
}

/** Let the whole call play out: the player never acts. */
export function letItRing(scenario: ResolvedScenario): EndedCall {
  return playCall(scenario, { type: 'TICK', tMs: 10 * 60 * 1000 });
}

/** A moment just after the first red flag lands, on the default path, with estimated durations. */
export function justAfterFlag(scenario: ResolvedScenario): number {
  const m = markers(planTimeline(scenario.lines, (l) => estimateDurationMs(l.text)));
  if (m.tFlagMs === undefined) throw new Error('scenario has no flag');
  return m.tFlagMs + 300;
}
