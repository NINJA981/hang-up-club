# ADR-0001: Architecture of Hang Up Club v0.1

**Status:** Accepted (Stage 1, architect)
**Date:** 2026-10-20
**Deciders:** the studio maintainer; the Stage 2 (core) and Stage 3 (UI and landing) agents build against it
**Related:** `SPEC.md`, `DESIGN.md`, `docs/LANDING.md`, studio `DESIGN_BIBLE.md` §8.2 and §11

## Context

Hang Up Club is an installable, offline PWA. An older adult takes one realistic practice phone call a day, and about 40% of the calls are legitimate. A family coach sets it up and cheers through links.

These forces shape the architecture:

1. **No backend, no telemetry, no third-party requests.** Everything is static files. All state lives on the device (IndexedDB). Family links carry their data in URL fragments.
2. **Audio realism is the product.** Calls must sound like a phone line, start instantly, and work offline. Robotic runtime TTS was the biggest realism complaint in early review ("sounds like a 2019 GPS").
3. **Older users on mid- or low-end phones.** First-route JS ≤ 170 KB gz, LCP ≤ 2.0 s, INP ≤ 200 ms, CLS 0. Large type, 56px targets.
4. **Content correctness is safety-critical.** Every scam template needs exactly one ASK and at least one flag before it. All names must be fictional. Every template is sourced. All of this is enforced in CI, not by review alone.
5. **Determinism.** The daily scheduler, variant expansion, scoring and the demo capture must be reproducible from a seed and a fake clock.
6. **No LLM.** The product needs no language model. Content is authored YAML; the only ML is TTS. The `claude-api` skill therefore does not apply. If an LLM feature is proposed later (for example, "explain this call I got"), it would be BYO-key, user-initiated, and recorded in a new ADR.

## Decision

1. **Stack.** Vite 8 + React 19 + TypeScript 6 + Tailwind v4 + Motion + Radix primitives. `vite-plugin-pwa` 2.0 runs in `injectManifest` mode with a hand-written Workbox 7.4 service worker.
2. **Content pipeline.** Calls are authored as YAML templates and compiled at build time into typed JSON plus an audio manifest.
3. **Audio rendering.** Clips are pre-rendered with local TTS (Piper → Kitten TTS (Python) → Windows SAPI), band-passed with ffmpeg, and committed as Opus/WebM files with AAC/M4A fallbacks.
4. **Runtime audio.** A single Web Audio graph schedules clips gaplessly over an ambience bed. Web Speech (local voices only) is the fallback.
5. **Storage.** IndexedDB via `idb`. Links are encoded as `base64url(deflate-raw(JSON))` using the native `CompressionStream`.
6. **Landing page.** The landing page is a separate package in `site/` (pnpm workspace) that reuses the app's call-screen components in a demo mode.

### Options considered

#### Option A: build-time pre-rendered audio + Web Audio playback (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Medium: a render script, a manifest, and a gapless scheduler |
| Cost | Zero runtime cost; ~4 MB Opus library cached once |
| Realism | Highest available offline: neural Piper voices, band-pass, ambience |
| Offline | Full |
| Team familiarity | High (ffmpeg and Web Audio are well documented) |

**Pros:** instant start; consistent voices; deterministic durations (needed for flag and ASK timing); tiny runtime JS; works on low-end phones.
**Cons:** content changes require a re-render; personalised words (real names) cannot be pre-rendered.

#### Option B: in-browser TTS for everything (Kitten TTS via onnxruntime-web)

| Dimension | Assessment |
|---|---|
| Complexity | High: WASM, a worker, a phonemizer, model hosting |
| Cost | ≈ 25 MB voice download per device; 0.5–3 s synthesis per line on mid-range phones |
| Realism | Lower than Piper; timing is unknown until synthesized |
| Offline | Yes, after download |

