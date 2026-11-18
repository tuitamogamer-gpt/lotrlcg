# Escape from Khazad-dûm

The Fellowship event scenario of 2019 (`escape-from-khazad-dum`), played
cooperatively in classic solo and with one to four local players, in normal
and easy mode. The players entered Moria hoping to find mithril but are lost
below the ancient mansions of the Dwarves: they climb out of the Dark Pit,
search for an exit and flee Durin's Bane at the East Gate.

The players **build** the scenario before the first round, as in the earlier
Fellowship events, with the shared Fellowship event module
(`src/game/fellowship-event*.ts`). The quest deck is Out of the Depths and one
of the three stage 2 and one of the three stage 3 cards; the encounter deck is
7 of the 14 encounter sets of 5 cards (the quick build). The first player
makes each choice in the quick-build dialogs, or lets the remaining choices be
made at random (deterministically from the game's seed). 1A adds Dark Pit and
one different 0 cost enemy or location per player; stage 3's A side, Nearing
the Gate, adds Durin's Bane instead of searching the top 5 encounter cards,
which the shared module now lets a scenario do.

## Sources and corrections

- The recipe (Q99.14) holds 70 encounter cards in 14 sets numbered 15 to 28,
  listed as its quest deck section, and sets aside Dark Pit and the 7 quest
  cards (78 cards). Each set has 5 cards with a total printed cost of 3, so
  every quick-built encounter deck holds 35 cards costing 21.
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Escape-from-Khazad-dûm)
  lists only the scenario's own set: Dark Pit, the quest cards and Durin's Bane
  with no copies.
- The immutable snapshot `src/data/pending/escape-from-khazad-dum-import.json`
  (SHA-256
  `a477a352e242cd7fcb7058f470c2bc78468abaf2a4d1aca5cd6b33f52ae62374`) holds
  the 50 cards; `tests/escape-khazad-source-quantities.json` keeps every card's
  quantity, type, set and cost.
- **Durin's Bane** is Dark Pit's other side (cards #10 and #11, like The
  Watcher and Chamber of Mazarbul in The Mines of Moria). The snapshot has no
  back for Dark Pit: the catalog lists Durin's Bane as its own card outside the
  recipe, and its scan, from the same source, is pinned as the 58th face; the
  data gives Dark Pit that back.
- `tests/escape-khazad-art.json` pins all **58 faces** (the 7 quest cards have
  two faces). Every face was checked by eye against the catalog, which the
  scans correct:
  - The catalog has **no cost** for any card: every encounter card's cost is
    read from the "COST" box in the lower right corner of its scan. Dark Pit
    and Durin's Bane have none.
  - 1B has no "Shuffle the encounter deck." (the catalog repeats it from 1A).
  - A Way Up: the players must travel "to a location", if able; Bottomless
    Chasm: "the players must travel to Bottomless Chasm, if able" (the catalog
    says the player must choose it); Goblin Dungeon places the ally "under
    Goblin Dungeon"; Black Uruks count each shadow card "it is dealt".
  - Last Lord of Moria: "each round" (the catalog says "per round"); The
    Bridge of Khazad-dûm's title and its comma.
  - Typos: 2A "It's", Old One Lair "searchs" and "a resources", Dark Pit's "2
    or more players", Durin's Bane "Immuned", Black Bats "Eithe", Old
    Stone-troll "attachs", Lost and Alone "charactert", Hobgoblin
    "Hobgobling", Unspeakable Thing "thing", Shadow Dweller "character", Orc
    Raiders "Raider", Nameless Thing "guarded attached", Mithril Lode
    "Mitril", the doubled "Surge." of Undisturbed Bones and the closing
    quotation marks of Elder Nameless Thing and Mithril Lode. Unspeakable
    Thing is a Creature and Orc Raiders are Uruks; The Mountain's Roots has X
    threat.
  - The Rear Guard prints "player card effect" in the singular, and stays so.
  - The catalog writes every apostrophe and quotation mark as a backtick,
    prints no shadow effect (the scans add 22) and runs paragraphs together.
- Hall of Beorn gives the scenario no difficulty rating; the atlas rates it 6.
- **Easy mode** keeps the whole recipe (the event predates easy-mode icons) and
  gives each hero its additional starting resource.
