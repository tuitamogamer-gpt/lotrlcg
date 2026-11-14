import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import {
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table.ts";
import {
  FLAME_WEST_ARAGORN,
  fellowshipAragorn,
} from "../src/game/lotr-saga.ts";
import {
  PF,
  PELENNOR_FIELDS_HOOKS,
  PELENNOR_FIELDS_QUESTS,
  PELENNOR_FIELDS_RECIPES,
  pfMinasTirithHealth,
} from "../src/game/pelennor-fields.ts";
import {
  activate,
  allies,
  base,
  created,
  engaged,
  fromAside,
  hand,
  settle,
  stage,
} from "../tests/pelennor-fields-fixtures.ts";
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
    new URL("../tests/pelennor-fields-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/pelennor-fields-browser";
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
const panel = "[data-scenario-panel='the-battle-of-the-pelennor-fields']";
const GUARD = "01013",
  SNOWBOURN = "01016",
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
const hero = (s) => s.heroes.find((h) => h.code !== FLAME_WEST_ARAGORN);
const city = (s) => s.staging.find((u) => u.code === PF.minasTirith);
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
          await fresh(page, "the-battle-of-the-pelennor-fields", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const q = s.pelennorFields;
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...(s.victoryCards ?? []),
            ...q.setAside,
            ...q.resolving.map((u) => u.code),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.heroes
                .filter((u) => u.code === FLAME_WEST_ARAGORN)
                .map((u) => u.code),
            ),
            ...seats.flatMap((p) =>
              p.heroes.flatMap((u) =>
                u.attachments
                  .filter((a) =>
                    [PF.esquireRohan, PF.esquireGondor].includes(a.code),
                  )
                  .map((a) => a.code),
              ),
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
            ...PELENNOR_FIELDS_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            PELENNOR_FIELDS_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.equal(s.activeLocation?.code, PF.field);
          for (const code of [PF.minasTirith, PF.grond, PF.witchKing])
            assert.ok(q.setAside.includes(code), card(code).name);
          assert.equal(q.setAside.filter((c) => c === PF.wraith).length, 4);
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].heroes.some((h) => h.code === FLAME_WEST_ARAGORN),
            "the first player controls the Fellowship Aragorn",
          );
          assert.deepEqual(
            (await resume(page)).pelennorFields,
            s.pelennorFields,
          );
          await page
            .locator(
              `${panel} [data-stage='1'] ~ [data-minas-tirith='set-aside']`,
            )
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The printed quest cards, both sides.
    for (const [i, quest] of [
      [1, PELENNOR_FIELDS_QUESTS[0]],
      [5, PELENNOR_FIELDS_QUESTS[4]],
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
    // Setup: the players may attach the Esquires to different heroes.
    const esquires = created(2, false, 611);
    assert.match(
      esquires.choice.title,
      /^The Garrison of Gondor · Attach Esquire of Rohan/,
    );
    await load(page, esquires);
    await checkpoint("esquire-of-rohan", width);
    // 1B: skip the quest and combat phases; 1 progress at the end of planning.
    let garrison = base(2, 1);
    garrison = run(garrison, fx("pfGarrison", { player: 0 }));
    assert.equal(garrison.progress, 1);
    await load(page, garrison);
    await page
      .locator(`${panel} [data-stage='1'] ~ [data-minas-tirith='set-aside']`)
      .waitFor();
    await checkpoint("garrison-of-gondor", width);
    // 2A: a Wraith on Wings, an encounter card and an ally from each deck.
    let retreat = base(2, 1);
    for (const p of playerOrder(retreat))
      forOwner(retreat, p, () => {
        retreat.deck = ["01022", GUARD, ...retreat.deck];
      });
    retreat.encounterDeck = [PF.field, PF.field, PF.field];
    retreat.progress = 1;
    retreat = settle(run(retreat, fx("pfGarrison", { player: 0 })));
    assert.equal(retreat.stage, 2);
    await load(page, retreat);
    await page
      .locator(`${panel} [data-stage='2'] ~ [data-wraiths='2']`)
      .waitFor();
    await page.locator(`${panel} [data-staging-allies='2']`).waitFor();
    await checkpoint("retreat-from-osgiliath", width);
    // 2B: at the end of the round, damage among the allies in the staging area.
    let osgiliath = base(2, 2);
    const [guard, scout] = [
      [0, GUARD],
      [1, SNOWBOURN],
    ].map(([p, code]) => {
      let u;
      forOwner(osgiliath, p, () => {
        u = make(osgiliath, code);
        u.owner = p;
        osgiliath.staging.push(u);
      });
      return u;
    });
    fromAside(osgiliath, PF.wraith);
    stage(osgiliath, PF.eye);
    osgiliath = run(osgiliath, ...PELENNOR_FIELDS_HOOKS.roundEnd(osgiliath));
    assert.match(
      osgiliath.choice.title,
      /^Retreat from Osgiliath · Assign damage among allies in the staging area · 2 remaining/,
    );
    await load(page, osgiliath);
    await checkpoint("retreat-ally-damage", width);
    osgiliath = applyAction(osgiliath, { type: "CHOOSE", id: guard.id });
    osgiliath = settle(
      applyAction(osgiliath, { type: "CHOOSE", id: guard.id }),
    );
    // X progress: 3A, each other player searches for a different enemy.
    osgiliath.encounterDeck = [PF.orc, PF.eye, PF.serpent];
    osgiliath.progress = Number(card(SNOWBOURN).cost);
    check(osgiliath);
    flush(osgiliath);
    assert.match(
      osgiliath.choice.title,
      /^The White City Besieged · Search for a different enemy/,
    );
    await load(page, osgiliath);
    await checkpoint("white-city-search", width);
    osgiliath = settle(
      applyAction(osgiliath, { type: "CHOOSE", id: `deck-${PF.serpent}` }),
    );
    assert.equal(osgiliath.stage, 3);
    assert.ok(
      seatView(osgiliath, 1).allies.some(
        (u) => u.id === scout.id && u.exhausted,
      ),
      "the ally returns exhausted to its owner",
    );
    await load(page, osgiliath);
    await page
      .locator(
        `${panel} [data-stage='3'] ~ [data-minas-tirith='0/${pfMinasTirithHealth(2)}']`,
      )
      .waitFor();
    await page.locator(`${panel} [data-grond='0']`).waitFor();
    await page.locator(`${panel} [data-witch-king='captain']`).waitFor();
    await checkpoint("white-city-besieged", width);
    // The beginning of the quest phase: The Witch-king, Grond and Wraith on Wings.
    let siege = base(2, 3);
    fromAside(siege, PF.minasTirith);
    const grond = fromAside(siege, PF.grond);
    fromAside(siege, PF.witchKing);
    fromAside(siege, PF.wraith);
    siege.encounterDeck = [PF.field, PF.dart, PF.orc, PF.field];
    siege.phase = "quest";
    siege = settle(
      run(siege, ...(PELENNOR_FIELDS_HOOKS.questBegin(siege) ?? [])),
    );
    assert.equal(grond.resources, 1);
    assert.ok(siege.staging.some((u) => u.code === PF.orc));
    await load(page, siege);
    await page
      .locator(
        `${panel} [data-minas-tirith='1/${pfMinasTirithHealth(2)}'] ~ [data-grond='1']`,
      )
      .waitFor();
    await page.locator(`${panel} [data-wraiths='1']`).waitFor();
    await checkpoint("grond-and-the-witch-king", width);
    // City Wall takes the damage first and is discarded at 4: 3 threat each.
    let wall = base(2, 3);
    const walled = fromAside(wall, PF.minasTirith);
    activate(wall, PF.wall);
    wall = run(wall, fx("pfMinas", { value: 6, text: "Grond", player: 0 }));
    assert.equal(walled.damage, 2);
    assert.ok(wall.encounterDiscard.includes(PF.wall));
    await load(page, wall);
    await page
      .locator(`${panel} [data-minas-tirith='2/${pfMinasTirithHealth(2)}']`)
      .waitFor();
    await checkpoint("city-wall", width);
    // Siege Tower: Archery 3 with the enemies' Archery.
    const tower = base(1, 3);
    stage(tower, PF.tower);
    stage(tower, PF.mumak);
    stage(tower, PF.eye);
    PELENNOR_FIELDS_HOOKS.combatBegin(tower);
    flush(tower);
    assert.match(tower.choice.title, /^Assign Archery damage · 6 remaining/);
    await load(page, tower);
    await checkpoint("siege-tower-archery", width);
    // Fire-filled Trench: A Test of Will is canceled and the Trench discarded.
    let trench = base(3, 3);
    const fire = stage(trench, PF.trench);
    hand(trench, [TEST_OF_WILL], 2);
    forOwner(trench, 2, () => {
      for (const h of trench.heroes) h.resources = 3;
    });
    trench = reveal(trench, PF.shadow, 0);
    assert.match(trench.choice.title, /^Revealed[:·] Shadow of Mordor/);
    const cancel = trench.choice.options.find((o) => o.code === TEST_OF_WILL);
    assert.ok(cancel);
    await load(page, trench);
    await checkpoint("fire-filled-trench", width);
    trench = applyAction(trench, { type: "CHOOSE", id: cancel.id });
    assert.ok(!trench.staging.some((u) => u.id === fire.id));
    await load(page, trench);
    await checkpoint("trench-discarded", width);
    // Rohan has Come!: The Witch-king leaves and each player finds an ally.
    let rohan = base(1, 3);
    fromAside(rohan, PF.minasTirith);
    fromAside(rohan, PF.witchKing);
    rohan.deck = ["01022", GUARD, ...rohan.deck];
    rohan.pelennorFields.advancing = true;
    rohan = run(rohan, fx("pfStageFour", { player: 0 }));
    assert.match(
      rohan.choice.title,
      /^Rohan has Come! · Put an ally into play/,
    );
    await load(page, rohan);
    await checkpoint("rohan-has-come", width);
    rohan = settle(applyAction(rohan, { type: "CHOOSE", id: GUARD }));
    assert.equal(rohan.stage, 4);
    // 4B: progress from questing is assigned as damage among enemies.
    const champion = engaged(rohan, PF.champion);
    rohan.progress = 3;
    PELENNOR_FIELDS_HOOKS.successfulQuestProgress(rohan, 3);
    flush(rohan);
    assert.match(
      rohan.choice.title,
      /^Rohan has Come! · Assign damage among enemies in play · 3 remaining/,
    );
    await load(page, rohan);
    await checkpoint("rohan-damage", width);
    for (let n = 0; n < 3; n++)
      rohan = applyAction(rohan, { type: "CHOOSE", id: champion.id });
    // 5A: The Witch-king, Sorcerer side, with a Fell Beast.
    rohan.encounterDeck = [PF.field, PF.beast, PF.field];
    PELENNOR_FIELDS_HOOKS.endQuest(rohan);
    flush(rohan);
    rohan = settle(rohan);
    assert.equal(rohan.stage, 5);
    await load(page, rohan);
    await page
      .locator(
        `${panel} [data-stage='5'] ~ [data-minas-tirith='0/${pfMinasTirithHealth(1)}'] ~ [data-witch-king='sorcerer']`,
      )
      .waitFor();
    await checkpoint("fighting-in-the-fields", width);
    // 5B: The Witch-king engages the first player and attacks.
    const sorcerer = base(2, 5);
    fromAside(sorcerer, PF.minasTirith);
    const witch = fromAside(sorcerer, PF.witchKing, true);
    PELENNOR_FIELDS_HOOKS.encounterBegin(sorcerer);
    flush(sorcerer);
    assert.ok(
      seatView(sorcerer, firstPlayer(sorcerer)).engaged.some(
        (u) => u.id === witch.id,
      ),
    );
    await load(page, sorcerer);
    await checkpoint("witch-king-attacks", width);
    // Southron Champion: 3 damage to Minas Tirith or another attack.
    let champ = base(1, 3);
    fromAside(champ, PF.minasTirith);
    const southron = engaged(champ, PF.champion);
    const [g1] = allies(champ, [GUARD]);
    champ = defend(champ, southron, g1, [PF.tower]);
    assert.match(champ.choice.title, /^Southron Champion · Choose one/);
    await load(page, champ);
    await checkpoint("southron-champion", width);
    // Orc of the Eye (Peril): 2 damage to a hero or to Minas Tirith.
    let eye = base(1, 3);
    fromAside(eye, PF.minasTirith);
    eye = pastReveal(reveal(eye, PF.eye));
    assert.match(eye.choice.title, /^Orc of the Eye · Choose one/);
    await load(page, eye);
    await checkpoint("orc-of-the-eye", width);
    // Mordor Orc: its undefended damage goes to Minas Tirith.
    let mordor = base(1, 3);
    fromAside(mordor, PF.minasTirith);
    mordor = settle(defend(mordor, engaged(mordor, PF.orc), null));
    assert.equal(city(mordor).damage, 2);
    assert.ok(mordor.heroes.every((h) => h.damage === 0));
    await load(page, mordor);
    await page
      .locator(`${panel} [data-minas-tirith='2/${pfMinasTirithHealth(1)}']`)
      .waitFor();
    await checkpoint("mordor-orc", width);
    // The Rammas is Breached: each player searches for an enemy.
    let rammas = base(2, 3);
    rammas.encounterDeck = [PF.field, PF.champion, PF.orc];
    rammas.encounterDiscard = [PF.eye];
    rammas = pastReveal(reveal(rammas, PF.rammas));
    assert.match(
      rammas.choice.title,
      /^The Rammas is Breached · Search for an enemy/,
    );
    await load(page, rammas);
    await checkpoint("rammas-is-breached", width);
    // Black Dart: remove a hero from the quest and attach Black Dart.
    let dart = base(1, 3);
    const archer = hero(dart);
    archer.committed = true;
    dart.committedIds = [archer.id];
    dart = pastReveal(reveal(dart, PF.dart));
    assert.match(
      dart.choice.title,
      /^Black Dart · Remove a hero you control from the quest/,
    );
    await load(page, dart);
    await checkpoint("black-dart", width);
    // Spells of Ruin: exhausted characters or Minas Tirith.
    let ruin = base(1, 3);
    fromAside(ruin, PF.minasTirith);
    hero(ruin).exhausted = true;
    ruin = pastReveal(reveal(ruin, PF.ruin));
    assert.match(ruin.choice.title, /^Spells of Ruin · Choose one/);
    await load(page, ruin);
    await checkpoint("spells-of-ruin", width);
    // Dread and Despair: +1 threat for each ally in the discard pile this phase.
    let despair = base(1, 3);
    allies(despair, [GUARD]);
    despair.discard = [SNOWBOURN];
    despair = settle(pastReveal(reveal(despair, PF.despair)));
    await load(page, despair);
    await page.locator(`${panel} [data-despair='2']`).waitFor();
    await checkpoint("dread-and-despair", width);
    // Victory: Fighting in the Fields with Aragorn and The Witch-king defeated.
    const won = base(1, 5);
    won.progress = 20;
    won.victoryCards = [PF.witchKing];
    PELENNOR_FIELDS_HOOKS.advance(won);
    assert.equal(won.status, "won");
    assert.match(won.reason, /Fighting in the Fields is defeated/);
    await load(page, won);
    await checkpoint("fields-won", width);
    // Defeat: Minas Tirith has no hit points remaining at the end of the round.
    const fallen = base(1, 3);
    fromAside(fallen, PF.minasTirith).damage = pfMinasTirithHealth(1) - 1;
    stage(fallen, PF.eye);
    run(fallen, ...PELENNOR_FIELDS_HOOKS.roundEnd(fallen));
    assert.equal(fallen.status, "lost");
    await load(page, fallen);
    await checkpoint("minas-tirith-falls", width);
    // Defeat: Aragorn leaves play.
    const lost = base(1, 3);
    const aragorn = fellowshipAragorn(lost);
    aragorn.damage = card(FLAME_WEST_ARAGORN).health - 1;
    lost.queue.push(fx("damage", { target: aragorn.id, value: 1, player: 0 }));
    flush(lost);
    while (lost.choice && lost.status === "playing") {
      lost.choice = null;
      flush(lost);
    }
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("aragorn-falls", width);
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
    `The Battle of the Pelennor Fields browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
