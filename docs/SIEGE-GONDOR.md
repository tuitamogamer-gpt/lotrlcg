# The Siege of Gondor

The second scenario of **The Lord of the Rings: The Flame of the West**
(August 2016). It is playable in classic solo and with one to four local
players, in normal and easy mode, with the box's Fellowship-sphere Aragorn,
whom the first player controls. Campaign mode (its campaign card and the rule
that forbids Frodo Baggins) is not part of this import.

## Sources and corrections

- Recipes Q0B.14 and E0B.14 match the scans' set numbers: 32 encounter cards
  (The Corsair Fleet is "1/32", Great Corsair Ship "2/32", Driven to the
  Brink "31/32" with its copies 31 and 32) — the 30 of the encounter deck
  with The Corsair Fleet and Great Corsair Ship — plus the quest card,
  Aragorn (the box's card 1) and the scenario's rules card. Easy mode removes
  the gold-icon copies: both Pelargir Quays and one copy each of Corsair
  Captain, Umbar Pirate Crew, Raiding the Coasts and Driven to the Brink (24
  cards in the encounter deck). The quantities are recorded in
  `tests/siege-gondor-source-quantities.json`. The scenario has no official
  difficulty; the atlas gives it 6.
- The immutable snapshot `src/data/pending/the-siege-of-gondor-import.json`
  has SHA-256
  `6fabf537f8ec82f88943a99feeb11a5f615ca095a66f8ffc308d9fa686d7d5a9`.
- `tests/siege-gondor-art.json` pins all **19 faces**, checked by eye
  (Aragorn from RingsDB, the others from DragnCards). They correct The
  Corsair Fleet's "X is the number of resources here" (the catalog appends
  the flavor text), Great Corsair Ship's "The Corsair Fleet" and printed
  threat X, Black Sails' "until the end of the phase" and Pelargir Quays'
  "place a damage token here"; the keyword lines of Black Sails (Doomed 1),
  Fell Folk of Umbar (Peril) and Driven to the Brink (Peril), which the
  catalog lists as traits, head their text boxes as printed. The rules
  card's front holds the Frodo rule and "This scenario contains no
  quest-specific instructions" (its back is blank).

## The quest

| Stage                    | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Attack on Pelargir | 20           | Setup: The Corsair Fleet (Corsair side faceup) and Great Corsair Ship join the staging area; each player searches the encounter deck for a Ship location and adds it to the staging area. Each Ship location in the staging area is immune to player card effects. The players cannot defeat this stage while Great Corsair Ship is in play; when it is defeated, the players win. |

**The Corsair Fleet** (unique objective, Corsair): Forced: at the beginning
of the staging step, 1 resource is placed on it; then each player must
either reveal an encounter card or assign X damage among characters he
controls, X being its resources.

## Encounter cards

