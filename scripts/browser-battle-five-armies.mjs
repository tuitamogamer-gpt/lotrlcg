import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  BOFA as B,
  BOFA_QUESTS,
  BOFA_RECIPES,
} from "../src/game/battle-five-armies-support.ts";
import { OTD_BILBO } from "../src/game/hobbit-codes.ts";
import { make } from "../src/game/core.ts";
import { base } from "../tests/battle-five-armies-fixtures.ts";
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
    new URL("../tests/battle-five-armies-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/battle-five-armies-browser";
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
          await fresh(page, "the-battle-of-five-armies", players, easy);
          await page.locator("#start-btn").click();
          let s = await opening(page);
          // The first round begins with the first player's choice of quest.
          for (let n = 0; s.choice && n < 12; n++)
            s = await choose(
              page,
              s.choice.options.find((o) => o.id === B.dale)?.id ??
                s.choice.options[0].id,
            );
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              [...p.heroes, ...p.allies]
                .flatMap((u) => u.attachments)
                .map((a) => a.code)
                .filter((c) => c.startsWith("octgn:")),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...BOFA_QUESTS.map((c) => c.code),
            OTD_BILBO,
          ].sort();
          assert.deepEqual(
            physical,
            BOFA_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.ok(s.staging.some((u) => u.code === B.bolg));
          assert.deepEqual(
            (await resume(page)).battleFiveArmies,
            s.battleFiveArmies,
          );
          await page
            .locator("[data-scenario-panel='the-battle-of-five-armies']")
            .waitFor();
          await page.locator(`[data-bofa-stage='${B.ravenhill}']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const index of [0, 2, 4]) {
      const s = base(1);
      if (index === 0) {
        s.stage = 1;
        s.battleFiveArmies.currentQuest = B.gathering;
        s.battleFiveArmies.stageProgress = {};
      }
      if (index === 2) {
        handle(
          s,
          fx("bofaSetCurrent", { code: B.dale, text: "round", player: 0 }),
        );
        flush(s);
      }
      if (index === 4) {
        s.progress = 8;
        s.battleFiveArmies.stageProgress = { [B.dale]: 8, [B.ravenhill]: 8 };
        handle(s, fx("bofaDefeatStages", { player: 0 }));
        flush(s);
      }
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(BOFA_QUESTS[index].code).name}`,
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
    // The first player chooses the current quest at the start of a round.
    const round = base(1);
    round.battleFiveArmies.chosenRound = 0;
    round.phase = "resource";
    round.progress = 3;
    handle(round, fx("resourceBegin", { player: 0 }));
    flush(round);
    assert.match(round.choice.title, /Choose the current quest/);
    await load(page, round);
    await page
      .locator(`[data-bofa-stage='${B.spur}'][data-progress='3']`)
      .waitFor();
    await checkpoint("choose-current-quest", width);
    let s = await choose(page, B.ravenhill);
    assert.equal(s.battleFiveArmies.currentQuest, B.ravenhill);
    await page
      .locator(`[data-bofa-stage='${B.ravenhill}'][data-current='true']`)
      .waitFor();
    await checkpoint("siege-current-quest", width);
    // Misty Mountain Eagle: the first player's action from the panel.
    const eagle = base(1);
    eagle.staging.push(make(eagle, B.eagle), make(eagle, B.climber));
    eagle.heroes.find((h) => h.code === OTD_BILBO).resources = 2;
    await load(page, eagle);
    await page
      .getByRole("button", { name: /Misty Mountain Eagle · First player/ })
      .first()
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.match(s.choice.title, /Misty Mountain Eagle · Choose one/);
    await checkpoint("misty-mountain-eagle", width);
    s = await choose(page, "control");
    assert.ok(s.allies.some((u) => u.code === B.eagle));
    // The Clouds Burst: Bolg with his bodyguard, then victory.
    const clouds = base(1);
    clouds.encounterDeck = [B.bodyguard, B.path, B.path];
    clouds.progress = 8;
    clouds.battleFiveArmies.stageProgress = { [B.dale]: 8, [B.ravenhill]: 8 };
    handle(clouds, fx("bofaDefeatStages", { player: 0 }));
    flush(clouds);
    assert.equal(clouds.battleFiveArmies.currentQuest, B.clouds);
    await load(page, clouds);
    await page.locator(`[data-bofa-stage='${B.clouds}']`).waitFor();
    await checkpoint("clouds-burst", width);
    clouds.staging = clouds.staging.filter((u) => u.code !== B.bodyguard);
    clouds.encounterDiscard.push(B.bodyguard);
    const bolg = clouds.staging.find((u) => u.code === B.bolg);
    bolg.damage = 7;
    clouds.queue.push(fx("damage", { target: bolg.id, value: 1, player: 0 }));
    flush(clouds);
    assert.equal(clouds.status, "won");
    await load(page, clouds);
    await checkpoint("five-armies-victory", width);
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
    `The Battle of Five Armies browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
