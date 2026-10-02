import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import { WATCHER_WATER as W } from "../src/game/watcher-water-support.ts";
import { selectSeat, syncSeat } from "../src/game/table.ts";
import { questFace } from "../src/ui/tabletop.tsx";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/watcher-water";
await fs.mkdir(dir, { recursive: true });
function fixture(players = 1) {
  let s;
  for (let seed = 1; seed < 50; seed++) {
    s = createGame(
      seed,
      STARTERS[0].cards,
      STARTERS[0].heroes,
      STARTERS[0].id,
      {
        scenarioId: "watcher-in-the-water",
        ...(players > 1
          ? {
              seats: STARTERS.slice(0, players).map((d) => ({
                deckId: d.id,
                heroes: d.heroes,
              })),
            }
          : {}),
      },
    );
    for (
      let i = 0;
      i < 100 && s.status === "playing" && (s.choice || s.phase === "setup");
      i++
    )
      s = applyAction(
        s,
        s.choice
          ? {
              type: "CHOOSE",
              id:
                s.choice.options.find((o) =>
                  ["skip", "done", "resolve"].includes(o.id),
                )?.id ?? s.choice.options[0].id,
            }
          : { type: "KEEP" },
      );
    if (s.status === "playing" && s.phase !== "setup") break;
  }
  assert.equal(s.status, "playing");
  for (let i = 0; i < players; i++) {
    if (s.table) selectSeat(s, i);
    s.heroes.forEach((h) =>
      Object.assign(h, {
        resources: 10,
        damage: 0,
        attachments: [],
        exhausted: false,
        committed: false,
      }),
    );
    Object.assign(s, { allies: [], hand: [], engaged: [], used: [] });
    if (s.table) syncSeat(s);
  }
  if (s.table) selectSeat(s, 0);
  Object.assign(s, {
    phase: "planning",
    stage: 2,
    progress: 0,
    victory: 0,
    victoryCards: [],
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    lastReveal: null,
    encounterDiscard: [],
    encounterDeck: ["01077"],
    watcherWater: { setAside: [], swampPlaced: {} },
  });
  return s;
}
const doors = fixture();
doors.activeLocation = make(doors, W.doors);
doors.staging = [make(doors, W.watcher)];
doors.hand = [make(doors, "01062")];
const rescue = fixture(2);
rescue.phase = "attack";
rescue.heroes[0].attachments.push({
  id: "wrapped-cross-seat",
  code: W.wrapped,
  exhausted: false,
});
const wrapped = rescue.heroes[0].id;
syncSeat(rescue);
selectSeat(rescue, 1);
const rescuer = rescue.heroes[0].id;
for (const s of [doors, rescue]) assert.ok(validateSave(s));
const browser = await chromium.launch({ headless: true }),
  errors = [];
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
    o = s.choice.options.find((o) => o.id === id);
  assert.ok(o, `Missing ${id}: ${JSON.stringify(s.choice)}`);
  await p
    .getByRole("dialog")
    .getByRole("button", { name: o.label, exact: true })
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
    await p.goto(base);
    await load(p, doors);
    assert.equal(
      await p.locator(".quest-card-stack img").getAttribute("src"),
      questFace(doors),
    );
    await p.locator(".quest-card-stack").click();
    await p
      .getByRole("button", { name: "Read printed quest", exact: true })
      .click();
    await p.getByRole("button", { name: "Show reverse", exact: true }).click();
    await capture(p, `stage2-printed-reverse-${width}`, height);
    await p.keyboard.press("Escape");
    await p
      .getByRole("button", {
        name: "Speak friend · discard cards to open Doors",
        exact: true,
      })
      .click();
    await capture(p, `doors-discard-${width}`, height);
    await choose(p, doors.hand[0].id);
    await reload(p);
    await choose(p, "done");
    let s = await saved(p);
    assert.equal(s.victory, 3);
    assert.ok(s.victoryCards.includes(W.doors));
    assert.equal(s.activeLocation, null);
    assert.ok(s.discard.includes("01062"));
    assert.ok(s.encounterDiscard.includes("01077"));
    assert.equal(
      await p
        .getByRole("button", {
          name: "Speak friend · discard cards to open Doors",
          exact: true,
        })
        .count(),
      0,
    );
    await load(p, rescue);
    await p
      .getByRole("button", {
        name: "Aragorn · Exhaust an unwrapped hero · rescue this hero",
        exact: true,
      })
      .click();
    await capture(p, `cross-seat-wrapped-rescue-${width}`, height);
    await reload(p);
    await choose(p, rescuer);
    s = await saved(p);
    assert.equal(
      s.table.seats[0].heroes.find((h) => h.id === wrapped).attachments.length,
      0,
    );
    assert.ok(s.table.seats[1].heroes.find((h) => h.id === rescuer).exhausted);
    assert.ok(s.encounterDiscard.includes(W.wrapped));
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Watcher UI passed: active Doors action, per-card discard and saved letter match/victory, cross-seat Wrapped rescue with another player's hero, printed stage2 reverse, and1280/390/320 layouts.",
  );
} finally {
  await browser.close();
}
