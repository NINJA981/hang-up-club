import { useMemo } from 'react';
import { useApp, useAppSnapshot } from '../app/AppContext';
import { demoScenario } from '../app/demo';
import type { CallRequest } from '../app/callRunner';
import type { ResolvedScenario } from '../domain/scenario/expand';
import { dailyPick, practicePick, resolvePick, todaysScoredAttempt } from '../state/selectors';
import type { AppState } from '../state/app';

export interface Offer {
  request: CallRequest;
  /** Who wrote the call, for family calls. */
  writtenBy: string | undefined;
}

/** `?seed=` replaces the profile id in the scheduler so tests get the same call every run. */
function seeded(app: AppState, seed: string | undefined): AppState {
  if (seed === undefined || !app.profile) return app;
  return { ...app, profile: { ...app.profile, id: `seed:${seed}` } };
}

/** Today's scored call and the next practice call, resolved to something playable. */
export function useToday(): {
  daily: Offer | undefined;
  practice: Offer | undefined;
  doneToday: ReturnType<typeof todaysScoredAttempt>;
  practicedToday: number;
} {
  const app = useAppSnapshot();
  const { state, meta } = useApp();
  const content = state.content;
  const { seed, demo } = meta.params;
  const doneToday = todaysScoredAttempt(app);
  const practicedToday = app.attempts.filter((a) => !a.scored && a.localDate === app.today).length;

  return useMemo(() => {
    if (!content || !app.profile) return { daily: undefined, practice: undefined, doneToday, practicedToday };
    const s = seeded(app, seed);
    const offer = (pick: ReturnType<typeof dailyPick>, scored: boolean): Offer | undefined => {
      if (!pick) return undefined;
      const scenario: ResolvedScenario | undefined =
        demo && scored ? demoScenario(content) : resolvePick(content, pick, s);
      if (!scenario) return undefined;
      const request: CallRequest = { scenario, scored, family: pick.source === 'family' };
      let writtenBy: string | undefined;
      if (pick.source === 'family') {
        request.familyCallId = pick.familyCallId;
        writtenBy = s.familyCalls.find((c) => c.id === pick.familyCallId)?.from;
      }
      return { request, writtenBy };
    };
    return {
      daily: offer(dailyPick(s, content), true),
      practice: offer(practicePick(s, content, practicedToday), false),
      doneToday,
      practicedToday,
    };
    // `app` changes on every attempt, which is exactly when the offer must be recomputed.
  }, [app, content, seed, demo, doneToday, practicedToday]);
}
