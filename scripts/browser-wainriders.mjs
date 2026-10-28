import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { createGame } from "../src/game/engine.ts";
import { WANDERER_DECK } from "../tests/wainriders-player-fixtures.ts";
import { get, make, stats } from "../src/game/core.ts";
import {
  WAINRIDERS as W,
  WAINRIDERS_QUESTS,
  WAINRIDERS_RECIPES,
} from "../src/game/wainriders-support.ts";
import { WAINRIDERS_PLAYER as P } from "../src/game/wainriders-player-support.ts";
import { base } from "../tests/wainriders-fixtures.ts";
import {
  fixture,
  wanderer,
  hand,
  ally,
  attach,
  ring,
} from "../tests/wainriders-player-fixtures.ts";
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
    new URL("../tests/wainriders-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/wainriders-browser";
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
const panel = () =>
  page.locator('[data-scenario-panel="challenge-of-the-wainriders"]');
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
async function action(id, label) {
  await board(id).getByRole("button", { name: label }).click();
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
          await fresh(page, "challenge-of-the-wainriders", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          assert.equal(s.staging.length, players + 2);
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...WAINRIDERS_QUESTS.map((c) => c.code),
          ].sort();
          const recipe = WAINRIDERS_RECIPES.find(
            (r) => r.mode === (easy ? "easy" : "standard"),
          );
          assert.deepEqual(
            physical,
            recipe.cards.flatMap((r) => Array(r.quantity).fill(r.code)).sort(),
          );
          assert.deepEqual((await resume(page)).wainriders, s.wainriders);
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    const transition = base();
    transition.phase = "staging";
    transition.heroes[0].committed = true;
    transition.heroes[0].exhausted = true;
    transition.heroes[0].tempWill = 8;
    transition.encounterDeck = Array(20).fill(W.cunning);
    await load(page, transition);
    let s = await next(page);
    assert.match(s.choice.title, /Racing defense/);
    const pending = s.choice;
    assert.deepEqual((await resume(page)).choice, pending);
    await checkpoint("racing-test-pending", width);
    s = await choose(page, transition.heroes[1].id);
    assert.equal(s.stage, 2);
    s = await settle(page);
    await checkpoint("racing-test-resolved", width);
    for (let i = 0; i < 6; i++) {
      await load(page, base());
      await panel()
        .getByRole("button", { name: `Inspect stage ${i + 1}`, exact: true })
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
    const victory = base();
    victory.phase = "staging";
    victory.stage = 6;
    victory.wainriders.challengerSteps = 11;
    victory.wainriders.currentQuest = WAINRIDERS_QUESTS[5].code;
    victory.heroes[0].committed = true;
    victory.heroes[0].exhausted = true;
    victory.heroes[0].tempWill = 5;
    victory.encounterDeck = Array(10).fill(W.cunning);
    await load(page, victory);
    s = await next(page);
    assert.match(s.choice.title, /Racing attack/);
    s = await choose(page, victory.heroes[1].id);
    assert.equal(s.status, "won");
    await checkpoint("second-circuit-victory", width);
    const travel = base();
    travel.phase = "travel";
    const ravine = make(travel, W.ravine);
    travel.staging.push(ravine);
    travel.encounterDeck = Array(20).fill(W.cunning);
    await load(page, travel);
    await action(ravine.id, "Travel here");
    s = await saved(page);
    assert.match(s.choice.title, /Racing attack/);
    s = await choose(page, travel.heroes[1].id);
    assert.equal(s.activeLocation.id, ravine.id);
    assert.equal(s.wainriders.lastTest.required, 2);
    await checkpoint("ravine-travel-test", width);
    const nativeWanderer = createGame(
      429,
      WANDERER_DECK,
      [P.saruman],
      "custom",
      { scenarioId: "challenge-of-the-wainriders" },
    );
    await load(page, nativeWanderer);
    await checkpoint("wanderer-native-setup-pending", width);
    await resume(page);
    s = await saved(page);
    s = await choose(page, s.choice.options.find((o) => o.id !== "skip").id);
    assert.equal(s.wainridersPlayers.contracts[0].side, "B");
    assert.equal(s.hand.length, 6);
    assert.ok(s.heroes[0].attachments.length);
    s = await opening(page);
    assert.equal(s.phase, "resource");
    assert.equal(s.hand.length, 7, "the first resource phase draws one card");
    await checkpoint("wanderer-native-setup-complete", width);

    const grey = fixture();
    grey.heroes[0].code = "01001";
    const c = wanderer(grey),
      h = grey.heroes[0];
    h.damage = 3;
    h.exhausted = true;
    await load(page, grey);
    await page
      .getByRole("button", {
        name: "Exhaust · Raise threat 1 · Choose two effects",
        exact: true,
      })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.ok(s.wainridersPlayers.contracts[0].unit.exhausted);
    await resume(page);
    await checkpoint("wanderer-paid-choice", width);
    await choose(page, "ready");
    s = await choose(page, "heal");
    assert.equal(get(s, h.id).damage, 0);
    assert.equal(get(s, h.id).exhausted, false);
    await checkpoint("wanderer-two-effects", width);
    await page
      .getByRole("button", {
        name: "Inspect Grey Wanderer contract",
        exact: true,
      })
      .click();
    await checkpoint("wanderer-reverse", width);
    await close();
    const sar = fixture(),
      hero = make(sar, P.saruman);
    hero.resources = 10;
    hero.exhausted = true;
    sar.heroes = [hero];
    sar.startingHeroes = [hero.code];
    const staff = attach(sar, hero, P.staff),
      event = hand(sar, P.sighted);
    await load(page, sar);
    await action(hero.id, /Exhaust · Reduce Doomed or search/);
    await choose(page, "reduce");
    await play(event.id);
    s = await saved(page);
    assert.match(s.choice.title, /Saruman/);
    s = await choose(page, "ready");
    assert.equal(get(s, hero.id).exhausted, false);
    assert.equal(s.threat, sar.threat);
    await checkpoint("saruman-doomed-response", width);
    s = await settle(page);
    assert.deepEqual(s.encounterDeck, sar.encounterDeck);
    await checkpoint("far-sighted-order", width);
    const scouts = fixture(),
      scout = ally(scouts, P.scout),
      enemy = make(scouts, "01096");
    scouts.staging = [enemy];
    await load(page, scouts);
    await action(scout.id, /Discard to avoid an enemy/);
    s = await saved(page);
    assert.ok(!get(s, scout.id));
    s = await choose(page, enemy.id);
    assert.ok(s.wainridersPlayers.scout.some((x) => x.enemy === enemy.id));
    await checkpoint("scout-paid-engagement-choice", width);
    const horns = fixture(2),
      a = hand(horns, "01013"),
      b = hand(horns, "01017", 1),
      horn = hand(horns, P.horns);
    await load(page, horns);
    await play(horn.id);
    await choose(page, a.id);
    s = await choose(page, b.id);
    assert.ok(get(s, a.id) && get(s, b.id));
    await resume(page);
    await checkpoint("horns-multiplayer-allies", width);
    for (let i = 0; i < 4 && s.phase === "planning"; i++) s = await next(page);
    assert.ok(!get(s, a.id) && !get(s, b.id));
    await checkpoint("horns-phase-end-return", width);
    const command = fixture(),
      bearer = ring(command),
      power = hand(command, P.command);
    await load(page, command);
    await play(power.id, bearer.id);
    s = await saved(page);
    assert.ok(get(s, bearer.id).attachments.some((a) => a.code === P.command));
    await checkpoint("power-of-command-ring-target", width);
    const noriState = fixture(),
      nori = hand(noriState, P.nori);
    await load(page, noriState);
    await play(nori.id);
    s = await saved(page);
    assert.ok(get(s, nori.id));
    await checkpoint("nori-played", width);
    const soldierState = fixture(),
      soldier = hand(soldierState, P.soldier);
    await load(page, soldierState);
    await play(soldier.id);
    s = await saved(page);
    assert.equal(s.threat, soldierState.threat + 2);
    assert.ok(get(s, soldier.id));
    await checkpoint("soldier-doomed", width);
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
    `Wainriders browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
