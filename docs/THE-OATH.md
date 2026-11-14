# The Oath

The first scenario of the Two-Player Limited Edition Starter (2018), reprinted
with three more cards in The Dark of Mirkwood (2022). Both versions are in the
atlas as separate adventures, playable in classic solo and with one to four
local players, in normal and easy mode:

- **The Oath (Two-Player Limited Edition Starter)** (`the-oath-2018`): the
  Starter's recipe, Q00.01A ("The Oath (Limited Collector's Edition)").
- **The Oath** (`the-oath`): The Dark of Mirkwood's recipe, Q00.01B, which
  adds Wild Wargs, Obsidian Arrows ×2 and Abandoned Camp; easy recipe E00.01B.

Goblins have raided a woodman village on the eaves of Mirkwood. The players
follow their trail: Mirkwood Forest cannot be defeated until a Goblin Trail is
in the victory display, and the players win by defeating The Rearguard once
Goblin Troop has left play.

## Sources and corrections

- The recipes match
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Oath): 29 encounter
  cards in the Starter's version (21 in easy mode) and 33 in The Dark of
  Mirkwood's (25), plus 3 quest cards. Hall of Beorn's community rating of 2.3
  gives the Starter's version an atlas difficulty of 2; The Dark of Mirkwood's
  harder cards give it 3.
- **Easy mode** removes the cards with the gold easy-mode icon: Spiders of
  Mirkwood ×2, Tangled Grove ×2, Caught in a Web, Goblin Runners ×2 and Goblins
  are Upon You!. The Dark of Mirkwood's E00.01B does so; the Starter printed
  the same icons, so its easy mode removes the same cards (21 encounter cards,
  as Hall of Beorn lists).
- Two immutable snapshots: `src/data/pending/the-oath-import.json` (Q00.01B and
  E00.01B, SHA-256
  `883b7216099feec370a959c8f149e51096a6dfa06c2e70dfb925f6a6eab17c24`) and
  `src/data/pending/the-oath-limited-collector-s-edition-import.json` (Q00.01A,
  SHA-256
  `305a7214c59a804d1831056374841a7108408ff93cf4682f7c5073518143ebb6`).
- `tests/the-oath-art.json` pins all **25 faces** (the Starter's 22 and the
  three 2022 additions). They were checked by eye and correct the catalog:
  - The catalog leaves out **every shadow effect**; the shadows of Spiders of
    Mirkwood, Great Spider, Goblin Troop, Goblin Runners, Goblins are Upon You!,
    Eyes in the Dark, Driven by Shadow and Surprising Speed come from the
    scans.
  - Typos: 1A "Shuffle the encounter deck" (not "Shuffle of"), 2B "victory
    display", Great Spider, Goblintown Scavengers', Wild Wargs "discard",
    Abandoned Camp ". If that card is an ally", Forest Gate "the first player
    may draw 2 cards" and Caught in a Web "attaches this card".
  - 1B and 2A are flavour only; The Rearguard's When Revealed is on 3A.
  - Paragraphs follow the cards; straight quotes replace the catalog's
    backticks.
- **Core Set reprints.** Caught in a Web, Goblin Sniper, Driven by Shadow and
  Forest Gate print the Core Set's text. They keep their own cards and art
  and follow the Core Set rules through `src/game/core-reprints.ts`.

## Stages

| Stage                 | Quest points | Rules                                                                                                                                                                                                                                                       |
| --------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B After the Raid  | 9            | Setup: 1 copy of The Eaves of Mirkwood is added to the staging area and Goblin Troop is set aside, out of play.                                                                                                                                             |
| 2A/2B Mirkwood Forest | 12           | When Revealed: each player searches the encounter deck and discard pile for a Forest location and adds it to the staging area; the deck is shuffled. This stage cannot be defeated unless a Goblin Trail is in the victory display.                         |
| 3A/3B The Rearguard   | 6            | When Revealed: the first player adds the set-aside Goblin Troop to the staging area; each other player searches the encounter deck and discard pile for a Goblin enemy and adds it. 3B cannot be defeated while Goblin Troop is in play; defeating it wins. |

The scenario panel shows the stage's rule, the edition, the Goblin Trails in
the victory display, where Goblin Troop is (set aside, in play, gone) and
whether The Eaves of Mirkwood is active.

## Encounter cards

