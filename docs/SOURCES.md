# Data and asset provenance

Verified on 2026-09-23. No credentials are needed for the implemented public API.

- [RingsDB API documentation](https://ringsdb.com/api/doc): `GET https://ringsdb.com/api/public/cards/` returned 1,315 player-card definitions; `GET https://ringsdb.com/api/public/cards/core.json` returned 73. The response includes `Access-Control-Allow-Origin: *`. `public/catalog.json` is an offline snapshot. `src/data/player-cards.json` supplies the engine’s card definitions and original printing quantities. `npm run sync:cards` refreshes those snapshots with conditional caching headers.
- [RingsDB API usage guidance](https://ringsdb.com/api/): public versus OAuth endpoints, CORS, cache guidance, and original text ownership. No OAuth is needed for card reads. No official Fantasy Flight card API was identified.
- [OCTGN Core Set](https://github.com/GeckoTH/Lord-of-the-Rings/blob/master/o8g/Sets/Core%20Set/set.xml): encounter stats, text, shadows, quantities, and alternate quest faces. Normalized into `src/data/encounter-cards.json`. Fixed the display spelling of Chieftain Ufthak while retaining the source image filename.
- [FFG encounter-set inventory](https://www.fantasyflightgames.com/ffg_content/lotr-lcg/support/lord-of-the-rings-core-set-encounter-list.pdf): validated the original 36-card Passage Through Mirkwood deck, including the two cards placed in staging at setup.
- [FFG Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/f2/87/f28704b2-5f25-4fd8-be7a-18d4a5d2c1c4/mec101_core_set_rules_reference_v10c-compressed.pdf): setup, phase order, payments, shadows, questing, damage, and victory. This implementation has explicit timing limitations listed in COVERAGE.md.
- [Hall of Beorn Core Set catalog](https://www.hallofbeorn.com/LotR/Products/Core-Set?View=Browse): cross-check of starter quantities and encounter scans. The four original learning decks each contain 29 sphere cards plus one Gandalf, with three separate heroes. These are the original introductory decks, not the later standalone faction starter products or tournament-size constructed decks.

## Artwork

- `public/cards/01001.png`–`01073.png`: original card scans from RingsDB `/bundles/cards/`. Cached locally for stable play and preserved with original artists/ownership. Celebrían’s Stone required a cache-busted request; its returned image was normalized to PNG.
- The 19 `public/cards/*.jpg` encounter scans: Hall of Beorn `/Images/Cards/Core-Set/`, including `Dol-Guldur-Orcs-Enemy.jpg` and the source spelling `Chieftan-Ufthak.jpg`.
- Card artwork and rules text remain the property of Fantasy Flight Games and their respective owners. This project is an unofficial fan implementation, with attribution in the in-app guide. No rights transfer is implied by API availability.
- `public/art/mirkwood.jpg`: original background generated with the built-in image-generation tool, then optimized as JPEG for the application. The generated original was copied from the Codex output directory; the application uses only the workspace copy.

### Background prompt

Use case: stylized-concept. Asset type: original wide cinematic background painting for a Lord of the Rings living card game web app. A haunting ancient Mirkwood forest with colossal moss covered twisted oak trunks framing the far left and right edges, delicate gnarled branches, a narrow path and a still reflective stream receding into luminous mist at the center-right. Ancient high fantasy, extraordinary hand painted environment concept art, believable natural detail, soft muted emerald greens and deep blue green shadows, a faint warm golden light in the distance. Wide 16:9 landscape composition. The left third has deep quiet shadows suitable for light UI text, right two thirds feature the beautiful woodland scene with layered depth. Moody but readable, rich sophisticated tonal variations, cinematic atmosphere, painterly texture. No people, no characters, no lettering, no text, no logos, no UI, no cards, no watermark. This is an original environment illustration.
