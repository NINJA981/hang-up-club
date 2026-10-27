import { ArrowLeft, BookOpen, Flag, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useApp, useAppSnapshot, useRunner } from '../../app/AppContext';
import { navigate } from '../../app/router';
import { chooseAudioFormat } from '../../audio/formats';
import { createLinePlayer, type LinePlayer } from '../../audio/preview';
import { createSpeechFallback } from '../../audio/speechFallback';
import { durationOfFrom } from '../../domain/audio/manifest';
import { formatClock } from '../../domain/format/format';
import type { ResolvedScenario } from '../../domain/scenario/expand';
import { planTimeline, type TimedLine } from '../../domain/scenario/timeline';
import { markers } from '../../domain/scenario/timeline';
import type { Outcome } from '../../domain/scoring/score';
import { useStore } from '../../state/hooks';
import type { Attempt } from '../../storage/schemas';
import { Page } from '../Shell';
import { scenarioOf } from '../attemptInfo';
import { Button } from '../parts/base';
import { TacticStamp } from '../parts/domain';
import { Timeline, youLabel } from '../parts/timeline';
import { Sheet } from '../parts/overlay';
import { SOURCES } from '../sources';

/** Recover the choices a player made from the line ids they heard. */
export function choicesFromPath(scenario: ResolvedScenario, path: readonly string[]): Record<string, number> {
  const choices: Record<string, number> = {};
  for (let i = 0; i < path.length - 1; i++) {
    const line = scenario.lines.find((l) => l.id === path[i]);
    const idx = line?.replies?.findIndex((r) => r.goto === path[i + 1]) ?? -1;
    if (line && idx >= 0) choices[line.id] = idx;
  }
  return choices;
}

export interface ReplayData {
  scenario: ResolvedScenario;
  plan: TimedLine[];
  action: 'hangup' | 'callback' | 'none';
  tActionMs: number | undefined;
  outcome: Outcome;
}

function Row({ line, heard, player }: { line: TimedLine; heard: boolean; player: LinePlayer | undefined }) {
  const [failed, setFailed] = useState(false);
  return (
    <li className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-2 border-t border-border py-5 first:border-t-0">
      <span className="tabular pt-0.5 font-mono text-mono-number text-text-muted">
        {formatClock(line.startMs)}
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-meta text-text-muted">
          {line.speaker}
          {!heard && ' · Not heard'}
        </p>
        <p className={heard ? 'text-body text-text' : 'text-body text-text-muted'} dir="auto">
          {line.text}
        </p>
        {(line.ask || line.tactics.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {line.ask && (
              <span className="inline-flex h-9 items-center gap-2 text-ui text-danger">
                <Flag aria-hidden className="size-5" />
                Their ask
              </span>
            )}
            {line.tactics.map((t) => (
              <TacticStamp key={t} tactic={t} />
            ))}
          </div>
        )}
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="quiet"
            className="-ml-4"
            onClick={() => {
              setFailed(false);
              void player?.play(line).then((ok) => {
                setFailed(!ok);
              });
            }}
          >
            <Play aria-hidden className="size-5" />
            Play this line
          </Button>
          {failed && <p className="text-meta text-text-muted">This line can&rsquo;t play right now.</p>}
        </div>
      </div>
    </li>
  );
}

