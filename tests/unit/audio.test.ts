import { describe, expect, it, vi } from 'vitest';
import {
  AudioManifestSchema,
  EMPTY_MANIFEST,
  clipFor,
  clipUrl,
  durationOfFrom,
  missingClips,
  urlsForLines,
  type AudioManifest,
} from '../../src/domain/audio/manifest';
import { clipKey, resolveVariant, type ResolvedLine } from '../../src/domain/scenario/expand';
import { estimateDurationMs, planTimeline } from '../../src/domain/scenario/timeline';
import {
  BED_GAIN,
  CLICK_MS,
  CUT_STOP_AFTER_S,
  CUT_TIME_CONSTANT_S,
  CallAudioEngine,
  SCHEDULE_LEAD_S,
} from '../../src/audio/engine';
import { CHEER_MIME_PREFERENCE, chooseAudioFormat, chooseCheerMime } from '../../src/audio/formats';
import { PHONE_FILTER, createPhoneFilter } from '../../src/audio/phoneFilter';
import { createCallPort } from '../../src/audio/port';
import {
  CHEER_BITS_PER_SECOND,
  CHEER_MAX_MS,
  recordCheer,
  type RecorderFactory,
  type RecorderLike,
} from '../../src/audio/recorder';
import { RING, RingTone, ringWindows } from '../../src/audio/ring';
import {
  READ_ALONG_BANNER,
  createSpeechFallback,
  localEnglishVoices,
  pickVoice,
  type SpeechLike,
  type VoiceLike,
} from '../../src/audio/speechFallback';
import { MINI_SCAM, MINI_TERMS } from './helpers/fixtures';
import { FakeAudioContext, asCtx, bytesOf } from './helpers/fakeAudio';

const scam = resolveVariant(MINI_SCAM, MINI_TERMS, 0);
const DURATIONS: Record<string, number> = {
  hello: 1000,
  intro: 2000,
  who: 1000,
  warning: 2400,
  ask: 3000,
  coda: 1500,
};
const durationOf = (l: { id: string }): number => DURATIONS[l.id] ?? 1000;

function manifestFor(lines: readonly ResolvedLine[], skip: string[] = []): AudioManifest {
  const clips: AudioManifest['clips'] = {};
  for (const l of lines) {
    if (skip.includes(l.id)) continue;
    clips[clipKey(l.voice, l.text)] = {
      opus: `${l.id}.webm`,
      aac: `${l.id}.m4a`,
      durationMs: durationOf(l),
      sha: 'a'.repeat(64),
      engine: 'sapi',
      voice: l.voice,
    };
  }
  return {
    version: 'test',
    filterVersion: 1,
    clips,
    beds: { callcentre: { opus: 'bed.webm', aac: 'bed.m4a', durationMs: 20_000, sha: 'b'.repeat(64) } },
  };
}

