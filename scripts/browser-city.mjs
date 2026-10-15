import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/city-fixtures.ts";
import { CITY_ENCOUNTERS, CITY_QUESTS } from "../src/game/city-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  syncSeat,
} from "../src/game/table.ts";
import { beginSailingTest } from "../src/game/sailing.ts";
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

const code = (name) =>
  [...CITY_ENCOUNTERS, ...CITY_QUESTS].find((c) => c.name === name).code;
const fromAside = (s, name) => {
  const index = s.city.setAside.findIndex((u) => u.code === code(name));
  assert.ok(index >= 0, `${name} has its original set-aside physical card`);
  return s.city.setAside.splice(index, 1)[0];
};
const sourceScriptSha256 = crypto
  .createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const widths = process.env.CITY_WIDTHS
  ? process.env.CITY_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(
  widths.length && widths.every((width) => [1280, 390, 320].includes(width)),
);
const smoke = widths.join(",") !== "1280,390,320";
const dir = process.env.CITY_OUTPUT_DIR ?? "output/city-scenario";
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

async function assertPrivate(p, s) {
  const projected = await reviewedState(p);
  assert.ok(projected.city, "the adventure exposes its public City panel");
  const visible = new Set(
    [
      ...allCharacters(s),
      ...allEngaged(s),
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
    ].map((u) => u.code),
  );
  for (const c of new Set([
    ...s.city.corsairDeck,
    ...s.city.secondDeck,
    ...s.city.inactiveDeck,
  ]))
    if (!visible.has(c))
      assert.equal(
        await p.locator(`img[data-card-code="${c}"]`).count(),
        0,
        `${card(c).name} stays hidden until revealed`,
      );
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
        await fresh(page, "the-city-of-corsairs", players, easy);
        await page.locator("#start-btn").click();
        const s = await opening(page);
        assert.equal(s.scenarioId, "the-city-of-corsairs");
        assert.equal(s.stage, 1);
        assert.ok(s.city.initialized);
        assert.equal(s.city.currentQuest, code("The Coast of Umbar"));
        assert.equal(s.city.secondDeck.length, easy ? 13 : 17);
        assert.equal(s.city.corsairDeck.length, easy ? 6 : 10);
        assert.equal(
          s.encounterDeck.length,
          (easy ? 21 : 32) + (players < 3 ? 1 : 0),
        );
        assert.ok(s.staging.some((u) => u.code === code("Stormcaller")));
        assert.equal(
          s.staging.filter((u) => u.code === code("Southern Belfalas")).length,
          players >= 3 ? 2 : 1,
        );
        assert.equal(
          allCharacters(s).filter(
            (u) => card(u.code).type_code === "ship-objective",
          ).length,
          players === 1 ? 2 : players,
        );
        assert.equal(
          await page.locator('[data-scenario-panel="city"]').count(),
          1,
        );
        await assertPrivate(page, s);
        await checkpoint(
          page,
          `setup-${players}-${easy ? "easy" : "normal"}`,
          width,
        );
        assert.deepEqual(
          (await resume(page)).city,
          s.city,
          "both encounter decks, fleet and Corsair order survive reload",
        );
      }

    // The printed Sailing keyword uses the actual commit, resolve and heading controls.
    let s = F.base();
    s.phase = "quest";
    beginSailingTest(s);
    await load(page, s);
    const dream = allCharacters(s).find((u) => u.code === code("Dream-chaser"));
    await choose(page, dream.id);
    await checkpoint(page, "sailing-commit-dream-chaser", width);
    await resume(page);
    await choose(page, "done");
    await page
      .getByRole("button", { name: "Resolve Sailing test", exact: true })
      .last()
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.ok(s.sailing.test);
    assert.equal(s.sailing.test.looked.length, 2);
    await checkpoint(page, "sailing-looked-cards-and-symbols", width);
    await resume(page);
    s = await chooseOption(page, (o) => o.id.startsWith("sailing-heading-"));
    assert.ok(!s.sailing.test);
    await checkpoint(page, "sailing-heading-resolved", width);

    // Southern Belfalas pays its real travel cost by revealing a Corsair.
    // An in-play Watch Tower sees that entry, and a later two-pool payment
    // gives the engaged Slaver one resource for the complete instruction.
    s = F.base();
    s.phase = "travel";
    const southern = make(s, code("Southern Belfalas")),
      watch = make(s, code("Watch Tower"));
    s.staging.push(southern, watch);
    s.city.corsairDeck = [code("Umbar Slaver"), code("Umbar Raider")];
    s.city.corsairDiscard = [];
    await load(page, s);
    await boardCard(page, southern.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    s = await settle(page);
    const spendingSlaver = allEngaged(s).find(
      (u) => u.code === code("Umbar Slaver"),
    );
    assert.ok(spendingSlaver);
    assert.equal(spendingSlaver.resources, 1);
    assert.equal(s.activeLocation.id, southern.id);
    assert.deepEqual(s.city.corsairDeck, [code("Umbar Raider")]);
    await checkpoint(page, "belfalas-travel-and-watch-tower-entry", width);
    await resume(page);
    // A separate land fixture removes the fleet's ally discount and gives
    // the printed ally cost two distinct matching resource pools.
    s = F.setStage(F.base(), 3);
    s.phase = "planning";
    const paymentSlaver = make(s, code("Umbar Slaver"));
    paymentSlaver.owner = 0;
    paymentSlaver.resources = 1;
    s.engaged.push(paymentSlaver);
    const paidAlly = make(s, "01013");
    s.hand = [paidAlly];
    s.heroes.forEach((u, index) => {
      u.resources = index < 2 ? 1 : 0;
    });
    await load(page, s);
    await boardCard(page, paidAlly.id)
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await checkpoint(page, "slaver-two-pool-payment-choice", width);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    s = await settle(page);
    assert.ok(s.allies.some((u) => u.id === paidAlly.id));
    assert.equal(
      s.heroes.reduce((n, u) => n + u.resources, 0),
      0,
    );
    assert.equal(
      get(s, paymentSlaver.id).resources,
      2,
      "a two-pool payment triggers the Slaver once",
    );
    await checkpoint(page, "slaver-single-spending-instruction", width);

    // Off-course progress cannot bypass the original stage-one restriction.
    s = F.base();
    s.phase = "staging";
    s.sailing.heading = 1;
    commitPower(s, 40);
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.stage, 1);
    assert.equal(s.progress, 0);
    await checkpoint(page, "off-course-blocks-sea-progress", width);

    // On-course progress resolves both printed transition faces and activates the land deck.
    s = F.base();
    s.phase = "staging";
    s.sailing.heading = 0;
    const fleet = allCharacters(s).filter(
      (u) => card(u.code).type_code === "ship-objective",
    );
    for (const u of fleet) u.damage = 1;
    commitPower(s, 40);
    await load(page, s);
    await resolveQuest(page);
    await checkpoint(page, "fate-of-dream-chaser-damage-choice", width);
    await resume(page);
    s = await settle(page);
    assert.equal(s.stage, 3);
    assert.ok(!s.sailing);
    assert.equal(s.city.secondDeck.length, 0);
    assert.equal(s.city.corsairDeck.length, 0);
    assert.equal(s.city.corsairDiscard.length, 0);
    assert.ok(s.city.inactiveDeck.length + s.city.inactiveDiscard.length > 0);
    assert.ok(
      !allCharacters(s).some(
        (u) => card(u.code).type_code === "ship-objective",
      ),
    );
    assert.ok(
      ![...s.staging, ...allEngaged(s)].some(
        (u) => card(u.code).type_code === "ship-enemy",
      ),
    );
    await assertPrivate(page, s);
    await checkpoint(page, "sea-to-land-deck-transition", width);
    assert.deepEqual((await resume(page)).city, s.city);

    // The alternate sea route destroys the printed 18-hit-point Stormcaller
    // through an actual Ship attack and retains that outcome on land.
    s = F.base();
    s.phase = "attack";
    const stormcaller = make(s, code("Stormcaller"));
    stormcaller.owner = 0;
    stormcaller.damage = 17;
    s.engaged.push(stormcaller);
    const attackingShip = allCharacters(s).find(
      (u) => u.code === code("Dream-chaser"),
    );
    attackingShip.tempAttack = 10;
    await load(page, s);
    await attack(page, stormcaller, [attackingShip]);
    s = await settle(page);
    assert.equal(s.stage, 3);
    assert.equal(s.city.stormcallerDestroyed, true);
    assert.ok(!s.sailing);
    await checkpoint(page, "stormcaller-destruction-reaches-land", width);
    await resume(page);

    // Progress cannot win the final confrontation before Sahír is destroyed.
    s = F.setStage(F.base(), 4);
    s.phase = "staging";
    const progressCaptain = fromAside(s, "Captain Sahír");
    progressCaptain.owner = 0;
    s.engaged.push(progressCaptain);
    commitPower(s, 40);
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.status, "playing");
    assert.equal(s.stage, 4);
    assert.ok(get(s, progressCaptain.id));
    await checkpoint(page, "final-progress-does-not-bypass-captain", width);

    // Other enemy resources protect Sahír. Destroying that enemy moves its
    // actual resource to Sahír; a later attack spends his shield and wins.
    s = F.setStage(F.base(), 4);
    s.phase = "attack";
    const captain = fromAside(s, "Captain Sahír"),
      resourceRaider = make(s, code("Umbar Raider"));
    captain.owner = resourceRaider.owner = 0;
    captain.resources = 2;
    resourceRaider.resources = 1;
    s.engaged.push(captain, resourceRaider);
    const fighters = s.heroes.slice(0, 3);
    for (const u of fighters) u.tempAttack = 20;
    await load(page, s);
    s = await attack(page, captain, [fighters[0]]);
    s = await settle(page);
    assert.equal(s.status, "playing");
    assert.ok(
      get(s, captain.id),
      "another enemy's resource keeps Sahír indestructible",
    );
    assert.equal(
      get(s, captain.id).resources,
      0,
      "each prevented damage spends a real Sahír resource",
    );
    await checkpoint(page, "sahir-resource-shield-and-indestructible", width);
    await resume(page);
    s = await attack(page, resourceRaider, [fighters[1]]);
    s = await settle(page);
    assert.ok(!get(s, resourceRaider.id));
    assert.equal(
      get(s, captain.id).resources,
      1,
      "destroyed enemy resources move to Sahír",
    );
    await checkpoint(page, "destroyed-raider-transfers-resources", width);
    await resume(page);
    // Each player can attack a given enemy once per round. A separate valid
    // final-attack fixture tests the last resource without granting a repeat.
    s = F.setStage(F.base(), 4);
    s.phase = "attack";
    const finalCaptain = fromAside(s, "Captain Sahír");
    finalCaptain.owner = 0;
    finalCaptain.resources = 1;
    finalCaptain.damage = 7;
    s.engaged.push(finalCaptain);
    const finalFighter = s.heroes[0];
    finalFighter.tempAttack = 20;
    await load(page, s);
    const publicFinal = await reviewedState(page);
    assert.equal(
      publicFinal.city.sahir.indestructible,
      true,
      "Sahír's own final resource grants indestructibility before the attack",
    );
    s = await attack(page, finalCaptain, [finalFighter]);
    s = await settle(page);
    assert.equal(s.status, "won");
    assert.ok(!get(s, finalCaptain.id));
    assert.ok(s.victoryCards.includes(code("Captain Sahír")));
    await checkpoint(page, "captain-destruction-victory", width);

    // The original Dream-chaser destruction condition remains a real loss.
    s = F.base();
    s.phase = "defense";
    const doomed = allCharacters(s).find(
      (u) => u.code === code("Dream-chaser"),
    );
    doomed.damage = stats(s, doomed).health - 1;
    const lossEnemy = make(s, code("Stormcaller"));
    lossEnemy.owner = 0;
    lossEnemy.tempAttack = 20;
    lossEnemy.shadows = [];
    s.engaged.push(lossEnemy);
    await load(page, s);
    s = await defend(page, lossEnemy, doomed);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Dream-chaser/);
    await checkpoint(page, "dream-chaser-destruction-defeat", width);

    // Every original gameplay face is read through ordinary card and quest dialogs.
    s = F.base();
    s.encounterDiscard = CITY_ENCOUNTERS.map((c) => c.code);
    await load(page, s);
    await page
      .getByRole("button", {
        name: `Browse encounter discard: ${CITY_ENCOUNTERS.length} cards`,
        exact: true,
      })
      .click();
    for (const c of CITY_ENCOUNTERS) {
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
    for (const [index, c] of CITY_QUESTS.toSorted(
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
      "src/data/pending/the-city-of-corsairs-import.json",
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
  assert.deepEqual(
    [...printedFaces].sort(),
    bundle.artwork.map((a) => a.localPath).sort(),
    "the actual encounter and quest dialogs cover exactly all 43 original faces",
  );
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
    `City of Corsairs browser checks passed: ${checks.length}; original artworks: ${artwork.length}`,
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
