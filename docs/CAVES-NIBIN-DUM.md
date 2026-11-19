# The Caves of Nibin-Dûm

The second scenario of the Two-Player Limited Edition Starter (2018), reprinted
with Crumbling Stairs in The Dark of Mirkwood (2022). Both versions are in the
atlas as separate adventures, playable in classic solo and with one to four
local players, in normal and easy mode:

- **The Caves of Nibin-Dûm (Two-Player Limited Edition Starter)**
  (`the-caves-of-nibin-dum-2018`): the Starter's recipe, Q00.02A ("The Caves
  of Nibin-Dûm (Limited Collector's Edition)").
- **The Caves of Nibin-Dûm** (`the-caves-of-nibin-dum`): The Dark of
  Mirkwood's recipe, Q00.02B, which adds Crumbling Stairs and the Goblins
  set's Wild Wargs and Obsidian Arrows ×2; easy recipe E00.02B.

The Goblins have carried the woodmen's captives into the caves of Nibin-Dûm.
The players light the way with Cave Torch, survive the surprise attack led by
Goblin Chieftain, break Cracked Pillar to cross the chasm and defeat the
Chieftain at Oathkeepers to rescue the captives.

In campaign mode, The Dark of Mirkwood's version is Part 5 of the Mirkwood
Paths campaign, or Part 2 of its two-scenario mini campaign, with its campaign
card, boons and burdens: see [The Dark of Mirkwood campaign](DARK-MIRKWOOD-CAMPAIGN.md).

## Sources and corrections

- The recipes match
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Caves-of-Nibin-D%C3%BBm):
  32 encounter cards in the Starter's version (24 in easy mode) and 36 in The
  Dark of Mirkwood's (28), plus 4 quest cards. Each location but Cracked
  Pillar and Crumbling Stairs has two copies. Hall of Beorn's community rating
  of 4.7 gives the Starter's version an atlas difficulty of 5; The Dark of
  Mirkwood's harder cards give it 6.
- **Easy mode** removes the cards with the gold easy-mode icon: Great
  Cave-troll ×2, Branching Paths ×2, Watchful Eyes, Goblin Runners ×2 and
  Goblins are Upon You!. The Dark of Mirkwood's E00.02B does so; the Starter
  printed the same icons, so its easy mode removes the same cards (24
  encounter cards, as Hall of Beorn lists).
- The recipes' prepared staging area lists one copy of each location; those
  copies belong to the encounter deck, where 1B's searches find them.
- Two immutable snapshots:
  `src/data/pending/the-caves-of-nibin-dum-import.json` (Q00.02B and E00.02B,
  SHA-256
  `f972ca825e6d64df4b53a5eb96d999fdf5e447e8409bf0a66fb483c53056fabd`) and
  `src/data/pending/the-caves-of-nibin-dum-limited-collector-s-edition-import.json`
  (Q00.02A, SHA-256
  `9af0dd0b2b4e4897e439d017786faa6b2946d19be9f27c9279ee0a9037c4841e`).
  `tests/caves-nibin-dum-source-quantities.json` keeps every card's quantity
  in all four recipes.
- `tests/caves-nibin-dum-art.json` pins all **30 faces** (26 cards; the quest
  cards have two faces). The 8 cards of the Goblins set are The Oath's, with
  its reviewed data; the 18 cards of the Caves set were checked by eye and
  correct the catalog:
  - The catalog leaves out the shadow effects of Cavern Warg, Collapsed Mine,
    Goblin Tunnels, Lightless Passage and Lost in the Dark.
  - Typos: 1A "The first player attaches Cave Torch", Cave Torch "Attach to a
    hero. Restricted." and "Exhaust", Cracked Pillar's [threat], 2B "each
    enemy's engagement cost" and "This stage gets", 4B "loses the text
    "Cannot take damage."".
  - The catalog glues each quest card's front text before its back text; the
    paragraphs follow the cards and straight quotes replace its backticks.
  - The scans give Cavern Warg 33 engagement cost, 2 threat, 3 attack, 2
    defense and 3 hit points, and Goblin Chieftain X threat, attack and
    defense.
