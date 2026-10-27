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
 * The container the coach's device should record the cheer in. MP4 plays
 * almost everywhere, so it is preferred when MediaRecorder offers it
 * (SPEC §11 cross-device cheer playback).
 */
export const CHEER_MIME_PREFERENCE = [
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
] as const;

export function chooseCheerMime(isTypeSupported: (mime: string) => boolean): string | undefined {
  return CHEER_MIME_PREFERENCE.find((m) => isTypeSupported(m));
}
