import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as fixture } from "../tests/antlered-fixtures.ts";
import { validateSave, createGame } from "../src/game/engine.ts";
import { STARTERS, imageUrl, card } from "../src/game/cards.ts";
import { make, fx } from "../src/game/core.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import { engage } from "../src/game/board.ts";
import { syncSeat } from "../src/game/table.ts";
import {
  ANTLERED as A,
  ANTLERED_ENCOUNTERS,
  ANTLERED_QUESTS,
  RAVEN_CODES,
} from "../src/game/antlered-support.ts";
import {
  antleredCardEntered,
  antleredRefreshTime,
  antleredEncounter,
} from "../src/game/antlered.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178",
  dir = "output/antlered";
await fs.mkdir(dir, { recursive: true });
const raven = (name) => RAVEN_CODES.find((c) => card(c).name === name);
function loc(s, code = A.country, active = false, time) {
  const u = make(s, code);
  antleredCardEntered(s, u, true);
  if (time !== undefined) u.timeCounters = time;
  if (active) s.activeLocation = u;
  else s.staging.push(u);
  return u;
}
function enemy(s, code = A.chief) {
  const u = make(s, code);
  s.engaged.push(u);
  return u;
}
const travel = fixture(1, 2);
travel.phase = "travel";
loc(travel, A.village).progress = 3;
const advance = fixture();
advance.phase = "staging";
advance.progress = 9;
advance.heroes[0].tempWill = 10;
advance.heroes[0].committed = true;
advance.heroes[0].exhausted = true;
advance.antlered.ravenDeck = [raven("Dunland Tribesman")];
const finale = fixture(1, 2);
finale.phase = "staging";
finale.progress = 14;
finale.heroes[0].tempWill = 10;
finale.heroes[0].committed = true;
finale.heroes[0].exhausted = true;
const time = fixture();
time.antlered.time = 1;
time.hand = [make(time, "01050"), make(time, "01050")];
loc(time, A.country, true, 1);
antleredRefreshTime(time);
flush(time);
const allocation = fixture();
allocation.hand = [make(allocation, "01050"), make(allocation, "01050")];
loc(allocation, A.country, false, 1);
loc(allocation, A.village, false, 1);
const warrior = make(allocation, A.warrior);
allocation.staging.push(warrior);
allocation.antlered.ravenDeck = [raven("Dunlending Bandit")];
engage(allocation, warrior);
flush(allocation);
const folk = fixture();
folk.hand = [make(folk, "01050")];
antleredEncounter(folk, A.folk);
flush(folk);
const shadow = fixture();
shadow.heroes[0].tempDefense = 20;
shadow.antlered.ravenDeck = [
  raven("Dunland Tribesman"),
  raven("Dunlending Bandit"),
];
const attacker = enemy(shadow, A.skirmisher);
shadow.encounterDeck = [A.village];
effect(shadow, fx("immediateAttack", { target: attacker.id }));
flush(shadow);
const defense = fixture();
const turch = defense.allies[0];
const skirmisher = enemy(defense, A.skirmisher);
defense.encounterDeck = [A.camp];
effect(defense, fx("immediateAttack", { target: skirmisher.id }));
flush(defense);
const victory = fixture(1, 3);
victory.phase = "planning";
const chief = enemy(victory);
chief.damage = 8;
victory.hand = [make(victory, "01073")];
const loss = fixture();
loss.allies[0].damage = 4;
const killer = enemy(loss, A.skirmisher);
loss.encounterDeck = [A.camp];
effect(loss, fx("immediateAttack", { target: killer.id }));
flush(loss);
const four = createGame(
  78,
  STARTERS[0].cards,
  STARTERS[0].heroes,
  STARTERS[0].id,
  {
    scenarioId: "the-antlered-crown",
    easy: true,
    seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
  },
);
for (const s of [
  travel,
  advance,
  finale,
  time,
  allocation,
  folk,
  shadow,
  defense,
  victory,
  loss,
  four,
]) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid Crown browser fixture");
}
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [];
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
async function resume(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
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
  return reviewedState(p);
}
async function capture(p, name, height) {
  if (!(await p.getByRole("dialog").count())) {
    const quest = p.locator(".quest-card-stack img");
    if (await quest.count()) {
      assert.ok(
        await quest.evaluate((i) => !!i.getAttribute("src")),
        `${name}: quest face has a source`,
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
async function choices(p) {
  for (let i = 0; i < 100; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (!s.choice) return s;
    assert.ok(i < 99);
    await choose(
      p,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  throw Error("choices stalled");
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
      }),
      p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);
    await p.getByRole("button", { name: /Classic solo/ }).click();
    await p.locator(".mission-the-antlered-crown").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    await capture(p, `raven-setup-choice-${width}`, height);
    await resume(p);
    let state = await choices(p);
    assert.equal(state.antlered.time, 3);
    assert.equal(state.antlered.ravenDeck.length, 13);
    assert.equal(state.activeLocation.timeCounters, 3);
    assert.equal(state.encounterDeck.length, 28);
    await capture(p, `opening-board-${width}`, height);
    await load(p, travel);
    await p.getByRole("button", { name: "Travel here", exact: true }).click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.activeLocation, null);
    assert.ok(state.encounterDiscard.includes(A.village));
    await capture(p, `travel-explores-${width}`, height);
    await load(p, advance);
    await p.locator(".turn-actions .primary:visible").click();
    state = await choices(p);
    assert.equal(state.stage, 2);
    assert.equal(state.staging[0].code, raven("Dunland Tribesman"));
    assert.equal(state.hand.length, 0);
    await capture(p, `raven-clan-${width}`, height);
    await load(p, finale);
    await p.locator(".turn-actions .primary:visible").click();
    state = await choices(p);
    assert.equal(state.stage, 3);
    assert.equal(state.antlered.time, 2);
    assert.equal(state.staging.find((u) => u.code === A.camp).timeCounters, 0);
    await capture(p, `raven-chief-camp-${width}`, height);
    await load(p, time);
    await capture(p, `simultaneous-time-${width}`, height);
    await resume(p);
    state = await choices(p);
    assert.equal(state.threat, 22);
    assert.equal(state.antlered.time, 3);
    assert.equal(state.activeLocation.timeCounters, 0);
    await capture(p, `time-resolved-${width}`, height);
    await load(p, allocation);
    await capture(p, `warrior-time-allocation-${width}`, height);
    await resume(p);
    state = await choices(p);
    assert.equal(state.threat, 22);
    assert.ok(state.staging.some((u) => u.code === raven("Dunlending Bandit")));
    await capture(p, `warrior-resolved-${width}`, height);
    await load(p, folk);
    state = await saved(p);
    assert.equal(state.antlered.eventsBlockedRound, state.round);
    assert.ok(
      await p
        .locator('.hand-card:not(.playable):has(img[data-card-code="01050"])')
        .count(),
    );
    await capture(p, `fierce-folk-events-blocked-${width}`, height);
    await load(p, shadow);
    await capture(p, `raven-shadow-defense-${width}`, height);
    state = await saved(p);
    await choose(p, state.heroes[0].id);
    state = await choices(p);
    assert.equal(state.antlered.ravenDeck.length, 2);
    assert.equal(
      state.log.filter((l) => l.text.startsWith("Shadow:")).length,
      3,
    );
    assert.equal(state.heroes[0].damage, 0);
    assert.ok(
      state.antlered.ravenDiscard.length +
        state.antlered.ravenDeck.length +
        state.engaged
          .flatMap((u) => u.shadows)
          .filter((c) => RAVEN_CODES.includes(c)).length ===
        2,
    );
    await capture(p, `raven-shadows-resolved-${width}`, height);
    await load(p, defense);
    await capture(p, `turch-defense-${width}`, height);
    state = await saved(p);
    await choose(p, state.allies.find((u) => u.code === A.turch).id);
    state = await choices(p);
    assert.equal(state.allies.find((u) => u.code === A.turch).exhausted, false);
    assert.equal(state.allies.find((u) => u.code === A.turch).damage, 1);
    await capture(p, `turch-ready-${width}`, height);
    await load(p, victory);
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
    state = await saved(p);
    await choose(p, state.choice.options.find((o) => o.code === A.chief).id);
    state = await choices(p);
    assert.ok(state.victoryCards.includes(A.chief));
    assert.equal(state.status, "playing");
    await capture(p, `chief-defeated-await-round-${width}`, height);
    for (let i = 0; state.status === "playing" && i < 14; i++) {
      if (state.choice) state = await choices(p);
      else {
        const primary = p.locator(".turn-actions .primary:visible");
        assert.ok(await primary.count(), state.phase);
        await primary.click();
        state = await choices(p);
      }
    }
    assert.equal(state.status, "won");
    await capture(p, `antlered-victory-${width}`, height);
    await load(p, loss);
    state = await saved(p);
    await choose(p, state.allies.find((u) => u.code === A.turch).id);
    state = await choices(p);
    assert.equal(state.status, "lost");
    await capture(p, `turch-lost-${width}`, height);
    await load(p, four);
    for (let i = 0; i < 70; i++) {
      state = await saved(p);
      if (state.choice) await choose(p, state.choice.options[0].id);
      else if (state.phase === "setup") {
        await p.getByRole("button", { name: "Keep hand", exact: true }).click();
        await reviewedState(p);
      } else break;
    }
    state = await saved(p);
    assert.equal(state.antlered.setupEnemies.length, 4);
    assert.equal(state.antlered.ravenDeck.length, 6);
    assert.equal(state.encounterDeck.length, 21);
    await capture(p, `four-player-easy-${width}`, height);
    await resume(p);
    const sources = [...ANTLERED_ENCOUNTERS, ...ANTLERED_QUESTS].flatMap(
      (c) => [
        imageUrl(c),
        ...(c.back_imagesrc
          ? [imageUrl({ ...c, imagesrc: c.back_imagesrc })]
          : []),
      ],
    );
    assert.equal(sources.length, 18);
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
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify({ url: base, screenshots, errors }, null, 2),
  );
  console.log(
    `The Antlered Crown: ${screenshots.length} browser checkpoints passed (${base}).`,
  );
} finally {
  await browser.close();
}
