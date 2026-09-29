# Visible events and player control

The table waits for the player. Every application game uses guided resolution,
including resumed older saves, classic solo, 1–3 hero hot-seat games, normal quests,
campaign chapters, and retries.

## Playing

- Encounter cards appear with their complete scan and printed encounter text
  before their effects. Continue reaches cancellation choices or resolves the
  card, with its resulting changes shown in the next review.
- A shadow is revealed before its response/effect. Attack modifiers and damage
  have their own reviews. Combat results state attack, defense, and damage.
- Reviews list resource, threat, damage, progress, readiness, phase, and seat
  changes. New hand cards are labelled with their recipient. Public cards can be
  opened at full size, including from an earlier event.
- Continue is explicit: the Continue button or a single press of Enter or
  Space while the review is open. There is no autoplay, timer, or automatic
  dismissal. Focus moves to the new event heading and repeated (held) key
  events are ignored, so a held key cannot consume later events. Escape does
  not advance the game and the second click of a double click is ignored.
- Table preferences choose how often the table waits. *Every event* is the
  original behavior. *Hidden information & losses* (default for new players)
  pauses for revealed encounters, shadows, setup, the start of a round, quest
  results, enemy attacks, encounter-driven effects and any loss, while the
  player's own plays are recorded and shown as a brief notice. *Decisions
  only* never pauses for information. The mode is stored with the game
  (`flow.mode`), applied to restored saves from the preference, and changed
  through the `SET_REVIEW_MODE` action. Complete-game simulations produce the
  same rules state in every mode.
- Inspect table closes only the review view. The rules queue remains paused;
  cards and hero seats can be inspected. Review current event reopens it. N also
  reopens the review without confirming it. Gameplay actions remain disabled.
- The chronicle keeps the last 80 event reviews, plus the existing bounded rules
  log. Autosave, reload, and exported games preserve the exact pending step and
  its event history.

These pauses do not add rules action windows or change existing response timing.
An effect may change several items in one review; round resources and cards are
summarized together. Supported rules and timing boundaries are in
[COVERAGE.md](COVERAGE.md).

## Implementation

`src/game/presentation.ts` observes public rules state before and after effects.
It records public card identities and changed values only; deck order and
unrevealed shadow identities do not enter the review or public text state.
`src/ui/resolution.tsx` presents these snapshots with an anchored Continue footer
and a separately scrollable body.

An optional serializable `flow` field extends schema version two. Its independent
event IDs do not consume game IDs or randomness. `CONTINUE` must match the exact
pending step ID. The effect queue stops at a pending review; an invalid or stale
confirmation cannot advance it. Encounter and shadow previews precede their
resolution effects. Terminal reviews are acknowledged before the outcome dialog.

The application enables guided resolution for every game and enables it on
compatible older saves. Headless engine callers can omit `guided: true` for an
unpaced rules run. This supports deterministic parity checks without offering an
autoplay switch in the interface.

## Verification

Focused engine tests cover queue blocking, reveal ordering, cancellation, shadow
modifiers, damage, automatic engagement order, quest and terminal reviews, pending
save restoration, malformed presentation data, and hidden shadows. Seventy-two
pairs of complete guided and unpaced games produce identical final rules states.
Thirty-six multi-seat simulations also exercise guided resolution.

`npm run test:pacing` checks real UI confirmations, inspection without continuation,
exact pending-state reload, drawn-card ownership, event history, input guards, and
1280×720, 1440×900, 1920×1080, and 2560×1440 layouts. Older rules interaction suites
use a clearly scoped helper to acknowledge reviews; the pacing suite does not.
The work remains focused on desktop.
