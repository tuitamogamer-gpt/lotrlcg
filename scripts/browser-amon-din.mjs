import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS, SCRIPTED } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make, stats } from "../src/game/core.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/amon-din";
for (let n = 56; n <= 65; n++)
  assert.ok(
    SCRIPTED.has(`060${n}`),
    `Amon design060${n} must be registered before client proof`,
  );
await fs.mkdir(dir, { recursive: true });
function fixture(sphere, heroes) {
  const d = STARTERS.find((d) => d.id === sphere),
    cards = Object.fromEntries(Object.keys(d.cards).map((code) => [code, 3]));
  cards[sphere === "leadership" ? "01032" : "01016"] = 2;
  let s = applyAction(createGame(743, cards, heroes ?? d.heroes, "custom"), {
    type: "KEEP",
  });
  Object.assign(s, {
    queue: [],
    choice: null,
    staging: [],
    engaged: [],
    hand: [],
    activeLocation: null,
    extraActiveLocations: [],
    lastReveal: null,
    encounterDeck: [],
    encounterDiscard: [],
    allies: [],
    used: [],
  });
  s.heroes.forEach((h) =>
    Object.assign(h, {
      resources: 10,
      damage: 0,
      exhausted: false,
      committed: false,
      attachments: [],
    }),
  );
  return s;
}
const hobbits = ["06056", "02001", "02025"],
  pippin = fixture("spirit", hobbits),
  pit = fixture("lore"),
  small = fixture("spirit", hobbits),
  discipline = fixture("tactics"),
  book = fixture("tactics"),
  hobbitSense = fixture("spirit", hobbits);
