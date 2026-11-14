import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, progressLocation } from "../src/game/board.ts";
import { LAND_SHADOW_FRODO } from "../src/game/lotr-saga-codes.ts";
import {
  JTC,
  CROSS_ROADS_QUESTS,
  CROSS_ROADS_RECIPES,
} from "../src/game/cross-roads.ts";
import {
  activate,
  allies,
  base,
  engaged,
  settle,
  stage,
} from "../tests/cross-roads-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  context,
  fresh,
  load,
  opening,
  report,
  resume,
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/cross-roads-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/cross-roads-browser";
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
const panel = "[data-scenario-panel='journey-to-the-cross-roads']";
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
/** Past the "Revealed" confirmation of a treachery. */
const pastReveal = (s) => {
  while (s.choice && /^Revealed · /.test(s.choice.title)) {
    const resolve = s.choice.options.find((o) => o.id === "resolve");
    s.choice = null;
    s.queue.unshift(...resolve.effects);
    flush(s);
  }
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
          await fresh(page, "journey-to-the-cross-roads", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...(s.victoryCards ?? []),
            ...s.crossRoads.underCrossroads,
            ...s.crossRoads.underBlackGate,
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...[
              ...s.staging,
              ...seats.flatMap((p) => p.engaged),
              ...(s.activeLocation ? [s.activeLocation] : []),
            ].flatMap((u) => [
              ...u.attachments.map((a) => a.code),
              ...u.shadows,
            ]),
            ...CROSS_ROADS_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            CROSS_ROADS_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.filter((r) =>
                [
                  "sharedQuestDeck",
                  "sharedEncounterDeck",
                  "sharedEncounterDeck2",
                  "sharedStagingArea",
                ].includes(r.section),
              )
              .flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.equal(s.crossRoads.underCrossroads.length, 9);
          assert.ok(
            [JTC.blackGate, JTC.crossroads].every((code) =>
              s.staging.some((u) => u.code === code),
            ),
            "The Black Gate and The Cross-roads are in the staging area",
          );
          const locations = s.staging.filter(
            (u) =>
              card(u.code).type_code === "location" &&
              u.code !== JTC.crossroads,
          );
          assert.equal(
            new Set(locations.map((u) => card(u.code).name)).size,
            players - 1,
            "each player but the first added a different location",
          );
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].heroes.some((h) => h.code === LAND_SHADOW_FRODO),
            "the first player controls Frodo Baggins",
          );
          assert.deepEqual((await resume(page)).crossRoads, s.crossRoads);
          await page
            .locator(
              `${panel} [data-under-crossroads='9'][data-crossroads-ready='false']`,
            )
            .waitFor();
          await page
            .locator(
              `${panel} [data-under-black-gate='0'][data-black-gate-limit='${3 + players}']`,
            )
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The printed quest card, both sides.
    {
      const s = base(1);
      const code = CROSS_ROADS_QUESTS[0].code;
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(code).back_name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint("quest-front", width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint("quest-back", width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Setup: the second player adds a different non-unique location.
    const search = base(2);
    search.encounterDeck = [JTC.henneth, JTC.woods, JTC.hills, JTC.man];
    run(search, fx("jtcSetupSearch", { player: 1 }));
    assert.match(
      search.choice.title,
      /^Ambush the Men of Harad · Add a location to the staging area/,
    );
    await load(page, search);
    await checkpoint("setup-search", width);
    // 1B: a card is revealed from under The Cross-roads.
    const ambush = base(2);
    ambush.crossRoads.underCrossroads = [
      JTC.soldier,
      JTC.oliphaunt,
      JTC.archer,
    ];
    ambush.phase = "quest";
    run(ambush, fx("jtcRevealUnder", { text: "Ambush the Men of Harad" }));
    assert.ok(ambush.staging.some((u) => u.code === JTC.soldier));
    await load(page, settle(ambush));
    await page.locator(`${panel} [data-under-crossroads='2']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^1B$/ }).waitFor();
    await checkpoint("ambush-reveal", width);
    // The Black Gate: 3 of 4 Harad enemies with one player.
    const gate = base(1);
    gate.crossRoads.underBlackGate = [JTC.man, JTC.captain, JTC.soldier];
    gate.crossRoads.underCrossroads = [JTC.oliphaunt, JTC.archer];
    stage(gate, JTC.man);
    await load(page, gate);
    await page
      .locator(
        `${panel} [data-under-black-gate='3'][data-black-gate-limit='4']`,
      )
      .waitFor();
    await checkpoint("the-black-gate", width);
    // The Cross-roads can be travelled to: nothing under it and 20 progress.
    const ready = base(2);
    ready.progress = 20;
    ready.phase = "travel";
    await load(page, ready);
    await page.locator(`${panel} [data-crossroads-ready='true']`).waitFor();
    await checkpoint("cross-roads-ready", width);
    // Henneth Annûn: the refuge skips the encounter and combat phases.
    const refuge = base(1);
    activate(refuge, JTC.henneth);
    refuge.crossRoads.underCrossroads = [JTC.soldier];
    stage(refuge, JTC.captain);
    await load(page, refuge);
    await page.locator(`${panel} [data-refuge='true']`).waitFor();
    await checkpoint("henneth-annun", width);
    // The Dark Lord's Summons: under The Black Gate or from The Cross-roads.
    let summons = base(1);
    engaged(summons, JTC.man);
    summons.crossRoads.underCrossroads = [JTC.oliphaunt];
    summons.phase = "staging";
    reveal(summons, JTC.summons, 0);
    summons = pastReveal(summons);
    assert.match(summons.choice.title, /^The Dark Lord's Summons · Choose one/);
    await load(page, summons);
    await checkpoint("the-dark-lords-summons", width);
    // Marching Up the Road: return an enemy or a Harad enemy from the deck.
    let marching = base(2);
    engaged(marching, JTC.captain);
    marching.encounterDeck = [JTC.hills, JTC.man, JTC.hills];
    marching.phase = "staging";
    reveal(marching, JTC.marching, 0);
    marching = pastReveal(marching);
    assert.match(marching.choice.title, /^Marching Up the Road · Choose one/);
    await load(page, marching);
    await checkpoint("marching-up-the-road", width);
    // Fierce Southrons: under The Black Gate with another card, or the attacks.
    let southrons = base(1);
    stage(southrons, JTC.man);
    stage(southrons, JTC.captain);
    southrons.phase = "staging";
    reveal(southrons, JTC.southrons, 0);
    southrons = pastReveal(southrons);
    assert.match(southrons.choice.title, /^Fierce Southrons · Choose one/);
    await load(page, southrons);
    await checkpoint("fierce-southrons", width);
    // Haradrim Archer engages: X damage among the player's characters.
    const archer = base(2);
    const enemy = stage(archer, JTC.archer);
    archer.phase = "encounter";
    run(archer, fx("engage", { target: enemy.id, player: 0 }));
    if (!archer.choice) {
      archer.staging = archer.staging.filter((u) => u.id !== enemy.id);
      archer.engaged.push(enemy);
      run(archer, fx("jtcAssign", { value: 2, player: 0 }));
    }
    assert.match(
      archer.choice.title,
      /^Haradrim Archer · Assign damage · 2 remaining/,
    );
    await load(page, archer);
    await checkpoint("haradrim-archer", width);
    // Foothills of Ephel Dúath: the first player engages an enemy to travel.
    const foothills = base(1);
    stage(foothills, JTC.foothills);
    stage(foothills, JTC.man);
    stage(foothills, JTC.soldier);
    foothills.phase = "travel";
    run(foothills, fx("jtcEngageStaged", { player: 0 }));
    assert.match(
      foothills.choice.title,
      /^Foothills of Ephel Dúath · Engage an enemy in the staging area/,
    );
    await load(page, foothills);
    await checkpoint("foothills-of-ephel-duath", width);
    // Arrows Thick in the Air's shadow: under The Black Gate or another attack.
    const arrows = base(1);
    allies(arrows, ["01073"]);
    const attacker = engaged(arrows, JTC.captain);
    arrows.phase = "defense";
    arrows.combat = {
      enemyId: attacker.id,
      attackPlayer: 0,
      defenderId: null,
      defenderIds: [],
      attackBonus: 0,
    };
    run(arrows, fx("shadowEffect", { code: JTC.arrows, player: 0 }));
    assert.match(arrows.choice.title, /^Arrows Thick in the Air · Choose one/);
    await load(page, arrows);
    await checkpoint("arrows-thick-in-the-air", width);
    // Victory: The Cross-roads is explored.
    let won = base(1);
    won.progress = 20;
    const crossroads = won.staging.find((u) => u.code === JTC.crossroads);
    won.staging = won.staging.filter((u) => u.id !== crossroads.id);
    won.activeLocation = crossroads;
    progressLocation(won, crossroads, 9);
    flush(won);
    won = settle(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("the-cross-roads-explored", width);
    // Defeat: The Black Gate holds 3 more Harad enemies than players.
    const lost = base(2);
    lost.crossRoads.underBlackGate = [
      JTC.man,
      JTC.man,
      JTC.captain,
      JTC.soldier,
      JTC.archer,
    ];
    check(lost);
    flush(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("the-black-gate-lost", width);
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
    `Journey to the Cross-roads browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
