# Breaking of the Fellowship

The third scenario of **The Lord of the Rings: The Road Darkens** (October
2014), which completes the box's quests. It is playable in classic solo and
with one to four local players, in normal and easy mode. Campaign mode, with
its boons and burdens, is not part of this import; the box's player cards
follow in a later import.

## Sources and corrections

- The Saga rules follow The Road Darkens rules insert, as transcribed by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-road-darkens/rulebook):
  the first player controls the box's Fellowship-sphere Ring-bearer with The
  One Ring, each player reveals his own encounter card in player order, and
  Peril cards are resolved by the revealing player. Stage 2B gives each player
  his own staging area and stage; encounter card effects at a stage refer to
  the players at that stage, a failed quest raises only their threat, and an
  eliminated player's stage is discarded with the encounter cards in its
  staging area.
- Recipes Q0B.06 and E0B.06 match the normal and easy quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Breaking-of-the-Fellowship):
  35 and 28 encounter cards without the campaign card and the seven burdens,
  plus 7 quest cards, Frodo Baggins and The One Ring. Fallen into Evil is
  used only in normal mode. The quantities are recorded in
  `tests/breaking-fellowship-source-quantities.json`. Hall of Beorn's
  community rating of 7.0 gives the atlas difficulty of 7.
- The immutable snapshot
  `src/data/pending/breaking-of-the-fellowship-import.json` has SHA-256
  `6d8f2406a8143bd02fcbfb97a03ef1208ff6bc0c55e31e4080532cdb7d825c1d`.
- `tests/breaking-fellowship-art.json` pins all **32 faces**. They were
  checked by eye and correct the catalog: 2A reduces engagement costs "until
  the end of the encounter phase" (not the engagement phase), 2B shuffles
  "Seat of Seeing" without an article, Wooded Shoreline adds its enemy to
  "this" staging area, Seat of Seeing mentions the "campaign pool", and Fallen
  into Evil attaches to a "non-[fellowship] hero", with its closing
  parenthesis restored.

## Stages

