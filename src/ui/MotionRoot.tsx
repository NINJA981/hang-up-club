import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { SPRING, loadMotionFeatures } from './motion';

/**
 * The animation engine, loaded with the screens that animate (result, replay,
 * settings, coach). Today and the Line use CSS only, which keeps the first
 * route small. Reduced motion is honoured everywhere ("user").
 */
export default function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING.ui}>
      <LazyMotion features={loadMotionFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
