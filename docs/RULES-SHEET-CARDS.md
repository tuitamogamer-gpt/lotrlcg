# The rulesheet cards

The card snapshot carries each scenario's rulesheet as `rules` cards: the
OCTGN/DragnCards community's reference cards, which lay a scenario's
rulesheet out over one or more double-sided card faces. Their snapshot text
is only a placeholder ("Rulesheet Card 1"). Ten of the 36 were registered
with their scenarios (The Ruins of Belegost, Murder at the Prancing Pony,
The Siege of Annúminas, The Passing of the Grey Company, The Siege of Gondor
and The Battle of the Pelennor Fields); `src/data/rules-sheet-cards.json`
registers the other **26** with their rules transcribed. They are
references: each has quantity 0, never joins a deck or a game zone, and the
library opens it with its rules (the snapshot's placeholder text stays in
`public/catalog.json`).

| Scenario                                                                                   | Cards | Text from                                    | Art             |
| ------------------------------------------------------------------------------------------ | ----: | -------------------------------------------- | --------------- |
| Escape from Mount Gram                                                                     |     2 | rulesheet (MEC40)                            | reference cards |
| Across the Ettenmoors, The Treachery of Rhudaur, The Battle of Carn Dûm, The Dread Realm   |     4 | rulesheets (MEC41–MEC44)                     | reference cards |
| The Passage of the Marshes                                                                 |     1 | its reference card                           | reference card  |
| Voyage Across Belegaer, The Fate of Númenor, Raid on the Grey Havens                       |     5 | The Grey Havens rules (MEC47)                | reference cards |
| Flight of the Stormcaller, Temple of the Deceived, The Drowned Ruins, The City of Corsairs |     5 | rulesheets (MEC48, MEC50, MEC51, MEC53)      | reference cards |
| A Storm on Cobas Haven                                                                     |     1 | rulesheet (MEC52) and Grey Havens ship rules | reference card  |
| The Thing in the Depths                                                                    |     1 | rulesheet (MEC49)                            | none            |
| Escape from Umbar, Desert Crossing, The Long Arm of Mordor                                 |     3 | The Sands of Harad rules insert (MEC55)      | none            |
| Race Across Harad, Beneath the Sands, The Black Serpent, The Dungeons of Cirith Gurat      |     4 | rulesheets (MEC57–MEC60)                     | none            |

## Sources

- **The publisher's rules PDFs** supply the text of 25 cards: each card
  carries its scenario's rules sections (the encounter sets it is built
  with, the new keywords and rules, examples, a suggested play area as a
  described diagram, the difficulty level), with no story text or epilogue.
  Every sentence was checked against the PDFs' text; the files, their sizes
  and SHA-256 are listed in `tests/rules-sheet-cards.test.ts` (the CDN
  folder `https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/`,
  the same files the scenarios' own source notes cite). A Storm on Cobas
  Haven's insert adds no rules, so its card repeats The Grey Havens' ship
  rules as its reference card does. The Sands of Harad's general rules
  (immunity, Archery, side quests) belong to the whole box and are not
  repeated on its three cards.
- **The reference cards' scans** remain the art of the 18 cards that have
  them; `tests/rules-sheet-art.json` pins their **36 faces**. Thirty were
  already cached with their scenarios; the six faces of Escape from Mount
  Gram's two cards and The City of Corsairs' card are new (with their
  entries in `src/data/reference-scenario-art.json`). Each card's text
  follows the reference card's division into faces.
- The reference cards condense the rulesheets and differ from them in
  places, so their wording was not used where a rulesheet exists. Among the
  differences: Across the Ettenmoors' card leaves out "If Amarthiúl leaves
  play, the players lose the game"; Flight of the Stormcaller's prints
  difficulty 5 (the rulesheet: 6); The Fate of Númenor's sends a flipped
  location back to the Uncharted deck from "the encounter deck or discard
  pile" and drops that progress may still be placed on Lost Island; Voyage
  Across Belegaer's adds "or if no characters were committed" to the Sailing
  test (see [the sailing notes](GREY-HAVENS-SAILING.md)); The City of
  Corsairs' leaves out Indestructible and The Battle of Carn Dûm's leaves
  out that Thaurdir never enters the encounter deck; The Drowned Ruins' and
  The Treachery of Rhudaur's have misspellings ("plaers", "has has").
- **The Passage of the Marshes** keeps its reference card's text (the Mire
  keyword): The Land of Shadow's rules insert is not available here.
- **Eight cards** have no scan on the image source (every format answers
  403): they keep one face (the snapshot's reverse is a placeholder) and the
  snapshot's image address, so the library shows the card's name in place of
  art.

## Transcription conventions

- Straight quotes and apostrophes; encounter set icon rows and page numbers
  are left out; the difficulty line keeps the source's form ("Difficulty
  Level = 5", or The Grey Havens' and The Sands of Harad's "Difficulty
  level = 5.").
- Card icons use the engine's tokens (`[threat]`, `[attack]`, `[defense]`,
  `[willpower]`), shown as words. The Heading symbols are glyphs: ☀
  (on-course, the engine's "On-course"), ☁ and 🌧 (the two off-course
  settings, "Off-course · ¼" and "· ½") and ⚡ (the worst setting, "· ¾"); the
  Sailing success symbol is ☸.
- Diagrams are described in brackets (the Island Map, the suggested play
  areas).
- Line-break hyphens are restored ("non-ship", "double-sided",
  "objective-location"); the publishers' own typos stay ("found in the The
  Grey Havens deluxe expansion", "the the captives' plight", "in the The
  Haradrim cycle").

## Verification

```sh
node --import tsx --test tests/rules-sheet-cards.test.ts
npm run build
npm run test:browser-rules-sheets
npm run audit:rules
```

The suite (`tests/rules-sheet-cards.test.ts`, 6 tests) checks the 26 cards
against the snapshot (identity, set and product fields; placeholders
replaced) and that all 36 rulesheet cards are now registered; each card's
source, first line, difficulty level and faces; the rules the reference
cards condensed or left out; the 36 pinned faces and their local addresses;
the eight cards without scans; and that no rulesheet card enters a game of
the 22 scenarios, in normal and easy mode, through setup and the first steps
of play. Seeded games of those scenarios in every mode their recipes offer
(normal, easy and Nightmare, with the campaign recipes started as normal
games), two seeds and one or two players, were compared before and after the
registration: all 240 game states were identical. The browser suite opens
Voyage Across Belegaer's first card (both faces) and The Long Arm of
Mordor's card in the library at 1280, 390 and 320 pixels.
