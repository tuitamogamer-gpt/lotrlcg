import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import {
  ULFAST as U,
  ULFAST_QUESTS,
  ULFAST_RECIPES,
} from "../src/game/ulfast-support.ts";
import { ULFAST_PLAYER as P } from "../src/game/ulfast-player-support.ts";
import { base } from "../tests/ulfast-fixtures.ts";
import {
  fixture,
  contract,
  hand,
  attach,
  ring,
} from "../tests/ulfast-player-fixtures.ts";
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
  settle,
  url,
} from "./browser-angmar-helpers.mjs";

const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/ulfast-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/ulfast-browser";
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
const board = (id) => page.locator(`[data-motion-card="${id}"]`);
const panel = () => page.locator('[data-scenario-panel="the-city-of-ulfast"]');
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function close() {
  await page
    .getByRole("button", { name: "Close dialog", exact: true })
    .last()
    .click();
}
async function attack(enemyId, heroId) {
  await board(enemyId)
    .getByRole("button", { name: /^(Attack|Ranged ·)/ })
    .click();
  const s = await saved(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: card(get(s, heroId).code).name, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Attack ·/ })
    .click();
  await reviewedState(page);
}
async function play(id, target) {
  await board(id)
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  if (target)
    await page
      .locator(`.decision-card[data-unit-id="${target}"] .decision-select`)
      .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  await reviewedState(page);
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
          await fresh(page, "the-city-of-ulfast", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          assert.equal(s.ulfast.initialized, true);
          assert.equal(s.staging.length, players + 1);
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
          ].sort();
          const recipe = ULFAST_RECIPES.find(
            (r) => r.mode === (easy ? "easy" : "standard"),
          );
          assert.deepEqual(
            physical,
            recipe.cards
              .filter((r) => r.section !== "sharedQuestDeck")
              .flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.deepEqual((await resume(page)).ulfast, s.ulfast);
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    const transition = base(2);
    transition.phase = "staging";
    transition.heroes[0].committed = true;
    transition.heroes[0].exhausted = true;
    transition.heroes[0].tempWill = 20;
    transition.committedIds = [transition.heroes[0].id];
    await load(page, transition);
    let s = await next(page);
    assert.equal(s.stage, 2);
    assert.ok(s.choice);
    const pending = s.choice;
    assert.deepEqual((await resume(page)).choice, pending);
    await checkpoint("stage-two-pending", width);
    s = await choose(page, "threat");
    s = await choose(page, "threat");
    assert.equal(s.stageRevealing, false);
    assert.equal(s.ulfast.resources, 0);
    await checkpoint("stage-two-resolved", width);
    for (let i = 0; i < 4; i++) {
      const state = base();
      state.stage = i + 1;
      state.ulfast.currentQuest = ULFAST_QUESTS[i].code;
      await load(page, state);
      await panel()
        .getByRole("button", { name: "Inspect current quest", exact: true })
        .click();
      assert.ok(
        (
          await page
            .locator(".card-detail img[data-card-code]")
            .getAttribute("src")
        ).includes(".B.jpg"),
      );
      await checkpoint(`quest-${i + 1}-back`, width);
      await page
        .getByRole("button", { name: "Show front", exact: true })
        .click();
      await checkpoint(`quest-${i + 1}-front`, width);
      await close();
    }
    const travel = base();
    travel.phase = "travel";
    const lawn = make(travel, U.lawn);
    travel.staging.push(lawn);
    await load(page, travel);
    await board(lawn.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.ulfast.resources, 1);
    assert.equal(s.activeLocation.id, lawn.id);
    await resume(page);
    await checkpoint("lawn-travel-resource", width);

    const victory = base();
    victory.phase = "attack";
    victory.stage = 4;
    victory.ulfast.currentQuest = ULFAST_QUESTS[3].code;
    victory.progress = 20;
    victory.threat = 45;
    const guard = victory.staging.find((u) => u.code === U.guard);
    guard.damage = 19;
    victory.heroes[0].tempAttack = 10;
    await load(page, victory);
    await attack(guard.id, victory.heroes[0].id);
    await settle(page);
    s = await saved(page);
    assert.equal(s.status, "won");
    assert.match(s.reason, /Ulfast/);
    await checkpoint("guard-final-victory", width);

    const hunters = fixture();
    hunters.phase = "refresh";
    const c = contract(hunters);
    for (const h of hunters.heroes) {
      attach(hunters, h, "01039");
      attach(hunters, h, "01040");
      h.damage = 1;
    }
    hunters.heroes[1].attachments = [];
    attach(hunters, hunters.heroes[1], "12034");
    const initialWill = stats(hunters, hunters.heroes[1]).will;
    await load(page, hunters);
    await page
      .getByRole("button", { name: "Flip Three Hunters contract", exact: true })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.ulfastPlayers.contracts[0].side, "B");
    assert.equal(stats(s, s.heroes[1]).will, initialWill + 2);
    assert.equal((await resume(page)).ulfastPlayers.contracts[0].side, "B");
    await checkpoint("hunters-flipped", width);
    await page
      .getByRole("button", { name: "Heal each of your heroes", exact: true })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.ok(s.heroes.every((h) => h.damage === 0));
    assert.equal(get(s, c.id).exhausted, true);
    await checkpoint("hunters-healed", width);
    await page
      .getByRole("button", {
        name: "Inspect Three Hunters contract",
        exact: true,
      })
      .click();
    await checkpoint("hunters-reverse", width);
    await close();

    const sentryState = fixture(),
      location = make(sentryState, "01097");
    sentryState.staging.push(location);
    sentryState.victoryCards = [location.code];
    const sentry = hand(sentryState, P.sentry);
    await load(page, sentryState);
    await play(sentry.id);
    s = await saved(page);
    assert.match(s.choice.title, /Woodland Sentry/);
    assert.deepEqual((await resume(page)).choice, s.choice);
    await choose(page, location.id);
    assert.equal(get(await saved(page), location.id), undefined);
    await checkpoint("sentry-discard", width);

    const knightState = fixture();
    knightState.discard = ["01029"];
    const knight = hand(knightState, P.knight);
    await load(page, knightState);
    await play(knight.id);
    s = await saved(page);
    assert.match(s.choice.title, /Knight of Belfalas/);
    await choose(page, "0");
    assert.ok((await saved(page)).hand.some((u) => u.code === "01029"));
    await checkpoint("knight-recovery", width);

    const bowState = fixture();
    bowState.phase = "attack";
    const archer = bowState.heroes[2];
    attach(bowState, archer, P.bow);
    const enemy = make(bowState, "01083");
    bowState.engaged.push(enemy);
    const discarded = hand(bowState, "01018");
    await load(page, bowState);
    await attack(enemy.id, archer.id);
    await choose(page, "use");
    await choose(page, discarded.id);
    s = await saved(page);
    assert.deepEqual((await resume(page)).choice, s.choice);
    await checkpoint("bow-pending-cost", width);
    await choose(page, "done");
    await settle(page);
    assert.ok((await saved(page)).discard.includes("01018"));
    await checkpoint("bow-paid", width);

    const strengthState = fixture();
    strengthState.phase = "attack";
    const bearer = ring(strengthState);
    attach(strengthState, bearer, P.strength);
    const foe = make(strengthState, "01082");
    strengthState.engaged.push(foe);
    await load(page, strengthState);
    await attack(foe.id, bearer.id);
    await choose(page, "use");
    await settle(page);
    s = await saved(page);
    assert.equal(s.threat, strengthState.threat + 1);
    assert.ok(
      get(s, bearer.id).attachments.find((a) => a.code === "21001").exhausted,
    );
    await checkpoint("strength-attack", width);
    await view.c.close();
  }
  const p = await browser.newPage();
  for (const a of art) {
    const response = await p.request.get(new URL(a.localPath, url).href);
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
    const size = await p.evaluate(
      async (bytes) => {
        const b = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const s = { width: b.width, height: b.height };
        b.close();
        return s;
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
    `Ulfast browser passed ${checks.length} checkpoints, ${setups.length} native setups, ${artwork.length} original faces`,
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
