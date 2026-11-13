# The Old Forest

A standalone scenario (Gen Con 2014 Fellowship event, print-on-demand recipe
Q99.04) set between A Shadow of the Past and A Knife in the Dark. It is
playable in classic solo and with one to four local players, in normal and
easy mode, with the Ring-bearer rules of The Lord of the Rings Saga. Its
campaign mode, which continues The Black Riders campaign, is not part of this
import.

## Sources and corrections

- The rules insert, as summarised by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-old-forest/rulebook),
  gives the Saga staging rules (encounter cards revealed one at a time in
  player order; "you" is the revealing player), Peril, Immune to player card
  effects, Indestructible, and the random stage 2: when stage 2B sends the
  players to a different random stage 2A, the first player shuffles the other
  stage 2 cards, chooses one at random and replaces the current stage 2 with
  it; the previous one returns to the quest deck and its progress and
  attachments are discarded.
- Recipe Q99.04 matches the normal quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Old-Forest):
  40 encounter cards without the campaign card, 6 quest cards, and Frodo
  Baggins with The One Ring. The catalog has no easy recipe, so Hall of
  Beorn's easy quantities build one (33 encounter cards): 2 Long Trailer,
  1 Misleading Path, 1 Oppressive Forest, 1 Falling Branches and 1 Song of
  Sleep. The quantities are recorded in `tests/old-forest-source-quantities.json`.
  Hall of Beorn's community rating of 5.7 gives the atlas difficulty of 6.
- The recipe's prepared staging area (one copy of each location) is part of the
  encounter deck: stage 1A has each player search the deck for a location.
- The immutable snapshot `src/data/pending/the-old-forest-import.json` has
  SHA-256
  `6a8286a0021e4af418aa8fb645a93382c605b2d7340b725f95404570e7d45ef7`.
- `tests/old-forest-art.json` pins all **30 faces**. They were checked by eye
  and correct the catalog:
  - Dark Bad Place: each player "must" exhaust a hero, and "stage 2A".
  - Falling Branches' shadow: "if the defending character is an ally."
  - Tom Bombadil: "Then, shuffle".
  - The four stage 2A sides are the same printed face; their reverses differ.
  - Wall of Trees prints X threat and **Victory X** (X is the number of
    players), which the catalog leaves without values.
  - Paragraphs follow the cards and double spaces are removed.

## Stages

| Stage                        | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Farewell to the Shire  | 0            | Setup: Old Man Willow and Withywindle are set aside; each player searches the encounter deck and adds 1 different location to the staging area. When Revealed: each player draws 1 card, then the players advance to a random stage 2A.                                                                                                                                                                                               |
| 2A/2B The Living Forest (×4) | –            | When Revealed: if the staging area has fewer locations than there are players, the first player searches the encounter deck and discard pile for a location and adds it to the staging area. Forced: after placing progress as the result of questing successfully, the players advance to stage 3A if the locations in the victory display are worth at least 5 victory points per player, otherwise to a different random stage 2A. |
| 3A/3B The Wicked Willow      | 18           | When Revealed: Old Man Willow and Withywindle are added to the staging area and players − 1 encounter cards are revealed. Old Man Willow cannot leave the staging area, is considered engaged with each player and attacks each player in turn order, with a new shadow card for each attack. Defeating this stage wins.                                                                                                              |

The four reverses of stage 2:

| Stage 2B               | Forced effect                                                                     |
| ---------------------- | --------------------------------------------------------------------------------- |
| Dark Bad Place         | At the end of the planning phase, each player must exhaust a hero he controls.    |
| Choked with Brambles   | At the end of the round, all progress is removed from each location in play.      |
| Shifting Trees         | At the end of the round, a random location is discarded from the victory display. |
| Closing in Around Them | The first player reveals 1 additional encounter card during the quest phase.      |

The scenario panel shows the current stage 2 and the cards left in the quest
deck, the victory points on locations in the victory display against the
goal, Old Man Willow and Withywindle, a pending Ending and Failing, Tom
Bombadil and the cards played this round.

## Encounter cards

