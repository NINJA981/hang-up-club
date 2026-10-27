import { describe, expect, it } from 'vitest';
import { fakeClock, realClock } from '../../src/domain/time/clock';
import {
  addDays,
  compareDates,
  dateRange,
  diffDays,
  fromEpochDay,
  isLocalDate,
  localDateOf,
  monthDates,
  toEpochDay,
  weekStart,
  weekdayIndex,
} from '../../src/domain/time/dates';
import {
  DST,
  NEW_YORK_FALL_INSTANTS,
  NEW_YORK_SPRING_INSTANTS,
  TZ_CHANGE,
  WEEK,
  YEAR_END,
} from '../fixtures/dates';

describe('isLocalDate', () => {
  it('accepts real civil dates', () => {
    for (const d of ['2026-10-20', '2024-02-29', '2000-01-01', '2026-12-31'])
      expect(isLocalDate(d)).toBe(true);
  });
  it('rejects impossible and malformed dates', () => {
    for (const d of [
      '2026-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      '26-10-20',
      '2026-1-1',
      '',
      'tomorrow',
      '2026-10-20T00:00',
    ]) {
      expect(isLocalDate(d), d).toBe(false);
    }
  });
});

describe('epoch-day arithmetic', () => {
  it('maps the epoch to day zero and round-trips', () => {
    expect(toEpochDay('1970-01-01')).toBe(0);
    expect(fromEpochDay(0)).toBe('1970-01-01');
    for (const d of ['2026-03-08', '2026-11-01', '2024-02-29', '1999-12-31'])
      expect(fromEpochDay(toEpochDay(d))).toBe(d);
  });
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-20', 0)).toBe('2026-10-20');
  });
  it('is not affected by daylight saving: one civil day is always one day', () => {
    for (const d of Object.values(DST)) {
      expect(diffDays(d, addDays(d, 1))).toBe(1);
      expect(addDays(addDays(d, 1), -1)).toBe(d);
    }
  });
  it('diffDays is b minus a', () => {
    expect(diffDays('2026-10-20', '2026-10-27')).toBe(7);
    expect(diffDays('2026-10-27', '2026-10-20')).toBe(-7);
  });
  it('throws on a bad date', () => {
    expect(() => toEpochDay('2026-02-30')).toThrow(RangeError);
  });
  it('orders dates as strings', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareDates('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('weeks run Monday to Sunday', () => {
  it('numbers weekdays from Monday = 0', () => {
    expect(weekdayIndex(WEEK.monday)).toBe(0);
    expect(weekdayIndex(WEEK.sunday)).toBe(6);
    expect(weekdayIndex(WEEK.nextMonday)).toBe(0);
    expect(weekdayIndex('1970-01-01')).toBe(3); // a Thursday
  });
  it('finds the Monday that starts a week', () => {
    expect(weekStart(WEEK.monday)).toBe(WEEK.monday);
    expect(weekStart(WEEK.sunday)).toBe(WEEK.monday);
    expect(weekStart(WEEK.nextMonday)).toBe(WEEK.nextMonday);
    expect(weekStart('2026-01-01')).toBe('2025-12-29');
  });
  it('knows the 2026 DST Sundays are Sundays', () => {
    for (const d of Object.values(DST)) expect(weekdayIndex(d)).toBe(6);
  });
});

describe('ranges and months', () => {
  it('lists an inclusive range', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(dateRange('2026-10-20', '2026-10-20')).toEqual(['2026-10-20']);
    expect(dateRange('2026-10-21', '2026-10-20')).toEqual([]);
  });
  it('crosses the year end', () => {
    expect(dateRange(YEAR_END[0] ?? '', YEAR_END.at(-1) ?? '')).toEqual(YEAR_END);
  });
  it('lists every day of a month', () => {
    expect(monthDates(2026, 2)).toHaveLength(28);
    expect(monthDates(2024, 2)).toHaveLength(29);
    expect(monthDates(2026, 10)).toHaveLength(31);
    expect(monthDates(2026, 10)[0]).toBe('2026-10-01');
    expect(monthDates(2026, 12).at(-1)).toBe('2026-12-31');
  });
});

describe('localDateOf (time zones and daylight saving)', () => {
  it('reads the civil date in the given zone around the New York spring-forward night', () => {
    for (const { iso, localDate } of NEW_YORK_SPRING_INSTANTS) {
      expect(localDateOf(Date.parse(iso), 'America/New_York'), iso).toBe(localDate);
    }
  });
  it('keeps the repeated fall-back hour on a single date', () => {
    for (const { iso, localDate } of NEW_YORK_FALL_INSTANTS) {
      expect(localDateOf(Date.parse(iso), 'America/New_York'), iso).toBe(localDate);
    }
  });
  it('gives different dates for the same instant in different zones', () => {
    const t = Date.parse(TZ_CHANGE.played.iso);
    expect(localDateOf(t, TZ_CHANGE.played.zone)).toBe(TZ_CHANGE.played.localDate);
    expect(localDateOf(t, TZ_CHANGE.next.zone)).toBe(TZ_CHANGE.next.localDate);
  });
  it('accepts a Date', () => {
    expect(localDateOf(new Date('2026-10-20T12:00:00Z'), 'UTC')).toBe('2026-10-20');
  });
});

describe('clocks', () => {
  it('a fake clock moves only when told to', () => {
    const c = fakeClock(Date.parse('2026-10-20T08:00:00Z'), 'UTC');
    expect(c.today()).toBe('2026-10-20');
    c.advance(16 * 3_600_000);
    expect(c.today()).toBe('2026-10-21');
    c.set(Date.parse('2026-10-20T08:00:00Z'));
    expect(c.now()).toBe(Date.parse('2026-10-20T08:00:00Z'));
  });
  it('follows a time-zone change between days', () => {
    const c = fakeClock(Date.parse(TZ_CHANGE.played.iso), TZ_CHANGE.played.zone);
    expect(c.today()).toBe(TZ_CHANGE.played.localDate);
    c.setTimeZone(TZ_CHANGE.next.zone);
    expect(c.today()).toBe(TZ_CHANGE.next.localDate);
  });
  it('the real clock agrees with Date.now', () => {
    const c = realClock('UTC');
    expect(Math.abs(c.now() - Date.now())).toBeLessThan(1000);
    expect(isLocalDate(c.today())).toBe(true);
  });
});
