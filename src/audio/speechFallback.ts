/**
 * Last-resort voice (SPEC §4.5 step 5, AC-F5-4): the Web Speech API,
 * restricted to `localService` voices because some browsers' network voices
 * send the text to a vendor. Speech output cannot be routed through Web
 * Audio, so it carries no telephone filter.
 */

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

/** Local English voices only, default voice first. */
export function localEnglishVoices<V extends VoiceLike>(voices: readonly V[]): V[] {
  return voices
    .filter((v) => v.localService && v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => Number(b.default === true) - Number(a.default === true) || a.name.localeCompare(b.name));
}

/**
 * Deterministic voice choice per caller voice id, so one caller keeps one
 * timbre through a call even on the fallback path.
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], voiceId: string): V | undefined {
  const local = localEnglishVoices(voices);
  if (local.length === 0) return undefined;
  let h = 0;
  for (const ch of voiceId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return local[h % local.length];
}

export interface SpeechLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
}

export interface SpeechFallback {
  /** True when at least one local voice exists. When false the call runs as a read-along. */
  available(): boolean;
  speak(text: string, voiceId: string): void;
  cancel(): void;
}

export function createSpeechFallback(
  synth: SpeechLike | undefined,
  makeUtterance: (text: string) => SpeechSynthesisUtterance = (t) => new SpeechSynthesisUtterance(t),
): SpeechFallback {
  return {
    available: () => synth !== undefined && localEnglishVoices(synth.getVoices()).length > 0,
    speak(text, voiceId) {
      if (!synth) return;
      const voice = pickVoice(synth.getVoices(), voiceId);
      if (!voice) return;
      const u = makeUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.95;
      synth.speak(u);
    },
    cancel() {
      synth?.cancel();
    },
  };
}

/** Shown when no voice exists at all (AC-F5-4). */
export const READ_ALONG_BANNER = 'Read-along call: your phone has no built-in voice.';
