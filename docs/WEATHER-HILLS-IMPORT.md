# The Weather Hills source import

`the-weather-hills` uses the original Lost Realm standard/easy recipes, Q05.2 and E05.2. The immutable preparation snapshot is `src/data/pending/the-weather-hills-import.json`; its historical `pending-rules` status records preparation, rather than the current runtime registration. Active definitions and recipes live in `src/data/weather-hills-*.json`.

The source bundle contains 23 original definitions and 26 local JPEG faces, including both quest fronts/reverses and both sides of Hunting the Orcs. Four definitions reuse Chetwood handlers: Angmar Orc, Angmar Marauder, Angmar Captain and Orc Ambush. The runtime adds seventeen encounter definitions and two quest stages. Each prepared face retains its original HTTPS source, byte count and SHA-256.

| Recipe         | Encounter deck | Separate Orc deck | Set aside             | Staging                             | Active location | Quest deck |
| -------------- | -------------: | ----------------: | --------------------- | ----------------------------------- | --------------- | ---------: |
| Q05.2 standard |             31 |                11 | Orc Ambush, Amon Forn | Hunting the Orcs, Weathered Hilltop | Exposed Ridge   |          2 |
| E05.2 easy     |             24 |                 9 | Orc Ambush, Amon Forn | Hunting the Orcs, Weathered Hilltop | Exposed Ridge   |          2 |

The two Hilltops and two/one Ridges in the encounter deck are additional to the fixed staged Hilltop and active Ridge. The Orc deck contains all Angmar Orcs encounter-set enemies plus every Concealed Orc-camp. Its cards go to the ordinary encounter discard when they leave play. An empty Orc deck stays empty; instructions referring to it are ignored. Stage 2 shuffles its remaining cards and the encounter discard into the ordinary encounter deck.

## Original-face corrections

The preparation snapshot retains upstream transcription, while runtime rules follow the original faces:

- **Hunting the Orcs:** its printed front flips the objective and transfers all resource tokens. The catalog adds an advance-to-stage-2 sentence absent from that face. The printed **Savage Counter-attack** reverse advances to stage 2A when it enters play; the engine makes one transition after the tokens transfer.
- **Scattered Among the Hills / Cornered Animals:** “Amon Ford” in the catalog is a transcription error. Both printed quests and the physical recipe identify **Amon Forn**.
- **Cold from Angmar:** its original When Revealed text has no “Then” between damage and attachment. The attachment instruction is independent of successfully dealing the preceding damage. Its continuous blanking preserves printed keywords and Traits and ends when a character is no longer damaged or the Condition leaves play.
- **Biting Wind:** assign one shared pool of damage among all committed characters. This is not a separate pool for each player.
- **Ice Storm:** after every player's damage assignment, exhaust each damaged character, including characters that already had damage before this revelation.

The stage-1 quest has no printed numeric progress target. Resource tokens on the Mission objective control advancement. The stage-2 quest has 20 quest points; Amon Forn blocks victory while anywhere in play.

Sources: [official Lost Realm rules, pages 3–4](https://images-cdn.fantasyflightgames.com/filer_public/88/d6/88d6e80d-e75d-468f-8484-76c56b15e895/mec38_insert_web.pdf), the original local card faces linked in the preparation bundle, and the pinned DragnCards recipes.

Reproduce the source checks:

```sh
npm run prepare:scenario-import -- --recipe Q05.2 --check
node --import tsx --test tests/pending-imports.test.ts
node --import tsx scripts/browser-weather-hills.mjs
```

Gameplay and browser verification are documented in [The Weather Hills rules](WEATHER-HILLS-RULES.md). Campaign and Nightmare variants remain reference-only.