| Card                  | Behaviour                                                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spiders of Mirkwood   | While engaged with a player, +1 attack for each exhausted character he controls. Shadow: exhaust a character you control; undefended, it also takes 2 damage.                           |
| Great Spider          | Forced: after it engages you, exhaust a character you control. Shadow: 1 damage to an exhausted character you control.                                                                  |
| Goblin Troop          | Cannot have attachments. Each other Goblin enemy engaged with its player gets +1 attack and +1 defense. Shadow: +2 attack.                                                              |
| Goblin Sniper         | Core Set text: no optional engagement while other enemies are staged; in the staging area at the end of combat, each player deals 1 damage to a character he controls.                  |
| Goblin Runners        | Surge. Shadow: the attacker makes an additional attack.                                                                                                                                 |
| Goblintown Scavengers | When Revealed: the top card of each player's deck is discarded; it gets their total printed cost in threat until the end of the phase.                                                  |
| Wild Wargs            | Forced: after it engages you, the top encounter card is discarded; a Goblin enemy is put into play engaged with you.                                                                    |
| The Eaves of Mirkwood | While active, encounter card effects cannot be canceled.                                                                                                                                |
| Tangled Grove         | X threat: the locations in the staging area. Travel: each player discards 1 random card from his hand (no travel while a player has none).                                              |
| Forest Gate           | Core Set text: after the travel, the first player draws 2 cards.                                                                                                                        |
| Spider Den            | Quest Action (any player): put a Spider enemy from the encounter deck or discard pile into play engaged with you to discard Spider Den.                                                 |
| Goblin Trail          | Travel: reveal the top encounter card. When it leaves play explored, 6 progress on the current quest. Victory 3.                                                                        |
| Abandoned Camp        | Travel: the top encounter card is discarded; an enemy is added to the staging area. Response: the first player discards the top card of his deck; an ally enters play.                  |
| Driven by Shadow      | Core Set text: +1 threat to each staged enemy and location for the phase; surge if the staging area is empty. Shadow: discard an attachment (all if undefended).                        |
| Surprising Speed      | Each player returns an enemy engaged with him to the staging area; if none returns, surge and doomed 1. Shadow: +1 attack, then the attacker returns to the staging area.               |
| Caught in a Web       | Core Set text: attached to a hero of the player with the highest threat; it readies in the refresh phase only for 2 resources from its pool.                                            |
| Goblins are Upon You! | Each player puts a Goblin enemy from the deck or discard pile into play engaged with him; then the deck is shuffled. Cannot be canceled. Shadow: +1 attack per Goblin engaged with you. |
| Eyes in the Dark      | Doomed 1. Each player raises his threat by 1 for each questing character he controls, or discards one of them. Shadow: undefended, discard an ally you control.                         |
| Obsidian Arrows       | 2 damage to a character you control. Shadow: 1 damage to a character you control.                                                                                                       |

Interpretations:

- **Searches** let the searching player choose the card by title; it comes
  from the encounter deck if a copy is there, otherwise from the discard pile.
  Cards put into play this way are not revealed, so Goblin Runners' surge does
  not trigger.
- **Goblin Trail and 2B**: the explored Trail goes to the victory display
  before its Response places 6 progress, so that progress can defeat Mirkwood
  Forest at once.
- **Surprising Speed**: each player chooses which enemy to return; doomed 1
  raises each player's threat.
- **Abandoned Camp's Response** is optional, as every Response is.

## Verification

```sh
npm run test:engine
npm run test:the-oath-simulation
npm run build
npm run test:browser-the-oath
npm run audit:rules
```

The focused suite (`tests/the-oath.test.ts`, 17 tests) covers setup for both
editions and difficulties in one to four players, every stage transition and
search, the Goblin Trail requirement, the win, every encounter card and
shadow, the Core Set reprints, saves and the scenario panel. The source test
pins both snapshots, the quantities of all four recipes and all 25 faces.

The complete-game matrix (`npm run test:the-oath-simulation`, partitioned by
edition in CI) plays 60 games (11,731 actions) with exact save restoration
after every action, physical conservation (including the set-aside Goblin Troop
and the treacheries being resolved) and private-view checks, and 24 exact
paced/immediate terminal-state comparisons. From setup, the starter decks lose
all 28 games, some of them at Mirkwood Forest, where Tangled Grove and the
staging area's locations outpace their willpower; the 12 games started at the
end of After the Raid resolve 2A's searches and travel to the Goblin Trail; the
20 games started at the end of Mirkwood Forest bring Goblin Troop into play,
drive it out of play in 14 of them and win 7.

The browser suite runs sixteen native setups (both editions, both
difficulties, one to four players) with exact physical inventories and shows
the quest cards, 2A's search, the Goblin Trail, 3A's Goblin search, Spider
Den's action, Goblins are Upon You!, Eyes in the Dark, The Eaves of Mirkwood,
Goblin Troop holding 3B and the victory at 1280/390/320px; it checks all 25
faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
