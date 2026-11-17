# Attack on Dol Guldur

The 2017 Gen Con event scenario, later sold print-on-demand. It is in the atlas
as **Attack on Dol Guldur** (`attack-on-dol-guldur`) in its **standard game
mode** (Q99.10), playable in classic solo and with one to four local players.
Easy mode adds the framework's resource (the scenario predates official easy
mode and marks no cards).

The epic multiplayer mode needs three copies of the scenario and three teams at
three stage 3 cards at once; it is not playable on a one-to-four player table
and stays unsupported. Its setup card stays set aside, out of play.

The armies of Dol Guldur cross the Anduin to assault Lórien. The players hold
the Golden Wood while the power of Lórien gathers, cross the river with the
host of the Elves, then fight around the fortress from one stage 3 to another.
Dol Guldur's city strength, 5 plus 5 per player at the start, falls by the
siege value of every location explored and every enemy destroyed; at 0 the
Lieutenants lose indestructible, and with none in play at the end of a round
Dol Guldur is captured and the players win.

## Sources and corrections

- The recipe matches
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Attack-on-Dol-Guldur):
  its 49 encounter cards include both setup cards, and the quest deck has 1A,
  2A and the four stage 3 cards. Hall of Beorn's community rating of 9.5 gives
  an atlas difficulty of 10.
- One immutable snapshot: `src/data/pending/attack-on-dol-guldur-import.json`
  (Q99.10, SHA-256
  `93571eb4356101315667757c63f2513c4f80142c6305cf6cf4a96e00bb7a92d8`);
  `tests/attack-dol-guldur-source-quantities.json` keeps every card's
  quantity.
- `tests/attack-dol-guldur-art.json` pins all **40 faces** (32 cards; the
  quest cards and both setup cards have two faces).
- **Siege values** are printed in the victory box of the reviewed scans:
  Host of Dol Guldur 4, Mirkwood Olog-hai 3, Beast of Taur-nu-Fuin 2, Amon
  Lanc Archer, Dol Guldur Marauder and Battle Warg 1, and each Dol Guldur
  location 2. Forest Battleground, Blackened Woods and the Lieutenants have
  none.
- **Corrections from the reviewed scans:** the catalog drops the accent of
  Lórien and glues each quest card's front text before its back text; Dungeon
  Dweller is also immune to player card effects; Battle Warg has a shadow
  effect ("Discard an attachment you control."); Gate of Dol Guldur "The
  players cannot travel"; Battle Under the Trees and Dungeons of the
  Necromancer remove "an additional 5 progress" without "from this stage", and
  the latter's ally is put into play ("an ally and puts"); Standard Game Mode
  "increase its value"; the shadows of Blackened Woods and Fastness of
  Mirkwood use the attack and defense icons; Epic Multiplayer Mode "3 separate
  staging areas", without the repeated sentence, "resolves the Forced effect"
  and "the siege fails". The paragraphs follow the scans.

## Setup and stages

Setup (Standard Game Mode and 1A): Dol Guldur is added to the staging area
with a city strength of 5 plus 5 for each player, with Power of Lórien and a
Dol Guldur Marauder for each player; the other Marauders stay in the encounter
deck. Host of Lórien, the 4 Lieutenants and Epic Multiplayer Mode are set
aside.

| Stage                             | Rules                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1A/1B Assault on the Golden Wood  | At the end of each round a resource is placed here and all progress moves to Power of Lórien; at 3 resources the players advance. Response: raise each player's threat by 1 so that each player draws a card and adds a resource to a hero's pool.                                               |
| 2A/2B Crossing the Anduin         | The first player may remove 10 progress from Power of Lórien to take control of Host of Lórien, then 20 more to place Power of Lórien in his play area, otherwise it is discarded. Each player adds a Dol Guldur location from the encounter deck or discard pile; the players choose a stage 3. |
| 3A/3B The Siege of Dol Guldur     | Bane of Amon Lanc. End of the round: 5 progress, or the city strength rises by 3; 5 more lower it by 3.                                                                                                                                                                                          |
| 3C/3D The Tower of Sorcery        | Sorcerer of Dol Guldur. End of the round: 5 progress, or each player keeps 1 card in hand; 5 more let a chosen player search his deck for a card.                                                                                                                                                |
| 3E/3F Battle Under the Trees      | Chieftain Morlug. End of the round: 5 progress, or each player discards from the encounter deck until an enemy, which engages him; 5 more destroy a non-unique enemy.                                                                                                                            |
| 3G/3H Dungeons of the Necromancer | Dungeon Dweller. End of the round: 5 progress, or each player discards an ally; 5 more let a chosen player put an ally from the top 10 cards of his deck into play.                                                                                                                              |

