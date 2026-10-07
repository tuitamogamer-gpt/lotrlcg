import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as fixture } from "../tests/fangorn-fixtures.ts";
import { validateSave, createGame } from "../src/game/engine.ts";
import { STARTERS, imageUrl } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { revealed } from "../src/game/board.ts";
import { syncSeat } from "../src/game/table.ts";
import {
  FANGORN as F,
  FANGORN_ENCOUNTERS,
  FANGORN_QUESTS,
} from "../src/game/fangorn-support.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/fangorn";
await fs.mkdir(dir, { recursive: true });
function captive(s) {
  const h = s.heroes[0];
  h.attachments.push({
    id: `captive-${s.nextId++}`,
    code: F.mugash,
    exhausted: false,
  });
  return h;
}
const claim = fixture();
claim.progress = 9;
claim.staging = [make(claim, F.mugash)];
claim.encounterDeck = [F.dark, F.dark];
const timeout = fixture();
timeout.phase = "refresh";
timeout.fangorn.time = 1;
captive(timeout);
const recovery = fixture();
recovery.stage = 3;
recovery.fangorn.time = 1;
recovery.phase = "refresh";
recovery.encounterDeck = Array(6).fill(F.tangled);
recovery.encounterDiscard = [F.mugash, F.dark];
const heart = fixture();
heart.staging = [make(heart, F.heart)];
heart.allies = Array.from({ length: 4 }, () => make(heart, "01013"));
[...heart.heroes, ...heart.allies].forEach((u) => (u.exhausted = true));
effect(heart, fx("refreshReady"));
flush(heart);
const provisions = fixture(2);
provisions.allies = [make(provisions, "01013")];
syncSeat(provisions);
revealed(provisions, F.provisions);
flush(provisions);
const rest = fixture();
rest.phase = "refresh";
const bearer = captive(rest);
bearer.committed = true;
rest.committedIds = [bearer.id];
revealed(rest, F.rest);
flush(rest);
const travel = fixture(3);
travel.phase = "travel";
const edge = make(travel, F.edge),
  m = make(travel, F.mugash);