describe('audio manifest', () => {
  const manifest = manifestFor(scam.lines);
  it('finds a clip by voice and text, and builds its URL for each format', () => {
    const clip = clipFor(manifest, scam.lines[0] as ResolvedLine);
    expect(clip?.opus).toBe('hello.webm');
    const v = clip?.sha.slice(0, 12) ?? '';
    expect(v).toHaveLength(12);
    expect(clipUrl(clip as never, 'opus')).toBe(`/audio/hello.webm?v=${v}`);
    expect(clipUrl(clip as never, 'aac')).toBe(`/audio/hello.m4a?v=${v}`);
    expect(clipFor(manifest, { voice: 'zira-calm', text: 'something else' })).toBeUndefined();
  });
  it('takes durations from the manifest and estimates when a clip is missing', () => {
    const partial = manifestFor(scam.lines, ['ask']);
    const of = durationOfFrom(partial);
    expect(of(scam.lines[0] as ResolvedLine)).toBe(1000);
    const ask = scam.lines.find((l) => l.id === 'ask') as ResolvedLine;
    expect(of(ask)).toBe(estimateDurationMs(ask.text));
    expect(durationOfFrom(EMPTY_MANIFEST)(ask)).toBe(estimateDurationMs(ask.text));
  });
  it('lists the lines with no clip, and the URLs a call needs', () => {
    expect(missingClips(manifest, scam.lines)).toEqual([]);
    expect(missingClips(manifestFor(scam.lines, ['intro', 'coda']), scam.lines)).toEqual([1, 4]);
    expect(urlsForLines(manifest, scam.lines, 'aac').map((u) => u.split('?')[0])).toEqual(
      ['hello', 'intro', 'warning', 'ask', 'coda', 'who'].map((id) => `/audio/${id}.m4a`),
    );
    expect(urlsForLines(EMPTY_MANIFEST, scam.lines, 'opus')).toEqual([]);
  });
  it('validates the shape it loads', () => {
    expect(AudioManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      AudioManifestSchema.safeParse({
        ...manifest,
        clips: {
          x: {
            opus: '../evil.webm',
            aac: 'x.m4a',
            durationMs: 1,
            sha: 'a'.repeat(64),
            engine: 'sapi',
            voice: 'v',
          },
        },
      }).success,
    ).toBe(false);
    expect(
      AudioManifestSchema.safeParse({
        ...manifest,
        clips: {
          x: { opus: 'x.webm', aac: 'x.m4a', durationMs: 1, sha: 'short', engine: 'sapi', voice: 'v' },
        },
      }).success,
    ).toBe(false);
    expect(AudioManifestSchema.safeParse({ ...manifest, extra: 1 }).success).toBe(false);
    expect(AudioManifestSchema.parse({ version: 'v', filterVersion: 1, clips: {} }).beds).toEqual({});
  });
});

