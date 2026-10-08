import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as baseFixture } from "../tests/against-shadow-final-fixtures.ts";
import { make, fx } from "../src/game/core.ts";
import { progress } from "../src/game/board.ts";
import { handle, flush } from "../src/game/effects.ts";
import { applyAction, validateSave } from "../src/game/engine.ts";
import { currentQuestProgress } from "../src/game/quest-state.ts";
import {
  forOwner,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/side-quests";
await fs.mkdir(dir, { recursive: true });
const G = "09014";
function side(s, owner = 0) {
  const u = make(s, G);
  u.owner = owner;
  u.controller = owner;
  s.staging.push(u);
  return u;
}
const playFixture = baseFixture("mirkwood");
playFixture.hand = [make(playFixture, G)];
const selection = baseFixture("mirkwood", 2);
selection.table.first = 1;
const selectionSide = side(selection, 1);
handle(selection, fx("startQuest"));
flush(selection);
const resolution = baseFixture("mirkwood");
const resolutionSide = side(resolution);
handle(resolution, fx("startQuest"));
flush(resolution);
let resolving = applyAction(resolution, {
  type: "CHOOSE",
  id: resolutionSide.id,
});
resolving.phase = "staging";
resolving.heroes[0].committed = true;
resolving.heroes[0].tempWill = 8;
resolving.activeLocation = make(resolving, "01099");
resolving.progress = 2;
resolving.deck = ["01013", "01014", "01013"];
const response = baseFixture("mirkwood", 2);
const responseSide = side(response);
handle(response, fx("startQuest"));
flush(response);
let searching = applyAction(response, { type: "CHOOSE", id: responseSide.id });
for (const player of playerOrder(searching))
  forOwner(searching, player, () => {
    searching.deck = ["01013", "01014", "01013"];
    searching.hand = [];
  });
progress(searching, 4);
flush(searching);
for (const [name, s] of Object.entries({
  playFixture,
  selection,
  resolving,
  searching,
})) {
  syncSeat(s);
  assert.ok(validateSave(s), name);
}
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [];
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
async function resume(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function load(p, s) {
  await p.evaluate((state) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(state));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  return resume(p);
}
async function choose(p, id) {
  const s = await reviewedState(p);
  const option = s.choice?.options.find((o) => o.id === id);
  assert.ok(option, JSON.stringify(s.choice));
  const index = s.choice.options.findIndex((o) => o.id === id);
  const occurrence = s.choice.options
    .slice(0, index)
    .filter((o) => o.label === option.label).length;
  await p
    .getByRole("dialog")
    .getByRole("button", { name: option.label, exact: true })
    .nth(occurrence)
    .click();
  return reviewedState(p);
}
async function startPlay(p, code, target, cost) {
  await p
    .locator(
      `.hand-card:has(img[data-card-code="${code}"]) .hand-play:not(.hand-ability)`,
    )
    .click();
  if (target)
    await p
      .locator(`.target-selection [data-unit-id="${target}"] .decision-select`)
      .click();
  if (cost !== undefined)
    assert.match(
      await p.locator(".payment-heading").innerText(),
      new RegExp(`Pay ${cost} resources`),
    );
}
async function finishPlay(p) {
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  return reviewedState(p);
}
async function play(p, code, target, cost) {
  await startPlay(p, code, target, cost);
  return finishPlay(p);
}
async function capture(p, name, height) {
  await p.evaluate(async () => {
    await Promise.all(
      [...document.images]
        .filter((i) => {
          const r = i.getBoundingClientRect();
          return r.width && r.height && r.bottom > 0 && r.top < innerHeight;
        })
        .map(async (i) => {
          i.loading = "eager";
          await i.decode();
        }),
    );
  });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: overflow`,
  );
  const dialog = p.locator("dialog[open]");
  if (await dialog.count()) {
    const r = await dialog.last().boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= height + 1,
      `${name}: clipped dialog`,
    );
  }
  const path = `${dir}/${name}.png`;
  await p.screenshot({ path });
  screenshots.push(path);
}

try {
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [320, 750],
  ]) {
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
    await load(p, playFixture);
    await startPlay(p, G);
    await capture(p, `play-confirmation-${width}`, height);
    await finishPlay(p);
    let s = await saved(p);
    assert.ok(s.staging.some((u) => u.code === G));
    await p.getByRole("button", { name: "Begin quest", exact: true }).click();
    await reviewedState(p);
    await capture(p, `quest-selection-${width}`, height);
    s = await saved(p);
    const id = s.staging.find((u) => u.code === G).id;
    await choose(p, id);
    await resume(p);
    await p.locator(".journey-area").scrollIntoViewIfNeeded();
    await capture(p, `selected-side-quest-${width}`, height);
    assert.match(await p.locator(".tabletop-progress").innerText(), /0 \/ 4/);
    await p
      .getByRole("button", { name: "Inspect main quest", exact: true })
      .click();
    await capture(p, `main-quest-inspection-${width}`, height);
    await load(p, selection);
    assert.equal((await saved(p)).table.active, 1);
    await choose(p, selectionSide.id);
    await resume(p);
    assert.equal(
      (await saved(p)).sideQuestSelections.shared.id,
      selectionSide.id,
    );
    await load(p, resolving);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    await capture(p, `defeated-side-quest-${width}`, height);
    s = await saved(p);
    assert.equal(s.activeLocation, null);
    assert.ok(s.victoryCards.includes(G));
    assert.equal(s.progress, 2);
    assert.equal(s.stage, 1);
    assert.equal(currentQuestProgress(s), 4);
    await resume(p);
    await choose(p, "search");
    await capture(p, `search-deck-${width}`, height);
    await choose(p, "card-1");
    s = await saved(p);
    assert.equal(s.progress, 2);
    assert.ok(s.hand.some((u) => u.code === "01014"));
    assert.equal(s.phase, "travel");
    assert.equal(s.sideQuestSelections, undefined);
    await capture(p, `main-quest-restored-${width}`, height);
    await load(p, searching);
    await choose(p, "search");
    await choose(p, "card-2");
    await resume(p);
    s = await saved(p);
    assert.equal(s.table.active, 1);
    await capture(p, `second-player-search-${width}`, height);
    await choose(p, "skip");
    s = await saved(p);
    assert.equal(seatView(s, 0).hand[0].code, "01013");
    assert.equal(seatView(s, 1).hand.length, 0);
    const art = await p.evaluate(async () => {
      const i = new Image();
      i.src = "/cards/09014.jpg";
      await i.decode();
      return i.naturalWidth;
    });
    assert.ok(art > 200);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ screenshots, errors }, null, 2),
  );
  console.log(
    `Gather Information: ${screenshots.length} responsive checkpoints; play, first-player choice, main quest inspection, real quest resolution, active location, overflow, per-player search/decline and saved choices.`,
  );
} finally {
  await browser.close();
}