**Pros:** any text, including real names.
**Cons:** first-call latency; battery drain; size; the phonemizer (espeak-ng) is GPL-3.0 (see §4.4). Timing is not known ahead of time, which complicates the ASK marker.

#### Option C: Web Speech API only

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Realism | Poor and varies per OS. **Output cannot be routed through Web Audio**, so there is no telephone filter. |
| Privacy | Some browsers' default voices are network voices that send text to a vendor |

**Pros:** zero bytes.
**Cons:** sounds unlike a phone call; inconsistent; a privacy hazard unless restricted to `localService`.

**Choice.** A as the core path, B only for family-authored calls, and C as the last-resort fallback restricted to `localService` voices.

## Trade-off analysis

Pre-rendering trades content agility for realism, latency and determinism. Determinism matters most here, because the scoring metric is "seconds before the ASK": clip durations must be known before the call starts. Family calls need agility and get the runtime path, at the cost of a lazy ≈ 25 MB optional download. They stay usable through the Web Speech fallback without it.

Hand-written `injectManifest` costs ~100 lines more than `generateSW`. In return we get explicit control over range requests for audio, the "download the whole call library" warm-up, and a guarantee that the SW never auto-reloads mid-call.

## 1. Stack (versions verified with `npm view <pkg> version` on 2026-10-20; pin exact)

### 1.1 App runtime

| Package | Version | Why |
|---|---|---|
| `react`, `react-dom` | **19.3.1** | UI. Within R3F's peer range `>=19 <19.4` in case the landing page ever adopts 3D. |
| `motion` | **14.4.0** | Signature moment, sheets, reduced-motion via `MotionConfig`. Use `LazyMotion` + `domAnimation` to keep the bundle small. |
| `@radix-ui/react-dialog` | **1.3.1** | Bottom sheets (share link, delete data) with focus trap and focus return |
| `@radix-ui/react-toggle-group` | **1.2.1** | Text size and theme segmented controls |
| `@radix-ui/react-checkbox` | **1.4.1** | Coach category choices |
| `@radix-ui/react-visually-hidden` | **1.2.13** | Accessible labels |
| `idb` | **8.0.4** | IndexedDB promise wrapper (~1.2 KB) |
| `zod` | **4.6.7** | Validation of scenario JSON, link payloads and DB reads |
| `canvas-confetti` | **1.9.4** | ≤ 60-particle burst (lazy, result screen only) |
| `@number-flow/react` | **0.6.2** | Rolling digits for seconds and the streak. Respects reduced motion. |
| `qrcode` | **1.5.4** | Local QR for the join link (lazy, coach setup only) |
| `lucide-react` | **1.60.0** | One icon set, 1.75px stroke at 20–24px |
| `workbox-window` | **7.4.1** | SW registration |
| `workbox-core`, `-routing`, `-strategies`, `-precaching`, `-expiration`, `-range-requests` | **7.4.1** | Hand-written SW (`src/sw.ts`) |
| `@fontsource-variable/atkinson-hyperlegible-next` | **5.3.0** | T7 UI and body face, self-hosted (OFL-1.1) |
| `@fontsource-variable/atkinson-hyperlegible-mono` | **5.3.0** | T7 mono for timers, numbers and codes (OFL-1.1) |
| `onnxruntime-web` | **1.30.0** | **Spike only** (§4.4): Kitten TTS for family calls, lazy chunk |

### 1.2 Build and tooling

