# Hang Up Club: Product Spec (v0.1)

> **One realistic practice call a day, and some of them are real.**
> A flight simulator for phone scams, built for grandparents. About 40% of the calls are legitimate calls you should *not* hang up on. You score on judgement: "Hung up at 0:06. The scammer needed 0:40." Families set it up and cheer by link, with no account and no server.

**Authority.** The `refined_scope`, `signature_moment` and `risks` in `_studio/picks.json` (slug `hang-up-club`) are authoritative. This spec adds the studio's weakness fix (§4) on top of them. Where the two disagree, picks.json wins, and the conflict is noted inline.

**Status:** Stage 1 (architect). No code exists yet.

---

## 1. Problem

Awareness posters don't build reflexes. Phone scams work because the pressure feels real in the moment: a calm "fraud department" voice, a deadline, a request to keep it quiet. Nobody practises saying no.

The cost is large and rising:

- **Losses.** In 2025, adults 60+ filed **201,266** complaints with the FBI's IC3 and reported **$7.748 billion** in losses. That is up 59% on 2024, with an average loss of **$38,500** [IC3-2025, p.44].
- **The phone.** The phone is the channel where older adults lose the most per incident. Median individual losses "continued to be highest for frauds that started with a phone call" [FTC-OA-2025, p.19]. People 80 and over filed "far more loss reports on scams that started with a phone call" than through any other channel [FTC-OA-2025, p.25].

The usual advice ("never answer unknown numbers") does not work, because real people do call. Pharmacies call. Clinics call. A grandchild calls. Banks really do call about fraud.

So the skill to train is not hanging up fast. It is **telling a scam from a real call, at the moment the caller shows their hand**.

## 2. Users

| User | Situation | Job to be done |
|---|---|---|
| **Player** (older adult, 65–90) | Has a phone or tablet that family set up. May have reduced vision, hearing or fine motor control. Is not a "tech person". | "Help me notice when a call is a trick, without making me feel stupid." |
| **Coach** (adult child or grandchild) | Worried about a parent or grandparent. Installs and configures the app on the player's device, or sends a link. Lives in the family group chat. | "Let me set this up once, keep Grandma practising, and know how she's doing, without becoming her IT department or her nag." |

The coach is the distribution channel and the retention engine (council risk: "the person installing it is the adult child, not the 75-year-old"). The design treats the coach as a first-class user (§4.1).

## 3. Daily trigger

A PWA cannot ring like a real phone and cannot schedule local notifications without a push server, which we do not run (picks.json risk). We stack four triggers instead. None of them needs a server.

1. **Morning routine card.** Opening the app (the home-screen icon) shows "Today's call is ready" as the only primary action.
2. **Calendar reminder.** Settings → "Remind me every day" downloads a locally generated `.ics` file. It contains a daily recurring event at a time the player chooses, titled "Hang Up Club: today's practice call", with the app URL. The phone's own calendar app then does the ringing.
3. **Coach nudge.** Every result card the player sends shows the coach the player's streak. A missing card by evening is the nudge. The coach can send a **new cheer** or a **new family call** link at any time, so there is always something fresh to open (§4.1).
4. **Progressive enhancement.** Android Chrome, installed only: if the player grants notifications, Periodic Background Sync (when the browser allows it) shows a local "Today's call is ready" notification. This is documented as best-effort and is never relied on.

At most **one scored call per day** (refined scope item 6). Unscored "practice again" calls are available after the daily call.

---

## 4. Weakness fix: how this spec answers the council's lowest scores

The council scored **Utility 4** ("the daily habit is invented by the product… by week 6 the 20 scripts feel repetitive") and **Novelty 6** ("KnowBe4 Spot the Vish already does voiced call drills, for enterprises"). This spec answers both explicitly.

### 4.1 The family-coach loop is first-class (Utility)

The coach's journey is a full product surface with its own screens and acceptance criteria. It is not a share button.

| Loop step | What the coach does | What the player experiences | Feature |
|---|---|---|---|
| Set up | On their own phone, picks what the player is called ("Paati", "Grandma", "Nana"), chooses scenario types, records a ≤ 2.5 s cheer, and optionally writes a **family call** | Opens one link, or scans one QR code. The app greets them by name: "Arjun set this up for you." | Coach Setup (F7), join link |
| Cheer | Records a cheer in their own voice | After a good call, hears "Nice one, Paati!" in the grandchild's actual voice | Cheer link, signature moment (F9) |
| Report back | Receives result cards in the family chat and saves them to a local **Coach inbox** | Taps "Send to family" after a call. It opens the phone's share sheet with a link and a one-line message. | Result card (F8), Coach inbox |
| Refresh | Sends a **new cheer** or a new **family call** (a custom scenario that can use real family names) whenever they like | Has fresh content and a reason to come back. This fights the "content treadmill" roast. | Cheer link, family-call link |
| Remind | Sends the `.ics` reminder, or sets it up during install | The calendar rings every morning | Reminder (§3) |

Everything travels in **URL fragments** (`#…`). Browsers never send the fragment to a server, so even the static host never sees the content (§10).

### 4.2 About 40% of calls are legitimate, and decoys are first-class (Novelty + anti-gaming)

- **The library** is 20 templates: **12 scam** and **8 legitimate**. The daily scheduler targets a **40% legitimate** rate. Scenario coverage is in §5.
- **Decoys are scored with their own outcomes** (`stayed`, `verified`, `missed`). A player who hangs up on everything gets "missed" on 40% of days, so their judgement rate falls to about 60% or lower (§7.3). The exploit from the roast ("hang up on every call in 0.5 s") no longer pays.
- **Decoys teach as much as scams.** Every decoy's replay explains *why it was safe*: "They didn't ask for anything. They told you to call the number you already have."
- **The legitimate-bank decoy** (L04) is the genuine First Meridian Bank fraud team telling the player to hang up and call the number on their card. It teaches the one behaviour that defeats every bank-impersonation scam, and it pairs with the second call button (F2).
- **Novelty.** The judgement score is measured against the scammer's **ASK moment**, uses decoys, and adds a call-back-to-verify action. This framing is not in the enterprise prior art. The council's caveat stands: novelty is provisional until a follow-up sweep of GitHub, Devpost and Product Hunt. That sweep is tracked in HANDOFF.md.

### 4.3 The scenario library maps to current FTC and FBI categories, with sources

