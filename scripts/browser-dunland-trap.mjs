import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as fixture } from "../tests/dunland-trap-fixtures.ts";
import { validateSave, createGame } from "../src/game/engine.ts";
import { STARTERS, imageUrl } from "../src/game/cards.ts";
import { fx, make, draw } from "../src/game/core.ts";
import { revealed, check } from "../src/game/board.ts";
import { syncSeat } from "../src/game/table.ts";
import {
  DUNLAND_TRAP as D,
  DUNLAND_TRAP_ENCOUNTERS,
  DUNLAND_TRAP_QUESTS,
} from "../src/game/dunland-trap-support.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/dunland-trap";
await fs.mkdir(dir, { recursive: true });
function finalStage() {
  let s = fixture();
  s.stage = 2;
  s.dunlandTrap.time = 0;
  effect(s, fx("dunlandAdvance", { value: 3 }));
  flush(s);
  return s;
}
const drawOrder = fixture();
drawOrder.engaged = [make(drawOrder, D.stalker), make(drawOrder, D.warrior)];
drawOrder.staging = [make(drawOrder, D.foothills), make(drawOrder, D.hills)];
drawOrder.encounterDeck = [D.plains, D.plains];
draw(drawOrder, 2);
flush(drawOrder);
const trap = fixture();
trap.allies = [make(trap, "01013"), make(trap, "01014")];
trap.heroes[0].attachments = [
  { id: `item-${trap.nextId++}`, code: "01041", exhausted: false },
];
trap.activeLocation = make(trap, D.road);
trap.encounterDeck = [D.warrior, ...Array(12).fill(D.plains)];
trap.progress = 18;
check(trap);
flush(trap);
const deadline = fixture();
deadline.phase = "refresh";
deadline.staging = [make(deadline, D.road)];
deadline.hand = [make(deadline, "01014")];
deadline.encounterDeck = Array(10).fill(D.plains);
const travel = fixture(2);
travel.phase = "travel";
const hills = make(travel, D.hills);
travel.staging = [hills];
travel.encounterDeck = [D.stalker, D.warrior, D.plains];
const lastStand = finalStage();
lastStand.phase = "refresh";
lastStand.dunlandTrap.time = 1;
lastStand.encounterDeck = [D.plains];
lastStand.allies = [make(lastStand, "01013")];
const defeat = finalStage();
defeat.phase = "refresh";
defeat.dunlandTrap.time = 1;
defeat.encounterDeck = [D.plains];
const ambush = fixture();
ambush.activeLocation = make(ambush, D.plains);
ambush.encounterDeck = [D.plains];
revealed(ambush, D.ambush);
flush(ambush);
const combatEnd = fixture();
combatEnd.stage = 2;
combatEnd.dunlandTrap.time = 0;
combatEnd.phase = "attack";
combatEnd.encounterDeck = Array(10).fill(D.plains);
const d = STARTERS[0];
const four = createGame(47, d.cards, d.heroes, d.id, {
  scenarioId: "the-dunland-trap",
  easy: true,
  seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
});
for (const s of [
  drawOrder,
  trap,
  deadline,
  travel,
  lastStand,
  defeat,
  ambush,
  combatEnd,
  four,
]) {
  syncSeat(s);
  assert.ok(validateSave(s), "browser fixture saves");
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
    await p.locator(".mission-the-dunland-trap").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await capture(p, `opening-hand-${width}`, height);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    await capture(p, `boar-setup-${width}`, height);
    await resume(p);
    await choose(p, `deck:${D.warrior}`);
    let state = await saved(p);
    assert.equal(state.dunlandTrap.time, 2);
    assert.equal(state.activeLocation.code, D.road);
    assert.equal(state.engaged[0].shadows.length, 1);
    await capture(p, `old-south-road-${width}`, height);
    await load(p, drawOrder);
    await capture(p, `draw-forced-order-${width}`, height);
    await resume(p);
    for (let i = 0; (await saved(p)).choice; i++) {
      assert.ok(i < 12);
      state = await saved(p);
      await choose(p, state.choice.options[0].id);
    }
    state = await saved(p);
    assert.equal(state.engaged[0].resources, 1);
    assert.equal(state.engaged[1].shadows.length, 1);
    assert.equal(state.staging[0].resources, 1);
    await capture(p, `draw-reactions-resolved-${width}`, height);
    await load(p, trap);
    await capture(p, `trap-keep-one-ally-${width}`, height);
    await resume(p);
    await choose(p, trap.allies[1].id);
    await capture(p, `trap-second-boar-${width}`, height);
    await choose(p, `deck:${D.warrior}`);
    state = await saved(p);
    assert.equal(state.stage, 2);
    assert.equal(state.allies.length, 1);
    assert.equal(state.heroes[0].attachments.length, 0);
    assert.equal(state.activeLocation.code, D.ravine);
    await capture(p, `ravine-stage-two-${width}`, height);
    await load(p, deadline);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    await capture(p, `road-time-order-${width}`, height);
    state = await saved(p);
    await choose(p, state.choice.options[0].id);
    state = await saved(p);
    assert.equal(state.dunlandTrap.time, 2);
    assert.equal(state.hand.length, 3);
    await capture(p, `discard-redraw-${width}`, height);
    await load(p, travel);
    await p.getByRole("button", { name: "Travel here", exact: true }).click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.activeLocation.id, hills.id);
    assert.equal(state.table.seats[0].engaged[0].code, D.stalker);
    assert.equal(state.table.seats[1].engaged[0].code, D.warrior);
    await capture(p, `hills-travel-two-players-${width}`, height);
    await load(p, ambush);
    await capture(p, `ambush-attachment-choice-${width}`, height);
    await choose(p, ambush.activeLocation.id);
    state = await saved(p);
    assert.equal(state.activeLocation.attachments[0].code, D.ambush);
    await capture(p, `ambush-attached-${width}`, height);
    await load(p, combatEnd);
    await p
      .getByRole("button", {
        name: /End combat|End player attacks|Finish combat/,
      })
      .click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.stage, 3);
    assert.equal(state.dunlandTrap.time, 5);
    assert.equal(state.engaged[0].code, D.turch);
    await capture(p, `chief-turch-stage-three-${width}`, height);
    await load(p, lastStand);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    await capture(p, `final-attack-defender-${width}`, height);
    await resume(p);
    await choose(p, lastStand.allies[0].id);
    state = await saved(p);
    assert.equal(state.status, "won");
    await capture(p, `survived-the-trap-${width}`, height);
    await load(p, defeat);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    state = await saved(p);
    await choose(
      p,
      state.choice.options.find((o) => /undefended/i.test(o.label)).id,
    );
    state = await saved(p);
    if (state.choice) await choose(p, state.choice.options[0].id);
    state = await saved(p);
    assert.equal(state.status, "lost");
    await capture(p, `hero-destroyed-loss-${width}`, height);
    await load(p, four);
    for (let i = 0; i < 65; i++) {
      state = await saved(p);
      if (state.choice)
        await choose(
          p,
          state.choice.options.find((o) => o.code === D.warrior)?.id ??
            state.choice.options[0].id,
        );
      else if (state.phase === "setup") {
        await p.getByRole("button", { name: "Keep hand", exact: true }).click();
        await reviewedState(p);
      } else break;
    }
    state = await saved(p);
    assert.equal(state.phase, "resource");
    assert.equal(state.easyMode, true);
    assert.equal(state.table.seats.length, 4);
    assert.ok(
      state.table.seats.every((s) => s.engaged[0].shadows.length === 1),
    );
    await capture(p, `four-player-easy-${width}`, height);
    await resume(p);
    const sources = [
      ...DUNLAND_TRAP_ENCOUNTERS,
      ...DUNLAND_TRAP_QUESTS,
    ].flatMap((c) => [
      imageUrl(c),
      ...(c.back_imagesrc
        ? [imageUrl({ ...c, imagesrc: c.back_imagesrc })]
        : []),
    ]);
    assert.equal(sources.length, 17);
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
    assert.deepEqual(failures, [], "all seventeen local faces decode");
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/results.json`,
    JSON.stringify({ status: "passed", screenshots, errors }, null, 2),
  );
  console.log(
    `The Dunland Trap: ${screenshots.length} browser checkpoints passed (${base}).`,
  );
} finally {
  await browser.close();
}
