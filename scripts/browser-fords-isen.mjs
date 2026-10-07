import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as fixture } from "../tests/fords-isen-fixtures.ts";
import { validateSave, createGame } from "../src/game/engine.ts";
import { STARTERS, imageUrl } from "../src/game/cards.ts";
import { make } from "../src/game/core.ts";
import { revealed } from "../src/game/board.ts";
import { fordsEncounter } from "../src/game/fords-isen.ts";
import { forOwner, syncSeat } from "../src/game/table.ts";
import {
  FORDS as F,
  FORDS_ISEN_ENCOUNTERS,
  FORDS_ISEN_QUESTS,
} from "../src/game/fords-isen-support.ts";
import { flush } from "../src/game/effects.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/fords-isen";
await fs.mkdir(dir, { recursive: true });
const hand = (s, count) =>
  (s.hand = Array.from({ length: count }, () => make(s, "01022")));
const rescue = fixture();
const captive = rescue.allies.pop(),
  islet = make(rescue, F.islet);
islet.guarding = captive.id;
rescue.staging = [captive];
rescue.activeLocation = islet;
rescue.phase = "staging";
rescue.progress = 5;
rescue.heroes.forEach((h) => {
  h.committed = true;
  h.exhausted = true;
});
rescue.committedIds = rescue.heroes.map((h) => h.id);
rescue.encounterDeck = [F.bandit, F.gap];
const timeout = fixture();
timeout.phase = "refresh";
timeout.stage = 2;
timeout.fordsIsen.time = 1;
hand(timeout, 2);
const lost = fixture();
lost.phase = "refresh";
lost.fordsIsen.time = 1;
const berserker = fixture();
berserker.engaged = [make(berserker, F.berserker)];
berserker.encounterDeck = [F.road];
const conditions = fixture();
fordsEncounter(conditions, F.hatreds);
fordsEncounter(conditions, F.wild);
const road = fixture();
road.phase = "travel";
hand(road, 5);
road.staging = [make(road, F.road), make(road, F.fords)];
const hills = fixture(2);
forOwner(hills, 1, () => hand(hills, 5));
hills.encounterDeck = [F.bandit, F.gap];
revealed(hills, F.hills);
flush(hills);
const ill = fixture();
revealed(ill, F.tidings);
flush(ill);
const d = STARTERS[0];
const four = createGame(43, d.cards, d.heroes, d.id, {
  scenarioId: "fords-of-isen",
  easy: true,
  seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
});
for (const s of [
  rescue,
  timeout,
  lost,
  berserker,
  conditions,
  road,
  hills,
  ill,
  four,
]) {
  syncSeat(s);
  assert.ok(validateSave(s), JSON.stringify(s.fordsIsen));
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
    await p.locator(".mission-fords-of-isen").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await capture(p, `setup-search-${width}`, height);
    await resume(p);
    await choose(p, F.bandit);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    assert.equal((await saved(p)).fordsIsen.time, 5);
    assert.match(
      await p.locator(".scenario-state-summary").innerText(),
      /Gríma is guarded/,
    );
    await capture(p, `time-and-captive-${width}`, height);

    await load(p, rescue);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    await capture(p, `second-stage-search-${width}`, height);
    await resume(p);
    await choose(p, F.bandit);
    assert.equal((await saved(p)).stage, 2);
    assert.equal((await saved(p)).fordsIsen.time, 2);
    assert.match(
      await p.locator(".scenario-state-summary").innerText(),
      /Gríma is rescued/,
    );
    await capture(p, `grima-rescued-${width}`, height);

    await load(p, timeout);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    assert.equal((await saved(p)).fordsIsen.time, 0);
    await capture(p, `time-damage-${width}`, height);
    await resume(p);
    await choose(p, `${timeout.heroes[0].id}:2`);
    assert.equal((await saved(p)).fordsIsen.time, 2);
    assert.equal((await saved(p)).heroes[0].damage, 2);
    await capture(p, `time-reset-${width}`, height);

    await load(p, berserker);
    await p
      .getByRole("button", {
        name: "Exhaust Gríma to draw a card",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await capture(p, `berserker-attack-${width}`, height);
    await resume(p);
    await choose(p, berserker.heroes[0].id);
    assert.equal((await saved(p)).combat, null);
    assert.equal((await saved(p)).hand.length, 1);
    await capture(p, `berserker-defended-${width}`, height);

    await load(p, conditions);
    await p
      .getByRole("button", {
        name: "Exhaust Gríma to draw a card",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await capture(p, `draw-forced-order-${width}`, height);
    await resume(p);
    let s = await choose(p, "0");
    assert.match(s.choice.title, /Assign 1 damage/);
    await choose(p, `${conditions.heroes[0].id}:1`);
    assert.equal((await saved(p)).threat, 21);

    await load(p, road);
    assert.ok(
      await p
        .getByRole("button", { name: "Travel to The King’s Road", exact: true })
        .isDisabled(),
    );
    assert.equal(
      await p.getByRole("button", { name: "Travel here", exact: true }).count(),
      2,
    );
    await p
      .getByRole("button", { name: "Travel here", exact: true })
      .first()
      .click();
    await reviewedState(p);
    assert.equal((await saved(p)).activeLocation.code, F.road);
    await capture(p, `mandatory-travel-${width}`, height);

    await load(p, hills);
    await capture(p, `multiplayer-hills-${width}`, height);
    await resume(p);
    await choose(p, "time");
    await choose(p, "search");
    await choose(p, F.bandit);
    assert.equal((await saved(p)).fordsIsen.time, 4);
    assert.ok((await saved(p)).staging.some((u) => u.code === F.bandit));

    await load(p, ill);
    assert.equal((await saved(p)).hand[0].code, F.tidings);
    assert.equal(await p.locator(".hand-play").count(), 0);
    assert.match(
      await p
        .getByRole("button", { name: "Inspect Ill Tidings", exact: true })
        .getAttribute("aria-description"),
      /cannot leave your hand/,
    );
    await capture(p, `ill-tidings-locked-${width}`, height);
    await resume(p);
    assert.equal((await saved(p)).hand[0].code, F.tidings);

    await load(p, four);
    const used = [];
    for (let i = 0; i < 4; i++) {
      const q = (await reviewedState(p)).choice;
      assert.ok(q.options.every((o) => !used.includes(o.id)));
      const o = q.options[0];
      used.push(o.id);
      await choose(p, o.id);
    }
    assert.equal((await saved(p)).staging.length, 6);
    await capture(p, `four-player-setup-${width}`, height);

    await load(p, lost);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    assert.equal((await saved(p)).status, "lost");
    await capture(p, `timeout-defeat-${width}`, height);

    const sources = [...FORDS_ISEN_ENCOUNTERS, ...FORDS_ISEN_QUESTS].flatMap(
      (c) => [
        imageUrl(c),
        ...(c.back_imagesrc
          ? [imageUrl({ ...c, imagesrc: c.back_imagesrc })]
          : []),
      ],
    );
    const failures = await p.evaluate(
      async (sources) =>
        (
          await Promise.all(
            sources.map(async (src) => {
              const img = new Image();
              img.src = src;
              try {
                await img.decode();
                return null;
              } catch {
                return src;
              }
            }),
          )
        ).filter(Boolean),
      sources,
    );
    assert.deepEqual(failures, [], "all 22 original card faces decode");
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ screenshots, errors, widths: [1280, 390, 320] }, null, 2) +
      "\n",
  );
  console.log(
    `Fords of Isen: ${screenshots.length} checkpoints, saved choices, 1–4 players, Time, rescue, combat, hand restrictions and all 22 card faces; no browser errors.`,
  );
} finally {
  await browser.close();
}
