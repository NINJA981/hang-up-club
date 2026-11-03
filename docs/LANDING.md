# Landing page: narrative, hero concept and draft copy

**Package:** `site/` (separate Vite package, built in Stage 3b).
**Mode:** Persuade.
**Structure:** five beats, in ≤ 7 viewports at 900px tall.
**Rules:** follow DESIGN.md (tokens, type, and "Appendix B: Landing page immersive plan"). CSS/SVG plus pre-rendered DOM capture only; no WebGL. The H1 is the LCP element. Initial JS ≤ 120 KB gz. No audio by default. Native scroll. No third-party requests (no CDN fonts, no analytics, no shields.io badge).

**Who lands here.** Mostly **adult children** arriving from a LinkedIn post or a Show HN link, on a phone, with sound off. Second: older adults who were sent the link. The page must:

1. make the idea obvious in 3 muted seconds
2. prove "some calls are real"
3. prove "no server"
4. get the visitor to open the app or send it to a parent

**Honesty rules.** No testimonials, user counts, star counts, ratings, press logos or "trusted by" lists. These don't exist yet and must not be invented. Statistics come only from SPEC §5.1 sources, cited inline with a link. Every caller shown is fictional.

---

## Hero concept: "The call is the hero"

The real product's call screen sits in a plain handset frame, on the right on desktop and below the H1 on phone. It runs a **muted, captioned practice call** on a loop:

> ring → answer → "Hello, this is Dana from First Wrenfield Bank's fraud department." → "Your account has been compromised…" → Hang up at 0:06 → **The Cut** → "Hung up at 0:06. The scammer needed 0:40."

A visitor can also **take the call themselves**: a "Try the call" button switches the frame from the autoplay loop to an interactive call (S01 variant), with real Hang Up and call-back buttons. A small "Sound: Off" toggle lazy-loads the ≤ 150 KB of Opus clips for this call.

Behind the frame is a static SVG contour field (moss at 6%), drawn like a walker's field notebook. One contour line becomes the coiled handset-cord motif that leads to the frame.

At ≥ 1024px the frame rests at `rotateY(-10deg) rotateX(4deg)` and settles flat on hover or focus (600 ms `--ease-scene`). On touch devices and under reduced motion it stays flat.

**Why no 3D.** The sentence the page must say is "a real-feeling call you can cut off, and some calls are real". The real call screen says it literally. A 3D handset would only be a metaphor for it (3P2; see DESIGN.md Appendix B).

### Above the fold (desktop 1440 × 900; phone 375 × 812)

```
DESKTOP                                                     PHONE
┌──────────────────────────────────────────────────────┐   ┌─────────────────────┐
│ Hang Up Club              How it works  Privacy  Code │   │ Hang Up Club     ☰? │ (no hamburger: 3 text links wrap)
│                                                       │   │                     │
│  Practise hanging up                 ┌──────────┐     │   │ Practise hanging up │
│  on scammers.                         │ (handset │     │   │ on scammers.        │
│  Not on your                          │  frame:  │     │   │ Not on your         │
│  pharmacy.                            │  live    │     │   │ pharmacy.           │
│                                       │  muted   │     │   │                     │
│  One practice call a day for your     │  call    │     │   │ One practice call a │
│  parents. Some calls are scams, some  │  loop)   │     │   │ day… (body 20px)    │
│  are real. The score is judgement.    │          │     │   │                     │
│                                       └──────────┘     │   │ [Open the app] 64px │
│  [Open the app]  Try the call   Sound: Off             │   │ Try the call        │
│                                                       │   │ ┌─────────────────┐ │
│  Free and open source. No account. No server.         │   │ │ handset frame    │ │
└──────────────────────────────────────────────────────┘   └─────────────────────┘
```

Left-aligned copy. One filled CTA ("Open the app"). The secondary is a quiet text button ("Try the call").

---

## The five beats

### Beat 1: Hook (viewport 1)

- **H1** (`landing-display`, 56→112 px, 650, −0.035em, 0.94 line height):
  **"Practise hanging up on scammers. Not on your pharmacy."**
  The second sentence carries the novelty: decoys. No word is accented. Size and the full stop do the work.
- **Lead** (`lead` 24/34):
  "Hang Up Club gives your parents one realistic practice call a day. Some calls are scams and some are real, so they learn to tell the difference. The score is how early they spot the trick."
- **Primary CTA:** "Open the app". Secondary (quiet): "Try the call". Toggle: "Sound: Off".
- **Trust line** (`body`, `text-muted`): "Free and open source. No account. No server. Every caller is made up."

### Beat 2: The real product in motion (viewport 2)

- **Asset.** A T18 loop: the signature moment captured from the real app (`scripts/capture-demo.mjs`, `?demo=signature&seed=7`). MP4 ≤ 600 KB plus WebM, with an AVIF poster. It plays when 25% visible and pauses offscreen. A visible "Pause" button handles WCAG 2.2.2.
- **Heading** (`h1` 40/46): "Hung up at 0:06. The scammer needed 0:40."
- **Copy:** "Every scam call has a moment where the caller asks for something: a code, a gift card, a payment. Hang Up Club marks that moment. Hanging up after the first warning sign and before the ask is the best score you can get."