hobbitSense.phase = "attack";
hobbitSense.engaged = [make(hobbitSense, "01089")];
hobbitSense.staging = [make(hobbitSense, "01083")];
hobbitSense.staging[0].attachments.push({
  id: "hobbit-sense-pit",
  code: "06064",
  exhausted: false,
  owner: 0,
});
hobbitSense.hand = [make(hobbitSense, "06065")];
book.discard = ["01035", "01035"];
book.engaged = [make(book, "01089")];
const bookHero = book.heroes.find((h) => h.code === "01005");
bookHero.attachments.push({
  id: "book-replay-proof",
  code: "06059",
  exhausted: false,
});
pippin.phase = "encounter";
pippin.staging = [make(pippin, "01089")];
pit.hand = [make(pit, "06064")];
pit.encounterDeck = ["01083"];
small.phase = "defense";
small.engaged = [make(small, "01082"), make(small, "01089")];
small.engaged[0].shadows = ["01087"];
small.hand = [make(small, "06062")];
discipline.phase = "defense";
discipline.engaged = [make(discipline, "01089")];
discipline.hand = [make(discipline, "06060")];
const gondor = discipline.heroes.find((h) => h.code === "01005");
gondor.damage = 3;
gondor.attachments.push({
  id: "discipline-gondor-steward",
  code: "01026",
  exhausted: false,
});
for (const s of [pippin, pit, small, discipline, book, hobbitSense])
  assert.ok(validateSave(s));
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
    await load(p, pippin);
    const orcs = () =>
      p.locator(".board-card").filter({
        has: p.getByRole("button", {
          name: "Inspect Dol Guldur Orcs",
          exact: true,
        }),
      });
    await orcs().getByRole("button", { name: "Engage", exact: true }).click();
    assert.match((await reviewedState(p)).choice.title, /Pippin/);
    await capture(p, `pippin-engagement-response-${width}`, height);
    await reload(p);
    await choose(p, "return");
    let s = await saved(p);
    assert.equal(s.threat, pippin.threat + 3);
    assert.equal(s.engaged.length, 0);
    assert.ok(s.staging.some((u) => u.id === pippin.staging[0].id));
    assert.equal(
      await orcs().getByRole("button", { name: "Engage", exact: true }).count(),
      0,
      "the player's one optional engagement is already spent",
    );
    await reload(p);
    await p
      .getByRole("button", { name: "Engagement checks", exact: true })
      .first()
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.engaged.length, 0);
    assert.equal(s.phase, "attack");
    await load(p, pit);
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.staging[0].code, "06064");
    assert.match(
      await p.locator(".objective-status").innerText(),
      /Trap in staging/,
    );
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
    const sniper = s.staging.find((u) => u.code === "01083");
    assert.ok(sniper);
    assert.equal(sniper.attachments[0].code, "06064");
    assert.equal(sniper.attachments[0].owner, 0);
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
    s = await saved(p);
    assert.equal(s.phase, "attack");
    assert.equal(s.engaged.length, 0);
    const staged = () =>
      p.locator(".board-card").filter({
        has: p.getByRole("button", {
          name: "Inspect Goblin Sniper",
          exact: true,
        }),
      });
    await staged().scrollIntoViewIfNeeded();
    await capture(p, `ithilien-pit-staging-attack-${width}`, height);
    await staged()
      .getByRole("button", { name: "Attack staging enemy", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Beravor", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Attack · 2 power", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.ok(s.encounterDiscard.includes("01083"));
    assert.ok(s.discard.includes("06064"));
    await reload(p);
    await load(p, small);
    await orcs().count();
    const troll = p.locator(".board-card").filter({
      has: p.getByRole("button", { name: "Inspect Hill Troll", exact: true }),
    });
    await troll.getByRole("button", { name: "Defend", exact: true }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Frodo Baggins", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
    assert.match((await reviewedState(p)).choice.title, /Small Target/);
    await capture(p, `small-target-enemy-choice-${width}`, height);
    await reload(p);
    await choose(p, small.engaged[1].id);
    s = await saved(p);
    assert.ok(s.encounterDiscard.includes("01089"));
    assert.ok(s.discard.includes("06062"));
    assert.equal(s.heroes.find((h) => h.code === "02025").damage, 0);
    await load(p, discipline);
    await orcs().getByRole("button", { name: "Defend", exact: true }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Leave undefended/ })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
    await choose(p, gondor.id);
    assert.match((await reviewedState(p)).choice.title, /Gondorian Discipline/);
    await choose(p, discipline.hand[0].id);
    await reload(p);
    await capture(p, `discipline-damage-amount-${width}`, height);
    await choose(p, "cancel-2");
    s = await saved(p);
    assert.ok(s.discard.includes("06060"));
    assert.equal(s.heroes.find((h) => h.id === gondor.id).damage, 3);
    assert.equal(s.status, "playing");
    await reload(p);
    await load(p, book);
    await p
      .getByRole("button", {
        name: "Discard Book · play a Tactics event",
        exact: true,
      })
      .click();
    await choose(p, "discard-0");
    await choose(p, bookHero.id);
    assert.match((await reviewedState(p)).choice.title, /Pay event cost/);
    await capture(p, `book-normal-payment-${width}`, height);
    await reload(p);
    s = await saved(p);
    assert.equal(s.heroes.find((h) => h.id === bookHero.id).resources, 10);
    assert.ok(
      s.heroes
        .find((h) => h.id === bookHero.id)
        .attachments.some((a) => a.id === "book-replay-proof"),
    );
    assert.equal(s.discard.filter((code) => code === "01035").length, 2);
    const payment = s.choice.options.find((o) =>
      o.effects?.some((e) => e.ids?.includes(`${bookHero.id}=1`)),
    );
    assert.ok(payment, "Book replay requires its normal one-resource payment");
    await choose(p, payment.id);
    s = await saved(p);
    assert.match((await reviewedState(p)).choice.title, /Quick Strike/);
    assert.equal(s.heroes.find((h) => h.id === bookHero.id).resources, 9);
    assert.ok(
      !s.heroes
        .find((h) => h.id === bookHero.id)
        .attachments.some((a) => a.id === "book-replay-proof"),
    );
    assert.ok(s.discard.includes("06059"));
    assert.equal(s.discard.filter((code) => code === "01035").length, 1);
    assert.equal(s.resolvingEvents.length, 1);
    assert.equal(s.resolvingEvents[0].unit.code, "01035");
    assert.equal(s.resolvingEvents[0].destination, "bottom");
    const replayId = s.resolvingEvents[0].unit.id;
    await capture(p, `book-physical-event-pending-${width}`, height);
    await reload(p);
    assert.equal((await saved(p)).resolvingEvents[0].unit.id, replayId);
    await choose(p, book.engaged[0].id);
    s = await saved(p);
    assert.equal(s.resolvingEvents[0].unit.id, replayId);
    assert.match((await reviewedState(p)).choice.title, /Victory responses/);
    await choose(p, `01005:${bookHero.id}`);
    s = await saved(p);
    assert.equal(s.resolvingEvents, undefined);
    assert.equal(s.discard.filter((code) => code === "01035").length, 1);
    assert.equal(s.deck.length, book.deck.length + 1);
    assert.equal(s.deck.at(-1), "01035");
    assert.ok(s.encounterDiscard.includes("01089"));
    assert.equal(s.heroes.find((h) => h.id === bookHero.id).exhausted, true);
    await reload(p);
    await load(p, hobbitSense);
    assert.ok(
      await orcs()
        .getByRole("button", { name: "Attack", exact: true })
        .isEnabled(),
    );
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    assert.ok(
      await orcs()
        .getByRole("button", { name: "Attack", exact: true })
        .isDisabled(),
    );
    assert.ok(
      await p
        .getByRole("button", { name: "Attack staging enemy", exact: true })
        .isDisabled(),
    );
    await reload(p);
    assert.ok(
      await orcs()
        .getByRole("button", { name: "Attack", exact: true })
        .isDisabled(),
    );
    await capture(p, `hobbit-sense-prevents-attack-${width}`, height);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Amon Din client passed: Pippin optional return and lasting engagement restriction, owned Pit in staging and non-Dunhere attack, Small Target redirect, Discipline saved damage selection, Book's normal payment, physical event identity through save and bottom-deck placement, and Hobbit-sense attack prohibition at1280/390/320.",
  );
} finally {
  await browser.close();
}
