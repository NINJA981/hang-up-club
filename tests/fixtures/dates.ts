import type { LocalDate } from '../../src/domain/time/dates';

/**
 * Date sequences for the streak and clock tests (ADR §6). Hand-written;
 * the DST dates are the 2026 transitions.
 */

/** US spring forward: Sun 2026-03-08. EU: Sun 2026-03-29. US fall back: Sun 2026-11-01. EU: Sun 2026-10-25. */
export const DST = {
  usSpring: '2026-03-08',
  usFall: '2026-11-01',
  euSpring: '2026-03-29',
  euFall: '2026-10-25',
} as const;

/** Instants (UTC ms) around the New York spring-forward night and which civil date they fall on there. */
export const NEW_YORK_SPRING_INSTANTS: { iso: string; localDate: LocalDate }[] = [
  { iso: '2026-03-08T04:59:00Z', localDate: '2026-03-07' }, // 23:59 EST on the 7th
  { iso: '2026-03-08T05:00:00Z', localDate: '2026-03-08' }, // 00:00 EST
  { iso: '2026-03-08T06:59:00Z', localDate: '2026-03-08' }, // 01:59 EST
  { iso: '2026-03-08T07:00:00Z', localDate: '2026-03-08' }, // 03:00 EDT (02:00 never exists)
  { iso: '2026-03-09T03:59:00Z', localDate: '2026-03-08' }, // 23:59 EDT
  { iso: '2026-03-09T04:00:00Z', localDate: '2026-03-09' }, // 00:00 EDT
];

/** The repeated hour on the New York fall-back night: 01:30 happens twice, on the same date. */
export const NEW_YORK_FALL_INSTANTS: { iso: string; localDate: LocalDate }[] = [
  { iso: '2026-11-01T04:30:00Z', localDate: '2026-11-01' }, // 00:30 EDT
  { iso: '2026-11-01T05:30:00Z', localDate: '2026-11-01' }, // 01:30 EDT
  { iso: '2026-11-01T06:30:00Z', localDate: '2026-11-01' }, // 01:30 EST (second time)
  { iso: '2026-11-02T04:59:00Z', localDate: '2026-11-01' }, // 23:59 EST
  { iso: '2026-11-02T05:00:00Z', localDate: '2026-11-02' }, // 00:00 EST
];

/** A traveller plays at 22:00 in Chicago (UTC-5, CDT) and the next day opens the app in Kolkata (UTC+5:30). */
export const TZ_CHANGE = {
  played: { iso: '2026-05-10T03:00:00Z', zone: 'America/Chicago', localDate: '2026-05-09' },
  next: { iso: '2026-05-10T03:00:00Z', zone: 'Asia/Kolkata', localDate: '2026-05-10' },
} as const;

/** Mon 2026-10-19 .. Sun 2026-10-25 is one calendar week (Mon-Sun); 2026-10-26 starts the next. */
export const WEEK = {
  monday: '2026-10-19',
  sunday: '2026-10-25',
  nextMonday: '2026-10-26',
} as const;

export const YEAR_END: LocalDate[] = ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'];
