import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import * as F from "../tests/depths-fixtures.ts";
import {
  DEPTHS as D,
  DEPTHS_ENCOUNTERS,
  DEPTHS_QUESTS,
  depthsGrappledWith,
} from "../src/game/depths-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, make, stats, threatOf } from "../src/game/core.ts";
import {
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "../src/game/table.ts";
import { depthsAbilityLabel } from "../src/game/depths.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  next,
  opening,
  report,
  resume,
  saved,
  settle,
} from "./browser-angmar-helpers.mjs";

const dir = "output/depths-scenario";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [],
  entries = new Set(),
  checks = [];
let page;

async function checkpoint(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function printedFace(p, c, reverse = false) {
  assert.equal(
    await p.locator("[data-card-primary-name]").textContent(),
    reverse ? (c.back_name ?? c.name) : c.name,
  );
  const primary = p.locator("[data-card-primary-rules]");
  const expected = plain(reverse ? c.back_text : c.text);
  if (expected) assert.equal(await primary.textContent(), expected);
  else
    assert.equal(await primary.count(), 0, "blank printed face has no rules");
  const other = p.locator("[data-card-other-face] .rules-text");
  const otherExpected = plain(reverse ? c.text : c.back_text);
  if (otherExpected) assert.equal(await other.textContent(), otherExpected);
  else assert.equal(await other.count(), 0, "blank other face has no rules");
  const image = p.locator(".card-detail img[data-card-code]");
  assert.equal(
    new URL(await image.getAttribute("src"), p.url()).pathname,
    reverse ? (c.back_imagesrc ?? c.imagesrc) : c.imagesrc,
    "the inspected face uses its original cached artwork",
  );
  assert.ok(
    await image.evaluate(async (img) => {
      await img.decode();
      return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
    }),
    "the exact printed face artwork decodes successfully",
  );
  const shadow = p.locator(".card-detail-primary .shadow-text");
  if (c.shadow) assert.equal(await shadow.textContent(), plain(c.shadow));
  else assert.equal(await shadow.count(), 0, "the source has no shadow clause");
}
async function attack(p, enemyId, attackerId, power) {
  await boardCard(p, enemyId)
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
async function commitAndReveal(p) {
  await p
    .getByRole("button", { name: "Commit & reveal", exact: true })
    .last()
    .click();
  await reviewedState(p);
  return saved(p);
}
function scenarioFixture(players = 1) {
  const s = F.stage3(players);
  // Isolate later interactions after the real printed transition and initial Grapple.
  s.encounterDiscard.push(...s.depths.grappled.map((g) => g.enemy.code));
  s.depths.grappled = [];
  s.encounterDiscard.push(
    ...s.staging.filter((u) => u.code !== D.thing).map((u) => u.code),
  );
  s.staging = s.staging.filter((u) => u.code === D.thing);
  return s;
}

try {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
    [320, 750],
  ]) {
    const view = await context(browser, width, height, errors, entries);
    page = view.p;
    for (const players of [1, 2, 3, 4])
      for (const easy of [false, true]) {
        await fresh(page, "the-thing-in-the-depths", players, easy);
        await page.locator("#start-btn").click();
        const s = await opening(page),
          q = s.depths;
        assert.equal(s.scenarioId, "the-thing-in-the-depths");
        assert.ok(q.initialized);
        assert.equal(s.stage, 1);
        assert.equal(q.currentQuest, D.take);
        assert.equal(s.encounterDeck.length, easy ? 13 : 20);
        assert.equal(q.beastDeck.length, easy ? 16 : 18);
        assert.equal(q.setAside.length, 3);
        assert.deepEqual(
          s.staging.map((u) => u.code).sort(),
          [D.helm, D.raider].sort(),
        );
        assert.equal(q.grappled.length, 0);
        assert.equal(s.sailing, undefined);
        assert.equal(
          await page.locator('[data-scenario-panel="depths"]').count(),
          1,
        );
        assert.equal(
          await page
            .locator(`.board-card img[data-card-code="${D.thing}"]`)
            .count(),
          0,
        );
        await checkpoint(
          page,
          `setup-${players}-${easy ? "easy" : "normal"}`,
          width,
        );
        const after = await resume(page);
        assert.deepEqual(
          after.depths,
          q,
          "physical scenario piles survive reload",
        );
      }

    // Helm's real travel effect brings the captains to their printed fellowships.
    let s = F.base(2);
    s.phase = "travel";
    const helm = s.staging.find((u) => u.code === D.helm);
    const sahirEnemyId = s.depths.setAside.find((u) => u.code === D.sahir).id;
    const naasiyahEnemyId = s.depths.setAside.find(
      (u) => u.code === D.naasiyah,
    ).id;
    forOwner(s, 1, () => {
      s.hand = [make(s, "01023")];
    });
    await load(page, s);
    await boardCard(page, helm.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    s = await settle(page);
    assert.equal(s.activeLocation.id, helm.id);
    // Travel adds the captains to staging. Resolve the actual hot-seat
    // engagement window before checking their designated fellowships.
    for (
      let i = 0;
      i < 12 && !allEngaged(s).some((u) => u.id === naasiyahEnemyId);
      i++
    ) {
      s = await next(page);
      s = await settle(page);
    }
    assert.equal(ownerOf(s, get(s, sahirEnemyId)), 0);
    assert.equal(ownerOf(s, get(s, naasiyahEnemyId)), 1);
    assert.ok(allEngaged(s).some((u) => u.id === sahirEnemyId));
    assert.ok(allEngaged(s).some((u) => u.id === naasiyahEnemyId));
    assert.equal(seatView(s, 1).hand.length, 0);
    assert.equal(get(s, naasiyahEnemyId).resources, 1);
    await checkpoint(page, "helm-travel-first-and-last-captains", width);
    await resume(page);

    // Quest resolution explores Helm and performs the actual stage-two set change.
    s = await saved(page);
    s.phase = "staging";
    for (const player of playerOrder(s))
      forOwner(s, player, () => {
        s.heroes[0].committed = true;
        s.heroes[0].exhausted = true;
        s.heroes[0].tempWill = 40;
        s.committedIds = [s.heroes[0].id];
      });
    await load(page, s);
    await page
      .getByRole("button", { name: "Resolve quest", exact: true })
      .last()
      .click();
    s = await settle(page);
    assert.equal(s.stage, 3);
    assert.deepEqual(s.depths.completedQuests, [D.take, D.change]);
    assert.equal(s.depths.beastDeck.length, 0);
    assert.equal(s.depths.setAside.length, 0);
    assert.ok(s.victoryCards.includes(D.helm));
    assert.equal(get(s, sahirEnemyId).code, D.sahirAlly);
    assert.equal(get(s, naasiyahEnemyId).code, D.naasiyahAlly);
    assert.equal(get(s, naasiyahEnemyId).resources, 0);
    assert.equal(ownerOf(s, get(s, naasiyahEnemyId)), 1);
    assert.ok(s.staging.some((u) => u.code === D.thing));
    assert.ok(
      ![
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...allEngaged(s).map((u) => u.code),
      ].some((c) =>
        [D.raider, D.infiltrator, D.leader, D.hardened].includes(c),
      ),
    );
    await checkpoint(
      page,
      "same-captains-flip-and-encounter-set-change",
      width,
    );
    await resume(page);

    // The reveal reaches a real first-player Grapple choice; reload preserves it.
    s = scenarioFixture();
    s.phase = "quest";
    const high = make(s, D.quarter),
      tied = make(s, D.quarter),
      low = make(s, D.crew);
    s.staging.push(high, tied, low);
    s.encounterDeck = [D.grasping, D.cargo, D.cargo];
    await load(page, s);
    s = await commitAndReveal(page);
    assert.match(s.choice.title, /Grasping Arm.*Grapple/);
    assert.deepEqual(
      s.choice.options.map((o) => o.id).sort(),
      [high.id, tied.id].sort(),
    );
    const armId = s.depths.pendingEnemies.find((u) => u.code === D.grasping).id;
    await checkpoint(page, "grapple-first-player-tie", width);
    await resume(page);
    s = await choose(page, tied.id);
    assert.equal(depthsGrappledWith(s, tied.id)[0].id, armId);
    assert.equal(threatOf(s, get(s, tied.id)), 6);
    assert.equal(
      await page
        .locator(`.board-card img[data-card-code="${D.grasping}"]`)
        .count(),
      0,
    );
    const grapple = page.locator(`[data-depths-location-id="${tied.id}"]`);
    assert.equal(await grapple.locator("strong").innerText(), "1 grappled");
    assert.equal(await grapple.locator("small").innerText(), "+2 threat");
    assert.match(
      await grapple.getAttribute("aria-label"),
      /Travel here or explore/,
    );
    assert.equal(
      await grapple.locator("button").count(),
      0,
      "facedown enemies cannot be inspected or engaged",
    );
    assert.ok(
      !JSON.stringify((await reviewedState(page)).depths).includes(D.grasping),
      "public text conceals the attached identity",
    );
    await checkpoint(page, "grapple-facedown-and-location-threat", width);
    await resume(page);
    assert.equal(depthsGrappledWith(await saved(page), tied.id)[0].id, armId);

    // From the Depths discards three physical cards and Grapples without revealing them.
    s = scenarioFixture();
    s.phase = "quest";
    const fromHost = F.add(s, D.quarter);
    F.add(s, D.crew);
    s.encounterDiscard = [];
    s.encounterDeck = [D.from, D.giant, D.grasping, D.cargo, D.cargo];
    await load(page, s);
    s = await commitAndReveal(page);
    s = await settle(page);
    assert.equal(depthsGrappledWith(s, fromHost.id).length, 2);
    assert.equal(threatOf(s, get(s, fromHost.id)), 8);
    assert.ok(!s.encounterDiscard.includes(D.giant));
    assert.ok(!s.encounterDiscard.includes(D.grasping));
    assert.ok(s.encounterDiscard.includes(D.cargo));
    assert.equal(s.lastReveal, D.from, "discarded creatures were not revealed");
    await checkpoint(page, "from-depths-three-discards-and-grapple", width);
    await resume(page);

    // At stage 3, travel replaces the active location and detaches the same arm.
    s = scenarioFixture();
    s.phase = "travel";
    const previous = make(s, D.cargo),
      host = make(s, D.quarter),
      crushing = make(s, D.crushing);
    s.activeLocation = previous;
    s.staging.push(host);
    s.depths.grappled.push({ enemy: crushing, locationId: host.id });
    s.encounterDeck = [D.cargo, D.cargo, D.cargo];
    const defenderId = s.heroes[0].id;
    s.heroes[0].tempDefense = 10;
    await load(page, s);
    await boardCard(page, host.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.activeLocation.id, host.id);
    assert.ok(s.staging.some((u) => u.id === previous.id));
    assert.equal(s.depths.grappled.length, 0);
    assert.ok(s.staging.some((u) => u.id === crushing.id));
    assert.match(s.choice.title, /Crushing Arm.*Immediate attack/);
    assert.equal(s.combat.enemyId, crushing.id);
    await checkpoint(page, "replace-active-and-crushing-attack", width);
    await resume(page);
    await choose(page, defenderId);
    s = await settle(page);
    assert.equal(s.combat, null);
    assert.ok(get(s, crushing.id));
    assert.equal(get(s, defenderId).damage, 0);
    await checkpoint(page, "detached-arm-survives-attack", width);

    // Both physical Elite cards become allies and their resource actions use real controls.
    s = scenarioFixture();
    s.phase = "planning";
    const sahir = allCharacters(s).find((u) => u.code === D.sahirAlly);
    assert.ok(sahir);
    const payer = s.heroes[0];
    const beforeResources = payer.resources;
    await load(page, s);
    await boardCard(page, sahir.id)
      .getByRole("button", {
        name: depthsAbilityLabel(sahir.code),
        exact: true,
      })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.match(s.choice.title, /Spend 1 hero resource/);
    await checkpoint(page, "captain-resource-payer", width);
    await resume(page);
    s = await choose(page, payer.id);
    assert.equal(get(s, sahir.id).resources, sahir.resources + 1);
    assert.equal(get(s, payer.id).resources, beforeResources - 1);
    assert.equal(ownerOf(s, get(s, sahir.id)), 0);
    const spentAction = boardCard(page, sahir.id)
      .locator(".abilities > button")
      .filter({ hasText: depthsAbilityLabel(sahir.code) });
    assert.equal(await spentAction.count(), 1);
    assert.ok(await spentAction.isDisabled());
    assert.equal(
      await spentAction.isVisible(),
      false,
      "used abilities are hidden",
    );
    await checkpoint(page, "captain-resource-once-per-round", width);

    // Na'asiyah spends her own tokens in the real combat action window.
    s = scenarioFixture();
    s.phase = "defense";
    const giantAttack = F.add(s, D.giant, "engaged");
    giantAttack.shadows = [D.cargo];
    const naasiyah = allCharacters(s).find((u) => u.code === D.naasiyahAlly);
    naasiyah.resources = 2;
    await load(page, s);
    s = await defend(page, giantAttack.id, naasiyah.id);
    assert.match(s.choice.title, /Na'asiyah.*Combat actions/);
    await checkpoint(page, "naasiyah-declared-defender-action-window", width);
    await resume(page);
    s = await choose(page, "defense");
    assert.equal(get(s, naasiyah.id).resources, 1);
    assert.equal(stats(s, get(s, naasiyah.id)).defense, 4);
    await resume(page);
    s = await choose(page, "defense");
    assert.equal(get(s, naasiyah.id).resources, 0);
    s = await choose(page, "continue");
    s = await settle(page);
    assert.equal(
      get(s, naasiyah.id).damage,
      0,
      "two boosts defend Giant Arm's ally attack bonus",
    );
    assert.equal(
      stats(s, get(s, naasiyah.id)).defense,
      2,
      "the boost ends with this attack",
    );
    await checkpoint(page, "naasiyah-boost-cost-and-attack-cleanup", width);

    // A Giant Arm shadow remains the same physical card through its delayed choice.
    s = scenarioFixture();
    s.phase = "defense";
    const thrashing = F.add(s, D.thrashing, "engaged"),
      shadowHost = F.add(s, D.crew);
    thrashing.shadows = [D.giant];
    s.heroes[0].tempDefense = 10;
    await load(page, s);
    s = await defend(page, thrashing.id, s.heroes[0].id);
    assert.match(s.choice.title, /Giant Arm.*After this attack/);
    const giantShadowId = s.depths.pendingEnemies.find(
      (u) => u.code === D.giant,
    ).id;
    await checkpoint(page, "giant-arm-shadow-after-attack-choice", width);
    await resume(page);
    s = await choose(page, "grapple");
    assert.equal(depthsGrappledWith(s, shadowHost.id)[0].id, giantShadowId);
    assert.ok(!get(s, thrashing.id).shadows.includes(D.giant));
    await checkpoint(page, "physical-shadow-becomes-grapple", width);

    // Eye cannot attack; its boss attacks the remote engaged fellowship instead.
    s = scenarioFixture(2);
    s.phase = "encounter";
    const eye = F.add(s, D.eye, "engaged", 1),
      eyeBoss = s.staging.find((u) => u.code === D.thing);
    const remoteDefender = seatView(s, 1).heroes[0];
    s.encounterDeck = [D.cargo, D.cargo, D.cargo, D.cargo];
    await load(page, s);
    for (
      let i = 0;
      i < 12 && !(s.choice?.title ?? "").includes("Immediate attack");
      i++
    )
      s = await next(page);
    assert.match(s.choice.title, /The Thing in the Depths.*Immediate attack/);
    assert.equal(s.combat.enemyId, eyeBoss.id);
    assert.equal(s.combat.attackPlayer, 1);
    assert.equal(get(s, eyeBoss.id).shadows[0], D.cargo);
    assert.ok(s.choice.options.some((o) => o.id === remoteDefender.id));
    await checkpoint(page, "eye-boss-attack-remote-fellowship", width);
    await resume(page);
    s = await choose(page, remoteDefender.id);
    s = await settle(page);
    assert.equal(
      get(s, remoteDefender.id).damage,
      3,
      "the remote hero takes the boss's 5 attack minus his printed 2 defense",
    );
    assert.ok(allEngaged(s).some((u) => u.id === eye.id));
    assert.equal(s.combat, null);
    await checkpoint(page, "boss-shadow-and-remote-defender", width);

    // Lashing Tentacles attacks each fellowship in order with a fresh shadow.
    s = scenarioFixture(2);
    s.phase = "quest";
    const lashingBoss = s.staging.find((u) => u.code === D.thing);
    const lashingDefenders = [0, 1].map(
      (player) => seatView(s, player).heroes[0],
    );
    for (const h of lashingDefenders) h.tempDefense = 10;
    s.encounterDeck = [D.lashing, D.cargo, D.crew, D.cargo, D.cargo];
    await load(page, s);
    for (let i = 0; i < 12 && !s.choice; i++) s = await next(page);
    assert.match(s.choice.title, /The Thing in the Depths.*Immediate attack/);
    assert.equal(s.combat.attackPlayer, 0);
    assert.equal(get(s, lashingBoss.id).shadows[0], D.cargo);
    await checkpoint(page, "lashing-first-fellowship-attack", width);
    await resume(page);
    s = await choose(page, lashingDefenders[0].id);
    assert.match(s.choice.title, /The Thing in the Depths.*Immediate attack/);
    assert.equal(s.combat.attackPlayer, 1);
    assert.equal(get(s, lashingBoss.id).shadows[0], D.crew);
    await checkpoint(page, "lashing-next-fellowship-fresh-shadow", width);
    await resume(page);
    s = await choose(page, lashingDefenders[1].id);
    s = await settle(page);
    for (const h of lashingDefenders) assert.equal(get(s, h.id).damage, 0);
    assert.equal(s.combat, null);

    // The actual player attack destroys a Creature; its Forced damage defeats the boss.
    s = scenarioFixture();
    s.phase = "attack";
    const boss = s.staging.find((u) => u.code === D.thing),
      victim = make(s, D.grasping);
    boss.damage = stats(s, boss).health - 2;
    s.engaged.push(victim);
    s.heroes[0].tempAttack = 20;
    const attackerId = s.heroes[0].id,
      power = stats(s, s.heroes[0]).attack;
    await load(page, s);
    assert.equal(
      await boardCard(page, boss.id)
        .getByRole("button", { name: "Engage", exact: true })
        .count(),
      0,
    );
    s = await attack(page, victim.id, attackerId, power);
    s = await settle(page);
    assert.equal(s.status, "won");
    assert.ok(s.victoryCards.includes(D.thing));
    assert.ok(
      await page
        .getByRole("heading", { name: "Beyond the shadow", exact: true })
        .isVisible(),
    );
    await checkpoint(page, "creature-destruction-victory", width);

    // Grapple adds current location threat; loss occurs through the real round-end control.
    s = scenarioFixture();
    s.phase = "refresh";
    const sinking = make(s, D.crew);
    s.staging.push(sinking);
    for (let i = 0; i < 4; i++)
      s.depths.grappled.push({
        enemy: make(s, D.giant),
        locationId: sinking.id,
      });
    assert.equal(threatOf(s, sinking), 9);
    await load(page, s);
    assert.match(
      await page.locator(".depths-ship-danger").innerText(),
      /9 \/ 9.*The ship will sink/s,
    );
    await checkpoint(page, "ship-threat-nine-warning", width);
    s = await next(page);
    s = await settle(page);
    assert.equal(s.status, "lost");
    assert.ok(
      await page
        .getByRole("heading", {
          name: "The fellowship has fallen",
          exact: true,
        })
        .isVisible(),
    );
    await checkpoint(page, "grappled-ship-round-end-defeat", width);

    // Every original scenario front and reverse is inspected through actual UI.
    const fronts = DEPTHS_ENCOUNTERS.filter((c) => !c.code.endsWith(":B"));
    s = F.base();
    s.encounterDiscard = fronts.map((c) => c.code);
    await load(page, s);
    await page
      .getByRole("button", {
        name: `Browse encounter discard: ${fronts.length} cards`,
        exact: true,
      })
      .click();
    for (const c of fronts) {
      await page
        .locator(".pile-entry")
        .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
        .getByRole("button")
        .first()
        .click();
      await printedFace(page, c);
      if (c.back_imagesrc) {
        await page
          .getByRole("button", { name: "Show reverse", exact: true })
          .click();
        await printedFace(page, c, true);
      }
      await checkpoint(page, `printed-${c.code.slice(6, 14)}`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    for (const [index, c] of DEPTHS_QUESTS.entries()) {
      s = index === 2 ? scenarioFixture() : F.setStage(F.base(), index + 1);
      await load(page, s);
      await page.locator(".journey-area .quest-card-stack").click();
      assert.match(
        await page.getByRole("dialog").innerText(),
        new RegExp(`Stage ${index + 1} of 3`),
      );
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await printedFace(page, c);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await printedFace(page, c, true);
      await checkpoint(page, `printed-quest-${index + 1}`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }

    await view.c.close();
  }
  await report(dir, { errors, screenshots, entries, checks });
  console.log(`Depths browser checks passed: ${checks.length}`);
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      { error: String(error), stack: error.stack, checks, errors },
      null,
      2,
    ),
  );
  if (page && !page.isClosed())
    await page.screenshot({ path: `${dir}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
