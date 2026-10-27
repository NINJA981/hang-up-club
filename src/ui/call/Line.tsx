import { Captions, CaptionsOff, Info, Phone, PhoneIncoming, ChevronsRight } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useApp, useAppSnapshot, useRunner } from '../../app/AppContext';
import { loadResult } from '../../app/preload';
import { navigate } from '../../app/router';
import type { CallSession } from '../../app/callRunner';
import { openReplies, type CallState } from '../../domain/call/session';
import { formatClock, formatPhone } from '../../domain/format/format';
import { lineAt, type TimedLine } from '../../domain/scenario/timeline';
import { READ_ALONG_BANNER } from '../../audio/speechFallback';
import { useStore } from '../../state/hooks';
import { createStore } from '../../state/store';
import { useHotkeys } from '../hotkeys';
import { useReducedMotion } from '../reducedMotion';
import { Keycap, cn } from '../parts/base';
import { playCut } from './cut';

const NO_PLAN: TimedLine[] = [];

// ── Incoming (F1) ───────────────────────────────────────────────────────────

const KNOB = 96;

function Incoming({ session, onNotNow }: { session: CallSession; onNotNow: () => void }) {
  const { controller, scenario } = session;
  const reduced = useReducedMotion();
  const ringing = useStore(controller.store, (s) => s.status === 'ringing' && s.ringing);
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLButtonElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ startX: number; dx: number; moved: boolean } | null>(null);
  const answered = useRef(false);

  const answer = (): void => {
    if (answered.current) return;
    answered.current = true;
    controller.answer(); // inside the gesture: audio may start (iOS)
  };

  const place = (dx: number, animateBack: boolean): void => {
    const knob = knobRef.current;
    if (!knob) return;
    knob.style.transition = animateBack ? 'transform 250ms var(--ease-out)' : 'none';
    knob.style.transform = `translateX(${String(dx)}px)`;
    if (hintRef.current) hintRef.current.style.opacity = String(Math.max(0, 1 - dx / 140));
  };
  const maxTravel = (): number => Math.max(0, (trackRef.current?.offsetWidth ?? 0) - KNOB);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    drag.current = { startX: e.clientX, dx: 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.min(maxTravel(), Math.max(0, e.clientX - d.startX));
    if (Math.abs(e.clientX - d.startX) > 6) d.moved = true;
    d.dx = dx;
    if (d.moved) place(dx, false);
  };
  const onPointerUp = (): void => {
    const d = drag.current;
    if (!d?.moved) {
      drag.current = null;
      return; // a tap: the click handler answers
    }
    // Sliding at least 80% of the track answers (AC-F1-3).
    if (d.dx >= 0.8 * maxTravel()) answer();
    else place(0, true);
    // Keep `moved` set until the click that follows the release has been ignored.
    window.setTimeout(() => {
      drag.current = null;
    }, 0);
  };

  useEffect(() => {
    knobRef.current?.focus({ preventScroll: true });
  }, []);

  // Enter or Space anywhere answers on desktop, unless a different control has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target;
      if (t instanceof HTMLElement && t.closest('button,a,input,textarea,select')) return;
      e.preventDefault();
      answer();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  const display = scenario.caller.display;
  return (
    <div className="huc-safe-top flex min-h-dvh flex-col px-6 pb-8">
      <div className="flex h-16 items-center justify-between">
        <p className="inline-flex items-center gap-2 text-meta text-call-muted">
          <PhoneIncoming aria-hidden className="size-5" />
          Practice call
        </p>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4 pb-12">
        <p className="text-meta text-call-muted" aria-live="polite">
          {ringing ? 'Incoming call' : 'The ringing stopped. You can still answer.'}
        </p>
        <h1 className="text-caller text-call-text" dir="auto">
          {display}
        </h1>
        <p className="tabular font-mono text-mono-number text-call-muted">
          {formatPhone(scenario.caller.number)}
        </p>
        {reduced && ringing && <p className="text-ui text-call-text">Ringing…</p>}
      </div>

      <div className="flex flex-col items-center gap-4">
        <div
          ref={trackRef}
          className="relative flex h-24 w-full max-w-80 items-center rounded-md bg-call-surface"
        >
          <span
            ref={hintRef}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-5 left-28 flex items-center justify-end gap-2 text-ui text-call-muted"
          >
            Slide to answer
            <ChevronsRight className="size-6" />
          </span>
          <div className="absolute top-0 left-0 size-24">
            <span
              aria-hidden
              data-paused={!ringing || reduced}
              className="huc-ring-halo pointer-events-none absolute -inset-2 rounded-full border-2 border-call-ring"
            />
            <span
              aria-hidden
              data-paused={!ringing || reduced}
              data-delay="1"
              className="huc-ring-halo pointer-events-none absolute -inset-4 rounded-full border-2 border-call-ring"
            />
            <button
              ref={knobRef}
              type="button"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onClick={() => {
                // A drag that did not reach 80% must not count as a tap.
                if (drag.current?.moved) return;
                answer();
              }}
              className="relative z-10 flex size-24 touch-none flex-col items-center justify-center gap-1 rounded-full bg-call-answer text-on-call-answer"
            >
              <Phone aria-hidden className="size-8" strokeWidth={2} />
              <span className="text-ui">Answer</span>
            </button>
          </div>
        </div>
        <p className="flex items-center gap-2 text-meta text-call-muted">
          Or tap the green button
          <Keycap tone="line">Enter</Keycap>
        </p>
        <button
          type="button"
          onClick={onNotNow}
          className="h-14 rounded-md px-5 text-ui text-call-muted hover:text-call-text"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

// ── In call (F2) ────────────────────────────────────────────────────────────

function Timer({ session }: { session: CallSession }) {
  const sec = useStore(session.controller.store, (s) =>
    s.status === 'live' ? Math.floor(s.nowMs / 1000) : s.status === 'ended' ? Math.floor(s.endMs / 1000) : 0,
  );
  return (
    <p
      className="tabular min-w-16 font-mono text-mono-timer text-call-text"
      role="timer"
      aria-label={`Call time ${formatClock(sec * 1000)}`}
    >
      {formatClock(sec * 1000)}
    </p>
  );
}

function InCall({ session }: { session: CallSession }) {
  const { controller, scenario } = session;
  const app = useAppSnapshot();
  const { actions } = useApp();
  const captionsOn = app.settings.captions;
  const status = useStore(controller.store, (s) => s.status);
  const plan = useStore(controller.store, (s) =>
    s.status === 'live' || s.status === 'ended' ? s.plan : NO_PLAN,
  );
  const currentId = useStore(controller.store, (s) => {
    if (s.status === 'live') return lineAt(s.plan, s.nowMs)?.id ?? '';
    if (s.status === 'ended') return lineAt(s.plan, s.endMs)?.id ?? '';
    return '';
  });
  const openId = useStore(controller.store, (s) =>
    s.status === 'live' ? (openReplies(s, s.nowMs)?.lineId ?? '') : '',
  );
  const live = status === 'live';
  const hasChips = scenario.lines.some((l) => (l.replies?.length ?? 0) > 0);
  const idx = plan.findIndex((l) => l.id === currentId);
  const curLine = idx >= 0 ? plan[idx] : undefined;
  const prevLine = idx > 0 ? plan[idx - 1] : undefined;
  const chips = openId ? (plan.find((l) => l.id === openId)?.replies ?? []) : [];

  const hangUp = (): void => {
    if (live) controller.hangUp();
  };
  const callBack = (): void => {
    if (live) controller.callBack();
  };
  const setCaptions = (on: boolean): void => {
    void actions.updateSettings({ captions: on });
  };

  useHotkeys(
    {
      h: hangUp,
      c: callBack,
      '1': () => {
        controller.reply(0);
      },
      '2': () => {
        controller.reply(1);
      },
      k: () => {
        setCaptions(!captionsOn);
      },
    },
    live,
  );

  return (
    <div className="huc-safe-top flex min-h-dvh flex-col px-6 pb-8">
      <header className="flex flex-col gap-1 pt-4 pb-2">
        <div className="flex h-14 items-center justify-between gap-3">
          <p className="line-clamp-2 min-w-0 text-ui text-call-text" dir="auto">
            {scenario.caller.display}
          </p>
          <button
            type="button"
            aria-pressed={captionsOn}
            aria-label={captionsOn ? 'Turn captions off' : 'Turn captions on'}
            onClick={() => {
              setCaptions(!captionsOn);
            }}
            className="-mr-3 inline-flex size-14 shrink-0 items-center justify-center rounded-md text-call-muted hover:bg-call-surface hover:text-call-text"
          >
            {captionsOn ? (
              <Captions aria-hidden className="size-6" />
            ) : (
              <CaptionsOff aria-hidden className="size-6" />
            )}
          </button>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="tabular font-mono text-mono-number whitespace-nowrap text-call-muted">
            {formatPhone(scenario.caller.number)}
          </p>
          <Timer session={session} />
        </div>
      </header>

      {session.readAlong && (
        <p className="flex items-start gap-2 rounded-md bg-call-surface px-4 py-3 text-meta text-call-text">
          <Info aria-hidden className="mt-0.5 size-5 shrink-0" />
          {READ_ALONG_BANNER}
        </p>
      )}

      <div className="flex min-h-64 flex-1 flex-col justify-center py-6">
        {captionsOn ? (
          // Two fixed-height slots, so a new line never moves anything (CLS 0, AC-F2-6).
          <div className="flex max-w-prose flex-col gap-4">
            <div aria-hidden className="h-26 overflow-hidden">
              {prevLine && (
                <p key={prevLine.id} className="text-caption-live text-call-muted">
                  <span className="mb-1 block text-meta text-call-muted">{prevLine.speaker}</span>
                  <span className="line-clamp-2">{prevLine.text}</span>
                </p>
              )}
            </div>
            <div aria-live="polite" aria-atomic="false" className="min-h-44">
              {curLine && (
                <p key={curLine.id} className="huc-line-in text-caption-live text-call-text">
                  <span className="mb-1 block text-meta text-call-muted">{curLine.speaker}</span>
                  {curLine.text}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-lead text-call-muted">
            Captions are off. Press K or use the button to turn them on.
          </p>
        )}
      </div>

      {hasChips && (
        // A fixed 72px row (two lines of label fit), so chips arriving and leaving move nothing.
        <div className="grid h-18 grid-cols-2 gap-3" aria-label="Reply choices" role="group">
          {chips.map((c, i) => (
            <button
              key={`${openId}-${String(i)}`}
              type="button"
              onClick={() => {
                controller.reply(i);
              }}
              className="huc-fade-in flex min-h-14 items-center justify-center gap-2 rounded-md border border-call-border bg-call-surface px-3 text-center text-ui text-call-text active:scale-97"
            >
              {c.label}
              <Keycap tone="line">{String(i + 1)}</Keycap>
            </button>
          ))}
        </div>
      )}
      <div aria-hidden className="h-4 shrink-0" />

      <div className="flex flex-col items-center gap-6">
        <button
          type="button"
          data-cut-origin
          onClick={hangUp}
          className="group flex flex-col items-center gap-2 rounded-md text-ui text-call-text transition-transform duration-100 ease-out active:scale-95"
        >
          <span className="flex size-24 items-center justify-center rounded-full bg-call-hangup text-on-call-hangup">
            <Phone aria-hidden className="size-8 rotate-135" strokeWidth={2} />
          </span>
          <span className="flex items-center gap-2">
            Hang up
            <Keycap tone="line">H</Keycap>
          </span>
        </button>
        <button
          type="button"
          onClick={callBack}
          className="relative flex min-h-16 w-full items-center justify-center rounded-md border border-call-border bg-call-surface-2 px-5 py-2 text-center text-ui text-call-text transition-transform duration-100 ease-out active:scale-97 pointer-fine:px-14"
        >
          {scenario.callback.label}
          <Keycap tone="line" className="absolute right-3">
            C
          </Keycap>
        </button>
      </div>
    </div>
  );
}

// ── Call back (F6) ──────────────────────────────────────────────────────────

function CallBack({ session }: { session: CallSession }) {
  const runner = useRunner();
  const reduced = useReducedMotion();
  const { scenario } = session;
  const [stage, setStage] = useState<'dialling' | 'ivr'>('dialling');
  const [plan, setPlan] = useState<TimedLine[]>(NO_PLAN);
  const [now, setNow] = useState(0);
  const org = scenario.vars.org ?? scenario.caller.display;

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPlan(runner.startIvr());
      setStage('ivr');
    }, 900);
    return () => {
      window.clearTimeout(t);
    };
  }, [runner]);

  useEffect(() => {
    if (stage !== 'ivr') return;
    let raf = 0;
    const loop = (): void => {
      setNow(runner.ivrNowMs());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [stage, runner]);

  const current = lineAt(plan, now);
  const finished = plan.length > 0 && now >= (plan.at(-1)?.endMs ?? 0);
  return (
    <div className="huc-safe-top flex min-h-dvh flex-col px-6 pb-8">
      <div className="flex h-16 items-center">
        <p className="text-meta text-call-muted">Calling back</p>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-8">
        <div className="rounded-lg border border-call-border bg-call-surface p-6">
          <h1 className="text-title text-call-text" dir="auto">
            {org}
          </h1>
          <p className="mt-3 text-body text-call-muted">Customer service</p>
          <p className="tabular font-mono text-mono-number text-call-text">
            {formatPhone(scenario.callback.number)}
          </p>
          <p className="mt-3 text-meta text-call-muted">
            The number you already trust: {scenario.callback.trustedSource}.
          </p>
        </div>

        <div className="min-h-44" aria-live="polite">
          {stage === 'dialling' ? (
            <p className="flex items-center gap-3 text-lead text-call-muted">
              Dialling
              <span aria-hidden className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      'size-2 rounded-full bg-call-text',
                      reduced ? 'opacity-70' : 'huc-dial-dot',
                    )}
                  />
                ))}
              </span>
            </p>
          ) : (
            current && (
              <p key={current.id} className="huc-line-in text-caption-live text-call-text">
                <span className="mb-1 block text-meta text-call-muted">{current.speaker}</span>
                {current.text}
              </p>
            )
          )}
        </div>
      </div>
      <button
        type="button"
        data-cut-origin
        onClick={() => {
          runner.endIvr();
          runner.reveal();
        }}
        className={cn(
          'flex h-16 w-full items-center justify-center rounded-md bg-call-answer text-ui text-on-call-answer transition-transform duration-100 ease-out active:scale-97',
        )}
      >
        {finished ? 'See your result' : 'See your result now'}
      </button>
    </div>
  );
}

