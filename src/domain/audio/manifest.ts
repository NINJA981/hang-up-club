import { z } from 'zod';
import { clipKey, type ResolvedLine } from '../scenario/expand';
import { estimateDurationMs } from '../scenario/timeline';

/**
 * The rendered-audio manifest (SPEC §9 AudioManifest, ADR §4.1 step 6).
 *
 * Clips are keyed by `clipKey(voice, text)`, the same identity the runtime
 * derives from a resolved line. Each entry stores its measured duration (used
 * for tFlag/tAsk/tEnd before any audio is decoded) and a freshness `sha`
 * (sha256 of text, voice, engine and filter version) that `audio:check`
 * recomputes in CI.
 */

export const AudioClipSchema = z.strictObject({
  opus: z.string().regex(/^[a-z0-9-]+\.webm$/),
  aac: z.string().regex(/^[a-z0-9-]+\.m4a$/),
  durationMs: z.number().int().positive().max(60_000),
  sha: z.string().regex(/^[0-9a-f]{64}$/),
  engine: z.enum(['piper', 'kitten', 'sapi']),
  voice: z.string(),
});
export type AudioClip = z.infer<typeof AudioClipSchema>;

export const AudioBedSchema = z.strictObject({
  opus: z.string().regex(/^[a-z0-9-]+\.webm$/),
  aac: z.string().regex(/^[a-z0-9-]+\.m4a$/),
  durationMs: z.number().int().positive(),
  sha: z.string().regex(/^[0-9a-f]{64}$/),
});

export const AudioManifestSchema = z.strictObject({
  /** Changes whenever any clip changes; names the runtime audio cache. */
  version: z.string().min(1),
  filterVersion: z.number().int().positive(),
  clips: z.record(z.string(), AudioClipSchema),
  beds: z.record(z.string(), AudioBedSchema).default({}),
});
export type AudioManifest = z.infer<typeof AudioManifestSchema>;

export const EMPTY_MANIFEST: AudioManifest = { version: 'none', filterVersion: 1, clips: {}, beds: {} };

export type AudioFormat = 'opus' | 'aac';

export function clipFor(
  manifest: AudioManifest,
  line: Pick<ResolvedLine, 'voice' | 'text'>,
): AudioClip | undefined {
  return manifest.clips[clipKey(line.voice, line.text)];
}

/**
 * Public URL of a clip file for a format. The file name comes from voice and text only, so the query
 * carries the render identity (sha): a re-rendered clip gets a new URL, and the service worker's
 * cache-first audio route can never serve the old audio for it.
 */
export function clipUrl(clip: Pick<AudioClip, 'opus' | 'aac' | 'sha'>, format: AudioFormat): string {
  return `/audio/${format === 'opus' ? clip.opus : clip.aac}?v=${clip.sha.slice(0, 12)}`;
}

/**
 * Duration lookup for the timeline planner: the rendered clip's measured
 * duration, or a words-per-minute estimate when no clip exists (family calls,
 * or a library that has not been rendered yet).
 */
export function durationOfFrom(manifest: AudioManifest): (line: ResolvedLine) => number {
  return (line) => clipFor(manifest, line)?.durationMs ?? estimateDurationMs(line.text);
}

/** Lines that have no rendered clip. The UI falls back to Web Speech for these. */
export function missingClips(
  manifest: AudioManifest,
  lines: readonly Pick<ResolvedLine, 'voice' | 'text'>[],
): number[] {
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (!clipFor(manifest, l)) out.push(i);
  });
  return out;
}

/** The two URLs a call needs, in preference order, for pre-fetching. */
export function urlsForLines(
  manifest: AudioManifest,
  lines: readonly Pick<ResolvedLine, 'voice' | 'text'>[],
  format: AudioFormat,
): string[] {
  const urls = new Set<string>();
  for (const l of lines) {
    const clip = clipFor(manifest, l);
    if (clip) urls.add(clipUrl(clip, format));
  }
  return [...urls];
}
