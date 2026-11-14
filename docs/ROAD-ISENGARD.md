# The Road to Isengard

The third scenario of **The Lord of the Rings: The Treason of Saruman** (April
2015). It is playable in classic solo and with one to four local players, in
normal and easy mode, with the box's Fellowship-sphere Aragorn as in The
Uruk-hai and Helm's Deep. Campaign mode, with its campaign card, boons and
the Saruman's Voice burden, is not part of this import.

## Sources and corrections

- The rules insert, as summarised by
  [RulesPal](https://rulespal.com/the-treason-of-saruman/rulebook), defines
  **Wizardry** as a timing trigger: when a location with a Wizardry effect
  leaves play as an explored location, its Wizardry effect resolves, even if
  it was not the active location. Machines of Isengard triggers the active
  location's effect, and Saruman and Wolf of Isengard react when they are
  dealt a shadow card with a Wizardry effect.
- Recipes Q0B.09 and E0B.09 match the quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Road-to-Isengard):
  40 encounter cards in normal mode without the campaign cards (the Snaga
  Orcs, the four Ents of Fangorn and the four set-aside cards included), 3
  quest cards and the Fellowship Aragorn. Hall of Beorn counts Gríma in easy
  mode, but its gold encounter set icon removes it from the easy deck, as
  recipe E0B.09 does; easy mode has 30 encounter cards. The quantities are
  recorded in `tests/road-isengard-source-quantities.json`. Hall of Beorn's
  community rating of 6.9 gives the atlas difficulty of 7.
- Snaga and Saruman's Orders (the Snaga Orcs) are shared with The Uruk-hai:
  their rules moved to a shared module and their effects keep the names The
  Uruk-hai saved them under.
- The immutable snapshot `src/data/pending/the-road-to-isengard-import.json`
  has SHA-256
  `29f786bdeca187b4de4d71c992e51b1b690b50fedc210b7cf7be8558fd850882`.