See §5. Every template cites its category in the FTC *Protecting Older Consumers 2024–2025* report and/or the FBI IC3 *2025 Internet Crime Report*. A CI check (`scenarios:check`) fails any template without a `sources` entry.

### 4.4 Senior-first accessibility

| Requirement | Value | Where it is enforced |
|---|---|---|
| Body text | **≥ 20px** (20/30). Meta labels ≤ 4 words may use 18px. Nothing is ever smaller. | DESIGN.md type scale; lint rule bans `text-[<18px]` |
| Touch targets | **≥ 56 × 56px**, at least 12px apart. Primary buttons are 64px tall. Call controls are 96px circles. | DESIGN.md spacing tokens; Playwright measures every interactive element |
| Contrast on the call screen | **WCAG AAA**: ≥ 7:1 for text below 24px and ≥ 4.5:1 for large text. Computed values: call text 17.0:1, muted 11.3:1. The Hang Up glyph is 5.6:1 on red, and its "Hang up" label sits beneath the circle on the call background at 17.0:1. | DESIGN.md contrast table; axe plus a custom AAA check in e2e |
| Contrast elsewhere | WCAG AA minimum. Body text is 15.7:1 in light and 16.0:1 in dark. | axe |
| Captions | On by default for every call, at 26px, showing the last 2 lines | F2 |
| Time pressure | None outside the simulated call. The ring lasts ≤ 20 s and then waits. No timers on menus. | F1 |
| Text size | "Standard" or "Larger" (+20%) app setting, and the app respects OS font scaling (all `rem`) | Settings |
| Motion | `prefers-reduced-motion` removes the shatter and confetti and uses crossfades | DESIGN.md motion |
| Gestures | Slide-to-answer always has a tap-to-answer button next to it (for tremor). No gesture-only actions. | F1 |

### 4.5 Audio is pre-rendered at build time with free local TTS

See ADR-0001 §4 for the full pipeline. In summary:

1. **Engines.** Each line of every YAML script is synthesized offline by an engine adapter, in priority order: **Piper** (`piper-tts` 1.8.0, run locally), **Kitten TTS** (`kittentts` 0.1.3, Python), or **Windows SAPI** via PowerShell (`System.Speech`, always available on Windows; David, Zira and Mark were verified on the dev machine).
2. **Telephone sound.** Each clip is band-passed with ffmpeg to telephone quality: 300–3400 Hz, compressed, and resampled through 8 kHz to get the narrowband character.
3. **Small files.** Clips ship as **Opus in WebM at 16 kbps mono**. An AAC/M4A fallback is generated for browsers that cannot play Opus.
4. **Ambience.** Call-centre, pharmacy and street beds are synthesized from layered TTS murmur plus line noise, so there are no third-party samples. They are mixed in at runtime.
5. **Fallback.** If a clip cannot be decoded or fetched, the line plays through the **Web Speech API**, restricted to `localService` voices so the text never goes to a cloud voice. If no local voice exists, the call runs as a captions-only "read-along call".
6. **Family calls.** Family-authored calls cannot be pre-rendered, so they use in-browser **Kitten TTS** (lazy, same-origin model files) with the same filter applied in Web Audio, falling back to Web Speech. Kitten in-browser carries a licensing and feasibility spike (ADR §4.4).

### 4.5a Every caller name and organisation is fictional

- **Organisations** are coined names such as "First Meridian Bank", "Tollan Valley Power & Light" and "Parcelwise Delivery".
- **Government-style callers** use invented agencies, such as "Federal Tax Recovery Unit" and "National Benefits Administration". No real agency is ever named.
- **Phone numbers** come only from the NANP fictional block `NXX-555-0100` to `NXX-555-0199`.
- **Enforcement.** `scripts/check-names.ts` fails CI if any script, UI string or asset contains a name on the deny-list. The deny-list covers the top 250 US banks and credit unions by assets, US federal agencies, the top 100 consumer brands, carriers and couriers, and big-tech companies, plus a manual review log.
- **"First Meridian Bank"** is required verbatim by picks.json. A web search on 2026-10-20 found **no institution with that exact name**. A similarly named "Meridian Bank" (Malvern, PA) exists. This is logged as a known issue: run an FDIC BankFind and NCUA check before launch, and if there is an exact match, the name must change (picks.json allows it: "never use real bank names").

---

## 5. Scenario library and source mapping

### 5.1 Sources

- **[FTC-OA-2025]** Federal Trade Commission, *Protecting Older Consumers 2024–2025: A Report of the Federal Trade Commission* (report to Congress, Dec 1, 2025). https://www.ftc.gov/system/files/ftc_gov/pdf/P144400-OlderAdultsReportDec2025.pdf. Key passages:
  - p.18: older consumers were 5× more likely to lose money to tech-support scams, with $159M lost in 2024.
  - p.19: top loss types are investment, business-impersonation and government-impersonation scams. Phone calls have the highest median loss.
  - p.22, fn 69: no-loss phone reports were most often about callers impersonating government and well-known businesses, "particularly Medicare, Amazon, and banks".
  - p.23: older adults were 5× more likely to report a loss on tech support, 2.7× on prize/sweepstakes, 1.39× on romance and 1.36× on government impersonation.
  - p.24: the highest business-impersonation losses are bank impersonators ("a security concern has put their accounts at risk… transfer money or deposit cash into Bitcoin ATM machines to keep it 'safe'"). Government impersonation losses rose 47%.
  - p.26: when contact was a phone call, losses were business impersonation 40%, government impersonation 23%, and prize/sweepstakes/lottery 15%.
  - p.27: gift cards are the most frequent payment method on government-impersonation, tech-support, romance and family/friend-impersonation scams.
  - p.29: FTC-impersonator scripts ("money is at risk… move it to protect it").
- **[IC3-2025]** FBI Internet Crime Complaint Center, *2025 Internet Crime Report*. https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf. Key passages:
  - p.21: "Call Center Fraud" covers Tech/Customer Support plus Government Impersonation, with more than 80,000 complaints and more than $2.9B lost (all ages).
  - p.40: grandparent and "distress" scams sit under Confidence/Romance, including voice cloning, with more than $5M lost to distress scams.
  - pp.44–47, victims 60+, 2025:
    - Tech/Customer Support: 21,334 complaints, $1.04B
    - Confidence/Romance: 10,188 complaints, $584M
    - Government Impersonation: 8,628 complaints, $413M
    - Lottery/Sweepstakes/Inheritance: 2,785 complaints, $136M
    - Phishing/Spoofing: 48,064 complaints
