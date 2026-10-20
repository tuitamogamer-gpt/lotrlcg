import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { DECKS_KEY, DECK_CARDS } from "../src/game/decks.ts";
import { DECK_EDITOR_DRAFT_KEY } from "../src/ui/deck-editor-draft.ts";
import { RECORDS_KEY } from "../src/ui/records.ts";
import { SCENARIOS } from "../src/game/scenarios.ts";
import { context, capture, report, url } from "./browser-angmar-helpers.mjs";
const dir =
  process.env.DECK_RECORD_OUTPUT_DIR ?? "output/deck-record-improvements";
await fs.mkdir(dir, { recursive: true });
const launch = { headless: true };
if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
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
const original = {
  id: "ranger-original",
  name: "Ranger fellowship",
  heroes: ["01001", "01002", "01003"],
  cards: { "01073": 1, "01023": 2, "01026": 1 },
  source: "https://ringsdb.com/decklist/view/424242",
  updatedAt: 1000,
};
const history = [
  {
    key: "first",
    at: 1792454400000,
    scenarioId: "mirkwood",
    playMode: "normal",
    deck: "Leadership",
    heroes: original.heroes,
    players: 1,
    result: "won",
    rounds: 4,
    threat: 29,
    score: 70,
    easy: false,
  },
  {
    key: "latest",
    at: 1792540800000,
    scenarioId: "the-ghost-of-framsburg",
    playMode: "normal",
    deck: "Leadership with the northern Rangers + Tactics with the warriors of Rohan + Spirit with the elves of Lórien + Lore with the keepers of ancient knowledge",
    heroes: Array.from(
      { length: 12 },
      (_, i) => `010${String(i + 1).padStart(2, "0")}`,
    ),
    players: 4,
    result: "lost",
    rounds: 8,
    threat: 160,
    score: 0,
    easy: true,
  },
];
let p;
const pass = (label, width) => {
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
};
const row = (code) => p.locator(`.builder-card[data-card-code="${code}"]`);
const stored = () =>
  p.evaluate((key) => JSON.parse(localStorage.getItem(key)), DECKS_KEY);
