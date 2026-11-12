import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  SP,
  SHADOW_PAST_QUESTS,
  SHADOW_PAST_RECIPES,
} from "../src/game/shadow-past-support.ts";
import { SAGA_FRODO, ONE_RING } from "../src/game/lotr-saga-codes.ts";
import { base } from "../tests/shadow-past-fixtures.ts";
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
    new URL("../tests/shadow-past-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/shadow-past-browser";
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
const panel = "[data-scenario-panel='a-shadow-of-the-past']";
/** A staging step in which the first player reveals the given cards. */
function revealing(s, codes) {
  s.phase = "staging";
  s.encounterDeck = codes;
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  return s;
}
async function resolveHide(width, label) {
  await page.locator("[data-hide-test='actions']").waitFor();
  if (label) await checkpoint(label, width);
  await page.getByRole("button", { name: "Resolve Hide test" }).first().click();
  await reviewedState(page);
  return saved(page);
}
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
          await fresh(page, "a-shadow-of-the-past", players, easy);
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
            ...s.shadowPast.setAside,
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.heroes.filter((h) => h.code === SAGA_FRODO).map((h) => h.code),
            ),
            ...seats.flatMap((p) =>
              [...p.heroes, ...p.allies]
                .flatMap((u) => u.attachments)
                .map((a) => a.code)
                .filter((c) => c.startsWith("octgn:")),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...SHADOW_PAST_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            SHADOW_PAST_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].heroes.some(
              (h) =>
                h.code === SAGA_FRODO &&
                h.attachments.some((a) => a.code === ONE_RING),
            ),
          );
          assert.deepEqual((await resume(page)).shadowPast, s.shadowPast);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-bag-end='pending']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const index of [0, 1, 2]) {
      const s = base(1);
      s.stage = index + 1;
      s.shadowPast.currentQuest = SHADOW_PAST_QUESTS[index].code;
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(SHADOW_PAST_QUESTS[index].code).name}`,
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
    // A Black Rider is revealed: commit characters, then the action window.
    const rider = revealing(base(1), [
      SP.rider,
      SP.greenHill,
      SP.greenHill,
      SP.greenHill,
    ]);
    assert.match(rider.choice.title, /Hide 2 test · Commit characters/);
    await load(page, rider);
    await checkpoint("hide-commit", width);
    let s = await choose(page, rider.heroes[0].id);
    s = await choose(page, rider.heroes[2].id);
    s = await choose(page, "done");
    assert.equal(s.hideTest.phase, "actions");
    s = await resolveHide(width, "hide-actions");
    assert.equal(s.hideTest, undefined);
    assert.ok(s.staging.some((u) => u.code === SP.rider));
    // A failed test: the Black Riders engage and attack.
    const failing = revealing(base(1), [SP.rider, SP.stockRoad, SP.stockRoad]);
    failing.staging.push(make(failing, SP.rider));
    await load(page, failing);
    s = await choose(page, "done");
    s = await resolveHide(width);
    assert.equal(s.engaged.filter((u) => u.code === SP.rider).length, 2);
    assert.match(s.choice.title, /Immediate attack/);
    await page.locator(`${panel} [data-hide-failed='1']`).waitFor();
    await checkpoint("hide-failed", width);
    // Frodo's response cancels the card and reveals another.
    const cancel = base(1);
    cancel.heroes.find((h) => h.code === SAGA_FRODO).resources = 1;
    revealing(cancel, [SP.rider, SP.greenHill, SP.greenHill]);
    assert.match(cancel.choice.title, /Revealed · Black Rider/);
    await load(page, cancel);
    await checkpoint("frodo-response", width);
    s = await choose(
      page,
      cancel.choice.options.find((o) => o.code === SAGA_FRODO).id,
    );
    assert.ok(s.staging.some((u) => u.code === SP.greenHill));
    await page.locator(`${panel} [data-ring-exhausted='true']`).waitFor();
    await checkpoint("frodo-cancel", width);
    // Stage 3: travel to Bucklebury Ferry with a Hide 3 test, then win.
    const ferry = base(1);
    ferry.stage = 3;
    ferry.shadowPast.currentQuest = SP.buckland;
    ferry.shadowPast.setAside = [];
    ferry.phase = "travel";
    ferry.staging.push(make(ferry, SP.ferry));
    ferry.encounterDeck = Array(6).fill(SP.greenHill);
    await load(page, ferry);
    await page.locator(`${panel} [data-ferry='in-play']`).waitFor();
    await checkpoint("bucklebury-ferry", width);
    await page.getByRole("button", { name: "Travel here" }).first().click();
    await reviewedState(page);
    s = await saved(page);
    assert.match(s.choice.title, /Hide 3 test/);
    s = await choose(page, s.choice.options[0].id);
    s = await choose(page, s.choice.options.find((o) => o.id === "done").id);
    s = await resolveHide(width);
    assert.equal(s.activeLocation.code, SP.ferry);
    const won = structuredClone(s);
    won.phase = "quest";
    won.queue.push(fx("successfulQuestProgress", { value: 9, player: 0 }));
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("escaped", width);
    // The One Ring leaves play: the players lose.
    const lost = base(1);
    const frodo = lost.heroes.find((h) => h.code === SAGA_FRODO);
    lost.queue.push(fx("damage", { target: frodo.id, value: 9, player: 0 }));
    flush(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("ring-lost", width);
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
    `A Shadow of the Past browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
