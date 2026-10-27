import { durationOfFrom } from '../domain/audio/manifest';
import { summarise, type CallSummary } from '../domain/call/session';
import type { ResolvedLine, ResolvedScenario } from '../domain/scenario/expand';
import { callbackIsTheLesson } from '../domain/scenario/library';
import { planTimeline, type TimedLine } from '../domain/scenario/timeline';
import { CallController, type EndedState } from '../state/callController';
import type { AppController } from '../state/app';
import type { Content } from '../state/library';
import { createStore, type Store } from '../state/store';
import type { Attempt } from '../storage/schemas';
import { createCallAudio, type CallAudio } from './callAudio';
import type { AppParams } from './params';

export interface CallRequest {
  scenario: ResolvedScenario;
  /** The daily call is scored; "practice another" is not. */
  scored: boolean;
  family: boolean;
  /** Set when a family call should be marked as played once it ends. */
  familyCallId?: string;
}

export interface CallSession extends CallRequest {
  controller: CallController;
  audio: CallAudio;
  durationOf: (line: ResolvedLine) => number;
  /** No clip and no local voice: captions only (AC-F5-4). */
  readAlong: boolean;
}

export interface CallOutcome {
  attempt: Attempt;
  summary: CallSummary;
  ended: EndedState;
  request: CallRequest;
}

export interface RunnerState {
  phase: 'idle' | 'preparing' | 'failed' | 'call' | 'done';
  progress: { done: number; total: number };
  /** What is being started (shown while preparing, kept for Try again). */
  request?: CallRequest;
  failure?: 'offline' | 'unknown';
  session?: CallSession;
  outcome?: CallOutcome;
  /** The Line may now give way to the result (The Cut). */
  revealed: boolean;
  /** The Cut has played once; coming back to the result shows the settled state. */
  introPlayed: boolean;
  /** Bumped on every reveal so the result can restart its sequence. */
  revealCount: number;
}

const IDLE: RunnerState = {
  phase: 'idle',
  progress: { done: 0, total: 0 },
  revealed: false,
  introPlayed: false,
  revealCount: 0,
};

export interface RunnerEnv {
  controller: AppController;
  content: Content;
  params: AppParams;
}

/**
 * Orchestrates one call from the tap on "Take today's call" to the result:
 * audio, the controller, scoring and saving. The UI only reads its store and
 * calls its methods (DESIGN.md Screen specs: Today, Incoming, In call, Call back).
 */
export class CallRunner {
  readonly store: Store<RunnerState> = createStore<RunnerState>(IDLE);
  private pendingAudio:
    { audio: CallAudio; request: CallRequest; missing: number; total: number } | undefined;

  constructor(private readonly env: RunnerEnv) {}

  get state(): RunnerState {
    return this.store.get();
  }

  /** Must be called from inside the tap, before the first await, so audio may start on iOS. */
  async start(request: CallRequest): Promise<void> {
    const { controller, content, params } = this.env;
    this.discardPending();
    this.releaseSession();
    const audio = createCallAudio({
      manifest: content.manifest,
      settings: controller.state.settings,
      params,
    });
    const lines = [...request.scenario.lines, ...ivrLines(request.scenario)];
    this.store.set({ ...IDLE, phase: 'preparing', request, progress: { done: 0, total: lines.length } });
    let missing = 0;
    try {
      ({ missing } = await audio.prepare(lines, request.scenario.caller.bed, (done, total) => {
        this.store.set((s) => (s.phase === 'preparing' ? { ...s, progress: { done, total } } : s));
      }));
    } catch {
      audio.dispose();
      this.store.set({ ...IDLE, phase: 'failed', request, failure: 'unknown' });
      return;
    }
    const distinct = new Set(lines.map((l) => `${l.voice}|${l.text}`)).size;
    const nothingLoaded = distinct > 0 && missing >= distinct;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (nothingLoaded && offline && content.manifest.version !== 'none' && !params.test) {
      this.pendingAudio = { audio, request, missing, total: distinct };
      this.store.set({ ...IDLE, phase: 'failed', request, failure: 'offline' });
      return;
    }
    this.begin(audio, request, missing, distinct);
  }

