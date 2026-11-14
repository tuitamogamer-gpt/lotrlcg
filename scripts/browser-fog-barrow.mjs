import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import { ringBearer } from "../src/game/lotr-saga.ts";
import { SAGA_FRODO } from "../src/game/lotr-saga-codes.ts";
import { forOwner, selectSeat } from "../src/game/table.ts";
import {
  FB,
  FOG_BARROW_QUESTS,
  FOG_BARROW_RECIPES,
} from "../src/game/fog-barrow.ts";
import {
  allies,
  base,
  engaged,
  settle,
  stage,
} from "../tests/fog-barrow-fixtures.ts";
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
    new URL("../tests/fog-barrow-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/fog-barrow-browser";
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
const panel = "[data-scenario-panel='fog-on-the-barrow-downs']";
const run = (s, ...effects) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s, code, player) => {
  s.encounterDeck.unshift(code);
  return run(s, fx("reveal", { player }));
};
/** Advance-check a stage as the given player. */
const checkAs = (s, player) => {
  forOwner(s, player, () => check(s));
  flush(s);
  return settle(s);
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
          await fresh(page, "fog-on-the-barrow-downs", players, easy);
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
            ...s.fogBarrow.setAside,
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
            ...FOG_BARROW_QUESTS.flatMap((c) =>
              Array(c.code === FB.trapped ? 4 : 1).fill(c.code),
            ),
          ].sort();
          assert.deepEqual(
            physical,
            FOG_BARROW_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.deepEqual(s.staging, []);
          assert.deepEqual((await resume(page)).fogBarrow, s.fogBarrow);
          await page.locator(`${panel} [data-stage='1']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The four printed quest cards.
    for (const [index, code] of FOG_BARROW_QUESTS.map(
      (q) => q.code,
    ).entries()) {
      let s = base(1, Math.min(3, index + 1));
      if (code === FB.trapped) {
        s.phase = "staging";
        s.encounterDeck = [FB.coldWight, ...s.encounterDeck];
        s = settle(reveal(s, FB.great, 0));
        assert.equal(s.fogBarrow.split, true);
        s.phase = "planning";
      } else {
        s.fogBarrow.currentQuest = code;
        s.stage = Number(card(code).cost);
      }
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
    // Across the Downs: Hollow Circle must be explored.
    const across = base(2, 2);
    stage(across, FB.hollow);
    stage(across, FB.northDowns);
    engaged(across, FB.barrowWight, 0);
    await load(page, across);
    await page.locator(`${panel} [data-stage='2']`).waitFor();
    await checkpoint("across-the-downs", width);
    // Lost in the Fog: a Great Barrow traps its player at a separate stage 4A.
    const trap = base(2, 3);
    stage(trap, FB.standing);
    allies(trap, ["01013", "01062"], 1);
    trap.phase = "staging";
    trap.encounterDeck = [FB.darkWight, ...trap.encounterDeck];
    reveal(trap, FB.great, 1);
    assert.match(
      trap.choice.title,
      /^Trapped Inside a Barrow · Discard an ally/,
    );
    await load(page, trap);
    await checkpoint("discard-allies-in-the-barrow", width);
    let s = await choose(page, trap.choice.options[0].id);
    for (let n = 0; s.choice && n < 10; n++)
      s = await choose(page, s.choice.options[0].id);
    assert.ok(s.fogBarrow.split);
    await page.locator(`${panel} [data-split='true']`).waitFor();
    await page.locator(`${panel} [data-areas='2']`).waitFor();
    // The trapped player sees his own stage 4B.
    await page.locator(".quest-stage-seal", { hasText: /^4B$/ }).waitFor();
    await checkpoint("trapped-inside-a-barrow", width);
    // 9 progress: the barrow returns to Lost in the Fog at the travel phase.
    let escape = base(2, 3);
    escape.phase = "staging";
    escape.encounterDeck = [FB.coldWight, ...escape.encounterDeck];
    escape = settle(reveal(escape, FB.great, 1));
    selectSeat(escape, 1);
    escape.progress = 9;
    escape = checkAs(escape, 1);
    assert.deepEqual(escape.fogBarrow.escaped, ["fb-barrow-1"]);
    escape.phase = "planning";
    await load(page, escape);
    await page.locator(`${panel} [data-escaped='1']`).waitFor();
    await checkpoint("escaped-the-barrow", width);
    escape = settle(run(escape, fx("startTravel", { player: 0 })));
    assert.equal(escape.fogBarrow.split, false);
    assert.ok(escape.victoryCards.includes(FB.great));
    await load(page, escape);
    await page.locator(`${panel} [data-split='false']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^3B$/ }).waitFor();
    await checkpoint("back-at-lost-in-the-fog", width);
    // Ancient Barrow: an ally goes facedown under it.
    const ancient = base(1, 3);
    allies(ancient, ["01013", "01016"]);
    ancient.phase = "staging";
    reveal(ancient, FB.ancient, 0);
    assert.match(ancient.choice.title, /^Ancient Barrow/);
    await load(page, ancient);
    await checkpoint("ancient-barrow", width);
    s = await choose(page, ancient.choice.options[0].id);
    for (let n = 0; s.choice && n < 10; n++)
      s = await choose(page, s.choice.options[0].id);
    await page.locator(`${panel} [data-buried='1']`).waitFor();
    // Frozen by Fear: no Actions or Responses this round.
    let frozen = base(1, 3);
    frozen.phase = "staging";
    frozen = settle(reveal(frozen, FB.frozen, 0));
    assert.equal(frozen.fogBarrow.frozen.round, frozen.round);
    frozen.phase = "planning";
    await load(page, frozen);
    await page.locator(`${panel} [data-frozen='1']`).waitFor();
    await checkpoint("frozen-by-fear", width);
    // Tom Bombadil comes when called.
    const tom = base(2, 3);
    tom.phase = "staging";
    reveal(tom, FB.tom, 0);
    assert.match(tom.choice.title, /^Tom Bombadil/);
    await load(page, tom);
    await checkpoint("tom-bombadil", width);
    s = await choose(page, "player-1");
    assert.ok(
      s.table.seats[1].allies.some((u) => u.code === FB.tom) ||
        s.allies.some((u) => u.code === FB.tom),
    );
    // Victory: 16 progress with Standing Stones in the victory display.
    let won = base(1, 3);
    won.victoryCards = [FB.standing];
    won.victory = 3;
    won.progress = 16;
    won = checkAs(won, 0);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("off-the-barrow-downs", width);
    // Defeat: The One Ring leaves play.
    let lost = base(1, 3);
    const bearer = ringBearer(lost);
    lost.heroes = lost.heroes.filter((h) => h.id !== bearer.id);
    lost = checkAs(lost, 0);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("ring-lost-in-the-fog", width);
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
    `Fog on the Barrow-downs browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
