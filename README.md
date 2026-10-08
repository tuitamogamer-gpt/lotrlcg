# There & Back Again

A cinematic, local-first **Lord of the Rings LCG** fan game built with React, TypeScript, and Vite. The automated adventure atlas includes 36 original/easy scenarios: the Core Set, Shadows of Mirkwood, Khazad-dûm, Dwarrowdelf, Heirs of Númenor, all six Against the Shadow adventures, all three quests from The Voice of Isengard, The Dunland Trap, The Three Trials, Trouble in Tharbad, The Nîn-in-Eilph, Celebrimbor’s Secret and The Antlered Crown. The Core quests also form the connected **Mirkwood Paths campaign**. Play classic solo or **1–4 players in local hot-seat**, each with a separate fellowship and deck. Original Core learning decks and fully scripted published starter decks are selectable; hero and card inspection retain original/reprint product provenance.

## Run

```sh
npm install
npm run dev -- --port 5178
```

Open **http://localhost:5178**. Select **Normal game** to choose an implemented mission, or **Campaign mode** to begin the three chapters in order. The fellowship menu includes all ten preconstructed choices on a fresh device: four Core learning decks, four retail Starter Decks and both Limited Collector’s Edition decks. Each displays its three heroes, starting threat and exact deck size; no catalogue import is needed. In **Solo hot-seat**, choose 1–4 players and a different complete deck for each. Original Core starters retain 30 cards, while the retail and Collector decks retain their printed 50-card main lists. Custom decks use the deck builder's rules. Starting threat is the sum of printed hero values, adjusted by applicable setup abilities such as Mirlonde. You control every seat, with separate hands, resources, threat, discard piles, and player decks. Questing and encounters are shared. The game saves locally after each action, with independent normal and campaign saves. The in-app guide explains the phases and supports save export/import.

Campaign victories unlock the next chapter and record boons, burdens, fallen heroes, and scores. Prepare your heroes and player deck between quests. Dol Guldur uses the prisoner recorded at the end of the Anduin. Retry a failed quest from its campaign checkpoint.

**You control the pace.** Encounters and shadows are shown before their effects resolve. **Table preferences** offer three event-review modes: _Every event_ waits for Continue after each recorded event, including your own plays; _Hidden information & losses_ (the default) pauses only for revealed encounters, shadows, damage, threat, quest results and the start of each round; _Decisions only_ never pauses for information. Every event is still written to the chronicle, and your own plays appear as a brief notice. Continue is a button or a single press of Enter; a held key never advances. **Inspect table** keeps the game paused while you examine cards and player seats; **Review current event** returns to the pending step. The chronicle retains the last 80 event reviews, including revealed cards and before/after changes. Autosave and export/import preserve the exact pending review and the chosen mode.

**Coaching and first steps.** A lamp in the turn panel suggests one move for the current decision, computed from the visible table: which characters to commit, who can defend safely, whether an attack destroys its target. The first adventure opens with a short tour of the round. Both can be switched off in preferences.

**Decks, difficulty and records.** The **Deck builder** assembles decks from the registered Core and expansion card pool under the Rules Reference limits (one to three heroes, at least 50 cards, at most three copies) and imports public RingsDB decklists, listing unsupported cards and quantity adjustments. Unfinished lists can be saved as drafts. Cards outside your heroes’ spheres carry payment advice; they remain legal deck choices. Custom decks play in classic solo and hot-seat games and continue through campaigns and retries. Resuming compares the original list and heroes, and imported saves recover missing custom decks on this device. **Easy mode** follows the official rules: each hero begins with one extra resource and the encounter cards marked for easy mode are set aside (Core: 27/32/30 cards; Hunt: 34; Carrock: 29; Emyn Muil: 38 after setup). Finished adventures are kept in **Your record** on the Adventures page; the lowest winning score is best.

The adventure atlas uses Red Book parchment, oxblood leather, and distinct scenery for each quest. During play, an illustrated cloth tabletop with three selectable imagegen playmats shows full card scans, landscape quest cards, a separate active location, physical deck/discard piles, resource/damage/progress tokens, tucked attachments, sideways exhausted characters, and a two-wheel threat counter. Other fellowships remain visible beside the active player. The desktop table keeps the hand and turn controls inside the viewport, with independent scrolling for crowded zones. Player banners show each deck’s threat, resources, hand, and remaining cards. Mouse previews, full card inspection, hand sorting/filtering, discard browsing, and a shared quest forecast remain available. Table appearance preferences are saved on this device. Fellowship choices are saved locally for guests; connected accounts can save and restore their setup across devices using **Save choices**. **This release focuses on desktop; further mobile refinement is deferred.**

