import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import { applyAction } from "../src/game/engine.ts";
import { tosAragorn } from "../src/game/lotr-saga.ts";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes.ts";
import { forOwner } from "../src/game/table.ts";
import { UH, URUK_HAI_QUESTS, URUK_HAI_RECIPES } from "../src/game/uruk-hai.ts";
import {
  base,
  engaged,
  reload,
  settle,
  stage,
} from "../tests/uruk-hai-fixtures.ts";
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
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/uruk-hai-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/uruk-hai-browser";
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
const panel = "[data-scenario-panel='the-uruk-hai']";
const run = (s, ...effects) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s, code, player) => {
  s.encounterDeck.unshift(code);
  return run(s, fx("reveal", { player }));
};
const checkAs = (s, player) => {
  forOwner(s, player, () => check(s));
  flush(s);
  return settle(s);
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
          await fresh(page, "the-uruk-hai", players, easy);
          await page.locator("#start-btn").click();
          if (players === 2 && !easy) {
            // Stop at the first Captive choice, once the hands are kept.
            for (let n = 0; n < 100; n++) {
              await reviewedState(page);
              const state = await saved(page);
              if (state.choice) break;
              if (state.phase === "setup")
                await page
                  .getByRole("button", { name: "Keep hand", exact: true })
                  .click();
              else await page.waitForTimeout(25);
            }
            assert.match(
              (await saved(page)).choice.title,
              /^Follow the Orcs · Choose a hero to be a Captive/,
            );
            await checkpoint("choose-a-captive", width);
          }
          let s = await opening(page);
          for (let n = 0; s.choice && n < 20; n++)
            s = await choose(page, s.choice.options[0].id);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...(s.victoryCards ?? []),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.heroes.filter((h) => h.code === TOS_ARAGORN).map((h) => h.code),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...URUK_HAI_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            URUK_HAI_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.equal(s.urukHai.pursuit, 10);
          assert.equal(s.urukHai.captives.length, players);
          assert.equal(card(s.activeLocation.code).name, "Eastemnet");
          assert.deepEqual((await resume(page)).urukHai, s.urukHai);
          await page.locator(`${panel} [data-stage='1']`).waitFor();
          await page.locator(`${panel} [data-pursuit='10']`).waitFor();
          await page.locator(`${panel} [data-captives='${players}']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The two printed quest cards.
    for (const [index, code] of URUK_HAI_QUESTS.map((q) => q.code).entries()) {
      const s = base(1, index + 1);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(code).name}`,
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
    // Follow the Orcs: Uglúk waits in the staging area while the pursuit value rises.
    const follow = base(2, 1);
    follow.urukHai.pursuit = 14;
    stage(follow, UH.plains);
    stage(follow, UH.uruk);
    engaged(follow, UH.snaga, 0);
    await load(page, follow);
    await page.locator(`${panel} [data-pursuit='14']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^1B$/ }).waitFor();
    await checkpoint("follow-the-orcs", width);
    // Grishnákh takes a Captive.
    let grishnakh = base(2, 1);
    grishnakh.phase = "staging";
    reveal(grishnakh, UH.grishnakh, 0);
    assert.match(grishnakh.choice.title, /^Grishnákh · Attach a Captive/);
    await load(page, grishnakh);
    await checkpoint("grishnakh-takes-a-captive", width);
    let s = await choose(page, grishnakh.choice.options[1].id);
    s = await resume(page);
    assert.ok(s.urukHai.captives[1].holder);
    await page
      .locator(`${panel} [data-captives='2']`, {
        hasText: "attached to Grishnákh",
      })
      .waitFor();
    await checkpoint("captive-attached-to-grishnakh", width);
    // The encounter cards' choices.
    for (const [label, code, title] of [
      ["ugluks-uruk-hai", UH.uruks, /^Uglúk's Uruk-hai · Choose one/],
      ["isengard-uruk", UH.uruk, /^Isengard Uruk · Choose one/],
      ["rest-by-night", UH.rest, /^Rest by Night\? · Choose one/],
      ["sarumans-orders", UH.orders, /^Saruman's Orders · Choose/],
    ]) {
      const state = base(1, 1);
      if (code === UH.orders) engaged(state, UH.snaga, 0);
      state.phase = "quest";
      reveal(state, code, 0);
      assert.match(state.choice.title, title);
      await load(page, state);
      await checkpoint(label, width);
    }
    // Aragorn spends 2 resources to ready a hero.
    let ready = base(1, 1);
    const hero = ready.heroes.find((h) => h.code !== TOS_ARAGORN);
    hero.exhausted = true;
    ready = applyAction(reload(ready), {
      type: "ABILITY",
      id: tosAragorn(ready).id,
    });
    assert.match(ready.choice.title, /^Aragorn · Ready a hero/);
    await load(page, ready);
    await checkpoint("aragorn-readies-a-hero", width);
    s = await choose(page, hero.id);
    assert.equal(
      (s.table ? s : s).heroes.find((h) => h.id === hero.id).exhausted,
      false,
    );
    // Rescue the Captives, with Unseen Barrier and Fighting Uruk-hai this round.
    const rescue = base(2, 2);
    stage(rescue, UH.fighter);
    engaged(rescue, UH.uruk, 1);
    rescue.urukHai.barrier = { round: rescue.round, placed: 2 };
    rescue.urukHai.fighting = { round: rescue.round, players: [1] };
    await load(page, rescue);
    await page.locator(`${panel} [data-stage='2']`).waitFor();
    await page.locator(`${panel} [data-barrier='2']`).waitFor();
    await page.locator(`${panel} [data-fighting='1']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^2B$/ }).waitFor();
    await checkpoint("rescue-the-captives", width);
    // Victory: Uglúk is gone and the progress reaches the pursuit value.
    let won = base(1, 2);
    won.staging = won.staging.filter((u) => u.code !== UH.ugluk);
    won.progress = 10;
    won = checkAs(won, 0);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("captives-rescued", width);
    // Defeat: the Uruk-hai reach Isengard.
    let late = base(1, 1);
    late.urukHai.pursuit = 29;
    late.phase = "refresh";
    late = settle(run(late, fx("endRound", { player: 0 })));
    assert.equal(late.status, "lost");
    await load(page, late);
    await checkpoint("the-uruk-hai-reach-isengard", width);
    // Defeat: Aragorn leaves play.
    let fallen = base(1, 1);
    fallen.heroes = fallen.heroes.filter((h) => h.code !== TOS_ARAGORN);
    fallen = checkAs(fallen, 0);
    assert.equal(fallen.status, "lost");
    await load(page, fallen);
    await checkpoint("aragorn-has-fallen", width);
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
    `The Uruk-hai browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
