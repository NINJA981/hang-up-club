import { describe, expect, it, vi } from 'vitest';
import {
  RING_TIMEOUT_MS,
  callReducer,
  initialCallState,
  openReplies,
  playedPath,
  summarise,
  visibleCaptions,
  type CallEvent,
  type CallState,
  type SessionContext,
} from '../../src/domain/call/session';
import { createSilentPort } from '../../src/audio/silent';
import { resolveVariant } from '../../src/domain/scenario/expand';
import { CallController, type CallPort, type EndedState, type Timers } from '../../src/state/callController';
import { MINI_LEGIT, MINI_SCAM, MINI_TERMS } from './helpers/fixtures';

// Same hand-set durations as timeline.test.ts: markers tFlag 5700, tAsk 10350, tEnd 12300.
const DURATIONS: Record<string, number> = {
  hello: 1000,
  intro: 2000,
  who: 1000,
  warning: 2400,
  ask: 3000,
  coda: 1500,
};
const durationOf = (l: { id: string }): number => DURATIONS[l.id] ?? 1000;

const scam = resolveVariant(MINI_SCAM, MINI_TERMS, 0);
const ctx: SessionContext = { lines: scam.lines, durationOf };

function run(...events: CallEvent[]): CallState {
  return events.reduce((s, e) => callReducer(s, e, ctx), initialCallState);
}
const live = (...more: CallEvent[]): CallState => run({ type: 'RING' }, { type: 'ANSWER' }, ...more);
type Live = Extract<CallState, { status: 'live' }>;
type Ended = Extract<CallState, { status: 'ended' }>;
const asLive = (s: CallState): Live => {
  if (s.status !== 'live') throw new Error(`expected live, got ${s.status}`);
  return s;
};
const asEnded = (s: CallState): Ended => {
  if (s.status !== 'ended') throw new Error(`expected ended, got ${s.status}`);
  return s;
};

describe('ringing and answering', () => {
  it('walks idle, ringing, live', () => {
    expect(initialCallState).toEqual({ status: 'idle' });
    expect(run({ type: 'RING' })).toEqual({ status: 'ringing', ringing: true });
    const s = asLive(live());
    expect(s.nowMs).toBe(0);
    expect(s.plan.map((l) => l.id)).toEqual(['hello', 'intro', 'warning', 'ask', 'coda']);
  });
  it('keeps waiting after the ring times out (AC-F1-2)', () => {
    expect(RING_TIMEOUT_MS).toBe(20_000);
    const s = run({ type: 'RING' }, { type: 'RING_TIMEOUT' });
    expect(s).toEqual({ status: 'ringing', ringing: false });
    expect(callReducer(s, { type: 'ANSWER' }, ctx).status).toBe('live');
  });
  it('ignores events that do not make sense in the current state', () => {
    expect(run({ type: 'ANSWER' })).toEqual({ status: 'idle' });
    expect(run({ type: 'TICK', tMs: 5 })).toEqual({ status: 'idle' });
    expect(run({ type: 'HANG_UP', tMs: 5 })).toEqual({ status: 'idle' });
    expect(run({ type: 'RING_TIMEOUT' })).toEqual({ status: 'idle' });
    const again = live();
    expect(callReducer(again, { type: 'RING' }, ctx)).toBe(again);
    expect(callReducer(again, { type: 'ANSWER' }, ctx)).toBe(again);
  });
});

describe('time passing', () => {
  it('advances nowMs but never backwards', () => {
    expect(asLive(live({ type: 'TICK', tMs: 3000 })).nowMs).toBe(3000);
    expect(asLive(live({ type: 'TICK', tMs: 3000 }, { type: 'TICK', tMs: 2000 })).nowMs).toBe(3000);
  });
  it('ends by itself when the caller finishes: caught, with no action', () => {
    const s = asEnded(live({ type: 'TICK', tMs: 12_300 }));
    expect(s.action).toBe('none');
    expect(s.endMs).toBe(12_300);
    expect(s.tActionMs).toBeUndefined();
  });
  it('stays live one millisecond before the end', () => {
    expect(live({ type: 'TICK', tMs: 12_299 }).status).toBe('live');
  });
});

