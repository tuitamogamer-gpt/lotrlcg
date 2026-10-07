import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as baseFixture } from "../tests/against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import { revealed } from "../src/game/board.ts";
import { beginEnemyAttack } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import { validateSave } from "../src/game/engine.ts";
import {
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/ring-maker-final-players";
await fs.mkdir(dir, { recursive: true });
function fixture(players = 1) {
  const s = baseFixture("mirkwood", players);
  s.heroes[0] = make(s, "08137");
  s.startingHeroes = s.heroes.map((h) => h.code);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) {
        h.resources = 10;
        h.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
      }
    });
  return s;
}
function attach(s, u, code) {
  const a = { id: `a${s.nextId++}`, code, exhausted: false, owner: 0 };
  u.attachments.push(a);
  return a;
}
const treePay = fixture(),
  tree = make(treePay, "08146");
tree.resources = 2;
tree.exhausted = true;
treePay.allies.push(tree);
treePay.heroes.forEach((h) => (h.resources = 0));
treePay.hand = [make(treePay, "08119")];
const treeReady = fixture(2),
  readyTree = make(treeReady, "08146");
readyTree.resources = 2;
readyTree.exhausted = true;
treeReady.allies.push(readyTree);
forOwner(treeReady, 1, () => {
  const ent = make(treeReady, "08119");
  ent.exhausted = true;
  treeReady.allies.push(ent);
});
const entId = seatView(treeReady, 1).allies[0].id;
const pioneer = fixture(2);
pioneer.hand = [make(pioneer, "08091")];
pioneer.staging = [make(pioneer, "01082")];
const guard = fixture(2);
guard.hand = [make(guard, "08115")];
const guardTarget = seatView(guard, 1).heroes[0].id;
const mirror = fixture();
mirror.heroes[1] = make(mirror, "08112");
mirror.startingHeroes = mirror.heroes.map((h) => h.code);
attach(mirror, mirror.heroes[1], "08118");
mirror.deck = ["08119", "08141", "08089"];
mirror.hand = [make(mirror, "08085")];
const erkenbrand = fixture();
erkenbrand.phase = "defense";
const attacker = make(erkenbrand, "01096");
attacker.shadows = ["01097"];
erkenbrand.engaged = [attacker];
beginEnemyAttack(erkenbrand, attacker, [erkenbrand.heroes[0].id]);
flush(erkenbrand);
const rising = fixture();
rising.phase = "defense";
attach(rising, rising.heroes[0], "08139");
const spider = make(rising, "01096");
rising.engaged = [spider];
beginEnemyAttack(rising, spider, [rising.heroes[0].id]);
flush(rising);
const belts = fixture(2);
belts.phase = "refresh";
belts.hand = [make(belts, "08086")];
const ride = fixture();
ride.phase = "quest";
ride.hand = [make(ride, "08142")];
ride.staging = [make(ride, "01082")];
ride.activeLocation = make(ride, "01087");
const shadows = fixture();
shadows.hand = [make(shadows, "08143")];
const shadowEnemy = make(shadows, "01082");
shadowEnemy.shadows = ["01097", "01093"];
shadows.engaged = [shadowEnemy];
const follow = fixture(2);
const defender = make(follow, "08114");
follow.allies.push(defender);
attach(follow, defender, "08093");
selectSeat(follow, 1);
follow.table.turn = 1;
follow.hand = [make(follow, "08085")];
const traveler = fixture();
traveler.hand = [make(traveler, "08089")];
traveler.encounterDeck = ["01099", "01093"];
const hasty = fixture();
hasty.phase = "staging";
hasty.heroes[0].committed = hasty.heroes[0].exhausted = true;
hasty.committedIds = [hasty.heroes[0].id];
hasty.hand = [make(hasty, "08144")];
revealed(hasty, "01093");
flush(hasty);
const waters = fixture(2);
waters.hand = [make(waters, "08145")];
for (const p of playerOrder(waters))
  forOwner(waters, p, () => waters.heroes.forEach((h) => (h.damage = 1)));
