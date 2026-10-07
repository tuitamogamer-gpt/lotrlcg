import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as fixture } from "../tests/against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import { damage, destroy } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { validateSave } from "../src/game/engine.ts";
import { syncSeat } from "../src/game/table.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/dunland-players";
await fs.mkdir(dir, { recursive: true });
const swift = fixture("mirkwood");
swift.heroes[0].exhausted = true;
swift.hand = [make(swift, "08003")];
const swiftHero = swift.heroes[0].id,
  swiftCard = swift.hand[0].id;
const close = fixture("mirkwood");
close.heroes[1] = make(close, "01006");
close.heroes[1].resources = 10;
close.startingHeroes = close.heroes.map((h) => h.code);
close.hand = [make(close, "08005")];
const closeCard = close.hand[0].id;
damage(close, close.heroes[0].id, 6);
flush(close);
const lookout = fixture("mirkwood");
lookout.heroes[1] = make(lookout, "01012");
lookout.heroes[1].resources = 10;
lookout.startingHeroes = lookout.heroes.map((h) => h.code);
lookout.encounterDeck = ["01096", "01099"];
lookout.hand = [make(lookout, "08008")];
const song = fixture("mirkwood");
song.heroes[1].attachments = [
  { id: "browser-fall", code: "08007", exhausted: false },
];
destroy(song, song.heroes[1]);
flush(song);
const council = fixture("mirkwood", 2);
council.table.first = 1;
council.hand = [make(council, "08010")];
syncSeat(council);
for (const s of [swift, close, lookout, song, council])
  assert.ok(validateSave(s));

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
  const s = await reviewedState(p),
    index = s.choice.options.findIndex((o) => o.id === id);
  assert.ok(index >= 0, JSON.stringify(s.choice));
  await p
    .getByRole("dialog")
    .locator(".choice-list .decision-select")
    .nth(index)
    .click();
  return reviewedState(p);
}
async function play(p, target = false) {
  await p.locator(".hand-play:not(.hand-ability)").click();
  if (target)
    await p.locator(".target-selection .decision-select").first().click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  await p.evaluate(async () => {
    await Promise.all(
      [...document.images]
        .filter((i) => {
          const r = i.getBoundingClientRect();
          return r.width && r.height && r.bottom > 0 && r.top < innerHeight;
        })
        .map(async (i) => {
          i.loading = "eager";
          await i.decode();
        }),
    );
  });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: overflow`,
  );
  const dialog = p.getByRole("dialog");
  if (await dialog.count()) {
    const r = await dialog.last().boundingBox();
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

    await load(p, swift);
    await play(p, true);
    assert.equal(
      (await saved(p)).heroes.find((h) => h.id === swiftHero).exhausted,
      false,
    );
    assert.equal((await saved(p)).hand[0].id, swiftCard);
    await capture(p, `swift-return-${width}`, height);

    await load(p, close);
    await choose(p, closeCard);
    await capture(p, `close-call-x-${width}`, height);
    await resume(p);
    await choose(p, "cancel-2");
    assert.equal((await saved(p)).heroes[0].damage, 4);
    assert.equal((await saved(p)).threat, 22);

    await load(p, lookout);
    await play(p);
    await choose(p, "look");
    await capture(p, `lookout-peek-${width}`, height);
    await resume(p);
    await choose(p, "discard");
    assert.deepEqual((await saved(p)).encounterDiscard, ["01096"]);

    await load(p, song);
    await capture(p, `song-victory-${width}`, height);
    await resume(p);
    await choose(p, "victory");
    assert.deepEqual((await saved(p)).victoryCards, ["08007"]);
    assert.equal((await saved(p)).threat, 12);

    await load(p, council);
    await p.locator(".hand-play:not(.hand-ability)").click();
    assert.match(
      await p.locator(".payment-heading").innerText(),
      /Pay 2 resources/,
    );
    assert.equal(
      await p.getByRole("spinbutton", { name: "Choose X" }).count(),
      0,
    );
    await capture(p, `council-payment-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    const first = await reviewedState(p);
    assert.match(first.choice.title, /Player 2/);
    await choose(p, "draw");
    await capture(p, `council-distinct-options-${width}`, height);
    await resume(p);
    assert.ok(
      !(await reviewedState(p)).choice.options.some((o) => o.id === "draw"),
    );
    await choose(p, "resource");
    await choose(p, council.heroes[0].id);
    assert.ok((await saved(p)).table.seats[0].discard.includes("08010"));
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ screenshots, errors }, null, 2),
  );
  console.log(
    `The Dunland Trap player cards: ${screenshots.length} screenshots, actual payments and choices, reloads at 1280/390/320px; no browser errors.`,
  );
} finally {
  await browser.close();
}
