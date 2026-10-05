import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as act } from "./fixture-phase-helper.ts";
import { make, fx } from "../src/game/core.ts";
import { resolveReveal } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import {
  globalEachSeat,
  globalPlayerOrder,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import {
  FOUNDATIONS_STONE as F,
  foundationsArea,
  foundationsSelectArea,
  foundationsState,
} from "../src/game/foundations-stone.ts";
import { KHAZAD as K } from "../src/game/khazad-dum.ts";
import { questFace } from "../src/ui/tabletop.tsx";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5203",
  dir = "output/foundations-stone";
await fs.mkdir(dir, { recursive: true });
function fixture(players = 1) {
  const d = STARTERS[0];
  let s = createGame(717, d.cards, d.heroes, d.id, {
    scenarioId: "foundations-of-stone",
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  for (
    let i = 0;
    i < 150 && (s.choice || s.phase === "setup" || s.flow?.pending);
    i++
  )
    s = act(
      s,
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? {
              type: "CHOOSE",
              id:
                s.choice.options.find((o) =>
                  ["skip", "done", "resolve", "discard"].includes(o.id),
                )?.id ?? s.choice.options[0].id,
            }
          : { type: "KEEP" },
    );
  assert.equal(s.status, "playing");
  Object.assign(s, {
    phase: "planning",
    stage: 4,
    stageRevealing: false,
    progress: 0,
    choice: null,
    queue: [],
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    encounterDiscard: [],
    encounterDeck: Array(20).fill(F.bats),
    lastReveal: null,
    questDebuff: 0,
    fog: 0,
    threatModifier: 0,
  });
  globalEachSeat(s, () => {
    s.hand = [];
    s.allies = [];
    s.engaged = [];
    s.used = [];
    s.deck = ["01013", "01015", "01018"];
    s.discard = [];
    s.threat = 20;
    s.heroes.forEach((h) =>
      Object.assign(h, {
        resources: 8,
        exhausted: false,
        committed: false,
        damage: 0,
        attachments: [],
      }),
    );
  });
  const f = foundationsState(s);
  f.setAside = [];
  f.split = true;
  f.resolvedAreas = [];
  f.travelPassedAreas = [];
  f.areas = globalPlayerOrder(s).map((p, i) => ({
    id: `browser-area-${p}`,
    players: [p],
    questCode: i ? F.rocks : F.lair,
    progress: 0,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    questDebuff: 0,
    fog: 0,
    threatModifier: 0,
  }));
  f.activeArea = undefined;
  selectSeat(s, 0);
  foundationsSelectArea(s, 0);
  syncSeat(s);
  return s;
}
const joined = fixture(2);
joined.phase = "staging";
joined.progress = 5;
foundationsArea(joined).completed = true;
joined.staging = [make(joined, F.helm)];
joined.activeLocation = make(joined, K.well);
const oldLocation = joined.activeLocation.id;
foundationsArea(joined, 1).progress = 2;
foundationsArea(joined, 1).staging = [make(joined, F.bats)];
foundationsState(joined).resolvedAreas = ["browser-area-1"];
syncSeat(joined);

const mithril = fixture(2);
mithril.phase = "refresh";
mithril.activeLocation = make(mithril, F.mithril);
const lode = mithril.activeLocation.id,
  mithrilHero = mithril.heroes[0].id;
syncSeat(mithril);

const lost = fixture();
lost.deck = [];
lost.hand = [make(lost, "02003")];
const lostHero = lost.heroes[0].id;
resolveReveal(lost, F.lost);
flush(lost);
syncSeat(lost);

const nameless = fixture(2);
nameless.phase = "encounter";
nameless.deck = ["01073", "01030", "01013"];
nameless.staging = [make(nameless, F.nameless)];
syncSeat(nameless);
for (const s of [joined, mithril, lost, nameless])
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));

const browser = await chromium.launch({ headless: true }),
  errors = [];
async function saved(p) {
  return p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
}
async function reload(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function load(p, s) {
  await p.evaluate((game) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(game));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  return reload(p);
}
async function choose(p, id) {
  const state = await reviewedState(p),
    index = state.choice.options.findIndex((o) => o.id === id);
  assert.ok(index >= 0, `Missing ${id}: ${JSON.stringify(state.choice)}`);
  await p
    .getByRole("dialog")
    .locator(".choice-list .decision-select")
    .nth(index)
    .click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  if (name.startsWith("physical-hero-restored"))
    await p
      .locator(".hero-company .character-card")
      .last()
      .scrollIntoViewIfNeeded();
  if (name.startsWith("nameless-paid-cards"))
    await p
      .locator(".board-card.has-attachments")
      .first()
      .scrollIntoViewIfNeeded();
  await p.waitForFunction(
    () =>
      [...document.images].every((img) => {
        const r = img.getBoundingClientRect();
        return (
          !r.width ||
          !r.height ||
          r.bottom < 0 ||
          r.top > innerHeight ||
          img.complete
        );
      }),
    null,
    { timeout: 25000 },
  );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name,
  );
  for (const d of await p.getByRole("dialog").all()) {
    const r = await d.boundingBox();
    assert.ok(r.y >= 0 && r.y + r.height <= height + 1, name);
  }
  await p.screenshot({ path: `${dir}/${name}.png` });
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

    await load(p, joined);
    assert.equal(
      await p.locator(".quest-card-stack img").getAttribute("src"),
      questFace(joined),
    );
    await capture(p, `separate-quest-${width}`, height);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    assert.match((await reviewedState(p)).choice.title, /Join/);
    await capture(p, `join-choice-${width}`, height);
    await reload(p);
    await choose(p, "browser-area-1");
    let s = await saved(p);
    assert.equal(s.foundationsStone.areas.length, 1);
    assert.deepEqual(s.foundationsStone.areas[0].players, [1, 0]);
    assert.equal(s.progress, 2);
    assert.ok(s.encounterDiscard.includes(K.well));
    assert.ok(!s.staging.some((u) => u.id === oldLocation));
    assert.ok(s.staging.some((u) => u.code === F.helm));
    await reload(p);
    await capture(p, `joined-after-reload-${width}`, height);

    await load(p, mithril);
    await p
      .getByRole("button", {
        name: "Exhaust a character · place its willpower on the quest",
        exact: true,
      })
      .click();
    await capture(p, `mithril-exhaust-${width}`, height);
    await reload(p);
    await choose(p, mithrilHero);
    s = await saved(p);
    assert.equal(s.progress, 2);
    assert.equal(s.activeLocation.progress, 0);
    assert.equal(s.heroes.find((h) => h.id === mithrilHero).exhausted, true);
    assert.equal(
      s.foundationsStone.areas.find((a) => a.id === "browser-area-1").progress,
      0,
    );
    await reload(p);
    await capture(p, `mithril-used-${width}`, height);

    await load(p, lost);
    await capture(p, `lost-hero-choice-${width}`, height);
    await reload(p);
    await choose(p, lostHero);
    s = await saved(p);
    assert.ok(s.foundationsStone.lostHeroes.some((h) => h.id === lostHero));
    assert.equal(s.deck.length, 1);
    await reload(p);
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.ok(s.heroes.some((h) => h.id === lostHero));
    assert.equal(s.heroes.find((h) => h.id === lostHero).resources, 0);
    assert.ok(!s.foundationsStone.lostHeroes.length);
    await reload(p);
    await capture(p, `physical-hero-restored-${width}`, height);

    await load(p, nameless);
    await p
      .getByRole("button", { name: "Engage", exact: true })
      .first()
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.engaged[0].attachments.length, 2);
    assert.deepEqual(
      s.engaged[0].attachments.map((a) => a.code),
      ["01073", "01030"],
    );
    const ids = s.engaged[0].attachments.map((a) => a.id);
    await reload(p);
    assert.deepEqual(
      (await saved(p)).engaged[0].attachments.map((a) => a.id),
      ids,
    );
    await capture(p, `nameless-paid-cards-${width}`, height);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/results.json`,
    JSON.stringify(
      {
        viewports: [1280, 390, 320],
        journeys: [
          "split/join/save",
          "Mithril/payment/save",
          "LostAndAlone/physicaldraw/save",
          "Nameless/attachedcopies/save",
        ],
        screenshots: 24,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Foundations of Stone: four actual UI journeys × three viewports, 24 screenshots; save/reload and no errors/overflow.",
  );
} finally {
  await browser.close();
}
