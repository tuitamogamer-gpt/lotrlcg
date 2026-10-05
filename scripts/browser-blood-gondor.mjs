import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS, SCRIPTED } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import { forOwner, selectSeat, syncSeat } from "../src/game/table.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/blood-gondor";
await fs.mkdir(dir, { recursive: true });
for (let n = 107; n <= 116; n++) assert.ok(SCRIPTED.has(`06${n}`));
function fixture(sphere, heroes, players = 1) {
  const d = STARTERS.find((d) => d.id === sphere);
  const cards = Object.fromEntries(
    Object.keys(d.cards).map((code) => [code, 3]),
  );
  cards[sphere === "leadership" ? "01032" : "01016"] = 2;
  let s = createGame(
    977,
    cards,
    heroes ?? d.heroes,
    "custom",
    players > 1
      ? {
          seats: [
            { deckId: "custom", cards, heroes: heroes ?? d.heroes },
            {
              deckId: "tactics",
              heroes: [...STARTERS.find((d) => d.id === "tactics").heroes],
            },
          ],
        }
      : {},
  );
  while (s.phase === "setup") s = applyAction(s, { type: "KEEP" });
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    engaged: [],
    hand: [],
    activeLocation: null,
    extraActiveLocations: [],
    lastReveal: null,
    encounterDeck: Array(20).fill("01099"),
    encounterDiscard: [],
    allies: [],
    used: [],
  });
  for (let player = 0; player < players; player++)
    forOwner(s, player, () => {
      s.hand = [];
      s.allies = [];
      s.discard = [];
      s.used = [];
      s.threat = 20;
      s.deck = Array(15).fill("01043");
      s.heroes.forEach((h) =>
        Object.assign(h, {
          resources: 10,
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
const caldara = fixture("spirit", ["06107", "01007", "01008"]);
caldara.discard = ["01043", "01044", "01045"];
const caldaraId = caldara.heroes[0].id;
const emery = fixture("spirit", undefined, 2);
emery.hand = [make(emery, "06112")];
emery.deck = ["01043", "01044", "01073", "01045", ...Array(10).fill("01043")];
syncSeat(emery);
const tome = fixture("leadership");
tome.heroes[0].attachments.push({
  id: "blood-browser-tome",
  code: "06109",
  exhausted: false,
  owner: 0,
});
tome.discard = ["06083", "06083", "06002", "06004"];
const poisoned = fixture("lore");
poisoned.hand = [make(poisoned, "06115")];
poisoned.encounterDeck = ["01084", ...Array(20).fill("01099")];
const children = fixture("spirit");
children.allies = [make(children, "01044")];
children.allies[0].temporary = true;
children.hand = [make(children, "06113")];
for (const s of [caldara, emery, tome, poisoned, children])
  assert.ok(validateSave(s));

const browser = await chromium.launch({ headless: true }),
  errors = [],
  assertions = [];
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
    `${name}: horizontal overflow`,
  );
  if (await p.getByRole("dialog").count()) {
    const r = await p.getByRole("dialog").boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= height + 1,
      `${name}: dialog clipped`,
    );
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
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);

    await load(p, caldara);
    await p
      .getByRole("button", {
        name: "Discard Caldara · put Spirit allies into play",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await capture(p, `caldara-spirit-allies-${width}`, height);
    await reload(p);
    await choose(p, "ally-0");
    await reload(p);
    await choose(p, "ally-1");
    let s = await saved(p);
    assert.ok(!s.heroes.some((u) => u.id === caldaraId));
    assert.deepEqual(
      s.allies.map((u) => u.code),
      ["01043", "01044"],
    );
    assert.ok(s.discard.includes("06107"));
    assert.equal(s.alliesPlayed, 0);
    await reload(p);

    await load(p, emery);
    await p
      .getByRole("button", {
        name: "Discard top 3 · put Emery into play",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await capture(p, `emery-controller-${width}`, height);
    await reload(p);
    await choose(p, "player-1");
    s = await saved(p);
    assert.deepEqual(s.table.seats[0].discard, ["01043", "01044", "01073"]);
    assert.equal(s.table.seats[1].allies[0].code, "06112");
    assert.equal(s.table.seats[1].allies[0].owner, 0);
    assert.equal(
      s.table.seats[1].deck.length,
      emery.table.seats[1].deck.length,
    );
    await reload(p);

    await load(p, tome);
    await p
      .getByRole("button", {
        name: "Discard Tome · play a Leadership event",
        exact: true,
      })
      .click();
    await choose(p, "discard-1");
    await capture(p, `tome-explicit-x-${width}`, height);
    await reload(p);
    await choose(p, "x-2");
    await capture(p, `tome-normal-payment-${width}`, height);
    await reload(p);
    await choose(p, "pay-0");
    s = await saved(p);
    assert.equal(s.discard.filter((code) => code === "06083").length, 1);
    assert.ok(s.discard.includes("06109"));
    assert.equal(s.resolvingEvents[0].unit.code, "06083");
    assert.equal(s.resolvingEvents[0].destination, "bottom");
    const eventId = s.resolvingEvents[0].unit.id;
    await capture(p, `tome-physical-event-pending-${width}`, height);
    await reload(p);
    assert.equal((await saved(p)).resolvingEvents[0].unit.id, eventId);
    await choose(p, "discard-1");
    await reload(p);
    await choose(p, "discard-1");
    s = await saved(p);
    assert.equal(s.resolvingEvents, undefined);
    assert.equal(s.deck.at(-1), "06083");
    assert.equal(
      s.hand.filter((u) => ["06002", "06004"].includes(u.code)).length,
      2,
    );
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      28,
    );
    await reload(p);

    await load(p, poisoned);
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.staging[0].code, "06115");
    const trapId = s.staging[0].id;
    assert.match(
      await p.locator(".objective-status").innerText(),
      /Trap in staging/,
    );
    await capture(p, `poisoned-stakes-unattached-${width}`, height);
    await reload(p);
    await p
      .getByRole("button", { name: "Begin quest", exact: true })
      .first()
      .click();
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .first()
      .click();
    await reviewedState(p);
    s = await saved(p);
    const enemy = s.staging.find((u) => u.code === "01084");
    assert.ok(
      enemy.attachments.some(
        (a) => a.id === trapId && a.code === "06115" && a.owner === 0,
      ),
    );
    await capture(p, `poisoned-stakes-attached-${width}`, height);
    await reload(p);
    await p
      .getByRole("button", { name: "Resolve quest", exact: true })
      .first()
      .click();
    await reviewedState(p);
    await p
      .getByRole("button", { name: "Continue without travel", exact: true })
      .first()
      .click();
    await reviewedState(p);
    await p
      .getByRole("button", { name: "Engagement checks", exact: true })
      .first()
      .click();
    await reviewedState(p);
    // At threat below the enemy's engagement cost, there are no attacks to resolve.
    s = await saved(p);
    assert.equal(s.phase, "attack");
    await p
      .getByRole("button", {
        name: /^(End round|Finish combat|End combat|Refresh)$/,
      })
      .first()
      .click();
    await reviewedState(p);
    s = await saved(p);
    if (s.phase === "refresh") {
      await p
        .getByRole("button", { name: "Begin next round", exact: true })
        .first()
        .click();
      await reviewedState(p);
      s = await saved(p);
    }
    assert.equal(s.staging.find((u) => u.id === enemy.id).damage, 2);
    await reload(p);

    for (const destination of ["hand", "deck"]) {
      await load(p, children);
      await p.locator(".hand-play:not(.hand-ability)").click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Lórien Guide", exact: true })
        .click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Play card", exact: true })
        .click();
      await reviewedState(p);
      const deckBefore = (await saved(p)).deck.length;
      await p
        .getByRole("button", { name: "Begin quest", exact: true })
        .first()
        .click();
      await reviewedState(p);
      assert.match(
        (await reviewedState(p)).choice.title,
        /first end-of-phase effect/,
      );
      await capture(
        p,
        `children-first-departure-${destination}-${width}`,
        height,
      );
      await reload(p);
      await choose(p, destination);
      s = await saved(p);
      assert.equal(s.allies.length, 0);
      assert.equal(
        s.hand.filter((u) => u.code === "01044").length,
        destination === "hand" ? 1 : 0,
      );
      assert.equal(
        s.deck.length,
        deckBefore + (destination === "deck" ? 1 : 0),
      );
      await reload(p);
    }
    assertions.push({
      width,
      height,
      flows: [
        "Caldara saved selections",
        "Emery controller/ownership",
        "Tome paid X and pending physical event",
        "Poisoned Stakes staging attach and round damage",
        "Children and Sneak Attack conflicting departures",
      ],
      status: "passed",
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify({ status: "passed", assertions, errors }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      { status: "passed", assertions, screenshots: dir, errors },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
