import { clipFor, clipUrl, type AudioFormat, type AudioManifest } from '../domain/audio/manifest';
import type { SpeechFallback } from './speechFallback';

/** Plays one line on its own (the replay's "Play this line"). Only one line plays at a time. */
export interface LinePlayer {
  play(line: { voice: string; text: string }): Promise<boolean>;
  stop(): void;
  dispose(): void;
}

export function createLinePlayer(opts: {
  manifest: AudioManifest;
  format: AudioFormat;
  speech: SpeechFallback | undefined;
}): LinePlayer {
  let ctx: AudioContext | undefined;
  let source: AudioBufferSourceNode | undefined;
  const cache = new Map<string, AudioBuffer>();

  const stop = (): void => {
    try {
      source?.stop();
    } catch {
      /* already stopped */
    }
    source = undefined;
    opts.speech?.cancel();
  };

  return {
    async play(line) {
      stop();
      const clip = clipFor(opts.manifest, line);
      if (clip && typeof AudioContext !== 'undefined') {
        try {
          ctx ??= new AudioContext();
          await ctx.resume();
          const url = clipUrl(clip, opts.format);
          let buffer = cache.get(url);
          if (!buffer) {
            const res = await fetch(url);
            if (!res.ok) throw new Error('clip');
            buffer = await ctx.decodeAudioData(await res.arrayBuffer());
            cache.set(url, buffer);
          }
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(ctx.destination);
          src.start();
          source = src;
          return true;
        } catch {
          /* fall through to the phone's own voice */
        }
      }
      if (opts.speech?.available() === true) {
        opts.speech.speak(line.text, line.voice);
        return true;
      }
      return false;
    },
    stop,
    dispose() {
      stop();
      void ctx?.close().catch(() => undefined);
      ctx = undefined;
    },
  };
}
