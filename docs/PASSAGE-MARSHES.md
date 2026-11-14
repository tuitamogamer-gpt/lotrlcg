# The Passage of the Marshes

The first scenario of **The Lord of the Rings: The Land of Shadow** (November
2015). It is playable in classic solo and with one to four local players, in
normal and easy mode, with the box's Fellowship-sphere Frodo Baggins as the
Ring-bearer. Campaign mode, with its campaign card and The Searching Eye
burdens, is not part of this import.

## Sources and corrections

- The rules card defines the **Mire X** keyword: at the end of the refresh
  phase, 1 resource token, a "mire token", is placed on each location with
  the keyword in the staging area; a location with as many mire tokens as its
  Mire value is immediately discarded. Its Forced effect triggers only when
  the Mire keyword discards it, not when another effect discards it or when it
  is explored.
- The rules insert of The Land of Shadow, as summarised by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-two-towers-saga-expansion/rulebook),
  describes **Gollum/Sméagol**: a unique double-sided encounter card with no
  encounter back, which never enters the encounter deck. When Gollum is
  defeated, his damage is discarded and he flips, exhausted, to Sméagol: the
  Gollum enemy leaves play and the Sméagol objective-ally enters play. When
  Sméagol flips to Gollum, his damage is discarded and Gollum is ready.
  Gollum's attack after he engages the first player during the refresh phase
  cannot happen with one player. "If Sméagol is destroyed, the players lose
  the game" cannot be modified.
- Recipes Q0B.10 and E0B.10 match the scans' set numbers: 30 cards of The
  Passage of the Marshes, 3 of Gollum (Sméagol is on Gollum's back) and 4 of
  Morgul Nazgûl, plus 3 quest cards, Frodo Baggins and The One Ring.
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Passage-of-the-Marshes)
  counts 42 normal cards with the four campaign burdens and the campaign
  card. In easy mode it lists 3 copies of Haunted Mere where recipe E0B.10
  keeps 2; the import follows the catalog's recipe (25 encounter cards and
  Gollum). The quantities are recorded in
  `tests/passage-marshes-source-quantities.json`. The scenario has no
  official difficulty; Vision of the Palantír's community rating of 6.2 gives
  the atlas difficulty of 6.
- The immutable snapshot `src/data/pending/the-passage-of-the-marshes-import.json`
  has SHA-256
  `c7dff8eb6139bae913af9aa6f6f683c42e53ff175f2a80d8602b24907cabb6c3`.
