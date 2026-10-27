# HANDOFF: Hang Up Club

**Last updated:** 2026-10-27, end of Stage 2 (Scaffold + Core)
**Next stage:** Stage 3a, UI (screens and the signature moment per DESIGN.md), then 3b, the landing page in `site/`

## What is done

Stage 1 (documents): `SPEC.md`, `docs/adr/0001-architecture.md`, `DESIGN.md`, `docs/LANDING.md`, `PRODUCT.md` (inferred, not interviewed).

Stage 2 (this stage): the app scaffold at the repo root and **all non-UI logic**, tested. An earlier core attempt was stopped part-way; its domain code was reviewed and kept, and everything below it was finished.

| Area | Where | State |
|---|---|---|
| Tooling | `package.json`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc.json`, `vitest.config.ts`, `playwright.config.ts`, `vite.config.ts` | TypeScript strict (plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), typed ESLint with import-boundary rules, Prettier, Vitest 5, Playwright (Chromium) |
| Design tokens | `src/ui/tokens.css`, `scripts/check-tokens.ts` | DESIGN.md colours, type, radius, motion as CSS variables in light and dark plus the always-dark Line, wired into Tailwind v4 `@theme`. Fonts self-hosted through Fontsource. `pnpm tokens:check` verifies all 49 colours against DESIGN.md and 26 contrast pairs (AAA on the call screen) |
| Domain (pure TS) | `src/domain/**` | scenario schema, variant expansion, timeline and markers, scoring (SPEC 7.2), seeded daily scheduler (40% legit, run limits), Leitner spaced repetition, forgiving streak, link codec and the four v1 payloads, family-call builder, `.ics` generator, call state machine, result copy, formatting |
| Content | `scenarios/` (20 YAML templates, 12 scam + 8 legit), `scenarios/SOURCES.md`, `NAMES-REVIEW.md` | Each cites FTC/IC3 pages. 1,317 playable variants. Compiled to `public/scenarios/library.json` |
| Content gates | `pnpm check` = `scenarios:check`, `names:check`, `tokens:check`, `audio:check` | `file:line` errors for scripts. Deny-list of ~300 real institutions. Phone numbers must be `(NXX) 555-01xx` |
| Audio | `scripts/tts/`, `scripts/lib/tts/`, `public/audio/` | 418 clips plus 4 ambience beds rendered with Windows SAPI, band-passed 300-3400 Hz, Opus/WebM 16 kbps and AAC/M4A 16 kbps. Manifest with per-clip sha and measured durations. Opus 3.84 MB (budget 4), AAC 4.0 MB (budget 6), largest call path 68 KB (budget 160) |
| Storage | `src/storage/**` | `idb` database `huc` v1, 8 stores, explicit migrations, zod validation on every read, bad rows moved to a `corrupt` store |
| State | `src/state/**`, `src/app/AppContext.tsx` | `AppController` (profile, settings, attempts, spaced repetition, cheers, family calls, coach inbox), selectors, `CallController` (effects layer over the pure reducer), `useSyncExternalStore` hook, a context provider (`state`, `actions`, `meta`) |
| Audio runtime | `src/audio/**` | Web Audio engine (gapless scheduling on the audio clock, 30 ms hang-up cut, line click, ambience bed, branch rescheduling), synthesised ringtone with vibration, format choice, Web Speech fallback restricted to `localService` voices, cheer recorder with 2.5 s hard stop |
| PWA | `src/sw.ts`, `src/app/pwa.ts`, `vite.config.ts` | `injectManifest` service worker: precached shell and scenarios, runtime audio cache with range requests, update waits for an explicit `SKIP_WAITING` (never mid-call), `WARM_AUDIO` message for "download all calls". CSP meta tag injected in the production build |
| UI | `src/app/App.tsx` | **Placeholder only**: shows how many calls and voice clips loaded |

### Verified at the end of this stage

| Check | Result |
|---|---|
| `pnpm lint` (ESLint `--max-warnings 0` + Prettier) | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | 436 tests in 16 files pass. Coverage 96% statements, 97% lines overall; every file in `src/domain/**` is above 95% lines |
| `pnpm build` | pass. Entry JS 103 KB gzip (budget 170), CSS 5.6 KB gzip, 26 precache entries |
| `pnpm test:e2e` | 8 pass (2 projects x 4): loads from the production build, no off-origin request, CSP present, manifest installable, library and clips served, **reloads offline through the service worker** |
| `pnpm check` | pass |

## How to run it

```sh
pnpm install
pnpm exec playwright install chromium   # once, for e2e
pnpm dev            # http://localhost:5173 (service worker is off in dev)
pnpm build && pnpm preview   # http://localhost:4173, the real PWA
pnpm test | pnpm test:coverage | pnpm test:e2e | pnpm lint | pnpm typecheck
pnpm check          # content gates
pnpm scenarios:build && pnpm audio:render   # after editing scenarios/ (audio:render needs Windows SAPI, Piper or Kitten)
pnpm scenarios:stats
```

## How the pieces fit (for Stage 3)

- Screens call `useApp()` for `{ state, actions, meta }` and `useAppState(selector)` for persisted state. Do not touch IndexedDB or `fetch` from components (lint blocks `idb` in `src/ui`).
- Today's call: `dailyPick(state, content)` then `resolvePick(content, pick, state)` gives a `ResolvedScenario`. Practice calls: `practicePick`.
- A call: build `new CallController({ scenario, durationOf: durationOfFrom(content.manifest), port: createCallPort(engine, ring), onEnded })`. Call `ring()`, then `answer()` **inside the tap or drag handler** (iOS audio unlock), `tick()` on `requestAnimationFrame`, `reply(i)`, `hangUp()`, `callBack()`. Create the `CallAudioEngine` and `await engine.prepare(lines, caller.bed)` while it rings.
- On `onEnded`: `actions.recordCall({ ended, scenario, scored })`. It scores, saves, updates spaced repetition and returns `{ attempt, summary }`. `summary.result.moment` is `cut` | `shatter` | `fade` and tells the signature animation which variant to play. `outcomeCopy(...)` gives the headline.
- Links: `parseLinkFragment(location.hash)` then `decodePayload(type, encoded)` (never throws, returns a friendly error code), then `actions.applyJoin / acceptCheer / acceptFamilyCall / saveResultCard`. Build outgoing links with `makeLink`.
- Service worker update: `pwaStore` in `src/app/pwa.ts` (`updateReady`), `applyPwaUpdate()`. Show the prompt on the Today screen only.
- `?test=1` (silent audio engine, ADR 5), `?seed=` and `?demo=` are **not built yet**; they belong with the UI.

## Decisions and deviations (read these)

1. **AAC is 16 kbps, not 24.** At 24 kbps the AAC library was 6.3 MB, over the 6 MB budget. Filter version is therefore 2. SPEC 4.5 and ADR 4.1 still say 24; update them or accept the change.
2. **ESLint is pinned at 9.39.5, not the ADR's 10.13.0**, because `eslint-plugin-jsx-a11y` 6.10.2 only supports ESLint up to 9. TypeScript stays at 6.0.3 (typescript-eslint 8.72.x needs `<6.1`). Newer patch versions exist for a few packages (for example typescript-eslint 8.72.1, vite 8.3.5); versions were not bumped.
3. **A family call is stored as the coach's form draft**, not a full template (SPEC 9 says template). The playable template is derived with `draftToTemplate`, so a fix to the template builder improves old calls too.
4. **Streak** follows SPEC 7.5: a scored call on a day counts whatever the outcome, with one automatic rest day per Mon-Sun week.
5. **The CSP `frame-ancestors 'none'` is not in the meta tag** (browsers ignore it there). The host must send it as an HTTP header.
6. **No `pnpm-workspace.yaml` yet.** Create it when `site/` is added in Stage 3b.
7. **`size-limit` is installed but not configured.** The 170 KB first-route budget is met (103 KB gzip) but not enforced by CI.
8. **Case-sensitive deny-list terms** (for example `Chase`, `Apple`, `UPS`) will also flag a sentence that starts with that word. That is deliberate; rephrase the line.

## Known issues and open questions

- **Nobody has listened to the audio.** The 418 clips are generated and structurally verified (durations, sizes, a measured band-pass), but voice quality, pacing and where the flag cue lands were not reviewed by ear. SAPI "David" and "Zira" are the only voices installed, so `mark-casual` is David with +1 rate and a 1.09 pitch shift, and `ivr` is a slower Zira. They will sound dated. Piper is the planned upgrade (`pip install piper-tts==1.8.0`, then put a model in `.tts-cache/piper/`).
- **Piper and Kitten adapters were written but never run** (`scripts/lib/tts/engines.ts`, `scripts/tts/kitten.py`). Only the SAPI path is tested (a real SAPI to ffmpeg to Opus test runs on Windows).
- **SAPI redistribution terms are unchecked.** Confirm Microsoft allows shipping speech synthesised with these voices, or re-render with a CC BY Piper voice. Recorded in `public/audio/CREDITS.md`.
- **Kitten TTS in the browser (ADR 4.4 spike) was NOT run.** Only a desk check was done on 2026-10-27: `kittentts` 0.1.3 phonemizes with `phonemizer.backend.EspeakBackend` (espeak-ng, GPL-3.0) and downloads its model from Hugging Face. The npm `phonemizer` 1.2.1 declares Apache-2.0 (ADR says it bundles espeak-ng; not re-verified). No size or speed measurement. **Consequence for now:** family calls have no rendered audio, so the engine falls back to Web Speech with `localService` voices and no phone filter, or to a captions-only read-along (the engine and its tests cover both). `CallAudioEngine` already has a `filterRuntimeVoices` switch for when Kitten arrives.
- **Telephone band-pass is steeper above than below.** AC-F5-3 asks for 20 dB attenuation below 200 Hz and above 4 kHz. Measured on a tone mix: 60 Hz -27 dB, 4.5 kHz -32 dB, 6 kHz -36 dB, but 100 Hz -19 dB and 190 Hz -9 dB, because the 300 Hz high-pass is second order. The test asserts what is true. A steeper high-pass would need `FILTER_VERSION` 3 and a re-render (about 5 minutes).
- **The opus library is close to its budget** (3.84 of 4 MB including beds). New lines with `{address}` cost 15 clips each; keep greetings short and separate.
- **`sw.ts` is verified only through e2e** (precache, offline shell reload). The `WARM_AUDIO` handler, range requests and the audio cache are not exercised by any test. Test them with the UI, on iOS Safari too.
- **WebKit is not installed**, so iOS-like behaviour (Opus-in-WebM `canPlayType`, AAC fallback, `audio/mp4` cheer playback) is untested. Only Chromium ran.
- **No test of the real `MediaRecorder`, `speechSynthesis` or `AudioContext`**; they are covered with hand-written stubs. A manual pass on a phone is needed.
- **"First Meridian Bank"** needs the FDIC BankFind and NCUA exact-name check before launch; the other coined names need a trademark search (`scenarios/NAMES-REVIEW.md`).
- **The novelty score (6) is still provisional**: the GitHub, Devpost and Product Hunt sweep has not been done.
- **Reminders** rely on the `.ics` file; the generator is tested against an RFC 5545 fixture but has not been opened in a real calendar app.
- **PRODUCT.md is inferred**, not interviewed.
- **Not built yet:** every screen, the signature moment, the Coach Setup recording flow, the QR code (`qrcode` is installed), the demo assets (GIF, MP4, OG card), `site/`, the axe and 56 px target e2e checks.

## Tests worth knowing

- `tests/fixtures/PROVENANCE.md` says where every fixture came from. The `links/v1-*.txt` files are a contract: never regenerate them.
- The anti-gaming simulation (AC-F4-2) runs 1,000 seeded days against the real library: always hang up at 0.5 s scores about 0.30; the thoughtful policy (hang up at the first flag, stay on real calls) scores at least 0.95.
- The production library is itself a fixture: `library.test.ts` re-validates it and checks that the committed `library.json` is current.
