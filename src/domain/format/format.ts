/**
 * Display formatting for things the player must read exactly (DESIGN.md
 * "Read-It-Exactly Rule"). Pure functions; the UI sets them in mono.
 */

/** `m:ss` from milliseconds, floored to the second (0 → "0:00", 65_400 → "1:05"). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}

/** Whole seconds, rounded down, never negative. */
export function wholeSeconds(ms: number): number {
  return Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
}

const NBSP = ' ';

/** Human duration for prose: "4 s", "1 min 5 s". The unit follows a non-breaking space so a number never wraps from its unit. */
export function formatSeconds(ms: number): string {
  const total = wholeSeconds(ms);
  if (total < 60) return `${String(total)}${NBSP}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${String(m)}${NBSP}min` : `${String(m)}${NBSP}min ${String(s)}${NBSP}s`;
}

/** Codes are grouped 3+3 for reading: "482913" → "482 913". Other lengths group by 3 from the left. */
export function groupCode(code: string): string {
  const digits = code.replace(/\s+/g, '');
  return digits.replace(/(\d{3})(?=\d)/g, '$1 ');
}

/** Digits of a NANP number grouped as "(614) 555-0148". Returns the input unchanged if it is not 10 digits. */
export function formatPhone(input: string): string {
  const d = input.replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (ten.length !== 10) return input;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** "Day 12 in a row" style ordinal-free counts: 1 → "1 day", 2 → "2 days". */
export function pluralDays(n: number): string {
  return `${String(n)} ${n === 1 ? 'day' : 'days'}`;
}

/** 0.873 → "87%". Undefined → undefined. */
export function formatPercent(rate: number | undefined): string | undefined {
  if (rate === undefined || !Number.isFinite(rate)) return undefined;
  return `${String(Math.round(Math.min(1, Math.max(0, rate)) * 100))}%`;
}
