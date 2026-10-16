# Original Race Across Harad sources

Prepared and checked on 16 October 2026. This import covers the original
**MEC57 Adventure Pack**, its ten player designs (`17028`–`17037`), and the
original standard/easy scenario recipes (`Q07.5`/`E07.5`). Nightmare and subsequent
Adventure Packs remain separate records.

## Printed sources and immutable inputs

- The [publisher's original MEC57 rules sheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec57_web_race_across_harad-rules.pdf)
  is linked from the official LOTR LCG product support page. The downloaded PDF
  returned HTTP 200, **5,502,300 bytes**, SHA-256
  `60f47b97c765b9535f65d6b369070d2cf91330ed61729801b58e88c902ff7990`.
  Page 1 gives **difficulty 6** and exactly three encounter sets: **Race Across
  Harad**, **Desert Sands**, and **Mordor Orcs**. Page 2 defines the separate
  Orcs' area and pursuit deck. Page 3 contains Thurindir's story.
- The [official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf)
  supplies general immunity, attachment, timing and card ownership rules. The
  downloaded PDF is **14,383,996 bytes**, SHA-256
  `a82b0e7e1fe27d942eaeae9426e6821ccc8157dad9a424e70d2f5bafa604e7d9`.
  It contains no Race Across Harad-specific erratum.
- [Hall of Beorn's original scenario inventory](https://hallofbeorn.com/LotR/Scenarios/Race-Across-Harad)
  gives **45 standard / 41 easy non-quest physical components**. Its Nightmare
  column was excluded. The three upstream easy-mode quantity errors below are
  corrected only in the promoted runtime recipe. The Mordor Warg correction
  agrees with the already verified original Long Arm of Mordor import.
- Original card scans were downloaded from the DragnCards English image store.
  All **36 scenario faces** have a source URL, local path, byte count and
  SHA-256 in the immutable snapshot. All 25 new scenario faces and ten player
  faces were visually read against their runtime text and stats. The eleven
  shared scenario faces retain their previously checked Sands of Harad pins.

| Immutable input                                  | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `public/catalog.json`                            | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                          | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json`            | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `src/data/pending/race-across-harad-import.json` | `8d9a6672bf7a35ecdab637d6f43718499479faa698a600d24d87f6631fcc3385` |

The snapshot was generated with `prepare-scenario-import.mjs --recipe Q07.5
--download`, then its publisher rules URL was recorded before freezing it. It
retains the upstream omissions and quantity errors below. Runtime corrections
are confined to the three promoted scenario data files.
`race-harad-player-cards.json` is an exact copy of the ten original catalog
player records.

## Original components and setup storage

The original Adventure Pack contains **60 physical cards**: **28 player cards**,
**24 encounter cards**, and **eight double-sided quests**. There are nine new
non-quest encounter identities and eight new quest identities. Eleven existing
Desert Sands and Mordor Orcs definitions are reused. Thus the complete scenario
uses **28 identities and 36 printed faces**. It adds 25 new scenario scan files
and ten original player scan files; shared scans are reused.

| Runtime recipe   | Player quest deck | Remaining Orc quest deck | Encounter deck before setup | Set aside before setup | Total physical |
| ---------------- | ----------------: | -----------------------: | --------------------------: | ---------------------: | -------------: |
| Standard `Q07.5` |                 4 |                        3 |                          33 |                     13 |         **53** |
| Easy `E07.5`     |                 4 |                        3 |                          29 |                     13 |         **49** |

The thirteen set-aside components comprise four Tamed Mûmak, River Harnen,
Uruk Chieftain, one Uruk Warg-rider, the Orcs' initial Setting Out quest, and
five different location candidates. Setup selects one different location for
each player, returns unused candidates to the encounter deck, moves the
physical Chieftain and initial quest into the Orcs' area, and gives each player
one physical Tamed Mûmak. Unused Mûmak are removed from the game. The remaining
three Orc quests form the rest of their pursuit deck. These are storage zones
for original physical components, rather than additional copies.

The encounter deck after the location setup choices contains **38 minus the
player count** in standard mode and **34 minus the player count** in easy mode.
River Harnen and the selected Uruk Warg-rider remain set aside until their
printed effects bring them into play. General easy-mode setup grants each hero
one additional starting resource.

The standard source recipe is retained exactly. The original easy snapshot has
26 cards in `sharedEncounterDeck` and 46 physical components overall. The
promoted easy recipe restores only these three missing copies:

| Card                   | Upstream easy quantity | Original easy quantity |
| ---------------------- | ---------------------: | ---------------------: |
| Racing Warg            |                      2 |                  **3** |
| Howling at their Heels |                      2 |                  **3** |
| Mordor Warg            |                      1 |                  **2** |

The resulting easy inventory removes one Uruk Warg-rider, one Fear of Mordor,
one Towering Dunes and one Sandstorm from the standard inventory. Original
card identities and all other recipe rows are unchanged.

## Printed corrections in promoted runtime records

| Card                            | Upstream omission or error                                                | Printed original used by runtime                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Setting Out 1A (47)             | Sets aside “Ford of Harnen” and groups Uruk Chieftain into the quest deck | Sets aside **River Harnen** and one Uruk Warg-rider, creates the Orc quest deck, then places **Uruk Chieftain in the Orcs' area**. |
| Setting Out 1B (47)             | Omits quest points                                                        | Printed **0** quest points, followed by its When Revealed effect and advance to stage 2A.                                          |
| Blistering Erg (41)             | Records printed threat as `0`                                             | Printed threat is **X**, the main quest's stage number; the numeric placeholder remains zero and gameplay calculates X.            |
| Harad Road (42)                 | Adds a `Road` trait                                                       | Printed trait is **Desert.**                                                                                                       |
| Tamed Mûmak (38), player quests | Omits the accent in Mûmak                                                 | Restores the original printed spelling in promoted scenario records.                                                               |
| Explore Secret Ways (`17036`)   | Omits quest points and Victory                                            | Runtime registration supplies **quest 6, Victory 1**; the original player source record stays unchanged.                           |

All other new encounter and quest rules and stats match the inspected original
faces. In particular, Tamed Mûmak has **2 willpower, 5 attack, 2 defense and
8 hit points**. The three substantive player quests have **15, 20 and 20**
quest points. The four Orc quests have **10, 15, 20 and 20** quest points.
The original Orc quest backs use the `.B.jpg` image filenames in the source
store even though their printed face letters are D.

The rules sheet defines matching player and Orc stages by both printed name
and number. At different stages, cards in the Orcs' area are immune to player
card effects, cannot leave that area, and do not count as staging cards. At the
same stage, those restrictions are lifted and their threat contributes to the
staging area. Orc stage 4D explicitly uses **the total threat of engaged
enemies** for pursuit progress. This differs from the preceding Orc stages,
which use the total threat in the Orcs' area.

## Original player scan pins

All ten original player scans are JPEGs stored as `/cards/<code>.jpg`. Their
source URL is `https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/<octgnid>.jpg`,
using the original print's `octgnid` in `race-harad-player-cards.json`.

| Code  | Original design     | Local scan SHA-256                                                 |
| ----- | ------------------- | ------------------------------------------------------------------ |
| 17028 | Thurindir           | `e48bcdb2847259cd1e06387fa8da6190ac5c4437e51340c2e801c065c2122745` |
| 17029 | Kahliel's Tribesman | `8ca107124d28d98f27a754470dcd0d9781ffc1be7175653f76fd4bcebfe2318d` |
| 17030 | Steed of the North  | `062a536e4a2e7335c65ee95e04886ae99fa1e8ea24abc8380922f96d376c4d2c` |
| 17031 | Mighty Warrior      | `0307f7b8e48619b2f63a15a318363c9d557129e72eee8bcb013342ae8057ab77` |
| 17032 | Proud Hunters       | `82cd657e5c5cc74db3752046021ed347d1bbe384ad1631d21002899823654241` |
| 17033 | Dúnedain Pathfinder | `cf28270f540109e229605cad7dff8d82c9a270c99b7311941f97f30f6ba59bb5` |
| 17034 | Backtrack           | `a11e58c7e807d4f0a5b5d635bdd73e6e61c28c331e5c8941e317f20d235f678d` |
| 17035 | Eryn Galen Settler  | `b05603881ba943d36f99b2d53ae3b9e312d32c9b3ceb5eb8abc602f154f29bec` |
| 17036 | Explore Secret Ways | `189509247fbd0e87a1d6695b0aec147a3979c4e1d2300f5526e59164fba6a391` |
| 17037 | Steward of Orthanc  | `a10363cf1adb26c8190ee87f0eb156028888e121ecf80db6457ca3d0db16d39a` |
