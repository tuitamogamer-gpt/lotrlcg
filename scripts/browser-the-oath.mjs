import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { addVictoryCard, check, progressLocation } from "../src/game/board.ts";
import { forOwner } from "../src/game/table.ts";
import { OATH, OATH_QUESTS, oathRecipe } from "../src/game/the-oath-support.ts";
import {
  activate,
  allies,
  atStage,
  base,
  engaged,
} from "../tests/the-oath-fixtures.ts";
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
    new URL("../tests/the-oath-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/the-oath-browser";
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
const panel = "[data-scenario-panel='the-oath']";
const stage = (s, code) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
async function travel() {
  await page.getByRole("button", { name: "Travel here" }).first().click();
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
      for (const scenarioId of ["the-oath-2018", "the-oath"])
        for (const easy of [false, true])
          for (const players of [1, 2, 3, 4]) {
            await fresh(page, scenarioId, players, easy);
            await page.locator("#start-btn").click();
            let s = await opening(page);
            for (let n = 0; s.choice && n < 20; n++)
              s = await choose(page, s.choice.options[0].id);
            // No encounter card is revealed during setup.
            const physical = [
              ...s.encounterDeck,
              ...s.encounterDiscard,
              ...s.staging.map((u) => u.code),
              ...(s.oath.troopAside ? [OATH.troop] : []),
              ...OATH_QUESTS.map((c) => c.code),
            ].sort();
            assert.deepEqual(
              physical,
              oathRecipe(scenarioId, easy)
                .cards.flatMap((r) => Array(r.quantity).fill(r.code))
                .sort(),
            );
            assert.deepEqual(
              s.staging.map((u) => u.code),
              [OATH.eaves],
            );
            assert.equal(
              s.oath.edition,
              scenarioId === "the-oath" ? "2022" : "2018",
            );
            assert.deepEqual((await resume(page)).oath, s.oath);
            await page.locator(panel).waitFor();
            await page.locator(`${panel} [data-troop='aside']`).waitFor();
            await page
              .locator(`${panel} [data-edition='${s.oath.edition}']`)
              .waitFor();
            setups.push({ scenarioId, players, easy });
            await checkpoint(
              `setup-${scenarioId}-${players}-${easy ? "easy" : "normal"}`,
              width,
            );
          }
    for (const index of [0, 1, 2]) {
      const s = base(1);
      atStage(s, index + 1);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(OATH_QUESTS[index].code).name}`,
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
    // 1B is defeated: 2A's search for a Forest location.
    const forest = base(1);
    forest.encounterDeck = [OATH.grove, OATH.gate, OATH.eaves];
    forest.encounterDiscard = [OATH.trail];
    forest.progress = 9;
    check(forest);
    flush(forest);
    assert.equal(forest.stage, 2);
    assert.match(
      forest.choice.title,
      /^Mirkwood Forest · Add a Forest location/,
    );
    await load(page, forest);
    await page.locator(`${panel} [data-stage='2']`).waitFor();
    await checkpoint("forest-search", width);
    let s = await choose(page, "Goblin Trail");
    assert.ok(s.staging.some((u) => u.code === OATH.trail));
    // Goblin Trail: traveling there reveals the top encounter card.
    const trail = base(1);
    atStage(trail, 2);
    trail.progress = 6;
    stage(trail, OATH.trail);
    trail.encounterDeck = [OATH.greatSpider, OATH.eaves];
    trail.phase = "travel";
    await load(page, trail);
    await page.locator(`${panel} [data-trails='0']`).waitFor();
    await checkpoint("goblin-trail", width);
    s = await travel();
    assert.equal(s.activeLocation.code, OATH.trail);
    assert.ok(s.staging.some((u) => u.code === OATH.greatSpider));
    // Explored: the victory display, 6 progress and 3A's Goblin Troop.
    const explored = base(2);
    atStage(explored, 2);
    explored.progress = 6;
    const active = activate(explored, OATH.trail);
    active.progress = 5;
    explored.encounterDeck = [OATH.eaves, OATH.eaves];
    explored.encounterDiscard = [OATH.scavengers];
    progressLocation(explored, active, 1);
    flush(explored);
    check(explored);
    flush(explored);
    assert.equal(explored.stage, 3);
    assert.match(explored.choice.title, /^The Rearguard · Add a Goblin enemy/);
    await load(page, explored);
    await page.locator(`${panel} [data-trails='1']`).waitFor();
    await page.locator(`${panel} [data-troop='play']`).waitFor();
    await checkpoint("rearguard-goblin-search", width);
    s = await choose(page, "Goblintown Scavengers");
    assert.ok(s.staging.some((u) => u.code === OATH.troop));
    // Spider Den's Quest Action.
    const den = base(1);
    stage(den, OATH.den);
    den.encounterDeck = [OATH.greatSpider, OATH.eaves];
    den.phase = "quest";
    await load(page, den);
    await page
      .getByRole("button", {
        name: "Spider Den · Quest Action: put a Spider enemy into play engaged with you to discard Spider Den",
      })
      .first()
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.match(s.choice.title, /^Spider Den · Put a Spider enemy/);
    await checkpoint("spider-den", width);
    s = await choose(page, "Great Spider");
    assert.ok(!s.staging.some((u) => u.code === OATH.den));
    // Goblins are Upon You! and Eyes in the Dark.
    const upon = base(1);
    upon.encounterDeck = [OATH.upon, OATH.eaves, OATH.runners];
    upon.encounterDiscard = [OATH.scavengers];
    upon.queue.push(fx("reveal", { player: 0 }));
    flush(upon);
    assert.match(upon.choice.title, /^Goblins are Upon You!/);
    await load(page, upon);
    await checkpoint("goblins-upon-you", width);
    s = await choose(page, "Goblin Runners");
    const eyes = base(1);
    const [guard] = allies(eyes, ["01013"]);
    guard.committed = true;
    eyes.heroes[0].committed = true;
    eyes.encounterDeck = [OATH.eyes, OATH.eaves];
    eyes.queue.push(fx("reveal", { player: 0 }));
    flush(eyes);
    assert.match(eyes.choice.title, /^Eyes in the Dark · Choose/);
    await load(page, eyes);
    await checkpoint("eyes-in-the-dark", width);
    s = await choose(page, "threat");
    // The Eaves of Mirkwood is active: no cancellation.
    const eaves = base(1);
    activate(eaves, OATH.eaves);
    engaged(eaves, OATH.spiders);
    await load(page, eaves);
    await page.locator(`${panel} [data-eaves]`).waitFor();
    await checkpoint("eaves-active", width);
    // Victory: Goblin Troop has left play and 3B is defeated.
    const won = base(1);
    atStage(won, 3);
    addVictoryCard(won, OATH.trail);
    won.progress = 6;
    check(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("rearguard-defeated", width);
    // 3B waits while Goblin Troop is engaged.
    const waiting = base(1);
    atStage(waiting, 3);
    forOwner(waiting, 0, () => waiting.engaged.push(make(waiting, OATH.troop)));
    waiting.progress = 6;
    check(waiting);
    assert.equal(waiting.status, "playing");
    await load(page, waiting);
    await page.locator(`${panel} [data-troop='play']`).waitFor();
    await checkpoint("troop-engaged", width);
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
    `The Oath browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
