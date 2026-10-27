# HANDOFF: Hang Up Club

**Last updated:** 2026-10-27, end of Stage 3a (product UI)
**Next stage:** QA and ship (listen to the audio, real-device pass, name checks). The landing page (3b) is in `site/`; see its section at the end.

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
| UI | `src/ui/**`, `src/app/**` | Built in Stage 3a, see the Stage 3a section |

### Verified at the end of this stage

| Check | Result |
|---|---|
| `pnpm lint` (ESLint `--max-warnings 0` + Prettier) | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | 436 tests in 16 files pass. Coverage 96% statements, 97% lines overall; every file in `src/domain/**` is above 95% lines |
| `pnpm build` | pass. Entry JS 103 KB gzip (budget 170), CSS 5.6 KB gzip, 26 precache entries |
| `pnpm test:e2e` | 8 pass (2 projects x 4): loads from the production build, no off-origin request, CSP present, manifest installable, library and clips served, **reloads offline through the service worker** |
| `pnpm check` | pass |

## Stage 3a: product UI (2026-10-27)

Every surface in DESIGN.md "Screen specs and states" is built, with the signature moment. Hash routes: `#/today`, `#/welcome`, `#/calls`, `#/calls/<n>`, `#/settings`, `#/result`, `#/replay`, `#/coach`, `#/coach/call`, `#/inbox`, and the link routes `#/join`, `#/cheer`, `#/family`, `#/r` (a damaged or missing payload gives the link-error screen).

| Area | Where |
|---|---|
| Shell (top bar at 768+, tab bar on phones, offline banner, page frame) | `src/ui/Shell.tsx` |
| The Line: incoming (slide, tap, Enter, ring halo), in call (captions, reply chips, Hang up, call-back), call back | `src/ui/call/Line.tsx` |
| The Cut (14 seeded shards, WAAPI, lazy confetti, fade for stayed/missed/caught and reduced motion) | `src/ui/call/cut.ts`, result beats in `src/ui/screens/Result.tsx` |
| Call orchestration (prepare audio, controller, scoring, save, reveal) | `src/app/callRunner.ts`, `callAudio.ts`, `preload.ts` |
| Screens | `src/ui/screens/*` (Welcome, Today, Result, Replay, Calls, Settings, Coach, FamilyCall, Links, LinkError, InstallGuide) |
| Components (button, card, segmented, text fields, sheet/toast, timeline, tactic stamps, streak days, QR) | `src/ui/parts/*` |
| Motion is loaded only for screens that use it (`MotionRoot`); Today, Welcome and link errors animate with CSS only | `src/ui/MotionRoot.tsx`, `motion.ts` |

### Verified at the end of Stage 3a

| Check | Result |
|---|---|
| `pnpm typecheck`, `eslint . --max-warnings 0` (site/ is ignored by ESLint) | pass |
| `pnpm test` | 441 tests in 17 files pass. Coverage is 92% statements and 92% lines overall (down from 96%: the new `src/audio` files and `src/state` glue are covered by e2e, not unit tests). The `src/domain` 95% gate still holds |
| `pnpm test:e2e` (`E2E_PORT=4181 pnpm exec playwright test` if 4173 is taken) | 54 pass, 9 skipped by design (desktop-only checks on the phone project). Covers first run, answer by tap / Enter / drag, in-call, call back, The Cut timing and skip, reduced motion, replay, daily limit, result link to Coach inbox, setup link, family call link, settings, delete everything, offline call, damaged link |
| axe (serious and critical) on 14 screens x 375/768/1440 x light/dark (`tests/e2e/a11y.spec.ts`) | 0 violations. The same run asserts no text under 18px and every control at least 56 x 56 |
| Keyboard | Tab reaches every control on Today, Settings and My calls; focus ring is a 3px outline (inputs use the 4px soft ring) |
| CLS during a call | 0 (asserted). The captions use two fixed-height slots and the reply row has a fixed 72px height |
| Lighthouse mobile (welcome) | Accessibility 100, Best Practices 96, SEO 91 before `public/robots.txt` was added (the audit saw a malformed one because the SPA fallback answered `/robots.txt`); not re-run after. The "Agentic Browsing" audits (llms.txt, ai-catalog) fail and are not implemented |
| Entry JS | 99.6 KB gzip (budget 170) |

QA material is in `docs/screenshots/`: every screen at 375, 768 and 1440 in light and dark (`NN-name-WIDTH-theme.png`), the signature moment as a 13-frame strip taken from real compositor frames (`30-cut-*.jpg`, plus `31-cut-end-*`), a reduced-motion strip (`reduced/`), a state sheet (`states/`: rest, hover, focus-visible, pressed, error, selected, loading, empty, sheet opening and closing), and the coach flow (`20`-`27`). Regenerate with `node scripts/capture-screens.mjs` and `node scripts/capture-states.mjs` against a running `vite preview --port 4180` (set `BASE` to change it). `scripts/contact-sheet.mjs` lays screenshots side by side.

### Stage 3a decisions and deviations