- **The Goblins set** is shared with The Oath (`src/game/goblins-set.ts`):
  Goblin Troop, Goblin Sniper (with the Core Set's rules), Goblin Runners,
  Goblintown Scavengers, Goblins are Upon You!, Eyes in the Dark, Wild Wargs
  and Obsidian Arrows play exactly as in The Oath.

## Setup and stages

Setup (1A): Goblin Chieftain and Cracked Pillar are set aside, out of play,
and the first player attaches Cave Torch to one of his heroes.

| Stage                       | Quest points    | Rules                                                                                                                                                                                                                                                                                     |
| --------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The Dark of Nibin-Dûm | 8               | When Revealed: each player searches the encounter deck for a different location and adds it to the staging area; the deck is shuffled.                                                                                                                                                    |
| 2A/2B Surprise Attack       | 0, +4 per enemy | When Revealed: Goblin Chieftain is added to the staging area and each player searches the encounter deck and discard pile for a different enemy and adds it; the deck is shuffled. During the encounter phase, each enemy's engagement cost is 0. +4 quest points for each enemy in play. |
| 3A/3B The Chasm             | –               | When Revealed: Goblin Chieftain is set aside, out of play, and Cracked Pillar is added to the staging area. An additional encounter card is revealed during the quest phase; no progress on Cracked Pillar in the staging area; after it leaves play explored, the players advance to 4A. |
| 4A/4B Oathkeepers           | 8               | When Revealed: Goblin Chieftain is added to the staging area. With 8 progress on the stage, the Chieftain loses "Cannot take damage." The stage cannot be defeated while it is in play; defeating it wins the game.                                                                       |

The scenario panel shows the side and its rule, the edition, Cave Torch
(ready, exhausted or out of play, and its hero), Goblin Chieftain (set aside,
in play, gone) and Cracked Pillar (set aside, its damage in the staging area,
active, explored).

## Encounter cards

| Card              | Behaviour                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goblin Chieftain  | X threat, attack and defense (the stage number); 8 hit points. Cannot take damage (except at 4B with 8 progress); no attachments. After it attacks: remove X progress from the quest, or it returns to the staging area. |
| Cracked Pillar    | In the staging area, the first player may attack it during the combat phase as if it were an enemy engaged with him, against its threat as defense. Travel: remove 4 damage from it.                                     |
| Cave Torch        | Attach to a hero; Restricted. Action: exhaust it to place up to 3 progress on a Dark location. Forced: after it exhausts, the top encounter card is discarded; an enemy is added to the staging area.                    |
| Great Cave-troll  | No attachments. Each point of excess combat damage it deals removes 1 progress from the current quest.                                                                                                                   |
| Cavern Warg       | Response: when it attacks you, exhaust Cave Torch to cancel the attack and return it to the staging area. Shadow: if the attack destroys a character, the attacker returns to the staging area after it.                 |
| Goblin Tunnels    | Dark. While staged: after a Goblin is revealed from the encounter deck, 1 progress is removed from the quest. Shadow: +1 attack (+3 for a Goblin).                                                                       |
| Lightless Passage | Dark. Travel: the players exhaust a Cave Torch. Shadow: all combat damage dealt to the attacker is canceled.                                                                                                             |
| Branching Paths   | Dark. While staged, each Dark location gets +1 threat. Explored: the players reveal 1 of the top 3 encounter cards; the other 2 go to the bottom of the deck.                                                            |
| Collapsed Mine    | Dark. While staged, no more than 4 progress can be placed on the quest each round. Shadow: raise your threat by 1 for each point of damage dealt by this attack.                                                         |
| Goblin Dungeon    | Travel: reveal the top encounter card. Response: explored, the first player searches the top 5 cards of his deck for an ally and puts it into play.                                                                      |
| Crumbling Stairs  | (2022) No progress while staged. Explored: the top encounter card is discarded; a location becomes the active location.                                                                                                  |
| Crumbling Ruin    | Each player exhausts a character and discards the top card of his deck; a printed cost at least the character's remaining hit points discards the character.                                                             |
| Lost in the Dark  | The player who controls Cave Torch exhausts it, or progress cannot be placed on the quest until the end of the phase (the active location still takes progress). Shadow: 1 damage to the defender.                       |
| Watchful Eyes     | The first player attaches it to one of his heroes (limit 1 per hero): at the end of the combat phase, if that hero is exhausted, an encounter card is revealed.                                                          |

Interpretations:

- **Goblin Chieftain's Forced effect** returns it to the staging area only
  from engagement; attacking from the staging area, only the progress can be
  removed. With no progress on the quest, it returns. An additional attack it
  was to make (Goblin Runners' shadow) is not made after it has returned.
- **Cave Torch** goes to the encounter discard pile when its hero leaves play.
  Revealed again from the encounter deck, the first player attaches it to a
  hero.
- **Lost in the Dark** with Cave Torch exhausted or out of play leaves no
  choice: the quest takes no progress until the end of the phase.
- **Cracked Pillar's attack** is declared by the first player with his ready
  characters and the Ranged characters of the other players, once each round;
  the attackers exhaust. Its damage stays on it in the staging area, and its
  travel cost removes 4 of it. Explored at another stage (after the encounter
  discard pile was shuffled back), it does not advance the quest.
- **Cave Torch's progress** stops at the progress the location still needs.
- **The searches** of 1B and 2A are made in turn order, each player taking a
  title no earlier player chose; a player who finds none takes nothing.

## Verification

```sh
npm run test:engine
npm run test:caves-nibin-dum-simulation
npm run build
npm run test:browser-caves-nibin-dum
npm run audit:rules
```

The focused suite (`tests/caves-nibin-dum.test.ts`, 13 tests) covers setup for
both editions and difficulties in one to four players, every stage transition
and search, 2B's quest points and engagement costs, Cracked Pillar's attack
and travel, the Chieftain's stages, damage and Forced effect, the win, Cave
Torch, every enemy, location, treachery and shadow, the Goblins set in the
caves, saves and the scenario panel. The source test pins both snapshots, the
quantities of all four recipes and all 30 faces.

The complete-game matrix (`npm run test:caves-nibin-dum-simulation`, in four
CI partitions: each edition's complete games and late-game starts) plays 68
games (7,801 actions) with exact save restoration after every action, physical
conservation (the set-aside Goblin Chieftain and Cracked Pillar, Cave Torch and
Watchful Eyes on their heroes and the treacheries being resolved) and
private-view checks, and 28 exact paced/immediate terminal-state comparisons.
From setup, the starter decks lose all 28 games, most of them at The Dark of
Nibin-Dûm; the longest, The Dark of Mirkwood's easy mode for one player,
reaches Surprise Attack and lasts 13 rounds. The 20 games started at The Chasm,
with Cracked Pillar in the staging area, attack it (up to 7 damage) and lose,
one of them after crossing to Oathkeepers; the 20 started in the last fight at
4B, with 16 progress on the stage and Goblin Chieftain engaged with 3 hit
points left, win 18. In the last fight the player engaged with the Chieftain
keeps every character back while the stage holds 12 progress, removes X
progress only while 8 remain, and defends Great Cave-troll with the character
that takes the least excess damage.

The browser suite runs sixteen native setups (both editions, both
difficulties, one to four players) with exact physical inventories and shows
the four quest cards, 2A's enemy search, Cave Torch's action, Cavern Warg's
response, Lost in the Dark, Watchful Eyes, Branching Paths, the attack on
Cracked Pillar and the travel there, Goblin Chieftain's Forced effect, 4B held
by the Chieftain and the victory at 1280/390/320px; it checks all 30 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
