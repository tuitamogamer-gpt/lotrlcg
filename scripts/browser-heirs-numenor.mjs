import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS, card } from "../src/game/cards.ts";
import { createGame, applyAction, validateSave } from "../src/game/engine.ts";
import { make, fx, get } from "../src/game/core.ts";
import { handle, flush } from "../src/game/effects.ts";
import {
  forOwner,
  playerOrder,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import { HEIRS_NUMENOR as H } from "../src/game/heirs-numenor-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/heirs-numenor";
await fs.mkdir(dir, { recursive: true });
function settle(s) {
  for (let i = 0; i < 200; i++) {
    if (s.choice)
      s = applyAction(s, {
        type: "CHOOSE",
        id:
          s.choice.options.find((o) => o.id === "skip")?.id ??
          s.choice.options[0].id,
      });
    else if (s.phase === "setup") s = applyAction(s, { type: "KEEP" });
    else if (s.phase === "resource") s = applyAction(s, { type: "NEXT" });
    else return s;
  }
  throw Error("Fixture did not settle");
}
function fixture(scenarioId, players = 1) {
  const d = STARTERS[0];
  const s = settle(
    createGame(127, d.cards, d.heroes, d.id, {
      scenarioId,
      ...(players > 1
        ? {
            seats: STARTERS.slice(0, players).map((d) => ({
              deckId: d.id,
              heroes: d.heroes,
            })),
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
    encounterDeck: Array(20).fill(H.bandit),
    encounterDiscard: [],
    lastReveal: null,
    heirsNumenor: { removedStages: [], mumakDamage: {} },
  });
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.threat = 20;
      s.allies = [];
      s.engaged = [];
      s.hand = [];
      s.used = [];
      s.committedIds = [];
      s.heroes.forEach((h) =>
        Object.assign(h, {
          exhausted: false,
          committed: false,
          damage: 0,
          resources: 10,
          attachments: [],
        }),
      );
    });
  selectSeat(s, 0);
  syncSeat(s);
  return s;
}
const claim = fixture("peril-in-pelargir");
claim.stage = 2;
claim.progress = 13;
const scroll = make(claim, H.scroll);
claim.staging.push(scroll);
const trail = fixture("into-ithilien");
const trailCard = make(trail, H.trail),
  ranger = make(trail, "01014");
trail.staging.push(trailCard);
trail.allies.push(ranger);
trail.heroes.forEach((h) => {
  h.exhausted = true;
});
const archery = fixture("into-ithilien", 2);
archery.stage = 2;
archery.staging.push(make(archery, H.assassin));
handle(archery, fx("startCombat"));
flush(archery);
syncSeat(archery);
assert.match(archery.choice.title, /Archery.*4 remaining/);
const siege = fixture("siege-of-cair-andros");
siege.phase = "defense";
const banks = make(siege, H.banks),
  approach = make(siege, H.approach),
  citadel = make(siege, H.citadel),
  enemy = make(siege, H.bandit);
siege.staging.push(banks, approach, citadel);
enemy.tempAttack = 8;
siege.engaged.push(enemy);
for (const s of [claim, trail, archery, siege]) assert.ok(validateSave(s));
const browser = await chromium.launch({ headless: true }),
  errors = [];
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
  assert.ok(index >= 0, JSON.stringify(s.choice));
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
    for (const button of await p
      .getByRole("dialog")
      .locator(".decision-footer .decision-actions button")
      .all()) {
      const b = await button.boundingBox();
      assert.ok(
        b.x >= r.x && b.x + b.width <= r.x + r.width,
        `${name}: footer button clipped`,
      );
    }
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
    await p.goto(url);
    await load(p, claim);
    await p
      .getByRole("button", { name: "Claim · Exhaust hero", exact: true })
      .click();
    await capture(p, `scroll-hero-cost-${width}`, height);
    await p.getByRole("dialog").locator(".decision-select").first().click();
    await reload(p);
    let s = await saved(p);
    assert.equal(s.stage, 3);
    assert.equal(s.heroes[0].exhausted, true);
    assert.equal(s.heroes[0].attachments[0].id, scroll.id);
    assert.equal(s.threat, 20);
    assert.match((await reviewedState(p)).choice.title, /enemy/);
    await choose(p, (await reviewedState(p)).choice.options[0].id);
    s = await saved(p);
    assert.equal(s.stageRevealing, false);
    assert.equal(
      s.staging.filter((u) => card(u.code).type_code === "enemy").length,
      1,
    );
    await capture(p, `peril-stage-three-${width}`, height);

    await load(p, trail);
    await p
      .getByRole("button", {
        name: "Exhaust a Ranger · Place 3 progress",
        exact: true,
      })
      .click();
    await capture(p, `trail-ranger-choice-${width}`, height);
    await reload(p);
    await choose(p, ranger.id);
    s = await saved(p);
    assert.equal(s.allies.find((u) => u.id === ranger.id).exhausted, true);
    assert.equal(s.staging.find((u) => u.id === trailCard.id).progress, 3);
    await capture(p, `trail-progress-${width}`, height);

    await load(p, archery);
    await capture(p, `archery-shared-choice-${width}`, height);
    const a0 = archery.table.seats[0].heroes[0].id,
      a1 = archery.table.seats[1].heroes[0].id;
    await choose(p, a0);
    await reload(p);
    await choose(p, a1);
    await choose(p, a0);
    await reload(p);
    await choose(p, a1);
    s = await saved(p);
    assert.equal(s.table.seats[0].heroes.find((h) => h.id === a0).damage, 2);
    assert.equal(s.table.seats[1].heroes.find((h) => h.id === a1).damage, 2);

    await load(p, siege);
    await p.getByRole("button", { name: "Defend", exact: true }).click();
    await p.getByRole("button", { name: /Leave undefended/ }).click();
    await capture(p, `siege-undefended-confirm-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
    await reload(p);
    s = await saved(p);
    assert.ok(s.removed.includes(H.banks));
    assert.equal(s.victory, 0);
    assert.ok(s.heroes.every((h) => h.damage === 0));
    assert.equal(s.staging.find((u) => u.id === approach.id).damage, 0);
    assert.equal(s.staging.find((u) => u.id === citadel.id).damage, 0);
    await capture(p, `siege-packet-no-overflow-${width}`, height);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Heirs client passed: Scroll actual exhaustion/no threat and saved stage search, Ranger action progress, shared Archery allocation through reload, Siege undefended packet/no overflow at1280/390/320; no client errors.",
  );
} finally {
  await browser.close();
}
