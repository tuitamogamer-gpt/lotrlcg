import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  DDCD as D,
  DDCD_QUESTS,
  DDCD_RECIPES,
} from "../src/game/dungeons-deep-support.ts";
import { HOBBIT_BILBO } from "../src/game/hobbit-codes.ts";
import { base } from "../tests/dungeons-deep-fixtures.ts";
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
    new URL("../tests/dungeons-deep-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/dungeons-deep-browser";
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
          await fresh(page, "dungeons-deep-and-caverns-dim", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          assert.equal(s.dungeonsDeep.bilboInRiddleArea, true);
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
            ...s.dungeonsDeep.riddleArea.map((u) => u.code),
            D.ring,
            ...DDCD_QUESTS.map((c) => c.code),
            HOBBIT_BILBO,
          ].sort();
          assert.deepEqual(
            physical,
            DDCD_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.deepEqual((await resume(page)).dungeonsDeep, s.dungeonsDeep);
          await page.locator("[data-riddle-progress='0']").waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const [stage, index] of [
      [1, 0],
      [1, 1],
      [3, 2],
    ]) {
      const s = base(1, stage);
      await load(page, s);
      if (index === 1) {
        await page
          .getByRole("button", { name: "Inspect Riddles in the Dark" })
          .first()
          .click();
        await checkpoint("quest-riddles", width);
        await page
          .getByRole("button", { name: "Close dialog", exact: true })
          .last()
          .click();
        continue;
      }
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(DDCD_QUESTS[index].code).name}`,
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
    // The riddle area beside stage 2: Gollum and Bilbo with his ring.
    await load(page, base(1));
    await page.locator("[data-riddle-progress]").waitFor();
    await checkpoint("riddle-area", width);
    let s;
    // Answer What's In My Pocket?, which must be answered.
    const pocket = base(1);
    pocket.heroes.find((h) => h.code === HOBBIT_BILBO).resources = 0;
    pocket.deck = ["01073", "01073", "01073"];
    pocket.encounterDeck = [D.pocket, D.axeman];
    pocket.phase = "staging";
    handle(pocket, fx("reveal", { player: 0 }));
    flush(pocket);
    await load(page, pocket);
    s = await saved(page);
    assert.match(s.choice.title, /names a sphere/);
    await checkpoint("riddle-name", width);
    s = await choose(page, "sphere-baggins");
    s = await choose(page, "cost-0");
    while (s.choice || s.flow?.pending) {
      if (s.flow?.pending) {
        await reviewedState(page);
        s = await saved(page);
        continue;
      }
      if (/Gollum attacks/.test(s.choice.title)) {
        await checkpoint("gollum-attack", width);
        s = await choose(page, "undefended");
        continue;
      }
      s = await choose(page, s.choice.options[0].id);
    }
    assert.equal(s.heroes.find((h) => h.code === HOBBIT_BILBO).damage, 2);
    // Into the Fire is won at 16 progress.
    const victory = base(1, 3);
    victory.phase = "staging";
    victory.heroes[0].committed = true;
    victory.heroes[0].exhausted = true;
    victory.heroes[0].tempWill = 40;
    await load(page, victory);
    s = await next(page);
    assert.equal(s.status, "won");
    await checkpoint("into-the-fire-victory", width);
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
    `Dungeons Deep and Caverns Dim browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
