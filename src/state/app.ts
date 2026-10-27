import type { CallState } from '../domain/call/session';
import { summarise, type CallSummary } from '../domain/call/session';
import type { CheerLinkV1, FamilyLinkV1, JoinLinkV1, ResultCardV1 } from '../domain/links/payloads';
import type { ResolvedScenario } from '../domain/scenario/expand';
import { callbackIsTheLesson } from '../domain/scenario/library';
import { SCAM_GROUPS } from '../domain/scenario/schema';
import { DEFAULT_LEGIT_RATE, clampLegitRate } from '../domain/schedule/daily';
import { applyAttempt, type TacticBox } from '../domain/schedule/srs';
import type { Clock } from '../domain/time/clock';
import type { LocalDate } from '../domain/time/dates';
import type { Repo } from '../storage/repo';
import {
  DEFAULT_SETTINGS,
  type Attempt,
  type Cheer,
  type FamilyCallRecord,
  type Profile,
  type ReceivedResult,
  type Settings,
} from '../storage/schemas';
import { base64ToBlob } from './base64';
import { createStore, type Store } from './store';

export interface AppState {
  status: 'loading' | 'ready';
  profile: Profile | undefined;
  settings: Settings;
  attempts: Attempt[];
  tacticBoxes: TacticBox[];
  cheers: Cheer[];
  familyCalls: FamilyCallRecord[];
  inbox: ReceivedResult[];
  /** The civil date "today" for the player. Refreshed when the app returns to the foreground. */
  today: LocalDate;
}

export interface SetupInput {
  addressTerm: string;
  playerName?: string;
  coachName?: string;
  enabledCategories?: Profile['enabledCategories'];
  legitRate?: number;
}

export interface RecordCallInput {
  ended: Extract<CallState, { status: 'ended' }>;
  scenario: ResolvedScenario;
  /** The daily call is scored; "practice another" is not. Ignored once today's scored call exists. */
  scored: boolean;
  family?: boolean;
}

export interface Deps {
  repo: Repo;
  clock: Clock;
  /** Random id source (crypto.randomUUID in the browser). */
  newId: () => string;
}

/**
 * The application's state and the only writer of persisted data besides
 * storage/repo. State lives in a plain store (useSyncExternalStore-ready);
 * every method persists first, then publishes, so the UI never shows
 * something that was not saved.
 */
export class AppController {
  readonly store: Store<AppState>;

  constructor(private readonly deps: Deps) {
    this.store = createStore<AppState>({
      status: 'loading',
      profile: undefined,
      settings: { ...DEFAULT_SETTINGS },
      attempts: [],
      tacticBoxes: [],
      cheers: [],
      familyCalls: [],
      inbox: [],
      today: deps.clock.today(),
    });
  }

  get state(): AppState {
    return this.store.get();
  }

  async load(): Promise<void> {
    const { repo, clock } = this.deps;
    const [profile, settings, attempts, tacticBoxes, cheers, familyCalls, inbox] = await Promise.all([
      repo.getProfile(),
      repo.getSettings(),
      repo.listAttempts(),
      repo.getTacticBoxes(),
      repo.listCheers(),
      repo.listFamilyCalls(),
      repo.listInbox(),
    ]);
    this.store.set({
      status: 'ready',
      profile,
      settings,
      attempts,
      tacticBoxes,
      cheers,
      familyCalls,
      inbox,
      today: clock.today(),
    });
  }

  refreshToday(): void {
    const today = this.deps.clock.today();
    this.store.set((s) => (s.today === today ? s : { ...s, today }));
  }

  // ── profile ──────────────────────────────────────────────────────────

