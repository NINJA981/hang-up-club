# Contributing to Hang Up Club

Thank you for helping. Hang Up Club is used by older adults, so every change is judged by one question:
does it help someone tell a scam call from a real one, without frightening or confusing them?

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go to
[SECURITY.md](SECURITY.md), not to a public issue.

## Set up

You need Node 24 or newer and pnpm 10.

```sh
pnpm install
pnpm exec playwright install chromium   # once, for the end-to-end tests
(cd site && pnpm install)               # once, if you work on the landing page
```

| Command | What it does |
|---|---|
| `pnpm dev` | The app at http://localhost:5173 (the service worker is off in dev) |
| `pnpm build` | Type-checks and builds the installable PWA into `dist/` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | End-to-end tests (Playwright). It builds the app and the landing page and serves them itself |
| `pnpm lint` | ESLint with zero warnings allowed, then Prettier |
| `pnpm typecheck` | TypeScript in strict mode |
| `pnpm check` | Content gates: scenarios, fictional names, design tokens, rendered audio |

Before you open a pull request, run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check`.
On a small machine, run the e2e suite with one worker: `pnpm exec playwright test --workers=1`.

## How the code is laid out

| Path | What |
|---|---|
| `src/domain/` | Pure TypeScript with no browser APIs: scenario expansion, timeline, scoring, scheduler, streak, links |
| `src/storage/`, `src/state/` | IndexedDB (through `idb`) and the application state |
| `src/audio/` | The Web Audio call engine, ringtone, Web Speech fallback, cheer recorder |
| `src/ui/` | React screens and components. UI code may not touch IndexedDB or `fetch` (lint enforces it) |
| `src/sw.ts` | The service worker |
| `scenarios/` | The call scripts (YAML), their sources and the name review log |
| `scripts/` | Scenario compiler, name check, token check, text-to-speech renderer |
| `site/` | The landing page, a separate static package |
| `tests/unit/`, `tests/e2e/` | Vitest and Playwright suites |

`SPEC.md` is the product specification, `DESIGN.md` the design system and `docs/adr/0001-architecture.md` the
architecture decisions. If your change disagrees with one of them, change the document in the same pull request
and say why.

## Rules that are checked

- **Every caller is fictional.** No real bank, agency, carrier, shop or person, in any script, test or screenshot.
  `pnpm names:check` blocks a list of about 300 real institutions. A list cannot catch everything, so new names
  are also recorded in `scenarios/NAMES-REVIEW.md` with how they were checked.
- **Phone numbers** are always `(NXX) 555-01xx`, the range reserved for fiction.
- **Contrast and size.** Body text is at least 20 px, nothing is under 18 px, every control is at least 56 x 56 px,
  and the call screen meets WCAG AAA contrast. The token check and the e2e accessibility suite enforce this.
- **No network calls** beyond the app's own static files. No analytics, no CDN fonts, no cloud voices. Every e2e
  test fails if a request leaves the origin.
- **No `console.log`**, no commented-out code, and no TODO without an issue link.

## How to write a scenario YAML

A scenario is one call template in `scenarios/scam/` or `scenarios/legit/`. Variables in braces expand into
variants, so one template plays as a dozen or more different calls. Here is a short legitimate call:

```yaml
id: L01-pharmacy-refill          # unique; S.. for scams, L.. for real calls, then a short slug
kind: legit                      # scam or legit
group: real                      # scam groups: bank, government, family, tech, delivery, utility, prize, romance
category: legit.pharmacy
summary: a real pharmacy call    # completes "Paati hung up on ..."
who: the real pharmacy           # legit only: "That was the real pharmacy."
missCost: you'd have missed the news that your refill is ready
sources:
  - { key: FTC-OA-2025, page: 22 }   # a key from scenarios/SOURCES.md
caller:
  display: Alder Lane Pharmacy   # caller ID; a coined name
  number: '(614) 555-0171'
  voice: zira-calm               # see scenarios/shared/voices.yaml
  bed: pharmacy                  # callcentre, pharmacy, home, street or none
vars:
  time: [six tonight, five thirty today, noon tomorrow]
lines:
  - id: hello
    say: 'Hello, {address}.'     # {address} is how callers address the player
    pauseAfterMs: 600
  - id: news
    say: "Your prescription refill is ready to collect. We're open until {time}."
  - id: goodbye
    say: 'Thank you, and have a lovely day.'
    next: END
callback:                        # the second button and the real organisation's phone line
  label: Hang up and call the pharmacy's number
  trustedSource: the pharmacy's own number
  number: '(614) 555-0172'
  voice: ivr
  ivr:
    - id: ivr1
      say: 'Thank you for calling Alder Lane Pharmacy. Yes, your refill is ready.'
advice: This call gave information and asked for nothing. That is what a real call looks like.
```

A scam template also needs:

- at least one line with `flag: true` (the first warning sign) and optional `cueAt` (0 to 1, where in the
  line the warning lands; the default is 0.5);
- exactly one line with `ask: true` (the moment the caller asks for money, a code or access), after the flag;
- `tactics` on the flagged lines, from: `urgency`, `authority`, `fear`, `secrecy`, `unusual-payment`,
  `code-request`, `remote-access`, `personal-info`, `too-good`, `isolation`;
- an `askFor` noun phrase ("the code") for the result headline;
- a final "coda" line that ends the call if the player never hangs up.

Lines can offer up to two `replies`, each with a `goto` to another line id; see `scenarios/scam/S01-bank-code.yaml`.

**What a scenario may contain.** Only tactics that the FTC and FBI already describe in public consumer advice
(see `scenarios/SOURCES.md`). A script shows the shape of a scam so it can be recognised; it never teaches a new
technique, never names a real payment app, gift-card brand or remote-access product, and every scam template ends
with advice that names the safe action. A legitimate call must be plausible in real life and must not ask for
money, codes or personal numbers, except for the real-bank alert pattern (L04), whose lesson is "hang up and call
the number on your card".

**Then:**

```sh
pnpm scenarios:build      # compiles public/scenarios/library.json; errors give file:line
pnpm scenarios:stats      # variant counts
pnpm audio:render         # renders the new lines (needs Windows SAPI, Piper or Kitten TTS and ffmpeg)
pnpm check                # every gate, including that each clip exists and is current
```

If you cannot render audio, open the pull request anyway and say so: a maintainer will render it. The audio
library has a 4 MB budget, so keep lines short.

## Pull requests

- One change per pull request, with a test where it can have one.
- Describe what a player would notice. Add a screenshot for any visible change, in light and dark.
- Commits use the imperative mood ("Fix the call-back score", not "Fixed").
