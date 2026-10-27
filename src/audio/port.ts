import type { CallPort } from '../state/callController';
import type { CallAudioEngine } from './engine';
import type { RingTone } from './ring';

/** Glue: the real `CallPort` the call controller drives, built from the audio engine and the ringtone. */
export function createCallPort(engine: CallAudioEngine, ring: RingTone): CallPort {
  return {
    ring: () => {
      ring.start();
    },
    stopRing: () => {
      ring.stop();
    },
    answer: (plan) => {
      engine.answer(plan);
    },
    reschedule: (plan, fromMs) => {
      engine.reschedule(plan, fromMs);
    },
    nowMs: () => engine.nowMs(),
    cut: () => {
      engine.cut();
    },
    finish: () => {
      engine.finish();
    },
  };
}
