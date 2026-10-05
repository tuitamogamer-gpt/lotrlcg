import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS, SCRIPTED } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/osgiliath";
await fs.mkdir(dir, { recursive: true });
for (let n = 81; n <= 90; n++) assert.ok(SCRIPTED.has(`060${n}`));
function fixture(sphere) {
  const d = STARTERS.find((d) => d.id === sphere);
  let s = applyAction(createGame(853, d.cards, d.heroes, d.id), {
    type: "KEEP",
  });
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    engaged: [],
    hand: [],
    allies: [],
    activeLocation: null,
    extraActiveLocations: [],
    lastReveal: null,
    encounterDeck: [],
    encounterDiscard: [],
    used: [],
    threat: 20,
  });
  s.heroes.forEach((h) =>
    Object.assign(h, {
      resources: 10,
      damage: 0,
      exhausted: false,
      committed: false,
      attachments: [],
    }),
  );
  return s;
}
const men = fixture("leadership"),
  palantir = fixture("leadership"),
  map = fixture("spirit"),
  knight = fixture("tactics");
men.hand = [make(men, "06083")];
men.discard = ["06002", "01028", "06002", "06008"];
const palantirHero = palantir.heroes.find((h) => h.code === "01001");
palantirHero.attachments.push({
  id: "palantir-browser",
  code: "06090",
  exhausted: false,
  owner: 0,
});
palantir.encounterDeck = ["01082", "01099", "01093", "01089"];
palantir.deck = ["01020", "01021", "01022"];
const mapHero = map.heroes[0];
mapHero.attachments.push({
  id: "map-browser",
  code: "06087",
  exhausted: false,
  owner: 0,
});
map.discard = ["01046", "01046"];
map.deck = ["01020"];
knight.hand = [make(knight, "06084")];
knight.staging = [make(knight, "01096")];
knight.activeLocation = make(knight, "01099");
knight.activeLocation.attachments.push({
  id: "path-browser",
  code: "04103",
  exhausted: false,
  owner: 0,
});
for (const s of [men, palantir, map, knight]) assert.ok(validateSave(s));
const browser = await chromium.launch({ headless: true });
const errors = [];
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
  const s = await reviewedState(p),
    index = s.choice.options.findIndex((o) => o.id === id);
  assert.ok(index >= 0, `Missing ${id}: ${JSON.stringify(s.choice)}`);
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
          img.complete
        );
      }),
    null,
    { timeout: 25000 },
  );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name,
  );
  if (await p.getByRole("dialog").count()) {
    const r = await p.getByRole("dialog").boundingBox();
    assert.ok(r.y >= 0 && r.y + r.height <= height + 1, name);
  }
  await p.screenshot({ path: `${dir}/${name}.png` });
}
async function play(p) {
  await p.locator(".hand-play:not(.hand-ability)").click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  return reviewedState(p);
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

    await load(p, men);
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("spinbutton", { name: "Choose X", exact: true })
      .fill("2");
    await capture(p, `men-x-payment-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    assert.match((await reviewedState(p)).choice.title, /Men of the West/);
    await reload(p);
    await choose(p, "discard-2");
    await reload(p);
    await choose(p, "discard-0");
    let s = await saved(p);
    assert.equal(s.hand.filter((u) => u.code === "06002").length, 2);
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      28,
    );
    assert.deepEqual(
      s.discard.filter((code) => code !== "06083"),
      ["01028", "06008"],
    );

    await load(p, palantir);
    await p
      .getByRole("button", {
        name: "Exhaust Palantir and hero · name an encounter card type",
        exact: true,
      })
      .click();
    assert.equal((await saved(p)).peek, null);
    await capture(p, `palantir-name-before-look-${width}`, height);
    await reload(p);
    await choose(p, "enemy");
    assert.equal((await saved(p)).peek, "01082");
    await capture(p, `palantir-first-inspection-${width}`, height);
    await reload(p);
    await choose(p, "continue");
    assert.equal((await saved(p)).peek, "01099");
    await choose(p, "continue");
    assert.equal((await saved(p)).peek, "01093");
    await reload(p);
    await choose(p, "continue");
    s = await saved(p);
    assert.equal(s.peek, null);
    assert.deepEqual(s.encounterDeck, palantir.encounterDeck);
    assert.equal(s.threat, 24);
    assert.equal(s.hand.length, 1);
    assert.equal(
      s.heroes.find((h) => h.id === palantirHero.id).exhausted,
      true,
    );

    await load(p, map);
    await p
      .getByRole("button", {
        name: "Discard Map · play a Spirit event",
        exact: true,
      })
      .click();
    await choose(p, "discard-0");
    assert.match((await reviewedState(p)).choice.title, /Pay event cost/);
    await capture(p, `map-event-payment-${width}`, height);
    await reload(p);
    assert.ok(
      (await saved(p)).heroes
        .find((h) => h.id === mapHero.id)
        .attachments.some((a) => a.id === "map-browser"),
    );
    await choose(p, "pay-0");
    s = await saved(p);
    assert.equal(s.threat, 14);
    assert.equal(s.deck.at(-1), "01046");
    assert.equal(s.discard.filter((code) => code === "01046").length, 1);
    assert.ok(s.discard.includes("06087"));
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      27,
    );
    await reload(p);

    await load(p, knight);
    await play(p);
    assert.match(
      (await reviewedState(p)).choice.title,
      /Knight of Minas Tirith/,
    );
    await capture(p, `knight-optional-entry-${width}`, height);
    await reload(p);
    await choose(p, "skip");
    s = await saved(p);
    assert.equal(s.allies.find((u) => u.code === "06084").exhausted, false);
    assert.equal(s.engaged.length, 0);
    await load(p, knight);
    await play(p);
    await reload(p);
    await choose(p, knight.staging[0].id);
    s = await saved(p);
    assert.equal(s.allies.find((u) => u.code === "06084").exhausted, true);
    assert.equal(
      s.engaged.find((u) => u.id === knight.staging[0].id).damage,
      2,
    );
    await reload(p);
    await capture(p, `knight-forced-exhaust-attack-${width}`, height);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Osgiliath client passed: Men X=2 payment and duplicate discard choices, Palantir naming and preserved encounter order, Map paid replay and bottom placement, Knight optional entry and actual exhaustion under Path of Need, with save/reload at1280/390/320.",
  );
} finally {
  await browser.close();
}
