import type { AudioFormat } from '../domain/audio/manifest';

/** Anything with the HTMLMediaElement `canPlayType` method, so tests can pass a stub. */
export interface CanPlay {
  canPlayType(type: string): string;
}

/**
 * Opus in WebM where the browser can decode it, otherwise AAC in M4A
 * (SPEC §11). Safari 17+ answers "maybe" for Opus-in-WebM; older iOS answers "".
 */
export function chooseAudioFormat(el: CanPlay, preferred?: AudioFormat): AudioFormat {
  if (preferred !== undefined) return preferred;
  const opus = el.canPlayType('audio/webm; codecs="opus"');
  return opus === 'probably' || opus === 'maybe' ? 'opus' : 'aac';
}

/**
 * Opus first: Chromium also offers `audio/mp4` but ignores the bitrate cap there
 * (about 30 KB for 2.5 s against the 8 KB cheer-link cap, measured), while Opus
 * comes out near 3 KB. Safari has no WebM recorder before 18.4 and honours the cap
 * for MP4, so it falls through to `audio/mp4`.
 */
export const CHEER_MIME_PREFERENCE = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

export function chooseCheerMime(isTypeSupported: (mime: string) => boolean): string | undefined {
  return CHEER_MIME_PREFERENCE.find((m) => isTypeSupported(m));
}
