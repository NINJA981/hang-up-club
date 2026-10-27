import { CircleAlert, Download, Wifi } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { useApp, useAppSnapshot, useRunner } from '../../app/AppContext';
import { installStore, promptInstall } from '../../app/install';
import { applyPwaUpdate, pwaStore } from '../../app/pwaStore';
import { streakLine } from '../../domain/result/copy';
import { useStore } from '../../state/hooks';
import { streakOf } from '../../state/selectors';
import { Page } from '../Shell';
import { copyOf, scenarioOf } from '../attemptInfo';
import { Button, Card, Skeleton } from '../parts/base';
import { OUTCOME_ICONS, OutcomeTag } from '../parts/domain';
import { StreakStrip } from '../parts/people';
import { useOnline } from '../Shell';
import { useToday } from '../useToday';

const InstallGuide = lazy(() => import('./InstallGuide').then((m) => ({ default: m.InstallGuide })));

function greeting(hour: number): string {
  if (hour < 5) return 'Hello';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label="Getting the call ready"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-3 w-full overflow-hidden rounded-xs bg-surface-2"
      >
        <div
          className="h-full origin-left rounded-xs bg-accent transition-transform duration-150 ease-out"
          style={{ transform: `scaleX(${String(pct / 100)})` }}
        />
      </div>
      <p className="tabular text-meta text-text-muted">
        {done} of {total} voice clips
      </p>
    </div>
  );
}

function UpdatePrompt() {
  const ready = useStore(pwaStore, (s) => s.updateReady);
  if (!ready) return null;
  return (
    <Card className="flex flex-col gap-3" role="status">
      <p className="text-body text-text">An update is ready.</p>
      <Button
        variant="secondary"
        onClick={() => {
          void applyPwaUpdate();
        }}
      >
        <Download aria-hidden className="size-6" />
        Restart now
      </Button>
    </Card>
  );
}

function InstallHint() {
  const { actions } = useApp();
  const app = useAppSnapshot();
  const install = useStore(installStore, (s) => s);
  const [guide, setGuide] = useState(false);
  const days = new Set(app.attempts.map((a) => a.localDate)).size;
  const earned = app.attempts.some((a) => a.outcome === 'sharp' || a.outcome === 'verified') || days >= 2;
  if (install.standalone || app.settings.installHintDismissed === true || !earned) return null;
  if (!install.canPrompt && !install.ios) return null;
  return (
    <Card className="flex flex-col gap-3 shadow-e3" aria-labelledby="install-title">
      <h2 id="install-title" className="text-title text-text">
        Keep Hang Up Club on your home screen
      </h2>
      <p className="text-body text-text-muted">
        It opens in one tap, and your calls still work with no signal.
      </p>
      <div className="sm:flex-row flex flex-col gap-2">
        <Button
          variant="secondary"
          className="sm:flex-1"
          onClick={() => {
            if (install.canPrompt) void promptInstall();
            else setGuide(true);
          }}
        >
          Add to home screen
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            void actions.updateSettings({ installHintDismissed: true });
          }}
        >
          Don&rsquo;t show again
        </Button>
      </div>
      {guide && (
        <Suspense fallback={null}>
          <InstallGuide
            onClose={() => {
              setGuide(false);
            }}
          />
        </Suspense>
      )}
    </Card>
  );
}

