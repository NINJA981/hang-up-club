import { Suspense, lazy, useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { CallLayer } from '../ui/call/Line';
import { OfflineBanner, Page, TabBar, TopBar, Wordmark } from '../ui/Shell';
import { Button } from '../ui/parts/base';
import { ToastHost } from '../ui/parts/overlay';
import { TodayScreen } from '../ui/screens/Today';
import { WelcomeScreen } from '../ui/screens/Welcome';
import { LinkErrorScreen } from '../ui/screens/LinkError';
import { loadResult } from './preload';
import type { CallRunner } from './callRunner';
import { AppProvider, useApp, useAppSnapshot } from './AppContext';
import { watchInstall } from './install';
import { navigate, parseRoute, useHash, type Route } from './router';
import { applyTextSize, applyTheme } from './theme';
import type { AppParams } from './params';

// Screens the first route does not need are loaded on demand, which keeps the first-route JS small (AC-X-4).
const CallsScreen = lazy(() => import('../ui/screens/Calls').then((m) => ({ default: m.CallsScreen })));
const CoachScreen = lazy(() => import('../ui/screens/Coach').then((m) => ({ default: m.CoachScreen })));
const FamilyCallScreen = lazy(() =>
  import('../ui/screens/FamilyCall').then((m) => ({ default: m.FamilyCallScreen })),
);
const InboxScreen = lazy(() => import('../ui/screens/Links').then((m) => ({ default: m.InboxScreen })));
const LinkScreen = lazy(() => import('../ui/screens/Links').then((m) => ({ default: m.LinkScreen })));
const AttemptReplayScreen = lazy(() =>
  import('../ui/screens/Replay').then((m) => ({ default: m.AttemptReplayScreen })),
);
const ReplayScreen = lazy(() => import('../ui/screens/Replay').then((m) => ({ default: m.ReplayScreen })));
const SettingsScreen = lazy(() =>
  import('../ui/screens/Settings').then((m) => ({ default: m.SettingsScreen })),
);
const ResultScreen = lazy(loadResult);
const MotionRoot = lazy(() => import('../ui/MotionRoot'));

const TITLES: Partial<Record<Route['name'], string>> = {
  today: 'Today',
  welcome: 'Welcome',
  calls: 'My calls',
  'replay-attempt': 'What gave it away',
  settings: 'Settings',
  result: 'Result',
  replay: 'What gave it away',
  coach: 'Set up for someone else',
  'coach-call': 'Write a practice call',
  inbox: 'Coach inbox',
};

/** Routes that show the navigation. Coach screens keep the top bar but not the tab bar. */
const TAB_ROUTES: Route['name'][] = ['today', 'calls', 'replay-attempt', 'settings', 'replay'];
const TOP_ROUTES: Route['name'][] = [...TAB_ROUTES, 'coach', 'coach-call', 'inbox'];
/** Screens that animate only with CSS; every other screen loads the animation engine with it. */
const NO_MOTION: Route['name'][] = ['today', 'welcome', 'link-error'];
/** Allowed before a profile exists: a coach sets up on their own phone. */
const OPEN_ROUTES: Route['name'][] = ['welcome', 'coach', 'coach-call', 'inbox', 'link', 'link-error'];

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <p className="text-title text-text-muted" role="status">
        Hang Up Club
      </p>
    </div>
  );
}

function BootError({ blocked = false }: { blocked?: boolean }) {
  return (
    <Page withTabBar={false} className="min-h-dvh justify-center">
      <Wordmark />
      <h1 className="text-h1 text-text">
        {blocked ? 'Hang Up Club is open somewhere else' : 'The calls could not be loaded'}
      </h1>
      <p role="alert" className="max-w-prose text-body text-text-muted">
        {blocked
          ? 'Close the other Hang Up Club tab or window so this one can update, then try again. Nothing on this phone has been changed.'
          : 'Check your connection and try again. Nothing on this phone has been changed.'}
      </p>
      <Button
        variant="primary"
        onClick={() => {
          window.location.reload();
        }}
      >
        Try again
      </Button>
    </Page>
  );
}