for (const [name, s] of Object.entries({
  treePay,
  treeReady,
  pioneer,
  guard,
  mirror,
  erkenbrand,
  rising,
  belts,
  ride,
  shadows,
  follow,
  traveler,
  hasty,
  waters,
})) {
  syncSeat(s);
  assert.ok(validateSave(s), `${name}: valid checkpoint`);
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
  const s = await reviewedState(p),
    index = s.choice.options.findIndex((o) => o.id === id);
  assert.ok(index >= 0, JSON.stringify(s.choice));
  await p
    .locator("dialog[open] .choice-list .decision-select")
    .nth(index)
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
      }),
      p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);
    await load(p, treePay);
    await startPlay(p, "08119", undefined, 2);
    assert.match(
      await p.locator(".payment-row").last().innerText(),
      /Treebeard/,
    );
    await capture(p, `treebeard-payment-${width}`, height);
    await finishPlay(p);
    let s = await saved(p);
    assert.equal(s.allies.find((u) => u.code === "08146").resources, 0);
    assert.equal(s.allies.find((u) => u.code === "08119").exhausted, true);
    await load(p, treeReady);
    await p
      .getByRole("button", {
        name: "Pay 2 resources · Ready an Ent",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await capture(p, `treebeard-ready-${width}`, height);
    await resume(p);
    await choose(p, entId);
    s = await saved(p);
    assert.equal(seatView(s, 1).allies[0].exhausted, false);
    await load(p, pioneer);
    await play(p, "08091", undefined, 2);
    await choose(p, "doomed");
    await capture(p, `pioneer-${width}`, height);
    await resume(p);
    await choose(p, pioneer.staging[0].id);
    s = await saved(p);
    assert.equal(s.staging[0].ignoreThreatRound, s.round);
    assert.equal(seatView(s, 1).threat, 21);
    await load(p, guard);
    await play(p, "08115", undefined, 3);
    await choose(p, "doomed");
    await resume(p);
    await choose(p, guardTarget);
    s = await saved(p);
    assert.equal(seatView(s, 1).heroes[0].roundDefense, 2);
    await capture(p, `guard-${width}`, height);
    await load(p, mirror);
    await p
      .getByRole("button", { name: "Search with the Mirror", exact: true })
      .click();
    await reviewedState(p);
    await capture(p, `mirror-search-${width}`, height);
    await resume(p);
    await choose(p, "card-0");
    s = await saved(p);
    assert.equal(s.hand.length, 1);
    assert.equal(s.deck.length, 2);
    assert.equal(s.discard.length, 1);
    await load(p, erkenbrand);
    await capture(p, `erkenbrand-shadow-${width}`, height);
    await resume(p);
    await choose(p, `erkenbrand-${erkenbrand.heroes[0].id}`);
    s = await saved(p);
    assert.equal(s.heroes[0].damage, 1);
    assert.equal(s.combat, null);
    await load(p, rising);
    await capture(p, `days-rising-${width}`, height);
    await choose(p, "resource");
    s = await saved(p);
    assert.equal(s.heroes[0].resources, 11);
    await load(p, belts);
    await play(p, "08086", undefined, 0);
    await capture(p, `tighten-belts-${width}`, height);
    await choose(p, "player-1");
    s = await saved(p);
    assert.ok(seatView(s, 1).heroes.every((h) => h.resources === 11));
    await load(p, ride);
    await play(p, "08142", ride.staging[0].id, 2);
    s = await saved(p);
    assert.ok(s.used.includes(`phase:ride-them-down:${ride.staging[0].id}`));
    await capture(p, `ride-them-down-${width}`, height);
    await load(p, shadows);
    await startPlay(p, "08143", undefined, 3);
    assert.deepEqual(
      await p.locator(".payment-row .stepper span").allTextContents(),
      ["1", "1", "1"],
    );
    await capture(p, `three-hero-payment-${width}`, height);
    await finishPlay(p);
    s = await saved(p);
    assert.equal(s.engaged[0].shadows.length, 0);
    assert.ok(s.heroes.every((h) => h.resources === 9));
    await load(p, follow);
    await play(p, "08085", undefined, 1);
    s = await saved(p);
    assert.equal(s.table.first, 1);
    assert.ok(seatView(s, 1).allies.some((u) => u.id === defender.id));
    assert.equal(
      seatView(s, 1).allies.find((u) => u.id === defender.id).owner,
      0,
    );
    await capture(p, `first-player-control-${width}`, height);
    await resume(p);
    await load(p, traveler);
    await play(p, "08089", undefined, 1);
    await choose(p, "look");
    await capture(p, `celduin-traveler-${width}`, height);
    await resume(p);
    await choose(p, "discard");
    s = await saved(p);
    assert.equal(s.encounterDeck[0], "01093");
    await load(p, hasty);
    await capture(p, `dont-be-hasty-${width}`, height);
    await resume(p);
    await choose(p, `hasty-0-${hasty.heroes[0].id}`);
    s = await saved(p);
    assert.equal(s.heroes[0].committed, false);
    assert.equal(s.heroes[0].damage, 0);
    await load(p, waters);
    await play(p, "08145", undefined, 3);
    s = await saved(p);
    for (const player of playerOrder(s)) {
      assert.equal(seatView(s, player).threat, 23);
      assert.ok(seatView(s, player).heroes.every((h) => h.damage === 0));
    }
    await capture(p, `waters-of-nimrodel-${width}`, height);
    const art = await p.evaluate(
      async (codes) =>
        Promise.all(
          codes.map(async (code) => {
            const img = new Image();
            img.src = `/cards/${code}.jpg`;
            await img.decode();
            return { code, width: img.naturalWidth, height: img.naturalHeight };
          }),
        ),
      [
        [84, 93],
        [112, 121],
        [137, 146],
      ].flatMap(([a, b]) =>
        Array.from(
          { length: b - a + 1 },
          (_, i) => `08${String(a + i).padStart(3, "0")}`,
        ),
      ),
    );
    assert.ok(art.every((i) => i.width > 200 && i.height > 300));
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ screenshots, errors }, null, 2),
  );
  console.log(
    `Final Ring-maker players: ${screenshots.length} screenshots; real payment, abilities, responses and saved choices at 1280/390/320px; all 30 faces decoded; no browser errors.`,
  );
} finally {
  await browser.close();
}
