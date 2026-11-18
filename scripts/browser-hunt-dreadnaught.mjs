import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, destroy } from "../src/game/board.ts";
import {
  HD,
  HD_QUESTS,
  HD_SHIPS,
  hdPhysical,
  hdRecipe,
  huntDreadnaughtPublicState,
} from "../src/game/hunt-dreadnaught-support.ts";
import {
  activate,
  allies,
  base,
  engaged,
  shipOf,
  stage,
  stageTwo,
} from "../tests/hunt-dreadnaught-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/hunt-dreadnaught-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/hunt-dreadnaught-browser";
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
const panel = "[data-scenario-panel='the-hunt-for-the-dreadnaught']";
/** The fleet, the Setup card and the opening hands through the actual dialogs. */
async function opening(picks) {
  const queue = [...picks];
  for (let i = 0; i < 300; i++) {
    await reviewedState(page);
    const s = await saved(page);
    if (s.choice) {
      const next = queue.find((id) =>
        s.choice.options.some((o) => o.id === id),
      );
      if (next) queue.splice(queue.indexOf(next), 1);
      await choose(
        page,
        next ??
          s.choice.options.find((o) => o.id === "resolve")?.id ??
          s.choice.options[0].id,
      );
    } else if (s.phase === "setup")
      await page
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
    else if (!s.queue.length && !s.flow?.pending) return s;
    else await page.waitForTimeout(25);
  }
  throw Error("The Hunt for the Dreadnaught opening did not finish");
}
/** Every physical card of the recipe, in one zone. */
function inventory(s) {
  const q = s.huntDreadnaught;
  const seats = s.table ? s.table.seats.map((_, i) => i) : [0];
  const allies = seats.flatMap((i) =>
    i === (s.table?.active ?? 0) ? s.allies : s.table.seats[i].allies,
  );
  return [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...s.staging.map((u) => u.code),
    ...q.corsairDeck,
    ...q.corsairDiscard,
    ...q.setAside,
    ...q.removed,
    ...Object.values(s.questAttachments ?? {})
      .flat()
      .map((a) => a.code),
    ...allies
      .filter((u) => HD_SHIPS.includes(hdPhysical(u.code)))
      .map((u) => u.code),
    HD.search,
    HD.destroy,
  ]
    .map(hdPhysical)
    .sort();
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
      for (const [mode, players] of [
        ["standard", 1],
        ["standard", 2],
        ["standard", 3],
        ["standard", 4],
        ["hard", 1],
        ["hard", 3],
        ["easy", 1],
        ["easy", 2],
      ]) {
        const ships = HD_SHIPS.slice(players % 3, (players % 3) + players);
        await fresh(
          page,
          "the-hunt-for-the-dreadnaught",
          players,
          mode === "easy",
        );
        await page.locator("#start-btn").click();
        const s = await opening([...ships, mode]);
        const q = s.huntDreadnaught;
        assert.equal(q.mode, mode);
        assert.deepEqual(
          q.fleet.map((f) => f.code),
          ships,
        );
        assert.equal(q.corsairDeck.length, 13);
        assert.deepEqual(
          inventory(s),
          hdRecipe()
            .cards.flatMap((r) => Array(r.quantity).fill(r.code))
            .sort(),
        );
        const staged = s.staging.map((u) => u.code);
        if (mode === "easy") assert.deepEqual(staged, [HD.cobas]);
        if (mode === "hard")
          assert.equal(staged.filter((c) => c === HD.tolfalas).length, 3);
        if (mode === "standard")
          assert.equal(staged.length, players >= 3 ? 3 : 2);
        assert.deepEqual((await resume(page)).huntDreadnaught, q);
        await page.locator(panel).waitFor();
        await page.locator(`${panel} [data-mode='${mode}']`).waitFor();
        await page.locator(`${panel} [data-stage='1']`).waitFor();
        await page
          .locator(`${panel} [data-fleet='${ships.join(",")}']`)
          .waitFor();
        await page.locator(`${panel} [data-corsair-deck='13']`).waitFor();
        await page.locator(`${panel} [data-dreadnaught='aside']`).waitFor();
        setups.push({ mode, players, ships });
        await checkpoint(`setup-${players}-${mode}`, width);
      }
    // The fleet and the Setup card's dialogs.
    await fresh(page, "the-hunt-for-the-dreadnaught", 2, false);
    await page.locator("#start-btn").click();
    await reviewedState(page);
    let s = await saved(page);
    assert.match(s.choice.title, /^Prepare your fleet · Choose your ship/);
    assert.equal(s.choice.options.length, 6);
    await checkpoint("choose-ship", width);
    s = await choose(page, HD.pride);
    assert.equal(s.choice.options.length, 5, "a ship is chosen once");
    s = await choose(page, HD.silentMist);
    for (
      let i = 0;
      i < 20 && !/difficulty mode/.test(s.choice?.title ?? "");
      i++
    )
      s = await choose(page, s.choice.options[0].id);
    assert.match(s.choice.title, /Choose a difficulty mode/);
    await checkpoint("choose-mode", width);
    s = await choose(page, "hard");
    // Both quest cards, front and back.
    for (const q of HD_QUESTS) {
      const t = base(1);
      if (q.code === HD.destroy) stageTwo(t);
      await load(page, t);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${q.name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint(`quest-${q.name}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${q.name}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Boarding: Black Sails engages and 2 Corsairs board the ship.
    const board = base(1);
    const sails = stage(board, HD.blackSails);
    board.queue.push(fx("engage", { target: sails.id, player: 0 }));
    flush(board);
    await load(page, board);
    await page.locator(`${panel} [data-corsair-deck='11']`).waitFor();
    await checkpoint("boarding", width);
    // The Dreadnaught, Elite side, considered engaged with each player.
    const hunt = base(2);
    stageTwo(hunt, false, 8);
    hunt.huntDreadnaught.dreadDamage = { round: hunt.round, amount: 8 };
    await load(page, hunt);
    await page.locator(`${panel} [data-dreadnaught='elite']`).waitFor();
    await page.locator(`${panel} [data-dread-damage='8']`).waitFor();
    await checkpoint("dreadnaught-elite", width);
    // Belfalas Shipyard flips a ship to its Upgraded side.
    const yard = base(1, "standard", [HD.goldenWing]);
    shipOf(yard, 0).damage = 6;
    engaged(yard, HD.sailor);
    activate(yard, HD.shipyard);
    yard.queue.push(fx("hdcShipyard", { player: 0 }));
    flush(yard);
    await load(page, yard);
    s = await saved(page);
    assert.match(s.choice.title, /^Belfalas Shipyard · Response/);
    await checkpoint("belfalas-shipyard", width);
    s = await choose(page, shipOf(yard, 0).id);
    for (let i = 0; i < 10 && s.choice; i++)
      s = await choose(page, s.choice.options[0].id);
    await page.locator(`${panel} [data-ship='${HD.goldenWing}:B']`).waitFor();
    // Corsair Skirmisher: the capture response.
    const capture = base(1);
    const skirmisher = engaged(capture, HD.skirmisher);
    allies(capture, ["01043", "01043", "01043"]);
    destroy(capture, skirmisher);
    flush(capture);
    await load(page, capture);
    s = await saved(page);
    assert.match(s.choice.title, /^Corsair Skirmisher · Response/);
    await checkpoint("corsair-skirmisher", width);
    // The Damaged Dreadnaught and the unique Corsairs.
    const damaged = base(2);
    stageTwo(damaged, false, 16);
    damaged.queue.push(fx("hdFlipCheck", { player: 0 }));
    flush(damaged);
    await load(page, damaged);
    await page.locator(`${panel} [data-dreadnaught='damaged']`).waitFor();
    await page.locator(`${panel} [data-uniques='4']`).waitFor();
    await checkpoint("dreadnaught-damaged", width);
    // The Dreadnaught is destroyed: the players win.
    const won = base(1);
    const last = stageTwo(won, true, 14);
    last.damage = 15;
    check(won);
    flush(won);
    assert.equal(won.status, "won");
    assert.equal(huntDreadnaughtPublicState(won).dreadnaught, "gone");
    await load(page, won);
    await checkpoint("players-win", width);
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
    `The Hunt for the Dreadnaught browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
