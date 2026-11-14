# Journey to the Cross-roads

The second scenario of **The Lord of the Rings: The Land of Shadow**
(November 2015). It is playable in classic solo and with one to four local
players, in normal and easy mode, with the box's Fellowship-sphere Frodo
Baggins as the Ring-bearer. Campaign mode, with its campaign card, is not
part of this import.

## Sources and corrections

- Recipes Q0B.11 and E0B.11 match
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Journey-to-the-Cross-roads)
  card for card in both modes, and the scans' set numbers: 31 cards of
  Journey to the Cross-roads (The Black Gate is "1/31") and the 9 Men of
  Harad (3 Oliphaunts, 3 Haradrim Soldiers, 3 Haradrim Archers; the Archer is
  "7/9"), plus the quest card, Frodo Baggins and The One Ring. Hall of
  Beorn's 42 normal cards add the campaign card. Easy mode removes a Captain
  of Harad, a Southward Road, a Marching Up the Road and a Fierce Southrons.
  The quantities are recorded in `tests/cross-roads-source-quantities.json`.
  The scenario has no official difficulty;
  [Vision of the Palantír](https://visionofthepalantir.com/2022/10/24/journey-to-the-cross-roads/)'s
  community rating of 8.3 gives the atlas difficulty of 8.
- The immutable snapshot `src/data/pending/journey-to-the-cross-roads-import.json`
  has SHA-256
  `2b9e61ff11aeef1db7ddb685a83d0ba6c95bf94ecf486c27ad47ca8010963f84`.
- `tests/cross-roads-art.json` pins all **20 faces**, checked by eye (Frodo
  Baggins from RingsDB, the others from DragnCards). They correct the
  catalog's names (Henneth Annûn, Foothills of Ephel Dúath), The
  Cross-roads' hyphen and the quest card's typos ("the top card facedown
  card", "location adds it"), Captain of Harad's "-10 engagement cost", the
  Mordor trait of The Black Gate and The Dark Lord's Summons, Hills of
  Ithilien's "non-objective" shadow and Marching Up the Road, which searches
  the encounter deck only (the catalog adds the discard pile). Paragraphs
  follow the cards and double spaces are removed. Haradrim Archer's printed
  threat is X, the number of players.

## The quest

| Stage                         | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Ambush the Men of Harad | 20           | Setup: The Black Gate and The Cross-roads are added to the staging area, and the Men of Harad are shuffled facedown under The Cross-roads; each player but the first searches the encounter deck for a different non-unique location and adds it to the staging area. Forced: at the beginning of the quest phase, the top facedown card under The Cross-roads is revealed and added to the staging area. The stage cannot be defeated while The Cross-roads is in play; when The Cross-roads is explored, the players win. |

**The Cross-roads** (unique, Road, immune to player card effects, Victory 9)
has 9 threat, -1 for each facedown card under it; the players can travel
there only with no facedown card under it and at least 20 progress on stage
1B.

**The Black Gate** (unique objective, Mordor): at the end of the planning
phase, each Harad enemy in the staging area is placed facedown under it.
With at least X facedown cards under it, X being 3 more than the number of
players, the players lose.

## Encounter cards

| Card                     | Behaviour                                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Man of Harad             | Surge, Archery 1. After it engages you, discard a random card from your hand. Shadow: the same.                                                                                                                                              |
| Captain of Harad         | After it engages you, each Harad enemy gets +1 attack and -10 engagement cost until the end of the round. Shadow: if this attack destroys a character, the attacker returns to the staging area.                                             |
| Oliphaunt                | Cannot have attachments or take more than 3 damage each round. After it engages you, each ally you control exhausts. Shadow: +3 attack.                                                                                                      |
| Haradrim Soldier         | After it engages you, it makes an immediate attack. Shadow: an additional attack after this one.                                                                                                                                             |
| Haradrim Archer          | X threat and Archery X, X being the number of players. After it engages you, assign X damage among your characters. Shadow: 1 damage to the defending character.                                                                             |
| Henneth Annûn            | While active, the encounter and combat phases are skipped and the Forced effects of stage 1B and The Black Gate are ignored. After it becomes active, each engaged enemy returns to the staging area.                                        |
| Southward Road           | While active, each player may engage an additional enemy during the encounter phase. Travel: the first player reveals the top facedown card under The Cross-roads.                                                                           |
| Ithilien Woods           | While active, after a player engages a Harad enemy, he readies a character he controls. Travel: the first player reveals the top card of the encounter deck.                                                                                 |
| Foothills of Ephel Dúath | While active, each Harad enemy gets -1 threat. Travel: the first player engages an enemy in the staging area.                                                                                                                                |
| Hills of Ithilien        | While active, after a player engages a Harad enemy, 1 damage to that enemy. Shadow: discard a non-objective attachment you control.                                                                                                          |
| The Dark Lord's Summons  | Peril. The lowest-attack Harad enemy engaged with you goes under The Black Gate, or the top card under The Cross-roads is put into play engaged with you.                                                                                    |
| Arrows Thick in the Air  | Each Harad enemy gains Archery 2 until the end of the round. Shadow: the attacker goes under The Black Gate after this attack, or it attacks again.                                                                                          |
| Marching Up the Road     | Each player returns an enemy engaged with him to the staging area, or puts a Harad enemy from the encounter deck into play engaged with him. Shadow: +1 attack; if this attack destroys a character, the attacker goes under The Black Gate. |
| Fierce Southrons         | Peril. The lowest-threat Harad enemy in the staging area goes under The Black Gate and another encounter card is revealed, or each enemy in the staging area attacks you.                                                                    |

Interpretations:

- **The facedown cards** under The Cross-roads keep their order (the top is
  revealed first) and stay hidden from every player view; the panel shows
  how many are left, The Black Gate's count and its limit. A card revealed
  from under The Cross-roads is revealed as an encounter card (Surge and
  When Revealed effects apply), but it is not drawn from the encounter deck.
- **Placing an enemy under The Black Gate** removes it from play: its
  shadow cards are discarded and its attachments go to their owners'
  discard piles. It is not defeated or destroyed. The Black Gate's loss is
  checked whenever the count grows.
- **Henneth Annûn** returns the engaged enemies whenever it becomes the
  active location, by travel or another effect; it ignores the Forced effects
  of 1B and The Black Gate only while it is the active location, so they
  resume once it is explored.
- **Archery** is totalled from the enemies in the staging area at the
  beginning of the combat phase, as in the other Saga scenarios, with
  Arrows Thick in the Air adding 2 for each Harad enemy for each copy
  resolved this round. The first player assigns it.
- **Captain of Harad** and **Oliphaunt** counters last until the end of the
  round; several Captains add up.
- **The choices** offer only legal options: The Dark Lord's Summons without
  an engaged Harad enemy can only reveal from The Cross-roads, and Fierce
  Southrons without a Harad enemy in the staging area can only attack. Ties
  for the lowest attack or threat are the player's choice.
- **Hills of Ithilien's shadow** discards an attachment the player controls:
  objectives (such as The One Ring) and encounter cards are excluded.
- **Peril** cards are resolved by the revealing player, who makes the choice.

## Verification

```sh
npm run test:engine
npm run test:cross-roads-simulation
npm run build
npm run test:browser-cross-roads
npm run audit:rules
```

The focused suite (`tests/cross-roads.test.ts`, 8 tests) covers setup in one
to four players and both difficulties, stage 1B and The Black Gate (with its
loss), The Cross-roads' threat, travel restriction and victory, Henneth
Annûn's skipped phases and ignored Forced effects, each location's travel
cost and active effect, every enemy's engagement Forced effect, Oliphaunt's
damage limit, the four treacheries, every shadow, Archery, the scenario
panel data and saves. The source test pins the snapshot, the normal and easy
quantities, the corrections and all 20 faces.

The complete-game matrix plays fourteen games from setup (one to four
players, and hidden, decisions and all review modes, in both difficulties)
with exact save restoration after every action, physical conservation (the
Men of Harad under The Cross-roads and the Harad enemies under The Black
Gate included) and private-view checks, the order of the facedown cards
under The Cross-roads included: each player but the first searches for a
setup location, stage 1B reveals up to six of the Men of Harad, and the
starter decks fall within five rounds to the Harad attacks or to The Black
Gate (4 or 6 Harad enemies under it). A second matrix starts twelve games
with the Men of Harad defeated and 20 progress on stage 1B: every game
travels to The Cross-roads and three are won by exploring it. Hidden and
decisions review parity is checked in both matrices (26 games, 3,735
actions).

The browser suite runs eight native setups with exact physical inventories
(the Men of Harad under The Cross-roads included) and shows the printed
quest card (both sides), the setup search, a card revealed by 1B, The Black
Gate at 3 of 4, The Cross-roads ready, Henneth Annûn, The Dark Lord's
Summons, Marching Up the Road, Fierce Southrons, Haradrim Archer's damage,
the Foothills travel cost, Arrows Thick in the Air's shadow, the victory and
The Black Gate's defeat at 1280/390/320px (53 checkpoints); it checks all 20
faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