function ReplayView({ data, onBack }: { data: ReplayData; onBack: () => void }) {
  const { state } = useApp();
  const { scenario, plan, action, tActionMs, outcome } = data;
  const m = useMemo(() => markers(plan), [plan]);
  const [why, setWhy] = useState(false);
  const player = useMemo<LinePlayer | undefined>(() => {
    if (!state.content) return undefined;
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : undefined;
    return createLinePlayer({
      manifest: state.content.manifest,
      format: chooseAudioFormat(document.createElement('audio')),
      speech: createSpeechFallback(synth),
    });
  }, [state.content]);
  useEffect(
    () => () => {
      player?.dispose();
    },
    [player],
  );

  const scam = scenario.kind === 'scam';
  const askLine = plan.find((l) => l.ask);
  const flags = plan.filter((l) => l.flag).map((l) => ({ ms: l.cueMs, tactic: l.tactics[0] }));
  const actionAt = action === 'none' ? Infinity : (tActionMs ?? Infinity);
  const youAt = plan.findIndex((l) => l.startMs > actionAt);

  return (
    <Page className="gap-8">
      <div className="flex flex-col gap-4 pt-2">
        <Button variant="quiet" className="-ml-4 self-start" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-6" />
          Back
        </Button>
        <h1 className="text-h1 text-text">{scam ? 'What gave it away' : 'Why this call was safe'}</h1>
        <p className="text-meta text-text-muted" dir="auto">
          {scenario.caller.display} · {scenario.summary}
        </p>
      </div>

      <Timeline
        outcome={outcome}
        action={action}
        tActionMs={tActionMs}
        tAskMs={m.tAskMs}
        tEndMs={m.tEndMs}
        flags={flags}
        askQuote={askLine?.text}
        reveal={{ track: true, ask: true, you: true }}
        instant
      />

      <section className="flex flex-col gap-3">
        <p className="max-w-prose text-lead text-text" data-testid="advice">
          {scenario.advice}
        </p>
        {scenario.sources.length > 0 && (
          <Button
            variant="quiet"
            className="-ml-4 self-start"
            onClick={() => {
              setWhy(true);
            }}
          >
            <BookOpen aria-hidden className="size-6" />
            Why this matters
          </Button>
        )}
      </section>

      <section aria-labelledby="transcript">
        <h2 id="transcript" className="mb-2 text-title text-text">
          The call, line by line
        </h2>
        <ol>
          {plan.flatMap((line, i) => [
            ...(i === youAt
              ? [
                  <li
                    key="you"
                    className="my-2 flex items-center gap-3 rounded-md bg-accent-soft px-4 py-3 text-ui text-accent-text"
                  >
                    <span className="tabular font-mono text-mono-number">{formatClock(actionAt)}</span>
                    {youLabel(action, tActionMs).split(' · ')[0]}
                  </li>,
                ]
              : []),
            <Row key={line.id} line={line} heard={line.startMs <= actionAt} player={player} />,
          ])}
        </ol>
      </section>

      <Button variant="primary" onClick={onBack}>
        Done
      </Button>

      <Sheet
        open={why}
        onOpenChange={setWhy}
        title="Why this matters"
        description="This call was written from what people report to the agencies that count scams."
      >
        <ul className="flex flex-col gap-5">
          {scenario.sources.map((s, i) => {
            const info = SOURCES[s.key];
            return (
              <li key={`${s.key}-${String(i)}`} className="flex flex-col gap-1">
                <p className="text-ui text-text">{info?.title ?? s.key}</p>
                <p className="text-body text-text-muted">
                  {info?.publisher ?? ''}
                  {s.page !== undefined && <span className="tabular">, page {s.page}</span>}
                </p>
                {info && (
                  <a
                    href={info.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-14 items-center text-ui text-accent-text underline"
                  >
                    Open the report in your browser
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </Page>
  );
}

/** After a call: the replay of the call that just ended. */
export function ReplayScreen() {
  const runner = useRunner();
  const outcome = useStore(runner.store, (s) => s.outcome);
  const { state } = useApp();
  useEffect(() => {
    if (!outcome) navigate('/today', { replace: true });
  }, [outcome]);
  if (!outcome || !state.content) return null;
  const data: ReplayData = {
    scenario: outcome.request.scenario,
    plan: outcome.ended.plan,
    action: outcome.ended.action,
    tActionMs: outcome.ended.tActionMs,
    outcome: outcome.summary.result.outcome,
  };
  return (
    <ReplayView
      data={data}
      onBack={() => {
        navigate('/result');
      }}
    />
  );
}

/** From My calls: the replay of a past attempt, rebuilt from the line ids that were heard. */
export function AttemptReplayScreen({ index }: { index: number }) {
  const app = useAppSnapshot();
  const { state } = useApp();
  const attempt: Attempt | undefined = app.attempts[index];
  const content = state.content;
  const data = useMemo<ReplayData | undefined>(() => {
    if (!attempt || !content) return undefined;
    const scenario = scenarioOf(attempt, content, app.familyCalls);
    if (!scenario) return undefined;
    const durationOf = durationOfFrom(content.manifest);
    let plan: TimedLine[];
    try {
      plan = planTimeline(scenario.lines, durationOf, { choices: choicesFromPath(scenario, attempt.path) });
    } catch {
      plan = planTimeline(scenario.lines, durationOf);
    }
    return { scenario, plan, action: attempt.action, tActionMs: attempt.tActionMs, outcome: attempt.outcome };
  }, [attempt, content, app.familyCalls]);

  if (!data) {
    return (
      <Page>
        <h1 className="text-h1 text-text">This call can&rsquo;t be opened</h1>
        <p className="text-body text-text-muted">
          It was written by someone whose call is no longer on this phone.
        </p>
        <Button
          variant="primary"
          onClick={() => {
            navigate('/calls');
          }}
        >
          Back to my calls
        </Button>
      </Page>
    );
  }
  return (
    <ReplayView
      data={data}
      onBack={() => {
        navigate('/calls');
      }}
    />
  );
}