// ── The layer: shows the Line, runs The Cut, hands over to the result ───────

export function CallLayer() {
  const runner = useRunner();
  const app = useAppSnapshot();
  const reduced = useReducedMotion();
  const phase = useStore(runner.store, (s) => s.phase);
  const session = useStore(runner.store, (s) => s.session);
  const revealCount = useStore(runner.store, (s) => s.revealCount);
  const revealed = useStore(runner.store, (s) => s.revealed);
  const outcome = useStore(runner.store, (s) => s.outcome);
  const status = useStore(session?.controller.store ?? FALLBACK_STORE, (s) => s.status);
  const action = useStore(session?.controller.store ?? FALLBACK_STORE, (s) =>
    s.status === 'ended' ? s.action : '',
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const cutFor = useRef(-1);

  // Move the clock: captions, timer and scoring all read the audio clock.
  useEffect(() => {
    if (!session || phase !== 'call') return;
    let raf = 0;
    const loop = (): void => {
      session.controller.tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [session, phase]);

  // Warm the result screen while the phone rings, so The Cut never waits for it.
  useEffect(() => {
    if (phase === 'call') void loadResult();
  }, [phase]);

  // The result is mounted underneath as soon as the call is saved.
  useEffect(() => {
    if (outcome) navigate('/result', { replace: true });
  }, [outcome]);

  // The Cut.
  useEffect(() => {
    // The guard is per call: a second call in the same page session must play its own Cut.
    if (phase !== 'call') cutFor.current = -1;
    if (phase !== 'call' || !revealed || !outcome || !rootRef.current) return;
    if (cutFor.current === revealCount) return;
    cutFor.current = revealCount;
    const root = rootRef.current;
    const originEl = root.querySelector('[data-cut-origin]');
    const r = originEl?.getBoundingClientRect();
    const origin = r
      ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight * 0.8 };
    const handle = playCut({
      root,
      origin,
      moment: outcome.summary.result.moment,
      reducedMotion: reduced,
      seed: app.profile?.id ?? 'guest',
    });
    const skip = (): void => {
      handle.skip();
    };
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
    void handle.finished.then(() => {
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
      runner.lineGone();
    });
  }, [phase, revealed, outcome, revealCount, reduced, app.profile?.id, runner]);

  if (phase !== 'call' || !session) return null;

  const goneIfNotNow = (): void => {
    runner.notNow();
    navigate('/today');
  };

  return (
    <div
      ref={rootRef}
      data-surface="call"
      data-testid="the-line"
      className="fixed inset-0 z-80 overflow-y-auto bg-call-bg text-call-text"
    >
      <div className="huc-handset">
        {status === 'ringing' && <Incoming session={session} onNotNow={goneIfNotNow} />}
        {(status === 'live' || (status === 'ended' && action !== 'callback')) && <InCall session={session} />}
        {status === 'ended' && action === 'callback' && <CallBack session={session} />}
      </div>
    </div>
  );
}

const FALLBACK_STORE = createStore<CallState>({ status: 'idle' });
