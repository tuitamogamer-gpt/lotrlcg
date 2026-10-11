# Original The Thing in the Depths sources

Prepared and checked on 11 October 2026. This import covers the original 2016
Adventure Pack: nine player designs and the standard/easy scenario. Revised
Dream-chaser campaign cards and Nightmare variants remain separate sources.

## Printed rules and provenance

- [Original MEC49 rulesheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec49_rules.pdf),
  linked as “Rulesheet – The Thing in the Depths” on the
  [publisher's game page](https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/).
  Retrieved 11 October 2026; SHA-256
  `48c07078e3cb7f1b99edd5f79a2840957fa07c159d3ebe6423e5e18fa180435d`.
  The September 2026 CDN path contains the original two-page insert, difficulty 5.
  Page 1 explains the separate encounter sets, setup and Grapple attachment;
  page 2 explains grappled enemies, their threat and detachment.
- [RingsDB original TitD set](https://ringsdb.com/set/TitD), player codes
  `12030`–`12038`, printing positions 30–38, original release 2 June 2016.
  One hero and eight three-copy player designs make 25 physical player cards.
  Together with three quests and 32 encounter cards, the original pack has 60 cards.
- The pinned DragnCards catalog and physical recipes remain unchanged in
  `public/catalog.json` and `public/scenarios.json`. See
  [CONTENT-IMPORT.md](CONTENT-IMPORT.md) for the original OCTGN provenance.
  Their SHA-256 values are respectively
  `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63`
  and `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f`.

`src/data/pending/the-thing-in-the-depths-import.json` preserves all 24 original
source identities, both recipes, every zone and 29 cached face entries with
source URL, local path, byte count and SHA-256. Its SHA-256 is
`7cebc4fbf1a7d749744f7b57f6cc1bad00c77e07e74a962d17c32ae47bb430ce`.
The `pending-rules` status describes the immutable preparation snapshot;
runtime support is registered separately. The snapshot retains upstream
transcription omissions and errors as source data.

## Recipes and setup zones

The original recipe IDs are `Q06.5` and `E06.5`, with pack codes `TitD` and
`TGH`. Counts describe source zones before setup. There are 21 physical
encounter identities: fifteen new TitD designs and six reused TGH designs.
The reused designs are the four Corsair Raiders cards and the two double-sided
Stormcaller Elite captains. Every source identity is a gameplay card.

| Zone                                                 | Standard | Easy |
| ---------------------------------------------------- | -------: | ---: |
| Main encounter deck, Stormcaller and Corsair Raiders |       20 |   13 |
| Second encounter deck, set aside until stage 2       |       18 |   16 |
| Initial staging, Helm and Umbar Raider               |        2 |    2 |
| Set aside, boss and two captains                     |        3 |    3 |
| Quest deck                                           |        3 |    3 |
| All physical cards across source zones               |       46 |   37 |

The second encounter deck represents the set-aside Thing in the Depths cards.
Stage 2 removes the Corsair Raiders set, flips both captains to objective allies,
adds the boss and shuffles the previously set-aside beast cards and encounter
discard into the encounter deck. No Sailing test or player Ship objective is
used in this scenario.

| Main encounter card | Standard | Easy |
| ------------------- | -------: | ---: |
| Battle-Hardened     |        2 |    0 |
| Cargo Hold          |        2 |    2 |
| Corsair Infiltrator |        2 |    2 |
| Crew Quarters       |        2 |    2 |
| Forecastle Deck     |        2 |    1 |
| Hold Steady!        |        2 |    1 |
| Quarter Deck        |        2 |    1 |
| Raid Leader         |        2 |    0 |
| Umbar Raider        |        2 |    2 |
| Weather Deck        |        2 |    2 |

| Beast encounter card | Standard | Easy |
| -------------------- | -------: | ---: |
| Crushing Arm         |        3 |    3 |
| Eye of the Beast     |        2 |    2 |
| From the Depths      |        3 |    3 |
| Giant Arm            |        3 |    3 |
| Grasping Arm         |        3 |    3 |
| Lashing Tentacles    |        2 |    0 |
| Thrashing Arm        |        2 |    2 |

The initial staging area contains one Helm of the Stormcaller and one additional
Umbar Raider. The set-aside zone contains one The Thing in the Depths,
one Captain Sahír and one Na'asiyah. Each quest below occurs once in both modes.

| Stage | Quest            | Original OCTGN identity                |
| ----- | ---------------- | -------------------------------------- |
| 1A/B  | Take the Ship!   | `cfa94470-c25c-4af3-ba71-941d1fa48a9c` |
| 2A/B  | Change of Plans  | `de744bed-1461-4442-b9a1-193d00fd39a3` |
| 3A/B  | Defend the Ship! | `81779961-8776-4c1d-953d-ed7bf1324fbf` |

Stage 1B has four printed quest points. Stage 2B prints a dash and immediately
advances through its When Revealed effect; the source encodes `back_quest: 0`.
Stage 3B has no printed quest-point box; its win condition is the boss's destruction.

## Player designs and cached artwork

`src/data/depths-player-cards.json` contains the nine original full player
records, including printing provenance. Their local images are
`/cards/12030.jpg`–`/cards/12038.jpg`; RingsDB serves JPEG bytes at the original
`.png` URLs, so local extensions follow the actual format.

| Code  | Printed design      | Type       | Physical copies |
| ----- | ------------------- | ---------- | --------------: |
| 12030 | Lanwyn              | Hero       |               1 |
| 12031 | Eldahir             | Ally       |               3 |
| 12032 | Captain's Wisdom    | Event      |               3 |
| 12033 | Master Ironsmith    | Ally       |               3 |
| 12034 | Raiment of War      | Attachment |               3 |
| 12035 | Sam Gamgee          | Ally       |               3 |
| 12036 | Elevenses           | Event      |               3 |
| 12037 | Mirkwood Explorer   | Ally       |               3 |
| 12038 | Guarded Ceaselessly | Attachment |               3 |

The 29 scenario faces and nine player scans form 38 unique local images:
30 newly cached images and eight reused Grey Havens faces. Every image decoded
successfully and matches its recorded SHA-256. Original source resolution varies:
player scans are 285–300 pixels wide and Thrashing Arm is 300 × 418;
the other scenario scans have a minimum side of at least 399 pixels.
`src/data/reference-scenario-art.json` maps original source URLs to local files.
Scenario image hashes are preserved in the pending bundle. Player image hashes follow;
each original URL is `https://ringsdb.com/bundles/cards/<code>.png`.

| Player image | SHA-256                                                            |
| ------------ | ------------------------------------------------------------------ |
| `12030.jpg`  | `969e7a8a24c42df5d83de8ad5416638a974a93bfb6cfce69cf5f462f506820b9` |
| `12031.jpg`  | `7acb348bf04e3f877054f9fd86989e60343f0ae872cf6d39823515f0f8746781` |
| `12032.jpg`  | `e8dba0fa7127b375f51b34e7e42b86c48f4dbb1cad5e97b6b43a82a7d33ce1ea` |
| `12033.jpg`  | `9f6f8c307def6504ef5c962091edc19cc5a02df0c5d40def1bcc868eea57df87` |
| `12034.jpg`  | `6a12891692fde31b43e2be1e13e9561ddd6bab45f6ea3b5afa7f566a6104e628` |
| `12035.jpg`  | `07ca60aed29a34093ca0303118758aca5919c375343b5c0acb8adbc1ff84b587` |
| `12036.jpg`  | `b25ecdffc8a0154190612d06265f24133d709a42e0315b9d581361c03343e088` |
| `12037.jpg`  | `f5276fcdf673f93ddcf6e96e9251fb1ed992484083414caca3eb7d159e3341e2` |
| `12038.jpg`  | `217c8a16c3d49e750a52ee1f0867b443a5578f28721af4093e90473b320364fb` |

## Printed clauses and promoted source corrections

`src/data/depths-encounter-cards.json`, `depths-quest-cards.json` and
`depths-recipes.json` promote the original source data using local artwork.
The following corrections are supported by the cached physical scans; they do
not alter the pinned catalogs or pending snapshot.

- Giant Arm (`0daf1963-a45f-4fe1-bd0b-ad901a1213fa.jpg`) prints
  “Grapple (lowest printed quest points).” The catalog's `loewst` is corrected
  to `lowest`. Its shadow ends “resolve its Grapple keyword,” where the
  catalog says “ability.”
- Forecastle Deck (`5571b159-9889-4fcd-bc0e-13bea7443348.jpg`) has a shadow
  omitted from the catalog: “Attacking enemy gets +1 [attack] (+2 [attack]
  instead if defending character has no resources on it or in its resource pool).”
- Captain Sahír and Na'asiyah's original objective-ally reverse faces contain
  statistics missing from the catalog. Two derived `:B` definitions retain
  their underlying physical OCTGN identity and source printing provenance;
  `source_face: "back"` and `physical_code` distinguish these faces. They use
  the cached `.B.jpg` images, printed display positions 77 and 79, and the
  statistics below. These are two faces of existing physical cards and add no
  copies to either recipe. The promoted encounter file therefore has 23
  definitions representing 21 physical identities.

| Original objective reverse | Willpower | Attack | Defense | Hit points |
| -------------------------- | --------: | -----: | ------: | ---------: |
| Captain Sahír              |         0 |      0 |       2 |          5 |
| Na'asiyah                  |         1 |      2 |       2 |          4 |

Both reverse faces are unique, have the traits `Corsair. Raider.`, use the
encounter sphere and have no printed resource cost. Captain Sahír belongs to
the first player; Na'asiyah belongs to the last player. Both carry the printed
loss condition if they leave play. Neither this insert nor the boss prints
Massive: The Thing in the Depths cannot be engaged and attacks through its
scenario/card instructions.

The original MEC49 rules state that Grapple happens immediately when an enemy
is revealed or the keyword is instructed. Ties are the first player's choice.
A grappled enemy is facedown, outside staging, cannot engage, is immune to
player effects and adds two threat to its host location. It detaches faceup into
staging when its location becomes active or a staging location is explored.
These printed clauses are independently reviewed in [DEPTHS-AUDIT.md](DEPTHS-AUDIT.md).

## Reproduction

Run `npm run prepare:scenario-import -- --recipe Q06.5 --download` to regenerate
the source snapshot and scenario art mapping. The standard/easy source zones
are validated against physical recipe rows. A second download preparation
produced byte-identical snapshot and art-map files after all player mappings
were present. Source field comparison, cached image decoding/hash validation
and nine original player-front reviews passed. Runtime rule and complete-game
verification is reported separately.
