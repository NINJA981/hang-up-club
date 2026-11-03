import NumberFlow from '@number-flow/react';
import { Check, Mic, Send } from 'lucide-react';
import { m as motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { appBaseUrl, navigate } from '../../app/router';
import { useApp, useAppSnapshot, useRunner } from '../../app/AppContext';
import { playCheer } from '../../audio/cheer';
import { formatSeconds } from '../../domain/format/format';
import { makeLink } from '../../domain/links/links';
import { outcomeCopy, shareText, streakLine } from '../../domain/result/copy';
import { latestCheer, resultCardFor, streakOf } from '../../state/selectors';
import { useStore } from '../../state/hooks';
import { useHotkeys } from '../hotkeys';
import { EASE_OUT } from '../motion';
import { Button, cn } from '../parts/base';
import { OUTCOME_ICONS, OutcomeTag } from '../parts/domain';
import { Timeline } from '../parts/timeline';
import { shareOrCopy } from '../share';

/** The Cut's beats, in ms from the moment the Line starts to break (DESIGN.md Signature). */
const BEATS = {
  headline: 320,
  track: 420,
  ask: 780,
  you: 1020,
  sub: 1100,
  cheer: 1600,
  actions: 1800,
} as const;
type Beat = keyof typeof BEATS;
type Reached = Record<Beat, boolean>;

const ALL: Reached = {
  headline: true,
  track: true,
  ask: true,
  you: true,
  sub: true,
  cheer: true,
  actions: true,
};
const NONE: Reached = {
  headline: false,
  track: false,
  ask: false,
  you: false,
  sub: false,
  cheer: false,
  actions: false,
};

/**
 * Walks the beats on timers. Any tap or key jumps to the end state; reduced
 * motion shows the end state at once.
 */
function useCutSequence(
  active: boolean,
  settled: boolean,
  onDone: () => void,
): { reached: Reached; instant: boolean } {
  const [reached, setReached] = useState<Reached>(NONE);
  const [skipped, setSkipped] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (settled || !active) return;
    const timers: number[] = [];
    for (const beat of Object.keys(BEATS) as Beat[]) {
      timers.push(
        window.setTimeout(() => {
          setReached((r) => ({ ...r, [beat]: true }));
          if (beat === 'actions') done.current();
        }, BEATS[beat]),
      );
    }
    const skip = (): void => {
      for (const t of timers) window.clearTimeout(t);
      setSkipped(true);
      setReached(ALL);
      done.current();
    };
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      for (const t of timers) window.clearTimeout(t);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [active, settled]);

  if (settled) return { reached: ALL, instant: true };
  return { reached, instant: skipped };
}

/** A fixed pattern, so the static waveform never changes between renders. */
const WAVE = [6, 12, 20, 14, 26, 18, 10, 22, 16, 8, 14, 6];

function CheerBubble({ from, text, audioOk }: { from: string; text: string | undefined; audioOk: boolean }) {
  const label = audioOk ? `${from}:` : `${from} says:`;
  return (
    <div className="flex items-start gap-4 rounded-lg bg-surface p-5 shadow-e1" data-testid="cheer-bubble">
      <span aria-hidden className="mt-1 flex h-7 shrink-0 items-center gap-0.5 text-accent">
        {text === undefined ? (
          <Mic className="size-6" />
        ) : (
          WAVE.map((h, i) => (
            <span key={i} className="w-0.75 rounded-xs bg-current" style={{ height: `${String(h)}px` }} />
          ))
        )}
      </span>
      <p className="min-w-0 text-body text-text">
        <span className="text-ui">{label}</span>{' '}
        {text ??
          (audioOk ? `${from} sent a cheer` : `${from} sent you a cheer, but this phone cannot play it`)}
      </p>
    </div>
  );
}

