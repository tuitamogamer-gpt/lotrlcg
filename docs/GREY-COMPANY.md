# The Passing of the Grey Company

The first scenario of **The Lord of the Rings: The Flame of the West**
(August 2016). It is playable in classic solo and with one to four local
players, in normal and easy mode, with the box's Fellowship-sphere Aragorn,
whom the first player controls. Campaign mode (its campaign card, the Army of
the Dead boon and the rule that forbids Frodo Baggins) is not part of this
import.

## Sources and corrections

- Recipes Q0B.13 and E0B.13 match the scans' set numbers: 34 encounter cards
  (Army of the Dead is "1/34", No Turning Back "33/34" and "34/34") — the 32
  of the encounter deck with The Stone of Erech and Army of the Dead — plus
  the 4 copies of Overcome by Fear (the box's card 16), the 3 quest cards,
  Aragorn (card 1) and the scenario's rules card.
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Passing-of-the-Grey-Company)
  matches every normal quantity; its 39 normal encounter cards are the same
  34, the 4 copies of Overcome by Fear and the campaign card. In easy mode it
  keeps 2 Shadow Host and 3 Blood Runs Chill where recipe E0B.13 keeps 1 and
  1; the import follows the catalog's recipe, as for the other Saga
  scenarios. The quantities are recorded in
  `tests/grey-company-source-quantities.json`. The scenario has no official
  difficulty;
  [Vision of the Palantír](https://visionofthepalantir.com/2023/08/02/the-passing-of-the-grey-company/)'s
  community rating of 6.5 gives the atlas difficulty of 7.
- The immutable snapshot `src/data/pending/the-passing-of-the-grey-company-import.json`
  has SHA-256
  `24d6ca9e8cc4ab22cde321ed7a6ed1e9c5f8ddcbbbbfdaf7d10ab68e752f0165`.
- `tests/grey-company-art.json` pins all **24 faces**, checked by eye
  (Aragorn and Overcome by Fear from RingsDB, the others from DragnCards).
  They correct Aragorn's "leaves play, the players lose the game", Overcome
  by Fear's "Then, you may spend", "a threat of 35 or higher" on Haunted Path
  and Blood Runs Chill, Shadow Host's "When Shadow Host engages you", stage
  3B's "While The Stone of Erech is the active location" and Army of the
  Dead's printed threat X; the keyword lines of Blood Runs Chill (Doomed 1),
  The Way is Shut (Peril, Surge) and Whispers in the Dark (Peril), which the
  catalog lists as traits, head their text boxes as printed; trailing spaces
  are removed. The rules card's
  front holds the Frodo, Phantom and Army of the Dead rules (its back is
  blank).

## Stages

| Stage                        | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1A/1B The Forbidden Door     | –            | Setup: The Stone of Erech and Army of the Dead are set aside; each player attaches a copy of Overcome by Fear to his threat dial, and the other copies leave the game. When Revealed: each player may add 1 resource to each hero he controls for 3 threat. Forced: at the end of the planning phase, each player discards his hand and the players advance. |
| 2A/2B The Paths of the Dead  | X            | When Revealed: each player searches the encounter deck for a different location and adds it to the staging area. X is the highest threat; no player can reduce his threat below his initial threat level; at the beginning of each planning phase each player raises his threat by 1 or cannot play cards that phase.                                        |
| 3A/3B The Dead are Following | 5            | When Revealed: The Stone of Erech and Army of the Dead join the staging area; each player may raise his threat by 3 to set Overcome by Fear aside. While The Stone of Erech is active, Oathbreaker enemies lose Phantom and get -20 engagement cost; the players win when The Stone of Erech leaves play explored.                                           |

**Overcome by Fear** (Burden, objective, on a threat dial, limit 1 per
dial): its player's threat cannot be reduced; at the end of each round he
raises his threat by 1 and may then spend 1 Fellowship resource to set it
aside. **Phantom**: when an attack by a Phantom enemy would deal damage, the
damage is canceled and the defending player raises his threat by as much.

## Encounter cards

| Card                  | Behaviour                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ghosts of Men         | Peril, Phantom. When Revealed: Overcome by Fear, or an immediate attack against you.                                                                                                                                |
| Dead Man of Dunharrow | Phantom. Forced: after it engages you, Overcome by Fear or 2 threat. Shadow: +1 attack.                                                                                                                             |
| Shadow Host           | Phantom. Forced: when it engages you, Overcome by Fear or an immediate attack.                                                                                                                                      |
| Faithless Dead        | Peril, Phantom. When Revealed: 2 threat for each player, or another encounter card. Shadow: +1 attack and no Phantom for this attack.                                                                               |
| Army of the Dead      | Unique, Phantom, immune to player card effects, threat twice the number of players, Victory 6. Forced: when it attacks, discard an ally you control or Overcome by Fear.                                            |
| Haunted Path          | +1 threat for each player with a threat of 35 or higher. Travel: each player raises his threat by 1. Shadow: 2 threat, or the enemy returns to the staging area after the attack.                                   |
| Deadly Road           | In the staging area: after a When Revealed effect is canceled, each player raises his threat by 1. Travel: spend 1 Fellowship resource.                                                                             |
| Trysting Place        | In the staging area: enemies in the staging area cannot take damage. Travel: the first player puts an Oathbreaker enemy from the encounter deck or discard pile into play engaged with him.                         |
| Dark Door             | In the staging area: no progress on locations in the staging area. Travel: the first player reveals an encounter card.                                                                                              |
| The Stone of Erech    | Unique, immune to player card effects. Forced: after it becomes active, each player adds an Oathbreaker enemy from the encounter deck or discard pile to the staging area. Travel: remove 5 progress from stage 3B. |
| No Turning Back       | When Revealed: each player discards an ally he controls or takes Overcome by Fear. Shadow: Overcome by Fear, or an additional attack.                                                                               |
| Whispers in the Dark  | Peril. When Revealed: Overcome by Fear, or each character you control gets -1 willpower, -1 attack and -1 defense this round. Shadow: +1 attack (+2 if undefended).                                                 |
| Blood Runs Chill      | Doomed 1. When Revealed: each player with a threat of 35 or higher deals 1 damage to each exhausted character he controls. Shadow: at 35 or higher, the defender cannot ready this round.                           |
| The Way is Shut       | Peril, Surge. When Revealed: Overcome by Fear, or no progress on the current quest this round.                                                                                                                      |

Interpretations:

- **Aragorn** passes with the first player token, with his resources and
  attachments, like the Saga's Ring-bearer; if he leaves play — or the player
  controlling him is eliminated — the players lose. With an Artifact
  attached he gains sentinel and does not exhaust to quest. A player's other
  Aragorn is set aside at setup, and Frodo Baggins heroes are allowed outside
  campaign mode.
- **Overcome by Fear's Fellowship resource** comes from the player's own
  Fellowship hero: only the player controlling Aragorn at the end of the
  round can set his copy aside that way, so the copies leave the dials as
  Aragorn goes round the table.
- **"Either attach a set aside Overcome by Fear, or …"** offers the first
  option only while a copy is set aside and the player has none on his dial
  (limit 1 per threat dial); an option that cannot change the game is not
  offered, and with one left it resolves alone.
- **The Forbidden Door's When Revealed** follows the opening hands, before
  the first round; the resources include Aragorn's.
- **The Paths of the Dead's search** gives each player a location whose
  title no other player has chosen; with none left he finds nothing.
- **The Dead are Following's 5 quest points** do not defeat the stage: the
  progress pays The Stone of Erech's travel cost, and only exploring the
  Stone wins.
- **Phantom** replaces each instance of combat damage of the attack, to the
  defenders or, undefended, to a hero; the defending player is the attacked
  player.
- **Trysting Place's travel** needs an Oathbreaker enemy in the encounter
  deck or discard pile, as its cost must be paid in full.
- **Peril** cards are resolved by the revealing player, who makes the
  choice.

## Verification

```sh
npm run test:engine
npm run test:grey-company-simulation
npm run build
npm run test:browser-grey-company
npm run audit:rules
```

The focused suite (`tests/grey-company.test.ts`, 13 tests) covers setup in
one to four players and both difficulties, The Forbidden Door's resources,
discarded hands and advance, the different locations of The Paths of the
Dead, X and the initial-threat floor, the planning-phase choice, The Dead
are Following with The Stone of Erech and its win, Overcome by Fear
(threat, end of round, Fellowship resource, set-aside copies, limit 1 per
dial), Phantom defended, undefended and lost, every enemy, treachery,
location and shadow, Aragorn (control, Artifact, defeat), the scenario
panel data and saves. The source test pins the snapshot, the quantities,
the corrections and all 24 faces.

The complete-game matrix plays fourteen games from setup (one to four
players, and hidden, decisions and all review modes, in both difficulties)
with exact save restoration after every action, physical conservation (the
set-aside cards, the copies of Overcome by Fear on the dials, set aside and
removed, the treacheries being resolved and Aragorn included) and
private-view checks. A second matrix starts twelve games at The Dead are
Following with 5 progress and The Stone of Erech in the staging area: the
players travel there, the Oathbreakers come, and the Stone is explored.

The browser suite runs eight native setups with exact physical inventories
and shows the three printed quest cards (both sides), The Forbidden Door's
resources, The Paths of the Dead's search and planning choice, a Phantom
attack, Overcome by Fear's Fellowship resource, Whispers in the Dark,
Haunted Path's shadow, The Dead are Following, The Stone of Erech, the
victory and Aragorn's fall at 1280/390/320px (59 checkpoints); it checks
all 24 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
