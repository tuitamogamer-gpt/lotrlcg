import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as baseFixture } from "../tests/against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import { revealed } from "../src/game/board.ts";
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
const dir = "output/ranger-north";
await fs.mkdir(dir, { recursive: true });
function fixture(players = 1) {
  const s = baseFixture("mirkwood", players);
  s.heroes = [make(s, "09001"), make(s, "09002"), make(s, "01012")];
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

const summons = fixture();
summons.hand = [make(summons, "09007")];
summons.encounterDeck = ["01099"];
const control = fixture(2);
control.table.first = 1;
control.phase = "staging";
control.encounterDeck = ["01099"];
control.staging = [make(control, "01082")];
revealed(control, "09015");
flush(control);
const progress = fixture();
progress.activeLocation = make(progress, "01099");
progress.encounterDeck = ["01099"];
revealed(progress, "09015");
flush(progress);
const departure = fixture();
const ranger = make(departure, "09015");
departure.allies.push(ranger);
attach(departure, ranger, "02029");
for (const [name, s] of Object.entries({
  summons,
  control,
  progress,
  departure,
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
      }),
      p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);
    await load(p, summons);
    await startPlay(p, "09007", undefined, 1);
    await capture(p, `summons-payment-${width}`, height);
    await finishPlay(p);
    let s = await saved(p);
    assert.equal(s.rangerReserves[0], 2);
    assert.ok(s.removed.includes("09007"));
    assert.ok(s.encounterDeck.includes("09015"));
    await resume(p);
    assert.equal((await saved(p)).rangerReserves[0], 2);
    await load(p, control);
    await capture(p, `first-player-control-${width}`, height);
    await resume(p);
    await choose(p, "player-0");
    await capture(p, `ranger-aid-${width}`, height);
    await choose(p, `damage-${control.staging[0].id}`);
    s = await saved(p);
    assert.equal(seatView(s, 0).allies[0].code, "09015");
    assert.equal(s.staging.find((u) => u.code === "01082").damage, 2);
    assert.equal(s.encounterDeck.length, 0);
    assert.ok(s.staging.some((u) => u.code === "01099"));
    await load(p, progress);
    await choose(p, "player-0");
    await capture(p, `location-aid-${width}`, height);
    await resume(p);
    await choose(p, `progress-${progress.activeLocation.id}`);
    s = await saved(p);
    assert.equal(s.activeLocation.progress, 2);
    await load(p, departure);
    await capture(p, `controlled-ranger-${width}`, height);
    await p
      .getByRole("button", {
        name: "Born Aloft",
        exact: true,
      })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.allies.length, 0);
    assert.ok(s.removed.includes("09015"));
    assert.ok(!s.hand.some((u) => u.code === "09015"));
    assert.ok(s.discard.includes("02029"));
    await capture(p, `ranger-removed-${width}`, height);
    const art = await p.evaluate(async () =>
      Promise.all(
        ["09007", "09015"].map(async (code) => {
          const i = new Image();
          i.src = `/cards/${code}.jpg`;
          await i.decode();
          return i.naturalWidth;
        }),
      ),
    );
    assert.ok(art.every((w) => w > 200));
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ screenshots, errors }, null, 2),
  );
  console.log(
    `Ranger of the North: ${screenshots.length} responsive checkpoints; paid Summons, reserves, first-player control, both aid modes, Surge, saved choices and actual Born Aloft departure; both faces decoded.`,
  );
} finally {
  await browser.close();
}
