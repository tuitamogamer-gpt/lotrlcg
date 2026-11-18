import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import { forOwner } from "../src/game/table.ts";
import {
  WQ,
  WQ_QUESTS,
  WQ_STAGE2,
  WQ_STAGE3,
  wqCost,
  wqRecipe,
} from "../src/game/wizards-quest-support.ts";
import {
  allies,
  atQuest,
  base,
  engaged,
  hand,
} from "../tests/wizards-quest-fixtures.ts";
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
    new URL("../tests/wizards-quest-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/wizards-quest-browser";
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
const panel = "[data-scenario-panel='the-wizards-quest']";
const GUARD = "01013";
const stage = (s, code) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const fromBox = (s, code) => {
  s.wizardsQuest.box.splice(s.wizardsQuest.box.indexOf(code), 1);
};
/** The opening hands, then the quick build through the actual dialogs. */
async function build(picks) {
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
  throw Error("The Wizard's Quest opening did not finish");
}
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
      for (const easy of [false, true])
        for (const players of [1, 2, 3, 4]) {
          const stage2 = WQ_STAGE2[(players - 1) % 3];
          const stage3 = WQ_STAGE3[players % 3];
          const set = `set:${14 + players + (easy ? 4 : 0)}`;
          await fresh(page, "the-wizards-quest", players, easy);
          await page.locator("#start-btn").click();
          const s = await build([stage2, stage3, set, "random"]);
          const q = s.wizardsQuest;
          assert.equal(q.building, null);
          assert.deepEqual(q.questDeck, [stage2, stage3]);
          assert.equal(q.sets.length, 7);
          assert.ok(q.sets.includes(Number(set.slice(4))));
          // Every physical card of the recipe is in one zone.
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...q.box,
            ...q.questDeck,
            q.currentQuest,
          ].sort();
          assert.deepEqual(
            physical,
            wqRecipe()
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          // Rhosgobel and a different 0 cost enemy or location per player.
          assert.equal(
            s.staging.filter((u) => u.code === WQ.rhosgobel).length,
            1,
          );
          const zero = s.staging.filter((u) => u.code !== WQ.rhosgobel);
          assert.equal(zero.length, players);
          assert.equal(
            new Set(zero.map((u) => card(u.code).name)).size,
            players,
          );
          assert.ok(zero.every((u) => wqCost(u.code) === 0));
          assert.deepEqual((await resume(page)).wizardsQuest, q);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-side='1B']`).waitFor();
          await page.locator(`${panel} [data-rhosgobel='staging']`).waitFor();
          await page
            .locator(`${panel} button[aria-label='Inspect Rhosgobel']`)
            .waitFor();
          await page.locator(`${panel} [data-stage2='${stage2}']`).waitFor();
          await page.locator(`${panel} [data-stage3='${stage3}']`).waitFor();
          await page
            .locator(`${panel} [data-sets='${q.sets.join(",")}']`)
            .waitFor();
          setups.push({ players, easy, stage2, stage3, sets: q.sets });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The quick build's dialogs.
    await fresh(page, "the-wizards-quest", 2, false);
    await page.locator("#start-btn").click();
    for (let i = 0; i < 50; i++) {
      await reviewedState(page);
      const s = await saved(page);
      if (s.choice) break;
      await page
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
    }
    let s = await saved(page);
    assert.match(s.choice.title, /Choose the stage 2 quest card/);
    await page.locator(`${panel} [data-stage2='']`).waitFor();
    await checkpoint("choose-stage-2", width);
    s = await choose(page, WQ.carried);
    s = await choose(page, "random");
    assert.match(s.choice.title, /Choose encounter set 1 of 7/);
    await checkpoint("choose-encounter-sets", width);
    s = await choose(page, "set:15");
    s = await choose(page, "random");
    assert.match(
      s.choice.title,
      /^Radagast's Request · The opposing team adds/,
    );
    await checkpoint("radagasts-request-setup", width);
    // Every quest card, front and back.
    for (const q of WQ_QUESTS) {
      const t = base(1);
      atQuest(t, q.code);
      await load(page, t);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${q.back_name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint(`quest-${q.back_name}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${q.back_name}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Rhosgobel: the players travel there and use its Response; explored, it
    // flips to Rider of Mirkwood.
    const rhos = base(1);
    fromBox(rhos, WQ.rhosgobel);
    stage(rhos, WQ.rhosgobel);
    rhos.phase = "travel";
    await load(page, rhos);
    await page.locator(`${panel} [data-rhosgobel='staging']`).waitFor();
    s = await travel();
    assert.match(s.choice.title, /^Rhosgobel · Response/);
    await checkpoint("rhosgobel-response", width);
    s = await choose(page, "use");
    assert.ok(s.heroes.every((h) => h.resources === 11));
    await page.locator(`${panel} [data-rhosgobel='active']`).waitFor();
    const rider = base(1);
    fromBox(rider, WQ.rhosgobel);
    stage(rider, WQ.rider);
    await load(page, rider);
    await page.locator(`${panel} [data-rider='staging']`).waitFor();
    await page
      .locator(`${panel} button[aria-label='Inspect Rider of Mirkwood']`)
      .waitFor();
    await checkpoint("rider-of-mirkwood", width);
    // 2A: the opposing team's search of the top 5 cards.
    const forest = base(1);
    forest.encounterDeck = [WQ.nazgul, WQ.spider, WQ.patch, WQ.gate, WQ.troll];
    forest.progress = 10;
    check(forest);
    flush(forest);
    assert.match(
      forest.choice.title,
      /^Mirkwood Forest · The opposing team chooses a card/,
    );
    await load(page, forest);
    await page.locator(`${panel} [data-side='2A']`).waitFor();
    await checkpoint("mirkwood-forest-search", width);
    s = await choose(page, WQ.patch);
    assert.match(s.choice.title, /^A Fork in the Road · /);
    s = await choose(page, s.choice.options[0].id);
    assert.ok(s.wizardsQuest.forkId);
    await page.locator(`${panel} [data-side='2B']`).waitFor();
    await checkpoint("fork-in-the-road", width);
    // Carried Away guards an ally.
    const carried = base(1);
    carried.wizardsQuest.questDeck = [WQ.carried, WQ.sorcery];
    allies(carried, [GUARD]);
    carried.progress = 10;
    check(carried);
    flush(carried);
    await load(page, carried);
    s = await saved(page);
    s = await choose(page, s.choice.options[0].id);
    assert.match(
      s.choice.title,
      /^Carried Away · The opposing team chooses an ally/,
    );
    await checkpoint("carried-away", width);
    s = await choose(page, s.choice.options[0].id);
    assert.equal(s.wizardsQuest.carried.length, 1);
    await page.locator(`${panel} [data-guarded='1']`).waitFor();
    // A New Terror Abroad: Rider of Mirkwood attacks at the beginning of the quest phase.
    const terror = base(1);
    atQuest(terror, WQ.terror);
    fromBox(terror, WQ.rhosgobel);
    stage(terror, WQ.rider);
    terror.encounterDeck = [];
    terror.queue.push(fx("wqTerrorAttack", { player: 0 }));
    flush(terror);
    assert.match(terror.choice.title, /^Rider of Mirkwood · Immediate attack/);
    await load(page, terror);
    await checkpoint("new-terror-abroad", width);
    // Dungeons of the Necromancer: a hero is guarded by an enemy.
    const dungeons = base(1);
    atQuest(dungeons, WQ.carried);
    dungeons.wizardsQuest.questDeck = [WQ.dungeons];
    dungeons.wizardsQuest.defeated = [WQ.request];
    dungeons.encounterDeck = [
      WQ.gate,
      WQ.gate,
      WQ.gate,
      WQ.gate,
      WQ.gate,
      WQ.gate,
    ];
    dungeons.encounterDiscard = [WQ.troll];
    dungeons.progress = 20;
    check(dungeons);
    flush(dungeons);
    await load(page, dungeons);
    s = await saved(page);
    s = await choose(page, WQ.gate);
    assert.match(
      s.choice.title,
      /^Dungeons of the Necromancer · Attach a hero/,
    );
    await checkpoint("dungeons-guard", width);
    s = await choose(page, s.choice.options[0].id);
    assert.equal(s.wizardsQuest.guardedHeroes.length, 1);
    assert.equal(s.heroes.length, 2);
    await page.locator(`${panel} [data-guarded='1']`).waitFor();
    // Necromancer's Pass and Power Sevenfold.
    const pass = base(1);
    hand(pass, [GUARD, "01016", "01017"]);
    pass.encounterDeck = [WQ.pass];
    pass.queue.push(fx("reveal", { player: 0 }));
    flush(pass);
    await load(page, pass);
    s = await saved(page);
    if (s.choice?.title.startsWith("Revealed"))
      s = await choose(page, "resolve");
    assert.match(
      s.choice.title,
      /^Necromancer's Pass · Choose a card in your hand/,
    );
    await checkpoint("necromancers-pass", width);
    s = await choose(page, s.choice.options[0].id);
    s = await choose(page, s.choice.options[0].id);
    assert.equal(s.wizardsQuest.passGuards.length, 1);
    await page.locator(`${panel} [data-guarded='1']`).waitFor();
    const seven = base(1);
    stage(seven, WQ.gate);
    stage(seven, WQ.pine);
    seven.encounterDeck = [WQ.sevenfold, WQ.warg, WQ.warg];
    seven.queue.push(fx("reveal", { player: 0 }));
    flush(seven);
    await load(page, seven);
    s = await saved(page);
    if (s.choice?.title.startsWith("Revealed"))
      s = await choose(page, "resolve");
    assert.match(
      s.choice.title,
      /^Power Sevenfold · The opposing team chooses/,
    );
    await checkpoint("power-sevenfold", width);
    // Under the Shadow and Nightfall in the scenario panel.
    const dark = base(1);
    dark.questAttachments = {
      [WQ.request]: [{ id: "shadow-1", code: WQ.shadow, exhausted: false }],
    };
    dark.wizardsQuest.nightfall = [{ player: 0, code: WQ.nightfall }];
    await load(page, dark);
    await page.locator(`${panel} [data-conditions='2']`).waitFor();
    await checkpoint("under-the-shadow-nightfall", width);
    // The last fight: Rider of Mirkwood engaged at Return to Rhosgobel.
    const last = base(1);
    atQuest(last, WQ.return);
    fromBox(last, WQ.rhosgobel);
    forOwner(last, 0, () => {
      const r = make(last, WQ.rider);
      r.damage = 7;
      last.engaged.push(r);
    });
    last.progress = 10;
    check(last);
    assert.equal(last.status, "playing");
    await load(page, last);
    await page.locator(`${panel} [data-rider='engaged']`).waitFor();
    await checkpoint("return-to-rhosgobel", width);
    const won = base(1);
    atQuest(won, WQ.return);
    fromBox(won, WQ.rhosgobel);
    won.victoryCards = [WQ.rider];
    won.victory = 6;
    won.progress = 10;
    check(won);
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("players-win", width);
    void engaged;
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
    `The Wizard's Quest browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
