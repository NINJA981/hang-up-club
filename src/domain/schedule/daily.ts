import type { Group, Kind, Tactic } from '../scenario/schema';
import {
  ADDRESS_VAR,
  variantCount,
  variantFromIndices,
  variantKey,
  type VarDomains,
} from '../scenario/expand';
import { addDays, diffDays, toEpochDay, type LocalDate } from '../time/dates';
import { dueTactics, type TacticBox } from './srs';
import { randInt, rngFrom, weightedIndex, type Rng } from './rng';

/** Target share of legitimate calls (SPEC §7.3). */
export const DEFAULT_LEGIT_RATE = 0.4;
export const LEGIT_RATE_MIN = 0.3;
export const LEGIT_RATE_MAX = 0.5;
/** Weight multipliers (SPEC §7.3). */
export const SRS_BOOST = 3;
export const NOVELTY_PENALTY = 0.2;
export const NOVELTY_DAYS = 5;
/** At most one family call per this many days. */
export const FAMILY_GAP_DAYS = 7;
/** Sequence anchor: the kind sequence is generated day by day from here. */
export const SEQUENCE_ANCHOR: LocalDate = '2024-01-01';
/**
 * Width of the discrepancy band. Any 30-day window then holds 30·r ± (band)
 * legitimate calls, which keeps 35–45% at r = 0.4, and the band alone rules
 * out a 3rd legitimate or a 4th scam call in a row at r = 0.4.
 */
export const BAND_WIDTH = 1.4;
export const MAX_SCAM_RUN = 3;
export const MAX_LEGIT_RUN = 2;

export interface TemplateInfo {
  id: string;
  kind: Kind;
  group: Group;
  tactics: readonly Tactic[];
  domains: VarDomains;
}

export interface HistoryEntry {
  localDate: LocalDate;
  scenarioId: string;
  kind: Kind;
  family?: boolean;
}

export interface FamilyCallInfo {
  id: string;
  kind: Kind;
  receivedAt: LocalDate;
  played: boolean;
}

export interface ScheduleInput {
  profileId: string;
  today: LocalDate;
  templates: readonly TemplateInfo[];
  /** Scored attempts (any order). Today's entries are ignored, so a day's pick never changes. */
  history: readonly HistoryEntry[];
  tacticBoxes: readonly TacticBox[];
  /** Scam groups the coach enabled. Legitimate calls are always on. */
  enabledGroups: readonly Group[];
  legitRate?: number;
  addressTerm?: string;
  familyCalls?: readonly FamilyCallInfo[];
}

export type DailyPick =
  | {
      source: 'library';
      templateId: string;
      kind: Kind;
      variant: number;
      variantKey: string;
      /** Scheduler reasoning, for tests and debugging (never shown to the player). */
      why: { plannedKind: Kind; boosted: boolean };
    }
  | { source: 'family'; familyCallId: string; kind: Kind };

export function clampLegitRate(rate: number | undefined): number {
  if (rate === undefined || !Number.isFinite(rate)) return DEFAULT_LEGIT_RATE;
  return Math.min(LEGIT_RATE_MAX, Math.max(LEGIT_RATE_MIN, rate));
}

const sequenceCache = new Map<string, { anchorDay: number; kinds: Kind[] }>();

/**
 * The planned kind for every day from the anchor to `until`, for one profile.
 *
 * A bounded-discrepancy random walk: E(d) = Σ(isLegit − r) stays inside a band
 * of width {@link BAND_WIDTH}. Inside the band the day is legitimate with
 * probability r; at the edges the band forces the choice. Determined only by
 * (profileId, rate, day), never by what the player did.
 */
export function plannedKinds(profileId: string, rate: number, until: LocalDate): Kind[] {
  const r = clampLegitRate(rate);
  const anchorDay = toEpochDay(SEQUENCE_ANCHOR);
  const last = toEpochDay(until) - anchorDay;
  if (last < 0) throw new RangeError(`Dates before ${SEQUENCE_ANCHOR} are not scheduled`);
  const cacheKey = `${profileId}|${String(r)}`;
  let entry = sequenceCache.get(cacheKey);
  if (!entry) {
    entry = { anchorDay, kinds: [] };
    sequenceCache.set(cacheKey, entry);
  }
  const kinds = entry.kinds;
  if (kinds.length > last) return kinds.slice(0, last + 1);

  // Replay the walk deterministically (cheap: a few thousand steps).
  const rng = rngFrom('kind-walk', profileId, r);
  const low = -BAND_WIDTH / 2;
  const high = BAND_WIDTH / 2;
  let e = low + r + rng() * (BAND_WIDTH - 1); // any start inside the band
  let scamRun = 0;
  let legitRun = 0;
  const out: Kind[] = [];
  for (let d = 0; d <= last; d++) {
    const canLegit = e + (1 - r) < high + 1e-9 && legitRun < MAX_LEGIT_RUN;
    const canScam = e - r >= low - 1e-9 && scamRun < MAX_SCAM_RUN;
    const u = rng();
    let legit: boolean;
    if (canLegit && canScam) legit = u < r;
    else if (canLegit) legit = true;
    else if (canScam) legit = false;
    else legit = e < 0; // unreachable for r in [0.3, 0.5]; stay closest to the centre
    e += legit ? 1 - r : -r;
    legitRun = legit ? legitRun + 1 : 0;
    scamRun = legit ? 0 : scamRun + 1;
    out.push(legit ? 'legit' : 'scam');
  }
  entry.kinds = out;
  return out.slice();
}

