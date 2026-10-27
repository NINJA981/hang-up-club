/**
 * The telephone-band filter chain and encoders (ADR §4.1 step 4).
 * Bump FILTER_VERSION whenever the chain changes: every clip's `sha` includes
 * it, so `pnpm audio:check` then reports every clip as stale.
 */
export const FILTER_VERSION = 2; // 2: AAC 24 -> 16 kbps

export interface FilterOptions {
  /** Source sample rate, used by the optional pitch shift. */
  sampleRate?: number;
  /** Pitch ratio (1 = unchanged), applied before the band-pass. */
  pitch?: number;
}

/** Band-pass 300-3400 Hz, compress, round-trip through 8 kHz for the narrowband character, normalise. */
export function filterChain({ sampleRate = 22050, pitch }: FilterOptions = {}): string {
  const steps: string[] = [];
  if (pitch !== undefined && pitch !== 1) {
    // asetrate shifts pitch and tempo together; atempo restores the tempo.
    steps.push(
      `asetrate=${String(Math.round(sampleRate * pitch))}`,
      `atempo=${(1 / pitch).toFixed(5)}`,
      `aresample=${String(sampleRate)}`,
    );
  }
  steps.push(
    'highpass=f=300:poles=2',
    'lowpass=f=3400:poles=2',
    'acompressor=threshold=-20dB:ratio=4:attack=5:release=80:makeup=4',
    'aresample=8000',
    'aresample=24000',
    'alimiter=limit=0.89',
    'loudnorm=I=-18:TP=-2:LRA=7',
  );
  return steps.join(',');
}

/** WAV in → filtered mono WAV out. */
export function filterArgs(input: string, output: string, opts: FilterOptions = {}): string[] {
  return ['-y', '-v', 'error', '-i', input, '-af', filterChain(opts), '-ac', '1', '-ar', '24000', output];
}

/** Filtered WAV → Opus in WebM, 16 kbps mono. */
export function opusArgs(input: string, output: string): string[] {
  return [
    '-y',
    '-v',
    'error',
    '-i',
    input,
    '-ac',
    '1',
    '-c:a',
    'libopus',
    '-b:a',
    '16k',
    '-vbr',
    'on',
    '-application',
    'voip',
    '-f',
    'webm',
    output,
  ];
}

/** Filtered WAV → AAC in M4A, 16 kbps mono at 16 kHz (24 kbps put the library over the 6 MB budget). */
export function aacArgs(input: string, output: string): string[] {
  return [
    '-y',
    '-v',
    'error',
    '-i',
    input,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'aac',
    '-b:a',
    '16k',
    '-movflags',
    '+faststart',
    output,
  ];
}

/** Budgets checked by `audio:check` (ADR §4.2, AC-F5-2). */
export const BUDGETS = {
  opusTotalBytes: 4 * 1024 * 1024,
  aacTotalBytes: 6 * 1024 * 1024,
  perCallOpusBytes: 160 * 1024,
} as const;