| Stage                          | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The Great River          | 12           | Setup: Frodo's Choice, Seat of Seeing and Parth Galen are set aside; The Argonath and Sarn Gebir enter the staging area. Enemies get +2 defense and cannot be engaged, and the players skip the encounter phase. The players cannot advance while The Argonath is in play.                                                                                                                                                                                                                                                                                                                                                                          |
| 2A/2B The Company Divided      | –            | When Revealed: the Ring-bearer and the cards attached to it are removed from the game (The One Ring's text is blank meanwhile), each enemy's engagement cost is 0 until the end of the encounter phase, and the travel phase is skipped. Forced, at the end of the refresh phase: Seat of Seeing and Frodo's Choice are shuffled into the encounter discard pile, which goes to the bottom of the encounter deck; each player creates his own staging area and advances to a different stage 3A of his choice; in player order, each player moves 1 encounter card from stage 2's staging area to his until none is left, and stage 2 is discarded. |
| 3A/3B (four stages)            | –            | Searching the Woods, Guard the Hobbits, The Seat of Amon Hen and Orc Hunting. Forced: after stage 2B is discarded, a staging area with less than 4 threat reveals 1 card. While Frodo's Choice is not in play, progress on the stage discards that many encounter cards instead. The stage where Frodo's Choice is revealed advances to 4A. Response after questing successfully: discard a non-unique location in any staging area; ready each of a player's heroes; a player draws 2 cards and lowers his threat by 2; or discard an enemy engaged with a player.                                                                                 |
| 4A/4B The Ring-bearer Sets Out | 16           | When Revealed: Parth Galen enters the staging area; during the quest phase, the phase ends at this stage without resolving the quest. 1 additional card is revealed for each player in the game. Response: after an enemy is revealed at this stage, a player at any stage may raise his threat by its threat to engage it, once per round. Defeating the stage wins the game.                                                                                                                                                                                                                                                                      |

## Encounter cards

| Card                   | Behaviour                                                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frodo's Choice         | Revealed instead of being discarded. When Revealed: the player takes control of the first player token, which he keeps for the rest of the game, and of the Ring-bearer with the cards attached to it; Frodo's Choice attaches to the Ring-bearer. |
| Uruk-hai Captain       | Toughness 2. Cannot have attachments; allies with fewer printed hit points cannot defend against it. Shadow: an additional attack.                                                                                                                 |
| Uruk-hai Archer        | Peril. Toughness 1. Archery X and X threat, where X is the number of players at its stage. When Revealed: discard an ally you control.                                                                                                             |
| Uruk-hai Tracker       | Surge. Toughness 1. Archery 1. +2 attack against a defending character with 2 or fewer printed hit points. Shadow: discard a non-objective attachment you control.                                                                                 |
| Uruk-hai Hunter        | Peril. Toughness 1. When Revealed: choose a player to reveal an encounter card, or it makes an immediate attack against you.                                                                                                                       |
| The Argonath           | Immune; X threat, the number of players in the game; Victory 1. No travel while Sarn Gebir is in play. While active, the combat phase is skipped.                                                                                                  |
| Sarn Gebir             | Immune; Victory 1. When explored, 1 damage to each exhausted character.                                                                                                                                                                            |
| Parth Galen            | Immune; Victory 1. Travel: search the encounter deck and discard pile for an enemy for the staging area. While it is in play, the players cannot win.                                                                                              |
| Seat of Seeing         | Immune; Victory 1. Its response removes a burden card, which only campaign mode has.                                                                                                                                                               |
| River Anduin           | At the end of the travel phase, each player at its stage raises his threat by 1; then it moves to the staging area to the left (the next player's), if able.                                                                                       |
| Wooded Shoreline       | Archery 2 in the staging area. Travel: search the encounter deck and discard pile for an enemy for this staging area.                                                                                                                              |
| Slopes of Amon Hen     | Travel: the player engages an enemy in any staging area. Shadow: +1 attack, +2 against a defending character with fewer printed hit points.                                                                                                        |
| Growing Threat         | Peril. Move an enemy engaged with you to the first player's staging area, or it gains doomed 2 and surge. Shadow: after the attack, the attacking enemy moves to the first player's staging area.                                                  |
| Orcs of the White Hand | Each enemy at this stage loses its damage and gets +1 threat, attack and defense until the end of the round. Shadow: against a defending character with fewer printed hit points, the attack is considered undefended.                             |
| Black Feathered Arrows | The archery at this stage gets +1 for each ally at this stage until the end of the round. Shadow: +1 attack, +2 against a defending character with fewer printed hit points.                                                                       |
| Fallen into Evil       | Attaches to a non-Fellowship hero, which becomes an enemy in the first player's staging area, with threat equal to its willpower and engagement cost equal to its threat cost. Discarding Fallen into Evil returns the hero to its owner.          |

Interpretations:

- **Separate stages** use the staging areas of Flies and Spiders: each player
  has his own staging area, active location, progress and stage, stages and
  resolves his own quest, and makes his own travel decision. Card text that
  reaches other stages does so: "any staging area", "the first player's
  staging area", "the staging area to the left", "choose a player", "an enemy
  engaged with a player" and "each player (at any stage)". Doomed 2 from
  Growing Threat counts the players at its stage.
- **Stage 2's active location** stays at its stage with the first player when
  the players separate; with one player there is a single staging area and no
  separation.
- **The 3B progress replacement** applies to progress from any source. When
  Frodo's Choice is revealed there, the remaining progress is not placed.
  Frodo's Choice discarded in any other way (a shadow card, for instance) is
  revealed at the stage of the player then acting.
- **4A ends the quest phase** at its stage only; the players at other stages
  still resolve their quests.
- **The 4B response** is offered once per player and round; the first player
  of the stage chooses which player, if any, engages the enemy.
- **Toughness X** reduces each damage dealt to the enemy by X. **Archery** is
  totalled for each stage and assigned among the characters of the players
  at that stage.
- **Fallen into Evil** uses the hero's printed willpower; the hero keeps its
  other attachments, goes to its owner's discard pile when defeated as an
  enemy, and leaves play when its owner is eliminated.
- **The Ring-bearer** removed by 2A is out of play until Frodo's Choice
  returns him, so the loss of The One Ring is not checked meanwhile.

Engine additions:

- The separate staging areas of Flies and Spiders now serve any scenario with
  the same area state, here Breaking of the Fellowship.
- A shared list of Condition attachments gives their host the enemy card type
  (Secret Cultist and Fallen into Evil).

## Verification

```sh
npm run test:engine
npm run test:breaking-fellowship-simulation
npm run build
npm run test:browser-breaking-fellowship
npm run audit:rules
```

The focused suite (`tests/breaking-fellowship.test.ts`, 18 tests) covers setup
in one to four players and both difficulties, the four stages, the
separation into staging areas, separate staging and quest resolution, the 3B
progress replacement and Frodo's Choice, the 4B response and the victory,
River Anduin moving between staging areas, every encounter card and shadow,
the 3B responses, elimination, saves and the scenario panel data. The source
test pins the snapshot, the normal and easy quantities and all 32 faces.

The complete-game matrix plays fourteen games from setup with exact save
restoration after every action, physical conservation (including every
staging area, the set-aside cards, treacheries being resolved and the
Ring-bearer while he is removed from the game) and private-view checks; the
starter decks lose them all at The Great River, under the Uruk-hai archery. A
second matrix starts ten games at stage 2B (two to four players in both
difficulties, with hidden and decisions review parity): every game separates
the players into their own staging areas, and the games reach stages 3 and 4
before the starter decks lose. The victory is covered by the focused and
browser suites.

The browser suite runs eight native setups with exact physical inventories and
shows the seven printed quest cards, The Great River, The Company Divided,
the choice of stage 3A, the sharing of stage 2's cards, the separate stages,
Frodo's Choice, the 4B response, Fallen into Evil, the victory and a loss of
The One Ring at 1280/390/320px; it checks all 32 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
