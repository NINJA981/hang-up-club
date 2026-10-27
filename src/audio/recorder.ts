import { chooseCheerMime } from './formats';

/** Coach setup records at most this long (SPEC F8, AC-F8-2). */
export const CHEER_MAX_MS = 2500;
/** ≈ 3-4 KB for 2.5 s, which keeps the cheer link far under its 8 KB cap. */
export const CHEER_BITS_PER_SECOND = 12_000;

export interface RecorderLike {
  state: string;
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}

export type RecorderFactory = (
  stream: MediaStream,
  options: { mimeType: string; audioBitsPerSecond: number },
) => RecorderLike;

export interface RecordOptions {
  stream: MediaStream;
  isTypeSupported: (mime: string) => boolean;
  create?: RecorderFactory;
  maxMs?: number;
  timers?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(h: unknown): void };
}

export interface Recording {
  blob: Blob;
  mime: string;
  /** Resolves when the recorder has stopped. */
  durationMs: number;
}

export interface ActiveRecording {
  /** Stop early (the coach tapped Stop). */
  stop(): void;
  done: Promise<Recording>;
}

/**
 * Record a cheer with a hard stop at 2.5 s. The microphone is used only
 * after the coach's tap and the browser permission prompt, and every track is
 * stopped as soon as recording ends (SPEC §10.1).
 */
export function recordCheer(opts: RecordOptions): ActiveRecording {
  const mime = chooseCheerMime(opts.isTypeSupported);
  if (mime === undefined) throw new Error('This browser cannot record audio in a format we can play back.');
  const create: RecorderFactory =
    opts.create ?? ((stream, options) => new MediaRecorder(stream, options) as unknown as RecorderLike);
  const timers = opts.timers ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => {
      clearTimeout(h as ReturnType<typeof setTimeout>);
    },
  };
  const recorder = create(opts.stream, { mimeType: mime, audioBitsPerSecond: CHEER_BITS_PER_SECOND });
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  const done = new Promise<Recording>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = (e) => {
      reject(e instanceof Error ? e : new Error('Recording failed'));
    };
    recorder.onstop = () => {
      for (const track of opts.stream.getTracks()) track.stop();
      const type = recorder.mimeType || mime;
      resolve({
        blob: new Blob(chunks, { type }),
        mime: type,
        durationMs: Math.min(Date.now() - startedAt, opts.maxMs ?? CHEER_MAX_MS),
      });
    };
  });

  recorder.start();
  timers.setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, opts.maxMs ?? CHEER_MAX_MS);

  return {
    stop() {
      if (recorder.state !== 'inactive') recorder.stop();
    },
    done,
  };
}
