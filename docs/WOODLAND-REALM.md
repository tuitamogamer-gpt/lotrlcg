# The Woodland Realm

The Fellowship event scenario of 2018 (`the-woodland-realm`), played
cooperatively in classic solo and with one to four local players, in normal
and easy mode. Lost in Mirkwood, the heroes find Mendor, an Elf of the
Woodland Realm, captured by spiders: they free him from the Spider Den and
follow him through the forest to the halls of the Elvenking. If Mendor leaves
play, the players lose.

The players **build** the scenario before the first round, as in The Wizard's
Quest. The quest deck is Captured by Spiders and one of the three stage 2
cards and one of the three stage 3 cards; the encounter deck is 7 of the 14
encounter sets of 5 cards (the quick build). The first player makes each
choice in the quick-build dialogs, or lets the remaining choices be made at
random (deterministically from the game's seed).

The quick build, 1A's setup, the A sides' searches of the top 5 cards and the
stage advance are shared with The Wizard's Quest in
`src/game/fellowship-event.ts` (runtime), `src/game/fellowship-event-support.ts`
(pure state, public projection and save validation) and
`src/game/fellowship-event-lib.ts` (board helpers); each scenario configures
them with its own quest cards, sets, costs and stage effects.

## Sources and corrections

- The recipe matches
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Woodland-Realm):
  70 encounter cards in 14 sets numbered 1 to 14, set aside with Spider Den and
  the 7 quest cards (78 cards, recipe Q99.12). Each set has 5 cards with a
  total printed cost of 3 (the number in the lower right corner), so every
  quick-built encounter deck holds 35 cards costing 21.
- The immutable snapshot `src/data/pending/the-woodland-realm-import.json`
  (SHA-256
  `14682dbe432c78f9bb5a340d99b1a1e679259490f49010891c25a38968d2d7e6`) holds
  the 50 cards; `tests/woodland-realm-source-quantities.json` keeps every
  card's quantity, type, set and cost.