- **Not supported**: the advanced build and the competitive mode, in which two
  teams each play their own game and resolve the 'opposing team' effects for
  each other.

## The cooperative rules

Each effect that names **the opposing team** is resolved by the first player,
who is asked to resolve it in the way that provides the greatest challenge:
1A's search, the searches of 2A and of Dark Pit's travel, Old One Lair's
enemy, Watchful Eyes' hero, Nest of Vermin's and Frightful Den's searches, Lost
and Alone's characters, Many Roads' locations (and its shadow's), Goblin
Dungeon's ally, Dreadful Gap's card, Black Uruks' shadow card, Vast and
Intricate's location and A Foe Beyond's attachment. Choices an encounter card
leaves to the players (Black Bats' when revealed effect, Lightless Grotto's
enemy, Orcish Howls' characters, a tie for Chance Encounter's enemy, Mithril
Lode) are made by the first player; Cave Spider's and Black Bats' shadow
choices by the attacked player, and Deep Deep Dark's by each player.

## Setup and stages

| Stage                        | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1A/1B Out of the Depths      | 10           | Setup: Dark Pit (unique, immune, 1 threat, 1 quest point) joins the staging area with one different 0 cost enemy or location per player. Traveling to Dark Pit reveals a card with cost 1 or less (2 or less with two or more players) from the top 5, whose 'when revealed' effects cannot be canceled. Explored, Dark Pit flips over: Durin's Bane is set aside, and each player searches the top 5 cards of their deck for a card to add to their hand. The stage cannot be defeated while Dark Pit is in play. |
| 2A Search for an Exit (each) | –            | The opposing team reveals a card from the top 5 with cost 1 or less (2 or less with two or more players); its 'when revealed' effects cannot be canceled.                                                                                                                                                                                                                                                                                                                                                          |
| 2B Old One Lair              | 10           | When revealed, the opposing team adds an enemy with cost 2 or less from the encounter deck or discard pile with a resource on it; that enemy is immune to player card effects, and no progress can be placed on the stage while it is in play.                                                                                                                                                                                                                                                                     |
| 2B A Wrong Turn              | 15           | When revealed, each player keeps 1 card in their hand and shuffles the rest into their deck.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2B A Way Up                  | 20           | The active location's threat is added to the staging area; the players must travel to a location, if able.                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3A Nearing the Gate (each)   | –            | Durin's Bane joins the staging area; it cannot take damage this round, and with more than 1 player it makes an immediate attack against the first player.                                                                                                                                                                                                                                                                                                                                                          |
| 3B The Bridge of Khazad-dûm  | 10           | No more than 5 progress each round. At the beginning of each quest phase, Durin's Bane attacks the first player: undefended or excess damage goes onto the stage, and 10 damage there loses the game. Defeating the stage wins.                                                                                                                                                                                                                                                                                    |
| 3B Last Lord of Moria        | 15           | Durin's Bane engages the first player; it cannot take more than X damage each round, X the progress on the stage. The stage cannot be defeated while Durin's Bane is in play; defeating it wins.                                                                                                                                                                                                                                                                                                                   |
| 3B The Rear Guard            | 20           | Threat cannot be reduced by player card effects. Durin's Bane is considered engaged with each player and attacks each of them in the combat phase. Defeating the stage wins.                                                                                                                                                                                                                                                                                                                                       |

**Durin's Bane** (unique Balrog, 50 engagement, 4 threat, 8 attack, 3
defense, 15 hit points, victory 5) is immune to player card effects and cannot
be optionally engaged; after it attacks and destroys a character, that
character's controller raises their threat by 2 and 2 damage is healed from it.

The scenario panel shows the side and its rule, the chosen stage 2 and stage 3
cards (or the quick build in progress), the encounter sets, Dark Pit or
Durin's Bane, the damage on The Bridge of Khazad-dûm and the progress it can
still take this round, Old One Lair's enemy, Goblin Dungeon's guarded allies
and the cards held by Nameless Things. The journey counts 3 stages; the atlas
lists all 7 quest cards under their stage numbers.

## Encounter cards

