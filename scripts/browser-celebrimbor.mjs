import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  base as fixture,
  choose as engineChoose,
} from "../tests/celebrimbor-fixtures.ts";
import { validateSave, createGame } from "../src/game/engine.ts";
import { STARTERS, imageUrl, card } from "../src/game/cards.ts";
import { make, fx } from "../src/game/core.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import { check, progressLocation } from "../src/game/board.ts";
import {
  forOwner,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table.ts";
import { removeQuestTime } from "../src/game/quest-time.ts";
import {
  CELEBRIMBOR as C,
  CELEBRIMBOR_ENCOUNTERS,
  CELEBRIMBOR_QUESTS,
} from "../src/game/celebrimbor-support.ts";
import {
  celebrimborScourAll,
  celebrimborEncounter,
  celebrimborShadow,
} from "../src/game/celebrimbor.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178",
  dir = "output/celebrimbor";
await fs.mkdir(dir, { recursive: true });
function loc(s, code, active = false) {
  const u = make(s, code);
  if (active) s.activeLocation = u;
  else s.staging.push(u);
  return u;
}
function boss(s) {
  const u = make(s, C.bellach);
  s.staging.push(u);
  return u;
}
function mould(s, u) {
  const a = make(s, C.mould);
  u.attachments.push({ id: a.id, code: a.code, exhausted: false });
}
function protect(s) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => s.heroes.forEach((h) => (h.tempDefense = 20)));
}
function searched(s, n = 1) {
  for (let i = 0; i < n; i++) s.celebrimbor.search.push(make(s, C.tower));
}
const travel = fixture();
travel.phase = "travel";
travel.progress = 5;
mould(travel, loc(travel, C.chamber));
const explore = fixture();
explore.phase = "staging";
explore.progress = 3;
mould(explore, loc(explore, C.chamber, true));
explore.heroes[0].committed = true;
explore.heroes[0].exhausted = true;
explore.heroes[0].tempWill = 4;
const advance = fixture();
advance.phase = "staging";
advance.progress = 13;
mould(advance, advance.heroes[0]);
boss(advance);
protect(advance);
advance.heroes[0].committed = true;
advance.heroes[0].exhausted = true;
advance.encounterDeck = [C.scout, C.search];
const time = fixture();
boss(time);
loc(time, C.tower, true).damage = 2;
time.encounterDeck = [C.scout];
time.celebrimbor.time = 1;
removeQuestTime(time);
flush(time);
const allocation = fixture();
loc(allocation, C.foundation);
loc(allocation, C.remains);
loc(allocation, C.chamber);
celebrimborScourAll(allocation);
flush(allocation);
const prowler = fixture(2);
prowler.staging.push(make(prowler, C.prowler));
loc(prowler, C.remains, true);
protect(prowler);
prowler.encounterDeck = [C.search];
celebrimborScourAll(prowler);
flush(prowler);
const discovered = fixture(2);
for (const p of playerOrder(discovered))
  forOwner(
    discovered,
    p,
    () => (discovered.hand = [make(discovered, "01013")]),
  );
celebrimborEncounter(discovered, C.discovered);
flush(discovered);
const spies = fixture(2);
searched(spies, 2);
spies.encounterDeck = [C.spies, C.foundation];
effect(spies, fx("reveal"));
flush(spies);
const victory = fixture(1, 2);
const b = boss(victory);
b.damage = 3;
mould(victory, b);
victory.progress = 12;
victory.hand = [make(victory, "01073")];
check(victory);
const loss = fixture();
mould(loss, loc(loss, C.chamber, true));
loss.activeLocation.damage = 3;
loss.encounterDeck = [C.desecrated];
effect(loss, fx("reveal"));
flush(loss);
const d = STARTERS[0],
  four = createGame(22, d.cards, d.heroes, d.id, {
    scenarioId: "celebrimbors-secret",
    easy: true,
    seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
  });
