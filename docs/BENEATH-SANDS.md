# Beneath the Sands

The original, non-Nightmare **Beneath the Sands** scenario is playable in standard and easy mode, solo and with two to four local hot-seat players. Difficulty is 5. The encounter sets are Beneath the Sands, Desert Creatures and Harad Territory. Source evidence, printed-card corrections and artwork provenance are recorded in [BENEATH-SANDS-SOURCES.md](BENEATH-SANDS-SOURCES.md).

## Physical setup

The three physical quest cards form the fixed sequence Searching the Caves → Getting Closer → The Spiders’ Hive; each has 5 quest points. The Search objective starts in staging with **Off Track** face up and no resources. The unique Brood Mother starts set aside. The encounter deck contains **39** cards in standard mode or **36** in easy mode. Setup discards until one location per participating player is found, adding those exact copies to staging. Including the three quests, Search objective and set-aside boss, the complete setup has 44 standard or 41 easy scenario cards.

## Rules implemented

- Off Track prevents progress on the main quest while allowing progress on locations and side quests. At quest end it gains one resource; the first player chooses the topmost discarded location to return to staging, or raises each player’s threat by the resource total.
- On Track searches the top three encounter cards at quest end, adds one bearing the printed On Track sign, and discards the rest. These cards are added rather than revealed. If no card enters play, the objective flips Off Track. An unsuccessful quest also flips it Off Track.
- After actual travel, resolve the active location’s Track value while Off Track. Discard exactly that many cards, reshuffling the encounter discard if necessary. Finding a printed On Track sign flips the objective and clears its resources. Travel costs finish before Track. Moving a location active by another effect does not invoke Track.
- Lost Underground flips the search Off Track when actually revealed, then prevents further flips and Track resolution. Its optional defeated response flips On Track and suppresses both Search Forced effects through the current phase.
- Spider Burrow puts the physical Brood Mother into play and flips On Track when it becomes active. When it is explored before stage three, the same boss returns set aside and its shadows leave play normally.
- Brood Mother engages the first player through the normal engagement hooks. Its round-end search adds one real Spider Broodling without revealing it. It cannot take damage until stage three has five progress. Flipping Off Track at stage three removes all its progress. Victory requires five progress and Brood Mother outside play.
- All scenario enemy statistics, conditional surge, staging-location progress restrictions, treacheries, Conditions and shadow effects use current On/Off Track state. Getting Closer forbids cancellation of encounter effects while On Track, including shadow effects.
- Shared Harad Territory and Desert Creatures cards retain their normal hand limit, injury choice, exhaustion/ready restrictions, damaged-character blanking, undefended Sand Viper attacks and Scorpion poison.

Getting Closer’s cancellation restriction also applies to direct encounter damage canceled by Frodo, Gondorian Discipline or Close Call. Their existing damage-response gates now distinguish this restriction from framework combat damage, which remains cancelable. Nine native cases in `tests/beneath-sands-cancellation.test.ts` cover all three responses, both Search states, actual enemy defense and saved continuations.

The physical Search card’s face follows its rule state in both board artwork and inspection. Saved searches retain the exact top cards awaiting selection. A Spider Broodling shadow transfers its exact revealed copy into engagement, deals a fresh shadow, and preserves the attacker’s other shadow cards. Set-aside transitions dispose of active and suspended shadows once. Normal multiplayer ownership, engagement responses and review continuations remain available.

## Verification

Focused native coverage is in `tests/beneath-sands-scenario.test.ts`, with deterministic native browser fixtures in `tests/beneath-sands-browser-fixtures.ts`. It checks all eight player-count/mode setups, physical zones, Track travel and reshuffle, Search choices and reload, quest advances, Conditions, actual combat and victory/loss, cancellation and native engagement responses.

Run:

```sh
npm run check
node --import tsx --test tests/beneath-sands-scenario.test.ts
GAME_URL=http://127.0.0.1:5206 node --import tsx scripts/browser-beneath-sands.mjs
```

The browser suite exercises fresh setup, native travel/reveal/quest/combat interactions, pending and resolved saves, every printed encounter face, both faces of every quest, and decoding/hashes of all 25 source scenario images. Its full run covers 1280, 390 and 320 pixel viewports. `BENEATH_SANDS_WIDTHS` and `BENEATH_SANDS_OUTPUT_DIR` allow a bounded rehearsal without replacing full-run evidence.

Final verification passed **4,571 engine tests**, **171 scenario browser checkpoints**, **90 player browser checkpoints** and **9 visually reviewed UI captures**, with no browser or artifact errors. The browser runs use the frozen `index-URo7Jbxv.js` module (332,864 bytes; SHA-256 `6917dc937541b1dd2af1927830ec2e1127faea19f027d20eb333f823ff27c772`). All 25 scenario faces and ten player faces match their served-byte source hashes. Final reports are generated at `output/beneath-sands/report.json`, `output/beneath-sands-players/report.json` and `output/beneath-sands-ui/report.json`; preliminary attempts remain separate.

The dedicated complete-game parity suite covers standard/easy mode, one to four players, and all four event-review modes: **32 games and 24 exact-state comparisons**. Its observer checks physical card conservation, quest/Search faces, private deck order, saved pending effects and reload idempotence at each action. The resumable release runner writes `output/beneath-sands-parity/report.json`; the tracked CI suite is `npm run test:beneath-sands-simulation`. The generic game runner also registers five new solo/hot-seat cases, bringing its complete-game registrations to 309.
