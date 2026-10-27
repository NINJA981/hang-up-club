/**
 * Civil (local) dates as `YYYY-MM-DD` strings.
 *
 * All arithmetic runs on epoch-day integers computed from the civil date
 * itself (proleptic Gregorian, UTC-based), never on wall-clock instants, so
 * DST transitions and time-zone changes cannot shift a day.
 */

export type LocalDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isLocalDate(value: string): value is LocalDate {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

function parts(date: LocalDate): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m || !isLocalDate(date)) throw new RangeError(`Not a local date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Days since 1970-01-01 for a civil date. */
export function toEpochDay(date: LocalDate): number {
  const [y, m, d] = parts(date);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromEpochDay(day: number): LocalDate {
  const dt = new Date(day * MS_PER_DAY);
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** `b − a` in whole days. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(date: LocalDate): number {
  // 1970-01-01 was a Thursday (index 3).
  return (((toEpochDay(date) + 3) % 7) + 7) % 7;
}

/** The Monday that starts the calendar week (Mon–Sun) containing `date`. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -weekdayIndex(date));
}

/**
 * The civil date of an instant in a time zone (default: the runtime's zone).
 * Uses Intl so it is correct across DST and arbitrary zones.
 */
export function localDateOf(instant: Date | number, timeZone?: string): LocalDate {
  const dt = typeof instant === 'number' ? new Date(instant) : instant;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(dt)) map[p.type] = p.value;
  return `${map.year ?? ''}-${map.month ?? ''}-${map.day ?? ''}`;
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const start = toEpochDay(from);
  const end = toEpochDay(to);
  const out: LocalDate[] = [];
  for (let d = start; d <= end; d++) out.push(fromEpochDay(d));
  return out;
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** All dates of a month (`month` is 1–12). */
export function monthDates(year: number, month: number): LocalDate[] {
  const first = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return dateRange(first, addDays(first, days - 1));
}