| Package | Version | Why |
|---|---|---|
| `vite` | **8.3.4** | Build and dev server |
| `@vitejs/plugin-react` | **6.1.2** | React transform (peer `vite ^8`) |
| `vite-plugin-pwa` | **2.0.0** | Manifest + `injectManifest` (peer `vite …^8`, `workbox-build ^7.4.1`) |
| `workbox-build` | **7.4.1** | Peer of vite-plugin-pwa |
| `@vite-pwa/assets-generator` | **2.0.0** | Icons: 192, 512, maskable, monochrome, apple-touch |
| `tailwindcss`, `@tailwindcss/vite` | **4.3.3** | Tokens via `@theme inline` |
| `typescript` | **6.0.3** | **Not 7.0.2.** `typescript-eslint` 8.72.0 declares peer `typescript >=4.8.4 <6.1.0`. Revisit when typescript-eslint supports 7. |
| `eslint` | **10.13.0** | Lint |
| `@eslint/js` | **10.0.1** | |
| `typescript-eslint` | **8.72.0** | |
| `eslint-plugin-react-hooks` | **7.1.1** | |
| `eslint-plugin-jsx-a11y` | **6.10.2** | a11y lint |
| `globals` | **17.13.0** | |
| `prettier` | **3.9.10** | Formatting |
| `prettier-plugin-tailwindcss` | **0.8.1** | Class ordering |
| `yaml` | **2.9.1** | Parses `scenarios/*.yaml` at build time only |
| `tsx` | **4.23.15** | Runs `scripts/*.ts` |
| `culori` | **4.0.2** | CI token checks: ΔE_OK vs the brand blocklist, contrast |
| `size-limit`, `@size-limit/preset-app` | **14.2.0** | Bundle budgets in CI |
| `@types/react`, `@types/react-dom` | **19.3.0** | |
| `@types/node` | **26.6.5** | |
| `@types/canvas-confetti` | **1.9.0** | |
| `@types/qrcode` | **1.5.6** | |

### 1.3 Test

| Package | Version |
|---|---|
| `vitest`, `@vitest/coverage-v8` | **5.0.5** |
| `jsdom` | **30.1.3** |
| `@testing-library/react` | **16.3.3** |
| `fake-indexeddb` | **6.2.6** |
| `@playwright/test` | **1.64.1** (Chromium installed; add WebKit for iOS-like checks) |
| `@axe-core/playwright` | **4.14.0** |

### 1.4 Build-time TTS (not npm; documented in `scripts/tts/README.md`)

| Tool | Version | License | Role |
|---|---|---|---|
| Piper (`pip install piper-tts==1.8.0`) | 1.8.0 | GPL-3.0-or-later, **build tool only**. It is not shipped or linked, and the audio it outputs is not a derivative of the code. | Preferred engine. Voices restricted to CC0, CC-BY or MIT/Apache (e.g. `en_US-libritts_r-medium`, CC BY 4.0, multi-speaker), credited in `public/audio/CREDITS.md`. |
| Kitten TTS (`pip install kittentts==0.1.3`) | 0.1.3 | Apache-2.0 | Second engine. Also the model family for the in-browser family-call voice. |
| Windows SAPI via PowerShell `System.Speech` | OS | OS component | Always-available fallback on Windows. Voices David, Zira and Mark were verified on the dev machine. |
| ffmpeg | 9.0.2 (gyan.dev full build; `libopus` and `aac` encoders verified) | GPL build | Band-pass, compression, encoding |

**Not used:**

- `kitten-tts-js` 0.1.2. It is unofficial, pulls `onnxruntime-node` and `@huggingface/hub`, and fetches the model from Hugging Face at runtime, which violates the network policy.
- Any cloud TTS.
- Any LLM.

## 2. Module layout

