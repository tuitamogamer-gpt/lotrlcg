import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/cobas-fixtures.ts";
import {
  COBAS as C,
  COBAS_ENCOUNTERS,
  COBAS_QUESTS,
  COBAS_OBJECTIVES,
  COBAS_CORSAIRS,
} from "../src/game/cobas-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  syncSeat,
  selectSeat,
  seatIndices,
  seatView,
} from "../src/game/table.ts";
import { cobasAbilityLabel } from "../src/game/cobas.ts";
import { beginSailingTest } from "../src/game/sailing.ts";
import { revealed } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
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

const sourceScriptSha256 = crypto
  .createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const widths = process.env.COBAS_WIDTHS
  ? process.env.COBAS_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(
  widths.length && widths.every((width) => [1280, 390, 320].includes(width)),
);
const smoke = widths.join(",") !== "1280,390,320";
const dir = process.env.COBAS_OUTPUT_DIR ?? "output/cobas-scenario";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [],
  entries = new Set(),
  checks = [],
  printedFaces = new Set(),
  artwork = [];
let page;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function checkpoint(p, label, width) {
  await p.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await reviewedState(p);
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function close(p) {
  await p
    .getByRole("button", { name: "Close dialog", exact: true })
    .last()
    .click();
}
async function printed(p, c, reverse = false) {
  const expected = reverse
    ? {
        ...c,
        name: c.back_name ?? c.name,
        text: c.back_text,
        imagesrc: c.back_imagesrc,
        shadow: undefined,
      }
    : c;
  assert.equal(
    await p.locator("[data-card-primary-name]").textContent(),
    expected.name,
  );
  const rules = p.locator("[data-card-primary-rules]");
  if (plain(expected.text))
    assert.equal(await rules.textContent(), plain(expected.text));
  else if (await rules.count())
    assert.equal(await rules.textContent(), "No additional abilities.");
  const img = p.locator(".card-detail img[data-card-code]");
  assert.equal(
    new URL(await img.getAttribute("src"), p.url()).pathname,
    expected.imagesrc,
  );
  assert.ok(
    await img.evaluate(async (i) => {
      await i.decode();
      return i.naturalWidth > 0 && i.naturalHeight > 0;
    }),
  );
  const shadow = p.locator(".card-detail-primary .shadow-text");
  if (expected.shadow)
    assert.equal(await shadow.textContent(), plain(expected.shadow));
  else assert.equal(await shadow.count(), 0);
  printedFaces.add(expected.imagesrc);
}
async function chooseOption(p, predicate) {
  const s = await saved(p);
  assert.ok(s.choice, "the real action opened its printed decision");
  const option = s.choice.options.find(predicate);
  assert.ok(option, JSON.stringify(s.choice));
  return choose(p, option.id);
}
function commitPower(s, power) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.heroes[0].committed = true;
      s.heroes[0].exhausted = true;
      s.heroes[0].tempWill = power;
      s.committedIds = [s.heroes[0].id];
    });
  syncSeat(s);
}
async function resolveQuest(p) {
  await p
    .getByRole("button", { name: "Resolve quest", exact: true })
    .last()
    .click();
  await reviewedState(p);
  return saved(p);
}
async function assertPrivate(p, s) {
  const projected = await reviewedState(p);
  assert.ok(projected.cobas, "the scenario has a public panel projection");
  const visibleCodes = new Set(
    [
      ...s.staging,
      ...allCharacters(s),
      ...allEngaged(s),
      ...(s.activeLocation ? [s.activeLocation] : []),
    ].map((u) => u.code),
  );
  for (const code of new Set([...s.cobas.corsairDeck, ...s.cobas.questDeck]))
    if (!visibleCodes.has(code))
      assert.equal(
        await p.locator(`img[data-card-code="${code}"]`).count(),
        0,
        `${card(code).name} stays hidden until revealed`,
      );
}
async function useObjective(p, unit) {
  const s = await saved(p);
  await boardCard(p, unit.id)
    .getByRole("button", { name: cobasAbilityLabel(s, unit), exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function attack(p, enemy, attackers) {
  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Attack", exact: true })
    .click();
  for (const u of attackers)
    await p
      .getByRole("dialog")
      .getByRole("button", { name: card(u.code).name, exact: true })
      .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: /^Attack · [0-9]+ power$/ })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function defend(p, enemy, defender) {
  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Defend", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(defender.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
    .click();
  await reviewedState(p);
  return settle(p);
}
try {
  for (const width of widths) {
    const view = await context(
      browser,
      width,
      width === 1280 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    for (const players of [1, 2, 3, 4])
      for (const easy of [false, true]) {
        await fresh(page, "a-storm-on-cobas-haven", players, easy);
        await page.locator("#start-btn").click();
        const s = await opening(page);
        assert.equal(s.scenarioId, "a-storm-on-cobas-haven");
        assert.equal(s.stage, 1);
        assert.equal(s.cobas.currentQuest, C.outmaneuver);
        assert.ok(s.cobas.initialized);
        assert.equal(
          [
            ...s.cobas.corsairDeck,
            ...s.cobas.corsairDiscard,
            ...allEngaged(s).map((u) => u.code),
            ...s.staging.map((u) => u.code),
          ].filter((code) => COBAS_CORSAIRS.includes(code)).length,
          easy ? 12 : 16,
          "the original Corsair recipe is conserved through any guarded reveal chain",
        );
        assert.equal(
          s.cobas.setAside.filter((u) => u.code === C.warship).length,
          2,
        );
        assert.equal(
          allCharacters(s).filter(
            (u) => card(u.code).type_code === "ship-objective",
          ).length,
          players === 1 ? 2 : players,
        );
        assert.ok(s.staging.some((u) => u.code === C.flagship));
        assert.ok(s.staging.some((u) => u.code === C.scout));
        assert.ok(s.staging.some((u) => COBAS_OBJECTIVES.includes(u.code)));
        assert.equal(
          await page.locator('[data-scenario-panel="cobas"]').count(),
          1,
        );
        await assertPrivate(page, s);
        await checkpoint(
          page,
          `setup-${players}-${easy ? "easy" : "normal"}`,
          width,
        );
        const after = await resume(page);
        assert.deepEqual(
          after.cobas,
          s.cobas,
          "fleet, private decks and guarded objectives survive reload",
        );
      }

    // A controlled Sea-ward Tower changes an actual Sailing test, then the
    // player resolves the looked cards and heading through real controls.
    let s = F.base();
    const sea = make(s, C.sea);
    s.staging.push(sea);
    s.phase = "quest";
    s.encounterDeck = [C.heavy, C.coast, C.water, C.haven, ...s.encounterDeck];
    beginSailingTest(s);
    await load(page, s);
    const dream = allCharacters(s).find((u) => u.code === C.dream);
    await choose(page, dream.id);
    assert.match(
      await page
        .locator('.escape-test-summary[aria-label="Sailing test"]')
        .innerText(),
      /4 Sailing cards · 2 additional cards/,
    );
    await checkpoint(page, "sea-ward-sailing-commit", width);
    await resume(page);
    await choose(page, "done");
    await page
      .getByRole("button", { name: "Resolve Sailing test", exact: true })
      .last()
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.ok(s.sailing.test);
    assert.deepEqual(s.sailing.test.looked, [
      C.heavy,
      C.coast,
      C.water,
      C.haven,
    ]);
    assert.equal(s.sailing.test.successes, 2);
    assert.deepEqual(
      s.staging.map((u) => u.code),
      [C.sea],
      "looked cards never fire When Revealed",
    );
    await checkpoint(page, "sea-ward-sailing-results", width);
    await resume(page);
    s = await chooseOption(page, (o) => o.id.startsWith("sailing-heading-"));
    assert.ok(!s.sailing.test);

    // Stage 1 engagement damages the actual Ship enemy on-course, with
    // Boarding revealing exactly one Corsair and no future Corsair art.
    s = F.base();
    s.phase = "encounter";
    const skirmisher = make(s, C.skirmisher);
    s.staging.push(skirmisher);
    s.cobas.corsairDeck = [C.sailor, C.pirate, C.infiltrator];
    await load(page, s);
    await boardCard(page, skirmisher.id)
      .getByRole("button", { name: "Engage", exact: true })
      .click();
    s = await settle(page);
    assert.equal(get(s, skirmisher.id).damage, 2);
    assert.ok(allEngaged(s).some((u) => u.code === C.sailor));
    assert.deepEqual(s.cobas.corsairDeck, [C.pirate, C.infiltrator]);
    await assertPrivate(page, s);
    await checkpoint(page, "on-course-engagement-and-boarding", width);
    await resume(page);

    // Raider Flagship's printed Forced effect happens when the encounter
    // phase ends, drawing from the private Corsair deck for its engaged player.
    s = F.base();
    s.phase = "encounter";
    const boardingFlagship = make(s, C.flagship);
    boardingFlagship.owner = 0;
    s.engaged.push(boardingFlagship);
    s.cobas.corsairDeck = [C.sailor, C.pirate];
    await load(page, s);
    await next(page);
    s = await settle(page);
    assert.ok(allEngaged(s).some((u) => u.code === C.sailor));
    assert.deepEqual(s.cobas.corsairDeck, [C.pirate]);
    await assertPrivate(page, s);
    await checkpoint(page, "flagship-end-encounter-corsair-reveal", width);
    await resume(page);

    // Cobas Haven's active text reduces Boarding1 to zero; off-course
    // engagement still pays the printed damage to a controlled Ship.
    s = F.base();
    s.phase = "encounter";
    s.sailing.heading = 1;
    s.activeLocation = make(s, C.haven);
    const havenEnemy = make(s, C.skirmisher);
    s.staging.push(havenEnemy);
    const hiddenBefore = [...s.cobas.corsairDeck];
    await load(page, s);
    await boardCard(page, havenEnemy.id)
      .getByRole("button", { name: "Engage", exact: true })
      .click();
    await reviewedState(page);
    await checkpoint(page, "off-course-ship-damage-choice", width);
    await resume(page);
    s = await chooseOption(page, (o) =>
      allCharacters(s).some(
        (u) => u.id === o.id && card(u.code).type_code === "ship-objective",
      ),
    );
    s = await settle(page);
    assert.deepEqual(s.cobas.corsairDeck, hiddenBefore);
    assert.ok(
      allCharacters(s).some(
        (u) => card(u.code).type_code === "ship-objective" && u.damage === 2,
      ),
    );
    await checkpoint(page, "haven-reduces-boarding", width);

    // Belfalas' legal travel removes one non-guarding Ship physically, and
    // exploration returns that same enemy from the saved out-of-play zone.
    s = F.base();
    s.phase = "travel";
    const island = make(s, C.belfalas),
      hiddenEnemy = make(s, C.flagship);
    s.staging.push(island, hiddenEnemy);
    await load(page, s);
    await boardCard(page, island.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(page);
    await checkpoint(page, "belfalas-response", width);
    await resume(page);
    await chooseOption(
      page,
      (o) => o.id === hiddenEnemy.id || o.id === "resolve",
    );
    if ((await saved(page)).choice)
      await chooseOption(page, (o) => o.id === hiddenEnemy.id);
    s = await settle(page);
    assert.ok(s.cobas.belfalas.some((x) => x.enemy.id === hiddenEnemy.id));
    assert.ok(!s.staging.some((u) => u.id === hiddenEnemy.id));
    await checkpoint(page, "belfalas-preserves-out-of-play-enemy", width);
    s = await resume(page);
    s.phase = "staging";
    commitPower(s, 20);
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.ok(s.staging.some((u) => u.id === hiddenEnemy.id));
    assert.ok(s.victoryCards.includes(C.belfalas));
    await checkpoint(
      page,
      "belfalas-exploration-returns-physical-enemy",
      width,
    );

    // Coast of Anfalas pays its Ship exhaustion through a real Travel choice.
    s = F.base();
    s.phase = "travel";
    const coast = make(s, C.coast);
    s.staging.push(coast);
    await load(page, s);
    await boardCard(page, coast.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(page);
    await checkpoint(page, "coast-travel-exhaustion-cost", width);
    await resume(page);
    await chooseOption(page, (o) =>
      allCharacters(s).some((u) => u.id === o.id),
    );
    s = await settle(page);
    assert.equal(s.activeLocation.id, coast.id);
    assert.ok(
      allCharacters(s).some(
        (u) => card(u.code).type_code === "ship-objective" && u.exhausted,
      ),
    );

    // The Beacon spends five actual hero resources, transfers an existing
    // physical Warship and preserves its controller and boosted on-course stats.
    s = F.base();
    const beacon = make(s, C.beacon);
    s.staging.push(beacon);
    const warshipId = s.cobas.setAside.find((u) => u.code === C.warship).id;
    const payer = s.heroes[0],
      resources = payer.resources;
    await load(page, s);
    await useObjective(page, beacon);
    await checkpoint(page, "beacon-resource-payment", width);
    await resume(page);
    for (let paid = 0; paid < 5; paid++) await choose(page, payer.id);
    s = await settle(page);
    assert.equal(get(s, payer.id).resources, resources - 5);
    assert.equal(get(s, beacon.id).exhausted, true);
    const warship = allCharacters(s).find((u) => u.id === warshipId);
    assert.ok(warship);
    assert.equal(warship.controller, 0);
    assert.equal(stats(s, warship).will, 4);
    assert.equal(
      s.cobas.setAside.filter((u) => u.code === C.warship).length,
      1,
    );
    await checkpoint(page, "beacon-recruits-physical-warship", width);
    await resume(page);
    s.phase = "defense";
    warship.damage = stats(s, warship).health - 1;
    const warshipEnemy = make(s, C.heavy);
    warshipEnemy.owner = 0;
    warshipEnemy.tempAttack = 10;
    warshipEnemy.shadows = [];
    s.engaged.push(warshipEnemy);
    await load(page, s);
    s = await defend(page, warshipEnemy, warship);
    assert.equal(s.status, "playing");
    assert.ok(
      s.cobas.setAside.some((u) => u.id === warshipId && u.damage === 0),
    );
    assert.equal(
      s.cobas.setAside.filter((u) => u.code === C.warship).length,
      2,
    );
    await checkpoint(page, "destroyed-warship-returns-set-aside", width);

    // A public tower uses the actual combat action and only offers nonunique ships.
    s = F.base();
    s.phase = "attack";
    const gull = make(s, C.gull),
      gullTarget = make(s, C.skirmisher),
      uniqueTarget = make(s, C.flagship);
    s.staging.push(gull, gullTarget, uniqueTarget);
    await load(page, s);
    await useObjective(page, gull);
    assert.ok(
      !(await saved(page)).choice.options.some((o) => o.id === uniqueTarget.id),
    );
    await checkpoint(page, "gull-legal-ship-targets", width);
    await resume(page);
    s = await choose(page, gullTarget.id);
    s = await settle(page);
    assert.equal(get(s, gull.id).exhausted, true);
    assert.equal(get(s, gullTarget.id).damage, 2);
    await checkpoint(page, "gull-deals-two-damage", width);

    // The printed Condition attaches through revelation, damages a Ship when
    // an actual Travel cost exhausts it, and pays three characters to discard.
    s = F.base();
    s.phase = "staging";
    const waterShip = allCharacters(s).find((u) => u.code === C.dream);
    revealed(s, C.water);
    flush(s);
    await load(page, s);
    await checkpoint(page, "taking-on-water-attachment-choice", width);
    await resume(page);
    await choose(page, waterShip.id);
    s = await settle(page);
    assert.ok(get(s, waterShip.id).attachments.some((a) => a.code === C.water));
    s.phase = "travel";
    const waterCoast = make(s, C.coast);
    s.staging.push(waterCoast);
    await load(page, s);
    await boardCard(page, waterCoast.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(page);
    await choose(page, waterShip.id);
    s = await settle(page);
    assert.equal(get(s, waterShip.id).damage, 2);
    await checkpoint(page, "taking-on-water-damages-exhausted-ship", width);
    await boardCard(page, waterShip.id)
      .getByRole("button", {
        name: "Taking on Water · Exhaust 3 characters you control to discard",
        exact: true,
      })
      .click();
    await reviewedState(page);
    await checkpoint(page, "taking-on-water-three-character-payment", width);
    await resume(page);
    for (const hero of s.heroes) await choose(page, hero.id);
    s = await settle(page);
    assert.ok(
      !get(s, waterShip.id).attachments.some((a) => a.code === C.water),
    );
    assert.ok(s.heroes.every((h) => h.exhausted));
    assert.ok(s.encounterDiscard.includes(C.water));
    await checkpoint(page, "taking-on-water-discarded", width);

    // Destroying a Skirmisher in a real player attack opens its paid capture
    // response, retaining the original card ID while changing its gameplay type.
    s = F.base();
    s.phase = "attack";
    const capturedEnemy = make(s, C.skirmisher);
    capturedEnemy.owner = 0;
    s.engaged.push(capturedEnemy);
    const captain = allCharacters(s).find((u) => u.code === C.dream);
    captain.tempAttack = 20;
    const sacrifice = make(s, "01073");
    sacrifice.owner = 0;
    s.allies.push(sacrifice);
    await load(page, s);
    await attack(page, capturedEnemy, [captain]);
    assert.ok(
      (await saved(page)).cobas.capturePending.some(
        (u) => u.id === capturedEnemy.id,
      ),
    );
    await checkpoint(page, "skirmisher-capture-response", width);
    await resume(page);
    await choose(page, "capture");
    await choose(page, sacrifice.id);
    await checkpoint(page, "skirmisher-paid-allies-confirmation", width);
    await resume(page);
    await choose(page, "pay");
    s = await settle(page);
    const captured = allCharacters(s).find((u) => u.id === capturedEnemy.id);
    assert.ok(captured?.cobasShipObjective);
    assert.equal(captured.code, C.skirmisher);
    assert.equal(captured.damage, 0);
    assert.equal(stats(s, captured).will, 3);
    assert.ok(s.discard.includes(sacrifice.code));
    assert.ok(!allEngaged(s).some((u) => u.id === capturedEnemy.id));
    await checkpoint(page, "skirmisher-becomes-physical-ship-objective", width);
    await resume(page);

    // The newly captured physical Skirmisher can now attack Raider Flagship;
    // the actual attack dialog excludes heroes, and destroying the flagship wins.
    s = F.setStage(s, 3);
    s.phase = "attack";
    const flagshipTarget = make(s, C.flagship);
    flagshipTarget.owner = 0;
    flagshipTarget.damage = stats(s, flagshipTarget).health - 1;
    s.engaged.push(flagshipTarget);
    get(s, captured.id).tempAttack = 20;
    await load(page, s);
    await boardCard(page, flagshipTarget.id)
      .getByRole("button", { name: "Attack", exact: true })
      .click();
    for (const hero of s.heroes)
      assert.equal(
        await page
          .getByRole("dialog")
          .getByRole("button", { name: card(hero.code).name, exact: true })
          .count(),
        0,
      );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Corsair Skirmisher", exact: true })
      .click();
    await checkpoint(page, "flagship-only-ship-attackers", width);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Attack · [0-9]+ power$/ })
      .click();
    await reviewedState(page);
    s = await settle(page);
    assert.equal(s.status, "won");
    assert.ok(s.victoryCards.includes(C.flagship));
    await checkpoint(
      page,
      "captured-skirmisher-defeats-flagship-victory",
      width,
    );

    // Heavy Cruiser finds a real objective; The Raiders' Assault returns an
    // engaged ship to staging and stores a persistent guarding relationship.
    s = F.base();
    s.phase = "staging";
    s.encounterDeck = [C.heron, ...s.encounterDeck];
    revealed(s, C.heavy);
    flush(s);
    await load(page, s);
    await checkpoint(page, "heavy-cruiser-objective-search", width);
    await resume(page);
    await chooseOption(page, (o) => o.code === C.heron);
    s = await settle(page);
    const heavyObjective = s.staging.find((u) => u.code === C.heron),
      heavyGuard = s.staging.find((u) => u.code === C.heavy);
    assert.equal(heavyGuard.guarding, heavyObjective.id);
    await checkpoint(page, "heavy-cruiser-guards-found-objective", width);
    await resume(page);

    // The printed Heavy Cruiser ruling keeps its original Guarded objective
    // while its mandatory search attaches the same physical enemy to another.
    s = F.base();
    s.phase = "staging";
    s.encounterDeck = [C.heavy, C.beacon, ...s.encounterDeck];
    revealed(s, C.sea);
    flush(s);
    await load(page, s);
    await checkpoint(page, "nested-heavy-cruiser-objective-search", width);
    await resume(page);
    await chooseOption(page, (o) => o.code === C.beacon);
    s = await settle(page);
    const nestedHeavy = s.staging.find((u) => u.code === C.heavy);
    const nestedObjectives = [C.sea, C.beacon].map(
      (code) => s.staging.find((u) => u.code === code).id,
    );
    assert.deepEqual(
      [nestedHeavy.guarding, ...(nestedHeavy.cobasGuarding ?? [])].sort(),
      nestedObjectives.sort(),
    );
    assert.equal(
      s.staging.filter((u) => u.id === nestedHeavy.id).length,
      1,
      "one physical Heavy Cruiser can guard two different objectives",
    );
    const nestedPublic = (await reviewedState(page)).cobas;
    for (const id of nestedObjectives)
      assert.equal(
        nestedPublic.objectives.find((u) => u.id === id).guardId,
        nestedHeavy.id,
      );
    await checkpoint(page, "nested-heavy-cruiser-preserves-both-guards", width);
    await resume(page);

    // An objective with its Guarded reveal still pending is not an unguarded
    // target for The Raiders' Assault revealed by that very keyword.
    s = F.base();
    s.phase = "staging";
    const availableObjective = make(s, C.heron);
    const nestedAssaultEnemy = make(s, C.scout);
    nestedAssaultEnemy.owner = 0;
    s.staging.push(availableObjective);
    s.engaged.push(nestedAssaultEnemy);
    s.encounterDeck = [C.assault, C.coast, ...s.encounterDeck];
    revealed(s, C.beacon);
    flush(s);
    const pendingObjective = s.staging.find((u) => u.code === C.beacon);
    assert.ok(s.choice.options.length > 0);
    assert.ok(
      s.choice.options.every((o) =>
        o.effects.every((e) => e.source !== pendingObjective.id),
      ),
      "the pending Guarded objective is excluded from Assault's targets",
    );
    await load(page, s);
    await checkpoint(page, "nested-assault-excludes-pending-objective", width);
    await resume(page);
    await chooseOption(page, (o) => o.code === C.scout);
    s = await settle(page);
    assert.equal(
      s.staging.find((u) => u.id === nestedAssaultEnemy.id).guarding,
      availableObjective.id,
    );
    assert.equal(s.encounterDeck[0], C.coast);
    assert.ok(!s.cobas.pendingGuarded.includes(pendingObjective.id));
    assert.ok(
      (await reviewedState(page)).cobas.objectives.find(
        (u) => u.id === pendingObjective.id,
      ).controlled,
      "the resolved treachery completes Guarded and releases its objective",
    );
    await checkpoint(page, "nested-assault-resolves-pending-guarded", width);
    await resume(page);

    s = F.base();
    s.phase = "staging";
    const assaultObjective = make(s, C.heron),
      assaultEnemy = make(s, C.scout);
    assaultEnemy.owner = 0;
    s.staging.push(assaultObjective);
    s.engaged.push(assaultEnemy);
    const assaultDeck = s.encounterDeck.length;
    revealed(s, C.assault);
    flush(s);
    await load(page, s);
    await checkpoint(page, "raiders-assault-guard-choice", width);
    await resume(page);
    await chooseOption(page, (o) => o.code === C.scout);
    s = await settle(page);
    assert.ok(!allEngaged(s).some((u) => u.id === assaultEnemy.id));
    assert.equal(
      s.staging.find((u) => u.id === assaultEnemy.id).guarding,
      assaultObjective.id,
    );
    assert.equal(
      s.encounterDeck.length,
      assaultDeck,
      "returning an engaged enemy prevents the conditional surge",
    );
    await checkpoint(page, "raiders-assault-returns-physical-enemy", width);

    // Ramming Speed resolves an actual immediate attack and counts the real
    // damage in staging threat until this quest phase ends.
    s = F.base();
    s.phase = "staging";
    s.sailing.heading = 1;
    const rammingEnemy = make(s, C.heavy);
    rammingEnemy.owner = 0;
    s.engaged.push(rammingEnemy);
    const rammingDefender = allCharacters(s).find((u) => u.code === C.dream);
    s.encounterDeck = [C.haven, ...s.encounterDeck];
    const rammingThreat = s.threat;
    revealed(s, C.ramming);
    flush(s);
    await load(page, s);
    await checkpoint(page, "ramming-speed-highest-attack-choice", width);
    await resume(page);
    await choose(page, rammingEnemy.id);
    await checkpoint(page, "ramming-speed-immediate-defense", width);
    await resume(page);
    await choose(page, rammingDefender.id);
    s = await settle(page);
    const actualDamage = get(s, rammingDefender.id).damage;
    assert.ok(actualDamage > 0);
    assert.equal(s.cobas.rammingThreat, actualDamage);
    await checkpoint(page, "ramming-speed-adds-actual-damage-threat", width);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.threat, rammingThreat + actualDamage);
    assert.equal(s.cobas.rammingThreat, 0);
    await checkpoint(page, "ramming-speed-threat-expires-with-phase", width);

    // Siege Ship's Forced effect selects a real unguarded objective at quest end.
    s = F.base();
    s.phase = "staging";
    const siege = make(s, C.siege),
      siegeObjective = make(s, C.sea);
    s.staging.push(siege, siegeObjective);
    await load(page, s);
    await resolveQuest(page);
    assert.match((await saved(page)).choice.title, /Siege Ship/);
    await checkpoint(page, "siege-ship-end-quest-guard-choice", width);
    await resume(page);
    await choose(page, siegeObjective.id);
    s = await settle(page);
    assert.equal(get(s, siege.id).guarding, siegeObjective.id);
    await checkpoint(page, "siege-ship-guards-physical-objective", width);

    // Actual quest resolution respects the stage2 guarded-objective gate.
    s = F.setStage(F.base(), 2);
    s.phase = "staging";
    const tower = make(s, C.gull),
      guard = make(s, C.siege);
    guard.guarding = tower.id;
    s.staging.push(tower, guard);
    commitPower(s, 30);
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.stage, 2);
    assert.ok(s.progress >= 16);
    await checkpoint(page, "guarded-objective-blocks-stage-two", width);
    await resume(page);

    // An extra captured/recruited ship never cancels the printed elimination
    // condition on a fleet ship. Warships discarded by elimination do not fire
    // their destruction-only Forced destination.
    s = F.base(2);
    s.phase = "defense";
    const extraWarship = s.cobas.setAside.splice(
      s.cobas.setAside.findIndex((u) => u.code === C.warship),
      1,
    )[0];
    extraWarship.owner = 1;
    extraWarship.controller = 1;
    forOwner(s, 1, () => s.allies.push(extraWarship));
    selectSeat(s, 1);
    s.table.turn = 1;
    const eliminatedShip = allCharacters(s).find((u) => u.code === C.narelenya);
    eliminatedShip.damage = stats(s, eliminatedShip).health - 1;
    const eliminatingEnemy = make(s, C.heavy);
    eliminatingEnemy.owner = 1;
    eliminatingEnemy.tempAttack = 20;
    eliminatingEnemy.shadows = [];
    s.engaged.push(eliminatingEnemy);
    await load(page, s);
    s = await defend(page, eliminatingEnemy, eliminatedShip);
    assert.equal(s.table.seats[1].eliminated, true);
    assert.equal(s.status, "playing");
    assert.ok(!allCharacters(s).some((u) => u.id === extraWarship.id));
    assert.ok(!s.cobas.setAside.some((u) => u.id === extraWarship.id));
    assert.ok(
      [
        ...s.encounterDiscard,
        ...seatIndices(s).flatMap((player) => {
          const seat = seatView(s, player);
          return [...seat.discard, ...seat.removed];
        }),
      ].includes(C.warship),
    );
    await checkpoint(
      page,
      "fleet-loss-eliminates-controller-with-extra-warship",
      width,
    );
    await resume(page);

    // The other printed stage3 route wins through actual quest progress;
    // destruction of Dream-chaser loses.
    s = F.setStage(F.base(), 3);
    s.phase = "staging";
    commitPower(s, 40);
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.status, "won");
    await checkpoint(page, "break-through-progress-victory", width);
    s = F.base();
    s.phase = "defense";
    const doomed = allCharacters(s).find((u) => u.code === C.dream);
    doomed.damage = stats(s, doomed).health - 1;
    const attacker = make(s, C.flagship);
    attacker.owner = 0;
    attacker.tempAttack = 12;
    attacker.shadows = [];
    s.engaged.push(attacker);
    await load(page, s);
    s = await defend(page, attacker, doomed);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Dream-chaser/);
    await checkpoint(page, "dream-chaser-destruction-defeat", width);

    // Every original gameplay face is inspected through the actual card and
    // quest dialogs; artwork bytes are independently checked below.
    s = F.base();
    s.encounterDiscard = COBAS_ENCOUNTERS.map((c) => c.code);
    await load(page, s);
    await page
      .getByRole("button", {
        name: `Browse encounter discard: ${COBAS_ENCOUNTERS.length} cards`,
        exact: true,
      })
      .click();
    for (const c of COBAS_ENCOUNTERS) {
      await page
        .locator(".pile-entry")
        .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
        .getByRole("button")
        .first()
        .click();
      await printed(page, card(c.code));
      if (c.back_imagesrc) {
        await page
          .getByRole("button", { name: "Show reverse", exact: true })
          .click();
        await printed(page, card(c.code), true);
      }
      await checkpoint(page, `printed-encounter-${c.code.slice(6, 14)}`, width);
      await close(page);
    }
    await close(page);
    for (const [index, c] of COBAS_QUESTS.toSorted(
      (a, b) => Number(a.cost) - Number(b.cost),
    ).entries()) {
      s = F.setStage(F.base(), index + 1);
      await load(page, s);
      await page.locator(".journey-area .quest-card-stack").click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await printed(page, c);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await printed(page, c, true);
      await checkpoint(page, `printed-quest-${index + 1}-both-faces`, width);
      await close(page);
    }
    await view.c.close();
  }
  const bundle = JSON.parse(
    await fs.readFile(
      "src/data/pending/a-storm-on-cobas-haven-import.json",
      "utf8",
    ),
  );
  const artPage = await browser.newPage();
  for (const a of bundle.artwork) {
    const response = await artPage.request.get(
      new URL(a.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178")
        .href,
    );
    assert.equal(response.status(), 200);
    const body = await response.body();
    assert.equal(
      crypto.createHash("sha256").update(body).digest("hex"),
      a.sha256,
      a.localPath,
    );
    const decoded = await artPage.evaluate(
      async ({ bytes }) => {
        const bmp = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const value = { width: bmp.width, height: bmp.height };
        bmp.close();
        return value;
      },
      { bytes: [...body] },
    );
    assert.ok(decoded.width > 0 && decoded.height > 0);
    artwork.push({ path: a.localPath, sha256: a.sha256, ...decoded });
  }
  assert.equal(artwork.length, bundle.artwork.length);
  assert.ok(printedFaces.size >= COBAS_ENCOUNTERS.length + 6);
  await artPage.close();
  await report(dir, {
    smoke,
    sourceScriptSha256,
    errors,
    screenshots,
    entries,
    checks,
    printedFaces: [...printedFaces],
    artwork,
  });
  console.log(
    `Cobas Haven browser checks passed: ${checks.length}; original artworks: ${artwork.length}`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        smoke,
        sourceScriptSha256,
        error: String(error),
        stack: error.stack,
        checks,
        errors,
        printedFaces: [...printedFaces],
        artwork,
      },
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
