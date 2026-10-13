import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  cobasPlayerFixture as fixture,
  cobasPlayerHand as hand,
  cobasPlayerAlly as ally,
  cobasPlayerAttach as attach,
} from "../tests/cobas-player-fixtures.ts";
import {
  COBAS_PLAYER as P,
  COBAS_PLAYER_CARDS,
} from "../src/game/cobas-player-support.ts";
import { availableAbilities } from "../src/game/engine.ts";
import { card, plain, imageUrl } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import { forOwner, seatView, syncSeat, selectSeat } from "../src/game/table.ts";
import { validateSave } from "../src/game/engine.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, resume, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.SMOKE === "1";
const dir = smoke ? "output/cobas-players-smoke" : "output/cobas-players";
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
  assert.ok(validateSave(s), "valid Cobas Haven player fixture");
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
async function ability(p, unit, attachmentId) {
  const s = await saved(p),
    u = get(s, unit.id);
  const selected = availableAbilities(s, u).find(
    (a) => a.id === attachmentId && !a.disabled,
  );
  assert.ok(selected, "enabled physical card ability");
  await boardCard(p, unit.id)
    .getByRole("button", { name: selected.label, exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function attack(p, enemy, hero, power) {
  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Attack", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(hero.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: `Attack · ${power} power`, exact: true })
    .click();
  await reviewedState(p);
}
async function defend(p, enemy, hero) {
  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Defend", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(hero.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
    .click();
  await reviewedState(p);
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
  for (const [width, height] of smoke
    ? [[1280, 900]]
    : [
        [1280, 900],
        [390, 844],
        [320, 750],
      ]) {
    const { c, p } = await context(browser, width, height, errors, entries);
    activePage = p;

    let s = fixture();
    s.phase = "attack";
    const naasiyah = s.heroes[0],
      orc = make(s, "01089");
    s.engaged = [orc];
    await load(p, s);
    await attack(p, orc, naasiyah, 2);
    assert.match((await saved(p)).choice.title, /Na'asiyah/);
    await shot(p, "naasiyah-actual-attack-window", width);
    await resume(p);
    await choose(p, "attack");
    s = await saved(p);
    assert.equal(stats(s, get(s, naasiyah.id)).attack, 4);
    assert.equal(get(s, naasiyah.id).resources, 9);
    await shot(p, "naasiyah-paid-attack-boost", width);
    await choose(p, "continue");
    s = await settle(p);
    assert.ok(!get(s, orc.id));
    assert.equal(stats(s, get(s, naasiyah.id)).attack, 2);
    await shot(p, "naasiyah-attack-finished-expiry", width);

    s = fixture();
    s.phase = "defense";
    const defender = s.heroes[0],
      troll = make(s, "01082");
    s.engaged = [troll];
    troll.shadows = [];
    await load(p, s);
    await defend(p, troll, defender);
    await shot(p, "naasiyah-actual-defense-window", width);
    await resume(p);
    await choose(p, "defense");
    await choose(p, "continue");
    s = await settle(p);
    assert.equal(get(s, defender.id).damage, 2);
    assert.equal(stats(s, get(s, defender.id)).defense, 2);
    await shot(p, "naasiyah-defense-payment-expiry", width);

    s = fixture();
    const blockedAlly = hand(s, P.veteran);
    for (const hero of s.heroes.slice(1)) hero.resources = 0;
    await load(p, s);
    assert.equal(
      await boardCard(p, blockedAlly.id)
        .getByRole("button", { name: "Play card", exact: true })
        .count(),
      0,
    );
    await shot(p, "naasiyah-resources-cannot-pay-allies", width);

    s = fixture(2);
    const runeBearer = s.heroes[1],
      signalHero = s.heroes[2],
      rune = hand(s, P.rune),
      signal = hand(s, "02002");
    await load(p, s);
    await play(p, rune.id, runeBearer.id);
    await settle(p);
    await play(p, signal.id, signalHero.id);
    assert.match((await saved(p)).choice.title, /Rune-master/);
    await shot(p, "rune-actual-signal-attachment", width);
    await resume(p);
    const signalBefore = get(await saved(p), signalHero.id).resources;
    await choose(p, "use");
    s = await settle(p);
    assert.equal(get(s, signalHero.id).resources, signalBefore + 1);
    assert.equal(
      get(s, runeBearer.id).attachments.find((a) => a.id === rune.id).exhausted,
      true,
    );
    await shot(p, "rune-optional-recipient-resource", width);

    s = fixture(2);
    const moveHost = s.heroes[1],
      moveTarget = seatView(s, 1).heroes[0],
      moveRune = attach(s, moveHost, P.rune),
      moveSignal = attach(s, moveHost, "02002");
    await load(p, s);
    await ability(p, moveHost, moveSignal.id);
    await shot(p, "signal-physical-transfer-target", width);
    await resume(p);
    await choose(p, moveTarget.id);
    await choose(p, "use");
    s = await settle(p);
    assert.equal(get(s, moveTarget.id).resources, 11);
    assert.equal(
      get(s, moveTarget.id).attachments.find((a) => a.id === moveSignal.id)
        .owner,
      0,
    );
    assert.equal(
      get(s, moveHost.id).attachments.find((a) => a.id === moveRune.id)
        .exhausted,
      true,
    );
    await shot(p, "rune-transfer-response-and-ownership", width);

    s = fixture();
    s.phase = "defense";
    const noble = s.heroes[1],
      attacker = make(s, "01089"),
      terrible = hand(s, P.terrible);
    attacker.shadows = ["01090"];
    s.engaged = [attacker];
    await load(p, s);
    await defend(p, attacker, noble);
    assert.match((await saved(p)).choice.title, /Terrible to Behold/);
    await shot(p, "terrible-actual-noble-defense-response", width);
    await resume(p);
    await choose(p, terrible.id);
    s = await settle(p);
    assert.ok(s.staging.some((u) => u.id === attacker.id));
    assert.equal(s.engaged.length, 0);
    assert.equal(get(s, noble.id).damage, 0);
    assert.deepEqual(get(s, attacker.id).shadows, []);
    assert.ok(s.discard.includes(P.terrible));
    await shot(p, "terrible-return-then-attack-cancel", width);

    s = fixture();
    const veteran = hand(s, P.veteran);
    s.discard = [P.veteran, P.veteran];
    await load(p, s);
    await play(p, veteran.id);
    s = await settle(p);
    assert.equal(stats(s, get(s, veteran.id)).attack, 3);
    assert.equal(stats(s, get(s, veteran.id)).defense, 3);
    await shot(p, "veteran-real-play-discard-statistics", width);

    s = fixture();
    s.phase = "defense";
    const victim = s.heroes[1],
      guardBearer = s.heroes[2],
      guard = attach(s, guardBearer, P.guard),
      brute = make(s, "01082");
    brute.shadows = [];
    s.engaged = [brute];
    await load(p, s);
    await defend(p, brute, victim);
    assert.match((await saved(p)).choice.title, /Vigilant Guard/);
    await shot(p, "guard-actual-combat-assignment", width);
    await resume(p);
    await choose(p, guard.id);
    s = await settle(p);
    assert.equal(get(s, victim.id).damage, 3);
    assert.equal(get(s, guardBearer.id).damage, 1);
    assert.equal(stats(s, get(s, guardBearer.id)).health, 7);
    assert.ok(!s.used.some((k) => k.startsWith("cobas-guard:")));
    await shot(p, "guard-one-point-redirect-and-cleanup", width);

    s = fixture(2);
    s.phase = "attack";
    const knifeHero = s.heroes[1],
      knifeEnemy = make(s, "01089"),
      lore = seatView(s, 1).heroes[0],
      knife = hand(s, P.knife);
    knifeHero.tempAttack = 5;
    s.engaged = [knifeEnemy];
    await load(p, s);
    await play(p, knife.id);
    await choose(p, "player-0");
    await shot(p, "knife-work-shared-lore-payment", width);
    await resume(p);
    await choose(p, `pay-${knifeHero.id}-${lore.id}`);
    s = await settle(p);
    const handBefore = s.hand.length;
    assert.equal(stats(s, get(s, knifeEnemy.id)).defense, 0);
    assert.equal(get(s, lore.id).resources, 9);
    await attack(p, knifeEnemy, knifeHero, 8);
    s = await settle(p);
    assert.ok(!get(s, knifeEnemy.id));
    assert.equal(s.hand.length, handBefore + 1);
    await shot(p, "knife-work-chosen-player-real-kill-draw", width);

    s = fixture();
    const linhir = hand(s, P.linhir),
      linhirHero = s.heroes[1];
    for (const h of s.heroes) h.resources = h.id === linhirHero.id ? 10 : 0;
    await load(p, s);
    await play(p, linhir.id);
    assert.match((await saved(p)).choice.title, /Linhir/);
    await shot(p, "linhir-single-pool-play-response", width);
    await resume(p);
    await choose(p, "use");
    await settle(p);
    await next(p);
    await commit(p, [linhirHero, linhir]);
    s = await settle(p);
    assert.equal(get(s, linhir.id).committed, true);
    assert.equal(get(s, linhir.id).exhausted, false);
    assert.equal(get(s, linhirHero.id).exhausted, false);
    assert.equal(get(s, linhirHero.id).resources, 7);
    await shot(p, "linhir-actual-ready-commitment", width);

    s = fixture();
    const frodo = {
      ...make(s, "02025"),
      resources: 10,
      phaseResourceIcons: ["leadership", "tactics", "spirit", "lore"],
    };
    s.heroes[0] = frodo;
    s.startingHeroes = s.heroes.map((u) => u.code);
    const windfola = hand(s, P.windfola),
      elevenses = hand(s, "12036");
    await load(p, s);
    await play(p, windfola.id, frodo.id);
    await settle(p);
    await next(p);
    await commit(p, [frodo]);
    await settle(p);
    await play(p, elevenses.id);
    await choose(p, frodo.id);
    await choose(p, "finish");
    assert.match((await saved(p)).choice.title, /Windfola/);
    await shot(p, "windfola-actual-quest-removal", width);
    await resume(p);
    await choose(p, "use");
    s = await settle(p);
    assert.equal(get(s, frodo.id).committed, true);
    assert.equal(
      get(s, frodo.id).attachments.find((a) => a.id === windfola.id).exhausted,
      true,
    );
    assert.equal(stats(s, get(s, frodo.id)).will, 3);
    await shot(p, "windfola-response-recommitment", width);

    s = fixture(2);
    const ioreth = ally(s, P.ioreth),
      remotePatient = seatView(s, 1).heroes[0];
    remotePatient.damage = 2;
    selectSeat(s, 1);
    s.table.turn = 1;
    await load(p, s);
    await p
      .getByRole("button", {
        name: "Ioreth · Exhaust · spend Lore to heal 3",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await shot(p, "ioreth-any-player-lore-cost", width);
    await resume(p);
    await choose(p, remotePatient.id);
    await choose(p, remotePatient.id);
    s = await settle(p);
    assert.equal(get(s, ioreth.id).exhausted, true);
    assert.equal(get(s, remotePatient.id).resources, 9);
    assert.equal(get(s, remotePatient.id).damage, 0);
    await shot(p, "ioreth-remote-player-payment-and-heal", width);

    s = fixture(2);
    s.phase = "refresh";
    const houseHealer = ally(s, P.ioreth),
      housePayer = s.heroes[1],
      houses = hand(s, P.houses);
    for (const h of s.heroes) h.resources = h.id === housePayer.id ? 4 : 0;
    forOwner(s, 1, () => {
      s.discard = ["01002"];
      s.fallenThreat = 8;
    });
    await load(p, s);
    await play(p, houses.id, "discard-1-0");
    assert.match((await saved(p)).choice.title, /Houses of Healing/);
    assert.ok(!(await saved(p)).choice.options.some((o) => o.id === "pay"));
    await shot(p, "houses-discount-enables-real-play", width);
    await resume(p);
    await choose(p, houseHealer.id);
    assert.equal(get(await saved(p), houseHealer.id).exhausted, false);
    await shot(p, "houses-chosen-exhaustion-cost", width);
    await resume(p);
    await choose(p, "pay");
    s = await settle(p);
    assert.equal(get(s, houseHealer.id).exhausted, true);
    assert.equal(get(s, housePayer.id).resources, 0);
    const revived = seatView(s, 1).heroes.find((u) => u.code === "01002");
    assert.equal(revived.damage, 1);
    assert.equal(revived.owner, 1);
    assert.equal(seatView(s, 1).fallenThreat, 0);
    assert.ok(s.discard.includes(P.houses));
    await shot(p, "houses-paid-discount-remote-revival", width);

    s = fixture(2);
    const justice = hand(s, P.justice),
      justiceHeroes = s.heroes.map((u) => u.id);
    await load(p, s);
    await play(p, justice.id);
    s = await settle(p);
    assert.deepEqual(s.victoryCards, [P.justice]);
    assert.equal(s.hand.length, 3);
    assert.ok(justiceHeroes.every((id) => get(s, id).resources === 13));
    await shot(p, "justice-physical-victory-and-economy", width);
    await resume(p);
    // Keep the exact browser-produced cards/receipt and isolate the real refresh-end control.
    s = await saved(p);
    s.phase = "refresh";
    s.queue = [];
    s.choice = null;
    await load(p, s);
    await next(p);
    s = await settle(p);
    assert.equal(s.table.seats[0].eliminated, true);
    assert.equal(s.table.seats[1].eliminated, false);
    assert.equal(s.status, "playing");
    await shot(p, "justice-real-round-end-elimination", width);

    s = fixture();
    for (const definition of COBAS_PLAYER_CARDS)
      if (definition.type_code !== "hero") hand(s, definition.code);
    await load(p, s);
    for (const definition of COBAS_PLAYER_CARDS) {
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
    smoke ? 39 : 117,
    "all requested checkpoints are required",
  );
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    smoke,
    sourceScriptSha256,
  });
  console.log(
    `Cobas Haven players: ${screenshots.length} checkpoints passed (${url}).`,
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