  /** "Use the built-in voice instead": go on without downloaded clips. */
  useBuiltInVoice(): void {
    const p = this.pendingAudio;
    this.pendingAudio = undefined;
    if (p) this.begin(p.audio, p.request, p.missing, p.total);
  }

  private begin(audio: CallAudio, request: CallRequest, missing: number, total: number): void {
    const { content } = this.env;
    const durationOf = durationOfFrom(content.manifest);
    const controller = new CallController({
      scenario: request.scenario,
      durationOf,
      port: audio.port,
      onEnded: (ended) => {
        void this.handleEnded(ended);
      },
    });
    const session: CallSession = {
      ...request,
      controller,
      audio,
      durationOf,
      readAlong: !audio.canSpeak(missing, total),
    };
    this.store.set({ ...IDLE, phase: 'call', session, request });
    controller.ring();
  }

  private async handleEnded(ended: EndedState): Promise<void> {
    const s = this.state.session;
    if (!s) return;
    const request: CallRequest = {
      scenario: s.scenario,
      scored: s.scored,
      family: s.family,
    };
    if (s.familyCallId !== undefined) request.familyCallId = s.familyCallId;
    const { attempt, summary } = await this.env.controller.recordCall({
      ended,
      scenario: s.scenario,
      scored: s.scored,
      family: s.family,
    });
    if (s.familyCallId !== undefined) await this.env.controller.markFamilyCallPlayed(s.familyCallId);
    this.store.set((st) => ({ ...st, outcome: { attempt, summary, ended, request } }));
    // A hang-up reveals the result at once; a call back first goes to the Call back screen.
    if (ended.action !== 'callback') this.reveal();
  }

  /** The Line gives way to the result. */
  reveal(): void {
    this.store.set((st) =>
      st.revealed ? st : { ...st, revealed: true, introPlayed: false, revealCount: st.revealCount + 1 },
    );
  }

  /** The Line has finished leaving; release the audio. */
  lineGone(): void {
    this.releaseSession();
    this.store.set((st) => (st.phase === 'call' ? { ...st, phase: 'done' } : st));
  }

  markIntroPlayed(): void {
    this.store.set((st) => (st.introPlayed ? st : { ...st, introPlayed: true }));
  }

  /** Leave a ringing call that was never answered. */
  notNow(): void {
    this.releaseSession();
    this.store.set(IDLE);
  }

  reset(): void {
    this.discardPending();
    this.releaseSession();
    this.store.set(IDLE);
  }

  /** Play the organisation's real line on the Call back screen; returns its plan. */
  startIvr(): TimedLine[] {
    const s = this.state.session;
    if (!s) return [];
    const plan = planTimeline(ivrLines(s.scenario), s.durationOf);
    s.audio.port.answer(plan);
    return plan;
  }

  ivrNowMs(): number {
    return this.state.session?.audio.port.nowMs() ?? 0;
  }

  endIvr(): void {
    this.state.session?.audio.port.finish();
  }

  /** Re-derive what recordCall computed, synchronously, for the moment to play. */
  momentOf(ended: EndedState, scenario: ResolvedScenario): CallSummary {
    return summarise(ended, scenario, { callbackIsTheLesson: callbackIsTheLesson(scenario) });
  }

  private discardPending(): void {
    this.pendingAudio?.audio.dispose();
    this.pendingAudio = undefined;
  }

  private releaseSession(): void {
    const s = this.state.session;
    if (!s) return;
    s.controller.dispose();
    s.audio.dispose();
  }
}

/** The callback IVR as lines the timeline planner understands. */
export function ivrLines(scenario: ResolvedScenario): ResolvedLine[] {
  return scenario.callback.ivr.map((l) => ({
    id: l.id,
    text: l.say,
    speaker: 'Customer service',
    voice: scenario.callback.voice,
  }));
}
