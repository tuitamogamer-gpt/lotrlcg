import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base, engaged } from "../tests/shadow-past-fixtures.ts";
import {
  ROAD_DARKENS_PLAYER as R,
  roadDarkensPlayerAbilityLabel,
} from "../src/game/road-darkens-player-cards.ts";
import { damage } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { get, make, stats } from "../src/game/core.ts";
import { forOwner, selectSeat } from "../src/game/table.ts";
import { ringBearer } from "../src/game/lotr-saga.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const url =
  process.env.GAME_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, load, choose, settle, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.ROAD_DARKENS_PLAYERS_BROWSER_SMOKE === "1";
const dir = "output/road-darkens-players";
await fs.mkdir(dir, { recursive: true });
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/road-darkens-player-art.json", import.meta.url),
  ),
);
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];

const AXEHAND = "01028",
  SPEARMAN = "01029",
  TOOK = "01043",
  GUARD = "01013",
  EOWYN = "01007",
  CORE_GANDALF = "01073",
  HOBBIT_PIPE = "141015",
  ORCS = "01089",
  SPIDER = "01096";
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

    // The nine faces are served exactly as pinned.
    for (const a of art) {
      const served = await p.evaluate(async (path) => {
        const r = await fetch(path);
        return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
      }, a.localPath);
      assert.deepEqual(served, { status: 200, bytes: a.bytes }, a.code);
    }
    checks.push(`9 faces @ ${width}`);

    // Gandalf's faceup top card, played from the hand zone and paid by him.
    let s = base();
    const gandalf = hero(s, R.gandalf, 0);
    for (const h of s.heroes) h.resources = h.id === gandalf.id ? 3 : 0;
    s.deck = [AXEHAND, SPEARMAN, TOOK];
    await load(p, s);
    const top = p.getByRole("group", { name: "Top of your deck, faceup" });
    await top.scrollIntoViewIfNeeded();
    assert.equal(
      await top.locator("img").first().getAttribute("data-card-code"),
      AXEHAND,
    );
    await shot(p, "gandalf-faceup-top-card", width);
    await top.getByRole("button", { name: /Play with Gandalf/ }).click();
    await shot(p, "gandalf-deck-play-dialog", width);
    s = await confirmPlay(p);
    s = await settle(p);
    assert.deepEqual(
      s.allies.map((u) => u.code),
      [AXEHAND],
    );
    assert.equal(get(s, gandalf.id).resources, 1);
    // Once per phase: the next card is faceup but cannot be played now.
    assert.equal(
      await top.locator("img").first().getAttribute("data-card-code"),
      SPEARMAN,
    );
    assert.equal(
      await top.getByRole("button", { name: /Play with Gandalf/ }).count(),
      0,
    );
    await shot(p, "gandalf-once-per-phase", width);

    // Another player sees the faceup top card.
    s = base(2);
    hero(s, R.gandalf, 0);
    forOwner(s, 0, () => (s.deck = [TOOK, GUARD]));
    selectSeat(s, 1);
    await load(p, s);
    const faceup = p.locator(".companion-deck-top img");
    await faceup.first().scrollIntoViewIfNeeded();
    assert.equal(await faceup.first().getAttribute("data-card-code"), TOOK);
    await shot(p, "gandalf-faceup-other-player", width);

    // Boromir readies after he takes damage.
    s = base();
    const boromir = ally(s, R.boromir);
    boromir.exhausted = true;
    damage(s, boromir.id, 1);
    flush(s);
    assert.match(s.choice.title, /^Boromir/);
    await load(p, s);
    await shot(p, "boromir-response", width);
    s = await choose(p, "use");
    s = await settle(p);
    assert.equal(get(s, boromir.id).exhausted, false);

    // Bilbo Baggins finds a Pipe attachment.
    s = base();
    hero(s, EOWYN, 0).resources = 5;
    s.deck = [AXEHAND, R.pipe, TOOK, HOBBIT_PIPE, GUARD];
    const bilbo = hand(s, R.bilbo);
    await load(p, s);
    await openPlay(p, bilbo.id);
    s = await confirmPlay(p);
    assert.match(s.choice.title, /^Bilbo Baggins/);
    await shot(p, "bilbo-response", width);
    s = await choose(p, "use");
    assert.match(s.choice.title, /Choose a Pipe/);
    await shot(p, "bilbo-pipe-choice", width);
    s = await choose(p, s.choice.options.find((o) => o.code === R.pipe).id);
    s = await settle(p);
    assert.deepEqual(
      s.hand.map((u) => u.code),
      [R.pipe],
    );

    // Flame of Anor readies Gandalf with +X attack and enters the victory display.
    s = base();
    const istari = hero(s, R.gandalf, 0);
    istari.exhausted = true;
    istari.resources = 1;
    s.deck = [SPEARMAN, TOOK];
    s.phase = "attack";
    const flame = hand(s, R.flame);
    await load(p, s);
    await openPlay(p, flame.id);
    await shot(p, "flame-of-anor-target", width);
    s = await confirmPlay(p, istari.id);
    s = await settle(p);
    assert.equal(get(s, istari.id).exhausted, false);
    assert.equal(stats(s, get(s, istari.id)).attack, 5);
    assert.deepEqual(s.victoryCards, [R.flame]);
    await shot(p, "flame-of-anor-victory", width);

    // Gandalf's Staff: play it on Gandalf, then exhaust it for a resource.
    s = base();
    const wizard = hero(s, R.gandalf, 0);
    wizard.resources = 2;
    const staff = hand(s, R.staff);
    await load(p, s);
    await openPlay(p, staff.id);
    await shot(p, "gandalfs-staff-target", width);
    s = await confirmPlay(p, wizard.id);
    s = await settle(p);
    assert.ok(get(s, wizard.id).attachments.some((a) => a.code === R.staff));
    const frodo = ringBearer(s);
    s = await ability(p, roadDarkensPlayerAbilityLabel(R.staff));
    assert.match(s.choice.title, /^Gandalf's Staff/);
    await shot(p, "gandalfs-staff-choice", width);
    s = await choose(p, `resource-${frodo.id}`);
    s = await settle(p);
    assert.equal(get(s, frodo.id).resources, 1);

    // Gandalf's Staff discards a shadow card from a non-unique enemy.
    s = base();
    const staffHost = hero(s, R.gandalf, 0);
    staffHost.attachments.push({
      id: "staff-1",
      code: R.staff,
      exhausted: false,
    });
    const orcs = engaged(s, ORCS);
    orcs.shadows = [SPIDER];
    s.phase = "attack";
    await load(p, s);
    s = await ability(p, roadDarkensPlayerAbilityLabel(R.staff));
    s = await choose(p, `shadow-${orcs.id}-0`);
    s = await settle(p);
    assert.deepEqual(get(s, orcs.id).shadows, []);
    await shot(p, "gandalfs-staff-shadow", width);

    // Wizard Pipe on an Istari ally exchanges a hand card with the top card.
    s = base();
    const coreGandalf = ally(s, CORE_GANDALF);
    coreGandalf.attachments.push({
      id: "pipe-1",
      code: R.pipe,
      exhausted: false,
    });
    s.deck = [AXEHAND, TOOK];
    const kept = hand(s, GUARD);
    await load(p, s);
    s = await ability(p, roadDarkensPlayerAbilityLabel(R.pipe));
    assert.match(s.choice.title, /^Wizard Pipe/);
    await shot(p, "wizard-pipe-choice", width);
    s = await choose(p, kept.id);
    s = await settle(p);
    assert.deepEqual(s.deck, [GUARD, TOOK]);
    assert.deepEqual(
      s.hand.map((u) => u.code),
      [AXEHAND],
    );

    // Fellowship of the Ring on the Ring-bearer: +1 willpower for each hero,
    // discarded after a character is destroyed.
    s = base();
    const bearer = ringBearer(s);
    bearer.resources = 2;
    const firstHero = s.heroes[0];
    const will = stats(s, firstHero).will;
    const fellowship = hand(s, R.fellowship);
    await load(p, s);
    await openPlay(p, fellowship.id);
    s = await confirmPlay(p, bearer.id);
    s = await settle(p);
    assert.equal(stats(s, get(s, firstHero.id)).will, will + 1);
    await shot(p, "fellowship-of-the-ring", width);
    const doomed = make(s, TOOK);
    doomed.owner = 0;
    s.allies.push(doomed);
    damage(s, doomed.id, 5);
    flush(s);
    assert.ok(
      !get(s, bearer.id).attachments.some((a) => a.code === R.fellowship),
    );
    await load(p, s);
    await shot(p, "fellowship-of-the-ring-discarded", width);
    await c.close();
  }
  await report(dir, { errors, entries, screenshots, checks });
  console.log(`PASS ${checks.length} The Road Darkens player card checkpoints`);
} finally {
  await browser.close();
}
