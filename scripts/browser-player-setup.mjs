import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const browser = await chromium.launch({ headless: true });
const base = process.env.GAME_URL ?? "http://localhost:5178";
const dir = "output/player-setup";
await fs.mkdir(dir, { recursive: true });
const errors = [];
for (const n of [2, 3, 4]) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await installReviewHandler(page);
  await page.goto(base);
  await page.getByRole("button", { name: `${n} players`, exact: true }).click();
  assert.equal(await page.locator(".setup-seats > button").count(), n);
  assert.equal(await page.locator(".deck-hero-triptych img").count(), 12);
  await page.getByRole("button", { name: "Edit Player 2 fellowship" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Choose Leadership", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: `${dir}/menu-${n}-players.png`,
    fullPage: true,
  });
  await page.locator("#start-btn").click();
  let state = await reviewedState(page);
  for (let i = 0; i < n; i++) {
    assert.equal(state.table.active, i);
    assert.equal(state.heroes.length, 3);
    await page.locator(".turn-panel .turn-actions .primary").click();
    state = await reviewedState(page);
  }
  assert.equal(state.phase, "planning");
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(String(i + 1));
    state = await reviewedState(page);
    assert.equal(state.table.active, i);
    assert.equal(state.heroes.length, 3);
    assert.equal(
      await page
        .locator(".character-row .hero-company > .character-card")
        .count(),
      3,
    );
    assert.ok(state.table.seats[i].heroes.every((h) => h.resources === 1));
    assert.equal(state.hand.length, 7);
  }
  await page.screenshot({
    path: `${dir}/table-${n}-players.png`,
    fullPage: true,
  });
  const before = state.table.seats.map((p) => ({
    heroes: p.startingHeroes,
    hand: p.hand,
    threat: p.threat,
  }));
  await page.reload();
  await page.locator("#start-btn").click();
  state = await reviewedState(page);
  assert.deepEqual(
    state.table.seats.map((p) => ({
      heroes: p.startingHeroes,
      hand: p.hand,
      threat: p.threat,
    })),
    before,
  );
  assert.equal(state.table.active, n - 1);
  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `${dir}/table-${n}-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const action = await page
      .locator(".turn-panel .turn-actions .primary")
      .boundingBox();
    assert.ok(action && action.y >= 0 && action.y + action.height <= height);
  }
  await fs.writeFile(`${dir}/state-${n}.json`, JSON.stringify(state, null, 2));
  await context.close();
}
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await installReviewHandler(page);
const { fullCampaign } = JSON.parse(
  await fs.readFile("output/hotseat/fixtures.json", "utf8"),
);
await page.goto(base);
await page.evaluate((s) => {
  localStorage.removeItem("there-and-back-again.choices.v1");
  localStorage.setItem("there-and-back-again.campaign.v1", JSON.stringify(s));
  localStorage.setItem("there-and-back-again.mode.v1", "campaign");
}, fullCampaign);
await page.reload();
await page.locator("#start-btn").click();
await page
  .getByRole("button", { name: "Continue campaign", exact: true })
  .click();
assert.equal(await page.locator(".campaign-hero-picker").count(), 9);
assert.equal(
  await page.locator(".campaign-deck-choices .deck-picker").count(),
  3,
);
await page
  .getByRole("group", { name: /Campaign hero 2$/ })
  .getByRole("button", { name: "Change hero", exact: true })
  .click();
await page
  .getByRole("group", { name: /Campaign hero 2$/ })
  .getByRole("button", { name: "Choose Beravor", exact: true })
  .click();
await page.screenshot({
  path: `${dir}/campaign-three-fellowships.png`,
  fullPage: true,
});
await page
  .getByRole("button", { name: "Begin next chapter", exact: true })
  .click();
for (let i = 0; i < 60; i++) {
  const state = await reviewedState(page);
  if (!state.choice) break;
  const options = state.choice.options;
  const preferred = options.findIndex((o) => o.id === "skip");
  await page
    .locator("dialog[open] .choice-list button")
    .nth(Math.max(0, preferred))
    .click();
}
const next = await reviewedState(page);
assert.equal(next.scenario, "anduin");
assert.equal(next.table.seats.length, 3);
assert.ok(next.table.seats.every((p) => p.startingHeroes.length === 3));
assert.deepEqual(next.table.seats[0].startingHeroes, [
  "01001",
  "01012",
  "01003",
]);
assert.equal(next.campaign.threatPenalty, 1);
assert.deepEqual(
  next.table.seats.map((p) => p.deckId),
  ["leadership", "tactics", "spirit"],
);
await context.close();
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "Full-player browser passed: 2/3/4 players, three heroes each, unique starters, player shortcuts, resources, separate hands, reload, campaign hero groups and desktop layout; no browser errors.",
);