- **[FTC-IMP-2026]** FTC Consumer Alert, "New trends in reports of imposter scams" (May 7, 2026). https://consumer.ftc.gov/consumer-alerts/2026/05/new-trends-reports-imposter-scams. Imposter scams were the #1 reported scam for the ninth year, with $3.5B lost in 2025 and government-imposter reports up 40%.

Figures were read directly from the two PDFs on 2026-10-20. Page numbers are the printed page numbers.

### 5.2 The 20 templates

Every caller below is fictional. "Ask" is the scammer's request, which defines the ASK moment. Tactic stamps use the taxonomy in §5.3.

#### Scam templates (12)

| ID | Scenario | FTC / IC3 category (source) | Fictional caller (examples of `{org}`) | First red flag → ASK | Tactics |
|---|---|---|---|---|---|
| S01 | Bank "fraud department": read back the code | FTC business impersonation, banks: #1 phone loss type, 40% [FTC-OA-2025 p.24, p.26]. IC3 phishing/spoofing [IC3-2025 p.45]. | First Meridian Bank Fraud Dept, Kestrel Ridge Credit Union, Bellwick National Bank | "Your account has been compromised" → "read me the code we just texted you" | authority, urgency, code-request, isolation |
| S02 | Bank "security": move money to a safe account / crypto ATM | FTC bank impersonation, "keep it safe" [FTC-OA-2025 p.24] | Same bank set, "Security Team" | "Your savings are at risk right now" → "withdraw cash and deposit it at this kiosk" | authority, fear, unusual-payment, secrecy |
| S03 | Grandchild in jail: bail money | FTC family/friend impersonation [FTC-OA-2025 p.27]. IC3 Confidence/Romance incl. grandparent and distress scams [IC3-2025 p.40]. | "It's me…" (no name, so the victim supplies it) plus fake "Attorney Mark Ellison" | "Please don't tell Mom" → "buy gift cards / a courier will pick up cash" | secrecy, urgency, unusual-payment, fear |
| S04 | Tax agency: arrest warrant | FTC government impersonation, 23% of phone losses [FTC-OA-2025 p.26]. IC3 Government Impersonation, 8,628 complaints from 60+ [IC3-2025 p.47]. | Federal Tax Recovery Unit | "A warrant has been issued" → "pay today with gift cards" | authority, fear, urgency, unusual-payment |
| S05 | Benefits suspended | FTC government impersonation [FTC-OA-2025 p.24] | National Benefits Administration | "Your benefits are suspended" → "confirm your full benefit number" | authority, fear, personal-info |
| S06 | Health-coverage "new card" | FTC no-loss phone reports, Medicare impersonation [FTC-OA-2025 p.22 fn 69] | Senior Health Coverage Office | "Your old card expires Friday" → "read me the number on your card" | authority, urgency, personal-info |
| S07 | Tech support: "your computer is infected" | FTC tech support, 5× [FTC-OA-2025 p.18, p.23]. IC3 Tech/Customer Support $1.04B (60+) [IC3-2025 p.46]. | Brightwire Computer Help Desk | "We detected a virus sending your data" → "install this app so I can fix it" | authority, fear, remote-access |
| S08 | Refund / overpayment trick | IC3 Tech/Customer Support (refund variant) [IC3-2025 p.21]. FTC business impersonation [FTC-OA-2025 p.24]. | Larkspur Subscriptions Billing | "We refunded you $2,000 by mistake" → "send the difference back in gift cards" | authority, urgency, unusual-payment, remote-access |
| S09 | Package delivery: redelivery fee | FTC business impersonation texts and calls [FTC-OA-2025 p.26] | Parcelwise Delivery | "Your parcel is held" → "the card number for a $1.99 fee" | urgency, personal-info |
| S10 | Utility shut-off in 30 minutes | FTC business impersonation [FTC-OA-2025 p.24] | Tollan Valley Power & Light | "A crew is on its way to cut your power" → "pay now with a prepaid card" | urgency, fear, unusual-payment |
| S11 | Prize / sweepstakes: pay the fees | FTC prize/sweepstakes/lottery: 15% of phone losses, 2.7× [FTC-OA-2025 p.23, p.26]. IC3 Lottery/Sweepstakes $136M [IC3-2025 p.46]. | Grand Harvest Sweepstakes Clearing | "You've won $850,000" → "pay the release fee first" | too-good, urgency, unusual-payment, secrecy |
| S12 | Romance / "friend in trouble" | FTC romance, 1.39× [FTC-OA-2025 p.23]. IC3 Confidence/Romance $584M (60+) [IC3-2025 p.46]. | "Daniel" (a fictional overseas engineer) | "I can't tell anyone but you" → "wire money for my customs fee" | secrecy, isolation, unusual-payment |

#### Legitimate templates (8)

| ID | Scenario | Why it is legitimate (what the replay teaches) | Fictional caller |
|---|---|---|---|
| L01 | Prescription refill is ready | Gives information. Asks for nothing. "Pick up any time." | Alder Lane Pharmacy |
| L02 | Clinic needs to move your appointment | Offers choices. Asks only "Does Thursday work?" | Riverbend Family Clinic |
| L03 | Grandchild calls to say hello | No emergency, no money, no secrecy | "It's Sam!" (fictional; coach-configured family calls can use real names) |
| L04 | **Real** bank fraud alert | Asks nothing. Says: "Please hang up and call the number on the back of your card." | First Meridian Bank Fraud Dept (the same name as S01, on purpose) |
| L05 | Dentist reminder (automated) | Automated. "Press 1 to confirm" is optional, and no personal info is asked. | Northgate Dental |
| L06 | Library: your hold is ready | Information only | Fernhill Public Library |
| L07 | Utility planned maintenance notice | Same company name as S10, but no payment and no threat. "Visit or call the number on your bill." | Tollan Valley Power & Light |
| L08 | Friend from church/club confirming lunch | Social, no asks | "Marion from the Thursday club" |

**Variant expansion.** Each template declares variable lists:

- `org` (2–3 fictional organisations)
- `amount` (2–4 values)
- `address` (how the caller addresses the player, from 15 pre-rendered address terms: Grandma, Grandpa, Nana, Gran, Granny, Grandad, Papa, Paati, Thatha, Nani, Abuela, Abuelo, Oma, Opa, Lola)
- `branch` paths (reply choices)