edge.guarding = m.id;
travel.staging = [edge, m, make(travel, F.tangled)];
travel.encounterDeck = [F.dark, F.dark];
const angry = fixture();
angry.phase = "refresh";
angry.engaged = [make(angry, F.angry)];
angry.encounterDeck = [F.tangled];
const hinder = fixture();
hinder.engaged = [make(hinder, F.dark)];
hinder.progress = 2;
effect(hinder, fx("startCombat"));
flush(hinder);
const victory = fixture();
victory.stage = 2;
victory.fangorn.time = 4;
victory.phase = "staging";
victory.progress = 11;
captive(victory);
victory.heroes[1].committed = true;
victory.heroes[1].exhausted = true;
const d = STARTERS[0];
const four = createGame(72, d.cards, d.heroes, d.id, {
  scenarioId: "into-fangorn",
  easy: true,
  seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
});
for (const s of [
  claim,
  timeout,
  recovery,
  heart,
  provisions,
  rest,
  travel,
  angry,
  hinder,
  victory,
  four,
]) {
  syncSeat(s);
  assert.ok(validateSave(s), JSON.stringify(s.fangorn));
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
    await p.locator(".mission-into-fangorn").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await capture(p, `opening-hand-${width}`, height);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    assert.equal((await saved(p)).fangorn.time, 4);
    await capture(p, `guarded-mugash-${width}`, height);
    await load(p, claim);
    await p
      .getByRole("button", { name: "Claim · Exhaust hero", exact: true })
      .click();
    await capture(p, `choose-bearer-${width}`, height);
    await p.getByRole("dialog").locator(".decision-select").first().click();
    await reviewedState(p);
    assert.equal((await saved(p)).stage, 2);
    await capture(p, `stage-two-search-${width}`, height);
    await resume(p);
    await choose(p, `deck:${F.dark}`);
    assert.ok(
      (await saved(p)).heroes[0].attachments.some((a) => a.code === F.mugash),
    );
    assert.match(
      await p.locator(".scenario-state-summary").innerText(),
      /Mugash is captured/,
    );
    await capture(p, `captive-escape-${width}`, height);
    await load(p, timeout);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    assert.equal((await saved(p)).stage, 3);
    assert.equal((await saved(p)).fangorn.time, 3);
    await capture(p, `angry-forest-${width}`, height);
    await load(p, recovery);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    await capture(p, `recover-from-discard-${width}`, height);
    await resume(p);
    await choose(p, F.mugash);
    let state = await saved(p);
    assert.equal(state.fangorn.time, 3);
    assert.ok(state.staging.some((u) => u.guarding));
    await capture(p, `recaptured-trail-${width}`, height);
    await load(p, heart);
    await capture(p, `five-character-choice-${width}`, height);
    await resume(p);
    for (let i = 0; (await saved(p)).choice; i++) {
      assert.ok(i < 12);
      state = await saved(p);
      await choose(p, state.choice.options[0].id);
    }
    state = await saved(p);
    assert.equal(
      [...state.heroes, ...state.allies].filter((u) => !u.exhausted).length,
      5,
    );
    await capture(p, `limited-refresh-${width}`, height);
    await load(p, provisions);
    await capture(p, `provisions-first-player-${width}`, height);
    await resume(p);
    await choose(p, `${provisions.heroes[0].id}:4`);
    state = await saved(p);
    assert.match(state.choice.title, /Assign 3 damage/);
    await choose(p, state.choice.options.find((o) => o.id.endsWith(":3")).id);
    await capture(p, `provisions-resolved-${width}`, height);
    await load(p, rest);
    await choose(p, bearer.id);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.encounterDeck[0], F.mugash);
    assert.equal(state.heroes[0].damage, 1);
    await capture(p, `bearer-damage-escape-${width}`, height);
    await load(p, travel);
    await p
      .getByRole("button", { name: "Travel here", exact: true })
      .first()
      .click();
    await reviewedState(p);
    await capture(p, `tangled-travel-${width}`, height);
    state = await saved(p);
    await choose(p, state.choice.options[0].id);
    await choose(p, `deck:${F.dark}`);
    await choose(p, `deck:${F.dark}`);
    assert.equal((await saved(p)).activeLocation.id, edge.id);
    await capture(p, `edge-two-huorns-${width}`, height);
    await load(p, angry);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    assert.match((await saved(p)).choice.title, /Immediate attack/);
    await capture(p, `resource-attack-${width}`, height);
    await resume(p);
    await choose(p, angry.heroes[0].id);
    assert.equal((await saved(p)).combat, null);
    await capture(p, `resource-attack-resolved-${width}`, height);
    await load(p, hinder);
    state = await saved(p);
    assert.equal(state.phase, "attack");
    assert.equal(state.progress, 1);
    assert.equal(state.engaged[0].shadows.length, 0);
    await capture(p, `hinder-combat-${width}`, height);
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
    assert.equal(state.easyMode, true);
    assert.equal(state.table.seats.length, 4);
    await capture(p, `four-player-easy-${width}`, height);
    await resume(p);
    await load(p, victory);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    assert.equal((await saved(p)).status, "won");
    await capture(p, `escape-victory-${width}`, height);
    const sources = [...FANGORN_ENCOUNTERS, ...FANGORN_QUESTS].flatMap((c) => [
      imageUrl(c),
      ...(c.back_imagesrc
        ? [imageUrl({ ...c, imagesrc: c.back_imagesrc })]
        : []),
    ]);
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
    assert.deepEqual(failures, [], "all nineteen original card faces decode");
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ screenshots, errors, widths: [1280, 390, 320] }, null, 2) +
      "\n",
  );
  console.log(
    `Into Fangorn: ${screenshots.length} responsive checkpoints; setup, capture, stage transitions, hidden recovery, travel, Hinder, resource attacks, conditions, refresh limits, multiplayer and victory; all 19 faces decode, no browser errors.`,
  );
} finally {
  await browser.close();
}
