import type { AudioFormat, AudioManifest } from '../domain/audio/manifest';
import type { ResolvedLine } from '../domain/scenario/expand';
import { CallAudioEngine } from '../audio/engine';
import { chooseAudioFormat } from '../audio/formats';
import { createCallPort } from '../audio/port';
import { RingTone } from '../audio/ring';
import { createSilentPort } from '../audio/silent';
import { createSpeechFallback, type SpeechFallback } from '../audio/speechFallback';
import type { CallPort } from '../state/callController';
import type { Settings } from '../storage/schemas';
import type { AppParams } from './params';

/** Everything a call needs from sound, behind one interface so tests and silent mode swap it. */
export interface CallAudio {
  port: CallPort;
  /** Fetch and decode every clip; returns how many lines have no clip (they fall back to the phone's voice). */
  prepare(
    lines: readonly Pick<ResolvedLine, 'voice' | 'text'>[],
    bed: string | undefined,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ missing: number }>;
  /** True when some voice (a clip or a local speech voice) can say the lines. */
  canSpeak(missing: number, total: number): boolean;
  dispose(): void;
}

function vibratorOf(): { vibrate(p: number | readonly number[]): boolean } | undefined {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return undefined;
  return { vibrate: (p) => navigator.vibrate(p as number | number[]) };
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
  return res.arrayBuffer();
}

/**
 * Build the audio for one call. Must run inside the tap that starts the call,
 * so the AudioContext may start (iOS).
 */
export function createCallAudio(opts: {
  manifest: AudioManifest;
  settings: Settings;
  params: AppParams;
}): CallAudio {
  const { settings, params, manifest } = opts;
  const vibrator = settings.vibrate ? vibratorOf() : undefined;

  if (params.test || !settings.sound || typeof AudioContext === 'undefined') {
    return {
      port: createSilentPort({ vibrate: settings.vibrate, vibrator }),
      prepare: () => Promise.resolve({ missing: 0 }),
      canSpeak: () => true,
      dispose() {
        /* nothing to release */
      },
    };
  }

  const ctx = new AudioContext();
  void ctx.resume();
  const format: AudioFormat = chooseAudioFormat(document.createElement('audio'), settings.audioFormat);
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : undefined;
  const speech: SpeechFallback = createSpeechFallback(synth);
  const engine = new CallAudioEngine({ ctx, manifest, format, fetchBytes, speech });
  const ring = new RingTone({ ctx, sound: true, vibrate: settings.vibrate, vibrator });
  const port = createCallPort(engine, ring);
  return {
    port: {
      ...port,
      answer: (plan) => {
        void engine.unlock();
        port.answer(plan);
      },
    },
    prepare: (lines, bed, onProgress) => engine.prepare(lines, bed, onProgress),
    canSpeak: (missing, total) => missing < total || speech.available(),
    dispose() {
      void engine.dispose().catch(() => undefined);
    },
  };
}
