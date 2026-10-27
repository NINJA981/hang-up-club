import { RING } from './ring';

/** Two seconds of the North American ring, once, so the player can tell the phone is loud enough. */
export async function playRingTest(): Promise<void> {
  if (typeof AudioContext === 'undefined') return;
  const ctx = new AudioContext();
  await ctx.resume();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.05;
  gain.gain.setTargetAtTime(RING.gain, t0, 0.01);
  gain.gain.setTargetAtTime(0, t0 + 1.2, 0.01);
  for (const f of RING.freqs) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(t0);
    osc.stop(t0 + 1.4);
  }
  window.setTimeout(() => {
    void ctx.close().catch(() => undefined);
  }, 1800);
}
