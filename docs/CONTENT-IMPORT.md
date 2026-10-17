# Published LotR content import

Snapshot: 30 September 2026. This is the complete published Fantasy Flight Games reference library supplied by the RingsDB and DragnCards sources below. It includes original releases, revised campaign additions, starter decks, the Limited Collector’s Edition, all published Nightmare content, and product metadata for reprints and promotional hero art.

## What the counts mean

| Count | Meaning                                                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------- |
| 4,183 | Browseable card/face/rulesheet reference records                                                                     |
| 4,144 | Canonical printed card definitions, excluding separate rulesheet references and alternate-face proxies               |
| 39    | Reference-only records: 36 rulesheet pages and three objective reverse faces of The Treachery of Rhudaur side quests |
| 4,410 | Positive-quantity printing entries; a quantity of three is still one printing entry                                  |
| 963   | Player-side references, including campaign boons and treasures                                                       |
| 3,220 | Encounter, quest, campaign, burden and rulesheet references                                                          |
| 112   | Hero definitions: 103 ordinary heroes plus nine Baggins/Fellowship saga hero versions                                |
| 121   | Distinct standard scenarios; reprints, campaign versions and standard/epic siege variants are not double-counted     |
| 72    | Distinct published Nightmare scenarios                                                                               |
| 355   | Scenario recipes across standard, easy, Nightmare, standalone and saga campaign variants                             |
| 7     | Complete campaign card pools                                                                                         |
| 113   | Data packs: 95 publisher packs from RingsDB and 18 grouped Nightmare data sets                                       |

Data packs are not retail product counts. Nightmare cards in the source are grouped by cycle or box, while the product catalogue distinguishes the individual Nightmare packs and bundles. Hero Expansion boxes are deckbuilding pools; they are not sold as preconstructed player decks. Repackaged Saga and cycle boxes reuse original card identities, and each card’s `packs` list retains its printing provenance.

The six preconstructed recipes contain four separately sold starter decks and the two bundled decks from the Limited Collector’s Edition. All use the published 50-card lists with three heroes; the four separately sold decks also retain their additional deckbuilding cards. They resolve canonical original card codes after RingsDB's reprint merge. `scripts/sync-products.mjs` generates their exact recipes and product provenance from the four publisher Starter Deck rule sheets and the pinned OCTGN Limited Starter manifest, as documented in [PRODUCT-SOURCES.md](PRODUCT-SOURCES.md).

## Sources

