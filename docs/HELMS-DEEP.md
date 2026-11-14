# Helm's Deep

The second scenario of **The Lord of the Rings: The Treason of Saruman** (April
2015). It is playable in classic solo and with one to four local players, in
normal and easy mode, with the box's Fellowship-sphere Aragorn as in The
Uruk-hai. Campaign mode, with its campaign card, boons and burdens, is not
part of this import; the Poisoned Counsels burden is used as stage 1A
offers it.

## Sources and corrections

- The rules insert, as summarised by
  [RulesPal](https://rulespal.com/the-treason-of-saruman/rulebook), defines
  **Defense**: while the current quest has defense, players cannot place
  progress on the quest or the active location by questing successfully;
  instead, if the total threat in the staging area is greater than the
  willpower committed to the quest, the players do not raise their threat and
  the first player places progress equal to the difference on the current
  quest. The active location still buffers progress from the encounter deck
  and encounter card effects unless a card bypasses it. A stage defeated this
  way advances as usual; if the encounter deck defeats stage 4B, the army of
  Saruman captures Helm's Deep and the players lose.
- "Siege." on The Defense of Helm's Deep is a trait, not the Siege keyword, so
  the players quest with willpower; "Corruption." is Poisoned Counsels' trait.
- Recipes Q0B.08 and E0B.08 match the quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Helm's-Deep): 45 and
  35 encounter cards without the campaign card (the 4 Poisoned Counsels
  included), 5 quest cards and the Fellowship Aragorn. The quantities are
  recorded in `tests/helms-deep-source-quantities.json`. Hall of Beorn's
  community rating of 8.2 gives the atlas difficulty of 8.
- The Orcs of the White Hand (Isengard Uruk, Uruk-hai Fighter and Fighting
  Uruk-hai) are shared with The Uruk-hai: their rules moved to a shared module
  and their effects keep the names The Uruk-hai saved them under.
- The immutable snapshot `src/data/pending/helm-s-deep-import.json` has
  SHA-256
  `a2fb209102dc42ab01d4aa97252949404f89ddae7bfb43d2e738240c27de10e8`.
- `tests/helms-deep-art.json` pins all **28 faces** (24 new ones were checked
  by eye; the White Hand cards and Aragorn were reviewed with The Uruk-hai).
  They correct Devilry of Saruman, which places 3 progress "on the main
  quest" and blanks each character's text box "as if it was blank"; paragraphs
  follow the cards and double spaces are removed.

## Stages

| Stage                             | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The King of the Golden Hall | –            | Setup: The Defense of Helm's Deep, a Deeping Wall and a Soldier of Isengard for each player are set aside. The players choose: each player shuffles a Poisoned Counsels into his deck, or they advance to stage 2A (bypassing 1B). 1B: each player puts an ally from his hand that matches a hero's sphere into play; the quest and combat phases are skipped, and the players advance to 2A at the end of the round.                          |
| 2A/2B Assault on Helm's Deep      | 8            | When Revealed: The Defense of Helm's Deep and the set-aside Soldiers of Isengard enter the staging area, Deeping Wall is the active location, and each player reveals 1 encounter card. Defense. Forced: at the end of the combat phase, the first player reveals a card if the staging area has fewer enemies than there are players. Forced: at the end of the round, 1 progress here for each staged enemy (bypassing the active location). |
| 3A/3B The Hosts of Isengard       | 8            | When Revealed: Helm's Gate, from the encounter deck, discard pile or victory display, becomes the active location; a previous active location returns to the staging area. Defense. Forced: after resolving the quest, the first player reveals a card unless the encounter deck placed progress on this stage by questing.                                                                                                                    |
| 4A/4B The Wall is Breached!       | 8            | When Revealed: the discard pile is shuffled into the deck, and cards are discarded until one enemy per player is found; those enemies enter the staging area. Defense. Forced: after a character is destroyed, 1 progress here (bypassing the active location). If this stage is defeated, the players lose.                                                                                                                                   |
| 5A/5B The King Rides Out          | –            | When Revealed: as 4A. The quest phase is skipped and the players cannot reduce their threat; they win once no enemy is in play.                                                                                                                                                                                                                                                                                                                |

The Defense of Helm's Deep adds 1 to the staging area's threat for each of its
resource tokens and receives one at the end of each quest phase; at 8 it goes
to the victory display and the players advance to stage 5A from any stage.

## Encounter cards

| Card                | Behaviour                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Poisoned Counsels   | Functions like a player card in its owner's deck. Forced: after it is drawn, its owner discards every other card in his hand.                                                                        |
| Wild Hillman        | Forced: after it attacks, 1 progress on the active location. Shadow: 1 progress on the active location, then +1 attack for each progress on it.                                                      |
| Warrior of Dunland  | Peril, Archery 1. When Revealed: an immediate attack against the player. Forced: after its attack destroys a character, 3 progress on the active location.                                           |
| Soldier of Isengard | Toughness 1, Archery 1. Forced: after its attack destroys a character, 1 progress on the current quest. Shadow: exhaust a character you control.                                                     |
| The Hornburg        | While active, the archery total is reduced by 1 for each player. When explored, X damage (enemies in play) is assigned among characters in play.                                                     |
| Deeping Wall        | While active, heroes get +1 defense. When explored, each player raises his threat by 4.                                                                                                              |
| Deeping Culvert     | X threat, 1 more than the first player's allies. When explored, each player reveals an enemy searched from the encounter deck or discard pile; the deck is shuffled.                                 |
| Postern Door        | While active, heroes get +1 attack. When explored, players cannot declare attacks until the end of the round.                                                                                        |
| Helm's Gate         | While active and a player is not engaged with an enemy, the first player reveals a card at the end of the staging step. When explored, each enemy gets -20 engagement cost and +2 attack this round. |
| Scaling Ladders     | Surge. Attaches to the active location: each enemy gets +1 threat. Shadow: +1 attack; a kill places 1 progress on the current quest.                                                                 |
| Devilry of Saruman  | 3 progress on the main quest (bypassing the active location), and each character's text box is blank (except for Traits) until the end of the round. Shadow: +2 attack and Toughness 2 this round.   |
| Reckless Hate       | Peril. The staged enemy with the highest attack makes an immediate attack against the player; without one it gains surge. Shadow: an additional attack.                                              |
| Night Without End   | Peril, Doomed 2. Remove 1 resource token from The Defense of Helm's Deep, or reveal 2 additional cards. Shadow: the attacker returns to the staging area after the attack.                           |

Interpretations:

- **The 1A choice** is made by the first player for the group once the
  opening hands are kept; the Soldiers of Isengard and Poisoned Counsels not
  used for the number of players are removed from the game.
- **Defense** stops every progress from questing successfully, including the
  active location's share. Progress the encounter deck places through a
  failed quest, Soldier of Isengard and Scaling Ladders goes to the active
  location first; Devilry of Saruman, 2B's end of the round and 4B bypass it.
  Wild Hillman and Warrior of Dunland place progress only on an active
  location.
- **3B's forced effect** checks whether a failed quest placed progress on the
  stage itself (an active location may absorb all of it).
- **Reckless Hate** with several staged enemies tied for the highest attack
  lets the revealing player choose which attacks.
- **Night Without End** offers the token only while The Defense of Helm's Deep
  has one.
- **Devilry of Saruman's shadow** adds Toughness 2 to any Toughness the enemy
  already has; it lasts until the end of the round.
- **Stage 1B's ally** must match the sphere of a hero its owner controls; a
  player without one puts none into play.

## Verification

```sh
npm run test:engine
npm run test:helms-deep-simulation
npm run build
npm run test:browser-helms-deep
npm run audit:rules
```

The focused suite (`tests/helms-deep.test.ts`, 15 tests) covers setup in one
to four players and both difficulties, both 1A choices, stage 1B and its ally,
Poisoned Counsels, the Defense keyword, every stage, The Defense of Helm's
Deep and the victory, every location, treachery, enemy and shadow, the Orcs of
the White Hand, Archery, saves and the scenario panel data. The source test
pins the snapshot, the normal and easy quantities, the corrections and all 28
faces.

The complete-game matrix plays fourteen games from setup with exact save
restoration after every action, physical conservation (including the
set-aside and removed cards, the Poisoned Counsels in the players' decks and
treacheries being resolved) and private-view checks: games with an odd number
of players take Poisoned Counsels and stage 1B, and the encounter deck pushes
the starter decks through the Defense stages until it defeats The Wall is
Breached! or Aragorn falls. A second matrix starts twelve games with The
Defense of Helm's Deep at 7 resource tokens: every game rides out to The King
Rides Out, and four of the six easy games win it. Hidden and decisions review
parity is checked in both matrices.

The browser suite runs eight native setups with exact physical inventories
(odd player counts take Poisoned Counsels, even ones advance to stage 2A) and
shows the 1A choice, the five printed quest cards, stage 1B's ally, Assault
on Helm's Deep with The Defense of Helm's Deep, the choices of Night Without
End and Reckless Hate, Devilry of Saruman, The Hornburg, The Wall is
Breached!, The King Rides Out, the victory and the loss at 1280/390/320px; it
checks all 28 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
