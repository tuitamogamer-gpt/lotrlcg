import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  FAS as F,
  FAS_QUESTS,
  FAS_RECIPES,
} from "../src/game/flies-spiders-support.ts";
import { OTD_BILBO, OTD_RING } from "../src/game/hobbit-codes.ts";
import { givePoison, makeUnconscious } from "../src/game/flies-spiders.ts";
import { bagginsBilbo } from "../src/game/hobbit-saga.ts";
import { base } from "../tests/flies-spiders-fixtures.ts";
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
    new URL("../tests/flies-spiders-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/flies-spiders-browser";
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
    if (width === 1280)
      for (const easy of [false, true])
        for (const players of [1, 2, 3, 4]) {
          await fresh(page, "flies-and-spiders", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...s.fliesSpiders.setAside.map((u) => u.code),
            ...s.fliesSpiders.rings,
            ...seats.flatMap((p) =>
              [...p.deck, ...p.hand.map((u) => u.code)].filter(
                (c) => c === OTD_RING,
              ),
            ),
            ...FAS_QUESTS.map((c) => c.code),
            OTD_BILBO,
          ].sort();
          assert.deepEqual(
            physical,
            FAS_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.deepEqual((await resume(page)).fliesSpiders, s.fliesSpiders);
          await page
            .locator("[data-scenario-panel='flies-and-spiders']")
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const index of [0, 2]) {
      const s = base(1);
      if (index === 2) {
        s.stage = 3;
        s.fliesSpiders.currentQuest = F.captured;
      }
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(FAS_QUESTS[index].code).name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint(`quest-${index + 1}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${index + 1}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Poison as facedown cards and an unconscious hero at stage 3.
    let s = base(1);
    s.stage = 3;
    s.fliesSpiders.currentQuest = F.captured;
    s.deck = Array(10).fill("01028");
    givePoison(s, s.heroes[1], 2);
    makeUnconscious(s, s.heroes[0]);
    bagginsBilbo(s).resources = 2;
    await load(page, s);
    await page.locator("[data-poison='2']").first().waitFor();
    await page.locator("[data-unconscious='true']").first().waitFor();
    await checkpoint("poison-unconscious", width);
    await page
      .getByRole("button", {
        name: "Spend 2 Baggins resources: ready an unconscious character you control",
      })
      .click();
    await reviewedState(page);
    s = await choose(page, s.heroes[0].id);
    assert.equal(s.heroes[0].unconscious ?? false, false);
    assert.equal(bagginsBilbo(s).resources, 0);
    await checkpoint("stage-wake", width);
    // Crazy Cob attacks the character with the most poison.
    const cob = base(1);
    cob.deck = Array(10).fill("01028");
    givePoison(cob, cob.heroes[1], 1);
    cob.phase = "staging";
    cob.encounterDeck = [F.cob, F.path];
    handle(cob, fx("reveal", { player: 0 }));
    flush(cob);
    await load(page, cob);
    s = await saved(page);
    assert.match(s.choice.title, /Crazy Cob/);
    await checkpoint("crazy-cob-target", width);
    s = await choose(page, cob.heroes[1].id);
    // Two players: the separate staging area after Lost in the Dark.
    const split = base(2);
    split.progress = 9;
    split.phase = "staging";
    handle(
      split,
      fx("questSucceeded", { value: 0, player: split.table.first }),
    );
    flush(split);
    assert.equal(split.fliesSpiders.split, true);
    await load(page, split);
    await page.locator("[data-fas-area='fas-lost']").waitFor();
    await page.locator("[data-fas-area='fas-battle']").waitFor();
    await checkpoint("separate-staging-areas", width);
    // Battle with the Spiders is won at 3 progress once the Glade is gone.
    const victory = base(1);
    victory.stage = 4;
    victory.fliesSpiders.currentQuest = F.battle;
    victory.fliesSpiders.setAside = [];
    victory.encounterDiscard.push(F.glade);
    victory.phase = "staging";
    victory.heroes[0].committed = true;
    victory.heroes[0].exhausted = true;
    victory.heroes[0].tempWill = 40;
    await load(page, victory);
    s = await next(page);
    assert.equal(s.status, "won");
    assert.deepEqual(s.fliesSpiders.treasures, [OTD_RING]);
    await checkpoint("battle-victory", width);
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
    `Flies and Spiders browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