describe('hanging up and calling back', () => {
  it('records the exact time of the action', () => {
    const s = asEnded(live({ type: 'TICK', tMs: 5900 }, { type: 'HANG_UP', tMs: 6000 }));
    expect(s).toMatchObject({ action: 'hangup', tActionMs: 6000, endMs: 6000 });
    expect(asEnded(live({ type: 'CALL_BACK', tMs: 4321.6 }))).toMatchObject({
      action: 'callback',
      tActionMs: 4322,
    });
  });
  it('a press after the caller already finished counts as the call ending on its own', () => {
    const s = asEnded(live({ type: 'HANG_UP', tMs: 12_300 }));
    expect(s.action).toBe('none');
  });
  it('does nothing once ended', () => {
    const ended = live({ type: 'HANG_UP', tMs: 6000 });
    expect(callReducer(ended, { type: 'HANG_UP', tMs: 7000 }, ctx)).toBe(ended);
    expect(callReducer(ended, { type: 'TICK', tMs: 8000 }, ctx)).toBe(ended);
  });
});

describe('reply chips (AC-F2-4)', () => {
  // The intro line runs 1600+450 = 2050 .. 4050, pause to 4500.
  const open = (tMs: number): CallState => live({ type: 'TICK', tMs });

  it('are open from the start of the line until the next line starts', () => {
    expect(openReplies(asLive(open(1000)), 1000)).toBeNull(); // hello has no replies
    expect(openReplies(asLive(open(2050)), 2050)?.lineId).toBe('intro');
    expect(openReplies(asLive(open(4400)), 4400)?.lineId).toBe('intro'); // still in the pause
    expect(openReplies(asLive(open(4600)), 4600)).toBeNull(); // warning has begun
  });
  it('follow the branch the player chose', () => {
    const s = asLive(open(3000));
    const after = asLive(callReducer(s, { type: 'REPLY', lineId: 'intro', index: 0, tMs: 3000 }, ctx));
    expect(after.plan.map((l) => l.id)).toEqual(['hello', 'intro', 'who', 'warning', 'ask', 'coda']);
    expect(after.choices).toEqual({ intro: 0 });
    expect(after.answeredReplies).toEqual(['intro']);
    expect(after.nowMs).toBe(3000);
  });
  it('can only be answered once', () => {
    const s = asLive(open(3000));
    const first = callReducer(s, { type: 'REPLY', lineId: 'intro', index: 0, tMs: 3000 }, ctx);
    expect(callReducer(first, { type: 'REPLY', lineId: 'intro', index: 1, tMs: 3100 }, ctx)).toBe(first);
  });
  it('ignore a reply for a line that is not offering one, a bad index, or a reply that came too late', () => {
    const s = asLive(open(3000));
    expect(callReducer(s, { type: 'REPLY', lineId: 'hello', index: 0, tMs: 3000 }, ctx)).toBe(s);
    expect(callReducer(s, { type: 'REPLY', lineId: 'intro', index: 7, tMs: 3000 }, ctx)).toBe(s);
    const late = asLive(open(5000));
    expect(callReducer(late, { type: 'REPLY', lineId: 'intro', index: 0, tMs: 5000 }, ctx)).toBe(late);
  });
  it('without a choice the call continues on the default path', () => {
    const s = asEnded(live({ type: 'TICK', tMs: 13_000 }));
    expect(s.plan.map((l) => l.id)).toEqual(['hello', 'intro', 'warning', 'ask', 'coda']);
  });
});

describe('captions', () => {
  const s = asLive(live());
  it('show the current line and the one before (last two lines)', () => {
    expect(visibleCaptions(s.plan, 0)).toEqual([]);
    expect(visibleCaptions(s.plan, 700).map((l) => l.id)).toEqual(['hello']);
    expect(visibleCaptions(s.plan, 2100).map((l) => l.id)).toEqual(['hello', 'intro']);
    expect(visibleCaptions(s.plan, 11_000).map((l) => l.id)).toEqual(['ask', 'coda']);
  });
});

