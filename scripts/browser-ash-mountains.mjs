import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { createGame } from "../src/game/engine.ts";
import { get, make } from "../src/game/core.ts";
import { nextRound } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import {
  ASH as A,
  ASH_QUESTS,
  ASH_RECIPES,
} from "../src/game/ash-mountains-support.ts";
import { ASH_HOOKS as hooks } from "../src/game/ash-mountains.ts";
import { ASH_PLAYER as P } from "../src/game/ash-mountains-player.ts";
import { base } from "../tests/ash-mountains-fixtures.ts";
import {
  fixture,
  council,
  COUNCIL_DECK,
  hand,
  ally,
  attach,
  ring,
} from "../tests/ash-mountains-player-fixtures.ts";
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
    new URL("../tests/ash-mountains-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/ash-mountains-browser";
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
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
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
          await fresh(page, "under-the-ash-mountains", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          assert.equal(s.staging.length, players + 1);
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...ASH_QUESTS.map((c) => c.code),
          ].sort();
          const recipe = ASH_RECIPES.find(
            (r) => r.mode === (easy ? "easy" : "standard"),
          );
          assert.deepEqual(
            physical,
            recipe.cards.flatMap((r) => Array(r.quantity).fill(r.code)).sort(),
          );
          assert.deepEqual((await resume(page)).ashMountains, s.ashMountains);
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const stage of [1, 2]) {
      const s = base();
      s.stage = stage;
      s.ashMountains.currentQuest = ASH_QUESTS[stage - 1].code;
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(s.ashMountains.currentQuest).name}`,
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
    const hidden = base(2),
      deeps = make(hidden, A.deeps),
      lost = make(hidden, A.lost);
    hidden.staging.push(deeps, lost);
    hooks.cardEntered(hidden, deeps, true, false);
    hooks.cardEntered(hidden, lost, true, false);
    await load(page, hidden);
    assert.deepEqual(
      (await resume(page)).ashMountains.custody,
      hidden.ashMountains.custody,
    );
    await checkpoint("concealed-supplies", width);
    let damage = base();
    hooks.encounter(damage, A.writhing);
    flush(damage);
    await load(page, damage);
    let s = await saved(page);
    const pending = s.choice;
    assert.deepEqual((await resume(page)).choice, pending);
    await checkpoint("writhing-pending", width);
    s = await choose(page, damage.heroes[0].id);
    s = await choose(page, damage.heroes[1].id);
    assert.equal(get(s, damage.heroes[0].id).exhausted, true);
    await checkpoint("writhing-resolved", width);
    const travel = base();
    travel.phase = "travel";
    const tunnels = make(travel, A.tunnels),
      chasm = make(travel, A.chasm);
    travel.staging.push(tunnels, chasm);
    await load(page, travel);
    await board(chasm.id).getByRole("button", { name: "Travel here" }).click();
    s = await saved(page);
    assert.equal(s.activeLocation.id, chasm.id);
    await next(page);
    await checkpoint("mandatory-travel-completed", width);
    const victory = base();
    victory.phase = "staging";
    victory.stage = 2;
    victory.ashMountains.currentQuest = A.last;
    victory.heroes[0].committed = true;
    victory.heroes[0].exhausted = true;
    victory.heroes[0].tempWill = 30;
    await load(page, victory);
    s = await next(page);
    assert.equal(s.status, "won");
    await checkpoint("escape-victory", width);
    const contract = createGame(
      429,
      COUNCIL_DECK,
      ["01001", "01002", "01003"],
      "custom",
      { scenarioId: "under-the-ash-mountains" },
    );
    await load(page, contract);
    await opening(page);
    await page
      .getByRole("button", { name: "Inspect Council of the Wise", exact: true })
      .click();
    await checkpoint("council-native-setup", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    const rewards = fixture();
    council(rewards);
    const event = hand(rewards, "01064");
    await load(page, rewards);
    await play(event.id);
    s = await saved(page);
    while (s.choice && !s.choice.title.includes("Council"))
      s = await choose(page, s.choice.options[0].id);
    assert.match(s.choice.title, /Council/);
    assert.deepEqual((await resume(page)).choice, s.choice);
    await checkpoint("council-reward-pending", width);
    await choose(page, "resource");
    s = await choose(page, rewards.heroes[0].id);
    assert.ok(s.used.includes("round:ash-council:resource"));
    await checkpoint("council-resource", width);
    const kept = fixture(),
      bearer = ring(kept);
    attach(kept, bearer, P.preserved);
    bearer.damage = 2;
    nextRound(kept);
    flush(kept);
    await load(page, kept);
    s = await choose(page, "heal");
    s = await settle(page);
    assert.equal(get(s, bearer.id).damage, 0);
    await checkpoint("well-preserved-healed", width);
    const guarded = fixture(),
      stone = hand(guarded, P.stone);
    guarded.encounterDeck = ["01082", "01100"];
    await load(page, guarded);
    await play(stone.id);
    s = await saved(page);
    assert.ok(
      s.staging.some(
        (u) =>
          u.code === "01100" && u.attachments.some((a) => a.id === stone.id),
      ),
    );
    await checkpoint("stone-location-guard", width);
    const recruit = fixture();
    recruit.deck = ["01013", "01043", "01022", "01023", "01024", "01043"];
    const odo = hand(recruit, P.odo);
    await load(page, recruit);
    await play(odo.id);
    await choose(page, "search");
    s = await choose(page, "1");
    assert.ok(s.hand.some((u) => u.code === "01043"));
    await checkpoint("odo-search", width);
    const defiant = fixture();
    defiant.heroes[0].exhausted = true;
    const e = hand(defiant, P.defiant);
    await load(page, defiant);
    await play(e.id);
    s = await choose(page, defiant.heroes[0].id);
    assert.equal(get(s, defiant.heroes[0].id).exhausted, false);
    await checkpoint("defiant-ready", width);
    const reckless = fixture(),
      enemy = make(reckless, "01082");
    reckless.engaged.push(enemy);
    const attack = hand(reckless, P.reckless);
    await load(page, reckless);
    await play(attack.id);
    s = await choose(page, enemy.id);
    assert.equal(get(s, enemy.id).damage, 2);
    await checkpoint("reckless-attack", width);
    const bow = fixture();
    bow.engaged.push(make(bow, "01082"));
    const bowman = hand(bow, P.bowmaster);
    await load(page, bow);
    await play(bowman.id);
    s = await saved(page);
    assert.ok(get(s, bowman.id));
    await checkpoint("bowmaster-played", width);
    const helm = fixture(),
      hero = helm.heroes[1];
    hero.damage = 2;
    hero.exhausted = true;
    const swap = hand(helm, P.helm);
    await load(page, helm);
    await play(swap.id);
    await choose(page, hero.id);
    s = await saved(page);
    assert.deepEqual((await resume(page)).choice, s.choice);
    await checkpoint("helm-collection-pending", width);
    s = await choose(page, "01007");
    assert.ok(
      s.heroes.some((h) => h.code === "01007" && h.damage === 0 && h.exhausted),
    );
    await checkpoint("helm-swapped", width);
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
    `Ash Mountains browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
