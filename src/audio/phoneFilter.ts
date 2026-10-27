/**
 * The telephone band-pass for runtime-synthesised voices (family calls). It
 * mirrors the build-time chain in scripts/lib/tts/filter.ts: 300-3400 Hz plus
 * compression. Pre-rendered clips already carry the filter and skip this.
 */
export const PHONE_FILTER = {
  highpassHz: 300,
  lowpassHz: 3400,
  q: 0.707,
  compressor: { threshold: -20, ratio: 4, attack: 0.005, release: 0.08 },
} as const;

export interface PhoneFilter {
  input: AudioNode;
  output: AudioNode;
}

export function createPhoneFilter(ctx: BaseAudioContext): PhoneFilter {
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = PHONE_FILTER.highpassHz;
  high.Q.value = PHONE_FILTER.q;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = PHONE_FILTER.lowpassHz;
  low.Q.value = PHONE_FILTER.q;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = PHONE_FILTER.compressor.threshold;
  comp.ratio.value = PHONE_FILTER.compressor.ratio;
  comp.attack.value = PHONE_FILTER.compressor.attack;
  comp.release.value = PHONE_FILTER.compressor.release;
  high.connect(low);
  low.connect(comp);
  return { input: high, output: comp };
}
