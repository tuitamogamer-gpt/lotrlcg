# Original Ered Mithrin finale

The final two original Adventure Packs, **Mount Gundabad** and **The Fate of
Wilderland**, are selectable in standard/easy mode for classic solo and one to
four local hot-seat players. They complete the original six-pack cycle.
All twenty original player designs are available, including Tactics Bilbo
Baggins and hero Radagast. Nineteen definitions are new; Armor of Erebor reuses
its existing complete passive implementation.

Detailed rules are recorded for [Mount Gundabad](MOUNT-GUNDABAD-RULES.md),
[Wilderland](FATE-WILDERLAND-RULES.md) and [the player cards](ERED-FINAL-PLAYER-SCRIPTS.md).

## Printed rules and physical cards

[The source review](ERED-MITHRIN-FINALE-SOURCES.md) records the immutable input
hashes, original inserts and scans, quantity corrections and applicable designer
rulings. The runtime preserves all 71 scenario face entries and twenty original
player scans locally. Reprinted player errata are distinguished from original
scan text; no source catalog or preparation snapshot is rewritten.

Mount Gundabad tracks the physical quest deck, Caves deck, First Forge, captured
player cards and completed quests. Hidden stage 2A passages use a common printed
front in both the client and public-state projection, without exposing the
selected reverse through a card code or image filename. Explicit printed-card
reference browsing remains available. Deep, mandatory travel, quest-phase flips,
the printed quest effects and after-defeat attachment responses use saved engine
choices. Wormsbane keeps one physical identity when it is reforged and transferred;
losing its bearer loses the adventure. Dagnir's cap uses all quest cards in the
victory display, with explicit damage-source exceptions and the printed Great
Worm attack-response victory condition.

The Fate of Wilderland retains the physical Assault and Defense objectives,
Urdug and cards held by Lonely Lands. Assault thresholds depend on living players
and are checked at round end. Urdug's damage window opens only after a resolved
attack and his destruction wins from any main stage. Repeated conditional shadow
effects accumulate independently, and additional Warg attacks preserve the
printed shadow-discard timing. Capturing a resolving event changes its physical
destination without duplicating the event when its effect finishes.
Enemies considered engaged with each player receive a fresh physical shadow
for each actual attack, following the designer's published clarification.

Player scripts include Guarded entry and release, attachment restrictions,
Creature resource icons, saved multiplayer choices, discard-pile targets and
X payments. The Great Hunt pays from three different hero pools. Reforged uses
the applicable Item restriction, while Radagast receives the printed three
additional resource icons only when paying for a Creature ally. Printed response
windows, including Round Shield after a canceled shadow, survive reload.

## Significant-event audio

[Five Fish Audio announcements](FISH-AUDIO-CUES.md) accompany significant quest,
side-quest, hero-loss and game-end events. The generated MP3 files are served
locally. Preferences include persistent mute and volume controls, with browser
gesture unlock, a bounded playback queue and priority for the game outcome.
Reload, Undo, navigation and hidden tabs do not replay past events.

## Verification commands

- `npm run check` and `npm run build`
- `npm run test:engine`, including source pins, player and scenario semantics,
  save validation, account SQL migrations, audio and shared rules regressions
- `ERED_SIMULATION_SCENARIO=mount-gundabad npm run test:ered-simulation`
- `ERED_SIMULATION_SCENARIO=the-fate-of-wilderland npm run test:ered-simulation`
- `npm run test:browser-ered-finale`
- `npm run test:significant-audio`
- `npm run audit:rules`

Each dedicated scenario matrix has fourteen completed games: standard/easy,
one to four players, and exact two-player outcome/state comparisons for all
three event-review modes. It checks save restoration after every action,
physical card conservation, public privacy and pure rendering. Winning semantic
fixtures separately exercise the printed victory conditions; a completed seeded
game may be a loss.

The local release run passed **5,240 engine tests**. The final focused suites
passed **70 Gundabad**, **45 Wilderland**, **54 player/integration** and **8 audio
controller** tests. Both game matrices passed: **28 completed games, 3,074 actual
actions with exact save restoration, twelve review-mode comparisons, 1,287
physical-card observations and 3,334 public-privacy comparisons**. These seeded
policy games ended in losses; separate actual-attack fixtures verify both printed
victory conditions, including Urdug's defeat at all three stages. The exceptional
Lower Deeps multiple-active-location path and corrected Wormsbane reverse metadata
were verified by the final full Gundabad focused rerun after its seeded matrix.

The final player browser suite passed **72 checkpoints** at 1280/390/320 pixels,
with all twenty original face inspections and HTTP-byte/SHA-256 art checks.
Audio passed **36 browser checkpoints**, including fifteen native Web Audio
decodes/playbacks across the five cue types, mute/volume persistence, gesture
unlock, reload/Undo deduplication and page hiding. Both suites recorded zero
browser errors on the verified production-build entry.

The scenario browser suite passed **120 checkpoints** on that same entry:
48 actual hot-seat setups across both difficulties and all player counts, six
classic-solo openings, all 71 scenario face entries decoded at each width, and
actual hidden-passage, Caves, reforge, attack, victory and loss decisions with
reload. It recorded no browser errors or horizontal overflow.

The account choices migration adds these two scenario identifiers while retaining
the existing ownership policies. Hosted Supabase activation remains a separate
optional configuration; local guest play requires no account service.

The 22 October 2026 registration audit reports **694 player definitions (79
heroes), 1,044 encounter definitions and 72 scenario designs**. It resolves
**1,966 of 4,183 catalog identities** and **144 of 355 scenario recipes**;
**2,217 identities remain pending**. Registration counts and semantic/client
verification are distinct. Revised campaigns, Nightmare variants and subsequent
content retain their separate support status. The next chronological deluxe is
**A Shadow in the East**.
