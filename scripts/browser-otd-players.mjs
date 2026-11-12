import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as wmaBase } from "../tests/we-must-away-fixtures.ts";
import { WMA as W } from "../src/game/we-must-away-support.ts";
import {
  OTD_PLAYER as P,
  otdPlayerAbilityLabel,
} from "../src/game/otd-player-cards.ts";
import { OTD_DWARF as D } from "../src/game/dwarf-player-cards.ts";
import { applyAction } from "../src/game/engine.ts";
import { fx, get, make, stats } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { forOwner, seatView } from "../src/game/table.ts";
import { bagginsBilbo } from "../src/game/hobbit-saga.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const url =
  process.env.GAME_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, load, choose, settle, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.OTD_PLAYERS_BROWSER_SMOKE === "1";
const dir = "output/otd-players";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];

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
  u.resources = 0;
  s.heroes[slot] = u;
  return u;
};
const icons = (s, sphere, p = 0) =>
  forOwner(s, p, () => {
    for (const h of s.heroes) h.phaseResourceIcons = [sphere];
  });
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

    // Balin's response in the shadow dialog, then the replacement shadow.
    let s = wmaBase();
    const balin = hero(s, P.balin, 0);
    balin.resources = 2;
    const spider = make(s, "01096");
    spider.shadows = ["01085"];
    s.engaged.push(spider);
    s.encounterDeck = ["01115", "01081"];
    s.phase = "defense";
    s = applyAction(s, {
      type: "DEFEND",
      enemyId: spider.id,
      defenderId: s.heroes[2].id,
    });
    const balinOption = s.choice.options.find((o) => o.code === P.balin);
    assert.ok(balinOption);
    await load(p, s);
    await shot(p, "balin-shadow-response", width);
    s = await choose(p, balinOption.id);
    s = await settle(p);
    assert.equal(get(s, balin.id).resources, 1);
    assert.deepEqual(get(s, spider.id).shadows, ["01085", "01115"]);
    await shot(p, "balin-replacement-shadow", width);

    // Straight Shot discards a non-unique enemy with 0 defense.
    s = wmaBase();
    icons(s, "tactics");
    const straight = hand(s, P.shot);
    const orcs = make(s, "01089");
    s.engaged.push(orcs);
    s.heroes[1].attachments.push({
      id: "blade",
      code: "01039",
      exhausted: false,
    });
    await load(p, s);
    await openPlay(p, straight.id);
    await shot(p, "straight-shot-target", width);
    s = await confirmPlay(p, orcs.id);
    s = await settle(p);
    assert.equal(get(s, orcs.id), undefined);
    assert.ok(s.encounterDiscard.includes("01089"));

    // Desperate Alliance gives Aragorn and his resources to the other player.
    s = wmaBase(2);
    icons(s, "spirit");
    const alliance = hand(s, P.alliance);
    const aragorn = s.heroes[0];
    aragorn.resources = 3;
    await load(p, s);
    await openPlay(p, alliance.id);
    await shot(p, "desperate-alliance-target", width);
    s = await confirmPlay(p, aragorn.id);
    s = await settle(p);
    assert.ok(seatView(s, 1).heroes.some((u) => u.id === aragorn.id));
    await shot(p, "desperate-alliance-given", width);

    // Ravens of the Mountain shows the shuffled top card and its threat.
    s = wmaBase();
    icons(s, "lore");
    s.encounterDeck = ["01096", "01081", "01089"];
    const ravens = hand(s, P.ravens);
    await load(p, s);
    await openPlay(p, ravens.id);
    s = await confirmPlay(p, s.heroes[0].id);
    assert.match(s.choice.title, /Ravens of the Mountain/);
    const top = s.encounterDeck[0];
    await shot(p, "ravens-of-the-mountain-look", width);
    s = await choose(p, "progress");
    s = await settle(p);
    assert.ok(s.progress > 0);
    assert.equal(s.encounterDeck[0], top);

    // To me! O my kinsfolk! picks a Dwarf ally from the discard pile.
    s = wmaBase();
    icons(s, "leadership");
    s.discard = ["01073", "01028"];
    const kinsfolk = hand(s, P.kinsfolk);
    await load(p, s);
    await openPlay(p, kinsfolk.id);
    s = await confirmPlay(p);
    assert.match(s.choice.title, /To me! O my kinsfolk!/);
    await shot(p, "kinsfolk-dwarf-ally", width);
    s = await choose(p, s.choice.options[0].id);
    s = await settle(p);
    assert.ok(s.allies.some((u) => u.code === "01028"));

    // The Lucky Number adds Bilbo's stats to the chosen character.
    s = wmaBase();
    const lucky = hand(s, P.lucky);
    const target = s.heroes[1];
    const before = stats(s, target).attack;
    await load(p, s);
    await openPlay(p, lucky.id);
    await shot(p, "lucky-number-target", width);
    s = await confirmPlay(p, target.id);
    s = await settle(p);
    assert.equal(
      stats(s, get(s, target.id)).attack,
      before + stats(s, bagginsBilbo(s)).attack,
    );

    // Great Yew Bow: the attachment's Combat Action and its enemy choice.
    s = wmaBase();
    const bard = hero(s, P.bard, 0);
    bard.attachments.push({ id: "bow", code: P.bow, exhausted: false });
    const troll = make(s, "01096");
    s.staging.push(troll);
    s.phase = "attack";
    await load(p, s);
    s = await ability(p, otdPlayerAbilityLabel(P.bow));
    assert.match(s.choice.title, /Great Yew Bow/);
    await shot(p, "great-yew-bow-enemy", width);
    s = await choose(p, troll.id);
    s = await settle(p);
    // Bard's ranged attack: 3 attack against 1 − 2 defense.
    assert.equal(get(s, troll.id).damage, 3);
    assert.equal(get(s, bard.id).exhausted, true);

    // Black Arrow's response after its hero declares an attack.
    s = wmaBase();
    const legolas = hero(s, "01005", 0);
    legolas.attachments.push({ id: "arrow", code: P.arrow, exhausted: false });
    const ufthak = make(s, "01090");
    s.engaged.push(ufthak);
    s.phase = "attack";
    s = applyAction(s, {
      type: "ATTACK",
      enemyId: ufthak.id,
      attackerIds: [legolas.id],
    });
    await load(p, s);
    await shot(p, "black-arrow-response", width);
    s = await choose(p, "use");
    s = await settle(p);
    assert.equal(get(s, ufthak.id).damage, 5);
    assert.ok(s.victoryCards.includes(P.arrow));

    // Thrór's Key moves to a location added to the staging area.
    s = wmaBase();
    s.heroes[0].attachments.push({ id: "key", code: P.key, exhausted: false });
    s.queue.push(fx("placeEncounter", { code: W.loneLands, text: "revealed" }));
    flush(s);
    assert.match(s.choice.title, /Thrór's Key/);
    await load(p, s);
    await shot(p, "thrors-key-response", width);
    s = await choose(p, "use");
    s = await settle(p);
    const lands = s.staging.find((u) => u.code === W.loneLands);
    assert.equal(lands.attachments[0].code, P.key);
    assert.equal(lands.blanked, true);
    await shot(p, "thrors-key-location", width);

    // Expert Treasure-hunter names a card type after questing successfully.
    s = wmaBase();
    s.heroes[0].attachments.push({
      id: "hunter",
      code: P.hunter,
      exhausted: false,
    });
    s.heroes[0].committed = true;
    s.deck = ["01023", "01039"];
    s.queue.push(fx("questSuccessResponses", { player: 0 }));
    flush(s);
    await load(p, s);
    await shot(p, "treasure-hunter-name", width);
    s = await choose(p, "event");
    s = await settle(p);
    assert.ok(s.hand.some((u) => u.code === "01023"));

    // Bifur's response as the fifth Dwarf (Bombur counts as two).
    s = wmaBase();
    hero(s, "01004", 0);
    hero(s, D.bombur, 1);
    icons(s, "lore");
    for (const h of s.heroes) h.resources = 4;
    s.deck = ["01023", "01039", "01073"];
    const bifur = hand(s, D.bifur);
    await load(p, s);
    await openPlay(p, bifur.id);
    s = await confirmPlay(p);
    assert.match(s.choice.title, /^Bifur/);
    await shot(p, "bifur-response", width);
    s = await choose(p, "draw");
    s = await settle(p);
    assert.deepEqual(
      s.hand.map((u) => u.code),
      ["01023", "01039"],
    );
    await c.close();
  }
  await report(dir, { errors, entries, screenshots, checks });
  console.log(`PASS ${checks.length} On the Doorstep player card checkpoints`);
} finally {
  await browser.close();
}
