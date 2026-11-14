import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base, engaged, stage } from "../tests/road-isengard-fixtures.ts";
import {
  TREASON_PLAYER as P,
  treasonPlayerAbilityLabel,
} from "../src/game/treason-saruman-player-cards.ts";
import { RI } from "../src/game/road-isengard-support.ts";
import { applyAction } from "../src/game/engine.ts";
import { flush } from "../src/game/effects.ts";
import { fx, get, make, stats } from "../src/game/core.ts";
import { forOwner } from "../src/game/table.ts";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const url =
  process.env.GAME_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, load, choose, settle, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.TREASON_PLAYERS_BROWSER_SMOKE === "1";
const dir = "output/treason-saruman-players";
await fs.mkdir(dir, { recursive: true });
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/treason-saruman-player-art.json", import.meta.url),
  ),
);
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];

const SNOWBOURN = "01016",
  GUARD = "01013",
  CORE_GANDALF = "01073",
  DRAUGHT = "143009",
  RIDER = "01081",
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

    // The thirteen faces are served exactly as pinned.
    for (const a of art) {
      const served = await p.evaluate(async (path) => {
        const r = await fetch(path);
        return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
      }, a.localPath);
      assert.deepEqual(served, { status: 200, bytes: a.bytes }, a.code);
    }
    checks.push(`13 faces @ ${width}`);

    // Théoden: the first Rohan ally from hand costs 1 less.
    let s = base(1, 2);
    hero(s, P.theoden, 0);
    for (const h of s.heroes) h.resources = 0;
    const scout = hand(s, SNOWBOURN);
    await load(p, s);
    await openPlay(p, scout.id);
    await shot(p, "theoden-rohan-ally-free", width);
    s = await confirmPlay(p);
    s = await settle(p);
    assert.ok(s.allies.some((u) => u.code === SNOWBOURN));

    // Treebeard grows with each damage, 5 times per phase.
    s = base(1, 2);
    const tree = hero(s, P.treebeard, 1);
    attach(s, tree, DRAUGHT);
    await load(p, s);
    s = await ability(p, treasonPlayerAbilityLabel(P.treebeard));
    s = await ability(p, treasonPlayerAbilityLabel(P.treebeard));
    assert.equal(get(s, tree.id).damage, 2);
    assert.equal(stats(s, get(s, tree.id)).will, 2 + 2);
    await shot(p, "treebeard-grows", width);

    // Quickbeam enters play exhausted, then readies by taking 1 damage.
    s = base(1, 2);
    const ent = hero(s, P.treebeard, 1);
    ent.resources = 2;
    const quickbeam = hand(s, P.quickbeam);
    await load(p, s);
    await openPlay(p, quickbeam.id);
    s = await confirmPlay(p);
    assert.match(s.choice.title, /^Quickbeam · Deal 1 damage/);
    await shot(p, "quickbeam-response", width);
    s = await choose(p, "use");
    s = await settle(p);
    const played = s.allies.find((u) => u.code === P.quickbeam);
    assert.equal(played.exhausted, false);
    assert.equal(played.damage, 1);

    // Háma's Combat Action: +3 defense, discarded at the end of the phase.
    s = base(1, 2);
    const hama = ally(s, P.hama);
    hama.exhausted = true;
    s.phase = "defense";
    await load(p, s);
    s = await ability(p, treasonPlayerAbilityLabel(P.hama));
    assert.equal(get(s, hama.id).exhausted, false);
    assert.equal(stats(s, get(s, hama.id)).defense, 5);
    await shot(p, "hama-combat-action", width);

    // Arod: its choice of location after its character destroys an enemy.
    s = base(1, 2);
    const rider = s.heroes.find((h) => h.code === TOS_ARAGORN);
    attach(s, rider, P.arod);
    stage(s, RI.ringWall);
    const wolf = engaged(s, RIDER);
    s.phase = "attack";
    s = applyAction(s, {
      type: "ATTACK",
      enemyId: wolf.id,
      attackerIds: [rider.id],
    });
    assert.match(s.choice.title, /^Arod · Exhaust Arod/);
    await load(p, s);
    await shot(p, "arod-progress", width);

    // Herugrim: the hero's willpower added to its attack.
    s = base(1, 2);
    const king = hero(s, P.theoden, 0);
    attach(s, king, P.herugrim);
    const orcs = engaged(s, ORCS);
    s.phase = "attack";
    s = applyAction(s, {
      type: "ATTACK",
      enemyId: orcs.id,
      attackerIds: [king.id],
    });
    assert.match(s.choice.title, /^Herugrim · Add Théoden's willpower/);
    await load(p, s);
    await shot(p, "herugrim-response", width);

    // Entmoot: the Ent cards among the top 5.
    s = base(1, 2);
    hero(s, P.treebeard, 1);
    forOwner(s, 0, () => {
      s.deck = [P.quickbeam, GUARD, DRAUGHT, GUARD, GUARD, GUARD];
    });
    s.queue.push(fx("tspEntmoot", { value: 5, player: 0 }));
    flush(s);
    assert.match(s.choice.title, /^Entmoot · Add an Ent card/);
    await load(p, s);
    await shot(p, "entmoot-search", width);

    // Helm! Helm!: discard a non-unique enemy after the enemy attacks.
    s = base(1, 2);
    const theoden = hero(s, P.theoden, 0);
    theoden.resources = 2;
    const rohan = ally(s, SNOWBOURN);
    engaged(s, ORCS);
    s.phase = "attack";
    const helm = hand(s, P.helm);
    await load(p, s);
    await openPlay(p, helm.id);
    await shot(p, "helm-helm-cost", width);
    s = await confirmPlay(p, rohan.id);
    assert.match(s.choice.title, /^Helm! Helm! · Discard a non-unique enemy/);
    await shot(p, "helm-helm-enemy", width);
    s = await choose(p, s.choice.options[0].id);
    s = await settle(p);
    assert.equal(s.engaged.length, 0);

    // The Three Hunters: 3 committed heroes ready with +1 to each stat.
    s = base(1, 2);
    const aragorn = s.heroes.find((h) => h.code === TOS_ARAGORN);
    aragorn.resources = 3;
    s.phase = "quest";
    for (const h of s.heroes) {
      h.committed = true;
      h.exhausted = true;
    }
    s.committedIds = s.heroes.map((h) => h.id);
    const hunters = hand(s, P.hunters);
    await load(p, s);
    await openPlay(p, hunters.id);
    s = await confirmPlay(p);
    s = await settle(p);
    assert.ok(s.heroes.every((h) => !h.exhausted));
    await shot(p, "the-three-hunters", width);

    // Shadowfax on Gandalf: ranged and sentinel, and readies him.
    s = base(1, 2);
    const gandalf = ally(s, CORE_GANDALF);
    attach(s, gandalf, P.shadowfax);
    gandalf.exhausted = true;
    await load(p, s);
    s = await ability(p, treasonPlayerAbilityLabel(P.shadowfax));
    assert.equal(get(s, gandalf.id).exhausted, false);
    await shot(p, "shadowfax-readies-gandalf", width);
    await c.close();
  }
  await report(dir, { errors, entries, screenshots, checks });
  console.log(
    `PASS ${checks.length} The Treason of Saruman player card checkpoints`,
  );
} finally {
  await browser.close();
}
