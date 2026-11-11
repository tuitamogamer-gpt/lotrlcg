import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as wmaBase } from "../tests/we-must-away-fixtures.ts";
import { base as nurnBase } from "../tests/fortress-nurn-fixtures.ts";
import {
  HOBBIT_PLAYER as P,
  hobbitPlayerAbilityLabel,
} from "../src/game/hobbit-player-cards.ts";
import { NURN_PLAYER } from "../src/game/fortress-nurn-player.ts";
import { get, make, stats } from "../src/game/core.ts";
import { forOwner, selectSeat } from "../src/game/table.ts";
import { bagginsBilbo } from "../src/game/hobbit-saga.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const url =
  process.env.GAME_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, load, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.HOBBIT_PLAYERS_BROWSER_SMOKE === "1";
const dir = "output/hobbit-players";
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
const ally = (s, code, p = 0) => {
  let u;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.allies.push(u);
  });
  return u;
};
const icons = (s, sphere) => {
  for (const h of s.heroes) h.phaseResourceIcons = [sphere];
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

    // Goblin-cleaver: the play dialog asks for an engaged enemy; the Weapon pays.
    let s = wmaBase();
    icons(s, "tactics");
    const cleaver = hand(s, P.cleaver);
    const spider = make(s, "01074");
    s.engaged.push(spider);
    s.heroes[0].attachments.push({
      id: "axe",
      code: "01041",
      exhausted: false,
    });
    s.phase = "defense";
    await load(p, s);
    await openPlay(p, cleaver.id);
    await shot(p, "goblin-cleaver-target", width);
    s = await confirmPlay(p, spider.id);
    s = await settle(p);
    assert.equal(get(s, spider.id).damage, 2);
    assert.equal(s.heroes[0].attachments[0].exhausted, true);
    await shot(p, "goblin-cleaver-damage", width);

    // Burglar Baggins: the player without Bilbo pays from Bilbo's pool.
    s = wmaBase(2);
    const bilbo = bagginsBilbo(s);
    bilbo.resources = 2;
    const before = stats(s, bilbo);
    selectSeat(s, 1);
    const burglar = hand(s, P.burglar, 1);
    await load(p, s);
    await openPlay(p, burglar.id);
    await p
      .getByRole("dialog")
      .getByText(/Bilbo Baggins/)
      .first()
      .waitFor();
    await shot(p, "burglar-baggins-bilbo-payer", width);
    s = await confirmPlay(p);
    s = await settle(p);
    const b = bagginsBilbo(s);
    assert.equal(b.resources, 1);
    assert.equal(stats(s, b).will, before.will + 2);
    assert.equal(stats(s, b).defense, before.defense + 2);
    await shot(p, "burglar-baggins-boost", width);

    // Knowledge of the Enemy now shows its hero picker.
    s = nurnBase();
    icons(s, "leadership");
    s.engaged.push(make(s, "01074"));
    const knowledge = hand(s, NURN_PLAYER.knowledge);
    const hero = s.heroes[1],
      resources = hero.resources;
    await load(p, s);
    await openPlay(p, knowledge.id);
    await shot(p, "knowledge-of-the-enemy-target", width);
    s = await confirmPlay(p, hero.id);
    s = await settle(p);
    assert.equal(get(s, hero.id).resources, resources + 1);

    // Bofur's search, through the ability button and the real choice dialog.
    s = wmaBase();
    const bofur = ally(s, P.bofur);
    s.deck = ["01028", "01041", "01073", "01014", "01023", "01039"];
    await load(p, s);
    s = await ability(p, hobbitPlayerAbilityLabel(P.bofur));
    assert.match(s.choice.title, /Bofur/);
    await shot(p, "bofur-top-five", width);
    s = await choose(p, "card-1");
    assert.deepEqual(
      s.hand.map((u) => u.code),
      ["01041"],
    );
    assert.equal(get(s, bofur.id).exhausted, true);

    // Spare Hood and Cloak readies another hero and moves to it.
    s = wmaBase();
    const [from, to] = s.heroes;
    from.attachments.push({ id: "hood", code: P.hood, exhausted: false });
    to.exhausted = true;
    await load(p, s);
    s = await ability(p, hobbitPlayerAbilityLabel(P.hood));
    await shot(p, "spare-hood-target", width);
    s = await choose(p, to.id);
    assert.equal(get(s, to.id).exhausted, false);
    assert.deepEqual(
      get(s, to.id).attachments.map((a) => a.code),
      [P.hood],
    );

    // Gandalf's Forced effect at the end of the refresh phase.
    s = wmaBase();
    const gandalf = ally(s, P.gandalf);
    s.phase = "refresh";
    await load(p, s);
    s = await next(p);
    assert.match(s.choice.title, /Gandalf/);
    await shot(p, "gandalf-refresh-choice", width);
    s = await choose(p, "keep");
    assert.ok(get(s, gandalf.id));
    assert.equal(s.threat, 22);
    await c.close();
  }
  await report(dir, { errors, entries, screenshots, checks });
  console.log(`PASS ${checks.length} Hobbit player card checkpoints`);
} finally {
  await browser.close();
}