The minimum is **12 variants per template**, and the library must expand to **≥ 300 distinct playable variants** (AC-F3-4).

### 5.3 Tactic taxonomy (red-flag stamps)

These ten tactics are the vocabulary of the red-flag replay and of spaced repetition. Labels are plain language for the player; the slug is for code.

| Slug | Player label | Example line |
|---|---|---|
| `urgency` | They're rushing you | "We have to act in the next five minutes." |
| `authority` | Says they're official | "This is Officer Grant, badge 4471." |
| `fear` | Threatens you | "A warrant has been issued for your arrest." |
| `secrecy` | Wants it kept secret | "Don't tell anyone at the bank." |
| `unusual-payment` | Strange way to pay | Gift cards, crypto kiosk, wire, cash courier |
| `code-request` | Asks for a code | "Read me the six-digit code." |
| `remote-access` | Wants into your computer | "Install this app so I can see your screen." |
| `personal-info` | Asks for private numbers | Benefit number, card number, PIN |
| `too-good` | Too good to be true | "You've won $850,000." |
| `isolation` | Keeps you on the line | "Don't hang up, or the account locks." |

---

## 6. MVP features

Features F1–F7 map to the refined scope items 1–7 in picks.json, plus the weakness fix.

| # | Feature | Scope item |
|---|---|---|
| F1 | Incoming-call screen: fictional caller ID, ringtone, `navigator.vibrate`, slide to answer plus a tap-to-answer button | 1 |
| F2 | In-call screen: live captions, oversized high-contrast **Hang Up**, and the second button **"Hang up and call the number on my card"** (label adapts per template, see below), plus optional reply chips | 1 |
| F3 | Branching YAML script format with variables, expanding ~20 templates into hundreds of variants. 12 scam + 8 legitimate. Sourced (§5). | 2 |
| F4 | Red-flag and ASK timestamps per script. Judgement scoring (§7). | 3 |
| F5 | Build-time pre-rendered audio (local TTS → telephone band-pass → Opus) with ambience. Kitten TTS WASM only for family-authored calls. Web Speech fallback. | 4 |
| F6 | Red-flag replay: transcript timeline stamped with the tactic at each second, plus one plain sentence of advice. Call-back simulation. | 5 |
| F7 | Daily card, streak calendar, at most one scored call a day, and spaced repetition of tactics the player missed | 6 |
| F8 | Family links: coach setup link (name, address term, recorded cheer, preferred scenario types, "Family call" custom scenario using real names), cheer link, family-call link, URL-encoded result card back to the family chat, Coach inbox | 7 |
| F9 | Signature moment: the call screen shatters, the timeline shows the cut against the red ASK marker, and the grandchild's cheer plays | signature_moment |
| F10 | Installable offline PWA with app shell and full audio library cached, an offline banner, an update prompt and the reminder `.ics` | 1, 7 |

**Second-button label (F2).** It is "Hang up and call the number on my card" for bank and health-card templates, as picks.json requires. Other templates use their own `callback.label`:

- "Hang up and call the number on my bill" (utility)
- "Hang up and call the pharmacy's number" (pharmacy)
- "Hang up and call them back myself" (family; the player calls the family member on the number they already know)

The behaviour is the same in every case: end this call, then call back on a number you already trust.

---

## 7. Scoring and scheduling

### 7.1 Time markers

All times are milliseconds from the moment the call is answered, along the path actually played (branches change times):

- `tFlag`: the cue time of the first line marked `flag: true`. The cue is the line start plus `cueAt` × the clip duration, where `cueAt` defaults to 0.5.
- `tAsk`: the end of the line marked `ask: true`. The scammer has finished asking.
- `tEnd`: the end of the last line. A scam call ends with the "caught" coda: "Okay, read it to me now… I'll wait." A legitimate call ends with the caller's goodbye.

### 7.2 Outcomes and points

| Call kind | Player action | Condition | Outcome | Points | Headline (example) |
|---|---|---|---|---|---|
| Scam | Hang Up | t < tFlag | `jumpy` | 60 | "You hung up before they gave anything away." |
| Scam | Hang Up | tFlag ≤ t < tAsk | `sharp` | 100 | "Hung up at 0:06. The scammer needed 0:40." |
| Scam | Hang Up | tAsk ≤ t < tEnd | `late` | 70 if t − tAsk ≤ 10 s, otherwise 50 | "Hung up 4 s after they asked for the code." |
| Scam | (none) | the call reaches tEnd | `caught` | 0 | "They got to the ask, and you were still on the line." |
| Scam | Call back | any t | `verified` | as for Hang Up at t, +10 (max 100). Jumpy gets 70. | "You called the number on your card. That beats every bank scam." |
| Legit | (none) | the caller ends at tEnd | `stayed` | 100 | "That was the real pharmacy. Staying on was right." |
| Legit | Call back | any t | `verified` | 100 for L04, 90 otherwise | "Calling back on a number you trust is always safe." |
| Legit | Hang Up | any t | `missed` | 20 | "That one was real. They didn't ask you for anything." |

- **Right calls** are `sharp`, `late`, `jumpy`, `verified` (scam) and `stayed`, `verified` (legit). Right calls trigger a cheer; the full shatter plays only on `sharp` and `verified` (see F9).
- **Judgement rate (30 days)** = (sharp + late + verified + stayed) ÷ calls. `jumpy` counts as half.
- **Anti-gaming check.** A unit test simulates "always hang up at 0.5 s" over 1,000 seeded days. Its judgement rate must be ≤ 0.65. A thoughtful policy (hang up after the first flag, stay on calls with no flag) must reach ≥ 0.95.

### 7.3 Daily scheduler

- The seed is `hash(profileId, localDate)`, so selection is deterministic per device per day and testable.
- **Mix.** P(legit) = 0.40, with run limits of no more than 3 scams or 2 legitimate calls in a row. Over any 30 days, 35–45% are legitimate.
- **Scam template weights** = coach-enabled category (0 or 1) × spaced-repetition boost (×3 if any tactic of the template is due) × novelty (×0.2 if played in the last 5 days).
- **Family calls.** If the coach sent family calls, at most one per 7 days is scheduled, on a seeded day.
- The variant (vars and branch defaults) is picked from the seeded RNG.

