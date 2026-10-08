import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as cleanFixture } from "../tests/against-shadow-final-fixtures.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { STARTERS, imageUrl } from "../src/game/cards.ts";
import { make, fx } from "../src/game/core.ts";
import { revealed } from "../src/game/board.ts";
import { flush, handle } from "../src/game/effects.ts";
import { seatView, syncSeat } from "../src/game/table.ts";
import { currentQuestCode } from "../src/game/quest-state.ts";
import { WEATHER as W } from "../src/game/weather-hills-support.ts";
import { CHETWOOD as C } from "../src/game/chetwood-support.ts";
import { weatherRefreshEnd } from "../src/game/weather-hills.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/weather-hills";
await fs.mkdir(dir, { recursive: true });
const source = JSON.parse(
  await fs.readFile(
    new URL(
      "../src/data/pending/the-weather-hills-import.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function fixture(players = 1, stage = 1) {
  const s = cleanFixture("the-weather-hills", players);
  s.encounterDeck = Array(30).fill(W.causeway);
  s.weatherHills.orcDeck = [];
  s.stage = stage;
  const mission = make(s, W.mission);
  mission.resources = stage === 2 ? 4 : 2;
  mission.flipped = stage === 2;
  s.staging.push(mission);
  if (stage === 2) s.weatherHills.setAside = [];
  return s;
}
function side(s, code) {
  const u = make(s, code);
  if (code === W.shelter) u.timeCounters = 4;
  s.staging.push(u);
  return u;
}
function selected(s, u) {
  s.phase = "staging";
  s.sideQuestSelections = { shared: { id: u.id, code: u.code } };
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  s.heroes[0].tempWill = 20;
  return s;
}
function opening(players, easy) {
  const d = STARTERS[0];
  return createGame(78, d.cards, d.heroes, d.id, {
    scenarioId: "the-weather-hills",
    easy,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
}

const selection = fixture(2);
const selectedShelter = side(selection, W.shelter);
side(selection, W.search);
side(selection, W.camp);
side(selection, "09014");
selection.table.first = 1;
handle(selection, fx("startQuest"));
flush(selection);

const cold = fixture();
const coldQuest = side(cold, W.shelter);
selected(cold, coldQuest);
revealed(cold, W.cold);
flush(cold);

const time = fixture();
const timedQuest = side(time, W.shelter);
timedQuest.timeCounters = 1;
time.phase = "refresh";
weatherRefreshEnd(time);
flush(time);

const advance = fixture();
advance.staging[0].resources = 3;
const hunted = make(advance, W.cornered);
hunted.damage = 1;
advance.engaged.push(hunted);
advance.hand = [make(advance, "01073")];
advance.weatherHills.orcDeck = [C.marauder, W.orcCamp];
advance.encounterDiscard = [C.orc];

const blocked = fixture(1, 2);
blocked.phase = "staging";
blocked.progress = 20;
const blocker = make(blocked, W.forn);
blocked.staging.push(blocker);
blocked.heroes[0].committed = true;
blocked.heroes[0].exhausted = true;
blocked.heroes[0].tempWill = 20;

const victory = fixture(1, 2);
victory.phase = "staging";
victory.progress = 20;
victory.activeLocation = make(victory, W.forn);
victory.activeLocation.progress = 5;
victory.heroes[0].committed = true;
victory.heroes[0].exhausted = true;
victory.heroes[0].tempWill = 20;

const loss = fixture(1, 2);
loss.phase = "defense";
loss.staging[0].resources = 1;
const doomedDefender = make(loss, "01016");
loss.allies.push(doomedDefender);
const killer = make(loss, W.cornered);
loss.engaged.push(killer);
handle(loss, fx("immediateAttack", { target: killer.id }));
flush(loss);

for (const [name, s] of Object.entries({
  selection,
  cold,
  time,
  advance,
  blocked,
  victory,
  loss,
})) {
  syncSeat(s);
  assert.ok(validateSave(s), `valid ${name} Weather Hills browser fixture`);
}

const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [],
  setups = [];
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
async function resume(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  await reviewedState(p);
  return saved(p);
}
async function load(p, s) {
  await p.evaluate((state) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(state));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  return resume(p);
}
async function choose(p, id) {
  const s = await reviewedState(p);
  const option = s.choice?.options.find((o) => o.id === id);
  assert.ok(option, JSON.stringify(s.choice));
  const index = s.choice.options.findIndex((o) => o.id === id);
  const occurrence = s.choice.options
    .slice(0, index)
    .filter((o) => o.label === option.label).length;
  await p
    .getByRole("dialog")
    .getByRole("button", { name: option.label, exact: true })
    .nth(occurrence)
    .click();
  await reviewedState(p);
  return saved(p);
}
async function choices(p) {
  for (let i = 0; i < 100; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (!s.choice) return s;
    await choose(
      p,
      s.choice.options.find((o) =>
        o.effects.some(
          (e) =>
            e.kind === "used" && e.text === "phase:weather-additional-reveal",
        ),
      )?.id ??
        s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  throw Error("Weather Hills choices stalled");
}
async function finishOpening(p) {
  for (let i = 0; i < 70; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (s.choice) await choose(p, s.choice.options[0].id);
    else if (s.phase === "setup") {
      await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    } else return s;
  }
  throw Error("Weather Hills opening did not finish");
}
async function capture(p, name, height) {
  if (!(await p.getByRole("dialog").count())) {
    const quest = p.locator(".quest-card-stack img");
    if (await quest.count()) {
      assert.ok(
        await quest.getAttribute("src"),
        `${name}: current quest face has a source`,
      );
      await quest.evaluate((i) => i.decode());
    }
  }
  const failed = await p.evaluate(async () => {
    const root =
      [...document.querySelectorAll('dialog[open], [role="dialog"]')].at(-1) ??
      document;
    const visible = [...root.querySelectorAll("img")].filter((i) => {
      const r = i.getBoundingClientRect();
      return (
        i.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        r.width &&
        r.height &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth
      );
    });
    return (
      await Promise.all(
        visible.map(async (i) => {
          i.loading = "eager";
          try {
            await i.decode();
            return null;
          } catch {
            return i.src;
          }
        }),
      )
    ).filter(Boolean);
  });
  assert.deepEqual(failed, [], `${name}: missing visible art`);
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: horizontal overflow`,
  );
  const modal = p.getByRole("dialog");
  if (await modal.count()) {
    const r = await modal.last().boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= height + 1,
      `${name}: clipped dialog`,
    );
  }
  const path = `${dir}/${name}.png`;
  await p.screenshot({ path });
  screenshots.push(path);
}

try {
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [320, 750],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);
    await p.getByRole("button", { name: /Classic solo/ }).click();
    await p.locator(".mission-the-weather-hills").click();
    const easyToggle = p.locator(".easy-toggle input");
    await easyToggle.check();
    assert.equal(await easyToggle.isChecked(), true);
    await easyToggle.uncheck();
    assert.equal(await easyToggle.isChecked(), false);
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    const openingState = await finishOpening(p);
    assert.equal(openingState.encounterDeck.length, 31);
    assert.equal(openingState.weatherHills.orcDeck.length, 11);
    assert.equal(openingState.activeLocation.code, W.ridge);
    assert.deepEqual(
      openingState.staging.map((u) => u.code).sort(),
      [W.hilltop, W.mission].sort(),
    );
    await capture(p, `opening-board-${width}`, height);
    await resume(p);

    for (const players of [1, 2, 3, 4])
      for (const easy of [false, true]) {
        await load(p, opening(players, easy));
        const s = await finishOpening(p);
        assert.equal(s.encounterDeck.length, easy ? 24 : 31);
        assert.equal(s.weatherHills.orcDeck.length, easy ? 9 : 11);
        assert.equal(s.weatherHills.setAside.length, 2);
        assert.equal(s.activeLocation.code, W.ridge);
        assert.equal(s.staging.filter((u) => u.code === W.mission).length, 1);
        assert.equal(s.staging.filter((u) => u.code === W.hilltop).length, 1);
        for (let player = 0; player < players; player++)
          for (const hero of seatView(s, player).heroes)
            assert.equal(hero.resources, easy ? 2 : 1);
        assert.match(
          await p.locator("body").innerText(),
          new RegExp(`Orc deck.*${easy ? 9 : 11}`),
        );
        setups.push({
          width,
          players,
          easy,
          encounter: s.encounterDeck.length,
          orcs: s.weatherHills.orcDeck.length,
        });
        await capture(
          p,
          `${players}-player-${easy ? "easy" : "normal"}-${width}`,
          height,
        );
        const reloaded = await resume(p);
        assert.equal(
          reloaded.weatherHills.orcDeck.length,
          s.weatherHills.orcDeck.length,
        );
      }

    await load(p, selection);
    await capture(p, `side-quest-choice-${width}`, height);
    const selectionReload = await resume(p);
    assert.equal(selectionReload.table.active, 1);
    await choose(p, selectedShelter.id);
    let s = await saved(p);
    assert.equal(currentQuestCode(s), W.shelter);
    await p.locator(".journey-area").scrollIntoViewIfNeeded();
    await capture(p, `current-side-quest-${width}`, height);
    assert.match(await p.locator(".tabletop-progress").innerText(), /0 \/ 6/);
    await p
      .getByRole("button", { name: "Inspect main quest", exact: true })
      .click();
    await capture(p, `main-quest-inspection-${width}`, height);

    await load(p, cold);
    await capture(p, `cold-damage-choice-${width}`, height);
    await resume(p);
    await choose(p, cold.heroes[0].id);
    s = await choices(p);
    assert.equal(s.heroes[0].damage, 1);
    assert.equal(s.heroes[0].blanked, true);
    assert.ok(
      s.staging
        .find((u) => u.id === coldQuest.id)
        .attachments.some((a) => a.code === W.cold),
    );
    assert.equal(currentQuestCode(s), W.shelter);
    const conditionButton = p.locator(".journey-area").getByRole("button", {
      name: "Inspect attachment: Cold from Angmar",
      exact: true,
    });
    await conditionButton.scrollIntoViewIfNeeded();
    assert.ok(
      await conditionButton.evaluate((b) => {
        const r = b.getBoundingClientRect();
        const area = b.closest(".journey-area").getBoundingClientRect();
        return (
          b.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
          r.left >= area.left &&
          r.right <= area.right &&
          r.top >= area.top &&
          r.bottom <= area.bottom
        );
      }),
      "Current quest Condition is visible within the Journey area",
    );
    await capture(p, `cold-current-quest-condition-${width}`, height);
    await conditionButton.click();
    await capture(p, `cold-condition-inspection-${width}`, height);
    await resume(p);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.ok(s.victoryCards.includes(W.shelter));
    assert.ok(s.encounterDiscard.includes(W.cold));
    assert.equal(!!s.heroes[0].blanked, false);
    await capture(p, `condition-discarded-${width}`, height);

    await load(p, time);
    await capture(p, `shelter-timeout-choice-${width}`, height);
    await resume(p);
    await choose(p, time.heroes[0].id);
    s = await choices(p);
    assert.equal(s.heroes[0].damage, 4);
    assert.equal(s.staging.find((u) => u.id === timedQuest.id).timeCounters, 4);
    await capture(p, `shelter-time-reset-${width}`, height);
    await resume(p);

    await load(p, advance);
    await p
      .locator(
        '.hand-card:has(img[data-card-code="01073"]) .hand-play:not(.hand-ability)',
      )
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    await choose(p, s.choice.options.find((o) => o.code === W.cornered).id);
    await capture(p, `stage-two-orc-search-${width}`, height);
    await resume(p);
    s = await choices(p);
    assert.equal(s.stage, 2);
    assert.equal(s.weatherHills.orcDeck.length, 0);
    assert.equal(s.weatherHills.setAside.length, 0);
    const mission = s.staging.find((u) => u.code === W.mission);
    assert.equal(mission.flipped, true);
    assert.equal(mission.resources, 4);
    assert.ok(s.staging.some((u) => u.code === W.forn));
    const missionImage = p
      .locator(`.board-card img[data-card-code="${W.mission}"]`)
      .first();
    assert.match(await missionImage.getAttribute("src"), /\.B\.jpg$/);
    await capture(p, `savage-counterattack-${width}`, height);
    await p
      .getByRole("button", {
        name: "Inspect Savage Counter-attack",
        exact: true,
      })
      .click();
    const reverseButton = p
      .getByRole("dialog")
      .getByRole("button", { name: "Show reverse", exact: true });
    if (await reverseButton.count()) await reverseButton.click();
    assert.match(
      await p
        .getByRole("dialog")
        .locator(".card-detail-art img")
        .getAttribute("src"),
      /\.B\.jpg$/,
    );
    await capture(p, `mission-reverse-inspection-${width}`, height);

    await load(p, blocked);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.equal(s.status, "playing");
    assert.ok(s.progress >= 20);
    assert.ok(s.staging.some((u) => u.id === blocker.id));
    await capture(p, `amon-forn-blocks-victory-${width}`, height);
    await resume(p);
    await load(p, victory);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.equal(s.status, "won");
    assert.ok(s.victoryCards.includes(W.forn));
    await capture(p, `weather-hills-victory-${width}`, height);

    await load(p, loss);
    await capture(p, `last-mission-token-attack-${width}`, height);
    await resume(p);
    await choose(p, doomedDefender.id);
    s = await choices(p);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Savage Counter-attack|resource token|Mission/i);
    assert.equal(s.staging.find((u) => u.code === W.mission).resources, 0);
    await capture(p, `mission-token-loss-${width}`, height);

    const sources = source.cards.flatMap((c) => [
      imageUrl(c),
      ...(c.back_imagesrc ? [c.back_imagesrc] : []),
    ]);
    assert.equal(sources.length, 26);
    const failures = await p.evaluate(
      async (sources) =>
        (
          await Promise.all(
            sources.map(async (src) => {
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
      sources,
    );
    assert.deepEqual(failures, []);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.rm(`${dir}/failure.json`, { force: true });
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      { url: base, screenshots, setups, faces: 26, errors },
      null,
      2,
    ),
  );
  console.log(
    `The Weather Hills: ${screenshots.length} browser checkpoints passed (${base}).`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      { url: base, screenshots, setups, errors, failure: String(error) },
      null,
      2,
    ),
  );
  if (errors.length) console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
