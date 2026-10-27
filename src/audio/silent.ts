import type { CallPort } from '../state/callController';
import { RING, ringWindows, type Vibrator } from './ring';

/**
 * A call port with no sound (ADR section 5, `?test=1`, and Settings -> Sound
 * off). The clock is real, so timing, scoring and captions behave exactly as
 * in a voiced call; only the audio is missing. When vibration is on, the
 * ring still buzzes where the browser allows it.
 */
export interface SilentPortOptions {
  now?: () => number;
  vibrate?: boolean;
  vibrator?: Vibrator | undefined;
  timers?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void };
}

export function createSilentPort(opts: SilentPortOptions = {}): CallPort {
  const now = opts.now ?? ((): number => performance.now());
  const timers = opts.timers ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => {
      clearTimeout(h as ReturnType<typeof setTimeout>);
    },
  };
  let t0 = 0;
  let handles: unknown[] = [];
  const clear = (): void => {
    for (const h of handles) timers.clearTimeout(h);
    handles = [];
    opts.vibrator?.vibrate(0);
  };
  return {
    ring() {
      const { vibrator } = opts;
      if (opts.vibrate !== true || !vibrator) return;
      for (const w of ringWindows()) {
        handles.push(
          timers.setTimeout(() => {
            vibrator.vibrate(RING.vibrate);
          }, w.startMs),
        );
      }
    },
    stopRing: clear,
    answer() {
      t0 = now();
    },
    reschedule() {
      /* nothing is scheduled: there is no sound */
    },
    nowMs: () => Math.max(0, now() - t0),
    cut() {
      /* silence is already silent */
    },
    finish() {
      /* nothing to stop */
    },
  };
}