### 7.4 Spaced repetition of missed tactics

- Each tactic has a Leitner box (1–5) with review intervals of 1, 2, 4, 8 and 16 days.
- `caught` or `late` on a scam resets every tactic stamped **before tAsk** in that call to box 1.
- `sharp` or `verified` promotes those tactics by one box.
- A tactic is due when `today ≥ lastSeen + interval[box]`.

### 7.5 Streak

- The streak counts consecutive local days with a completed **scored** daily call, whatever the outcome. Practice beats perfection, so a miss never breaks the streak.
- **One automatic rest day per calendar week (Mon–Sun)** keeps the streak alive. This is gentler than the defence's "a miss costs the streak". picks.json only says a hang-up on a legitimate call "is a miss", so this choice does not conflict with it.
- The day boundary is local midnight.

---

## 8. Non-goals (v0.1)

- **Real telephony.** No real phone calls, numbers, SMS, carrier integration or caller-ID blocking. The app never rings the device's dialler.
- **Real calls.** No listening to, recording or analysing the player's real calls.
- **AI.** No cloud AI, no LLM, no voice cloning, and no chat with a simulated scammer. The "AI" here is local TTS only.
- **Server features.** No accounts, server leaderboards or live family dashboards, and no push server.
- **Languages.** English only in v0.1. The 15 address terms in other languages are the only exception.
- **Native apps.** No native iOS or Android apps.
- **Family authoring.** No free-form YAML authoring by families. Family calls use a guided form.
- **Monitoring.** No elder "monitoring" or surveillance of the player. The coach only sees what the player chooses to send.

---

## 9. Data model

All persistent data lives in **IndexedDB** (database `huc`, version 1) on the device where it was created. Types are TypeScript. Validation uses zod at every boundary: IndexedDB reads, URL payloads and scenario JSON.

```ts
// ── Content (build-time, shipped as static JSON) ─────────────────────────────
type Tactic = 'urgency'|'authority'|'fear'|'secrecy'|'unusual-payment'|'code-request'
            |'remote-access'|'personal-info'|'too-good'|'isolation';
type Kind = 'scam'|'legit';

interface ScenarioTemplate {
  id: string;                    // 'S01-bank-code'
  kind: Kind;
  category: string;              // 'business-impersonation.bank'
  sources: SourceRef[];          // ≥1, e.g. { key: 'FTC-OA-2025', page: 24 }
  caller: { display: string; number: string; voice: VoiceId; bed: AmbienceId };
  vars: Record<string, string[]>;
  lines: Line[];                 // graph: lines + reply branches
  callback: { label: string; trustedSource: string; ivr: LineRef[] };
  advice: string;                // one plain sentence, ≤ 140 chars
}
interface Line {
  id: string; say: string;       // may contain {var}
  tactics?: Tactic[]; flag?: boolean; ask?: boolean; cueAt?: number; // 0..1
  pauseAfterMs?: number;
  replies?: { label: string; goto: string }[];   // ≤ 2 chips, ≥ 56px each
  next?: string;                 // default: following line
}
interface AudioManifest {        // generated by scripts/build-scenarios.ts
  version: string;
  clips: Record<ClipKey, { opus: string; aac: string; durationMs: number; sha: string }>;
}

// ── Player state (IndexedDB stores) ──────────────────────────────────────────
interface Profile {              // store 'profile', key 'me'
  id: string;                    // random UUID, device-local, never sent
  playerName?: string;           // shown on cards the player sends
  addressTerm: string;           // 'Paati'
  coachName?: string;            // 'Arjun'
  enabledCategories: string[];
  legitRate: number;             // default 0.4 (0.3–0.5 allowed)
  createdAt: string;
}
interface Attempt {              // store 'attempts', key autoincrement, index by localDate
  localDate: string;             // '2026-10-20'
  scored: boolean;               // daily = true, practice = false
  scenarioId: string; variantKey: string; kind: Kind;
  path: string[];                // line ids played
  action: 'hangup'|'callback'|'none';
  tActionMs?: number; tFlagMs?: number; tAskMs?: number; tEndMs: number;
  outcome: 'sharp'|'late'|'jumpy'|'caught'|'verified'|'stayed'|'missed';
  points: number;
  tacticsBeforeAsk: Tactic[];
}
interface TacticBox { tactic: Tactic; box: 1|2|3|4|5; lastSeen: string }     // store 'tactics'
interface Cheer { id: string; from: string; mime: string; audio: Blob; receivedAt: string; text?: string } // store 'cheers'
interface FamilyCall { id: string; from: string; template: ScenarioTemplate; receivedAt: string }          // store 'familyCalls'
interface ReceivedResult { id: string; payload: ResultCardV1; receivedAt: string }                         // store 'inbox' (coach device)
interface Settings { theme: 'system'|'light'|'dark'; textSize: 'standard'|'larger'; captions: boolean;
                     vibrate: boolean; sound: boolean; reminderTime?: string; audioFormat?: 'opus'|'aac' }

// ── Link payloads (URL fragment, base64url(deflate-raw(JSON))) ───────────────
interface JoinLinkV1    { v: 1; t: 'join';   coach: string; address: string; player?: string;
                          cats: string[]; legitRate?: number }                  // ≤ 1,000 chars, QR-able
interface CheerLinkV1   { v: 1; t: 'cheer';  from: string; mime: string; b64: string; text?: string } // ≤ 2.5 s audio
interface FamilyLinkV1  { v: 1; t: 'family'; from: string; call: FamilyCallDraft }
interface ResultCardV1  { v: 1; t: 'result'; name: string; date: string; title: string; kind: Kind;
                          outcome: Attempt['outcome']; tAction?: number; tAsk?: number;
                          streak: number; rate30?: number }
```

Link formats are **versioned forever**. Fixtures of every `v1` payload are kept in `tests/fixtures/links/`, and decoding them must keep working in every future release.

---

## 10. Privacy model and network policy

### 10.1 What is stored where

