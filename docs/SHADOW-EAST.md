# A Shadow in the East

The original MEC77 deluxe adds **The River Running**, **Danger in Dorwinion**
and **The Temple of Doom**, each in normal and easy mode for classic solo
and one to four local players. All thirteen player designs are supported,
including both original heroes, The One Ring and the Fellowship contract.
Later Vengeance of Mordor packs remain separate imports.

## Sources and physical cards

[The source review](SHADOW-EAST-SOURCES.md) records the original insert,
all 95 visually inspected original faces, independent normal/easy quantities,
immutable input hashes, transcription corrections and designer clarifications.
The three scenarios contain 69 distinct identities; Stinker and thirteen
player designs bring the deluxe to 83 designs and 156 printed cards.
Gollum is Sméagol's reverse, represented by a runtime alias that retains the
same physical ID and owner. It is not another physical card.

The prepared snapshots retain their source-only status. Registered runtime
definitions carry the corrected printed text and local original images.
The library accepts the catalog's shortened Temple title while the adventure
menu displays the printed title, **The Temple of Doom**.

## Scenario rules

- [The River Running](RIVER-RUNNING.md) implements the pursuit clock, distinct
  starting enemies, Easterling attachments, the Crossing's conditional progress
  limit and each player's refresh discard. Shared Easterling rules also operate
  in the Temple scenario.
- [Danger in Dorwinion](DANGER-DORWINION.md) implements investigated locations,
  guarded Evidence, private cards beneath locations, random Plots and Cultists,
  Secret Cultist transformations and the active-location damage limit.
- [The Temple of Doom](TEMPLE-DOOM.md) skips its first quest phases, shuffles the
  four temple stages, tracks a separate Power of Mordor deck, preserves cards
  beneath threat dials and ends through the printed Tribute side quest.

Scenario panels show public resources, progress limits, revealed enemies,
revealed Plots and hidden-pile counts. They never reveal shuffled quest,
Power, set-aside or stored-card order. Significant events use the existing
animation and Fish Audio preferences.

## Player rules and setup

[Player scripts](SHADOW-EAST-PLAYER-SCRIPTS.md) cover all thirteen designs.
The One Ring attaches during setup before the opening hand, and its searched
Master card survives a mulligan. When several players include the Ring,
the first player selects its controller and other copies are removed.
The Ring lowers its controller's threat elimination level by five; that
reduction combines with scenario effects. Its departure ends the game.

Sméagol's two Stinker cards join the physical encounter deck. Changing sides
preserves the same physical card, original owner and saved decisions.
The printed restriction prevents choosing Sméagol for Shadows of Mirkwood
quests. His temporary enemy side does not by itself eliminate his owner.

Fellowship is selected in the deck builder and stored with the deck's card
list for compatibility with imports. It starts in a separate contract zone
and does not count toward the fifty-card minimum or enter the draw deck.
Its live restrictions and bonuses follow the current face. The interface
shows the contract face, unique-character count, Ring bearer and Sméagol's
current side.

## Verification

```sh
npm run check
npm run test:engine
npm run test:shadow-east-simulation
npm run build
npm run test:shadow-east-quests
npm run test:shadow-east-players
npm run audit:rules
```

The dedicated game matrix runs fourteen complete games per scenario:
normal/easy at one to four players, plus exact two-player comparisons across
all three event-review modes. Every actual action is saved and restored.
Phase/seat/stage boundaries additionally check physical quantities, public
privacy, pure rendering and idempotent restoration. Separate native-action
fixtures exercise the printed wins and losses; a completed seeded game may
end in a loss.

The browser suites exercise native setup, actual decisions, saved choices,
rule outcomes, original images and responsive layouts at 1280, 390 and
320 pixels. Release evidence is kept under the ignored
`output/shadow-east-release/`, `output/shadow-east/` and
`output/shadow-east-players/` directories.

Release verification on 25 October 2026 passed the production build,
TypeScript check, **5,445 engine regression tests** and the final **116-test**
Dorwinion/Temple/shared integration suite. Browser verification passed
**135 scenario checkpoints** (72 hotseat and nine classic setups) and
**69 player checkpoints** across all three viewport widths, with no browser
errors. Both suites verified the same production module's actual response
bytes, and all 2,611 production-build input files remained unchanged.

The complete-game matrix passed **42 games**, with **5,909 actual action/save
checks**, **18 exact review-mode comparisons**, **2,415 physical/rendering
boundaries** and **6,211 privacy checks**. All seeded-policy games ended in
loss; separate native-action fixtures and browser checkpoints verify the
printed victory paths.

The account migration permits the three new scenario identifiers while
retaining the existing ownership policies. Local guest play does not require
a hosted account service.

The registration audit records **707 player definitions (81 heroes), 1,105
encounter definitions and 75 scenario designs**, resolving **2,049 of 4,183
catalog identities** and **150 of 355 recipes**. The 623 selectable nonhero
player designs include one contract; 2,134 catalog identities remain pending.
The next chronological pack is **Wrath and Ruin**.
