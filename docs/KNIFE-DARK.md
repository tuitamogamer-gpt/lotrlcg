# A Knife in the Dark

The second scenario of **The Lord of the Rings: The Black Riders** (2013), in
The Lord of the Rings Saga. It is playable in classic solo and with one to
four local players, in normal and easy mode. Campaign mode, with its boons,
is not part of this import.

## Sources and corrections

- The Saga rules (the Ring-bearer, The One Ring, staging in player order and
  Peril) are those of A Shadow of the Past; see [its rules](SHADOW-PAST.md).
- The scenario notes of
  [Vision of the Palantir](https://visionofthepalantir.com/2018/05/30/a-knife-in-the-dark/)
  describe the setup, each stage and the encounter cards.
- Recipe Q0B.02 matches the normal quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/A-Knife-in-the-Dark):
  44 encounter cards without the campaign card. Hall of Beorn's community
  rating of 6.7 gives the atlas difficulty of 7.
- **Easy mode keeps 2 of the 4 Ringwraiths.** The catalog's easy recipe
  E0B.02 set all 4 aside. Hall of Beorn (31 encounter cards without the
  campaign card) and Vision of the Palantir both give 2. The corrected
  quantities are recorded in `tests/knife-dark-source-quantities.json`.
- The immutable snapshot `src/data/pending/a-knife-in-the-dark-import.json`
  has SHA-256
  `013b95737fcd2efeb5a58d056ffeb547023619a217309cc8cbe407989d1de91e`.
- `tests/knife-dark-art.json` pins all **26 faces**. They were checked by eye
  and correct the catalog:
  - The printed names are Shady Bree-lander, Squint-eyed Southerner and
    Power in their Terror.
  - Black Breath and Pale Blade have the Morgul trait.
  - "The One Ring" and "The Prancing Pony" are capitalised as printed, and
    double spaces between paragraphs are removed.
- Pathless Country, Piercing Cry and Lure of the Ring were imported with
  A Shadow of the Past. Their rules now live in a shared module,
  `src/game/black-riders-hunted.ts`, used by both scenarios.

## Stages

| Stage                        | Quest points | Rules                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1A/1B Trouble in Bree        | 8            | Setup: every Ringwraith, The Witch-king, Midgewater and Weathertop are set aside, out of play; The Prancing Pony and Bill Ferny are added to the staging area. The players cannot advance while The Prancing Pony is in play.                                                                                |
| 2A/2B Into the Wild          | 6            | When Revealed: Midgewater is added to the staging area and each player places 1 progress on the current quest. Forced, at the end of the round: remove X progress from the current quest or shuffle an out of play Ringwraith into the encounter deck (X = players). No advance while Midgewater is in play. |
| 3A/3B The Ringwraiths Attack | –            | When Revealed: Weathertop, The Witch-king and each Nazgûl enemy in the encounter deck and discard pile are added to the staging area. The players win as soon as no Nazgûl enemy is in play.                                                                                                                 |

## Encounter cards

| Card                                             | Behaviour                                                                                                                                                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Prancing Pony                                | Response: after the players travel there, the first player may put an ally from hand into play. Forced: after it leaves play, cards are discarded from the encounter deck until X enemies are found; they enter play engaged with the first player. |
| Weathertop                                       | Immune to player card effects. Travel: the first player exhausts The One Ring. In the victory display, each enemy in play gets −1 threat.                                                                                                           |
| Midgewater                                       | While it is the active location, enemies cannot attack, take damage or be engaged. After it becomes the active location, each engaged enemy returns to the staging area.                                                                            |
| Weather Hills                                    | Response: after the players travel there, a non-unique enemy in play may be placed facedown under it, out of play. It returns to the staging area when the location leaves play.                                                                    |
| Chetwood                                         | In the staging area, Spy enemies get +1 threat and +1 attack per copy. Shadow: the defending player discards a random card from hand.                                                                                                               |
| Bill Ferny                                       | Cannot be optionally engaged. Forced, at the beginning of the staging step: the first player shuffles an out of play Ringwraith into the encounter deck, or each player raises their threat by 1 per non-Fellowship hero they committed.            |
| Shady Bree-lander                                | Cannot be optionally engaged while The One Ring is exhausted. Shadow: −1 defense, −2 with The One Ring exhausted.                                                                                                                                   |
| Squint-eyed Southerner                           | When Revealed: its revealing player shuffles an out of play Ringwraith into the encounter deck or reveals another card.                                                                                                                             |
| Rider of Mordor                                  | Nazgûl. Characters of the engaged player get −1 willpower. −10 engagement cost while The One Ring is exhausted. No non-Morgul attachments.                                                                                                          |
| Ringwraith                                       | Nazgûl. When it attacks with The One Ring exhausted, it gets an additional shadow card. Shadow: the card is shuffled into the encounter deck. No non-Morgul attachments.                                                                            |
| The Witch-king                                   | Nazgûl, immune to player card effects. −30 engagement cost while The One Ring is exhausted. Characters with 1 willpower or less cannot defend his attacks.                                                                                          |
| Unwanted Attention                               | Peril. Remove 2 heroes you control from the quest, or shuffle an out of play Ringwraith in. Shadow: the attacker returns to the staging area.                                                                                                       |
| Black Breath                                     | Peril. A Condition on a hero its revealing player controls (one per hero): willpower, attack and defense are 0.                                                                                                                                     |
| Pale Blade                                       | Surge. A Weapon on a Nazgûl enemy in play (one per enemy): +1 attack, cannot take non-combat damage.                                                                                                                                                |
| Power in their Terror                            | Each ally gets −1 willpower until the end of the round; each ally with 0 willpower takes 2 damage. Shadow: the defending player discards a non-objective attachment they control.                                                                   |
| Pathless Country, Piercing Cry, Lure of the Ring | As in A Shadow of the Past.                                                                                                                                                                                                                         |