export function plannedKind(profileId: string, rate: number, date: LocalDate): Kind {
  // A phone whose clock is set before the anchor still gets a call: it plays the anchor day's kind.
  const day = date < SEQUENCE_ANCHOR ? SEQUENCE_ANCHOR : date;
  const kinds = plannedKinds(profileId, rate, day);
  const k = kinds[kinds.length - 1];
  if (!k) throw new Error('empty sequence');
  return k;
}

/** For tests: forget cached sequences. */
export function clearScheduleCache(): void {
  sequenceCache.clear();
}

function playedWithin(history: readonly HistoryEntry[], id: string, today: LocalDate, days: number): boolean {
  return history.some(
    (h) => h.scenarioId === id && h.localDate < today && diffDays(h.localDate, today) <= days,
  );
}

function pickVariant(rng: Rng, t: TemplateInfo, addressTerm: string | undefined): number {
  const names = Object.keys(t.domains).sort();
  const indices = names.map((name) => {
    const values = t.domains[name] ?? [];
    if (name === ADDRESS_VAR && addressTerm !== undefined) {
      const pinned = values.indexOf(addressTerm);
      if (pinned >= 0) return pinned;
    }
    return randInt(rng, Math.max(1, values.length));
  });
  return variantFromIndices(t.domains, indices);
}

/** Template weights for one kind (SPEC §7.3). */
export function templateWeights(
  candidates: readonly TemplateInfo[],
  input: Pick<ScheduleInput, 'history' | 'tacticBoxes' | 'enabledGroups' | 'today'>,
): number[] {
  const due = dueTactics(input.tacticBoxes, input.today);
  return candidates.map((t) => {
    const enabled = t.kind === 'legit' || input.enabledGroups.includes(t.group) ? 1 : 0;
    const boost = t.kind === 'scam' && t.tactics.some((x) => due.has(x)) ? SRS_BOOST : 1;
    const novelty = playedWithin(input.history, t.id, input.today, NOVELTY_DAYS) ? NOVELTY_PENALTY : 1;
    return enabled * boost * novelty;
  });
}

/** The day (≥ receipt) a family call becomes eligible: receipt + a seeded 0–3 days. */
export function familyDueFrom(profileId: string, call: Pick<FamilyCallInfo, 'id' | 'receivedAt'>): LocalDate {
  return addDays(call.receivedAt, randInt(rngFrom('family-due', profileId, call.id), 4));
}

function pickFamily(input: ScheduleInput, kind: Kind): FamilyCallInfo | undefined {
  const calls = input.familyCalls ?? [];
  if (!calls.length) return undefined;
  const recentFamily = input.history.some(
    (h) =>
      h.family === true && h.localDate < input.today && diffDays(h.localDate, input.today) < FAMILY_GAP_DAYS,
  );
  if (recentFamily) return undefined;
  return calls
    .filter((c) => !c.played && c.kind === kind && familyDueFrom(input.profileId, c) <= input.today)
    .sort((a, b) =>
      a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : a.id < b.id ? -1 : 1,
    )[0];
}

/**
 * Today's scored call. Deterministic for (profile, date, inputs): the seed is
 * hash(profileId, localDate) and only history before today is read.
 */
export function pickDaily(input: ScheduleInput): DailyPick {
  const history = input.history.filter((h) => h.localDate < input.today);
  const ctx = { ...input, history };
  const plannedKindToday = plannedKind(input.profileId, clampLegitRate(input.legitRate), input.today);

  const family = pickFamily(ctx, plannedKindToday);
  if (family) return { source: 'family', familyCallId: family.id, kind: family.kind };

  const rng = rngFrom('daily', input.profileId, input.today);
  return pickFromLibrary(rng, ctx, plannedKindToday);
}

function pickFromLibrary(rng: Rng, input: ScheduleInput, wanted: Kind): DailyPick {
  const tryKind = (kind: Kind): DailyPick | null => {
    const candidates = input.templates.filter((t) => t.kind === kind);
    const weights = templateWeights(candidates, input);
    const i = weightedIndex(rng, weights);
    const chosen = candidates[i];
    if (!chosen) return null;
    const due = dueTactics(input.tacticBoxes, input.today);
    const variant = pickVariant(rng, chosen, input.addressTerm);
    return {
      source: 'library',
      templateId: chosen.id,
      kind,
      variant,
      variantKey: variantKey(chosen.id, chosen.domains, variant),
      why: { plannedKind: wanted, boosted: kind === 'scam' && chosen.tactics.some((x) => due.has(x)) },
    };
  };
  const other: Kind = wanted === 'scam' ? 'legit' : 'scam';
  const pick = tryKind(wanted) ?? tryKind(other);
  if (!pick) throw new Error('The scenario library has no playable templates');
  return pick;
}

/**
 * An unscored practice call (the n-th today). Never repeats today's daily
 * template when there is any alternative.
 */
export function pickPractice(input: ScheduleInput, n: number, avoidIds: readonly string[] = []): DailyPick {
  const rng = rngFrom('practice', input.profileId, input.today, n);
  const kind: Kind = rng() < clampLegitRate(input.legitRate) ? 'legit' : 'scam';
  const avoid = new Set(avoidIds);
  const templates = input.templates.filter((t) => !avoid.has(t.id));
  return pickFromLibrary(rng, { ...input, templates: templates.length ? templates : input.templates }, kind);
}

export function totalVariants(templates: readonly TemplateInfo[]): number {
  return templates.reduce((s, t) => s + variantCount(t.domains), 0);
}
