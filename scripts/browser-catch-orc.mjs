import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as fixture } from "../tests/catch-orc-fixtures.ts";
import { validateSave, createGame } from "../src/game/engine.ts";
import { STARTERS, imageUrl } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { damage, revealed } from "../src/game/board.ts";
import { syncSeat } from "../src/game/table.ts";
import {
  CATCH_ORC as C,
  CATCH_ORC_ENCOUNTERS,
  CATCH_ORC_QUESTS,
} from "../src/game/catch-orc-support.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/catch-orc";
await fs.mkdir(dir, { recursive: true });
const search = fixture();
search.phase = "staging";
search.activeLocation = make(search, C.methedras);
search.catchOrc.decks[0] = [
  make(search, C.mugash),
  make(search, "01022"),
  make(search, "01023"),
];
search.heroes.forEach((h) => {
  h.committed = true;
  h.exhausted = true;
});
const searchCard = search.catchOrc.decks[0][1];
const captureState = fixture();
captureState.phase = "attack";
const mugash = make(captureState, C.mugash);
captureState.engaged = [mugash];
damage(captureState, mugash.id, 8);
flush(captureState);
const escape = fixture();
escape.stage = 3;
escape.phase = "refresh";
escape.catchOrc.time = 1;
escape.heroes[0].attachments = [
  { id: "captive-mugash", code: C.mugash, exhausted: false },
];
escape.heroes[0].exhausted = true;
const deadline = fixture();
deadline.phase = "refresh";
deadline.catchOrc.time = 1;
deadline.encounterDeck = [C.methedras, C.methedras];
deadline.encounterDiscard = [C.methedras];
const attack = fixture();
attack.hand = [make(attack, "01022"), make(attack, "01023")];
attack.engaged = [make(attack, C.methedrasOrc)];
attack.encounterDeck = [C.methedras];
effect(attack, fx("immediateAttack", { target: attack.engaged[0].id }));
flush(attack);
const territory = fixture(2);
territory.encounterDeck = [C.methedras];
territory.encounterDiscard = [C.lair];
revealed(territory, C.territory);
flush(territory);
const victory = fixture();
victory.phase = "staging";
victory.stage = 3;
victory.catchOrc.time = 3;
victory.progress = 14;
victory.heroes[0].attachments = [
  { id: "winning-captive", code: C.mugash, exhausted: false },
];
victory.heroes[0].exhausted = true;
victory.heroes[1].committed = true;
victory.heroes[1].exhausted = true;
const d = STARTERS[0];
const four = createGame(72, d.cards, d.heroes, d.id, {
  scenarioId: "to-catch-an-orc",
  easy: true,
  seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
});
for (const s of [
  search,
  captureState,
  escape,
  deadline,
  attack,
  territory,
  victory,
  four,
]) {
  syncSeat(s);
  assert.ok(validateSave(s), JSON.stringify(s.catchOrc));
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
    await p.locator(".mission-to-catch-an-orc").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    assert.equal((await saved(p)).catchOrc.initialized, false);
    await capture(p, `opening-hand-${width}`, height);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    assert.equal((await saved(p)).catchOrc.decks[0].length, 21);
    await capture(p, `setup-search-${width}`, height);
    await resume(p);
    await choose(p, `deck:${C.methedras}`);
    assert.equal((await saved(p)).stage, 2);
    assert.match(
      await p.locator(".scenario-state-summary").innerText(),
      /21 out-of-play cards/,
    );
    assert.match(
      await p.locator(".scenario-state-summary").innerText(),
      /Time · 2/,
    );
    await capture(p, `hidden-deck-${width}`, height);

    await load(p, search);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    assert.ok(!(await saved(p)).choice.options.some((o) => o.id === "advance"));
    await capture(p, `quest-time-response-${width}`, height);
    await resume(p);
    await choose(p, "time");
    assert.match((await saved(p)).choice.title, /Take one player card/);
    await capture(p, `search-recovery-${width}`, height);
    await resume(p);
    await choose(p, searchCard.id);
    let state = await saved(p);
    assert.equal(state.stage, 2);
    assert.equal(state.catchOrc.time, 3);
    assert.ok(state.hand.some((u) => u.id === searchCard.id));
    assert.ok(state.staging.some((u) => u.code === C.mugash));
    await capture(p, `mugash-found-${width}`, height);

    await load(p, captureState);
    await capture(p, `choose-captor-${width}`, height);
    await resume(p);
    await choose(p, captureState.heroes[0].id);
    state = await saved(p);
    assert.ok(state.heroes[0].attachments.some((a) => a.id === mugash.id));
    assert.equal(state.heroes[0].exhausted, true);
    assert.match(
      await p.locator(".scenario-state-summary").innerText(),
      /Mugash · guarded by/,
    );
    await capture(p, `mugash-captured-${width}`, height);

    await load(p, escape);
    await capture(p, `escape-deadline-${width}`, height);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.catchOrc.time, 3);
    assert.ok(state.staging.some((u) => u.id === "captive-mugash"));
    assert.equal(state.heroes[0].exhausted, true);
    await capture(p, `mugash-escaped-${width}`, height);

    await load(p, deadline);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.staging.length, 2);
    assert.equal(state.catchOrc.time, 2);
    await capture(p, `timeout-reinforcements-${width}`, height);

    await load(p, attack);
    await capture(p, `methedras-attack-${width}`, height);
    await resume(p);
    await choose(p, attack.heroes[0].id);
    state = await saved(p);
    assert.equal(state.catchOrc.decks[0].length, 1);
    assert.equal(state.hand.length, 1);
    assert.equal(state.combat, null);
    await capture(p, `methedras-defended-${width}`, height);

    await load(p, territory);
    await capture(p, `territory-choice-${width}`, height);
    await resume(p);
    await choose(p, `discard:${C.lair}`);
    await choose(p, `deck:${C.methedras}`);
    state = await saved(p);
    assert.equal(state.staging.length, 2);
    await capture(p, `territory-resolved-${width}`, height);

    await load(p, four);
    for (let i = 0; i < 4; i++) {
      await p.getByRole("button", { name: "Keep hand", exact: true }).click();
      await reviewedState(p);
    }
    for (let i = 0; i < 4; i++) await choose(p, `deck:${C.methedras}`);
    state = await saved(p);
    assert.equal(Object.keys(state.catchOrc.decks).length, 4);
    assert.equal(state.staging.length, 4);
    assert.equal(state.easyMode, true);
    await capture(p, `four-player-easy-${width}`, height);
    await resume(p);
    assert.equal((await saved(p)).catchOrc.decks[3].length, 21);

    await load(p, victory);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    assert.equal((await saved(p)).status, "won");
    await capture(p, `captured-victory-${width}`, height);

    const sources = [...CATCH_ORC_ENCOUNTERS, ...CATCH_ORC_QUESTS].flatMap(
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
    assert.deepEqual(failures, [], "all 20 original card faces decode");
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ screenshots, errors, widths: [1280, 390, 320] }, null, 2) +
      "\n",
  );
  console.log(
    `To Catch an Orc: ${screenshots.length} responsive checkpoints, hidden decks, search, capture, escape, combat, timeouts, multiplayer and victory; all 20 card faces decode, no browser errors.`,
  );
} finally {
  await browser.close();
}
