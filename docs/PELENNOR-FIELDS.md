# The Battle of the Pelennor Fields

The third scenario of **The Lord of the Rings: The Flame of the West**
(August 2016). It is playable in classic solo and with one to four local
players, in normal and easy mode, with the box's Fellowship-sphere Aragorn,
whom the first player controls, and the box's two boons, Esquire of Rohan and
Esquire of Gondor. Campaign mode (its campaign card, the Corsair Fleet's
Gondor side, the burdens other than Wraith on Wings and the rule that forbids
Frodo Baggins) is not part of this import.

## Sources and corrections

- Recipes Q0B.15 and E0B.15 match the scans' set numbers: The Witch-king is
  "2/45", Minas Tirith "3/45", Grond "4/45" and Shadow of Mordor "44/45"
  with its copies 44 and 45 — the 40 cards of the encounter deck, the active
  Pelennor Field, Grond, The Witch-king and Minas Tirith — plus the five
  quest cards, the four Wraith on Wings (the box's card 62, a burden printed
  with engagement 45, threat 0, attack 6, defense 4, 12 hit points and
  Victory 5, which the catalog lists without its statistics), the Esquires
  (cards 14 and 15), Aragorn (card 1) and the scenario's rules card. Easy
  mode removes the gold-icon copies: The Black Serpent and one copy each of
  Fire-filled Trench, Siege Tower, War Mûmak, Morgul Captain, Mordor Orc,
  The Rammas is Breached, Fell Beast, Black Dart and Shadow of Mordor (30
  cards in the encounter deck). The quantities are recorded in
  `tests/pelennor-fields-source-quantities.json`. The scenario has no
  official difficulty; the atlas gives it 8.
- The immutable snapshot `src/data/pending/the-battle-of-the-pelennor-fields-import.json`
  has SHA-256
  `034194bfbd30a3ca2b48c8c63176790a6a0d8153dbe1f4d91dae995695b45d91`.
