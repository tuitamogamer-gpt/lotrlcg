import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  stormcallerPlayerFixture as fixture,
  stormcallerPlayerHand as hand,
  stormcallerPlayerAlly as ally,
} from "../tests/stormcaller-player-fixtures.ts";
import {
  STORMCALLER_PLAYER as P,
  STORMCALLER_PLAYER_CARDS,
} from "../src/game/stormcaller-player-support.ts";
import {
  stormcallerAbilityLabel,
  stormcallerAttackBonus,
  stormcallerEffectiveThreat,
} from "../src/game/stormcaller-player.ts";
import { card, imageUrl } from "../src/game/cards.ts";
import { fx, get, make } from "../src/game/core.ts";
import { forOwner, seatView, selectSeat, syncSeat } from "../src/game/table.ts";
import { validateSave } from "../src/game/engine.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { pauseFor } from "../src/game/presentation.ts";

const url =
  process.env.GAME_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, resume, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.STORMCALLER_BROWSER_SMOKE === "1";
const dir = "output/stormcaller-players";
await fs.mkdir(dir, { recursive: true });
const launch = { headless: true };
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  const value = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (value) {
    const proxy = new URL(value);
    launch.proxy = { server: `${proxy.protocol}//${proxy.host}` };
    if (proxy.username)
      launch.proxy.username = decodeURIComponent(proxy.username);
    if (proxy.password)
      launch.proxy.password = decodeURIComponent(proxy.password);
  }
}
const browser = await chromium.launch(launch);
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];
let activePage;
async function load(p, s) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid player browser fixture");
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
function reviewQueuedAttack(s, title) {
  s.flow = { nextId: 1, pending: null, history: [], mode: "all" };
  pauseFor(s, {
    kind: "combat",
    title,
    detail:
      "Continue the saved enemy attack before resolving its queued effect.",
  });
}
async function shot(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function play(p, id, target) {
  await p
    .locator(`[data-motion-card="${id}"]`)
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
async function act(p, id, code) {
  await p
    .locator(`[data-motion-card="${id}"]`)
    .getByRole("button", { name: stormcallerAbilityLabel(code), exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function attack(p, enemyId, attackerId, power) {
  await p
    .locator(`[data-motion-card="${enemyId}"]`)
    .getByRole("button", { name: "Attack", exact: true })
    .click();
  const attacker = get(await saved(p), attackerId);
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(attacker.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: `Attack · ${power} power`, exact: true })
    .click();
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
    activePage = p;

    // Paid Service grants a remote hero Gondor; Denethor transfers rather than spends.
    let s = fixture(2),
      denethor = s.heroes[0],
      remote = seatView(s, 1).heroes[0];
    const service = hand(s, P.service),
      remoteBefore = remote.resources;
    await load(p, s);
    await play(p, service.id, remote.id);
    await settle(p);
    await act(p, denethor.id, P.denethor);
    await shot(p, "denethor-service-remote-target", width);
    await resume(p);
    await choose(p, remote.id);
    s = await settle(p);
    assert.equal(get(s, remote.id).resources, remoteBefore + 1);
    assert.equal(get(s, denethor.id).resources, 8); // Service costs one, transfer costs one.
    assert.equal(get(s, denethor.id).resourcesSpentRound, 1);
    assert.equal(get(s, denethor.id).exhausted, false);
    await shot(p, "denethor-physical-transfer-result", width);

    // Rod uses its actual host pool, does not exhaust and can act twice.
    s = fixture();
    denethor = s.heroes[0];
    const rod = hand(s, P.rod);
    s.deck = ["01020", "01021", "01022"];
    await load(p, s);
    await play(p, rod.id, denethor.id);
    await settle(p);
    await act(p, denethor.id, P.rod);
    await shot(p, "rod-first-paid-draw", width);
    await resume(p);
    await act(p, denethor.id, P.rod);
    s = await settle(p);
    assert.deepEqual(
      s.hand.map((u) => u.code),
      ["01020", "01021"],
    );
    assert.equal(get(s, denethor.id).resources, 6);
    assert.equal(
      get(s, denethor.id).attachments.find((a) => a.id === rod.id).exhausted,
      false,
    );
    await shot(p, "rod-repeated-host-cost-result", width);

    // Guardian keeps the original source and two distinct physical additional-cost cards.
    s = fixture();
    const guardian = hand(s, P.guardian),
      first = hand(s, "01020"),
      second = hand(s, "01020"),
      retained = hand(s, "01021");
    await load(p, s);
    await play(p, guardian.id);
    await shot(p, "guardian-first-physical-cost", width);
    await choose(p, first.id);
    await shot(p, "guardian-second-distinct-cost", width);
    await resume(p);
    await choose(p, second.id);
    s = await settle(p);
    assert.ok(s.allies.some((u) => u.id === guardian.id));
    assert.deepEqual(
      s.hand.map((u) => u.id),
      [retained.id],
    );
    assert.deepEqual(s.discard, ["01020", "01020"]);
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      27,
    );
    await shot(p, "guardian-simultaneous-cost-result", width);

    // Glorfindel uses the real discard drawer and normal five-resource payment.
    s = fixture();
    s.discard = [P.glorfindel, "01020", P.glorfindel];
    const readyCost = hand(s, "01021");
    await load(p, s);
    await p
      .getByRole("button", { name: "View discard piles", exact: true })
      .click();
    await shot(p, "glorfindel-own-discard-affordance", width);
    await p
      .getByRole("button", {
        name: "Play Glorfindel from discard",
        exact: true,
      })
      .first()
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    s = await settle(p);
    const glorfindel = s.allies.find((u) => u.code === P.glorfindel);
    assert.ok(glorfindel);
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      25,
    );
    assert.deepEqual(s.discard, [P.glorfindel, "01020"]);
    await shot(p, "glorfindel-normal-discard-payment", width);
    await next(p);
    await p
      .getByRole("button", { name: "Commit Glorfindel", exact: true })
      .click();
    await next(p);
    await settle(p);
    assert.equal(get(await saved(p), glorfindel.id).exhausted, true);
    await act(p, glorfindel.id, P.glorfindel);
    await shot(p, "glorfindel-physical-ready-cost", width);
    await resume(p);
    await choose(p, readyCost.id);
    s = await settle(p);
    assert.equal(get(s, glorfindel.id).exhausted, false);
    assert.ok(s.discard.includes("01021"));
    await shot(p, "glorfindel-once-phase-ready-result", width);

    // Caregiver's real paid ally heals another player without exhausting itself.
    s = fixture(2);
    const caregiver = hand(s, P.caregiver),
      healingCost = hand(s, "01020");
    remote = seatView(s, 1).heroes[0];
    remote.damage = 2;
    await load(p, s);
    await play(p, caregiver.id);
    await settle(p);
    await act(p, caregiver.id, P.caregiver);
    await shot(p, "caregiver-remote-healing-target", width);
    await choose(p, remote.id);
    await shot(p, "caregiver-hand-discard-cost", width);
    await resume(p);
    await choose(p, healingCost.id);
    s = await settle(p);
    assert.equal(get(s, remote.id).damage, 1);
    assert.equal(get(s, caregiver.id).exhausted, false);
    assert.ok(s.discard.includes("01020"));
    await shot(p, "caregiver-remote-heal-result", width);

    // Heed's event stays in resolution while the chosen player searches twice.
    s = fixture(2);
    const heed = hand(s, P.heed),
      localPayer = s.heroes[0];
    remote = seatView(s, 1).heroes[0];
    forOwner(s, 1, () => {
      s.deck = ["01021", "01022", "01023", "01024", "01025", "01027"];
    });
    await load(p, s);
    await play(p, heed.id);
    await choose(p, "player-1");
    s = await saved(p);
    assert.ok(!s.choice.options.some((o) => o.code === "01027"));
    await shot(p, "heed-selected-player-top-five", width);
    await choose(p, "deck-0");
    await choose(p, "pay");
    await choose(p, localPayer.id);
    await shot(p, "heed-shared-payment-reservation", width);
    await resume(p);
    await choose(p, remote.id);
    await choose(p, localPayer.id);
    s = await saved(p);
    assert.ok(s.choice.options.some((o) => o.code === "01027"));
    assert.ok(!seatView(s, 0).discard.includes(P.heed));
    await shot(p, "heed-entire-deck-second-search", width);
    await resume(p);
    await choose(p, s.choice.options.find((o) => o.code === "01027").id);
    s = await settle(p);
    assert.deepEqual(
      seatView(s, 1).hand.map((u) => u.code),
      ["01021", "01027"],
    );
    assert.ok(seatView(s, 0).discard.includes(P.heed));
    await shot(p, "heed-two-owned-cards-result", width);

    // A real queued damage effect destroys the Warrior; Last Stand uses printed attack.
    s = fixture();
    const warrior = ally(s, P.guardian),
      lastStand = hand(s, P.lastStand),
      attacker = make(s, "01082");
    s.phase = "defense";
    warrior.exhausted = true;
    warrior.tempAttack = 9;
    s.engaged.push(attacker);
    s.combat = { enemyId: attacker.id, defenderId: warrior.id, attackBonus: 0 };
    s.queue = [
      fx("combatDamage", { target: warrior.id, source: attacker.id, value: 3 }),
    ];
    reviewQueuedAttack(s, "Warrior defender receives combat damage");
    await load(p, s);
    await shot(p, "last-stand-destroyed-warrior-response", width);
    await resume(p);
    await choose(p, lastStand.id);
    s = await settle(p);
    assert.equal(get(s, attacker.id).damage, 2);
    assert.ok(!get(s, warrior.id));
    assert.ok(s.discard.includes(P.lastStand));
    await shot(p, "last-stand-printed-attack-result", width);

    // Shadow resolution, split resource cost and the following attack use real controls.
    s = fixture(2);
    const defender = ally(s, P.guardian),
      tides = hand(s, P.tides),
      enemy = make(s, "01082");
    s.phase = "defense";
    defender.exhausted = true;
    s.engaged.push(enemy);
    s.combat = { enemyId: enemy.id, defenderId: defender.id, attackBonus: 0 };
    s.queue = [fx("shadowEffect", { code: "01085" })];
    remote = seatView(s, 1).heroes[0];
    reviewQueuedAttack(s, "Resolve the attacking enemy’s shadow");
    await load(p, s);
    await shot(p, "tides-actual-shadow-response", width);
    await choose(p, tides.id);
    await choose(p, defender.id);
    await choose(p, "pay");
    await choose(p, s.heroes[0].id);
    await shot(p, "tides-shared-tactics-allocation", width);
    await resume(p);
    await choose(p, remote.id);
    s = await settle(p);
    assert.equal(s.combat.defenseBonuses[defender.id], 3);
    assert.equal(get(s, defender.id).exhausted, false);
    assert.equal(stormcallerAttackBonus(s, get(s, defender.id)), 3);
    await shot(p, "tides-one-attack-defense-ready-result", width);
    // Resume the same physical characters in the attack window; no rule function resolves it in Node.
    s.phase = "attack";
    s.combat = null;
    get(s, enemy.id).defended = true;
    selectSeat(s, 0);
    s.table.turn = 0;
    await load(p, s);
    await attack(p, enemy.id, defender.id, 5);
    s = await settle(p);
    assert.equal(get(s, enemy.id).damage, 2);
    assert.equal(stormcallerAttackBonus(s, get(s, defender.id)), 0);
    await shot(p, "tides-next-attack-bonus-consumed", width);

    // Azain's killing attack exposes the any-player Response and its real remote resource cost.
    s = fixture(2);
    s.phase = "attack";
    const azain = ally(s, P.azain),
      victim = make(s, "01089"),
      splash = make(s, "01089");
    s.engaged.push(victim);
    s.staging.push(splash);
    remote = seatView(s, 1).heroes[0];
    await load(p, s);
    await attack(p, victim.id, azain.id, 3);
    await shot(p, "azain-any-player-killing-response", width);
    await resume(p);
    await choose(p, "player-1");
    await choose(p, remote.id);
    await shot(p, "azain-matching-trait-target", width);
    await resume(p);
    await choose(p, splash.id);
    s = await settle(p);
    assert.equal(get(s, splash.id).damage, 2);
    assert.equal(get(s, remote.id).resources, 9);
    assert.ok(!get(s, victim.id));
    await shot(p, "azain-remote-payer-result", width);

    // Vanish changes the effective rule read while the saved dial remains physical.
    s = fixture();
    s.heroes.pop();
    s.startingHeroes = s.heroes.map((u) => u.code);
    s.threat = 37;
    const vanish = hand(s, P.vanish);
    await load(p, s);
    await play(p, vanish.id);
    s = await settle(p);
    assert.equal(s.threat, 37);
    assert.equal(stormcallerEffectiveThreat(s), 20);
    await shot(p, "vanish-physical-dial-treated-threat", width);
    await resume(p);
    await next(p);
    s = await settle(p);
    assert.equal(s.threat, 37);
    assert.equal(stormcallerEffectiveThreat(s), 37);
    await shot(p, "vanish-phase-expiry-result", width);

    const faces = STORMCALLER_PLAYER_CARDS.map(imageUrl);
    const broken = await p.evaluate(
      async (urls) =>
        (
          await Promise.all(
            urls.map(async (src) => {
              const image = new Image();
              image.src = src;
              try {
                await image.decode();
                return null;
              } catch {
                return src;
              }
            }),
          )
        ).filter(Boolean),
      faces,
    );
    assert.deepEqual(broken, []);
    assert.equal(card(P.vanish).name, "Vanish from Sight");
    checks.push(`${faces.length} original player faces decoded @ ${width}`);
    await c.close();
  }
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    smoke,
  });
  console.log(
    `Stormcaller players: ${screenshots.length} actual browser checkpoints passed (${url}).`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        url,
        errors,
        screenshots,
        failure: String(error),
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
