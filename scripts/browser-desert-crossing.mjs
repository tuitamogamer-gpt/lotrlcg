import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/desert-crossing-fixtures.ts";
import {
  DESERT_CROSSING as D,
  DESERT_CROSSING_ENCOUNTERS as ENCOUNTERS,
  DESERT_CROSSING_QUESTS as QUESTS,
} from "../src/game/desert-crossing-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { sideQuestStart } from "../src/game/side-quests.ts";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  syncSeat,
} from "../src/game/table.ts";
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

const widths = (process.env.DESERT_WIDTHS ?? "1280,390,320")
  .split(",")
  .map(Number);
assert.ok(widths.length && widths.every((w) => [1280, 390, 320].includes(w)));
const dir = process.env.DESERT_OUTPUT_DIR ?? "output/desert-crossing-scenario";
const smoke = widths.join(",") !== "1280,390,320";
const sourceScriptSha256 = crypto
  .createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [],
  checks = [],
  entries = new Set(),
  printedFaces = new Set(),
  artwork = [];
let page;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function checkpoint(p, label, width) {
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
async function chooseOption(p, predicate) {
  const s = await saved(p);
  const o = s.choice?.options.find(predicate);
  assert.ok(o, JSON.stringify(s.choice));
  return choose(p, o.id);
}
async function resolveQuest(p) {
  await p
    .getByRole("button", { name: "Resolve quest", exact: true })
    .last()
    .click();
  await reviewedState(p);
  return saved(p);
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
async function attack(p, enemy, fighter) {
  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Attack", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(fighter.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: /^Attack · [0-9]+ power$/ })
    .click();
  await reviewedState(p);
  return settle(p);
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
        await fresh(page, "desert-crossing", players, easy);
        await page.locator("#start-btn").click();
        const s = await opening(page);
        assert.equal(s.scenarioId, "desert-crossing");
        assert.equal(s.desertCrossing.temperature, 10);
        assert.equal(s.staging.length, players);
        assert.ok(s.staging.every((u) => u.code === D.sands));
        assert.equal(s.encounterDeck.length + s.staging.length, easy ? 31 : 37);
        assert.equal(s.encounterDeck.filter((c) => c === D.heat).length, 2);
        const publicState = await reviewedState(page);
        assert.equal(publicState.desertCrossing.temperature, 10);
        assert.equal(await page.locator('[data-scenario-panel="harad"]').count(), 1);
        assert.match(await page.locator("[data-harad-temperature]").textContent(), /Temperature · 10 \/ 60/);
        assert.equal(await page.getByRole("meter", { name: "Desert temperature" }).getAttribute("value"), "10");
        await checkpoint(
          page,
          `setup-${players}-${easy ? "easy" : "normal"}`,
          width,
        );
        assert.deepEqual((await resume(page)).desertCrossing, s.desertCrossing);
      }
    // Actual quest resolution advances into the printed per-player reveal.
    let s = F.base(2);
    s.phase = "staging";
    s.encounterDeck = [D.sands, D.sands, D.worm];
    commitPower(s, 12);
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.stage, 2);
    assert.equal(s.desertCrossing.temperature, 12);
    assert.equal(s.staging.length, 2);
    await checkpoint(page, "stage-two-heat-and-per-player-reveal", width);
    await resume(page);
    // Stage three searches distinct physical copies from discard and deck.
    s = F.setStage(F.base(2), 2);
    s.phase = "staging";
    s.encounterDeck = [D.worm];
    s.encounterDiscard = [D.worm];
    commitPower(s, 12);
    await load(page, s);
    await resolveQuest(page);
    await checkpoint(page, "stage-three-wereworm-search-choice", width);
    await resume(page);
    s = await settle(page);
    assert.equal(s.stage, 3);
    assert.equal(s.staging.filter((u) => u.code === D.worm).length, 2);
    assert.equal(s.desertCrossing.temperature, 12);
    await checkpoint(page, "stage-three-two-physical-wereworms", width);
    // Printed restriction blocks a progress victory while a Were-worm survives.
    s = F.setStage(F.base(), 3);
    s.phase = "staging";
    const blocking = make(s, D.worm);
    blocking.owner = 0;
    s.engaged.push(blocking);
    commitPower(s, 25);
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.status, "playing");
    assert.ok(s.progress >= 16);
    await checkpoint(page, "wereworm-blocks-progress-victory", width);
    // A real player attack destroys the last blocker and wins with saved progress.
    s = F.setStage(F.base(), 3);
    s.phase = "attack";
    s.progress = 16;
    const last = make(s, D.worm);
    last.owner = 0;
    last.damage = 4;
    s.engaged.push(last);
    s.heroes[0].tempAttack = 20;
    await load(page, s);
    s = await attack(page, last, s.heroes[0]);
    assert.equal(s.status, "won");
    assert.ok(!get(s, last.id));
    await checkpoint(page, "last-wereworm-destruction-victory", width);
    // Real travel enters Burnt Sands and reaches the immediate heat loss.
    s = F.base();
    s.phase = "travel";
    s.desertCrossing.temperature = 58;
    const doomed = make(s, D.sands);
    s.staging = [doomed];
    await load(page, s);
    await boardCard(page, doomed.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    s = await settle(page);
    assert.equal(s.status, "lost");
    assert.equal(s.desertCrossing.temperature, 60);
    await checkpoint(page, "temperature-sixty-immediate-defeat", width);
    // Scorched Hamada uses actual damage assignment and save/reload controls.
    s = F.base(2);
    s.phase = "travel";
    s.desertCrossing.temperature = 31;
    const hamada = make(s, D.hamada);
    s.staging = [hamada];
    await load(page, s);
    await boardCard(page, hamada.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await checkpoint(page, "hamada-shared-damage-choice", width);
    await resume(page);
    s = await settle(page);
    assert.equal(
      allCharacters(s).reduce((n, u) => n + u.damage, 0),
      3,
    );
    await checkpoint(page, "hamada-shared-damage-paid", width);
    // A real quest reveal opens A Test of Will and cancels only the printed
    // When Revealed heat increase; printed Surge still reveals the next card.
    s = F.base();
    s.phase = "quest";
    s.heroes[0].code = "01007";
    s.heroes[0].resources = 1;
    s.hand = [make(s, "01050")];
    s.encounterDeck = [D.scorch, D.sands];
    commitPower(s, 3);
    await load(page, s);
    await next(page);
    await checkpoint(page, "scorching-sun-cancellation-choice", width);
    await resume(page);
    s = await chooseOption(page, (o) => o.code === "01050");
    s = await settle(page);
    assert.equal(s.desertCrossing.temperature, 10);
    assert.ok(s.staging.some((u) => u.code === D.sands));
    await checkpoint(page, "scorching-sun-cancelled-but-surge-resolves", width);
    // Seek Shade is defeated through actual quest controls and its optional
    // response reduces heat rather than substituting a test-only state write.
    s = F.base();
    s.phase = "quest";
    s.desertCrossing.temperature = 29;
    const shade = make(s, D.shade);
    s.staging = [shade];
    s.encounterDeck = [D.sands];
    commitPower(s, 10);
    sideQuestStart(s);
    flush(s);
    await load(page, s);
    await chooseOption(page, (o) => o.code === D.shade || o.id === shade.id);
    await next(page);
    await resolveQuest(page);
    await checkpoint(page, "seek-shade-defeated-response", width);
    await resume(page);
    s = await chooseOption(page, (o) => o.id === "reduce");
    s = await settle(page);
    assert.equal(s.desertCrossing.temperature, 19);
    assert.ok(s.victoryCards.includes(D.shade));
    await checkpoint(page, "seek-shade-temperature-reduced", width);
    // Poison arises from a real Giant Scorpion combat damage assignment.
    s = F.base();
    s.phase = "defense";
    const scorpion = make(s, D.scorpion);
    scorpion.owner = 0;
    scorpion.shadows = [];
    s.engaged = [scorpion];
    s.heroes[0].tempDefense = -1;
    await load(page, s);
    s = await defend(page, scorpion, s.heroes[0]);
    assert.ok(s.desertCrossing.poisoned.length);
    await checkpoint(page, "giant-scorpion-actual-damage-poison", width);
    const poison = s.desertCrossing.poisoned;
    assert.deepEqual((await resume(page)).desertCrossing.poisoned, poison);
    // Original artwork and both printed quest faces use ordinary app dialogs.
    s = F.base();
    s.encounterDiscard = ENCOUNTERS.map((c) => c.code);
    await load(page, s);
    await page
      .getByRole("button", {
        name: `Browse encounter discard: ${ENCOUNTERS.length} cards`,
        exact: true,
      })
      .click();
    for (const c of ENCOUNTERS) {
      await page
        .locator(".pile-entry")
        .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
        .getByRole("button")
        .first()
        .click();
      await printed(page, card(c.code));
      await checkpoint(page, `printed-encounter-${c.code.slice(6, 14)}`, width);
      await close(page);
    }
    await close(page);
    for (const [i, c] of QUESTS.toSorted(
      (a, b) => Number(a.cost) - Number(b.cost),
    ).entries()) {
      s = F.setStage(F.base(), i + 1);
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
      await checkpoint(page, `printed-quest-${i + 1}-both-faces`, width);
      await close(page);
    }
    await view.c.close();
  }
  const bundle = JSON.parse(
    await fs.readFile("src/data/pending/desert-crossing-import.json", "utf8"),
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
  assert.deepEqual(
    [...printedFaces].sort(),
    bundle.artwork.map((a) => a.localPath).sort(),
    "All23 original faces are read through real dialogs",
  );
  await artPage.close();
  await report(dir, {
    smoke,
    sourceScriptSha256,
    errors,
    screenshots,
    checks,
    entries,
    printedFaces: [...printedFaces],
    artwork,
  });
  console.log(
    `Desert Crossing browser checks passed: ${checks.length}; artwork: ${artwork.length}`,
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
