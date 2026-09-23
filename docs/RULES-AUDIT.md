# Core Set rules audit: corrections

All 30 reproduced findings from the audit of `b3eb8e7` are covered by fixes and permanent regression tests. This closes that set of findings; the remaining general timing boundaries are documented in [COVERAGE.md](COVERAGE.md#timing-boundaries).

## Rules sources

- [FFG Revised Core Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/f2/87/f28704b2-5f25-4fd8-be7a-18d4a5d2c1c4/mec101_core_set_rules_reference_v10c-compressed.pdf) (RR).
- [FFG FAQ and errata 1.9](https://images-cdn.fantasyflightgames.com/filer_public/2e/31/2e3129b3-dc51-4c27-81ed-6a72f13e82f3/lotr_faq_19.pdf) (FAQ).
- [FFG: Counsel from the Loremaster](https://www.fantasyflightgames.com/en/news/2016/2/2/counsel-from-the-loremaster/) (lasting effects).
- [FFG Core campaign cards, mirrored by Hall of Beorn](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Print-and-Play/core_set_campaign_cards.pdf) (Campaign; page numbers include repeated copies and blank backs).

## Closure matrix

The matching `Rxx` cases in [rules-audit.test.ts](../tests/rules-audit.test.ts) run both with explicit event confirmations and without presentation pauses. Fixtures isolate legal rule interactions; they are not claims of naturally won games.

| Finding | Corrected behavior | Authority |
| --- | --- | --- |
| R01 | A third Restricted attachment, including a claimed objective, prompts an immediate discard choice. Removing Citadel Plate can destroy an over-damaged hero. | RR p.15 |
| R02 | Massing at Night deals and resolves one additional shadow per living player. | Core 112 |
| R03 | Every Caught in a Web must be paid for; insufficient resources cannot partially ready the hero. | FAQ p.12 |
| R04 | Multiple For Gondor events stack their attack and Gondor defense bonuses. | Core 22; RR p.11 |
| R05 | Faramir buffs the characters present when his ability resolves. New arrivals do not inherit the bonus. | Loremaster |
| R06 | Treacherous Fog affects later staging locations and stacks. Driven by Shadow retains its original affected set. Board threat and event reviews use the same calculation. | Loremaster; FAQ p.14 |
| R07 | Elimination of the prisoner's fellowship loses Dol Guldur for the group. The intentionally supported seat whose only hero is captured at setup remains active. | FAQ p.13 |
| R08 | A Light in the Dark sends an Orc Guard's facedown card to its original owner's discard. Transferring the Guard preserves that owner, including when destroyed. | FAQ p.2 |
| R09 | Legolas and each Blade of Gondolin resolve as separate optional responses in the chosen order, respecting locations and immediate quest advancement. | FAQ p.12 |
| R10 | Erebor Hammersmith's after-play response excludes Sneak Attack and Stand and Fight. | Core 59; RR p.13 |
| R11 | Returning a borrowed Wandering Took uses the original owner's hand and resets its in-play state. | Core 117; RR p.12 |
| R12 | Mendor's control follows the first-player token. | Campaign p.25 |
| R13 | Scarred reacts to destroyed characters controlled by its own player. | Campaign p.31 |
| R14 | Wolf Rider's shadow attack accepts another player's ready Sentinel defender. | RR p.15; FAQ 1.33 |
| R15 | Quick Strike can attack another player's engaged enemy using Ranged, or staging with Dúnhere. Characters without an eligible enemy are excluded before payment. | Core 35; RR p.14 |
| R16 | Simultaneous Sneak Attack and Beorn departure effects offer the first player a choice of hand or deck before the next phase. | FAQ 1.02 |
| R17 | Brok responds when a Dwarf hero is discarded by the Nazgûl, as well as destroyed. Uniqueness applies across the table. | Core 19 |
| R18 | Driven by Shadow can discard an encounter Condition from a defender. Effects requiring player control use a separate filter and respect Permanent. | Core 92 |
| R19 | The receiving character's controller activates its player attachments; discards still go to the original owner. Controlled attachments on enemies and locations retain their player's control. | RR pp.3,12 |
| R20 | Eliminating the first player passes the token to the next surviving player in table order. | RR p.8 |
| R21 | Travel costs resolve while the destination remains in staging. Mountains no longer causes Driven by Shadow to gain an incorrect Surge. | RR p.18; Core 78,92 |
| R22 | Wolf Rider shadows return to the deck at combat end, including nested attacks; they cannot be dealt again earlier in that phase. | FAQ p.12 |
| R23 | Beastmaster's Forced extra shadow is dealt before defender responses such as Gondorian Spearman. | FAQ p.2 |
| R24 | Miner can remove Iron Shackles from a player's deck. A Shackles shadow becoming a Condition leaves the enemy's shadow list, avoiding a duplicate discard. | Core 61,105 |
| R25 | Each hero replacement adds permanent starting threat to every player. Interlude text and calculations match. | RR p.30 |
| R26 | Each player may make one voluntary hero replacement; the restriction is not shared by the group. | RR p.30 |
| R27 | Feint's prevention remembers the protected player. An enemy transferred by Son of Arnor can attack its new player. | FAQ p.2 |
| R28 | Defeating a Hill Troll offers Valor separately to each player, attached to their own hero. | Campaign p.3 |
| R29 | The first Hill Troll destruction trigger offers Scarred to each player's own hero, once per game. | Campaign p.3 |
| R30 | Dol Guldur setup assigns one Appointed by Fate; the first player can select any hero. | Campaign p.5 |

## Persistence and player control

Pending Restricted, victory-response, and Beorn choices survive JSON save/reload. End-of-phase effects are queued before phase transitions so a choice cannot be bypassed by Continue or Next. Legacy version-two Faramir/For Gondor bonuses are converted once to character modifiers on restore. New fog, deferred Wolf Rider returns, and player-specific attack prevention fields are validated.

Already resolved mistakes in an older save are not reconstructed retroactively. Continuing an existing campaign uses the corrected shared replacement penalty for subsequent quest setup. Existing version-one and version-two save formats remain supported.

## Verification

- `npm test`: **232/232 passing**, including 86 new audit/interaction/save cases (43 with each pacing mode), 300 classic simulations, 144 hot-seat simulations, and 72 guided/unpaced game pairs.
- Existing desktop browser suites pass for all four starters, all three scenarios, campaign continuation, payments, attachments, hot-seat support, saved state, and player-confirmed events. The old attachment-controller and campaign-penalty expectations were corrected.
- `npm run test:rules-browser` verifies actual controls at **1280×720 and 1440×900**: third Restricted play/claim, unskippable saved choices, chosen progress order, both Beorn destinations, Miner, visible Fog threat, prevented attacks, deferred Wolf Rider, and per-player Valor. Reviews are acknowledged through the visible Continue button.
- The standard web-game client, public text state, and desktop screenshots were inspected. TypeScript and the production build pass. Vite still reports the existing bundle-size advisory.

The original negative audit fixture in ignored `output/rules-audit/` is historical evidence, not the regression test runner: its old success condition was reproducing the bugs.
