import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import * as F from "../tests/voyage-belegaer-fixtures.ts";
import {
  VOYAGE as V,
  VOYAGE_QUESTS,
  VOYAGE_STAGE_TWO,
} from "../src/game/voyage-belegaer-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { allCharacters, allEngaged, ownerOf } from "../src/game/table.ts";
import { check, engage, revealed } from "../src/game/board.ts";
import { flush, handle } from "../src/game/effects.ts";
import { beginSailingTest } from "../src/game/sailing.ts";
import { voyageShadow } from "../src/game/voyage-belegaer.ts";
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
  settle,
} from "./browser-angmar-helpers.mjs";

const dir = "output/voyage-belegaer";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  errors = [],
  screenshots = [],
  entries = new Set(),
  checks = [];
let page;
async function checkpoint(p, name, width) {
  await capture(p, dir, `${name}-${width}`, screenshots);
  checks.push(`${name}-${width}`);
  console.log(`PASS ${name} @ ${width}`);
}
async function select(p, id) {
  await choose(p, id);
  return saved(p);
}
function current(s, code) {
  const q = s.voyageBelegaer;
  const all = [q.currentQuest, ...q.questDeck, ...q.completedQuests];
  q.currentQuest = code;
  q.questDeck = all.filter((c) => c !== code);
  q.completedQuests = [];
  s.stage = code === V.departure ? 1 : code === V.pursuit ? 3 : 2;
  return s;
}
try {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    const view = await context(browser, width, height, errors, entries);
    page = view.p;
    for (const players of process.env.VOYAGE_BROWSER_SKIP_DESKTOP_SETUP ===
      "1" && width === 1440
      ? []
      : [1, 2, 3, 4])
      for (const easy of [false, true]) {
        await fresh(page, "voyage-across-belegaer", players, easy);
        await page.locator("#start-btn").click();
        const s = await opening(page);
        assert.equal(s.scenarioId, "voyage-across-belegaer");
        assert.ok(s.voyageBelegaer.initialized);
        assert.equal(s.sailing.heading, 0);
        assert.equal(
          allCharacters(s).filter(
            (u) => card(u.code).type_code === "ship-objective",
          ).length,
          players === 1 ? 2 : players,
        );
        assert.equal(s.encounterDeck.length, easy ? 19 : 27);
        assert.equal(s.voyageBelegaer.corsairDeck.length, easy ? 7 : 9);
        assert.deepEqual(
          [...s.voyageBelegaer.questDeck.slice(0, 4)].sort(),
          [...VOYAGE_STAGE_TWO].sort(),
        );
        assert.equal(
          await page.locator('[data-scenario-panel="sailing"]').count(),
          1,
        );
        const fleetPanel = await page
          .locator('[data-scenario-panel="sailing"]')
          .innerText();
        assert.match(fleetPanel, /On-course/);
        // Before the printed look effect, the hidden quest deck has no DOM face.
        for (const code of s.voyageBelegaer.questDeck)
          assert.equal(
            await page.locator(`img[data-card-code="${code}"]`).count(),
            0,
          );
        await checkpoint(
          page,
          `setup-${players}-${easy ? "easy" : "normal"}`,
          width,
        );
        await resume(page);
      }
    // The actual Sailing dialog commits the Dream-chaser, resolves symbols and
    // persists the continuation through a browser reload.
    let s = F.base();
    s.phase = "quest";
    s.encounterDeck = [V.calm, V.thrown, V.sudden, V.scout];
    beginSailingTest(s);
    await load(page, s);
    const dream = allCharacters(s).find((u) => u.code === V.dream);
    await select(page, dream.id);
    await checkpoint(page, "sailing-commit", width);
    await resume(page);
    await select(page, "done");
    await page
      .getByRole("button", { name: "Resolve Sailing test", exact: true })
      .last()
      .click();
    s = await saved(page);
    assert.equal(s.sailing.test.successes, 3);
    await checkpoint(page, "sailing-symbol-results", width);
    await resume(page);
    await select(page, "sailing-heading-1");
    s = await saved(page);
    assert.equal(s.sailing.heading, 0);
    assert.ok(!s.sailing.test);
    // A looked quest choice exposes precisely two stages and preserves the
    // unchosen physical quest at the bottom after reload.
    s = F.base();
    s.voyageBelegaer.questDeck = [
      V.storm,
      V.mists,
      V.divination,
      V.guidance,
      V.pursuit,
    ];
    s.progress = 8;
    check(s);
    flush(s);
    await load(page, s);
    await checkpoint(page, "quest-stage-choice", width);
    assert.deepEqual(
      (await saved(page)).choice.options.map((o) => o.code),
      [V.storm, V.mists],
    );
    await select(page, V.mists);
    s = await settle(page);
    assert.equal(s.voyageBelegaer.currentQuest, V.mists);
    assert.equal(s.voyageBelegaer.questDeck.at(-1), V.storm);
    await resume(page);
    // Boarding choices stay with the owner, and the dedicated Corsair deck
    // never exposes its future cards in the staging area.
    s = F.base(2);
    s.voyageBelegaer.corsairDeck = [V.pirate, V.sailor, V.marauder];
    s.voyageBelegaer.corsairDiscard = [];
    const cruiser = make(s, V.cruiser);
    s.staging.push(cruiser);
    engage(s, cruiser);
    flush(s);
    s = F.settle(s);
    await load(page, s);
    assert.equal(
      allEngaged(await saved(page)).filter((u) =>
        [V.pirate, V.sailor].includes(u.code),
      ).length,
      2,
    );
    assert.equal(
      await page.locator(`img[data-card-code="${V.marauder}"]`).count(),
      0,
    );
    await checkpoint(page, "corsair-boarding", width);
    await resume(page);
    // A real encounter choice and a real shadow choice survive reload.
    s = F.base();
    s.progress = 3;
    revealed(s, V.thrown);
    flush(s);
    await load(page, s);
    await checkpoint(page, "thrown-choice", width);
    await resume(page);
    await select(page, "progress");
    s = await saved(page);
    assert.equal(s.progress, 0);
    assert.equal(s.threat, 24);
    s = F.base();
    const scout = make(s, V.scout);
    s.engaged.push(scout);
    s.combat = {
      enemyId: scout.id,
      attackPlayer: 0,
      defenderId: s.allies[0].id,
      attackBonus: 0,
    };
    voyageShadow(s, V.winds);
    await load(page, s);
    await checkpoint(page, "winds-shadow-choice", width);
    await resume(page);
    await select(page, "undefended");
    assert.equal((await saved(page)).combat.defenderId, null);
    // The maximum heading cannot pay Rolling Seas' off-course Travel cost;
    // movement explicitly bypassing Travel costs is a separate legal path.
    s = F.base();
    s.phase = "travel";
    s.sailing.heading = 3;
    const rolling = make(s, V.rolling);
    s.staging.push(rolling);
    await load(page, s);
    const travel = page
      .locator(".board-card")
      .filter({ has: page.locator(`img[data-card-code="${V.rolling}"]`) })
      .getByRole("button", { name: "Travel here", exact: true });
    assert.ok(await travel.isDisabled());
    assert.match(await travel.getAttribute("title"), /cost cannot be paid/);
    await checkpoint(page, "rolling-worst-cost-blocked", width);
    s.staging.push(make(s, V.waterspout));
    await load(page, s);
    assert.ok(
      await page
        .getByRole("button", { name: "Travel to Waterspout", exact: true })
        .last()
        .isDisabled(),
    );
    handle(s, fx("travelEnter", { target: rolling.id }));
    flush(s);
    s = F.settle(s);
    await load(page, s);
    assert.equal((await saved(page)).activeLocation.id, rolling.id);
    assert.equal((await saved(page)).sailing.heading, 3);
    await checkpoint(page, "rolling-forced-travel-bypass", width);
    // Ship and quest inspection show the actual cached printed faces, not only
    // the engine's condensed goals.
    s = F.base();
    await load(page, s);
    await page
      .locator('[data-scenario-panel="sailing"]')
      .getByRole("button", { name: /Dream-chaser/ })
      .click();
    assert.equal(
      await page.locator("[data-card-primary-name]").innerText(),
      "Dream-chaser",
    );
    assert.equal(
      await page.locator("[data-card-primary-rules]").textContent(),
      plain(card(V.dream).text),
    );
    await checkpoint(page, "ship-printed-face", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    for (const q of VOYAGE_QUESTS) {
      s = current(F.base(), q.code);
      if (q.code === V.pursuit) s.staging.push(make(s, V.scout));
      await load(page, s);
      await page.locator(".quest-card-stack").first().click();
      assert.ok((await page.getByRole("dialog").innerText()).includes(q.name));
      assert.match(
        await page.getByRole("dialog").innerText(),
        new RegExp(`Stage ${s.stage} of 3`),
      );
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      assert.equal(
        await page.locator("[data-card-primary-name]").innerText(),
        q.name,
      );
      assert.equal(
        await page.locator("[data-card-primary-rules]").textContent(),
        plain(q.text),
      );
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      assert.equal(
        await page.locator("[data-card-primary-rules]").textContent(),
        plain(q.back_text),
      );
      await checkpoint(
        page,
        `quest-face-${q.name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        width,
      );
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    await view.c.close();
  }
  await report(dir, { errors, screenshots, entries, checks });
  console.log(`Voyage Belegaer browser checks passed: ${checks.length}`);
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      { error: String(error), stack: error.stack, checks, errors },
      null,
      2,
    ),
  );
  if (page && !page.isClosed())
    await page.screenshot({ path: `${dir}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
