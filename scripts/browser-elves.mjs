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
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/elves";
await fs.mkdir(dir, { recursive: true });
const deck = officialStarterDecks.find((d) => d.id === "starter-elves");
function fixture() {
  let s = applyAction(createGame(903, deck.cards, deck.heroes, "custom"), {
    type: "KEEP",
  });
  s.queue = [];
  s.choice = null;
  s.staging = [];
  s.hand = [];
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}
const nenya = fixture();
nenya.phase = "quest";
nenya.heroes[1].attachments.push({
  id: `nenya-${nenya.nextId++}`,
  code: "08121",
  exhausted: false,
  owner: 0,
});
const galadriel = fixture();
const host = fixture();
host.allies = [make(host, "01060"), make(host, "08065")];
host.hand = [make(host, "22036")];
const haldir = fixture();
haldir.phase = "defense";
haldir.staging = [make(haldir, "01082")];
for (const s of [nenya, galadriel, host, haldir]) assert.ok(validateSave(s));
const browser = await chromium.launch({ headless: true }),
  errors = [];
async function load(p, s) {
  await p.evaluate((game) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(game));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
  await reviewedState(p);
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
  const b = p.getByRole("button", { name, exact: true });
  const r = await b.boundingBox();
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
    await load(p, nenya);
    const gal = p.locator(".hero-card").filter({
      has: p.getByRole("button", { name: "Inspect Galadriel", exact: true }),
    });
    assert.equal(
      await gal.locator(".character-art").getAttribute("aria-pressed"),
      null,
      "Galadriel has no unavailable quest action",
    );
    assert.equal(
      await p
        .getByRole("button", { name: "Commit Haldir of Lórien", exact: true })
        .count(),
      1,
    );
    await p.getByRole("button", { name: "Nenya", exact: true }).click();
    assert.equal(
      (await reviewedState(p)).choice.title,
      "Nenya · Add Galadriel's willpower",
    );
    assert.equal(
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Galadriel", exact: true })
        .count(),
      0,
    );
    await capture(p, `nenya-choice-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Haldir of Lórien", exact: true })
      .click();
    let s = await reviewedState(p);
    assert.equal(s.heroes.find((h) => h.code === "08056").stats.will, 6);
    assert.equal(s.heroes.find((h) => h.code === "08112").exhausted, true);
    await p.reload();
    await p.locator("#start-btn").click();
    s = await reviewedState(p);
    assert.equal(s.heroes.find((h) => h.code === "08056").stats.will, 6);
    await load(p, galadriel);
    await p
      .getByRole("button", { name: "Reduce threat & draw a card", exact: true })
      .click();
    const before = galadriel.threat;
    s = await reviewedState(p);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: s.choice.options[0].label, exact: true })
      .click();
    s = await reviewedState(p);
    assert.equal(s.threat, before - 1);
    assert.equal(s.hand.length, 1);
    assert.equal(s.heroes.find((h) => h.code === "08112").exhausted, true);
    await load(p, host);
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    s = await reviewedState(p);
    assert.equal(s.allies.length, 0);
    assert.equal(s.choice.title, "Host of Galadhrim · Play a returned ally");
    await capture(p, `host-choice-${width}`, height);
    await p.reload();
    await p.locator("#start-btn").click();
    assert.equal(
      (await reviewedState(p)).choice.title,
      "Host of Galadhrim · Play a returned ally",
    );
    for (const ally of ["Defender of the Naith", "Henamarth Riversong"]) {
      await p
        .getByRole("dialog")
        .getByRole("button", { name: ally, exact: true })
        .click();
      s = await reviewedState(p);
      assert.equal(s.choice.title, "Celeborn · Silvan ally entered play");
      await p
        .getByRole("dialog")
        .getByRole("button", {
          name: s.choice.options.find((o) => o.id === "skip").label,
          exact: true,
        })
        .click();
      await reviewedState(p);
    }
    s = await reviewedState(p);
    assert.equal(s.allies.length, 2);
    assert.equal(s.choice, null);
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      26,
    );
    await load(p, haldir);
    await p
      .getByRole("button", {
        name: "Attack beyond your engagement",
        exact: true,
      })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Hill Troll", exact: true })
      .click();
    s = await reviewedState(p);
    assert.equal(s.heroes.find((h) => h.code === "08056").exhausted, true);
    assert.equal(
      await p
        .getByRole("button", {
          name: "Attack beyond your engagement",
          exact: true,
        })
        .count(),
      0,
    );
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
    "Elves UI passed: exact retail setup, Galadriel restrictions/action, Nenya targeting and saved willpower, Host free-play choices/save, Haldir attack action, and responsive layouts.",
  );
} finally {
  await browser.close();
}
