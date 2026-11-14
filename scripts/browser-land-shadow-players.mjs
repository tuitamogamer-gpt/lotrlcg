import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base, engaged, stage } from "../tests/passage-marshes-fixtures.ts";
import {
  LAND_SHADOW_PLAYER as P,
  landShadowPlayerAbilityLabel,
} from "../src/game/land-shadow-player-cards.ts";
import { applyAction } from "../src/game/engine.ts";
import { flush } from "../src/game/effects.ts";
import { damage } from "../src/game/board.ts";
import { get, make, stats } from "../src/game/core.ts";
import { forOwner } from "../src/game/table.ts";
import { ringBearer } from "../src/game/lotr-saga.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const url =
  process.env.GAME_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, load, choose, settle, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.LAND_SHADOW_PLAYERS_BROWSER_SMOKE === "1";
const dir = "output/land-shadow-players";
await fs.mkdir(dir, { recursive: true });
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/land-shadow-player-art.json", import.meta.url),
  ),
);
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];

const GUARD = "01013",
  SCOUT = "01016",
  GIMLI = "01004",
  TROLL = "01082",
  ORCS = "01089";
const hand = (s, code, p = 0) => {
  let u;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.hand.push(u);
  });
  return u;
};
const hero = (s, code, slot, p = 0) => {
  let u;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    u.resources = 10;
    s.heroes[slot] = u;
  });
  return u;
};
const ally = (s, code) => {
  const u = make(s, code);
  u.owner = 0;
  s.allies.push(u);
  return u;
};
const attach = (s, host, code) => {
  const a = { id: `c${s.nextId++}`, code, exhausted: false, owner: 0 };
  host.attachments.push(a);
  return a;
};
const reveal = (s, code) => {
  s.encounterDeck.unshift(code);
  s.queue.push({ kind: "reveal", player: 0 });
  flush(s);
  return s;
};
/** An engaged enemy attacks with one facedown shadow card. */
const defend = (s, enemy, defender) => {
  s.phase = "defense";
  s.combat = null;
  enemy.shadows = ["01104"];
  enemy.faceupShadows = [false];
  return applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
};
/** Skip unrelated decisions until the card's Response is offered. */
const until = (s, code) => {
  for (
    let n = 0;
    n < 20 &&
    s.choice &&
    !s.choice.options.some((o) => o.ability?.code === code);
    n++
  )
    s = applyAction(s, {
      type: "CHOOSE",
      id: (
        s.choice.options.find((o) =>
          ["skip", "resolve", "undefended", "keep"].includes(o.id),
        ) ?? s.choice.options[0]
      ).id,
    });
  assert.ok(
    s.choice?.options.some((o) => o.ability?.code === code),
    JSON.stringify(s.choice?.title),
  );
  return s;
};
async function shot(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function openPlay(p, id) {
  await p
    .locator(`[data-motion-card="${id}"]`)
    .getByRole("button", { name: "Play card", exact: true })
    .click();
}
async function confirmPlay(p, target) {
  if (target)
    await p
      .locator(`.decision-card[data-unit-id="${target}"] .decision-select`)
      .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function ability(p, label) {
  await p.getByRole("button", { name: label, exact: true }).first().click();
  await reviewedState(p);
  return saved(p);
}

try {
  for (const [width, height] of smoke
    ? [[1280, 900]]
    : [
        [1280, 900],
        [390, 844],
        [320, 750],
      ]) {
    const { c, p } = await context(browser, width, height, errors, entries);

    // The twelve faces are served exactly as pinned.
    for (const a of art) {
      const served = await p.evaluate(async (path) => {
        const r = await fetch(path);
        return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
      }, a.localPath);
      assert.deepEqual(served, { status: 200, bytes: a.bytes }, a.code);
    }
    checks.push(`12 faces @ ${width}`);

    // Faramir: after you engage an enemy, ready an exhausted ally.
    let s = base(1, 2);
    hero(s, P.faramir, 2);
    const guard = ally(s, GUARD);
    guard.exhausted = true;
    const troll = stage(s, TROLL);
    s.phase = "encounter";
    s = applyAction(s, { type: "ENGAGE", id: troll.id });
    assert.match(s.choice.title, /^Faramir · You engaged an enemy/);
    await load(p, s);
    await shot(p, "faramir-ready-ally", width);
    s = await choose(p, guard.id);
    assert.equal(get(s, guard.id).exhausted, false);

    // Damrod pays 1 for Ambush, which waits unattached in the staging area.
    s = base(1, 2);
    const damrod = hero(s, P.damrod, 2);
    const trap = hand(s, P.ambush);
    await load(p, s);
    await openPlay(p, trap.id);
    await shot(p, "damrod-ambush-cost", width);
    s = await confirmPlay(p);
    s = await settle(p);
    assert.ok(s.staging.some((u) => u.id === trap.id));
    assert.equal(get(s, damrod.id).resources, 9);
    await shot(p, "ambush-in-staging", width);
    // The next enemy: Ambush attaches and Damrod draws.
    s = base(1, 2);
    hero(s, P.damrod, 2);
    const waiting = make(s, P.ambush);
    waiting.owner = 0;
    s.staging.push(waiting);
    s = until(reveal(s, TROLL), P.damrod);
    await load(p, s);
    await shot(p, "damrod-draw", width);
    s = await choose(p, "draw");
    const host = s.staging.find((u) => u.code === TROLL);
    assert.ok(host.attachments.some((a) => a.id === waiting.id));

    // Ambush: the engaged player's Combat Action declares an attack.
    s = base(1, 2);
    const big = engaged(s, TROLL);
    const ambush = attach(s, big, P.ambush);
    s.phase = "defense";
    await load(p, s);
    s = await ability(p, landShadowPlayerAbilityLabel(P.ambush));
    assert.match(s.choice.title, /^Ambush · Declare attackers/);
    assert.ok(s.discard.includes(P.ambush));
    await shot(p, "ambush-declare-attackers", width);
    const aragorn = s.heroes.find((h) => h.code === "01001");
    const prince = s.heroes.find((h) => h.code === "01002");
    s = await choose(p, aragorn.id);
    s = await choose(p, prince.id);
    s = await choose(p, "attack");
    s = await settle(p);
    // 3 + 2 attack against the Hill Troll's 3 defense.
    assert.equal(get(s, big.id).damage, 2);
    assert.ok(!get(s, big.id).attachments.some((a) => a.id === ambush.id));

    // Anborn: +5 engagement cost and 1 damage for the enemy just revealed.
    s = base(1, 2);
    ally(s, P.anborn);
    s = until(reveal(s, TROLL), P.anborn);
    await load(p, s);
    await shot(p, "anborn-response", width);
    s = await choose(p, "exhaust");
    assert.equal(s.staging.find((u) => u.code === TROLL).damage, 1);

    // Skinbark enters play exhausted.
    s = base(1, 2);
    const gimli = hero(s, GIMLI, 2);
    gimli.resources = 3;
    const ent = hand(s, P.skinbark);
    await load(p, s);
    await openPlay(p, ent.id);
    s = await confirmPlay(p);
    s = await settle(p);
    assert.equal(s.allies.find((u) => u.code === P.skinbark).exhausted, true);
    await shot(p, "skinbark-exhausted", width);

    // Gamling returns a destroyed Rohan ally to hand.
    s = base(1, 2);
    ally(s, P.gamling);
    const scout = ally(s, SCOUT);
    damage(s, scout.id, 1, {});
    flush(s);
    s = until(s, P.gamling);
    await load(p, s);
    await shot(p, "gamling-response", width);
    s = await choose(p, "return");
    assert.ok(s.hand.some((u) => u.code === SCOUT));

    // Staff of Lebethron discards the shadow card of a Hill Troll.
    s = base(1, 2);
    const faramir = hero(s, P.faramir, 2);
    attach(s, faramir, P.staff);
    s = until(defend(s, engaged(s, TROLL), faramir), P.staff);
    await load(p, s);
    await shot(p, "staff-of-lebethron", width);
    s = await choose(p, "discard");
    assert.ok(s.encounterDiscard.includes("01104"));

    // Taste it Again! readies the defender.
    s = base(1, 2);
    const captain = hero(s, P.faramir, 2);
    hand(s, P.taste);
    s = until(defend(s, engaged(s, TROLL), captain), P.taste);
    await load(p, s);
    await shot(p, "taste-it-again", width);
    s = await choose(p, "play");
    s = await settle(p);
    assert.equal(get(s, captain.id).exhausted, false);

    // Snowmane readies its hero after a successful quest.
    s = base(1, 2);
    const theodred = s.heroes.find((h) => h.code === "01002");
    attach(s, theodred, P.snowmane);
    s.phase = "quest";
    theodred.committed = true;
    theodred.exhausted = true;
    s.committedIds = [theodred.id];
    s.lastQuest = { will: 10, threat: 0, net: 10 };
    s.queue.push({ kind: "questSuccessResponses", player: 0 });
    flush(s);
    s = until(s, P.snowmane);
    await load(p, s);
    await shot(p, "snowmane-response", width);
    s = await choose(p, "ready");
    assert.equal(get(s, theodred.id).exhausted, false);

    // In the Shadows: -1 attack and -1 defense above your threat; with
    // Aragorn, Damrod and Frodo it costs nothing.
    s = base(1, 2);
    hero(s, P.damrod, 2);
    const hill = engaged(s, TROLL);
    engaged(s, ORCS);
    s.phase = "defense";
    const shadows = hand(s, P.shadows);
    await load(p, s);
    await openPlay(p, shadows.id);
    s = await confirmPlay(p);
    s = await settle(p);
    assert.equal(stats(s, get(s, hill.id)).attack, 5);
    await shot(p, "in-the-shadows", width);

    // Speak Your Promise!: Frodo readies, then weakens the Hill Troll.
    s = base(1, 2);
    const frodo = ringBearer(s);
    frodo.exhausted = true;
    const target = engaged(s, TROLL);
    const promise = hand(s, P.promise);
    await load(p, s);
    await openPlay(p, promise.id);
    s = await confirmPlay(p);
    assert.match(s.choice.title, /^Speak Your Promise! · Choose an enemy/);
    assert.equal(get(s, frodo.id).exhausted, false);
    await shot(p, "speak-your-promise", width);
    s = await choose(p, target.id);
    s = await settle(p);
    assert.equal(stats(s, get(s, target.id)).attack, 5);
    await c.close();
  }
  await report(dir, { errors, entries, screenshots, checks });
  console.log(
    `PASS ${checks.length} The Land of Shadow player card checkpoints`,
  );
} finally {
  await browser.close();
}
