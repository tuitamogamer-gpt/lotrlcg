# Original The Sands of Harad sources

Prepared and checked on 15 October 2026. This import covers the original
**MEC55 deluxe expansion**, all thirteen original player designs (`16001`–`16013`),
and the original standard/easy recipes for Escape from Umbar (`Q07.1`/`E07.1`),
Desert Crossing (`Q07.2`/`E07.2`) and The Long Arm of Mordor (`Q07.3`/`E07.3`).
Nightmare versions and later reprints remain separate records.

## Printed rules and pinned inputs

- [Publisher's original MEC55 rules](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec55_rules_webready.pdf),
  linked from the official LOTR LCG product support page, HTTP 200,
  **3,678,999 bytes**, SHA-256
  `dda538cf6c73514cdab24f2df02ddfc05e6cd3ee50d9d31f147e6858b84f2ba4`.
  Pages 4, 5 and 7 give difficulty levels **5, 6 and 7**. Page 5 defines the heat
  tracker and immediate loss at temperature 60. Page 9 defines objective-heroes,
  uncontrolled heroes in staging, guarded heroes and the main quest's stage number.
  The page 9 rendering and all original card faces were visually checked.
- [Official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf)
  supplies general timing, immunity and attachment rules. Its SHA-256 is
  `a82b0e7e1fe27d942eaeae9426e6821ccc8157dad9a424e70d2f5bafa604e7d9`.
  In particular §1.23 says a non-objective card attached to another card loses
  its original type and becomes an attachment; §1.17 describes guarded objectives.
- Hall of Beorn independently confirms the original physical standard/easy
  inventories: [Escape from Umbar](https://hallofbeorn.com/LotR/Scenarios/Escape-from-Umbar),
  [Desert Crossing](https://hallofbeorn.com/LotR/Scenarios/Desert-Crossing), and
  [The Long Arm of Mordor](https://hallofbeorn.com/LotR/Scenarios/The-Long-Arm-of-Mordor).
  Nightmare columns were excluded. These inventories expose the upstream recipe
  errors described below; no revised or Nightmare quantities were substituted.
- Each original scenario scan is retained locally, with its source URL, face,
  local path, byte count and SHA-256 pinned in its immutable pending snapshot.
  Thirteen original player scans are pinned in the table below.

| Immutable file                                        | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `public/catalog.json`                                 | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                               | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json`                 | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `src/data/pending/escape-from-umbar-import.json`      | `01e62c5a0b06f85f08f8f979d4d7f0491362bbc2b1abe393957bbb207ced5c79` |
| `src/data/pending/desert-crossing-import.json`        | `5669f15003685692abd29da2cec842dd2061f501be3eeb98fbd57a2ba17810aa` |
| `src/data/pending/the-long-arm-of-mordor-import.json` | `01b6e33045dcaaeb249e4980d7147a030ac6335e433fd7eb823b58e10ad2ea6b` |

The three snapshots were generated with `prepare-scenario-import.mjs --recipe
Q07.1`, `Q07.2` and `Q07.3`, each with `--download`; their expansion-rules source
was pinned to the publisher's MEC55 URL above before freezing the snapshots.
They contain **18/20/23 identities and 20/23/27 faces**, respectively. Their sets
are disjoint: **61 scenario identities and 70 original scenario JPEGs** in total,
including all nine double-sided quests. There are no rules proxies. All fifty-two
non-quest identities total exactly **112 printed encounter cards**. Adding the
nine quests and 35 physical player cards accounts for the original **156-card**
expansion component list.

## Printed corrections in runtime copies

The immutable catalog and snapshots retain the source errors. Only the promoted
runtime copies are corrected using the downloaded original printed faces.

| Card                    | Source issue                                    | Printed original / runtime correction                                                                                                      |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Port of Harad (19)      | Printed threat stored as `0`                    | Threat **X**, equal to engaged enemies. Numeric runtime base remains 0; the rule supplies X and `printed_stats` records X.                 |
| Were-worm (23)          | Printed threat stored as `0`                    | Threat, attack and defense are all **X**, the tens digit of the temperature. It has **no printed Victory** value.                          |
| Scorched Hamada (26)    | Printed threat stored as `0`                    | Threat **X**, the tens digit of temperature.                                                                                               |
| Southron Boma (36)      | Printed threat stored as `0`                    | Threat **X**, the stage number of the main quest.                                                                                          |
| Southron Soldier (42)   | Shadow permits any staging enemy                | Choose a **non-unique** enemy in staging, engage it and deal it a shadow card.                                                             |
| In Enemy Territory (45) | Title says “In Hostile Territory”               | Printed title is **In Enemy Territory**; physical identity unchanged.                                                                      |
| Uruk Chieftain (61)     | Spurious Victory 3                              | **No Victory** box on the original scan; both numeric and printed Victory fields removed.                                                  |
| Surprise Attack 1B (71) | Omits where successful quest progress is placed | “After placing progress **on this stage** from questing successfully…” A side quest or an active location does not satisfy this condition. |
| Umbar Street (17)       | Self-reference says “Street of Umbar”           | Printed self-reference is **Umbar Street**.                                                                                                |
| Sauron's Enforcers (35) | Uses “sequence number on”                       | Printed wording is **stage number of the main quest**.                                                                                     |

Minor transcription corrections restore “players” on Narrow Alleyway, remove a
duplicated “the” from “Seize them!”, fix “thirst” on Under the Merciless Sun,
and remove punctuation accidentally inserted into Surprise Attack's hero recovery.
Functional quest-point values are **15/15**, **8/14/16**, and **0/5/10/15**. Find the
Others 2A has flavor text only; its absence of a When Revealed effect is preserved.

## Original standard and easy inventories

| Recipe                      | Quest | Encounter deck | Staging candidates | Set aside | Total physical |
| --------------------------- | ----: | -------------: | -----------------: | --------: | -------------: |
| Escape from Umbar standard  |     2 |             31 |                  6 |         0 |         **39** |
| Escape from Umbar easy      |     2 |             24 |                  6 |         0 |         **32** |
| Desert Crossing standard    |     3 |             33 |                  4 |         0 |         **40** |
| Desert Crossing easy        |     3 |             27 |                  4 |         0 |         **34** |
| Long Arm of Mordor standard |     4 |             29 |                  0 |         9 |         **42** |
| Long Arm of Mordor easy     |     4 |             23 |                  0 |         9 |         **36** |

Hall of Beorn's encounter-only totals are **37/30**, **37/31** and **38/32**.
Adding the physical quest decks yields the totals above. Runtime recipes correct
only these independently checked upstream quantity errors:

- Umbar standard: **five Umbar Sentries**, not four, and **two Enemy Pursuits**,
  not one. Its easy mode uses **four Sentries, two Enemy Pursuits and one Umbar
  Street**; the source incorrectly kept a second Street and omitted a Pursuit.
- Desert easy: **two Unbearable Heat**, not one.
- Long Arm easy: **two Mordor Wargs**, not one.

The five Umbar staging location candidates and four Burnt Sands copies in Desert
are physical recipe storage, not additional cards. Setup selects the required
number and returns the unused copies to the encounter deck. Long Arm's nine
set-aside cards comprise the four objective-heroes, four Sauron's Enforcers and
Uruk Chieftain; setup moves existing physical cards rather than making copies.
Easy mode removes only the original gold-ring cards and grants the printed
extra setup resource, following MEC55 page 11.

## Original player faces

| Code  | Original design       | Local scan SHA-256                                                 |
| ----- | --------------------- | ------------------------------------------------------------------ |
| 16001 | Gimli                 | `09e6a150217f4e5323a40e0a42d2cfb649d22f2c1d39dba833666798f2b57e5e` |
| 16002 | Legolas               | `12519bc06c5abb02670b1f848932767f8cae202318c5f527d94cd8bb3def0077` |
| 16003 | Greenwood Archer      | `8ef705c40c7b919de13b88c5327ed1d858b01d6b70dbe8dc0a682380d107c5f9` |
| 16004 | Erebor Guard          | `b5b5f0e623ca0f77735bc957045f5520badb1e1ac900166e9f8860aac2ed48c9` |
| 16005 | Halfling Bounder      | `8622c7857256afc2dee90696364d7a204f7ec82e84eae2df943139c74475f7cf` |
| 16006 | Vigilant Dúnadan      | `9ce72504b1bc3abedda18b09e946fcb4dddc50bf803502b2ae1eb43a2c62b45a` |
| 16007 | Unlikely Friendship   | `4d9ccdb59b293b8026b9122b978f9aa657435e9fd1579ee4c78f3d4b6c92dd0d` |
| 16008 | Well Warned           | `b9fa1937c4a437664a864e947848c52be31aaba78f34703accd714745e6ae5f7` |
| 16009 | Dour Handed           | `bb686acaec8b5e73053a9e20ba2f38873e18fd40d9d9e51d843947e0b73b5450` |
| 16010 | Dwarven Shield        | `99e5c0971b9cd7eb0613c7f73457aec36df9c1a469f57747bd1e6136dae57e24` |
| 16011 | Mirkwood Long-knife   | `2a86bd0cad1e0df23934c66bbf96c1fa05446bb2d76d35a522773708140e4499` |
| 16012 | The Road Goes Ever On | `9934883378a18a27f51c9b43812376c247da52db92980087a64675f66a4ca752` |
| 16013 | The Storm Comes       | `55799e113965ca9547f0d7c82545fb1033ba54341ad08ceadd021094705f5284` |

The source URL ending `.jpg` for Vigilant Dúnadan actually serves PNG bytes.
Those bytes are preserved as `/cards/16006.png`; the remaining twelve faces are
JPEGs. Greenwood Archer (`16003`) and Mirkwood Long-knife (`16011`) already have
runtime definitions. The thirteen original designs therefore add **eleven new
runtime definitions**, with each reused design registered once. Both original
hero identities remain distinct from earlier Gimli and Legolas cards.

The next chronological Adventure Pack is **The Mûmakil**, first in the Haradrim
cycle; it is not included in this deluxe import.
