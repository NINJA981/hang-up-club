import { END, type Tactic } from './schema';
import type { ResolvedLine } from './expand';

/** Silence between "answered" and the caller's first word. */
export const LEAD_IN_MS = 600;
/** Default gap after a line when the line sets no `pauseAfterMs`. */
export const DEFAULT_PAUSE_MS = 450;
export const DEFAULT_CUE_AT = 0.5;
/** A reply branch starts this long after the tap (ADR §3.2). */
export const REPLY_RESUME_MS = 250;
/** Hard cap on path length; schema validation rejects cycles. */
export const MAX_PATH = 64;

interface GraphLine {
  id: string;
  next?: string | undefined;
  replies?: { label: string; goto: string }[] | undefined;
}

/** Reply choices made so far: line id → reply index. */
export type Choices = Readonly<Record<string, number>>;

/** The line that follows `index` on the default (no-reply) path, or null at the end. */
export function defaultNext(lines: readonly GraphLine[], index: number): string | null {
  const line = lines[index];
  if (!line) return null;
  if (line.next !== undefined) return line.next === END ? null : line.next;
  return lines[index + 1]?.id ?? null;
}

export function nextLineId(lines: readonly GraphLine[], index: number, choice?: number): string | null {
  const line = lines[index];
  if (!line) return null;
  if (choice !== undefined) {
    const reply = line.replies?.[choice];
    if (!reply) throw new RangeError(`Line ${line.id} has no reply ${choice}`);
    return reply.goto === END ? null : reply.goto;
  }
  return defaultNext(lines, index);
}

export function indexById(lines: readonly GraphLine[]): Map<string, number> {
  const map = new Map<string, number>();
  lines.forEach((l, i) => map.set(l.id, i));
  return map;
}

/** Line ids along a path from `startId`, following `choices` where given. */
export function walkPath(
  lines: readonly GraphLine[],
  choices: Choices = {},
  startId: string | undefined = lines[0]?.id,
): string[] {
  const byId = indexById(lines);
  const path: string[] = [];
  let id: string | null = startId ?? null;
  while (id !== null) {
    const i = byId.get(id);
    if (i === undefined) throw new Error(`Unknown line id "${id}"`);
    path.push(id);
    if (path.length > MAX_PATH) throw new Error('Path too long (cycle?)');
    id = nextLineId(lines, i, choices[id]);
  }
  return path;
}

/**
 * Every distinct path through the line graph (each reply branch and each
 * default). Throws on a cycle or an unknown target.
 */
export function allPaths(lines: readonly GraphLine[]): string[][] {
  const byId = indexById(lines);
  const out: string[][] = [];
  const visit = (id: string | null, path: string[]): void => {
    if (id === null) {
      out.push(path);
      return;
    }
    const i = byId.get(id);
    if (i === undefined) throw new Error(`Unknown line id "${id}"`);
    if (path.includes(id)) throw new Error(`Cycle at line "${id}"`);
    if (out.length > 512) throw new Error('Too many paths');
    const next = [...path, id];
    const line = lines[i];
    const targets = new Set<string | null>([defaultNext(lines, i)]);
    for (const r of line?.replies ?? []) targets.add(r.goto === END ? null : r.goto);
    for (const t of targets) visit(t, next);
  };
  visit(lines[0]?.id ?? null, []);
  return out;
}

export interface TimedLine {
  id: string;
  text: string;
  speaker: string;
  voice: string;
  tactics: Tactic[];
  flag: boolean;
  ask: boolean;
  replies: { label: string; goto: string }[];
  startMs: number;
  durationMs: number;
  endMs: number;
  /** When the red flag "lands" (flag lines); otherwise the start. */
  cueMs: number;
  pauseAfterMs: number;
}

export type DurationOf = (line: ResolvedLine) => number;

export interface PlanOptions {
  choices?: Choices;
  startId?: string;
  startMs?: number;
}