Every stage has "–" quest points. Each stage 3's When Revealed sets the
Lieutenant in play aside with all its tokens and adds the stage's own
Lieutenant to the staging area unless it is in the victory display; at 5 city
strength or less it attacks each player. That Lieutenant gets -1 engagement
cost for each progress on the stage.

**End of the round at stage 3**, in order: the stage's Forced effect; Dol
Guldur's Forced effect (the city strength falls by the siege values of this
round); Standard Game Mode's Forced effect, which randomly selects one of the
other stage 3 cards and resolves its Forced effect, then discards all progress
and advances to a new stage 3 of the players' choice.

The scenario panel shows the side and its rule, the city strength, the siege
value of the round, 1B's resources, Power of Lórien's progress or controller,
Host of Lórien and where each Lieutenant is.

## Encounter cards

| Card                   | Behaviour                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dol Guldur             | The siege tracker; its Forced effect lowers the city strength at the end of each round at stage 3.                                                                       |
| Power of Lórien        | Gathers 1B's progress. Under a player's control: add it to the victory display to cancel and discard an encounter card just revealed (in the reveal window).             |
| Host of Lórien         | Objective-ally (3/3/3/6): Ranged, Sentinel, immune to player card effects, does not exhaust to quest; removed from the game when it leaves play.                         |
| Bane of Amon Lanc      | When it attacks you, discard a random card from your hand: +X attack (its printed cost).                                                                                 |
| Sorcerer of Dol Guldur | When it attacks you, discard the top card of your deck, then each copy of it (same title) from play.                                                                     |
| Chieftain Morlug       | When it attacks you, discard from the encounter deck until an enemy, which engages you.                                                                                  |
| Dungeon Dweller        | When it attacks you, discard an ally you control.                                                                                                                        |
| Host of Dol Guldur     | X threat and Archery X (the number of players); no attachments; at the end of the encounter phase, if staged, remove X progress.                                         |
| Mirkwood Olog-hai      | After its attack destroys a character, 1 progress is removed per excess damage. Shadow: remove 2 progress, or the attacker returns to the staging area after the attack. |
| Beast of Taur-nu-Fuin  | No attachments; its shadow cards cannot be canceled. When it attacks: remove 2 progress, or it is dealt another shadow card.                                             |
| Amon Lanc Archer       | Archery 2. After it engages you: remove 2 progress, or 2 damage to an ally. Shadow: exhaust a character.                                                                 |
| Dol Guldur Marauder    | +1 attack and defense per resource. When it attacks: remove 1 progress, or a resource on it.                                                                             |
| Battle Warg            | Surge. After it engages you: remove 1 progress, or discard an attachment. Shadow: discard an attachment.                                                                 |
| Dol Guldur locations   | Gate of Dol Guldur (3B), The Sorcerer's Tower (3D), The Shadow Road (3F), Dungeon Door (3H): while staged, no travel or progress there except at their stage.            |
| Gate of Dol Guldur     | Each player's threat cannot be reduced by more than 1 each round by player card effects.                                                                                 |
| The Sorcerer's Tower   | After a 'when revealed' effect is canceled, the top encounter card is revealed.                                                                                          |
| The Shadow Road        | +2 threat per facedown card attached; an event played during the quest phase is attached to it facedown when it finishes.                                                |
| Dungeon Door           | No more than 1 damage healed from each character each round.                                                                                                             |
| Forest Battleground    | +1 threat per ally of the player with the most. When explored, each player searches for an Orc enemy and stages it.                                                      |
| Blackened Woods        | When explored, discard the top encounter card: each player raises his threat by its printed threat. Shadow: +1 attack; a destroyed character removes 3 progress.         |
| Servant of Sauron      | Surge. The staged enemy with the highest engagement cost attacks the first player. Shadow: an additional attack.                                                         |
| Power Sevenfold        | Doomed 1. Each player stages a Dol Guldur location or engages an Orc enemy from the encounter deck or discard pile.                                                      |
| The Necromancer's Rage | 1 damage to each exhausted character; damaged characters get -1 willpower this phase. Shadow: 1 damage to the defender, -1 defense per damage on it this phase.          |
| Fear and Despair       | Doomed 1. Each player exhausts a character; player card effects cannot ready characters this round. Shadow: the defender cannot ready this round.                        |
| Fastness of Mirkwood   | No more than 5 progress on the current quest this round; surge at 5 city strength or less. Shadow: +1/+1 for the phase (+2/+2 with at least 5 progress).                 |

