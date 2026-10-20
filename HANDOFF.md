# HANDOFF: Hang Up Club

**Last updated:** 2026-10-20, end of Stage 1 (Architect)
**Next stage:** Stage 2, Scaffold + Core

## What's done

Stage 1 produced documents only. **No code exists yet**, so there is nothing to run.

| File | What it is |
|---|---|
| `SPEC.md` | Problem, users, daily trigger, the weakness fix (§4), the 20-template scenario library mapped to FTC/FBI categories with page-level sources (§5), MVP features F1–F10, scoring and scheduling rules (§7), non-goals, data model, privacy and network policy, platform matrix, testable acceptance criteria (§12), a 10-second demo script (§13), and risks |
| `docs/adr/0001-architecture.md` | Stack with exact versions verified by `npm view` on 2026-10-20, module layout, runtime architecture (call state machine, Web Audio graph, service worker, links, storage), the build-time TTS pipeline, the Kitten-in-browser spike, testing approach and fixture strategy |
| `DESIGN.md` | Google Stitch format; passes `@google/design.md@0.4.0 lint` with 0 errors (the 27 warnings are orphaned dark and call tokens, expected because components reference light tokens). Contents: D1 FIELDNOTE + T7, OKLCH tokens (light, dark, and the always-dark call "Line"), a computed contrast table, the "Senior Comfortable" type scale, spacing, radius, elevation and motion tokens, component and screen state specs, the signature moment "The Cut" frame by frame, the landing immersive plan (a reasoned CSS/SVG-only choice), three "we never" rules, and the ticked pre-flight checklist |
| `.impeccable/design.json` | Impeccable sidecar: tonal ramps, motion, shadows, and 7 component snippets |
| `docs/LANDING.md` | The 5-beat landing narrative, the hero concept ("the call is the hero") and draft copy |
| `PRODUCT.md` | Impeccable product record, **inferred from picks.json and the council transcript** because no live interview was possible. The maintainer should confirm it. |

## How to run

Nothing to run yet. Stage 2 will add `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, plus the content scripts `pnpm scenarios:check`, `pnpm scenarios:stats`, `pnpm audio:render` and `pnpm audio:check` (ADR §2 and §4).

## Key decisions for the next stages

1. **Audio is pre-rendered** (Piper → Kitten TTS (Python) → Windows SAPI), band-passed with ffmpeg, and shipped as Opus/WebM 16 kbps plus an AAC fallback. Rendered clips are **committed**. CI only checks freshness and never renders.
   - Verified on this machine: ffmpeg 9.0.2 has `libopus` and `aac`; SAPI voices David, Zira and Mark are installed; Python 3.12 and pip are present.
   - Piper is **not** installed yet (`pip install piper-tts==1.8.0`).
2. **TypeScript is pinned to 6.0.3, not 7.0.2**, because typescript-eslint 8.72.0 supports TypeScript `<6.1.0`.
3. **The call screen ("The Line") is always dark**, in both themes, with AAA contrast. The notebook is light-first.
4. **No cmdk.** This deviates from the bible, with the reason written in DESIGN.md: a senior audience, and fewer than 15 actions, all visible.
5. **The landing page has no WebGL.** The hero is the real call screen running in demo mode, with a static SVG contour backdrop and pre-rendered loops captured from the DOM.
6. **The streak forgives**: one automatic rest day per week, and a miss never breaks it. This is consistent with picks.json, which only says a hang-up on a legitimate call is "a miss".
7. **The cheer travels in its own link** (≤ 8 KB), so the join link stays QR-sized (≤ 1,000 chars).

## Known issues and open questions

- **Kitten TTS in the browser is unproven** for family calls. The npm `phonemizer` bundles espeak-ng, which is GPL-3.0, and that conflicts with our MIT licence. Stage 2 must run the spike in ADR §4.4. If it fails, family calls use Web Speech with `localService` voices only, without the phone filter, and the README must say so.
- **"First Meridian Bank"** is required verbatim by picks.json. A web search on 2026-10-20 found no exact-name institution, but a "Meridian Bank" exists in Malvern, PA. Run an FDIC BankFind and NCUA exact-name check for every fictional institution before launch, and rename on any exact match.
- **The novelty score (6) is provisional.** The council asked for a follow-up sweep of GitHub, Devpost and Product Hunt for "scam call simulator for seniors" with decoys. It has not been done.
- **Cross-browser cheer playback** (a WebM/Opus recording played on iOS) has not been tested. There is a text fallback (AC-F8-6), and coach recording prefers `audio/mp4`.
- **Daily reminders without a server** rely on the `.ics` calendar file and coach nudges. Periodic Background Sync is best-effort and Android-only.
- **Source citations** were read from the FTC Dec-2025 PDF and the IC3 2025 PDF on 2026-10-20. ftc.gov blocks curl, so the FTC PDF was fetched through WebFetch. Recheck the URLs before launch.
- **PRODUCT.md is inferred**, not interviewed.
- **The demo assets** (GIF, MP4, OG card, poster) and the `size-limit` wiring are planned but do not exist yet. They are marked "not yet" in the DESIGN.md checklist.