export function TodayScreen() {
  const app = useAppSnapshot();
  const { state } = useApp();
  const runner = useRunner();
  const online = useOnline();
  const { daily, practice, doneToday, practicedToday } = useToday();
  const phase = useStore(runner.store, (s) => s.phase);
  const progress = useStore(runner.store, (s) => s.progress);
  const failure = useStore(runner.store, (s) => s.failure);
  const [hour] = useState(() => new Date().getHours());
  const streak = streakOf(app);
  const profile = app.profile;

  // Keep "today" right when the app returns to the foreground (a new day, a new call).
  const { actions } = useApp();
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') actions.refreshToday();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [actions]);

  if (state.boot !== 'ready' || !profile) return <TodaySkeleton />;

  const preparing = phase === 'preparing';
  const first = app.attempts.length === 0;
  const begin = (practiceCall: boolean): void => {
    const offer = practiceCall ? practice : daily;
    if (!offer) return;
    void runner.start(offer.request);
  };

  const attempt = doneToday;
  const scenario = attempt && state.content ? scenarioOf(attempt, state.content, app.familyCalls) : undefined;
  const copy = attempt ? copyOf(attempt, scenario) : undefined;
  const Icon = copy ? OUTCOME_ICONS[copy.icon] : undefined;
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(
    new Date(),
  );
  const day = streakLine(streak.current);

  return (
    <Page className="gap-6">
      <header className="flex flex-col gap-1 pt-2">
        <h1 className="text-h1 text-text" dir="auto">
          {greeting(hour)}, {profile.addressTerm}.
        </h1>
        <p className="text-meta text-text-muted">{today}</p>
      </header>

      <UpdatePrompt />

      {phase === 'failed' && failure === 'offline' ? (
        <Card className="flex flex-col gap-4 p-6" role="alert">
          <h2 className="flex items-center gap-3 text-title text-text">
            <Wifi aria-hidden className="size-7 shrink-0" />
            Today&rsquo;s call needs to download once
          </h2>
          <p className="text-body text-text-muted">Connect to Wi-Fi, then it works offline.</p>
          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              onClick={() => {
                begin(false);
              }}
            >
              Try again
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                runner.useBuiltInVoice();
              }}
            >
              Use the built-in voice instead
            </Button>
          </div>
        </Card>
      ) : phase === 'failed' ? (
        <Card className="flex flex-col gap-4 p-6" role="alert">
          <h2 className="flex items-center gap-3 text-title text-text">
            <CircleAlert aria-hidden className="size-7 shrink-0" />
            The call could not start
          </h2>
          <p className="text-body text-text-muted">
            Something stopped the sound from loading. Try again in a moment.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              begin(false);
            }}
          >
            Try again
          </Button>
        </Card>
      ) : attempt && copy && Icon ? (
        <Card className="flex flex-col gap-5 p-6" aria-labelledby="done-title">
          <div className="flex flex-col gap-2">
            <OutcomeTag outcome={attempt.outcome} />
            <h2 id="done-title" className="text-headline text-text">
              {copy.headline}
            </h2>
            <p className="text-body text-text-muted">{copy.subline}</p>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <p className="text-ui text-text">Done for today. See you tomorrow.</p>
            <StreakStrip streak={streak} today={app.today} />
            {day && <p className="text-body text-text-muted">{day}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Button
              variant="quiet"
              className="justify-start"
              loading={preparing}
              onClick={() => {
                begin(true);
              }}
              disabled={!practice}
            >
              Practice another call (not scored)
            </Button>
            {practicedToday > 0 && (
              <p className="px-4 text-meta text-text-muted">
                {practicedToday} practice {practicedToday === 1 ? 'call' : 'calls'} today.
              </p>
            )}
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col gap-5 p-6" aria-labelledby="today-title">
          <div className="flex flex-col gap-3">
            <h2 id="today-title" className="text-headline text-text">
              {first ? 'Your first practice call is ready' : 'Today’s call is ready'}
            </h2>
            <p className="max-w-prose text-body text-text-muted">
              One practice call, about a minute. Some calls are real, so listen before you hang up.
            </p>
            {first && (
              <p className="max-w-prose text-body text-text-muted">
                Every caller is made up. Nobody can reach you through this app.
              </p>
            )}
            {daily?.writtenBy !== undefined && (
              <p className="text-meta text-text-muted">
                Today&rsquo;s call was written by <span dir="auto">{daily.writtenBy}</span>.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              loading={preparing}
              disabled={!daily}
              onClick={() => {
                begin(false);
              }}
            >
              {preparing ? 'Getting today’s call ready…' : 'Take today’s call'}
            </Button>
            <div className="h-9">
              {preparing && <ProgressBar done={progress.done} total={progress.total} />}
            </div>
          </div>
        </Card>
      )}

      {!online && phase !== 'failed' && (
        <p className="text-meta text-text-muted">
          You can still take today&rsquo;s call if it has been downloaded.
        </p>
      )}

      <InstallHint />
    </Page>
  );
}

export function TodaySkeleton() {
  return (
    <Page className="gap-6">
      <div className="flex flex-col gap-2 pt-2">
        <Skeleton className="h-12 w-4/5" />
        <Skeleton className="h-6 w-1/3" />
      </div>
      <Card className="flex flex-col gap-5 p-6">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
    </Page>
  );
}
