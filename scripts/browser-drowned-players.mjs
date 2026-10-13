import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  drownedPlayerFixture as fixture,
  drownedPlayerHand as hand,
  drownedPlayerAlly as ally,
  drownedPlayerAttach as attach,
} from "../tests/drowned-player-fixtures.ts";
import {
  DROWNED_PLAYER as P,
  DROWNED_PLAYER_CARDS,
} from "../src/game/drowned-player-support.ts";
import { drownedPlayerAbilityLabel } from "../src/game/drowned-player.ts";
import { card, plain, imageUrl } from "../src/game/cards.ts";
import {
  engagementCost,
  get,
  make,
  stats,
  threatOf,
} from "../src/game/core.ts";
import { forOwner, seatView, syncSeat } from "../src/game/table.ts";
import { validateSave } from "../src/game/engine.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, resume, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const dir = "output/drowned-players";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];
let activePage;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function load(p, s) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid Drowned Ruins player fixture");
  const navigation = p.waitForNavigation({ waitUntil: "load" });
  await p.evaluate((state) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(state));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
    location.reload();
  }, s);
  await navigation;
  await p.locator("#start-btn").click();
  await reviewedState(p);
  return saved(p);
}
async function shot(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function play(p, id, target) {
  await boardCard(p, id)
    .getByRole("button", { name: "Play card", exact: true })
    .click();
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
async function ability(p, unit, code = unit.code) {
  await boardCard(p, unit.id)
    .getByRole("button", { name: drownedPlayerAbilityLabel(code), exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function printed(p, c) {
  assert.equal(
    await p.locator("[data-card-primary-name]").textContent(),
    c.name,
  );
  assert.equal(
    await p.locator("[data-card-primary-rules]").textContent(),
    plain(c.text),
  );
  const img = p.locator(".card-detail img[data-card-code]");
  assert.equal(
    new URL(await img.getAttribute("src"), p.url()).pathname,
    imageUrl(c),
  );
  assert.ok(
    await img.evaluate(async (i) => {
      await i.decode();
      return i.complete && i.naturalWidth > 0;
    }),
  );
}
try {
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [320, 750],
  ]) {
    const { c, p } = await context(browser, width, height, errors, entries);
    activePage = p;

    let s = fixture();
    const argalad = s.heroes[0],
      orc = make(s, "01089");
    s.staging = [orc];
    await load(p, s);
    await ability(p, argalad);
    await shot(p, "argalad-staging-target", width);
    await resume(p);
    await choose(p, orc.id);
    s = await settle(p);
    assert.equal(threatOf(s, get(s, orc.id)), 0);
    assert.equal(get(s, orc.id).damage, 1);
    assert.equal(get(s, argalad.id).exhausted, true);
    await shot(p, "argalad-reduction-and-damage", width);
    await next(p);
    s = await settle(p);
    assert.equal(threatOf(s, get(s, orc.id)), 2);
    await shot(p, "argalad-phase-expiry", width);

    s = fixture(2);
    const sword = ally(s, P.sellsword),
      leader = seatView(s, 1).heroes[0];
    attach(s, leader, "02010", 1);
    s.phase = "refresh";
    await load(p, s);
    await next(p);
    s = await saved(p);
    assert.match(s.choice.title, /Sellsword/);
    await shot(p, "sellsword-group-upkeep", width);
    await resume(p);
    await choose(p, leader.id);
    s = await settle(p);
    assert.ok(get(s, sword.id));
    assert.equal(get(s, leader.id).resources, 10);
    await shot(p, "sellsword-remote-leadership-paid", width);

    s = fixture(2);
    const healer = s.heroes[0],
      remote = seatView(s, 1).heroes[0],
      remedy = hand(s, P.remedy);
    healer.damage = 2;
    remote.damage = 2;
    await load(p, s);
    await play(p, remedy.id, healer.id);
    await shot(p, "remedy-attached-healing-response", width);
    await resume(p);
    await choose(p, "heal");
    s = await settle(p);
    assert.equal(get(s, healer.id).damage, 1);
    await ability(p, healer, P.remedy);
    await shot(p, "remedy-transfer-target", width);
    await resume(p);
    await choose(p, remote.id);
    await resume(p);
    await choose(p, "heal");
    s = await settle(p);
    assert.equal(get(s, healer.id).resources, 9);
    assert.equal(get(s, remote.id).damage, 1);
    assert.equal(get(s, remote.id).attachments[0].id, remedy.id);
    assert.equal(get(s, remote.id).attachments[0].owner, 0);
    await shot(p, "remedy-physical-transfer-and-heal", width);

    s = fixture(2);
    const troll = make(s, "01082"),
      marksman = hand(s, P.marksman);
    forOwner(s, 1, () => s.engaged.push(troll));
    await load(p, s);
    await play(p, marksman.id);
    await shot(p, "marksman-any-enemy-response", width);
    await resume(p);
    await choose(p, troll.id);
    s = await settle(p);
    assert.equal(stats(s, get(s, troll.id)).defense, 1);
    await shot(p, "marksman-remote-defense-reduction", width);

    s = fixture(2);
    s.phase = "quest";
    const attacker = s.heroes[0],
      enemy = make(s, "01089"),
      fury = hand(s, P.fury),
      spirit = seatView(s, 1).heroes[0];
    s.engaged = [enemy];
    await load(p, s);
    await play(p, fury.id, attacker.id);
    s = await saved(p);
    assert.equal(get(s, attacker.id).exhausted, true);
    await shot(p, "battle-fury-paid-attack-target", width);
    await resume(p);
    await choose(p, enemy.id);
    s = await saved(p);
    assert.equal(get(s, enemy.id).damage, 2);
    await shot(p, "battle-fury-group-spirit-choice", width);
    await resume(p);
    await choose(p, spirit.id);
    s = await settle(p);
    assert.equal(get(s, spirit.id).resources, 9);
    assert.equal(get(s, attacker.id).committed, true);
    assert.equal(get(s, attacker.id).exhausted, true);
    await shot(p, "battle-fury-actual-attack-and-commit", width);

    s = fixture();
    const forest = make(s, "01100"),
      rope = hand(s, P.hithlain),
      courier = hand(s, P.courier);
    s.staging = [forest];
    await load(p, s);
    await play(p, rope.id, forest.id);
    s = await settle(p);
    assert.equal(get(s, forest.id).attachments[0].id, rope.id);
    await shot(p, "hithlain-paid-location-attachment", width);
    await play(p, courier.id);
    s = await saved(p);
    assert.match(s.choice.title, /Hithlain/);
    await shot(p, "hithlain-actual-silvan-play", width);
    await resume(p);
    await choose(p, "progress");
    s = await saved(p);
    assert.equal(get(s, forest.id).progress, 1);
    assert.match(s.choice.title, /Courier/);
    await shot(p, "courier-entered-play-response", width);
    await resume(p);
    await choose(p, "use");
    await choose(p, forest.id);
    s = await settle(p);
    assert.equal(get(s, forest.id).progress, 3);
    await shot(p, "courier-two-forest-progress", width);

    s = fixture(2);
    s.phase = "travel";
    ally(s, P.robin);
    const destination = make(s, "01088"),
      waiting = make(s, "01089"),
      payer = seatView(s, 1).heroes[0];
    s.staging = [destination, waiting];
    await load(p, s);
    await boardCard(p, destination.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.match(s.choice.title, /Robin/);
    await shot(p, "robin-actual-travel-response", width);
    await resume(p);
    await choose(p, payer.id);
    s = await settle(p);
    assert.equal(get(s, payer.id).resources, 9);
    assert.equal(
      engagementCost(s, get(s, waiting.id)),
      card(waiting.code).engagement + card(destination.code).quest,
    );
    await shot(p, "robin-any-player-paid-engagement", width);

    s = fixture();
    const trapped = make(s, "01089"),
      interrogation = hand(s, P.interrogation);
    attach(s, trapped, "01069");
    trapped.tempThreat = -2;
    s.staging = [trapped];
    s.encounterDeck = ["01099", "01089", "01100"];
    await load(p, s);
    await play(p, interrogation.id, trapped.id);
    s = await saved(p);
    assert.equal(s.choice.options.filter((o) => o.code).length, 2);
    await shot(p, "interrogation-printed-threat-look", width);
    await resume(p);
    await choose(p, "card-1");
    s = await settle(p);
    assert.deepEqual(s.encounterDeck, ["01099", "01100"]);
    assert.deepEqual(s.encounterDiscard, ["01089"]);
    await shot(p, "interrogation-discard-preserves-order", width);

    s = fixture();
    s.heroes.pop();
    s.startingHeroes = s.heroes.map((h) => h.code);
    const striderHero = s.heroes[0],
      strider = hand(s, P.strider);
    await load(p, s);
    await play(p, strider.id, striderHero.id);
    s = await settle(p);
    assert.equal(stats(s, get(s, striderHero.id)).will, 4);
    await shot(p, "strider-paid-two-hero-company", width);
    await next(p);
    await p
      .getByRole("button", {
        name: `Commit ${card(striderHero.code).name}`,
        exact: true,
      })
      .click();
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .last()
      .click();
    await reviewedState(p);
    s = await settle(p);
    assert.equal(get(s, striderHero.id).committed, true);
    assert.equal(get(s, striderHero.id).exhausted, false);
    await resume(p);
    await shot(p, "strider-actual-ready-commitment", width);

    s = fixture();
    for (const definition of DROWNED_PLAYER_CARDS)
      if (definition.type_code !== "hero") hand(s, definition.code);
    await load(p, s);
    for (const definition of DROWNED_PLAYER_CARDS) {
      if (definition.type_code === "hero")
        await p
          .getByRole("button", {
            name: `Inspect ${definition.name}`,
            exact: true,
          })
          .click();
      else {
        const physical = (await saved(p)).hand.find(
          (u) => u.code === definition.code,
        );
        await boardCard(p, physical.id).locator(".hand-art").click();
      }
      await printed(p, card(definition.code));
      await shot(p, `printed-${definition.code}`, width);
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
    await c.close();
  }
  assert.equal(
    screenshots.length,
    99,
    "all 33 checkpoints at all three widths are required",
  );
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    smoke: false,
    sourceScriptSha256,
  });
  console.log(
    `Drowned Ruins players: ${screenshots.length} checkpoints passed (${url}).`,
  );
} catch (error) {
  const failureScreenshot = `${dir}/first-failure.png`;
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: failureScreenshot }).catch(() => null);
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        url,
        errors,
        screenshots,
        failure: String(error),
        failureScreenshot,
        sourceScriptSha256,
        stack: error.stack,
        lastState:
          activePage && !activePage.isClosed()
            ? await saved(activePage).catch(() => null)
            : null,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
