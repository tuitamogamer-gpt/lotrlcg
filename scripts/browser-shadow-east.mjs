import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { card, imageUrl } from "../src/game/cards.ts";
import { applyAction, validateSave } from "../src/game/engine.ts";
import { fx, make, stats } from "../src/game/core.ts";
import { handle, flush } from "../src/game/effects.ts";
import { allEngaged, syncSeat } from "../src/game/table.ts";
import { base as riverBase } from "../tests/river-running-fixtures.ts";
import { base as dangerBase } from "../tests/danger-dorwinion-fixtures.ts";
import { base as templeBase } from "../tests/temple-doom-fixtures.ts";
import {
  RIVER_RUNNING as R,
  riverRunningPublicState,
} from "../src/game/river-running-support.ts";
import {
  DANGER_DORWINION as D,
  dangerDorwinionPublicState,
} from "../src/game/danger-dorwinion-support.ts";
import {
  TEMPLE_DOOM as T,
  TEMPLE_DOOM_QUESTS,
  templeDoomPublicState,
} from "../src/game/temple-doom-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178",
  dir = "output/shadow-east";
await fs.mkdir(dir, { recursive: true });
const recipes = ["the-river-running", "danger-in-dorwinion", "temple-of-doom"];
const bundles = await Promise.all(
  recipes.map(async (id) =>
    JSON.parse(
      await fs.readFile("src/data/pending/" + id + "-import.json", "utf8"),
    ),
  ),
);
const faces = bundles
  .flatMap((b) => b.cards.map((c) => card(c.code)))
  .flatMap((c) => [imageUrl(c), ...(c.back_imagesrc ? [c.back_imagesrc] : [])]);
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [],
  setups = [],
  entries = new Set();
let page;
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
const publicView = (s) =>
  riverRunningPublicState(s) ??
  dangerDorwinionPublicState(s) ??
  templeDoomPublicState(s);
