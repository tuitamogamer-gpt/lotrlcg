import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base, engaged, stage } from "../tests/shadow-past-fixtures.ts";
import {
  BLACK_RIDERS_PLAYER as B,
  blackRidersPlayerAbilityLabel,
} from "../src/game/black-riders-player-cards.ts";
import { applyAction } from "../src/game/engine.ts";
import { engagementCost, get, make, stats } from "../src/game/core.ts";
import { forOwner } from "../src/game/table.ts";
import { ringBearer } from "../src/game/lotr-saga.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const url =
  process.env.GAME_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, load, choose, settle, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.BLACK_RIDERS_PLAYERS_BROWSER_SMOKE === "1";
const dir = "output/black-riders-players";
await fs.mkdir(dir, { recursive: true });
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/black-riders-player-art.json", import.meta.url),
  ),
);
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];

const TROLL = "01082",
  SPIDER = "01096",
  ORCS = "01089",
  GANDALF = "01073",
  SNEAK = "01023";
const hand = (s, code, p = 0) => {
  let u;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.hand.push(u);
  });
  return u;
};
const hero = (s, code, slot) => {
  const u = make(s, code);
  u.owner = 0;
  s.heroes[slot] = u;
  return u;
};
const ally = (s, code) => {
  const u = make(s, code);
  u.owner = 0;
  s.allies.push(u);
  return u;
};
const icons = (s, sphere) => {
  for (const h of s.heroes) {
    h.phaseResourceIcons = [sphere];
    h.resources = 5;
  }
};
const triple = (s, u) => [
  stats(s, u).will,
  stats(s, u).attack,
  stats(s, u).defense,
];
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
  await p.getByRole("button", { name: label, exact: true }).click();
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

    // The fourteen faces are served exactly as pinned.
    for (const a of art) {
      const served = await p.evaluate(async (path) => {
        const r = await fetch(path);
        return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
      }, a.localPath);
      assert.deepEqual(served, { status: 200, bytes: a.bytes }, a.code);
    }
    checks.push(`14 faces @ ${width}`);

    // Sam Gamgee and Pippin after engaging a more threatening enemy.
    let s = base();
    const sam = hero(s, B.sam, 0);
    hero(s, B.pippin, 1);
    sam.exhausted = true;
    const troll = stage(s, TROLL);
    s.deck = [GANDALF, SNEAK];
    s.phase = "encounter";
    s = applyAction(s, { type: "ENGAGE", id: troll.id });
    assert.match(s.choice.title, /^Sam Gamgee/);
    await load(p, s);
    await shot(p, "sam-gamgee-response", width);
    s = await choose(p, "use");
    assert.match(s.choice.title, /^Pippin/);
    await shot(p, "pippin-response", width);
    s = await choose(p, "use");
    s = await settle(p);
    assert.equal(get(s, sam.id).exhausted, false);
    assert.deepEqual(triple(s, get(s, sam.id)), [4, 2, 2]);
    assert.deepEqual(
      s.hand.map((u) => u.code),
      [GANDALF],
    );
    await shot(p, "sam-gamgee-ready", width);

    // Merry readies another attacker after a kill.
    s = base();
    const merry = hero(s, B.merry, 0);
    hero(s, B.sam, 1);
    const gloin = s.heroes[2];
    const spider = engaged(s, SPIDER);
    s.phase = "attack";
    s = applyAction(s, {
      type: "ATTACK",
      enemyId: spider.id,
      attackerIds: [merry.id, gloin.id],
    });
    assert.match(s.choice.title, /^Merry/);
    await load(p, s);
    await shot(p, "merry-response", width);
    s = await choose(p, gloin.id);
    s = await settle(p);
    assert.equal(get(s, gloin.id).exhausted, false);

    // Fatty Bolger's action and its enemy choice.
    s = base();
    const fatty = hero(s, B.fatty, 0);
    const staged = stage(s, SPIDER);
    stage(s, TROLL);
    s.phase = "staging";
    await load(p, s);
    s = await ability(p, blackRidersPlayerAbilityLabel(B.fatty));
    assert.match(s.choice.title, /^Fatty Bolger/);
    await shot(p, "fatty-bolger-enemy", width);
    s = await choose(p, staged.id);
    s = await settle(p);
    assert.equal(s.threat, 22);
    assert.equal(get(s, fatty.id).exhausted, true);
    await shot(p, "fatty-bolger-threat", width);

    // Barliman Butterbur takes undefended damage with all Hobbit heroes.
    s = base();
    hero(s, B.sam, 0);
    hero(s, B.merry, 1);
    hero(s, B.pippin, 2);
    const barliman = ally(s, B.barliman);
    const attacker = engaged(s, SPIDER);
    s.phase = "defense";
    s = applyAction(s, {
      type: "DEFEND",
      enemyId: attacker.id,
      defenderIds: [],
    });
    for (let n = 0; n < 10 && !/^Assign/.test(s.choice?.title ?? ""); n++)
      s = applyAction(s, {
        type: "CHOOSE",
        id:
          s.choice.options.find((o) => o.id === "resolve")?.id ??
          s.choice.options[0].id,
      });
    assert.ok(s.choice.options.some((o) => o.id === barliman.id));
    await load(p, s);
    await shot(p, "barliman-undefended", width);
    s = await choose(p, barliman.id);
    s = await settle(p);
    assert.equal(get(s, barliman.id).damage, 2);

    // Farmer Maggot's entry response, 2 damage to a higher engagement cost.
    s = base();
    icons(s, "tactics");
    const big = engaged(s, SPIDER);
    engaged(s, ORCS);
    const maggot = hand(s, B.maggot);
    await load(p, s);
    await openPlay(p, maggot.id);
    s = await confirmPlay(p);
    assert.match(s.choice.title, /^Farmer Maggot/);
    await shot(p, "farmer-maggot-response", width);
    s = await choose(p, big.id);
    s = await settle(p);
    assert.equal(get(s, big.id).damage, 2);

    // Bill the Pony costs nothing with Sam and adds a hit point to Hobbits.
    s = base();
    icons(s, "leadership");
    const samHero = hero(s, B.sam, 0);
    const bill = hand(s, B.bill);
    await load(p, s);
    await openPlay(p, bill.id);
    s = await confirmPlay(p);
    s = await settle(p);
    assert.ok(s.allies.some((u) => u.code === B.bill));
    assert.equal(stats(s, get(s, samHero.id)).health, 4);
    assert.equal(stats(s, ringBearer(s)).health, 3);
    await shot(p, "bill-the-pony", width);

    // Halfling Determination targets Hobbit characters only.
    s = base();
    icons(s, "tactics");
    const frodo = ringBearer(s);
    const determination = hand(s, B.determination);
    await load(p, s);
    await openPlay(p, determination.id);
    await shot(p, "halfling-determination-target", width);
    s = await confirmPlay(p, frodo.id);
    s = await settle(p);
    assert.deepEqual(triple(s, get(s, frodo.id)), [4, 3, 4]);

    // Smoke Rings with two Pipes, then a Hobbit Pipe draws.
    s = base();
    icons(s, "spirit");
    const smoker = hero(s, B.sam, 0);
    smoker.phaseResourceIcons = ["spirit"];
    smoker.resources = 5;
    ringBearer(s).attachments.push({
      id: "pipe-1",
      code: B.pipe,
      exhausted: false,
    });
    smoker.attachments.push({ id: "pipe-2", code: B.pipe, exhausted: false });
    s.deck = [GANDALF, SNEAK];
    const rings = hand(s, B.smoke);
    await load(p, s);
    await openPlay(p, rings.id);
    s = await confirmPlay(p);
    assert.equal(s.threat, 18);
    assert.match(s.choice.title, /^Hobbit Pipe/);
    await shot(p, "hobbit-pipe-response", width);
    s = await choose(p, "use");
    s = await settle(p);
    assert.equal(s.hand.filter((u) => u.code === GANDALF).length, 1);
    assert.equal(stats(s, get(s, smoker.id)).will, 4);

    // Take No Notice during the quest phase.
    s = base();
    icons(s, "lore");
    const late = stage(s, TROLL);
    s.phase = "staging";
    const notice = hand(s, B.notice);
    await load(p, s);
    await openPlay(p, notice.id);
    s = await confirmPlay(p);
    s = await settle(p);
    assert.equal(engagementCost(s, get(s, late.id)), 35);
    await shot(p, "take-no-notice", width);

    // Frodo's Intuition, paid with the Ring-bearer's Fellowship resource.
    s = base();
    const ringBearerHero = ringBearer(s);
    ringBearerHero.resources = 2;
    s.deck = [GANDALF, SNEAK];
    const intuition = hand(s, B.intuition);
    await load(p, s);
    await openPlay(p, intuition.id);
    s = await confirmPlay(p);
    s = await settle(p);
    assert.deepEqual(
      s.hand.map((u) => u.code),
      [GANDALF],
    );
    assert.equal(stats(s, get(s, ringBearerHero.id)).will, 3);
    await shot(p, "frodos-intuition", width);

    // Hobbit Cloak goes on a Hobbit hero; the Dagger on any hero.
    s = base();
    icons(s, "leadership");
    const cloakHost = hero(s, B.sam, 0);
    cloakHost.resources = 5;
    cloakHost.phaseResourceIcons = ["leadership"];
    const cloak = hand(s, B.cloak);
    await load(p, s);
    await openPlay(p, cloak.id);
    await shot(p, "hobbit-cloak-target", width);
    s = await confirmPlay(p, cloakHost.id);
    s = await settle(p);
    assert.ok(get(s, cloakHost.id).attachments.some((a) => a.code === B.cloak));
    s = base();
    icons(s, "tactics");
    const armed = s.heroes[0];
    const dagger = hand(s, B.dagger);
    await load(p, s);
    await openPlay(p, dagger.id);
    s = await confirmPlay(p, armed.id);
    s = await settle(p);
    assert.equal(stats(s, get(s, armed.id)).attack, 4);
    await shot(p, "dagger-of-westernesse", width);
    await c.close();
  }
  await report(dir, { errors, entries, screenshots, checks });
  console.log(`PASS ${checks.length} The Black Riders player card checkpoints`);
} finally {
  await browser.close();
}
