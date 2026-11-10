# The Fortress of Nurn

The original MEC83 Adventure Pack adds its normal/easy adventure for classic
solo and one to four local players. Seven of its player designs are new
runtime definitions; Shining Shield, Westfold Lancer and Tireless Thoroughbred
were already implemented, and **Thorongil remains unsupported** (see below).
The encounter deck reuses the complete Ulchor's Guard and Under Guard sets and
builds the separate Power of Mordor deck from A Shadow in the East. The
Fortress of Nurn completes The Vengeance of Mordor cycle.

## Sources and corrections

- [Original rules insert, MEC83](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC83.pdf),
  SHA-256 `71a1691208c41a9fa96a52ef5be9374b370a90d040d70cd32e97e0af397f1527`.
  It prints Difficulty Level = 10, the four encounter sets, the Power of
  Mordor deck construction and the Storm the Castle procedure: the four
  copies are randomized before they enter the staging area; when one is
  chosen as the current quest its faceup encounter card is revealed and
  resolves its staging, then the card is turned over and its reverse is the
  current quest until the end of the phase, remaining in play until defeated.
- `tests/fortress-nurn-source-quantities.json` retains all 29 recipe rows:
  53 normal and 40 easy cards (37/25 in the encounter deck, four Ulchor's
  Guard, five Power of Mordor cards, Thane Ulchor, four Castles and two quest
  cards). The printed set numbers 1–29 on the reviewed scans confirm every
  normal quantity of the 29 Fortress of Nurn encounter cards; the runtime
  recipes are the unchanged Q09.9/E09.9 preparation recipes.
- `tests/fortress-nurn-art.json` pins source URLs, byte lengths and SHA-256 for
  **43 visually reviewed original faces**: 23 Fortress of Nurn scenario faces
  (the four Castle reverses and both quest reverses included), 12 reused
  A Shadow in the East faces and eight player faces (Thorongil's face is kept
  for the catalog).
- The immutable preparation snapshot is
  `src/data/pending/the-fortress-of-nurn-import.json`, SHA-256
  `5c560a819b859160877be8efdb96064594f816ad8d6f3173547c683610743d19`.

