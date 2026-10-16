import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import {
  batch4PlayerFixture as fixture,
  batch4PlayerAlly as ally,
  batch4PlayerHand as hand,
  batch4PlayerAttach as attach,
} from "../tests/batch4-player-fixtures.ts";
import {
  BATCH4_PLAYER as P,
  BATCH4_PLAYER_CARDS,
} from "../src/game/batch4-player-support.ts";
import { card, plain, imageUrl } from "../src/game/cards.ts";
import { get, make, stats, fx, prepend } from "../src/game/core.ts";
import { availableAbilities, validateSave } from "../src/game/engine.ts";
import { syncSeat, forOwner, seatView } from "../src/game/table.ts";
import { flush } from "../src/game/effects.ts";
import { progressLocation } from "../src/game/board.ts";
import { WILDS_PLAYER_CARDS } from "../src/game/wilds-player-support.ts";
import { wildsPlayerBrowserCases } from "../tests/wilds-player-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, resume, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.SMOKE === "1",
  smokeWidth = Number(process.env.PLAYER_WIDTH ?? 1280),
  dir = smoke ? "output/batch4-players-smoke" : "output/batch4-players";
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
  assert.ok(validateSave(s), "valid original Batch four player fixture");
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
async function ability(p, id, attachmentId) {
  const s = await saved(p),
    u = get(s, id),
    a = availableAbilities(s, u).find(
      (a) => a.id === attachmentId && !a.disabled,
    );
  assert.ok(a, "enabled physical ability");
  let button = p.getByRole("button", { name: a.label, exact: true });
  if (!(await button.count()))
    button = p.getByRole("button", {
      name: `${card(u.code).name} · ${a.label}`,
      exact: true,
    });
  await button.click();
  await reviewedState(p);
  return saved(p);
}
async function commit(p, u) {
  await p
    .getByRole("button", { name: `Commit ${card(u.code).name}`, exact: true })
    .click();
  await p
    .getByRole("button", { name: /^(Commit & reveal|Commit this fellowship)$/ })
    .last()
    .click();
  await reviewedState(p);
  return saved(p);
}
async function attack(p, e, u) {
  await boardCard(p, e.id)
    .getByRole("button", { name: "Attack", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(u.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", {
      name: `Attack · ${stats(await saved(p), u).attack} power`,
      exact: true,
    })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function defend(p, e, u) {
  await boardCard(p, e.id)
    .getByRole("button", { name: "Defend", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(u.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
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
  const shadow = p.locator(".card-detail-primary .shadow-text");
  if (c.shadow) assert.equal(await shadow.textContent(), plain(c.shadow));
  else assert.equal(await shadow.count(), 0);
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
  const response = await p.request.get(new URL(imageUrl(c), url).href);
  assert.equal(response.status(), 200);
  const actual = createHash("sha256")
      .update(await response.body())
      .digest("hex"),
    expected = createHash("sha256")
      .update(await fs.readFile(`public${imageUrl(c)}`))
      .digest("hex");
  assert.equal(actual, expected, "original cached face bytes");
}
try {
  const allCards = [...BATCH4_PLAYER_CARDS, ...WILDS_PLAYER_CARDS];
  for (const [width, height] of smoke
    ? [[smokeWidth, smokeWidth === 390 ? 844 : smokeWidth === 320 ? 750 : 900]]
    : [
        [1280, 900],
        [390, 844],
        [320, 750],
      ]) {
    const { c, p } = await context(browser, width, height, errors, entries);
    activePage = p;
    let s = fixture(),
      h = s.heroes[0],
      a = hand(s, P.hope);
    await load(p, s);
    s = await play(p, a.id, h.id);
    for (let n = 0; n < 3; n++) s = await ability(p, h.id, a.id);
    assert.equal(get(s, h.id).resources, 7);
    assert.equal(get(s, h.id).tempWill, 3);
    await resume(p);
    await shot(p, "hope-native-three-physical-resource-payments", width);

    s = fixture(2);
    h = s.heroes[0];
    const remote = seatView(s, 1).heroes[0];
    attach(s, h, P.hope);
    attach(s, remote, "02010", 1);
    h.exhausted = remote.exhausted = true;
    a = hand(s, P.burst);
    await load(p, s);
    s = await play(p, a.id);
    assert.equal(get(s, h.id).exhausted, false);
    assert.equal(get(s, remote.id).exhausted, false);
    await shot(p, "burst-native-cross-player-song-ready", width);

    s = fixture();
    const defender = ally(s, P.defender),
      attacking = make(s, "01089");
    s.threat = 40;
    s.engaged = [attacking];
    s.phase = "defense";
    await load(p, s);
    s = await defend(p, attacking, defender);
    assert.match(s.choice.title, /Defender of Cair Andros/);
    await shot(p, "defender-native-valour-declaration", width);
    await resume(p);
    s = await choose(p, "use");
    assert.equal(get(s, attacking.id).damage, 1);
    await shot(p, "defender-native-damage-and-threat-defense", width);

    for (const code of [P.scout, P.noble]) {
      s = fixture();
      h = s.heroes[2];
      a = hand(s, code);
      s.deck = ["01013"];
      await load(p, s);
      s = await play(p, a.id, h.id);
      assert.match(s.choice.title, new RegExp(card(code).name));
      await resume(p);
      s = await choose(p, "use");
      assert.equal(s.hand[0].code, "01013");
      await shot(p, `native-hand-response-${code}`, width);
    }
    s = fixture();
    const rally = make(s, P.rally);
    s.staging = [rally];
    s.phase = "quest";
    s.sideQuestSelections = {
      shared: { id: rally.id, code: rally.code, phase: "quest" },
    };
    s.heroes[0].tempWill = 9;
    s.encounterDeck = ["01099"];
    await load(p, s);
    await commit(p, s.heroes[0]);
    s = await next(p);
    s = await settle(p);
    assert.ok(s.victoryCards.includes(P.rally));
    await shot(p, "rally-native-six-progress-victory", width);

    s = fixture();
    s.heroes[0] = make(s, "01001");
    h = s.heroes[0];
    a = attach(s, h, P.pipe);
    const bottom = hand(s, "01013");
    s.deck = ["01014"];
    await load(p, s);
    s = await ability(p, h.id, a.id);
    await shot(p, "pipe-native-physical-hand-cost-choice", width);
    await resume(p);
    s = await choose(p, bottom.id);
    assert.equal(s.deck.at(-1), "01013");
    assert.equal(s.hand[0].code, "01014");
    await shot(p, "pipe-native-bottom-and-draw", width);

    s = fixture();
    s.heroes[0] = make(s, "01001");
    h = s.heroes[0];
    h.resources = 10;
    h.phaseResourceIcons = ["lore"];
    attach(s, h, P.pipe);
    h.damage = 1;
    s.deck = ["01013"];
    a = hand(s, P.toby);
    await load(p, s);
    s = await play(p, a.id);
    assert.equal(get(s, h.id).damage, 0);
    assert.equal(s.hand[0].code, "01013");
    await shot(p, "old-toby-native-pipe-draw-heal", width);

    s = fixture();
    const refugee = ally(s, P.refugee),
      harad = hand(s, "17006");
    await load(p, s);
    await ability(p, refugee.id);
    s = await play(p, harad.id);
    s = await settle(p);
    assert.ok(get(s, harad.id));
    await shot(p, "refugee-native-next-harad-discount", width);

    s = fixture();
    h = s.heroes[1];
    await load(p, s);
    s = await ability(p, h.id);
    assert.equal(get(s, h.id), undefined);
    assert.equal(s.threat, 13);
    await shot(p, "folco-native-physical-discard-threat-seven", width);

    s = fixture();
    const knight = ally(s, P.daleKnight);
    knight.exhausted = true;
    s.threat = 40;
    await load(p, s);
    s = await ability(p, knight.id);
    await shot(p, "knight-native-resource-or-valour-choice", width);
    await resume(p);
    s = await choose(p, "valour");
    assert.equal(get(s, knight.id).exhausted, false);
    await shot(p, "knight-native-valour-ready", width);

    s = fixture();
    const foe = make(s, "01082");
    s.engaged = [foe];
    s.threat = 40;
    s.phase = "defense";
    a = hand(s, P.fierce);
    await load(p, s);
    s = await play(p, a.id, foe.id);
    assert.match(s.choice.title, /Fierce Defense/);
    await shot(p, "fierce-native-combat-mode-choice", width);
    await resume(p);
    s = await choose(p, "discard");
    assert.equal(get(s, foe.id), undefined);
    await shot(p, "fierce-native-valour-enemy-discard", width);

    s = fixture();
    const survivor = ally(s, P.survivor);
    await load(p, s);
    s = await saved(p);
    assert.equal(stats(s, get(s, survivor.id)).attack, 2);
    await shot(p, "survivor-empty-controller-hand-passive", width);

    s = fixture();
    s.heroes[0] = make(s, "01001");
    s.heroes[1] = make(s, "01011");
    for (const hero of s.heroes) {
      hero.resources = 10;
      hero.phaseResourceIcons = ["spirit"];
    }
    const heirsLocation = make(s, "01099");
    s.staging = [heirsLocation];
    a = hand(s, P.heirs);
    await load(p, s);
    s = await play(p, a.id, heirsLocation.id);
    assert.equal(get(s, heirsLocation.id), undefined);
    assert.equal(s.threat, 23);
    await shot(p, "heirs-native-printed-quest-points-threat-cost", width);

    s = fixture();
    a = hand(s, P.leaflock);
    s.heroes[2].damage = 1;
    await load(p, s);
    s = await play(p, a.id);
    s = await settle(p);
    assert.equal(get(s, a.id).exhausted, true);
    assert.equal(stats(s, get(s, a.id)).will, 1);
    await shot(p, "leaflock-native-exhausted-entry-damaged-ent-bonus", width);

    s = fixture();
    h = s.heroes[0];
    s.victoryCards = [P.rally, "17059", "09014", "17036"];
    a = hand(s, P.blade);
    await load(p, s);
    s = await play(p, a.id, h.id);
    assert.equal(stats(s, get(s, h.id)).attack, 5);
    await shot(p, "legacy-blade-native-sidequest-capped-attack", width);

    s = fixture();
    a = hand(s, P.armory);
    s.deck = ["01013", P.blade, ...Array(8).fill("01013"), "01039"];
    await load(p, s);
    s = await play(p, a.id);
    assert.match(s.choice.title, /top 10/);
    await shot(p, "armory-native-top-ten-physical-search", width);
    await resume(p);
    s = await choose(p, "deck-1");
    assert.equal(s.hand[0].code, P.blade);
    await shot(p, "armory-native-selection-to-hand", width);
    s = fixture();
    h = s.heroes[0];
    s.threat = 40;
    s.deck = [P.blade, ...Array(4).fill("01013"), "01039"];
    a = hand(s, P.armory);
    await load(p, s);
    await play(p, a.id);
    await choose(p, "play");
    s = await choose(p, "deck-0");
    await resume(p);
    s = await choose(p, h.id);
    assert.ok(get(s, h.id).attachments.some((a) => a.code === P.blade));
    await shot(p, "armory-native-valour-top-five-attachment-entry", width);

    s = fixture();
    h = s.heroes[2];
    h.exhausted = true;
    await load(p, s);
    s = await ability(p, h.id);
    assert.equal(get(s, h.id).damage, 2);
    assert.equal(get(s, h.id).exhausted, false);
    await shot(p, "quickbeam-native-damage-cost-and-ready", width);

    s = fixture();
    s.victoryCards = [P.rally, "17059"];
    a = hand(s, P.halfast);
    h = s.heroes[0];
    await load(p, s);
    s = await play(p, a.id);
    await resume(p);
    s = await choose(p, h.id);
    assert.equal(get(s, h.id).resources, 10);
    await shot(p, "halfast-native-discount-entry-resource-response", width);

    s = fixture();
    const costAlly = ally(s, "01013");
    h = s.heroes[0];
    const condition = attach(s, h, "01080");
    a = hand(s, P.bulwark);
    await load(p, s);
    await play(p, a.id);
    s = await choose(p, costAlly.id);
    await shot(p, "bulwark-native-physical-condition-choice", width);
    await resume(p);
    s = await choose(p, condition.id);
    assert.equal(get(s, costAlly.id), undefined);
    assert.ok(!get(s, h.id).attachments.some((a) => a.id === condition.id));
    await shot(p, "bulwark-native-ally-cost-and-condition-discard", width);

    s = fixture();
    const followedEnemy = make(s, "01089");
    s.staging = [followedEnemy];
    a = hand(s, P.followed);
    await load(p, s);
    s = await play(p, a.id);
    s.phase = "encounter";
    await load(p, s);
    await boardCard(p, followedEnemy.id)
      .getByRole("button", { name: "Engage", exact: true })
      .click();
    await reviewedState(p);
    s = await settle(p);
    assert.ok(get(s, followedEnemy.id).attachments.some((x) => x.id === a.id));
    await shot(p, "followed-native-owner-engagement-trap", width);

    s = fixture();
    s.heroes[0] = make(s, "01011");
    s.heroes[0].resources = 10;
    s.heroes[0].phaseResourceIcons = ["spirit"];
    a = hand(s, P.flight);
    await load(p, s);
    s = await play(p, a.id);
    assert.ok(s.encounterDeck.includes(P.wind));
    assert.ok(s.removed.includes(P.flight));
    await shot(p, "flight-native-wind-encounter-reserve-event-removal", width);

    s = fixture();
    const ranger = ally(s, P.ranger),
      trapped = make(s, "01089");
    attach(s, trapped, P.followed);
    s.engaged = [trapped];
    s.phase = "quest";
    await load(p, s);
    s = await commit(p, ranger);
    assert.match(s.choice.title, /Emyn Arnen Ranger/);
    await resume(p);
    s = await choose(p, trapped.id);
    assert.equal(stats(s, get(s, ranger.id)).will, card(trapped.code).threat);
    await shot(p, "ranger-native-quest-commit-trap-threat-boost", width);

    s = fixture();
    h = s.heroes[2];
    h.damage = 1;
    h.exhausted = true;
    a = hand(s, P.dam);
    await load(p, s);
    s = await play(p, a.id);
    assert.equal(get(s, h.id).exhausted, false);
    await shot(p, "dam-native-damaged-ent-ready-trait-condition", width);

    for (const mode of ["heal", "resource", "ready"]) {
      s = fixture();
      h = s.heroes[0];
      h.damage = 1;
      h.exhausted = true;
      a = attach(s, h, P.ring);
      await load(p, s);
      await ability(p, h.id, a.id);
      await resume(p);
      s = await choose(p, mode);
      assert.equal(s.threat, 21);
      assert.equal(
        get(s, h.id).attachments.find((v) => v.id === a.id).exhausted,
        true,
      );
      await shot(p, `magic-ring-native-${mode}`, width);
    }

    s = fixture();
    s.phase = "quest";
    s.encounterDeck = [P.wind, "01099"];
    h = s.heroes[0];
    await load(p, s);
    s = await commit(p, h);
    s = await settle(p);
    assert.equal(get(s, h.id).exhausted, false);
    assert.ok(s.removed.includes(P.wind));
    await shot(p, "wind-native-encounter-reveal-committed-hero-ready", width);

    s = fixture();
    const fastred = s.heroes[0],
      fastredEnemy = make(s, "01089");
    s.engaged = [fastredEnemy];
    s.phase = "defense";
    await load(p, s);
    s = await defend(p, fastredEnemy, fastred);
    assert.match(s.choice.title, /Fastred/);
    await resume(p);
    s = await choose(p, "use");
    assert.ok(s.staging.some((u) => u.id === fastredEnemy.id));
    assert.equal(s.threat, 18);
    await shot(p, "fastred-native-after-defense-return-and-threat", width);

    s = fixture();
    const guardian = ally(s, P.beorning),
      victim = make(s, "01089"),
      progressTarget = make(s, "01099");
    victim.damage = 2;
    s.engaged = [victim];
    s.staging = [progressTarget];
    s.phase = "attack";
    await load(p, s);
    s = await attack(p, victim, guardian);
    assert.match(s.choice.title, /Beorning Guardian/);
    await resume(p);
    s = await choose(p, progressTarget.id);
    assert.equal(get(s, guardian.id), undefined);
    assert.equal(get(s, progressTarget.id).progress, card(victim.code).threat);
    await shot(
      p,
      "beorning-native-kill-physical-discard-location-progress",
      width,
    );

    s = fixture();
    const ridder = ally(s, P.riddermark),
      ridderEnemy = make(s, "01089");
    s.engaged = [ridderEnemy];
    s.phase = "attack";
    await load(p, s);
    s = await attack(p, ridderEnemy, ridder);
    assert.match(s.choice.title, /Riddermark Knight/);
    await resume(p);
    s = await choose(p, "use");
    assert.equal(get(s, ridder.id), undefined);
    assert.ok(s.discard.includes(P.riddermark));
    await shot(p, "riddermark-reused-native-attack-response-discard", width);

    s = fixture();
    s.heroes[1] = make(s, "01010");
    for (const hero of s.heroes) {
      hero.resources = 10;
      hero.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
    }
    a = hand(s, P.oath);
    s.engaged = [make(s, "01089")];
    s.phase = "encounter";
    await load(p, s);
    for (let n = 0; n < 3 && !(await saved(p)).choice; n++) await next(p);
    s = await saved(p);
    assert.match(s.choice.title, /Oath of Eorl/);
    await resume(p);
    s = await choose(p, "use");
    assert.equal(s.phase, "attack");
    await shot(p, "oath-reused-native-beginning-combat-early-attack", width);

    const wilds = wildsPlayerBrowserCases();
    await load(p, wilds.brand.state);
    s = await play(p, wilds.brand.source, wilds.brand.target);
    assert.match(s.choice.title, /Brand/);
    await resume(p);
    s = await choose(p, "use");
    assert.equal(s.hand.length, 1);
    await shot(
      p,
      "wilds-brand-native-first-attachment-draw-sentry-passives",
      width,
    );
    await load(p, wilds.trader.state);
    s = await ability(p, wilds.trader.source);
    await shot(p, "wilds-trader-native-item-transfer-choice", width);
    s = await choose(p, wilds.trader.attachment);
    s = await choose(p, wilds.trader.target);
    assert.ok(
      get(s, wilds.trader.target).attachments.some(
        (a) => a.id === wilds.trader.attachment,
      ),
    );
    await shot(p, "wilds-trader-native-exact-item-movement", width);
    await load(p, wilds.king.state);
    await ability(p, wilds.king.source, wilds.king.attachment);
    s = await play(p, wilds.king.ally);
    s = await settle(p);
    assert.ok(get(s, wilds.king.ally));
    await shot(
      p,
      "wilds-king-native-distinct-attachment-cost-resource-match",
      width,
    );
    await load(p, wilds.necklace.state);
    s = await play(p, wilds.necklace.source);
    await shot(
      p,
      "wilds-necklace-native-guarded-discard-without-reveal",
      width,
    );
    await load(p, wilds.traffic.state);
    s = await play(p, wilds.traffic.source, wilds.traffic.target);
    assert.equal(get(s, wilds.traffic.target).resources, 11);
    await shot(
      p,
      "wilds-traffic-native-attached-characters-resource-count",
      width,
    );

    // Every original printing is inspected separately, including all hero and Encounter faces.
    for (const definition of allCards) {
      s = fixture();
      if (definition.type_code === "hero") {
        s.heroes = [
          make(s, definition.code),
          make(s, "01002"),
          make(s, "01004"),
        ];
        s.startingHeroes = s.heroes.map((h) => h.code);
      } else if (definition.code === P.wind) {
        a = make(s, P.wind);
        s.staging = [a];
      } else a = hand(s, definition.code);
      await load(p, s);
      if (definition.type_code === "hero")
        await p
          .getByRole("button", {
            name: `Inspect ${card(definition.code).name}`,
            exact: true,
          })
          .click();
      else if (definition.code === P.wind)
        await p
          .getByRole("button", {
            name: `Inspect ${card(definition.code).name}`,
            exact: true,
          })
          .click();
      else await boardCard(p, a.id).locator(".hand-art").click();
      await printed(p, card(definition.code));
      await shot(p, `printed-${definition.code}`, width);
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
    await c.close();
  }
  const perWidth = checks.filter((x) =>
    x.endsWith(`@ ${smoke ? smokeWidth : 1280}`),
  ).length;
  assert.equal(
    checks.filter((x) => x.startsWith("printed-")).length,
    smoke ? 45 : 135,
    "all 45 original printed faces at every width",
  );
  assert.equal(
    perWidth,
    90,
    "all 45 native interaction checkpoints and all 45 original faces are required at each width",
  );
  assert.equal(screenshots.length, smoke ? perWidth : perWidth * 3);
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
    `Batch four players: ${screenshots.length} checkpoints passed (${url}).`,
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
