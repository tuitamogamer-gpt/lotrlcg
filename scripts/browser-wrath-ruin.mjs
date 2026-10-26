import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { card, imageUrl, plain } from "../src/game/cards.ts";
import { make, stageInfo } from "../src/game/core.ts";
import { validateSave } from "../src/game/engine.ts";
import {
  allCharacters,
  allEngaged,
  seatView,
  syncSeat,
} from "../src/game/table.ts";
import {
  WRATH_RUIN as W,
  WRATH_RUIN_RECIPES,
  wrathRuinPublicState,
} from "../src/game/wrath-ruin-support.ts";
import { base } from "../tests/wrath-ruin-fixtures.ts";
import { WRATH_RUIN_SCENARIO_ART } from "../tests/wrath-ruin-scenario-art.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  opening,
  next,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";

const widths = process.env.WRATH_RUIN_WIDTHS
  ? process.env.WRATH_RUIN_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(widths.length && widths.every((n) => [1280, 390, 320].includes(n)));
const skipSetup = process.env.WRATH_RUIN_SKIP_SETUP === "1";
const dir = process.env.WRATH_RUIN_OUTPUT_DIR ?? "output/wrath-ruin";
await fs.mkdir(dir, { recursive: true });
const sourceScriptSha256 = crypto
  .createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const errors = [],
  screenshots = [],
  checks = [],
  setups = [],
  artwork = [],
  entries = new Set(),
  printedFaces = new Set();
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
const scenarioPanel = (p) =>
  p.locator('[data-scenario-panel="wrath-and-ruin"]');
let page;

function staged(s, code) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function owned(s, code, player = 0) {
  const u = make(s, code);
  u.owner = player;
  s.wrathRuin.controlled.push(u);
  return u;
}
function stageTwo(s) {
  s.stage = 2;
  s.wrathRuin.currentQuest = W.second;
  s.progress = 0;
  return s;
}
function committing(s) {
  s.phase = "staging";
  Object.assign(s.heroes[0], {
    committed: true,
    exhausted: true,
    tempWill: 100,
  });
  s.committedIds = [s.heroes[0].id];
  return s;
}
function prepare(s, label) {
  syncSeat(s);
  assert.ok(validateSave(s), `valid Wrath browser fixture: ${label}`);
  return s;
}

// Fixtures establish legal positions; every behavior below is exercised by a
// native browser action, rather than invoking the scenario's effect handlers.
const exploration = base();
exploration.activeLocation = make(exploration, W.forum);
exploration.activeLocation.progress = 4;
exploration.activeLocation.resources = 2;
committing(exploration);
const transition = base(2);
owned(transition, W.square, 0);
owned(transition, W.house, 0);
const returnedTavern = owned(transition, W.tavern, 0);
owned(transition, W.forum, 1);
owned(transition, W.square, 1);
transition.encounterDiscard = [W.siege];
transition.encounterDeck = [W.square, W.raider, W.raider];
transition.progress = 12;
transition.phase = "refresh";
const house = base();
const houseUnit = staged(house, W.house);
const houseCostLocation = owned(house, W.square);
house.phase = "encounter";
house.encounterDiscard = [W.raider, W.square, W.champion, W.siege];
const tavern = base();
const tavernUnit = staged(tavern, W.tavern);
tavern.phase = "travel";
tavern.encounterDeck = [
  W.fighting,
  W.house,
  W.fortification,
  W.siege,
  W.raider,
];
const fury = base();
fury.phase = "attack";
const furyEnemy = make(fury, W.raider);
furyEnemy.owner = 0;
furyEnemy.attachments.push({
  id: `a${fury.nextId++}`,
  code: W.fury,
  exhausted: false,
});
fury.engaged.push(furyEnemy);
const furySquare = staged(fury, W.square);
fury.heroes[0].tempAttack = 100;
const gateTravel = stageTwo(base(2));
const gateUnit = staged(gateTravel, W.gate);
staged(gateTravel, W.ulchor).tempAttack = -5;
owned(gateTravel, W.square);
owned(gateTravel, W.house);
gateTravel.progress = 12;
gateTravel.phase = "travel";
gateTravel.encounterDeck = Array(10).fill(W.square);
const gateProgressBlocked = structuredClone(gateTravel);
gateProgressBlocked.progress = 11;
const gateControlBlocked = structuredClone(gateTravel);
staged(gateControlBlocked, W.forum);
const gateVictory = stageTwo(base());
gateVictory.progress = 12;
gateVictory.activeLocation = make(gateVictory, W.gate);
committing(gateVictory);
const loss = base();
// The framework threat increase occurs on entry into refresh, after combat.
loss.phase = "attack";
loss.threat = 49;
const encounters = [
  ...new Set(
    WRATH_RUIN_SCENARIO_ART.filter(
      (a) => card(a.code).type_code !== "quest",
    ).map((a) => a.code),
  ),
].map(card);
const printed = base();
printed.encounterDiscard = encounters.map((c) => c.code);
for (const [label, state] of Object.entries({
  exploration,
  transition,
  house,
  tavern,
  fury,
  gateTravel,
  gateProgressBlocked,
  gateControlBlocked,
  gateVictory,
  loss,
  printed,
}))
  prepare(state, label);