async function resume(p) {
  await p.reload();
  entries.add(
    await p.locator('script[type="module"][src]').first().getAttribute("src"),
  );
  await p.locator("#start-btn").click();
  await reviewedState(p);
  return saved(p);
}
async function load(p, s) {
  await p.evaluate((s) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(s));
    localStorage.removeItem("there-and-back-again.choices.v1");
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
  }, s);
  return resume(p);
}
async function choose(p, id) {
  await reviewedState(p);
  const s = await saved(p),
    index = s.choice?.options.findIndex((o) => o.id === id) ?? -1;
  assert.ok(index >= 0, JSON.stringify(s.choice));
  const o = s.choice.options[index],
    occurrence = s.choice.options
      .slice(0, index)
      .filter((x) => x.label === o.label).length;
  await p
    .getByRole("dialog")
    .getByRole("button", { name: o.label, exact: true })
    .nth(occurrence)
    .click();
  await reviewedState(p);
  return saved(p);
}
async function choices(p) {
  for (let i = 0; i < 300; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (!s.choice) return s;
    await choose(
      p,
      s.choice.options.find((o) =>
        ["skip", "resolve", "stay", "assault"].includes(o.id),
      )?.id ?? s.choice.options[0].id,
    );
  }
  throw Error("Shadow East choices stalled");
}
async function opening(p) {
  for (let i = 0; i < 350; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (s.choice)
      await choose(
        p,
        s.choice.options.find((o) =>
          ["resolve", "skip", "assault"].includes(o.id),
        )?.id ?? s.choice.options[0].id,
      );
    else if (s.phase === "setup")
      await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    else if (!s.queue.length && !s.flow?.pending) return s;
    else await p.waitForTimeout(25);
  }
  throw Error("Opening stalled");
}
async function capture(p, label, height) {
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${label}: overflow`,
  );
  if (await p.getByRole("dialog").count()) {
    const b = await p.getByRole("dialog").last().boundingBox();
    assert.ok(
      b.y >= 0 && b.y + b.height <= height + 1,
      `${label}: clipped dialog`,
    );
  }
  const broken = await p.evaluate(async () =>
    (
      await Promise.all(
        [...document.images]
          .filter((i) => {
            const r = i.getBoundingClientRect();
            return (
              i.checkVisibility() &&
              r.bottom > 0 &&
              r.top < innerHeight &&
              r.right > 0 &&
              r.left < innerWidth
            );
          })
          .map(async (i) => {
            try {
              i.loading = "eager";
              await i.decode();
              return null;
            } catch {
              return i.src;
            }
          }),
      )
    ).filter(Boolean),
  );
  assert.deepEqual(broken, [], label);
  const file = `${dir}/${label}.png`;
  await p.screenshot({ path: file });
  screenshots.push(file);
}
async function menu(p, scenario, players, easy, classic = false) {
  await p.evaluate(() => {
    localStorage.removeItem("there-and-back-again.save.v1");
    localStorage.removeItem("there-and-back-again.choices.v1");
  });
  await p.reload();
  await p
    .getByRole("button", { name: classic ? /Classic solo/ : /Solo hot-seat/ })
    .click();
  if (!classic)
    await p
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", {
        name: `${players} ${players === 1 ? "player" : "players"}`,
        exact: true,
      })
      .click();
  await p.locator(`.mission-${scenario}`).click();
  await p.locator(".easy-toggle input").setChecked(easy);
}

async function advance(p) {
  await reviewedState(p);
  await p.locator(".turn-actions button.primary:visible").first().click();
  await reviewedState(p);
  return saved(p);
}
async function inspect(p, name, label, height) {
  await p.getByRole("button", { name, exact: true }).click();
  await p
    .getByRole("dialog")
    .locator(".card-detail img")
    .first()
    .evaluate((i) => i.decode());
  await capture(p, label, height);
  await resume(p);
}
async function panel(p, s) {
  const el = p.locator('[data-scenario-panel="' + s.scenarioId + '"]');
  assert.equal(await el.count(), 1);
  const text = await el.innerText();
  const v = publicView(s);
  if (s.riverRunning)
    assert.ok(
      text.includes("Easterling Pursuit · " + v.pursuit + " resources"),
    );
  if (s.dangerDorwinion)
    assert.ok(text.includes("Investigation · " + v.resources));
  if (s.templeDoom)
    assert.ok(
      text.includes("Power of Mordor · " + v.powerDeck + " face-down cards"),
    );
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
const pursuit = riverBase();
pursuit.phase = "refresh";
pursuit.staging.find((u) => u.code === R.pursuit).resources = 2;
pursuit.encounterDeck = [R.raider, R.plains, R.plains];
const crossing = riverBase();
crossing.stage = 2;
crossing.riverRunning.currentQuest = R.second;
crossing.engaged = [make(crossing, R.raider)];
committing(crossing);
const riverWin = riverBase();
riverWin.stage = 2;
riverWin.riverRunning.currentQuest = R.second;
riverWin.progress = 14;
committing(riverWin);
const investigation = dangerBase();
investigation.activeLocation = make(investigation, D.street);
investigation.activeLocation.progress = (card(D.street).quest ?? 1) - 1;
investigation.dangerDorwinion.resources = 1;
committing(investigation);
const tavern = dangerBase();
tavern.phase = "travel";
tavern.staging.push(make(tavern, D.tavern));
tavern.encounterDeck = [D.manor, D.easterling, D.forum, D.guard, D.backstabber];
const cultist = dangerBase();
cultist.phase = "attack";
cultist.stage = 3;
cultist.dangerDorwinion.currentQuest = D.third;
cultist.dangerDorwinion.setAside = cultist.dangerDorwinion.setAside.filter(
  (u) => u.code !== D.black,
);
const boss = make(cultist, D.black);
boss.damage = (card(D.black).health ?? 5) - 1;
cultist.engaged.push(boss);
cultist.activeLocation = make(cultist, D.manor);
cultist.heroes[0].tempAttack = 100;
const worship = dangerBase();
worship.phase = "refresh";
worship.threat = 49;
const plot = make(worship, D.worship);
plot.damage = 0;
worship.staging.push(plot);
const templeOpening = templeBase();
const templeStage = templeBase();
templeStage.templeDoom.questResources = 1;
const power = templeBase();
power.phase = "refresh";
power.staging.find((u) => u.code === T.tribute).damage = 3;
power.templeDoom.powerDeck = [T.eye, T.tower];
const emptyPower = structuredClone(power);
emptyPower.templeDoom.powerDeck = [];
const tributeWin = templeBase();
tributeWin.stage = 2;
tributeWin.templeDoom.currentQuest = T.legacy;
tributeWin.templeDoom.questDeck = [];
tributeWin.victoryCards = TEMPLE_DOOM_QUESTS.map((c) => c.code).filter(
  (c) => c !== T.legacy,
);
const ulchor = tributeWin.staging.find((u) => u.code === T.ulchor);
ulchor.damage = stats(tributeWin, ulchor).health;
const tribute = tributeWin.staging.find((u) => u.code === T.tribute);
tribute.progress = 11;
committing(tributeWin);
tributeWin.sideQuestSelections = {
  shared: {
    id: tribute.id,
    code: tribute.code,
    defeated: false,
    phase: "quest",
  },
};
for (const [label, s] of Object.entries({
  pursuit,
  crossing,
  riverWin,
  investigation,
  tavern,
  cultist,
  worship,
  templeOpening,
  templeStage,
  power,
  emptyPower,
  tributeWin,
})) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid browser fixture " + label);
}
try {
  const viewports = [
    [1280, 900],
    [390, 844],
    [320, 750],
  ].filter(
    ([width]) =>
      !process.env.SHADOW_EAST_BROWSER_WIDTH ||
      String(width) === process.env.SHADOW_EAST_BROWSER_WIDTH,
  );
  assert.ok(
    viewports.length,
    "requested browser width must be 1280, 390 or 320",
  );
  for (const [width, height] of viewports) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const p = await context.newPage();
    page = p;
    await installReviewHandler(p);
    await p.addInitScript(() =>
      localStorage.setItem(
        "there-and-back-again.audio.v1",
        '{"muted":true,"volume":0.3}',
      ),
    );
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.goto(url);
    entries.add(
      await p.locator('script[type="module"][src]').first().getAttribute("src"),
    );
    for (const scenario of recipes) {
      await menu(p, scenario, 1, false, true);
      await capture(p, scenario + "-menu-" + width, height);
      await p.locator("#start-btn").click();
      let s = await opening(p);
      assert.equal(s.scenarioId, scenario);
      assert.equal(s.status, "playing");
      assert.equal(!!s.table, false);
      await panel(p, s);
      await capture(p, scenario + "-classic-" + width, height);
      for (const players of [1, 2, 3, 4])
        for (const easy of [false, true]) {
          await menu(p, scenario, players, easy);
          await p.locator("#start-btn").click();
          s = await opening(p);
          assert.equal(s.scenarioId, scenario);
          assert.equal(s.status, "playing");
          assert.equal(!!s.easyMode, easy);
          assert.equal(s.table.seats.length, players);
          assert.equal(
            (s.riverRunning ?? s.dangerDorwinion ?? s.templeDoom).initialized,
            true,
          );
          await panel(p, s);
          setups.push({
            scenario,
            width,
            players,
            easy,
            encounter: s.encounterDeck.length,
          });
          await capture(
            p,
            scenario +
              "-" +
              players +
              "p-" +
              (easy ? "easy" : "normal") +
              "-" +
              width,
            height,
          );
          const before = publicView(s);
          s = await resume(p);
          assert.deepEqual(publicView(s), before);
        }
    }
    await load(p, pursuit);
    let s = await advance(p);
    s = await choices(p);
    assert.equal(s.staging.find((u) => u.code === R.pursuit).resources, 0);
    assert.ok(
      [...s.staging, ...allEngaged(s)].some((u) => u.code === R.raider),
    );
    await capture(p, "river-pursuit-" + width, height);
    await load(p, crossing);
    s = await advance(p);
    s = await choices(p);
    assert.equal(s.progress, 5);
    assert.equal(s.status, "playing");
    await capture(p, "river-progress-cap-" + width, height);
    await load(p, riverWin);
    s = await advance(p);
    s = await choices(p);
    assert.equal(s.status, "won");
    await capture(p, "river-victory-" + width, height);
    await load(p, investigation);
    s = await advance(p);
    s = await choices(p);
    assert.equal(s.stage, 2);
    assert.equal(dangerDorwinionPublicState(s).plot.length, 1);
    await panel(p, s);
    await capture(p, "dorwinion-revealed-plot-" + width, height);
    await inspect(
      p,
      "Inspect revealed plot",
      "dorwinion-plot-inspector-" + width,
      height,
    );
    await load(p, tavern);
    await p
      .locator(
        '.board-card:has(img[data-card-code="' + D.tavern + '"]) .card-action',
      )
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.match(s.choice.title, /Seedy Tavern/);
    await capture(p, "dorwinion-private-choice-" + width, height);
    const beforeChoice = s.choice;
    s = await resume(p);
    assert.deepEqual(s.choice, beforeChoice);
    await choose(p, s.choice.options[1].id);
    s = await choices(p);
    assert.equal(s.dangerDorwinion.storedCards[0].cards.length, 1);
    await panel(p, s);
    await capture(p, "dorwinion-hidden-card-" + width, height);
    await load(p, cultist);
    await p
      .locator(
        '.board-card:has(img[data-card-code="' + D.black + '"]) .card-action',
      )
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Aragorn/ })
      .first()
      .click();
    await p.getByRole("button", { name: /^Attack · \d+ power$/ }).click();
    s = await choices(p);
    assert.equal(s.status, "won");
    await capture(p, "dorwinion-cultist-victory-" + width, height);
    await load(p, worship);
    s = await advance(p);
    s = await choices(p);
    assert.equal(s.status, "lost");
    await capture(p, "dorwinion-worship-loss-" + width, height);
    await load(p, templeOpening);
    s = await advance(p);
    s = await choices(p);
    assert.equal(s.phase, "travel");
    assert.equal(s.templeDoom.questResources, 1);
    await capture(p, "temple-skipped-quest-" + width, height);
    await load(p, templeStage);
    s = await advance(p);
    s = await choices(p);
    assert.equal(s.stage, 2);
    assert.equal(s.templeDoom.questDeck.length, 3);
    await panel(p, s);
    await capture(p, "temple-stage-two-" + width, height);
    await inspect(
      p,
      "Inspect current quest",
      "temple-stage-inspector-" + width,
      height,
    );
    await load(p, power);
    s = await advance(p);
    s = await choices(p);
    assert.equal(s.templeDoom.powerDeck.length, 1);
    assert.ok(s.staging.some((u) => u.code === T.eye));
    await capture(p, "temple-power-reveal-" + width, height);
    await load(p, emptyPower);
    s = await advance(p);
    s = await choices(p);
    assert.equal(s.status, "lost");
    await capture(p, "temple-power-loss-" + width, height);
    await load(p, tributeWin);
    s = await advance(p);
    s = await choices(p);
    assert.equal(s.status, "won");
    await capture(p, "temple-tribute-victory-" + width, height);
    assert.deepEqual(
      await p.evaluate(
        async (faces) =>
          (
            await Promise.all(
              faces.map(async (src) => {
                const i = new Image();
                i.src = src;
                try {
                  await i.decode();
                  return null;
                } catch {
                  return src;
                }
              }),
            )
          ).filter(Boolean),
        faces,
      ),
      [],
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(entries.size, 1, "stable browser build");
  if (process.env.EXPECTED_ENTRY)
    assert.ok(
      [...entries].every((e) =>
        e.endsWith("/assets/" + process.env.EXPECTED_ENTRY),
      ),
    );
  await fs.rm(dir + "/failure.json", { force: true });
  await fs.writeFile(
    dir + "/report.json",
    JSON.stringify(
      {
        url,
        checkedAt: new Date().toISOString(),
        releaseSha: process.env.RELEASE_SHA ?? null,
        entries: [...entries],
        screenshots,
        setups,
        faces: faces.length,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Shadow in the East: " +
      screenshots.length +
      " checkpoints passed (" +
      url +
      ").",
  );
} catch (error) {
  const lastState =
    page && !page.isClosed() ? await saved(page).catch(() => null) : null;
  await fs.writeFile(
    dir + "/failure.json",
    JSON.stringify(
      { url, screenshots, setups, errors, lastState, failure: String(error) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
