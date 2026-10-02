import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { selectSeat, syncSeat } from "../src/game/table.ts";
import { officialStarterDecks } from "../src/game/products.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/heirs";
await fs.mkdir(dir, { recursive: true });
const deck = officialStarterDecks.find((d) => d.id === "limited-lore-tactics");
function fixture() {
  const s = applyAction(
    createGame(903, deck.cards, ["05001", "22001", "03002"], "custom"),
    { type: "KEEP" },
  );
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    engaged: [],
    hand: [],
    activeLocation: null,
    lastReveal: null,
  });
  s.heroes.forEach((h) => (h.resources = 0));
  s.heroes[2].resources = 4;
  return s;
}
const payment = fixture();
payment.hand = [make(payment, "05009")];
const trap = fixture();
trap.hand = [make(trap, "05017")];
trap.encounterDeck = ["01089"];
let harvest = createGame(
  903,
  STARTERS[0].cards,
  STARTERS[0].heroes,
  STARTERS[0].id,
  {
    seats: [
      { deckId: STARTERS[0].id, heroes: STARTERS[0].heroes },
      {
        deckId: "custom",
        heroes: ["05001", "22001", "03002"],
        cards: deck.cards,
      },
    ],
  },
);
for (let i = 0; i < 100 && (harvest.choice || harvest.phase === "setup"); i++)
  harvest = applyAction(
    harvest,
    harvest.choice
      ? {
          type: "CHOOSE",
          id:
            harvest.choice.options.find((o) =>
              ["skip", "done", "resolve"].includes(o.id),
            )?.id ?? harvest.choice.options[0].id,
        }
      : { type: "KEEP" },
  );
selectSeat(harvest, 0);
Object.assign(harvest, {
  phase: "planning",
  queue: [],
  choice: null,
  staging: [],
  engaged: [],
  activeLocation: null,
  lastReveal: null,
  used: [],
});
harvest.heroes.forEach((h) => (h.resources = 3));
harvest.hand = [make(harvest, "06010"), make(harvest, "05009")];
syncSeat(harvest);
for (const s of [payment, trap, harvest]) assert.ok(validateSave(s));
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
    await load(p, payment);
    await p.locator(".hand-play:not(.hand-ability)").click();
    const dialog = p.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Thorin Stonehelm", exact: true })
      .click();
    assert.match(
      await dialog.locator(".payment-heading").innerText(),
      /Pay 2 resources/,
    );
    assert.ok(
      await dialog
        .getByRole("button", { name: "Play card", exact: true })
        .isDisabled(),
    );
    await capture(p, `normal-target-payment-${width}`, height);
    await dialog.getByRole("button", { name: "Beregond", exact: true }).click();
    assert.match(
      await dialog.locator(".payment-heading").innerText(),
      /Pay 0 resources/,
    );
    assert.ok(
      await dialog
        .getByRole("button", { name: "Play card", exact: true })
        .isEnabled(),
    );
    await capture(p, `beregond-zero-payment-${width}`, height);
    await dialog
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reload(p);
    let s = await saved(p);
    assert.equal(s.heroes[0].resources, 0);
    assert.ok(s.heroes[0].attachments.some((a) => a.code === "05009"));
    await load(p, trap);
    await p.locator(".hand-play:not(.hand-ability)").click();
    assert.equal(
      await p
        .getByRole("dialog")
        .getByRole("region", { name: "Choose a target", exact: true })
        .count(),
      0,
    );
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    assert.match(
      await p.locator(".encounter-zone").innerText(),
      /Trap in staging.*awaiting an eligible enemy/s,
    );
    await p
      .getByRole("button", { name: "Inspect Ranger Spikes", exact: true })
      .scrollIntoViewIfNeeded();
    await capture(p, `ranger-spikes-staging-${width}`, height);
    await reload(p);
    s = await saved(p);
    assert.equal(s.staging[0].code, "05017");
    assert.equal(s.staging[0].owner, 0);
    await p.getByRole("button", { name: "Begin quest", exact: true }).click();
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.staging.length, 1);
    assert.equal(s.staging[0].code, "01089");
    assert.equal(s.staging[0].attachments[0].code, "05017");
    assert.equal(s.staging[0].attachments[0].owner, 0);
    assert.equal(
      await p
        .getByRole("button", {
          name: "Inspect attachment: Ranger Spikes",
          exact: true,
        })
        .count(),
      1,
    );
    await p
      .getByRole("button", {
        name: "Inspect attachment: Ranger Spikes",
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await capture(p, `ranger-spikes-attached-${width}`, height);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    await p
      .getByRole("button", { name: "Continue without travel", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Engagement checks", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.engaged.length, 0);
    assert.equal(s.staging[0].code, "01089");
    await load(p, harvest);
    await p
      .locator('.hand-card:has(img[data-card-code="06010"])')
      .locator(".hand-play:not(.hand-ability)")
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    await choose(p, "tactics");
    await p
      .locator('.hand-card:has(img[data-card-code="05009"])')
      .locator(".hand-play:not(.hand-ability)")
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Thorin Stonehelm", exact: true })
      .click();
    assert.match(
      await p.getByRole("dialog").locator(".payment-heading").innerText(),
      /Pay 2 resources/,
    );
    assert.equal(
      await p.getByRole("dialog").locator(".payment-row").count(),
      3,
    );
    assert.ok(
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Play card", exact: true })
        .isEnabled(),
    );
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Beregond", exact: true })
      .click();
    assert.match(
      await p.getByRole("dialog").locator(".payment-heading").innerText(),
      /Pay 0 resources/,
    );
    assert.equal(
      await p.getByRole("dialog").locator(".payment-row").count(),
      0,
    );
    assert.ok(
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Play card", exact: true })
        .isDisabled(),
    );
    assert.match(
      await p.getByRole("dialog").innerText(),
      /A matching sphere hero is required for this target/,
    );
    await capture(p, `harvest-zero-target-match-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Thorin Stonehelm", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    await reload(p);
    s = await saved(p);
    assert.ok(
      s.table.seats[1].heroes
        .find((h) => h.code === "22001")
        .attachments.some((a) => a.code === "05009"),
    );
    assert.equal(
      s.table.seats[0].heroes.reduce((n, h) => n + h.resources, 0),
      7,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Heirs UI passed: target-dependent Beregond 0 vs 2 payment and unavailable target control, save/reload, no-target Ranger Spikes staging/owner/art then physical attachment and skipped engagement check, plus cross-seat Good Harvest positive/zero target sphere permission, at 1280/390/320.",
  );
} finally {
  await browser.close();
}