| Set | Cards                                                        | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15  | Black Bats ×3, Nest of Vermin, Swarm of Bats                 | Black Bats raise each threat by 2 or reveal another card; shadow: your threat +2, or the attack is undefended. The Nest gives Creature enemies +1 threat and, explored, adds a Creature of cost 1 or less. Swarm of Bats: each character -1 willpower this phase; shadow: -1 attack and defense to your characters.                                                                                      |
| 16  | Cave Spider ×2, The Mountain's Roots ×2, Watchful Eyes       | Cave Spider removes 2 progress or gets +2 attack when it attacks (and as a shadow). The Roots have X threat (1 more than the stage) and discard the top X cards of each deck on travel. Watchful Eyes, on a hero, reveals a card if the hero is exhausted at the end of the combat phase.                                                                                                                |
| 17  | Cave-troll, Twisting Passage ×2, Undisturbed Bones ×2        | The Cave-troll has no player attachments and cannot be attacked or defended by allies. The Passage stages the top card if it is a location. Undisturbed Bones (surge) is attached to the main quest and discarded instead of a 'when revealed' effect being canceled.                                                                                                                                    |
| 18  | Old Stone-troll, Frightful Den, Deep Deep Dark ×3            | The Stone-troll raises its victim's controller's threat by the excess damage. The Den gives Trolls -10 engagement cost and, explored, adds a Troll of cost 1 or less. Deep Deep Dark: 1 threat per character, or discard a character; shadow: 1 threat per engaged enemy.                                                                                                                                |
| 19  | Rock Adder ×2, Bottomless Chasm ×2, Lost and Alone           | The Adder cannot be defended; shadow +2 attack if undefended. The Chasm must be traveled to, if able; shadow +2 defense this phase. Lost and Alone removes a questing character of each player; shadow: the defender cannot ready this round.                                                                                                                                                            |
| 20  | Hobgoblin, Western Hall, New Devilry ×3                      | The Hobgoblin cannot take damage the round it engages; shadow: no damage this phase. The Hall's travel raises each threat by the printed threat of the top card; shadow: a destroyed character reveals a card. New Devilry blanks each character's text box this round; shadow: the defender's this phase.                                                                                               |
| 21  | Unspeakable Thing ×2, Lightless Grotto ×2, Many Roads        | The Thing gets +X attack, the printed cost of the top card of the defending player's deck; shadow +1 attack. The Grotto protects non-unique staged enemies from damage and engages a staged enemy on travel. Many Roads adds one different 0 cost location per player; shadow: a location from the discard pile goes back into the deck.                                                                 |
| 22  | Shadow Dweller, Branching Paths ×3, Fatigue                  | The Dweller takes only combat damage, has no player attachments and deals X damage (the cost of the top card of the defending player's deck) among their characters. The Paths get +1 threat per staged location (up to +3); shadow +1 attack. Fatigue: each player exhausts a character, and no player card readies characters this round; shadow: the defender is removed and another may be declared. |
| 23  | Elder Nameless Thing, Silent Caverns ×2, Dark Places ×2      | The Elder cannot be optionally engaged and attacks the first player after the commit. The Caverns limit threat reduction to 1 per player each round and raise each threat by 2 on travel. Dark Places raises each threat by the active location's threat, else surge; shadow +X attack (the stage number).                                                                                               |
| 24  | Orc Horn Blower ×2, Goblin Dungeon, Deep Fissure ×2          | The Horn Blower deals each engaged enemy an additional shadow card at the beginning of combat; shadow: 2 more. The Dungeon guards an ally (its tokens discarded) until explored, when it returns exhausted. Deep Fissure: 1 damage to a questing character of each player, removed from the quest; shadow: 1 damage.                                                                                     |
| 25  | Black Uruks ×2, Dreadful Gap ×2, Orcish Howls                | Black Uruks get +1 attack per shadow card; shadow: a card from the top 5 is dealt as another shadow card. The Gap blocks progress on other staged locations and shuffles a discarded card back on travel. Orcish Howls exhausts a character per Uruk, else surge; shadow +1 attack (+2 for an Uruk).                                                                                                     |
| 26  | Orc Raiders ×2, The Great Bridge, Vast and Intricate ×2      | The Raiders are dealt a shadow card when they engage; shadow +1 attack and another shadow card. The Bridge allows 1 attacker per enemy and, explored, reveals a card per player. Vast and Intricate gives a non-unique staged location +2 threat and immunity, else surge.                                                                                                                               |
| 27  | Chieftain of the Pit, Forked Passage ×2, Chance Encounter ×2 | The Chieftain takes only combat damage, has no player attachments, keeps shadow effects from being canceled and is dealt an additional shadow card when it attacks. The Passage adds 1 threat in the refresh phase and on travel. Chance Encounter: the highest attack staged enemy attacks the first player, else surge; shadow: a unique attacker attacks again.                                       |
| 28  | Nameless Thing ×2, Mithril Lode ×2, A Foe Beyond             | The Thing holds the top card of the first player's deck and gets +X threat, attack and defense (its printed cost); the card is discarded when it leaves play. The Lode, explored as the active location, gives each player a resource. A Foe Beyond discards an attachment, else surge; shadow: one of yours.                                                                                            |

Interpretations:

- **Dark Pit's flip** happens when it is explored at 1B: the card leaves play
  as Durin's Bane, set aside, and 3A adds it to the staging area.
- **Nearing the Gate's immediate attack** is dealt a shadow card, as every
  immediate attack in the engine.
- **Last Lord of Moria** engages Durin's Bane with the first player when the
  stage is revealed, and again whenever it returns to the staging area or the
  first player token passes.
- **The Bridge of Khazad-dûm**: an undefended attack places all its damage on
  the stage; a defended one, the damage beyond the defender's remaining hit
  points.
- **Undisturbed Bones** answers A Test of Will (whose effect is canceled, as
  with Fire-filled Trench) and Eleanor (who stays exhausted); one copy is
  discarded and the card resolves.
- **Chieftain of the Pit** keeps every shadow effect from being canceled while
  it is in play, as printed.
- **Searches of the top 5 cards** that do not say to shuffle (Black Uruks'
  shadow) leave the other cards in place.
- **Goblin Dungeon** returns its ally also if it leaves play without being
  explored; an eliminated player's guarded allies and Nameless Things' cards
  leave the game with their other cards.
- **Swarm of Bats and New Devilry** affect the characters in play as they
  resolve.

## Verification

```sh
npm run test:engine
npm run test:escape-khazad-simulation
npm run build
npm run test:browser-escape-khazad
npm run audit:rules
```

The focused suites (`tests/escape-khazad.test.ts`, 12 tests, and
`tests/escape-khazad-cards.test.ts`, 14 tests, one per encounter set) cover
the quick build and its random choices, setup in one to four players and both
difficulties, Dark Pit and Durin's Bane, every stage, search and win
condition, every enemy, location, treachery and shadow effect, and saves. The
source test pins the snapshot, every card's quantity, set and cost, the scan
corrections and all 58 faces.

The complete-game matrix (`npm run test:escape-khazad-simulation`, in four CI
partitions: each difficulty's complete games and late-game starts) plays 44
games (5,959 actions) with exact save restoration after every action, physical
conservation (the box, the quest deck and the defeated quest cards, Dark Pit
and Durin's Bane as one card, Goblin Dungeon's guarded allies, Nameless
Things' attached cards and the treacheries being resolved) and private-view
checks, and 18 exact paced/immediate terminal-state comparisons. The quick
build is random and each 'opposing team' choice takes the greatest challenge.
From setup, the starter decks lose all 14 games at Out of the Depths, the
longest in round 6. The 10 games started at the end of Out of the Depths, with
Dark Pit explored and Old One Lair next, lose at Old One Lair, the longest in
round 7; the 10 started at the end of A Way Up lose at The Bridge of
Khazad-dûm, the longest in round 4; the 10 started in the last fight at Last
Lord of Moria, with 15 progress on the stage and Durin's Bane engaged with the
first player with 2 hit points left, are all won.

The browser suite runs eight native quick builds (both difficulties, one to
four players, a different stage 2 and stage 3 card and set each time) with
exact physical inventories, and shows the quick-build dialogs, all seven quest
cards front and back, Dark Pit and its travel search, Out of the Depths'
search, Old One Lair, Goblin Dungeon's guarded ally with a Nameless Thing's
card, Durin's Bane's attack at The Bridge of Khazad-dûm and the victory at
1280/390/320px; it checks all 58 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
