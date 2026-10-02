import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { officialStarterDecks } from "../src/game/products.ts";
import { createGame, applyAction, validateSave } from "../src/game/engine.ts";
import { make } from "../src/game/core.ts";
import { DECKS_KEY, startingThreat } from "../src/game/decks.ts";
import {
  installReviewHandler,
  reviewedState,
  finishResourcePhase,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/resource";
await fs.mkdir(dir, { recursive: true });
const leader = STARTERS[0];
const retail = officialStarterDecks.find(
  (d) => d.id === "limited-lore-tactics",
);
const resource = applyAction(
  createGame(72, leader.cards, leader.heroes, leader.id),
  { type: "KEEP" },
);
assert.equal(resource.phase, "resource");
Object.assign(resource, {
  queue: [],
  choice: null,
  staging: [],
  engaged: [],
  activeLocation: null,
  lastReveal: null,
});
resource.heroes[0].attachments.push({
  id: "resource-steward",
  code: "01026",
  exhausted: false,
  owner: 0,
});
resource.heroes[2].exhausted = true;
resource.hand = [make(resource, "01014"), make(resource, "01021")];
let group = createGame(74, leader.cards, leader.heroes, leader.id, {
  seats: [leader, STARTERS[3]].map((d) => ({ deckId: d.id, heroes: d.heroes })),
});
while (group.phase === "setup") group = applyAction(group, { type: "KEEP" });
assert.equal(group.phase, "resource");
let outlands = applyAction(
  createGame(75, retail.cards, ["06001", "01001", "01003"], "custom"),
  { type: "KEEP" },
);
assert.equal(outlands.phase, "resource");
outlands = applyAction(outlands, { type: "NEXT" });
Object.assign(outlands, {
  queue: [],
  choice: null,
  staging: [],
  engaged: [],
  activeLocation: null,
  lastReveal: null,
});
outlands.heroes.forEach((h) => (h.resources = 3));
outlands.hand = [make(outlands, "06006"), make(outlands, "01057")];
const mirlondeDeck = {
  id: "mirlonde-proof",
  name: "Mirlonde lore",
  heroes: ["06032", "02001", "01010"],
  cards: retail.cards,
  updatedAt: 1,
};
assert.equal(startingThreat(mirlondeDeck.heroes), 22);
for (const s of [resource, group, outlands]) assert.ok(validateSave(s));
const browser = await chromium.launch({ headless: true }),
  errors = [];
async function navigate(p, name) {
  if (
    await p
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  )
    await p
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await p.getByRole("button", { name, exact: true }).first().click();
}
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
      }),
      p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);
    await load(p, resource);
    assert.equal((await saved(p)).phase, "resource");
    assert.ok(
      await p
        .getByRole("button", { name: "Begin planning", exact: true })
        .count(),
    );
    assert.match(await p.locator(".phase-track").innerText(), /Resource/);
    await p
      .getByRole("button", { name: "Steward of Gondor", exact: true })
      .click();
    await reviewedState(p);
    let s = await saved(p);
    assert.equal(s.phase, "resource");
    assert.equal(s.heroes[0].resources, 3);
    await reload(p);
    s = await saved(p);
    assert.equal(s.phase, "resource");
    assert.equal(s.heroes[0].resources, 3);
    await p
      .getByRole("button", { name: "Inspect Faramir", exact: true })
      .click();
    assert.ok(
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Play this card", exact: true })
        .isDisabled(),
    );
    await p.keyboard.press("Escape");
    await p
      .locator(
        '.hand-card:has(img[data-card-code="01021"]) .hand-play:not(.hand-ability)',
      )
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Aragorn", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    await choose(p, resource.heroes[2].id);
    s = await saved(p);
    assert.equal(s.phase, "resource");
    assert.equal(s.heroes[0].exhausted, true);
    assert.equal(s.heroes[2].exhausted, false);
    await capture(p, `resource-actions-${width}`, height);
    await finishResourcePhase(p);
    s = await saved(p);
    assert.equal(s.phase, "planning");
    assert.equal(s.heroes[0].resources, 3);
    await p
      .locator(
        '.hand-card:has(img[data-card-code="01014"]) .hand-play:not(.hand-ability)',
      )
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    assert.ok((await saved(p)).allies.some((a) => a.code === "01014"));
    await load(p, group);
    await p
      .getByRole("button", { name: "Finish resource actions", exact: true })
      .first()
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.phase, "resource");
    assert.equal(s.table.active, 1);
    assert.deepEqual(s.table.passed, [0]);
    await reload(p);
    s = await saved(p);
    assert.equal(s.table.active, 1);
    assert.ok(
      s.table.seats.every((seat) =>
        seat.heroes.every((h) => h.resources === 1),
      ),
    );
    await capture(p, `resource-second-player-${width}`, height);
    await finishResourcePhase(p);
    s = await saved(p);
    assert.equal(s.phase, "planning");
    assert.equal(s.table.active, 0);
    await load(p, outlands);
    await p
      .locator(
        '.hand-card:has(img[data-card-code="06006"]) .hand-play:not(.hand-ability)',
      )
      .click();
    assert.equal(
      await p.getByRole("dialog").locator(".payment-row").count(),
      1,
    );
    assert.match(
      await p.getByRole("dialog").locator(".payment-row").innerText(),
      /Hirluin the Fair/,
    );
    await capture(p, `hirluin-outlands-payment-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    await reload(p);
    s = await saved(p);
    assert.equal(s.heroes[0].resources, 1);
    assert.equal(s.heroes[1].resources, 3);
    assert.ok(s.allies.some((a) => a.code === "06006"));
    await p
      .getByRole("button", { name: "Inspect Unexpected Courage", exact: true })
      .click();
    assert.ok(
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Play this card", exact: true })
        .isDisabled(),
    );
    await p.keyboard.press("Escape");
    await navigate(p, "Deck builder");
    await p.getByRole("button", { name: "New deck", exact: true }).click();
    await p
      .getByRole("button", { name: "Add Hirluin the Fair", exact: true })
      .click();
    assert.match(
      await p.locator(".builder-hero.is-selected").innerText(),
      /The Steward.s Fear/,
    );
    await p
      .getByRole("combobox", {
        name: "Filter playable card product",
        exact: true,
      })
      .selectOption("The Steward's Fear");
    const ethir = p.locator(".builder-card").filter({
      has: p.getByRole("button", {
        name: "Add one Ethir Swordsman",
        exact: true,
      }),
    });
    assert.match(await ethir.innerText(), /Outlands|Ethir Swordsman/);
    await ethir
      .getByRole("button", { name: "Add one Ethir Swordsman", exact: true })
      .click();
    assert.match(
      await p.locator(".builder-deck-list").innerText(),
      /1 ×.*Ethir/s,
    );
    await p.getByRole("button", { name: "Cancel", exact: true }).click();
    await p.evaluate(
      ({ key, deck }) => {
        localStorage.setItem(key, JSON.stringify([deck]));
        localStorage.setItem(
          "there-and-back-again.deck.v1",
          `custom:${deck.id}`,
        );
        localStorage.removeItem("there-and-back-again.save.v1");
        localStorage.removeItem("there-and-back-again.choices.v1");
      },
      { key: DECKS_KEY, deck: mirlondeDeck },
    );
    await p.reload();
    await navigate(p, "Deck builder");
    await p.getByRole("button", { name: "Edit", exact: true }).click();
    assert.match(
      await p.getByRole("region", { name: "Heroes", exact: true }).innerText(),
      /22 starting threat/,
    );
    assert.match(
      await p.locator('.builder-hero[data-card-code="06032"]').innerText(),
      /8 threat/,
    );
    await capture(p, `mirlonde-starting-threat-${width}`, height);
    await p.getByRole("button", { name: "Cancel", exact: true }).click();
    await navigate(p, "Adventures");
    const choice = p.getByRole("button", {
      name: "Choose Mirlonde lore",
      exact: true,
    });
    assert.match(await choice.innerText(), /22 threat/);
    await choice.click();
    await p.locator("#start-btn").click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.threat, 22);
    assert.equal(s.startingThreat, 22);
    await reload(p);
    s = await saved(p);
    assert.equal(s.startingThreat, 22);
    assert.equal(s.threat, 22);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Resource/Steward client passed: real saved resource ability/event window, ally blocked until explicit planning, two-player resource passes, Hirluin Outlands-only sphere payment/building, and Mirlonde printed-versus-starting threat through actual setup/reload at 1280/390/320.",
  );
} finally {
  await browser.close();
}