```
hang-up-club/
├─ package.json                 # app package (workspace root)
├─ pnpm-workspace.yaml          # packages: ['.', 'site']
├─ index.html                   # pre-paint theme script, CSP meta, font preload
├─ vite.config.ts               # react, tailwind, VitePWA({ strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts' })
├─ scenarios/                   # SOURCE OF TRUTH for calls (YAML)
│  ├─ scam/S01-bank-code.yaml … S12-romance.yaml
│  ├─ legit/L01-pharmacy.yaml … L08-club-lunch.yaml
│  ├─ shared/address-terms.yaml # 15 pre-rendered address terms
│  ├─ shared/voices.yaml        # voice ids → engine + speaker
│  ├─ shared/ambience.yaml      # bed definitions
│  ├─ SOURCES.md                # [FTC-OA-2025], [IC3-2025], [FTC-IMP-2026] with page refs
│  └─ NAMES-REVIEW.md           # manual fictional-name review log
├─ scripts/
│  ├─ build-scenarios.ts        # YAML → zod-validated JSON (public/scenarios/*.json), variant expansion, stats
│  ├─ check-names.ts            # deny-list + 555-01xx rule over scenarios/, src/, site/, public/
│  ├─ deny-list/*.txt           # banks/CUs, federal agencies, brands, couriers, big tech
│  ├─ tts/render.ts             # engine adapters → WAV → ffmpeg filter → .webm + .m4a; writes audio-manifest.json
│  ├─ tts/engines/{piper,kitten,sapi}.ts + sapi.ps1
│  ├─ tts/filter.ts             # the ffmpeg chain (versioned: FILTER_VERSION)
│  ├─ tts/ambience.ts           # synthesized murmur beds
│  ├─ audio-check.ts            # CI: manifest hash freshness, presence, size budgets
│  └─ capture-demo.mjs          # deterministic DOM frame capture for README/LinkedIn (adapted prerender kit)
├─ public/
│  ├─ audio/<sha>.webm|.m4a     # COMMITTED rendered clips + beds
│  ├─ audio/audio-manifest.json
│  ├─ audio/CREDITS.md
│  ├─ scenarios/*.json          # generated (gitignored? no: committed, so `pnpm build` needs no YAML step in CI)
│  └─ icons/…
├─ src/
│  ├─ main.tsx  app/App.tsx  app/router.ts (tiny hash router; state in URL)
│  ├─ domain/                   # PURE TS, no DOM; 100% unit-testable
│  │  ├─ scenario/{schema,expand,timeline,library}.ts
│  │  ├─ scoring/score.ts
│  │  ├─ schedule/{daily,srs,rng}.ts      # seeded PRNG (mulberry32) + hash
│  │  ├─ streak/streak.ts
│  │  ├─ links/{codec,join,cheer,family,result}.ts
│  │  ├─ reminders/ics.ts
│  │  └─ time/clock.ts                    # injectable clock (real | fake)
│  ├─ audio/
│  │  ├─ engine.ts              # AudioContext graph, gapless scheduler, gain-ramp cut
│  │  ├─ ring.ts                # synthesized ringtone (no asset)
│  │  ├─ phoneFilter.ts         # BiquadFilter chain for runtime TTS (mirrors filter.ts)
│  │  ├─ speechFallback.ts      # speechSynthesis, localService voices only
│  │  ├─ formats.ts             # canPlayType → 'opus' | 'aac'
│  │  ├─ recorder.ts            # cheer MediaRecorder, 2.5 s hard stop
│  │  └─ kitten/                # LAZY chunk: worker.ts, model loader (same-origin), spike-gated
│  ├─ storage/{db,repo,migrations}.ts
│  ├─ state/                    # useSyncExternalStore stores: profile, today, call-session
│  ├─ ui/
│  │  ├─ tokens.css             # DESIGN.md tokens → CSS vars → Tailwind @theme inline
│  │  ├─ primitives/            # Button, CallButton, Sheet, Toast, Banner, Keycap, Segmented
│  │  ├─ call/                  # IncomingScreen, InCallScreen, Captions, Shatter, Timeline (reused by site/)
│  │  └─ screens/               # Today, Result, Replay, Callback, History, Settings, Welcome, Join,
│  │                            #   CoachSetup, CoachInbox, ResultCardView, LinkError
│  └─ sw.ts                     # Workbox: precache shell, audio warm-up, range requests, update prompt
├─ tests/
│  ├─ unit/…                    # Vitest (domain/*, audio scheduler with a fake AudioContext, codecs)
│  ├─ fixtures/                 # see §6
│  └─ e2e/…                     # Playwright + axe
└─ site/                        # landing page package (Stage 3b). Imports src/ui/call/* via workspace alias
```

