# Journey in the Dark

The second scenario of **The Lord of the Rings: The Road Darkens** (October
2014), the second box of The Lord of the Rings Saga. It is playable in classic
solo and with one to four local players, in normal and easy mode. Campaign
mode, with its boons and burdens, is not part of this import; the box's player
cards follow in a later import.

## Sources and corrections

- The Saga rules follow The Road Darkens rules insert, as transcribed by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-road-darkens/rulebook):
  the first player controls the box's Fellowship-sphere Ring-bearer with The
  One Ring, each player reveals his own encounter card in player order, and
  Peril cards are resolved by the revealing player.
- Recipes Q0B.05 and E0B.05 match the normal and easy quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Journey-in-the-Dark):
  38 and 30 encounter cards without the campaign card, plus 3 quest cards,
  Frodo Baggins and The One Ring. The recipes prepare a staging area with Doom,
  Doom, Doom and four different locations; stage 1A has each player choose a
  location from the encounter deck, so those four locations are shuffled into
  it. The quantities are recorded in `tests/journey-dark-source-quantities.json`.
  Hall of Beorn's community rating of 7.9 gives the atlas difficulty of 8.
- The immutable snapshot `src/data/pending/journey-in-the-dark-import.json`
  has SHA-256
  `c1ba4c762a33b7918aa22e4fa132cdd624cdd4f496e6624971c70c48d3660990`.
