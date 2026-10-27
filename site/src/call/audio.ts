/*
 * Optional sound for the demo. Off by default; nothing is fetched until the visitor
 * turns Sound on. The clips are the app's own rendered S01 lines (Opus, with AAC for
 * browsers that cannot decode Opus in WebM), about 90 KB in total, same origin.
 */
import { S01 } from './logic';

type Format = 'opus' | 'aac';

function pickFormat(): Format {
  try {
    const a = document.createElement('audio');
    return a.canPlayType('audio/webm; codecs="opus"') !== '' ? 'opus' : 'aac';
  } catch {
    return 'aac';
  }
}

export class DemoAudio {
  enabled = false;
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private buffers = new Map<string, AudioBuffer>();
  private live = new Set<AudioBufferSourceNode>();
  private loading: Promise<void> | undefined;

  /** Must be called from a user gesture (a click on the Sound toggle). */
  async enable(): Promise<boolean> {
    const Ctor = window.AudioContext;
    if (typeof Ctor !== 'function') return false;
    this.ctx ??= new Ctor();
    this.master ??= this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    await this.ctx.resume();
    this.loading ??= this.load();
    try {
      await this.loading;
    } catch {
      this.loading = undefined;
      return false;
    }
    this.enabled = true;
    return true;
  }

  disable(): void {
    this.enabled = false;
    this.stop(0);
  }

  private async load(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const fmt = pickFormat();
    const items: { id: string; file: string | undefined }[] = [
      ...S01.lines.map((l) => ({ id: l.id, file: l[fmt] })),
      ...S01.callback.ivr.map((l) => ({ id: l.id, file: l[fmt] })),
    ];
    await Promise.all(
      items.map(async ({ id, file }) => {
        if (!file) return;
        const res = await fetch(new URL(`audio/demo/${file}`, document.baseURI));
        if (!res.ok) throw new Error(`clip ${id}`);
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(id, buf);
      }),
    );
  }

  play(id: string): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(id);
    if (!this.enabled || !ctx || !this.master || !buf) return;
    this.stop(0);
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(1, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master);
    src.onended = () => this.live.delete(src);
    this.live.add(src);
    src.start();
  }

  /** Cut the line in about 30 ms, like a real hang-up. */
  stop(rampSeconds = 0.03): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (rampSeconds > 0) {
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.setValueAtTime(this.master.gain.value, ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0, ctx.currentTime + rampSeconds);
    }
    for (const s of this.live) {
      try {
        s.stop(ctx.currentTime + rampSeconds);
      } catch {
        /* already stopped */
      }
    }
    this.live.clear();
  }

  /** A short synthesised line click, 120 ms. */
  click(): void {
    const ctx = this.ctx;
    if (!this.enabled || !ctx) return;
    const n = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-i / n) * 14);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    src.connect(band).connect(g).connect(ctx.destination);
    src.start();
  }

  suspend(): void {
    void this.ctx?.suspend();
  }
  resume(): void {
    if (this.enabled) void this.ctx?.resume();
  }
}
