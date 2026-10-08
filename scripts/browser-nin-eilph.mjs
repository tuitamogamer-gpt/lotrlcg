import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  base as fixture,
  choose as engineChoose,
} from "../tests/nin-eilph-fixtures.ts";
import { validateSave, createGame } from "../src/game/engine.ts";
import { STARTERS, imageUrl, card } from "../src/game/cards.ts";
import { make, fx } from "../src/game/core.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import {
  forOwner,
  syncSeat,
  playerOrder,
  allCharacters,
} from "../src/game/table.ts";
import { removeQuestTime } from "../src/game/quest-time.ts";
import {
  NIN as N,
  NIN_ENCOUNTERS,
  NIN_QUESTS,
  NIN_STAGE_TWO,
} from "../src/game/nin-eilph-support.ts";
import { ninDweller } from "../src/game/nin-eilph.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178",
  dir = "output/nin-eilph";
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
function boss(s) {
  effect(s, fx("ninReturnDweller"));
  return ninDweller(s);
}
const noEnd = fixture();
noEnd.heroes[0].code = "01012";
noEnd.hand = [make(noEnd, "01064"), make(noEnd, "04108")];
const forgotten = fixture(1, N.forgotten);
forgotten.hand = [make(forgotten, "01013"), make(forgotten, "01014")];
const weary = fixture(1, N.weary);
weary.phase = "quest";
weary.hand = [make(weary, "01013"), make(weary, "01014")];
weary.committedIds = [weary.heroes[0].id];
weary.encounterDeck = [N.bog];
const time = fixture(1, N.weary);
time.phase = "refresh";
time.progress = 12;
time.ninEilph.time = 1;
const creatures = fixture(1, N.impassable);
boss(creatures);
creatures.engaged = [make(creatures, N.adder), make(creatures, N.neeker)];
creatures.allies.push(make(creatures, "01073"));
creatures.encounterDeck = Array(10).fill(N.dweller);
creatures.heroes[0].tempDefense = 20;
removeQuestTime(creatures, 2);
flush(creatures);
const reeds = fixture(2);
reeds.staging = [make(reeds, N.reeds)];
reeds.ninEilph.time = 1;
removeQuestTime(reeds);
flush(reeds);
const eyot = fixture(2);
eyot.phase = "travel";
eyot.staging = [make(eyot, N.eyot)];
const ready = fixture(1, N.treacherous);
ready.phase = "attack";
ready.allies.push(...Array.from({ length: 4 }, () => make(ready, "01013")));
allCharacters(ready).forEach((u) => (u.exhausted = true));
const cycling = fixture(1, N.impassable);
const dweller = boss(cycling);
dweller.damage = 4;
dweller.resources = 2;
cycling.ninEilph.time = 1;
cycling.progress = 15;
removeQuestTime(cycling);
flush(cycling);
const final = fixture(2, N.impassable);
boss(final);
for (const p of playerOrder(final))
  forOwner(final, p, () => final.heroes.forEach((h) => (h.tempDefense = 20)));
final.encounterDeck = Array(12).fill(N.dweller);
effect(final, fx("ninAdvance", { value: 4, flag: true }));
flush(final);
const victory = fixture(1, N.out);
boss(victory).damage = 5;
victory.hand = [make(victory, "01073")];
const remnants = fixture(2);
remnants.encounterDeck = [N.remnants, N.adder];
remnants.encounterDiscard = [N.neeker];
effect(remnants, fx("reveal"));
flush(remnants);
const d = STARTERS[0],
  four = createGame(47, d.cards, d.heroes, d.id, {
    scenarioId: "the-nin-in-eilph",
    easy: true,
    seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
  });
