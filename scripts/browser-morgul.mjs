import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS, SCRIPTED } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as act } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/morgul";
for (let n = 134; n <= 143; n++) assert.ok(SCRIPTED.has(`06${n}`));
await fs.mkdir(dir, { recursive: true });
function fixture(sphere) {
  const d = STARTERS.find((d) => d.id === sphere);
  let s = act(createGame(919, d.cards, d.heroes, d.id), { type: "KEEP" });
  Object.assign(s, {
    phase: "planning",
    hand: [],
    staging: [],
    engaged: [],
    queue: [],
    choice: null,
    allies: [],
    activeLocation: null,
    extraActiveLocations: [],
    lastReveal: null,
    encounterDeck: [],
    encounterDiscard: [],
    used: [],
    combat: null,
    deck: ["01013", "01015", "01018"],
    discard: [],
  });
  s.heroes.forEach((h) =>
    Object.assign(h, {
      resources: 4,
      damage: 0,
      exhausted: false,
      committed: false,
      attachments: [],
    }),
  );
  return s;
}
function attachment(s, host, code) {
  const a = { id: `morgul-proof-${s.nextId++}`, code, exhausted: false };
  host.attachments.push(a);
  return a.id;
}
const steed = fixture("spirit"),
  steedHero = steed.heroes[0];
steed.phase = "quest";
attachment(steed, steedHero, "06139");
const lay = fixture("spirit"),
  layHero = lay.heroes[0];
lay.hand = [make(lay, "06140")];
const search = fixture("lore"),
  searchHero = search.heroes[0];
attachment(search, searchHero, "06142");
search.discard = ["01067", "01067"];
const healing = fixture("lore"),
  healingHero = healing.heroes[1];
attachment(healing, healing.heroes[0], "06142");
healingHero.damage = 1;
healing.discard = ["01063"];
for (const s of [steed, lay, search, healing]) assert.ok(validateSave(s));

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
  return reload(p);
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

    await load(p, steed);
    await p.getByRole("button", { name: "Commit Éowyn", exact: true }).click();
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .first()
      .click();
    assert.match((await reviewedState(p)).choice.title, /Steed of the Mark/);
    await capture(p, `steed-response-${width}`, height);
    await reload(p);
    await choose(p, "ready");
    let s = await saved(p),
      hero = s.heroes.find((h) => h.id === steedHero.id);
    assert.equal(hero.resources, 3);
    assert.equal(hero.exhausted, false);
    assert.equal(hero.committed, true);
    await reload(p);
    assert.equal(
      (await saved(p)).heroes.find((h) => h.id === steedHero.id).committed,
      true,
    );

    await load(p, lay);
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Éowyn", exact: true })
      .click();
    await capture(p, `lay-target-payment-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    hero = s.heroes.find((h) => h.id === layHero.id);
    assert.equal(hero.resources, 3);
    assert.equal(hero.tempWill, 3);
    assert.ok(s.discard.includes("06140"));
    await reload(p);
    assert.equal(
      (await saved(p)).heroes.find((h) => h.id === layHero.id).tempWill,
      3,
    );

    await load(p, search);
    await p
      .getByRole("button", {
        name: "Discard Scroll · play a Lore event",
        exact: true,
      })
      .click();
    await choose(p, "discard-1");
    assert.match((await reviewedState(p)).choice.title, /Choose X/);
    await capture(p, `scroll-choose-x-${width}`, height);
    await reload(p);
    await choose(p, "x-2");
    assert.match((await reviewedState(p)).choice.title, /Pay event cost/);
    await reload(p);
    s = await saved(p);
    assert.equal(s.heroes.find((h) => h.id === searchHero.id).resources, 4);
    assert.equal(s.discard.filter((c) => c === "01067").length, 2);
    assert.ok(
      s.heroes
        .find((h) => h.id === searchHero.id)
        .attachments.some((a) => a.code === "06142"),
    );
    const payment = s.choice.options.find((o) =>
      o.effects?.some((e) => e.ids?.includes(`${searchHero.id}=2`)),
    );
    assert.ok(
      payment,
      "Scroll replay offers full explicit X payment from the selected hero",
    );
    await choose(p, payment.id);
    s = await saved(p);
    assert.equal(s.heroes.find((h) => h.id === searchHero.id).resources, 2);
    assert.equal(s.discard.filter((c) => c === "01067").length, 1);
    assert.ok(s.discard.includes("06142"));
    assert.equal(s.resolvingEvents[0].unit.code, "01067");
    assert.equal(s.resolvingEvents[0].destination, "bottom");
    const physicalId = s.resolvingEvents[0].unit.id;
    await capture(p, `scroll-physical-search-${width}`, height);
    await reload(p);
    assert.equal((await saved(p)).resolvingEvents[0].unit.id, physicalId);
    await choose(p, "search-1");
    await reload(p);
    await choose(p, "order0");
    s = await saved(p);
    assert.deepEqual(
      s.hand.map((u) => u.code),
      ["01015"],
    );
    assert.deepEqual(s.deck, ["01013", "01018", "01067"]);
    assert.equal(s.discard.filter((c) => c === "01067").length, 1);
    assert.equal(s.resolvingEvents, undefined);

    await load(p, healing);
    await p
      .getByRole("button", {
        name: "Discard Scroll · play a Lore event",
        exact: true,
      })
      .click();
    await choose(p, "discard-0");
    assert.match((await reviewedState(p)).choice.title, /Event target/);
    await reload(p);
    await choose(p, healingHero.id);
    await capture(p, `scroll-targeted-payment-${width}`, height);
    await reload(p);
    await choose(p, "pay-0");
    s = await saved(p);
    assert.equal(s.heroes.find((h) => h.id === healingHero.id).damage, 0);
    assert.equal(s.deck.at(-1), "01063");
    assert.ok(s.discard.includes("06142"));
    await reload(p);
    assert.equal((await saved(p)).deck.at(-1), "01063");
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Morgul client passed at 1280/390/320: Steed saved optional response; Lay target/payment and lasting saved bonus; Scroll explicit paid X, targets, physical duplicate event identity through saved nested choices and bottom placement. No console/page errors or horizontal overflow.",
  );
} finally {
  await browser.close();
}