1. **Cheers record in Opus before MP4.** Chromium offers `audio/mp4` but ignores the bitrate cap for it (measured 30 KB for 2.5 s against the 8 KB link cap, so a cheer link could never be made). Opus comes out near 3 KB. Safari falls through to MP4. This reverses SPEC section 11's preference; the 8 KB cap (AC-F8-2) wins.
2. **shadcn registry search was not possible.** The `mcp__shadcn__*` tools are not connected in this environment. Components are hand-built on Radix primitives (dialog, toggle group, checkbox) and restyled to DESIGN.md tokens in the shadcn composition style, with no default styling shipped. No registry components from @motion-primitives, @animate-ui or @magicui were used.
3. **Reply chips sit in a fixed 72px row** that exists only for scenarios that have replies, so a chip arriving never shifts the layout. They are a two-column grid and long labels wrap.
4. **The Result screen's actions are a sticky bottom bar** (Send to family, then See what gave it away beside Done). The cheer bubble sits above the timeline so it is visible without scrolling on a phone.
5. **Calendar days on My calls are about 47 px wide at 375**, not 56 (seven columns cannot fit 56 px). They are not controls. The streak strip on Today has the same limit.
6. **The Cut beats** follow DESIGN.md (headline 320, track 420, ask 780, you 1020, subline 1100, cheer 1600, actions 1800 ms) on timers; any tap or key finishes it.
7. Disabled buttons are not used, except "Take today's call" while no call is scheduled yet.

Two bugs found and fixed in this stage: the Cut was skipped on every second call in a page session (the guard ref survived between calls, so the Line stayed on screen and blocked the app), and the call screen's captions re-centred as lines changed (CLS 0.006).

### Stage 3a known issues

- **The BIBLE section 9 rubric was self-scored from the screenshots**, not by an independent critic. My scores: identity 9, typography 9, colour 9, layout 9, hierarchy 9, components 9, states and accessibility 9, motion 9, system states 9, responsive 9 (average 9.0). Weakest points: the notebook screens are sparse at 1440 (one centred column by design); the Welcome screen has an empty band above its buttons on tall phones; the loading sample wraps its label to two lines on a 390px phone. A critic pass should confirm or lower this.
- **No sound was heard.** Calls ran with `?test=1` (silent audio) in every e2e and screenshot run, so the ring, voices, line click, ambience, cheer playback and vibration were never exercised in a browser here.
- **Chromium only**: no WebKit or Firefox, no real phone, and the slide-to-answer drag is tested with a mouse, not a finger.
- **Not driven in a browser:** the install hint, the update prompt (`SKIP_WAITING`) and Periodic Background Sync.
- **Family-call voice** is still Web Speech or captions (no Kitten). The "Download the better voice" button is not built.
- **`.ics` download and `navigator.share`** are unit-tested or stubbed; only the copy path is e2e tested. Neither was tried on a phone.
- **`pnpm lint` also runs Prettier over `site/`**, which the 3b agent did not format, so that part fails. `pnpm exec eslint . --max-warnings 0` and `pnpm exec prettier --check src tests scripts` are clean for this package. ESLint ignores `scripts/*.mjs` (the QA capture tools).
- **`pnpm check` fails on one line outside this package:** `names:check` flags `site/index.html:26`, the `twitter:card` meta tag, as a real name. Allow-list it in `scripts/deny-list/allow-citations.txt` or rename the tag. Everything under `src/` passes (the citations in `src/ui/sources.ts` are allow-listed).
- **First-visit layout shift of 0.00002** when the mono font arrives on the incoming screen (the "Enter" keycap). Not visible.
- **DESIGN.md is unchanged.** The places where the code departs from it are listed above.

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
- `?test=1` (silent audio engine, real timing), `?seed=7` (replaces the profile id in the daily scheduler, so today's call is S01) and `?demo=signature` (S01, a demo cheer, a throw-away `huc-demo` database) are built (`src/app/params.ts`, `demo.ts`).

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
- **Not built:** the demo assets (GIF, MP4, OG card) captured from `?demo=signature`. The frame strip in `docs/screenshots/30-cut-*` shows the moment, but no encoded loop exists. Kitten voices for family calls (see above).

## Tests worth knowing

- `tests/fixtures/PROVENANCE.md` says where every fixture came from. The `links/v1-*.txt` files are a contract: never regenerate them.
- The anti-gaming simulation (AC-F4-2) runs 1,000 seeded days against the real library: always hang up at 0.5 s scores about 0.30; the thoughtful policy (hang up at the first flag, stay on real calls) scores at least 0.95.
- The production library is itself a fixture: `library.test.ts` re-validates it and checks that the committed `library.json` is current.

---

## Stage 3b: landing page (`site/`), 2026-10-27

Separate package (`site/package.json`, own lockfile). Static Vite build, no WebGL by design (DESIGN.md Appendix B), no third-party requests, H1 as the LCP element. Full run instructions, measured results and known issues are in `site/README.md`.

- Run: `cd site && pnpm install && pnpm build && pnpm preview` (http://localhost:47213), `pnpm verify` for the 37 browser checks.
- Measured: initial JS 9.1 KB gzip (budget 120), mobile-profile trace LCP 1.87 s (budget 2.0) with CLS 0.00, Lighthouse Accessibility/Best Practices/SEO 100, axe 0 violations. The "Agentic Browsing" ai-catalog audit fails (not implemented).
- Open before launch: set `SITE_APP_URL`, `SITE_REPO_URL`, `SITE_URL` at deploy (today "Open the app" points to the `/app/` placeholder); the beat-2/3 visuals are live HTML reproductions rather than captured loops (`docs/screenshots/` was empty); WebKit and the audio were not tested or listened to; no `pnpm-workspace.yaml` was created (the root was off limits during this stage).
