# The Wizard's Quest

The Fellowship event scenario of 2018 (`the-wizards-quest`), played
cooperatively in classic solo and with one to four local players, in normal
and easy mode. Radagast's Eagle returned from spying on Dol Guldur with an
evil wound: the players travel to Rhosgobel, cross Mirkwood, scout the
Necromancer's Tower and return to Rhosgobel with what they learned.

The players **build** the scenario before the first round. The quest deck is
Radagast's Request and one of the three stage 2 cards and one of the three
stage 3 cards; the encounter deck is 7 of the 14 encounter sets of 5 cards
(the quick build). The first player makes each choice in the quick-build
dialogs, or lets the remaining choices be made at random (deterministically
from the game's seed).

## Sources and corrections

- The recipe matches
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Wizard's-Quest):
  70 encounter cards in 14 sets numbered 15 to 28, set aside with Rhosgobel and
  the 7 quest cards (78 cards, recipe Q99.11). Each set has 5 cards with a
  total printed cost of 3 (the cost is the number in the lower right corner),
  so every quick-built encounter deck holds 35 cards costing 21.
- The immutable snapshot
  `src/data/pending/the-wizard-s-quest-import.json` (SHA-256
  `6882eb18bce09da2c32a3f67ae86dd447e84575ff9927c8c2a7e57449851f4ea`) holds
  the 51 cards; `tests/wizards-quest-source-quantities.json` keeps every card's
  quantity, type, set and cost.
- `tests/wizards-quest-art.json` pins all **59 faces** (the 7 quest cards and
  Rhosgobel have two faces). Every face was checked by eye against the
  catalog, which the scans correct:
  - Rider of Mirkwood, Rhosgobel's enemy side, is a separate face with the
    scan's statistics: unique, Nazgûl., 50 engagement cost, X threat, 6
    attack, 3 defense, 10 hit points, victory 6.
  - Typos: 2A "shuffles", Carried Away "this stage", Dungeons of the
    Necromancer "attaches a hero", Nazgûl of Dol Guldur "either", Smoking
    Blood "attaches" and "surge. (Counts", Swarming Mosquitoes "X is 1 more
    than", Goblin Sniper "each player" and "its [defense]", Pine Slopes "gets
    +2", Dol Guldur Beastmaster "encounter deck", Evil Storm "-1 [willpower]",
    Eastern Crows "encounter discard pile", The Sorcerer's Tower's title, Hill
    Troll "player", Befouled Equipment "Attach to", Under the Shadow
    "Condition", The Wargs' Glade's title twice and Howling Warg "the Warg
    trait".
  - The catalog writes Attack and Defense for the icons in ten shadow
    effects, and runs paragraphs together on the quest cards, Rhosgobel, Rider
    of Mirkwood and twelve encounter cards; the paragraphs follow the scans.
- Hall of Beorn gives the scenario no difficulty rating; the atlas rates it 5.
- **Easy mode** keeps the whole recipe (the event predates easy-mode icons) and
  gives each hero its additional starting resource.
- **Not supported**: the advanced build (35 hand-picked cards with The Woodland
  Realm's sets) and the competitive mode, in which two teams each play their
  own game and resolve the 'opposing team' effects for each other.

## The cooperative rules

Each effect that names **the opposing team** is resolved by the first player,
who is asked to resolve it in the way that provides the greatest challenge (the
rulebook's cooperative rule): the 0 cost cards of 1A, the searches of 2A, 3A,
A Fork in the Road, Fastness of Mirkwood and The Wargs' Glade, the allies of
Carried Away, Eyes in the Dark's questing characters, Smoking Blood's Troll,
Power Sevenfold's cards and the card Necromancer's Pass guards.

## Setup and stages

| Stage                                  | Quest points     | Rules                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Radagast's Request               | 10               | Setup: Rhosgobel and one different 0 cost enemy or location per player from the encounter deck join the staging area. Explored, Rhosgobel is flipped over and Rider of Mirkwood is added to the staging area. The stage cannot be defeated while Rhosgobel is in play.  |
| 2A Mirkwood Forest (each stage 2 card) | –                | The opposing team reveals a card from the top 5 with cost 1 or less (2 or less with two or more players); its 'when revealed' effects cannot be canceled.                                                                                                               |
| 2B A Fork in the Road                  | 5                | A location with cost 2 or less from the encounter deck or discard pile gets a resource: it is immune to player card effects, cannot be traveled to while the stage has quest points left, and must leave play before the stage is defeated.                             |
| 2B Carried Away                        | 20               | An ally of each player is guarded under the stage; allies with those titles cannot be played or put into play. Defeated, the stage returns each ally to its owner's hand.                                                                                               |
| 2B A New Terror Abroad                 | 5, +5 per player | At the beginning of each quest phase, Rider of Mirkwood makes an immediate attack against the first player.                                                                                                                                                             |
| 3A The Necromancer's Tower (each card) | –                | As 2A, with cost 2 or less (3 or less with two or more players).                                                                                                                                                                                                        |
| 3B The Tower of Sorcery                | 20               | After the players commit characters, the encounter deck is discarded until a treachery, which is revealed. Defeating the stage wins the game.                                                                                                                           |
| 3B Dungeons of the Necromancer         | 15               | The encounter discard pile is shuffled into the deck; each player discards until an enemy, which joins the staging area and guards one of his heroes (its tokens are discarded). An unguarded hero returns exhausted. Cannot be defeated while a hero is guarded; wins. |
| 3B Return to Rhosgobel                 | 10               | Rider of Mirkwood's engagement cost is 0 and its damage cannot exceed the stage's progress. Cannot be defeated while it is in play; defeating the stage wins the game.                                                                                                  |

**Rider of Mirkwood** is immune to player card effects, has X threat (1 more
than the stage number) and cannot leave the staging area before 3B. Destroyed,
it goes to the victory display (6 points).

The scenario panel shows the side and its rule, the chosen stage 2 and stage 3
cards (or the quick build in progress), the encounter sets, Rhosgobel or Rider
of Mirkwood, the guarded allies, cards and heroes, and Under the Shadow and
Nightfall. The journey counts 3 stages; the atlas lists all 7 quest cards
under their stage numbers.

## Encounter cards

| Set | Cards                                                                   | Behaviour                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15  | Nazgûl of Dol Guldur, Necromancer's Pass ×2, Pursued by Shadow ×2       | The Nazgûl takes only combat damage, has no player attachments, and after it attacks you returns to the staging area or you raise your threat by 3. The Pass guards a card of the first player (the first player protects one, the opposing team takes another) until explored. Pursued: the highest attack staged enemy attacks the first player, else surge; shadow: a unique attacker attacks again. |
| 16  | Bane of Amon Lanc, Oak-wood Grove ×2, Smoking Blood ×2                  | Bane: after it destroys an ally, the defending player discards a card per excess damage. Grove: no progress on the other staged locations; travel: each player exhausts a character. Smoking Blood attaches to a Troll (else surge) and cancels the damage that would destroy it once.                                                                                                                  |
| 17  | Forest Flies ×2, Twilight Hall, Swarming Mosquitoes ×2                  | Flies raise the defending player's threat when they attack; shadow: 1 threat per engaged enemy. The Hall gets +1 threat per character of the first player and reveals a card per player when explored. Mosquitoes: each player deals 1 more damage than the stage number; shadow +1 attack (+2 with an attachment).                                                                                     |
| 18  | Goblin Sniper, Pine Slopes ×3, Under the Shadow                         | The Sniper cannot be optionally engaged and deals 1 damage to a hero of each player at the end of combat; shadow: no defense. Pine Slopes: +2 threat to each copy this phase; travel: 1 threat per staged copy. Under the Shadow (doomed 1) attaches to the main quest: each player plays at most 1 card each phase.                                                                                    |
| 19  | Necromancer's Warg, Dol Guldur Beastmaster, Watched Path ×2, Evil Storm | The Warg deals 1 damage after it engages; shadow: with an Orc and a Warg engaged, discard a character. The Beastmaster brings a Necromancer's Warg engaged with you. Watched Path explored: an enemy on top of the deck joins the staging area. Evil Storm: 1 damage to a questing character; damaged characters get -1 willpower and cannot be healed this phase.                                      |
| 20  | Spider of Dol Guldur, Patch of Midnight, Eyes in the Dark ×3            | The Spider returns to the staging area after it destroys an ally; shadow: an additional attack. Patch of Midnight is discarded at the beginning of the staging step and reveals a card. Eyes: a questing character of each player is readied and removed from the quest; shadow +1 attack, threat if it destroys.                                                                                       |
| 21  | Eastern Crows ×3, The Sorcerer's Tower, Power Sevenfold                 | The Crows surge while a copy is in the encounter discard pile. The Tower gives each treachery doomed 1 and, explored, resolves a treachery from the shuffled deck. Power Sevenfold discards chosen non-unique encounter cards in play and reveals as many; shadow: reveal a card or the attack is undefended.                                                                                           |
| 22  | Hill Troll ×2, Troll Cave, Befouled Equipment ×2                        | The Troll has no player attachments. Troll Cave: each player draws a card after travel; travel: a Hill Troll from the top 5 joins the staging area. Befouled Equipment attaches to the character with the most attachments and discards another attachment each round, then itself.                                                                                                                     |
| 23  | Hunting Warg ×2, Hunter's Lookout, Restless Hunters ×2                  | The Warg attacks after it engages (+2 attack with a shadow card without effect). The Lookout raises threat per staged enemy at the end of the round; travel: the highest attack staged enemy attacks the first player. Restless Hunters return each engaged enemy (else surge); shadow +1 attack, the attacker returns if it destroys.                                                                  |
| 24  | Dol Guldur Orcs ×2, The Shadow Road, The Necromancer's Reach ×2         | Orcs: 1 damage to a character of each player; shadow -1 defense per damage. The Shadow Road: 1 damage after an optional engagement and on travel. The Reach: 1 damage to each exhausted character; shadow +1 attack (+2 against a damaged defender).                                                                                                                                                    |
| 25  | Ravenous Spider, Forest Gate ×2, Nightfall ×2                           | The Spider makes the defending player exhaust a character after it destroys one; shadow likewise. Forest Gate gets +1 threat per staged enemy; shadow +1 attack per engaged enemy. Nightfall (doomed 1) goes on the first player's threat dial: 1 more threat each refresh phase.                                                                                                                       |
| 26  | Venomous Spider ×2, Pitch-dark Thicket ×2, Fastness of Mirkwood         | Characters the Spider damages cannot ready this round; shadow: the defender. The Thicket keeps staged enemies from taking damage; shadow: an enemy engaged this round cannot take damage this round. Fastness: one different 0 cost location per player (limit 2); shadow: the active location returns if it destroys.                                                                                  |
| 27  | Dark Bats ×2, Forest Stream ×2, Treacherous Fog                         | The Bats reveal a card and leave play after they damage a character; shadow +1 attack and another shadow card. The Stream removes 2 progress at the end of the round; travel: each player raises his threat by 2. The Fog gives staged enemies and locations +2 threat this phase; shadow +1 attack and defense to your enemies this phase.                                                             |
| 28  | Howling Warg ×3, The Wargs' Glade, Weighed Down                         | Howling Warg discards the top card and reveals it if it is a Warg; shadow +1 attack (+2 for a Warg). The Glade gives the first Warg revealed each round surge and, explored, adds a non-unique Warg. Weighed Down exhausts each character with an attachment (else surge); shadow: discard an attachment from the defender.                                                                             |

Interpretations:

- **Rhosgobel's flip** happens when it is explored as 1B's Forced effect says;
  it can only leave play explored (it is immune to player card effects and
  unique, so Power Sevenfold cannot discard it).
- **A Necromancer's Pass discarded unexplored** (Power Sevenfold) discards its
  guarded card to its owner's discard pile.
- **Carried Away's and Dungeons' guarded objectives** lose every token and
  attachment; a guarded hero is out of play but does not eliminate its player.
- **The Tower of Sorcery's treachery** and 2A/3A's revealed card resolve as
  revealed encounter cards (doomed, surge and shadow rules apply).
- **Pine Slopes' travel cost** counts the copy being traveled to.

## Verification

```sh
npm run test:engine
npm run test:wizards-quest-simulation
npm run build
npm run test:browser-wizards-quest
npm run audit:rules
```

The focused suites (`tests/wizards-quest.test.ts`, 10 tests, and
`tests/wizards-quest-cards.test.ts`, 14 tests, one per encounter set) cover the
quick build and its random choices, setup in one to four players, every stage,
search and win condition, Rhosgobel and Rider of Mirkwood, every enemy,
location, treachery and shadow effect, and saves. The source test pins the
snapshot, every card's quantity, set and cost, the scan corrections and all 59
faces.

The complete-game matrix (`npm run test:wizards-quest-simulation`, in four CI
partitions: each difficulty's complete games and late-game starts) plays 44
games (6,704 actions) with exact save restoration after every action, physical
conservation (the box, the quest deck and the defeated quest cards, Rhosgobel
and Rider of Mirkwood as one card, the guarded allies, cards and heroes,
Nightfall on the threat dial and the treacheries being resolved) and
private-view checks, and 18 exact paced/immediate terminal-state comparisons.
The quick build is random and each 'opposing team' choice takes the greatest
challenge. From setup, the starter decks lose all 14 games at Radagast's
Request, the longest in round 11. The 10 games started at A New Terror Abroad,
with Rider of Mirkwood attacking at the beginning of each quest phase, lose;
the 10 started at the end of Carried Away defeat it, reveal 3A's card, guard
a hero of each player in the dungeons and lose; the 10 started in the last
fight at Return to Rhosgobel, with 10 progress on the stage and Rider of
Mirkwood engaged with 3 hit points left, are all won.

The browser suite runs eight native quick builds (both difficulties, one to
four players, a different stage 2 and stage 3 card and set each time) with
exact physical inventories, and shows the quick-build dialogs, 1A's search,
all seven quest cards front and back, Rhosgobel's Response, Rider of Mirkwood,
2A's search, A Fork in the Road, Carried Away, A New Terror Abroad's attack,
the dungeons, Necromancer's Pass, Power Sevenfold, Under the Shadow and
Nightfall, the last fight and the victory at 1280/390/320px; it checks all 59
faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
