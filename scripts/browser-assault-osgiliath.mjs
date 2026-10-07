import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as act } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import { ASSAULT_OSGILIATH as A } from "../src/game/assault-osgiliath-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/assault-osgiliath";
await fs.mkdir(dir, { recursive: true });
const starter = STARTERS.find((d) => d.id === "leadership");
const initial = () =>
  createGame(913, starter.cards, starter.heroes, starter.id, {
    scenarioId: "assault-on-osgiliath",
  });
function fixture() {
  let s = initial();
  for (let i = 0; i < 10 && s.phase === "setup"; i++) {
    s = s.choice
      ? act(s, {
          type: "CHOOSE",
          id: (
            s.choice.options.find((o) => o.code === A.soldier) ??
            s.choice.options[0]
          ).id,
        })
      : act(s, { type: "KEEP" });
  }
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(20).fill("01099"),
    encounterDiscard: [],
    assaultOsgiliath: { controlled: [], archeryBonus: 0 },
  });
  s.hand = [];
  s.engaged = [];
  s.allies = [];
  s.heroes.forEach((h) =>
    Object.assign(h, {
      resources: 8,
      exhausted: false,
      attachments: [],
      damage: 0,
    }),
  );
  return s;
}
const bridge = fixture();
bridge.staging = [make(bridge, A.bridge), make(bridge, A.harbor)];
bridge.staging[0].progress = 5;
const tower = fixture();
tower.phase = "travel";
tower.activeLocation = make(tower, A.east);
tower.staging = [make(tower, A.tower)];
for (const s of [initial(), bridge, tower]) assert.ok(validateSave(s));
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [];
async function saved(p) {
  return p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
}
async function load(p, s) {
  await p.evaluate((game) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(game));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function reload(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function choose(p, id) {
  const state = await reviewedState(p);
  const index = state.choice.options.findIndex((o) => o.id === id);
  assert.ok(index >= 0, `${id}: ${JSON.stringify(state.choice)}`);
  await p
    .getByRole("dialog")
    .locator(".choice-list .decision-select")
    .nth(index)
    .click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  await p.waitForFunction(
    () =>
      [...document.images].every((img) => {
        const r = img.getBoundingClientRect();
        return (
          !r.width ||
          !r.height ||
          r.bottom < 0 ||
          r.top > innerHeight ||
          r.right < 0 ||
          r.left > innerWidth ||
          img.complete
        );
      }),
    null,
    { timeout: 55000 },
  );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: overflow`,
  );
  if (await p.getByRole("dialog").count()) {
    const r = await p.getByRole("dialog").boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= height + 1,
      `${name}: clipped dialog`,
    );
  }
  if (name.startsWith("controlled-location")) {
    const zone = p.getByLabel("Controlled Osgiliath locations");
    const bounds = await zone.boundingBox();
    const owner = await zone.locator(".engaged-owner").boundingBox();
    assert.ok(
      owner &&
        bounds &&
        owner.y >= bounds.y &&
        owner.y + owner.height <= bounds.y + bounds.height + 1,
      `${name}: controller label is clipped by the controlled-location zone`,
    );
  }
  const path = `${dir}/${name}.png`;
  await p.screenshot({ path });
  screenshots.push(path);
}
const board = (p, title) =>
  p.locator(".board-card").filter({
    has: p.getByRole("button", { name: `Inspect ${title}`, exact: true }),
  });
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
    let state = await load(p, initial());
    assert.match(state.choice.title, /Choose an enemy/);
    await capture(p, `setup-enemy-${width}`, height);
    await choose(
      p,
      (await saved(p)).choice.options.find((o) => o.code === A.soldier).id,
    );
    state = await reload(p);
    assert.match(state.choice.title, /unique location/);
    await capture(p, `setup-location-${width}`, height);
    await choose(
      p,
      (await saved(p)).choice.options.find((o) => o.code === A.gate).id,
    );
    assert.equal((await saved(p)).staging.length, 2);
    await load(p, bridge);
    await p
      .getByRole("button", {
        name: "The Old Bridge · Spend resources for 1 progress",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await capture(p, `bridge-payment-${width}`, height);
    await reload(p);
    await choose(p, bridge.heroes[0].id);
    let game = await saved(p);
    assert.equal(game.assaultOsgiliath.controlled[0].id, bridge.staging[0].id);
    assert.equal(game.assaultOsgiliath.controlled[0].owner, 0);
    assert.equal(game.assaultOsgiliath.controlled[0].progress, 0);
    await reload(p);
    await p
      .getByLabel("Controlled Osgiliath locations")
      .scrollIntoViewIfNeeded();
    assert.ok(
      await p
        .getByLabel("Controlled Osgiliath locations")
        .getByText("Your fellowship", { exact: true })
        .isVisible(),
    );
    await capture(p, `controlled-location-${width}`, height);
    await load(p, tower);
    await board(p, "Ruined Tower")
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(p);
    await capture(p, `tower-exhaustion-${width}`, height);
    await reload(p);
    await choose(p, tower.heroes[0].id);
    game = await saved(p);
    assert.equal(game.activeLocation.code, A.tower);
    assert.equal(game.extraActiveLocations[0].code, A.east);
    assert.equal(game.heroes[0].exhausted, true);
    await reload(p);
    await capture(p, `two-active-locations-${width}`, height);
    await context.close();
  }
  assert.deepEqual(errors, []);
  const report = { viewports: [1280, 390, 320], flows: 9, screenshots, errors };
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