| Card                 | Behaviour                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Old Man Willow       | Unique. Indestructible; immune to player card effects. Forced: when he attacks, a random location is discarded from the victory display and the defending player raises his threat by its victory points.                                                          |
| Withywindle          | Unique; immune to player card effects; Victory 3. The players cannot win while it is in play. While active, the first player reveals 1 additional encounter card in the quest phase.                                                                               |
| Long Trailer         | In the staging area: after the active location is explored, it makes an immediate attack against the first player.                                                                                                                                                 |
| Grasping Root        | Forced: after it engages a player, that player assigns X damage among his characters (X = locations in the victory display), one point at a time.                                                                                                                  |
| Army of Flies        | Surge. After it engages a player, and as a shadow against the defending player, that player discards a non-objective attachment he controls.                                                                                                                       |
| Misleading Path      | Surge. With no active location, the players must travel to it. Shadow: the defending player discards each ally card in his hand.                                                                                                                                   |
| Deep Gulley          | Victory 2. In the staging area: after a player optionally engages an enemy, he raises his threat by its attack (once per Deep Gulley).                                                                                                                             |
| Strange Woods        | Victory 1. In the staging area, characters cannot be healed. Shadow: +1 attack; if the attack destroys a character, each player raises his threat by 2.                                                                                                            |
| Wall of Trees        | X threat and Victory X (players). In the staging area, progress is placed on it before the current quest.                                                                                                                                                          |
| Oppressive Forest    | Victory 2. In the staging area, each player cannot play more than 1 card each round. Shadow: with no location in the staging area, this card is added to the staging area.                                                                                         |
| Swaying Without Wind | Peril. The revealing player returns a location from the victory display to the staging area; without one it gains surge.                                                                                                                                           |
| Falling Branches     | Each player removes a questing character he controls from the quest and deals it 2 damage (3 to an ally). Shadow: +1 attack (+2 against an ally).                                                                                                                  |
| Song of Sleep        | Peril. Condition on a questing hero of the revealing player, removed from the quest (one per hero): its text box is blank (Traits kept) and it cannot ready.                                                                                                       |
| Lost and Witless     | Surge. Progress is discarded from each location in the staging area; a non-unique active location is switched with a random location in the staging area.                                                                                                          |
| Ending and Failing   | Doomed 2. At the end of the phase, each player raises his threat by the number of enemies in the staging area. Shadow: the attacker returns to the staging area after the attack.                                                                                  |
| Tom Bombadil         | Objective-ally. When Revealed (cannot be canceled): the revealing player chooses a player, who gains control of him, ready and committed to the quest. At the end of the round he is discarded and the encounter discard pile is shuffled into the encounter deck. |

Interpretations:

- **Random choices** (the stage 2 cards, Shifting Trees, Old Man Willow,
  Lost and Witless) use the game's seeded random generator, so saved games
  replay them exactly.
- **Stage 2B's Forced effect** resolves after every successful quest, even
  when all the progress went to the active location or Wall of Trees; it does
  not resolve when questing fails or ties.
- **Wall of Trees** catches all progress that would be placed on the current
  quest, from questing or card effects. Two copies are identical, so the
  progress fills them in the order they entered the staging area.
- **Ending and Failing** counts the enemies in the staging area when the quest
  phase ends, Old Man Willow included.
- **Tom Bombadil's** end-of-round effect shuffles the discard pile even if he
  has already left play.
- **"Choose a player"** and the Peril cards are decided by the revealing
  player; the stage searches by the first player.

Engine additions:

- The engagement hook now tells a scenario whether the engagement was optional
  (Deep Gulley).
- The Lord of the Rings Saga accepts standalone scenarios played with the
  Ring-bearer (The Old Forest), besides The Black Riders.

## Verification

```sh
npm run test:engine
npm run test:old-forest-simulation
npm run build
npm run test:browser-old-forest
npm run audit:rules
```

The focused suite (`tests/old-forest.test.ts`, 13 tests) covers setup in one
to four players and both difficulties, the random stage 2 and its search, the
victory goal and stage 3A, Wall of Trees, the four stage 2B effects, Old Man
Willow's attacks against each player, the win and Withywindle, every
encounter card and shadow, saves and the scenario panel. The source test pins
the snapshot, the normal and easy quantities and all 30 faces.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation (including the set-aside cards and
treacheries being resolved) and private-view checks; it asserts the setup
searches and moves between random stage 2 cards. The starter decks lose every
game on stage 2, so stage 3 and the victory are covered by the focused and
browser suites.

The browser suite runs eight native setups with exact physical inventories and
shows the three printed quest stages, the setup search, a move to a different
stage 2 with its search, The Wicked Willow, Tom Bombadil's choice, Misleading
Path's forced travel, the victory and the loss of The One Ring at
1280/390/320px; it checks all 30 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