  async setupProfile(input: SetupInput): Promise<Profile> {
    const existing = this.state.profile;
    const profile: Profile = {
      id: existing?.id ?? this.deps.newId(),
      addressTerm: input.addressTerm,
      enabledCategories: input.enabledCategories ?? existing?.enabledCategories ?? [...SCAM_GROUPS],
      legitRate: clampLegitRate(input.legitRate ?? existing?.legitRate ?? DEFAULT_LEGIT_RATE),
      createdAt: existing?.createdAt ?? new Date(this.deps.clock.now()).toISOString(),
    };
    const playerName = input.playerName ?? existing?.playerName;
    const coachName = input.coachName ?? existing?.coachName;
    if (playerName !== undefined) profile.playerName = playerName;
    if (coachName !== undefined) profile.coachName = coachName;
    await this.deps.repo.putProfile(profile);
    this.store.set((s) => ({ ...s, profile }));
    return profile;
  }

  /** Open a join link: sets the address term, coach name and categories (AC-F8-1). */
  async applyJoin(link: JoinLinkV1): Promise<Profile> {
    const input: SetupInput = {
      addressTerm: link.address,
      coachName: link.coach,
      enabledCategories: link.cats,
    };
    if (link.player !== undefined) input.playerName = link.player;
    if (link.legitRate !== undefined) input.legitRate = link.legitRate;
    return this.setupProfile(input);
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const next: Settings = { ...this.state.settings, ...patch };
    if (next.reminderTime === undefined) delete next.reminderTime;
    if (next.audioFormat === undefined) delete next.audioFormat;
    await this.deps.repo.putSettings(next);
    this.store.set((s) => ({ ...s, settings: next }));
    return next;
  }

  // ── calls ────────────────────────────────────────────────────────────

  hasScoredToday(): boolean {
    const { attempts, today } = this.state;
    return attempts.some((a) => a.scored && a.localDate === today);
  }

  /** Score an ended call, persist it and update spaced repetition. */
  async recordCall(input: RecordCallInput): Promise<{ attempt: Attempt; summary: CallSummary }> {
    const { attempt, summary, saved } = this.scoreCall(input);
    await saved;
    return { attempt, summary };
  }

  /**
   * Score an ended call and show it at once; `saved` resolves when it is on disk. The signature
   * moment starts from the result of this call, so it must not wait for two IndexedDB writes
   * (AC-F9-1: the shards begin within 40 ms of the press). If a write fails, `saved` rejects and
   * the in-memory state is already ahead of the database until the next load.
   */
  scoreCall(input: RecordCallInput): { attempt: Attempt; summary: CallSummary; saved: Promise<void> } {
    const { scenario, ended } = input;
    const today = this.deps.clock.today();
    const summary = summarise(ended, scenario, {
      callbackIsTheLesson: callbackIsTheLesson({ kind: scenario.kind, category: scenario.category }),
    });
    const scored = input.scored && !this.state.attempts.some((a) => a.scored && a.localDate === today);
    const { markers, result } = summary;
    const attempt: Attempt = {
      localDate: today,
      scored,
      scenarioId: scenario.templateId,
      variantKey: scenario.variantKey,
      kind: scenario.kind,
      path: summary.path,
      action: ended.action,
      tEndMs: markers.tEndMs,
      outcome: result.outcome,
      points: result.points,
      tacticsBeforeAsk: summary.tacticsBeforeAsk,
    };
    if (input.family === true) attempt.family = true;
    if (ended.tActionMs !== undefined) attempt.tActionMs = ended.tActionMs;
    if (markers.tFlagMs !== undefined) attempt.tFlagMs = markers.tFlagMs;
    if (markers.tAskMs !== undefined) attempt.tAskMs = markers.tAskMs;

    let boxes = this.state.tacticBoxes;
    if (scored) {
      boxes = applyAttempt(
        boxes,
        { kind: scenario.kind, outcome: result.outcome, tacticsBeforeAsk: summary.tacticsBeforeAsk },
        today,
      );
    }
    this.store.set((s) => ({ ...s, today, attempts: [...s.attempts, attempt], tacticBoxes: boxes }));
    const saved = (async (): Promise<void> => {
      await this.deps.repo.addAttempt(attempt);
      if (scored) await this.deps.repo.putTacticBoxes(boxes);
    })();
    return { attempt, summary, saved };
  }

