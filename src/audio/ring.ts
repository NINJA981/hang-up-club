/**
 * The ringtone is synthesised, with no asset (ADR §3.2): two oscillators at
 * 440 and 480 Hz (the North American ring) for 2 s on and 4 s off.
 */
export const RING = {
  freqs: [440, 480],
  onMs: 2000,
  offMs: 4000,
  /** navigator.vibrate pattern, once per ring cycle. */
  vibrate: [800, 400, 800],
  gain: 0.12,
  /** Ringing stops after this long and the screen keeps waiting (AC-F1-2). */
  maxMs: 20_000,
} as const;

export interface RingWindow {
  startMs: number;
  endMs: number;
}

/** The on-windows of the cadence within `totalMs` (clipped at the end). */
export function ringWindows(totalMs: number = RING.maxMs): RingWindow[] {
  const out: RingWindow[] = [];
  const cycle = RING.onMs + RING.offMs;
  for (let start = 0; start < totalMs; start += cycle) {
    out.push({ startMs: start, endMs: Math.min(start + RING.onMs, totalMs) });
  }
  return out;
}

export interface Vibrator {
  vibrate(pattern: number | readonly number[]): boolean;
}

export interface RingOptions {
  ctx: AudioContext;
  /** Settings → Sound. */
  sound: boolean;
  /** Settings → Vibrate, and only where the API exists (absent on iOS). */
  vibrate: boolean;
  vibrator?: Vibrator | undefined;
  timers?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void };
}

export class RingTone {
  private oscillators: OscillatorNode[] = [];
  private gain: GainNode | undefined;
  private handles: unknown[] = [];
  private readonly timers: NonNullable<RingOptions['timers']>;

  constructor(private readonly opts: RingOptions) {
    this.timers = opts.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => {
        clearTimeout(h as ReturnType<typeof setTimeout>);
      },
    };
  }

  start(): void {
    const { ctx, sound, vibrate, vibrator } = this.opts;
    const windows = ringWindows();
    if (sound) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      this.gain = gain;
      const t0 = ctx.currentTime + 0.05;
      for (const w of windows) {
        const on = t0 + w.startMs / 1000;
        const off = t0 + w.endMs / 1000;
        gain.gain.setTargetAtTime(RING.gain, on, 0.01);
        gain.gain.setTargetAtTime(0, off, 0.01);
      }
      for (const f of RING.freqs) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        osc.connect(gain);
        osc.start(t0);
        osc.stop(t0 + RING.maxMs / 1000 + 0.1);
        this.oscillators.push(osc);
      }
    }
    if (vibrate && vibrator) {
      for (const w of windows) {
        this.handles.push(
          this.timers.setTimeout(() => {
            vibrator.vibrate(RING.vibrate);
          }, w.startMs),
        );
      }
    }
  }

  stop(): void {
    const { ctx, vibrator } = this.opts;
    for (const h of this.handles) this.timers.clearTimeout(h);
    this.handles = [];
    if (this.gain) {
      this.gain.gain.cancelScheduledValues(ctx.currentTime);
      this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
    }
    for (const osc of this.oscillators) {
      try {
        osc.stop(ctx.currentTime + 0.05);
      } catch {
        /* already stopped */
      }
    }
    this.oscillators = [];
    this.gain = undefined;
    vibrator?.vibrate(0);
  }
}