### Beat 3: Three proof moments (viewports 3–5, one feature per viewport)

Each proof is a ≤ 6 s muted loop on the left and one heading plus one sentence on the right. On phone they stack. There is no card grid; the three alternate sides.

1. **"Some calls are real."**
   *Loop:* L01, the Alder Lane Pharmacy refill call. The player stays on, and the result reads "That was the real pharmacy. Staying on was right."
   *Copy:* "About 4 in 10 calls are ordinary calls (the pharmacy, the clinic, a grandchild saying hello). Hang up on everything and your score drops. The skill is judgement, not reflex."
2. **"See what gave it away."**
   *Loop:* the red-flag replay. The transcript scrolls with stamps ("They're rushing you · 0:06", "Asks for a code · 0:40") and the advice sentence.
   *Copy:* "After each call, a plain-language replay shows the exact second each trick was used, and one thing to do next time."
3. **"Set it up from your phone. Cheer from anywhere."**
   *Loop:* coach setup. Pick "Paati", record "Nice one, Paati!", then a QR code. Then the player's result and the cheer playing.
   *Copy:* "You send one link. Your recorded cheer plays when they get it right, and they can send you their result in the family chat. No accounts, no app store."

**Stats strip** (once, beneath proof 3; real and sourced; mono numerals; no big-number hero treatment):
"People over 60 reported **$7.7 billion** lost to internet crime in 2025 [FBI IC3, p.44]. In 2024, **40%** of older adults' loss reports for scams that started with a phone call involved someone pretending to be a business, such as a bank [FTC, *Protecting Older Consumers 2024–2025*, p.26]."
Both are linked to their PDFs. The 40% is a share of **loss reports**, not of dollars. Keep that wording exact.

### Beat 4: How it works / privacy (viewport 6)

- **Heading:** "No server. Nothing to hack, nothing to sell."
- **SVG diagram** (inline, ≤ 15 KB, theme-aware via `currentColor`):
  `Your phone` → link (the `#…` part never reaches any server) → `Their phone`. Calls, scores and cheers live on the device. A dashed empty box labelled "Server" is crossed out.
- **How it's made, in 5 steps**:
  1. **The decision.** "Train judgement, not reflex. 8 of the 20 call scripts are real calls."
  2. **The naive version.** "In-browser TTS sounded like a GPS and took ~1–3 s per line on mid-range phones." *(Stage 2 replaces this with the spike's measured number, or removes the claim.)*
  3. **The trick.** "Every line is voiced at build time by a free local TTS, band-passed to 300–3,400 Hz telephone sound, and shipped as 16 kbps Opus. The whole call library is about 4 MB." *(Final size filled from `audio:check`.)*
  4. **How it degrades.** "Offline after the first download. Captions on every call. If audio can't play, your phone's own voice reads it. If there's no voice, the call is a read-along."
  5. **Stack and license.** "React, Vite, Web Audio, IndexedDB. MIT licensed."
- **Sources line:** the scenario library maps to FTC and FBI scam categories, with a link to `SPEC.md#5-scenario-library-and-source-mapping` on GitHub.

### Beat 5: Install (viewport 7) and closing band

This is the closing band on `call-bg` (the Line, dark in both themes), our re-expression of the "closing dark band" taken from the superhuman reference.

- **Heading** (`call-text`): "Set it up for someone you love."
- **Steps** (a real sequence):
  1. Open the app on your phone.
  2. Tap "I'm setting this up for someone else".
  3. Send them the link, or show them the QR code.
- **CTAs:** "Open the app" (moss, the one filled button in this band). Quiet: "View the code on GitHub". There is **no star badge or count**.
- **Platform line:** "Works on Android, iPhone (Add to Home Screen) and any modern desktop browser."
- **Footer** (on the notebook stone again):
  - "Every caller, bank and agency in Hang Up Club is fictional."
  - "Hang Up Club is a practice tool, not a call blocker. If you think you're talking to a scammer, hang up and call a number you trust."
  - License, source links.

---

## Copy bank (for social, README and OG)

- **OG title:** "Hang Up Club: practise hanging up on scammers"
- **OG description:** "One realistic practice call a day for older adults. Some calls are real. Free, open source, no server."
- **OG image:** 1200 × 630, captured from the real result screen ("Hung up at 0:06. The scammer needed 0:40.") with the H1 overlaid in DOM.
- **LinkedIn hook:** "My grandmother has never practised saying no to a scammer. So I built her a gym: one fake scam call a day, and her score is how fast she hangs up. Some calls are real, though, so she can't just hang up on everything."
- **README one-liner:** "A flight simulator for phone scams, built for grandparents: one practice call a day, and some of them are real."

## Not on this page (and why)

| Item | Why it's excluded |
|---|---|
| WebGL, Lenis, custom cursor, loader | The CSS/SVG decision (DESIGN.md Appendix B) |
| Testimonials, user counts, stars, press logos | None exist; inventing them is a hard fail |
| Real bank or agency names or logos, even in "as seen in" form | The fictional-names rule |
| Autoplay sound | Sound only after a tap |
| A pricing section | It's free. Saying "free" once, in the trust line, is enough. |
