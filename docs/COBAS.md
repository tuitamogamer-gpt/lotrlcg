# A Storm on Cobas Haven

This import covers all eleven original Adventure Pack player designs and the
original standard/easy adventure for solo and 1–4 players in local hot-seat.
Ioreth reuses her existing Collector's Edition implementation; the other ten
designs add player definitions. Revised Dream-chaser campaign and Nightmare
variants retain separate support gates. The next chronological Adventure Pack
is The City of Corsairs.

## Original sources

[Printed sources and corrections](COBAS-SOURCES.md) document the original MEC52
and Grey Havens rules, all 43 scenario artwork faces, Sailing symbols and exact
physical quantities. The original pack contains 31 player cards, 26 encounter
cards and three quests. All eleven player faces are cached locally.

The reference catalog and reference recipes remain unchanged. Runtime promotion
corrects Raider Flagship's end-of-encounter timing, Belfalas Islet's Victory 1,
the spurious Cobas Haven shadow and five omitted easy-mode removals.

| Source storage zone                                 | Standard | Easy |
| --------------------------------------------------- | -------: | ---: |
| Main encounter deck                                 |       33 |   23 |
| Corsair deck                                        |       16 |   12 |
| Fleet ships, two Warships and Heading               |        7 |    7 |
| Flagship, Scouting Ship and four coastal objectives |        6 |    6 |
| Quest deck                                          |        3 |    3 |
| Gameplay cards and Heading reference                |       65 |   51 |

Printed setup selects one coastal objective, shuffles the other three into the
encounter deck and resolves Guarded on the selected objective. These storage
counts therefore describe the recipe before setup decisions.

## Adventure

The fleet uses the existing Sailing, Heading, ship combat and separate Corsair
deck rules. Coastal objectives remain in staging and are controlled by the
players while free of their guarding encounter. Their benefits and actions
support Sailing, Archery reduction, damage to enemy ships and recruiting
Dol Amroth Warships. The interface identifies each visible defense and guard,
available Warships and the public Corsair deck/discard counts.

Stage 1 requires ten progress and changes engagement damage with the heading.
Stage 2 requires sixteen progress and every objective to be free of encounters.
Stage 3 requires five progress plus five per Ship enemy in play; defeating
Raider Flagship is an alternative victory condition at that stage. Only Ship
objectives can be declared as attackers against the Flagship.

Skirmisher capture preserves the physical card while changing its in-play type.
Belfalas Islet retains the actual ship while it is considered out of play.
Warship destruction returns the physical card to the set-aside area; the three
original non-Dream-chaser fleet ships instead have their own printed controller
elimination clauses. The Dream-chaser's printed destruction condition loses
the game. These effects are distinct from discarding a ship. See the [detailed scenario
rules and interpretation notes](COBAS-HAVEN-RULES.md).

Player rules cover resource restrictions and combat spending, Signal attachment
responses, damage redirection, optional shared payment, quest commitment,
healing and revival, and Justice Shall Be Done's physical victory cost and
delayed player elimination. Pending choices use the ordinary controls and save
format. See [player rules and interactions](COBAS-PLAYER-SCRIPTS.md).

The additive account-choice SQL migration accepts the new scenario and is
tested locally. It does not configure or migrate a hosted account database.

## Verification

Use Node 22 and the locked dependencies:

```sh
npm ci
npm run check
npm run test:engine
npm run audit:rules
npm run build
npm run test:cobas-simulation
npm run test:cobas-multiplayer
npm run test:browser-cobas
```

The dedicated review matrix covers standard/easy mode, one to four players and
all four event-review modes, restoring saves after every action and comparing
final rule states. The multiplayer group covers eight seeds for each difficulty
and player count. Its observers check private decks and physical card movement.
Focused semantic and browser fixtures cover actual victories as well as losses.

CI retains the earlier suites and adds dedicated Cobas Haven review, multiplayer
and browser groups. Browser groups use the engine job's production artifact.

Local release verification passed all **4,011 engine tests**, without failures
or skips, plus TypeScript, the production build and coverage audit. The engine
suite includes original-source checks, 54 Cobas scenario cases, player rules
and Na'asiyah's encounter-character uniqueness interactions. A subsequent
Houses of Healing correction removes an incorrect Sacked! restriction from
its optional Healer exhaustion cost; the new saved-choice regression and
related economy/Carrock suites pass all 45 tests.

The scenario browser suite passed **261 checkpoints** and the player browser
suite passed **117 checkpoints** at 1280, 390 and 320 pixels, with no browser
errors. These runs verify all 43 original scenario artwork files, 41 printed
gameplay faces and all eleven player faces. Their HTTP witnesses match
`index-CC0IUSyS.js` (313,494 bytes, SHA-256
`ee59fb6344dd44cd902dae165032ee45717edc2aaed766d94533084ded5f7e42`).
This artifact includes the nested Guarded and shared Heavy Cruiser corrections.
The 475 earlier Voyage/Depths/Temple/Drowned browser checks were performed on
the preceding candidate; their original artifact records are retained.

The final build adds only the narrow Houses/Sacked correction after these
complete browser runs. Its entry is `index-BD0_FMp0.js` (313,494 bytes, SHA-256
`bb29bb07c2ad700268df05bc56872e01a0da63370cc507a762f6c3e3840913fe`).
The targeted final-artifact browser suite passes all **12 checkpoints** at the
same three widths, including actual discounted payment and saved selections.
Complete-game review results and production proof are recorded separately with
the release evidence under ignored `output/`. The complete suites also run in
CI on the published commit.
