import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { card, STARTERS } from "../src/game/cards.ts";
import { applyAction, createGame, validateSave } from "../src/game/engine.ts";
import { revealed } from "../src/game/board.ts";
import { make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import {
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import { DRUADAN_FOREST as D } from "../src/game/druadan-forest-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178",
  dir = "output/druadan-forest";
await fs.mkdir(dir, { recursive: true });
function settle(s) {
  for (let i = 0; i < 200; i++) {
    if (s.choice)
      s = applyAction(s, {
        type: "CHOOSE",
        id:
          s.choice.options.find((o) =>
            ["skip", "resolve", "damage", "remove", "discard"].includes(o.id),
          )?.id ?? s.choice.options[0].id,
      });
    else if (s.phase === "setup") s = applyAction(s, { type: "KEEP" });
    else if (s.phase === "resource") s = applyAction(s, { type: "NEXT" });
    else return s;
  }
  throw Error("setup did not settle");
}
function fixture(sphere = "leadership", players = 1) {
  const d = STARTERS.find((d) => d.id === sphere);
  const s = settle(
    createGame(731, d.cards, d.heroes, d.id, {
      scenarioId: "the-druadan-forest",
      ...(players > 1
        ? {
            seats: [
              { deckId: d.id, heroes: d.heroes },
              {
                deckId: "tactics",
                heroes: STARTERS.find((d) => d.id === "tactics").heroes,
              },
            ],
          }
        : {}),
    }),
  );
  Object.assign(s, {
    phase: "planning",
    stage: 1,
    stageRevealing: false,
    progress: 0,
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(20).fill("01099"),
    encounterDiscard: [],
    victoryCards: [],
    druadanForest: { bossSetAside: D.boss },
    lastReveal: null,
  });
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      Object.assign(s, {
        threat: 20,
        allies: [],
        engaged: [],
        hand: [],
        used: [],
        committedIds: [],
      });
      for (const h of s.heroes)
        Object.assign(h, {
          exhausted: false,
          committed: false,
          damage: 0,
          resources: 1,
          attachments: [],
        });
    });
  selectSeat(s, 0);
  syncSeat(s);
  return s;
}
const prowl = fixture("leadership", 2);
prowl.phase = "staging";
revealed(prowl, D.elite);
flush(prowl);
syncSeat(prowl);
const h0 = seatView(prowl, 0).heroes[0].id,
  h1 = seatView(prowl, 1).heroes[0].id;
const passage = fixture("spirit", 2);
passage.phase = "attack";
passage.stage = 3;
passage.progress = 8;
delete passage.druadanForest.bossSetAside;
const boss = make(passage, D.boss);
boss.progress = 2;
passage.engaged.push(boss);
passage.heroes[0].tempWill = 1;
passage.heroes[0].tempAttack = 30;
const rangedFinisher = seatView(passage, 1).heroes.find(
  (h) => h.code === "01005",
);
rangedFinisher.tempWill = 4;
syncSeat(passage);
for (const s of [prowl, passage]) assert.ok(validateSave(s));
const errors = [],
  screenshots = [],
  browser = await chromium.launch({ headless: true });
async function saved(p) {
  return p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
}
async function load(p, s) {
  await p.evaluate((s) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(s));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function reload(p) {
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function choose(p, id) {
  const s = await reviewedState(p),
    index = s.choice.options.findIndex((o) => o.id === id);
  assert.ok(index >= 0, JSON.stringify(s.choice));
  await p
    .getByRole("dialog")
    .locator(".choice-list .decision-select")
    .nth(index)
    .click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: horizontal overflow`,
  );
  if (await p.getByRole("dialog").count()) {
    const r = await p.getByRole("dialog").boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= height + 1,
      `${name}: dialog clipped`,
    );
  }
  await p.screenshot({ path: `${dir}/${name}.png` });
  screenshots.push(`${dir}/${name}.png`);
}
const board = (p, title) =>
  p.locator(".board-card").filter({
    has: p.getByRole("button", { name: `Inspect ${title}`, exact: true }),
  });
async function attack(p, hero) {
  const state = await reviewedState(p);
  assert.equal(state.phase, "attack", JSON.stringify(state));
  await board(p, card(D.boss).name)
    .getByRole("button", { name: /^(Attack|Ranged ·)/ })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: hero, exact: true })
    .click();
  return p.getByRole("dialog").getByRole("button", { name: /^Attack ·/ });
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
      }),
      p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(url, { waitUntil: "domcontentloaded" });
    let view = await load(p, prowl);
    assert.match(view.choice.title, /Prowl.*2/);
    await capture(p, `${width}-prowl-group`, height);
    await choose(p, h0);
    view = await reload(p);
    assert.match(view.choice.title, /Prowl.*1/);
    let game = await saved(p);
    assert.equal(game.table.seats[0].heroes[0].resources, 0);
    await choose(p, h1);
    game = await saved(p);
    assert.equal(game.table.seats[1].heroes[0].resources, 0);
    assert.ok(game.staging.some((u) => u.code === D.elite));
    await capture(p, `${width}-prowl-resolved`, height);
    await load(p, passage);
    let button = await attack(p, card(passage.heroes[0].code).name);
    assert.match(await button.innerText(), /willpower|progress|5/);
    await capture(p, `${width}-willpower-attack`, height);
    await button.click();
    await reviewedState(p);
    game = await saved(p);
    assert.equal(game.engaged.find((u) => u.code === D.boss).progress, 4);
    assert.equal(game.engaged.find((u) => u.code === D.boss).damage, 0);
    assert.equal(game.progress, 8);
    await reload(p);
    await p
      .getByRole("button", { name: "Finish attacks", exact: true })
      .click();
    view = await reviewedState(p);
    assert.equal(view.table.active, 1);
    button = await attack(p, card(rangedFinisher.code).name);
    await button.click();
    await reviewedState(p);
    game = await saved(p);
    assert.equal(game.status, "won");
    assert.match(game.reason, /peaceful intentions/);
    await p
      .getByRole("dialog", { name: "Beyond the shadow" })
      .getByText(/peaceful intentions/)
      .waitFor();
    assert.ok(
      !(await p.locator("body").innerText()).includes("escaped Dol Guldur"),
    );
    assert.ok(game.victoryCards.includes(D.boss));
    assert.equal(game.progress, 14);
    assert.ok(
      !game.table.seats.some((seat) =>
        seat.engaged.some((u) => u.code === D.boss),
      ),
    );
    await capture(p, `${width}-peaceful-victory`, height);
    await context.close();
  }
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    url,
    verifiedAt: new Date().toISOString(),
    scenarios: [
      "Prowl shared resources across saved multiplayer choice",
      "Siege/willpower attacking with saved partial enemy progress and peaceful victory",
    ],
    viewports: [1280, 390, 320],
    screenshots,
    errors,
  };
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
