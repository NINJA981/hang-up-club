# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-04

First public release.

### Added

- The daily practice call: a full-screen incoming call (slide, tap, Enter or Space to answer), captions, reply
  choices, "Hang up" and "Hang up and call the number on my card", and the call-back screen with the made-up
  organisation's real line.
- 20 call scripts (12 scam patterns, 8 real calls) that expand into 1,317 variants, each citing FTC or FBI IC3
  reports, with pre-rendered, band-passed voices that work offline.
- Judgement scoring against each script's first warning sign and the scammer's ask, with a seeded daily scheduler
  that makes about 40% of calls real, spaced repetition of missed tactics and a streak with one rest day a week.
- The red-flag replay: a timeline of the call with each tactic stamped, a "Play this line" control and one
  sentence of advice with its source.
- The family coach loop by link: setup link and QR code, a recorded cheer, a family-written practice call, and
  result cards that the coach can keep in an inbox.
- Installable, offline PWA with an update prompt that never interrupts a call, and a calendar (`.ics`) reminder.
- Landing page in `site/`.
- Contributor docs, code of conduct, security policy, issue and pull request templates, and a CI workflow.

### Fixed before release

- Calling back on every call no longer earns a perfect judgement rate: a call back on a real call that asked for
  nothing is "cautious" (60 points, half credit), and a call back before any warning sign counts as early.
- The 50-point "late" tier can now happen (the window after the ask is 2 seconds, not 10).
- Setup links accept names written with zero-width joiners (Persian, Malayalam, emoji sequences) and store names
  in NFC form.
- A call no longer runs out, and is scored, while the app is in a background tab: the call pauses until it is
  visible again. iOS "interrupted" audio resumes on the next tap.
- The audio manifest refreshes after an update, and clip URLs carry their render hash, so an update never plays
  stale audio.
- Link screens recover from a failed save instead of spinning; a call's result is written in one transaction and
  retried; the app asks the browser to keep its data; a second open tab no longer blocks a database upgrade.
- The made-up "First Meridian Bank" is now "First Wrenfield Bank", because real US institutions use the name
  Meridian.

[0.1.0]: https://github.com/NINJA981/hang-up-club/releases/tag/v0.1.0
