# Hang Up Club

One realistic practice phone call a day, and some of them are real. An installable, offline web app that
trains older adults to tell a scam call from a real one, with a family "coach" who sets it up and cheers by link.
No account, no server, no telemetry: everything stays on the device.

**Status: Stage 2 (core).** The domain logic, storage, audio engine and 20 sourced call scripts with rendered
audio are done and tested. The screens are not built yet: `pnpm dev` shows a placeholder that proves the content
loads. See `HANDOFF.md` for what is done, how to run it and the known issues.

## Run it

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # Playwright against the production build
pnpm lint && pnpm typecheck && pnpm build
pnpm check        # content gates: scenarios, fictional names, design tokens, rendered audio
```

Node 24 and pnpm 10 are required. `pnpm exec playwright install chromium` once, for the e2e tests.

## Where things are

| Path | What |
|---|---|
| `SPEC.md`, `docs/adr/0001-architecture.md`, `DESIGN.md` | What we are building and why |
| `scenarios/` | The 20 call scripts (YAML), their sources and the name review log |
| `src/domain/` | Pure TypeScript: scenario expansion, timeline, scoring, scheduler, streak, links, `.ics` |
| `src/storage/`, `src/state/`, `src/audio/` | IndexedDB, application state, Web Audio engine |
| `scripts/` | Scenario compiler, fictional-name check, token check, text-to-speech renderer |
| `public/scenarios/`, `public/audio/` | Compiled library and rendered clips (committed) |

## Licence

MIT. Voice audio is generated from the scripts in `scenarios/`; see `public/audio/CREDITS.md`.
