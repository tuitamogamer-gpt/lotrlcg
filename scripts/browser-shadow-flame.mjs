import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make, stats } from "../src/game/core.ts";
import { SHADOW_FLAME as S } from "../src/game/shadow-flame-support.ts";
import {
  selectSeat,
  syncSeat,
  playerOrder,
  seatView,
} from "../src/game/table.ts";
import { questFace } from "../src/ui/tabletop.tsx";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/shadow-flame";
await fs.mkdir(dir, { recursive: true });
function fixture(players = 1) {
  let s;
  for (let seed = 1; seed < 50; seed++) {
    s = createGame(
      seed,
      STARTERS[0].cards,
      STARTERS[0].heroes,
      STARTERS[0].id,
      {
        scenarioId: "shadow-and-flame",
        ...(players > 1
          ? {
              seats: STARTERS.slice(0, players).map((d) => ({
                deckId: d.id,
                heroes: d.heroes,
              })),
            }
          : {}),
      },
    );
    for (
      let i = 0;
      i < 100 && s.status === "playing" && (s.choice || s.phase === "setup");
      i++
    )
      s = applyAction(
        s,
        s.choice
          ? {
              type: "CHOOSE",
              id:
                s.choice.options.find((o) =>
                  ["skip", "done", "resolve"].includes(o.id),
                )?.id ?? s.choice.options[0].id,
            }
          : { type: "KEEP" },
      );
    if (s.status === "playing" && s.phase !== "setup") break;
  }
  assert.equal(s.status, "playing");
  for (const p of playerOrder(s)) {
    if (s.table) selectSeat(s, p);
    s.heroes.forEach((h) =>
      Object.assign(h, {
        resources: 10,
        damage: 0,
        attachments: [],
        exhausted: false,
        committed: false,
      }),
    );
    Object.assign(s, {
      threat: 20,
      allies: [],
      hand: [],
      engaged: [],
      used: [],
      committedIds: [],
    });
    if (s.table) syncSeat(s);
  }
  if (s.table) {
    selectSeat(s, 0);
    s.table.turn = 0;
    s.table.first = 0;
    s.table.passed = [];
  }
  Object.assign(s, {
    phase: "encounter",
    stage: 1,
    stageRevealing: false,
    progress: 0,
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    lastReveal: null,
    encounterDiscard: [],
    encounterDeck: ["01087", "01088"],
    shadowFlame: { roundAttackBonus: 0 },
    combat: null,
    suspendedCombats: [],
    optionalEngagement: false,
  });
  s.staging = [make(s, S.bane)];
  return s;
}
const multiplayer = fixture(2),
  fourPlayers = fixture(4),
  pit = fixture();
pit.phase = "attack";
pit.stage = 3;
pit.activeLocation = make(pit, S.pit);
pit.staging[0].damage = 25;
pit.deck = ["01073", "01073", "01062"];
for (const s of [multiplayer, fourPlayers, pit]) assert.ok(validateSave(s));
const browser = await chromium.launch({ headless: true }),
  errors = [];
