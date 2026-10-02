import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import { resolveReveal } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { ROAD as R } from "../src/game/road-rivendell.ts";
import { REDHORN as H } from "../src/game/redhorn-gate.ts";
import { questFace } from "../src/ui/tabletop.tsx";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5201";
const dir = "output/dwarrowdelf-scenarios";
await fs.mkdir(dir, { recursive: true });
function fixture(scenarioId) {
  const deck = STARTERS[0];
  let s = createGame(1, deck.cards, deck.heroes, deck.id, { scenarioId });
  for (let i = 0; i < 100 && (s.choice || s.phase === "setup"); i++) {
    s = applyAction(
      s,
      s.choice
        ? {
            type: "CHOOSE",
            id:
              s.choice.options.find((o) => o.id === "skip")?.id ??
              s.choice.options[0].id,
          }
        : { type: "KEEP" },
    );
  }
  assert.equal(s.status, "playing");
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    hand: [],
    engaged: [],
    activeLocation: null,
    progress: 0,
    lastReveal: null,
    threat: 40,
  });
  s.heroes.forEach((h) => {
    h.resources = 10;
    h.exhausted = false;
    h.committed = false;
    h.damage = 0;
    h.attachments = [];
  });
  s.allies.forEach((a) => {
    a.exhausted = false;
    a.committed = false;
    a.damage = 0;
  });
  return s;
}
const immediate = fixture("road-to-rivendell");
immediate.phase = "staging";
immediate.activeLocation = make(immediate, R.gate);
immediate.heroes[0].code = "04001";
immediate.roadRivendell = {};
immediate.encounterDeck = [R.gate, R.gate];
resolveReveal(immediate, "01089");
flush(immediate);
let roadAttack = immediate;
if (roadAttack.choice?.options.some((o) => o.id === "resolve"))
  roadAttack = applyAction(roadAttack, { type: "CHOOSE", id: "resolve" });
assert.match(roadAttack.choice.title, /Immediate attack/);

const redhorn = fixture("redhorn-gate");
redhorn.phase = "quest";
redhorn.encounterDeck = [H.stair];
const final = fixture("road-to-rivendell");
final.stage = 3;
final.heroes[2].code = "01012";
final.heroes[2].damage = 1;
final.hand = [make(final, "01063")];
const redhornFinal = structuredClone(redhorn);
redhornFinal.phase = "planning";
redhornFinal.stage = 3;
redhornFinal.victory = 3;
for (const s of [roadAttack, redhorn, final, redhornFinal])
  assert.ok(validateSave(s));

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
    option = s.choice.options.find((o) => o.id === id);
  assert.ok(option, `Missing ${id}: ${JSON.stringify(s.choice)}`);
  await p
    .getByRole("dialog")
    .getByRole("button", { name: option.label, exact: true })
    .click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  await p.waitForFunction(
    () =>
      [
        ...(
          document.querySelector("dialog[open]") ?? document
        ).querySelectorAll("img"),
      ].every((img) => {
        const r = img.getBoundingClientRect();
        return r.bottom < 0 || r.top > innerHeight || img.complete;
      }),
    null,
    { timeout: 25000 },
  );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name} width`,
  );
  const dialog = p.getByRole("dialog");
  if (await dialog.count()) {
    const r = await dialog.boundingBox();
    assert.ok(r.y >= 0 && r.y + r.height <= height + 1, `${name} dialog fits`);
  }
  await p.screenshot({ path: `${dir}/${name}.png` });
}
async function printedReverse(p, s, name, height) {
  assert.equal(
    await p.locator(".quest-card-stack img").getAttribute("src"),
    questFace(s),
  );
  await p.locator(".quest-card-stack").click();
  await p
    .getByRole("button", { name: "Read printed quest", exact: true })
    .click();
  await p.getByRole("button", { name: "Show reverse", exact: true }).click();
  assert.equal(
    await p.getByRole("button", { name: "Show front", exact: true }).count(),
    1,
  );
  await capture(p, name, height);
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
    await load(p, roadAttack);
    await capture(p, `road-immediate-defense-${width}`, height);
    await choose(p, roadAttack.heroes[0].id);
    let game = await saved(p);
    assert.equal(game.combat.immediate, true);
    assert.equal(game.combat.immediatePreviousAttacked, false);
    const firstId = game.roadRivendell.gateEnemyId;
    const round = game.roadRivendell.gateSeenRound;
    await capture(p, `road-defender-response-${width}`, height);
    await reload(p);
    game = await saved(p);
    assert.equal(game.combat.immediate, true);
    assert.equal(game.roadRivendell.gateEnemyId, firstId);
    assert.equal(game.roadRivendell.gateSeenRound, round);
    await choose(p, "skip");
    game = await saved(p);
    assert.equal(game.phase, "staging");
    assert.equal(game.combat, null);
    assert.equal(
      game.engaged[0].attacked,
      false,
      "immediate attack preserves the ordinary attack",
    );
    assert.equal(game.engaged[0].shadows.length, 0);
    assert.equal(game.roadRivendell.gateEnemyId, firstId);
    assert.ok(game.encounterDiscard.includes(R.gate));
    await reload(p);
    assert.equal((await saved(p)).roadRivendell.gateEnemyId, firstId);
    await load(p, final);
    assert.match(await p.locator(".quest-goals").innerText(), /healing|heal/i);
    assert.equal(
      (await reviewedState(p)).hand[0].playable,
      false,
      "final Road stage prohibits healing",
    );
    assert.equal(
      await p.locator(".hand-play:not(.hand-ability)").count(),
      0,
      "unavailable healing exposes no play control",
    );
    await printedReverse(p, final, `road-quest-reverse-${width}`, height);
    await load(p, redhorn);
    await p
      .getByRole("button", { name: "Commit Arwen Undómiel", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .click();
    let state = await reviewedState(p);
    assert.match(state.choice.title, /Arwen/);
    await capture(p, `redhorn-arwen-resource-${width}`, height);
    await choose(p, redhorn.heroes[0].id);
    state = await reload(p);
    assert.equal(state.heroes[0].resources, 11);
    assert.equal(state.allies.find((a) => a.code === H.arwen).exhausted, true);
    await load(p, redhornFinal);
    assert.match(
      await p.locator(".quest-goals").innerText(),
      /5.*victory|victory.*5/i,
    );
    await printedReverse(
      p,
      redhornFinal,
      `redhorn-quest-reverse-${width}`,
      height,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Redhorn/Road UI passed: Arwen commitment/resource/save, Goblin Gate first-reveal identity, pending immediate combat save/ordinary attack restoration, final-stage healing/goals, printed quest reverses and 1280/390/320 layouts.",
  );
} finally {
  await browser.close();
}
