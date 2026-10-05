import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS, SCRIPTED } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as act } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import { forOwner, selectSeat, syncSeat } from "../src/game/table.ts";
import {
  STEWARD_FEAR as S,
  STREETS as G,
  STEWARD_FEAR_ENCOUNTERS,
  STEWARD_FEAR_QUESTS,
  STREETS_GONDOR_ENCOUNTERS,
} from "../src/game/steward-fear-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178",
  dir = "output/steward-fear";
await fs.mkdir(dir, { recursive: true });
for (const c of [
  ...STEWARD_FEAR_ENCOUNTERS,
  ...STEWARD_FEAR_QUESTS,
  ...STREETS_GONDOR_ENCOUNTERS,
])
  assert.ok(SCRIPTED.has(c.code), c.name);
function fixture(sphere = "spirit", players = 1) {
  const d = STARTERS.find((d) => d.id === sphere),
    cards = Object.fromEntries(Object.keys(d.cards).map((c) => [c, 3]));
  cards[sphere === "leadership" ? "01032" : "01016"] = 2;
  let s = createGame(986, cards, d.heroes, "custom", {
    scenarioId: "the-stewards-fear",
    ...(players > 1
      ? {
          seats: [
            { cards, heroes: d.heroes, deckId: "custom" },
            {
              deckId: "tactics",
              heroes: STARTERS.find((d) => d.id === "tactics").heroes,
            },
          ],
        }
      : {}),
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    encounterDeck: Array(20).fill("01099"),
    encounterDiscard: [],
    stage: 1,
    progress: 0,
    stewardFear: {
      underworldDeck: [],
      underneath: {},
      pendingUnderworld: [],
      removedHidden: [S.flames, S.alliance, S.castamir, S.bane],
      hiddenPlot: S.counsels,
      hiddenVillain: S.daughter,
      rootsSetAside: S.roots,
      questResources: 0,
    },
  });
  for (let player = 0; player < players; player++)
    forOwner(s, player, () => {
      s.hand = [];
      s.discard = [];
      s.allies = [];
      s.engaged = [];
      s.used = [];
      s.threat = 20;
      s.deck = Array(20).fill("01043");
      s.committedIds = [];
      s.heroes.forEach((h) =>
        Object.assign(h, {
          resources: 8,
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        }),
      );
    });
  selectSeat(s, 0);
  return s;
}
const map = fixture();
map.stewardFear.questResources = 3;
map.stewardFear.underworldDeck = [S.scrap];
map.activeLocation = make(map, S.storehouse);
map.stewardFear.underneath[map.activeLocation.id] = [S.prisoner];
map.staging = [make(map, S.map)];
const trouble = fixture("lore"),
  denethor = trouble.heroes.find((h) => h.code === "01010");
