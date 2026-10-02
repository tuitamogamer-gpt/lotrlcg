import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { officialStarterDecks } from "../src/game/products.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5201";
const dir = "output/rohan";
await fs.mkdir(dir, { recursive: true });
const deck = officialStarterDecks.find((d) => d.id === "starter-rohan");
function fixture() {
  const s = applyAction(createGame(961, deck.cards, deck.heroes, "custom"), {
    type: "KEEP",
  });
  s.queue = [];
  s.choice = null;
  s.staging = [];
  s.hand = [];
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}
const loth = fixture();
loth.phase = "quest";
loth.hand = [make(loth, "07006")];
const hirgon = fixture();
hirgon.phase = "staging";
hirgon.heroes[1].committed = true;
hirgon.heroes[1].exhausted = true;
hirgon.hand = [make(hirgon, "07006")];
const oath = fixture();
oath.phase = "encounter";
oath.hand = [make(oath, "17085")];
oath.engaged = [make(oath, "01090")];
oath.encounterDeck = ["01077"];
const muster = fixture();
muster.hand = [make(muster, "22062")];
muster.heroes.forEach((h) => (h.resources = 0));
muster.heroes[0].resources = 1;
muster.heroes[2].resources = 3;
muster.deck = ["02030", "02030", "07006", "07006", ...Array(7).fill("01018")];
for (const s of [loth, hirgon, oath, muster]) assert.ok(validateSave(s));
const browser = await chromium.launch({ headless: true });
const errors = [];
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
async function choose(p, id) {
  const s = await reviewedState(p),
    option = s.choice.options.find((o) => o.id === id);
  assert.ok(option, `Missing choice ${id}: ${JSON.stringify(s.choice)}`);
  const matching = s.choice.options.filter((o) => o.label === option.label);
  await p
    .getByRole("dialog")
    .getByRole("button", { name: option.label, exact: true })
    .nth(matching.findIndex((o) => o.id === id))
    .click();
  return reviewedState(p);
}
async function next(p, label) {
  await p.getByRole("button", { name: label, exact: true }).click();
  return reviewedState(p);
}
async function reload(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  await p.waitForFunction(
    () =>
      [...document.images].every((img) => {
        const r = img.getBoundingClientRect();
        return r.bottom < 0 || r.top > innerHeight || img.complete;
      }),
    null,
    { timeout: 25000 },
  );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name,
  );
  const dialog = p.getByRole("dialog");
  if (await dialog.count()) {
    const r = await dialog.boundingBox();
    assert.ok(r.y >= 0 && r.y + r.height <= height + 1, `${name} dialog fits`);
  }
  await p.screenshot({ path: `${dir}/${name}.png` });
}
async function nav(p, name) {
  const b = p.getByRole("button", { name, exact: true }),
    r = await b.boundingBox();
  if (!r || r.x < 0 || r.x + r.width > p.viewportSize().width)
    await p
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await b.click();
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
    await load(p, loth);
    await p
      .getByRole("button", { name: "Commit Lothíriel", exact: true })
      .click();
    await next(p, "Commit & reveal");
    let s = await choose(p, "use");
    assert.match(s.choice.title, /Lothíriel/);
    await capture(p, `lothiriel-ally-${width}`, height);
    s = await choose(p, loth.hand[0].id);
    assert.ok(s.allies[0].committed);
    assert.ok(s.allies[0].exhausted);
    s = await reload(p);
    assert.ok(s.allies[0].committed);
    await load(p, hirgon);
    await next(p, "Resolve quest");
    await choose(p, "use");
    await choose(p, hirgon.hand[0].id);
    s = await reviewedState(p);
    assert.match(s.choice.title, /resource pool/);
    await capture(p, `hirgon-payment-${width}`, height);
    await choose(p, hirgon.heroes[0].id);
    s = await choose(p, "raise");
    assert.equal(s.allies[0].stats.attack, 3);
    assert.equal(s.allies[0].stats.defense, 2);
    assert.equal(s.heroes[0].resources, 9);
    s = await reload(p);
    assert.equal(s.allies[0].stats.attack, 3);
    await load(p, muster);
    await p.locator(".hand-play:not(.hand-ability)").click();
    assert.equal(
      await p.getByRole("dialog").locator(".payment-row").count(),
      2,
    );
    await capture(p, `muster-payment-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    s = await choose(p, "ally-0");
    assert.ok(
      !s.choice.options.some((o) => o.id === "ally-1"),
      "duplicate Éomund excluded",
    );
    await choose(p, "ally-2");
    await capture(p, `muster-search-${width}`, height);
    s = await reload(p);
    assert.match(await p.getByRole("dialog").innerText(), /2\/4/);
    await choose(p, "done");
    s = await reviewedState(p);
    assert.equal(s.allies.length, 2);
    assert.equal(s.heroes[0].resources + s.heroes[2].resources, 0);
    await load(p, oath);
    await next(p, "Engagement checks");
    await choose(p, "use");
    assert.match(await p.locator(".phase-title").innerText(), /Oath of Eorl/);
    await capture(p, `oath-early-attacks-${width}`, height);
    await p.getByRole("button", { name: "Attack", exact: true }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Éomer", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Attack · 3 power", exact: true })
      .click();
    s = await reviewedState(p);
    assert.equal(s.engaged[0].damage, 0);
    assert.equal(
      await p.getByRole("button", { name: "Attack", exact: true }).count(),
      0,
      "same enemy cannot be attacked twice in early turn",
    );
    await reload(p);
    await next(p, "Continue to enemy attacks");
    await p.getByRole("button", { name: "Defend", exact: true }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Hirgon", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    s = await reviewedState(p);
    assert.equal(s.phase, "refresh", "Oath skips normal attack turn");
    assert.equal(s.heroes.find((h) => h.code === "17055").damage, 2);
    if (width === 1280) {
      await nav(p, "My fellowship");
      await p
        .locator(".published-starter")
        .filter({ hasText: deck.name })
        .click();
      assert.ok(
        await p
          .getByRole("button", { name: "Choose for play", exact: true })
          .isEnabled(),
      );
      await p
        .getByRole("button", { name: "Choose for play", exact: true })
        .click();
      await p
        .getByRole("button", {
          name: /Passage Through Mirkwood.*Beneath the ancient boughs/s,
        })
        .click();
      if ((await p.locator("#start-btn").innerText()).includes("Continue"))
        await p.locator(".new-adventure").click();
      else await p.locator("#start-btn").click();
      const replace = p.getByRole("dialog", {
        name: "A new journey?",
        exact: true,
      });
      if (await replace.isVisible())
        await replace
          .getByRole("button", { name: "Begin anew", exact: true })
          .click();
      s = await reviewedState(p);
      assert.equal(s.phase, "setup");
      assert.equal(s.deckCount + s.hand.length, 50);
      assert.deepEqual(
        s.heroes.map((h) => h.code),
        deck.heroes,
      );
      await capture(p, "retail-setup-1280", height);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Rohan UI passed: exact retail setup, Lothíriel committed ally/save, Hirgon resource choices/buff, Muster payment/unique search/save, full Oath early attack/defense/skip flow, and 1280/390/320 layouts.",
  );
} finally {
  await browser.close();
}
