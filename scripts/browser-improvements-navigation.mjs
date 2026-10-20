import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { observeBrowserArtifact } from "./browser-artifact-evidence.mjs";
import { capture, report, url } from "./browser-angmar-helpers.mjs";

const dir =
  process.env.NAVIGATION_OUTPUT_DIR ?? "output/improvements-navigation";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  checks = [],
  screenshots = [],
  entries = new Set();
try {
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    observeBrowserArtifact(page);
    await page.goto(url);
    await page.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    for (const src of await page
      .locator('script[type="module"][src]')
      .evaluateAll((nodes) => nodes.map((node) => node.src)))
      entries.add(src);
    assert.notEqual(
      await page.evaluate(() => document.activeElement.id),
      "main-content",
      "initial load leaves keyboard focus undisturbed",
    );
    const panel = page.locator("#navigation-panel");
    assert.equal(await panel.locator('[aria-current="page"]').count(), 1);
    const opener = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    if (width < 900) {
      assert.equal(await panel.isVisible(), false);
      await page.locator(".skip-link").focus();
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(
            () => !!document.activeElement.closest("#navigation-panel"),
          ),
          false,
          "closed mobile navigation is absent from keyboard order",
        );
      }
    } else {
      assert.ok(await panel.isVisible());
      await panel
        .getByRole("button", { name: "Deck builder", exact: true })
        .focus();
      assert.ok(
        await page.evaluate(
          () => !!document.activeElement.closest("#navigation-panel"),
        ),
      );
    }
    checks.push(`closed navigation keyboard behavior @ ${width}`);
    if (width >= 900) await page.setViewportSize({ width: 390, height: 900 });
    await opener.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#navigation-panel")
          .getAttribute("aria-modal") === "true",
    );
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press("Tab");
      assert.ok(
        await page.evaluate(
          () => !!document.activeElement.closest("#navigation-panel"),
        ),
        "open mobile menu retains keyboard focus",
      );
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        document.activeElement.getAttribute("aria-label") === "Open navigation",
    );
    assert.equal(await panel.isVisible(), false);
    checks.push(
      `open navigation traps focus and Escape returns to its opener @ ${width}`,
    );
    await opener.click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(
      () =>
        !document.querySelector("#navigation-panel").hasAttribute("aria-modal"),
    );
    assert.ok(await panel.isVisible());
    assert.equal(await panel.getAttribute("role"), null);
    checks.push(
      `resize closes mobile dialog mode and preserves desktop navigation @ ${width}`,
    );
    await panel
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    await page.waitForFunction(
      () => JSON.parse(window.render_game_to_text()).mode === "guide",
    );
    await page.waitForFunction(
      () => document.activeElement.id === "main-content",
    );
    assert.equal(
      await panel
        .getByRole("button", { name: "How to play", exact: true })
        .getAttribute("aria-current"),
      "page",
    );
    await capture(page, dir, `navigation-${width}`, screenshots);
    checks.push(
      `desktop destination receives focus and current-page semantics @ ${width}`,
    );

    await page.setViewportSize({ width: Math.min(width, 390), height: 900 });
    await opener.click();
    await panel
      .getByRole("button", { name: "Deck builder", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(window.render_game_to_text()).mode === "decks" &&
        document.activeElement.id === "main-content" &&
        !!document.querySelector(".deck-builder"),
    );
    assert.equal(await panel.isVisible(), false);
    assert.equal(
      await panel
        .getByRole("button", {
          name: "Deck builder",
          exact: true,
          includeHidden: true,
        })
        .getAttribute("aria-current"),
      "page",
    );
    checks.push(
      `mobile destination focuses the loaded route instead of its menu opener @ ${width}`,
    );

    await opener.click();
    await panel
      .getByRole("button", { name: "Card library", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(window.render_game_to_text()).mode === "library" &&
        document.activeElement.id === "main-content" &&
        !!document.querySelector(".library"),
    );
    assert.equal(await panel.locator('[aria-current="page"]').count(), 1);
    await capture(page, dir, `mobile-destination-${width}`, screenshots);
    checks.push(
      `lazy library route receives focus without overflow @ ${width}`,
    );
    await context.close();
  }
  assert.equal(checks.length, 18);
  await report(dir, { checks, errors, screenshots, entries, smoke: false });
  console.log(`Navigation improvements: ${checks.length} checks passed.`);
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify({ failure: String(error), checks, errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
