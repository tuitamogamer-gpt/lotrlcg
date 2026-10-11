import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as fixture } from "../tests/fate-numenor-fixtures.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { STARTERS } from "../src/game/cards.ts";
import { make, fx } from "../src/game/core.ts";
import { handle, flush } from "../src/game/effects.ts";
import { fateAddIsland } from "../src/game/fate-numenor.ts";
import { FATE as F } from "../src/game/fate-numenor-support.ts";
import { syncSeat } from "../src/game/table.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178",
  dir = "output/fate-numenor";
await fs.mkdir(dir, { recursive: true });
const peek = fixture();
const peekIsland = fateAddIsland(peek, F.shrine);
peekIsland.progress = 4;
const travel = fixture();
travel.phase = "travel";
const travelIsland = fateAddIsland(travel, F.coast);
travelIsland.progress = 4;
travel.hand = [make(travel, "01051")];
travel.deck = ["01050"];
const calphon = fixture();
calphon.hand = [make(calphon, "01051")];
calphon.deck = ["01050", "01073"];
const victory = fixture(1, 2);
victory.phase = "staging";
victory.activeLocation = make(victory, F.shrine);
victory.activeLocation.progress = 7;
victory.heroes[0].committed = true;
victory.heroes[0].exhausted = true;
victory.heroes[0].tempWill = 20;
const loss = fixture();
loss.allies[0].damage = 2;
const enemy = make(loss, F.servant);
loss.engaged.push(enemy);
loss.encounterDeck = [F.temple];
handle(loss, fx("immediateAttack", { target: enemy.id }));
flush(loss);
const four = createGame(
  44,
  STARTERS[0].cards,
  STARTERS[0].heroes,
  STARTERS[0].id,
  {
    scenarioId: "the-fate-of-numenor",
    easy: true,
    seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
  },
);
for (const s of [peek, travel, calphon, victory, loss, four]) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid Fate browser fixture");
}
const browser = await chromium.launch({ headless: true }),
  errors = [],
  screenshots = [];
let lastPage;
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
  const s = await saved(p),
    o = s.choice?.options.find((o) => o.id === id);
  assert.ok(o, JSON.stringify(s.choice));
  await p
    .getByRole("dialog")
    .getByRole("button", { name: o.label, exact: true })
    .first()
    .click();
  return reviewedState(p);
}
async function choices(p) {
  for (let i = 0; i < 100; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (!s.choice) return s;
    await choose(
      p,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  throw Error("Fate browser choices stalled");
}
async function capture(p, label, height) {
  await reviewedState(p);
  await p.evaluate(async () => {
    await Promise.all(
      [...document.images]
        .filter((i) =>
          i.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
        )
        .map(async (i) => {
          i.loading = "eager";
          await i.decode();
        }),
    );
  });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${label}: horizontal overflow`,
  );
  const modal = p.getByRole("dialog");
  if (await modal.count()) {
    const box = await modal.last().boundingBox();
    assert.ok(
      box.y >= 0 && box.y + box.height <= height + 1,
      `${label}: clipped dialog`,
    );
  }
  const path = `${dir}/${label}.png`;
  await p.screenshot({ path });
  screenshots.push(path);
}
try {
  const viewports = [
    [1280, 900],
    [390, 844],
    [320, 750],
  ].filter(
    ([width]) =>
      !process.env.FATE_BROWSER_WIDTH ||
      String(width) === process.env.FATE_BROWSER_WIDTH,
  );
  for (const [width, height] of viewports) {
    const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: "reduce",
      }),
      p = await context.newPage();
    lastPage = p;
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(url);
    await p.getByRole("button", { name: /Classic solo/ }).click();
    await p.locator(".mission-the-fate-of-numenor").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    let s = await saved(p);
    assert.equal(s.staging.length, 2);
    assert.ok(s.staging.every((u) => u.code === F.lost));
    await capture(p, `opening-islands-${width}`, height);
    await load(p, peek);
    let publicBefore = await reviewedState(p);
    assert.ok(!JSON.stringify(publicBefore).includes(F.shrine));
    await p
      .getByRole("button", {
        name: "Remove 4 progress · Look at this island",
        exact: true,
      })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.choice.options[0].code, F.shrine);
    assert.equal(s.staging[0].code, F.lost);
    await capture(p, `private-island-look-${width}`, height);
    await resume(p);
    await choose(p, "close");
    assert.equal((await saved(p)).staging[0].progress, 0);
    await load(p, travel);
    await p.getByRole("button", { name: "Travel here", exact: true }).click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.activeLocation.code, F.coast);
    assert.equal(s.activeLocation.progress, 0);
    await capture(p, `forbidden-coast-choice-${width}`, height);
    await resume(p);
    s = await choices(p);
    assert.equal(s.hand.length, 0);
    assert.deepEqual(s.deck, ["01050", "01051"]);
    await load(p, calphon);
    await p
      .getByRole("button", {
        name: "Exhaust · Look at your bottom card",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await capture(p, `calphon-switch-${width}`, height);
    await choose(p, calphon.hand[0].id);
    s = await saved(p);
    assert.deepEqual(s.deck, ["01050", "01051"]);
    assert.equal(s.hand[0].code, "01073");
    await load(p, victory);
    await p.locator(".turn-actions .primary:visible").click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.status, "won");
    assert.ok(s.victoryCards.includes(F.shrine));
    await capture(p, `shrine-victory-${width}`, height);
    await load(p, loss);
    await choose(p, loss.allies[0].id);
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Calphon/);
    await capture(p, `calphon-loss-${width}`, height);
    await load(p, four);
    for (let i = 0; i < 80; i++) {
      await reviewedState(p);
      s = await saved(p);
      if (s.phase !== "setup") break;
      if (s.choice) await choose(p, s.choice.options[0].id);
      else
        await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    }
    s = await choices(p);
    assert.equal(s.table.seats.length, 4);
    assert.equal(s.staging.length, 3);
    assert.equal(s.encounterDeck.length, 17);
    await capture(p, `four-player-easy-${width}`, height);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ passed: true, screenshots, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ passed: true, screenshots: screenshots.length, errors }),
  );
} catch (e) {
  console.error(
    JSON.stringify({
      errors,
      screenshots,
      buttons:
        lastPage && !lastPage.isClosed()
          ? await lastPage.getByRole("button").allTextContents()
          : [],
    }),
  );
  if (lastPage && !lastPage.isClosed())
    await lastPage.screenshot({ path: `${dir}/failure.png` });
  throw e;
} finally {
  await browser.close();
}
