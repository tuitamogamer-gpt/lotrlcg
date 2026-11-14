# The Uruk-hai

The first scenario of **The Lord of the Rings: The Treason of Saruman** (April
2015), which continues The Lord of the Rings Saga after The Road Darkens. It
is playable in classic solo and with one to four local players, in normal and
easy mode. Campaign mode, with its campaign card, boons and burdens, is not
part of this import; the box's player cards follow in a later import, except
the Fellowship-sphere Aragorn, whom the scenario puts into play.

## Sources and corrections

- The rules insert, as summarised by
  [RulesPal](https://rulespal.com/the-treason-of-saruman/rulebook): the first
  player takes control of the Fellowship-sphere Aragorn at setup and collects
  his resources; control passes with the first player token, with his
  resources and attachments; if Aragorn leaves play, the players lose. No
  ally or hero titled Saruman or Gríma can be used. The pursuit value starts
  at 10 and is the quest points of both stages; at 30 at the end of a round
  the players lose. Archery, Toughness and Peril follow the Saga rules, and
  each player reveals his own encounter card in player order.
- Recipes Q0B.07 and E0B.07 match the quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Uruk-hai): 37
  encounter cards in normal mode without the campaign card, 2 quest cards and
  the Fellowship Aragorn. Hall of Beorn keeps Grishnákh in easy mode; his
  scan has the gold ring of the cards removed in easy mode, as the catalog's
  easy recipe has it (28 encounter cards). The quantities are recorded in
  `tests/uruk-hai-source-quantities.json`. Hall of Beorn's community rating of
  6 gives the atlas difficulty of 6.
- The immutable snapshot `src/data/pending/the-uruk-hai-import.json` has
  SHA-256
  `3aba5cc95e7aafca008b6552f852919fc50ac93a4f1dcf8ec408a16e715342cc`.
- `tests/uruk-hai-art.json` pins all **21 faces**. They were checked by eye
  and correct the catalog:
  - Uglúk and Grishnákh keep their accents in the card texts.
  - Follow the Orcs' setup includes the campaign sentence: "(If playing
    campaign mode, choose each "captive" from the Campaign Log instead.)"
  - Snaga gets +X threat for the discarded card's **printed** cost.
  - Paragraphs follow the cards and double spaces are removed.

## Stages

| Stage                     | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Follow the Orcs     | X            | Setup: Eastemnet is the active location; Uglúk and To Isengard! enter the staging area; each player chooses 1 non-Fellowship hero he controls to be a Captive, placed underneath To Isengard!; the pursuit value is 10. X is the pursuit value. Uglúk cannot leave the staging area or take damage. Forced: at the end of the combat phase, the pursuit value increases by 1 for each enemy in the staging area. |
| 2A/2B Rescue the Captives | X            | When Revealed: each player searches the encounter deck and discard pile for an Uruk-hai enemy, reveals it and adds it to the staging area; the encounter deck is shuffled. X is the pursuit value. Response: after an enemy is defeated, the pursuit value is reduced by 1. The players cannot defeat this stage while Uglúk is in play; defeating it rescues each Captive and wins the game.                    |

## Encounter cards

| Card              | Behaviour                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| To Isengard!      | Each Captive's text box is blank; the Captives are in play but under no player's control. With no Captive in play, the players lose. Forced: at the end of the refresh phase, the pursuit value increases by 1; at 30 or more, the players lose. |
| Uglúk             | Toughness 3, Victory 5. Cannot have attachments; allies cannot attack or defend against him.                                                                                                                                                     |
| Grishnákh         | Victory 3. Forced: after he enters play, the first player attaches 1 of the Captives to him; if he is defeated, the Captive returns underneath To Isengard!. Forced: at the end of the quest phase, 1 damage to the attached Captive.            |
| Uglúk's Uruk-hai  | Peril, Toughness 1, Archery 1. When Revealed: the pursuit value increases by 3, or an additional encounter card is revealed.                                                                                                                     |
| Isengard Uruk     | Peril, Toughness 1, Archery 2. When Revealed: the player assigns 3 damage among characters he controls, or reveals an additional encounter card.                                                                                                 |
| Uruk-hai Fighter  | Toughness 2. Forced: after it attacks and destroys a character, it returns to the staging area. Shadow: discard a non-objective attachment you control.                                                                                          |
| Snaga             | Peril, Archery 1. When Revealed: a random card is discarded from the player's hand and Snaga gets +X threat until the end of the round, X being its printed cost.                                                                                |
| The Wold          | While active, after it is explored each player draws 1 card. Travel: the pursuit value increases by 1.                                                                                                                                           |
| Eastemnet         | While active, after it is explored 1 resource is added to each hero's resource pool. Travel: the pursuit value increases by 1.                                                                                                                   |
| Plains of Rohan   | X threat, the number of locations in the staging area. Shadow: +1 attack; if the attack destroys a character, the pursuit value increases by 1.                                                                                                  |
| Banks of Entwash  | Forced: after any progress is placed on it, the pursuit value increases by 1. Shadow: the defending player chooses +1 pursuit value or an undefended attack.                                                                                     |
| Rest by Night?    | The player ends the quest phase without resolving the quest and the pursuit value increases by 3, or 1 damage is dealt to each character committed to the quest. It cannot be canceled.                                                          |
| Strange Weariness | Each character committed to the quest gets -1 willpower until the end of the round. Shadow: an additional attack after this one.                                                                                                                 |
| Unseen Barrier    | The players cannot place more than 3 progress on the current quest this round (progress on the active location does not count). Shadow: as Plains of Rohan's.                                                                                    |
| Fighting Uruk-hai | Peril. The player searches the encounter deck and discard pile for an Uruk-hai enemy, reveals it and puts it into play engaged with him; until the end of the round, each enemy engaged with him adds its threat to the staging area.            |
| Saruman's Orders  | Each player returns an enemy engaged with him to the staging area, or reveals an encounter card. Shadow: +1 attack; if the attack destroys a character, the attacker returns to the staging area.                                                |