**Boundary rules (lint-enforced via `no-restricted-imports`):**

- `domain/` imports nothing from `ui/`, `audio/` or `storage/`.
- `ui/` never touches IndexedDB directly; it goes through `state/` and `storage/repo`.
- Only `audio/` touches `AudioContext` and `speechSynthesis`.

## 3. Runtime architecture

```
            ┌──────────── URL (hash) ────────────┐
            │ #/today  #/call  #/result/:id      │  ← all screen state in URL
            │ #/join?d=…  #/cheer?d=…            │  ← link payloads in FRAGMENT (never sent to server)
            │ #/family?d=…  #/r?d=…              │
            └───────────────┬────────────────────┘
                            ▼
  ┌──────────── React UI (ui/screens, ui/call) ────────────┐
  │  reads stores via useSyncExternalStore                 │
  └───────┬───────────────────────┬────────────────────────┘
          │ actions               │ call session events
          ▼                       ▼
  ┌──────────────┐      ┌───────────────────────────────────────────────┐
  │ state/ stores │◀────│ CallSession (state machine)                   │
  │ profile/today │      │ ringing → answered → playing(line i) →       │
  └──────┬───────┘      │   [reply?] → ended(action, tAction)            │
         │              │ uses domain/timeline for tFlag/tAsk/tEnd       │
         ▼              └──────┬──────────────────────────┬─────────────┘
  ┌──────────────┐             │ schedule clips           │ outcome
  │ storage/repo │             ▼                          ▼
  │  (idb, zod)  │      ┌──────────────┐          ┌───────────────┐
  └──────────────┘      │ audio/engine │          │ domain/scoring │
                        │ AudioContext │          └───────────────┘
                        └──────┬───────┘
         clip buffers (fetch → cache → decodeAudioData) ◀── Service Worker cache (Workbox)
```

### 3.1 Call session state machine

The states are `idle → ringing → answered → line(n) → awaitingReply(n)? → ended`, and `ended` carries `{ action, tActionMs }`.

- Time is measured from `AudioContext.currentTime` at answer. This is the same clock the audio is scheduled on, so captions, timers and scoring never drift from the sound.
- The UI timer reads that clock on `requestAnimationFrame`.
- The session is a pure reducer plus an effects layer. Unit tests drive the reducer with a fake clock.

### 3.2 Audio graph

```
[clip BufferSource]─┐
[clip BufferSource]─┼─▶ voiceGain ─┐
[runtime TTS node]──┘   (+ phoneFilter only for runtime TTS:              ├─▶ masterGain ─▶ compressor ─▶ destination
                         highpass 300 → lowpass 3400 → compressor)       │
[ambience bed loop] ─▶ bedGain (−24 dB re voice) ─────────────────────────┘
```

- **Gapless scheduling.** All clips for the next ~10 s are decoded ahead and started at exact `when` times: line end + `pauseAfterMs`.
- **Branches.** On a reply chip, already-scheduled future sources are stopped and the branch is rescheduled from `currentTime + 250 ms`.
- **Hang-up cut.** `masterGain.gain.setTargetAtTime(0, now, 0.008)` (≈ 30 ms to silence). Then all sources stop and a 120 ms synthesized "line click" plays.
- **Audio unlock.** The `AudioContext` is created and resumed inside the Answer gesture, so iOS autoplay rules are satisfied.
- **Ringtone.** Two OscillatorNodes (440 Hz and 480 Hz, the North American ring cadence) at 2 s on and 4 s off, with no asset. The `navigator.vibrate([800, 400, 800])` cadence is tied to the ring on-phase where supported.

### 3.3 Service worker (`src/sw.ts`, injectManifest)

