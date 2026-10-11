# Original Flight of the Stormcaller sources

Prepared and checked on 11 October 2026. This import covers the original 2016
Adventure Pack: eleven player designs and the standard/easy scenario. Revised
Dream-chaser campaign cards and Nightmare variants are separate sources.

## Printed rules and provenance

- [Original MEC48 rulesheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec48_rules.pdf),
  linked as “Rulesheet – Flight of the Stormcaller” on the
  [publisher's game page](https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/).
  Retrieved 11 October 2026; SHA-256
  `b7402186d9092da5fd03d446b888b6a808be9102be93e14eafde04d233bab287`.
  The September 2026 CDN path contains the original insert. Page 1 identifies
  the five encounter sets and prepares the Stormcaller's quest deck; page 2
  explains its separate area, progress, advancement and interaction with players.
- [Original Grey Havens rules](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec47_rules.pdf),
  pages 4–6, supply the existing Ships, Corsairs, Boarding, fleet, Heading and
  Sailing rules used by this Adventure Pack.
- [RingsDB original FotS set](https://ringsdb.com/set/FotS), player codes
  `12001`–`12011`, printing positions 1–11, original release 5 May 2016. The
  printed Vanish from Sight scan confirms position 11; the first quest has
  printed position 12. This is eleven designs, including one hero and ten
  three-copy cards: 31 physical player cards. Together with seven quest cards
  and 22 encounter cards, the original pack has 60 cards.
- The pinned DragnCards catalog and physical recipes remain unchanged in
  `public/catalog.json` and `public/scenarios.json`. See
  [CONTENT-IMPORT.md](CONTENT-IMPORT.md) for the original OCTGN provenance.
  Their SHA-256 values are respectively
  `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63`
  and `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f`.

`src/data/pending/flight-of-the-stormcaller-import.json` preserves all 35
original source records, both recipes, every zone and 44 cached face entries
with source URL, local path, byte count and SHA-256. Its `pending-rules` status
describes the immutable preparation snapshot; runtime support is registered
separately. The snapshot retains upstream transcription errors as source data.

## Recipes and setup zones

The original recipe IDs are `Q06.4` and `E06.4`, with pack codes `FotS` and
`TGH`. Counts below describe source zones before setup moves or fleet selection.

| Zone                                         | Standard | Easy |
| -------------------------------------------- | -------: | ---: |
| Players' quest deck                          |        4 |    4 |
| Main encounter deck                          |       31 |   23 |
| Corsair deck                                 |       13 |   10 |
| Set aside, including the rulesheet reference |        8 |    8 |
| Second quest deck source zone                |        2 |    2 |
| Initial staging, Rolling Seas                |        2 |    1 |

The source sets aside stage 2C and places stages 3C/4C in the second quest-deck
zone. Setup combines these into the Stormcaller's three-stage deck, in order.
The set-aside zone also contains the Stormcaller, four selectable fleet ships,
Heading and a rulesheet reference. The rulesheet does not enter play.

| Main encounter card | Standard | Easy |
| ------------------- | -------: | ---: |
| Sahír's Escort      |        3 |    2 |
| Swift Raider        |        2 |    1 |
| Corsair Skiff       |        2 |    2 |
| Jagged Reef         |        2 |    2 |
| Hidden Cove         |        2 |    2 |
| Vast Coastland      |        2 |    1 |
| Man Overboard!      |        2 |    2 |
| Raging Squall       |        2 |    1 |
| Calm Waters         |        2 |    2 |
| Rolling Seas        |        1 |    0 |
| Rough Waters        |        2 |    2 |
| Thrown Off Course   |        2 |    2 |
| Waterspout          |        2 |    1 |
| Sudden Storms       |        3 |    2 |
| Winds of Wrath      |        2 |    1 |

| Corsair-deck card | Standard | Easy |
| ----------------- | -------: | ---: |
| Corsair Seafarer  |        2 |    2 |
| Serpent's Blade   |        2 |    1 |
| Southron Sailor   |        2 |    2 |
| Cunning Pirate    |        3 |    3 |
| Vicious Marauder  |        2 |    2 |
| Umbar Captain     |        2 |    0 |

Players and the Stormcaller use separate quest-card identities. Players use Swift Departure
(1A/B), Full Sail Ahead! (2A/B), The Weather Turns Foul (3A/B) and The Cape of
Andrast (4A/B). The Stormcaller starts at Full Sail Ahead! (2C/D), followed by
The Weather Turns Foul (3C/D) and The Cape of Andrast (4C/D).

## Player designs and cached artwork

`src/data/stormcaller-player-cards.json` contains all original full player
records, including printing provenance. Its local images are
`/cards/12001.jpg`–`/cards/12011.jpg`; RingsDB serves JPEG bytes at the original
`.png` URLs, so local extensions follow the actual image format.

| Code  | Printed design            | Type       |
| ----- | ------------------------- | ---------- |
| 12001 | Denethor                  | Hero       |
| 12002 | Rod of the Steward        | Attachment |
| 12003 | In Service of the Steward | Attachment |
| 12004 | Azain Silverbeard         | Ally       |
| 12005 | Last Stand                | Event      |
| 12006 | Glorfindel                | Ally       |
| 12007 | Tides of Fate             | Event      |
| 12008 | Imladris Caregiver        | Ally       |
| 12009 | Heed the Dream            | Event      |
| 12010 | Guardian of Rivendell     | Ally       |
| 12011 | Vanish from Sight         | Event      |

The 44 scenario faces and eleven player scans form 55 unique local images:
38 newly cached images and seventeen reused Grey Havens faces. Every image
decoded successfully with minimum dimensions of at least 400 pixels.
`src/data/reference-scenario-art.json` maps original source URLs to local files.

## Printed symbols and source corrections

`src/data/stormcaller-sailing-icons.json` records all 27 original non-quest,
non-rules encounter identities, each with a cached front and SHA-256. Eleven
new Flight of the Stormcaller faces were inspected directly. Sixteen existing
Grey Havens records were reused only after matching identity and scan hash.

| Card with printed Sailing symbols | Symbols |
| --------------------------------- | ------: |
| Calm Waters                       |       2 |
| Rough Waters                      |       1 |
| Thrown Off Course                 |       1 |
| Winds of Wrath                    |       1 |
| Rolling Seas                      |       1 |
| Corsair Skiff                     |       1 |
| Vast Coastland                    |       1 |

All other mapped cards have zero. The printed helm symbols occur in the
bottom-left of the text box and cannot be recovered from source rules text.

Three catalog transcriptions require runtime corrections without rewriting the
pinned catalog or prepared snapshot:

- The Weather Turns Foul, stage 3C,
  `octgn:c7bcb6fc-dde8-4df0-bd0e-3791b0fef4d0`, has unrelated Tides of Fate
  text in the catalog. Its printed front says: “When Revealed: Search the
  encounter deck and discard pile for 1 copy of Sahír's Escort and add it to
  the Stormcaller's area. Shuffle the encounter deck.” Evidence:
  `/cards/c7bcb6fc-dde8-4df0-bd0e-3791b0fef4d0.jpg`, SHA-256
  `57f00a79b954e437f31035e73cedf60fdbe2ae9ef7486030ee76839449c2cb05`.
- Raging Squall, `octgn:076b47e8-6bbe-41b3-9af8-edeca28e2c0c`, has a blank
  catalog trait field. Its original scan prints **Weather.**, affecting the
  stage 4 Weather search and damage trigger. Evidence:
  `/cards/076b47e8-6bbe-41b3-9af8-edeca28e2c0c.jpg`.
- The unique enemy `octgn:3065a397-5346-4148-8e0a-47009fe9b87d` has the
  printed title **Stormcaller**, whereas the catalog names it “The Stormcaller.”
  Its card identity and rules text are unchanged. Evidence:
  `/cards/3065a397-5346-4148-8e0a-47009fe9b87d.jpg`.

## Reproduction

Run `npm run prepare:scenario-import -- --recipe Q06.4 --download` sequentially
with other imports because preparation updates the shared artwork map.
`--check` validates identities and every physical recipe section without
writing. Repeating preparation preserves the bundle, existing image bytes and
artwork map. Player images are copied unchanged from their original RingsDB
printing URLs; all original URLs remain in the player printing records.