/** Schedule a path: each line starts after the previous line ends plus its pause. */
export function planTimeline(
  lines: readonly ResolvedLine[],
  durationOf: DurationOf,
  { choices = {}, startId, startMs = LEAD_IN_MS }: PlanOptions = {},
): TimedLine[] {
  const byId = indexById(lines);
  const path = walkPath(lines, choices, startId ?? lines[0]?.id);
  const out: TimedLine[] = [];
  let t = startMs;
  for (const id of path) {
    const line = lines[byId.get(id) ?? -1];
    if (!line) throw new Error(`Unknown line id "${id}"`);
    const durationMs = Math.max(0, Math.round(durationOf(line)));
    const cueAt = line.cueAt ?? DEFAULT_CUE_AT;
    const pauseAfterMs = line.pauseAfterMs ?? DEFAULT_PAUSE_MS;
    const timed: TimedLine = {
      id: line.id,
      text: line.text,
      speaker: line.speaker,
      voice: line.voice,
      tactics: line.tactics ?? [],
      flag: line.flag === true,
      ask: line.ask === true,
      replies: line.replies ?? [],
      startMs: t,
      durationMs,
      endMs: t + durationMs,
      cueMs: line.flag === true ? t + Math.round(cueAt * durationMs) : t,
      pauseAfterMs,
    };
    out.push(timed);
    t = timed.endMs + pauseAfterMs;
  }
  return out;
}

/**
 * Re-plan after a reply tap at `tapMs` on line `lineId`: the played prefix is
 * kept and the branch starts at max(tap + 250 ms, end of that line).
 */
export function replanAfterReply(
  plan: readonly TimedLine[],
  lines: readonly ResolvedLine[],
  durationOf: DurationOf,
  lineId: string,
  replyIndex: number,
  tapMs: number,
  choices: Choices = {},
): TimedLine[] {
  const at = plan.findIndex((l) => l.id === lineId);
  const current = plan[at];
  if (!current) throw new Error(`Line ${lineId} is not in the plan`);
  const reply = current.replies[replyIndex];
  if (!reply) throw new RangeError(`Line ${lineId} has no reply ${replyIndex}`);
  const prefix = plan.slice(0, at + 1);
  if (reply.goto === END) return prefix;
  const startMs = Math.max(tapMs + REPLY_RESUME_MS, current.endMs);
  const rest = planTimeline(lines, durationOf, {
    choices: { ...choices, [lineId]: replyIndex },
    startId: reply.goto,
    startMs,
  });
  return [...prefix, ...rest];
}

export interface Markers {
  /** Cue time of the first flag line. Undefined when there is none. */
  tFlagMs?: number;
  /** End of the ask line. Undefined for legitimate calls. */
  tAskMs?: number;
  /** End of the last line. */
  tEndMs: number;
  /** Tactics stamped on lines up to and including the ask line. */
  tacticsBeforeAsk: Tactic[];
}

export function markers(plan: readonly TimedLine[]): Markers {
  const flag = plan.find((l) => l.flag);
  const askIndex = plan.findIndex((l) => l.ask);
  const ask = askIndex >= 0 ? plan[askIndex] : undefined;
  const last = plan.at(-1);
  const upto = ask ? plan.slice(0, askIndex + 1) : plan;
  const tactics = new Set<Tactic>();
  for (const l of upto) for (const t of l.tactics) tactics.add(t);
  const m: Markers = {
    tEndMs: last?.endMs ?? 0,
    tacticsBeforeAsk: [...tactics],
  };
  if (flag) m.tFlagMs = flag.cueMs;
  if (ask) m.tAskMs = ask.endMs;
  return m;
}

/** The line being spoken (or just finished, during its pause) at time t. */
export function lineAt(plan: readonly TimedLine[], tMs: number): TimedLine | undefined {
  let current: TimedLine | undefined;
  for (const l of plan) {
    if (l.startMs <= tMs) current = l;
    else break;
  }
  return current;
}

/** Rough spoken duration when no rendered clip exists (≈ 165 wpm plus a tail). */
export function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(words * 360 + 300);
}
