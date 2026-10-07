import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { BUILT_IN_DECKS, PRECON_DECKS } from "../src/game/built-in-decks.ts";
import { card } from "../src/game/cards.ts";
import { startingThreat } from "../src/game/decks.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/preconstructed-decks";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const screenshots = [];
async function open() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await installReviewHandler(page);
  await page.goto(base);
  return { context, page };
}
const saved = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
async function capture(page, name) {
  await page.evaluate(async () => {
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
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${name}: horizontal overflow`,
  );
  const path = `${dir}/${name}.png`;
  await page.screenshot({ path });
  screenshots.push(path);
}
try {
  for (const d of PRECON_DECKS) {
    const { context, page } = await open();
    await page.getByRole("button", { name: /Classic solo/ }).click();
    assert.equal(
      await page.locator(".deck-choice[data-deck-id]").count(),
      BUILT_IN_DECKS.length,
    );
    const choice = page.locator(`[data-deck-id="${d.id}"]`);
    await choice.locator(".deck-choice-select").click();
    const images = choice.locator(".deck-hero-triptych img");
    assert.equal(await images.count(), 3);
    for (const img of await images.all()) {
      assert.match(
        await img.getAttribute("src"),
        /^\/cards\//,
        `${d.id}: hero portraits must use local card art`,
      );
      assert.ok(
        await img.evaluate(async (i) => {
          i.loading = "eager";
          await i.decode();
          return i.naturalWidth > 0;
        }),
      );
    }
    assert.deepEqual(
      await choice.locator(".deck-hero-triptych strong").allTextContents(),
      d.heroes.map((h) => card(h).name),
    );
    assert.match(
      await choice.locator(".deck-choice-facts").innerText(),
      new RegExp(
        `50 cards.*3 heroes[\\s\\S]*${startingThreat(d.heroes)} threat`,
      ),
    );
    await choice.locator(".deck-view").click();
    const dialog = page.getByRole("dialog");
    assert.ok(await dialog.isVisible());
    assert.equal(await dialog.locator(".deck-preview-heroes img").count(), 3);
    await page.keyboard.press("Escape");
    await page.reload();
    assert.equal(
      await choice.locator(".deck-choice-select").getAttribute("aria-pressed"),
      "true",
    );
    assert.deepEqual(
      await page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("there-and-back-again.decks.v1") ?? "[]",
        ),
      ),
      [],
    );
    if (d.id === "starter-gondor") {
      for (const [width, height] of [
        [1280, 900],
        [390, 844],
        [320, 750],
      ]) {
        await page.setViewportSize({ width, height });
        await choice.scrollIntoViewIfNeeded();
        await capture(page, `menu-${width}`);
      }
    }
    await page.locator("#start-btn").click();
    await reviewedState(page);
    const before = await saved(page);
    assert.equal(before.deckId, d.id);
    assert.deepEqual(before.startingHeroes, d.heroes);
    assert.equal(before.hand.length + before.deck.length, 50);
    assert.equal(before.threat, startingThreat(d.heroes));
    await page.reload();
    await page.locator("#start-btn").click();
    await reviewedState(page);
    const resumed = await saved(page);
    assert.deepEqual(resumed.hand, before.hand);
    assert.equal(resumed.originalSeed, before.originalSeed);
    await context.close();
  }
  const { context, page } = await open();
  await page.getByRole("button", { name: /Solo hot-seat/ }).click();
  await page.getByRole("button", { name: "4 players", exact: true }).click();
  const retail = PRECON_DECKS.filter((d) => d.group === "starter");
  // Replace the original Core seats in an order that frees each shared hero.
  for (let i = 0; i < retail.length; i++) {
    await page
      .getByRole("button", { name: `Edit Player ${i + 1} fellowship` })
      .click();
    await page
      .locator(`[data-deck-id="${retail[i].id}"] .deck-choice-select`)
      .click();
  }
  await page.getByRole("button", { name: "Edit Player 2 fellowship" }).click();
  assert.ok(
    await page
      .locator('[data-deck-id="limited-lore-tactics"] .deck-choice-select')
      .isDisabled(),
    "Bifur is already in the Dwarf fellowship",
  );
  await page.reload();
  await page.locator("#start-btn").click();
  await reviewedState(page);
  const table = await saved(page);
  assert.deepEqual(
    table.table.seats.map((p) => p.deckId),
    retail.map((d) => d.id),
  );
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(table.table.seats[i].startingHeroes, retail[i].heroes);
    assert.equal(
      table.table.seats[i].deck.length + table.table.seats[i].hand.length,
      50,
    );
  }
  await capture(page, "four-precon-players");
  await context.close();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify(
      { decks: PRECON_DECKS.map((d) => d.id), screenshots, errors },
      null,
      2,
    ),
  );
  console.log(
    "All six precons: exact heroes and 50-card decks, inspection, fresh-device selection, reload/resume, four-player setup and 1280/390/320px layouts; no browser errors.",
  );
} finally {
  await browser.close();
}