Keyboard: **1 / 2 / 3 / 4** switches player seats, **N** advances the current phase or opens a pending review, **Enter** confirms an open event review, **U** undoes the last action, **H** jumps to your hand, **?** opens preferences and shortcuts, and **Esc** closes cards or menus. Shortcuts pause during dialogs and text entry. Escape, held keys, and double clicks cannot skip reviews.

## Check

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

`npm run test:against-shadow-finale` checks The Blood of Gondor, The Morgul Vale and The Voice of Isengard player interactions, including reload and responsive layouts.

`npm run test:precons` checks every added built-in starter deck, hero art, saved games and four-player setup. `npm run test:ring-maker-players` checks all six Ring-maker player packs through actual payments and choices, including reload at desktop and mobile widths.

`npm run test:ring-maker-quests` checks Fords of Isen: Time, Gríma, Dunland card-draw reactions, hand restrictions, save/reload and 1–4-player setup at 1280/390/320px. It also checks To Catch an Orc: full-deck mulligans, hidden Search decks, capture, escape and victory. Into Fangorn adds Hinder combat, resource-phase attacks, Mugash capture and escape, Time transitions, Conditions, travel costs and five-character refresh choices. The Dunland Trap adds Boar Clan draw reactions, the equipment/ally trap, Chief Turch and the final survival assault. The Three Trials adds three freely ordered trials, physical Key objectives, Guardian Time, Barrow restrictions and Hallowed Circle victory. Trouble in Tharbad adds Nalir, changing threat-elimination limits, The Empty Mug, City effects and the escape across the ruined bridge. The Nîn-in-Eilph adds parallel swamp stages, Time-triggered creatures, card/resource/refresh restrictions and the Ancient Marsh-dweller. Celebrimbor’s Secret adds Scour, location damage, The Orcs’ Search and the struggle to recover the Mould. See [Celebrimbor rules](docs/CELEBRIMBOR-RULES.md), [Nîn-in-Eilph rules](docs/NIN-EILPH-RULES.md), [Tharbad rules](docs/THARBAD-RULES.md), [Three Trials rules](docs/THREE-TRIALS-RULES.md), [Dunland Trap rules](docs/DUNLAND-TRAP-RULES.md), [Fords rules](docs/FORDS-ISEN-RULES.md), [Orc rules](docs/CATCH-ORC-RULES.md) and [Fangorn rules](docs/FANGORN-RULES.md).

Browser checks expect the app at port 5178; override with `GAME_URL`. `npm run preview -- --port 5178` serves the production build.

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the type check, engine tests, production build, and the interface, pacing, hot-seat and custom-deck/Gollum browser suites on every push and pull request.

`npm run test:ui` runs the interface checks separately: hand controls, card inspection and play, preferences, keyboard navigation, and responsive layouts. `npm run test:hotseat` checks independent seats, complete round handoffs, cooperative combat, campaign carry-over, hero shortcuts, and desktop action reachability. `npm run test:pacing` checks actual blocking reviews, encounter/shadow ordering, damage, resources, reload, the chronicle, and desktop Continue-button reachability. All are included in `test:browser`. Use `DESKTOP_ONLY=1 npm run test:browser` for the current desktop focus (1280×720 through 2560×1440).

## Deploy

Use Node.js 22. The Vercel configuration installs the locked dependencies with `npm ci`, builds with `npm run build`, and publishes `dist/`. Guest play requires no environment variables. Optional account sign-in and cloud choices require the Supabase settings in [Account setup](docs/ACCOUNTS.md). Production deployments use the `main` branch of the connected GitHub repository.

For a manual deployment from a clean checkout:

```sh
vercel link
vercel --prod
```

Saves belong to the browser and site origin. To transfer a local game to the deployed site, export it from How to play and import that file on the new site.

## Data

The bundled official-content catalogue combines RingsDB player-card identities with the current DragnCards/OCTGN encounter, quest, campaign and Nightmare definitions. It contains 4,183 card records, including 112 hero records, 355 scenario setup lists and seven campaign card pools. Product provenance covers original releases, revised packaging, the four separately sold Starter Decks and verified promotional printings. Fan expansions and virtual Messenger of the King heroes are excluded. Reprints share canonical player-card identities; their printing and product metadata remain available.

`npm run sync:content` refreshes the card catalogue and product provenance. The importer validates every recipe reference before replacing files and records upstream hashes in `public/data-metadata.json`. `npm run sync:cards` refreshes reference definitions and `npm run sync:products` regenerates product mappings and official starter recipes. Core gameplay fixtures are deliberately independent of these imports. Original gameplay scans are cached locally; wider catalogue images load from their public source URLs. Card data and guest play need no backend. Optional accounts use Supabase Auth and a private per-user choices table.