const draft = () =>
  p.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)),
    DECK_EDITOR_DRAFT_KEY,
  );
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
    await p.evaluate(
      ({ decksKey, recordsKey, original, history }) => {
        localStorage.setItem(decksKey, JSON.stringify([original]));
        localStorage.setItem(recordsKey, JSON.stringify(history));
      },
      { decksKey: DECKS_KEY, recordsKey: RECORDS_KEY, original, history },
    );
    await p.reload();
    const opener = p.getByRole("button", { name: /Your record/ });
    await opener.click();
    const dialog = p.getByRole("dialog", {
      name: "Your journey record",
      exact: true,
    });
    assert.equal(
      await dialog.locator("table").first().getAttribute("aria-label"),
      "Recent adventures",
    );
    const recent = dialog.getByRole("table", {
      name: "Recent adventures",
      exact: true,
    });
    assert.equal(await recent.locator("tbody tr").count(), 2);
    assert.match(
      await recent.locator("tbody tr").first().innerText(),
      /Framsburg/,
    );
    assert.equal(
      await recent.locator("time").first().getAttribute("datetime"),
      new Date(history[1].at).toISOString(),
    );
    assert.ok(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
    const region = dialog.getByRole("region", {
      name: "Recent adventure results",
      exact: true,
    });
    await region.focus();
    if (width < 500) {
      await p.keyboard.press("ArrowRight");
      await p.waitForFunction(
        () =>
          document.querySelector('[aria-label="Recent adventure results"]')
            .scrollLeft > 0,
      );
    }
    await capture(p, dir, `recent-history-${width}`, screenshots);
    pass(
      "recent results and dates lead within a keyboard-scrollable dialog",
      width,
    );

    const totals = dialog.getByRole("table", {
      name: "Results by quest",
      exact: true,
    });
    assert.equal(await totals.locator("tbody tr").count(), 2);
    await dialog
      .getByRole("button", { name: "Show all quests", exact: true })
      .click();
    assert.equal(await totals.locator("tbody tr").count(), SCENARIOS.length);
    assert.equal(
      await dialog
        .getByRole("button", { name: "Show played quests", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await dialog
      .getByRole("button", { name: "Show played quests", exact: true })
      .click();
    assert.equal(await totals.locator("tbody tr").count(), 2);
    p.once("dialog", (d) => d.dismiss());
    await dialog
      .getByRole("button", { name: "Clear record", exact: true })
      .click();
    assert.equal(await recent.locator("tbody tr").count(), 2);
    p.once("dialog", (d) => d.accept());
    await dialog
      .getByRole("button", { name: "Clear record", exact: true })
      .click();
    assert.equal(await dialog.locator("table").count(), 0);
    assert.deepEqual(
      await p.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        RECORDS_KEY,
      ),
      [],
    );
    await p.keyboard.press("Escape");
    assert.equal(
      await opener.evaluate((e) => e === document.activeElement),
      true,
    );
    pass("quest totals toggle and confirmed clearing preserve focus", width);

    await nav("Deck builder");
    await p.getByRole("button", { name: "Edit", exact: true }).click();
    const types = p.getByRole("combobox", {
      name: "Filter deck card type",
      exact: true,
    });
    const search = p.getByRole("textbox", {
      name: "Search cards",
      exact: true,
    });
    for (const type of ["ally", "attachment", "event", "player-side-quest"]) {
      await types.selectOption(type);
      const codes = await p
        .locator(".builder-card")
        .evaluateAll((es) => es.map((e) => e.dataset.cardCode));
      assert.equal(
        codes.length,
        Math.min(
          48,
          DECK_CARDS.filter((c) => c.type_code.replaceAll("_", "-") === type)
            .length,
        ),
      );
      assert.ok(
        codes.every(
          (code) =>
            DECK_CARDS.find((c) => c.code === code).type_code.replaceAll(
              "_",
              "-",
            ) === type,
        ),
      );
    }
    await search.fill("no matching card xyz");
    assert.equal(await p.locator(".builder-card").count(), 0);
    await p
      .getByRole("button", { name: "Clear card filters", exact: true })
      .click();
    assert.equal(await types.inputValue(), "all");
    assert.equal(await p.locator(".builder-card").count(), 48);
    pass(
      "card type filters match supported designs and clear correctly",
      width,
    );

    const own = p.getByRole("button", { name: "In your deck", exact: true });
    await own.click();
    assert.equal(await p.locator(".builder-card").count(), 3);
    assert.match(await own.innerText(), /3 designs · 4 cards/);
    await types.selectOption("event");
    assert.equal(await p.locator(".builder-card").count(), 1);
    assert.equal(await row("01023").count(), 1);
    await search.fill("no matching card xyz");
    await p
      .getByRole("button", { name: "Clear card filters", exact: true })
      .click();
    assert.equal(await own.getAttribute("aria-pressed"), "true");
    assert.equal(await p.locator(".builder-card").count(), 3);
    await capture(p, dir, `deck-only-${width}`, screenshots);
    pass("deck-only editing reports copies and combines filters", width);

    for (const code of ["01026", "01023", "01023", "01073"]) {
      const remove = row(code).getByRole("button", { name: /^Remove one / });
      await remove.focus();
      await p.keyboard.press("Enter");
    }
    assert.equal(await p.locator(".builder-card").count(), 0);
    await p.waitForFunction(() =>
      document.activeElement?.classList.contains(
        "builder-card-browser-heading",
      ),
    );
    await p
      .getByRole("button", { name: "Browse supported cards", exact: true })
      .click();
    assert.equal(
      await p
        .getByRole("button", { name: "All supported cards", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await p.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(await stored(), [original]);
    pass(
      "last-copy removal preserves keyboard access and cancel protects the saved deck",
      width,
    );

    await p
      .getByRole("button", { name: `Copy ${original.name}`, exact: true })
      .click();
    let working = (await draft()).deck;
    assert.notEqual(working.id, original.id);
    assert.deepEqual(working.cards, original.cards);
    assert.deepEqual(working.heroes, original.heroes);
    assert.equal(working.source, original.source);
    assert.ok(working.name.endsWith(" (copy)") && working.name.length <= 60);
    await p
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Ranger variant");
    await own.click();
    await row("01073")
      .getByRole("button", { name: "Add one Gandalf", exact: true })
      .click();
    await p
      .locator('.builder-hero[data-card-code="01001"]')
      .getByRole("button", { name: "Remove Aragorn", exact: true })
      .click();
    working = (await draft()).deck;
    assert.equal(working.cards["01073"], 2);
    assert.equal(working.heroes.includes("01001"), false);
    assert.deepEqual(await stored(), [original]);
    pass("copy edits have independent identity, heroes and cards", width);

    await nav("Card library");
    await nav("Deck builder");
    assert.equal(
      await p
        .getByRole("textbox", { name: "Deck name", exact: true })
        .inputValue(),
      "Ranger variant",
    );
    await p.reload();
    await nav("Deck builder");
    assert.equal((await draft()).deck.id, working.id);
    assert.equal((await draft()).deck.cards["01073"], 2);
    await p.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(await stored(), [original]);
    pass(
      "an unfinished copy survives navigation and reload without saving over its source",
      width,
    );

    await p
      .getByRole("button", { name: `Copy ${original.name}`, exact: true })
      .click();
    await p
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Saved ranger variant");
    await own.click();
    await row("01073")
      .getByRole("button", { name: "Add one Gandalf", exact: true })
      .click();
    await p.getByRole("button", { name: "Save draft", exact: true }).click();
    const shelf = await stored();
    assert.equal(shelf.length, 2);
    assert.deepEqual(
      shelf.find((d) => d.id === original.id),
      original,
    );
    const copy = shelf.find((d) => d.id !== original.id);
    assert.equal(copy.cards["01073"], 2);
    assert.equal(copy.source, original.source);
    assert.deepEqual(copy.heroes, original.heroes);
    await capture(p, dir, `saved-copy-${width}`, screenshots);
    pass(
      "explicit saving adds the copy while preserving the original and provenance",
      width,
    );
    await view.c.close();
  }
  assert.equal(checks.length, 24);
  await report(dir, { checks, errors, screenshots, entries, smoke: false });
  console.log(`Deck and record improvements: ${checks.length} checks passed.`);
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