for (const s of [
  noEnd,
  forgotten,
  weary,
  time,
  creatures,
  reeds,
  eyot,
  ready,
  cycling,
  final,
  victory,
  remnants,
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
async function play(p, code) {
  await p
    .locator(
      `.hand-card:has(img[data-card-code="${code}"]) .hand-play:not(.hand-ability)`,
    )
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  return reviewedState(p);
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
    await p.locator(".mission-the-nin-in-eilph").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await capture(p, `opening-hand-${width}`, height);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    await capture(p, `setup-location-${width}`, height);
    await resume(p);
    await choose(p, N.bog);
    await choices(p);
    let state = await saved(p);
    assert.equal(state.phase, "resource");
    assert.ok(NIN_STAGE_TWO.includes(state.ninEilph.activeQuest));
    await capture(p, `through-the-marsh-${width}`, height);
    await load(p, noEnd);
    await capture(p, `no-end-in-sight-${width}`, height);
    assert.equal(await p.locator(".hand-card:not(.playable)").count(), 2);
    assert.equal(await p.locator(".hand-play:not(.hand-ability)").count(), 0);
    await load(p, forgotten);
    await play(p, "01013");
    await choices(p);
    state = await saved(p);
    assert.ok(state.used.includes("nin:played"));
    assert.equal(await p.locator(".hand-card:not(.playable)").count(), 1);
    await capture(p, `one-card-limit-${width}`, height);
    await load(p, weary);
    await p.locator(".turn-actions .primary:visible").click();
    await reviewedState(p);
    state = await choices(p);
    assert.equal(state.hand.length, 1);
    assert.equal(state.discard.length, 1);
    assert.equal(state.heroes[0].committed, true);
    await capture(p, `weary-commit-cost-${width}`, height);
    await load(p, time);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    state = await choices(p);
    assert.notEqual(state.ninEilph.activeQuest, N.weary);
    assert.equal(state.progress, 0);
    assert.equal(state.ninEilph.time, 3);
    await capture(p, `parallel-stage-${width}`, height);
    await resume(p);
    await load(p, creatures);
    await capture(p, `creature-time-order-${width}`, height);
    await resume(p);
    state = await choices(p);
    assert.equal(state.ninEilph.time, 1);
    assert.equal(state.staging.find((u) => u.code === N.dweller).resources, 1);
    assert.equal(state.allies.find((u) => u.code === N.nalir).damage, 2);
    await capture(p, `creatures-resolved-${width}`, height);
    await load(p, reeds);
    await capture(p, `reeds-exhaustion-${width}`, height);
    state = await choices(p);
    assert.ok(
      state.table.seats.every((s) => s.heroes.some((h) => h.exhausted)),
    );
    await capture(p, `reeds-paid-${width}`, height);
    await load(p, eyot);
    await p.getByRole("button", { name: "Travel here", exact: true }).click();
    await reviewedState(p);
    await capture(p, `eyot-travel-cost-${width}`, height);
    state = await choices(p);
    assert.equal(state.activeLocation.code, N.eyot);
    await capture(p, `eyot-active-${width}`, height);
    await load(p, ready);
    await p.locator(".turn-actions .primary:visible").click();
    await reviewedState(p);
    await capture(p, `five-character-refresh-${width}`, height);
    state = await choices(p);
    assert.equal(
      [...state.heroes, ...state.allies].filter((u) => !u.exhausted).length,
      5,
    );
    await capture(p, `five-characters-ready-${width}`, height);
    await load(p, cycling);
    state = await choices(p);
    const healed = state.staging.find((u) => u.code === N.dweller);
    assert.equal(healed.damage, 0);
    assert.equal(healed.resources, 3);
    assert.equal(state.progress, 0);
    await capture(p, `dweller-returned-${width}`, height);
    await load(p, final);
    await capture(p, `out-of-swamp-attacks-${width}`, height);
    await resume(p);
    state = await choices(p);
    assert.equal(state.stage, 4);
    assert.equal(state.ninEilph.time, 2);
    assert.equal(state.stageRevealing, false);
    await capture(p, `out-of-swamp-${width}`, height);
    await load(p, remnants);
    await capture(p, `creature-search-${width}`, height);
    await choose(p, `deck:${N.adder}`);
    await choose(p, `discard:${N.neeker}`);
    state = await saved(p);
    assert.ok(state.table.seats.every((s) => s.engaged.length === 1));
    await capture(p, `creatures-engaged-${width}`, height);
    await load(p, victory);
    await play(p, "01073");
    state = await saved(p);
    await choose(
      p,
      state.choice.options.find((o) => o.code === N.dweller)?.id ??
        state.choice.options[0].id,
    );
    state = await saved(p);
    assert.equal(state.status, "won");
    await capture(p, `dweller-defeated-${width}`, height);
    await load(p, four);
    for (let i = 0; i < 60; i++) {
      state = await saved(p);
      if (state.choice) await choose(p, state.choice.options[0].id);
      else if (state.phase === "setup") {
        await p.getByRole("button", { name: "Keep hand", exact: true }).click();
        await reviewedState(p);
      } else break;
    }
    state = await saved(p);
    assert.equal(state.phase, "resource");
    assert.equal(state.table.seats.length, 4);
    assert.equal(state.ninEilph.setupLocations.length, 4);
    assert.equal(state.encounterDeck.length, 19);
    await capture(p, `four-player-easy-${width}`, height);
    await resume(p);
    const sources = [...NIN_ENCOUNTERS, ...NIN_QUESTS].flatMap((c) => [
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
    assert.deepEqual(failures, [], "twenty-six local faces decode");
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/results.json`,
    JSON.stringify({ status: "passed", screenshots, errors }, null, 2),
  );
  console.log(
    `The Nîn-in-Eilph: ${screenshots.length} browser checkpoints passed (${base}).`,
  );
} finally {
  await browser.close();
}
