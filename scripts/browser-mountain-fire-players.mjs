import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base, engaged, frodo, stage } from "../tests/mount-doom-fixtures.ts";
import {
  MOUNTAIN_FIRE_PLAYER as P,
  mountainFirePlayerAbilityLabel,
  mountainFirePlayerHandAbilityLabel,
} from "../src/game/mountain-fire-player-cards.ts";
import { applyAction } from "../src/game/engine.ts";
import { get, make, stats } from "../src/game/core.ts";
import { card } from "../src/game/cards.ts";
import { forOwner } from "../src/game/table.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const url =
  process.env.GAME_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, load, choose, settle, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.MOUNTAIN_FIRE_PLAYERS_BROWSER_SMOKE === "1";
const dir = "output/mountain-fire-players";
await fs.mkdir(dir, { recursive: true });
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/mountain-fire-player-art.json", import.meta.url),
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

const TOOK = "01043",
  SCOUT = "01016",
  BRANDYBUCK = "10006",
  LEGOLAS = "01005",
  WOLF = "01081",
  ORCS = "01089",
  TROLL = "01082";
const hand = (s, code, p = 0) => {
  let u;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.hand.push(u);
  });
  return u;
};
/** Replace one of the player's starting heroes (Frodo stays in slot 3). */
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

    // The ten faces are served exactly as pinned.
    for (const a of art) {
      const served = await p.evaluate(async (path) => {
        const r = await fetch(path);
        return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
      }, a.localPath);
      assert.deepEqual(served, { status: 200, bytes: a.bytes }, a.code);
    }
    checks.push(`10 faces @ ${width}`);

    // Éomer commits and attacks an enemy in the staging area.
    let s = base(1, 1);
    const eomer = hero(s, P.eomer, 2);
    const wolf = stage(s, WOLF);
    s.phase = "quest";
    s = applyAction(s, { type: "TOGGLE_QUEST", id: eomer.id });
    s = until(applyAction(s, { type: "COMMIT" }), P.eomer);
    await load(p, s);
    await shot(p, "eomer-response", width);
    s = await choose(p, wolf.id);
    s = await settle(p);
    assert.ok(!s.staging.some((u) => u.id === wolf.id));
    assert.equal(get(s, eomer.id).resources, 9);

    // Tom Cotton: no resource match while engaged above your threat.
    s = base(1, 1);
    hero(s, P.tom, 2);
    engaged(s, TROLL);
    const took = hand(s, TOOK);
    await load(p, s);
    await openPlay(p, took.id);
    await shot(p, "tom-cotton-no-match", width);
    s = await confirmPlay(p);
    s = until(s, P.tom);
    await load(p, s);
    await shot(p, "tom-cotton-response", width);
    s = await choose(p, optionOf(s, P.tom, "use"));
    s = await settle(p);
    const halfling = s.allies.find((u) => u.code === TOOK);
    assert.equal(stats(s, halfling).attack, card(TOOK).attack + 2);

    // Rosie Cotton adds her willpower to Frodo's attack.
    s = base(1, 1);
    ally(s, P.rosie);
    await load(p, s);
    s = await ability(p, mountainFirePlayerAbilityLabel(P.rosie));
    assert.match(s.choice.title, /^Rosie Cotton · Add 2 to a Hobbit hero's/);
    await shot(p, "rosie-cotton-choice", width);
    const ringBearer = frodo(s);
    s = await choose(p, `${ringBearer.id}:attack`);
    assert.equal(stats(s, frodo(s)).attack, card(P.frodo).attack + 2);

    // Elfhelm enters play from the hand for a Rohan resource.
    s = base(1, 1);
    hand(s, P.elfhelm);
    await load(p, s);
    await shot(p, "elfhelm-hand", width);
    s = await ability(p, mountainFirePlayerHandAbilityLabel(P.elfhelm));
    s = await settle(p);
    assert.ok(s.allies.some((u) => u.code === P.elfhelm));
    await shot(p, "elfhelm-in-play", width);

    // Elladan and Elrohir ready after an optional engagement with an Orc.
    s = base(1, 1);
    const elladan = ally(s, P.elladan);
    const elrohir = ally(s, P.elrohir);
    elladan.exhausted = true;
    elrohir.exhausted = true;
    const orc = stage(s, WOLF);
    s.phase = "encounter";
    s = until(applyAction(s, { type: "ENGAGE", id: orc.id }), P.elladan);
    await load(p, s);
    await shot(p, "elladan-response", width);
    s = await choose(p, optionOf(s, P.elladan, "use"));
    assert.equal(get(s, elladan.id).exhausted, false);
    assert.equal(
      stats(s, get(s, elladan.id)).attack,
      card(P.elladan).attack + 2,
    );

    // Orc Disguise on the Ring-bearer, discarded after an Orc engages.
    s = base(1, 1);
    const fr = frodo(s);
    const disguise = hand(s, P.disguise);
    await load(p, s);
    await openPlay(p, disguise.id);
    s = await confirmPlay(p, fr.id);
    s = await settle(p);
    assert.ok(frodo(s).attachments.some((a) => a.code === P.disguise));
    await shot(p, "orc-disguise-attached", width);
    s = base(1, 1);
    attach(s, frodo(s), P.disguise);
    const scout = stage(s, WOLF);
    s.phase = "encounter";
    s = until(applyAction(s, { type: "ENGAGE", id: scout.id }), P.disguise);
    await load(p, s);
    await shot(p, "orc-disguise-response", width);
    s = await choose(p, optionOf(s, P.disguise, "use"));
    s = await settle(p);
    assert.ok(!frodo(s).attachments.some((a) => a.code === P.disguise));

    // Captains of the West in the quest phase.
    s = base(1, 1);
    const captains = hand(s, P.captains);
    s.phase = "quest";
    await load(p, s);
    await openPlay(p, captains.id);
    s = await confirmPlay(p);
    s = await settle(p);
    const gloin = s.heroes.find((h) => h.code === "01003");
    assert.equal(stats(s, gloin).will, card("01003").willpower + 1);
    await shot(p, "captains-of-the-west", width);

    // Gúthwinë: +2 attack and a Rohan ally back after the kill.
    s = base(1, 1);
    const theodred = s.heroes[1];
    attach(s, theodred, P.guthwine);
    s.discard.push(SCOUT);
    const orcs = engaged(s, ORCS);
    s.phase = "attack";
    s.combat = null;
    s = until(
      applyAction(s, {
        type: "ATTACK",
        enemyId: orcs.id,
        attackerIds: [theodred.id],
      }),
      P.guthwine,
    );
    await load(p, s);
    await shot(p, "guthwine-response", width);
    s = await choose(p, optionOf(s, P.guthwine, "use"));
    s = await settle(p);
    assert.ok(s.hand.some((u) => u.code === SCOUT));

    // Raise the Shire: a Hobbit ally out of the top 5 cards.
    s = base(1, 1);
    hero(s, LEGOLAS, 2);
    hand(s, P.raise);
    s.deck = ["01013", BRANDYBUCK, "01013", "01013", "01013", "01013"];
    const rider = stage(s, WOLF);
    s.phase = "encounter";
    s = until(applyAction(s, { type: "ENGAGE", id: rider.id }), P.raise);
    await load(p, s);
    await shot(p, "raise-the-shire-response", width);
    s = await choose(p, optionOf(s, P.raise, "play"));
    for (
      let n = 0;
      n < 10 && !s.choice?.title.startsWith("Raise the Shire · Put");
      n++
    )
      s = await choose(p, s.choice.options[0].id);
    await shot(p, "raise-the-shire-search", width);
    s = await choose(p, "ally-1");
    s = await settle(p);
    assert.ok(s.allies.some((u) => u.code === BRANDYBUCK));
    await c.close();
  }
  await report(dir, { errors, entries, screenshots, checks });
  console.log(
    `PASS ${checks.length} The Mountain of Fire player card checkpoints`,
  );
} finally {
  await browser.close();
}
