import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as baseFixture } from "../tests/against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import { engage, destroy } from "../src/game/board.ts";
import { resolvePlayerAttack } from "../src/game/combat.ts";
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
const dir = "output/lost-realm-players";
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

const watchman = fixture();
watchman.hand = [make(watchman, "09003")];
watchman.deck = ["01013", "02002", "01013", "02002", "01013", "02002"];
const hunter = fixture();
hunter.hand = [make(hunter, "09004")];
hunter.encounterDeck = ["01074", "01099", "01099", "01099", "01099"];
const heir = fixture();
const heirA = attach(heir, heir.heroes[1], "09010");
heir.engaged = [make(heir, "01096"), make(heir, "01096")];
heir.hand = [make(heir, "09006")];
const athelas = fixture(2);
attach(athelas, athelas.heroes[0], "09011");
const healTarget = seatView(athelas, 1).heroes[0];
healTarget.damage = 3;
const condition = attach(athelas, healTarget, "01071");
const trackers = fixture();
trackers.hand = [make(trackers, "09009")];
trackers.staging = [make(trackers, "01099")];
engage(trackers, make(trackers, "01082"));
flush(trackers);
const tireless = fixture(2);
tireless.phase = "defense";
tireless.hand = [make(tireless, "09008")];
const pulled = make(tireless, "01096");
pulled.shadows = ["01093", "01097"];
pulled.faceupShadows = [false, true];
forOwner(tireless, 1, () => tireless.engaged.push(pulled));
const halbarad = fixture();
halbarad.phase = "encounter";
halbarad.staging = [
  make(halbarad, "01096"),
  make(halbarad, "01096"),
  make(halbarad, "01096"),
];
const vigilance = fixture(2);
const victim = make(vigilance, "01082");
vigilance.engaged.push(victim);
attach(vigilance, victim, "09012");
destroy(vigilance, victim);
flush(vigilance);
const aragorn = fixture(2);
aragorn.phase = "attack";
const killed = make(aragorn, "01096"),
  nextEnemy = make(aragorn, "01096");
