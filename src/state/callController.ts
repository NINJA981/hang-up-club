import {
  RING_TIMEOUT_MS,
  callReducer,
  initialCallState,
  openReplies,
  type CallEvent,
  type CallState,
  type SessionContext,
} from '../domain/call/session';
import type { ResolvedScenario } from '../domain/scenario/expand';
import type { TimedLine } from '../domain/scenario/timeline';
import { createStore, type Store } from './store';

/**
 * What the call needs from the outside world. `audio/engine` implements it
 * for real; tests use a recording fake with a manual clock.
 */
export interface CallPort {
  /** Start the ringtone and vibration. */
  ring(): void;
  stopRing(): void;
  /** Called inside the Answer gesture: unlock audio, zero the call clock, schedule the plan. */
  answer(plan: readonly TimedLine[]): void;
  /** A reply branch was taken: drop unplayed audio and schedule the new plan from `fromMs`. */
  reschedule(plan: readonly TimedLine[], fromMs: number): void;
  /** Milliseconds since the Answer gesture, on the audio clock. */
  nowMs(): number;
  /** Hang up or call back: ramp to silence in ≤ 30 ms, then the line click. */
  cut(): void;
  /** The caller finished on their own. */
  finish(): void;
  /** The page was hidden: freeze the call clock and its audio. */
  pause?(): void;
  /** The page is back: run the clock and audio on from where they froze. */
  resume?(): void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type EndedState = Extract<CallState, { status: 'ended' }>;

export interface CallControllerOptions {
  scenario: ResolvedScenario;
  durationOf: SessionContext['durationOf'];
  port: CallPort;
  timers?: Timers;
  onEnded?: (ended: EndedState) => void;
}

/**
 * The effects layer around the pure `callReducer` (ADR §3.1): it owns the
 * state, feeds the reducer the audio clock, and tells the port what to do on
 * each transition.
 */
export class CallController {
  readonly store: Store<CallState> = createStore<CallState>(initialCallState);
  private readonly ctx: SessionContext;
  private readonly port: CallPort;
  private readonly timers: Timers;
  private readonly onEnded: ((ended: EndedState) => void) | undefined;
  private ringTimer: unknown;

  constructor(opts: CallControllerOptions) {
    this.ctx = { lines: opts.scenario.lines, durationOf: opts.durationOf };
    this.port = opts.port;
    this.timers = opts.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => {
        clearTimeout(h as ReturnType<typeof setTimeout>);
      },
    };
    this.onEnded = opts.onEnded;
  }

  get state(): CallState {
    return this.store.get();
  }

  private dispatch(event: CallEvent): CallState {
    const prev = this.store.get();
    const next = callReducer(prev, event, this.ctx);
    if (next !== prev) this.store.set(next);
    return next;
  }

  /** Begin ringing. The ring stops after 20 s but the screen keeps waiting (AC-F1-2). */
  ring(): void {
    if (this.state.status !== 'idle') return;
    this.dispatch({ type: 'RING' });
    this.port.ring();
    this.ringTimer = this.timers.setTimeout(() => {
      this.dispatch({ type: 'RING_TIMEOUT' });
      this.port.stopRing();
    }, RING_TIMEOUT_MS);
  }

  /** Must run inside the user's tap, drag or key press so audio can start (iOS autoplay rules). */
  answer(): void {
    if (this.state.status !== 'ringing') return;
    this.clearRing();
    this.port.stopRing();
    const next = this.dispatch({ type: 'ANSWER' });
    if (next.status === 'live') this.port.answer(next.plan);
  }

  /** Advance the model to the audio clock. Call from requestAnimationFrame. */
  tick(): CallState {
    if (this.state.status !== 'live' || this.paused) return this.state;
    return this.settle(this.dispatch({ type: 'TICK', tMs: this.port.nowMs() }));
  }

  private paused = false;

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * The page was hidden mid-call (another tab or app). The call clock and its audio stop, so the
   * script cannot run out while the player is away and score a call they never got to act on.
   */
  pause(): void {
    if (this.state.status !== 'live' || this.paused) return;
    this.paused = true;
    this.port.pause?.();
  }

  /** The page is visible again: the call carries on from where it stopped. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.state.status === 'live') this.port.resume?.();
  }

  /** Take reply chip `index` on whichever line currently offers replies. */
  reply(index: number): void {
    const s = this.state;
    if (s.status !== 'live') return;
    const t = this.port.nowMs();
    const open = openReplies(s, t);
    if (!open) return;
    const next = this.dispatch({ type: 'REPLY', lineId: open.lineId, index, tMs: t });
    if (next.status === 'live' && next !== s) this.port.reschedule(next.plan, t);
  }

  hangUp(): EndedState | undefined {
    return this.end({ type: 'HANG_UP', tMs: this.port.nowMs() });
  }

  callBack(): EndedState | undefined {
    return this.end({ type: 'CALL_BACK', tMs: this.port.nowMs() });
  }

  private end(event: Extract<CallEvent, { type: 'HANG_UP' | 'CALL_BACK' }>): EndedState | undefined {
    if (this.state.status !== 'live') return undefined;
    const next = this.settle(this.dispatch(event));
    return next.status === 'ended' ? next : undefined;
  }

  /** Run the end-of-call side effects exactly once. */
  private settle(next: CallState): CallState {
    if (next.status !== 'ended' || this.finished) return next;
    this.finished = true;
    if (next.action === 'none') this.port.finish();
    else this.port.cut();
    this.onEnded?.(next);
    return next;
  }

  private finished = false;

  private clearRing(): void {
    if (this.ringTimer !== undefined) this.timers.clearTimeout(this.ringTimer);
    this.ringTimer = undefined;
  }

  dispose(): void {
    this.clearRing();
    this.port.stopRing();
  }
}