The reviewed scans restore six printed shadows the catalog omits (Soldier of
Nurn, Easterling Mercenary, Mordor Olog-hai, Guard Dogs, Determined Defense
and The Dark Lord's Reach), The Dungeons of Dol Rhugar's 4 quest points,
"facedown" on Fortress Walls, "among" on Plaza of Nurn and the line breaks of
every text. Duplicated Surge lines and the catalog typos ("ovewr", "Added
each", "Than Ulchor", "enemes", "players cards") follow the printed cards. The
Storm the Castle fronts carry no reverse data and no victory points, so
inspecting a front never reveals its hidden reverse; each reverse is its own
`:B` definition with 6–12 quest points, the Castle trait and Victory 10.

## Scenario rules

At game creation the encounter deck holds every Fortress of Nurn, Ulchor's
Guard and Under Guard card; the Power of Mordor deck is shuffled separately;
Thane Ulchor and the four randomized Storm the Castle cards enter the staging
area. Setup finishes after opening hands: decks above 50 cards (hand plus deck)
set their bottom cards out of the game, one Power card is placed faceup under
each Castle, each player takes one Ulchor's Guard from the encounter deck and
engages it (easy mode's three copies cover the first three players), and each
player deals cards one at a time from the top of their deck until 8 lie under
the quest deck and under each Castle, so a short deck spreads evenly. Player
cards under quests are physical, facedown and private; public state shows only
counts.

Stage 1B has 3 quest points. Thane Ulchor cannot leave the staging area or be
engaged. While the stage has at least 3 progress it is not offered as the
current quest when a side quest can be chosen. The stage is defeated only by
the round-end check with at least 3 progress and 3 Castles in the victory
display. Choosing a Storm the Castle reveals its Power card through the normal
reveal pipeline, then turns the card over, keeps the current-quest selection on
the reverse and resolves the reverse's When Revealed:

| Reverse | When Revealed |
| --- | --- |
| No Quarter (12) | Each player discards 4 random cards from under this quest, then every card they hold or control (heroes included) that shares a title with them. |
| Stronghold of Mordor (8) | Discard until one location per player is found; those enter the staging area. |
| Lethal Counterattack (10) | 1 damage to each character in play. |
| Castle Garrison (6) | Discard until one enemy per player is found; those enter the staging area. |

When a reverse is defeated it goes to the victory display, every player card
beneath it returns to its owner's deck, the deck is shuffled and each player
draws 1 card (an encounter effect, so Guard Tower does not stop it). An
eliminated player's buried cards go to their discard pile. Cards under the
quest deck stay there for the rest of the game: no printed card returns them.

Stage 2A reveals the remaining Power card, shuffles the encounter discard pile
into the deck and makes Thane Ulchor attack each player in turn order (each
attack triggers his Forced reveal). Stage 2B has 12 quest points; encounter
effects (shadows included) cannot be canceled; Ulchor's damage cannot exceed
the progress on the stage, and progress alone does not defeat it — defeating
Thane Ulchor wins the game.

| Card | Behaviour |
| --- | --- |
| Thane Ulchor | Immune; threat X = 1 + Castles in the victory display; after each attack the attacked player reveals an encounter card. |
| Soldier of Nurn | After it attacks, the attacked player places a hand card facedown under a chosen Castle. Shadow: +1 attack, and the same placement if the attack destroys a character. |
| Easterling Mercenary | When Revealed: the revealing player chooses an extra reveal or no progress on the current quest this phase. Shadow: +1 attack per Castle in the victory display. |
| Mordor Olog-hai | Cannot have attachments. After an attack destroying a character, the attacked player exhausts a character. Shadow: +2 attack. |
| Guard Dogs | Surge. After it engages a player (including entering engaged) that player deals 1 damage to a character. Shadow: it enters play engaged with the defending player. |
| Fortress Walls | +1 cost for each ally while in staging. Travel needs a Castle and a hand card for every player; each places one under a Castle. |
| Guard Tower | Player card effects cannot draw cards or gain resources while it is in staging, including resource-phase bonuses. Travel needs a ready character for every player; each exhausts one. |
| Plaza of Nurn | Threat X. Travel: each player assigns X damage among their characters one point at a time. |
| Determined Defense | 2 threat plus 2 per Castle in the victory display until the end of the phase. Shadow: exhaust a character. |
| The Dark Lord's Reach | 1 damage to each exhausted character; each character actually damaged discards one attachment chosen by its controller. Shadow: discard an attachment you control. |
| The Dungeons of Dol Rhugar | Surge; no more than 4 progress on the current quest each round. Response when defeated: choose a Castle; each player adds one of their buried cards there to hand. |
| Ulchor's Guard set | Ulchor's Guard engages the player engaged with Thane Ulchor (shadow +2 defense this phase); Ulchor's Rage makes Thane Ulchor attack the first player or surges (shadow: 1 damage to the defender); Fanaticism attaches to the lowest-defense Easterling or surges. |
| Under Guard set | Side Street blocks progress on other staging locations; Catacombs protects staging enemies from damage; Under Guard repeats the active location's Travel effect (or finds a location); Unwelcome Travelers adds 1 threat to staging locations and engages a found enemy with the first player. |
| Power of Mordor | Khamûl engages the first player, who alone may attack or defend against him; Barad-dûr cannot be traveled to and lowers threat elimination by 5; the Eye discards hands down to 5 and raises threat after draws; the Armies protect engaged non-unique enemies this round; Covered in Darkness is Doomed 5 and limits player-card threat reduction to 1 per round. |

Interpretations: an unflipped Storm the Castle counts as a Castle side quest
(its catalog trait is Castle, and Soldier of Nurn, Fortress Walls and The
Dungeons need targets before any reverse is in play); Ulchor's Guard copies
not taken at setup stay in the encounter deck, as the insert builds the deck
from all cards of the set; stage 2B is not defeated by progress.

## Player cards

| Card | Behaviour |
| --- | --- |
| Aragorn (Spirit) | Sentinel. Once per round, exhaust him to give a non-immune staging-area location −X threat (X = his willpower) until the end of the phase; if that brings its threat from above 0 to 0 it gets 1 progress. |
| Knowledge of the Enemy | Planning Action, once per round per player: a hero you control gains 1 resource per enemy engaged with you. Guard Tower makes it unplayable on heroes that cannot gain resources. |
| Haleth | After questing successfully her controller may search the top five cards for an attachment, then shuffles. |
| Woodman Lore | Ready up to X Woodman characters you control, X = locations in play with player card attachments. |
| Misty Mountain Journeyman | Cannot be played from hand unless its player is engaged with an enemy. |
| A Desperate Path | Offered at the end of each staging step. Discards to the next treachery and resolves its When Revealed through the normal placement pipeline; then each of the player's questing characters readies and gets +1 willpower until the end of the phase. |
| Bond of Friendship | Contract: exactly 50 player cards, exactly 10 from each of the four spheres, at most 2 copies by title, up to four starting heroes of different spheres. The deck builder, RingsDB import, stored decks, game creation and saves accept the fourth hero only with this contract. |
| Thorongil | **Unsupported.** Copying the complete game text of another hero version would need a generic text-alias layer; every hero ability in the engine is keyed to its own card. It stays in the catalog, is reported as unsupported by RingsDB import and cannot be added to a deck. |

The No End in Sight economy block and Guard Tower share one predicate, so the
framework draw, resource bonuses, hero draw abilities and Dunland options all
respect either source.

## Verification

```sh
npm run test:engine
npm run test:fortress-nurn-simulation
npm run build
npm run test:browser-fortress-nurn
npm run audit:rules
```

The focused suites cover native one-to-four-player normal/easy setup and
physical inventory, deck trimming and buried piles, the closed main quest,
every Castle reverse, Castle defeat returns, the round-end transition, stage 2
damage cap, cancellation lock and victory, every encounter and shadow effect,
the shared sets, Power of Mordor, elimination, save validation and the seven
player designs including native Bond of Friendship setup. The complete-game
matrix plays fourteen games with exact save restoration after every action,
physical conservation (Castle reverses fold back to their fronts) and
private-view checks at every boundary, and six exact review-mode comparisons.
The browser suite uses real controls at 1280, 390 and 320 pixels and checks
all 43 served image hashes and decodes.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
