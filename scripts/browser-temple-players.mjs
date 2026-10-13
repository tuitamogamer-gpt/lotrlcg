import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  templePlayerFixture as fixture,
  templePlayerHand as hand,
  templePlayerAlly as ally,
  templePlayerAttach as attach,
} from "../tests/temple-player-fixtures.ts";
import {
  TEMPLE_PLAYER as P,
  TEMPLE_PLAYER_CARDS,
} from "../src/game/temple-player-support.ts";
import { templePlayerAbilityLabel } from "../src/game/temple-player.ts";
import { card, plain, imageUrl } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import {
  allHeroes,
  ownerOf,
  selectSeat,
  seatView,
  syncSeat,
  forOwner,
} from "../src/game/table.ts";
import { validateSave } from "../src/game/engine.ts";
import { angmarSyncSwordThain } from "../src/game/angmar-player.ts";
import { THARBAD } from "../src/game/tharbad-support.ts";
import { TEMPLE as T } from "../src/game/temple-support.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, resume, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const dir = "output/temple-players";
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
  assert.ok(validateSave(s), "valid Temple player fixture");
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
async function defend(p, enemyId, defenderId) {
  await boardCard(p, enemyId)
    .getByRole("button", { name: "Defend", exact: true })
    .click();
  const defender = get(await saved(p), defenderId);
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(defender.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function commit(p, units) {
  for (const u of units)
    await p
      .getByRole("button", { name: `Commit ${card(u.code).name}`, exact: true })
      .click();
  await p
    .getByRole("button", { name: "Commit & reveal", exact: true })
    .last()
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
    // Passive bonuses are visible on effective heroes, including remote heroes with gained icons.
    let s = fixture(2),
      remote = seatView(s, 1).heroes[0];
    attach(s, remote, "10059");
    remote.phaseResourceIcons = ["spirit", "tactics", "leadership"];
    await load(p, s);
    s = await saved(p);
    assert.equal(
      stats(s, get(s, remote.id)).will,
      card(remote.code).willpower + 1,
    );
    await shot(p, "elfhelm-mounted-remote-hero", width);
    s = fixture();
    const transformed = ally(s, P.ceorl);
    attach(s, transformed, "10149");
    attach(s, transformed, "10059");
    angmarSyncSwordThain(s);
    await load(p, s);
    s = await saved(p);
    assert.ok(allHeroes(s).some((u) => u.id === transformed.id));
    assert.equal(stats(s, get(s, transformed.id)).defense, 1);
    await shot(p, "elfhelm-mounted-sword-thain", width);

    // Actual normal attachment PLAY uses the printed Leadership OR Sentinel restriction.
    s = fixture(2);
    remote = seatView(s, 1).heroes[0];
    remote.phaseResourceIcons = ["leadership"];
    const destrier = hand(s, P.destrier);
    await load(p, s);
    await play(p, destrier.id, remote.id);
    s = await settle(p);
    assert.ok(get(s, remote.id).attachments.some((a) => a.id === destrier.id));
    await resume(p);
    await shot(p, "destrier-remote-paid-attachment", width);

    // Any-player Ceorl Action spends from the active payer and preserves physical ownership.
    s = fixture(2);
    const ceorl = ally(s, P.ceorl);
    ceorl.exhausted = true;
    selectSeat(s, 1);
    s.table.turn = 1;
    const payer = s.heroes[0];
    await load(p, s);
    await p
      .getByRole("button", {
        name: `Ceorl · ${templePlayerAbilityLabel(P.ceorl)}`,
        exact: true,
      })
      .click();
    await reviewedState(p);
    await shot(p, "ceorl-any-player-spirit-cost", width);
    await resume(p);
    await choose(p, payer.id);
    await shot(p, "ceorl-ready-control-transfer", width);
    await resume(p);
    await choose(p, "player-1");
    s = await settle(p);
    assert.equal(get(s, payer.id).resources, 9);
    assert.equal(ownerOf(s, get(s, ceorl.id)), 1);
    assert.equal(get(s, ceorl.id).owner, 0);
    assert.equal(get(s, ceorl.id).exhausted, false);
    const usedCeorl = boardCard(p, ceorl.id).locator(".abilities > button");
    assert.equal(await usedCeorl.count(), 1);
    assert.equal(await usedCeorl.isDisabled(), true);
    assert.equal(await usedCeorl.isVisible(), false);
    await shot(p, "ceorl-physical-limit-after-transfer", width);

    // Wrath's lasting blanking keeps Traits and ends on the actual phase boundary.
    s = fixture();
    s.heroes.push(make(s, "04001"));
    const enemy = make(s, "01089"),
      wrath = hand(s, P.wrath);
    s.staging = [enemy];
    await load(p, s);
    await play(p, wrath.id, enemy.id);
    s = await settle(p);
    assert.equal(get(s, enemy.id).blanked, true);
    assert.equal(get(s, enemy.id).printedTraitsPreserved, true);
    await resume(p);
    await shot(p, "wrath-blank-except-traits", width);
    await next(p);
    s = await settle(p);
    assert.equal(get(s, enemy.id).blanked, undefined);
    await shot(p, "wrath-phase-expiry", width);

    // Both Outrider responses and Scouting Party originate in actual COMMIT controls.
    s = fixture();
    s.phase = "quest";
    const out = ally(s, P.outrider),
      scout = ally(s, P.ceorl),
      loc = make(s, "01099"),
      party = hand(s, P.party);
    s.staging = [loc];
    await load(p, s);
    await commit(p, [out, scout]);
    s = await saved(p);
    assert.match(s.choice.title, /Outrider/);
    await shot(p, "outrider-actual-commit-response", width);
    await resume(p);
    await choose(p, loc.id);
    s = await saved(p);
    assert.equal(get(s, loc.id).progress, 1);
    assert.equal(stats(s, get(s, out.id)).will, 2);
    assert.match(s.choice.title, /Scouting Party/);
    await shot(p, "scouting-party-all-scout-company", width);
    await resume(p);
    await choose(p, party.id);
    s = await settle(p);
    assert.equal(stats(s, get(s, out.id)).will, 4);
    assert.equal(stats(s, get(s, scout.id)).will, 3);
    assert.ok(s.discard.includes(P.party));
    await shot(p, "scouting-party-paid-physical-event", width);
    s = fixture();
    s.phase = "quest";
    const blockedOut = ally(s, P.outrider),
      blocked = make(s, THARBAD.streets);
    s.staging = [blocked];
    await load(p, s);
    await commit(p, [blockedOut]);
    await choose(p, blocked.id);
    s = await settle(p);
    assert.equal(get(s, blocked.id).progress, 0);
    assert.equal(stats(s, get(s, blockedOut.id)).will, 2);
    await shot(p, "outrider-prevented-progress-bonus", width);
    s = fixture();
    s.phase = "quest";
    const explorer = ally(s, P.outrider),
      readyLoc = make(s, "01099");
    readyLoc.progress = 2;
    s.staging = [readyLoc];
    await load(p, s);
    await commit(p, [explorer]);
    await choose(p, readyLoc.id);
    s = await settle(p);
    assert.ok(!get(s, readyLoc.id));
    assert.equal(get(s, explorer.id).tempWill, undefined);
    await shot(p, "outrider-real-location-exploration", width);

    // Nets remains unattached through current enemies and an immune future entrant.
    s = fixture();
    const old = make(s, "01089"),
      trap = hand(s, P.nets);
    s.staging = [old];
    s.encounterDeck = [T.guardian, "01089", "01099"];
    await load(p, s);
    await play(p, trap.id);
    s = await settle(p);
    assert.ok(s.staging.some((u) => u.id === trap.id));
    assert.equal(get(s, old.id).attachments.length, 0);
    await shot(p, "nets-unattached-no-retroactive-host", width);
    await next(p);
    s = await settle(p);
    await commit(p, []);
    s = await settle(p);
    assert.ok(s.staging.some((u) => u.id === trap.id));
    assert.equal(
      s.staging.find((u) => u.code === T.guardian).attachments.length,
      0,
    );
    await shot(p, "nets-skips-immune-guardian", width);
    // Next actual reveal comes from a second round commitment, retaining the same Trap.
    s.phase = "quest";
    s.queue = [];
    s.choice = null;
    s.flow = { nextId: 1, pending: null, history: [], mode: "all" };
    s.committedIds = [];
    await load(p, s);
    await commit(p, []);
    s = await settle(p);
    const caught = s.staging.find((u) =>
      u.attachments.some((a) => a.id === trap.id),
    );
    assert.ok(caught);
    assert.equal(stats(s, caught).attack, 0);
    assert.ok(!s.staging.some((u) => u.id === trap.id));
    await resume(p);
    await shot(p, "nets-next-eligible-physical-host", width);

    // Arrows is offered only after all hot-seat engagement checks finish.
    s = fixture(2);
    s.phase = "encounter";
    forOwner(s, 0, () => (s.threat = 10));
    forOwner(s, 1, () => (s.threat = 10));
    const waiting = make(s, "01083"),
      arrows = hand(s, P.arrows, 1);
    s.staging = [waiting];
    await load(p, s);
    await next(p);
    s = await saved(p);
    if (!s.choice) await next(p);
    s = await saved(p);
    assert.match(s.choice.title, /After engagement checks/);
    await shot(p, "arrows-after-all-engagement-checks", width);
    await resume(p);
    await choose(p, arrows.id);
    s = await saved(p);
    assert.equal(get(s, waiting.id).damage, 1);
    await shot(p, "arrows-initial-staging-damage", width);
    await resume(p);
    await choose(p, "pay");
    s = await saved(p);
    const ownTactics = seatView(s, 0).heroes[2].id,
      remoteTactics = seatView(s, 1).heroes[1].id;
    await choose(p, ownTactics);
    await choose(p, remoteTactics);
    await resume(p);
    await choose(p, remoteTactics);
    s = await settle(p);
    assert.ok(!get(s, waiting.id));
    assert.equal(get(s, remoteTactics).resources, 8);
    await shot(p, "arrows-group-tactics-payment", width);

    // Real DEFEND produces the optional Destrier Response and preserves hidden shadows.
    s = fixture();
    s.phase = "defense";
    const hero = s.heroes[2],
      mount = attach(s, hero, P.destrier),
      attacker = make(s, "01089"),
      other = make(s, "01083");
    attacker.shadows = ["01104"];
    attacker.faceupShadows = [false];
    other.shadows = ["01099"];
    other.faceupShadows = [false];
    s.engaged = [attacker, other];
    await load(p, s);
    await defend(p, attacker.id, hero.id);
    s = await saved(p);
    assert.match(s.choice.title, /Armored Destrier/);
    await shot(p, "destrier-after-actual-defense", width);
    await resume(p);
    await choose(p, "ready");
    s = await saved(p);
    assert.equal(get(s, hero.id).exhausted, false);
    assert.equal(
      get(s, hero.id).attachments.find((a) => a.id === mount.id).exhausted,
      true,
    );
    assert.equal(s.choice.options[0].code, undefined);
    assert.equal(
      await p
        .getByRole("dialog")
        .locator('img[data-card-code="01099"]')
        .count(),
      0,
      "facedown shadow identity has no inspectable DOM artwork",
    );
    await shot(p, "destrier-hidden-other-shadow-choice", width);
    await resume(p);
    await choose(p, `${other.id}-0`);
    s = await settle(p);
    assert.deepEqual(get(s, other.id).shadows, []);
    await shot(p, "destrier-shadow-discard-result", width);

    // A remote gained Leadership pool pays actual Deorwine just-triggered shadow cancellation.
    s = fixture(2);
    s.phase = "defense";
    const deorwine = ally(s, P.deorwine),
      orc = make(s, "01089"),
      leader = seatView(s, 1).heroes[0];
    leader.phaseResourceIcons = ["leadership"];
    orc.shadows = ["01089"];
    orc.faceupShadows = [false];
    s.engaged = [orc];
    await load(p, s);
    await defend(p, orc.id, deorwine.id);
    s = await saved(p);
    assert.ok(
      s.choice.options.some((o) => o.id === `temple-deorwine-${leader.id}`),
    );
    await shot(p, "deorwine-any-player-shadow-response", width);
    await resume(p);
    await choose(p, `temple-deorwine-${leader.id}`);
    s = await settle(p);
    assert.equal(get(s, leader.id).resources, 9);
    assert.equal(get(s, deorwine.id).damage, 0);
    await shot(p, "deorwine-canceled-shadow-paid", width);

    // King Under the Mountain discards the real remaining deck card; drawing Miner is negative.
    s = fixture();
    const kingHero = s.heroes[2];
    attach(s, kingHero, "132018");
    s.deck = ["01020", P.miner, "01021"];
    await load(p, s);
    const currentAbilities = (
        await import("../src/game/engine.ts")
      ).availableAbilities(s, kingHero),
      kingAction = currentAbilities.find(
        (a) => a.id === kingHero.attachments[0].id,
      );
    await boardCard(p, kingHero.id)
      .getByRole("button", { name: kingAction.label, exact: true })
      .click();
    await reviewedState(p);
    await choose(p, "keep-0");
    s = await saved(p);
    assert.match(s.choice.title, /Ered Luin Miner/);
    await shot(p, "miner-actual-deck-discard-response", width);
    await resume(p);
    await choose(p, "enter");
    s = await settle(p);
    assert.equal(s.allies.filter((u) => u.code === P.miner).length, 1);
    assert.ok(!s.discard.includes(P.miner));
    assert.deepEqual(s.deck, ["01021"]);
    await shot(p, "miner-physical-put-into-play", width);

    // Every promoted original player face is inspected with exact text and cached decoded bytes.
    s = fixture();
    for (const definition of TEMPLE_PLAYER_CARDS)
      if (definition.type_code !== "hero") hand(s, definition.code);
    await load(p, s);
    for (const definition of TEMPLE_PLAYER_CARDS) {
      if (definition.type_code === "hero")
        await p
          .getByRole("button", {
            name: `Inspect ${definition.name}`,
            exact: true,
          })
          .click();
      else {
        const h = (await saved(p)).hand.find((u) => u.code === definition.code);
        await boardCard(p, h.id).locator(".hand-art").click();
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
    108,
    "all36 checkpoints at three widths are required",
  );
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    smoke: false,
  });
  console.log(
    `Temple players: ${screenshots.length} checkpoints passed (${url}).`,
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
