# Hang Up Club: landing page (`site/`)

A static Vite page, no framework, no third-party requests. Its own package, separate from the app at the repo root.

## Run it

```sh
cd site
pnpm install
pnpm dev              # http://localhost:5180
pnpm build            # tsc + vite build + budget gate (scripts/check-budget.mjs)
pnpm preview          # http://localhost:47213 (the production build)
pnpm verify           # 37 end-to-end checks in Chromium (needs: pnpm exec playwright install chromium)
pnpm og               # re-render public/og.jpg from the real result screen (needs a build first)
pnpm contours         # regenerate public/contours.svg (seeded, d3-contour)
```

Tests that live at the repo root (they need the root install): `tests/unit/site-parity.test.ts` holds `src/call/logic.ts` and `src/demo/scenarios.json` to the app's own timeline, scoring and result copy (run with the root `pnpm test`), and `tests/site/smoke.spec.ts` is the Playwright smoke test of the production build (the `site` project in the root `playwright.config.ts`). Formatting is checked by the root `pnpm lint` (Prettier covers `site/`; ESLint does not).

Build-time configuration (none is a secret):

| Variable | Default | Meaning |
|---|---|---|
| `SITE_APP_URL` | `/app/` | Where "Open the app" and the QR code point. **Placeholder until the PWA has a URL.** |
| `SITE_REPO_URL` | unset | The GitHub repository. Unset: the code call to action falls back to the in-page "Run it from source". |
| `SITE_URL` | unset | Absolute origin of this site. Needed for `og:image` and the canonical link to be absolute. |

## What is on the page

Hero (the real call screen runs a muted, captioned loop; "Try the call" makes it playable; "Sound" lazy-loads 87 KB of Opus or 91 KB of AAC clips), the signature moment drawn as a timeline from the same data as the app, three proofs, the privacy diagram and "how it's made", the open-source call to action with a quickstart, the install band with a QR code, and the footer disclaimers.

`src/demo/scenarios.json` and `public/audio/demo/` are copied from the app's library by `scripts/sync-demo.mts` (reads the repo root, never writes to it), so the copy on the page cannot drift from the product.

## 3D decision

No WebGL. DESIGN.md Appendix B decided this on purpose: the sentence the page says is "a real-feeling call you can cut off, and some calls are real", and the real DOM call screen says it literally. So the 3D budget is 0 KB and the page has a single flat path (there is nothing to fall back from). `scripts/check-budget.mjs` fails the build if a WebGL or three.js reference or a second JS chunk appears. Reduced motion, no JS and dark scheme all have their own verified paths.

Deviation from Appendix B: the beat-2 and beat-3 "pre-rendered loops" are live HTML/CSS reproductions of the real UI (timeline, replay, coach setup) drawn from the app's data, not MP4/AVIF captures. `docs/screenshots/` was empty, and `scripts/capture-demo.mjs` needs the product UI, which was still being built. Swap them for captures when the UI ships if a recorded loop is wanted.

## Measured on 2026-10-27 (production build, Chromium)

| Check | Result |
|---|---|
| Initial JS | 9.1 KB gzip (budget 120). 3D chunk 0 KB |
| First load, no images | 77.7 KB transferred (html 10.4 + css 7.6 + js 9.1 + fonts 50.5 KB) |
| LCP element | The H1 (text) |
| Performance trace, mobile profile (390x844 at DPR 3, 4x CPU slowdown, Fast 4G, cache off) | **LCP 1.87 s** (budget 2.0), CLS 0.00. Before the `content-visibility` fix it was 3.5 s |
| Unthrottled | LCP 0.33 s, CLS 0.00006 (a 700 ms-late webfont also stays under 0.001) |
| Lighthouse (chrome-devtools MCP), mobile and desktop | Accessibility 100, Best Practices 100, SEO 100 |
| Lighthouse "Agentic Browsing" | 75. One audit fails: `ai-catalog.json` (ARD manifest). Not added: the spec was not checked and a guessed manifest would be noise. `llms.txt` and `robots.txt` are present |
| axe (WCAG 2.2 AA tags), light and dark | 0 violations |
| Widths 320, 375, 768, 1024, 1920 | no horizontal scroll, the call screen content fits |
| Off-origin requests | 0 (the two FBI/FTC citation links are plain `<a>`) |
| Tokens | all 49 DESIGN.md colours match, and no stylesheet but `tokens.css` holds a raw colour (`check-budget.mjs`) |

The Lighthouse tool in this setup reports Accessibility, Best Practices, SEO and agentic audits, and excludes Performance. Performance is the trace above, not a Lighthouse score.

## Known issues

- **"Open the app" goes to `/app/`**, a placeholder. Set `SITE_APP_URL` (and `SITE_URL` for an absolute OG image) at deploy.
- **No GitHub URL yet**, so there is no "View the code on GitHub" link; the page shows "Run it from source". Set `SITE_REPO_URL`. The star badge is intentionally absent.
- **Copy numbers come from the data.** The hero says "Hung up at 0:13. The scammer needed 0:29." because that is what the S01 script measures; LANDING.md's draft said 0:06 and 0:40. If the S01 script changes, `../node_modules/.bin/tsx scripts/sync-demo.mts` (from `site/`, needs the root install) plus a rebuild updates the page.
- **Never listened to.** The 87 KB of demo audio is the app's SAPI-rendered Opus/AAC (see the root HANDOFF.md). Voice quality is unreviewed.
- **iPhone/WebKit untested.** Only Chromium ran. The AAC clips and `audio/mp4` path are unexercised on Safari.
- **`content-visibility: auto`** skips layout for the sections below the hero. A full-page screenshot tool that does not scroll shows them blank; a real scroll, Ctrl+F and anchor links all work, and scrolling measured CLS 0 on desktop and phone.
- **Stats** are the two SPEC 5.1 figures, linked: $7.748 billion lost by people 60+ in 2025 (IC3 p.44, shown as $7.7 billion) and 40% of older adults' phone-call loss reports being business impersonation in 2024 (FTC p.26). The 40% is a share of loss reports, not of dollars.
- The fictional bank "First Meridian Bank" still needs the name check in `scenarios/NAMES-REVIEW.md` before launch.
- The `qa/` PNGs are the last verification screenshots (tier-0, reduced-motion, no-JS, dark, phone widths).
