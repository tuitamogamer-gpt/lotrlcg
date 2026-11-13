import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { applyAction } from "../src/game/engine.ts";
import { flush } from "../src/game/effects.ts";
import { check, progressLocation } from "../src/game/board.ts";
import { ringBearer } from "../src/game/lotr-saga.ts";
import { ROAD_DARKENS_FRODO } from "../src/game/lotr-saga-codes.ts";
import {
  RS,
  RING_SOUTH_QUESTS,
  RING_SOUTH_RECIPES,
} from "../src/game/ring-south-support.ts";
import {
  activate,
  base,
  deck,
  engaged,
  stage,
} from "../tests/ring-south-fixtures.ts";
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
    new URL("../tests/ring-south-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/ring-south-browser";
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
const panel = "[data-scenario-panel='the-ring-goes-south']";
const run = (s, ...effects) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
const GUARD = "01013",
  SNEAK = "01023",
  SCOUT = "01016";
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
          await fresh(page, "the-ring-goes-south", players, easy);
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
            ...s.ringSouth.setAside,
            ...(s.victoryCards ?? []),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              [...p.heroes, ...p.allies]
                .flatMap((u) => u.attachments)
                .map((a) => a.code)
                .filter((c) => c.startsWith("octgn:") || c === RS.lust),
            ),
            ...seats.flatMap((p) =>
              p.heroes
                .filter((h) => h.code === ROAD_DARKENS_FRODO)
                .map((h) => h.code),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...RING_SOUTH_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            RING_SOUTH_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.deepEqual((await resume(page)).ringSouth, s.ringSouth);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-stage='1']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The four printed quest stages.
    for (const [index, code] of [
      RS.council,
      RS.walkers,
      RS.hunt,
      RS.gates,
    ].entries()) {
      const s = base(1, index + 1);
      s.ringSouth.currentQuest = code;
      if (index === 3) s.ringSouth.setAside = [RS.lust];
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
    // The Council of Elrond at the end of the planning phase.
    const council = base(2, 1);
    deck(council, [GUARD, SNEAK, SCOUT], 0);
    deck(council, [SCOUT, SNEAK, GUARD], 1);
    run(council, fx("phaseEnd"));
    assert.match(council.choice.title, /to be played for 0 cost/);
    await load(page, council);
    await page.locator(`${panel} [data-council='4']`).waitFor();
    await checkpoint("council-of-elrond", width);
    let s = await choose(page, council.ringSouth.council[0].unit.id);
    for (let n = 0; s.choice && n < 10; n++)
      s = await choose(page, s.choice.options[0].id);
    assert.equal(s.stage, 2);
    assert.equal(s.activeLocation.code, RS.pass);
    await checkpoint("nine-walkers", width);
    // The Hunt is Up!: Great Warg Chief first.
    const hunt = base(2, 2);
    hunt.encounterDeck = [RS.hollin, RS.chief, RS.howling];
    hunt.progress = 8;
    check(hunt);
    flush(hunt);
    assert.match(hunt.choice.title, /^The Hunt is Up!/);
    await load(page, hunt);
    await checkpoint("hunt-search", width);
    s = await choose(page, `deck-${RS.chief}`);
    assert.ok(s.staging.some((u) => u.code === RS.chief));
    // The Gates of Moria: the Watcher holds the Ring-bearer.
    const gates = base(1, 3);
    gates.progress = 12;
    check(gates);
    flush(gates);
    assert.equal(gates.stage, 4);
    assert.ok(gates.ringSouth.underWatcher);
    await load(page, gates);
    await page.locator(`${panel} [data-under-watcher='true']`).waitFor();
    await checkpoint("gates-of-moria", width);
    // Frodo's response when he defends.
    let defense = base(1, 2);
    const frodo = ringBearer(defense);
    frodo.resources = 1;
    const warg = engaged(defense, RS.howling);
    defense.phase = "defense";
    defense = applyAction(defense, {
      type: "DEFEND",
      enemyId: warg.id,
      defenderId: frodo.id,
    });
    assert.match(defense.choice.title, /^Frodo Baggins · Response/);
    await load(page, defense);
    await checkpoint("frodo-response", width);
    s = await choose(page, "use");
    for (let n = 0; s.choice && n < 10; n++)
      s = await choose(page, s.choice.options[0].id);
    assert.equal(s.threat, 22);
    // Victory: Doors of Durin is explored.
    const won = base(1, 4);
    won.ringSouth.setAside = [RS.lust];
    const doors = activate(won, RS.doors);
    stage(won, RS.watcher);
    progressLocation(won, doors, 9);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("doors-of-durin", width);
    // Defeat: 9 damage on Doors of Durin.
    const lost = base(1, 4);
    lost.ringSouth.setAside = [RS.lust];
    activate(lost, RS.doors).damage = 9;
    check(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("doors-overrun", width);
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
    `The Ring Goes South browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
