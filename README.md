# There & Back Again

A cinematic, local-first **Lord of the Rings LCG** fan game built with React, TypeScript, and Vite. Play all three Core Set quests—**Passage Through Mirkwood**, **Journey Along the Anduin**, and **Escape from Dol Guldur**—as standalone normal games or the connected **Mirkwood Paths campaign**, plus the first Shadows of Mirkwood adventure, **The Hunt for Gollum**, as a normal game. Play solo hot-seat with **1–4 players, each with three heroes and a separate deck**, or classic solo with three heroes sharing one deck. All four original Core Set starters are available: Leadership, Tactics, Spirit, or Lore.

## Run

```sh
npm install
npm run dev -- --port 5178
```

Open **http://localhost:5178**. Select **Normal game** to choose any mission, or **Campaign mode** to begin the three chapters in order. In **Solo hot-seat**, choose 1–4 players and a different complete starter for each. Every player begins with that starter’s three heroes in play and its original 30-card draw deck. Starting threat is the sum of their heroes’ threat values. You control every seat, with separate hands, resources, threat, discard piles, and player decks. Questing and encounters are shared. In **Classic solo**, choose one original three-hero starter. The game saves locally after each action, with independent normal and campaign saves. The in-app guide explains the phases and supports save export/import.

Campaign victories unlock the next chapter and record boons, burdens, fallen heroes, and scores. Prepare your heroes and player deck between quests. Dol Guldur uses the prisoner recorded at the end of the Anduin. Retry a failed quest from its campaign checkpoint.

**You control the pace.** Encounters and shadows are shown before their effects resolve. **Table preferences** offer three event-review modes: *Every event* waits for Continue after each recorded event, including your own plays; *Hidden information & losses* (the default) pauses only for revealed encounters, shadows, damage, threat, quest results and the start of each round; *Decisions only* never pauses for information. Every event is still written to the chronicle, and your own plays appear as a brief notice. Continue is a button or a single press of Enter; a held key never advances. **Inspect table** keeps the game paused while you examine cards and player seats; **Review current event** returns to the pending step. The chronicle retains the last 80 event reviews, including revealed cards and before/after changes. Autosave and export/import preserve the exact pending review and the chosen mode.

**Coaching and first steps.** A lamp in the turn panel suggests one move for the current decision, computed from the visible table: which characters to commit, who can defend safely, whether an attack destroys its target. The first adventure opens with a short tour of the round. Both can be switched off in preferences.

**Decks, difficulty and records.** The **Deck builder** assembles 50-card decks from the scripted Core Set under the Rules Reference limits (one to three heroes, at most three copies, matching spheres) and imports public RingsDB decklists, listing any unsupported cards. Custom decks play in classic solo and hot-seat games and continue through campaigns and retries. **Easy mode** follows the official rules: each hero begins with one extra resource and the encounter cards marked for easy mode are set aside (27, 32 and 30 cards instead of 36, 47 and 41). Finished adventures are kept in **Your record** on the Adventures page.

The adventure atlas uses Red Book parchment, oxblood leather, and distinct scenery for each quest. During play, an illustrated cloth tabletop with three selectable imagegen playmats shows full card scans, landscape quest cards, a separate active location, physical deck/discard piles, resource/damage/progress tokens, tucked attachments, sideways exhausted characters, and a two-wheel threat counter. Other fellowships remain visible beside the active player. The desktop table keeps the hand and turn controls inside the viewport, with independent scrolling for crowded zones. Player banners show each deck’s threat, resources, hand, and remaining cards. Mouse previews, full card inspection, hand sorting/filtering, discard browsing, and a shared quest forecast remain available. Table appearance preferences are saved on this device. Fellowship choices are saved locally for guests; connected accounts can save and restore their setup across devices using **Save choices**. **This release focuses on desktop; further mobile refinement is deferred.**

Keyboard: **1 / 2 / 3 / 4** switches player seats, **N** advances the current phase or opens a pending review, **Enter** confirms an open event review, **U** undoes the last action, **H** jumps to your hand, **?** opens preferences and shortcuts, and **Esc** closes cards or menus. Shortcuts pause during dialogs and text entry. Escape, held keys, and double clicks cannot skip reviews.

## Check

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Browser checks expect the app at port 5178; override with `GAME_URL`. `npm run preview -- --port 5178` serves the production build.

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the type check, engine tests, production build, and the interface and pacing browser suites on every push and pull request.

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

RingsDB’s public API supplies player-card data. Encounter definitions come from OCTGN and are checked against FFG’s published scenario list. Card scans and generated environment images are cached locally. Card data and guest play need no backend. Optional accounts use Supabase Auth and a private per-user choices table. `npm run sync:cards` refreshes player-card snapshots with cache validators.

- [Visual fellowship selection and account setup](docs/ACCOUNTS.md)
- [Implemented rules and limits](docs/COVERAGE.md)
- [API research and artwork provenance](docs/SOURCES.md)
- [Design direction](DESIGN.md)
- [Physical tabletop design research and references](docs/TABLETOP-DESIGN-RESEARCH.md)
- [Interface refresh and artwork prompts](docs/UI-REFRESH.md)
- [Premium playmats, card backs, tokens, and imagegen prompts](docs/PREMIUM-TABLE.md)
- [Solo hot-seat and Red Book desktop update](docs/HOTSEAT-REDBOOK.md)
- [Visible events and player-controlled progression](docs/PLAYER-CONTROL.md)

This is a playable first version, not the entire LOTR LCG catalog. It includes 73 Core Set player-card definitions, all 45 Core Set encounter definitions, the 11 encounter definitions of The Hunt for Gollum, seven campaign support definitions, all four quests, and both Mirkwood endings. The wider library contains 1,315 browsable player cards; the deck builder uses only the scripted Core Set cards. Online multiplayer, expert campaign rules, expansion quests/cards, and easy-mode encounter removals are outside the current scope. Some intermediate timing windows remain simplified; see the coverage document.

## Architecture

`src/game/engine.ts` is the public entry point of a pure, deterministic rules engine whose implementation lives in focused modules: `core.ts` (state helpers, statistics, payments), `board.ts` (damage, progress, quest and phase rules, encounter reveals and shadows), `effects.ts` (the effect interpreter and queue), `combat.ts`, `player-cards.ts` (card scripts), `scenario-rules.ts` (the three quests), `campaign.ts`, `setup.ts`, `actions.ts` (player actions and public state) and `save.ts` (validation and restoration). `applyAction` validates and applies an action to a cloned state; invalid actions throw without altering the original. A serializable effect queue and choice model support pending responses, save restoration, and replayable tests. `src/game/table.ts` manages per-seat state, ownership, ordered turns, and cooperative combat eligibility. The active seat is projected onto the existing personal-state fields, preserving classic saves. Queued effects and pending choices retain the player who owns them. `src/game/cards.ts` defines starter decks from original quantities. `src/App.tsx` is the DOM card table and adventure/library interface. `window.render_game_to_text()` exposes public state without the hidden deck order.

Unofficial fan project. Card text/artwork belong to their respective owners. Source attribution is available in the application and in `docs/SOURCES.md`.
