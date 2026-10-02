import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5201";
const dir = "output/content-import";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

async function noOverflow(label) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${label}: no horizontal overflow`,
  );
}

async function prepareCapture(selector) {
  await page
    .locator(selector)
    .first()
    .evaluate((element) => {
      element.querySelectorAll("img").forEach((image) => {
        image.loading = "eager";
      });
    });
  await page.waitForFunction(
    (target) => {
      const element = document.querySelector(target);
      return (
        element &&
        [...element.querySelectorAll("img")].every((image) => image.complete)
      );
    },
    selector,
    { timeout: 25000 },
  );
  await page
    .locator("main .page-heading")
    .first()
    .click({ position: { x: 4, y: 4 } });
}

async function navigate(name) {
  const item = page.getByRole("button", { name, exact: true });
  if (!(await item.isVisible())) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  }
  await item.click();
}

await page.goto(base);
const registry = await page.evaluate(
  () => JSON.parse(window.render_game_to_text()).automatedPlay,
);
assert.ok(
  registry.heroCodes.includes("02001"),
  "Bilbo enters hero selection after The Hunt for Gollum is registered",
);
assert.ok(
  registry.deckCardCodes.some((code) => code.startsWith("02")),
  "registered expansion player cards are exposed",
);
assert.ok(
  registry.quests.includes("conflict-at-the-carrock"),
  "the registered Carrock quest is exposed",
);
const playableChoices = page.locator(".deck-choice:not(.deck-choice-build)");
assert.equal(
  await playableChoices.count(),
  registry.decks.length,
  "the registered starter choices stay available",
);
assert.equal(
  await playableChoices.locator('[data-deck-origin="app-built"]').count(),
  registry.decks.length,
  "every playable app deck explains its printed source",
);
assert.equal(
  await page.locator(".deck-hero-triptych .card-product-note").count(),
  registry.decks.reduce((total, deck) => total + deck.heroes.length, 0),
);
assert.equal(
  await page.locator(".mission-card").count(),
  registry.quests.length,
);
await page
  .getByRole("button", {
    name: /Conflict at the Carrock.*Trolls on the Anduin/s,
  })
  .click();
assert.equal(
  await page.locator(".journey-stage").count(),
  2,
  "Carrock displays its actual two quest stages",
);
await page
  .getByRole("button", {
    name: /Passage Through Mirkwood.*Beneath the ancient boughs/s,
  })
  .click();
await page.getByRole("button", { name: "Choose Spirit", exact: true }).click();
await page
  .getByRole("button", { name: "View Lore deck and heroes", exact: true })
  .click();
const preview = page.getByRole("dialog", {
  name: "Lore · Wisdom of the Wild",
  exact: true,
});
await preview.waitFor();
assert.equal(
  await preview.locator('[data-deck-origin="app-built"]').count(),
  1,
);
assert.match(
  await preview.locator(".deck-product-note").innerText(),
  /Core Set/,
);
await page.keyboard.press("Escape");
await page.reload();
assert.equal(
  await page
    .getByRole("button", { name: "Choose Spirit", exact: true })
    .getAttribute("aria-pressed"),
  "true",
  "inspecting source information does not alter the saved fellowship",
);

for (const [width, height] of [
  [1280, 800],
  [390, 844],
  [320, 750],
]) {
  await page.setViewportSize({ width, height });
  await page.locator("#fellowship-setup").scrollIntoViewIfNeeded();
  await noOverflow(`fellowship at ${width}px`);
  await page.screenshot({
    path: `${dir}/fellowship-${width}.png`,
    fullPage: true,
  });
  await page
    .locator(".deck-picker")
    .first()
    .screenshot({ path: `${dir}/deck-choices-${width}.png` });
}

await page.setViewportSize({ width: 1440, height: 1000 });
await navigate("Deck builder");
await page.getByRole("button", { name: "New deck", exact: true }).click();
assert.equal(
  await page.locator(".builder-hero").count(),
  registry.heroes,
  "imported heroes do not become selectable without implemented rules",
);
assert.equal(
  await page.locator(".builder-card").count(),
  registry.deckCards,
  "the builder keeps its supported card pool",
);
assert.equal(
  await page.locator(".builder-hero .card-product-note").count(),
  registry.heroes,
);
assert.equal(
  await page.locator(".builder-card .card-product-note").count(),
  registry.deckCards,
);
assert.match(
  await page.locator(".support-summary").innerText(),
  /Automated play/s,
);
assert.equal(
  await page.locator(".support-summary").getAttribute("data-supported-heroes"),
  String(registry.heroes),
);
assert.equal(
  await page
    .locator(".support-summary")
    .getAttribute("data-supported-deck-cards"),
  String(registry.deckCards),
);
await page
  .getByRole("button", { name: "Add Bilbo Baggins", exact: true })
  .click();
assert.equal(
  await page
    .getByRole("button", { name: "Remove Bilbo Baggins", exact: true })
    .getAttribute("aria-pressed"),
  "true",
);
await page
  .getByRole("button", { name: "Remove Bilbo Baggins", exact: true })
  .click();
await page
  .getByRole("combobox", { name: "Filter playable card product", exact: true })
  .selectOption("The Hunt for Gollum");
assert.ok((await page.locator(".builder-card").count()) > 0);
assert.ok(
  (
    await page.locator(".builder-card .card-product-note").allTextContents()
  ).every((name) => name === "The Hunt for Gollum"),
);
await page
  .getByRole("combobox", { name: "Filter playable card product", exact: true })
  .selectOption("all");
await page
  .locator('.builder-hero[data-card-code="01001"]')
  .getByRole("button", { name: "Add Aragorn", exact: true })
  .click();
assert.equal(
  await page
    .locator('.builder-hero[data-card-code="01001"]')
    .getByRole("button", { name: "Remove Aragorn", exact: true })
    .getAttribute("aria-pressed"),
  "true",
);
assert.equal(
  await page
    .locator('.builder-hero[data-card-code="04053"]')
    .getByRole("button", { name: "Add Aragorn", exact: true })
    .isDisabled(),
  true,
  "another version of the same unique hero cannot share the deck",
);
assert.match(
  await page.locator(".builder-summary .deck-product-note").innerText(),
  /Core Set/,
);
for (const [width, height] of [
  [1280, 800],
  [390, 844],
  [320, 750],
]) {
  await page.setViewportSize({ width, height });
  await noOverflow(`deck builder at ${width}px`);
  await page.screenshot({
    path: `${dir}/builder-${width}.png`,
    fullPage: true,
  });
  await page
    .locator(".builder-hero-grid")
    .screenshot({ path: `${dir}/builder-heroes-${width}.png` });
}
await page.getByRole("button", { name: "Cancel", exact: true }).click();

await page.setViewportSize({ width: 1440, height: 1000 });
const response = await page.request.get(`${base}/catalog.json`);
assert.equal(response.ok(), true);
const catalog = await response.json();
assert.ok(
  catalog.length > 1000,
  "the bundled snapshot imports the published card pool",
);
assert.ok(
  new Set(catalog.map((card) => card.pack_name)).size > 60,
  "original release products are included",
);
assert.ok(
  catalog.some((card) => card.nightmare),
  "Nightmare cards are included",
);
assert.ok(
  catalog.some((card) => card.sphere_code === "encounter"),
  "encounters and quests are included",
);

await navigate("My fellowship");
await page.locator(".published-starter").first().waitFor();
const publishedDecks = JSON.parse(
  await fs.readFile("public/published-decks.json", "utf8"),
);
const sourceCodes = new Map(
  catalog.map((c) => [c.code, c.engine_code ?? c.code]),
);
const automatedRecipe = (d) =>
  d.heroes.every((code) =>
    registry.heroCodes.includes(sourceCodes.get(code) ?? code),
  ) &&
  Object.keys(d.cards).every((code) =>
    registry.deckCardCodes.includes(sourceCodes.get(code) ?? code),
  );
const incompleteRecipe = publishedDecks.find((d) => !automatedRecipe(d));
assert.equal(
  await page.locator(".published-starter").count(),
  publishedDecks.length,
);
assert.equal(
  await page.locator(".deck-choice:not(.deck-choice-build)").count(),
  registry.decks.length,
  "reference starter decks do not silently enter automated play",
);
assert.match(
  await page.locator(".published-intro").innerText(),
  /sold separately/i,
);
await page.locator(".published-starter").first().click();
assert.match(
  await page.locator(".published-deck-detail").innerText(),
  /Official preconstructed list.*sold as its own starter deck/s,
);
assert.equal(
  await page
    .getByRole("button", { name: "Choose for play", exact: true })
    .isDisabled(),
  !automatedRecipe(publishedDecks[0]),
);
assert.match(
  await page.locator(".published-support").innerText(),
  /card designs automated/,
);
assert.equal(
  await page.locator(".published-selected-heroes .card-product-note").count(),
  3,
);
await page.locator(".published-selected-heroes > button").first().click();
await page.getByRole("dialog").waitFor();
await page.keyboard.press("Escape");
await prepareCapture(".published-decks");

for (const [width, height] of [
  [1280, 800],
  [390, 844],
  [320, 750],
]) {
  await page.setViewportSize({ width, height });
  await page.locator(".published-decks").scrollIntoViewIfNeeded();
  await noOverflow(`published deck at ${width}px`);
  await page.screenshot({
    path: `${dir}/published-deck-${width}.png`,
    fullPage: true,
  });
  await page.screenshot({ path: `${dir}/published-starters-${width}.png` });
}

await page.setViewportSize({ width: 1440, height: 1000 });
await page
  .getByRole("group", { name: "Published content", exact: true })
  .getByRole("button", { name: /^Heroes/ })
  .click();
const coreCards = JSON.parse(
  await fs.readFile("src/data/player-cards.json", "utf8"),
);
const originalHeroNames = new Set(
  catalog
    .filter((card) =>
      registry.heroCodes.includes(card.engine_code ?? card.code),
    )
    .map((card) => card.name),
);
const importedHero = catalog.find(
  (card) => card.type_code === "hero" && !originalHeroNames.has(card.name),
);
assert.ok(importedHero);
await page
  .getByRole("textbox", { name: "Search published heroes", exact: true })
  .fill(importedHero.name);
assert.ok((await page.locator(".published-hero").count()) > 0);
assert.match(
  await page.locator(".published-hero").first().innerText(),
  /Imported.*reference/,
);
assert.ok(
  (await page.locator(".published-hero .card-product-note").first().innerText())
    .length > 0,
);
await page.locator(".published-hero").first().click();
await page
  .getByRole("dialog", { name: importedHero.name, exact: true })
  .waitFor();
assert.ok(
  (await page.locator(".card-detail .source-note").innerText()).includes(
    importedHero.pack_name,
  ),
);
await page.keyboard.press("Escape");
await prepareCapture(".published-content");
for (const [width, height] of [
  [1280, 800],
  [390, 844],
  [320, 750],
]) {
  await page.setViewportSize({ width, height });
  await page.locator(".published-hero-search").scrollIntoViewIfNeeded();
  await noOverflow(`published heroes at ${width}px`);
  await page.screenshot({
    path: `${dir}/published-heroes-${width}.png`,
    fullPage: true,
  });
  await page.screenshot({ path: `${dir}/hero-search-${width}.png` });
}

await page.setViewportSize({ width: 1440, height: 1000 });
await navigate("Card library");
await page
  .getByRole("button", { name: "Reload library", exact: true })
  .waitFor();
assert.match(
  await page.locator(".library-summary").innerText(),
  new RegExp(`${catalog.length.toLocaleString()} imported records`),
);
assert.ok(
  (await page
    .getByRole("combobox", { name: "Filter set or product", exact: true })
    .locator("option")
    .count()) > 60,
);
await page
  .getByRole("combobox", { name: "Filter edition", exact: true })
  .selectOption("nightmare");
assert.ok((await page.locator(".catalog-card").count()) > 0);
assert.match(
  await page.locator(".catalog-card").first().innerText(),
  /Nightmare/,
);
await page.locator(".catalog-card").first().click();
await page.getByRole("dialog").waitFor();
await page.keyboard.press("Escape");
await prepareCapture(".catalog-grid");
for (const [width, height] of [
  [1280, 800],
  [390, 844],
  [320, 750],
]) {
  await page.setViewportSize({ width, height });
  await noOverflow(`archive at ${width}px`);
  await page.screenshot({
    path: `${dir}/archive-${width}.png`,
    fullPage: true,
  });
}

// An isolated supported recipe verifies shelf persistence separately from
// actual retail support. The second list uses a pending actual recipe when one remains.
const fixtureCards = Object.fromEntries(
  coreCards
    .filter((c) => c.type_code !== "hero")
    .slice(0, 17)
    .map((c, i) => [c.code, i === 16 ? 2 : 3]),
);
const supportedRecipe = {
  id: "supported-browser-fixture",
  productId: "core",
  name: "Supported recipe fixture",
  heroes: ["01001", "01002", "01003"],
  cards: fixtureCards,
  source_url: "https://example.com/official-supported-browser-fixture",
};
const shelfContext = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await shelfContext.route("**/published-decks.json", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify([
      supportedRecipe,
      incompleteRecipe ??
        publishedDecks.find((d) => d.id !== supportedRecipe.id),
    ]),
  }),
);
const shelf = await shelfContext.newPage();
shelf.on("pageerror", (e) => errors.push(e.message));
const unrelated = {
  id: "unrelated",
  name: "Keep this list",
  heroes: ["01007"],
  cards: fixtureCards,
  updatedAt: 1,
};
await shelf.goto(base);
await shelf.evaluate(
  (d) =>
    localStorage.setItem("there-and-back-again.decks.v1", JSON.stringify([d])),
  unrelated,
);
await shelf.reload();
await shelf.getByRole("button", { name: "My fellowship", exact: true }).click();
await shelf.locator(".published-starter").first().click();
assert.ok(
  await shelf
    .getByRole("button", { name: "Choose for play", exact: true })
    .isEnabled(),
);
await shelf
  .getByRole("button", { name: "Choose for play", exact: true })
  .click();
await shelf.waitForFunction(
  () =>
    JSON.parse(localStorage.getItem("there-and-back-again.decks.v1")).length ===
    2,
);
const savedShelf = await shelf.evaluate(() =>
  JSON.parse(localStorage.getItem("there-and-back-again.decks.v1")),
);
assert.deepEqual(
  savedShelf.find((d) => d.id === unrelated.id),
  unrelated,
  "choosing a published recipe preserves unrelated lists",
);
const chosen = savedShelf.find((d) => d.source === supportedRecipe.source_url);
assert.deepEqual(chosen.cards, fixtureCards);
assert.deepEqual(chosen.heroes, supportedRecipe.heroes);
assert.equal(chosen.productId, "core");
assert.equal(chosen.deckKind, "official-preconstructed");
await shelf.reload();
assert.equal(
  await shelf
    .getByRole("button", {
      name: "Choose Supported recipe fixture",
      exact: true,
    })
    .getAttribute("aria-pressed"),
  "true",
  "the chosen published recipe survives reload",
);
await shelf.getByRole("button", { name: "My fellowship", exact: true }).click();
await shelf.locator(".published-starter").first().click();
await shelf
  .getByRole("button", { name: "Choose for play", exact: true })
  .click();
assert.equal(
  (
    await shelf.evaluate(() =>
      JSON.parse(localStorage.getItem("there-and-back-again.decks.v1")),
    )
  ).length,
  2,
  "choosing the same recipe reuses its saved list",
);
await shelf.getByRole("button", { name: "My fellowship", exact: true }).click();
await shelf.locator(".published-starter").nth(1).click();
assert.equal(
  await shelf
    .getByRole("button", { name: "Choose for play", exact: true })
    .isDisabled(),
  !!incompleteRecipe,
  "the actual second retail list follows registered support",
);
await shelfContext.close();

assert.deepEqual(errors, [], "no browser errors");
await browser.close();
console.log(
  "Content import UI passed: full player/encounter/Nightmare archive, official starter origins, imported hero inspection, supported play pool, saved selection, and responsive layouts.",
);
