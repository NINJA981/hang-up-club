# Security policy

## Reporting a problem

Please report security problems privately, through this repository's **Security** tab, "Report a
vulnerability" (GitHub private vulnerability reporting). Do not open a public issue for them.

Say what you found, how to reproduce it, and what an attacker could do with it. You will get a first reply
within 7 days. Fixes ship in the next release, and you are credited in the changelog unless you ask not to be.

## Supported versions

Only the latest release is supported. The app updates itself through its service worker after the player
taps "Restart" on the update prompt.

## What is in scope

Hang Up Club has no server, no accounts and no analytics. Everything a player does stays in the browser's
IndexedDB on their device. The parts most worth testing are:

- **Links.** Setup, cheer, family-call and result links carry their data in the URL fragment, which browsers do
  not send to a server. Every payload is untrusted input: it is validated with zod, size-capped, rendered only as
  text, and audio types are allow-listed (`src/domain/links/`). A crash, script injection or a payload that
  bypasses these checks is in scope.
- **Content Security Policy** (injected into `index.html` at build time) and the "no request leaves the
  origin" rule. Any request to another origin is a bug.
- **The service worker** (`src/sw.ts`) caching or serving the wrong content.

## Known limits (not vulnerabilities)

- Links are not signed. Anyone can make a family-call or result link that looks like it came from a family
  member. A family call is always labelled "Written by" the sender, the app cannot place calls or move money,
  and the result screen says a result link is not proof. A coach should only trust links from people they know.
- A join link replaces the player's setup after a confirmation screen; it never deletes calls, streak or cheers.
- The `frame-ancestors` CSP directive only works as an HTTP header, so whoever hosts the app should send
  `Content-Security-Policy: frame-ancestors 'none'`.
- Hang Up Club is practice. It does not screen, block or detect real calls.
