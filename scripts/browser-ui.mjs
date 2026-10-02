import { finishResourcePhase } from "./browser-review-helpers.mjs";
import {
  installReviewHandler,
  acknowledgeReviews,
  reviewedState,
} from "./browser-review-helpers.mjs";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.GAME_URL ?? "http://localhost:5178";
const dir = "output/ui-review";
await fs.mkdir(dir, { recursive: true });
const fixture = JSON.parse(await fs.readFile(`${dir}/fixture.json`, "utf8"));
const browser = await chromium.launch({ headless: true });
const errors = [];
const state = reviewedState;
async function page(width = 1440, height = 1000) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const p = await context.newPage();
  await installReviewHandler(p);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.goto(base);
  await p.getByRole("button", { name: /Classic solo/ }).click();
  return p;
}
async function load(p) {
  await p.evaluate((save) => {
    localStorage.removeItem("there-and-back-again.choices.v1");
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(save));
  }, fixture);
  await p.reload();
  await p.locator(".landing-primary").click();
}
async function shot(p, name) {
  await acknowledgeReviews(p);
  await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: no page overflow`,
  );
}
const p = await page();
await load(p);
const originalHand = (await state(p)).hand.map((u) => u.id);
await p.getByRole("combobox", { name: "Sort hand" }).selectOption("cost");
assert.equal(
  await p.locator(".hand-art").first().getAttribute("aria-label"),
  "Inspect Common Cause",
);
assert.equal(
  await p.locator(".hand-art").last().getAttribute("aria-label"),
  "Inspect Gandalf",
);
assert.deepEqual(
  (await state(p)).hand.map((u) => u.id),
  originalHand,
  "presentation sorting never changes the saved hand",
);
await p.getByRole("button", { name: /playable now/ }).click();
assert.equal(
  await p.locator(".hand-card").count(),
  3,
  "only affordable cards with a legal target are shown",
);
await p.getByRole("button", { name: /playable now/ }).click();
const unavailable = p.locator(".hand-card").filter({
  has: p.locator('.hand-art[aria-description*="target"]'),
});
assert.ok(await unavailable.count());
assert.equal(await unavailable.locator(".hand-play").count(), 0);
await p.keyboard.press("?");
assert.ok(
  await p.getByRole("dialog", { name: "Make the table yours" }).isVisible(),
);
await p.getByRole("button", { name: "Compact", exact: true }).click();
await p.getByRole("checkbox", { name: /Hover card previews/ }).uncheck();
await p.keyboard.press("Escape");
assert.ok(await p.locator(".app.density-compact").count());
await p.reload();
await p.locator(".landing-primary").click();
assert.equal(
  await p.getByRole("combobox", { name: "Sort hand" }).inputValue(),
  "cost",
);
assert.ok(await p.locator(".app.density-compact").count());
await p.getByRole("button", { name: "Table preferences", exact: true }).click();
assert.equal(
  await p.getByRole("checkbox", { name: /Hover card previews/ }).isChecked(),
  false,
);
await p.getByRole("checkbox", { name: /Hover card previews/ }).check();
await p.getByRole("button", { name: "Comfortable", exact: true }).click();
await p.keyboard.press("Escape");
await p.locator(".character-art img").first().hover();
await p.locator(".hover-preview").waitFor();
await p.screenshot({ path: `${dir}/hover-preview.png` });
const hoverRect = await p.locator(".hover-preview").boundingBox();
assert.ok(
  hoverRect && hoverRect.y >= 0 && hoverRect.y + hoverRect.height <= 1000,
  "preview stays within the viewport",
);
await p.mouse.move(1400, 80);
await p.locator(".hover-preview").waitFor({ state: "detached" });
await p.getByRole("button", { name: /Celebrían.s Stone/ }).click();
assert.ok(
  await p.getByRole("dialog", { name: /Celebrían.s Stone/ }).isVisible(),
);
await p.keyboard.press("n");
assert.equal((await state(p)).phase, "planning");
await p.keyboard.press("Escape");
await p
  .getByRole("button", { name: "Inspect Steward of Gondor", exact: true })
  .click();
assert.ok(
  await p
    .getByRole("button", { name: "Play this card", exact: true })
    .isEnabled(),
);
await shot(p, "card-inspector");
await p.getByRole("button", { name: "Play this card", exact: true }).click();
await p
  .getByRole("dialog")
  .locator(
    `.target-selection [data-unit-id="${fixture.heroes[0].id}"] .decision-select`,
  )
  .click();
await p
  .getByRole("dialog")
  .getByRole("button", { name: "Play card", exact: true })
  .click();
assert.ok(
  (await state(p)).heroes[0].attachments.some((a) => a.code === "01026"),
);
await p
  .getByRole("button", { name: "View discard piles", exact: true })
  .click();
assert.ok(await p.getByRole("button", { name: /Ever Vigilant/ }).isVisible());
await p.getByRole("button", { name: /Encounters ·/ }).click();
assert.ok(
  await p.getByRole("button", { name: /Dol Guldur Beastmaster/ }).isVisible(),
);
await shot(p, "discard-piles");
await p.getByRole("button", { name: /Dol Guldur Beastmaster/ }).click();
assert.ok(
  await p
    .getByRole("dialog", { name: "Dol Guldur Beastmaster", exact: true })
    .isVisible(),
);
await p.keyboard.press("Escape");
await p.keyboard.press("Escape");
await p.keyboard.press("n");
assert.equal((await state(p)).phase, "quest");
await p.locator(".character-art").first().click();
assert.equal(
  await p.locator(".character-art").first().getAttribute("aria-pressed"),
  "true",
);
assert.equal((await state(p)).willpower, 2);
assert.ok(await p.getByLabel("Quest forecast").isVisible());
await shot(p, "quest-forecast");
await p.keyboard.press("u");
assert.equal((await state(p)).willpower, 0);
await p.keyboard.press("h");
assert.ok(await p.locator("#your-hand").isVisible());
await p
  .getByRole("navigation")
  .getByRole("button", { name: "Adventures", exact: true })
  .click();
await p.getByRole("button", { name: "Choose Lore", exact: true }).click();
assert.equal(await p.locator("#start-btn").textContent(), "Begin adventure");
await p.locator("#start-btn").click();
assert.ok(await p.getByRole("dialog", { name: "A new journey?" }).isVisible());
await p.keyboard.press("Escape");
assert.equal(
  JSON.parse(
    await p.evaluate(() =>
      localStorage.getItem("there-and-back-again.save.v1"),
    ),
  ).deckId,
  "leadership",
);
await p.context().close();
for (const width of process.env.DESKTOP_ONLY
  ? [1280, 1440, 1920]
  : [320, 390, 768, 820, 1024, 1280, 1440, 1920]) {
  const p = await page(width, width < 768 ? 844 : 1000);
  await p.locator(".mission-anduin").click();
  await shot(p, `lobby-${width}`);
  await p.locator(".mission-dol-guldur").click();
  assert.ok(await p.locator(".adventure-dol-guldur").isVisible());
  await p.locator(".mission-mirkwood").click();
  await p.locator("#start-btn").click();
  await acknowledgeReviews(p);
  const keep = p.getByRole("button", { name: "Keep hand", exact: true });
  assert.equal(await keep.count(), 1);
  if (width < 768) {
    const rect = await keep.boundingBox();
    assert.ok(
      rect.y + rect.height <= 844 && rect.y > 0,
      "mobile action in viewport",
    );
  }
  await keep.click();
  await finishResourcePhase(p);
  await shot(p, `table-${width}`);
  await p.getByRole("button", { name: "Begin quest", exact: true }).click();
  await p.locator(".character-art").first().click();
  await shot(p, `quest-${width}`);
  if (width < 768) {
    await p
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    const dialog = p.getByRole("dialog", { name: "Main navigation" });
    assert.ok(await dialog.isVisible());
    await p.keyboard.press("Shift+Tab");
    assert.equal(
      await p.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      ),
      "Return to adventure",
    );
    await p.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    await p
      .getByRole("button", { name: "Table preferences", exact: true })
      .click();
    await shot(p, `preferences-${width}`);
    await p.keyboard.press("Escape");
  }
  await p.context().close();
  console.log(
    `${width}px: mission selection, table, quest selection, action reachability, no overflow`,
  );
}
const laptop = await page(1280, 720);
await laptop.locator("#start-btn").click();
await laptop.getByRole("button", { name: "Keep hand", exact: true }).click();
await finishResourcePhase(laptop);
const firstPlay = await laptop.locator(".hand-play").first().boundingBox();
assert.ok(
  firstPlay && firstPlay.y + firstPlay.height <= 720,
  "opening hand actions fit a short laptop window",
);
await shot(laptop, "laptop-720");
await laptop.context().close();
await browser.close();
assert.deepEqual(errors, []);
console.log(
  "Hand sorting/filtering, preferences persistence, preview, inspector play, attachment inspection, discard piles, shortcuts and mode-safe restart all passed.",
);
