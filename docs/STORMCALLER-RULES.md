# Flight of the Stormcaller — original rules

This import automates the original **Q06.4** and **E06.4** adventure recipes. The immutable source bundle is `src/data/pending/flight-of-the-stormcaller-import.json`. It contains 35 scenario identities and 44 cached faces: four player quests, three pursuer quests, 27 playable encounter/objective identities and one reference rules card. The reference card is not registered as scripted gameplay. Campaign and Nightmare recipes remain reference content.

The governing source is Fantasy Flight Games' original [Flight of the Stormcaller insert, MEC48](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec48_rules.pdf), especially page 2. Sailing, ships, Boarding and easy mode follow the original [The Grey Havens rulebook, MEC47](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec47_rules.pdf), pages 4–6 and 12. Travel costs and timing follow the original [Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf). Cached faces in `public/cards/` retain OCTGN identifiers; Sailing icon provenance is in `src/data/stormcaller-sailing-icons.json`.

Three upstream catalog errors are corrected only in the promoted playable definitions:

- Stage **3C** has the printed When Revealed search for **Sahír's Escort**, placed in the Stormcaller's area, followed by an encounter-deck shuffle. The upstream front incorrectly contains the player event Tides of Fate's Response text.
- **Raging Squall** has the printed **Weather** trait; the catalog omits it.
- The enemy's printed title is **Stormcaller**; the catalog calls it The Stormcaller. Its original identity remains unchanged.

## Physical setup

Players prepare the shared Dream-chaser fleet: different unique ships, a mandatory Dream-chaser, and two ships for a solo player. Heading attaches to the Dream-chaser and starts on-course. The original ship threat/cost/draw/hero-stat rules, Sailing and Corsair Pirates abilities share the already verified Grey Havens implementation.

The player quest deck is ordered 1A, 2A, 3A, 4A. The separate pursuer deck begins with 2C/2D, followed by 3C and 4C. Stormcaller begins physically in its own area. No card is duplicated into another physical pile.

| Mode and players | Remaining encounter deck | Rolling Seas in staging | Corsair deck |
| --- | ---: | ---: | ---: |
| Normal, 1–2 | 32 | 1 | 13 |
| Normal, 3–4 | 31 | 2 | 13 |
| Easy, 1–4 | 23 | 1 | 10 |

The source snapshots preplace two normal/one easy Rolling Seas. Printed setup instead searches for one, or two with 3–4 players. The engine adjusts the normal preplacement by player count while conserving all three normal physical copies. Easy removes the gold-border copies and retains exactly one physical Rolling Seas; the search resolves as far as possible. It does not create an extra easy copy to satisfy the 3–4-player search.

The Corsair deck and discard remain separate from the encounter deck. Its six possible original identities include Corsair Seafarer and Serpent's Blade in addition to the four Corsair Pirates. Empty Corsair piles use their own discard. Future quest and Corsair cards appear only as counts until an authorized search or reveal shows their faces.

## Stormcaller's area and pursuit

The Stormcaller's area is public and separate from ordinary staging. **The same stage** requires both the main quest's name and number to match the pursuer's current quest. Selecting a side quest does not change this comparison.

At a different stage, area cards are immune to player card effects, cannot leave the area and contribute no staging threat. At the same stage, those restrictions end: area cards count as staging, contribute threat and may be engaged or traveled to. The runtime preserves each physical unit's identity and area marker while materializing the same-stage units in staging so existing player effects apply. A genuine engagement, travel or leave-play action removes that marker. Advancing either quest reclassifies the remaining area cards; it does not return ships already engaged or locations already active.

At each round's end, discard one encounter-deck card without revealing it. Stormcaller places progress equal to its current threat, the discarded card's printed threat and the threat of each unblanked Sahír's Escort physically in its area. An empty encounter deck is not reshuffled at round end. Advancing discards excess progress, moves to the next C/D quest, returns Stormcaller to its area and resolves the printed C-front effects. Its accumulated damage remains. Serpent's Blade makes its printed immediate attack; the first player orders simultaneous advancement effects.

| Pursuer stage | Ongoing rules |
| --- | --- |
| 2D, Full Sail Ahead! | Off-course Stormcaller has +2 threat. At most 4 damage can be placed on it each round. |
| 3C/3D, The Weather Turns Foul | Search for an Escort into its area. Off-course Stormcaller has +2 threat. At most 8 damage can be placed on it each round. |
| 4D, The Cape of Andrast | Its defeat means Stormcaller escapes with the key and the players lose. |

Damage caps count all damage actually placed that round. Healing does not restore capacity, and changing from stage 2 to stage 3 does not reset the cumulative counter. A new round resets it. If Stormcaller legally leaves play, the players win immediately. Offstage immunity/no-leave restrictions prevent player effects from bypassing the pursuit.

## Player quests