- `tests/passage-marshes-art.json` pins all **26 faces**, checked by eye
  (Frodo Baggins from RingsDB, the others from DragnCards, including the
  rules card's two sides and Sméagol). They correct the catalog's names (We
  Hates Them!, The Taming of Sméagol, stage 2B's Across the Marshes), restore
  Sméagol's accent, Evil-smelling Fens's name and the printed wording of the
  travel costs and Stagnant Pools; paragraphs follow the cards and double
  spaces are removed. Sméagol is the separate catalog face
  `octgn:32993141-…:B` (2 willpower, 2 attack, 2 defense, 5 hit points) of
  the same physical card.
- The Land of Shadow's The One Ring joins `lotr-saga-cards.json`, and Frodo
  Baggins `land-shadow-player-cards.json`.

## Stages

| Stage                                  | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The Taming of Sméagol            | 6            | Setup: Gollum is put into play engaged with the first player; each player searches the encounter deck for 1 location and reveals it. The players cannot advance unless the first player controls Sméagol. After a player declares attackers against Gollum, the top card of the encounter deck is discarded and Gollum gets +X defense for this attack, X being that card's threat.                   |
| 2A/2B Across the Marshes               | 12           | When Revealed: with fewer locations than players in the staging area, cards are discarded from the encounter deck until a location is discarded, and it is added to the staging area. Progress cannot be placed on locations in the staging area. Advancing needs Sméagol and 4 locations in the victory display. At the end of the staging step, with fewer locations than players, the first player reveals another card. |
| 3A/3B "Don't Look at the Lights!"      | 24           | When Revealed: each player searches the encounter deck and discard pile for an Undead enemy and puts it into play engaged with him; the locations in the victory display are shuffled into the encounter deck. While any player is engaged with an Undead enemy, progress cannot be placed on this stage. The players win when they defeat it while the first player controls Sméagol.                  |

**Frodo Baggins** (Action): spend 1 Fellowship resource and exhaust The One
Ring for +2 willpower and +2 attack until the end of the round.

**Gollum** is immune to non-Fellowship player card effects and is always
engaged with the first player: when the first player token passes in the
refresh phase, he engages the new first player and makes an immediate attack.
Defeated, he flips to an exhausted **Sméagol** (immune to player card
effects), whom the first player controls; Sméagol follows the first player
token. After the players quest unsuccessfully, Sméagol flips back to a ready
Gollum, engaged with the first player. If Sméagol is destroyed, the players
lose the game.

## Encounter cards

| Card               | Behaviour                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Groping Dead       | Undead: the engaged player cannot reduce his threat. After it destroys a character, 1 mire token on the active location. Shadow: the same, once for this attack.                |
| Dead Things        | Undead. After it destroys a character, the defending player raises his threat by 3. Shadow: raise your threat by 1 for each Undead enemy engaged with you.                        |
| Candle-bearer      | Undead. After it destroys a character, it cannot take damage until the end of the round. Shadow: the attacking enemy cannot take damage until the end of the round.             |
| Morgul Wraith      | Cannot have non-Morgul attachments. While The One Ring is exhausted, -30 engagement cost and immune to player card effects.                                                       |
| Soft Mires         | Mire 1: the first player reveals the top card of the encounter deck. Travel: each player raises his threat by 1.                                                                  |
| Shifting Quagmire  | Surge. Mire 1: return a random location from the victory display to the staging area, or raise each player's threat by 1 for each location there. Travel: 1 Fellowship resource. |
| Haunted Mere       | Mire 2: search the encounter deck and discard pile for an Undead enemy, reveal it and shuffle. Travel: exhaust Sméagol.                                                           |
| Evil-smelling Fens | Mire 3: 1 damage to each character. Travel: each player raises his threat by 1. Shadow: 1 damage to the defending character.                                                     |
| Stagnant Pools     | Mire 5: each player raises his threat by 5. +1 threat for each mire token. Travel: exhaust Sméagol.                                                                               |
| Creeping Marshes   | Surge, Doomed 1. Attached to the current quest as a Condition: at the end of the refresh phase, 1 mire token on each location in the staging area, then it is discarded.         |
| Bitter Reek        | Peril. Raise your threat by 1 for each character you control committed to the quest, or 1 damage to each committed character. Shadow: raise your threat by the attacker's threat. |
| A Fell Light       | Peril. The topmost Undead enemy in the discard pile engages you; each Undead enemy engaged with you attacks. Shadow: the topmost Undead enemy returns to the staging area.         |
| We Hates Them!     | Surge. Flip Sméagol to Gollum, or Gollum attacks; the first player may spend 1 Fellowship resource and exhaust The One Ring to cancel. Shadow: +1 attack, +3 for Gollum.         |
| Call of the Ring   | The first player adds a Nazgûl enemy from the encounter deck, discard pile or victory display, or exhausts The One Ring and reveals a card. Shadow: an additional attack.        |

Interpretations:

- **Gollum always engages the first player.** He enters play engaged with
  him (at setup and when Sméagol flips) and follows the first player token;
  when the first player changes after an elimination, he engages the new
  first player without attacking.
- **A defeated Gollum** counts as a destroyed enemy for player card
  responses; the same physical card becomes Sméagol, so physical counts and
  saves track one card.
- **Mire tokens** are resources on the location. The Mire keyword places its
  tokens before Creeping Marshes' Forced effects; a location that reaches its
  Mire value, active or in the staging area, is discarded at once and its
  Forced effect resolves. Groping Dead's token on the active location can
  discard it the same way.
- **Travel costs**: Haunted Mere and Stagnant Pools need a ready Sméagol;
  Shifting Quagmire needs a Fellowship hero with a resource (the Ring-bearer).
- **We Hates Them!** has a single legal option: Sméagol flips if he is in
  play, otherwise Gollum attacks. **Call of the Ring** offers only the options
  the first player can resolve.
- **Peril** cards are resolved by the revealing player, who makes the choice.
- **The One Ring exhausting** (Frodo, We Hates Them!, Call of the Ring) is
  the trigger for Morgul Wraith until the refresh phase readies it.
- Gollum's immunity applies to non-Fellowship player cards; a Fellowship
  card's effect can still target him.

## Verification

```sh
npm run test:engine
npm run test:passage-marshes-simulation
npm run build
npm run test:browser-passage-marshes
npm run audit:rules
```

The focused suite (`tests/passage-marshes.test.ts`, 16 tests) covers setup
in one to four players and both difficulties, Frodo's Action and Morgul
Wraith, the Mire keyword and each location's Forced effect, Creeping
Marshes, the travel costs, the attack on Gollum and his flip to Sméagol,
Sméagol's flip back and destruction, every treachery and shadow, the Undead
enemies, the three stages and their restrictions, the first player token
passing with Frodo, Sméagol and Gollum, the immunities, the scenario panel
data and saves. The source test pins the snapshot, the normal and easy
quantities, the corrections and all 26 faces.

SIMULATION_SUMMARY

BROWSER_SUMMARY

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
