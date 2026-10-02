import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/foundations";
await fs.mkdir(dir, { recursive: true });
function fixture() {
  const d = STARTERS.find((d) => d.id === "spirit");
  const s = applyAction(createGame(991, d.cards, d.heroes, d.id), {
    type: "KEEP",
  });
  Object.assign(s, {
    queue: [],
    choice: null,
    staging: [],
    hand: [],
    engaged: [],
    activeLocation: null,
    lastReveal: null,
  });
  s.heroes.forEach((h) => {
    h.resources = 10;
    h.exhausted = false;
    h.committed = false;
  });
  return s;
}
const star = fixture();
star.allies = [make(star, "04106")];
star.deck = ["01013", "01014", "01015", "01016", "01073", "01020"];
const glor = fixture();
glor.phase = "quest";
glor.heroes[0].code = "04101";
glor.encounterDeck = ["01099"];
const light = structuredClone(glor);
light.heroes[0].attachments.push({
  id: "light-of-valinor",
  code: "04107",
  exhausted: false,
});
const scout = fixture();
scout.phase = "attack";
scout.allies = [make(scout, "04104")];
scout.hand = [make(scout, "01020")];
scout.engaged = [make(scout, "01082")];
for (const s of [star, glor, light, scout]) assert.ok(validateSave(s));
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
    await load(p, star);
    await p
      .getByRole("button", {
        name: "Exhaust · order a player's top five",
        exact: true,
      })
      .click();
    await choose(p, "player-0");
    await capture(p, `stargazer-order-${width}`, height);
    await choose(p, "card-4");
    await reload(p);
    assert.match((await reviewedState(p)).choice.title, /Next card on top/);
    for (const id of ["card-3", "card-2", "card-1", "card-0"])
      await choose(p, id);
    let game = await saved(p);
    assert.deepEqual(game.deck, [
      "01073",
      "01016",
      "01015",
      "01014",
      "01013",
      "01020",
    ]);
    assert.equal(game.allies[0].exhausted, true);
    for (const [s, increase, exhausted] of [
      [glor, 1, true],
      [light, 0, false],
    ]) {
      await load(p, s);
      await p
        .getByRole("button", { name: "Commit Glorfindel", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Commit & reveal", exact: true })
        .click();
      const current = await reviewedState(p);
      assert.equal(current.threat, s.threat + increase);
      assert.equal(current.heroes[0].exhausted, exhausted);
      assert.equal(current.heroes[0].committed, true);
      await reload(p);
      assert.equal((await reviewedState(p)).heroes[0].exhausted, exhausted);
    }
    await load(p, scout);
    await p.getByRole("button", { name: "Attack", exact: true }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Trollshaw Scout", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Attack · 2 power/ })
      .click();
    assert.match((await reviewedState(p)).choice.title, /Trollshaw Scout/);
    assert.equal((await reviewedState(p)).allies[0].exhausted, false);
    await capture(p, `scout-forced-${width}`, height);
    await reload(p);
    await choose(p, scout.hand[0].id);
    assert.equal((await reviewedState(p)).allies[0].exhausted, false);
    assert.ok((await saved(p)).discard.includes("01020"));
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Foundations UI passed: Stargazer exact top-five order/reload, Glorfindel actual quest exhaustion vs Light of Valinor, Scout attack without exhaustion/Forced discard/reload, and 1280/390/320 layouts.",
  );
} finally {
  await browser.close();
}
