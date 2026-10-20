import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { HERO_CARDS } from "../src/game/decks.ts";
import { context, capture, report, url } from "./browser-angmar-helpers.mjs";
const dir = process.env.REVIEW_OUTPUT_DIR ?? "output/review-improvements";
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
let p;
const pass = (label, width) => {
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
};
async function nav(name) {
  const toggle = p.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
  await p
    .locator("#navigation-panel")
    .getByRole("button", { name, exact: true })
    .click();
  await p.waitForFunction(() => document.activeElement?.id === "main-content");
}
try {
  for (const width of [1440, 390, 320]) {
    const view = await context(browser, width, 900, errors, entries);
    p = view.p;
    await nav("Deck builder");
    await p.getByRole("button", { name: "New deck", exact: true }).click();
    await p
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Review fellowship");
    assert.equal(await p.locator(".builder-hero").count(), HERO_CARDS.length);
    assert.equal(await p.locator(".builder-card").count(), 48);
    assert.ok(
      await p
        .locator(".builder-hero-grid")
        .evaluate(
          (e) => e.clientHeight <= 350 && e.scrollHeight > e.clientHeight,
        ),
    );
    await p
      .getByRole("button", { name: "Show more deck cards", exact: true })
      .click();
    assert.equal(await p.locator(".builder-card").count(), 96);
    pass("bounded browsers keep the full collection reachable", width);

    const heroes = p.getByRole("searchbox", {
      name: "Search heroes",
      exact: true,
    });
    await heroes.fill("EOWYN");
    assert.ok((await p.locator(".builder-hero").count()) > 0);
    assert.ok(
      (await p.locator(".builder-hero").allTextContents()).every((t) =>
        t.includes("Éowyn"),
      ),
    );
    await p.locator('.builder-hero [aria-pressed="false"]').first().click();
    await heroes.fill("no hero matches xyz");
    assert.equal(
      await p.locator(".builder-hero").count(),
      1,
      "selected hero survives a nonmatching query",
    );
    assert.equal(
      await p.locator('.builder-hero [aria-pressed="true"]').count(),
      1,
    );
    await capture(p, dir, `selected-hero-${width}`, screenshots);
    await p.locator('.builder-hero [aria-pressed="true"]').click();
    assert.equal(await p.locator(".builder-hero").count(), 0);
    await p
      .getByRole("button", { name: "Clear hero search", exact: true })
      .click();
    assert.equal(await p.locator(".builder-hero").count(), HERO_CARDS.length);
    assert.equal(
      await heroes.evaluate((e) => e === document.activeElement),
      true,
    );
    pass("accent-insensitive hero search retains removable selections", width);

    const cards = p.getByRole("textbox", { name: "Search cards", exact: true });
    await cards.fill("DUNEDAIN");
    assert.ok((await p.locator(".builder-card").count()) > 0);
    await cards.fill("Gandalf");
    await p
      .getByRole("button", { name: "Add one Gandalf", exact: true })
      .first()
      .click();
    await cards.fill("no card matches xyz");
    assert.equal(await p.locator(".builder-card").count(), 0);
    await p
      .getByRole("button", { name: "Clear card filters", exact: true })
      .click();
    assert.equal(await p.locator(".builder-card").count(), 48);
    assert.equal(
      await cards.evaluate((e) => e === document.activeElement),
      true,
    );
    if (width < 861) {
      await p.locator(".builder-mobile-status").click();
      assert.equal(
        await p
          .locator("#deck-summary")
          .evaluate((e) => e === document.activeElement),
        true,
      );
    } else {
      await p.locator("#deck-summary").scrollIntoViewIfNeeded();
      assert.ok(
        await p
          .locator("#deck-summary")
          .evaluate((e) => e.getBoundingClientRect().top >= 110),
      );
    }
    await capture(p, dir, `deck-summary-${width}`, screenshots);
    pass("card filters recover and deck progress remains reachable", width);

    await nav("Card library");
    await p.getByRole("button", { name: "Heroes", exact: true }).click();
    const librarySearch = p.getByRole("textbox", {
      name: "Search cards",
      exact: true,
    });
    await librarySearch.fill("eowyn");
    await p.locator(".catalog-card").first().waitFor();
    assert.ok(
      (await p.locator(".catalog-card > div > span").allTextContents()).every(
        (t) => t.includes("Éowyn"),
      ),
    );
    await librarySearch.fill("no card matches xyz");
    await p.getByRole("button", { name: "Clear filters", exact: true }).click();
    assert.equal(
      await p
        .getByRole("button", { name: "Heroes", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.ok((await p.locator(".catalog-card").count()) > 0);
    pass(
      "library search handles accents and resets within its category",
      width,
    );

    await p
      .getByRole("combobox", { name: "Filter sphere", exact: true })
      .selectOption("spirit");
    await p
      .getByRole("button", { name: "Scenario lists", exact: true })
      .click();
    assert.equal(
      await p
        .getByRole("combobox", { name: "Filter sphere", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await p
        .getByRole("combobox", { name: "Filter card type", exact: true })
        .count(),
      0,
    );
    const scenarios = p.getByRole("textbox", {
      name: "Search scenarios",
      exact: true,
    });
    await scenarios.fill("Conflict at the Carrock");
    await p
      .getByRole("combobox", { name: "Filter scenario mode", exact: true })
      .selectOption("easy");
    await p.getByRole("button", { name: "Clear filters", exact: true }).click();
    await p.waitForFunction(
      () =>
        document.querySelector('[aria-label="Filter scenario mode"]').value ===
        "all",
    );
    assert.equal(
      await p
        .getByRole("combobox", { name: "Filter scenario mode", exact: true })
        .inputValue(),
      "all",
    );
    await scenarios.fill("Conflict at the Carrock");
    await p
      .getByRole("combobox", { name: "Filter scenario mode", exact: true })
      .selectOption("easy");
    await p.locator(".scenario-recipe").first().click();
    assert.ok(
      await p
        .getByRole("button", { name: "Choose adventure", exact: true })
        .isEnabled(),
    );
    await scenarios.fill("no scenario matches xyz");
    assert.equal(
      await p.locator(".published-deck-detail").count(),
      0,
      "out-of-filter selection cannot offer an unrelated adventure",
    );
    assert.equal(
      await p
        .getByRole("button", { name: "Choose adventure", exact: true })
        .count(),
      0,
    );
    await p
      .getByRole("button", { name: "Show all scenario lists", exact: true })
      .click();
    assert.equal(await scenarios.inputValue(), "");
    assert.equal(
      await p
        .getByRole("combobox", { name: "Filter scenario mode", exact: true })
        .inputValue(),
      "all",
    );
    assert.ok((await p.locator(".scenario-recipe").count()) > 0);
    pass(
      "scenario filters remove stale details and reset empty results",
      width,
    );

    await scenarios.fill("NUMENOR");
    assert.ok((await p.locator(".scenario-recipe").count()) > 0);
    await capture(p, dir, `scenario-search-${width}`, screenshots);
    await nav("Deck builder");
    assert.equal(
      await p
        .getByRole("textbox", { name: "Deck name", exact: true })
        .inputValue(),
      "Review fellowship",
    );
    assert.match(await p.locator(".builder-summary").innerText(), /Gandalf/);
    await p.getByRole("button", { name: "Save draft", exact: true }).click();
    assert.equal(await p.locator(".deck-shelf-item").count(), 1);
    pass(
      "library browsing preserves and explicitly saves the unfinished deck",
      width,
    );
    await view.c.close();
  }
  assert.equal(checks.length, 18);
  await report(dir, { checks, errors, screenshots, entries, smoke: false });
  console.log(`Review improvements: ${checks.length} checks passed.`);
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      { error: String(error), stack: error.stack, checks, errors },
      null,
      2,
    ),
  );
  if (p && !p.isClosed())
    await p.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
