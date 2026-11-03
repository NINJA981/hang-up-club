## What changes for the player or the coach

<!-- One or two sentences. Add light and dark screenshots for anything visible. -->

## How it was checked

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check`
- [ ] `pnpm exec playwright test --workers=1` (or the specs this touches)
- [ ] New or changed scenarios: names recorded in `scenarios/NAMES-REVIEW.md`, audio rendered or flagged as not rendered
- [ ] No request leaves the origin, no `console.log`, no commented-out code
