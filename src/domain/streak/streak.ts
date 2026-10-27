import { addDays, compareDates, dateRange, monthDates, weekStart, type LocalDate } from '../time/dates';

/** SPEC §7.5 day labels. Colour is never the only signal; the UI pairs each with text and an icon. */
export type DayStatus = 'done' | 'rest' | 'missed' | 'today' | 'future' | 'none';

export interface StreakResult {
  /** Consecutive days with a scored call, where one rest day per Mon–Sun week keeps it alive. */
  current: number;
  /** Longest streak in the history. */
  best: number;
  todayDone: boolean;
  /** Label for every date from the first scored call up to today. */
  days: Map<LocalDate, DayStatus>;
}

/**
 * Walk history forward from the first scored day:
 * - a day with a scored call extends (or starts) the streak;
 * - today, not yet played, is neutral (the day isn't over);
 * - a missed day while the streak is alive uses that week's rest day if it is
 *   unused, otherwise it breaks the streak.
 * Dates are civil local dates, so DST and time-zone changes cannot split or
 * merge days.
 */
export function computeStreak(doneDates: Iterable<LocalDate>, today: LocalDate): StreakResult {
  const done = new Set<LocalDate>();
  for (const d of doneDates) if (d <= today) done.add(d);
  const days = new Map<LocalDate, DayStatus>();
  const sorted = [...done].sort(compareDates);
  const first = sorted[0];
  if (first === undefined) return { current: 0, best: 0, todayDone: false, days };

  const restUsed = new Set<LocalDate>(); // keyed by week start
  let alive = false;
  let count = 0;
  let best = 0;
  for (const d of dateRange(first, today)) {
    if (done.has(d)) {
      count = alive ? count + 1 : 1;
      alive = true;
      best = Math.max(best, count);
      days.set(d, 'done');
    } else if (d === today) {
      days.set(d, 'today');
    } else if (alive && !restUsed.has(weekStart(d))) {
      restUsed.add(weekStart(d));
      days.set(d, 'rest');
    } else {
      alive = false;
      count = 0;
      days.set(d, 'missed');
    }
  }
  return { current: alive ? count : 0, best, todayDone: done.has(today), days };
}

export interface CalendarDay {
  date: LocalDate;
  status: DayStatus;
  isToday: boolean;
}

/** One month for the streak calendar (`month` 1–12). */
export function calendarMonth(
  year: number,
  month: number,
  streak: Pick<StreakResult, 'days'>,
  today: LocalDate,
): CalendarDay[] {
  return monthDates(year, month).map((date) => {
    const isToday = date === today;
    let status: DayStatus;
    if (date > today) status = 'future';
    else status = streak.days.get(date) ?? (isToday ? 'today' : 'none');
    return { date, status, isToday };
  });
}

/** The last `n` days ending today, for the 7-day strip on the Today card. */
export function recentDays(streak: Pick<StreakResult, 'days'>, today: LocalDate, n = 7): CalendarDay[] {
  return dateRange(addDays(today, -(n - 1)), today).map((date) => ({
    date,
    status: streak.days.get(date) ?? (date === today ? 'today' : 'none'),
    isToday: date === today,
  }));
}
