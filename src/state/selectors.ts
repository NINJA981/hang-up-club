import { draftToTemplate } from '../domain/links/family';
import type { ResultCardV1 } from '../domain/links/payloads';
import {
  resolveVariant,
  resolveWithVars,
  parseVariantKey,
  varDomains,
  type ResolvedScenario,
} from '../domain/scenario/expand';
import {
  pickDaily,
  pickPractice,
  type DailyPick,
  type FamilyCallInfo,
  type HistoryEntry,
  type ScheduleInput,
} from '../domain/schedule/daily';
import { judgementRate30 } from '../domain/scoring/score';
import { computeStreak, type StreakResult } from '../domain/streak/streak';
import { localDateOf, type LocalDate } from '../domain/time/dates';
import type { Attempt, Cheer } from '../storage/schemas';
import type { AppState } from './app';
import type { Content } from './library';

export function scoredDates(attempts: readonly Attempt[]): LocalDate[] {
  return attempts.filter((a) => a.scored).map((a) => a.localDate);
}

export function streakOf(state: Pick<AppState, 'attempts' | 'today'>): StreakResult {
  return computeStreak(scoredDates(state.attempts), state.today);
}

export function rate30Of(state: Pick<AppState, 'attempts' | 'today'>): number | undefined {
  return judgementRate30(state.attempts, state.today);
}

export function todaysScoredAttempt(state: Pick<AppState, 'attempts' | 'today'>): Attempt | undefined {
  return state.attempts.find((a) => a.scored && a.localDate === state.today);
}

export function historyOf(attempts: readonly Attempt[]): HistoryEntry[] {
  return attempts
    .filter((a) => a.scored)
    .map((a) => {
      const h: HistoryEntry = { localDate: a.localDate, scenarioId: a.scenarioId, kind: a.kind };
      if (a.family === true) h.family = true;
      return h;
    });
}

function familyInfos(state: Pick<AppState, 'familyCalls'>): FamilyCallInfo[] {
  return state.familyCalls.map((c) => ({
    id: c.id,
    kind: c.call.kind,
    receivedAt: localDateOf(Date.parse(c.receivedAt)),
    played: c.played,
  }));
}

export function scheduleInput(state: AppState, content: Content): ScheduleInput | undefined {
  const profile = state.profile;
  if (!profile) return undefined;
  return {
    profileId: profile.id,
    today: state.today,
    templates: content.infos,
    history: historyOf(state.attempts),
    tacticBoxes: state.tacticBoxes,
    enabledGroups: profile.enabledCategories,
    legitRate: profile.legitRate,
    addressTerm: profile.addressTerm,
    familyCalls: familyInfos(state),
  };
}

/** Today's scored call. Undefined until a profile exists. */
export function dailyPick(state: AppState, content: Content): DailyPick | undefined {
  const input = scheduleInput(state, content);
  return input ? pickDaily(input) : undefined;
}

/** The n-th unscored practice call of today, never repeating the daily template if avoidable. */
export function practicePick(state: AppState, content: Content, n: number): DailyPick | undefined {
  const input = scheduleInput(state, content);
  if (!input) return undefined;
  const daily = pickDaily(input);
  return pickPractice(input, n, daily.source === 'library' ? [daily.templateId] : []);
}

/** Fill in a pick: a library variant, or a family call derived from its draft. */
export function resolvePick(
  content: Content,
  pick: DailyPick,
  state: Pick<AppState, 'familyCalls'>,
): ResolvedScenario | undefined {
  if (pick.source === 'library') {
    const t = content.byId.get(pick.templateId);
    return t ? resolveVariant(t, content.library.addressTerms, pick.variant) : undefined;
  }
  const record = state.familyCalls.find((c) => c.id === pick.familyCallId);
  if (!record) return undefined;
  const template = draftToTemplate(record.call, record.id, record.from);
  return resolveWithVars(template, {}, `${template.id}#-`);
}

/** Re-open a past variant by its key (the replay screen). */
export function resolveVariantKey(content: Content, key: string): ResolvedScenario | undefined {
  const hashAt = key.lastIndexOf('#');
  const t = content.byId.get(hashAt > 0 ? key.slice(0, hashAt) : key);
  if (!t) return undefined;
  const parsed = parseVariantKey(key, varDomains(t, content.library.addressTerms));
  return parsed ? resolveVariant(t, content.library.addressTerms, parsed.variant) : undefined;
}

/** The newest cheer the player's device can use. */
export function latestCheer(state: Pick<AppState, 'cheers'>): Cheer | undefined {
  return state.cheers[0];
}

/** The card "Send to family" shares after a call (SPEC §9 ResultCardV1). */
export function resultCardFor(state: AppState, attempt: Attempt, summary: string): ResultCardV1 | undefined {
  const profile = state.profile;
  if (!profile) return undefined;
  const rate = rate30Of(state);
  const card: ResultCardV1 = {
    v: 1,
    t: 'result',
    name: profile.playerName ?? profile.addressTerm,
    date: attempt.localDate,
    title: summary,
    kind: attempt.kind,
    outcome: attempt.outcome,
    streak: streakOf(state).current,
  };
  if (attempt.tActionMs !== undefined) card.tAction = attempt.tActionMs;
  if (attempt.tAskMs !== undefined) card.tAsk = attempt.tAskMs;
  if (rate !== undefined) card.rate30 = Math.round(rate * 100) / 100;
  return card;
}
