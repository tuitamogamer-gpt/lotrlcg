# Original Grey Havens source material

Prepared and checked on 11 October 2026. This block uses the original 2016
deluxe expansion: fifteen player designs and three standard/easy scenarios.
Dream-chaser campaign additions and Nightmare variants remain separate sources
and support gates.

## Printed rules and provenance

- [Original Grey Havens rules](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec47_rules.pdf),
  linked by the [publisher's game page](https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/).
  Retrieved 11 October 2026; SHA-256
  `672ec9860bc2693a7bd81c5b9452de403f2e986bea74769ad3ca238db2df3bb2`.
  The CDN's September 2026 upload path hosts the original insert, not the revised
  Dream-chaser campaign. Printed pages 4–6 cover Ships, Corsairs, Boarding,
  fleet selection, Heading and Sailing; pages 7–8 cover Uncharted locations;
  page 12 covers Aflame and the Stormcaller Elite.
- [RingsDB Grey Havens set](https://ringsdb.com/set/TGH), official player rules,
  canonical codes `11001`–`11015`, original printing provenance and PNG scans.
- [DragnCards plugin](https://dragncards.com/plugin/1), the pinned catalog and
  recipes in `public/catalog.json` and `public/scenarios.json`, retaining original
  OCTGN identities, both faces and physical quantities. Full import provenance
  and the pinned OCTGN source are documented in [CONTENT-IMPORT.md](CONTENT-IMPORT.md).

The three `src/data/pending/*-import.json` snapshots preserve their
`pending-rules` preparation status, every original definition and recipe zone,
the printed-rule URL, and each cached face's URL, byte count and SHA-256. Runtime
registration determines implementation support separately. Source records are
not rewritten to incorporate runtime transcription corrections.

## Scenario snapshots

| Scenario                | Standard / easy IDs | Source records | Main encounter deck, standard / easy | Second deck, standard / easy | Quest cards | Set aside | Initial staging | Cached faces |
| ----------------------- | ------------------- | -------------: | ------------------------------------ | ---------------------------- | ----------: | --------: | --------------: | -----------: |
| Voyage Across Belegaer  | Q06.1 / E06.1       |             31 | 27 / 19                              | Corsairs 9 / 7               |           6 |         7 |               3 |           41 |
| The Fate of Númenor     | Q06.2 / E06.2       |             20 | 24 / 17                              | Uncharted 10 / 10            |           2 |         3 |               0 |           29 |
| Raid on the Grey Havens | Q06.3 / E06.3       |             21 | 30 / 21                              | —                            |           2 |         6 |               0 |           26 |

These are source-zone counts before setup searches, fleet selection, reveals,
quest variants and player-count adjustments. The source records include ten
quest designs and five rulesheet references. Together they contain 72 distinct
encounter-side identities and 96 cached face entries. Rulesheet references do
not enter the playable card pool. Each original front and reverse is cached
under `public/cards/`; `reference-scenario-art.json` retains the URL-to-file
mapping. An upstream `.B.jpg` suffix need not denote the catalog's logical back,
so the bundle's face mapping and hashes are authoritative.

## Player designs

`src/data/grey-havens-player-cards.json` preserves all fifteen full catalog
records and their printing provenance, with local `/cards/110XX.png` artwork.
The set has two heroes, four allies, four events and five attachments: 41
physical player cards using the original one/three-copy printing quantities.

| Code  | Printed design          | Type       |
| ----- | ----------------------- | ---------- |
| 11001 | Círdan the Shipwright   | Hero       |
| 11002 | Galdor of the Havens    | Hero       |
| 11003 | Mithlond Sea-watcher    | Ally       |
| 11004 | Skyward Volley          | Event      |
| 11005 | Grappling Hook          | Attachment |
| 11006 | Warden of the Havens    | Ally       |
| 11007 | Anchor Watch            | Event      |
| 11008 | Mariner's Compass       | Attachment |
| 11009 | Lindon Navigator        | Ally       |
| 11010 | The Evening Star        | Event      |
| 11011 | Explorer's Almanac      | Attachment |
| 11012 | Sailor of Lune          | Ally       |
| 11013 | Elwing's Flight         | Event      |
| 11014 | To the Sea, to the Sea! | Attachment |
| 11015 | Narya                   | Attachment |

## Printed fields missing from source text

`src/data/grey-havens-sailing-icons.json` records verified Sailing success-symbol
counts for all 57 original non-quest/non-rules encounter-side identities. Every
entry identifies its cached front scan and SHA-256. The helm symbols were
counted directly in the bottom-left text boxes; they are not inferred from
rules text, traits, quantities or card names.

| Original encounter card | Printed Sailing symbols |
| ----------------------- | ----------------------: |
| Calm Waters             |                       2 |
| Rough Waters            |                       1 |
| Thrown Off Course       |                       1 |
| Winds of Wrath          |                       1 |
| Starlit Sea             |                       1 |
| Rolling Seas            |                       1 |

All other mapped cards have zero. Printed rules page 6 permits one on-course
shift for each symbol, discards all looked-at cards, and permits Action effects
before and after the test, never during it.

The six Lost Island reverses show 2 threat and no quest points. The original
insert explicitly prohibits double-sided locations entering the encounter
deck and replaces entry into the discard pile with shuffling into the Uncharted
deck, Lost Island side faceup. Flipping removes all progress; looking at the
facedown side does not trigger its flip effects.

## Reproduction

Run `npm run prepare:scenario-import -- --recipe Q06.1 --download`, then Q06.2
and Q06.3 sequentially because they update the shared artwork map. `--check`
validates source identities and every physical recipe section without writing.
Prepared snapshots and existing cached image bytes are deterministic on repeat
preparation. The fifteen player PNGs retain their RingsDB source URLs in the
original printing records and the shared map. All 111 new image files were
decoded and verified locally; actual client and rule validation are recorded
with the implementation evidence.