async function saved(p) {
  return p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
}
async function load(p, s) {
  await p.evaluate((game) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(game));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function reload(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function choose(p, id) {
  const s = await reviewedState(p),
    o = s.choice.options.find((o) => o.id === id);
  assert.ok(o, `Missing ${id}: ${JSON.stringify(s.choice)}`);
  await p
    .getByRole("dialog")
    .getByRole("button", { name: o.label, exact: true })
    .click();
  return reviewedState(p);
}
async function capture(p, name, height) {
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
  if (await p.getByRole("dialog").count()) {
    const r = await p.getByRole("dialog").boundingBox();
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
    const baneCard = () =>
      p.locator(".board-card").filter({
        has: p.getByRole("button", {
          name: "Inspect Durin's Bane",
          exact: true,
        }),
      });
    await load(p, fourPlayers);
    assert.equal(await baneCard().count(), 1);
    assert.match(
      await baneCard()
        .locator(".considered-engagement")
        .getAttribute("aria-label"),
      /Player 1 · Player 2 · Player 3 · Player 4/,
    );
    const caption = await baneCard()
        .locator(".considered-engagement")
        .boundingBox(),
      control = await baneCard()
        .getByRole("button", { name: "Engage", exact: true })
        .boundingBox();
    assert.ok(
      caption.y + caption.height <= control.y,
      "four-player caption stays above the action",
    );
    await capture(p, `staged-bane-four-player-caption-${width}`, height);
    await load(p, multiplayer);
    assert.equal(await baneCard().count(), 1);
    assert.match(
      await baneCard()
        .locator(".considered-engagement")
        .getAttribute("aria-label"),
      /Considered engaged with Player 1 · Player 2/,
    );
    assert.ok(
      await baneCard()
        .getByRole("button", { name: "Engage", exact: true })
        .isDisabled(),
    );
    assert.match(
      await baneCard()
        .getByRole("button", { name: "Engage", exact: true })
        .getAttribute("title"),
      /staging/i,
    );
    for (let player = 0; player < 2; player++) {
      await p
        .getByRole("button", { name: "Finish engagement choices", exact: true })
        .first()
        .click();
      await reviewedState(p);
    }
    let s = await saved(p);
    assert.equal(s.phase, "defense");
    assert.deepEqual(s.staging[0].shadows, []);
    assert.deepEqual(s.encounterDeck, ["01087", "01088"]);
    await baneCard()
      .getByRole("button", { name: "Defend", exact: true })
      .click();
    await capture(p, `staged-bane-first-defender-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Aragorn", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.table.active, 1);
    assert.equal(s.phase, "defense");
    assert.deepEqual(s.staging[0].consideredEnemyAttackedBy, [0]);
    assert.deepEqual(s.encounterDeck, ["01088"]);
    assert.deepEqual(s.staging[0].shadows, []);
    assert.ok(s.encounterDiscard.includes("01087"));
    assert.equal(s.table.seats[0].heroes[0].damage, 4);
    assert.equal(s.table.seats.flatMap((seat) => seat.engaged).length, 0);
    await reload(p);
    assert.equal(await baneCard().count(), 1);
    await capture(p, `staged-bane-second-player-${width}`, height);
    await baneCard()
      .getByRole("button", { name: "Defend", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Gimli", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.phase, "attack");
    assert.equal(s.table.active, 0);
    assert.deepEqual(s.staging[0].consideredEnemyAttackedBy, [0, 1]);
    assert.equal(s.encounterDeck.length, 0);
    assert.ok(s.encounterDiscard.includes("01088"));
    assert.equal(s.table.seats[1].heroes[0].damage, 4);
    assert.deepEqual(s.staging[0].shadows, []);
    await reload(p);
    await baneCard()
      .getByRole("button", { name: "Attack", exact: true })
      .click();
    for (const name of ["Théodred", "Glóin"])
      await p
        .getByRole("dialog")
        .getByRole("button", { name, exact: true })
        .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Attack · 4 power", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.staging[0].damage, 1);
    assert.deepEqual(s.staging[0].attackedBy, [0]);
    assert.equal(
      await baneCard()
        .getByRole("button", { name: "Attack", exact: true })
        .count(),
      0,
    );
    await p
      .getByRole("button", { name: "Finish attacks", exact: true })
      .first()
      .click();
    await reviewedState(p);
    await baneCard()
      .getByRole("button", { name: "Attack", exact: true })
      .click();
    for (const name of ["Legolas", "Thalin"])
      await p
        .getByRole("dialog")
        .getByRole("button", { name, exact: true })
        .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Attack · 5 power", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.staging[0].damage, 3);
    assert.deepEqual(s.staging[0].attackedBy, [0, 1]);
    assert.equal(await baneCard().count(), 1);
    await capture(p, `staged-bane-two-player-attacks-${width}`, height);
    await load(p, pit);
    assert.equal(
      await p.locator(".quest-card-stack img").getAttribute("src"),
      questFace(pit),
    );
    await p.locator(".quest-card-stack").click();
    await p
      .getByRole("button", { name: "Read printed quest", exact: true })
      .click();
    await p.getByRole("button", { name: "Show reverse", exact: true }).click();
    await capture(p, `stage3-printed-reverse-${width}`, height);
    await p.keyboard.press("Escape");
    await p
      .getByRole("button", { name: "Finish combat", exact: true })
      .first()
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.phase, "refresh");
    assert.equal(
      s.staging[0].damage,
      22,
      "Regenerate 3 resolves before refresh actions",
    );
    assert.equal(stats(s, s.staging[0]).health - s.staging[0].damage, 5);
    await p
      .getByRole("button", {
        name: "Dark Pit · Cast down Durin's Bane",
        exact: true,
      })
      .click();
    await capture(p, `dark-pit-count-${width}`, height);
    await choose(p, "pit:1");
    await reload(p);
    await choose(p, pit.heroes[0].id);
    s = await saved(p);
    assert.equal(s.status, "playing");
    assert.ok(s.staging.some((u) => u.code === S.bane));
    assert.equal(s.deck.length, 2);
    assert.ok(s.discard.includes("01073"));
    assert.ok(s.heroes[0].exhausted);
    assert.match(
      JSON.stringify(s.log),
      /printed cost 5 against 5 remaining hit points/,
    );
    await capture(p, `dark-pit-equality-fails-${width}`, height);
    await p
      .getByRole("button", {
        name: "Dark Pit · Cast down Durin's Bane",
        exact: true,
      })
      .click();
    await choose(p, "pit:2");
    await choose(p, pit.heroes[1].id);
    await reload(p);
    await capture(p, `dark-pit-saved-character-choice-${width}`, height);
    await choose(p, pit.heroes[2].id);
    s = await saved(p);
    assert.equal(s.status, "won");
    assert.ok(!s.staging.some((u) => u.code === S.bane));
    assert.ok(s.encounterDiscard.includes(S.bane));
    assert.equal(s.deck.length, 0);
    assert.match(
      JSON.stringify(s.log),
      /printed cost 7 against 5 remaining hit points/,
    );
    await reload(p);
    s = await saved(p);
    assert.equal(s.status, "won");
    await capture(p, `dark-pit-victory-${width}`, height);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Shadow and Flame client passed: one physical staged Bane, blocked optional Engage, two player defense and fresh/discarded shadows/save, both players' own attacks, real Refresh regeneration, Dark Pit strict comparison and saved choices/victory, printed stage3 reverse at1280/390/320.",
  );
} finally {
  await browser.close();
}