Interpretations:

- **"Out of play" Ringwraiths** are those set aside by stage 1A. A defeated
  Ringwraith goes to the discard pile and cannot be shuffled back by these
  effects.
- **Either/or choices.** As elsewhere in the project, an option that can be
  fully resolved must be chosen when one exists. Unwanted Attention needs 2
  committed heroes; Into the Wild needs X progress on the current quest;
  shuffling needs a Ringwraith out of play. When neither option can be fully
  resolved, as much of the removal as possible happens.
- **Choices.** The first player decides for Bill Ferny, Into the Wild, Weather
  Hills and The Prancing Pony; the revealing player decides for Squint-eyed
  Southerner, Unwanted Attention, Black Breath and Pale Blade.
- **Into the Wild's progress** goes directly onto the current quest, not onto
  the active location.
- **Black Breath** sets the hero's statistics to 0: later bonuses do not
  raise them while it is attached.
- **Power in their Terror's penalty** applies to the allies in play when it
  resolves.
- **The Prancing Pony's discards** stop when the encounter deck runs out;
  the discard pile is not shuffled back, so the effect always ends.
- **The Prancing Pony's enemies** are put into play, not revealed: their
  When Revealed effects do not resolve. While Midgewater is active they stay
  in the staging area, since they cannot be engaged.
- **Weather Hills.** The hidden enemy loses its attachments, shadow cards and
  damage, and comes back as a fresh card. A Nazgûl hidden at stage 3B is not
  in play, so hiding the last one wins the game.

Engine additions:

- The shared Hunted/Ring module `src/game/black-riders-hunted.ts`. The
  Ringwraiths, The Witch-king, Pale Blade and Power in their Terror moved to
  `src/game/black-riders-nazgul.ts` when [Flight to the Ford](FLIGHT-FORD.md)
  arrived; their effect names are unchanged.
- A generic round-long willpower modifier (`roundWill`), saved with the unit
  and cleared at the end of the round.
- A generic scenario hook for enemies that cannot attack, used by Midgewater.

## Verification

```sh
npm run test:engine
npm run test:knife-dark-simulation
npm run build
npm run test:browser-knife-dark
npm run audit:rules
```

The focused suite (`tests/knife-dark.test.ts`, 24 tests) covers setup in
both modes, each stage, the win condition, every encounter card and shadow,
the either/or rules, saves and the scenario panel. The source test pins the
snapshot, the quantities and all 26 faces.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation (including set-aside cards and
enemies under Weather Hills) and private-view checks. Its policy keeps the
best defender back, chooses Bill Ferny's threat while it is low, never
travels to Weathertop and puts Black Breath on the Ring-bearer. The starter
decks lose every game against this difficult scenario, but games in each
difficulty reach stage 2B, so stage 3 is covered by the focused and browser
suites.

The browser suite runs eight native setups with exact physical inventories,
shows the quest cards, Bill Ferny's choice, The Prancing Pony, Midgewater,
Weather Hills, Weathertop, the stage 3A reveal, the victory and the loss of
The One Ring at 1280/390/320px, and checks all 26 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
