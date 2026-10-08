import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  base as fixture,
  choose as engineChoose,
} from "../tests/tharbad-fixtures.ts";
import { validateSave, createGame } from "../src/game/engine.ts";
import { STARTERS, imageUrl } from "../src/game/cards.ts";
import { make, fx } from "../src/game/core.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import { syncSeat } from "../src/game/table.ts";
import { removeQuestTime } from "../src/game/quest-time.ts";
import {
  THARBAD as T,
  THARBAD_ENCOUNTERS,
  THARBAD_QUESTS,
} from "../src/game/tharbad-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178",
  dir = "output/tharbad";
await fs.mkdir(dir, { recursive: true });
function settle(s) {
  flush(s);
  for (let i = 0; s.choice; i++) {
    assert.ok(i < 60);
    s = engineChoose(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function final() {
  let s = fixture();
  effect(s, fx("tharbadAdvance"));
  s = settle(s);
  s.staging = s.staging.filter((u) => u.code === T.crossing);
  s.victoryCards = [T.mug];
  s.victory = 4;
  return s;
}
const advancing = fixture();
advancing.phase = "staging";
advancing.threat = 2;
advancing.tharbad.elimination = 40;
advancing.heroes[0].committed = true;
advancing.heroes[0].exhausted = true;
advancing.encounterDeck = [T.spy, T.inn, T.cornered];
const time = fixture();
time.phase = "refresh";
time.tharbad.time = 1;
time.threat = 30;
const deadline = final();
deadline.engaged = [make(deadline, T.bellach)];
deadline.encounterDeck = [T.crossing];
deadline.tharbad.time = 1;
removeQuestTime(deadline);
flush(deadline);
const doomed = structuredClone(deadline);
const gandalf = final();
gandalf.hand = [make(gandalf, "01073")];
const rooftop = fixture();
rooftop.phase = "travel";
rooftop.staging = [make(rooftop, T.rooftops)];
rooftop.engaged = [make(rooftop, T.spy)];
const inn = fixture();
inn.phase = "travel";
inn.staging = [make(inn, T.inn)];
inn.encounterDeck = [T.spy];
const hideout = fixture();
hideout.phase = "planning";
hideout.activeLocation = make(hideout, T.hideout);
const victory = final();
victory.phase = "staging";
victory.staging[0].progress = 11;
victory.heroes[0].committed = true;
victory.heroes[0].exhausted = true;
victory.heroes[1].committed = true;
victory.heroes[1].exhausted = true;
const d = STARTERS[0],
  four = createGame(47, d.cards, d.heroes, d.id, {
    scenarioId: "trouble-in-tharbad",
    easy: true,
    seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
  });
for (const s of [
  advancing,
  time,
  deadline,
  doomed,
  gandalf,
  rooftop,
  inn,
  hideout,
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
  const option = s.choice?.options.find((o) => o.id === id);
  assert.ok(option, JSON.stringify(s.choice));
  await p
    .getByRole("dialog")
    .locator(".choice-list .decision-select")
    .filter({ hasText: option.label })
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
    await p.locator(".mission-trouble-in-tharbad").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await capture(p, `opening-hand-${width}`, height);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    let state = await saved(p);
    assert.equal(state.activeLocation.code, T.mug);
    assert.equal(state.allies[0].code, T.nalir);
    await capture(p, `nalir-and-mug-${width}`, height);
    await resume(p);
    await load(p, advancing);
    await capture(p, `forty-threat-limit-${width}`, height);
    assert.equal(
      await p.getByRole("meter").getAttribute("aria-valuemax"),
      "40",
    );
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.stage, 2);
    assert.equal(state.threat, 0);
    assert.equal(state.tharbad.elimination, 40);
    assert.ok(state.staging.some((u) => u.code === T.crossing));
    await capture(p, `escape-transition-${width}`, height);
    await load(p, time);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.tharbad.elimination, 40);
    assert.equal(state.tharbad.time, 4);
    await capture(p, `time-deadline-${width}`, height);
    await load(p, deadline);
    await capture(p, `bellach-time-choice-${width}`, height);
    await resume(p);
    await choose(p, "attack");
    await capture(p, `defend-nalir-${width}`, height);
    await resume(p);
    await choose(p, deadline.heroes[0].id);
    state = await saved(p);
    assert.equal(state.allies.find((u) => u.code === T.nalir).damage, 0);
    assert.equal(state.tharbad.time, 3);
    await capture(p, `nalir-protected-${width}`, height);
    await load(p, doomed);
    await choose(p, "attack");
    await choose(p, "undefended");
    state = await saved(p);
    assert.equal(state.status, "lost");
    assert.match(state.reason, /Nalir/);
    await capture(p, `nalir-lost-${width}`, height);
    await load(p, gandalf);
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
    await capture(p, `gandalf-entry-${width}`, height);
    await choose(p, "threat");
    state = await saved(p);
    assert.ok(state.removed.includes("01073"));
    assert.equal(state.threat, 17);
    await capture(p, `mug-removes-gandalf-${width}`, height);
    await load(p, rooftop);
    await p.getByRole("button", { name: "Travel here", exact: true }).click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.engaged.length, 0);
    assert.equal(state.activeLocation.code, T.rooftops);
    await capture(p, `rooftop-escape-${width}`, height);
    await load(p, inn);
    await p.getByRole("button", { name: "Travel here", exact: true }).click();
    await reviewedState(p);
    await capture(p, `inn-search-${width}`, height);
    await resume(p);
    await choose(p, `deck:${T.spy}`);
    state = await saved(p);
    assert.equal(state.activeLocation.code, T.inn);
    assert.ok(state.staging.some((u) => u.code === T.spy));
    await capture(p, `spy-found-${width}`, height);
    await load(p, hideout);
    await p.locator(".turn-actions .primary:visible").click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.activeLocation, null);
    assert.equal(state.tharbad.time, 4);
    await capture(p, `hideout-explored-${width}`, height);
    await load(p, victory);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.status, "won");
    await capture(p, `crossing-victory-${width}`, height);
    await load(p, four);
    for (let i = 0; i < 30; i++) {
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
    assert.equal(state.staging.filter((u) => u.code === T.spy).length, 4);
    assert.equal(state.encounterDeck.length, 24);
    await capture(p, `four-player-easy-${width}`, height);
    await resume(p);
    const sources = [...THARBAD_ENCOUNTERS, ...THARBAD_QUESTS].flatMap((c) => [
      imageUrl(c),
      ...(c.back_imagesrc
        ? [imageUrl({ ...c, imagesrc: c.back_imagesrc })]
        : []),
    ]);
    assert.equal(sources.length, 20);
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
    assert.deepEqual(failures, [], "twenty local faces decode");
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/results.json`,
    JSON.stringify({ status: "passed", screenshots, errors }, null, 2),
  );
  console.log(
    `Trouble in Tharbad: ${screenshots.length} browser checkpoints passed (${base}).`,
  );
} finally {
  await browser.close();
}
