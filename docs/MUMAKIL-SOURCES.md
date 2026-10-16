# Original The Mûmakil sources

Prepared and checked on 16 October 2026. This import covers the original **MEC56
Adventure Pack**, its ten player designs (`17001`–`17010`), and the original
standard/easy scenario recipes (`Q07.4`/`E07.4`). Nightmare and subsequent
Adventure Packs remain separate records.

## Printed sources and immutable inputs

- The [publisher's original MEC56 rules sheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec56_rule_set.pdf)
  is linked from the official LOTR LCG product support page. The downloaded PDF
  returned HTTP 200, **1,355,205 bytes**, SHA-256
  `6423e20365c78b4fc7443e4ae711dcd6e07fb6591634918ae8d2299bf96f2c32`.
  Page 1 gives **difficulty 4** and exactly two encounter sets: **The Mûmakil**
  and **Jungle Forest**. Page 2 contains Kahliel's story, not additional scenario
  rules. The next story chapter is **Race Across Harad**.
- The [official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf)
  supplies general immunity, attachment and timing rules. The downloaded PDF is
  **14,383,996 bytes**, SHA-256
  `a82b0e7e1fe27d942eaeae9426e6821ccc8157dad9a424e70d2f5bafa604e7d9`.
  It does not add a one-Capture-objective-per-enemy restriction to stage 2A.
- [Hall of Beorn's original scenario inventory](https://hallofbeorn.com/LotR/Scenarios/The-M%C3%BBmakil)
  independently confirms all normal/easy physical quantities. Its Nightmare
  column was excluded. The catalog's two original recipes need no quantity
  correction.
- Original card scans were downloaded from the DragnCards English image store.
  Every scenario face has its source URL, local path, byte count and SHA-256 in
  the immutable snapshot. All 23 scenario faces and all ten player faces were
  visually inspected against their runtime text and stats.

| Immutable input                            | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `public/catalog.json`                      | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                    | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json`      | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `src/data/pending/the-mumakil-import.json` | `2a1b8c1723dbf013c7d512f5f980c02be2f6f031f5cfffc59bdc65e96fb548ae` |

The snapshot was generated with `prepare-scenario-import.mjs --recipe Q07.4
--download`, then its publisher rules URL was recorded before freezing it. It
retains the upstream text errors below. Runtime corrections affect only
`mumakil-encounter-cards.json` and `mumakil-quest-cards.json`; the original
catalogs and snapshot stay unchanged. `mumakil-player-cards.json` is an exact
copy of the ten original catalog player records.

## Original components and setup storage

The original Adventure Pack contains **60 physical cards**: **28 player cards**,
**30 encounter cards**, and **two double-sided quests**. There are 15 new
non-quest encounter identities and two new quest identities. The four existing
Jungle Forest definitions from The Sands of Harad are reused. Thus the scenario
uses **21 identities and 23 printed faces**, including the quest backs, and the
pack adds 19 new scenario scan files plus ten player scan files.

| Recipe           | Quest deck | Encounter deck before setup | Set aside before setup | Total physical |
| ---------------- | ---------: | --------------------------: | ---------------------: | -------------: |
| Standard `Q07.4` |          2 |                          28 |                     12 |         **42** |
| Easy `E07.4`     |          2 |                          21 |                     12 |         **35** |

The twelve recipe set-aside components comprise four Wild Mûmak, four different
Capture objectives, and four different location candidates: Mûmak Trail, Jungle
Trail, Forest Clearing and Dense Jungle. The location candidates are physical
storage for the printed setup choice. Each player selects a different location;
unused candidate locations return to the encounter deck. They are not extra
copies. The resulting encounter-deck sizes after setup are **32 minus the player
count** in standard mode and **25 minus the player count** in easy mode. Four
Wild Mûmak and four Capture objectives remain out of play.

Easy mode removes one Harad Tiger, one Strangling Python, one Terrible Fever,
one Biting Insects, one Jungle Trail, one Forest Clearing and one Overgrown.
Both modes retain four Mûmak Trail, four Territorial Ape and four Wild Mûmak.
General easy-mode setup also grants each hero one additional starting resource.

## Printed corrections in promoted runtime records

| Card                         | Upstream omission or error                            | Printed original used by runtime                                                                                                                             |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Poisoned Spear (12)          | Incomplete description of the engaged player          | Uses the player engaged with the attached enemy.                                                                                                             |
| Wild Mûmak (15)              | Omits its entire Forced ability; adds a `Mumak` trait | At round end, its engaged player chooses its return to staging or an immediate attack. Printed trait is **Creature.**                                        |
| Harad Tiger (16)             | Omits Forced and shadow effects                       | Returns to staging after its attack destroys a character; its shadow grants an additional attack.                                                            |
| Mûmak Trail (20)             | Omits travel cost                                     | Each player's threat must increase by one to travel there.                                                                                                   |
| Stampeding Oliphaunt (21)    | Text stops after Doomed 1                             | A staging Wild Mûmak attacks the first player; if no attack occurs, search the encounter deck/discard for a Mûmak Trail and add it to staging, then shuffle. |
| Guardians of the Jungle (25) | Keeps only the flavor text                            | Gives each location +1 threat and finds/engages a Territorial Ape when it becomes the current quest. Its printed Forced effect does not instruct a shuffle.  |
| Capture the Oliphaunts (27)  | Incorrect title “Capture the Mumakil” on both faces   | Printed title is **Capture the Oliphaunts**.                                                                                                                 |
| Prepare for Battle (`17003`) | Omits quest points and Victory                        | Runtime registration supplies **quest 6, Victory 1**; the source player record remains exact.                                                                |

Mûmak spellings are restored in the promoted text. Quest requirements are
**12** and **8**. Stage 1 requires the number of Wild Mûmak in play to equal the
number of players; stage 2 requires no Capture objectives to remain in play.
Stage 2A assigns each player one random set-aside Capture objective and lets that
player choose a Wild Mûmak in play. Neither that printed effect nor the rules
sheet says the chosen enemy must be different or lack an existing objective.

Dwarf Pipe's original scan says a card discarded from the top of the deck. Its
current catalog text uses the intentional later wording covering a discard from
the deck, also printed in Dwarves of Durin. This change is documented in
[Hall of Beorn's errata record](https://hallofbeorn.com/LotR/Details/Dwarf-Pipe-TMk?Lang=EN)
and the [published designer clarification on starter deck changes](https://www.reddit.com/r/lotrlcg/comments/thd422/).
The unchanged catalog wording is used for gameplay; the original scan remains
available. This erratum is not attributed to FAQ 1.9.

## Original player scan pins

All ten original player scans are JPEGs stored as `/cards/<code>.jpg`. The
source URL for each is
`https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/<octgnid>.jpg`, using
the original print's `octgnid` in `mumakil-player-cards.json`.

| Code  | Original design     | Local scan SHA-256                                                 |
| ----- | ------------------- | ------------------------------------------------------------------ |
| 17001 | Kahliel             | `c5d7235e3e389522a956a2ef546c7f33a6d5bb764780e7dc9486961ad2e6729b` |
| 17002 | Andrath Guardsman   | `f5301f0d147dd20fe6ce6046a9d58c956ec48c877821391ca8c0cc14ec0fd47d` |
| 17003 | Prepare for Battle  | `c56c69b30f3f9b2b2edb7584e511bc55fb61ec223e8689fcc149618bd894a98b` |
| 17004 | Yazan               | `c6cec5ef5a78597b6600da26f66f359ff9d69a7cb407a387ea09fc5bf06220d0` |
| 17005 | Wait no Longer      | `4174ab0909df9cedd7321ae7e7e338f083af227cc293ee720ace7c2e985adb19` |
| 17006 | Jubayr              | `23456ca523f0639b0ace4381a1f34d9e6f5dfd8445302dd0cfcfb2ef8356bf5e` |
| 17007 | Dwarf Pipe          | `925217bd06104abcd14f84f382fd9e8769b1423667a7abf19fed80f81e0ec43a` |
| 17008 | Firyal              | `191ee19a5b1808001fbce12b87a65b8de49a060abf6e6fb882872ed4c0b46843` |
| 17009 | Coney in a Trap     | `6a0d67c34cabee59d888b94bd4f42e6d3b757694f2d116fc45189c828512e654` |
| 17010 | Kahliel's Headdress | `0a4e4fedc2b2520e1b9e77e51f2827f6c498a8c09151e854568ce15dd17daa70` |