denethor.attachments = [
  { id: "steward-browser-local", code: G.localTrouble, exhausted: false },
  { id: "steward-browser-courage", code: "01057", exhausted: false },
];
const market = fixture("spirit", 2);
market.phase = "travel";
market.staging = [make(market, G.market)];
const lost = fixture("spirit", 2);
lost.phase = "quest";
lost.encounterDeck = [G.lostCity, S.storehouse, "01099"];
lost.encounterDiscard = [G.market];
lost.stewardFear.underworldDeck = [G.pickpocket];
const daughter = fixture("spirit", 2);
daughter.phase = "defense";
forOwner(daughter, 1, () => {
  daughter.engaged = [make(daughter, S.daughter)];
  daughter.heroes[0].tempDefense = 8;
});
selectSeat(daughter, 1);
daughter.table.turn = 1;
const victory = fixture("tactics");
victory.phase = "attack";
victory.stage = 3;
victory.progress = 15;
delete victory.stewardFear.hiddenPlot;
delete victory.stewardFear.hiddenVillain;
delete victory.stewardFear.rootsSetAside;
victory.engaged = [make(victory, S.bane)];
victory.heroes.find((h) => h.code === "01004").tempAttack = 12;
const flames = fixture();
flames.phase = "refresh";
flames.stage = 2;
delete flames.stewardFear.hiddenPlot;
flames.stewardFear.removedHidden = [S.counsels, S.alliance, S.castamir, S.bane];
flames.staging = [make(flames, S.flames)];
flames.staging[0].resources = 1;
flames.deck = ["01043", "01044"];
for (const s of [map, trouble, market, lost, daughter, victory, flames]) {
  syncSeat(s);
  assert.ok(validateSave(s));
}
const browser = await chromium.launch({ headless: true }),
  errors = [],
  screenshots = [];
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
    index = s.choice.options.findIndex((o) => o.id === id);
  assert.ok(index >= 0, `Missing ${id}: ${JSON.stringify(s.choice)}`);
  await p
    .getByRole("dialog")
    .locator(".choice-list .decision-select")
    .nth(index)
    .click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  await p
    .waitForFunction(
      () =>
        [...document.images].every((img) => {
          const r = img.getBoundingClientRect();
          return (
            !!img.closest("details:not([open])") ||
            (img.checkVisibility &&
              !img.checkVisibility({
                visibilityProperty: true,
                contentVisibilityAuto: true,
              })) ||
            !r.width ||
            !r.height ||
            r.bottom < 0 ||
            r.top > innerHeight ||
            r.right < 0 ||
            r.left > innerWidth ||
            img.complete
          );
        }),
      null,
      { timeout: 55000 },
    )
    .catch(async (error) => {
      console.error(
        "Pending images",
        await p.evaluate(() =>
          [...document.images]
            .filter((img) => !img.complete)
            .map((img) => ({
              src: img.src,
              rect: img.getBoundingClientRect().toJSON(),
              loading: img.loading,
            })),
        ),
      );
      throw error;
    });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: overflow`,
  );
  if (await p.getByRole("dialog").count()) {
    const r = await p.getByRole("dialog").boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= height + 1,
      `${name}: dialog clipping`,
    );
  }
  await p.screenshot({ path: `${dir}/${name}.png` });
  screenshots.push(`${dir}/${name}.png`);
}
const board = (p, title) =>
  p.locator(".board-card").filter({
    has: p.getByRole("button", { name: `Inspect ${title}`, exact: true }),
  });
async function claim(p, title, hero) {
  await board(p, title)
    .getByRole("button", { name: /^Claim/ })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: hero, exact: true })
    .click();
  return reviewedState(p);
}
async function combat(p, title, hero, defend) {
  await board(p, title)
    .getByRole("button", { name: defend ? "Defend" : "Attack", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: hero, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", {
      name: defend ? "Resolve enemy attack" : /^Attack ·/,
    })
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
    await load(p, map);
    await capture(p, `hidden-underworld-${width}`, height);
    const text = await p.evaluate(() => window.render_game_to_text());
    assert.ok(
      !text.includes(S.daughter) &&
        !text.includes(S.counsels) &&
        !text.includes(S.prisoner),
      "hidden identities leaked into debug presentation",
    );
    await claim(p, "Secret Map", "Éowyn");
    let s = await saved(p);
    assert.equal(s.heroes[0].attachments[0].id, map.staging[0].id);
    assert.equal(s.stewardFear.questResources, 3);
    await reload(p);
    await p
      .getByRole("button", { name: "Use Secret Map · 3 progress", exact: true })
      .click();
    await capture(p, `map-location-choice-${width}`, height);
    await reload(p);
    await choose(p, map.activeLocation.id);
    s = await saved(p);
    assert.equal(s.stage, 2);
    assert.equal(s.activeLocation.code, S.roots);
    assert.ok(s.staging.some((u) => u.code === S.prisoner));
    assert.equal(s.stewardFear.hiddenPlot, undefined);
    assert.ok(s.staging.some((u) => u.code === S.counsels));
    assert.deepEqual(s.victoryCards, [S.map]);
    await capture(p, `plot-revealed-${width}`, height);
    await reload(p);
    await claim(p, "A Prisoner", "Eleanor");
    assert.equal((await saved(p)).stewardFear.questResources, 2);
    await load(p, trouble);
    await p.getByRole("button", { name: "Look ahead", exact: true }).click();
    await reviewedState(p);
    await capture(p, `local-trouble-hero-trigger-${width}`, height);
    await reload(p);
    await choose(p, "keep");
    assert.equal((await saved(p)).threat, 22);
    await p
      .getByRole("button", { name: "Unexpected Courage", exact: true })
      .click();
    await reviewedState(p);
    assert.equal((await saved(p)).threat, 23);
    assert.equal(
      (await saved(p)).heroes.find((h) => h.id === denethor.id).exhausted,
      false,
    );
    await reload(p);
    await load(p, market);
    await board(p, "Market Square")
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(p);
    await capture(p, `market-first-player-payment-${width}`, height);
    await reload(p);
    await choose(p, market.table.seats[0].heroes[0].id);
    await capture(p, `market-second-player-payment-${width}`, height);
    await reload(p);
    await choose(p, market.table.seats[1].heroes[1].id);
    s = await saved(p);
    assert.equal(s.activeLocation.code, G.market);
    assert.equal(s.table.seats[0].heroes[0].resources, 7);
    assert.equal(s.table.seats[1].heroes[1].resources, 7);
    await load(p, lost);
    for (let seat = 0; seat < 2; seat++) {
      await p
        .getByRole("button", { name: "Commit this fellowship", exact: true })
        .first()
        .click();
      await reviewedState(p);
    }
    await capture(p, `lost-city-first-search-${width}`, height);
    await reload(p);
    await choose(p, "deck-0");
    await capture(p, `lost-city-second-search-${width}`, height);
    await reload(p);
    await choose(p, "discard-0");
    s = await saved(p);
    assert.ok(s.staging.some((u) => u.code === G.market));
    const store = s.staging.find((u) => u.code === S.storehouse);
    assert.deepEqual(s.stewardFear.underneath[store.id], [G.pickpocket]);
    for (const outcome of ["return", "prevent"]) {
      await load(p, daughter);
      await combat(p, "Daughter of Berúthiel", "Gimli", true);
      await capture(p, `daughter-${outcome}-choice-${width}`, height);
      await reload(p);
      await choose(p, outcome);
      s = await saved(p);
      assert.equal(s.table.seats[1].threat, outcome === "prevent" ? 24 : 20);
      assert.equal(
        s.staging.some((u) => u.code === S.daughter),
        outcome === "return",
      );
    }
    await load(p, victory);
    await combat(p, "Telemnar's Bane", "Gimli", false);
    s = await saved(p);
    assert.equal(s.status, "won");
    await capture(p, `villain-defeated-victory-${width}`, height);
    await reload(p);
    await load(p, flames);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .first()
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Up in Flames/);
    await capture(p, `flames-deck-loss-${width}`, height);
    await reload(p);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      { viewports: [1280, 390, 320], flows: 24, screenshots, errors },
      null,
      2,
    ),
  );
  console.log(
    "Steward client passed: hidden Underworld/Plot presentation, physical Map claim/use and stage2, Local Trouble hero-vs-attachment triggers, two-player Market and Lost City choices, both Daughter departures, stage3 victory and Flames loss with reload at1280/390/320.",
  );
} finally {
  await browser.close();
}
