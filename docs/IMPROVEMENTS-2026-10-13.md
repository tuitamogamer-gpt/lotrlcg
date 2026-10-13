# October 13 improvement round

This round improves the existing fifty-scenario game. It adds no adventure or card registrations and keeps the reference catalogue and recipes unchanged.

## Editing and recovery

Unfinished deck edits retain their cards, heroes, RingsDB provenance and warnings while navigating or reloading in the same tab. Working copies use tab-local session storage, so saving or cancelling in another tab cannot erase them. Save persists the deck shelf; the editor states that closing the tab ends an unsaved working copy. Hero portraits use the original image resolver, including JPEG scans.

Loading a damaged or unfamiliar deck shelf no longer rewrites it. Persistence rejects oversized/invalid lists instead of truncating them. A recovered adventure may retain an extra custom list in memory when the shelf already holds fifty; the fifty stored lists remain unchanged and the adventure save carries its original deck. Storage events refresh other tabs, while an optimistic raw-byte freshness guard rejects a stale shelf update. This guard is not an atomic cross-tab lock.

Recovery exports preserve original stored bytes, including unreadable formats. Import accepts ordinary adventure saves, older keyed backups and the new versioned backup. Every adventure is validated before any restoration; a two-mode backup asks which adventure to open and explicitly states that both matching saves will be replaced. Raw deck bytes are retained as backup context, never blindly written over the current shelf. The recovery export is available even without a playable adventure.

## Playing on desktop and mobile

Closed mobile navigation is removed from keyboard access, resizing back to desktop leaves navigation usable, and nested card inspectors restore focus to their opener or surviving parent dialog. Narrow combat layouts expose a legal defender immediately, preserve card text/art/options and keep the Continue control inside a 320 px viewport.

Hidden-event review now pauses on damage to friendly ship objectives and objective allies. Facedown Eagle attachments retain public count/ownership/bonus information without exposing their identity in the text projection. Hand cards requiring a target are marked playable only when an eligible target exists. Printed combat and quest rules are unchanged.

## Performance and validation

The GSAP moment timeline loads only when a moving significant moment needs it. Late or failed decoration loads cannot dispatch game actions or hold the outcome open. A failed image is scoped to its source so the next revealed card can load normally. Card rendering reuses statistics within each render; coaching uses the current immutable game snapshot. Ambient canvas dimensions change on resize rather than every frame, and running decorations subscribe to live system reduced-motion changes.

CI retains all thirty-three jobs. Preview startup uses a strict port, supervised readiness and the actual built module bytes. Invalid or empty hot-seat selectors fail rather than producing a zero-game success. Browser evidence checks actual HTTP response bytes against the expected SHA when supplied; a caller-provided commit label remains distinct from provider attestation.

Run `npm run test:tooling` for short release guards, `npm run test:improvements` for the focused desktop/mobile round, and the existing full engine/simulation/browser groups for library-wide regressions. Independent review and current browser evidence are kept under `output/improvement-round-20261013/`.
