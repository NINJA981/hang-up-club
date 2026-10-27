import { clipFor, clipUrl, type AudioFormat, type AudioManifest } from '../domain/audio/manifest';
import type { ResolvedLine } from '../domain/scenario/expand';
import type { TimedLine } from '../domain/scenario/timeline';
import type { CallPort } from '../state/callController';
import { createPhoneFilter } from './phoneFilter';
import type { SpeechFallback } from './speechFallback';

/** Voice level relative to the ambience bed (ADR §3.2: bed at -24 dB). */
export const BED_GAIN = 0.063;
/** Gain ramp for a hang-up: time constant 8 ms ≈ 30 ms to silence (AC-F2-2). */
export const CUT_TIME_CONSTANT_S = 0.008;
export const CUT_STOP_AFTER_S = 0.05;
/** Silence before the first scheduled sample, so scheduling never lands in the past. */
export const SCHEDULE_LEAD_S = 0.05;
export const CLICK_MS = 120;

export interface EngineOptions {
  ctx: AudioContext;
  manifest: AudioManifest;
  format: AudioFormat;
  /** Same-origin only. The service worker serves these from its cache when offline. */
  fetchBytes: (url: string) => Promise<ArrayBuffer>;
  speech?: SpeechFallback | undefined;
  /** Runtime voices (family calls) get the phone filter; pre-rendered clips already have it. */
  filterRuntimeVoices?: boolean;
  timers?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void };
}

interface Scheduled {
  source: AudioBufferSourceNode;
  whenS: number;
}

/**
 * The call's Web Audio graph (ADR §3.2):
 *
 *   clip sources ─▶ voiceGain ─┐
 *   bed loop ─────▶ bedGain ───┴▶ masterGain ─▶ compressor ─▶ destination
 *
 * All times are milliseconds since the Answer gesture, mapped onto
 * `ctx.currentTime`, the same clock the sound is scheduled on.
 */
export class CallAudioEngine implements Pick<CallPort, 'answer' | 'reschedule' | 'nowMs' | 'cut' | 'finish'> {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly voiceGain: GainNode;
  private readonly bedGain: GainNode;
  private readonly buffers = new Map<string, AudioBuffer | null>();
  private bedBuffer: AudioBuffer | null = null;
  private bedSource: AudioBufferSourceNode | undefined;
  private scheduled: Scheduled[] = [];
  private fallbackHandles: unknown[] = [];
  private answerAtS = 0;
  private readonly phone: ReturnType<typeof createPhoneFilter> | undefined;
  private readonly timers: NonNullable<EngineOptions['timers']>;

