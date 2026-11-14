import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, destroy } from "../src/game/board.ts";
import { forOwner, seatView } from "../src/game/table.ts";
import { MOUNTAIN_FIRE_ARAGORN } from "../src/game/lotr-saga.ts";
import {
  BG,
  BLACK_GATE_QUESTS,
  BLACK_GATE_RECIPES,
} from "../src/game/black-gate.ts";
import {
  activate,
  allies,
  aragorn,
  base,
  created,
  engaged,
  hand,
  settle,
  stage,
} from "../tests/black-gate-fixtures.ts";
import { applyAction } from "../src/game/engine.ts";
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
    new URL("../tests/black-gate-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/black-gate-browser";
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
const panel = "[data-scenario-panel='the-black-gate-opens']";
const GUARD = "01013",
  SNOWBOURN = "01016",
  BLADE = "01039",
  TEST_OF_WILL = "01050";
const run = (s, ...effects) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s, code, player = 0) => {
  s.phase = "staging";
  s.encounterDeck.unshift(code);
  return run(s, fx("reveal", { player }));
};
/** Past the "Revealed" confirmation of a treachery. */
const pastReveal = (s) => {
  while (s.choice && /^Revealed · /.test(s.choice.title))
    s = applyAction(s, { type: "CHOOSE", id: "resolve" });
  return s;
};
/** An engaged enemy attacks with the given facedown shadow cards. */
const defend = (s, enemy, defender, shadows = []) => {
  s.phase = "defense";
  s.combat = null;
  enemy.shadows = [...shadows];
  enemy.faceupShadows = shadows.map(() => false);
  return applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
};
const travel = (s, u) => {
  s.phase = "travel";
  return applyAction(s, { type: "TRAVEL", id: u.id });
};
/** A hero of the first player other than the Fellowship Aragorn. */
const hero = (s) => s.heroes.find((h) => h.code !== MOUNTAIN_FIRE_ARAGORN);
const panelState = async (attrs) =>
  page
    .locator(
      `${panel} ${Object.entries(attrs)
        .map(([k, v]) => `[data-${k}='${v}']`)
        .join(" ~ ")}`,
    )
    .waitFor();
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
          await fresh(page, "the-black-gate-opens", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const q = s.blackGate;
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...(s.victoryCards ?? []),
            ...q.setAside,
            ...q.resolving.map((u) => u.code),
            ...(q.embassy ?? []).map((p) => p.encounter).filter(Boolean),
            ...(q.moat ?? []).flatMap((m) => m.units.map((u) => u.code)),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.heroes
                .filter((u) => u.code === MOUNTAIN_FIRE_ARAGORN)
                .map((u) => u.code),
            ),
            ...seats.flatMap((p) =>
              p.allies.filter((u) => u.code === BG.gwaihir).map((u) => u.code),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...[
              ...s.staging,
              ...seats.flatMap((p) => p.engaged),
              ...(s.activeLocation ? [s.activeLocation] : []),
            ].flatMap((u) => [
              ...u.attachments.map((a) => a.code),
              ...u.shadows,
            ]),
            ...BLACK_GATE_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            BLACK_GATE_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 2);
          assert.equal(q.currentQuest, BG.battle);
          assert.ok(!q.setAside.includes(BG.gwaihir));
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].heroes.some((h) => h.code === MOUNTAIN_FIRE_ARAGORN),
            "the first player controls the Fellowship Aragorn",
          );
          assert.deepEqual((await resume(page)).blackGate, s.blackGate);
          await panelState({ stage: 2, gate: 0, dire: 99, mouth: "staging" });
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The printed quest cards, both sides.
    for (const [i, quest] of [
      [1, BLACK_GATE_QUESTS[0]],
      [2, BLACK_GATE_QUESTS[1]],
    ]) {
      const s = base(1, i);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(quest.code).back_name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint(`quest-${i}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${i}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // 1B: the first pair of the embassy.
    const embassy = created(2, false, 611);
    assert.match(embassy.choice.title, /^Embassy from The Dark Tower · /);
    await load(page, embassy);
    await panelState({ stage: 1, embassy: 4 });
    await checkpoint("embassy-pair", width);
    // A pair revealed: the encounter card enters play, the ally at no cost.
    let reveal1 = base(1, 1);
    reveal1.deck = [GUARD, BLADE, SNOWBOURN, "01021", ...reveal1.deck];
    reveal1.encounterDeck = [BG.hour, BG.waste, BG.moat, BG.bowman, BG.waste];
    reveal1 = run(reveal1, fx("bgEmbassy", { player: 0 }));
    reveal1 = pastReveal(
      applyAction(reveal1, { type: "CHOOSE", id: "reveal" }),
    );
    assert.ok(reveal1.allies.some((u) => u.code === GUARD));
    await load(page, reveal1);
    await checkpoint("embassy-revealed", width);
    // 2A: each player searches for a different Orc, Troll or Nazgûl enemy.
    let search = base(2, 1);
    search.blackGate.setAside = [BG.gwaihir];
    search.encounterDeck = [BG.nazgul, BG.waste, BG.troll];
    search = run(search, fx("bgEmbassyDone", { player: 0 }));
    assert.match(
      search.choice.title,
      /^The Battle of the Morannon · Search for a different Orc, Troll or Nazgûl enemy/,
    );
    await load(page, search);
    await checkpoint("battle-search", width);
    // The Black Gate gathers a resource at the beginning of the quest phase.
    let gate = base(2, 2, 2);
    gate = run(gate, fx("bgGate", { player: 0 }));
    await load(page, gate);
    await panelState({ stage: 2, gate: 3, dire: 99 });
    await checkpoint("black-gate-resource", width);
    // 2B: an unsuccessful quest discards the active location.
    let failed = base(1, 2, 3);
    activate(failed, BG.towers);
    failed = run(failed, fx("failedQuest", { value: 3, player: 0 }));
    assert.equal(failed.activeLocation, null);
    await load(page, failed);
    await checkpoint("quest-failed", width);
    // Dire: 60 threat does not eliminate.
    const dire = base(1, 2, 4);
    dire.threat = 60;
    check(dire);
    assert.equal(dire.status, "playing");
    await load(page, dire);
    await panelState({ stage: 2, gate: 4, dire: 99 });
    await checkpoint("dire-threat", width);
    // Aragorn's Action: spend 1 resource to ready him.
    let ready = base(1, 2);
    aragorn(ready).exhausted = true;
    ready.phase = "quest";
    ready = applyAction(ready, { type: "ABILITY", id: aragorn(ready).id });
    assert.equal(aragorn(ready).exhausted, false);
    await load(page, ready);
    await checkpoint("aragorn-ready", width);
    // Locations: Beleaguered Hills, Reeking Moat, Waste of Dagorlad, Wall of Morannon.
    let hills = base(2, 2);
    const hillsUnit = stage(hills, BG.hills);
    stage(hills, BG.orc);
    stage(hills, BG.soldier);
    hills = travel(hills, hillsUnit);
    assert.match(hills.choice.title, /^Beleaguered Hills · Engage/);
    await load(page, hills);
    await checkpoint("beleaguered-hills", width);
    let moat = base(1, 2);
    const moatUnit = stage(moat, BG.moat);
    const hidden = stage(moat, BG.troll);
    moat = travel(moat, moatUnit);
    moat = applyAction(moat, { type: "CHOOSE", id: hidden.id });
    await load(page, moat);
    await panelState({ stage: 2, moat: 1 });
    await checkpoint("reeking-moat", width);
    const waste = base(1, 2);
    allies(waste, [SNOWBOURN]);
    activate(waste, BG.waste);
    await load(page, waste);
    await checkpoint("waste-of-dagorlad", width);
    let wall = base(1, 2);
    const wallUnit = stage(wall, BG.wall);
    engaged(wall, BG.nazgul);
    wall = settle(travel(wall, wallUnit));
    assert.ok(wall.staging.some((u) => u.code === BG.nazgul));
    await load(page, wall);
    await checkpoint("wall-of-morannon", width);
    // The Mouth of Sauron attacks a player who cancels a 'when revealed' effect.
    let cancel = base(3, 2);
    hand(cancel, [TEST_OF_WILL], 2);
    forOwner(cancel, 2, () => {
      for (const h of cancel.heroes) h.resources = 3;
    });
    cancel = reveal(cancel, BG.hawk);
    const testOfWill = cancel.choice.options.find(
      (o) => o.code === TEST_OF_WILL,
    );
    cancel = applyAction(cancel, { type: "CHOOSE", id: testOfWill.id });
    assert.match(
      cancel.choice.title,
      /^The Mouth of Sauron · Immediate attack/,
    );
    await load(page, cancel);
    await checkpoint("mouth-of-sauron-cancel", width);
    // Enemies: Nazgûl of Mordor, Easterling Bowman, Warrior of Rhûn.
    let nazgul = base(1, 2);
    const naz = engaged(nazgul, BG.nazgul);
    nazgul = defend(nazgul, naz, aragorn(nazgul));
    while (nazgul.choice && !/^Nazgûl of Mordor · /.test(nazgul.choice.title))
      nazgul = applyAction(nazgul, {
        type: "CHOOSE",
        id: nazgul.choice.options[0].id,
      });
    assert.match(nazgul.choice.title, /^Nazgûl of Mordor · Choose one/);
    await load(page, nazgul);
    await checkpoint("nazgul-of-mordor", width);
    let bowman = base(1, 2);
    hero(bowman).committed = true;
    bowman = pastReveal(reveal(bowman, BG.bowman));
    assert.match(bowman.choice.title, /^Easterling Bowman · Deal 1 damage/);
    await load(page, bowman);
    await checkpoint("easterling-bowman", width);
    let warrior = base(1, 2);
    hero(warrior).committed = true;
    warrior = pastReveal(reveal(warrior, BG.warrior));
    await load(page, warrior);
    await checkpoint("warrior-of-rhun", width);
    // Treacheries: Hell-hawk, The Hour of Doom, Jaws of Steel, Rage Filled Him, Onslaught of Mordor.
    let hawk = base(1, 2);
    stage(hawk, BG.nazgul);
    hawk.encounterDiscard = [BG.nazgul];
    hawk = pastReveal(reveal(hawk, BG.hawk));
    assert.match(hawk.choice.title, /^Hell-hawk · Choose one/);
    await load(page, hawk);
    await checkpoint("hell-hawk", width);
    let hour = base(1, 2);
    allies(hour, [GUARD]);
    hour = pastReveal(reveal(hour, BG.hour));
    assert.match(hour.choice.title, /^The Hour of Doom · Choose one/);
    await load(page, hour);
    await checkpoint("hour-of-doom", width);
    let jaws = base(1, 2, 2);
    jaws = pastReveal(reveal(jaws, BG.jaws));
    assert.match(jaws.choice.title, /^Jaws of Steel · Assign damage/);
    await load(page, jaws);
    await checkpoint("jaws-of-steel", width);
    let rage = base(1, 2);
    rage = pastReveal(reveal(rage, BG.rage));
    assert.match(rage.choice.title, /^The Mouth of Sauron · Immediate attack/);
    await load(page, rage);
    await checkpoint("rage-filled-him", width);
    let onslaught = base(1, 2);
    hero(onslaught).committed = true;
    onslaught = pastReveal(reveal(onslaught, BG.onslaught));
    assert.match(
      onslaught.choice.title,
      /^Onslaught of Mordor · Deal 1 damage/,
    );
    await load(page, onslaught);
    await checkpoint("onslaught-of-mordor", width);
    // Gwaihir: the first player's choice, then Gwaihir as an ally.
    let gwaihir = base(1, 2);
    stage(gwaihir, BG.troll);
    gwaihir = pastReveal(reveal(gwaihir, BG.gwaihir));
    assert.match(gwaihir.choice.title, /^Gwaihir · Choose one/);
    await load(page, gwaihir);
    await checkpoint("gwaihir-choice", width);
    gwaihir = applyAction(gwaihir, { type: "CHOOSE", id: "control" });
    await load(page, gwaihir);
    await panelState({ stage: 2, gwaihir: "ally" });
    await checkpoint("gwaihir-ally", width);
    // The end: the players fall, their result the resources on The Black Gate.
    const held = base(1, 2, 6);
    destroy(held, aragorn(held), false);
    check(held);
    assert.equal(held.status, "lost");
    assert.match(held.reason, /held the Morannon for 6 rounds/);
    await load(page, held);
    await checkpoint("black-gate-held", width);
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
    `The Black Gate Opens browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