- **Precache:** app shell (HTML, JS, CSS, fonts, icons) and `scenarios/*.json` plus `audio-manifest.json`. These are small.
- **Audio warm-up.** After the first successful daily call (or on "Download all calls for offline" in Settings), the SW fetches every clip for the device's chosen format into the `huc-audio-v{manifest.version}` cache. Progress is shown as "Downloading calls 34 / 211". Until then, today's call is fetched on the Today screen before ringing is allowed (it shows "Getting today's call ready…").
- **Routes.** `/audio/*` uses CacheFirst with `RangeRequestsPlugin`, because Safari issues range requests for media. Navigation uses the precached `index.html`.
- **Updates.** `registerType: 'prompt'`. The new SW waits, the UI shows "Update ready: Restart" on the Today screen only, and the SW is **never** activated during a call.
- **No push handler.** Periodic Background Sync (`periodicsync`) is registered only when the browser supports it and the player turned reminders on; it shows a local notification.

### 3.4 Links

- **Codec.** JSON → `CompressionStream('deflate-raw')` → base64url. The reverse is `DecompressionStream`.
- **Format.** `#/join?d=…` etc. The leading `t` and `v` fields select the zod schema.
- **Cheer audio.** The coach's browser records with `MediaRecorder`, preferring `audio/mp4` when `isTypeSupported` (it plays almost everywhere) and otherwise `audio/webm;codecs=opus`. It uses `audioBitsPerSecond: 12000` and a 2.5 s hard stop. That gives ≈ 3–4 KB of audio, or ≈ 5 KB in base64. The cheer is a separate link from the join link, so the join link stays QR-friendly (≤ 1,000 chars).

### 3.5 Storage

- IndexedDB database `huc`, schema version 1. Stores: `profile`, `settings`, `attempts` (index `byDate`), `tactics`, `cheers`, `familyCalls`, `inbox`.
- `repo.ts` validates every read with zod. If validation fails, the bad record is quarantined to `corrupt` and the app continues. Migrations are explicit functions per version.
- Persistence: call `navigator.storage.persist()` after the first scored call, best-effort, with an explanation in Settings.

## 4. Build-time audio pipeline

### 4.1 Steps (`pnpm audio:render`)

1. `build-scenarios.ts` expands every template into the set of **unique clip texts**. A line containing `{org}` produces one clip per `org` value.
2. For each clip, `key = sha256(text | voiceId | engine | FILTER_VERSION)`. Clips already in the manifest with the same key are skipped.
3. Engine adapters are tried in order: Piper → Kitten → SAPI. Each writes a mono WAV to `.tts-cache/`. The engine that rendered each clip is recorded. **One engine per voice**, so a voice never changes timbre mid-call.
4. Filter and encode (`filter.ts`, `FILTER_VERSION = 1`):
   ```
   ffmpeg -i in.wav -af "highpass=f=300:poles=2,lowpass=f=3400:poles=2,\
     acompressor=threshold=-20dB:ratio=4:attack=5:release=80:makeup=4,\
     aresample=8000,aresample=24000,alimiter=limit=0.89,loudnorm=I=-18:TP=-2:LRA=7" \
     -ac 1 -c:a libopus -b:a 16k -vbr on -application voip -f webm out.webm
   ffmpeg -i <same filtered wav> -ac 1 -ar 16000 -c:a aac -b:a 24k -movflags +faststart out.m4a
   ```
   The 8 kHz resample round-trip is what gives the narrowband "phone line" character. `loudnorm` keeps all voices at the same loudness (−18 LUFS).
5. **Ambience beds** (`ambience.ts`). Three beds: `callcentre`, `pharmacy` and `home`. Each is 20 s and seamless, made from 5–6 SAPI or Piper voices reading neutral filler lines at −28 dB with seeded offsets, plus −45 dB pink noise and line hiss. They get the same filter. They are looped at runtime under the voice, so beds never multiply clip sizes. No third-party samples are used.
6. `audio-manifest.json` records `{ key → opus, aac, durationMs (ffprobe), sha, engine, voice }`.

