import { finishResourcePhase } from "./browser-review-helpers.mjs";
import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { STARTERS } from "../src/game/cards.ts";
import { createGame } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { DECKS_KEY } from "../src/game/decks.ts";
import { CHOICES_KEY } from "../src/account/choices.ts";
import {
  acknowledgeReviews,
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/revisions";
await fs.mkdir(dir, { recursive: true });
const lead = STARTERS[0];
const cards = Object.fromEntries(
  STARTERS.slice(0, 2)
    .flatMap((d) => Object.keys(d.cards))
    .slice(0, 17)
    .map((code) => [code, 3]),
);
const first = {
  id: "first",
  name: "River scouts",
  heroes: [lead.heroes[0]],
  cards,
  updatedAt: 1,
};
const second = {
  ...first,
  id: "second",
  name: "Forest scouts",
  cards: { ...cards, "01013": 2 },
};
const browserEngine =
  process.env.BROWSER_ENGINE === "webkit" ? webkit : chromium;
const browser = await browserEngine.launch({ headless: true });
const errors = [];
const reports = [];

async function page(width = 1440, height = 900) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await installReviewHandler(p);
  await p.goto(base);
  await p.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  return p;
}
async function seed(
  p,
  {
    decks = [first, second],
    game = null,
    mode = "classic",
    seats = ["custom:first"],
    selectedDeck = "custom:first",
  } = {},
) {
  await p.evaluate(
    ({ decks, game, mode, seats, selectedDeck, deckKey, choicesKey }) => {
      localStorage.setItem(deckKey, JSON.stringify(decks));
      localStorage.setItem(
        choicesKey,
        JSON.stringify({
          version: 1,
          setupMode: mode,
          selectedDeck,
          seatDecks: seats,
          playMode: "normal",
          scenario: "hunt-for-gollum",
        }),
      );
      if (game)
        localStorage.setItem(
          "there-and-back-again.save.v1",
          JSON.stringify(game),
        );
      else localStorage.removeItem("there-and-back-again.save.v1");
    },
    {
      decks,
      game,
      mode,
      seats,
      selectedDeck,
      deckKey: DECKS_KEY,
      choicesKey: CHOICES_KEY,
    },
  );
  await p.reload();
  await p.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
}
async function shot(p, name) {
  await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: horizontal overflow`,
  );
}

try {
  const p = await page();
  await seed(p);
  assert.match(
    await p.locator(".fellowship-summary").innerText(),
    /51 cards · 1 hero/,
  );
  await p.getByRole("button", { name: "Begin adventure", exact: true }).click();
  let state = await reviewedState(p);
  assert.equal(state.scenario, "hunt-for-gollum");
  assert.equal(state.heroes.length, 1);
  await p.getByRole("button", { name: "Keep hand", exact: true }).click();
  await finishResourcePhase(p);
  state = await reviewedState(p);
  assert.equal(state.phase, "planning");
  assert.equal(state.heroes[0].resources, 1);
  await shot(p, "gollum-custom-planning");
  await p.getByRole("button", { name: "Adventures", exact: true }).click();
  await p
    .getByRole("button", { name: "Choose Forest scouts", exact: true })
    .click();
  assert.equal(
    await p
      .getByRole("button", { name: "Continue adventure", exact: true })
      .count(),
    0,
    "another custom list cannot resume the old game",
  );
  await p
    .getByRole("button", { name: "Choose River scouts", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Continue adventure", exact: true })
    .click();
  assert.deepEqual(await reviewedState(p), state);
  await p.reload();
  await p
    .getByRole("button", { name: "Continue adventure", exact: true })
    .click();
  assert.deepEqual(
    await reviewedState(p),
    state,
    "custom save survives reload",
  );
  reports.push(
    "custom identity, one-hero counts, Gollum setup and exact reload",
  );
  await p.context().close();

  const hot = createGame(19, lead.cards, lead.heroes, lead.id, {
    scenarioId: "hunt-for-gollum",
    guided: true,
    seats: [
      { deckId: "custom", heroes: first.heroes, cards },
      { deckId: STARTERS[1].id, heroes: [...STARTERS[1].heroes] },
    ],
  });
  const h = await page();
  await seed(h, {
    game: hot,
    mode: "hotseat",
    seats: ["custom:first", STARTERS[1].id],
  });
  assert.match(
    await h.locator(".selected-company").innerText(),
    /River scouts/,
  );
  assert.match(await h.locator(".selected-company").innerText(), /4 heroes/);
  assert.ok(
    await h
      .getByRole("button", { name: "Choose Leadership", exact: true })
      .isEnabled(),
  );
  await h
    .getByRole("button", { name: "Edit Player 2 fellowship", exact: true })
    .click();
  assert.ok(
    await h
      .getByRole("button", { name: "Choose Leadership", exact: true })
      .isDisabled(),
    "shared hero selection is unavailable",
  );
  await h
    .getByRole("button", { name: "Continue adventure", exact: true })
    .click();
  const before = await reviewedState(h);
  await h.reload();
  await h
    .getByRole("button", { name: "Continue adventure", exact: true })
    .click();
  assert.deepEqual(await reviewedState(h), before);
  await shot(h, "gollum-hotseat");
  reports.push("custom hot-seat summary, conflicting heroes and reload");
  await h.context().close();

  const draft = {
    id: "unfinished",
    name: "Unfinished notes",
    heroes: [],
    cards: {},
    updatedAt: 1,
  };
  const d = await page();
  await seed(d, {
    decks: [draft],
    mode: "hotseat",
    seats: ["leadership", "tactics"],
    selectedDeck: "custom:unfinished",
  });
  await d.getByRole("button", { name: "Begin adventure", exact: true }).click();
  const started = await reviewedState(d);
  assert.equal(
    started.table.seats.length,
    2,
    "an unrelated classic draft does not block a valid table",
  );
  assert.equal(started.table.seats[0].deckId, "leadership");
  reports.push(
    "valid hot-seat setup starts independently of an unfinished classic deck",
  );
  await d.context().close();

  for (const width of [320, 390, 1280]) {
    const m = await page(width, width < 400 ? 844 : 720);
    await seed(m, {
      decks: [],
      game: hot,
      mode: "hotseat",
      seats: ["custom:first", STARTERS[1].id],
    });
    const recovered = await m.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      DECKS_KEY,
    );
    assert.equal(recovered.length, 1);
    assert.deepEqual(recovered[0].cards, cards);
    assert.ok(
      (await m
        .getByRole("button", {
          name: "Choose Recovered fellowship 1",
          exact: true,
        })
        .getAttribute("aria-pressed")) === "true",
    );
    await m
      .getByRole("button", { name: "Continue adventure", exact: true })
      .click();
    await acknowledgeReviews(m);
    await shot(m, `recovered-${width}`);
    assert.equal((await reviewedState(m)).scenario, "hunt-for-gollum");
    await m.context().close();
  }
  reports.push("missing deck recovery and table layout at 320, 390 and 1280px");

  // A successful quest response must be playable before progress advances the
  // stage. This checkpoint exercises the actual Clue decision and quest face.
  const clueGame = applyAction(
    createGame(41, lead.cards, lead.heroes, lead.id, {
      scenarioId: "hunt-for-gollum",
    }),
    { type: "KEEP" },
  );
  Object.assign(clueGame, {
    phase: "staging",
    stage: 2,
    progress: 9,
    queue: [],
    choice: null,
    activeLocation: null,
  });
  clueGame.heroes[0].committed = true;
  clueGame.committedIds = [clueGame.heroes[0].id];
  clueGame.staging = [
    {
      id: `c${clueGame.nextId++}`,
      code: "02014",
      damage: 0,
      progress: 0,
      resources: 0,
      exhausted: false,
      committed: false,
      attachments: [],
      boost: 0,
      attacked: false,
      shadows: [],
    },
  ];
  const q = await page();
  await seed(q, { decks: [], game: clueGame });
  await q
    .getByRole("button", { name: "Choose Leadership", exact: true })
    .click();
  await q
    .getByRole("button", { name: "Continue adventure", exact: true })
    .click();
  await acknowledgeReviews(q);
  await q.getByRole("button", { name: "Resolve quest", exact: true }).click();
  await acknowledgeReviews(q);
  assert.match((await reviewedState(q)).choice.title, /Signs of Gollum/);
  await shot(q, "gollum-clue-response");
  await q.locator("dialog[open] .choice-list .decision-select").first().click();
  const claimed = await reviewedState(q);
  assert.equal(claimed.quest.stage, 3);
  assert.ok(claimed.heroes[0].attachments.some((a) => a.code === "02014"));
  await shot(q, "gollum-on-the-trail");
  await q.reload();
  await q
    .getByRole("button", { name: "Continue adventure", exact: true })
    .click();
  assert.deepEqual(await reviewedState(q), claimed);
  reports.push(
    "successful quest, Clue response before stage advance, stage-three face and reload",
  );
  await q.context().close();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify({ reports, errors }, null, 2),
  );
  console.log(JSON.stringify({ reports, errors }, null, 2));
} finally {
  await browser.close();
}