for (const s of [
  travel,
  explore,
  advance,
  time,
  allocation,
  prowler,
  discovered,
  spies,
  victory,
  loss,
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
    await p.locator(".mission-celebrimbors-secret").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await capture(p, `opening-hand-${width}`, height);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    await capture(p, `setup-location-${width}`, height);
    await resume(p);
    await choose(p, C.tower);
    await choices(p);
    let state = await saved(p);
    assert.equal(state.phase, "resource");
    assert.equal(state.celebrimbor.time, 3);
    assert.equal(
      await p
        .getByRole("button", {
          name: "Mould · The Secret Chamber",
          exact: true,
        })
        .count(),
      1,
    );
    await capture(p, `ruins-of-ost-in-edhil-${width}`, height);
    await load(p, travel);
    await p.getByRole("button", { name: "Travel here", exact: true }).click();
    await reviewedState(p);
    state = await saved(p);
    assert.equal(state.progress, 2);
    assert.equal(state.activeLocation.code, C.chamber);
    await capture(p, `secret-chamber-travel-${width}`, height);
    await load(p, explore);
    await p.locator(".turn-actions .primary:visible").click();
    await reviewedState(p);
    await capture(p, `claim-mould-${width}`, height);
    await resume(p);
    state = await saved(p);
    await choose(p, state.heroes[1].id);
    state = await choices(p);
    assert.ok(state.heroes[1].attachments.some((a) => a.code === C.mould));
    assert.ok(state.victoryCards.includes(C.chamber));
    await capture(p, `mould-claimed-${width}`, height);
    await load(p, advance);
    await p.locator(".turn-actions .primary:visible").click();
    await reviewedState(p);
    await capture(p, `bellach-scour-search-${width}`, height);
    await choose(p, `deck:${C.scout}`);
    await capture(p, `bellach-attack-${width}`, height);
    await resume(p);
    state = await choices(p);
    assert.equal(state.stage, 2);
    assert.equal(state.celebrimbor.time, 3);
    assert.ok(
      state.staging
        .find((u) => u.code === C.bellach)
        .attachments.some((a) => a.code === C.mould),
    );
    assert.equal(
      await p
        .getByRole("button", { name: "Mould · Bellach", exact: true })
        .count(),
      1,
    );
    await capture(p, `mould-stolen-${width}`, height);
    await load(p, time);
    await capture(p, `scour-order-${width}`, height);
    await resume(p);
    state = await choices(p);
    assert.equal(state.celebrimbor.time, 3);
    assert.equal(state.celebrimbor.search.length, 1);
    assert.ok(state.staging.some((u) => u.code === C.scout));
    await capture(p, `orc-search-capture-${width}`, height);
    await load(p, allocation);
    await capture(p, `location-damage-choice-${width}`, height);
    state = await saved(p);
    await choose(p, state.staging.find((u) => u.code === C.remains).id);
    await resume(p);
    state = await choices(p);
    assert.equal(
      [
        ...state.staging,
        ...(state.activeLocation ? [state.activeLocation] : []),
      ].reduce((n, u) => n + u.damage, 0),
      3,
    );
    await capture(p, `location-damage-assigned-${width}`, height);
    await load(p, prowler);
    await capture(p, `prowler-threat-tie-${width}`, height);
    await choose(p, "player-1");
    await capture(p, `prowler-defense-${width}`, height);
    state = await saved(p);
    await choose(p, state.table.seats[1].heroes[0].id);
    state = await choices(p);
    assert.ok(state.table.seats[1].engaged.some((u) => u.code === C.prowler));
    assert.equal(state.activeLocation.damage, 1);
    await capture(p, `prowler-resolved-${width}`, height);
    await load(p, discovered);
    await capture(p, `discovered-choice-${width}`, height);
    await choose(p, "hand");
    state = await choices(p);
    assert.equal(state.celebrimbor.search.length, 2);
    assert.ok(
      state.table.seats.every(
        (s) => s.hand.length === 0 && s.discard.length === 0,
      ),
    );
    await capture(p, `hand-cards-captured-${width}`, height);
    await load(p, spies);
    await capture(p, `spies-exhaustion-${width}`, height);
    await resume(p);
    state = await choices(p);
    assert.ok(
      state.table.seats.every(
        (s) => s.heroes.filter((h) => h.exhausted).length === 2,
      ),
    );
    assert.deepEqual(state.encounterDeck, [C.foundation]);
    await capture(p, `spies-resolved-${width}`, height);
    await load(p, victory);
    await play(p, "01073");
    state = await saved(p);
    await choose(p, state.choice.options.find((o) => o.code === C.bellach).id);
    await capture(p, `reclaim-mould-${width}`, height);
    state = await saved(p);
    await choose(p, state.heroes[0].id);
    state = await saved(p);
    assert.equal(state.status, "won");
    await capture(p, `celebrimbor-victory-${width}`, height);
    await load(p, loss);
    state = await saved(p);
    assert.equal(state.status, "lost");
    await capture(p, `secret-chamber-lost-${width}`, height);
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
    assert.equal(state.phase, "resource");
    assert.equal(state.celebrimbor.setupLocations.length, 4);
    assert.equal(state.encounterDeck.length, 31);
    await capture(p, `four-player-easy-${width}`, height);
    await resume(p);
    const sources = [...CELEBRIMBOR_ENCOUNTERS, ...CELEBRIMBOR_QUESTS].flatMap(
      (c) => [
        imageUrl(c),
        ...(c.back_imagesrc
          ? [imageUrl({ ...c, imagesrc: c.back_imagesrc })]
          : []),
      ],
    );
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
    `Celebrimbor’s Secret: ${screenshots.length} browser checkpoints passed (${base}).`,
  );
} finally {
  await browser.close();
}
