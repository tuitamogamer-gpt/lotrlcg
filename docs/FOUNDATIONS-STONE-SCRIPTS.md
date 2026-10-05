# Foundations of Stone — original and easy quests

The original scenario and its official easy recipe are automated for one to four
players. All eight quest designs and nine Foundations of Stone encounter designs
are registered. The existing Khazad-dûm encounter implementations supply the
shared sets and Cave Torch; the pack's player cards were already implemented.

## Printed pools and sources

The standard initial encounter deck contains 41 cards; the set-aside Foundations
of Stone pool contains 24. Easy uses 28 initial and 18 set-aside cards. Recipes
are copied from the imported reference catalog's Q02.8/E02.8 sections. The
initial sets are Hazards of the Pit, Twists and Turns, and Goblins of the Deep.

Primary rules sources:

- [FFG rules insert](https://images-cdn.fantasyflightgames.com/filer_public/b5/22/b52221aa-b249-4de7-9882-01db0c2ecbff/foundations_of_stone_rulesheet.pdf)
  defines separate staging areas, scoped interaction, shared phase order and
  travel-phase recombination.
- [FFG's encounter-set correction](https://www.fantasyflightgames.com/en/ffg_blog/21951/original_content)
  replaces the insert's erroneous Deeps of Moria reference with Hazards of the Pit.
- [Official FAQ 1.9](https://images-cdn.fantasyflightgames.com/filer_public/1d/bb/1dbb319c-6b1e-466e-9177-75a5857b5cfa/lotr_faq_19_printer_friendly.pdf)
  confirms global uniqueness while separated, Lost and Alone draw/discard rules,
  the absence of titles/text on Nameless-fed cards, and next-stage effects before
  an explored location's Response.

Printed text, stats, reverse quest faces, easy quantities and image/source
provenance remain in the three scenario JSON data files. Printed X values remain
available separately from numeric engine values.

## Quest and staging behavior

| Quest              | Implemented behavior                                                                                                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Dripping Walls | Set the new encounter pool aside; first player chooses any hero for Cave Torch; reveal one encounter per player; advance at nine progress.                                                                                                                                             |
| The Water's Edge   | After each actual commitment, discard the committing player's actual top two deck cards; advance at twelve progress.                                                                                                                                                                   |
| Washed Away!       | Discard Item, Armor, Weapon and Light cards and all old encounter cards in play; retain enemy/treachery discards for the replacement deck; shuffle in the set-aside pool; remove the other old encounter cards; assign distinct random stage-four quests in global first-player order. |
| Old One Lair       | Reveal four into the owner's new staging area; complete at five progress.                                                                                                                                                                                                              |
| Sheltered Rocks    | Reveal two into the owner's area; complete at eleven.                                                                                                                                                                                                                                  |
| The Endless Caves  | Discard all resources from the owner's heroes; complete at seventeen.                                                                                                                                                                                                                  |
| The Shivering Bank | Discard the owner's hand, reveal two into their area; complete at seven.                                                                                                                                                                                                               |
| Out of the Depths  | Reveal one per surviving player; each player's chosen allies may not exceed their simultaneously chosen heroes; win at eleven progress.                                                                                                                                                |

Stage four has actual independent staging, progress, active locations, modifiers
and quest assignments. Player effects, encounter effects, Sentinel/Ranged combat
and reveal counts use only the current area's players. Global phases, turn order,
first-player rotation, resources, refresh, physical ownership and uniqueness
remain table-wide. Completed areas wait until the beginning of travel, then
choose a surviving area to join in global first-player order. Their staging cards
move with them, engaged enemies stay with their players, and their former active
location is discarded. They adopt the destination's quest and progress. The last
completed group continues to stage five.

Unoccupied areas are discarded when an isolated player is eliminated. Save
validation preserves historical areas when the whole game has ended and rejects
overlapping memberships, duplicate assignments, inconsistent active projections,
or duplicate physical cards across areas.

## Encounter and objective behavior

| Card                                  | Implemented behavior                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deep Deep Dark                        | Local Doomed/Surge; local first player's actual deck cards attach to each local Nameless in an explicitly chosen order; Nameless shadow discards the defending player's hand.                                                                                                                                                                                                                              |
| Drowned Treasury                      | End-of-quest passive makes each local player choose one controlled character to discard. Exploration gives each local player an optional draw-two or objective claim, after any immediate quest advancement and next-stage revealed effects.                                                                                                                                                               |
| Durin's Axe / Durin's Helm            | Normal claims exhaust a real ready controlled hero and preserve the objective's physical identity. Restricted overflow remains a choice. Axe grants three attack plus one willpower for a Dwarf; Helm grants one defense plus two health for a Dwarf.                                                                                                                                                      |
| Elder Nameless Thing / Nameless Thing | Engagement attaches three/two actual cards from that player's deck. X sums all attached printed costs, with X/dash/null costing zero and an empty attachment list using four/three. Cards fed by the Forced effect retain physical identity/owner, but have no active title or text. Defeat returns attached player cards to their owners.                                                                 |
| Lost and Alone                        | Each local player chooses a hero, detaches its equipment, and shuffles the same physical hero into its owner's deck. Only actual drawing returns it ready with zero damage/resources; deck discard or attachment never does. Its persistent identity survives phase/round expiry, shuffle, Stargazer ordering and saves. Shuffling the last hero does not eliminate a player; its subsequent discard does. |
| Mithril Lode                          | Refresh Action chooses and exhausts a ready controlled character, snapshots its current willpower, and places that amount directly on its area's quest. Limit is per physical Lode per round, across players.                                                                                                                                                                                              |
| Moria Bats                            | Only Ranged characters can attack/defend; attack gains one per other enemy engaged with the same player.                                                                                                                                                                                                                                                                                                   |

Treasury's claim is implemented as the encounter Response directly attaching an
unguarded unclaimed Durin objective to a controlled hero, without paying the
separate objective Action's exhaustion cost. This follows the instruction to
claim through the Response; the cited FAQ has no Treasury-specific clarification.
Remaining player cards in staging during the flood follow their controller into
that controller's newly assigned area.

## Verification

- `node --import tsx --test tests/foundations-stone.test.ts`: 36 semantic tests,
  including real public actions, multiplayer areas, join ordering, original/easy
  pools, all printed effects/shadows, payment, cancellation-aware blanking, lost
  physical heroes, persistent deck identities, new-instance lasting-effect
  cleanup, pre-flood lasting grants across separated areas, terminal states and
  invalid saves.
- `node --import tsx scripts/browser-foundations-stone.mjs`: four actual UI
  journeys at 1280×900, 390×844 and 320×750; save/reload in pending choices and
  resulting states; 24 screenshots under `output/foundations-stone`, with no
  console/page errors or horizontal overflow.
- `tests/druadan-player-cards.test.ts`, `tests/foundations-stone.test.ts` and
  `tests/rules-audit.test.ts` together passed 151 tests after the area framework
  changes. The standard develop-web-game client also runs against the local app.

Scenario files are `foundations-stone.ts` and the pure
`foundations-stone-support.ts`. The table module scopes default helpers to an
area and exposes explicit global helpers for framework operations. The save
module validates global zones and restores text/legacy modifiers across every
area and seat.
