import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { addVictoryCard } from "../src/game/board.ts";
import {
  ADG,
  ADG_QUEST_CODES,
  adgRecipe,
} from "../src/game/attack-dol-guldur-support.ts";
import {
  atQuest,
  base,
  engaged,
  stage,
} from "../tests/attack-dol-guldur-fixtures.ts";
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
    new URL("../tests/attack-dol-guldur-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/attack-dol-guldur-browser";
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
const panel = "[data-scenario-panel='attack-on-dol-guldur']";
const unaside = (s, code) => {
  const at = s.attackDolGuldur.setAside.indexOf(code);
  if (at >= 0) s.attackDolGuldur.setAside.splice(at, 1);
};
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
          await fresh(page, "attack-on-dol-guldur", players, easy);
          await page.locator("#start-btn").click();
          let s = await opening(page);
          for (let n = 0; s.choice && n < 20; n++)
            s = await choose(page, s.choice.options[0].id);
          const q = s.attackDolGuldur;
          // No encounter card is revealed during setup: every physical card
          // of the recipe is accounted for.
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...q.setAside,
            ...ADG_QUEST_CODES,
          ].sort();
          assert.deepEqual(
            physical,
            adgRecipe()
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.deepEqual(
            s.staging.map((u) => u.code),
            [ADG.city, ADG.power, ...Array(players).fill(ADG.marauder)],
          );
          assert.deepEqual((await resume(page)).attackDolGuldur, q);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-side='1B']`).waitFor();
          await page
            .locator(`${panel} [data-city-strength='${5 + 5 * players}']`)
            .waitFor();
          await page.locator(`${panel} [data-quest-resources='0']`).waitFor();
          await page.locator(`${panel} [data-lorien='staging']`).waitFor();
          await page
            .locator(`${panel} [data-host-of-lorien='aside']`)
            .waitFor();
          await page
            .locator(`${panel} [data-lieutenants='aside,aside,aside,aside']`)
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // All six printed quest cards, both faces.
    for (const code of ADG_QUEST_CODES) {
      const s = base(1);
      atQuest(s, code);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(code).name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      const side = card(code)
        .name.replace(/[^A-Za-z]+/g, "-")
        .toLowerCase();
      await checkpoint(`quest-${side}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${side}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Assault on the Golden Wood: the end of the round and its Response.
    const golden = base(1);
    golden.progress = 6;
    golden.queue.push(
      fx("adgGoldenForced", { player: 0 }),
      fx("adgGoldenResponse", { player: 0 }),
    );
    flush(golden);
    assert.match(golden.choice.title, /^Assault on the Golden Wood · Raise/);
    await load(page, golden);
    await page.locator(`${panel} [data-quest-resources='1']`).waitFor();
    await page.locator(`${panel} [data-lorien-progress='6']`).waitFor();
    await checkpoint("assault-on-the-golden-wood", width);
    // Crossing the Anduin: Host of Lórien and Power of Lórien.
    const crossing = base(1);
    crossing.staging.find((u) => u.code === ADG.power).progress = 30;
    crossing.encounterDeck = [ADG.marauder, ADG.gate];
    crossing.queue.push(fx("adgCrossing", { player: 0 }));
    flush(crossing);
    assert.match(crossing.choice.title, /^Crossing the Anduin · Remove 10/);
    await load(page, crossing);
    await page.locator(`${panel} [data-side='2B']`).waitFor();
    await checkpoint("crossing-the-anduin", width);
    let s = await choose(page, "host");
    s = await choose(page, "power");
    await page.locator(`${panel} [data-lorien='controlled']`).waitFor();
    await page.locator(`${panel} [data-host-of-lorien='play']`).waitFor();
    s = await choose(page, ADG.gate);
    assert.match(s.choice.title, /Advance to a stage 3 of your choice/);
    await checkpoint("choose-a-stage-3", width);
    s = await choose(page, ADG.siege);
    assert.equal(s.attackDolGuldur.currentQuest, ADG.siege);
    await page.locator(`${panel} [data-side='3B']`).waitFor();
    await page
      .locator(`${panel} [data-lieutenants='play,aside,aside,aside']`)
      .waitFor();
    await checkpoint("the-siege-of-dol-guldur", width);
    // Stage 3's Forced effect: 5 progress or the penalty, then 5 more.
    const forced = base(1);
    atQuest(forced, ADG.tower);
    forced.progress = 10;
    forced.queue.push(fx("adgStageForced", { player: 0 }));
    flush(forced);
    assert.match(forced.choice.title, /^3D The Tower of Sorcery · Remove 5/);
    await load(page, forced);
    await checkpoint("stage-3-forced", width);
    s = await choose(page, "progress");
    assert.match(s.choice.title, /Remove an additional 5 progress\?/);
    await checkpoint("stage-3-benefit", width);
    // Power of Lórien cancels a revealed encounter card.
    const lorien = base(1);
    lorien.staging = lorien.staging.filter((u) => u.code !== ADG.power);
    lorien.attackDolGuldur.lorien = { player: 0 };
    lorien.encounterDeck = [ADG.army, ADG.gate];
    lorien.queue.push(fx("reveal", { player: 0 }));
    flush(lorien);
    assert.match(lorien.choice.title, /^Revealed · Host of Dol Guldur/);
    await load(page, lorien);
    await checkpoint("power-of-lorien", width);
    s = await choose(page, "adg-power");
    assert.ok(s.victoryCards.includes(ADG.power));
    await page.locator(`${panel} [data-lorien='victory']`).waitFor();
    // Archery: Host of Dol Guldur (X players) and Amon Lanc Archer (2).
    const archery = base(1);
    stage(archery, ADG.army);
    engaged(archery, ADG.archer);
    archery.queue.push(fx("heirsArchery", { value: 3, player: 0 }));
    flush(archery);
    await load(page, archery);
    await checkpoint("archery", width);
    // The Shadow Road takes an event played during the quest phase.
    const road = base(1);
    const shadowRoad = stage(road, ADG.road);
    shadowRoad.attachments.push({
      id: "event-1",
      code: "01020",
      exhausted: false,
      facedown: true,
      owner: 0,
    });
    atQuest(road, ADG.trees);
    road.attackDolGuldur.cityStrength = 3;
    road.attackDolGuldur.siege = { round: road.round, value: 2 };
    unaside(road, ADG.morlug);
    stage(road, ADG.morlug);
    await load(page, road);
    await page.locator(`${panel} [data-side='3F']`).waitFor();
    await page.locator(`${panel} [data-siege='2']`).waitFor();
    await page.locator(`${panel} [data-city-strength='3']`).waitFor();
    await checkpoint("the-shadow-road", width);
    // Dol Guldur is captured: city strength 0 and no Lieutenant in play.
    const won = base(1);
    atQuest(won, ADG.siege);
    won.attackDolGuldur.cityStrength = 0;
    unaside(won, ADG.bane);
    addVictoryCard(won, ADG.bane);
    won.queue.push(fx("adgWinCheck", { player: 0 }));
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("dol-guldur-captured", width);
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
    `Attack on Dol Guldur browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