| Data | Where | Leaves the device? | Deleted by |
|---|---|---|---|
| Profile, settings, attempts, streak, tactic boxes | IndexedDB on the player's device | **Never**, except the fields the player chooses to put in a result card | Settings → "Delete everything on this device", or clearing site data |
| Cheer audio | Recorded on the coach's device, then carried inside the cheer link, then stored in IndexedDB on the player's device | Only inside the link **the coach** chooses to send | The player can remove each cheer, or use "Delete everything" |
| Family calls | Written on the coach's device, carried in the family-call link, stored on the player's device | Only inside the link the coach sends | Same as cheers |
| Received result cards | IndexedDB on the coach's device (Coach inbox) | Never | Coach inbox → Remove / Delete all |
| Microphone | Used only on the Coach Setup "Record cheer" step, after a tap and the browser permission prompt. A visible recording indicator and a ≤ 2.5 s hard stop. | Only inside the cheer link the coach sends | Not stored on the coach's device after the link is made |
| Scenario audio and JSON | The app's own static files, cached by the service worker | n/a (public content) | Clearing site data |

Personal data is never written to `localStorage`, logs, the console, error reports or analytics. There are no analytics. The theme is the one exception: it is mirrored to `localStorage` only so the pre-paint script can avoid a flash.

### 10.2 Network policy

- **No backend. No telemetry. No third-party requests.** The app is static files on any static host (GitHub Pages, Netlify, or self-host).
- **Allowed requests, all same-origin:**
  - the app shell, JS and CSS
  - `/audio/*.webm|m4a` and the audio manifest
  - `/scenarios/*.json`
  - the optional Kitten voice pack (`/voices/kitten/*`), fetched only when a family call needs it and the player has tapped "Download the better voice (≈ 25 MB)"
- **Never:**
  - fonts from a CDN (they are self-hosted via Fontsource)
  - analytics
  - error reporting
  - cloud TTS. Web Speech is restricted to `localService` voices, because some browsers' network voices send the text to a vendor.
