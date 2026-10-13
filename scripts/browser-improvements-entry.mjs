import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { DECK_EDITOR_DRAFT_KEY } from "../src/ui/deck-editor-draft.ts";
import { DECKS_KEY } from "../src/game/decks.ts";

const url = process.env.GAME_URL ?? "http://127.0.0.1:5182";
process.env.GAME_URL = url;
const { context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const { installReviewHandler } = await import("./browser-review-helpers.mjs");
const dir = "output/improvements-entry";
await fs.mkdir(dir, { recursive: true });
const launch = { headless: true };
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  const value = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (value) {
    const proxy = new URL(value);
    launch.proxy = { server: `${proxy.protocol}//${proxy.host}` };
    if (proxy.username)
      launch.proxy.username = decodeURIComponent(proxy.username);
    if (proxy.password)
      launch.proxy.password = decodeURIComponent(proxy.password);
  }
}
const browser = await chromium.launch(launch);
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];
let activePage;
async function nav(p, label) {
  const menu = p.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await p
    .locator("#navigation-panel")
    .getByRole("button", { name: label, exact: true })
    .click();
  await p.locator("#main-content").waitFor({ state: "visible" });
}
async function stored(p, key) {
  return p.evaluate(
    ([key, draftKey]) =>
      JSON.parse(
        (key === draftKey ? sessionStorage : localStorage).getItem(key) ??
          "null",
      ),
    [key, DECK_EDITOR_DRAFT_KEY],
  );
}
async function snap(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function restored(p, expected) {
  assert.equal(
    await p
      .getByRole("textbox", { name: "Deck name", exact: true })
      .inputValue(),
    expected.deck.name,
  );
  await p
    .getByText("Your unfinished deck has been restored.", { exact: false })
    .waitFor();
  const actual = await stored(p, DECK_EDITOR_DRAFT_KEY);
  assert.deepEqual(actual.deck, expected.deck);
  assert.deepEqual(actual.report, expected.report);
  for (const hero of expected.deck.heroes)
    assert.equal(
      await p
        .locator(`[data-card-code="${hero}"] button`)
        .first()
        .getAttribute("aria-pressed"),
      "true",
    );
}
async function reloadBuilder(p) {
  await p.reload();
  await nav(p, "Deck builder");
}

try {
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [320, 750],
  ]) {
    const { c, p } = await context(browser, width, height, errors, entries);
    activePage = p;
    await nav(p, "Deck builder");
    await p.getByRole("button", { name: "New deck", exact: true }).click();
    await p
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Lanwyn's unfinished fellowship");
    for (const code of ["12030", "12001", "01004"])
      await p.locator(`[data-card-code="${code}"] button`).first().click();
    await p
      .getByRole("textbox", { name: "Search cards", exact: true })
      .fill("Gandalf");
    await p
      .getByRole("button", { name: "Add one Gandalf", exact: true })
      .first()
      .click();
    const unfinished = await stored(p, DECK_EDITOR_DRAFT_KEY);
    assert.equal(unfinished.deck.cards["01073"], 1);
    assert.deepEqual((await stored(p, DECKS_KEY)) ?? [], []);
    await snap(p, "unfinished-list-kept-separately", width);
    await nav(p, "Card library");
    await nav(p, "Deck builder");
    await restored(p, unfinished);
    await snap(p, "unfinished-list-restored-after-navigation", width);
    await reloadBuilder(p);
    await restored(p, unfinished);
    await snap(p, "unfinished-list-restored-after-reload", width);
    await p.getByRole("button", { name: "Save draft", exact: true }).click();
    assert.equal(await stored(p, DECK_EDITOR_DRAFT_KEY), null);
    const originalShelf = await stored(p, DECKS_KEY);
    assert.equal(originalShelf.length, 1);
    assert.equal(originalShelf[0].name, unfinished.deck.name);
    assert.deepEqual(originalShelf[0].cards, unfinished.deck.cards);
    const shelf = p.locator(".deck-shelf-item");
    await shelf.scrollIntoViewIfNeeded();
    const portraits = await shelf
      .locator(".deck-shelf-heroes img")
      .evaluateAll(async (images) =>
        Promise.all(
          images.map(async (image) => {
            await image.decode();
            return {
              src: new URL(image.src).pathname,
              width: image.naturalWidth,
            };
          }),
        ),
      );
    assert.deepEqual(
      portraits.map((p) => p.src),
      ["/cards/12030.jpg", "/cards/12001.jpg", "/cards/01004.png"],
    );
    assert.ok(portraits.every((p) => p.width > 0));
    await snap(p, "explicit-save-and-jpeg-png-hero-portraits", width);
    await shelf.getByRole("button", { name: "Edit", exact: true }).click();
    await p
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Unsaved change to saved deck");
    await p
      .getByRole("textbox", { name: "Search cards", exact: true })
      .fill("Gandalf");
    await p
      .getByRole("button", { name: "Remove one Gandalf", exact: true })
      .first()
      .click();
    const changed = await stored(p, DECK_EDITOR_DRAFT_KEY);
    assert.equal(changed.deck.cards["01073"], undefined);
    assert.deepEqual(await stored(p, DECKS_KEY), originalShelf);
    await nav(p, "Card library");
    await nav(p, "Deck builder");
    await restored(p, changed);
    await snap(p, "saved-deck-edit-restored-with-original-shelf-intact", width);
    await p.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await stored(p, DECK_EDITOR_DRAFT_KEY), null);
    assert.deepEqual(await stored(p, DECKS_KEY), originalShelf);
    await snap(p, "cancel-discards-only-unfinished-changes", width);
    await reloadBuilder(p);
    assert.equal(
      await p.getByRole("textbox", { name: "Deck name", exact: true }).count(),
      0,
    );
    assert.deepEqual(await stored(p, DECKS_KEY), originalShelf);
    await snap(p, "cancelled-copy-stays-cleared-after-reload", width);

    // Exercise the real public importer with a controlled public API response.
    await p.route(
      "https://ringsdb.com/api/public/decklist/424242.json",
      (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            name: "Imported source audit",
            heroes: { 12030: 1, 12001: 1, "01004": 1, "01001": 1 },
            slots: { "01073": 4, "01040": 2, 99999: 1, "01020": "invalid" },
          }),
        }),
    );
    await p
      .getByRole("textbox", { name: "RingsDB decklist link", exact: true })
      .fill("https://ringsdb.com/decklist/view/424242");
    await p.getByRole("button", { name: "Import", exact: true }).click();
    await p.getByRole("textbox", { name: "Deck name", exact: true }).waitFor();
    const imported = await stored(p, DECK_EDITOR_DRAFT_KEY);
    assert.equal(
      imported.deck.source,
      "https://ringsdb.com/decklist/view/424242",
    );
    assert.equal(imported.deck.cards["01073"], 3);
    assert.ok(imported.report.some((line) => line.includes("99999 skipped")));
    assert.ok(
      imported.report.some(
        (line) => line.includes("Hero left out") && line.includes("Aragorn"),
      ),
    );
    assert.ok(
      imported.report.some((line) => line.includes("reduced to the limit")),
    );
    assert.ok(
      imported.report.some((line) => line.includes("invalid quantity")),
    );
    assert.deepEqual(await stored(p, DECKS_KEY), originalShelf);
    await snap(p, "real-import-keeps-provenance-and-adjustments", width);
    await nav(p, "Card library");
    await nav(p, "Deck builder");
    await restored(p, imported);
    for (const line of imported.report)
      assert.ok(await p.getByText(line, { exact: true }).isVisible());
    await snap(p, "import-adjustments-restored-after-navigation", width);
    await reloadBuilder(p);
    await restored(p, imported);
    for (const line of imported.report)
      assert.ok(await p.getByText(line, { exact: true }).isVisible());
    await snap(p, "import-adjustments-restored-after-reload", width);
    await p.getByRole("button", { name: "Save draft", exact: true }).click();
    assert.equal(await stored(p, DECK_EDITOR_DRAFT_KEY), null);
    const twoDecks = await stored(p, DECKS_KEY);
    assert.equal(twoDecks.length, 2);
    assert.equal(twoDecks[0].source, imported.deck.source);
    assert.deepEqual(twoDecks[1], originalShelf[0]);
    await snap(p, "import-explicit-save-preserves-source", width);

    await p.evaluate(
      (key) =>
        sessionStorage.setItem(
          key,
          '{"version":1,"deck":{"heroes":["unknown"]}}',
        ),
      DECK_EDITOR_DRAFT_KEY,
    );
    await reloadBuilder(p);
    assert.equal(
      await p.getByRole("textbox", { name: "Deck name", exact: true }).count(),
      0,
    );
    assert.deepEqual(await stored(p, DECKS_KEY), twoDecks);
    await snap(p, "corrupt-working-copy-preserves-saved-decks", width);
    await p.evaluate(
      (key) => sessionStorage.removeItem(key),
      DECK_EDITOR_DRAFT_KEY,
    );
    await p.evaluate((key) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (this === sessionStorage && name === key)
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        return original.call(this, name, value);
      };
    }, DECK_EDITOR_DRAFT_KEY);
    await p.getByRole("button", { name: "New deck", exact: true }).click();
    await p
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Working despite unavailable draft storage");
    await p
      .getByText("Your unfinished changes could not be kept in this tab.", {
        exact: false,
      })
      .waitFor();
    assert.equal(
      await p
        .getByRole("textbox", { name: "Deck name", exact: true })
        .inputValue(),
      "Working despite unavailable draft storage",
    );
    assert.deepEqual(await stored(p, DECKS_KEY), twoDecks);
    await snap(p, "unavailable-draft-storage-keeps-working-editor", width);
    await p.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(
      await p.getByRole("textbox", { name: "Deck name", exact: true }).count(),
      0,
    );
    assert.deepEqual(await stored(p, DECKS_KEY), twoDecks);
    await snap(p, "cancel-unpersisted-work-still-closes-cleanly", width);
    await c.close();

    // Real tabs share saved decks but keep independent unfinished working copies.
    const paired = await context(browser, width, height, errors, entries);
    const a = paired.p;
    const b = await paired.c.newPage();
    b.on("pageerror", (e) => errors.push(e.message));
    b.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(b);
    await b.goto(url);
    for (const src of await b
      .locator('script[type="module"][src]')
      .evaluateAll((nodes) => nodes.map((node) => node.src)))
      entries.add(src);
    await nav(a, "Deck builder");
    await nav(b, "Deck builder");
    await b.getByRole("button", { name: "New deck", exact: true }).click();
    await b
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Unfinished deck in tab B");
    const workingB = await stored(b, DECK_EDITOR_DRAFT_KEY);
    await a.getByRole("button", { name: "New deck", exact: true }).click();
    await a
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Saved deck in tab A");
    const workingA = await stored(a, DECK_EDITOR_DRAFT_KEY);
    assert.equal(workingA.deck.name, "Saved deck in tab A");
    assert.equal(workingB.deck.name, "Unfinished deck in tab B");
    assert.deepEqual(
      (await stored(b, DECK_EDITOR_DRAFT_KEY)).deck,
      workingB.deck,
    );
    assert.equal(
      await a.evaluate(
        (key) => localStorage.getItem(key),
        DECK_EDITOR_DRAFT_KEY,
      ),
      null,
      "the shared device shelf never stores tab working copies",
    );
    activePage = b;
    await snap(b, "two-tab-working-copies-stay-independent", width);
    await a.getByRole("button", { name: "Save draft", exact: true }).click();
    assert.equal(await stored(a, DECK_EDITOR_DRAFT_KEY), null);
    assert.deepEqual(
      (await stored(b, DECK_EDITOR_DRAFT_KEY)).deck,
      workingB.deck,
    );
    await reloadBuilder(b);
    await restored(b, workingB);
    await snap(b, "tab-a-save-tab-b-reload-retains-unfinished-copy", width);
    await a.getByRole("button", { name: "New deck", exact: true }).click();
    await a
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Cancel only tab A's next copy");
    await a.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await stored(a, DECK_EDITOR_DRAFT_KEY), null);
    assert.deepEqual(
      (await stored(b, DECK_EDITOR_DRAFT_KEY)).deck,
      workingB.deck,
    );
    await snap(b, "tab-a-cancel-retains-tab-b-working-copy", width);
    await b.getByRole("button", { name: "Save draft", exact: true }).click();
    assert.equal(await stored(b, DECK_EDITOR_DRAFT_KEY), null);
    assert.deepEqual(
      (await stored(b, DECKS_KEY)).map((deck) => deck.name).sort(),
      ["Saved deck in tab A", "Unfinished deck in tab B"],
    );
    await b.reload();
    await nav(b, "Deck builder");
    for (const name of ["Saved deck in tab A", "Unfinished deck in tab B"])
      await b.getByRole("heading", { name, exact: true }).waitFor();
    await snap(b, "both-tab-explicit-saves-survive-reload", width);
    await paired.c.close();
  }
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    smoke: false,
  });
  console.log(
    `Entry improvements: ${checks.length} browser checkpoints passed (${url}).`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        url,
        failure: String(error),
        stack: error.stack,
        errors,
        screenshots,
        checks,
      },
      null,
      2,
    ),
  );
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: `${dir}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