describe('scoring an ended call', () => {
  const sharp = asEnded(live({ type: 'HANG_UP', tMs: 6000 }));
  it('scores a hang-up between the flag and the ask as sharp, with the markers of the path played', () => {
    const sum = summarise(sharp, scam);
    expect(sum.result).toMatchObject({ outcome: 'sharp', points: 100, moment: 'cut' });
    expect(sum.markers).toMatchObject({ tFlagMs: 5700, tAskMs: 10_350, tEndMs: 12_300 });
    expect(sum.path).toEqual(['hello', 'intro', 'warning']); // lines that had begun
    expect(sum.tacticsBeforeAsk).toEqual(['authority', 'urgency', 'code-request']);
  });
  it('scores a call left running as caught', () => {
    const caught = asEnded(live({ type: 'TICK', tMs: 99_999 }));
    expect(summarise(caught, scam).result.outcome).toBe('caught');
    expect(playedPath(caught)).toEqual(['hello', 'intro', 'warning', 'ask', 'coda']);
  });
  it('scores each branch against its own timings', () => {
    const branch = asEnded(
      live(
        { type: 'TICK', tMs: 3000 },
        { type: 'REPLY', lineId: 'intro', index: 0, tMs: 3000 },
        { type: 'HANG_UP', tMs: 6500 },
      ),
    );
    // The tap at 3000 waits for the intro to end (4050), so "who" runs 4050-5050 and the flag cue lands at
    // 5500 + 1200 = 6700. A hang-up at 6500 is before that flag: jumpy.
    expect(summarise(branch, scam).markers.tFlagMs).toBe(6700);
    expect(summarise(branch, scam).result.outcome).toBe('jumpy');
  });
  it('a call back before the ask is verified; on a real call it is cautious, except the real bank alert (100)', () => {
    const cb = asEnded(live({ type: 'CALL_BACK', tMs: 8000 }));
    expect(summarise(cb, scam).result).toMatchObject({ outcome: 'verified', points: 100 });
    const legit = resolveVariant(MINI_LEGIT, MINI_TERMS, 0);
    const legitCtx: SessionContext = { lines: legit.lines, durationOf: () => 1000 };
    const legitLive = [{ type: 'RING' }, { type: 'ANSWER' }, { type: 'CALL_BACK', tMs: 1500 }] as CallEvent[];
    const ended = asEnded(legitLive.reduce((s, e) => callReducer(s, e, legitCtx), initialCallState));
    expect(summarise(ended, legit).result).toMatchObject({ outcome: 'cautious', points: 60 });
    expect(summarise(ended, legit, { callbackIsTheLesson: true }).result.points).toBe(100);
  });
  it('a hang-up on a legitimate call is missed', () => {
    const legit = resolveVariant(MINI_LEGIT, MINI_TERMS, 0);
    const legitCtx: SessionContext = { lines: legit.lines, durationOf: () => 1000 };
    const ended = asEnded(
      [{ type: 'RING' }, { type: 'ANSWER' }, { type: 'HANG_UP', tMs: 700 }].reduce(
        (s, e) => callReducer(s, e as CallEvent, legitCtx),
        initialCallState,
      ),
    );
    expect(summarise(ended, legit).result).toMatchObject({ outcome: 'missed', points: 20 });
  });
});

// ── The effects layer ────────────────────────────────────────────────────

class FakePort implements CallPort {
  log: string[] = [];
  now = 0;
  ring = vi.fn(() => void this.log.push('ring'));
  stopRing = vi.fn(() => void this.log.push('stopRing'));
  answer = vi.fn((plan: readonly { id: string }[]) => void this.log.push(`answer:${plan.length}`));
  reschedule = vi.fn(
    (plan: readonly { id: string }[], from: number) =>
      void this.log.push(`reschedule:${plan.length}@${String(from)}`),
  );
  cut = vi.fn(() => void this.log.push('cut'));
  finish = vi.fn(() => void this.log.push('finish'));
  nowMs = (): number => this.now;
}

class FakeTimers implements Timers {
  pending = new Map<number, { fn: () => void; ms: number }>();
  private next = 1;
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.next++;
    this.pending.set(id, { fn, ms });
    return id;
  }
  clearTimeout(h: unknown): void {
    this.pending.delete(h as number);
  }
  fireAll(): void {
    for (const [id, t] of [...this.pending]) {
      this.pending.delete(id);
      t.fn();
    }
  }
}

function controller(onEnded?: (e: EndedState) => void) {
  const port = new FakePort();
  const timers = new FakeTimers();
  const opts = { scenario: scam, durationOf, port, timers, ...(onEnded ? { onEnded } : {}) };
  return { c: new CallController(opts), port, timers };
}