  // ── links received ───────────────────────────────────────────────────

  /** Store a cheer from a cheer link. The same coach's newer cheer replaces nothing: the player keeps them all. */
  async acceptCheer(link: CheerLinkV1): Promise<Cheer> {
    const cheer: Cheer = {
      id: this.deps.newId(),
      from: link.from,
      mime: link.mime,
      audio: base64ToBlob(link.b64, link.mime),
      receivedAt: new Date(this.deps.clock.now()).toISOString(),
    };
    if (link.text !== undefined) cheer.text = link.text;
    await this.deps.repo.putCheer(cheer);
    this.store.set((s) => ({ ...s, cheers: [cheer, ...s.cheers] }));
    return cheer;
  }

  async removeCheer(id: string): Promise<void> {
    await this.deps.repo.deleteCheer(id);
    this.store.set((s) => ({ ...s, cheers: s.cheers.filter((c) => c.id !== id) }));
  }

  /** Store a family call. Opening the same link twice does not duplicate it (the link carries its id). */
  async acceptFamilyCall(link: FamilyLinkV1): Promise<{ record: FamilyCallRecord; isNew: boolean }> {
    const existing = this.state.familyCalls.find((c) => c.id === link.id);
    if (existing) return { record: existing, isNew: false };
    const record: FamilyCallRecord = {
      id: link.id,
      from: link.from,
      call: link.call,
      receivedAt: new Date(this.deps.clock.now()).toISOString(),
      played: false,
    };
    await this.deps.repo.putFamilyCall(record);
    this.store.set((s) => ({ ...s, familyCalls: [...s.familyCalls, record] }));
    return { record, isNew: true };
  }

  async markFamilyCallPlayed(id: string): Promise<void> {
    await this.deps.repo.markFamilyCallPlayed(id);
    this.store.set((s) => ({
      ...s,
      familyCalls: s.familyCalls.map((c) => (c.id === id ? { ...c, played: true } : c)),
    }));
  }

  /** Coach device: save a result card to the inbox. The same card (same content) is stored once. */
  async saveResultCard(card: ResultCardV1): Promise<{ item: ReceivedResult; isNew: boolean }> {
    const id = resultCardId(card);
    const existing = this.state.inbox.find((i) => i.id === id);
    if (existing) return { item: existing, isNew: false };
    const item: ReceivedResult = {
      id,
      payload: card,
      receivedAt: new Date(this.deps.clock.now()).toISOString(),
    };
    await this.deps.repo.putInbox(item);
    this.store.set((s) => ({ ...s, inbox: [item, ...s.inbox] }));
    return { item, isNew: true };
  }

  async removeInbox(id: string): Promise<void> {
    await this.deps.repo.deleteInbox(id);
    this.store.set((s) => ({ ...s, inbox: s.inbox.filter((i) => i.id !== id) }));
  }

  async clearInbox(): Promise<void> {
    await this.deps.repo.clearInbox();
    this.store.set((s) => ({ ...s, inbox: [] }));
  }

  /** Settings → "Delete everything on this device" (SPEC §10.1). */
  async deleteEverything(): Promise<void> {
    await this.deps.repo.deleteEverything();
    this.store.set({
      status: 'ready',
      profile: undefined,
      settings: { ...DEFAULT_SETTINGS },
      attempts: [],
      tacticBoxes: [],
      cheers: [],
      familyCalls: [],
      inbox: [],
      today: this.deps.clock.today(),
    });
  }
}

/** Identity of a result card: the same player, day, call and outcome is one inbox entry. */
export function resultCardId(card: ResultCardV1): string {
  return [card.name, card.date, card.title, card.outcome, String(card.tAction ?? '')].join('|').slice(0, 64);
}
