import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { officialStarterDecks } from "../src/game/products.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import { currentQuestCode } from "../src/game/quest-state.ts";
import { selectSeat, syncSeat } from "../src/game/table.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/collector";
await fs.mkdir(dir, { recursive: true });
const leadership = officialStarterDecks.find(
    (d) => d.id === "limited-leadership-spirit",
  ),
  lore = officialStarterDecks.find((d) => d.id === "limited-lore-tactics");
function fixture(deck = lore) {
  const s = applyAction(createGame(877, deck.cards, deck.heroes, "custom"), {
    type: "KEEP",
  });
  Object.assign(s, {
    queue: [],
    choice: null,
    staging: [],
    engaged: [],
    hand: [],
    activeLocation: null,
    lastReveal: null,
  });
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}
const attachment = fixture();
attachment.hand = [make(attachment, "10122")];
const defeat = fixture();
defeat.phase = "staging";
defeat.questAttachments = {
  [currentQuestCode(defeat)]: [
    { id: "long-defeat", code: "10122", owner: 0, exhausted: false },
  ],
};
defeat.heroes[0].committed = true;
defeat.heroes[0].exhausted = true;
defeat.heroes[0].tempWill = 10;
defeat.heroes[0].damage = 2;
defeat.heroes[2].damage = 3;
const defense = fixture(leadership);
defense.phase = "defense";
defense.heroes[0].roundKeywords = ["Sentinel"];
defense.allies = [make(defense, "131009")];
defense.hand = [make(defense, "145009")];
defense.engaged = [make(defense, "01082")];
let group = createGame(878, leadership.cards, leadership.heroes, "custom", {
  seats: [
    { heroes: leadership.heroes, deckId: "custom", cards: leadership.cards },
    { heroes: lore.heroes, deckId: "custom", cards: lore.cards },
  ],
});
while (group.phase === "setup") group = applyAction(group, { type: "KEEP" });
for (const i of [0, 1]) {
  selectSeat(group, i);
  group.hand = [];
  group.heroes.forEach((h) => (h.resources = 10));
  syncSeat(group);
}
selectSeat(group, 0);
group.allies = [make(group, "12117")];
group.heroes[0].damage = 3;
syncSeat(group);
selectSeat(group, 1);
Object.assign(group, { choice: null, queue: [], staging: [], engaged: [] });
for (const s of [attachment, defeat, defense, group])
  assert.ok(validateSave(s));
const browser = await chromium.launch({ headless: true }),
  errors = [];
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
async function saved(p) {
  return p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
}
async function choose(p, id) {
  const s = await reviewedState(p),
    o = s.choice.options.find((o) => o.id === id);
  assert.ok(o, `Missing${id}: ${JSON.stringify(s.choice)}`);
  const matching = s.choice.options.filter((x) => x.label === o.label);
  await p
    .getByRole("dialog")
    .getByRole("button", { name: o.label, exact: true })
    .nth(matching.findIndex((x) => x.id === id))
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
    assert.ok(r.y >= 0 && r.y + r.height <= height + 1, `${name}dialog fits`);
  }
  await p.screenshot({ path: `${dir}/${name}.png` });
}
async function nav(p, name) {
  const b = p.getByRole("button", { name, exact: true }),
    r = await b.boundingBox();
  if (!r || r.x < 0 || r.x + r.width > p.viewportSize().width)
    await p
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await b.click();
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
    await load(p, attachment);
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Flies and Spiders", exact: true })
      .click();
    await capture(p, `quest-target-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    assert.equal(
      await p
        .locator(".journey-area .table-attachments")
        .getByRole("button", {
          name: "Inspect attachment: The Long Defeat",
          exact: true,
        })
        .count(),
      1,
    );
    await reload(p);
    assert.ok(
      (await saved(p)).questAttachments[currentQuestCode(attachment)].some(
        (a) => a.code === "10122",
      ),
    );
    await load(p, defeat);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    let s = await reviewedState(p);
    assert.match(s.choice.title, /Long Defeat/);
    assert.equal(s.quest.stage, 1);
    await choose(p, "use");
    await choose(p, "heal");
    await choose(p, defeat.heroes[0].id);
    await choose(p, "heal-2");
    await capture(p, `healing-allocation-${width}`, height);
    await reload(p);
    await choose(p, defeat.heroes[2].id);
    await choose(p, "heal-3");
    await choose(p, "done");
    s = await saved(p);
    assert.equal(s.heroes[0].damage, 0);
    assert.equal(s.heroes[2].damage, 0);
    assert.equal(s.stage, 2);
    await load(p, group);
    await p
      .getByRole("button", {
        name: "Ioreth · Exhaust · spend Lore to heal 3",
        exact: true,
      })
      .click();
    await capture(p, `ioreth-other-player-payment-${width}`, height);
    await choose(p, group.heroes[0].id);
    await reload(p);
    s = await reviewedState(p);
    assert.match(s.choice.title, /Ioreth/);
    const old = group.table.seats[0].heroes[0].id;
    await choose(p, old);
    s = await saved(p);
    assert.equal(s.table.seats[0].heroes[0].damage, 0);
    assert.equal(s.table.seats[0].allies[0].exhausted, true);
    await load(p, defense);
    await p.getByRole("button", { name: "Defend", exact: true }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Aragorn", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    s = await reviewedState(p);
    assert.match(s.choice.title, /Desperate Defense/);
    await capture(p, `desperate-defense-${width}`, height);
    await choose(p, defense.heroes[0].id);
    await reload(p);
    await choose(p, defense.allies[0].id);
    s = await saved(p);
    assert.equal(s.heroes[0].damage, 0);
    assert.equal(s.heroes[0].exhausted, true);
    assert.equal(s.allies[0].damage, 2);
    if (width === 1280) {
      for (const d of [leadership, lore]) {
        await nav(p, "My fellowship");
        await p
          .locator(".published-starter")
          .filter({ hasText: d.name })
          .click();
        assert.match(
          await p.locator(".published-deck-detail").innerText(),
          /Collector|Limited Starter/,
        );
        assert.ok(
          await p
            .getByRole("button", { name: "Choose for play", exact: true })
            .isEnabled(),
        );
        await p
          .getByRole("button", { name: "Choose for play", exact: true })
          .click();
        await p
          .getByRole("button", {
            name: /Passage Through Mirkwood.*Beneath the ancient boughs/s,
          })
          .click();
        if ((await p.locator("#start-btn").innerText()).includes("Continue"))
          await p.locator(".new-adventure").click();
        else await p.locator("#start-btn").click();
        const replace = p.getByRole("dialog", {
          name: "A new journey?",
          exact: true,
        });
        if (await replace.isVisible())
          await replace
            .getByRole("button", { name: "Begin anew", exact: true })
            .click();
        s = await reviewedState(p);
        assert.equal(s.phase, "setup");
        assert.equal(s.deckCount + s.hand.length, 50);
        assert.deepEqual(
          s.heroes.map((h) => h.code),
          d.heroes,
        );
        await capture(p, `${d.id}-setup-${width}`, height);
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Collector UI passed: both exact retail 50-card starts, quest attachment target/save, Long Defeat allocation/advance/reload, Ioreth other-player action/payment, actual Desperate/Dori damage, and1280/390/320 layouts.",
  );
} finally {
  await browser.close();
}
