# Product

<!-- impeccable:product-schema 1 -->

> Provenance: written by the Stage 1 architect agent from the studio's council record
> (`_studio/picks.json` entry `hang-up-club` and `_studio/council/L4-4-hang-up-club.md`).
> No live product-owner interview was possible in this run, so every line below is
> **inferred from that brief** and should be confirmed by the maintainer.

## Platform

web

## Stack

Delegated to the studio workflow, which picked an installable offline PWA built with Vite + React + vite-plugin-pwa. Exact versions and reasons are in `docs/adr/0001-architecture.md`.

## Users

- **Primary: the older adult ("the player").** 65+, often 75+. Uses a phone or tablet the family set up. Has heard warnings about scams but has never practised saying no on a live call. Some have reduced vision, reduced hearing, or a slight tremor.
- **Secondary: the family coach.** Usually an adult child or grandchild. Installs the app, sends the setup link, records a short cheer, and receives result cards in the family chat. The coach is the one who brings the player back each day.

## Product Purpose

A flight simulator for phone scams. Each day the player takes one realistic 60-second practice call. About 40% of the calls are ordinary legitimate calls (the pharmacy, the clinic, a grandchild saying hello) that the player should **not** hang up on. The skill being trained is judgement: spotting the moment a caller shows a red flag, then hanging up or calling back on a number you already trust.

Success looks like this: the player hangs up on scams after the first red flag and before the caller's "ask", stays on legitimate calls, and keeps practising because their family cheers them on.

## Positioning

Voiced call drills already exist for enterprises (for example KnowBe4's vishing game). Older-adult scam games already exist as text quizzes. Hang Up Club is the first free, open-source, on-device option that combines all of the following:

- a daily voiced call built for older adults
- a judgement score: the second you hung up, compared with the second the scammer made their ask, with decoy calls so that hanging up on everything loses
- a family-coach loop that runs entirely on links, with no account and no server

## Operating Context

- The morning routine: a cup of coffee, then "Today's call".
- The coach sets everything up on their own phone and sends one link, by text, in a family chat, or as a QR code shown in person.
- The player's result goes back to the family chat as a link the player chooses to send.
- Calls must work offline once the app is installed.

## Capabilities and Constraints

- No hosted backend, no accounts, no telemetry. Static hosting only.
- All caller names, organisations and phone numbers are fictional. The app never names a real bank, agency or company.
- Audio is pre-rendered at build time with a free local TTS. In-browser TTS is used only for family-authored calls.
- A PWA cannot ring like a real phone call or schedule local notifications without a server. The daily trigger therefore relies on the in-app daily card, a calendar reminder file, and coach nudges.

## Brand Commitments

- Name: **Hang Up Club** (renamed from "Scam Gym").
- Tone: warm, respectful and adult. The player is a capable adult practising a skill, not a child being quizzed. Avoid anything that could read as patronising.
- Studio commitments: palette direction D1 FIELDNOTE, type pairing T7 (Atkinson Hyperlegible Next + Atkinson Hyperlegible Mono).

## Evidence on Hand

- FTC, *Protecting Older Consumers 2024–2025* (report to Congress, Dec 2025).
- FBI IC3, *2025 Internet Crime Report*, elder fraud section.
- Citations for both are in `SPEC.md` §5.

There are no users, testimonials, ratings or usage numbers yet, and none may be invented.

## Product Principles

1. **Judgement over reflex.** A score must never reward hanging up on everything.
2. **Dignity first.** The player gets plain language, large type, no childish rewards, and is never shamed for a miss.
3. **The family is the engine.** The coach loop is a first-class feature, not a share button.
4. **Nothing leaves the device unless the player sends it.**
5. **Fictional names only, always.**

## Accessibility & Inclusion

Senior-first:

- body text at least 20px and touch targets at least 56px
- WCAG AAA contrast on the call screen and AA everywhere else
- captions on every call
- no time pressure outside the simulated call itself
- reduced motion respected
- works with large system font settings