| Stage | Implemented printed clauses |
| --- | --- |
| 1B, Swift Departure — 8 points | Sailing. At quest-phase end while off-course, move up to two existing main-quest progress to the pursuer quest. No progress is created when fewer than two remain. |
| 2A/2B, Full Sail Ahead! — 12 points | Search deck/discard for Swift Raider into staging, then shuffle. Sailing. At most eight progress can be placed here per round, or four while off-course. The count persists through removal, heading changes and reload. Defeating it while Stormcaller remains at stage 2 wins; otherwise advance. |
| 3B, The Weather Turns Foul — 18 points | Sailing. At staging-step end while off-course, reveal one additional encounter card normally, with its keywords and cancellation windows. Defeating it while Stormcaller remains at stage 3 wins; otherwise advance. |
| 4A/4B, The Cape of Andrast — 24 points | Discard until a Weather treachery; resolve only its When Revealed effect, which cannot be canceled. This is not a reveal and does not apply keywords or the stage's after-reveal damage. Sailing. After an actual Weather treachery reveal, deal one damage to every Ship objective and Ship enemy at this stage. This damage still occurs when the When Revealed effect was canceled. Defeating this stage wins. |

Defeat responses and quest attachments resolve before the player stage advances. A selected side quest retains its own progress and attachments; main-quest progress transfers and the pursuit's same-stage comparison still use the main quest.

Stage 4B's remaining enemy-ship damage resolves even when destruction of a player's Ship objective eliminates that player earlier in the same damage sequence. Player-ship damage stays with its own controller.

## New encounters and shadows

| Card | Implemented rule | Shadow |
| --- | --- | --- |
| Stormcaller | Boarding 2; no attachments; returns to its area on its quest advance; leaving play wins. | None. |
| Sahír's Escort | Boarding 1; no attachments; When Revealed enters the pursuer area. Its threat adds only to round-end pursuer progress while physically there. | None. |
| Swift Raider | Boarding 2; no attachments. From staging, engages a player committing at least four characters to Sailing or the quest. The Dream-chaser counts as two only for Sailing, under its actual controller. Existing Seafarers react to the triggering heroes; newly boarded Seafarers do not react retroactively. | None. |
| Corsair Skiff | Surge; no attachments. On engagement from staging, its controller chooses threat +3 or Boarding 1. Transfers do not repeat the trigger. | None. |
| Corsair Seafarer | Attack +1 per resource. After its engaged player commits a hero to Sailing or the quest, moves one available hero resource to itself, once per matching Seafarer. | None. |
| Serpent's Blade | Makes an immediate attack against its engaged player whenever the pursuer advances. | None. |
| Jagged Reef | Surge. At travel-phase beginning, place two progress on each copy on-course; off-course each copy deals two damage to every Ship objective. All in-play copies retain the Forced ability. Progress can remain on an offstage area location that cannot yet leave; catching up then permits its exploration. | None. |
| Hidden Cove | Travel costs exactly two main-quest progress transferred to the pursuer; can advance the pursuer before travel completes. After it becomes active, the players may heal four damage from every Ship objective. | None. |
| Vast Coastland | When Revealed enters the pursuer area. Canceling that relocation leaves it in ordinary staging. | Attacker +2 attack at the same main stage as the pursuer. |
| Man Overboard! | Each player currently contributing at least eight willpower discards one chosen questing character, including a ship. At worst heading its When Revealed cannot be canceled. Discard is not destruction and does not invoke the ships' destruction clauses. | Attacker +X attack, X = pursuer's current stage. |
| Raging Squall | Doomed 2. Attaches physically to the current quest, including a selected side quest. Each remaining copy deals one damage to a committed ally while off-course, including Ship objectives and excluding Sword-thain heroes. | None. |

The reused Calm/Rough Waters, Rolling Seas, Waterspout, Thrown Off Course, Winds of Wrath, Sudden Storms and Corsair Pirates retain their full original clauses and shadows. Rolling Seas cannot pay its off-course Travel cost at worst heading; mandatory Waterspout travel and ship damage use the same shared paths. Ship destruction directly loses or eliminates the controller and is independent of effects that temporarily cap effective threat.

## Verification

`node --import tsx --test tests/stormcaller.test.ts tests/stormcaller-audit.test.ts` exercises normal/easy 1–4-player physical setup, all quest and encounter clauses, cumulative limits, source corrections, private piles, choice ownership, save/reload and both victory and defeat. The independent audit suite checks cancellation versus reveal/discard/look timing, damage after healing/stage changes, legal non-destruction ship discard and offstage Reef behavior.

`node --import tsx scripts/browser-stormcaller.mjs` exercises the actual React app at desktop/mobile widths: all setup combinations, Sailing, same-stage engagement/Boarding, Skiff and Overboard choices, Hidden Cove's response, pursuer search, all seven quest fronts/reverses, victory/defeat, reload, local artwork and layout. It records its production bundle entry and writes screenshots/report to `output/stormcaller/`.
