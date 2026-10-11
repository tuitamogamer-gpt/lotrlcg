# Vanish from Sight: threat reads

Original card **12011, Vanish from Sight**:

> Play only if you control 2 or fewer heroes.
> **Action:** Until the end of the phase, if your threat is higher than 20, treat your threat as if it is 20.

The source definition is retained in `src/data/stormcaller-player-cards.json` and its original front image in `public/cards/12011.jpg`.

`src/game/threat-read.ts` exports `stormcallerEffectiveThreat(s, player = s.table?.active ?? 0)`. It has only a type import and reads the active player's top-level projection or the requested remote seat. The lasting effect is the owning player's `phase:stormcaller:vanish` marker in `used`. The reader returns `min(actual, 20)` while marked. It does not change the dial, use getters/proxies, or check hero count again after the event resolves. The existing phase-end cleanup clears this marker for every seat.

## Evaluated rule reads

These comparisons and derived rule values use the reader. A remote player's comparison supplies that player's index explicitly.

| Module                         | Evaluated reads                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core.ts`                      | Pillars of the Kings' below-40 cost condition                                                                                                                                                                                        |
| `effects.ts`                   | Engagement round eligibility and automatic engagement against the acting player's threat                                                                                                                                             |
| `board.ts`                     | Prisoner fellowship elimination; solo and multiplayer threat elimination, including variable scenario levels; Evil Storm and Treacherous Fog thresholds; Caught in a Web's highest-threat selection; Eastern Crows' shadow threshold |
| `expansion-passives.ts`        | Secrecy discount; Angbor's Valour attack and quest exhaustion; Valiant Sword and Shining Shield thresholds                                                                                                                           |
| `angmar-player-support.ts`     | Valour, including remote response initiators                                                                                                                                                                                         |
| `angmar-player.ts`             | Veteran of Osgiliath bonuses; Favor of the Valar's elimination trigger and post-resolution check                                                                                                                                     |
| `ring-maker-player.ts`         | Leaf Brooch's Secrecy and Noiseless Movement/Courage Awakened return-to-hand thresholds                                                                                                                                              |
| `dunland-trap-player.ts`       | Swift and Silent's return-to-hand threshold                                                                                                                                                                                          |
| `redhorn-player-cards.ts`      | Unseen Strike's engagement-cost comparison against the character's controller                                                                                                                                                        |
| `watcher-player-cards.ts`      | Aragorn's current-threat reduction eligibility                                                                                                                                                                                       |
| `rohan-player-cards.ts`        | Herugrim's Valour bonus and Red Arrow's Valour response                                                                                                                                                                              |
| `gondor-player-cards.ts`       | Need Drives Them's eligibility/resolution; Soldier of Gondor's Valour search; Pillars' equality eligibility                                                                                                                          |
| `shadow-flame-player-cards.ts` | A Elbereth! Gilthoniel!'s comparison before setting the dial                                                                                                                                                                         |
| `watcher-water.ts`             | Ill Purpose's highest-threat player selection                                                                                                                                                                                        |
| `dread-realm.ts`               | Highest-threat player selection                                                                                                                                                                                                      |
| `mount-gram.ts`                | Angmar Patrol's shadow threshold; Southern Gate's threat condition; highest-threat player selection                                                                                                                                  |
| `ettenmoors.ts`                | Highest-threat player selection and enemies above a player's engagement threshold                                                                                                                                                    |
| `carn-dum.ts`                  | Accursed Battlefield and Fortress Walls shadow thresholds                                                                                                                                                                            |
| `khazad-dum.ts`                | Goblin Scout's engagement restriction and shaft ability's threat eligibility                                                                                                                                                         |
| `road-rivendell.ts`            | Arwen's controller elimination and engagement-cost threshold                                                                                                                                                                         |
| `rhosgobel.ts`                 | Wilyador's controller elimination                                                                                                                                                                                                    |
| `redhorn-gate.ts`              | Arwen's controller elimination                                                                                                                                                                                                       |
| `return-mirkwood.ts`           | Gollum's controller elimination                                                                                                                                                                                                      |
| `tharbad.ts`                   | Zero-threat stage condition; shadow/Conspicuous Lot's 20-threat conditions                                                                                                                                                           |
| `heirs-numenor.ts`             | Into Ithilien's stage-four 37-threat quest-stat condition                                                                                                                                                                            |
| `rhudaur.ts`                   | Highest-threat selection and 35-threat threshold                                                                                                                                                                                     |
| `celebrimbor.ts`               | Prowling Orc's highest-threat selection; its tied-player option reports the evaluated value                                                                                                                                          |

Optional engagement has no ordinary threat threshold. Vanish changes automatic engagement checks without preventing a player from optionally engaging an otherwise legal enemy.

## Physical reads retained

The raw-read inventory used `rg '\.threat\b' src/game --glob '*.ts'`, plus threshold and ranking searches. The following raw player reads intentionally retain their physical meaning:

| Module                                                                                            | Physical reads                                                                                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `setup.ts`, `table.ts`                                                                            | Initial threat, starting-threat snapshots, physical player fields and active-seat projections                |
| `board.ts`                                                                                        | Add threat to the dial; printed hero threat in fallen-hero accounting                                        |
| `threat-reduction.ts`                                                                             | Reduction amount clamped to the actual dial and actual subtraction                                           |
| `actions.ts`                                                                                      | Score and public solo/seat threat counters                                                                   |
| `presentation.ts`                                                                                 | Actual threat dial shown in observations                                                                     |
| `save.ts`                                                                                         | Physical threat type/range validation                                                                        |
| `voice-isengard.ts`                                                                               | Before/after dial values to determine whether a Doomed effect actually raised threat and triggers a response |
| `watcher-player-cards.ts`                                                                         | Actual subtraction that resets Aragorn's dial to starting threat                                             |
| `gondor-player-cards.ts`                                                                          | Actual change and draw amount when Pillars sets the dial to 40                                               |
| `shadow-flame-player-cards.ts`                                                                    | Elbereth's explicit assignment of the dial to engagement cost after its evaluated condition succeeds         |
| `angmar-player.ts`                                                                                | Actual reduction that puts the Favor of the Valar dial five below the elimination level                      |
| `mount-gram.ts`                                                                                   | Dial assignment to the chosen hero's printed threat; actual increase needed to reach Southern Gate's target  |
| `return-mirkwood.ts`, `redhorn-gate.ts`, `voyage-belegaer.ts`, `shadow-flame.ts`, `khazad-dum.ts` | Explicit dial increases, reductions and target assignments                                                   |
| `threat-read.ts`                                                                                  | The underlying actual value from which the treated value is derived                                          |

Elbereth's original text says **set** threat, rather than raise it. For example, actual threat 40 treated as 20 is below an enemy's engagement cost 30: the comparison succeeds, and the physical counter becomes 30. Aragorn's reset likewise reaches the physical starting level; it does not subtract a difference calculated from the treated value.

The remaining positivity checks are invariant under this particular cap: `actual > 0` iff `effective > 0`, `actual >= 1` iff `effective >= 1`, and `actual >= 3` iff `effective >= 3`. They retain their original reads in `road-player-cards.ts`, `redhorn-player-cards.ts`, `heirs-player-cards.ts`, `marsh-player-cards.ts`, `elf-player-cards.ts`, `long-dark-player-cards.ts`, `khazad-player-cards.ts`, `player-cards.ts`, `considered-engagement.ts`, and `shadow-flame.ts`. These checks test positive reduction availability, a three-threat payment, or Durin's Bane's one-threat engagement condition; none can distinguish the two values.

Printed card threat and staging threat are distinct from a player's dial. All `card(...).threat`, `c.threat`, `u.tempThreat`, scenario threat bonuses, `lastQuest.threat`, `fallenThreat`, and staging-threat snapshots remain unchanged. This includes encounter calculations in `deadmens-dike.ts`, `weather-hills.ts`, `fate-numenor.ts`, `dread-realm.ts`, `wastes-eriador.ts`, `raid-grey-havens.ts`, `stormcaller.ts`, `steward-fear.ts`, `rhudaur.ts`, `voyage-belegaer.ts`, and printed-hero accounting in player modules and `starting-threat.ts`.

Direct game-loss/elimination instructions remain direct losses. In particular, a Ship-objective's destruction eliminates its controller independently of a threat threshold; an actual-threat assignment used as a proxy must not let Vanish defer that instruction.

## Regression coverage

`tests/stormcaller-threat.test.ts` checks the real play restriction and lasting marker, actual 50 treated as 20, low-threat preservation, seat isolation, hero-count changes after initiation, save restoration, physical raise/reduce/score/public values, phase expiry, ordinary and variable elimination levels, Favor, Secrecy and Leaf Brooch costs, Valour stats and quest exhaustion, engagement across seats, optional engagement, Unseen Strike, encounter/shadow thresholds, highest-threat targeting, scenario quest-stat and companion-controller thresholds, and explicit Elbereth/Aragorn dial operations.
