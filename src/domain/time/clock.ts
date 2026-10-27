import { localDateOf, type LocalDate } from './dates';

/** Injectable wall clock, so the scheduler, streak and tests share one notion of "now". */
export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
  /** The civil date "today" in the clock's time zone. */
  today(): LocalDate;
}

export function realClock(timeZone?: string): Clock {
  return {
    now: () => Date.now(),
    today: () => localDateOf(Date.now(), timeZone),
  };
}

export interface FakeClock extends Clock {
  advance(ms: number): void;
  set(ms: number): void;
  setTimeZone(timeZone: string | undefined): void;
}

export function fakeClock(startMs: number, timeZone?: string): FakeClock {
  let t = startMs;
  let tz = timeZone;
  return {
    now: () => t,
    today: () => localDateOf(t, tz),
    advance: (ms) => {
      t += ms;
    },
    set: (ms) => {
      t = ms;
    },
    setTimeZone: (zone) => {
      tz = zone;
    },
  };
}
