# Original The Drowned Ruins sources

Prepared and visually checked on 13 October 2026. This import covers the original
2016 MEC51 Adventure Pack, ten player designs (`12082`–`12091`), and its original
standard/easy recipes (`Q06.7`/`E06.7`). Revised Dream-chaser campaign and Nightmare
printings remain separate.

## Printed rules and preserved references

- [Original MEC51 rulesheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec51_rules.pdf),
  retrieved with HTTP 200 on 13 October 2026: 659,910 bytes, SHA-256
  `36064c53afa3b9d76847a9ac3e9ce0286407261fa1fdeef2dfe008dc0b3d5e09`.
  Both PDF pages were rendered and visually checked. This is the original insert,
  difficulty **6**, with the MEC51 product code and original copyright notice.
  The rules are headed “Grotto / Underwater Locations.”
- All 35 scenario face records in the preparation snapshot were viewed, including
  both faces of the rulesheet proxy. The physical artwork confirms quest text,
  printed statistics, traits, victory values, shadows and the Shrine's unique
  symbol. The proxy agrees with the publisher's PDF.
- [Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf),
  SHA-256 `7f47c746c21b93c8c65a5da62b9a6f8e878955519b1e610e0a86b05fa96f5aea`,
  provides the Golden Rules (p. 2), the full-resolution requirement for “Then”
  (p. 17), and the Victory keyword (p. 18).