- **Content Security Policy** (meta tag, enforced by an e2e test that asserts no off-origin requests):
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`
- **Links** carry their payload in the URL **fragment**, which browsers never send to the server. Payloads are untrusted input:
  - zod-validated
  - capped in size (join ≤ 2 KB, family ≤ 6 KB, cheer ≤ 8 KB, result ≤ 1 KB)
  - rendered only as text (React; never `innerHTML`)
  - audio MIME types are allow-listed (`audio/webm;codecs=opus`, `audio/mp4`, `audio/ogg`)
  - phone numbers and URLs in family-call text are never made clickable
- **Spoofing.** A "family call" link could be crafted by anyone. The worst case is misleading practice content, because the app cannot place calls or move money. Family calls are always badged "Written by {from}", and their advice text is marked as family-written.

---

## 11. Platform matrix

| Platform | Install | Audio | Vibrate on ring | Mic (coach cheer) | Notes |
|---|---|---|---|---|---|
| Android Chrome 120+ | Install prompt (shown inline after the 2nd session) | Opus/WebM | Yes (`navigator.vibrate`, ring pattern) | MediaRecorder: Opus/WebM | Primary target. Periodic Background Sync is best-effort. |
| iOS / iPadOS Safari 17+ | Share → Add to Home Screen (illustrated in-app guide) | Opus/WebM; AAC/M4A fallback if `canPlayType` fails | No (API absent); the ring is visual and audio only | MediaRecorder: AAC/MP4 | Audio unlock happens on the Answer tap. No web push without install, and we don't use push. |
| Desktop Chrome / Edge 120+ | Install icon / WCO | Opus | n/a | Opus/WebM | Keyboard shortcuts (DESIGN.md → Components → Keyboard). Coach setup is often done here. |
| Desktop Firefox 120+ | No install (runs in a tab, offline via SW) | Opus | n/a | Opus/Ogg or WebM | |
| Desktop Safari 17+ | Add to Dock | Opus/WebM; AAC fallback | n/a | AAC/MP4 | |
| Firefox Android | Install | Opus | Yes | Opus | |

**Cross-device cheer playback.** The cheer is recorded in whatever container the coach's browser produces and plays on the player's browser. If the player's browser cannot decode it (`decodeAudioData` rejects), the cheer is shown as text from the coach ("Arjun says: Nice one, Paati!"). AC-F8-6 covers this.

---

## 12. Acceptance criteria (testable)

Test levels: **U** = Vitest unit, **E** = Playwright e2e (Chromium plus WebKit where marked), **A** = axe and custom accessibility checks, **M** = manual check recorded in HANDOFF.md.

### F1: Incoming-call screen
- **AC-F1-1 (E)** Tapping "Take today's call" shows the incoming screen with the fictional caller display name, a `555-01xx` number in mono, and "Practice call" labelling.
- **AC-F1-2 (E)** The ringtone (synthesized in Web Audio, no file) plays when sound is on. On Android Chromium, `navigator.vibrate` is called with the ring pattern once per ring cycle, only if Settings → Vibrate is on. Ringing stops after 20 s and the screen keeps waiting.
- **AC-F1-3 (E)** The call can be answered by (a) dragging the slider ≥ 80% of the track, (b) tapping the "Answer" button, or (c) pressing Enter or Space on desktop. All three start audio within 300 ms of the gesture.
- **AC-F1-4 (A)** Every control is ≥ 56 × 56 px. The Answer control is 96 px. Text contrast on the incoming screen is ≥ 7:1 (AAA).

### F2: In-call screen
- **AC-F2-1 (E)** Captions show the current line within 100 ms of its audio start. The last 2 lines are visible at 26px. The captions toggle persists.
- **AC-F2-2 (E)** "Hang Up" (96 px circle) ends the audio within 50 ms (gain ramp ≤ 30 ms) and records `tActionMs` from answer to within ±50 ms.
- **AC-F2-3 (E)** The second button shows the template's `callback.label`. For S01, S02, S06 and L04 it reads exactly "Hang up and call the number on my card". Pressing it ends the call and opens the Call-back screen.
- **AC-F2-4 (E)** Reply chips appear only at lines with `replies`, at most 2, and choosing one follows the branch. Without a choice, the call continues on the default path after the line's pause.
- **AC-F2-5 (A)** Text contrast is AAA (≥ 7:1 below 24px, ≥ 4.5:1 at 24px+). Hang Up is labelled by both an icon and the text "Hang up". No information is conveyed by colour alone.
- **AC-F2-6 (E)** The call timer shows `m:ss` in the mono face with tabular figures and does not shift layout as it ticks (CLS = 0).

### F3: Scripts and variants
- **AC-F3-1 (U)** Every YAML file in `scenarios/` validates against the zod schema. A broken file fails `pnpm scenarios:check` with a file:line message.
- **AC-F3-2 (U)** Every scam template has exactly one `ask` line and at least one `flag` line before it. Every legitimate template has no `ask`.
- **AC-F3-3 (U)** Every template has ≥ 1 `sources` entry whose key exists in `scenarios/SOURCES.md`.
- **AC-F3-4 (U)** Expansion yields ≥ 12 variants per template and ≥ 300 in total. `pnpm scenarios:stats` prints the counts.
- **AC-F3-5 (U)** `check-names` finds zero deny-list hits across `scenarios/`, `src/`, `site/` and `public/`. Every phone number matches `^\(\d{3}\) 555-01\d{2}$`. The only exception is source citations (the FTC and FBI IC3 report titles in `scenarios/SOURCES.md` and the citation component). These are allow-listed by exact string in `scripts/deny-list/allow-citations.txt` and may never appear as a caller or organisation.
- **AC-F3-6 (U)** The library has exactly 20 templates: 12 scam and 8 legitimate.

### F4: Scoring
- **AC-F4-1 (U)** The outcome table in §7.2 is implemented exactly. Golden fixtures cover every row, including boundaries at tFlag and tAsk, the 10 s late window, call back before the flag, and hang-up on a legitimate call at 0 s.
- **AC-F4-2 (U)** The anti-gaming simulation holds: "always hang up at 0.5 s" over 1,000 seeded days scores a judgement rate ≤ 0.65, and the thoughtful policy scores ≥ 0.95.
- **AC-F4-3 (U)** tFlag, tAsk and tEnd are computed from manifest clip durations plus pauses along the actual branch path. They are deterministic for a given variant and path.

### F5: Audio pipeline
- **AC-F5-1 (U/CI)** `pnpm audio:check` verifies that every clip referenced by the expanded library exists in both formats, with a manifest `sha` equal to `hash(text, voice, engine, filterVersion)`. CI fails on stale or missing clips. CI does not need a TTS engine.
- **AC-F5-2 (M/U)** `pnpm audio:render` renders with the first available engine (Piper, then Kitten, then SAPI), applies the documented ffmpeg chain, and writes Opus (16 kbps mono) and AAC (24 kbps mono, 16 kHz). The total Opus library is ≤ 4 MB and no single call path is over 160 KB.
- **AC-F5-3 (U)** The spectral check passes: a rendered test tone sweep shows ≥ 20 dB attenuation below 200 Hz and above 4 kHz, using an ffmpeg `astats`/`showspectrum` script on a fixture.
- **AC-F5-4 (E)** When a clip fetch or decode fails, that line falls back to Web Speech using only `localService` voices. If none exist, the call continues as captions-only with a banner: "Read-along call: your phone has no built-in voice."
- **AC-F5-5 (E)** A family call plays through Kitten TTS when the voice pack is installed, and through Web Speech otherwise. No request ever leaves the origin.

### F6: Red-flag replay and call-back
- **AC-F6-1 (E)** After any call, "See what gave it away" opens a transcript timeline. Each line shows its start second (`0:06`) and its tactic stamps (icon + plain label). The ASK line is marked "Their ask". The player's action is drawn at its exact second.
- **AC-F6-2 (E)** The replay shows the template's one-sentence `advice` (≤ 140 chars) and a "Why this matters" link to the source citation (§5.1).
- **AC-F6-3 (E)** Each transcript line has a "Play this line" control (≥ 56 px) that plays just that clip.
- **AC-F6-4 (E)** The Call-back screen shows the trusted number (mono, grouped) and plays the fictional organisation's real-line IVR. For a scam it says the call was not from them. For L04 it confirms the alert.

### F7: Daily card, streak, spaced repetition
- **AC-F7-1 (E)** On a given local date, the first completed call is scored. After that, the Today card reads "Done for today", and "Practice another call" plays only unscored calls.
- **AC-F7-2 (U)** Over any 30 seeded days, the scheduler gives 35–45% legitimate calls and never more than 3 scams or 2 legitimate calls in a row.
- **AC-F7-3 (U)** The streak follows §7.5, with fixtures for: a rest day used once per week, a second missed day breaking the streak, DST transitions, and a timezone change between days.
- **AC-F7-4 (U)** A `caught` call resets its pre-ask tactics to box 1. The next 3 scam selections are weighted toward templates using those tactics, with a measured ≥ 2× selection rate in a seeded simulation.
- **AC-F7-5 (E)** The streak calendar shows the current month. Each day has a text label and an icon (done, rest day, missed, today, future), never colour alone.

### F8: Family links and the coach loop
- **AC-F8-1 (E)** Coach Setup produces a join link ≤ 1,000 characters and a QR code (rendered locally) that, when opened on a fresh profile, sets the address term, coach name and enabled categories, then greets the player: "Arjun set this up for you."
- **AC-F8-2 (E)** Recording a cheer stops automatically at 2.5 s. The cheer link is ≤ 8 KB. Opening it on the player device stores the cheer, and the cheer plays in the next signature moment.
- **AC-F8-3 (E)** The family-call builder (guided form: caller name, opener, a "flag" line, an "ask" line, a scam/real toggle, and advice) produces a family-call link. It is scheduled within 7 days and plays through runtime TTS.
- **AC-F8-4 (E)** "Send to family" after a call opens `navigator.share` with text plus a result-card URL, or copies it with an inline "Copied" morph when share is unavailable. The URL decodes to a card showing the name, outcome and seconds.
- **AC-F8-5 (E)** Opening a result link on the coach device shows the card and "Save to Coach inbox". The inbox lists saved cards newest first, with the streak.
- **AC-F8-6 (E)** A cheer the player's browser cannot decode falls back to the text "Arjun says: …" without an error dialog.
- **AC-F8-7 (U)** Every v1 link fixture still decodes. Oversized or malformed payloads are rejected with a friendly screen ("This link is damaged. Ask Arjun to send it again."), never a crash.

### F9: Signature moment
- **AC-F9-1 (E)** On a `sharp` or `verified` outcome, the sequence in DESIGN.md §Signature runs: shards begin ≤ 40 ms after the press, confetti stays ≤ 60 particles, the timeline draws and the headline reads "Hung up at m:ss. The scammer needed m:ss." The full sequence takes ≤ 2.0 s, and any tap jumps to the end state.
- **AC-F9-2 (E)** Under `prefers-reduced-motion: reduce` there are no shards and no confetti, only a 150 ms crossfade to the same end state.
- **AC-F9-3 (E)** If a cheer exists, it starts at +1.6 s with a caption bubble. If not, no audio plays and the bubble does not appear.
- **AC-F9-4 (M)** A frame strip of ≥ 10 frames is captured for design QA (bible §9.1).

### F10: PWA and offline
- **AC-F10-1 (E)** After first load and SW activation, `context.setOffline(true)` → reload → take today's call → result. Everything works, including audio.
- **AC-F10-2 (E)** The manifest is valid and installable: Lighthouse PWA installability passes, icons are 192/512/maskable/monochrome, the theme colour follows the scheme, and `id` and `scope` are set.
- **AC-F10-3 (E)** The offline banner is persistent while offline. Network errors never show toast spam.
- **AC-F10-4 (E)** A new SW version shows an inline "Update ready: Restart" prompt, never an auto-reload mid-call.
- **AC-F10-5 (U)** The `.ics` generator emits a valid RFC 5545 VEVENT with `RRULE:FREQ=DAILY`, the chosen local time, and the app URL. It is checked against a fixture.
- **AC-F10-6 (E)** No request leaves the origin in any e2e run, asserted by a `page.on('request')` guard.

### Cross-cutting
- **AC-X-1 (A)** axe reports zero serious or critical violations on every screen, in light and dark, at 375, 768 and 1440 px.
- **AC-X-2 (A)** No text below 18px anywhere, and body copy is ≥ 20px. This is checked by a computed-style scan in e2e.
- **AC-X-3 (E)** Every interactive element is reachable by keyboard and has a visible focus ring.
- **AC-X-4** Performance: the first-route JS is ≤ 170 KB gz, LCP ≤ 2.0 s on mid-tier mobile, CLS 0, INP ≤ 200 ms (bible §8.2).

---

## 13. Ten-second demo script (shot by shot)

This is for the README hero GIF and the LinkedIn video. It must work **muted**, because LinkedIn autoplays without sound. Every spoken line therefore appears as an in-product caption.

It is captured deterministically from the real app in demo mode: `?demo=signature&seed=7` loads the S01 variant "First Meridian Bank Fraud Dept" and a demo cheer, with Playwright stepping a fake clock. Viewport 390 × 844 at DPR 2, in a plain device frame on the stone background.

| # | Time | Shot | On screen | Audio (if unmuted) |
|---|---|---|---|---|
| 1 | 0.0–1.0 s | Incoming call, static framing | Dark call screen: "First Meridian Bank Fraud Dept", "(614) 555-0148" in mono, a ring pulse around the green Answer control, and the small label "Practice call" | Synth ringtone |
| 2 | 1.0–1.4 s | A thumb taps the green Answer button | Controls switch to the in-call layout. The timer starts at 0:00. | Line click, faint call-centre murmur |
| 3 | 1.4–4.2 s | Captions roll (26px) | "Hello, this is Dana from First Meridian Bank's fraud department." | Band-passed voice |
| 4 | 4.2–7.0 s | Caption 2. The timer passes 0:05. | "Your account has been compromised, and we need to act quickly." | Voice |
| 5 | 7.0 s | The thumb slams the red **Hang up** button. The timer reads 0:06. | Button press (scale .95) | Line cut |
| 6 | 7.0–7.8 s | **Shatter.** The dark call screen splits into shards that fall away, and ≤ 60 moss-and-stone confetti pieces burst from the button. | The stone result screen is revealed underneath | (none) |
| 7 | 7.3–8.4 s | Headline and timeline | "Hung up at 0:06." The timeline draws left to right. The red ASK marker at 0:40 is labelled "Their ask: 'I'll need the code we just texted you'". A moss marker drops at 0:06. | (none) |
| 8 | 8.1–8.6 s | Subline | "The scammer needed 0:40." | (none) |
| 9 | 8.6–9.6 s | Cheer bubble | "Arjun: Nice one, Paati!" with a static waveform | The grandson's recorded voice |
| 10 | 9.6–10.0 s | End frame (hold) | Result screen with "See what gave it away" and "Send to family". A thin caption under the frame reads "Hang Up Club: one practice call a day. Some are real." | (none) |

Two notes on the script:

- **The ASK line.** The signature moment's line "I'll need the code we just texted you" is shown as the ASK marker's label at 0:40. She hung up at the first red flag, 34 seconds before the scammer got there. That gap is the point of the score.
- **Tooling.** Capture uses the studio pre-render kit (`_studio/inspo/3d/prerender-kit/capture.mjs`), adapted to a DOM screenshot loop (§6.2 of 3D_INSPIRATION: screenshot the wrapper element). Encoding uses the tested ffmpeg commands: GIF ≤ 3 MB at 800 px, MP4 1:1 and 4:5 for LinkedIn.

---

## 14. Risks (from picks.json, with mitigations)

| Risk (picks.json) | Mitigation in this spec |
|---|---|
| A PWA cannot ring like a real call, and iOS push needs the app on the home screen first, so the habit depends on family nudges | §3: four stacked triggers. §4.1: the coach loop is first-class, with fresh cheer and family-call links. |
| Content-authoring load (decoys plus red-flag tagging) | YAML templates with variables (§5.2). The CI schema checks every flag and ask (AC-F3-2). Family calls add content over time. The template budget is fixed at 20. |
| The demo depends on audio, and LinkedIn autoplays muted, so it needs captions | Captions are built into the product (F2) and the demo script is caption-led (§13) |
| Some viewers may find gamifying older adults patronising | No points shown in big type. No cartoon mascots, badges or leaderboards. Copy is adult and plain. A miss is never mocked. The streak forgives rest days. The headline is a fact ("Hung up at 0:06"), not a cheer. The only cheer is a real family member's voice. |
| Never use real bank names | §4.5a: fictional-name lint, the 555-01xx rule, and a pre-launch FDIC/NCUA check |
| (Studio) Kitten TTS in the browser: licensing (espeak-ng phonemizer is GPL-3.0) and size (≈ 25 MB) | ADR §4.4 spike. If it fails, family calls ship on Web Speech `localService` voices only, and HANDOFF says so. |
| (Studio) Cross-browser cheer playback (WebM/Opus vs MP4/AAC) | AC-F8-6 text fallback. Coach setup records in `audio/mp4` when the browser supports it, because MP4 plays almost everywhere. |