Interpretations:

- **The Fellowship Aragorn is unique**: a player's other hero titled Aragorn
  is set aside at setup (the leadership starter deck then plays Théodred and
  Glóin), as the insert's campaign rule has a player lose that version of
  Aragorn; his threat does not count. A line-up of Aragorn alone is refused.
  Frodo Baggins heroes other than the Ring-bearer are allowed, since no
  Ring-bearer is in play.
- **Captives** are chosen once the opening hands are kept, in player order.
  They stay in play underneath To Isengard! (or attached to Grishnákh) with
  their damage and attachments, but no player controls them and player card
  effects do not reach them. A Captive destroyed by Grishnákh's damage, or
  attached to Grishnákh when he leaves play without being defeated, goes to
  its owner's discard pile.
- **Uglúk at stage 1** cannot be engaged, as engaging would take him out of
  the staging area; damage to him is reduced to 0.
- **The 2B response, The Wold's and Eastemnet's responses** have no cost or
  drawback, so they are always taken.
- **Rest by Night?** ends the quest phase only when it is revealed during it;
  the pursuit value still increases by 3.
- **Unseen Barrier** counts all progress placed on the current quest this
  round, including progress placed before it was revealed; several copies
  keep the same limit.
- **Archery** totals the archery of the cards in the staging area at the
  beginning of the combat phase, and the first player assigns it.
- **Shadow kills**: Plains of Rohan's and Unseen Barrier's pursuit increase
  and Saruman's Orders' return happen once for an attack that destroys at
  least one character; Uruk-hai Fighter's forced effect does the same.

Engine additions:

- The Lord of the Rings Saga framework places The Treason of Saruman's
  Fellowship Aragorn instead of a Ring-bearer: he passes with the first player
  token, and the players lose when he leaves play. His Action (spend 2
  resources from his pool to ready a hero) is scripted in a new module for
  the box's player cards.

## Verification

```sh
npm run test:engine
npm run test:uruk-hai-simulation
npm run build
npm run test:browser-uruk-hai
npm run audit:rules
```

The focused suite (`tests/uruk-hai.test.ts`, 18 tests) covers setup in one to
four players and both difficulties, the setup restrictions, the Captive
choice, both stages and the pursuit value, Uglúk at each stage, To Isengard!'s
losses, Aragorn's Action, control and loss, the victory, Grishnákh, every
encounter card, treachery and shadow, Archery, saves and the scenario panel
data. The source test pins the snapshot, the normal and easy quantities, the
corrections and all 21 faces.

The complete-game matrix plays fourteen games from setup with exact save
restoration after every action, physical conservation (including the
Captives and treacheries being resolved) and private-view checks; the
starter decks, each with a hero less after the Captives are chosen, lose them
all at Follow the Orcs within five rounds, with the pursuit value climbing to 25. A second matrix starts twelve games at stage 2 with an Uruk-hai enemy for
each player in the staging area: Uglúk engages at once and the starter decks
fall within three rounds. Hidden and decisions review parity is checked in
both matrices. The victory and the pursuit value reduced by defeated enemies
are covered by the focused and browser suites.

The browser suite runs eight native setups with exact physical inventories and
shows the Captive choice, the two printed quest cards, Follow the Orcs,
Grishnákh taking a Captive, the choices of Uglúk's Uruk-hai, Isengard Uruk,
Rest by Night? and Saruman's Orders, Aragorn's Action, Rescue the Captives
with Unseen Barrier and Fighting Uruk-hai, the victory and both losses at
1280/390/320px; it checks all 21 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