export function ResultScreen() {
  const runner = useRunner();
  const { meta } = useApp();
  const app = useAppSnapshot();
  const reduced = useReducedMotion() ?? false;
  const outcome = useStore(runner.store, (s) => s.outcome);
  const revealed = useStore(runner.store, (s) => s.revealed);
  const introPlayed = useStore(runner.store, (s) => s.introPlayed);
  const revealCount = useStore(runner.store, (s) => s.revealCount);

  const settled = reduced || introPlayed;
  const { reached, instant } = useCutSequence(revealed && !introPlayed && !reduced, settled, () => {
    runner.markIntroPlayed();
  });
  const [shareState, setShareState] = useState<'idle' | 'sharing' | 'copied' | 'failed'>('idle');
  const [audioOk, setAudioOk] = useState(true);
  const cheerStarted = useRef(-1);

  const cheer = latestCheer(app);
  const right = outcome?.summary.result.right === true;

  // The cheer starts at +1.6 s (or at once under reduced motion). No cheer, no sound, no bubble.
  const startCheer = useCallback(() => {
    if (!cheer || !revealed || cheerStarted.current === revealCount) return;
    cheerStarted.current = revealCount;
    if (meta.params.demo) return;
    void playCheer(cheer.audio).then((p) => {
      setAudioOk(p.ok);
    });
  }, [cheer, revealed, revealCount, meta.params.demo]);
  useEffect(() => {
    if (reached.cheer && right) startCheer();
  }, [reached.cheer, right, startCheer]);

  useEffect(() => {
    if (!outcome) navigate('/today', { replace: true });
  }, [outcome]);

  const share = async (): Promise<void> => {
    if (!outcome) return;
    const sc = outcome.request.scenario;
    const card = resultCardFor(app, outcome.attempt, sc.summary);
    if (!card) return;
    setShareState('sharing');
    try {
      const url = await makeLink(appBaseUrl(), 'result', card);
      const text = shareText({
        name: card.name,
        title: card.title,
        outcome: card.outcome,
        ...(card.tAction !== undefined ? { tAction: card.tAction } : {}),
        ...(card.tAsk !== undefined ? { tAsk: card.tAsk } : {}),
        streak: card.streak,
      });
      const result = await shareOrCopy({ title: 'Hang Up Club', text, url });
      setShareState(result === 'copied' ? 'copied' : result === 'failed' ? 'failed' : 'idle');
      if (result === 'copied')
        window.setTimeout(() => {
          setShareState('idle');
        }, 2500);
    } catch {
      setShareState('failed');
    }
  };

  const seeReplay = (): void => {
    navigate('/replay');
  };
  const done = (): void => {
    runner.reset();
    navigate('/today');
  };
  useHotkeys({ r: seeReplay, s: () => void share() }, reached.actions && !!outcome);

  if (!outcome) return null;
  const { summary, ended, request } = outcome;
  const sc = request.scenario;
  const copy = outcomeCopy({
    kind: sc.kind,
    outcome: summary.result.outcome,
    ...(ended.tActionMs !== undefined ? { tActionMs: ended.tActionMs } : {}),
    ...(summary.markers.tAskMs !== undefined ? { tAskMs: summary.markers.tAskMs } : {}),
    ...(sc.askFor !== undefined ? { askFor: sc.askFor } : {}),
    ...(sc.who !== undefined ? { who: sc.who } : {}),
    ...(sc.missCost !== undefined ? { missCost: sc.missCost } : {}),
    trustedSource: sc.callback.trustedSource,
  });
  const Icon = OUTCOME_ICONS[copy.icon];
  const streak = streakLine(streakOf(app).current);
  const askLine = ended.plan.find((l) => l.ask);
  const flags = ended.plan.filter((l) => l.flag).map((l) => ({ ms: l.cueMs, tactic: l.tactics[0] }));
  const sharpHeadline = summary.result.outcome === 'sharp' && ended.tActionMs !== undefined;
  const sec = sharpHeadline ? Math.floor((ended.tActionMs ?? 0) / 1000) : 0;
  const flowTiming = { duration: instant ? 0 : 700, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' };
  const fade = (on: boolean, delay = 0) => ({
    initial: false as const,
    animate: { opacity: on ? 1 : 0, y: on ? 0 : 8 },
    transition: instant ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT, delay },
  });
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const headlineText = copy.headline;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-160 flex-col gap-8 px-5 pt-8 pb-10 md:px-8 md:pt-12">
      <header className="flex flex-col gap-2">
        <p className="text-meta text-text-muted">
          {request.scored ? "Today's call" : 'Practice call, not scored'} ·{' '}
          <span dir="auto">{sc.caller.display}</span>
        </p>
        <OutcomeTag outcome={summary.result.outcome} />
      </header>

      {app.saveFailed === true ? (
        <p role="status" className="text-body text-text" data-testid="save-failed">
          This phone could not save today&apos;s call, so your streak may not count it. Free up some space,
          then take a practice call to check.
        </p>
      ) : null}

      <section className="flex flex-col gap-3" aria-live="polite">
        <motion.h1
          className="text-result-display text-text"
          {...fade(reached.headline)}
          data-testid="result-headline"
        >
          <span aria-hidden>
            {sharpHeadline ? (
              <>
                Hung up at{' '}
                <span className="tabular whitespace-nowrap">
                  <NumberFlow
                    value={reached.headline ? m : 0}
                    transformTiming={flowTiming}
                    spinTiming={flowTiming}
                    isolate
                  />
                  :
                  <NumberFlow
                    value={reached.headline ? s : 0}
                    format={{ minimumIntegerDigits: 2 }}
                    transformTiming={flowTiming}
                    spinTiming={flowTiming}
                    isolate
                  />
                </span>
                .
              </>
            ) : (
              headlineText
            )}
          </span>
          <span className="sr-only">{headlineText}</span>
          {reduced && <Icon aria-hidden className="ml-3 inline size-8 align-middle text-accent" />}
        </motion.h1>
        <motion.p className="text-headline text-text-muted" {...fade(reached.sub)}>
          {copy.subline}
        </motion.p>
        {streak !== undefined && request.scored && (
          <motion.p className="text-body text-text-muted" {...fade(reached.sub)}>
            {streak}
            {sc.kind === 'scam' && summary.markers.tAskMs !== undefined && ended.tActionMs !== undefined
              ? ` · ${formatSeconds(Math.max(0, summary.markers.tAskMs - ended.tActionMs))} you did not give them`
              : ''}
          </motion.p>
        )}
      </section>

      {cheer && right && (
        <motion.div {...fade(reached.cheer)} aria-hidden={!reached.cheer}>
          <CheerBubble
            from={cheer.from}
            text={cheer.text}
            audioOk={audioOk || meta.params.demo !== undefined}
          />
        </motion.div>
      )}

      <Timeline
        outcome={summary.result.outcome}
        action={ended.action}
        tActionMs={ended.tActionMs}
        tAskMs={summary.markers.tAskMs}
        tEndMs={summary.markers.tEndMs}
        flags={flags}
        askQuote={askLine?.text}
        reveal={{ track: reached.track, ask: reached.ask, you: reached.you }}
        instant={instant}
      />

      <motion.div
        className={cn(
          'sticky bottom-0 z-10 -mx-5 mt-auto flex flex-col gap-3 bg-bg px-5 pt-4 pb-6 md:-mx-8 md:px-8',
          !reached.actions && 'pointer-events-none',
        )}
        initial={false}
        animate={{ opacity: reached.actions ? 1 : 0 }}
        transition={{ duration: instant ? 0 : 0.15 }}
        aria-hidden={!reached.actions}
        inert={!reached.actions}
      >
        <Button variant="primary" keycap="S" loading={shareState === 'sharing'} onClick={() => void share()}>
          {shareState === 'copied' ? (
            <>
              <Check aria-hidden className="size-6" /> Copied
            </>
          ) : (
            <>
              <Send aria-hidden className="size-6" /> Send to family
            </>
          )}
        </Button>
        {shareState === 'failed' && (
          <p role="alert" className="text-meta text-danger">
            Your browser would not share the link. Try again.
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="secondary" keycap="R" className="min-w-0 flex-1" onClick={seeReplay}>
            See what gave it away
          </Button>
          <Button variant="quiet" onClick={done}>
            Done
          </Button>
        </div>
      </motion.div>
    </main>
  );
}
