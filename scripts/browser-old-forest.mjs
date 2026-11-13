import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, progressLocation } from "../src/game/board.ts";
import { SAGA_FRODO } from "../src/game/lotr-saga-codes.ts";
import {
  OF,
  OLD_FOREST_QUESTS,
  OLD_FOREST_RECIPES,
} from "../src/game/old-forest-support.ts";
import { base, stage, victory, willow } from "../tests/old-forest-fixtures.ts";
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
    new URL("../tests/old-forest-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/old-forest-browser";
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
const panel = "[data-scenario-panel='the-old-forest']";
const run = (s, ...effects) => {
  s.queue.push(...effects);
  flush(s);
  return s;
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
          await fresh(page, "the-old-forest", players, easy);
          await page.locator("#start-btn").click();
          let s = await opening(page);
          for (let n = 0; s.choice && n < 20; n++)
            s = await choose(page, s.choice.options[0].id);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.oldForest.setAside,
            ...(s.victoryCards ?? []),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              [...p.heroes, ...p.allies]
                .flatMap((u) => u.attachments)
                .map((a) => a.code)
                .filter((c) => c.startsWith("octgn:")),
            ),
            ...seats.flatMap((p) =>
              p.heroes.filter((h) => h.code === SAGA_FRODO).map((h) => h.code),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...OLD_FOREST_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            OLD_FOREST_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          // Each player added a different location; a random stage 2 is in play.
          assert.equal(s.stage, 2);
          assert.ok(
            new Set(s.staging.map((u) => card(u.code).name)).size >= players,
          );
          assert.deepEqual((await resume(page)).oldForest, s.oldForest);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-willow='aside']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The three printed quest stages; stage 2 shows its random reverse.
    for (const [index, code] of [OF.farewell, OF.dark, OF.wicked].entries()) {
      const s = base(1, OF.dark);
      s.stage = index + 1;
      s.oldForest.currentQuest = code;
      s.oldForest.stageTwo = [OF.brambles, OF.shifting, OF.closing, OF.dark]
        .filter((c) => c !== code)
        .slice(0, index === 1 ? 3 : 4);
      if (index === 2) s.oldForest.setAside = [];
      await load(page, s);
      const q = card(code);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${index === 1 ? q.back_name : q.name}`,
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
    // Setup: each player searches the encounter deck for a different location.
    const setup = base(1, OF.dark);
    setup.stage = 1;
    setup.oldForest.currentQuest = OF.farewell;
    setup.oldForest.stageTwo = [OF.dark, OF.brambles, OF.shifting, OF.closing];
    setup.encounterDeck = [OF.gulley, OF.strange, OF.wall, OF.misleading];
    run(setup, fx("otfSetupSearch", { player: 0 }));
    assert.match(setup.choice.title, /^Farewell to the Shire · Add/);
    await load(page, setup);
    await checkpoint("setup-location-search", width);
    let s = await choose(page, OF.wall);
    assert.ok(s.staging.some((u) => u.code === OF.wall));
    // Successful questing below the goal: a different random stage 2A searches.
    const reroll = base(1, OF.dark);
    run(reroll, fx("successfulQuestProgress", { value: 3, player: 0 }));
    assert.notEqual(reroll.oldForest.currentQuest, OF.dark);
    assert.match(reroll.choice.title, /^The Living Forest · Search/);
    await load(page, reroll);
    await page
      .locator(
        `${panel} [data-stage-two='${card(reroll.oldForest.currentQuest).back_name}']`,
      )
      .waitFor();
    await checkpoint("different-stage-two", width);
    s = await choose(page, `deck-${OF.gulley}`);
    assert.ok(s.staging.some((u) => u.code === OF.gulley));
    // Enough victory points: the players advance to The Wicked Willow.
    const wicked = base(1, OF.brambles);
    victory(wicked, [OF.gulley, OF.gulley, OF.strange]);
    wicked.victory = 5;
    run(wicked, fx("successfulQuestProgress", { value: 2, player: 0 }));
    assert.equal(wicked.stage, 3);
    await load(page, wicked);
    await page.locator(`${panel} [data-willow='staging']`).waitFor();
    await checkpoint("wicked-willow", width);
    // Tom Bombadil: the revealing player chooses who controls him.
    const tom = base(2, OF.closing);
    tom.phase = "staging";
    tom.encounterDeck = [OF.tom, ...tom.encounterDeck];
    run(tom, fx("reveal", { player: 0 }));
    for (
      let n = 0;
      tom.choice && !/^Tom Bombadil/.test(tom.choice.title) && n < 5;
      n++
    )
      run(tom, ...tom.choice.options.find((o) => o.id === "resolve").effects);
    assert.match(tom.choice.title, /^Tom Bombadil · Choose a player/);
    await load(page, tom);
    await checkpoint("tom-bombadil", width);
    s = await choose(page, "player-1");
    const tomSeat = s.table.active === 1 ? s : s.table.seats[1];
    assert.ok(tomSeat.allies.some((u) => u.code === OF.tom && u.committed));
    // Misleading Path: with no active location, the players must travel there.
    const path = base(1, OF.dark);
    stage(path, OF.strange);
    stage(path, OF.misleading);
    path.phase = "travel";
    await load(page, path);
    await checkpoint("misleading-path", width);
    await page.getByRole("button", { name: "Travel here" }).last().click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.activeLocation.code, OF.misleading);
    // Victory: 18 progress on 3B once Withywindle has left play.
    const { s: won, river } = willow(1);
    won.progress = 18;
    progressLocation(won, river, 5);
    check(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("escaped-the-old-forest", width);
    // Defeat: The One Ring leaves play with the Ring-bearer.
    const lost = base(1, OF.dark);
    lost.heroes = lost.heroes.filter((h) => h.code !== SAGA_FRODO);
    check(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("one-ring-lost", width);
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
    `The Old Forest browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
