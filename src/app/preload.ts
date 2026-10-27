import type { ResultScreen } from '../ui/screens/Result';

/** The result screen is loaded on demand but warmed when a call starts, so The Cut never waits for it. */
export const loadResult = (): Promise<{ default: typeof ResultScreen }> =>
  import('../ui/screens/Result').then((m) => ({ default: m.ResultScreen }));
