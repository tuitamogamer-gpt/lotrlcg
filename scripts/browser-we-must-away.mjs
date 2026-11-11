import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  WMA as W,
  WMA_QUESTS,
  WMA_RECIPES,
  WMA_TROLLS,
} from "../src/game/we-must-away-support.ts";
import { HOBBIT_BILBO } from "../src/game/hobbit-codes.ts";
import { base } from "../tests/we-must-away-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  opening,
  next,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/we-must-away-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/we-must-away-browser";
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
const allHeroes = (s) => [
  ...s.heroes,
  ...(s.table?.seats ?? []).flatMap((p, i) =>
    i === s.table.active ? [] : p.heroes,
  ),
];
const stageTwo = (players = 1) => {
  const s = base(players, 2);
  for (const code of WMA_TROLLS) s.staging.push(make(s, code));
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
          await fresh(page, "we-must-away-ere-break-of-day", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          const heroes = allHeroes(s);
          assert.equal(heroes.filter((h) => h.code === HOBBIT_BILBO).length, 1);
          assert.ok(s.heroes.some((h) => h.code === HOBBIT_BILBO));
          const engaged = [
            ...s.engaged,
            ...(s.table?.seats ?? []).flatMap((p, i) =>
              i === s.table.active ? [] : p.engaged,
            ),
          ];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...engaged.map((u) => u.code),
            ...s.weMustAway.setAside.map((u) => u.code),
            ...s.weMustAway.sackDeck,
            ...WMA_QUESTS.map((c) => c.code),
            HOBBIT_BILBO,
          ].sort();
          assert.deepEqual(
            physical,
            WMA_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.deepEqual((await resume(page)).weMustAway, s.weMustAway);
          await page
            .locator('[data-scenario-panel="we-must-away-ere-break-of-day"]')
            .waitFor();
          await page.locator("[data-sack-deck='7']").waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const stage of [1, 2]) {
      const s = stage === 1 ? base() : stageTwo();
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(WMA_QUESTS[stage - 1].code).name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint(`quest-${stage}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${stage}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // A Sack with tied targets asks the first player to choose.
    const sacking = stageTwo();
    sacking.weMustAway.sackDeck = [W.smelly];
    handle(sacking, fx("wmaSack", { value: 1, player: 0 }));
    flush(sacking);
    await load(page, sacking);
    let s = await saved(page);
    assert.match(s.choice.title, /A Smelly Sack/);
    await checkpoint("sack-choice", width);
    s = await choose(page, s.choice.options[0].id);
    assert.ok(
      s.heroes.some((h) => h.attachments.some((a) => a.code === W.smelly)),
    );
    await checkpoint("sacked-hero", width);
    // A Troll returns to the staging area at the end of combat.
    const returning = stageTwo();
    const bert = returning.staging.find((u) => u.code === W.bert);
    returning.staging = returning.staging.filter((u) => u.id !== bert.id);
    returning.engaged.push(bert);
    handle(returning, fx("wmaTrollReturn", { target: bert.id, player: 0 }));
    flush(returning);
    await load(page, returning);
    s = await saved(page);
    assert.match(s.choice.title, /Bert/);
    await checkpoint("troll-return-choice", width);
    s = await choose(page, "return");
    assert.ok(s.staging.some((u) => u.id === bert.id));
    // Bilbo opens Troll Cave with the Troll Key and the Troll Purse.
    const cave = stageTwo();
    const troll = make(cave, W.cave);
    cave.staging.push(troll);
    const bilbo = cave.heroes.find((h) => h.code === HOBBIT_BILBO);
    bilbo.attachments.push(
      { id: "k1", code: W.key, exhausted: false },
      { id: "p1", code: W.purse, exhausted: false },
    );
    bilbo.resources = 2;
    cave.phase = "travel";
    await load(page, cave);
    await page.locator("[data-baggins-resources='2']").waitFor();
    await checkpoint("troll-cave-ready", width);
    // Dawn: no Troll is left in play and Troll Cave is in the victory display.
    const dawn = base(1, 2);
    dawn.victoryCards = [W.cave];
    dawn.victory = 2;
    dawn.phase = "staging";
    dawn.heroes[0].committed = true;
    dawn.heroes[0].exhausted = true;
    await load(page, dawn);
    s = await next(page);
    assert.equal(s.status, "won");
    assert.deepEqual(s.weMustAway.treasures, ["131020", "131022", "131021"]);
    assert.match(s.reason, /Sting, Glamdring and Orcrist/);
    await checkpoint("dawn-treasures", width);
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
    `We Must Away browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
