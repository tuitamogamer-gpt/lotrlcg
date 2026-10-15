# The Sands of Harad

All thirteen original player designs and the three original standard/easy quests
are implemented for solo and 1–4-player local hot-seat. Greenwood Archer and
Mirkwood Long-knife reuse existing registrations; eleven player definitions are
new. The release adds 52 encounter definitions and nine quest cards.

| Adventure | Standard components | Easy components | Rules |
| --- | ---: | ---: | --- |
| Escape from Umbar | 39 | 32 | [Umbar](ESCAPE-UMBAR.md) |
| Desert Crossing | 40 | 34 | [Desert](DESERT-CROSSING.md) |
| The Long Arm of Mordor | 42 | 36 | [Mordor](LONG-ARM-MORDOR.md) |

Components include quest cards and setup zones before player-count searches.
The original box contains 112 encounter cards, nine quest cards and 35 player
cards. Its 61 scenario identities have 70 printed faces; all are cached locally,
along with the thirteen original player scans.

Escape from Umbar implements the pursuit, the 15-progress stage limit, starting
locations, enemies underneath Narrow Alleyway and the phase/shadow transition
before fleeing. Desert Crossing implements temperature, loss at 60, mandatory
ally entry effects, poison and attacks without new shadows. The Long Arm of
Mordor preserves each original captured hero, objective-hero and guarding enemy
through rescue, ownership changes and saved choices. Objective-hero elimination
remains effective when printed text is blank.

[Source pins](HARAD-SOURCES.md) record the original publisher PDF, immutable
snapshots, artwork hashes and runtime corrections. [Rules notes](HARAD-RULES.md)
distinguish explicit publisher instructions and implementation interpretations.
[Player rules](HARAD-PLAYER-SCRIPTS.md) cover costs, response timing and saved
continuations. Revised and Nightmare content retain separate support gates.

Run `npm run test:harad-quests` and `npm run test:harad-players` for actual-control
browser checks at 1280/390/320. `npm run test:harad-simulation` runs 96 complete
games: three quests, both difficulties, 1–4 players and four review modes.
`npm run test:harad-multiplayer` selects the three broader multiplayer groups.

Focused rule checks pass: 36 Umbar, 34 Desert, 37 Mordor, 44 player and five source
tests. Nine observer tests cover physical setup recipes, transient reveals,
Mirage, Narrow Alleyway, captured heroes, held shadows and attachment choices,
including deliberate missing-card failures. Final engine, browser and complete
game results retain their actual source/artifact scope in the ignored release
proof under `output/harad-release` and `output/harad-parity`.

Current inventory is 573 players, 66 heroes, 506 ordinary deck cards plus one
Encounter ally, 833 encounters and 57 scenarios. Coverage resolves 1,574/4,183
reference identities and 114/355 recipes. Next: **The Mûmakil**.
