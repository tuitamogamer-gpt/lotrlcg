import {
  installReviewHandler,
  acknowledgeReviews,
  reviewedState,
} from "./browser-review-helpers.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.GAME_URL ?? "http://localhost:5178";
await fs.mkdir("output/browser", { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const reports = [];
const state = reviewedState;
async function settle(p) {
  for (let n = 0; n < 30; n++) {
    const s = await state(p);
    if (!s.choice || s.mode !== "playing") return;
    const choices = p.locator("dialog[open] .choice-list .decision-select");
    let index = s.choice.options.findIndex((o) => o.id === "skip");
    if (index < 0)
      index = s.choice.options.findIndex((o) => o.id === "resolve");
    if (index < 0) index = 0;
    await choices.nth(index).click();
  }
  throw new Error("Choice did not resolve");
}
for (const deck of ["leadership", "tactics", "spirit", "lore"]) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 982 },
    reducedMotion: "reduce",
  });
  const p = await context.newPage();
  await installReviewHandler(p);
  p.on("pageerror", (e) => errors.push(`${deck}: ${e.message}`));
  p.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`${deck}: ${msg.text()}`);
  });
  await p.goto(base);
  await p.getByRole("button", { name: /Classic solo/ }).click();
  await p
    .getByRole("button", {
      name: `Choose ${deck[0].toUpperCase() + deck.slice(1)}`,
      exact: true,
    })
    .click();
  await p.getByRole("button", { name: "My fellowship", exact: true }).click();
  assert.equal(
    await p.locator(".deck-choice:not(.deck-choice-build)").count(),
    4,
  );
  assert.equal(await p.locator(".hero-roster > button").count(), 3);
  assert.equal(await p.locator(".deck-row").count(), 16);
  await p.locator(".hero-roster > button").first().click();
  assert.ok(await p.locator("dialog[open]").isVisible());
  await p.keyboard.press("Escape");
  assert.equal(await p.locator("dialog[open]").count(), 0);
  if (deck === "leadership")
    await p.screenshot({
      path: "output/browser/four-decks.png",
      fullPage: true,
    });
  await p
    .getByRole("button", {
      name: `Begin with ${deck[0].toUpperCase() + deck.slice(1)}`,
    })
    .click();
  let s = await state(p);
  assert.equal(s.deck, deck);
  assert.equal(s.phase, "setup");
  assert.equal(s.hand.length, 6);
  await p.getByRole("button", { name: "Mulligan once" }).click();
  await p.getByRole("button", { name: "Keep hand" }).click();
  s = await state(p);
  assert.equal(s.phase, "planning");
  assert.equal(s.hand.length, 7);
  assert.ok(s.heroes.every((h) => h.resources === 1));
  const handCard = p.locator(".hand-art").first();
  await handCard.click();
  assert.ok(await p.locator("dialog[open] .card-detail").isVisible());
  await p.getByRole("button", { name: "Close dialog" }).click();
  await p.getByRole("button", { name: "Begin quest", exact: true }).click();
  await p.locator(".character-art").first().click();
  await p.getByRole("button", { name: "Commit & reveal" }).click();
  await settle(p);
  s = await state(p);
  assert.equal(s.phase, "staging");
  await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
  await settle(p);
  s = await state(p);
  assert.equal(s.phase, "travel");
  const travel = p
    .locator(".board-card")
    .filter({
      has: p.getByRole("button", {
        name: "Inspect Old Forest Road",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Travel here" })
    .first();
  if (await travel.count()) await travel.click();
  else await p.getByRole("button", { name: "Continue without travel" }).click();
  await settle(p);
  await p.getByRole("button", { name: "Engagement checks" }).click();
  await settle(p);
  for (let i = 0; i < 20; i++) {
    s = await state(p);
    if (s.mode !== "playing" || s.phase !== "defense") break;
    await p.locator(".engaged-zone .card-action").first().click();
    const defender = p
      .locator("dialog[open] .choice-list .decision-select")
      .first();
    if (await defender.count()) await defender.click();
    else await p.getByRole("button", { name: /Leave undefended/ }).click();
    await p
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await settle(p);
  }
  s = await state(p);
  if (s.phase === "attack") {
    const enemy = p.locator(".engaged-zone .card-action").first();
    if (await enemy.count()) {
      await enemy.click();
      const ready = p.locator("dialog[open] .choice-list .decision-select");
      const n = await ready.count();
      for (let i = 0; i < n; i++) await ready.nth(i).click();
      if (n) await p.locator("dialog[open] .primary").click();
      else await p.getByRole("button", { name: "Cancel", exact: true }).click();
      await settle(p);
    }
    s = await state(p);
    if (s.mode === "playing") {
      await p.getByRole("button", { name: "Finish combat" }).click();
      await settle(p);
      await p.getByRole("button", { name: "Begin next round" }).click();
    }
  }
  s = await state(p);
  assert.equal(s.round, 2);
  await p.screenshot({
    path: `output/browser/${deck}-round-two.png`,
    fullPage: true,
  });
  const before = await state(p);
  await p.reload();
  await p
    .getByRole("button", { name: "Continue adventure", exact: true })
    .click();
  const after = await state(p);
  assert.deepEqual(after, before);
  reports.push({
    deck,
    round: after.round,
    phase: after.phase,
    threat: after.threat,
  });
  await context.close();
}
if (!process.env.DESKTOP_ONLY) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const p = await context.newPage();
  await installReviewHandler(p);
  p.on("pageerror", (e) => errors.push(`mobile: ${e.message}`));
  await p.goto(base);
  await p.waitForTimeout(400);
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  assert.ok(
    await p
      .locator(".sidebar")
      .evaluate((e) => e.getBoundingClientRect().right <= 0),
  );
  await p.screenshot({
    path: "output/browser/mobile-home.png",
    fullPage: true,
  });
  await p.locator("#start-btn").click();
  await p.getByRole("button", { name: "Keep hand" }).click();
  await p.screenshot({
    path: "output/browser/mobile-table.png",
    fullPage: true,
  });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.getByRole("button", { name: "Open navigation" }).click();
  await p.getByRole("button", { name: "Card library", exact: true }).click();
  await p.getByRole("textbox", { name: "Search cards" }).fill("Aragorn");
  await p.waitForTimeout(250);
  assert.ok((await p.locator(".catalog-card").count()) >= 1);
  await p.getByRole("checkbox", { name: "Scripted cards only" }).check();
  assert.equal(await p.locator(".catalog-card").count(), 1);
  await p.locator(".catalog-card").click();
  assert.ok(await p.locator("dialog[open]").isVisible());
  await p.keyboard.press("Escape");
  await p
    .getByRole("textbox", { name: "Search cards" })
    .fill("zzzznonexistent");
  assert.equal(await p.locator(".catalog-card").count(), 0);
  assert.ok(await p.getByText("No cards on this path.").isVisible());
  await p.getByRole("button", { name: "Clear filters" }).click();
  await p.screenshot({
    path: "output/browser/mobile-library.png",
    fullPage: true,
  });
  await context.close();
}
await browser.close();
await fs.writeFile(
  "output/browser/report.json",
  JSON.stringify({ reports, errors }, null, 2),
);
console.log(JSON.stringify({ reports, errors }, null, 2));
assert.deepEqual(errors, []);