- `tests/road-isengard-art.json` pins all **26 faces** (23 new ones were
  checked by eye; Snaga, Saruman's Orders and Aragorn were reviewed with The
  Uruk-hai). They correct Saruman and Wolf of Isengard, which react to a shadow
  card "with a Wizardry effect" (Saruman's defending player resolves "that
  Wizardry effect"), Poisoned Vapour, which treats each damaged character's
  text box "as if it were blank (except for Traits)", and Gates of Isengard,
  which prints Victory 1; paragraphs follow the cards and double spaces are
  removed.

## Stages

| Stage                      | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Rouse the Ents       | –            | Setup: Gates of Isengard, Orthanc, Saruman and Saruman's Staff are set aside; each Ent of Fangorn is added to the staging area. The players cannot draw cards or gain resources, and do not commit characters or reveal encounter cards during the quest phase. At the end of each round, 1 resource here; the players may then advance, revealing 1 encounter card for each resource and removing the staged Ents. |
| 2A/2B Breaking Isengard    | –            | When Revealed: Gates of Isengard becomes the active location; Saruman and Orthanc enter the staging area. The players cannot travel to Orthanc. After a non-unique location is explored, 1 damage here; at 5 the players advance. Quest Action: exhaust an Ent of Fangorn to place 2 progress on a non-unique location.                                                                                             |
| 3A/3B The Voice of Saruman | 15           | When Revealed: each player draws 6 cards and discards down to 6; Saruman's Staff is attached to Saruman. While Orthanc is the active location, Saruman is engaged with the first player. When Orthanc is explored, the phase's progress on the quest is canceled and Orthanc returns to the staging area. A player with no cards in hand is eliminated. Defeating this stage wins the game.                         |

**Ent of Fangorn**, in the staging area, has a Quest Action any player may
trigger: exhaust a hero to discard the top card of the encounter deck; if the
hero's willpower is greater than that card's threat, 1 resource goes on the
Ent, and at 3 the resources are discarded and the player takes control of it.

**Saruman** (Indestructible, immune to player card effects, cannot leave the
staging area) keeps every damage token, even beyond his 6 hit points. **Saruman's
Staff** makes him attack each player who draws cards, with 2 shadow cards,
then removes 1 damage from him; while he has any hit points remaining, the
players cannot win.

## Encounter cards

| Card                  | Behaviour                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gates of Isengard     | Unique, immune to player card effects, Victory 1. When explored, each player searches the encounter deck and discard pile for an enemy and puts it into play engaged with him; then shuffle. |
| Orthanc               | Unique, immune to player card effects. In the staging area: after the players quest successfully, the first player looks at the top 3 cards, reveals 1 and discards the others.              |
| Steaming Vent         | Staging area: after a player commits characters, 1 damage to a questing character he controls. Wizardry: X damage among characters in play (1 more than the players).                        |
| Open Pit              | Staging area: after a player draws cards from a player card effect, +2 threat. Wizardry: each player +2 threat.                                                                              |
| Plain of Isengard     | X threat, the number of players. Staging area: archery damage goes to allies, if able. Wizardry: each player discards an ally he controls.                                                   |
| Underground Armoury   | Staging area: after an enemy engages a player, it is dealt a shadow card. Wizardry: each player exhausts a character he controls.                                                            |
| Ring-wall of Isengard | Staging area: after damage is healed from a character, its owner discards a card. Wizardry: each player discards a random card.                                                              |
| Isengard Orc          | Peril, Archery 1. Discard a random card or reveal a card. Shadow: +2 defense until the end of the round.                                                                                     |
| Gríma                 | Doomed 2. After it attacks a player, that player shuffles it into the encounter deck and reveals a card. Shadow: the attack is considered undefended.                                        |
| Lieutenant of Orthanc | After its attack destroys a character, that character's controller discards a random card.                                                                                                   |
| Wolf of Isengard      | Dealt a shadow card with a Wizardry effect: discard a card, or it makes an additional attack. Shadow: 1 damage to the defending character.                                                   |
| Blast of Sorcery      | X damage among committed characters (1 more than the players). Shadow: +1 attack, +2 if the defending player has 1 or fewer cards in hand.                                                   |
| Machines of Isengard  | Triggers the active location's Wizardry effect, or gains surge. Shadow: +1 attack; a kill discards a random card.                                                                            |
| Poisoned Vapour       | Surge. Exhaust each damaged character; their text boxes are blank until the end of the combat phase. Shadow: discard a non-objective attachment you control.                                 |

Interpretations:

- **Stage 1B's quest phase** keeps its commit window, where the Ents' Quest
  Action is used; nobody can commit and no card is revealed, so the quest
  resolves with 0 willpower against the staging area's threat. The resource
  phase draws no card and gives no resource; easy mode's extra resource is
  part of the setup.
- **Advancing from stage 1B** is a group decision the first player makes at
  the end of each round. The cards are revealed while 1B is still the current
  quest; the Ents still in the staging area are then removed.
- **Breaking Isengard's Quest Action** can be used by the player who controls
  the Ent of Fangorn it exhausts. Progress on a location in the staging area
  explores it there, which triggers its Wizardry effect and 2B's damage.
- **Saruman's reaction** to a Wizardry shadow card resolves as his attack
  begins: before the defender is declared for the Staff's attacks, and after
  it in the combat phase, where Saruman, engaged only through Orthanc, is
  dealt his shadow card as he attacks. With "as if he is the only player", X
  is 2 for Steaming Vent and each "each player" effect applies to the
  defending player alone. Wolf of Isengard's reaction also resolves as its
  attack begins, even when Underground Armoury dealt the card earlier.
- **Saruman's Staff** gives every draw its attack, the resource phase's draw
  included; the draws of stage 3A come before the Staff is attached. The
  attacks follow the players' order of drawing.
- **Orthanc explored at 3B** cancels the progress already placed on the quest
  this phase and the rest of that phase's quest progress, so a successful
  quest that explores Orthanc places none on the stage.
- **The Voice of Saruman's victory** is checked continuously: once the stage
  has 15 progress, the players win as soon as Saruman has no hit points
  remaining.
- **Open Pit** counts draws from player card effects only: the resource phase
  and stage 3A draw without it.
- **Poisoned Vapour** blanks the characters that were damaged when it
  resolved.
- **Gates of Isengard** puts each enemy into play engaged with its player
  without revealing it; Underground Armoury still deals it a shadow card.

## Verification

```sh
npm run test:engine
npm run test:road-isengard-simulation
npm run build
npm run test:browser-road-isengard
npm run audit:rules
```

The focused suite (`tests/road-isengard.test.ts`, 14 tests) covers setup in
one to four players and both difficulties, Rouse the Ents and the Ents'
Quest Action, advancing to stage 2, Breaking Isengard and its Quest Action,
The Voice of Saruman, Saruman, his Staff and Orthanc, elimination and the
victory, every Wizardry effect and staging-area effect, every enemy,
treachery and shadow, Saruman in combat, saves and the scenario panel data.
The source test pins the snapshot, the normal and easy quantities, the
corrections and all 26 faces.

The complete-game matrix plays fourteen games from setup with exact save
restoration after every action, physical conservation (including the
set-aside cards, the Ents under the players' control or removed from the
game, Saruman's Staff, the cards Orthanc looks at and treacheries being
resolved) and private-view checks: the players rouse the Ents with their
Quest Action, take control of all four in some games, break Isengard and
reach The Voice of Saruman, where Saruman's Staff and the encounter deck
wear them down. A second matrix starts twelve games at The Voice of Saruman
with 12 progress, Saruman beyond his hit points and the four Ents roused:
nine of them are won through the staging step, Orthanc and the Staff's
attacks. Hidden and decisions review parity is checked in both matrices.

The browser suite runs eight native setups with exact physical inventories
and shows the three printed quest cards, an Ent's Quest Action, the choice to
advance from stage 1, Breaking Isengard, Steaming Vent's Wizardry, The Voice
of Saruman with Saruman engaged through Orthanc, the Staff's attack with two
shadow cards, Orthanc's look at the top cards, Isengard Orc's choice, the
victory and the elimination at 1280/390/320px; it checks all 26 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
