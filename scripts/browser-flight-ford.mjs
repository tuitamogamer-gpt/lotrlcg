import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { FLIGHT_FORD_HOOKS } from "../src/game/flight-ford.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import {
  FF,
  FLIGHT_FORD_QUESTS,
  FLIGHT_FORD_RECIPES,
} from "../src/game/flight-ford-support.ts";
import { SAGA_FRODO, ONE_RING } from "../src/game/lotr-saga-codes.ts";
import { ringBearer } from "../src/game/lotr-saga.ts";
import { base, engaged } from "../tests/flight-ford-fixtures.ts";
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
    new URL("../tests/flight-ford-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/flight-ford-browser";
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
const panel = "[data-scenario-panel='flight-to-the-ford']";
const stage = (s, code) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
async function travel(name) {
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
      for (const easy of [false, true])
        for (const players of [1, 2, 3, 4]) {
          await fresh(page, "flight-to-the-ford", players, easy);
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
            ...s.flightFord.setAside,
            ...s.flightFord.burdens,
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
            ...FLIGHT_FORD_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            FLIGHT_FORD_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(
            s.staging.filter((u) => u.code === FF.fell).length,
            players,
          );
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].heroes.some(
              (h) =>
                h.code === SAGA_FRODO &&
                h.attachments.some((a) => a.code === ONE_RING) &&
                h.attachments.some((a) => a.code === FF.wound),
            ),
          );
          assert.deepEqual((await resume(page)).flightFord, s.flightFord);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-life='15']`).waitFor();
          await page.locator(`${panel} [data-burdens='5']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const index of [0, 1]) {
      const s = base(1);
      s.stage = index + 1;
      s.flightFord.currentQuest = FLIGHT_FORD_QUESTS[index].code;
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(FLIGHT_FORD_QUESTS[index].code).name}`,
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
    // An Evil Wound: damage to the Ring-bearer reduces his life instead.
    const wound = base(1);
    wound.queue.push(
      fx("damage", { target: ringBearer(wound).id, value: 4, player: 0 }),
    );
    flush(wound);
    assert.equal(wound.flightFord.life, 11);
    await load(page, wound);
    await page.locator(`${panel} [data-life='11']`).waitFor();
    await checkpoint("evil-wound", width);
    // The Last Bridge: travelling there reveals the top burden.
    const bridge = base(1);
    stage(bridge, FF.bridge);
    bridge.flightFord.burdens = [FF.fear, FF.panicked];
    bridge.encounterDeck = Array(6).fill(FF.oldRoad);
    bridge.phase = "travel";
    await load(page, bridge);
    await page.locator(`${panel} [data-bridge='in-play']`).waitFor();
    let s = await travel();
    assert.match(s.choice.title, /Fear of Discovery/);
    await checkpoint("last-bridge-burden", width);
    s = await choose(page, "exhaust");
    assert.equal(s.flightFord.burdens.length, 1);
    await page.locator(`${panel} [data-burdens='1']`).waitFor();
    // Fell Rider at the beginning of the encounter phase.
    const fell = base(1);
    const rider = stage(fell, FF.fell);
    fell.queue.push(fx("ffFellRider", { target: rider.id, player: 0 }));
    flush(fell);
    assert.match(fell.choice.title, /Fell Rider/);
    await load(page, fell);
    await checkpoint("fell-rider", width);
    s = await choose(page, "life");
    assert.equal(s.flightFord.life, 14);
    // Stricken Dumb.
    const stricken = base(1);
    stricken.phase = "staging";
    stricken.encounterDeck = [FF.stricken, ...Array(6).fill(FF.oldRoad)];
    stricken.queue.push(fx("reveal", { player: 0 }));
    flush(stricken);
    assert.match(stricken.choice.title, /Stricken Dumb/);
    await load(page, stricken);
    await checkpoint("stricken-dumb", width);
    s = await choose(page, "burden");
    assert.equal(s.flightFord.burdens.length, 4);
    // Stage 2B and the Ford of Bruinen.
    const race = base(1);
    race.encounterDeck = Array(6).fill(FF.oldRoad);
    race.queue.push(fx("ffNextStage", { player: 0 }));
    flush(race);
    assert.equal(race.stage, 2);
    race.phase = "travel";
    await load(page, race);
    await page.locator(`${panel} [data-ford='in-play']`).waitFor();
    await checkpoint("race-to-rivendell", width);
    s = await travel();
    assert.equal(s.activeLocation.code, FF.ford);
    // Exploring the Ford sweeps the engaged Fell Rider away; 15 progress win.
    const won = base(1);
    won.stage = 2;
    won.flightFord.currentQuest = FF.race;
    won.flightFord.setAside = [];
    won.activeLocation = make(won, FF.ford);
    engaged(won, FF.fell);
    won.phase = "quest";
    won.queue.push(fx("successfulQuestProgress", { value: 21, player: 0 }));
    flush(won);
    // As after every action, the quest advances once the queue is empty.
    check(won);
    assert.equal(won.status, "won");
    assert.equal(won.engaged.length, 0);
    await load(page, won);
    await checkpoint("reached-the-ford", width);
    // The Ring-bearer's life reaches zero.
    const lost = base(1);
    lost.flightFord.life = 1;
    lost.queue.push(...FLIGHT_FORD_HOOKS.roundEnd(lost));
    flush(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("life-zero", width);
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
    `Flight to the Ford browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
