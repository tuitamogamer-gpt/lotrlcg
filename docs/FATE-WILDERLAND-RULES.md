# The Fate of Wilderland — original rules

This implements the original MEC71 adventure in standard/easy mode for solo
play and one to four hot-seat fellowships. The immutable source is
`src/data/pending/the-fate-of-wilderland-import.json`; native scans, insert
hashes, inventory checks and transcription corrections are documented in
[the finale source audit](ERED-MITHRIN-FINALE-SOURCES.md).

The normal/easy encounter decks contain **43/30** cards. The three initial
staging cards are the original Urdug, The Goblins’ Assault and The Heroes’
Defense. The three main quests are separate identities. Seven previously
imported encounter definitions keep their canonical IDs. Thirteen new
encounter definitions and three quests complete the adventure. All 26 faces
use the original local artwork. Campaign additions and Nightmare are
separate products.

## The two objectives and the main quest

Setup shuffles the encounter deck, discards until one enemy per player has
been discarded, and adds those actual copies to staging. These enemies are
added rather than revealed. The same procedure follows the printed discard
shuffle when advancing to stages two and three.

Assault progress belongs to the physical **The Goblins’ Assault** objective.
Defense resources belong to the physical **The Heroes’ Defense** objective.
Progress on a selected main quest does not advance the adventure. Let P be
the number of players currently in the game, reduced by player elimination
as specified by the Rules Reference.

| Main stage      | Printed Forced effect                                            | End-of-round condition |
| --------------- | ---------------------------------------------------------------- | ---------------------- |
| Urdug’s Assault | At round end, add Assault progress equal to enemies in staging.  | Advance at 2 + 2P.     |
| Outflanked      | After an enemy resolves an attack, add one Assault progress.     | Advance at 4 + 4P.     |
| The Final Push  | At round end, add Assault progress equal to all enemies in play. | Lose at 8 + 8P.        |

The Assault counter survives both advances. These printed advances do not
defeat the old quest, so they do not trigger quest-defeat responses such as
The Road Goes Ever On or The Long Defeat (designer clarification 3.321).
Attachments on the old quest are discarded. Merely reaching a threshold
during another effect does not advance or lose the game. An unsuccessful
quest adds one Assault progress per player. Dark Clouds can add further
progress for that particular phase, while ordinary unsuccessful-quest
threat still resolves.

After an enemy is destroyed, the first player may use the Defense response
to add one resource. A staging Gate of Gundabad prevents resource placement,
including placement from Dwarven Watchtower. At five Defense resources per
player, Urdug is considered engaged with each living player. His one
physical card remains in staging and still contributes staging threat.
Each of his normal attacks against a different player receives a fresh
physical shadow card; previously dealt shadows are discarded after the
attack. This follows designer clarification 3.346 for enemies considered
engaged with every player, rather than reusing a framework-dealt shadow.

## Urdug and actual attacks

**Destroying Urdug wins at any stage.** His printed Victory 5 is retained.
He is immune to player-card effects and cannot move out of staging, but can
be destroyed normally once damage is permitted. The Goblins’ Assault gives
him two additional defense for every other enemy in play. Encounter-card
Goblin Troop bonuses also apply when their engagement conditions are met.

Urdug cannot take damage until he has resolved an attack in the current
phase. The permission covers the whole combat phase, including its defense
and attack windows. It expires when the phase changes. A prevented attack
or an attacker destroyed by a declaration response does not count as a
resolved attack. Each actual Urdug attack discards the top encounter card
and receives only that card’s printed threat as its attack bonus. A printed
X has value zero outside play.

Urdug’s Command makes a real immediate first-player attack, with defender
choice, physical shadows, damage replacements, destruction and normal
completion. Its conditional Assault progress and the conditional progress
from a Command shadow are independent instances and stack. Pre-declaration
attack bonuses and these conditions survive defender selection and saves.
Player-card immunity also applies to a defending Gondorian Spearman’s
printed damage response after Urdug’s phase restriction has opened.

## Encounter choices and durations

Urdug’s Elite offers its engaged player exhaustion or one Assault progress.
Fierce Vanguard offers its round-long attack bonus or Assault progress.
Its shadow adds attack and defense only for the current phase.
Warg-rider’s Forced choice occurs when a printed blank shadow is **dealt**,
before attack declaration. Canceling an effectful shadow does not make it
a printed blank shadow. A return preserves the actual enemy and discards
its physical shadows.

Pack of Wargs remembers its dealt blank shadows and makes the corresponding
additional attacks. Those attacks receive no new shadow. Previously dealt
shadows are discarded before an additional attack, following FAQ 1.42.
Outflanked counts completed additional and immediate attacks too.

Hilltop Battlements reduces only non-unique enemies’ engagement costs and
adds enemies discarded by its explored Forced effect without revealing
them. Active Dwarven Watchtower increases every hero’s defense; its optional
explored response can add Defense resources or remove Assault progress.
Its printed Victory 2 and Gate of Gundabad’s printed Victory 1 are retained.
Gate travel searches the actual encounter deck, discard or victory display
for a Goblin Troop before the location becomes active. Slopes offers
Assault progress or an additional reveal; its shadow prevents the affected
enemy from taking damage through the end of the phase.

Dark Clouds modifies enemies and locations currently in staging, including
cards that enter staging later that phase. Its encounter lasting effect
recalculates when eligibility changes (FAQ 1.55), and multiple copies stack.
Its shadow offers controlled non-objective attachments, including
quest and threat-dial attachments, without duplicating physical targets.
Objective and Permanent attachments cannot be selected. Fierce Attack uses
the current main stage even when a player side quest is current.

## Shared sets and physical events

The seven reused identities retain all their printed rules: Goblin Troop,
Stray Goblin, Pack of Wargs, Hills of Wilderland, Lonely Lands, Gathering
Gloom and Swarm of Bats. Forced Stray engagement retains the engaging
player. A Stray shadow moves its actual shadow card into staging. Hills uses
the largest living fellowship for its X values and restricts its Quest
Action to the first player. Gathering Gloom offers each player their own
ally-based threat increase or a real reveal. Bats discards each player’s
actual hero resources and gains Surge only if none were discarded.

Lonely Lands stores the played physical event under the selected physical
location. Its threat increases by two per stored event. The event’s
already initiated printed Action still resolves, and its later disposal
does not duplicate or move the already stored card. When the location
leaves play, stored events enter their physical owners’ discard piles.
Public state exposes counts, rather than facedown card identities.

## Verification

`tests/fate-wilderland-import.test.ts` verifies immutable source data,
canonical identity reuse, native corrections, recipes and all artwork
hashes. `tests/fate-wilderland.test.ts` exercises actual choices, payments,
attacks, source immunity, counter timing and durable guided saves.
`tests/fate-wilderland-fixtures.ts` provides reload-checked solo and
multiplayer browser fixtures. The Ered simulation matrix checks complete
normal/easy games for one to four fellowships and exact terminal-state
parity across every event-review mode.
