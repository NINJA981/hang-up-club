import type { ResolvedLine, ResolvedScenario } from '../scenario/expand';
import {
  lineAt,
  markers,
  planTimeline,
  replanAfterReply,
  type Choices,
  type DurationOf,
  type Markers,
  type TimedLine,
} from '../scenario/timeline';
import { score, type Action, type ScoreResult } from '../scoring/score';
import type { Tactic } from '../scenario/schema';

/**
 * The call session state machine (ADR §3.1) as a pure reducer.
 *
 *   idle → ringing → live → ended
 *
 * All `tMs` values are milliseconds since the Answer gesture, read from the
 * same clock the audio is scheduled on (AudioContext.currentTime), so
 * captions, the timer and scoring never drift from the sound. The effects
 * layer (state/callController + audio/engine) feeds TICK events and
 * schedules clips from `plan`.
 */

/** The ring gives up after this long and the screen keeps waiting (AC-F1-2). */
export const RING_TIMEOUT_MS = 20_000;

export type CallState =
  | { status: 'idle' }
  | { status: 'ringing'; ringing: boolean }
  | {
      status: 'live';
      /** The plan along the current path, including lines not yet spoken. */
      plan: TimedLine[];
      choices: Choices;
      nowMs: number;
      /** Line ids whose reply chips were already answered. */
      answeredReplies: string[];
    }
  | {
      status: 'ended';
      plan: TimedLine[];
      choices: Choices;
      action: Action;
      /** Answer → action. For `none`, the end of the last line. */
      endMs: number;
      tActionMs?: number;
    };

export type CallEvent =
  | { type: 'RING' }
  | { type: 'RING_TIMEOUT' }
  | { type: 'ANSWER' }
  | { type: 'TICK'; tMs: number }
  | { type: 'REPLY'; lineId: string; index: number; tMs: number }
  | { type: 'HANG_UP'; tMs: number }
  | { type: 'CALL_BACK'; tMs: number };

export interface SessionContext {
  lines: readonly ResolvedLine[];
  durationOf: DurationOf;
}

export const initialCallState: CallState = { status: 'idle' };

function end(state: Extract<CallState, { status: 'live' }>, action: Action, tMs: number): CallState {
  const lastEnd = state.plan.at(-1)?.endMs ?? 0;
  if (action === 'none') {
    return { status: 'ended', plan: state.plan, choices: state.choices, action, endMs: lastEnd };
  }
  const t = Math.max(0, Math.round(tMs));
  // Pressing after the caller already finished counts as the call simply ending.
  if (t >= lastEnd) {
    return { status: 'ended', plan: state.plan, choices: state.choices, action: 'none', endMs: lastEnd };
  }
  return { status: 'ended', plan: state.plan, choices: state.choices, action, endMs: t, tActionMs: t };
}

export function callReducer(state: CallState, event: CallEvent, ctx: SessionContext): CallState {
  switch (event.type) {
    case 'RING':
      return state.status === 'idle' ? { status: 'ringing', ringing: true } : state;
    case 'RING_TIMEOUT':
      return state.status === 'ringing' ? { status: 'ringing', ringing: false } : state;
    case 'ANSWER': {
      if (state.status !== 'ringing') return state;
      const plan = planTimeline(ctx.lines, ctx.durationOf);
      return { status: 'live', plan, choices: {}, nowMs: 0, answeredReplies: [] };
    }
    case 'TICK': {
      if (state.status !== 'live') return state;
      const lastEnd = state.plan.at(-1)?.endMs ?? 0;
      if (event.tMs >= lastEnd) return end(state, 'none', event.tMs);
      if (event.tMs <= state.nowMs) return state;
      return { ...state, nowMs: event.tMs };
    }
    case 'REPLY': {
      if (state.status !== 'live') return state;
      const open = openReplies(state, event.tMs);
      if (open?.lineId !== event.lineId || !open.replies[event.index]) return state;
      const plan = replanAfterReply(
        state.plan,
        ctx.lines,
        ctx.durationOf,
        event.lineId,
        event.index,
        event.tMs,
        state.choices,
      );
      return {
        ...state,
        plan,
        choices: { ...state.choices, [event.lineId]: event.index },
        nowMs: Math.max(state.nowMs, event.tMs),
        answeredReplies: [...state.answeredReplies, event.lineId],
      };
    }
    case 'HANG_UP':
      return state.status === 'live' ? end(state, 'hangup', event.tMs) : state;
    case 'CALL_BACK':
      return state.status === 'live' ? end(state, 'callback', event.tMs) : state;
  }
}

/** The caption lines visible at time t: the current line and the one before (DESIGN.md §Captions). */
export function visibleCaptions(plan: readonly TimedLine[], tMs: number): TimedLine[] {
  const current = lineAt(plan, tMs);
  if (!current) return [];
  const i = plan.indexOf(current);
  return plan.slice(Math.max(0, i - 1), i + 1);
}

/**
 * Reply chips are open from the start of a line that offers replies until
 * the next line starts (the line plus its pause), unless already answered.
 */
export function openReplies(
  state: Extract<CallState, { status: 'live' }>,
  tMs: number,
): { lineId: string; replies: TimedLine['replies'] } | null {
  const current = lineAt(state.plan, tMs);
  if (!current || current.replies.length === 0) return null;
  if (state.answeredReplies.includes(current.id)) return null;
  if (tMs > current.endMs + current.pauseAfterMs) return null;
  return { lineId: current.id, replies: current.replies };
}

/** Lines that had started by the time the call ended: the path actually played. */
export function playedPath(state: Extract<CallState, { status: 'ended' }>): string[] {
  return state.plan.filter((l) => l.startMs < state.endMs || state.action === 'none').map((l) => l.id);
}

export interface CallSummary {
  markers: Markers;
  result: ScoreResult;
  path: string[];
  /** Tactics stamped up to and including the ask (for spaced repetition). */
  tacticsBeforeAsk: Tactic[];
}

/** Score an ended call against the markers of the path it was on. */
export function summarise(
  state: Extract<CallState, { status: 'ended' }>,
  scenario: Pick<ResolvedScenario, 'kind' | 'templateId'>,
  opts: { callbackIsTheLesson?: boolean } = {},
): CallSummary {
  const m = markers(state.plan);
  const input: Parameters<typeof score>[0] = { kind: scenario.kind, action: state.action, tEndMs: m.tEndMs };
  if (state.tActionMs !== undefined) input.tActionMs = state.tActionMs;
  if (m.tFlagMs !== undefined) input.tFlagMs = m.tFlagMs;
  if (m.tAskMs !== undefined) input.tAskMs = m.tAskMs;
  if (opts.callbackIsTheLesson !== undefined) input.callbackIsTheLesson = opts.callbackIsTheLesson;
  return { markers: m, result: score(input), path: playedPath(state), tacticsBeforeAsk: m.tacticsBeforeAsk };
}