- [RingsDB original DR set](https://ringsdb.com/set/DR), original player positions
  82–91. The [public card API](https://ringsdb.com/api/public/cards/) independently
  confirms one hero and nine three-copy designs: 28 physical player cards.
- [Hall of Beorn original scenario inventory](https://hallofbeorn.com/LotR/Scenarios/The-Drowned-Ruins)
  independently corroborates the standard/easy encounter quantities and Grotto
  face totals. Its separate front/back rows describe faces of the same physical
  cards; they must not be added together as additional physical copies.

The original OCTGN identities and print metadata come from the pinned DragnCards
references described in [CONTENT-IMPORT.md](CONTENT-IMPORT.md). Their bytes remain
unchanged:

| Reference                                        | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `public/catalog.json`                            | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                          | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/pending/the-drowned-ruins-import.json` | `a01c25f96f5d16d27ec1d40c4610843209f42e79fc28d7f03487521d881c58e2` |

The preparation snapshot retains 23 original identities: two quests, twenty
physical encounter identities and one rulesheet proxy. Fourteen encounter
identities belong to DR; six are reused Grey Havens designs (the four
Drowned Dead designs and the two Stormcaller Elite companions). Its
`pending-rules` status describes the immutable source snapshot. Runtime support
and printed corrections are promoted separately.

## Physical inventory and setup zones

The original pack contains **60 physical game cards**: 28 player cards,
30 encounter cards and two quests. Double-sided locations and companions count
once each. The source includes one rulesheet proxy in a set-aside zone; promoted
recipes remove this reference without changing any physical card quantities.

| Zone before setup                    | Standard | Easy |
| ------------------------------------ | -------: | ---: |
| Main encounter deck                  |       30 |   21 |
| Grotto deck (`sharedEncounterDeck2`) |        8 |    8 |
| Set aside: Shrine to Morgoth         |        1 |    1 |
| Captain Sahír (`player1Play1`)       |        1 |    1 |
| Na'asiyah (`sharedStagingArea`)      |        1 |    1 |
| Quest deck                           |        2 |    2 |
| Physical gameplay cards              |       43 |   34 |

The two companion source zones are recipe storage conventions. Printed setup
gives their objective-ally sides to the first and last player respectively. Setup
also moves the top two Grotto locations to staging, or three with three or four
players. The Shrine remains set aside until stage 2.

| Main encounter design   | Standard | Easy |
| ----------------------- | -------: | ---: |
| Sea-Scorpion            |        3 |    3 |
| Cave Eel                |        3 |    2 |
| Drowned Cave            |        2 |    2 |
| Powerful Undertow       |        3 |    1 |
| Into the Abyss          |        3 |    3 |
| Tangling and Grasping   |        4 |    4 |
| Ancient Depths          |        3 |    1 |
| Drowned Dead            |        3 |    3 |
| Soulless Cadaver        |        2 |    1 |
| Throngs of Unfaithful   |        2 |    1 |
| Curse of the Downfallen |        2 |    0 |

The Grotto deck has six physical identity pairings, totaling eight cards in both
modes. Their matching fronts must not collapse distinct reverse identities:

| Grotto front       | Underwater reverse | Copies |
| ------------------ | ------------------ | -----: |
| Undersea Grotto    | Dark Abyss         |      2 |
| Undersea Grotto    | Twisting Hollow    |      1 |
| Cursed Caverns     | Twisting Hollow    |      2 |
| Cursed Caverns     | Sunken Temple      |      1 |
| Water-Logged Halls | Dark Abyss         |      1 |
| Water-Logged Halls | Sunken Temple      |      1 |

The separate Shrine is the ninth double-sided location. Drowned Cave is a normal
single-sided encounter location with the Underwater trait; it is not a Grotto
deck card and has no printed victory value.

| Stage | Quest            | Original OCTGN identity                |
| ----- | ---------------- | -------------------------------------- |
| 1A/B  | The Grotto       | `31bd075d-e116-4a0f-81dd-942b52a6267c` |
| 2A/B  | Sahír's Betrayal | `e48c7313-d1cb-4291-9dc1-9fff6fb23e83` |

Stage 1B prints 15 quest points and also requires at least three Underwater
locations in the victory display. Stage 2B prints a dash in its quest-point box;
the Shrine's placement in the victory display supplies the printed victory
condition. Both quest B sides prohibit playing allies and attachments while an
Underwater location is active.

## Printed metadata and reverse faces

`src/data/drowned-encounter-cards.json`, `drowned-quest-cards.json` and
`drowned-recipes.json` preserve original gameplay identities and local artwork.
The following are verified from printed scans, not inferred from game behavior:

- **Shrine to Morgoth is unique on both sides.** The original
  [front](../public/cards/011a4573-f21a-4897-9b23-8b64391f5136.jpg) and
  [reverse](../public/cards/011a4573-f21a-4897-9b23-8b64391f5136.B.jpg) display the
  unique diamond. Both promoted faces retain this property from the original
  source identity.
- Underwater faces supply threat values, traits and print positions absent from
  the catalog's flattened back fields. The values below were visually checked
  for every physical pairing. Reverse aliases retain `physical_code` and
  `source_face: "back"`; they add no copies to a recipe.
- The two original companion objective-ally reverse definitions reuse the
  previously verified Depths statistics: Sahír has 0 willpower, 0 attack,
  2 defense and 5 hit points; Na'asiyah has 1, 2, 2 and 4 respectively.
  Both are unique, have `Corsair. Raider.` traits and no resource cost.

| Underwater face   | Threat | Quest | Victory | Printed position | Traits                          |
| ----------------- | -----: | ----: | ------: | ---------------: | ------------------------------- |
| Shrine to Morgoth |      5 |    18 |       5 |               95 | Ruins. Underground. Underwater. |
| Dark Abyss        |      5 |    12 |       2 |              101 | Underground. Underwater.        |
| Twisting Hollow   |      4 |    14 |       2 |              102 | Underground. Underwater.        |
| Sunken Temple     |      3 |    10 |       2 |              103 | Ruins. Underground. Underwater. |

The insert permits looking at the **Grotto front of the top Grotto deck card**.
It prohibits looking at an Underwater reverse until instructed to flip that
location. Three neutral public Grotto face definitions therefore represent the
visible front names without revealing a particular physical reverse identity.
They use printed front artwork and add zero physical copies.

The insert says every flip removes all progress. The Shrine's own beginning-of-
quest Forced effect explicitly preserves progress while flipping to Underwater,
and overrides that general rule. Double-sided locations cannot enter the
encounter deck or discard pile. An ordinary explored Grotto front is shuffled
back into the Grotto deck; an explored Underwater reverse enters the victory display.
These rules do not give Drowned Cave either behavior.

**The Shrine also prints Victory 5 on its Grotto face.** The runtime sends an
explored Shrine to the victory display on either face, applying that printed
keyword and the Golden Rule that card ability text takes precedence. This is a
rules interpretation from the card and the general reference, not an explicit
Shrine exception written in MEC51: the insert's general Grotto paragraph says
to shuffle an explored Grotto face back into its deck. The unique Shrine's
printed Victory keyword and identical win clauses on both faces support the
specific treatment. Text-box blanking does not remove the Victory keyword,
although it can suppress the printed win clause.

The optional flip/return clauses after “Then” require the preceding instruction
to resolve in full. Sunken Temple requires a resource actually discarded from
each hero and objective ally; Drowned Cave requires ten actual cards discarded
by each player. Twisting Hollow requires each player to discard a character,
and Dark Abyss requires its damage instructions to resolve. These conditions
follow the Rules Reference's “Then” entry; the card text does not grant an
exception when only part of the preceding effect succeeds.

## Original player designs and artwork

| Code  | Original design    | Type       | Physical copies |
| ----- | ------------------ | ---------- | --------------: |
| 12082 | Argalad            | Hero       |               1 |
| 12083 | Dwarven Sellsword  | Ally       |               3 |
| 12084 | Dúnedain Remedy    | Attachment |               3 |
| 12085 | Marksman of Lórien | Ally       |               3 |
| 12086 | Battle-fury        | Event      |               3 |
| 12087 | Woodland Courier   | Ally       |               3 |
| 12088 | Hithlain           | Attachment |               3 |
| 12089 | Robin Smallburrow  | Ally       |               3 |
| 12090 | Interrogation      | Event      |               3 |
| 12091 | Strider            | Attachment |               3 |

The 35 original scenario face records retain URL, local path, byte length and
SHA-256 in the source snapshot. Eight are reused Grey Havens faces. All 35
images decode successfully; their bytes and face directions are guarded by
`tests/drowned-import.test.ts`. The ten player scans add ten unique original
artwork files; neutral public Grotto filenames reuse existing front image bytes.

All ten player scans were fetched from
`https://ringsdb.com/bundles/cards/<code>.png`. Those endpoints return JPEG bytes;
local filenames use `.jpg` to match their actual format. These original images
are 712–750 pixels wide and were decoded without error. The image map preserves
both relative and full original RingsDB URL aliases.

| Player image | SHA-256                                                            |
| ------------ | ------------------------------------------------------------------ |
| `12082.jpg`  | `4a5751e323007e7f6a493b0c840a428f65c5c343083c31576be52095752e9a70` |
| `12083.jpg`  | `39f9d009f50227da492da0a3515f1af6c0e171d077c3fa7cfa4fe945b39e72e1` |
| `12084.jpg`  | `877ad9044a2a33712af6ad2a0f0057e1dd859f3b0108e9ee5b82b854b16f720c` |
| `12085.jpg`  | `a96468014cd11a0a5f092bd7d2ff1409352b5ed9ee224debe7e4866fa52247b1` |
| `12086.jpg`  | `08dcdfe2fb96bebabcc6846a031087b2cc628e496c525ba10a16ee3844d0db17` |
| `12087.jpg`  | `ce0095d5489fabc38478431dcf11813d4f6f2a185d5e5ae640c9ec43b504394f` |
| `12088.jpg`  | `f718ff4e0604c3efdf0bbbf4ab801177e9a0b8282cb9c2602495d4d8e2bc4904` |
| `12089.jpg`  | `e1e32ddee3c715067f19758fd923f57c3a83006d1e6aa72eb9347decd7a1e9bd` |
| `12090.jpg`  | `74f026aa77ba0e4691a4ce186a127b68b1a58837bf5682838dc4b7ac503f97b9` |
| `12091.jpg`  | `32f6a36b5c8b0d07c1da25e05fa6dc4798a3b2fd48462876613b96b7ed740a81` |

## Reproduction and scope of verification

Run `npm run prepare:scenario-import -- --recipe Q06.7 --download` to reproduce
the scenario preparation snapshot and artwork mapping. Run
`node --import tsx --test tests/drowned-import.test.ts` for immutable reference,
physical inventory, reverse metadata, cache byte and source provenance checks.
The retained source snapshot must not absorb promoted data corrections.

This document records printed-source verification and import integrity. Runtime
rule coverage, interaction timing and complete-game simulations are checked by
the scenario/player test suites separately.
