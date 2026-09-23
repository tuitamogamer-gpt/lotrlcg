# There & Back Again

A cinematic, local-first **Lord of the Rings LCG** fan game built with React, TypeScript, and Vite. Play solo **Passage Through Mirkwood** using any of the four original Core Set starter decks: Leadership, Tactics, Spirit, or Lore.

## Run

```sh
npm install
npm run dev -- --port 5178
```

Open **http://localhost:5178**. Choose a fellowship and begin the adventure. The game saves locally after each action. The in-app guide explains the phases and supports save export/import.

## Check

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Browser checks expect the app at port 5178; override with `GAME_URL`. `npm run preview -- --port 5178` serves the production build.

## Deploy

Use Node.js 22. The Vercel configuration installs the locked dependencies with `npm ci`, builds with `npm run build`, and publishes `dist/`. No environment variables are required. Production deployments use the `main` branch of the connected GitHub repository.

For a manual deployment from a clean checkout:

```sh
vercel link
vercel --prod
```

Saves belong to the browser and site origin. To transfer a local game to the deployed site, export it from How to play and import that file on the new site.

## Data

RingsDB’s public API supplies player-card data. Encounter definitions come from OCTGN and are checked against FFG’s published scenario list. Card scans and the generated environment image are cached locally. No API key or backend is needed. `npm run sync:cards` refreshes player-card snapshots with cache validators.

- [Implemented rules and limits](docs/COVERAGE.md)
- [API research and artwork provenance](docs/SOURCES.md)
- [Design direction](DESIGN.md)

This is a playable first version, not the entire LOTR LCG catalog. It includes 73 Core Set player-card definitions, the 19 encounter definitions for Mirkwood, and its two final branches. The wider library contains 1,315 browsable player cards. Other scenarios, multiplayer, campaign modes, and expansion-card scripting are future work.

## Architecture

`src/game/engine.ts` is a pure, deterministic rules engine. `applyAction` validates and applies an action to a cloned state; invalid actions throw without altering the original. A serializable effect queue and choice model support pending responses, save restoration, and replayable tests. `src/game/cards.ts` defines starter decks from original quantities. `src/App.tsx` is the DOM card table and adventure/library interface. `window.render_game_to_text()` exposes public state without the hidden deck order.

Unofficial fan project. Card text/artwork belong to their respective owners. Source attribution is available in the application and in `docs/SOURCES.md`.