- `tests/pelennor-fields-art.json` pins all **37 faces**, checked by eye
  (Aragorn, the Esquires and Wraith on Wings from RingsDB, the others from
  DragnCards). They correct 2B's "the total cost of all allies", 3A's,
  5A's and The Rammas is Breached's final "Shuffle the encounter deck.",
  3B's "+4 quest points for each player in the game" and "that enemy's
  total threat", 5B's "shadow cards dealt to The Witch-king" and "This stage
  cannot be defeated unless …", The Witch-king's Sorcerer side (traits
  Nazgûl. Sorcerer., Victory 6, "the encounter phase"), Minas Tirith's
  traits (Gondor. City.), War Mûmak's name, Orc of the Eye's shadow ("if it
  has the Mordor trait"), Mordor Orc's "must be dealt to Minas Tirith",
  Black Dart (no Peril keyword; "attach Black Dart"), Wraith on Wings'
  "engagement cost" and Grond's printed threat X. The rules card holds the
  Frodo rule, the Minas Tirith rules and the Assault keyword (front and
  back) as printed.

## The quest

| Stage                         | Quest points     | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The Garrison of Gondor  | 2                | Setup: Minas Tirith, Grond, The Witch-king and the four Wraith on Wings are set aside; Pelennor Field is the active location; the players may attach Esquire of Rohan and Esquire of Gondor to different heroes. Skip the quest phase and the combat phase. Forced: at the end of the planning phase, 1 progress is placed here.                                                                                                                                                                     |
| 2A/2B Retreat from Osgiliath  | X                | When Revealed: each player adds a set-aside Wraith on Wings to the staging area and reveals an encounter card; then each player discards from the top of his deck until an ally that is not in play, which enters the staging area. X is the total cost of the allies in the staging area: they have blank text boxes, are immune to player card effects and are under no player's control. Forced: at the end of the round, damage equal to the enemies in the staging area is assigned among them. |
| 3A/3B The White City Besieged | 4 + 4 per player | When Revealed: each player takes control of his allies in the staging area and exhausts them; the first player adds Minas Tirith, Grond and The Witch-king (Captain side) to the staging area; each other player adds a different enemy from the encounter deck or discard pile. Assault. No travel to Pelennor locations. Forced: when an enemy is destroyed, progress equal to its total threat is placed here (the active location first).                                                        |
| 4A/4B Rohan has Come!         | —                | When Revealed: The Witch-king is set aside; each player puts an ally that matches a hero's sphere from the top 10 cards of his deck into play. Progress from questing successfully is assigned as damage among enemies in play (the active location first). Forced: at the end of the quest phase, advance to stage 5A.                                                                                                                                                                              |
| 5A/5B Fighting in the Fields  | 20               | When Revealed: The Witch-king (Sorcerer side) joins the staging area with a Fell Beast from the encounter deck or discard pile; each other player reveals an encounter card. The Witch-king and his shadow cards are immune to player card effects. Forced: when an enemy attacks and destroys a character, 1 damage to Minas Tirith. The stage cannot be defeated unless Aragorn is in play and The Witch-king is in the victory display; defeating it wins.                                        |

**Minas Tirith** (unique objective, Gondor. City.): 30 hit points plus 10
for each player. Forced: at the end of the round, 1 damage for each enemy in
the staging area; then, with no hit points remaining, the players lose.
**Assault** (3B): no progress on the stage from player card effects or from
questing successfully (the active location still receives progress); an
unsuccessful quest raises no threat but deals the difference to Minas
Tirith, once for the group.

## Encounter cards

| Card                   | Behaviour                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Witch-king         | Captain side: immune, cannot be optionally engaged or take damage; at the beginning of the quest phase, the encounter deck is discarded until an enemy, which joins the staging area. Sorcerer side (Victory 6): only the engaged player can attack him; at the beginning of the encounter phase he engages the first player and makes an immediate attack. |
| Grond                  | Unique Siege location, immune, threat X (its resources), Victory 4. At the beginning of the quest phase, 1 resource and X damage to Minas Tirith. Travel: The Witch-king attacks each player in turn order.                                                                                                                                                 |
| Wraith on Wings        | Nazgûl burden: no non-Morgul attachment; +1 threat and -1 engagement cost for each resource; at the beginning of the quest phase, 1 resource (limit 5).                                                                                                                                                                                                     |
| Gate of Gondor         | Unique, immune, Victory 5. While active, each enemy gets -30 engagement cost; when explored, each engaged enemy returns to the staging area.                                                                                                                                                                                                                |
| City Wall              | While active, damage to Minas Tirith is placed here first; at 4 damage it is discarded and each player raises his threat by 3.                                                                                                                                                                                                                              |
| Pelennor Field         | While an enemy is in the staging area, no progress on locations in the staging area. Shadow: +1 attack (+2 for a Harad enemy).                                                                                                                                                                                                                              |
| Fire-filled Trench     | When a player plays an event that cancels a treachery just revealed, the event's effects are canceled and the Trench is discarded.                                                                                                                                                                                                                          |
| Siege Tower            | Archery 3 in the staging area. After it becomes the active location, the discard pile is shuffled back and the deck discarded until an enemy, which joins the staging area.                                                                                                                                                                                 |
| The Black Serpent      | No attachments; no more than 1 attacker at a time. When Revealed: an immediate attack against the first player.                                                                                                                                                                                                                                             |
| War Mûmak              | Archery 2; no attachments; no more than 3 damage each round. When defeated, each player reduces his threat by 4.                                                                                                                                                                                                                                            |
| Southron Champion      | After it is dealt a shadow card with no shadow effect: 3 damage to Minas Tirith or an additional attack. Shadow: 1 damage to Minas Tirith.                                                                                                                                                                                                                  |
| Morgul Captain         | Peril. When Revealed: the topmost Orc enemy in the discard pile engages you. Shadow: if the attack destroys a character, the attacker returns to the staging area.                                                                                                                                                                                          |
| Orc of the Eye         | Peril, Archery 1. When Revealed: 2 damage to a hero you control or to Minas Tirith. Shadow: +1 attack (+2 for a Mordor enemy).                                                                                                                                                                                                                              |
| Mordor Orc             | Surge. Its undefended damage goes to Minas Tirith while it is in play. Shadow: while Minas Tirith is in play, it engages the defending player and is dealt a shadow card.                                                                                                                                                                                   |
| The Rammas is Breached | Each player puts an enemy from the encounter deck or discard pile into play engaged with him. Shadow: 3 damage to Minas Tirith or an additional attack.                                                                                                                                                                                                     |
| Fell Beast             | Surge. Attached to a Nazgûl enemy (limit 1): +1 threat, +1 attack, +1 defense, -10 engagement cost; at the end of the round the enemy returns to the staging area.                                                                                                                                                                                          |
| Black Dart             | A hero you control is removed from the quest and takes Black Dart (limit 1 per hero): 1 damage at the end of each round. Shadow: attached to a hero the attack damages.                                                                                                                                                                                     |
| Spells of Ruin         | 1 damage to each exhausted character or 5 damage to Minas Tirith. Shadow: +1 attack; if the attack destroys a character, 2 damage to Minas Tirith.                                                                                                                                                                                                          |
| Dread and Despair      | Peril, Doomed 1. Discard an ally you control; +1 total threat in the staging area for each ally in your discard pile until the end of the phase. Shadow: discard a non-objective attachment you control.                                                                                                                                                    |
| Shadow of Mordor       | Doomed 1. Each player deals 1 damage to a hero he controls; the printed text box of each damaged character is blank, except for Traits, until the end of the round.                                                                                                                                                                                         |

The **Esquires** (Permanent boons): Esquire of Rohan grants the Rohan trait
and +1 attack while attacking with another Rohan character; Esquire of
Gondor grants the Gondor trait and +1 willpower while committed to the quest
with another Gondor character.

Interpretations:

- **Aragorn** passes with the first player token, with his resources and
  attachments; if he leaves play the players lose, as in the other Flame of
  the West scenarios.
- **Minas Tirith before 3A**: effects that target it resolve as fully as
  possible, as the rules card says, so its damage is lost. **City Wall**
  takes the damage up to its 4 quest points; the rest goes to Minas Tirith.
  "For each player" counts the players still in the game, for Minas
  Tirith's hit points as for 3B's quest points.
- **The simultaneous Forced effects** at the beginning of the quest phase
  (The Witch-king, Grond, then each Wraith on Wings) and at the end of the
  round (Minas Tirith first, then Fell Beast, Black Dart and 2B's damage)
  are ordered by the first player in this fixed order.
- **"Either … or …"** offers an option only when it can change the game; with
  one left it resolves alone. Minas Tirith is an option once it is in play,
  or while City Wall can take the damage.
- **2A's allies** are discarded to their owners' discard pile when their
  damage reaches their hit points; the first player assigns 2B's damage one
  point at a time. When X is 0, 2B is defeated at once. **3A's "different
  enemy"** is an enemy with a title no other player took.
- **4B**: progress from questing goes to the active location first; the rest
  is assigned by the first player one point at a time among the enemies in
  play, engaged or in the staging area.
- **Discarding until an enemy** (The Witch-king's Captain side): when the
  encounter deck runs out during the quest phase, its discard pile is
  shuffled back into it once, as for an empty encounter deck; with no enemy
  found, nothing joins the staging area. On the Sorcerer side The Witch-king
  engages the first player even when he is engaged with another player.
- **Archery** from the staging area (War Mûmak, Orc of the Eye and Siege
  Tower's Archery 3) is assigned at the beginning of the combat phase, as for
  every archery keyword in the engine.
- **Southron Champion** checks the shadow card as it is turned faceup; a card
  with no Shadow text triggers it.
- **Fire-filled Trench** counters an event that cancels a treachery's When
  Revealed effects as it is revealed from the encounter deck: the event is
  still played and spent. An event that cancels the shadow effect of a
  treachery dealt as a shadow card is not affected.
- **Black Dart** must be attached to a questing hero if the player has one,
  so the whole effect resolves; otherwise to any hero.
- **Shadow of Mordor** blanks every character with damage once each player
  has dealt his damage, including allies damaged earlier: "each damaged
  character", as a lasting effect, affects the characters damaged as it
  resolves.
- **Dread and Despair** counts the allies in the discard pile as it
  resolves; two copies in the same phase add up.
- **The final stage** wins as soon as it has 20 progress, Aragorn is in play
  and The Witch-king is in the victory display, also when The Witch-king is
  defeated after the 20th progress.

## Engine

- A `playerAttackBonus` scenario hook adds attack to a player's attacking
  character for a given enemy and set of attackers (Esquire of Rohan).
- A `playerQuestProgressBlocked` hook stops progress placed on the quest by
  player card effects (Assault); `successfulQuestProgressBlocked` already
  stops progress from questing successfully.
- A `revealCancelCountered` hook lets a scenario cancel the effects of an
  event that cancels a card just revealed from the encounter deck (Fire-filled
  Trench); events that cancel shadow effects are not offered to it.

## Verification

```sh
npm run test:engine
npm run test:pelennor-fields-simulation
npm run build
npm run test:browser-pelennor-fields
npm run audit:rules
```

The focused suite (`tests/pelennor-fields.test.ts`, 12 tests) covers setup in
one to four players and both difficulties with the Esquires, 1B's skipped
phases and progress, 2A's Wraiths, encounter cards and allies, 2B's X,
immunity, blank text boxes and damage, 3A's allies, objectives and enemy
search, Assault, 3B's progress for destroyed enemies and travel restriction,
Minas Tirith's damage, City Wall, the loss and the hit points after an
elimination, The Witch-king, Grond and Wraith on Wings at the beginning of
the quest phase, Grond's travel, 4A's allies, 4B's damage, 5A's Sorcerer
with his Fell Beast, his engagement and attack, 5B's immunity, Minas Tirith
damage and the win, every location, enemy, treachery and shadow, and both
Esquires. The source test pins the snapshot, the quantities, the corrections
and all 37 faces.

The complete-game matrix plays fourteen games from setup (one to four
players, and hidden, decisions and all review modes, in both difficulties)
with exact save restoration after every action, physical conservation (the
set-aside cards, the boons, the treacheries being resolved and Aragorn
included) and private-view checks: the players fall back from Osgiliath to
the besieged White City, Minas Tirith takes damage and The Witch-king comes.
A second matrix starts twelve games at Fighting in the Fields with 16
progress, Minas Tirith in play and a wounded Witch-king (Sorcerer side): the
players defeat him and some games win.

The browser suite runs eight native setups with exact physical inventories
and shows the printed quest cards (1 and 5, both sides), the Esquire choice,
each stage's panel, 2B's damage, 3A's search, Grond and The Witch-king at the
beginning of the quest phase, City Wall, Siege Tower's archery, Fire-filled
Trench, Rohan has Come!'s ally and damage, The Witch-king's attack, Southron
Champion, Orc of the Eye, Mordor Orc, The Rammas is Breached, Black Dart,
Spells of Ruin, Dread and Despair, the victory, the fall of Minas Tirith and
Aragorn's fall at 1280/390/320px; it checks all 37 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
