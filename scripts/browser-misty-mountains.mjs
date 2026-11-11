import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  OMM as O,
  OMM_QUESTS,
  OMM_RECIPES,
} from "../src/game/misty-mountains-support.ts";
import { HOBBIT_BILBO, HOBBIT_TREASURES } from "../src/game/hobbit-codes.ts";
import { STARTERS } from "../src/game/cards.ts";
import { TREASURE_RECORDS_KEY } from "../src/game/hobbit-treasure-records.ts";
import { base } from "../tests/misty-mountains-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  opening,
  next,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/misty-mountains-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/misty-mountains-browser";
await fs.mkdir(dir, { recursive: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
  setups = [],
  artwork = [];
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
let page;
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
const allHeroes = (s) => [
  ...s.heroes,
  ...(s.table?.seats ?? []).flatMap((p, i) =>
    i === s.table.active ? [] : p.heroes,
  ),
];
try {
  for (const width of [1280, 390, 320]) {
    const view = await context(
      browser,
      width,
      width === 1280 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
    if (width === 1280) {
      for (const easy of [false, true])
        for (const players of [1, 2, 3, 4]) {
          await fresh(page, "over-the-misty-mountains-grim", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          assert.equal(s.stage, 2);
          assert.equal(
            allHeroes(s).filter((h) => h.code === HOBBIT_BILBO).length,
            1,
          );
          const engaged = [
            ...s.engaged,
            ...(s.table?.seats ?? []).flatMap((p, i) =>
              i === s.table.active ? [] : p.engaged,
            ),
          ];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...engaged.map((u) => u.code),
            ...s.mistyMountains.inactiveDeck,
            ...OMM_QUESTS.map((c) => c.code),
            HOBBIT_BILBO,
          ].sort();
          assert.deepEqual(
            physical,
            OMM_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.deepEqual(
            (await resume(page)).mistyMountains,
            s.mistyMountains,
          );
          await page
            .locator('[data-scenario-panel="over-the-misty-mountains-grim"]')
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
      // Treasures discovered by these heroes join a deck from the lobby.
      await page.evaluate(
        ([key, heroes, treasures]) =>
          localStorage.setItem(key, JSON.stringify([{ heroes, treasures }])),
        [TREASURE_RECORDS_KEY, STARTERS[0].heroes, HOBBIT_TREASURES],
      );
      await fresh(page, "over-the-misty-mountains-grim", 1, false);
      await page.locator("[data-treasure-setup]").waitFor();
      await checkpoint("treasure-lobby", width);
      await page.locator("#start-btn").click();
      let started = await saved(page);
      for (let n = 0; started.choice || started.phase === "setup"; n++) {
        assert.ok(n < 20, "the opening settles");
        if (started.choice?.title.includes("A Short Rest")) {
          await checkpoint("short-rest-search", width);
          started = await choose(
            page,
            started.choice.options.find((o) => o.id !== "skip").id,
          );
          continue;
        }
        if (started.choice) {
          started = await choose(page, started.choice.options[0].id);
          continue;
        }
        await page.getByRole("button", { name: /Keep/ }).first().click();
        await reviewedState(page);
        started = await saved(page);
      }
      const owned = [...started.deck, ...started.hand.map((u) => u.code)];
      for (const code of HOBBIT_TREASURES)
        assert.ok(owned.includes(code), `${code} joins the deck`);
      await page.evaluate(
        (key) => localStorage.removeItem(key),
        TREASURE_RECORDS_KEY,
      );
    }
    for (const stage of [2, 3]) {
      const s = base(1, stage);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(OMM_QUESTS[stage - 1].code).name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint(`quest-${stage}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${stage}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Goblin Town: Bilbo may spend resources to reveal fewer cards.
    const town = base(2, 2);
    town.heroes.find((h) => h.code === HOBBIT_BILBO).resources = 2;
    town.stage = 3;
    town.mistyMountains.currentQuest = OMM_QUESTS[2].code;
    town.stageRevealing = true;
    handle(town, fx("ommStageThree", { player: 0 }));
    flush(town);
    await load(page, town);
    let s = await saved(page);
    assert.match(s.choice.title, /Goblin Town/);
    assert.equal(s.choice.options.length, 3);
    await checkpoint("goblin-town-choice", width);
    s = await choose(page, "spend-2");
    while (s.choice || s.flow?.pending) {
      if (s.flow?.pending) {
        await reviewedState(page);
        s = await saved(page);
        continue;
      }
      s = await choose(page, s.choice.options[0].id);
    }
    assert.equal(s.mistyMountains.goblinTown, true);
    await page.locator("[data-inactive-deck]").waitFor();
    await checkpoint("goblin-town", width);
    // Front Porch forbids attacks on Goblins until Bilbo blanks it.
    const porch = base(1, 3);
    porch.activeLocation = make(porch, O.porch);
    porch.heroes.find((h) => h.code === HOBBIT_BILBO).resources = 2;
    await load(page, porch);
    s = await saved(page);
    assert.equal(s.activeLocation.code, O.porch);
    await page
      .locator('[data-scenario-panel="over-the-misty-mountains-grim"]')
      .waitFor();
    await checkpoint("front-porch", width);
    // The Great Goblin in the victory display lets stage 3B be defeated.
    const victory = base(1, 3);
    victory.victoryCards = [O.greatGoblin];
    victory.victory = 3;
    victory.phase = "staging";
    victory.heroes[0].committed = true;
    victory.heroes[0].exhausted = true;
    victory.heroes[0].tempWill = 40;
    await load(page, victory);
    s = await next(page);
    assert.equal(s.status, "won");
    await checkpoint("goblin-town-victory", width);
    await view.c.close();
  }
  const p = await browser.newPage();
  for (const a of art) {
    const r = await p.request.get(new URL(a.localPath, url).href);
    assert.equal(r.status(), 200);
    const bytes = await r.body();
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
    const size = await p.evaluate(
      async (bytes) => {
        const b = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const size = { width: b.width, height: b.height };
        b.close();
        return size;
      },
      [...bytes],
    );
    assert.ok(size.width > 0 && size.height > 0);
    artwork.push({ ...a, ...size });
  }
  await p.close();
  await report(dir, {
    sourceScriptSha256,
    errors,
    entries,
    screenshots,
    checks,
    setups,
    artwork,
  });
  console.log(
    `Over the Misty Mountains Grim browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
    await fs.writeFile(
      `${dir}/failure.json`,
      JSON.stringify(
        {
          error: String(error),
          stack: error.stack,
          state: await saved(page).catch(() => null),
          errors,
          checks,
        },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  await browser.close();
}
