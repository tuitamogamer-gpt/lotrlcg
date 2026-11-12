# The Battle of Five Armies

The third and last scenario of **The Hobbit: On the Doorstep** (2013) follows
[The Lonely Mountain](LONELY-MOUNTAIN.md). It is playable in classic solo and
with one to four local players, in normal and easy mode. The On the Doorstep
Bilbo Baggins is described with [Flies and Spiders](FLIES-SPIDERS.md) and the
other Saga rules with [We Must Away, Ere Break of Day](WE-MUST-AWAY.md).

## Sources and corrections

- The rules for three quest stages in play, the current quest and the Battle
  and Siege keywords follow the rules insert, summarised from the
  [RulesPal transcription](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-hobbit-on-the-doorstep/rulebook).
- Recipes Q0A.6 (44 encounter cards with Bolg) and E0A.6 (34) match the normal
  and easy quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Battle-of-Five-Armies).
  They are recorded in `tests/battle-five-armies-source-quantities.json`. The
  atlas difficulty of 7 rounds Hall of Beorn's community rating of 6.9.
- The reviewed scans print **Battle** on stage 3B and **Siege** on stage 4B;
  the catalog text omits both keywords, so the card data adds them.
- The immutable snapshot `src/data/pending/the-battle-of-five-armies-import.json`
  has SHA-256
  `fad8a73b3f11a632af1e3ad19bdf4b534022bc98e2f4d7a832aa542a407a9ea2`.
- `tests/battle-five-armies-art.json` pins all **30 faces**. The 26 new faces
  were checked by eye and confirm the catalog text apart from the two keywords.
- Discovered treasures of all three earlier sets may join decks: the Trolls'
  hoard, Bilbo's Magic Ring and the Erebor treasures.

## Three stages in play

- Setup stages Bolg and reveals 1 encounter card per player. Stage 1B then
  puts stages 2, 3 and 4 into play at the same time and leaves play.
- At the beginning of each round, before resources are collected, the first
  player chooses which of the three stages is the current quest. Progress is
  placed only on the current quest, and effects on "the current quest" affect
  only it. Each stage keeps its own progress.
- Battle in the Dale (3B) has Battle: characters quest with attack. The
  Defense of Ravenhill (4B) has Siege: characters quest with defense.
- A stage is complete while it has 8 or more progress; a completed stage stays
  in play, can still be chosen and can lose progress. The players advance to
  stage 5 once all three stages are complete at the same time.
- Many cards count each quest stage in play with no progress on it.

| Stage | Quest points | Rules |
| --- | --- | --- |
| 1A/1B The Gathering of the Clouds | – | Setup and the three stages, as above. |
| 2A/2B The Eastern Spur | 8 | Forced: if it has no progress at the end of the round, each player discards 1 random card from hand. |
| 3A/3B Battle in the Dale | 8 | Battle. Forced: with no progress at the end of the round, the first player adds the topmost enemy in the encounter discard pile to the staging area. |
| 4A/4B The Defense of Ravenhill | 8 | Siege. Forced: with no progress at the end of the round, each player discards every resource from each hero's pool (Bilbo's Baggins resources included). |
| 5A/5B The Clouds Burst | – | Each player adds a Bodyguard of Bolg from the encounter deck (or discard pile) to the staging area; the deck is shuffled. No progress can be placed. While in the staging area, Bolg is considered engaged with the first player. Destroying Bolg wins the game. |

| Card | Behaviour |
| --- | --- |
| Bolg | X threat is the number of players. Immune to player card effects; he cannot leave the staging area except by being destroyed, and cannot be engaged. The first Goblin revealed each round gains surge. |
| Bodyguard of Bolg | Bolg cannot take damage while any Bodyguard is in play. It is dealt 1 additional shadow card per quest stage with no progress. |
| Vanguard of Bolg | +1 threat, attack and defense per quest stage with no progress. Shadow: if the attack destroys a character, all progress is removed from the current quest. |
| Gundabad Climber | When Revealed: remove 1 progress from every quest stage in play (2 with three or more players). |
| Gundabad Wolf Rider | Forced: when it attacks, remove 1 progress from the current quest. Shadow: +1 attack per stage with no progress. |
| Gundabad Archer | When Revealed: each player deals 2 damage to a character they control. Shadow: 1 damage to the defender per stage with no progress. |
| Ravenous Warg | The defending player must declare their character with the most damage as the defender, even if exhausted (they choose among ties); the attack cannot be left undefended. Shadow: −1 defense to the defender per stage with no progress. |
| Misty Mountain Eagle | Objective ally. Action: the first player spends 2 Baggins resources to take control of it, or to discard it and a non-unique enemy in the staging area. Shadow: 3 damage to the attacking enemy. |
| Heedless of Order | Surge. The first player chooses a different stage to be the current quest until the end of the round; if the current quest cannot change (stage 5), it gains Doomed 3. |
| Hatred Rekindled | Each enemy engaged with a player makes an immediate attack without a shadow card; with no attack it gains surge. Shadow: the enemy attacks again right after. |
| Goblins are Upon You! | Cannot be canceled. Each player puts a Goblin enemy of their choice from the encounter deck or discard pile into play engaged with them; the deck is shuffled. Shadow: +1 attack per Goblin engaged with the defending player. |
| Northern Slopes | In the staging area, each Goblin enemy gets +1 attack and +1 defense. While active, a character leaving play removes 1 progress from the current quest. |
| The Front Gate, Ruins of Dale, Ravenhill | Immune to player card effects. At the end of each round each removes 2 progress from stage 2B, 3B or 4B. Travel: spend 3 Baggins resources, or 1 while that stage is the current quest. Victory 3. |
| Wilderland | Dark Bats, Hidden Path, Weighed Down and Fighting Among Friends share their rules through `src/game/wilderland.ts`. |

Interpretations:

- At the end of the round the first player resolves the stages' Forced
  effects before the Ruins locations remove progress (the order that favours
  the players).
- Bodyguard of Bolg's extra shadow cards are dealt when shadow cards are
  dealt to it; Hatred Rekindled's attacks deal none, as printed.
- With no damage on any character, every character the defending player
  controls is tied for the most damage against Ravenous Warg.

Engine additions: scenario hooks for effects at the start of the round, for
the quest stat (Battle and Siege) and for forced defenders.

## Verification

```sh
npm run test:engine
npm run test:battle-five-armies-simulation
npm run build
npm run test:browser-battle-five-armies
npm run audit:rules
```

The focused suite covers:

- setup, the round's choice of current quest, separate progress, Battle and
  Siege, and advancing only with all three stages complete;
- stage 5: Bodyguards, Bolg's considered engagement and damage protection, and
  victory;
- the end-of-round Forced effects, Bolg, every encounter card and its shadow,
  treasure sets and malformed saves.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation and private-view checks. The
starter decks rarely survive past round 4, so stage 5 is covered by the
focused tests and the browser suite.

The browser suite runs eight native setups with exact physical inventories.
It shows the quest cards, the choice of current quest, a Siege quest, the
Misty Mountain Eagle's action, stage 5 and victory. It runs at 1280/390/320px
and checks all 30 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
