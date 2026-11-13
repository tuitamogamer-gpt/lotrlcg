import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import { addCurrentQuestProgress } from "../src/game/side-quests.ts";
import { ringBearer } from "../src/game/lotr-saga.ts";
import { ROAD_DARKENS_FRODO } from "../src/game/lotr-saga-codes.ts";
import {
  BF,
  BREAKING_FELLOWSHIP_HOOKS,
  BREAKING_FELLOWSHIP_QUESTS,
  BREAKING_FELLOWSHIP_RECIPES,
} from "../src/game/breaking-fellowship.ts";
import { base, stage } from "../tests/breaking-fellowship-fixtures.ts";
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
    new URL("../tests/breaking-fellowship-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/breaking-fellowship-browser";
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
const panel = "[data-scenario-panel='breaking-of-the-fellowship']";
const H = BREAKING_FELLOWSHIP_HOOKS;
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
          await fresh(page, "breaking-of-the-fellowship", players, easy);
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
            ...s.breakingFellowship.setAside,
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
              p.heroes
                .filter((h) => h.code === ROAD_DARKENS_FRODO)
                .map((h) => h.code),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...BREAKING_FELLOWSHIP_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            BREAKING_FELLOWSHIP_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.deepEqual(
            s.staging.map((u) => u.code).sort(),
            [BF.argonath, BF.sarn].sort(),
          );
          assert.deepEqual(
            (await resume(page)).breakingFellowship,
            s.breakingFellowship,
          );
          await page.locator(`${panel} [data-stage='1']`).waitFor();
          await page.locator(`${panel} [data-ring-bearer='in']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The seven printed quest cards.
    for (const [index, code] of BREAKING_FELLOWSHIP_QUESTS.map(
      (q) => q.code,
    ).entries()) {
      const s = base(1, index === 0 ? 1 : 2);
      s.breakingFellowship.currentQuest = code;
      s.stage = Number(card(code).cost);
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
    // The Great River: the Uruk-hai cannot be engaged and shoot instead.
    const river = base(2, 1);
    stage(river, BF.tracker);
    stage(river, BF.archer);
    stage(river, BF.argonath);
    stage(river, BF.sarn);
    await load(page, river);
    await page.locator(`${panel} [data-stage='1']`).waitFor();
    await checkpoint("great-river", width);
    // The Company Divided: the Ring-bearer is removed from the game.
    const company = base(2, 1);
    company.progress = 12;
    check(company);
    flush(company);
    assert.ok(company.breakingFellowship.ringBearerOut);
    await load(page, company);
    await page.locator(`${panel} [data-ring-bearer='out']`).waitFor();
    await checkpoint("company-divided", width);
    // 2B: each player advances to a different stage 3A and shares the cards.
    const split = base(2, 2);
    stage(split, BF.anduin);
    stage(split, BF.hunter);
    split.phase = "refresh";
    run(split, ...H.roundEnd(split));
    assert.match(split.choice.title, /Advance to a different stage 3A/);
    await load(page, split);
    await checkpoint("choose-stage-three", width);
    let s = await choose(page, BF.hobbits);
    s = await choose(page, s.choice.options[0].id);
    assert.match(s.choice.title, /Move an encounter card/);
    await checkpoint("share-cards", width);
    for (let n = 0; s.choice && n < 10; n++)
      s = await choose(page, s.choice.options[0].id);
    assert.ok(s.breakingFellowship.split);
    await page.locator(`${panel} [data-split='true']`).waitFor();
    await page.locator(`${panel} [data-areas='2']`).waitFor();
    await checkpoint("separate-stages", width);
    // Frodo's Choice is discarded instead of progress: it is revealed.
    const found = base(1, 2);
    found.breakingFellowship.currentQuest = BF.seat;
    found.stage = 3;
    found.encounterDeck = [BF.anduin, BF.choice, BF.anduin];
    found.phase = "staging";
    addCurrentQuestProgress(found, 3);
    flush(found);
    assert.equal(found.breakingFellowship.frodoPlayer, 0);
    assert.equal(found.breakingFellowship.currentQuest, BF.setsOut);
    await load(page, found);
    await page.locator(`${panel} [data-ring-bearer='choice']`).waitFor();
    await checkpoint("frodos-choice", width);
    // 4B: a revealed enemy may be engaged by raising threat.
    const offer = base(1, 2);
    offer.breakingFellowship.currentQuest = BF.setsOut;
    offer.heroes.push(offer.breakingFellowship.ringBearerOut);
    offer.breakingFellowship.ringBearerOut = null;
    offer.stage = 4;
    offer.phase = "staging";
    offer.encounterDeck = [BF.captain, ...offer.encounterDeck];
    run(offer, fx("reveal", { player: 0 }));
    assert.match(offer.choice.title, /Response: raise your threat/);
    await load(page, offer);
    await checkpoint("ring-bearer-sets-out", width);
    s = await choose(page, "engage-0");
    assert.ok(s.engaged.some((u) => u.code === BF.captain));
    // Fallen into Evil: a hero becomes an enemy.
    const fallen = base(2, 2);
    fallen.phase = "staging";
    fallen.encounterDeck = [BF.fallen, ...fallen.encounterDeck];
    run(fallen, fx("reveal", { player: 1 }));
    assert.match(fallen.choice.title, /^Fallen into Evil/);
    await load(page, fallen);
    await checkpoint("fallen-into-evil", width);
    // Victory: The Ring-bearer Sets Out is defeated without Parth Galen.
    const won = base(1, 2);
    won.breakingFellowship.currentQuest = BF.setsOut;
    won.heroes.push(won.breakingFellowship.ringBearerOut);
    won.breakingFellowship.ringBearerOut = null;
    won.stage = 4;
    won.progress = 16;
    check(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("frodo-sets-out", width);
    // Defeat: The One Ring leaves play.
    const lost = base(1, 1);
    const bearer = ringBearer(lost);
    lost.heroes = lost.heroes.filter((h) => h.id !== bearer.id);
    check(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("ring-lost-at-amon-hen", width);
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
    `Breaking of the Fellowship browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
