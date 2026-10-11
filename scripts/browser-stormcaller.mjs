import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import * as F from "../tests/stormcaller-fixtures.ts";
import {
  STORMCALLER as C,
  STORMCALLER_PLAYER_QUESTS,
  STORMCALLER_PURSUER_QUESTS,
} from "../src/game/stormcaller-support.ts";
import { stormcallerArea } from "../src/game/stormcaller.ts";
import { card, plain } from "../src/game/cards.ts";
import { fx, get, make } from "../src/game/core.ts";
import { allCharacters, allEngaged } from "../src/game/table.ts";
import { revealed } from "../src/game/board.ts";
import { flush, handle } from "../src/game/effects.ts";
import { beginSailingTest } from "../src/game/sailing.ts";
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
  settle,
} from "./browser-angmar-helpers.mjs";
const dir = "output/stormcaller";
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
const boardCard = (p, code) =>
  p
    .locator(".board-card")
    .filter({ has: p.locator(`img[data-card-code="${code}"]`) })
    .first();
async function printedFace(p, q, reverse = false) {
  assert.equal(
    await p.locator("[data-card-primary-name]").textContent(),
    reverse ? (q.back_name ?? q.name) : q.name,
  );
  const primary = p.locator("[data-card-primary-rules]");
  const expected = plain(reverse ? q.back_text : q.text);
  if (expected) assert.equal(await primary.textContent(), expected);
  else assert.equal(await primary.count(), 0, "blank printed face has no rules");
  const other = p.locator("[data-card-other-face] .rules-text");
  const otherExpected = plain(reverse ? q.text : q.back_text);
  if (otherExpected) assert.equal(await other.textContent(), otherExpected);
  else assert.equal(await other.count(), 0, "blank other face has no rules");
}
try {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    const view = await context(browser, width, height, errors, entries);
    page = view.p;
    for (const players of [1, 2, 3, 4])
      for (const easy of [false, true]) {
        await fresh(page, "flight-of-the-stormcaller", players, easy);
        await page.locator("#start-btn").click();
        const s = await opening(page),
          q = s.stormcaller;
        assert.equal(s.scenarioId, "flight-of-the-stormcaller");
        assert.ok(q.initialized);
        assert.equal(q.enemyStage, 2);
        assert.equal(q.enemyProgress, 0);
        assert.equal(
          s.encounterDeck.length,
          easy ? 23 : players >= 3 ? 31 : 32,
        );
        assert.equal(q.corsairDeck.length, easy ? 10 : 13);
        assert.equal(
          s.staging.filter((u) => u.code === C.rolling).length,
          easy ? 1 : players >= 3 ? 2 : 1,
        );
        assert.equal(
          allCharacters(s).filter(
            (u) => card(u.code).type_code === "ship-objective",
          ).length,
          players === 1 ? 2 : players,
        );
        assert.equal(
          await page.locator('[data-scenario-panel="stormcaller"]').count(),
          1,
        );
        assert.equal(
          await page.locator(`img[data-card-code="${C.stormcaller}"]`).count(),
          1,
        );
        for (const code of [...q.questDeck, ...q.enemyQuestDeck])
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
    // Real Sailing commitment, looked faces, heading selection and reload.
    let s = F.base();
    s.phase = "quest";
    s.encounterDeck = [C.calm, C.skiff, C.swift, C.coast];
    beginSailingTest(s);
    await load(page, s);
    const dream = allCharacters(s).find((u) => u.code === C.dream);
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
    await checkpoint(page, "sailing-results", width);
    await resume(page);
    await select(page, "sailing-heading-1");
    assert.equal((await saved(page)).sailing.heading, 0);
    // Catching up changes the same physical public area cards into legal staging targets.
    s = F.setPlayerStage(F.base(2), 2);
    s.phase = "encounter";
    s.stormcaller.corsairDeck = [C.sailor, C.blade, C.seafarer];
    const bossId = s.stormcaller.stormcallerId;
    await load(page, s);
    const engageButton = boardCard(page, C.stormcaller).getByRole("button", {
      name: "Engage",
      exact: true,
    });
    assert.ok(await engageButton.isEnabled());
    await checkpoint(page, "same-stage-area", width);
    await engageButton.click();
    s = await settle(page);
    assert.ok(allEngaged(s).some((u) => u.id === bossId));
    assert.equal(stormcallerArea(s).length, 0);
    assert.equal(
      allEngaged(s).filter((u) => [C.sailor, C.blade].includes(u.code)).length,
      2,
    );
    assert.equal(
      await page.locator(`img[data-card-code="${C.seafarer}"]`).count(),
      0,
    );
    await checkpoint(page, "stormcaller-boarding", width);
    await resume(page);
    // Skiff's printed forced choice belongs to its engaged controller.
    s = F.base();
    s.phase = "encounter";
    const skiff = make(s, C.skiff);
    s.staging.push(skiff);
    s.stormcaller.corsairDeck = [C.seafarer, C.blade];
    await load(page, s);
    await boardCard(page, C.skiff)
      .getByRole("button", { name: "Engage", exact: true })
      .click();
    await reviewedState(page);
    assert.match((await saved(page)).choice.title, /Corsair Skiff/);
    await checkpoint(page, "skiff-choice", width);
    await resume(page);
    await select(page, "board");
    assert.ok(allEngaged(await saved(page)).some((u) => u.code === C.seafarer));
    // A real treachery choice permits every eligible questing character, including ships.
    s = F.base();
    s.phase = "staging";
    for (const u of allCharacters(s)) u.committed = true;
    revealed(s, C.overboard);
    flush(s);
    await load(page, s);
    assert.match((await saved(page)).choice.title, /Man Overboard/);
    await checkpoint(page, "overboard-choice", width);
    await resume(page);
    s = await saved(page);
    const hero = s.heroes[0].id;
    await select(page, hero);
    assert.ok(!(await saved(page)).heroes.some((u) => u.id === hero));
    // Hidden Cove pays main-quest progress, then offers its optional heal response.
    s = F.base();
    s.phase = "travel";
    s.progress = 3;
    for (const u of s.allies) u.damage = 5;
    const cove = make(s, C.cove);
    s.staging.push(cove);
    await load(page, s);
    await boardCard(page, C.cove)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.progress, 1);
    assert.equal(s.stormcaller.enemyProgress, 2);
    assert.match(s.choice.title, /Hidden Cove/);
    await checkpoint(page, "cove-response", width);
    await resume(page);
    await select(page, "heal");
    assert.ok((await saved(page)).allies.every((u) => u.damage === 1));
    // Pursuer3C reveals an actual search and keeps its future4C hidden.
    s = F.base();
    s.stormcaller.enemyProgress = 12;
    s.encounterDeck = [C.escort, C.calm];
    handle(s, fx("stormcallerEnemyAdvance"));
    flush(s);
    await load(page, s);
    assert.match((await saved(page)).choice.title, /Sahír's Escort/);
    assert.equal(
      await page.locator(`img[data-card-code="${C.capeEnemy}"]`).count(),
      0,
    );
    await checkpoint(page, "pursuer-escort-search", width);
    await resume(page);
    await select(page, (await saved(page)).choice.options[0].id);
    s = await saved(page);
    assert.equal(s.stormcaller.enemyStage, 3);
    assert.ok(stormcallerArea(s).some((u) => u.code === C.escort));
    // Inspect every original quest face through the actual main/Stormcaller dialogs.
    for (const [index, q] of STORMCALLER_PLAYER_QUESTS.entries()) {
      s = F.setPlayerStage(F.base(), index + 1);
      await load(page, s);
      await page.locator(".quest-card-stack").first().click();
      assert.match(
        await page.getByRole("dialog").innerText(),
        new RegExp(`Stage ${index + 1} of 4`),
      );
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await printedFace(page, q);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await printedFace(page, q, true);
      await checkpoint(page, `player-quest-${index + 1}`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    for (const [index, q] of STORMCALLER_PURSUER_QUESTS.entries()) {
      s = F.setEnemyStage(F.base(), index + 2);
      await load(page, s);
      await page
        .getByRole("button", { name: "Inspect Stormcaller quest", exact: true })
        .click();
      await printedFace(page, q);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await printedFace(page, q, true);
      await checkpoint(page, `pursuer-quest-${index + 2}`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    s = F.setPlayerStage(F.base(), 2);
    s.progress = 11;
    s.phase = "staging";
    for (const u of allCharacters(s)) u.committed = true;
    await load(page, s);
    await page
      .getByRole("button", { name: "Resolve quest", exact: true })
      .last()
      .click();
    s = await settle(page);
    assert.equal(s.status, "won");
    assert.ok(
      await page
        .getByRole("heading", { name: "Beyond the shadow", exact: true })
        .isVisible(),
    );
    await checkpoint(page, "caught-stormcaller-victory", width);
    s = F.setEnemyStage(F.base(), 4);
    s.stormcaller.enemyProgress = 23;
    s.phase = "refresh";
    s.encounterDeck = [C.calm];
    await load(page, s);
    await page
      .getByRole("button", { name: "Begin next round", exact: true })
      .last()
      .click();
    s = await settle(page);
    assert.equal(s.status, "lost");
    assert.ok(
      await page
        .getByRole("heading", {
          name: "The fellowship has fallen",
          exact: true,
        })
        .isVisible(),
    );
    await checkpoint(page, "stormcaller-escaped-defeat", width);
    await view.c.close();
  }
  await report(dir, { errors, screenshots, entries, checks });
  console.log(`Stormcaller browser checks passed: ${checks.length}`);
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
