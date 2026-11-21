// The card library opens a rulesheet card with its transcribed rules: a
// scanned card with both faces, and a card whose rules come from the
// publisher's rules PDF (no scan: the art falls back to the card's name).
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/rules-sheets";
await fs.mkdir(dir, { recursive: true });
const VOYAGE = "octgn:c59be48d-ccec-4409-92b3-9f2e74f01012";
const LONG_ARM = "octgn:c8b7732f-8513-4797-a5a3-c579e5d353da";
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [];
try {
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [320, 750],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      // The card without a scan keeps the snapshot's image address, which
      // the image source does not serve: its art falls back to the name.
      if (
        m.type() === "error" &&
        !m.location().url?.includes(LONG_ARM.slice("octgn:".length))
      )
        errors.push(m.text());
    });
    await p.goto(base);
    const openNavigation = p.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    if (await openNavigation.isVisible()) await openNavigation.click();
    await p.getByRole("button", { name: "Card library", exact: true }).click();
    await p.getByLabel("Filter card type").selectOption("rules");

    // A scanned rulesheet card: three Voyage Across Belegaer cards, local art.
    await p.getByLabel("Search cards").fill("Voyage Across Belegaer");
    const voyageCards = p.locator(".catalog-card");
    await voyageCards.first().waitFor();
    assert.equal(await voyageCards.count(), 3);
    for (const image of await voyageCards.locator("img").all()) {
      await image.evaluate(async (i) => {
        i.loading = "eager";
        await i.decode();
      });
      assert.match(await image.getAttribute("src"), /^\/cards\/.+\.jpg$/);
    }
    await p
      .locator(`.catalog-card:has(img[data-card-code="${VOYAGE}"])`)
      .click();
    let dialog = p.getByRole("dialog", {
      name: "Voyage Across Belegaer",
      exact: true,
    });
    await dialog.waitFor();
    const front = await dialog.locator("[data-card-primary-rules]").innerText();
    assert.match(front, /^The Voyage Across Belegaer encounter deck/);
    assert.match(front, /\nShip-Enemies\n/);
    assert.match(front, /Difficulty level = 5\.$/);
    assert.doesNotMatch(front, /Rulesheet Card/);
    assert.match(
      await dialog.locator("[data-card-other-face]").innerText(),
      /The Corsair Deck/,
    );
    await dialog
      .getByRole("button", { name: "Show reverse", exact: true })
      .click();
    await dialog.locator("img").evaluate(async (i) => {
      await i.decode();
    });
    assert.match(await dialog.locator("img").getAttribute("src"), /\.B\.jpg$/);
    assert.match(
      await dialog.locator("[data-card-primary-rules]").innerText(),
      /^The Corsair Deck\n/,
    );
    let bounds = await dialog.boundingBox();
    assert.ok(
      bounds.y >= 0 && bounds.y + bounds.height <= height + 1,
      `Voyage: clipped dialog at ${width}`,
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Voyage: overflow at ${width}`,
    );
    let path = `${dir}/voyage-${width}.png`;
    await p.screenshot({ path });
    screenshots.push(path);
    await p.keyboard.press("Escape");

    // The rules from the publisher's rules PDF, on one face.
    await p.getByLabel("Search cards").fill("The Long Arm of Mordor");
    const longArm = p.locator(".catalog-card");
    await longArm.first().waitFor();
    assert.equal(await longArm.count(), 1);
    await longArm.click();
    dialog = p.getByRole("dialog", {
      name: "The Long Arm of Mordor",
      exact: true,
    });
    await dialog.waitFor();
    const rules = await dialog.locator("[data-card-primary-rules]").innerText();
    assert.match(
      rules,
      /^"The Long Arm of Mordor" is played with an encounter deck/,
    );
    assert.match(rules, /\nObjective-Heroes\n/);
    assert.match(rules, /Difficulty level = 7$/);
    assert.equal(
      await dialog.getByRole("button", { name: "Show reverse" }).count(),
      0,
    );
    assert.equal(await dialog.locator("[data-card-other-face]").count(), 0);
    await dialog.locator(".art-fallback").waitFor();
    bounds = await dialog.boundingBox();
    assert.ok(
      bounds.y >= 0 && bounds.y + bounds.height <= height + 1,
      `Long Arm: clipped dialog at ${width}`,
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Long Arm: overflow at ${width}`,
    );
    path = `${dir}/long-arm-${width}.png`;
    await p.screenshot({ path });
    screenshots.push(path);
    await p.keyboard.press("Escape");
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, screenshots }, null, 2));
} finally {
  await browser.close();
}