### 4.2 Budgets (checked by `audio:check`)

- The Opus library is ≤ 4 MB in total and no single call path is over 160 KB.
- The AAC library is ≤ 6 MB. It is downloaded only on platforms where Opus fails `canPlayType`.

### 4.3 CI

- CI **never renders**. It runs `audio:check`: every referenced clip exists in both formats, the manifest keys match the current texts, voices and filter version, and the budgets hold.
- When a contributor edits a script line, they must run `pnpm audio:render` locally, which requires one of the three engines.

### 4.4 Spike: Kitten TTS in the browser (family calls only)

Kitten TTS needs a phonemizer. The npm `phonemizer` 1.2.1 package declares Apache-2.0 but **bundles espeak-ng, which is GPL-3.0-or-later**. Shipping it inside an MIT app is a licensing conflict.

Stage 2 runs a time-boxed spike of half a day:

- **(a)** Find a permissively licensed G2P path: a CMUdict-based lookup (CMUdict is BSD-style) plus a small rule fallback for unknown words. Family calls are short, mostly names, so this is feasible.
- **(b)** Measure the model size (target ≤ 25 MB, int8) and synthesis time on a mid-tier Android phone (target ≤ 1.5 s per line, synthesized ahead while the phone rings).
- **(c)** Host the model files same-origin under `/voices/kitten/`. Download them only after an explicit "Download the better voice (≈ 25 MB)" tap.

**If the spike fails** on licence, size or speed, family calls ship on Web Speech `localService` voices with captions. The call can only be routed through the phone filter when the voice is Kitten. HANDOFF.md records the outcome. Nothing else in the architecture depends on the spike.

## 5. Testing approach

| Layer | Tool | Scope | Gate |
|---|---|---|---|
| Domain unit | Vitest | schema, expansion, timeline, scoring table, scheduler mix, SRS, streak (DST/TZ), link codecs, `.ics` | ≥ 95% line coverage on `src/domain/**` |
| Audio unit | Vitest with a fake `AudioContext` (hand-rolled stub recording `start(when)` calls) | gapless scheduling, branch reschedule, hang-up cut timing, fallback selection | AC-F2-2, AC-F5-4 |
| Storage unit | Vitest + `fake-indexeddb` 6.2.6 | repo validation, quarantine, migrations | |
| Content CI | `scenarios:check`, `check-names`, `audio:check`, `scenarios:stats` | AC-F3-1…6, AC-F5-1/2 | Blocking |
| Token CI | culori script | every role pair in DESIGN.md meets its contrast target (AAA on call tokens); accent ΔE_OK ≥ 0.06 vs a blocklist of well-known brand colours; grep bans raw palette utilities and off-token hex in `src/` | Blocking |
| E2E | Playwright 1.64.1, Chromium (+ WebKit for media and format fallback) | the full daily flow, offline, update prompt, links (join, cheer, family, result), callback, replay, reduced motion, keyboard-only | All AC-…(E) |
| Accessibility | `@axe-core/playwright` 4.14.0 + custom checks (min font size via computed style; min target 56px via bounding boxes; AAA on `[data-surface=call]`) | every screen × light/dark × 375/768/1440 | Zero serious/critical |
| Network | Playwright `page.on('request')` guard | asserts no off-origin requests in every e2e test | AC-F10-6 |
| Performance | `size-limit` (first route ≤ 170 KB gz; site initial ≤ 120 KB gz) + Lighthouse via chrome-devtools MCP in QA | | Budgets |

**E2E determinism.**

- `?test=1` swaps the audio engine for a **silent engine**. It schedules "virtual clips" using the manifest durations, so timing is real but no decoding or sound is needed.
- Playwright's `page.clock` controls `Date`.
- The scheduler seed comes from `?seed=`.
- Example: the signature test answers, waits until `tFlag + 500 ms`, clicks Hang up, and asserts `sharp` plus the headline text.

