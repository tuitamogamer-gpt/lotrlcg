import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { DECK_CARDS, deckProblems } from "../src/game/decks.ts";
import {
  capture,
  context,
  fresh,
  opening,
  report,
  resume,
} from "./browser-angmar-helpers.mjs";
const widths = process.env.RESERVE_WIDTHS
  ? process.env.RESERVE_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(widths.every((w) => [1280, 390, 320].includes(w)));
const dir = process.env.RESERVE_OUTPUT_DIR ?? "output/batch4-reserves";
await fs.mkdir(dir, { recursive: true });
const codes = [
  "17140",
  "09007",
  ...DECK_CARDS.map((c) => c.code).filter(
    (c) => !["17140", "09007"].includes(c),
  ),
].slice(0, 17);
const cards = Object.fromEntries(
  codes.map((code, i) => [code, i === 16 ? 2 : 3]),
);
const alpha = {
  id: "reserve-alpha",
  name: "Reserve Alpha",
  heroes: ["01001", "01002", "01003"],
  cards,
  updatedAt: 1,
};
const beta = {
  ...alpha,
  id: "reserve-beta",
  name: "Reserve Beta",
  heroes: ["01004", "01005", "01006"],
};
const flight = {
  ...alpha,
  id: "reserve-flight",
  name: "Flight Only",
  cards: {
    ...cards,
    "09007": 0,
    [DECK_CARDS.find((c) => !Object.hasOwn(cards, c.code)).code]: 3,
  },
};
for (const d of [alpha, beta, flight]) assert.deepEqual(deckProblems(d), []);
const browser = await chromium.launch({ headless: true }),
  errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];
const sourceScriptSha256 = crypto
  .createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
let page;
async function checkpoint(label, width) {
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
const chooseDeck = async (name) =>
  page
    .locator("#fellowship-setup")
    .getByRole("button", { name: `Choose ${name}`, exact: true })
    .click();
try {
  for (const width of widths) {
    const view = await context(
      browser,
      width,
      width === 1280 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    await page.evaluate(
      (decks) =>
        localStorage.setItem(
          "there-and-back-again.decks.v1",
          JSON.stringify(decks),
        ),
      [alpha, beta, flight],
    );
    await fresh(page, "mirkwood", 1, false);
    await page.getByRole("button", { name: /Classic solo/ }).click();
    await chooseDeck("Reserve Alpha");
    const one = page.getByRole("combobox", {
      name: "Player 1 Wind from the Sea reserves",
      exact: true,
    });
    assert.equal(await one.inputValue(), "3");
    assert.equal(
      await page
        .getByRole("combobox", {
          name: "Player 1 Ranger of the North reserves",
          exact: true,
        })
        .inputValue(),
      "3",
    );
    await one.selectOption("2");
    await one.scrollIntoViewIfNeeded();
    await checkpoint("classic-reserve-allocation", width);
    await page.locator("#start-btn").click();
    let s = await opening(page);
    assert.equal(s.batch4WindReserves[0], 2);
    assert.equal(s.rangerReserves[0], 3);
    await resume(page);
    await fresh(page, "mirkwood", 2, false);
    await chooseDeck("Reserve Alpha");
    await page
      .getByRole("button", { name: "Edit Player 2 fellowship", exact: true })
      .click();
    await chooseDeck("Reserve Beta");
    await page
      .getByRole("combobox", {
        name: "Player 1 Wind from the Sea reserves",
        exact: true,
      })
      .selectOption("0");
    await page
      .getByRole("combobox", {
        name: "Player 2 Wind from the Sea reserves",
        exact: true,
      })
      .selectOption("3");
    await page
      .locator("[data-encounter-reserve-setup]")
      .scrollIntoViewIfNeeded();
    await checkpoint("two-player-independent-reserves", width);
    await page.locator("#start-btn").click();
    s = await opening(page);
    assert.deepEqual(s.batch4WindReserves, { 0: 0, 1: 3 });
    assert.deepEqual(s.rangerReserves, { 0: 3, 1: 3 });
    await resume(page);
    await fresh(page, "mirkwood", 1, false);
    await chooseDeck("Flight Only");
    assert.equal(
      await page.locator("[data-encounter-reserve-setup] select").count(),
      1,
    );
    await page.locator("#start-btn").click();
    s = await opening(page);
    assert.equal(s.batch4WindReserves[0], 3);
    assert.equal(s.rangerReserves[0], 0);
    await checkpoint("single-encounter-design-default", width);
    await resume(page);
    await view.c.close();
  }
  await report(dir, {
    smoke: widths.join(",") !== "1280,390,320",
    sourceScriptSha256,
    errors,
    entries,
    screenshots,
    checks,
  });
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      { error: String(error), stack: error.stack, checks, errors },
      null,
      2,
    ),
  );
  if (page && !page.isClosed())
    await page.screenshot({ path: `${dir}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
