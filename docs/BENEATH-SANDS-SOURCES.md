# Original Beneath the Sands sources

Prepared and checked on 16 October 2026. This import covers the original
**MEC58 Adventure Pack**, its ten player designs (`17055`–`17064`), and the
original standard/easy scenario recipes (`Q07.6`/`E07.6`).

## Printed sources and immutable inputs

- The [publisher's original MEC58 rules sheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec58_web_beneath_the_sands-rules.pdf)
  is linked from the official LOTR LCG product support page. The downloaded
  two-page PDF returned HTTP 200, **2,716,010 bytes**, SHA-256
  `1301f6a1b0f3b30520df349ea0226dd35a8d477ce8d58871e3b60b8ad4875d33`.
  Page 1 gives **difficulty 5**, exactly three encounter sets (**Beneath the
  Sands**, **Desert Creatures**, **Harad Territory**), and the Search/Track
  rules. Page 2 explains Valour and continues the original story.
- The [official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf)
  supplies general immunity, attachment, timing and card ownership rules. The
  downloaded PDF is **14,383,996 bytes**, SHA-256
  `a82b0e7e1fe27d942eaeae9426e6821ccc8157dad9a424e70d2f5bafa604e7d9`.
  It contains no Beneath the Sands-specific erratum.
- [Hall of Beorn's original scenario inventory](https://hallofbeorn.com/LotR/Scenarios/Beneath-the-Sands)
  gives **41 standard / 38 easy non-quest physical components**. Its Nightmare
  column was excluded. Original scans show no easy-mode removal ring on any
  new Beneath the Sands encounter card; the easy removals are one each of
  Sand Viper, Injured Companion and Enfeebled from the shared Harad sets.
- Original card scans were downloaded from the DragnCards English image
  store. All **25 scenario faces** have source URLs, local paths, byte counts
  and SHA-256 values in the immutable snapshot. All 19 new scenario faces and
  ten player faces were visually read against the promoted runtime records.
  The six shared scenario faces retain their previously checked Sands of
  Harad pins and definitions.

| Immutable input                                  | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `public/catalog.json`                            | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                          | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json`            | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `src/data/pending/beneath-the-sands-import.json` | `9f4316ea095634147e40c30807f53c3a10201fdaabec9c7ec95bc26f7f2df18d` |

The snapshot was generated with `prepare-scenario-import.mjs --recipe Q07.6
--download`, then its publisher rules URL was recorded before freezing it.
It retains all upstream omissions and errors below. Runtime corrections are
confined to the promoted scenario records and registration of player cards.
`beneath-sands-player-cards.json` is an exact copy of the ten original catalog
player records, including metadata for later reprints.

## Original components and setup storage

The original Adventure Pack contains **60 physical cards**: **28 player
cards**, **29 encounter cards**, and **three double-sided quests**. There are
12 new non-quest encounter identities and three quest identities. Six
existing Harad definitions are reused, giving **21 scenario identities and
25 printed faces**. This adds 19 new scenario scan files and ten original
player scan files; the six shared scans are reused. The existing Hirgon
image is replaced with the original MEC58 scan rather than a later print.

| Runtime recipe   | Quest deck | Encounter deck before setup | Set aside | Staging area | Total physical |
| ---------------- | ---------: | --------------------------: | --------: | -----------: | -------------: |
| Standard `Q07.6` |          3 |                          39 |         1 |            1 |         **44** |
| Easy `E07.6`     |          3 |                          36 |         1 |            1 |         **41** |

The set-aside component is the unique Brood Mother. The staging component
is the double-sided Search objective, with **Off Track** facing up. Setup
discards until one location per player is found and moves those physical
locations into staging. These are storage zones for the original components,
rather than extra copies. General easy-mode setup grants each hero one
additional starting resource.

The standard source recipe is retained exactly. The upstream easy recipe
has 32 cards in `sharedEncounterDeck` and 37 physical components overall.
Only these four missing copies are restored in the promoted easy recipe:

| Card               | Upstream easy quantity | Original easy quantity |
| ------------------ | ---------------------: | ---------------------: |
| Hive Guardian      |                      2 |                  **3** |
| Pitch Black Tunnel |                      1 |                  **2** |
| Forced Off Track   |                      2 |                  **3** |
| Grabbed by Spiders |                      2 |                  **3** |

## Printed corrections in promoted runtime records

| Card                           | Upstream omission or error              | Printed original used by runtime                                                                                             |
| ------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| On Track (80)                  | Omits the location of its matching mark | Searches for a card with **‘On Track’ in the lower right corner**.                                                           |
| Off Track (79, Search reverse) | Says to place progress here             | Places **1 resource**, then returns the topmost discarded location or raises each player's threat by one per resource here.  |
| Pitch Black Tunnel (69)        | Records printed threat as `0`           | Printed threat is **X**, the first player's character count; the numeric placeholder remains zero and gameplay calculates X. |
| Nest of Vermin (70)            | Records four quest points               | Printed **3** quest points.                                                                                                  |
| Lost Underground (75)          | Ignores a singular Forced effect        | Its response ignores **Forced effects** on Search until the end of the phase.                                                |
| The Spiders’ Hive (78)         | Uses a singular spider in its title     | Restores the original plural title on both quest faces.                                                                      |
| Quest backs (76–78)            | Repeat the quest points as text         | Separate printed **5** quest points from the rules text on all three backs.                                                  |
| Haradrim Spear (`17056`)       | Says to attach to a Haradrim character  | Attaches to a **Harad** character.                                                                                           |
| The Red Arrow (`17058`)        | Omits Victory                           | Runtime registration supplies **Victory 1**.                                                                                 |
| Keep Watch (`17059`)           | Omits quest points and Victory          | Runtime registration supplies **quest 6, Victory 1**.                                                                        |
| Rider of Rohan (`17060`)       | Misspells “exhaust”                     | Restores the printed spelling.                                                                                               |
| Dúnedain Lookout (`17062`)     | Omits the name's accent                 | Restores the printed name.                                                                                                   |

The original **On Track** mark appears on exactly five encounter identities:
Hive Guardian, Spider Broodling, Pitch Black Tunnel, Nest of Vermin and
Blocked Passage. Their promoted records carry `on_track: true`; this is a
printed mark, not a trait or keyword in the text box. Explicit `track` values
are 4 for Pitch Black Tunnel, 3 for Nest of Vermin, and 2 each for Cobwebbed
Cavern and Blocked Passage. These annotations leave the upstream snapshot
unchanged.

The publisher's Track rule resolves **after travel**, including the Travel
effect, and only while Off Track. If the deck becomes empty during Track,
shuffle the encounter discard pile back into the deck and continue discarding
until the location's full Track value has been resolved. Finding any marked
card flips Search to On Track and removes all resources from it. Lost
Underground prevents Search from flipping and suppresses Track while in play.

All other new encounter and quest rules and stats match the inspected
original faces. Brood Mother has **4 threat, 6 attack, 4 defense, 12 hit
points, engagement 50 and Victory 4**. All three main stages have **5 quest
points**. Lost Underground has **5 quest points and Victory 10**.

## Original player scan pins

All ten original player scans are JPEGs stored as `/cards/<code>.jpg`. Their
source URL is `https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/<octgnid>.jpg`,
using the original MEC58 `octgnid` in `beneath-sands-player-cards.json`.

| Code  | Original design  | Local scan SHA-256                                                 |
| ----- | ---------------- | ------------------------------------------------------------------ |
| 17055 | Hirgon           | `38bace4165673e8d0047f7245ca73412e30f259dc9a232ded0634a78a57f35c6` |
| 17056 | Haradrim Spear   | `0c147f0cc44a44a5fff07cde785965eb7a6e00e4da3c853176f2012fe336b8c1` |
| 17057 | Hunting Party    | `390e847bc567416676b01934be2b4b0f99deec98443c5d3b70774422d436a8ba` |
| 17058 | The Red Arrow    | `ba2c3cdd1d42ebed13c15085c52d1364d3ac6301e32696d68b1e4a9271759b12` |
| 17059 | Keep Watch       | `b0cca52a476d918b992e13981b755863045c1c9cfb013f5af0659ce6464b82e1` |
| 17060 | Rider of Rohan   | `56b506b33cc761abf1f80dde9ba695903a92622b59334b0641a85bee702b759b` |
| 17061 | Fireside Song    | `da8487272bafd61d22e3f140394f474d2ac592e21494dbad434c4713977742ee` |
| 17062 | Dúnedain Lookout | `38cf4e9a89ac6e8f51a86a610847620a4892d6960188cb3cc1dd3ad04a97b952` |
| 17063 | Doughty Ranger   | `7afdb2140a66b8965728607a1b426e9361e4085fd06fd3dabe1c2779ef9949d6` |
| 17064 | The Free Peoples | `b7757029e3c4fb5874fad4d1f3bd897ba256002c4cbdc85e38f340ff4c0a3b75` |