killed.damage = 2;
aragorn.engaged.push(killed);
forOwner(aragorn, 1, () => aragorn.engaged.push(nextEnemy));
resolvePlayerAttack(aragorn, killed, [aragorn.heroes[0].id], 0);
flush(aragorn);
const opening = fixture();
opening.phase = "encounter";
opening.hand = [make(opening, "09008")];
opening.staging = [make(opening, "01082")];
const brooch = fixture();
brooch.hand = [make(brooch, "09013"), make(brooch, "09012")];
brooch.engaged = [make(brooch, "01096")];
brooch.staging = [make(brooch, "01082")];
for (const [name, s] of Object.entries({
  watchman,
  hunter,
  heir,
  athelas,
  trackers,
  tireless,
  halbarad,
  vigilance,
  aragorn,
  brooch,
  opening,
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
    await load(p, watchman);
    await play(p, "09003", undefined, 2);
    await choose(p, "search");
    await capture(p, `watchman-search-${width}`, height);
    await resume(p);
    await choose(p, "card-3");
    let s = await saved(p);
    assert.equal(s.hand[0].code, "02002");
    assert.equal(s.deck.length, 5);
    await load(p, hunter);
    await play(p, "09004", undefined, 0);
    await capture(p, `hunter-forced-search-${width}`, height);
    await resume(p);
    await choose(p, "enemy-0");
    s = await saved(p);
    assert.equal(s.engaged[0].code, "01074");
    assert.ok(s.heroes.every((h) => !h.exhausted));
    await load(p, heir);
    await p
      .getByRole("button", {
        name: "Exhaust Heir of Valandil · Reduce the next Dúnedain ally’s cost",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await startPlay(p, "09006", undefined, 2);
    await capture(p, `heir-payment-${width}`, height);
    await finishPlay(p);
    s = await saved(p);
    assert.ok(s.allies.some((u) => u.code === "09006"));
    assert.ok(s.heroes[1].attachments.find((a) => a.id === heirA.id).exhausted);
    await load(p, athelas);
    await p
      .getByRole("button", {
        name: "Discard Athelas · Heal a character",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await capture(p, `athelas-heal-${width}`, height);
    await resume(p);
    await choose(p, healTarget.id);
    await capture(p, `athelas-condition-${width}`, height);
    await choose(p, condition.id);
    s = await saved(p);
    assert.equal(seatView(s, 1).heroes[0].damage, 0);
    assert.equal(seatView(s, 1).heroes[0].attachments.length, 0);
    assert.ok(s.heroes[0].exhausted);
    await load(p, trackers);
    await capture(p, `trackers-response-${width}`, height);
    await choose(p, "play");
    await choose(p, trackers.heroes[0].id);
    await resume(p);
    await choose(p, trackers.staging[0].id);
    s = await saved(p);
    assert.equal(s.staging[0].progress, 1);
    assert.ok(s.heroes[0].exhausted);
    await load(p, tireless);
    await play(p, "09008", pulled.id, 1);
    await capture(p, `tireless-shadow-${width}`, height);
    await resume(p);
    await choose(p, "shadow-0");
    s = await saved(p);
    assert.deepEqual(s.engaged[0].shadows, ["01097"]);
    assert.deepEqual(s.engaged[0].faceupShadows, [true]);
    await load(p, halbarad);
    for (let i = 0; i < 2; i++) {
      await p
        .getByRole("button", { name: "Engage", exact: true })
        .first()
        .click();
      await reviewedState(p);
    }
    await capture(p, `halbarad-two-engagements-${width}`, height);
    s = await saved(p);
    assert.equal(s.engaged.length, 2);
    assert.equal(
      await p.getByRole("button", { name: "Engage", exact: true }).count(),
      0,
    );
    await load(p, vigilance);
    await capture(p, `secret-vigil-response-${width}`, height);
    await resume(p);
    await choose(p, "reduce");
    s = await saved(p);
    assert.equal(s.threat, 19);
    assert.equal(seatView(s, 1).threat, 19);
    await load(p, aragorn);
    await capture(p, `aragorn-response-${width}`, height);
    await resume(p);
    await choose(p, nextEnemy.id);
    s = await saved(p);
    assert.ok(s.engaged.some((u) => u.id === nextEnemy.id));
    assert.equal(seatView(s, 1).engaged.length, 0);
    await load(p, brooch);
    await play(p, "09013", brooch.heroes[0].id, 1);
    await play(p, "09012", brooch.staging[0].id, 1);
    await capture(p, `brooch-vigil-board-${width}`, height);
    s = await saved(p);
    assert.ok(s.heroes[0].attachments.some((a) => a.code === "09013"));
    assert.ok(s.staging[0].attachments.some((a) => a.code === "09012"));
    await load(p, opening);
    await p
      .getByRole("button", { name: "Engagement checks", exact: true })
      .click();
    await reviewedState(p);
    await capture(p, `empty-combat-opening-${width}`, height);
    await resume(p);
    await choose(p, "play");
    await choose(p, opening.staging[0].id);
    s = await saved(p);
    assert.equal(s.phase, "defense");
    assert.equal(s.engaged[0].code, "01082");
    assert.equal(s.engaged[0].shadows.length, 0);
    const art = await p.evaluate(
      async (codes) =>
        Promise.all(
          codes.map(async (code) => {
            const img = new Image();
            img.src = `/cards/${code}.jpg`;
            await img.decode();
            return img.naturalWidth;
          }),
        ),
      [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13].map(
        (n) => `09${String(n).padStart(3, "0")}`,
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
    `Lost Realm players: ${screenshots.length} responsive checkpoints; real card plays, payments, attachments, responses and resumed choices; 12 original faces decoded.`,
  );
} finally {
  await browser.close();
}
