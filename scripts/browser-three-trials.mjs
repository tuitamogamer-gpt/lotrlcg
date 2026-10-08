import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  base as fixture,
  choose as engineChoose,
} from "../tests/three-trials-fixtures.ts";
import { validateSave, createGame } from "../src/game/engine.ts";
import { STARTERS, card, imageUrl } from "../src/game/cards.ts";
import { make, fx, get } from "../src/game/core.ts";
import { check, damage, progress } from "../src/game/board.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import { forOwner, syncSeat, allEngaged } from "../src/game/table.ts";
import {
  TRIALS as T,
  TRIAL_QUESTS,
  TRIAL_GUARDIANS,
  TRIAL_KEYS,
  THREE_TRIALS_ENCOUNTERS,
  THREE_TRIALS_QUESTS,
  guardianTimeLimit,
} from "../src/game/three-trials-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/three-trials";
await fs.mkdir(dir, { recursive: true });
function settle(s) {
  flush(s);
  for (let i = 0; s.choice; i++) {
    assert.ok(i < 100);
    s = engineChoose(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function start(trial) {
  let s = fixture();
  effect(s, fx("trialsStart", { code: trial }));
  return settle(s);
}
function addGuardian(s, code) {
  const u = make(s, code);
  u.timeCounters = guardianTimeLimit(code);
  s.engaged.push(u);
  s.threeTrials.setAside = s.threeTrials.setAside.filter(
    (x) => x.code !== code,
  );
  return u;
}
function key(s, code) {
  s.heroes[0].attachments.push({
    id: `key-${s.nextId++}`,
    code,
    exhausted: false,
  });
  s.threeTrials.setAside = s.threeTrials.setAside.filter(
    (x) => x.code !== code,
  );
}
const strength = start(T.strength),
  claim = structuredClone(strength);
damage(claim, allEngaged(claim)[0].id, 100);
check(claim);
flush(claim);
const perseverance = start(T.perseverance);
perseverance.phase = "travel";
const intuition = fixture(1, T.intuition);
intuition.phase = "staging";
intuition.threeTrials.currentKey = T.boarKey;
intuition.threeTrials.setAside = intuition.threeTrials.setAside.filter(
  (u) => u.code !== T.boarKey,
);
intuition.encounterDeck = [T.boarKey, ...Array(12).fill(T.circle)];
intuition.heroes[0].committed = true;
intuition.heroes[0].exhausted = true;
const cave = fixture(2);
cave.staging = [make(cave, T.cave)];
for (const p of [0, 1])
  forOwner(
    cave,
    p,
    () => (cave.allies = Array.from({ length: 4 }, () => make(cave, "01013"))),
  );
check(cave);
flush(cave);
const time = fixture();
time.phase = "refresh";
for (const code of [T.boar, T.raven]) addGuardian(time, code).timeCounters = 1;
time.allies = [make(time, "01013"), make(time, "01014")];
time.encounterDeck = Array(12).fill(T.circle);
const foothills = fixture(1, T.intuition);
foothills.activeLocation = make(foothills, T.forest);
foothills.staging = [
  make(foothills, T.foothills),
  make(foothills, T.foothills),
];
progress(foothills, 5);
flush(foothills);
const circle = fixture();
circle.phase = "travel";
circle.stage = 3;
circle.threeTrials.activeQuest = T.crown;
circle.threeTrials.completed = [...TRIAL_QUESTS];
circle.staging = [make(circle, T.circle)];
for (const code of TRIAL_KEYS) key(circle, code);
for (const code of TRIAL_GUARDIANS) addGuardian(circle, code);
for (const h of circle.heroes) h.tempDefense = 10;
circle.encounterDeck = Array(15).fill(T.circle);
const victory = fixture();
victory.phase = "staging";
victory.stage = 3;
victory.threeTrials.activeQuest = T.crown;
victory.threeTrials.completed = [...TRIAL_QUESTS];
victory.activeLocation = make(victory, T.circle);
victory.activeLocation.progress = 11;
victory.heroes[0].committed = true;
victory.heroes[0].exhausted = true;
for (const code of TRIAL_KEYS) key(victory, code);
const d = STARTERS[0],
  four = createGame(47, d.cards, d.heroes, d.id, {
    scenarioId: "the-three-trials",
    easy: true,
    seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
  });
for (const s of [
  strength,
  claim,
  perseverance,
  intuition,
  cave,
  time,
  foothills,
  circle,
  victory,
  four,
]) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid browser fixture");
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
  const i = s.choice.options.findIndex((o) => o.id === id);
  assert.ok(i >= 0, JSON.stringify(s.choice));
  await p
    .getByRole("dialog")
    .locator(".choice-list .decision-select")
    .nth(i)
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
    await p.locator(".mission-the-three-trials").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await capture(p, `opening-hand-${width}`, height);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    await capture(p, `trial-choice-${width}`, height);
    await resume(p);
    await choose(p, T.strength);
    let state = await saved(p);
    assert.equal(state.threeTrials.activeQuest, T.strength);
    assert.ok(state.engaged[0].timeCounters > 0);
    await capture(p, `strength-${width}`, height);
    await load(p, claim);
    await capture(p, `claim-key-${width}`, height);
    await resume(p);
    await choose(p, claim.heroes[0].id);
    state = await saved(p);
    assert.equal(state.threeTrials.completed.length, 1);
    await capture(p, `next-trial-${width}`, height);
    await choose(p, T.intuition);
    state = await saved(p);
    assert.equal(state.threeTrials.activeQuest, T.intuition);
    await capture(p, `intuition-${width}`, height);
    await load(p, perseverance);
    await capture(p, `perseverance-${width}`, height);
    await p.getByRole("button", { name: "Travel here", exact: true }).click();
    await reviewedState(p);
    state = await saved(p);
    assert.ok(
      state.activeLocation.attachments.some((a) => TRIAL_KEYS.includes(a.code)),
    );
    await capture(p, `barrow-active-${width}`, height);
    await load(p, intuition);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    state = await saved(p);
    assert.match(state.choice.title, /Claim Key/);
    await capture(p, `intuition-found-key-${width}`, height);
    await choose(p, intuition.heroes[0].id);
    state = await saved(p);
    assert.equal(state.threeTrials.completed.length, 1);
    await capture(p, `intuition-complete-${width}`, height);
    await load(p, cave);
    await capture(p, `cave-discard-${width}`, height);
    for (let i = 0; (await saved(p)).choice; i++) {
      assert.ok(i < 8);
      state = await saved(p);
      await choose(p, state.choice.options[0].id);
    }
    state = await saved(p);
    assert.equal(
      state.table.seats.reduce((n, s) => n + s.allies.length, 0),
      5,
    );
    await capture(p, `cave-five-allies-${width}`, height);
    await load(p, time);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    await capture(p, `guardian-time-order-${width}`, height);
    await resume(p);
    for (let i = 0; (await saved(p)).choice; i++) {
      assert.ok(i < 12);
      state = await saved(p);
      await choose(
        p,
        state.choice.options.find((o) => o.id === "skip")?.id ??
          state.choice.options[0].id,
      );
    }
    state = await saved(p);
    assert.equal(state.engaged.find((u) => u.code === T.boar).timeCounters, 2);
    assert.equal(state.engaged.find((u) => u.code === T.raven).timeCounters, 4);
    await capture(p, `guardian-time-reset-${width}`, height);
    await load(p, foothills);
    await capture(p, `foothills-progress-order-${width}`, height);
    await choose(p, foothills.staging[1].id);
    state = await saved(p);
    assert.equal(state.staging.length, 1);
    assert.equal(state.staging[0].progress, 2);
    assert.equal(state.activeLocation.progress, 0);
    await capture(p, `foothills-buffer-${width}`, height);
    await load(p, circle);
    await capture(p, `antlered-crown-${width}`, height);
    await p.getByRole("button", { name: "Travel here", exact: true }).click();
    await reviewedState(p);
    await capture(p, `circle-guardian-attacks-${width}`, height);
    for (let i = 0; (await saved(p)).choice; i++) {
      assert.ok(i < 16);
      state = await saved(p);
      await choose(
        p,
        state.choice.options.find((o) => o.id === "skip")?.id ??
          state.choice.options[0].id,
      );
    }
    state = await saved(p);
    assert.ok(
      state.heroes
        .flatMap((h) => h.attachments)
        .filter((a) => TRIAL_KEYS.includes(a.code))
        .every((a) => a.exhausted),
    );
    assert.equal(state.activeLocation.code, T.circle);
    assert.equal(state.heroes.filter((h) => h.exhausted).length, 3);
    await capture(p, `circle-attacks-resolved-${width}`, height);
    await load(p, victory);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.status, "won");
    assert.ok(state.victoryCards.includes(T.circle));
    await capture(p, `crown-retrieved-${width}`, height);
    await load(p, four);
    for (let i = 0; i < 40; i++) {
      state = await saved(p);
      if (state.choice)
        await choose(
          p,
          state.choice.options.find((o) => o.id === T.perseverance)?.id ??
            state.choice.options[0].id,
        );
      else if (state.phase === "setup") {
        await p.getByRole("button", { name: "Keep hand", exact: true }).click();
        await reviewedState(p);
      } else break;
    }
    state = await saved(p);
    assert.equal(state.phase, "resource");
    assert.equal(state.table.seats.length, 4);
    assert.equal(state.easyMode, true);
    await capture(p, `four-player-easy-${width}`, height);
    await resume(p);
    const sources = [
      ...THREE_TRIALS_ENCOUNTERS,
      ...THREE_TRIALS_QUESTS,
    ].flatMap((c) => [
      imageUrl(c),
      ...(c.back_imagesrc
        ? [imageUrl({ ...c, imagesrc: c.back_imagesrc })]
        : []),
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
    assert.deepEqual(failures, [], "all twenty-six local faces decode");
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/results.json`,
    JSON.stringify({ status: "passed", screenshots, errors }, null, 2),
  );
  console.log(
    `The Three Trials: ${screenshots.length} browser checkpoints passed (${base}).`,
  );
} finally {
  await browser.close();
}
