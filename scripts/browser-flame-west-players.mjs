import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base, engaged, stage } from "../tests/siege-gondor-fixtures.ts";
import {
  FLAME_WEST_PLAYER as P,
  flameWestPlayerAbilityLabel,
} from "../src/game/flame-west-player-cards.ts";
import { applyAction } from "../src/game/engine.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import { fx, get, make, playCost, stats } from "../src/game/core.ts";
import { card } from "../src/game/cards.ts";
import { forOwner } from "../src/game/table.ts";
import {
  FLAME_WEST_ARAGORN,
  fellowshipAragorn,
} from "../src/game/lotr-saga.ts";
import { SG } from "../src/game/siege-gondor-support.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const url =
  process.env.GAME_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, load, choose, settle, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.FLAME_WEST_PLAYERS_BROWSER_SMOKE === "1";
const dir = "output/flame-west-players";
await fs.mkdir(dir, { recursive: true });
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/flame-west-player-art.json", import.meta.url),
  ),
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];

const GIMLI = "01004",
  GLOIN = "01003",
  BLADE = "01039",
  MOUNTAINS = "01078";
const hand = (s, code, p = 0) => {
  let u;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.hand.push(u);
  });
  return u;
};
/** Replace the player's first hero that is not Aragorn. */
const hero = (s, code, p = 0) => {
  let u;
  forOwner(s, p, () => {
    const slot = s.heroes.findIndex((h) => h.code !== FLAME_WEST_ARAGORN);
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
/** An engaged enemy attacks with the given facedown shadow cards. */
const defend = (s, enemy, defender, shadows = []) => {
  s.phase = "defense";
  s.combat = null;
  enemy.shadows = [...shadows];
  enemy.faceupShadows = shadows.map(() => false);
  return applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
};
/** Skip unrelated decisions until the card's ability is offered. */
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
/** The option of the card's ability with the given id. */
const optionOf = (s, code, id) =>
  (
    s.choice.options.find((o) => o.ability?.code === code && o.id === id) ??
    s.choice.options.find((o) => o.ability?.code === code)
  ).id;
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

    // The eleven faces are served exactly as pinned.
    for (const a of art) {
      const served = await p.evaluate(async (path) => {
        const r = await fetch(path);
        return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
      }, a.localPath);
      assert.deepEqual(served, { status: 200, bytes: a.bytes }, a.code);
    }
    checks.push(`11 faces @ ${width}`);

    // Éowyn: raise your threat by 3 to ready her with +9 attack.
    let s = base(1);
    const eowyn = hero(s, P.eowyn);
    eowyn.exhausted = true;
    engaged(s, SG.crew);
    s.phase = "attack";
    await load(p, s);
    await shot(p, "eowyn-ability", width);
    s = await ability(p, flameWestPlayerAbilityLabel(P.eowyn));
    assert.equal(s.threat, 23);
    assert.equal(get(s, eowyn.id).exhausted, false);
    assert.equal(stats(s, get(s, eowyn.id)).attack, card(P.eowyn).attack + 9);
    await shot(p, "eowyn-ready", width);

    // Beregond defends without damage: the defending player's threat -1.
    s = base(1);
    const beregond = hero(s, P.beregond);
    s = until(defend(s, engaged(s, SG.corsair), beregond), P.beregond);
    await load(p, s);
    await shot(p, "beregond-response", width);
    s = await choose(p, optionOf(s, P.beregond, "use"));
    s = await settle(p);
    assert.equal(s.threat, 19);

    // Grimbold: an engaged enemy cannot attack this phase.
    s = base(1);
    const grimbold = ally(s, P.grimbold);
    const crew = engaged(s, SG.crew);
    s.phase = "defense";
    await load(p, s);
    s = await ability(p, flameWestPlayerAbilityLabel(P.grimbold));
    assert.match(s.choice.title, /^Grimbold · Choose an enemy engaged/);
    await shot(p, "grimbold-choice", width);
    s = await choose(p, `${crew.id}:0`);
    assert.deepEqual(get(s, crew.id).preventedAttacks, [0]);
    assert.ok(!s.allies.some((u) => u.id === grimbold.id));

    // Prince Imrahil is a hero while a hero card is in the discard pile.
    s = base(1);
    const imrahil = ally(s, P.imrahil);
    s.discard.push(GIMLI);
    check(s);
    assert.ok(s.heroes.some((h) => h.id === imrahil.id));
    await load(p, s);
    await shot(p, "prince-imrahil-hero", width);

    // Halbarad costs 1 less for each enemy engaged with you.
    s = base(1);
    engaged(s, SG.corsair);
    engaged(s, SG.pirate);
    const halbarad = hand(s, P.halbarad);
    assert.equal(
      playCost(s, card(P.halbarad)),
      Number(card(P.halbarad).cost) - 2,
    );
    await load(p, s);
    await openPlay(p, halbarad.id);
    await shot(p, "halbarad-cost", width);
    s = await confirmPlay(p);
    s = await settle(p);
    assert.ok(s.allies.some((u) => u.code === P.halbarad));

    // Ghân-buri-Ghân leads the players to a location without its Travel effect.
    s = base(1);
    ally(s, P.ghan);
    const mountains = stage(s, MOUNTAINS);
    s.phase = "travel";
    await load(p, s);
    s = await ability(p, flameWestPlayerAbilityLabel(P.ghan));
    assert.match(s.choice.title, /^Ghân-buri-Ghân · Travel to a location/);
    await shot(p, "ghan-buri-ghan-travel", width);
    s = await choose(p, mountains.id);
    s = await settle(p);
    assert.equal(s.activeLocation?.id, mountains.id);
    await shot(p, "ghan-buri-ghan-arrived", width);

    // Sterner than Steel: a Weapon on the defender cancels the shadow.
    s = base(1);
    const gimli = hero(s, GIMLI);
    const blade = attach(s, gimli, BLADE);
    hand(s, P.sterner);
    s = defend(s, engaged(s, SG.corsair), gimli, [SG.corsair]);
    assert.match(s.choice.title, /^A shadow falls/);
    await load(p, s);
    await shot(p, "sterner-than-steel", width);
    s = await choose(p, optionOf(s, P.sterner));
    s = await settle(p);
    assert.ok(
      get(s, gimli.id).attachments.find((a) => a.id === blade.id).exhausted,
    );
    assert.equal(get(s, gimli.id).damage, 0);

    // Golden Shield adds Éowyn's willpower to her defense.
    s = base(1);
    const shieldmaiden = hero(s, P.eowyn);
    attach(s, shieldmaiden, P.shield);
    s = until(defend(s, engaged(s, SG.crew), shieldmaiden), P.shield);
    await load(p, s);
    await shot(p, "golden-shield", width);
    s = await choose(p, optionOf(s, P.shield, "use"));
    s = await settle(p);
    assert.equal(get(s, shieldmaiden.id).damage, 1);

    // Livery of the Tower: spend resources to cancel damage just dealt.
    s = base(1);
    const guard = hero(s, P.beregond);
    attach(s, guard, P.livery);
    s.queue.push(fx("damage", { target: guard.id, value: 3, player: 0 }));
    flush(s);
    s = until(s, P.livery);
    await load(p, s);
    await shot(p, "livery-of-the-tower", width);
    s = await choose(p, optionOf(s, P.livery, "cancel-2"));
    s = await settle(p);
    assert.equal(get(s, guard.id).damage, 1);
    assert.equal(get(s, guard.id).resources, 8);

    // Roheryn: Aragorn attacks the enemy he optionally engaged.
    s = base(1);
    const aragorn = fellowshipAragorn(s);
    attach(s, aragorn, P.roheryn);
    const corsair = stage(s, SG.corsair);
    s.phase = "encounter";
    s = until(applyAction(s, { type: "ENGAGE", id: corsair.id }), P.roheryn);
    await load(p, s);
    await shot(p, "roheryn-response", width);
    s = await choose(p, optionOf(s, P.roheryn, "use"));
    s = await settle(p);
    assert.ok(get(s, aragorn.id).exhausted);
    assert.equal(
      get(s, corsair.id).damage,
      card(FLAME_WEST_ARAGORN).attack - card(SG.corsair).defense,
    );

    // Banner of Elendil is played on Aragorn with his Fellowship resources.
    s = base(1);
    const king = fellowshipAragorn(s);
    king.resources = 3;
    const banner = hand(s, P.banner);
    await load(p, s);
    await openPlay(p, banner.id);
    s = await confirmPlay(p, king.id);
    s = await settle(p);
    assert.ok(get(s, king.id).attachments.some((a) => a.code === P.banner));
    assert.equal(get(s, king.id).resources, 0);
    const dwarf = s.heroes.find((h) => h.code === GLOIN);
    get(s, king.id).committed = true;
    get(s, dwarf.id).committed = true;
    s.phase = "quest";
    s.committedIds = [king.id, dwarf.id];
    assert.equal(stats(s, get(s, dwarf.id)).will, card(GLOIN).willpower + 1);
    await load(p, s);
    await shot(p, "banner-of-elendil", width);
    await c.close();
  }
  await report(dir, { errors, entries, screenshots, checks });
  console.log(
    `PASS ${checks.length} The Flame of the West player card checkpoints`,
  );
} finally {
  await browser.close();
}