- `tests/journey-dark-art.json` pins all **25 faces**. They were checked by
  eye and correct the catalog: the names Orc-chieftain (catalog
  "Orc-chieftan", also in Chamber of Mazarbul's text), Many-pillared Hall
  (catalog "Many-pillard Hall") and The Bridge of Khazad-dûm (catalog
  "Kazad-dûm"). Many-pillared Hall's printed text repeats the misspelling
  ("Many-pillard Hall gets +1"); the imported text uses the card's name.

## Stages

| Stage                          | Quest points | Rules                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The Long Dark of Moria   | 14           | Setup: The Balrog, The Great Bridge and Chamber of Mazarbul are set aside; Doom, Doom, Doom enters the staging area with 10 damage tokens; each player adds a different location from the encounter deck to the staging area. Forced: after a player optionally engages an enemy, 1 token is removed from Doom, Doom, Doom. |
| 2A/2B Drums in the Deep        | 9            | When Revealed: Chamber of Mazarbul enters the staging area. With no enemy in the staging area at the beginning of the quest phase, the first player reveals an additional encounter card. The players cannot advance without 3 resource tokens per player on the stage; after an enemy is defeated, 1 token is placed.      |
| 3A/3B The Bridge of Khazad-dûm | 15           | When Revealed: The Great Bridge enters the staging area; each player reveals 1 encounter card and removes 1 token from Doom, Doom, Doom. No more than 5 progress can be placed on the stage each round, and it cannot be defeated while The Great Bridge is in play. Defeating it wins the game.                            |

## Encounter cards

| Card                | Behaviour                                                                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doom, Doom, Doom    | Forced, at the end of the quest phase: 1 token is removed; then, with no token left, The Balrog enters the staging area. Forced, at the end of the quest phase: The Balrog makes an attack if it is in play.                                         |
| The Balrog          | Indestructible; cannot be optionally engaged; it and its shadow cards are immune to player card effects. In the staging area it is considered engaged with the first player, and only the first player can declare attackers against it. Victory 50. |
| Orc-chieftain       | Cannot have attachments; allies cannot defend against it. Forced: at the beginning of the encounter phase it engages the first player.                                                                                                               |
| Great Cave-troll    | Cannot have attachments. Each point of excess combat damage it deals removes 1 progress from the current quest.                                                                                                                                      |
| Uruk from Mordor    | When Revealed: it attacks the first player. Shadow: +1 attack; if the attack destroys a character, the attacking enemy makes an additional attack.                                                                                                   |
| Moria Orc           | When Revealed: remove 1 token from Doom, Doom, Doom, or reveal an additional encounter card. Shadow: the defending player raises his threat by 1 for each enemy engaged with him.                                                                    |
| Moria Archer        | Peril. Archery 2. Its threat X is the number of players. When Revealed: the revealing player assigns X damage among his characters.                                                                                                                  |
| The Great Bridge    | Immune to player card effects; Victory 5. Response, when explored: discard a hero from play to deal damage equal to its threat cost to The Balrog; then The Balrog loses all keywords for the rest of the game.                                      |
| Chamber of Mazarbul | Immune to player card effects; Victory 4. The players cannot advance to the next stage. Travel: each player searches the encounter deck and discard pile for a different enemy for the staging area; one must be Orc-chieftain, if able.             |
| Mines of Moria      | Progress goes on each Mines of Moria in the staging area before the current quest. Shadow: the defending player discards a non-objective attachment he controls (2 at threat 35 or more).                                                            |
| Many-pillared Hall  | +1 threat for each Many-pillared Hall in play, itself included. Shadow: +1 attack (+2 at threat 35 or more).                                                                                                                                         |
| Darkened Stairway   | Forced: after it is explored, the top encounter card is discarded; a location enters the staging area.                                                                                                                                               |
| Ancient Guardroom   | While active, each enemy in play gets -1 attack. Travel: discard the top encounter card; each player raises his threat by its threat.                                                                                                                |
| They Are Coming!    | Doomed 2. The encounter discard pile is shuffled into the deck, then cards are discarded until X enemies are found (X is the number of players); those enemies enter the staging area.                                                               |
| We Cannot Get Out   | Each player assigns 1 damage among his characters for each exhausted character he controls. Shadow: 1 damage for each enemy engaged with the defending player.                                                                                       |
| Deep Fissure        | Peril. A character the revealing player controls is removed from the quest and the top encounter card is discarded; if the character's printed willpower is less than the card's threat, the character is discarded.                                 |
| Fool of a Took!     | Doomed 1. Remove 1 token from Doom, Doom, Doom, or The Balrog makes an attack, if able. Shadow: if the attack destroys a character, 1 encounter card is revealed.                                                                                    |

Interpretations:

- **Doom, Doom, Doom's two Forced effects** resolve in printed order, so The
  Balrog attacks in the same quest phase it enters. Tokens removed by other
  effects bring it out only at the end of a quest phase.
- **The Balrog's attacks** go against the first player while it is in the
  staging area. "Loses all keywords" removes Indestructible; its immunity and
  "cannot be optionally engaged" are not keywords and remain. Once it has lost
  Indestructible, 25 damage defeats it.
- **The Great Bridge's response** is offered when it is explored while The
  Balrog is in play; any hero in play may be discarded, and declining is
  allowed.
- **A choice between two effects** offers only an effect that can change the
  game state; with a single one, it resolves at once (Moria Orc, Fool of a
  Took!).
- **Discarding the top encounter card** reshuffles the discard pile only
  during the quest phase, as the encounter deck does; outside it, an empty
  deck means Ancient Guardroom's travel cost cannot be paid. Deep Fissure
  still discards a card when the revealing player has no committed character.
- **Chamber of Mazarbul's search** makes the first player take Orc-chieftain
  when it is in the encounter deck or discard pile; each later player needs an
  enemy with a different title.
- **They Are Coming!** adds its enemies to the staging area without revealing
  them.
- **The 3B progress limit** counts progress placed on the stage from any
  source; progress placed on Mines of Moria does not count.
- **Drums in the Deep's tokens** count every enemy defeated while 2B is the
  current stage and leave with the stage.

The scenario needed no new engine hooks.

## Verification

```sh
npm run test:engine
npm run test:journey-dark-simulation
npm run build
npm run test:browser-journey-dark
npm run audit:rules
```

The focused suite (`tests/journey-dark.test.ts`, 18 tests) covers setup in one
to four players and both difficulties, Doom, Doom, Doom and the arrival of The
Balrog, the three stages and their conditions, The Balrog and The Great
Bridge, every encounter card and shadow, saves and the scenario panel data.
The source test pins the snapshot, the normal and easy quantities and all 25
faces.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation (including set-aside cards and
treacheries being resolved) and private-view checks. Every game resolves the
setup search; the starter decks lose in stage 1, so the later stages, The
Balrog's arrival and the victory are covered by the focused and browser
suites.

The browser suite runs eight native setups with exact physical inventories and
shows the three printed quest stages, The Balrog's arrival, Drums in the Deep
and the search at Chamber of Mazarbul, the 3B progress limit, The Great
Bridge's response, the victory and a loss of The One Ring at 1280/390/320px;
it checks all 25 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