- `tests/woodland-realm-art.json` pins all **58 faces** (the 7 quest cards and
  Spider Den have two faces). Every face was checked by eye against the
  catalog, which the scans correct:
  - Mendor, Spider Den's objective-ally side, is a separate face with the
    scan's statistics: unique, Silvan. Scout., 2 willpower, 2 attack, 2
    defense, 5 hit points, Ranged and Sentinel.
  - 1B's back repeated 1A's Setup; it holds only the Forced effect and the
    defeat condition. 1A "adds them", 2A "The opposing team" and "(cost 2 or
    less", 3A "(cost 3 or less" and "Its", The Forest of Great Fear "then
    places" and "with a resource", "Escape from Taur-nu-Fuin", Spider Den
    "instead", Caught in a Web "2 resources", Giant Web "previous active
    location", Dry Watercourse "is in" and Wasted Provisions "heroes'".
  - Titles: Enchanted Stream (catalog "Enchanted Steam") and The Goblins'
    Caves (catalog "The Goblins' Cave", text "The Goblin's Cave"); The
    Spiders' Ring keeps its printed "The Spider's Ring" in its Forced effect.
  - Traits: Enchanted Stream "Forest. River.", Mountains of Mirkwood
    "Mountain.", Mirkwood Flock "Creature.", Pack of Wargs "Warg.", Old Forest
    Road "Forest."; Spider Den, Enchanted Stream and The Goblins' Caves are
    unique.
  - Forest Grove's threat and quest points and Wild Bear's threat and defense
    are printed X.
  - The catalog prints no shadow effect; the scans add the 23 shadow effects.
    The catalog also runs paragraphs together on the quest cards and eleven
    encounter cards; the paragraphs follow the scans.
- Hall of Beorn gives the scenario no difficulty rating; the atlas rates it 5.
- **Easy mode** keeps the whole recipe (the event predates easy-mode icons) and
  gives each hero its additional starting resource.
- **Not supported**: the advanced build (35 hand-picked cards with The
  Wizard's Quest's sets) and the competitive mode, in which two teams each
  play their own game and resolve the 'opposing team' effects for each other.

## The cooperative rules

Each effect that names **the opposing team** is resolved by the first player,
who is asked to resolve it in the way that provides the greatest challenge (the
rulebook's cooperative rule): the 0 cost cards of 1A, the searches of 2A, 3A,
Spider Den, The Forest of Great Fear, Chieftain Ufthak, The Spiders' Ring, The
Goblins' Caves and Massing at Night, the enemy The Forest of Great Fear marks,
Abandoned Camp's card, Black Forest Bats' questing character, Caught in a
Web's hero, Driven by Shadow's enemy and the cards Eyes of the Forest discards.

## Setup and stages

| Stage                                | Quest points          | Rules                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Captured by Spiders            | 10                    | Setup: Spider Den and one different 0 cost enemy or location per player from the encounter deck join the staging area. Explored, Spider Den is flipped over and Mendor enters play under the first player's control, ready. The stage cannot be defeated unless the first player controls Mendor. |
| 2A A Chosen Path (each stage 2 card) | –                     | The opposing team reveals a card from the top 5 with cost 1 or less (2 or less with two or more players); its 'when revealed' effects cannot be canceled.                                                                                                                                         |
| 2B Lost in the Dark                  | 20                    | The first treachery revealed each round gains Doomed 1 and its 'when revealed' effects cannot be canceled.                                                                                                                                                                                        |
| 2B "Don't Leave the Path"            | 20                    | Progress cannot be placed on locations in the staging area; in the travel phase the players must travel to a location, if able.                                                                                                                                                                   |
| 2B Ambushed at Night                 | 20                    | Each enemy in the staging area gets -10 engagement cost, cannot be optionally engaged and cannot take damage.                                                                                                                                                                                     |
| Each stage 2B                        |                       | After characters are committed, no more than 5 progress can be placed on the stage this round (10 if Mendor is committed).                                                                                                                                                                        |
| 3A On the Trail (each stage 3 card)  | –                     | As 2A, with cost 2 or less (3 or less with two or more players).                                                                                                                                                                                                                                  |
| 3B The Forest of Great Fear          | 15                    | When revealed, the opposing team adds an enemy from the encounter deck or discard pile, then places a resource on an enemy in play with cost 2 or higher: it gets +2 attack, +2 defense and is immune to player card effects. Cannot be defeated while it is in play; defeating the stage wins.   |
| 3B To the Elvenking's Halls          | X, the highest threat | Each player's threat cannot be reduced by more than 1 each round. After the players quest successfully, if 10 or more progress were placed on the stage this phase, the top encounter card is revealed. Defeating the stage wins.                                                                 |
| 3B Escape from Taur-nu-Fuin          | 20                    | At the beginning of each quest phase, cards are discarded from the encounter deck until a location, which joins the staging area. Defeating the stage wins.                                                                                                                                       |

**Mendor** is under the first player's control: when the first player token
passes, Mendor goes with it. If it leaves play (destroyed, discarded, or with
the cards of an eliminated player), the players lose. Turned Around adds 5
quest points to the stage it is attached to.

The scenario panel shows the side and its rule, the chosen stage 2 and stage 3
cards (or the quick build in progress), the encounter sets, Spider Den or the
player who controls Mendor, the enemy with a resource, the progress the stage
can still take this round and Turned Around. The journey counts 3 stages; the
atlas lists all 7 quest cards under their stage numbers.

## Encounter cards

| Set | Cards                                                          | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ungoliant's Spawn, Forest Grove ×2, Despair ×2                 | The Spawn takes only combat damage, has no player attachments and, from the staging area, stops characters being readied by player card effects. Forest Grove has X threat and quest points (1 more than the stage number); travel: each player deals X damage to a character. Despair blanks each character's printed text box (Traits stay) until the end of the round; shadow: the defender's until the end of the phase. |
| 2   | Chieftain Ufthak, Abandoned Camp ×2, Gathering Gloom ×2        | Ufthak takes only combat damage and has no player attachments; after he engages you, an Orc enemy of cost 1 or less engages you too. The Camp, explored, shuffles a card from the discard pile into the deck. Gloom raises each threat by 1 more than the stage number; shadow +1 attack (+2 at 35 threat).                                                                                                                  |
| 3   | Black Forest Bats ×2, Enchanted Stream, Exhaustion ×2          | The Bats remove a questing character from the quest; shadow: shuffled into the deck. The Stream blocks progress on the quest from the staging area; travel: each player exhausts a hero, which cannot ready while it is active. Exhaustion: each player exhausts a character; no player card readying this round; shadow: the defender cannot ready this round.                                                              |
| 4   | Spiders of Mirkwood ×3, The Spiders' Ring, Caught in a Web     | The Spiders exhaust a character after they engage; shadow +1 attack (+2 for a Spider). The Ring gives each Spider enemy +1 threat and, explored, adds a non-unique Spider. Caught in a Web attaches to a hero and exhausts it; the hero cannot ready unless its controller first spends 2 resources from its pool.                                                                                                           |
| 5   | Wolf Rider ×3, The Goblins' Caves, Driven by Shadow            | Wolf Rider surges with another Orc enemy staged; shadow: an attacking Orc brings it engaged with you. The Caves give each Orc enemy +1 attack and, explored, add a non-unique Orc. Driven by Shadow attaches to an enemy (+2 threat, attack and defense, immune), which returns to the staging area; else surge.                                                                                                             |
| 6   | Beast of Taur-nu-Fuin, Dark Black Woods ×3, Wind-whipped Rain  | The Beast gets +1 attack per damage; a blank shadow card deals 1 damage to it and the defender. The Woods get +1 threat per staged copy; travel: each player discards a card per staged copy. The Rain: keep 1 card and discard the rest, or take 1 damage per card in hand; shadow: a random discard.                                                                                                                       |
| 7   | Giant Spider ×2, Giant Web ×2, Eyes of the Forest              | The Spider makes each player exhaust a character; shadow: the defending player. Giant Web becomes the active location, the previous one returns to the staging area. Eyes (doomed 1): the opposing team discards a card from each hand; shadow +X attack (the stage number).                                                                                                                                                 |
| 8   | Mirkwood Patrol ×2, Mountains of Mirkwood ×2, Hatred Rekindled | From the staging area, the Patrol stops optional engagements; shadow +1 attack (+2 if the enemy engaged you this round). The Mountains raise each threat by 2 at the end of the round; shadow: 2 threat or +2 attack. Hatred: each engaged enemy attacks, else surge; shadow +1 attack and an uncancelable additional shadow card.                                                                                           |
| 9   | Wild Bear ×2, Labyrinthine Woods ×2, Vastness of Mirkwood      | The Bear has X threat and defense (1 more than the stage number); shadow +X defense this phase (the stage number). The Woods give each staged location +1 threat this phase; shadow: your enemies +1 attack this phase. Vastness reveals a card with cost up to the stage number from the top 5; shadow: a card if the attack destroys.                                                                                      |
| 10  | Mirkwood Flock ×2, The Eaves of Mirkwood ×2, Massing at Night  | The Flock surges; shadow: it joins the staging area. The Eaves allow 1 progress per staged location each round; travel: each player discards a random card. Massing: one different 0 cost enemy per player (limit 2); shadow: an additional attack if the attack destroys.                                                                                                                                                   |
| 11  | Wild Wargs ×2, Dry Watercourse ×2, Turned Around               | The Wargs return to the staging area after a blank shadow card; shadow: the attacker returns. The Watercourse limits threat reduction to 1 per player each round; travel: each threat +1. Turned Around removes 5 progress and adds 5 quest points.                                                                                                                                                                          |
| 12  | Pack of Wargs, Dark-wood Grove ×2, Lost and Witless ×2         | The Pack takes only combat damage, has no player attachments and attacks again (without a shadow card) after a blank shadow card. The Grove raises each threat by 3 after a 'when revealed' effect is canceled; travel: reveal a card. Lost and Witless discards the allies in each hand; shadow: an undefended attack discards an ally.                                                                                     |
| 13  | Wicked Spider, Old Forest Road ×2, A Frightened Beast ×2       | The Spider makes you discard an exhausted character after it engages; shadow: the attacker cannot take damage this phase. The Road's travel stages an enemy from the top of the deck; after the travel the first player may put an ally from the top of his deck into play. The Beast: 1 threat per questing character or discard one; shadow +1 attack, threat if it destroys.                                              |
| 14  | Ambushing Orcs, Mirkwood Path ×2, Wasted Provisions ×2         | The Orcs attack the first player as they are revealed; shadow: the lowest engagement cost staged enemy engages you and is dealt a shadow card. The Path, explored, stages a location from the top of the deck. Wasted Provisions discards every hero resource for 1 threat each, else surge; shadow: discard an attachment.                                                                                                  |

Interpretations:

- **Mendor's flip** happens when Spider Den is explored, as 1B's Forced effect
  says; Spider Den is not discarded. Mendor follows the first player token at
  once, and a player eliminated while controlling Mendor takes it out of play
  (the players lose).
- **A blank Mendor** (Despair) has no text: leaving play then does not lose
  the game, and the card goes to the encounter discard pile as Spider Den.
- **Stage 2's cap** counts all progress placed on the stage after the commit
  that round, from questing and from card effects; the excess is not placed.
- **Lost in the Dark** looks at the first treachery revealed each round by any
  effect (2A's revealed card included); it keeps Doomed 1 and cannot be
  canceled until the next card is revealed.
- **Caught in a Web's payment** is offered before the refresh phase for each
  exhausted webbed hero with 2 resources, and as an action on the attachment;
  each payment lets the hero ready once.
- **Dark Black Woods' travel cost** counts the copy being traveled to.
- **Abandoned Camp** cannot shuffle back its own explored copy.
- **Escape from Taur-nu-Fuin** shuffles the discard pile back once when the
  encounter deck runs out.
- **Ambushing Orcs' shadow** lets the first player choose among enemies tied
  for the lowest engagement cost.
- **Hatred Rekindled's additional shadow card** resolves in the same attack
  (as does The Wizard's Quest's Dark Bats); Massing at Night's additional
  attack is dealt a shadow card, while Pack of Wargs' is not.

## Verification

```sh
npm run test:engine
npm run test:woodland-realm-simulation
npm run build
npm run test:browser-woodland-realm
npm run audit:rules
```

The focused suites (`tests/woodland-realm.test.ts`, 14 tests, and
`tests/woodland-realm-cards.test.ts`, 14 tests, one per encounter set) cover the
quick build and its random choices, setup in one to four players, Spider Den,
Mendor, every stage, search and win condition, every enemy, location,
treachery and shadow effect, and saves. The source test pins the snapshot,
every card's quantity, set and cost, the scan corrections and all 58 faces.

The complete-game matrix (`npm run test:woodland-realm-simulation`, in four CI
partitions: each difficulty's complete games and late-game starts) plays 44
games (7,476 actions) with exact save restoration after every action, physical
conservation (the box, the quest deck and the defeated quest cards, Spider Den
and Mendor as one card, Caught in a Web, Driven by Shadow and Turned Around as
attachments and the treacheries being resolved) and private-view checks, and 18
exact paced/immediate terminal-state comparisons. The quick build is random and
each 'opposing team' choice takes the greatest challenge. From setup, the
starter decks lose all 14 games at Captured by Spiders, the longest in round 5.
The 10 games started at "Don't Leave the Path", with Mendor under the first
player's control, lose (in easy mode one of them defeats the stage first), the
longest in round 23; the 10 started at the end of Lost in the Dark defeat it,
reveal 3A's card and lose at To the Elvenking's Halls; the 10 started in the
last fight at The Forest of Great Fear, with 15 progress on the stage and the
enemy with a resource (a Giant Spider) engaged with 2 hit points left, are all
won.

The browser suite runs eight native quick builds (both difficulties, one to
four players, a different stage 2 and stage 3 card and set each time) with
exact physical inventories, and shows the quick-build dialogs, 1A's search,
all seven quest cards front and back, Spider Den's travel search, Mendor in the
panel, 2A's search, the progress cap, Caught in a Web, The Forest of Great
Fear's enemy with a resource with Turned Around, and the victory at
1280/390/320px; it checks all 58 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