describe('format choice', () => {
  const can = (answer: string) => ({ canPlayType: () => answer });
  it('prefers Opus when the browser says probably or maybe, AAC otherwise (SPEC section 11)', () => {
    expect(chooseAudioFormat(can('probably'))).toBe('opus');
    expect(chooseAudioFormat(can('maybe'))).toBe('opus');
    expect(chooseAudioFormat(can(''))).toBe('aac');
  });
  it('honours a saved preference', () => {
    expect(chooseAudioFormat(can('probably'), 'aac')).toBe('aac');
    expect(chooseAudioFormat(can(''), 'opus')).toBe('opus');
  });
  it('records the cheer in Opus first, because Chromium ignores the bitrate cap for MP4 (30 KB vs the 8 KB link cap)', () => {
    expect(CHEER_MIME_PREFERENCE[0]).toBe('audio/webm;codecs=opus');
    expect(chooseCheerMime(() => true)).toBe('audio/webm;codecs=opus');
    expect(chooseCheerMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
    expect(chooseCheerMime((m) => m.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(chooseCheerMime((m) => m.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus');
    expect(chooseCheerMime(() => false)).toBeUndefined();
  });
});

describe('the call audio engine (AC-F2-2, ADR 3.2)', () => {
  function build(
    opts: { skip?: string[]; fail?: string[]; speech?: Parameters<typeof makeEngine>[0]['speech'] } = {},
  ) {
    return makeEngine({ ...opts });
  }
  function makeEngine(opts: {
    skip?: string[];
    fail?: string[];
    speech?: ConstructorParameters<typeof CallAudioEngine>[0]['speech'];
    withBed?: boolean;
  }) {
    const ctx = new FakeAudioContext();
    const fetched: string[] = [];
    for (const f of opts.fail ?? []) ctx.failDecodeFor.add(f);
    const timers = {
      pending: [] as { fn: () => void; ms: number }[],
      setTimeout(fn: () => void, ms: number) {
        this.pending.push({ fn, ms });
        return this.pending.length;
      },
      clearTimeout() {
        this.pending.length = 0;
      },
    };
    const engine = new CallAudioEngine({
      ctx: asCtx(ctx),
      manifest: manifestFor(scam.lines, opts.skip ?? []),
      format: 'opus',
      fetchBytes: (url) => {
        const path = url.split('?')[0] ?? url; // drop the ?v= render sha
        fetched.push(path);
        return Promise.resolve(bytesOf(path.replace('/audio/', '').replace('.webm', '')));
      },
      speech: opts.speech,
      timers,
    });
    return { ctx, engine, fetched, timers };
  }

  it('fetches and decodes each distinct clip once, in the chosen format', async () => {
    const { engine, fetched, ctx } = build();
    const r = await engine.prepare([...scam.lines, scam.lines[0] as ResolvedLine], 'callcentre');
    expect(r.missing).toBe(0);
    expect(fetched.filter((u) => u.endsWith('.webm')).sort()).toEqual([
      '/audio/ask.webm',
      '/audio/bed.webm',
      '/audio/coda.webm',
      '/audio/hello.webm',
      '/audio/intro.webm',
      '/audio/warning.webm',
      '/audio/who.webm',
    ]);
    expect(ctx.decoded).toContain('bed');
    expect(new Set(fetched).size).toBe(fetched.length); // the duplicate hello fetched once
  });
  it('counts clips that are missing or will not decode, without failing the call', async () => {
    const { engine } = build({ skip: ['intro'], fail: ['ask'] });
    const r = await engine.prepare(scam.lines);
    expect(r.missing).toBe(2);
  });
  it('unlocks a suspended context inside the gesture, once', async () => {
    const { engine, ctx } = build();
    await engine.unlock();
    await engine.unlock();
    expect(ctx.state).toBe('running');
    expect(ctx.resumed).toBe(1);
  });
  it('also resumes the iOS "interrupted" state', async () => {
    const { engine, ctx } = build();
    (ctx as unknown as { state: string }).state = 'interrupted';
    await engine.unlock();
    expect(ctx.resumed).toBe(1);
    expect(ctx.state).toBe('running');
  });

  it('schedules every line at its exact time on the audio clock', async () => {
    const { engine, ctx } = build();
    await engine.prepare(scam.lines);
    ctx.currentTime = 10;
    const plan = planTimeline(scam.lines, durationOf);
    engine.answer(plan);
    const starts = ctx.sources.map((s) => s.startedAt);
    const t0 = 10 + SCHEDULE_LEAD_S;
    expect(starts).toEqual(plan.map((l) => t0 + l.startMs / 1000));
    expect(starts[0]).toBeCloseTo(10.65, 6); // 600 ms lead-in after the 50 ms scheduling lead
  });
  it('reports call time from the same clock (nowMs) so captions and scoring cannot drift', async () => {
    const { engine, ctx } = build();
    await engine.prepare(scam.lines);
    ctx.currentTime = 5;
    engine.answer(planTimeline(scam.lines, durationOf));
    expect(engine.nowMs()).toBe(0); // before the first sample, never negative
    ctx.currentTime = 5 + SCHEDULE_LEAD_S + 2.5;
    expect(engine.nowMs()).toBeCloseTo(2500, 6);
  });
  it('mixes the ambience bed under the voice, looped', async () => {
    const { engine, ctx } = build();
    await engine.prepare(scam.lines, 'callcentre');
    engine.answer(planTimeline(scam.lines, durationOf));
    const bed = ctx.sources.find((s) => s.loop);
    expect(bed).toBeDefined();
    expect(bed?.startedAt).toBeCloseTo(SCHEDULE_LEAD_S, 6);
    expect(BED_GAIN).toBeCloseTo(10 ** (-24 / 20), 2); // -24 dB, ADR 3.2
    expect(ctx.gains.some((g) => g.gain.value === BED_GAIN)).toBe(true);
  });
  it('plays a call fine when the bed is missing', async () => {
    const { engine, ctx } = build();
    await engine.prepare(scam.lines, 'nonexistent-bed');
    engine.answer(planTimeline(scam.lines, durationOf));
    expect(ctx.sources.every((s) => !s.loop)).toBe(true);
    expect(ctx.sources).toHaveLength(5);
  });

  it('hang up ramps the master gain to silence in about 30 ms and plays the line click', async () => {
    const { engine, ctx } = build();
    await engine.prepare(scam.lines);
    engine.answer(planTimeline(scam.lines, durationOf));
    ctx.currentTime = 4;
    const before = ctx.sources.length;
    engine.cut();
    const master = ctx.gains[0];
    const ramp = master?.gain.calls.find((c) => c.fn === 'setTargetAtTime');
    expect(ramp?.args).toEqual([0, 4, CUT_TIME_CONSTANT_S]);
    // time constant 8 ms: -60 dB after about 7 time constants, below audibility within ~30 ms
    expect(1 - Math.exp(-0.03 / CUT_TIME_CONSTANT_S)).toBeGreaterThan(0.97);
    expect(CUT_STOP_AFTER_S).toBeLessThanOrEqual(0.05);
    for (const s of ctx.sources.slice(0, before))
      expect(s.stoppedAt).toBeLessThanOrEqual(4 + CUT_STOP_AFTER_S + 1e-9);
    const click = ctx.sources.at(-1);
    expect(click?.startedAt).toBeCloseTo(4 + CUT_STOP_AFTER_S, 6);
    expect(CLICK_MS).toBe(120);
  });
  it('a reply branch drops future clips, keeps the line that is speaking and schedules the new path', async () => {
    const { engine, ctx } = build();
    await engine.prepare(scam.lines);
    const plan = planTimeline(scam.lines, durationOf);
    engine.answer(plan);
    ctx.currentTime = SCHEDULE_LEAD_S + 3; // inside the intro line (1600+450 .. 4050 ms)
    const original = [...ctx.sources];
    const branch = planTimeline(scam.lines, durationOf, { choices: { intro: 0 } });
    engine.reschedule(branch, 4050);
    // lines after the intro that had been scheduled were stopped
    const stopped = original.filter((s) => s.stoppedAt !== undefined).length;
    expect(stopped).toBe(3); // warning, ask, coda
    // only lines starting at or after 4050 ms were scheduled again: who, warning, ask, coda
    expect(ctx.sources.length - original.length).toBe(4);
    const added = ctx.sources.slice(original.length).map((s) => s.startedAt);
    expect(added).toEqual(
      branch.filter((l) => l.startMs >= 4050).map((l) => SCHEDULE_LEAD_S + l.startMs / 1000),
    );
  });
  it('the caller finishing by itself lets the tail ring out and silences speech', async () => {
    const speech = { available: () => true, speak: vi.fn(), cancel: vi.fn() };
    const { engine, ctx } = build({ speech });
    await engine.prepare(scam.lines);
    engine.answer(planTimeline(scam.lines, durationOf));
    ctx.currentTime = 20;
    engine.finish();
    expect(speech.cancel).toHaveBeenCalled();
    expect(ctx.sources.every((s) => s.stoppedAt === 20.5)).toBe(true);
  });
  it('disposes the context', async () => {
    const { engine, ctx } = build();
    await engine.prepare(scam.lines);
    engine.answer(planTimeline(scam.lines, durationOf));
    await engine.dispose();
    expect(ctx.closed).toBe(true);
  });

  describe('fallback when a clip cannot be used (AC-F5-4)', () => {
    it('speaks a missing line through the local voice at the right moment', async () => {
      const speech = { available: () => true, speak: vi.fn(), cancel: vi.fn() };
      const { engine, ctx, timers } = build({ skip: ['ask'], speech });
      await engine.prepare(scam.lines);
      const plan = planTimeline(scam.lines, durationOf);
      engine.answer(plan);
      expect(ctx.sources).toHaveLength(4); // the other four lines
      expect(timers.pending).toHaveLength(1);
      const ask = plan.find((l) => l.id === 'ask');
      expect(timers.pending[0]?.ms).toBeCloseTo(
        (SCHEDULE_LEAD_S + (ask?.startMs ?? 0) / 1000 - ctx.currentTime) * 1000,
        3,
      );
      timers.pending[0]?.fn();
      expect(speech.speak).toHaveBeenCalledWith(
        ask ? scam.lines.find((l) => l.id === 'ask')?.text : '',
        'zira-calm',
      );
    });
    it('runs a captions-only read-along when no voice exists: nothing scheduled, nothing thrown', async () => {
      const speech = { available: () => false, speak: vi.fn(), cancel: vi.fn() };
      const { engine, ctx, timers } = build({ skip: ['ask', 'coda'], fail: ['intro'], speech });
      await engine.prepare(scam.lines);
      expect(() => {
        engine.answer(planTimeline(scam.lines, durationOf));
      }).not.toThrow();
      expect(speech.speak).not.toHaveBeenCalled();
      expect(timers.pending).toHaveLength(0);
      expect(ctx.sources.length).toBe(2);
    });
  });

  it('applies the telephone filter to runtime voices only when asked (family calls)', async () => {
    const ctx = new FakeAudioContext();
    const engine = new CallAudioEngine({
      ctx: asCtx(ctx),
      manifest: manifestFor(scam.lines),
      format: 'opus',
      fetchBytes: (u) => Promise.resolve(bytesOf(u)),
      filterRuntimeVoices: true,
    });
    await engine.prepare(scam.lines);
    engine.answer(planTimeline(scam.lines, durationOf));
    // each voice source feeds the filter input, which is a biquad (high-pass), not the voice gain directly
    const voice = ctx.sources[0];
    expect(voice?.connections[0]).toHaveProperty('Q');
  });
});

describe('the call port', () => {
  it('forwards every call to the engine and the ringtone', async () => {
    const ctx = new FakeAudioContext();
    const engine = new CallAudioEngine({
      ctx: asCtx(ctx),
      manifest: manifestFor(scam.lines),
      format: 'opus',
      fetchBytes: (u) => Promise.resolve(bytesOf(u)),
    });
    const ring = new RingTone({ ctx: asCtx(ctx), sound: true, vibrate: false });
    const port = createCallPort(engine, ring);
    port.ring();
    expect(ctx.oscillators).toHaveLength(2);
    port.stopRing();
    await engine.prepare(scam.lines);
    const plan = planTimeline(scam.lines, durationOf);
    port.answer(plan);
    expect(ctx.sources).toHaveLength(5);
    ctx.currentTime = 2;
    expect(port.nowMs()).toBeGreaterThan(0);
    port.reschedule(plan, 99_999);
    port.cut();
    port.finish();
  });
});

describe('ringtone (AC-F1-2)', () => {
  it('uses the North American cadence: 440 + 480 Hz, 2 s on, 4 s off', () => {
    expect(RING.freqs).toEqual([440, 480]);
    expect(RING.onMs).toBe(2000);
    expect(RING.offMs).toBe(4000);
    expect(ringWindows()).toEqual([
      { startMs: 0, endMs: 2000 },
      { startMs: 6000, endMs: 8000 },
      { startMs: 12_000, endMs: 14_000 },
      { startMs: 18_000, endMs: 20_000 },
    ]);
    expect(ringWindows(19_000).at(-1)).toEqual({ startMs: 18_000, endMs: 19_000 });
  });
  it('rings for at most 20 s and then stops by itself', () => {
    expect(RING.maxMs).toBe(20_000);
    const ctx = new FakeAudioContext();
    const tone = new RingTone({ ctx: asCtx(ctx), sound: true, vibrate: false });
    tone.start();
    for (const o of ctx.oscillators) expect(o.stoppedAt).toBeLessThanOrEqual(0.05 + 20.1 + 1e-9);
    expect(ctx.oscillators.map((o) => o.frequency.value)).toEqual([440, 480]);
  });
  it('vibrates once per ring cycle when vibration is on and available, and stops on silence', () => {
    const ctx = new FakeAudioContext();
    const timers = {
      fns: [] as { fn: () => void; ms: number }[],
      setTimeout(fn: () => void, ms: number) {
        this.fns.push({ fn, ms });
        return this.fns.length;
      },
      clearTimeout() {
        this.fns = [];
      },
    };
    const vibrator = { vibrate: vi.fn(() => true) };
    const tone = new RingTone({ ctx: asCtx(ctx), sound: true, vibrate: true, vibrator, timers });
    tone.start();
    expect(timers.fns.map((t) => t.ms)).toEqual([0, 6000, 12_000, 18_000]);
    timers.fns[1]?.fn();
    expect(vibrator.vibrate).toHaveBeenCalledWith([800, 400, 800]);
    tone.stop();
    expect(vibrator.vibrate).toHaveBeenLastCalledWith(0);
    expect(timers.fns).toEqual([]);
  });
  it('is silent when Sound is off, and does not vibrate when Vibrate is off or the API is absent', () => {
    const ctx = new FakeAudioContext();
    const vibrator = { vibrate: vi.fn(() => true) };
    const quiet = new RingTone({ ctx: asCtx(ctx), sound: false, vibrate: false, vibrator });
    quiet.start();
    expect(ctx.oscillators).toHaveLength(0);
    const ios = new RingTone({ ctx: asCtx(ctx), sound: true, vibrate: true, vibrator: undefined });
    expect(() => {
      ios.start();
      ios.stop();
    }).not.toThrow();
    expect(vibrator.vibrate).not.toHaveBeenCalledWith([800, 400, 800]);
  });
  it('stop is safe to call twice and when never started', () => {
    const ctx = new FakeAudioContext();
    const tone = new RingTone({ ctx: asCtx(ctx), sound: true, vibrate: false });
    expect(() => {
      tone.stop();
    }).not.toThrow();
    tone.start();
    tone.stop();
    expect(() => {
      tone.stop();
    }).not.toThrow();
  });
});

describe('telephone filter for runtime voices', () => {
  it('is a 300-3400 Hz band-pass plus a compressor, matching the build-time chain', () => {
    expect(PHONE_FILTER.highpassHz).toBe(300);
    expect(PHONE_FILTER.lowpassHz).toBe(3400);
    const ctx = new FakeAudioContext();
    const f = createPhoneFilter(asCtx(ctx));
    expect(f.input).not.toBe(f.output);
    const high = f.input as unknown as { type: string; frequency: { value: number }; connections: unknown[] };
    expect(high.type).toBe('highpass');
    expect(high.frequency.value).toBe(300);
    const low = high.connections[0] as { type: string; frequency: { value: number } };
    expect(low.type).toBe('lowpass');
    expect(low.frequency.value).toBe(3400);
  });
});

describe('speech fallback (local voices only)', () => {
  const voices: VoiceLike[] = [
    { name: 'Cloud English', lang: 'en-US', localService: false },
    { name: 'Zeta', lang: 'en-GB', localService: true },
    { name: 'Alpha', lang: 'en-US', localService: true, default: true },
    { name: 'Deutsch', lang: 'de-DE', localService: true },
  ];
  it('keeps only local English voices, default first', () => {
    expect(localEnglishVoices(voices).map((v) => v.name)).toEqual(['Alpha', 'Zeta']);
    expect(localEnglishVoices([{ name: 'Net', lang: 'en', localService: false }])).toEqual([]);
  });
  it('never picks a network voice', () => {
    for (const id of ['zira-calm', 'david-firm', 'mark-casual', 'ivr', 'family', 'x']) {
      expect(pickVoice(voices, id)?.localService).toBe(true);
    }
    expect(pickVoice([voices[0] as VoiceLike], 'zira-calm')).toBeUndefined();
  });
  it('gives one caller the same voice every time', () => {
    expect(pickVoice(voices, 'david-firm')).toBe(pickVoice(voices, 'david-firm'));
  });
  it('speaks through the chosen voice, and reports when there is none', () => {
    const spoken: SpeechSynthesisUtterance[] = [];
    const synth: SpeechLike = {
      speak: (u) => spoken.push(u),
      cancel: vi.fn(),
      getVoices: () => voices as SpeechSynthesisVoice[],
    };
    const make = (t: string) => ({ text: t }) as SpeechSynthesisUtterance;
    const fb = createSpeechFallback(synth, make);
    expect(fb.available()).toBe(true);
    fb.speak('Hello there', 'zira-calm');
    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.text).toBe('Hello there');
    expect((spoken[0]?.voice as unknown as VoiceLike).localService).toBe(true);
    expect(spoken[0]?.rate).toBe(0.95);
    fb.cancel();
    expect(synth.cancel).toHaveBeenCalled();

    const none = createSpeechFallback(
      { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [voices[0] as SpeechSynthesisVoice] },
      make,
    );
    expect(none.available()).toBe(false);
    none.speak('x', 'y');
    expect(createSpeechFallback(undefined).available()).toBe(false);
    expect(() => {
      createSpeechFallback(undefined).speak('x', 'y');
      createSpeechFallback(undefined).cancel();
    }).not.toThrow();
    expect(READ_ALONG_BANNER).toBe('Read-along call: your phone has no built-in voice.');
  });
});

describe('cheer recorder (AC-F8-2)', () => {
  class FakeRecorder implements RecorderLike {
    state = 'inactive';
    mimeType = '';
    ondataavailable: RecorderLike['ondataavailable'] = null;
    onstop: RecorderLike['onstop'] = null;
    onerror: RecorderLike['onerror'] = null;
    constructor(public readonly options: { mimeType: string; audioBitsPerSecond: number }) {
      this.mimeType = options.mimeType;
    }
    start(): void {
      this.state = 'recording';
    }
    stop(): void {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([Uint8Array.from([1, 2, 3, 4])]) });
      this.onstop?.();
    }
  }
  const stream = () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    return { stream: { getTracks: () => tracks } as unknown as MediaStream, tracks };
  };
  const timers = () => ({
    at: [] as { fn: () => void; ms: number }[],
    cleared: 0,
    setTimeout(fn: () => void, ms: number) {
      this.at.push({ fn, ms });
      return this.at.length;
    },
    clearTimeout() {
      this.cleared++;
    },
  });

  it('hard-stops at 2.5 s at 12 kbps in Opus when available', async () => {
    expect(CHEER_MAX_MS).toBe(2500);
    expect(CHEER_BITS_PER_SECOND).toBe(12_000);
    const t = timers();
    const s = stream();
    let made: FakeRecorder | undefined;
    const create: RecorderFactory = (_s, options) => (made = new FakeRecorder(options));
    const rec = recordCheer({ stream: s.stream, isTypeSupported: () => true, create, timers: t });
    expect(made?.options).toEqual({ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 12_000 });
    expect(made?.state).toBe('recording');
    expect(t.at.map((x) => x.ms)).toEqual([2500]);
    t.at[0]?.fn(); // the hard stop fires
    const result = await rec.done;
    expect(result.mime).toBe('audio/webm;codecs=opus');
    expect(result.blob.size).toBe(4);
    expect(result.durationMs).toBeLessThanOrEqual(2500);
    for (const track of s.tracks) expect(track.stop).toHaveBeenCalled(); // the microphone is released
  });
  it('the coach can stop early; stopping twice is harmless', async () => {
    const s = stream();
    const rec = recordCheer({
      stream: s.stream,
      isTypeSupported: (m) => m.startsWith('audio/webm'),
      create: (_s, o) => new FakeRecorder(o),
      timers: timers(),
    });
    rec.stop();
    rec.stop();
    const result = await rec.done;
    expect(result.mime).toBe('audio/webm;codecs=opus');
  });
  it('refuses when the browser can record nothing we can play back', () => {
    expect(() =>
      recordCheer({ stream: stream().stream, isTypeSupported: () => false, timers: timers() }),
    ).toThrow(/cannot record/);
  });
  it('reports a recorder error', async () => {
    let made: FakeRecorder | undefined;
    const rec = recordCheer({
      stream: stream().stream,
      isTypeSupported: () => true,
      create: (_s, o) => (made = new FakeRecorder(o)),
      timers: timers(),
    });
    made?.onerror?.(new Error('mic gone'));
    await expect(rec.done).rejects.toThrow('mic gone');
  });
});
