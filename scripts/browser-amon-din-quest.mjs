import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as act } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import { placeEncounter } from "../src/game/board.ts";
import { syncSeat } from "../src/game/table.ts";
import { AMON_DIN as A } from "../src/game/amon-din-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/playwright/amon-din-quest";
await fs.mkdir(dir, { recursive: true });
function fixture() {
  const d = STARTERS.find((d) => d.id === "spirit");
  let s = createGame(2, d.cards, d.heroes, d.id, {
    scenarioId: "encounter-at-amon-din",
  });
  while (s.phase === "setup") {
    if (s.choice)
      s = act(s, {
        type: "CHOOSE",
        id:
          s.choice.options.find((o) => o.id === "skip")?.id ??
          s.choice.options[0].id,
      });
    else s = act(s, { type: "KEEP" });
  }
  Object.assign(s, {
    phase: "quest",
    queue: [],
    choice: null,
    staging: [],
    engaged: [],
    hand: [],
    activeLocation: null,
    extraActiveLocations: [],
    lastReveal: null,
    encounterDeck: [],
    encounterDiscard: [],
    allies: [],
    used: [],
    committedIds: [],
    stage: 1,
    progress: 0,
    victory: 0,
    victoryCards: [],
    amonDin: { questVillagers: 5, ghulatSetAside: true },
  });
  for (const h of s.heroes)
    Object.assign(h, {
      resources: 8,
      damage: 0,
      exhausted: false,
      committed: false,
      attachments: [],
    });
  s.threat = 20;
  placeEncounter(s, A.rescued);
  placeEncounter(s, A.dead);
  s.allies.push(make(s, A.alcaron));
  return s;
}
function active(s) {
  placeEncounter(s, A.burning);
  const l = s.staging.find((u) => u.code === A.burning);
  s.staging = s.staging.filter((u) => u.id !== l.id);
  s.activeLocation = l;
  return l;
}
const alcaron = fixture();
active(alcaron);
alcaron.encounterDeck = [A.ravager];
const progress = fixture();
active(progress).progress = 4;
progress.amonDin.questVillagers = 3;
progress.encounterDeck = [A.burning];
const undefended = fixture();
undefended.phase = "defense";
undefended.stage = 2;
undefended.amonDin = { questVillagers: 0, ghulatSetAside: false };
undefended.staging.find((u) => u.code === A.rescued).resources = 2;
undefended.staging.find((u) => u.code === A.dead).damage = 1;
undefended.allies[0].exhausted = true;
undefended.engaged = [make(undefended, A.ravager)];
const victory = fixture();
victory.phase = "attack";
victory.stage = 2;
victory.amonDin = { questVillagers: 0, ghulatSetAside: false };
victory.progress = 15;
victory.staging.find((u) => u.code === A.rescued).resources = 5;
victory.staging.find((u) => u.code === A.dead).damage = 2;
victory.engaged = [make(victory, A.ghulat)];
victory.heroes.find((h) => h.code === "01009").tempAttack = 12;
for (const s of [alcaron, progress, undefended, victory]) {
  syncSeat(s);
  assert.ok(validateSave(s));
}
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
  const s = await reviewedState(p),
    index = s.choice.options.findIndex((o) => o.id === id);
  assert.ok(index >= 0, `Missing choice ${id}: ${JSON.stringify(s.choice)}`);
  await p
    .getByRole("dialog")
    .locator(".choice-list .decision-select")
    .nth(index)
    .click();
  return reviewedState(p);
}
const board = (p, title) =>
  p.locator(".board-card").filter({
    has: p.getByRole("button", { name: `Inspect ${title}`, exact: true }),
  });
async function capture(p, title, height) {
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
    `${title}: horizontal overflow`,
  );
  if (await p.getByRole("dialog").count()) {
    const r = await p.getByRole("dialog").boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= height + 1,
      `${title}: clipped dialog`,
    );
  }
  const path = `${dir}/${title}.jpg`;
  await p.screenshot({ path, type: "jpeg", quality: 45 });
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
    await load(p, alcaron);
    await capture(p, `villagers-table-${width}`, height);
    assert.equal(
      await p.getByLabel("4 villagers to rescue", { exact: true }).count(),
      1,
    );
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .click();
    let s = await reviewedState(p);
    assert.match(s.choice.title, /Alcaron/);
    await capture(p, `alcaron-location-choice-${width}`, height);
    await reload(p);
    await choose(p, alcaron.activeLocation.id);
    s = await saved(p);
    assert.equal(s.activeLocation.resources, 4);
    assert.equal(s.allies.find((u) => u.code === A.alcaron).exhausted, true);
    assert.equal(s.staging.find((u) => u.code === A.dead).damage, 0);
    await capture(p, `alcaron-saved-villager-${width}`, height);
    await load(p, progress);
    for (const title of ["Éowyn", "Dúnhere", "Eleanor"]) {
      await p
        .getByRole("button", { name: `Commit ${title}`, exact: true })
        .click();
      await reviewedState(p);
    }
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .click();
    await reviewedState(p);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.stage, 2);
    assert.equal(s.progress, 0);
    assert.equal(s.amonDin.questVillagers, 0);
    assert.equal(s.staging.find((u) => u.code === A.rescued).resources, 7);
    assert.ok(s.staging.some((u) => u.code === A.ghulat));
    await reload(p);
    await capture(p, `stage-two-ghulat-${width}`, height);
    await load(p, undefended);
    await board(p, "Orc Ravager")
      .getByRole("button", { name: "Defend", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Leave undefended/ })
      .click();
    await capture(p, `undefended-villagers-explanation-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.staging.find((u) => u.code === A.rescued).resources, 0);
    assert.equal(s.staging.find((u) => u.code === A.dead).damage, 3);
    assert.ok(s.heroes.every((h) => h.damage === 0));
    await reload(p);
    await capture(p, `undefended-villager-loss-${width}`, height);
    await load(p, victory);
    await board(p, "Ghulat")
      .getByRole("button", { name: "Attack", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Dúnhere", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /^Attack ·/ })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.status, "won");
    assert.match(s.reason, /5.*2/);
    await capture(p, `villagers-rescued-victory-${width}`, height);
    await reload(p);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      { viewports: [1280, 390, 320], flows: 12, screenshots, errors },
      null,
      2,
    ),
  );
  console.log(
    "Amon Dîn browser passed: villagers, Alcaron response, progress/advance, undefended replacement and victory with reload at1280/390/320.",
  );
} finally {
  await browser.close();
}
