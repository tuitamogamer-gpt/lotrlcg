# Original Temple of the Deceived sources

Prepared and visually checked on 13 October 2026. This import covers the original
2016 MEC50 Adventure Pack, its ten player designs (`12057`–`12066`), and the
original standard/easy adventure (`Q06.6`/`E06.6`). Revised Dream-chaser campaign
and Nightmare sources remain separate.

## Primary rules and retained references

- [Original MEC50 rulesheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec50_rules.pdf),
  linked as “Rulesheet – Temple of the Deceived English” on the
  [publisher's game page](https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/).
  Retrieved with HTTP 200 on 13 October 2026: 4,738,779 bytes, SHA-256
  `3b11dd6e2cb5d60dbf4a65dacb7d7448cbb1c220ef4f40acb44e443885d7e5e2`.
  The September 2026 CDN path contains the original three-page insert, difficulty
  **4**. Page 2 defines map preparation, adjacency, staging and progress; page 3
  finishes travel, flipping and revisiting. The scenario's quest and location
  cards supply its setup, Key and victory instructions.
- All forty original scenario face entries are retained as original scans in
  `public/cards`, including both faces of the two rulesheet proxy identities.
  Each was viewed alongside the publisher PDF. The original OCTGN identities
  and print fields come from the pinned DragnCards references described in
  [CONTENT-IMPORT.md](CONTENT-IMPORT.md).
- [Original Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf),
  SHA-256 `7f47c746c21b93c8c65a5da62b9a6f8e878955519b1e610e0a86b05fa96f5aea`,
  and [official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf),
  SHA-256 `a82b0e7e1fe27d942eaeae9426e6821ccc8157dad9a424e70d2f5bafa604e7d9`,
  supply the ordinary rules around objectives, responses, progress and timing.
  Relevant FAQ clauses are 1.07, 1.08, 1.12, 1.17, 1.25, 1.27, 1.29, 1.37 and
  1.38. Costs (Rules Reference p. 5) require payment using cards or game
  elements controlled by the paying player. Objectives (p. 12) remain under
  encounter-deck control until claimed. FAQ 1.17 confirms that an unguarded
  objective can remain unclaimed and that returning to staging restores
  unclaimed status. MEC50 gives no exception for the Gate Key's Temple Travel
  cost: the Key must first be claimed and attached to a player's hero.
  FAQ 1.9 contains no named Temple, Déorwine, Ceorl or Ered Luin Miner erratum.

The pinned references remain byte-for-byte unchanged. Their SHA-256 values are:

| Reference               | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `public/catalog.json`   | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json` | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |

`src/data/pending/temple-of-the-deceived-import.json` preserves all 27 original
scenario identities, both original recipes, their original quantities and forty
cached face records with URL, local path, byte count and SHA-256. Its SHA-256 is
`3ef76454dd13bf694898ebc0bd1efffeff5e5ce031f8e28f7b7a35953449b57b`.
The `pending-rules` status describes this immutable preparation snapshot;
runtime support and printed corrections are promoted separately. Running the
preparation tool again retains this snapshot unchanged.

## Gameplay identities and physical recipes

The snapshot's 27 identities consist of one quest, 24 physical encounter designs
and two rulesheet proxies. Fourteen encounter designs and the quest are new
TotD cards; ten encounter designs come from The Grey Havens. The two rulesheet
proxies are removed from promoted runtime recipes, while all fifteen map
locations and both physical companions are retained.

The printed quantity correction below adds one Deeper into the Ruins to each
runtime recipe. The original source recipes retain their erroneous count of
three and their two rulesheet entries; they therefore total 53/46 source records.

| Runtime zone before setup                             | Standard | Easy |
| ----------------------------------------------------- | -------: | ---: |
| Encounter deck                                        |       32 |   25 |
| Island Map (`sharedEncounterDeck2`)                   |       15 |   15 |
| Set aside: Guardian, Key, Captain Sahír and Na'asiyah |        4 |    4 |
| Quest deck                                            |        1 |    1 |
| Physical gameplay cards                               |       52 |   45 |

| Main encounter design   | Standard | Easy |
| ----------------------- | -------: | ---: |
| Faithless Desecrator    |        3 |    2 |
| Profane Dead            |        2 |    2 |
| Deeper into the Ruins   |        4 |    4 |
| Furious Rainstorm       |        3 |    2 |
| Dwindling Supplies      |        3 |    3 |
| Sunken Ruins            |        3 |    3 |
| Drowned Dead            |        3 |    3 |
| Soulless Cadaver        |        2 |    1 |
| Throngs of Unfaithful   |        2 |    1 |
| Aimless Wandering       |        3 |    3 |
| Curse of the Downfallen |        2 |    0 |
| Island Watcher          |        2 |    1 |

The fixed map contains two each of Jagged Cliffs, Winding Caverns, Jungle Path,
Flooded Ruins, Drowned Graves and Cursed Temple beneath Lost Island fronts,
plus two Temple Halls and one The Grotto's Entrance beneath Temple fronts.
These map quantities and all set-aside/quest quantities are identical in both
modes. Setup puts the Guardian and its guarded Key into staging, and puts the
two companions into play on their objective-ally sides.

The promoted encounter file contains 28 definitions: the 24 physical fronts,
two existing companion objective reverse aliases (`octgn:<UUID>:B`), and two
safe public shared-face definitions (`temple-lost-island` and
`temple-uncharted-temple`). Reverse and shared-face aliases add no physical
recipe copies. The original quest is one physical stage 1A/1B card, Searching
the Island (`fb7d55c5-7198-45c5-97d7-be4c6a26fa68`), whose B side prints a dash
for quest points.

## Corrections proved by original scans

The immutable snapshot preserves upstream fields. The promoted data corrects
these printed-content differences:

1. **The Grotto's Entrance has no player-card immunity on its revealed side.**
   Its [original face](../public/cards/f3bc3759-1f94-4983-bebb-66c7d9e3e0b3.jpg)
   prints the Guardian-return Forced effect and eighth-progress victory only.
   The upstream prefix “Immune to player card effects.” belongs to its shared
   unrevealed Temple side and is removed only from the revealed definition.
2. **Profane Dead has a shadow effect omitted by the catalog.** Its
   [original face](../public/cards/00e25526-9804-4b05-89d6-557d9ef7ad77.jpg)
   reads: “Shadow: Attacking enemy gets +3 [attack] if the players control the
   Gate Key.” This is added to the promoted shadow field.
3. **Deeper into the Ruins has four physical copies.** Its
   [original face](../public/cards/c8decb35-cb3e-4dc9-ad15-d0cc80c157cb.jpg)
   starts at encounter-set index **19/31**; the next design,
   [Furious Rainstorm](../public/cards/4fc6111a-93c3-4407-b067-1b82396b802f.jpg),
   starts at **23/31**, leaving four copies at 19–22. The independently fetched
   [Hall of Beorn #78 record](https://hallofbeorn.com/LotR/Details/Deeper-into-the-Ruins-TotD)
   explicitly confirms `(x4)`; its archived HTML SHA-256 is
   `87383cabef341f24739bff1bc1ad2e4dafbd9e785a362d6b2b7fada7ba88f767`.
   The promoted card and both runtime recipes use four, correcting the pinned
   count of three. The original pack consequently has 28 player cards,
   31 encounter cards and one quest: **60 physical game cards**.

Original scans also restore the generic-side threat values and printed quest
dash: Lost Island has threat 2; Temple of the Deceived has threat 4. The
companion objective backs reuse the previously verified Depths definitions:
Captain Sahír is 0 willpower/0 attack/2 defense/5 hit points; Na'asiyah is
1/2/2/4. Temple Guardian prints threat X, engagement 50 and Victory 4; X is the
number of players. It does not print Indestructible.

## Player originals and errata attribution

[RingsDB's original TotD set](https://ringsdb.com/set/TotD) contains ten designs,
positions 57–66, released 30 June 2016. The hero has one copy; every other
design has three copies, giving 28 physical player cards.

| Code  | Original design       | Local original artwork |
| ----- | --------------------- | ---------------------- |
| 12057 | Elfhelm               | `/cards/12057.jpg`     |
| 12058 | Ceorl                 | `/cards/12058.jpg`     |
| 12059 | Armored Destrier      | `/cards/12059.png`     |
| 12060 | Déorwine              | `/cards/12060.jpg`     |
| 12061 | Revealed in Wrath     | `/cards/12061.jpg`     |
| 12062 | Rhovanion Outrider    | `/cards/12062.jpg`     |
| 12063 | Scouting Party        | `/cards/12063.jpg`     |
| 12064 | Entangling Nets       | `/cards/12064.jpg`     |
| 12065 | Arrows from the Trees | `/cards/12065.jpg`     |
| 12066 | Ered Luin Miner       | `/cards/12066.jpg`     |

The original player image URLs are
`https://ringsdb.com/bundles/cards/<code>.png`; their actual decoded format,
not the upstream URL suffix, determines the local extension. Armored Destrier
is PNG; the other nine images are JPEG. The original faces were viewed without
upscaling or redrawing. Some RingsDB originals have lower resolution than the
scenario scans.

Ceorl's original scan prints **Action**, which the catalog's body omits. Its
current action remains any-player, with its printed once-per-phase limit.
Runtime registration restores that printed Action prefix; the canonical
player snapshot retains its upstream wording.
Déorwine's original #60 scan prints an **Action** while defending. The pinned
current catalog marks errata and grants the defending-only **Response** to
cancel a shadow effect just triggered. A bounded independent trace retained
the community-preserved Caleb-attributed 2016 clarification and ALeP's
reprint annotation as **secondary provenance**. No named primary erratum was
found in FAQ 1.9, the official MEC110 Hero insert or its gallery; the apparent
Hall of Beorn Dream-chaser reprint image actually shows the old #60 Action.
This import does not claim those sources prove a revised Déorwine scan.

Ered Luin Miner's original #66 scan says “discarded from the top of your deck.”
The current catalog deletes “top of.” The independent trace visually verified
the actual Dwarves of Durin #8 ©2022 printed reprint, which says “discarded from
your deck,” at the [Hall of Beorn scan mirror](https://s3.amazonaws.com/hallofbeorn-resources/Images/Cards/Dwarves-of-Durin/Ered-Luin-Miner.jpg).
Its SHA-256 is
`95e1a4281d7ca9ef92b2e1ccc039e7c4a875f3a3a6b304b5da7f105e09263101`.
This is a witness of primary printed-card content on a secondary scan host,
not a publisher-hosted scan. The original cached artwork remains unchanged.

## Artwork, orientation and map secrecy

The preparation snapshot binds forty scenario face paths, twenty-five new and
fifteen reused from The Grey Havens. Ten original player faces and two neutral
byte-copy aliases make **52 decoded image paths**. Every path was fully loaded
with Pillow; each local byte hash matches its saved provenance record.

Local `UUID.jpg` consistently means the promoted catalogue/front face, even
when the original upstream URL ends in `UUID.B.jpg`. Local `UUID.B.jpg` is its
opposite face. Several map scans reverse those upstream suffixes; consumers
must use the recorded face mapping rather than infer orientation from an
upstream filename.

The safe public aliases contain the exact verified generic-front pixels:

| Neutral public asset            | Original cached pixels                              | SHA-256                                                            |
| ------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `/cards/temple-lost-island.jpg` | `/cards/201569b2-d203-4a2a-b3e4-5dd396b8341a.B.jpg` | `e7698c5f8b946e000f66102207d8d85062ba27970d7cb3a25e2453d274a7edae` |
| `/cards/temple-front.jpg`       | `/cards/3371c102-4aab-4b15-a738-a4b3483a6004.B.jpg` | `221549e98f888849cf5f7488f427b7364d13e2a09fff7fb95e0aabd74804cdc2` |

The aliases disclose no hidden physical UUID or revealed reverse identity.
Peeking never flips the physical card; the viewer's knowledge belongs to the
save's private map metadata. The public shared-face card definitions contain
no hidden OCTGN identity and have quantity zero.

Ignored verification evidence is retained under `output/temple-sources`: the
publisher PDF/text, original source extracts, preparation check, complete
source/art hashes, player/neutral art provenance, Deeper quantity evidence,
Déorwine trace and Miner reprint proof. See [TEMPLE-RULES.md](TEMPLE-RULES.md)
for the complete printed scenario clauses.
