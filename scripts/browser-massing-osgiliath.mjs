import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, get, make } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  MASSING as M,
  MASSING_QUESTS,
  MASSING_RECIPES,
  MASSING_SCOUTS,
} from "../src/game/massing-osgiliath-support.ts";
import { base } from "../tests/massing-osgiliath-fixtures.ts";
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
    new URL("../tests/massing-osgiliath-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/massing-osgiliath-browser";
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
const toStage = (s, stage) => {
  s.stage = stage;
  s.massing.currentQuest = MASSING_QUESTS[stage - 1].code;
  s.massing.crossed = stage === 4;
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
          await fresh(page, "the-massing-at-osgiliath", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          const engaged = [
            ...s.engaged,
            ...(s.table?.seats ?? []).flatMap((p, i) =>
              i === s.table.active ? [] : p.engaged,
            ),
          ];
          for (const scout of MASSING_SCOUTS)
            assert.equal(
              [...s.staging, ...engaged].filter((u) => u.code === scout).length,
              players,
            );
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...engaged.map((u) => u.code),
            ...s.massing.setAside.map((u) => u.code),
            ...MASSING_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            MASSING_RECIPES[0].cards
              .flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.deepEqual((await resume(page)).massing, s.massing);
          await page
            .locator('[data-scenario-panel="the-massing-at-osgiliath"]')
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const stage of [1, 4]) {
      const s = toStage(base(), stage);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(s.massing.currentQuest).name}`,
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
    const crossing = toStage(base(), 3);
    crossing.phase = "quest";
    const ranger = make(crossing, M.ranger);
    ranger.owner = 0;
    ranger.controller = 0;
    crossing.allies.push(ranger);
    crossing.committedIds = [crossing.heroes[0].id];
    await load(page, crossing);
    const panel = page.locator(
      '[data-scenario-panel="the-massing-at-osgiliath"]',
    );
    await panel.getByText("each player first discards a hero").waitFor();
    await checkpoint("anduin-crossing", width);
    const pelennor = toStage(base(2), 4);
    const fields = make(pelennor, M.pelennor);
    pelennor.staging.push(fields);
    pelennor.phase = "travel";
    handle(pelennor, fx("massingPelennor", { player: 0 }));
    flush(pelennor);
    await load(page, pelennor);
    let s = await saved(page);
    assert.match(s.choice.title, /Pelennor Fields/);
    await checkpoint("pelennor-choice", width);
    s = await choose(page, fields.id);
    while (s.choice || s.flow?.pending) {
      if (s.flow?.pending) {
        await reviewedState(page);
        s = await saved(page);
        continue;
      }
      s = await choose(page, s.choice.options[0].id);
    }
    assert.equal(s.activeLocation?.id, fields.id);
    await checkpoint("pelennor-travelled", width);
    const witch = base();
    const wk = witch.massing.setAside.splice(0)[0];
    witch.staging.push(wk);
    await load(page, witch);
    s = await saved(page);
    assert.ok(s.staging.some((u) => u.id === wk.id));
    await page.locator(`[data-motion-card="${wk.id}"]`).waitFor();
    await checkpoint("witch-king-staging", width);
    const victory = toStage(base(), 4);
    victory.phase = "staging";
    victory.heroes[0].committed = true;
    victory.heroes[0].exhausted = true;
    victory.heroes[0].tempWill = 40;
    await load(page, victory);
    s = await next(page);
    assert.equal(s.status, "won");
    await checkpoint("minas-tirith-victory", width);
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
    `Massing at Osgiliath browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
void get;