console.log("Wrath browser fixtures validate");

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
async function settle(p, preferred, attackPlayers) {
  for (let i = 0; i < 240; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (s.combat && attackPlayers) attackPlayers.add(s.combat.attackPlayer);
    if (!s.choice) return s;
    await choose(
      p,
      s.choice.options.find((o) => o.id === preferred)?.id ??
        s.choice.options.find((o) =>
          ["skip", "resolve", "location", "undefended"].includes(o.id),
        )?.id ??
        s.choice.options[0].id,
    );
  }
  throw Error("Wrath browser decisions did not settle");
}
async function panel(p, s) {
  const q = wrathRuinPublicState(s),
    el = scenarioPanel(p);
  assert.equal(await el.count(), 1);
  const text = await el.locator("[data-wrath-control-counts]").innerText();
  assert.ok(text.includes(`${q.controlledCount} locations controlled`));
  assert.ok(text.includes(`${q.stagedCount} locations in the staging area`));
  assert.equal(
    await el.locator("[data-controlled-location]").count(),
    q.controlledCount,
  );
  for (const u of q.controlled)
    assert.ok(
      (
        await el.locator(`[data-controlled-location="${u.id}"]`).innerText()
      ).includes(card(u.code).name),
    );
}
async function printedFace(p, c, reverse = false) {
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
  const path = reverse ? expected.imagesrc : imageUrl(expected);
  assert.equal(new URL(await img.getAttribute("src"), p.url()).pathname, path);
  assert.ok(
    await img.evaluate(async (i) => {
      await i.decode();
      return i.naturalWidth > 0;
    }),
  );
  const shadow = p.locator(".card-detail-primary .shadow-text");
  if (expected.shadow)
    assert.equal(await shadow.textContent(), plain(expected.shadow));
  else assert.equal(await shadow.count(), 0);
  printedFaces.add(path);
}
async function setup(p, players, easy, classic, width) {
  await fresh(p, "wrath-and-ruin", players, easy);
  if (classic) await p.getByRole("button", { name: /Classic solo/ }).click();
  await p.locator("#start-btn").click();
  const s = await opening(p);
  assert.equal(s.scenarioId, "wrath-and-ruin");
  assert.equal(s.phase, "resource");
  assert.equal(s.status, "playing");
  assert.equal(!!s.table, !classic);
  if (!classic) assert.equal(s.table.seats.length, players);
  assert.equal(!!s.easyMode, easy);
  assert.equal(s.wrathRuin.initialized, true);
  assert.equal(s.activeLocation.code, W.fortification);
  assert.equal(s.staging.length, players + 2);
  assert.equal(s.staging.filter((u) => u.code === W.ulchor).length, 1);
  assert.equal(s.staging.filter((u) => u.code === W.gate).length, 1);
  assert.equal(s.wrathRuin.setupChosen.length, players);
  assert.equal(new Set(s.wrathRuin.setupChosen).size, players);
  assert.equal(stageInfo(s).quest, 4 + 4 * players);
  const physical = [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...s.staging.map((u) => u.code),
    s.activeLocation.code,
  ].sort();
  const recipe = WRATH_RUIN_RECIPES.find(
    (r) => r.mode === (easy ? "easy" : "standard"),
  );
  assert.deepEqual(
    physical,
    recipe.cards
      .filter((r) => r.section !== "sharedQuestDeck")
      .flatMap((r) => Array(r.quantity).fill(r.code))
      .sort(),
  );
  assert.equal(physical.length, easy ? 38 : 50);
  await panel(p, s);
  const restored = await resume(p);
  assert.deepEqual(restored.wrathRuin, s.wrathRuin);
  setups.push({ width, players, classic, easy, physical: physical.length });
  await checkpoint(
    p,
    `setup-${classic ? "classic" : players}-${easy ? "easy" : "normal"}`,
    width,
  );
}