## 6. Fixture strategy

| Fixture | Location | Provenance and purpose |
|---|---|---|
| Mini scenario set | `tests/fixtures/scenarios/*.yaml` | 3 hand-written templates (1 scam with a branch, 1 legit, 1 broken) authored for tests. The broken one asserts file:line errors. |
| Golden timelines | `tests/fixtures/timelines/*.json` | Expected `tFlag/tAsk/tEnd` per variant path, computed from a fixture manifest with fixed durations |
| Scoring goldens | `tests/fixtures/scoring.json` | One row per §7.2 table row plus boundary cases (t = tFlag − 1, t = tFlag, t = tAsk, tAsk + 10,000, tAsk + 10,001) |
| Fixture audio manifest | `tests/fixtures/audio-manifest.json` | Synthetic durations (no audio files), so unit tests never depend on rendered audio |
| Link payloads | `tests/fixtures/links/v1-*.txt` | Encoded join, cheer, family and result links generated at v1. **Never regenerated.** They guarantee old links keep working. Includes oversized and malformed cases. |
| Cheer audio samples | `tests/fixtures/cheers/` | 1 s silence plus tone in `audio/mp4` and `audio/webm;codecs=opus`, generated by ffmpeg in a committed script (`tests/fixtures/cheers/make.sh`). Used for cross-format decode tests. |
| Dates | `tests/fixtures/dates.ts` | Sequences across DST (US and EU), a TZ change (UTC−5 → UTC+5:30), a week-boundary rest day, and a year end |
| Name deny-list samples | `tests/fixtures/names/` | Positive and negative strings proving `check-names` catches real institutions and allows the coined set |
| Real content | `scenarios/` itself | Treated as production fixtures. Every e2e run uses the real library with `?seed=` for determinism. |

Fixture data must also be plausible and messy: long fictional organisation names ("Kestrel Ridge Community Credit Union"), 1-character and 30-character coach names, amounts with cents, and RTL-safe text in coach names (rendered `dir="auto"`).

## Consequences

**Becomes easier:**

- Realistic, instant, offline calls.
- Exact ASK-relative scoring.
- Deterministic tests and demo capture.
- A tiny runtime.
- Strong privacy claims, because there is no server.

**Becomes harder:**

- Contributors editing scripts need a local TTS engine to re-render (documented, with SAPI as a zero-install path on Windows).
- The repo carries ~4–10 MB of binary audio. It must be kept out of git LFS for simple cloning, which is acceptable at this size.
- Family calls sound worse than built-in calls unless the Kitten spike succeeds.

**To revisit:**

- TypeScript 7 once typescript-eslint supports it.
- R3F on the landing page (deliberately not used now; see DESIGN.md "Landing 3D plan").
- A WebCodecs `AudioEncoder` path to normalise cheers to Opus on every browser.
- A localisation pipeline (per-language voices).

## Action items

1. [ ] Stage 2: scaffold per §2. Pin the versions in §1. Wire tokens. Implement `domain/` with tests, the YAML schema, `build-scenarios`, `check-names` and `audio:check`.
2. [ ] Stage 2: author the 20 templates in `scenarios/` against SPEC §5. Render audio with the best available engine (install Piper via pip if possible; otherwise SAPI) and commit the clips and manifest.
3. [ ] Stage 2: run the Kitten-in-browser spike (§4.4) and record the result in HANDOFF.md.
4. [ ] Stage 3a: build the UI per DESIGN.md, including the signature moment and every state.
5. [ ] Stage 3b: build the landing page in `site/` per docs/LANDING.md (CSS/SVG only; reuse the call components).
6. [ ] Before launch: run the FDIC BankFind and NCUA exact-name check for every fictional institution, and the novelty follow-up sweep (GitHub, Devpost, Product Hunt).
