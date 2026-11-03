/*
 * Pure call logic for the demo: timeline planning, scoring and result copy.
 * Ported from the app's domain code (src/domain/scenario/timeline.ts,
 * src/domain/scoring/score.ts, src/domain/result/copy.ts) so the page tells the
 * same truth as the product. The scenario data itself is generated from the
 * app's compiled library by scripts/sync-demo.mts, not typed by hand.
 */
import raw from '../demo/scenarios.json';

export interface DemoReply {
  label: string;
  goto: string;
}
export interface DemoLine {
  id: string;
  text: string;
  speaker: string;
  durationMs: number;
  pauseAfterMs: number;
  cueAt: number;
  flag: boolean;
  ask: boolean;
  tactics: string[];
  replies: DemoReply[];
  next: string | null;
  opus?: string;
  aac?: string;
}
export interface DemoIvr {
  id: string;
  text: string;
  durationMs: number;
  opus?: string;
  aac?: string;
}
export interface DemoScenario {
  id: string;
  caller: { display: string; number: string };
  lines: DemoLine[];
  callback: { label: string; trustedSource: string; number: string; ivr: DemoIvr[] };
  advice: string;
  markers: { tFlagMs: number; tAskMs: number; tEndMs: number };
}

export const S01 = raw.s01 as unknown as DemoScenario;

export const LEAD_IN_MS = 600;
export const REPLY_RESUME_MS = 250;
export const LATE_WINDOW_MS = 10_000;
const MAX_PATH = 64;

export interface Timed {
  line: DemoLine;
  startMs: number;
  endMs: number;
  cueMs: number;
}

function nextId(lines: readonly DemoLine[], i: number, choice?: number): string | null {
  const line = lines[i];
  if (!line) return null;
  if (choice !== undefined && line.replies[choice]) return line.replies[choice].goto;
  if (line.next !== null) return line.next;
  return lines[i + 1]?.id ?? null;
}

export function planTimeline(
  lines: readonly DemoLine[],
  choices: Readonly<Record<string, number>> = {},
  startId?: string,
  startMs = LEAD_IN_MS,
): Timed[] {
  const out: Timed[] = [];
  let id: string | null = startId ?? lines[0]?.id ?? null;
  let t = startMs;
  for (let n = 0; id !== null && id !== 'END' && n < MAX_PATH; n++) {
    const i = lines.findIndex((l) => l.id === id);
    const line = lines[i];
    if (!line) break;
    const endMs = t + line.durationMs;
    out.push({
      line,
      startMs: t,
      endMs,
      cueMs: line.flag ? t + Math.round(line.cueAt * line.durationMs) : t,
    });
    t = endMs + line.pauseAfterMs;
    id = nextId(lines, i, choices[line.id]);
  }
  return out;
}

/** A reply tap at `tapMs`: keep what was played, branch after max(tap + 250 ms, end of that line). */
export function replan(
  lines: readonly DemoLine[],
  plan: readonly Timed[],
  lineId: string,
  replyIndex: number,
  tapMs: number,
): Timed[] {
  const at = plan.findIndex((p) => p.line.id === lineId);
  const current = plan[at];
  const reply = current?.line.replies[replyIndex];
  if (!current || !reply) return [...plan];
  const prefix = plan.slice(0, at + 1);
  if (reply.goto === 'END') return prefix;
  const startMs = Math.max(tapMs + REPLY_RESUME_MS, current.endMs);
  return [...prefix, ...planTimeline(lines, { [lineId]: replyIndex }, reply.goto, startMs)];
}

export interface Markers {
  tFlagMs: number;
  tAskMs: number;
  tEndMs: number;
}
export function markers(plan: readonly Timed[]): Markers {
  const flag = plan.find((p) => p.line.flag);
  const ask = plan.find((p) => p.line.ask);
  const last = plan.at(-1);
  return {
    tFlagMs: flag?.cueMs ?? ask?.endMs ?? 0,
    tAskMs: ask?.endMs ?? 0,
    tEndMs: last?.endMs ?? 0,
  };
}

export type Outcome = 'sharp' | 'late' | 'jumpy' | 'caught' | 'verified';
export type Action = 'hangup' | 'callback' | 'none';
export type Moment = 'cut' | 'shatter' | 'fade';

export interface Scored {
  outcome: Outcome;
  moment: Moment;
}

/** SPEC 7.2 outcome table, scam branch. */
export function score(action: Action, tMs: number, m: Markers): Scored {
  if (action === 'none' || tMs >= m.tEndMs) return { outcome: 'caught', moment: 'fade' };
  const timing = tMs < m.tFlagMs ? 'before-flag' : tMs < m.tAskMs ? 'before-ask' : 'after-ask';
  // A call back before any warning sign is as blind as an early hang-up (SPEC 7.2).
  if (action === 'callback')
    return timing === 'before-flag'
      ? { outcome: 'jumpy', moment: 'shatter' }
      : { outcome: 'verified', moment: 'cut' };
  if (timing === 'before-flag') return { outcome: 'jumpy', moment: 'shatter' };
  if (timing === 'before-ask') return { outcome: 'sharp', moment: 'cut' };
  return { outcome: 'late', moment: 'shatter' };
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}
const NBSP = ' ';
export function seconds(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${String(s)}${NBSP}s`;
  // Whole minutes read "1 min", as the app's formatSeconds does (tests/unit/site-parity.test.ts).
  const min = `${String(Math.floor(s / 60))}${NBSP}min`;
  return s % 60 === 0 ? min : `${min} ${String(s % 60)}${NBSP}s`;
}

export interface OutcomeCopy {
  headline: string;
  subline: string;
  icon: 'check' | 'info' | 'clock' | 'flag';
}
export function outcomeCopy(outcome: Outcome, tActionMs: number, m: Markers): OutcomeCopy {
  switch (outcome) {
    case 'sharp':
      return {
        headline: `Hung up at ${clock(tActionMs)}.`,
        subline: `The scammer needed ${clock(m.tAskMs)}.`,
        icon: 'check',
      };
    case 'late':
      return {
        headline: `Hung up ${seconds(Math.max(0, tActionMs - m.tAskMs))} after they asked for the code.`,
        subline: 'You got out. Next time, hang up at the first warning sign.',
        icon: 'clock',
      };
    case 'jumpy':
      return {
        headline: 'You hung up before they gave anything away.',
        subline: 'Safe. Next time, listen for the first warning sign.',
        icon: 'check',
      };
    case 'caught':
      return {
        headline: 'They got to the ask, and you were still on the line.',
        subline: 'Here’s what gave it away.',
        icon: 'flag',
      };
    case 'verified':
      return {
        headline: `You called ${S01.callback.trustedSource}.`,
        subline: 'That beats this scam every time.',
        icon: 'check',
      };
  }
}
