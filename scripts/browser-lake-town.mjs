import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  LAKE as L,
  LAKE_QUESTS,
  LAKE_RECIPES,
} from "../src/game/lake-town-support.ts";
import { base } from "../tests/lake-town-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  opening,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/lake-town-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/battle-lake-town-browser";
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
const town = (s) => s.staging.find((u) => u.code === L.town);
const smaugIn = (s, code, damage = 0) => {
  const u = make(s, code);
  u.damage = damage;
  s.staging.push(u);
  s.lakeTown.smaugDeck.splice(s.lakeTown.smaugDeck.indexOf(code), 1);
  return u;
};
const panel = "[data-scenario-panel='the-battle-of-lake-town']";
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
          await fresh(page, "the-battle-of-lake-town", players, easy);
          await page.locator("#start-btn").click();
          let s = await opening(page);
          for (let n = 0; s.choice && n < 20; n++)
            s = await choose(
              page,
              s.choice.options.find((o) => o.id === "town")?.id ??
                s.choice.options[0].id,
            );
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.lakeTown.smaugDeck,
            ...s.lakeTown.smaugDiscard,
            ...s.staging.map((u) => u.code),
            ...s.staging.flatMap((u) => u.attachments.map((a) => a.code)),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) => p.engaged.flatMap((u) => u.shadows)),
            ...seats.flatMap((p) =>
              [...p.heroes, ...p.allies]
                .flatMap((u) => u.attachments)
                .map((a) => a.code)
                .filter((c) => c.startsWith("octgn:")),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...(s.victoryCards ?? []),
            ...LAKE_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            LAKE_RECIPES[0].cards
              .flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.lakeTown.smaugDeck.length, 9);
          assert.ok(town(s).damage >= players);
          assert.deepEqual((await resume(page)).lakeTown, s.lakeTown);
          await page.locator(panel).waitFor();
          await page
            .locator(`[data-lake-town-damage='${town(s).damage}']`)
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const index of [0, 1, 2]) {
      const s = base(1);
      s.stage = index + 1;
      s.lakeTown.currentQuest = LAKE_QUESTS[index].code;
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(LAKE_QUESTS[index].code).name}`,
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
    // The first player chooses where the next Smaug goes, then he is revealed.
    const quest = base(1);
    quest.lakeTown.smaugRound = 0;
    quest.lakeTown.smaugDeck = [L.terrible, L.mighty, L.magnificent];
    quest.staging.push(make(quest, L.north), make(quest, L.west));
    handle(quest, fx("lakeSmaugChoice", { player: 0 }));
    flush(quest);
    assert.match(quest.choice.title, /Where does the dragon strike/);
    await load(page, quest);
    await page.locator(`${panel} [data-lake-burn='4']`).waitFor();
    await checkpoint("smaug-choice", width);
    let s = await choose(page, "engaged");
    assert.ok(s.engaged.some((u) => u.code === L.terrible));
    assert.match(s.choice.title, /Burn · 4 damage to assign/);
    await page.locator(`[data-lake-smaug='${L.terrible}']`).waitFor();
    await checkpoint("burn-assignment", width);
    s = await choose(page, s.heroes[1].id);
    assert.match(s.choice.title, /takes how much burn damage/);
    await checkpoint("burn-amount", width);
    s = await choose(page, "take-1");
    assert.ok(s.heroes[1].exhausted);
    s = await choose(page, "town");
    assert.equal(town(s).damage, 3);
    await page.locator("[data-lake-town-damage='3']").waitFor();
    await checkpoint("burn-resolved", width);
    // Merchant's District's Travel Action from the scenario panel.
    const travel = base(1);
    travel.phase = "travel";
    travel.staging.push(make(travel, L.merchant));
    await load(page, travel);
    await page
      .locator(panel)
      .getByRole("button", { name: /Merchant's District · Travel Action/ })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.deepEqual(s.victoryCards, [L.merchant]);
    assert.equal(town(s).damage, 2);
    await page.locator("[data-victory='3']").waitFor();
    await checkpoint("merchant-district", width);
    // The Dragon's Wrath: the Refresh Action resets the quest deck to 2B.
    const refresh = base(1);
    refresh.stage = 3;
    refresh.lakeTown.currentQuest = L.wrath;
    refresh.phase = "refresh";
    smaugIn(refresh, L.mighty, 16);
    await load(page, refresh);
    await page.locator(`${panel} [data-lake-smaug='${L.mighty}']`).waitFor();
    await checkpoint("dragons-wrath", width);
    await page
      .locator(panel)
      .getByRole("button", { name: /The Dragon's Wrath · Refresh Action/ })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.stage, 2);
    assert.equal(s.lakeTown.currentQuest, L.fireWater);
    assert.equal(
      s.staging.find((u) => u.code === L.mighty).damage,
      12,
      "2B's limit",
    );
    // Smaug defeated at 3B: the victory display against Lake-town's damage.
    for (const [vp, burned, result] of [
      [8, 6, "won"],
      [6, 6, "lost"],
    ]) {
      const end = base(1);
      end.stage = 3;
      end.lakeTown.currentQuest = L.wrath;
      end.victory = vp;
      town(end).damage = burned;
      const dragon = smaugIn(end, L.terrible, 19);
      end.queue.push(fx("damage", { target: dragon.id, value: 1, player: 0 }));
      flush(end);
      assert.equal(end.status, result);
      await load(page, end);
      await checkpoint(`smaug-defeated-${result}`, width);
    }
    // Lake-town completely burned.
    const burned = base(1);
    town(burned).damage = 49;
    burned.queue.push(
      fx("lakeTownDamage", { value: 1, text: "Burn", player: 0 }),
    );
    flush(burned);
    assert.equal(burned.status, "lost");
    await load(page, burned);
    await checkpoint("lake-town-burned", width);
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
    `The Battle of Lake-town browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