Interpretations:

- **The win** is checked at the beginning of the end of the round and again
  after Dol Guldur's Forced effect: the players choose the order of the
  end-of-round triggers, so a round in which the city strength is 0 and the
  last Lieutenant falls is won before a new stage 3 brings another one. A
  Lieutenant whose damage already reaches its hit points falls as soon as the
  city strength reaches 0.
- **The random stage 3** is not in play and has no progress, so only its
  penalty can resolve (its "additional 5 progress" cannot be paid).
- **"Additional" progress** can be removed for a stage's benefit only after
  its first 5 progress were removed.
- **Choices with a progress cost** offer only the other option when there is
  no progress to remove, and an option that cannot change the game is not
  offered.
- **The searches** of the encounter deck and discard pile shuffle the
  encounter deck; the searches of a player deck shuffle that deck.

## Verification

```sh
npm run test:engine
npm run test:attack-dol-guldur-simulation
npm run build
npm run test:browser-attack-dol-guldur
npm run audit:rules
```

The focused suite (`tests/attack-dol-guldur.test.ts`, 12 tests) covers setup
for one to four players, 1B's Forced effect and Response, the crossing with
Host of Lórien and Power of Lórien, the stage 3 rotation and the Lieutenants,
each stage 3's Forced effect, siege values, the random stage, the win, every
Lieutenant, enemy, location, treachery and shadow, Power of Lórien's cancel,
Host of Lórien's removal, saves and the scenario panel. The source test pins
the snapshot, the quantities, the siege values and all 40 faces.

The complete-game matrix (`npm run test:attack-dol-guldur-simulation`, in two
CI partitions: complete games and late-game starts) plays 34 games (3,725
actions) with exact save restoration after every action, physical
conservation (the set-aside cards, the cards removed from the game, Power of
Lórien in a player's play area and the treacheries being resolved) and
private-view checks, and 14 exact paced/immediate terminal-state comparisons.
From setup, the starter decks lose all 14 games, the longest after they reach
stage 3. The 10 games started at The Siege of Dol Guldur after the crossing,
with Host of Lórien and Power of Lórien in play and the city strength at 4,
visit all four stage 3 cards and three of their Lieutenants but lose with the
city strength at 3 or 4; the 10 started in the last fight, with the city
strength at 0 and Bane of Amon Lanc engaged with 3 hit points left, are all
won. In the last fight the player engaged with a Lieutenant that has lost
indestructible keeps every character back to attack it.

The browser suite runs eight native setups (both difficulties, one to four
players) with exact physical inventories and shows all six quest cards, 1B's
end of the round, the crossing, the choice of a stage 3, The Siege of Dol
Guldur with Bane of Amon Lanc, a stage's Forced effect and benefit, Power of
Lórien's cancel, archery, The Shadow Road with a facedown event and the
capture of Dol Guldur at 1280/390/320px; it checks all 40 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
