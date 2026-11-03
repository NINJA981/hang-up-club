# LinkedIn launch kit

Everything here traces to the code or a test in this repo. Check the two bracketed items before posting.

## Post (about 1,150 characters)

> Only use the first line if it is true for you. If not, start at "Most of us".

```text
My grandmother has never practised saying no to a scammer. So I built her a gym: one fake scam call a day, and her score is how fast she hangs up. Some calls are real, though, so she can't just hang up on everything.

Most of us learn about phone scams from a leaflet. Then the phone rings, a calm voice says "your account has been compromised", and the leaflet is not there.

Hang Up Club is a free, open-source practice app for older adults:
- One realistic practice call a day. About 40% are real calls (the pharmacy, the dentist), so the skill is judgement, not reflex.
- After you hang up, it shows where you cut the line and when the scammer would have asked: "Hung up at 0:13. The scammer needed 0:29."
- A grandchild sets it up by link and sends a recorded "Nice one!" No account, no server: everything stays on the phone.

In a 1,000-day simulation, hanging up on every call scores a judgement rate of about 30%. Listening for the first warning sign scores at least 95%.

It is practice, not protection, and it has only been tested in Chrome so far. The voices are basic text-to-speech.

Source and how to install it: [repo link]

#ScamAwareness #OpenSource #Accessibility
```

## Attachments

Use the social preview as the image, or the four phone screenshots as a carousel, in this order.

| File | Alt text |
|---|---|
| `social-preview.png` (1280 x 640) | Hang Up Club, a flight simulator for phone scams. Two phone screens: an incoming practice call from "First Wrenfield Bank Fraud Dept", and the result after hanging up: "Hung up at 0:13. The scammer needed 0:29." |
| `screen-1-incoming.png` | A dark incoming-call screen labelled "Practice call": First Wrenfield Bank Fraud Dept, (614) 555-0148, a large green Answer button with "Slide to answer", and "Not now". |
| `screen-2-in-call.png` | The call in progress at 0:12. Captions read "Your account has been compromised, and we need to act quickly." Below, a large red Hang up button and "Hang up and call the number on my card". |
| `screen-3-result.png` | The result: "Hung up at 0:13. The scammer needed 0:29." A cheer from Arjun, "Nice one, Paati!", and a timeline showing the hang-up well before the scammer's ask. |
| `screen-4-replay.png` | The replay: each line of the call with its time and a warning-sign stamp such as "They're rushing you", the ask marked "Their ask", and one sentence of advice. |

## Facts behind each claim

| Claim | Source |
|---|---|
| About 40% of calls are real | `src/domain/schedule/daily.ts` (P = 0.40), `tests/unit/schedule.test.ts` (35 to 45% over any 30 days) |
| "Hung up at 0:13. The scammer needed 0:29." | The S01 demo call (`?demo=signature&seed=7`), hung up just after the first warning; `docs/launch/screen-3-result.png` |
| 30% and 95% judgement rates | `tests/unit/scoring.test.ts`, anti-gaming simulation over 1,000 seeded days |
| No account, no server, nothing leaves the phone | Every e2e test fails on an off-origin request (`tests/e2e/fixtures.ts`); CSP `connect-src 'self'` |
| Tested in Chrome only; basic voices | `HANDOFF.md` and README "Limitations" |

## Before posting

- Replace `[repo link]` with the public repository URL, and decide where the app is hosted (see README "Development").
- Upload `social-preview.png` in the repository's Settings, Social preview.
- The first line is written in the first person. Keep it only if it is your story.
