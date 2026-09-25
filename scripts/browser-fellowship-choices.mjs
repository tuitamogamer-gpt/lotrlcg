import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const browser = await (
  process.env.BROWSER === "webkit" ? webkit : chromium
).launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await fs.mkdir("output/fellowship-choices", { recursive: true });
await page.goto(base);
const state = () =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
assert.equal(await page.locator("main select").count(), 0);
assert.equal(await page.locator(".deck-choice").count(), 4);
assert.equal(await page.locator(".deck-hero-triptych img").count(), 12);
await page.getByRole("button", { name: /Classic solo/ }).click();
await page.getByRole("button", { name: "Choose Spirit", exact: true }).click();
await page.getByRole("button", { name: "View Lore deck and heroes" }).click();
assert.ok(
  await page
    .getByRole("dialog", { name: "Lore · Wisdom of the Wild" })
    .isVisible(),
);
await page.getByRole("button", { name: /Beravor.*Inspect hero/ }).click();
assert.ok(
  await page.getByRole("dialog", { name: "Beravor", exact: true }).isVisible(),
);
await page.keyboard.press("Escape");
assert.ok(
  await page
    .getByRole("dialog", { name: "Lore · Wisdom of the Wild" })
    .isVisible(),
);
await page.keyboard.press("Escape");
assert.equal(
  (await state()).fellowship.selectedDeck,
  "spirit",
  "inspecting does not change selected deck",
);
await page.getByRole("button", { name: /Journey Along the Anduin/ }).click();
await page.reload();
assert.equal((await state()).fellowship.selectedDeck, "spirit");
assert.equal((await state()).fellowship.scenario, "anduin");
await page
  .locator("#fellowship-setup")
  .screenshot({ path: "output/fellowship-choices/desktop-decks.png" });
await page.getByRole("button", { name: /Solo hot-seat/ }).click();
await page.getByRole("button", { name: "3 players", exact: true }).click();
await page.getByRole("button", { name: "Edit Player 2 fellowship" }).click();
assert.ok(
  await page
    .getByRole("button", { name: "Choose Leadership", exact: true })
    .isDisabled(),
);
await page.getByRole("button", { name: "Choose Lore", exact: true }).click();
assert.deepEqual((await state()).fellowship.seatDecks, [
  "leadership",
  "lore",
  "spirit",
]);
await page.reload();
assert.deepEqual((await state()).fellowship.seatDecks, [
  "leadership",
  "lore",
  "spirit",
]);
await page.getByRole("button", { name: "Edit Player 2 fellowship" }).click();
await page
  .locator("#fellowship-setup")
  .screenshot({ path: "output/fellowship-choices/hotseat-decks.png" });
await page.getByRole("button", { name: "Sign in or register" }).click();
assert.ok(await page.getByText("Accounts are not connected yet.").isVisible());
await page.screenshot({
  path: "output/fellowship-choices/account-unconfigured.png",
});
await page.keyboard.press("Escape");
for (const [width, height] of [
  [1280, 720],
  [390, 844],
  [320, 750],
]) {
  await page.setViewportSize({ width, height });
  await page.locator("#fellowship-setup").scrollIntoViewIfNeeded();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `overflow ${width}`,
  );
  await page.screenshot({
    path: `output/fellowship-choices/decks-${width}.png`,
    fullPage: true,
  });
}
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "Fellowship choices: visual deck/hero selection, independent inspection, classic/hotseat persistence, unavailable accounts, responsive layouts; no browser errors.",
);
