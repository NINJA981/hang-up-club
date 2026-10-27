import type { FeatureBundle } from 'motion/react';

/** DESIGN.md Appendix A. Springs are for state changes, never the daily loop. */
export const SPRING = {
  snappy: { type: 'spring', visualDuration: 0.18, bounce: 0 },
  ui: { type: 'spring', visualDuration: 0.25, bounce: 0.05 },
  gentle: { type: 'spring', visualDuration: 0.35, bounce: 0.1 },
  playful: { type: 'spring', visualDuration: 0.4, bounce: 0.25 },
  release: { type: 'spring', stiffness: 420, damping: 36, mass: 1 },
} as const;

/** `--ease-out` as a Motion cubic-bezier. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_SHEET = [0.32, 0.72, 0, 1] as const;
export const EASE_FALL = [0.55, 0, 1, 0.45] as const;

/** domMax brings layout, layoutId and drag; it is fetched once, after first paint. */
export const loadMotionFeatures = (): Promise<FeatureBundle> =>
  import('./motionFeatures').then((m) => m.default);