- [RingsDB public API documentation](https://ringsdb.com/api/doc): player rules, canonical card codes, errata and available reprint metadata in `packs[]`. Its current endpoint merges reprints, so the number of returned rows is smaller than the number of printings. The product catalogue supplements this with verified revised packaging and promotional printing metadata.
- [DragnCards LotR plugin](https://dragncards.com/plugin/1), public [plugin payload](https://dragncards.com/be/api/plugins/1), version 50: original encounter cards, both faces, all 72 Nightmare variants, the revised Core/Dark of Mirkwood/Angmar/Dream-chaser/Ered Mithrin campaign additions, and complete scenario card sections and quantities. The payload is JSON containing a base64/gzip plugin document.
- [OCTGN source maintained by Seastan](https://github.com/seastan/Lord-of-the-Rings/tree/802f09c407e8b418c6fa59fd003bddfdc671e968/o8g): checked against original printed set/card numbers and Nightmare data during the import. DragnCards retains those OCTGN UUIDs and supplies readable icon tokens plus newer campaign data absent from the historical OCTGN snapshot.
- Publisher product announcements and starter rule sheets are recorded alongside each entry in the product catalogue and starter recipe files.

`public/data-metadata.json` records exact source URLs, retrieval time, SHA-256 hashes, source sizes, plugin version, reconciled counts, and excluded community records. The importer uses an explicit allowlist of 95 publisher pack codes and 18 official Nightmare data sets. ALeP, custom/scratch sets, and virtual Messenger of the King heroes are excluded. The snapshot excludes 1,514 DragnCards fan/scratch card records.

## Identity and source corrections

Original Core card codes and the first Adventure Pack encounter codes retain the established `01074`… and `02014`… identifiers. Cards with no RingsDB code use `octgn:<UUID>`. Exact aliases of curated engine cards are stored separately as `engine_code`; e.g. the canonical Mendor card can point to the existing `rc135` implementation.

Reprints with missing upstream UUID mappings are matched by normalized rules and numeric stats. Same-name versions stay separate when their abilities differ or the match is ambiguous. In particular, both Limited Collector’s Edition Gandalf printings are Core Gandalf (`01073`), preserving two copies at printed positions 4 and 37. RingsDB’s aggregate quantity of four at position 4 is retained as `ringsdb_quantity`, while the physical printing has quantity two. Both bundled decks therefore use Core Gandalf twice, and the combined player pool has 106 cards including six heroes.

RingsDB represents many campaign boons and burdens as Treasure. The importer uses the actual printed type and sphere from DragnCards while preserving `ringsdb_type_code`. It also reconciles Gundabad Stalker’s incorrect upstream RingsDB UUID against its physical pack, printed position and name; `ringsdb_octgnid` retains the original API value. Hunter and Stalker therefore remain distinct rules, shadow text, images and identities.

Both faces retain separate back text, type, image and quest points when supplied by the source. `printed_stats` preserves variable values such as `X`; ordinary numeric fields remain compatible with the existing game model. A rulesheet proxy whose text is not transcribed remains available as its source image rather than invented rules text. The Battle of Carn Dûm Nightmare setup card has no back text in either source.

Some RingsDB `available` dates describe the original release underlying a later product. They are preserved as source metadata and should not be presented as verified revised product release dates. Promotional art products identify the printed hero/card identities; they do not introduce additional game rules or fictional card designs.

The Long Dark's standard and easy recipes have a scoped primary-source
correction in `src/data/scenario-recipe-corrections.json`. The [official rule
sheet](https://images-cdn.fantasyflightgames.com/filer_public/82/5f/825f170d-3a2a-45a8-a145-f7f0c55ae13a/the_long_dark_rulesheet.pdf)
requires The Long Dark, Twists and Turns, and Hazards of the Pit; the upstream
recipes incorrectly included Deeps of Moria. The corrected encounter decks
contain 58 and 42 cards respectively, with one separately listed setup Cave
Torch, giving physical encounter pools of 59 and 43. Their two quest designs
remain separate. Each corrected recipe retains `original_source` and a reason,
and the manifest records the correction file's canonical JSON hash. The six
printed PASS corner labels survive in `corner_text`; they are not numeric
victory points.

Temple of the Deceived retains the pinned catalog, source recipes and
preparation snapshot unchanged. Its promoted runtime data corrects Deeper
into the Ruins from three copies to four: the original scan carries encounter
index 19/31, the next card begins at 23/31, and the independent Hall of Beorn
printing record confirms four copies. The runtime standard/easy encounter
decks therefore contain 32/25 cards. Two rulesheet proxies remain reference
records and are excluded from the runtime set-aside zone. The promoted grotto
also removes an erroneous front-side immunity sentence that is absent from
the original scan; its shared Uncharted Temple front remains immune. Profane
Dead's printed conditional +3 attack shadow is also restored from its scan.
Ceorl's printed Action prefix is restored during runtime registration while
the canonical player snapshot retains the upstream text. The encounter
corrections are scoped to `src/data/temple-encounter-cards.json` and
`src/data/temple-recipes.json`. See [Temple sources](TEMPLE-SOURCES.md).

## Refresh and reproduce

Live refresh:

```sh
npm run sync:cards
npm run sync:products
```

The combined `sync:content` command, when present, runs both generators. No credentials are required. Preserve the three raw public responses to reproduce a particular snapshot:

```sh
mkdir -p /tmp/lotr-snapshot
curl -fsSL https://ringsdb.com/api/public/cards/ -o /tmp/lotr-snapshot/cards.json
curl -fsSL https://ringsdb.com/api/public/packs/ -o /tmp/lotr-snapshot/packs.json
curl -fsSL https://dragncards.com/be/api/plugins/1 -o /tmp/lotr-snapshot/dc-plugin-current.json
CONTENT_RETRIEVED_AT=2026-09-30T08:37:00.000Z node scripts/sync-cards.mjs --source-dir /tmp/lotr-snapshot
node scripts/sync-products.mjs --cards /tmp/lotr-snapshot/cards.json --packs /tmp/lotr-snapshot/packs.json
```

`--source-dir` performs an offline fixture import. With the same files and `CONTENT_RETRIEVED_AT`, generated output is byte-identical. Update the explicit publisher allowlist when a new official release is verified; unfamiliar packs are excluded by default.

All card identities, pack membership, required source fields, record quantities, full scenario coverage, Nightmare coverage and recipe cross-references are validated before output replacement. Files are staged before being copied into the project. Curated `src/data/player-cards.json`, `src/data/encounter-cards.json` and engine scenario definitions are read-only inputs.

## Automation boundary

Importing a card’s published text or a scenario recipe does not implement its rules in the local game engine. The engine currently registers 70 original standard/easy adventures and 675 player definitions, including all six Angmar Awakened packs, The Grey Havens deluxe, Flight of the Stormcaller, The Thing in the Depths, Temple of the Deceived, The Drowned Ruins, A Storm on Cobas Haven, The City of Corsairs, The Sands of Harad, The Mûmakil, Race Across Harad, Beneath the Sands, the remaining three original Haradrim adventures, all three original Wilds of Rhovanion quests and the first four original Ered Mithrin Adventure Packs. The four Core learning decks and six published preconstructed decks retain their recipes. `SCRIPTED` is derived from implemented engine definitions; coverage is reproduced by `npm run audit:rules` and recorded in `public/automation-coverage.json`. Imported content is presented as reference content until corresponding game mechanics are implemented and verified.

The importer writes:

- `public/catalog.json`: full canonical card/face library.
- `public/packs.json`: source data-pack metadata and counts.
- `public/scenarios.json`: scenario recipes, with exact card codes, quantities and starting sections.
- `public/campaign-pools.json`: campaign card pools.
- `public/data-metadata.json`: source and coverage manifest.
- `src/data/official-player-cards.json`: the player-side reference subset.

The product generator writes the retail catalogue, card/product associations, official starter recipes and `public/published-decks.json`.

Quest victory points are retained from either printed side, including the reverse
of Khazad-dûm and Grey Havens stages. A full numeric quest-victory comparison
against the pinned OCTGN snapshot found 19 reverse-only values previously absent
from the front-side import; all are now represented in `victory` and
`printed_stats.victory`, with reverse values also retained as `back_victory`.

The Drowned Ruins retains its original Q06.7/E06.7 source snapshot and all 35
scenario faces. Printed corrections and physical front/back handling are
scoped to its runtime definitions; the original catalog remains immutable.
See [Drowned Ruins sources](DROWNED-SOURCES.md).

A Storm on Cobas Haven retains its original Q06.8/E06.8 preparation snapshot
and all 43 scenario faces. Runtime promotion corrects Raider Flagship timing,
Belfalas Islet Victory 1, a spurious Cobas Haven shadow and five omitted
easy-mode removals. The corrected recipe contains 65 standard or 51 easy
gameplay cards and the Heading reference before setup decisions, excluding
the rulesheet proxy. See [Cobas Haven sources](COBAS-SOURCES.md).

The City of Corsairs retains its original Q06.9/E06.9 preparation snapshot and
all 43 scenario faces. Runtime promotion corrects Stormcaller's 18 hit points,
Captain Sahír's Victory 20, the final quest's “any enemy” indestructibility
condition and the easy-mode Slave Ship quantity. The original gameplay inventory
is 71 standard or 52 easy cards/references before setup decisions, excluding
the rulesheet proxy. All nine original player scans are cached; Knight of the
White Tower reuses its previous registration. See [City sources](CITY-SOURCES.md).

The Sands of Harad retains three immutable Q07.1–Q07.3/E07.1–E07.3 preparation snapshots. Runtime recipes correct original printed quantities and easy-mode removals without changing the reference catalog. All 61 scenario identities, 70 scenario faces and thirteen player scans are local and pinned. Original components total 112 encounter cards, nine quest cards and 35 player cards. See [source pins and corrections](HARAD-SOURCES.md) and [implementation evidence](HARAD.md).

The Mûmakil preserves its original Q07.4/E07.4 snapshot and both printed recipes without quantity corrections. Fifteen new encounter definitions and two quest identities reuse four Jungle Forest designs. All 23 scenario faces and ten original player scans are locally pinned; the original MEC56 pack contains 30 encounter, two quest and 28 player cards. Runtime text repairs preserve the original reference catalogs. See [source pins](MUMAKIL-SOURCES.md), [scenario](MUMAKIL.md) and [player scripts](MUMAKIL-PLAYER-SCRIPTS.md).

Race Across Harad preserves the original Q07.5/E07.5 snapshot. Nine new encounter definitions and eight double-sided quest identities reuse eleven Sands of Harad designs. All 36 scenario faces and ten original player scans are locally pinned; the original MEC57 pack contains 24 encounter, eight quest and 28 player cards. The standard recipe retains 53 components. Original scans correct three erroneous easy-mode removals (Racing Warg, Howling at their Heels and Mordor Warg), producing 49 easy components while keeping the upstream snapshot immutable. See [source pins](RACE-HARAD-SOURCES.md), [scenario](RACE-HARAD.md) and [player scripts](RACE-HARAD-PLAYER-SCRIPTS.md).

Beneath the Sands preserves the original Q07.6/E07.6 snapshot and all ten original player records. Twelve new encounter and three quest identities reuse six Harad definitions; the ten player designs add six scripts and reuse four existing implementations. All 25 scenario faces and ten original player scans are locally pinned. Original scans correct four erroneous easy removals, resource counters on Off Track, Nest of Vermin’s quest points, printed On Track marks and missing player metadata. The promoted recipes contain 44 standard and 41 easy physical components. See [sources](BENEATH-SANDS-SOURCES.md), [scenario](BENEATH-SANDS.md) and [player rules](BENEATH-SANDS-PLAYER-SCRIPTS.md).

The four-product continuation preserves all 45 original player records and the original scenario preparation snapshots for The Black Serpent, The Dungeons of Cirith Gurat, The Crossings of Poros and The Wilds of Rhovanion. The 45 source designs add 42 new runtime player definitions and reuse three complete existing implementations. All 45 original player scans are local and independently pinned; printed corrections live only in runtime overlays. Source reviews, exact standard/easy recipe corrections and physical special-zone rules are recorded in [Black Serpent sources](BLACK-SERPENT-SOURCES.md), [Cirith Gurat sources](CIRITH-GURAT-SOURCES.md), [Poros sources](CROSSINGS-POROS-SOURCES.md), [Rhovanion sources](WILDS-RHOVANION-SOURCES.md) and [player scripts](BATCH4-PLAYER-SCRIPTS.md). The current audit resolves 1,910 catalog references and 140 setup recipes while 2,273 references remain pending.

The first four original Ered Mithrin Adventure Packs—The Withered Heath, Roam Across Rhovanion, Fire in the Night and The Ghost of Framsburg—preserve four immutable source snapshots and all 40 original player records, adding 36 runtime definitions and reusing four complete implementations. The snapshots contain 94 distinct physical scenario identities and 109 faces, including 25 shared Wilds of Rhovanion identities. All 40 original player scans are local. Runtime corrections restore swapped Urdug/Tiny reverse text, omitted shadows and victory points, variable printed statistics, and original easy quantities; source bytes remain unchanged. Verified official insert links and hashes are recorded separately because the CLI omits these packs' expansionRules links. See [the source review](ERED-MITHRIN-BATCH-SOURCES.md).