  constructor(private readonly opts: EngineOptions) {
    const { ctx } = opts;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.voiceGain = ctx.createGain();
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = BED_GAIN;
    const compressor = ctx.createDynamicsCompressor();
    this.voiceGain.connect(this.master);
    this.bedGain.connect(this.master);
    if (opts.filterRuntimeVoices === true) {
      this.phone = createPhoneFilter(ctx);
      this.phone.output.connect(this.voiceGain);
    }
    this.master.connect(compressor);
    compressor.connect(ctx.destination);
    this.timers = opts.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => {
        clearTimeout(h as ReturnType<typeof setTimeout>);
      },
    };
  }

  /** Inside the Answer gesture: iOS only lets audio start after a user action. */
  async unlock(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  /**
   * Fetch and decode every clip the call can play, ahead of time. A clip that
   * is missing or will not decode is stored as `null`: that line falls back to
   * Web Speech, or the call runs as a captions-only read-along.
   */
  async prepare(
    lines: readonly Pick<ResolvedLine, 'voice' | 'text'>[],
    bed?: string,
  ): Promise<{ missing: number }> {
    let missing = 0;
    await Promise.all(
      lines.map(async (line) => {
        const clip = clipFor(this.opts.manifest, line);
        const key = this.bufferKey(line);
        if (this.buffers.has(key)) return;
        if (!clip) {
          this.buffers.set(key, null);
          missing += 1;
          return;
        }
        this.buffers.set(key, null); // claim the slot so duplicate lines fetch once
        try {
          const bytes = await this.opts.fetchBytes(clipUrl(clip, this.opts.format));
          this.buffers.set(key, await this.ctx.decodeAudioData(bytes));
        } catch {
          missing += 1;
        }
      }),
    );
    const bedDef = bed ? this.opts.manifest.beds[bed] : undefined;
    if (bedDef) {
      try {
        const url = `/audio/${this.opts.format === 'opus' ? bedDef.opus : bedDef.aac}`;
        this.bedBuffer = await this.ctx.decodeAudioData(await this.opts.fetchBytes(url));
      } catch {
        this.bedBuffer = null; // a call without ambience is still a call
      }
    }
    return { missing };
  }

  private bufferKey(line: Pick<ResolvedLine, 'voice' | 'text'>): string {
    return `${line.voice}␟${line.text}`;
  }

  answer(plan: readonly TimedLine[]): void {
    this.answerAtS = this.ctx.currentTime + SCHEDULE_LEAD_S;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.value = 1;
    if (this.bedBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.bedBuffer;
      src.loop = true;
      src.connect(this.bedGain);
      src.start(this.answerAtS);
      this.bedSource = src;
    }
    this.scheduleFrom(plan, 0);
  }

  reschedule(plan: readonly TimedLine[], fromMs: number): void {
    this.dropFuture();
    this.scheduleFrom(plan, fromMs);
  }

  nowMs(): number {
    return Math.max(0, (this.ctx.currentTime - this.answerAtS) * 1000);
  }

  /** Start every line whose start is at or after `fromMs`. */
  private scheduleFrom(plan: readonly TimedLine[], fromMs: number): void {
    const filter = this.phone;
    for (const line of plan) {
      if (line.startMs < fromMs) continue;
      const whenS = this.answerAtS + line.startMs / 1000;
      const buffer = this.buffers.get(this.bufferKey(line)) ?? null;
      if (buffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(filter ? filter.input : this.voiceGain);
        src.start(Math.max(whenS, this.ctx.currentTime));
        this.scheduled.push({ source: src, whenS });
      } else if (this.opts.speech?.available() === true) {
        const speech = this.opts.speech;
        const delay = Math.max(0, (whenS - this.ctx.currentTime) * 1000);
        this.fallbackHandles.push(
          this.timers.setTimeout(() => {
            speech.speak(line.text, line.voice);
          }, delay),
        );
      }
      // else: captions-only read-along; the line is simply not voiced.
    }
  }

  /** Stop everything that has not started yet; a line already speaking finishes. */
  private dropFuture(): void {
    const now = this.ctx.currentTime;
    this.scheduled = this.scheduled.filter((s) => {
      if (s.whenS > now) {
        try {
          s.source.stop();
        } catch {
          /* never started */
        }
        return false;
      }
      return true;
    });
    for (const h of this.fallbackHandles) this.timers.clearTimeout(h);
    this.fallbackHandles = [];
  }

  /** Hang up: silence within ≈ 30 ms, then a short line click. */
  cut(): void {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, CUT_TIME_CONSTANT_S);
    this.stopAll(now + CUT_STOP_AFTER_S);
    this.opts.speech?.cancel();
    this.playClick(now + CUT_STOP_AFTER_S);
  }

  /** The caller finished on their own. */
  finish(): void {
    this.stopAll(this.ctx.currentTime + 0.5);
    this.opts.speech?.cancel();
  }

  private stopAll(atS: number): void {
    for (const s of this.scheduled) {
      try {
        s.source.stop(atS);
      } catch {
        /* never started */
      }
    }
    this.scheduled = [];
    for (const h of this.fallbackHandles) this.timers.clearTimeout(h);
    this.fallbackHandles = [];
    try {
      this.bedSource?.stop(atS);
    } catch {
      /* not started */
    }
    this.bedSource = undefined;
  }

  /** A 120 ms burst of decaying noise: the sound of the line dropping. */
  private playClick(atS: number): void {
    const rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.round((rate * CLICK_MS) / 1000));
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.18;
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(atS);
  }

  async dispose(): Promise<void> {
    this.stopAll(this.ctx.currentTime);
    await this.ctx.close();
  }
}
