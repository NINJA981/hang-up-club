import { AppProvider, useApp } from './AppContext';

/**
 * Stage 2 placeholder. It proves the content pipeline and the provider end to
 * end (library and audio manifest load from the same origin and validate with
 * zod; the local database opens) and shows the real numbers. Stage 3 replaces
 * the body with the screens in DESIGN.md.
 */
function Home() {
  const { state } = useApp();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-h1 text-text">Hang Up Club</h1>
      <p className="text-lead text-text-muted">
        One realistic practice call a day, and some of them are real.
      </p>
      {state.boot === 'loading' && <p className="text-body text-text-muted">Getting the calls ready...</p>}
      {state.boot === 'error' && (
        <p className="text-body text-danger" role="alert">
          The calls could not be loaded. Check your connection and try again.
        </p>
      )}
      {state.content && (
        <p className="text-body text-text" data-testid="library-summary">
          {state.content.library.templates.length} calls ready,{' '}
          {Object.keys(state.content.manifest.clips).length} voice clips.
        </p>
      )}
    </main>
  );
}

export function App() {
  return (
    <AppProvider>
      <Home />
    </AppProvider>
  );
}