- [Visual fellowship selection and account setup](docs/ACCOUNTS.md)
- [Implemented rules and limits](docs/COVERAGE.md)
- [Full content import and reproducibility](docs/CONTENT-IMPORT.md)
- [Products, packaging and official decklist sources](docs/PRODUCT-SOURCES.md)
- [API research and artwork provenance](docs/SOURCES.md)
- [Design direction](DESIGN.md)
- [Physical tabletop design research and references](docs/TABLETOP-DESIGN-RESEARCH.md)
- [Interface refresh and artwork prompts](docs/UI-REFRESH.md)
- [Premium playmats, card backs, tokens, and imagegen prompts](docs/PREMIUM-TABLE.md)
- [Solo hot-seat and Red Book desktop update](docs/HOTSEAT-REDBOOK.md)
- [Visible events and player-controlled progression](docs/PLAYER-CONTROL.md)

Automated play registers only card definitions with implemented rules. All Shadows of Mirkwood player packs, Khazad-dûm player cards, all six Dwarrowdelf player packs, Heirs of Númenor and all six Against the Shadow player packs are integrated, including Assault on Osgiliath, The Blood of Gondor and The Morgul Vale. The exact printed **Defenders of Gondor**, **Dwarves of Durin**, **Elves of Lórien** and **Riders of Rohan** main starter decks and both **Limited Collector’s Edition** 50-card lists can be selected and played. Published recipes retain exact quantities and packaging information. Thirty-six original/easy scenarios are integrated, including all six Against the Shadow quests, all three Voice of Isengard quests and all six Ring-maker adventures. All fifteen The Voice of Isengard player designs and all six Ring-maker player packs are implemented, including Gríma, Saruman, Idraen, Rúmil, Gwaihir, Erkenbrand and Treebeard. The runtime now contains 437 player definitions, including 50 heroes. See the [final Ring-maker rules notes](docs/RING-MAKER-FINAL-PLAYER-SCRIPTS.md). All six Ring-maker adventure quests are playable in normal/easy mode; see the [Antlered Crown rules notes](docs/ANTLERED-CROWN-RULES.md). The Lost Realm now has fourteen player designs, including Tactics Aragorn, Halbarad and the Ranger Summons / Ranger of the North Encounter pair; its player side quest and scenarios remain pending. See [Lost Realm player rules](docs/LOST-REALM-PLAYER-SCRIPTS.md). The Core campaign remains separate from other campaign variants.

**Full-library scripting is in progress.** The imported catalogue contains 4,183 reference identities. Run `npm run audit:rules` for the current implemented and pending per-card/per-product inventory in `public/automation-coverage.json`. That inventory reports registrations; semantic rules checks and actual client interactions provide separate evidence. Saga, the remaining cycles/campaigns, standalone scenarios and Nightmare variants remain within the requested scope. The [full scripting implementation plan](docs/FULL-SCRIPTING-PLAN.md) and scenario-specific rule documents record progress and primary sources. Importing a reference alone never grants play support.

Resource collection and draw are followed by an explicit Resource action window for each player before Planning. Refresh readies characters, raises threat, passes the first-player token and resolves regeneration before its action window. These steps and pending choices survive save/reload.

## Architecture

`src/game/engine.ts` is the public entry point of a pure, deterministic rules engine whose implementation lives in focused modules: `core.ts` (state helpers, statistics, payments), `board.ts` (damage, progress, quest and phase rules, encounter reveals and shadows), `effects.ts` (the effect interpreter and queue), `combat.ts`, `player-cards.ts` (card scripts), `scenario-rules.ts` and scenario modules (quest and encounter rules), `campaign.ts`, `setup.ts`, `actions.ts` (player actions and public state) and `save.ts` (validation and restoration). `applyAction` validates and applies an action to a cloned state; invalid actions throw without altering the original. A serializable effect queue and choice model support pending responses, save restoration, and replayable tests. `src/game/table.ts` manages per-seat state, ownership, ordered turns, and cooperative combat eligibility. The active seat is projected onto the existing personal-state fields, preserving classic saves. Queued effects and pending choices retain the player who owns them. `src/game/cards.ts` defines the explicit supported pool and preserves original starter quantities. `expansion-passives.ts`, `expansion-player-cards.ts` and `gondor-player-cards.ts` implement expansion mechanics; `attachment-text.ts` synchronizes derived text blanking. `src/App.tsx` is the DOM card table and adventure/library interface. `window.render_game_to_text()` exposes public state without the hidden deck order.

Unofficial fan project. Card text/artwork belong to their respective owners. Source attribution is available in the application and in `docs/SOURCES.md`.
