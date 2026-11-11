# Over the Misty Mountains Grim

The second scenario of **The Hobbit: Over Hill and Under Hill** follows
[We Must Away, Ere Break of Day](WE-MUST-AWAY.md), whose page describes the
shared Saga rules for the Baggins-sphere Bilbo Baggins. It is playable in
classic solo and with one to four local players, in normal and easy mode, and
adds the box's three treasures.

## Sources and corrections

- Recipes Q0A.2 (56 encounter cards) and E0A.2 (38) match the normal and easy
  quantities on [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Over-the-Misty-Mountains-Grim),
  recorded in `tests/misty-mountains-source-quantities.json`. The atlas
  difficulty of 5 rounds Hall of Beorn's community rating of 5.3.
- The immutable snapshot `src/data/pending/over-the-misty-mountains-grim-import.json`
  has SHA-256
  `f247e78bb1696218ab66b879c163fc5d609b701009c53a6d516ff88edea7232e`.
- The source recipe places one Stone-Giant in the staging area. Stage 1A's
  setup does not, and stage 2B searches one out, so that copy begins in the
  first encounter deck.
- `tests/misty-mountains-art.json` pins all **30 scenario faces** (the 22 new
  faces were visually reviewed; the Western Lands and Bilbo faces are shared
  with We Must Away) and the scans of **Sting, Orcrist and Glamdring**.

The scans confirm the catalog text. Stage 2A is flavour only.

## Scenario rules

| Stage | Quest points | Rules |
| --- | --- | --- |
| 1A/1B A Short Rest | 0 | Setup builds the active first deck (Over the Misty Mountains Grim and Western Lands) and sets aside the inactive Goblin deck (The Great Goblin and Misty Mountain Goblins). After the opening hands are kept, each player may search their deck for a treasure, then the quest advances. |
| 2A/2B The Mountain Pass | 16 | A Stone-giant is searched out to the staging area, then one card per player is revealed. |
| 3A/3B Down, Down to Goblin Town | 20 | Every encounter card in play and the discard pile join the first deck, which is set aside; the Goblin deck becomes active and The Great Goblin enters the staging area. 3B reveals 3 cards per player, fewer by the Baggins resources Bilbo's controller spends (at least 1). It cannot be defeated until The Great Goblin is in the victory display; defeating it wins. |

| Card | Behaviour |
| --- | --- |
| Galloping Boulders | The first player chooses a questing character: 3 damage and removed from the quest. Surge while a Stone-giant is in the staging area. Shadow: back on top of the deck. |
| Guffawing of Giants | The chosen Stone-giant engages the highest-threat player (ties chosen by the first player) at the end of the quest phase; with none in the staging area one is searched out instead. |
| Stone-Giant | Engaging a player makes that player discard an ally they control. |
| The High Pass | X threat (players); at the end of the round removes X progress from the quest. |
| Overhanging Rock | While active, Bilbo's controller may spend 1 Baggins resource to keep one of the top two cards of their deck and discard the other. |
| Front Porch | While active, Goblins cannot be attacked. The first player may spend 2 Baggins resources to blank it until the end of the round. |
| Great Cavern Room | While active, engaging a Goblin costs 1 damage to a character of that player. With The Great Goblin in the victory display the players must travel to it. |
| The Goblins' Caves | While active, Goblins get +1 threat. Shadow: +1 threat per engaged Goblin. |
| The Great Goblin | After it attacks, X cards are discarded from the deck and the Goblins among them enter the staging area. Victory 3. |
| Goblin Axeman, Goblin Miners | +1 attack / +1 defense per Cave location in play. Shadows: −1 defense / +1 attack. |
| Goblin Driver | Its reveal and shadow exhaust a character. |
| Goblin Runners | Surge. Shadow: an additional attack. |
| Goblin Bent-Swords | Surge once The Great Goblin is defeated. Shadow: +1 attack (+2). |
| Grip, grab! Pinch, nab! | Each player returns a Goblin from the discard pile to the staging area. Shadow: one damage per engaged Goblin, assigned one at a time. |
| Chaos in the Cavern | Engaged enemies return to the staging area and Goblins get +1 threat until the end of the phase. Shadow: the attacker returns after its attack. |

The Western Lands cards keep the rules they have in We Must Away.

## Treasures

| Treasure | Behaviour |
| --- | --- |
| Sting | Attach to Bilbo Baggins. +1 willpower, attack and defense. After Bilbo exhausts to defend, discard the top encounter card to deal damage equal to its threat (X threats counted). |
| Orcrist | Attach to a hero. +2 attack. After the hero destroys an Orc, add 1 resource to it (not to Bilbo). |
| Glamdring | Attach to a hero or Gandalf. +2 attack. After the character destroys an Orc, draw a card. |

All three are Restricted, unique and free. They are played as attachments,
cannot be built into a deck and join one only when discovered: winning We Must
Away with Troll Cave explored records them for that group of heroes, and the
fellowship screen of a Hobbit scenario that lists the treasure set offers each
to a player's deck (outside the deck size). The engine accepts each treasure
once across the table.

## Verification

```sh
npm run test:engine
npm run test:misty-mountains-simulation
npm run build
npm run test:browser-misty-mountains
npm run audit:rules
```

The focused suite covers setup and inventory, the treasure search and deck
rules, every stage including the deck swap and the Great Goblin requirement,
every card, the treasures and malformed saves. The complete-game matrix plays
fourteen games with the treasures in the first player's deck, exact save
restoration after every action, physical conservation and private-view checks.
The browser suite also starts a game with recorded treasures from the fellowship
screen.

The additive account-choice SQL migration is included; it has not been applied
to a hosted database.
