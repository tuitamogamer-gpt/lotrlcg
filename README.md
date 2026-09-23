# There & Back Again

A cinematic, local-first **Lord of the Rings LCG** fan game built with React, TypeScript, and Vite. Play all three Core Set quests—**Passage Through Mirkwood**, **Journey Along the Anduin**, and **Escape from Dol Guldur**—as standalone normal games or the connected **Mirkwood Paths campaign**. Choose any of the four original Core Set starter decks: Leadership, Tactics, Spirit, or Lore.

## Run

```sh
npm install
npm run dev -- --port 5178
```

Open **http://localhost:5178**. Select **Normal game** to choose any mission, or **Campaign mode** to begin the three chapters in order. Choose a fellowship and begin. The game saves locally after each action, with independent normal and campaign saves. The in-app guide explains the phases and supports save export/import.

Campaign victories unlock the next chapter and record boons, burdens, fallen heroes, and scores. Prepare your heroes and player deck between quests. Dol Guldur uses the prisoner recorded at the end of the Anduin. Retry a failed quest from its campaign checkpoint.

The adventure screen has distinct scenery for every quest. The table offers comfortable or compact cards, mouse hover previews, full card inspection with contextual play, hand sorting and playable filtering, discard browsing, and a live quest forecast. On mobile, the current turn action stays at the bottom of the screen. Preferences are saved on this device.

Keyboard: **N** advances the current step, **U** undoes the last action, **H** jumps to your hand, **?** opens preferences and shortcuts, and **Esc** closes cards or menus. Shortcuts pause during dialogs and text entry.

## Check

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Browser checks expect the app at port 5178; override with `GAME_URL`. `npm run preview -- --port 5178` serves the production build.

`npm run test:ui` runs the interface checks separately: hand controls, card inspection and play, preferences, keyboard navigation, and layouts from 320px to 1920px. It is also included in `test:browser`.

## Deploy

Use Node.js 22. The Vercel configuration installs the locked dependencies with `npm ci`, builds with `npm run build`, and publishes `dist/`. No environment variables are required. Production deployments use the `main` branch of the connected GitHub repository.

For a manual deployment from a clean checkout:

```sh
vercel link
vercel --prod
```

Saves belong to the browser and site origin. To transfer a local game to the deployed site, export it from How to play and import that file on the new site.

## Data

RingsDB’s public API supplies player-card data. Encounter definitions come from OCTGN and are checked against FFG’s published scenario list. Card scans and generated environment images are cached locally. No API key or backend is needed. `npm run sync:cards` refreshes player-card snapshots with cache validators.

- [Implemented rules and limits](docs/COVERAGE.md)
- [API research and artwork provenance](docs/SOURCES.md)
- [Design direction](DESIGN.md)
- [Interface refresh and artwork prompts](docs/UI-REFRESH.md)

This is a playable first version, not the entire LOTR LCG catalog. It includes 73 Core Set player-card definitions, all 45 Core Set encounter definitions, seven campaign support definitions, all three quests, and both Mirkwood endings. The wider library contains 1,315 browsable player cards. Multiplayer, expert campaign rules, expansion quests/cards, and unrestricted deck construction are outside the current scope. Some intermediate timing windows remain simplified; see the coverage document.

## Architecture

`src/game/engine.ts` is a pure, deterministic rules engine. `applyAction` validates and applies an action to a cloned state; invalid actions throw without altering the original. A serializable effect queue and choice model support pending responses, save restoration, and replayable tests. `src/game/cards.ts` defines starter decks from original quantities. `src/App.tsx` is the DOM card table and adventure/library interface. `window.render_game_to_text()` exposes public state without the hidden deck order.

Unofficial fan project. Card text/artwork belong to their respective owners. Source attribution is available in the application and in `docs/SOURCES.md`.
