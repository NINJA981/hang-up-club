/**
 * Query parameters that make the app deterministic for tests and for the
 * demo capture (ADR section 5):
 *
 *   ?test=1               silent audio, real timing (no sound, no decoding)
 *   ?seed=7               replaces the profile id in the daily scheduler
 *   ?demo=signature       S01 "First Wrenfield Bank Fraud Dept" with a demo cheer,
 *                         kept in a throw-away database, never in the real one
 *
 * They live in `location.search`, so hash navigation keeps them.
 */
export interface AppParams {
  test: boolean;
  seed: string | undefined;
  demo: 'signature' | undefined;
}

export function readParams(search: string = window.location.search): AppParams {
  const q = new URLSearchParams(search);
  const seed = q.get('seed');
  const demo = q.get('demo');
  return {
    test: q.get('test') === '1' || demo === 'signature',
    seed: seed !== null && /^[A-Za-z0-9_-]{1,32}$/.test(seed) ? seed : undefined,
    demo: demo === 'signature' ? 'signature' : undefined,
  };
}

/** The database the app opens. Demo mode never touches the player's real data. */
export function dbNameFor(params: AppParams): string {
  return params.demo ? 'huc-demo' : 'huc';
}
