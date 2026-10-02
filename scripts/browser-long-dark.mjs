import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS, card } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import {
  LONG_DARK as L,
  LONG_DARK_PASS,
} from "../src/game/long-dark-support.ts";
import { questFace } from "../src/ui/tabletop.tsx";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/long-dark";
await fs.mkdir(dir, { recursive: true });
function fixture() {
  let s = createGame(
    67,
    STARTERS[0].cards,
    STARTERS[0].heroes,
    STARTERS[0].id,
    { scenarioId: "the-long-dark" },
  );
  for (let i = 0; i < 100 && (s.choice || s.phase === "setup"); i++)
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
  assert.equal(s.status, "playing");
  Object.assign(s, {
    phase: "planning",
    stage: 1,
    stageRevealing: false,
    progress: 0,
    victory: 0,
    victoryCards: [],
    queue: [],
    choice: null,
    staging: [],
    engaged: [],
    allies: [],
    hand: [],
    activeLocation: null,
    extraActiveLocations: [],
    lastReveal: null,
    encounterDiscard: [],
    longDark: { adderDamagedIds: [] },
    used: [],
    committedIds: [],
  });
  s.heroes.forEach((h) =>
    Object.assign(h, {
      resources: 10,
      damage: 0,
      attachments: [],
      exhausted: false,
      committed: false,
    }),
  );
  s.hand = [make(s, "01023"), make(s, "01022")];
  return s;
}
const east = fixture();
east.phase = "staging";
east.progress = 13;
east.encounterDeck = [L.spider, L.mine];
const air = fixture();
air.encounterDeck = [L.air, L.spider];
for (const s of [east, air]) assert.ok(validateSave(s));
assert.ok(LONG_DARK_PASS.includes(L.mine));
assert.equal(card(L.mine).corner_text, "PASS");
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
    const r = await p.getByRole("dialog").last().boundingBox();
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
    await load(p, east);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    let s = await saved(p);
    assert.equal(s.stage, 2);
    assert.match(s.choice.title, /Continuing Eastward.*Locate/);
    assert.match(
      await p.getByRole("dialog").innerText(),
      /PASS succeeds; otherwise try again or fail/,
    );
    await capture(p, `continuing-east-locate-${width}`, height);
    await choose(p, east.hand[0].id);
    s = await saved(p);
    assert.ok(s.encounterDiscard.includes(L.spider));
    assert.ok(s.discard.includes("01023"));
    assert.equal(s.longDark.locate.source, "Continuing Eastward");
    await reload(p);
    await capture(p, `locate-retry-after-reload-${width}`, height);
    await choose(p, east.hand[1].id);
    s = await saved(p);
    assert.equal(s.longDark.locate, undefined);
    assert.equal(s.stageRevealing, false);
    assert.equal(s.staging.length, 0);
    assert.equal(s.victory, 0);
    assert.ok(s.encounterDiscard.includes(L.mine));
    assert.ok(s.discard.includes("01022"));
    assert.equal(
      await p.locator(".quest-card-stack img").getAttribute("src"),
      questFace(s),
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
        name: /Browse encounter discard/,
      })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Abandoned Mine/ })
      .click();
    assert.match(
      await p
        .getByRole("dialog", { name: "Abandoned Mine", exact: true })
        .innerText(),
      /Printed corner: PASS/,
    );
    assert.match(
      await p
        .getByRole("dialog", { name: "Abandoned Mine", exact: true })
        .innerText(),
      /Card #/,
    );
    assert.doesNotMatch(
      await p
        .getByRole("dialog", { name: "Abandoned Mine", exact: true })
        .innerText(),
      /Card #octgn:/,
    );
    await capture(p, `locate-pass-printing-${width}`, height);
    await p.keyboard.press("Escape");
    await load(p, air);
    await p.getByRole("button", { name: "Begin quest", exact: true }).click();
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.match(s.choice.title, /Foul Air.*Locate/);
    await capture(p, `foul-air-explicit-failure-${width}`, height);
    await choose(p, "fail");
    s = await saved(p);
    assert.equal(s.hand.length, 2);
    assert.ok(s.heroes.every((h) => h.damage === 2));
    assert.equal(s.longDark.locate, undefined);
    await reload(p);
    s = await saved(p);
    assert.ok(s.heroes.every((h) => h.damage === 2));
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Long Dark UI passed: real stage advance and first-player Locate, non-PASS retry and physical hand identity through reload, PASS discard without reveal/VP, stage-two printed reverse, Foul Air explicit fail and saved damage at 1280/390/320.",
  );
} finally {
  await browser.close();
}
