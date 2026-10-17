import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { SCENARIOS } from "../src/game/scenarios.ts";
import {
  context,
  capture,
  opening,
  next as advancePhase,
  report,
  url,
} from "./browser-angmar-helpers.mjs";

const dir = process.env.DESIGN_OUTPUT_DIR ?? "output/adventure-design";
await fs.mkdir(dir, { recursive: true });
const launch = { headless: true };
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  const value = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (value) {
    const proxy = new URL(value);
    launch.proxy = {
      server: `${proxy.protocol}//${proxy.host}`,
      username: decodeURIComponent(proxy.username),
      password: decodeURIComponent(proxy.password),
    };
  }
}
const browser = await chromium.launch(launch);
const errors = [],
  checks = [],
  screenshots = [],
  entries = new Set();
let page;
const check = (label, width) => {
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
};
async function galleryControlsSettled() {
  await page.waitForFunction(() => {
    const list = document.querySelector("#fellowship-gallery .deck-picker");
    return (
      document.querySelector('[aria-label="Previous fellowships"]').disabled ===
        list.scrollLeft <= 2 &&
      document.querySelector('[aria-label="Next fellowships"]').disabled ===
        list.scrollLeft + list.clientWidth >= list.scrollWidth - 2
    );
  });
}
async function focused(id) {
  await page.waitForFunction((id) => document.activeElement.id === id, id);
}
try {
  for (const width of [1440, 768, 390, 320]) {
    const { c, p } = await context(browser, width, 1000, errors, entries);
    page = p;
    await page
      .getByRole("button", { name: "Choose your adventure", exact: true })
      .click();
    await focused("quest-selection");
    assert.equal(await page.locator(".mission-card").count(), SCENARIOS.length);
    await capture(page, dir, `archive-${width}`, screenshots);
    check("landing reaches adventure archive without overflow", width);

    const search = page.getByRole("searchbox", { name: "Search adventures" });
    const collection = page.getByRole("combobox", {
      name: "Filter adventures by collection",
    });
    await search.fill("NUMENOR");
    assert.equal(
      await page.locator(".mission-card").count(),
      1,
      "accent-insensitive title and collection search",
    );
    await search.fill("framsburg");
    assert.equal(await page.locator(".mission-card").count(), 1);
    await page.locator(".mission-the-ghost-of-framsburg").click();
    assert.equal(
      await page
        .locator(".mission-the-ghost-of-framsburg")
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.match(
      await page.locator("#adventure-preview-title").innerText(),
      /Framsburg/,
    );
    await page.locator(".mission-current").click();
    await focused("adventure-preview");
    check("accent-insensitive search and selected adventure preview", width);

    await search.fill("no such adventure xyz");
    assert.equal(await page.locator(".mission-card").count(), 0);
    assert.ok(
      await page
        .getByRole("heading", { name: "No adventures found" })
        .isVisible(),
    );
    await page.getByRole("button", { name: "Show all adventures" }).click();
    assert.equal(await page.locator(".mission-card").count(), SCENARIOS.length);
    assert.equal(await search.inputValue(), "");
    assert.equal(
      await search.evaluate((e) => e === document.activeElement),
      true,
    );
    check("empty search recovers with keyboard focus", width);

    await collection.selectOption({ label: "Ered Mithrin" });
    assert.ok((await page.locator(".mission-card").count()) >= 7);
    assert.equal(await page.locator(".mission-mirkwood").count(), 0);
    await search.fill("night");
    assert.equal(await page.locator(".mission-card").count(), 1);
    await page.locator(".mission-fire-in-the-night").click();
    await capture(page, dir, `filtered-${width}`, screenshots);
    await page.getByRole("button", { name: "Clear filters" }).click();
    assert.equal(await collection.inputValue(), "");
    assert.equal(await page.locator(".mission-card").count(), SCENARIOS.length);
    check("collection and title filters combine and clear", width);

    await page.reload();
    assert.equal(
      await page
        .locator(".mission-fire-in-the-night")
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: /Campaign mode/ }).click();
    assert.equal(await page.locator(".adventure-filters").count(), 0);
    assert.equal(await page.locator(".mission-card:not(:disabled)").count(), 1);
    await page.getByRole("button", { name: /Normal game/ }).click();
    check("quest selection survives reload and campaign stays locked", width);

    await page.locator('.journey-steps a[href="#fellowship-setup"]').click();
    await focused("fellowship-setup");
    const gallery = page.locator("#fellowship-gallery .deck-picker");
    const next = page.getByRole("button", {
      name: "Next fellowships",
      exact: true,
    });
    const previous = page.getByRole("button", {
      name: "Previous fellowships",
      exact: true,
    });
    assert.equal(
      await page.locator(".deck-choice:not(.deck-choice-build)").count(),
      10,
    );
    assert.ok(await previous.isDisabled());
    await next.click();
    await page.waitForFunction(
      () =>
        document.querySelector("#fellowship-gallery .deck-picker").scrollLeft >
        0,
    );
    await galleryControlsSettled();
    assert.ok(await previous.isEnabled());
    for (let i = 0; i < 14 && (await next.isEnabled()); i++) {
      await next.click();
      await galleryControlsSettled();
    }
    assert.ok(await next.isDisabled());
    assert.ok(
      await gallery.evaluate(
        (e) => e.scrollLeft + e.clientWidth >= e.scrollWidth - 2,
      ),
    );
    await page.getByRole("button", { name: /Classic solo/ }).click();
    await page
      .getByRole("button", { name: "Choose Spirit", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Choose Spirit", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await capture(page, dir, `gallery-${width}`, screenshots);
    check("gallery controls reach both edges and select a fellowship", width);

    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page.getByRole("button", { name: "3 players", exact: true }).click();
    await page
      .getByRole("button", { name: "Edit Player 2 fellowship", exact: true })
      .click();
    assert.ok(
      await page
        .getByRole("button", { name: "Choose Leadership", exact: true })
        .isDisabled(),
    );
    await page
      .getByRole("button", { name: "Choose Lore", exact: true })
      .click();
    const state = await page.evaluate(() =>
      JSON.parse(window.render_game_to_text()),
    );
    assert.deepEqual(state.fellowship.seatDecks, [
      "leadership",
      "lore",
      "spirit",
    ]);
    check("hot-seat selection preserves distinct heroes", width);

    await page.getByRole("button", { name: "1 player", exact: true }).click();
    await search.fill("passage through");
    await page.locator(".mission-mirkwood").click();
    await page.locator(".mission-current").click();
    await capture(page, dir, `preview-${width}`, screenshots);
    await page.locator("#start-btn").click();
    const game = await opening(page);
    assert.equal(game.scenarioId, "mirkwood");
    assert.equal(game.phase, "resource");
    assert.equal((await advancePhase(page)).phase, "planning");
    check("selected fellowship starts a playable adventure", width);
    await c.close();
  }
  assert.equal(checks.length, 32);
  await report(dir, { checks, errors, screenshots, entries, smoke: false });
  console.log(`Adventure design: ${checks.length} checks passed.`);
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
    await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