const browser = await chromium.launch({ headless: true });
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
    await page.addInitScript(() =>
      localStorage.setItem(
        "there-and-back-again.audio.v1",
        '{"muted":true,"volume":0.3}',
      ),
    );
    if (!skipSetup) {
      for (const easy of [false, true]) await setup(page, 1, easy, true, width);
      for (const players of [1, 2, 3, 4])
        for (const easy of [false, true])
          await setup(page, players, easy, false, width);
    }

    await load(page, exploration);
    let s = await next(page);
    s = await settle(page);
    const captured = s.wrathRuin.controlled.find(
      (u) => u.id === exploration.activeLocation.id,
    );
    assert.ok(captured);
    assert.equal(captured.progress, 0);
    assert.equal(captured.resources, 2);
    assert.equal(s.activeLocation, null);
    assert.ok(!s.encounterDiscard.includes(W.forum));
    assert.equal(s.stage, 1, "quest completion still waits until end of round");
    assert.deepEqual((await resume(page)).wrathRuin, s.wrathRuin);
    await panel(page, s);
    await checkpoint(page, "native-exploration-control", width);
    await scenarioPanel(page)
      .locator(`[data-controlled-location="${captured.id}"]`)
      .click();
    await printedFace(page, card(W.forum));
    await checkpoint(page, "controlled-location-inspector", width);
    await close(page);

    await load(page, transition);
    s = await next(page);
    assert.equal(s.stage, 2);
    assert.equal(s.stageRevealing, true);
    assert.ok(s.choice.options.some((o) => o.id === returnedTavern.id));
    const highestChoice = s.choice;
    assert.deepEqual((await resume(page)).choice, highestChoice);
    await checkpoint(page, "stage-two-highest-threat-choice", width);
    await choose(page, returnedTavern.id);
    s = await settle(page);
    assert.equal(s.stageRevealing, false);
    assert.equal(s.wrathRuin.currentQuest, W.second);
    assert.equal(s.progress, 0);
    assert.ok(s.staging.some((u) => u.id === returnedTavern.id));
    assert.equal(allEngaged(s).length, 2);
    await panel(page, s);
    assert.deepEqual((await resume(page)).wrathRuin, s.wrathRuin);
    await checkpoint(page, "native-stage-two-end-round", width);

    await load(page, house);
    await boardCard(page, houseUnit.id)
      .getByRole("button", {
        name: "Engage the top discarded enemy to control Ransacked House",
        exact: true,
      })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.ok(
      s.choice,
      "engagement Forced ability resolves during the House cost",
    );
    assert.ok(!s.wrathRuin.controlled.some((u) => u.id === houseUnit.id));
    assert.equal(s.engaged.at(-1).code, W.champion);
    assert.ok(s.choice.options.some((o) => o.id === houseCostLocation.id));
    const houseChoice = s.choice;
    assert.deepEqual((await resume(page)).choice, houseChoice);
    await checkpoint(page, "house-engagement-cost-choice", width);
    await choose(page, houseCostLocation.id);
    s = await settle(page);
    assert.ok(s.wrathRuin.controlled.some((u) => u.id === houseUnit.id));
    assert.ok(s.staging.some((u) => u.id === houseCostLocation.id));
    assert.deepEqual(s.encounterDiscard, [W.raider, W.square, W.siege]);
    await panel(page, s);
    await checkpoint(page, "native-house-action", width);

    await load(page, tavern);
    await boardCard(page, tavernUnit.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.wrathRuin.looked.length, 5);
    assert.match(s.choice.title, /Seedy Tavern/);
    assert.ok(
      s.choice.options.every((o) => /^Choose looked card \d+$/.test(o.label)),
    );
    const privateSnapshot = await page.evaluate(() => {
      const state = JSON.parse(window.render_game_to_text());
      return JSON.stringify({
        choice: state.choice,
        wrathRuin: state.wrathRuin,
      });
    });
    for (const hidden of s.wrathRuin.looked) {
      assert.ok(
        !privateSnapshot.includes(hidden.code),
        "public snapshot omits looked-card codes",
      );
      assert.ok(
        !privateSnapshot.includes(card(hidden.code).name),
        "public snapshot omits looked-card titles",
      );
    }
    const privateChoice = s.choice;
    assert.deepEqual((await resume(page)).choice, privateChoice);
    await checkpoint(page, "tavern-private-travel-choice", width);
    await choose(page, s.choice.options.find((o) => o.code === W.fighting).id);
    s = await settle(page);
    assert.equal(s.activeLocation.id, tavernUnit.id);
    assert.equal(s.wrathRuin.storedCards[0].cards[0].code, W.fighting);
    const publicText = await scenarioPanel(page).innerText();
    assert.ok(publicText.includes("Hidden beneath a location · 1 cards"));
    assert.ok(
      !publicText.includes(card(W.fighting).name),
      "public panel does not reveal a hidden card's identity",
    );
    assert.deepEqual((await resume(page)).wrathRuin, s.wrathRuin);
    await checkpoint(page, "tavern-hidden-count", width);
    // Resume that physical Tavern at the quest-resolution action window.
    committing(s);
    await load(page, prepare(s, "Tavern quest window"));
    s = await next(page);
    assert.equal(s.wrathRuin.pendingExplored[0].id, tavernUnit.id);
    assert.equal(s.choice.options.length, 2);
    const whenChoice = s.choice;
    assert.deepEqual((await resume(page)).choice, whenChoice);
    await checkpoint(page, "tavern-exploration-order", width);
    await choose(
      page,
      s.choice.options.find((o) =>
        o.effects.some((e) => e.kind === "wrathTavernReveal"),
      ).id,
    );
    s = await settle(page);
    assert.equal(
      allCharacters(s).reduce((n, u) => n + u.damage, 0),
      1,
    );
    assert.ok(s.wrathRuin.controlled.some((u) => u.id === tavernUnit.id));
    assert.equal(s.wrathRuin.storedCards.length, 0);
    await checkpoint(page, "native-tavern-exploration", width);

    await load(page, fury);
    await boardCard(page, furyEnemy.id)
      .getByRole("button", { name: "Attack", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: card(fury.heroes[0].code).name,
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: /^Attack · \d+ power$/ }).click();
    s = await settle(page);
    const survived = allEngaged(s).find((u) => u.id === furyEnemy.id);
    assert.ok(survived);
    assert.equal(survived.damage, 0);
    assert.ok(!survived.attachments.some((a) => a.code === W.fury));
    assert.ok(s.encounterDiscard.includes(W.fury));
    assert.equal(s.staging.find((u) => u.id === furySquare.id).progress, 0);
    assert.deepEqual((await resume(page)).engaged, s.engaged);
    await checkpoint(page, "native-fury-destruction-replacement", width);

    for (const [label, fixture, reason] of [
      ["gate-progress-travel-lock", gateProgressBlocked, /12 progress/],
      ["gate-control-travel-lock", gateControlBlocked, /more locations/],
    ]) {
      await load(page, fixture);
      const travel = boardCard(page, gateUnit.id).getByRole("button", {
        name: "Travel here",
        exact: true,
      });
      assert.equal(await travel.isDisabled(), true);
      assert.match(await travel.getAttribute("title"), reason);
      await checkpoint(page, label, width);
    }
    await load(page, gateTravel);
    await boardCard(page, gateUnit.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.activeLocation, null);
    assert.equal(s.combat.attackPlayer, 0);
    assert.deepEqual((await resume(page)).choice, s.choice);
    await checkpoint(page, "gate-first-ulchor-attack", width);
    const attacked = new Set();
    s = await settle(page, "undefended", attacked);
    assert.deepEqual([...attacked].sort(), [0, 1]);
    assert.equal(s.activeLocation.id, gateUnit.id);
    for (const player of [0, 1])
      assert.equal(
        seatView(s, player).heroes.reduce((n, u) => n + u.damage, 0),
        1,
      );
    assert.deepEqual((await resume(page)).wrathRuin, s.wrathRuin);
    await checkpoint(page, "native-gate-travel-all-players", width);

    await load(page, gateVictory);
    s = await settle(page)
      .then(() => next(page))
      .then(() => settle(page));
    assert.equal(s.status, "playing");
    assert.ok(
      s.wrathRuin.controlled.some(
        (u) => u.id === gateVictory.activeLocation.id,
      ),
    );
    assert.ok(!s.victoryCards?.includes(W.gate));
    await panel(page, s);
    await checkpoint(page, "native-gate-capture-waits", width);
    for (let n = 0; s.status === "playing"; n++) {
      assert.ok(n < 12, "Gate win occurs at the next end of round");
      await next(page);
      s = await settle(page);
    }
    assert.equal(s.status, "won");
    assert.equal((await resume(page)).status, "won");
    await checkpoint(page, "native-end-round-victory", width);

    await load(page, loss);
    await next(page);
    s = await settle(page);
    assert.equal(s.status, "lost");
    assert.equal((await resume(page)).status, "lost");
    await checkpoint(page, "native-threat-loss", width);

    await load(page, printed);
    await page
      .getByRole("button", {
        name: `Browse encounter discard: ${encounters.length} cards`,
        exact: true,
      })
      .click();
    for (const c of encounters) {
      await page
        .locator(".pile-entry")
        .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
        .getByRole("button")
        .first()
        .click();
      await printedFace(page, c);
      await checkpoint(page, `printed-encounter-${c.code.slice(6, 14)}`, width);
      await close(page);
    }
    await close(page);
    for (const [index, code] of [W.first, W.second].entries()) {
      const state = base();
      if (index) stageTwo(state);
      await load(page, state);
      await scenarioPanel(page)
        .getByRole("button", { name: "Inspect current quest", exact: true })
        .click();
      await printedFace(page, card(code));
      await checkpoint(page, `printed-quest-${index + 1}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await printedFace(page, card(code), true);
      await checkpoint(page, `printed-quest-${index + 1}-back`, width);
      await close(page);
    }
    await scenarioPanel(page)
      .getByRole("button", { name: "Inspect Gate of Dorwinion", exact: true })
      .click();
    await printedFace(page, card(W.gate));
    await checkpoint(page, "gate-panel-inspector", width);
    await close(page);
    await view.c.close();
  }
  const artPage = await browser.newPage();
  for (const a of WRATH_RUIN_SCENARIO_ART) {
    const response = await artPage.request.get(new URL(a.localPath, url).href);
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(bytes.length, a.bytes);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      a.sha256,
    );
    const decoded = await artPage.evaluate(
      async (bytes) => {
        const bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(bytes)]),
        );
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return size;
      },
      [...bytes],
    );
    assert.ok(decoded.width > 0 && decoded.height > 0);
    artwork.push({
      path: a.localPath,
      sha256: a.sha256,
      bytes: a.bytes,
      ...decoded,
    });
  }
  await artPage.close();
  assert.deepEqual(
    [...printedFaces].sort(),
    WRATH_RUIN_SCENARIO_ART.map((a) => a.localPath).sort(),
  );
  await report(dir, {
    smoke: skipSetup || widths.join(",") !== "1280,390,320",
    sourceScriptSha256,
    errors,
    screenshots,
    entries,
    checks,
    setups,
    printedFaces: [...printedFaces],
    artwork,
  });
  console.log(
    `Wrath and Ruin browser passed ${checks.length} checkpoints, ${setups.length} setups, ${artwork.length} original faces`,
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
    await fs.writeFile(
      `${dir}/failure.json`,
      JSON.stringify(
        {
          error: String(error),
          stack: error.stack,
          state: await saved(page).catch(() => null),
          errors,
          checks,
          entries: [...entries],
        },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  await browser.close();
}