| Card                | Behaviour                                                                                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Great Corsair Ship  | Unique Ship, threat X (The Corsair Fleet's resources), Victory 5. No travel unless 3 Ship locations are in the victory display. Travel: each player adds a Corsair enemy from the encounter deck or discard pile to the staging area, one of them Corsair Captain if able. |
| Umbar War Galley    | Ship, Victory 3. While active, Corsair enemies get -10 engagement cost. Travel: shuffle the discard pile into the encounter deck and discard from the top until a Corsair enemy, which joins the staging area.                                                             |
| Corsair Dromon      | Ship, Victory 2. While active, Corsair enemies gain Archery 1. Travel: as Umbar War Galley.                                                                                                                                                                                |
| Port of Pelargir    | In the staging area: no more than 1 damage healed from each character each round. Shadow: a character this attack damages cannot ready until the end of the round.                                                                                                         |
| Pelargir Quays      | Forced: at the end of the round, a damage token here; at 4 it is discarded and 4 damage is assigned among characters in play.                                                                                                                                              |
| Corsair Captain     | Cannot be optionally engaged. While the active location is a Ship: -30 engagement cost, and it makes an immediate attack when it engages you.                                                                                                                              |
| Corsair of Umbar    | +2 attack and +2 defense while the active location is a Ship. Shadow: +1 attack (+2 while a Ship is active).                                                                                                                                                               |
| Umbar Pirate Crew   | Cannot have attachments. Forced: when it engages you, exhaust a character you control. Shadow: while a Ship is active, the attacker returns to the staging area after the attack.                                                                                          |
| Haradrim Pirate     | Forced: when it engages you, 1 damage to a character you control (2 while a Ship is active). Shadow: the defending character gets -1 defense for each damage on it.                                                                                                        |
| Fell Folk of Umbar  | Peril. When Revealed: return each Corsair enemy engaged with you to the staging area, or discard from the encounter deck until a Corsair enemy and engage it.                                                                                                              |
| Black Sails         | Doomed 1. When Revealed: each Ship location in the staging area gets +1 threat until the end of the phase; with no non-unique Ship location there, a Ship location from the encounter deck or discard pile joins the staging area.                                         |
| Raiding the Coasts  | When Revealed: each player adds 3 to the total threat in the staging area until the end of the phase, or discards the highest cost attachment he controls. Shadow: +1 attack; if the attack destroys a character, discard an attachment you control.                       |
| Driven to the Brink | Peril. When Revealed: end the quest phase without resolving the quest, or assign X damage among questing characters you control. Shadow: exhaust a character you control.                                                                                                  |

Interpretations:

- **Aragorn** passes with the first player token, with his resources and
  attachments; if he leaves play the players lose, as in The Passing of the
  Grey Company.
- **"Either … or …"** offers an option only when it can change the game
  (an empty encounter deck and discard pile, no character, no engaged
  Corsair enemy, no attachment); with one left it resolves alone. The
  players choose in turn order, starting with the first player.
- **The Corsair Fleet's revealed cards** are revealed during the staging
  step, before the step's ordinary encounter cards; Peril cards are resolved
  by the revealing player.
- **Driven to the Brink's end of the quest phase** skips the staging step's
  remaining encounter cards and the quest resolution; choices of The Corsair
  Fleet already under way still resolve.
- **Black Sails' +1 threat** applies to the Ship locations in the staging
  area as it resolves (lasting effects affect only the cards present), as
  long as they stay there; the Ship location it then adds does not get it.
- **Archery 1 from Corsair Dromon** counts the Corsair enemies in the
  staging area at the beginning of the combat phase, as for every archery
  keyword in the engine.
- **Great Corsair Ship's search**: the last player to search must take
  Corsair Captain when no Captain was found yet and one is in the encounter
  deck or discard pile. The encounter deck is shuffled afterwards.
- **Ship travel costs**: Umbar War Galley and Corsair Dromon need a Corsair
  enemy in the encounter deck or discard pile, as their cost must be paid in
  full. **Fell Folk of Umbar** shuffles the discard pile back in only
  during the quest phase, when an empty encounter deck is refilled.
- **Port of Pelargir** counts every heal of the round, also those before it
  entered the staging area; every player-card heal goes through the shared
  heal rules, including The Land of Sorrow's Dale Messenger and Song of
  Healing.
- **Pelargir Quays' damage** is assigned one point at a time by the first
  player, among the characters of every player.
- **The final stage** wins as soon as the stage has 20 progress and Great
  Corsair Ship has left play, also when the Ship's exploration leaves no
  progress for the quest.

## Engine

- `win(s, reason)` takes the scenario's victory text, so the log's
  "Victory!" line shows it; every scenario that set its own reason after the
  victory now passes it, and an unknown scenario's default is "The players
  win the game." instead of Escape from Dol Guldur's text.
- A `healLimit` scenario hook caps the damage healed from a character; the
  Port of Pelargir uses it with the existing `cannotHeal` and `healed` hooks.

## Verification

```sh
npm run test:engine
npm run test:siege-gondor-simulation
npm run build
npm run test:browser-siege-gondor
npm run audit:rules
```

The focused suite (`tests/siege-gondor.test.ts`, 13 tests) covers setup in
one to four players and both difficulties with the Ship search, The Corsair
Fleet's resource and choices at the beginning of the staging step, Great
Corsair Ship's threat X, travel restriction and Corsair search with the
Captain, the immunity of Ship locations in the staging area, the stage that
cannot be defeated while Great Corsair Ship is in play and the win, both
Ships' active effects and travel, Port of Pelargir's heal limit and shadow,
Pelargir Quays' tokens and damage, every enemy and its shadow, and the four
treacheries. The source test pins the snapshot, the quantities, the
corrections and all 19 faces.

The complete-game matrix plays fourteen games from setup (one to four
players, and hidden, decisions and all review modes, in both difficulties)
with exact save restoration after every action, physical conservation (the
set-aside rules card, the treacheries being resolved and Aragorn included)
and private-view checks. A second matrix starts twelve games with three Ship
locations in the victory display, The Corsair Fleet without resources, 19
progress on the stage and up to 3 allies from each player's deck in play:
the players travel to Great Corsair Ship, Corsair Captain comes, and some
games take the Ship and win.

The browser suite runs eight native setups with exact physical inventories
and shows the printed quest card (both sides), the Ship search, The Corsair
Fleet's choice, Great Corsair Ship's search, Corsair Dromon's archery, Port
of Pelargir and Pelargir Quays, the Quays' damage, Fell Folk of Umbar, Black
Sails, Raiding the Coasts, Driven to the Brink, Umbar Pirate Crew's shadow,
the victory and Aragorn's fall at 1280/390/320px; it checks all 19 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