function Screen({ route }: { route: Route }): ReactNode {
  switch (route.name) {
    case 'welcome':
      return <WelcomeScreen />;
    case 'calls':
      return <CallsScreen />;
    case 'replay-attempt':
      return <AttemptReplayScreen index={route.index} />;
    case 'settings':
      return <SettingsScreen />;
    case 'result':
      return <ResultScreen />;
    case 'replay':
      return <ReplayScreen />;
    case 'coach':
      return <CoachScreen />;
    case 'coach-call':
      return <FamilyCallScreen />;
    case 'inbox':
      return <InboxScreen />;
    case 'link':
      return <LinkScreen link={route.link} />;
    case 'link-error':
      return <LinkErrorScreen />;
    case 'today':
      return <TodayScreen />;
  }
}

/**
 * While the Line is open the app underneath it is `inert`: not focusable, not reachable by a screen
 * reader, not clickable. Otherwise Tab (or a swipe) could walk off the call onto a control on Today, and
 * "Restart now" would reload the page in the middle of a call (AC-F10-4).
 */
function BehindTheLine({ runner, children }: { runner: CallRunner | undefined; children: ReactNode }) {
  const subscribe = useCallback(
    (notify: () => void) => runner?.store.subscribe(notify) ?? (() => undefined),
    [runner],
  );
  const calling = useSyncExternalStore(
    subscribe,
    () => runner?.state.phase === 'call',
    () => false,
  );
  return (
    <div style={{ display: 'contents' }} inert={calling}>
      {children}
    </div>
  );
}

function Routes() {
  const { state, meta } = useApp();
  const app = useAppSnapshot();
  const hash = useHash();
  const route = useMemo(() => parseRoute(hash), [hash]);
  const ready = state.boot === 'ready';
  const hasProfile = app.profile !== undefined;

  // Theme and text size follow the saved settings; "system" also follows the OS while the app is open.
  const { theme, textSize } = app.settings;
  useEffect(() => {
    applyTextSize(textSize);
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, [theme, textSize]);

  useEffect(() => {
    watchInstall();
  }, []);

  // First open with no profile and no link: start at Welcome.
  const needsWelcome = ready && !hasProfile && !OPEN_ROUTES.includes(route.name);
  useEffect(() => {
    if (needsWelcome) navigate('/welcome', { replace: true });
  }, [needsWelcome]);

  // Screen readers and keyboard users land on the new page's heading.
  useEffect(() => {
    if (!ready) return;
    const title = TITLES[route.name];
    document.title = title ? `${title} · Hang Up Club` : 'Hang Up Club';
    const id = window.requestAnimationFrame(() => {
      const h1 = document.querySelector('main h1');
      if (h1 instanceof HTMLElement && !document.querySelector('[data-testid="the-line"]')) {
        h1.setAttribute('tabindex', '-1');
        h1.focus({ preventScroll: true });
      }
    });
    return () => {
      window.cancelAnimationFrame(id);
    };
  }, [route.name, ready]);

  if (state.boot === 'loading') return <Splash />;
  if (state.boot === 'error') return <BootError />;
  if (state.boot === 'blocked') return <BootError blocked />;

  const effective: Route = needsWelcome ? { name: 'welcome' } : route;
  const showTop = hasProfile && TOP_ROUTES.includes(effective.name);
  const showTabs = hasProfile && TAB_ROUTES.includes(effective.name);

  return (
    <>
      <BehindTheLine runner={meta.runner}>
        {showTop && <TopBar route={effective} />}
        <OfflineBanner />
        <Suspense fallback={null}>
          {NO_MOTION.includes(effective.name) ? (
            <Screen route={effective} />
          ) : (
            <MotionRoot>
              <Screen route={effective} />
            </MotionRoot>
          )}
        </Suspense>
        {showTabs && <TabBar route={effective} />}
      </BehindTheLine>
      {meta.runner && <CallLayer />}
      <ToastHost aboveTabBar={showTabs} />
    </>
  );
}

export function App({ params }: { params?: AppParams } = {}) {
  return (
    <AppProvider {...(params ? { params } : {})}>
      <Routes />
    </AppProvider>
  );
}