describe('CallController', () => {
  it('rings, then answers inside the gesture and schedules the plan', () => {
    const { c, port, timers } = controller();
    c.ring();
    expect(c.state).toEqual({ status: 'ringing', ringing: true });
    expect([...timers.pending.values()].map((t) => t.ms)).toEqual([RING_TIMEOUT_MS]);
    c.answer();
    expect(c.state.status).toBe('live');
    expect(port.log).toEqual(['ring', 'stopRing', 'answer:5']);
    expect(timers.pending.size).toBe(0); // the ring timer was cleared
  });
  it('stops ringing after 20 s but keeps the call waiting', () => {
    const { c, port, timers } = controller();
    c.ring();
    timers.fireAll();
    expect(c.state).toEqual({ status: 'ringing', ringing: false });
    expect(port.stopRing).toHaveBeenCalledTimes(1);
    c.answer();
    expect(c.state.status).toBe('live');
  });
  it('a hidden page pauses the call: a long gap never ends or scores it', () => {
    const onEnded = vi.fn();
    const { c, port } = controller(onEnded);
    const pause = vi.fn();
    const resume = vi.fn();
    Object.assign(port, { pause, resume });
    c.ring();
    c.answer();
    port.now = 3000;
    c.tick();
    c.pause();
    expect(c.isPaused).toBe(true);
    expect(pause).toHaveBeenCalledTimes(1);
    // The audio clock would have run far past the end of the script while the tab was hidden.
    port.now = 10 * 60_000;
    expect(c.tick().status).toBe('live');
    expect(onEnded).not.toHaveBeenCalled();
    port.now = 3000; // a suspended context's clock stands still, so it reads where it stopped
    c.resume();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(c.tick().status).toBe('live');
    expect(c.hangUp()?.tActionMs).toBe(3000);
  });
  it('pause and resume are no-ops outside a live call', () => {
    const { c } = controller();
    c.pause();
    expect(c.isPaused).toBe(false);
    c.resume();
    expect(c.state.status).toBe('idle');
  });
  it('the silent port clock stops while paused', () => {
    let t = 0;
    const port = createSilentPort({ now: () => t });
    port.answer([]);
    t = 2000;
    port.pause?.();
    t = 60_000;
    expect(port.nowMs()).toBe(2000);
    port.resume?.();
    t = 61_000;
    expect(port.nowMs()).toBe(3000);
  });
  it('ignores answer before ringing, and a second ring', () => {
    const { c, port } = controller();
    c.answer();
    expect(c.state.status).toBe('idle');
    c.ring();
    c.ring();
    expect(port.ring).toHaveBeenCalledTimes(1);
  });
  it('hang up cuts the audio once, reports once and scores from the audio clock', () => {
    const onEnded = vi.fn();
    const { c, port } = controller(onEnded);
    c.ring();
    c.answer();
    port.now = 6000;
    const ended = c.hangUp();
    expect(ended).toMatchObject({ status: 'ended', action: 'hangup', tActionMs: 6000 });
    expect(port.cut).toHaveBeenCalledTimes(1);
    expect(port.finish).not.toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(c.hangUp()).toBeUndefined(); // already ended
    expect(c.callBack()).toBeUndefined();
    expect(port.cut).toHaveBeenCalledTimes(1);
  });
  it('call back cuts the audio too', () => {
    const { c, port } = controller();
    c.ring();
    c.answer();
    port.now = 3000;
    expect(c.callBack()).toMatchObject({ action: 'callback' });
    expect(port.cut).toHaveBeenCalledTimes(1);
  });
  it('lets the caller finish: finish(), not cut(), and the call is caught', () => {
    const onEnded = vi.fn();
    const { c, port } = controller(onEnded);
    c.ring();
    c.answer();
    port.now = 5000;
    expect(c.tick().status).toBe('live');
    port.now = 12_400;
    expect(c.tick().status).toBe('ended');
    expect(port.finish).toHaveBeenCalledTimes(1);
    expect(port.cut).not.toHaveBeenCalled();
    c.tick();
    expect(onEnded).toHaveBeenCalledTimes(1);
  });
  it('a reply re-schedules the audio from the tap time', () => {
    const { c, port } = controller();
    c.ring();
    c.answer();
    port.now = 3000;
    c.tick();
    c.reply(0);
    expect(port.reschedule).toHaveBeenCalledTimes(1);
    expect(port.log.at(-1)).toBe('reschedule:6@3000');
    c.reply(1); // already answered
    expect(port.reschedule).toHaveBeenCalledTimes(1);
  });
  it('a reply outside a reply window does nothing', () => {
    const { c, port } = controller();
    c.ring();
    c.answer();
    port.now = 800; // inside hello, which has no chips
    c.reply(0);
    expect(port.reschedule).not.toHaveBeenCalled();
  });
  it('dispose silences the ring and clears the timer', () => {
    const { c, port, timers } = controller();
    c.ring();
    c.dispose();
    expect(timers.pending.size).toBe(0);
    expect(port.stopRing).toHaveBeenCalled();
  });
  it('publishes every change to subscribers', () => {
    const { c, port } = controller();
    const seen: string[] = [];
    c.store.subscribe(() => seen.push(c.state.status));
    c.ring();
    c.answer();
    port.now = 6000;
    c.hangUp();
    expect(seen).toEqual(['ringing', 'live', 'ended']);
  });
});
