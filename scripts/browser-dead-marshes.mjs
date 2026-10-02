import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { fx, make } from "../src/game/core.ts";
import { DEAD, deadMarshesEffect } from "../src/game/dead-marshes.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5201";
const dir = "output/dead-marshes";
const printedInto = JSON.parse(
  await fs.readFile("src/data/dead-marshes-quest-cards.json", "utf8"),
).find((c) => c.code === DEAD.into);
await fs.mkdir(dir, { recursive: true });
const deck = STARTERS.find((d) => d.id === "leadership");
let escape = createGame(77, deck.cards, deck.heroes, deck.id, {
  scenarioId: "dead-marshes",
});
escape = applyAction(escape, { type: "KEEP" });
escape.phase = "staging";
escape.choice = null;
escape.queue = [];
escape.staging = [make(escape, DEAD.gollum)];
escape.staging[0].resources = 3;
escape.encounterDeck = [DEAD.worm];
escape.heroes[0].attachments.push({
  id: `cram-${escape.nextId++}`,
  code: "131011",
  exhausted: false,
  owner: 0,
});
deadMarshesEffect(
  escape,
  fx("deadBeginEscape", { code: DEAD.gollum, count: 1, flag: true }),
);
assert.ok(validateSave(escape), "preparing escape fixture is a valid save");
const browser = await chromium.launch({ headless: true });
const errors = [];
const savedGollumTokens = async (p) =>
  p.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("there-and-back-again.save.v1"),
      ).staging.find((u) => u.code.endsWith("9009")).resources,
  );
async function capture(p, name, height) {
  await p.waitForFunction(
    () =>
      [...document.images].every((img) => {
        const r = img.getBoundingClientRect();
        return r.bottom <= 0 || r.top >= innerHeight || img.complete;
      }),
    null,
    { timeout: 25000 },
  );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: no horizontal overflow`,
  );
  const dialog = p.getByRole("dialog");
  if (await dialog.count()) {
    const box = await dialog.boundingBox();
    assert.ok(
      box.y >= 0 && box.y + box.height <= height + 1,
      `${name}: dialog fits`,
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
    await p.evaluate((game) => {
      localStorage.setItem(
        "there-and-back-again.save.v1",
        JSON.stringify(game),
      );
      localStorage.removeItem("there-and-back-again.choices.v1");
      localStorage.setItem("there-and-back-again.mode.v1", "normal");
    }, escape);
    await p.reload();
    await p.locator("#start-btn").click();
    let s = await reviewedState(p);
    assert.equal(s.scenario, "dead-marshes");
    assert.equal(s.escapeTest.phase, "preparing");
    assert.equal(await savedGollumTokens(p), 3);
    assert.match(
      await p.locator(".escape-test-summary").innerText(),
      /Gollum.*0 committed willpower.*1 escape card/s,
    );
    assert.match(await p.locator(".quest-goals").first().innerText(), /3.*8/s);
    await p.locator(".escape-test-summary").scrollIntoViewIfNeeded();
    await capture(p, `preparing-${width}`, height);
    await p
      .getByRole("button", { name: "Begin escape test", exact: true })
      .click();
    assert.equal(
      (await reviewedState(p)).choice.title,
      "Escape test · Commit willpower",
    );
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Aragorn", exact: true })
      .click();
    s = await reviewedState(p);
    assert.equal(s.escapeTest.committedIds.length, 1);
    assert.equal(s.heroes[0].exhausted, true);
    assert.ok(
      !s.choice.options.some((o) => o.id === s.heroes[0].id),
      "a committed character cannot be committed twice",
    );
    await capture(p, `commitment-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", {
        name: "Finish this player's escape commitment",
        exact: true,
      })
      .click();
    s = await reviewedState(p);
    assert.equal(s.escapeTest.phase, "actions");
    assert.equal(
      s.encounterCount,
      1,
      "escape cards are not dealt before the action window",
    );
    assert.match(
      await p.locator(".escape-test-summary").innerText(),
      /2 committed willpower.*action window is open/s,
    );
    const actionSnapshot = s.escapeTest;
    await p.reload();
    await p.locator("#start-btn").click();
    assert.deepEqual(
      (await reviewedState(p)).escapeTest,
      actionSnapshot,
      "the explicit escape action window survives reload",
    );
    await p.getByRole("button", { name: "Cram", exact: true }).click();
    s = await reviewedState(p);
    assert.equal(
      s.heroes[0].exhausted,
      false,
      "a readying action is reachable in the escape action window",
    );
    assert.equal(
      s.escapeTest.committedIds.length,
      1,
      "readying does not remove the committed character",
    );
    await p.locator(".escape-test-summary").scrollIntoViewIfNeeded();
    await capture(p, `actions-${width}`, height);
    await p
      .getByRole("button", { name: "Resolve escape test", exact: true })
      .click();
    s = await reviewedState(p);
    assert.equal(s.escapeTest, null);
    assert.ok(
      s.lastLog.some((l) => l.text.includes("2 willpower against 2 Escape")),
      "the escape card is dealt and its printed escape value is compared",
    );
    assert.equal(
      await savedGollumTokens(p),
      5,
      "tied strength fails and adds two tokens",
    );
    await p.reload();
    await p.locator("#start-btn").click();
    assert.equal(await savedGollumTokens(p), 5);
    await p
      .getByRole("button", {
        name: "Inspect quest: Into the Marshes",
        exact: true,
      })
      .click();
    await p
      .getByRole("button", { name: "Read printed quest", exact: true })
      .click();
    await p
      .getByRole("dialog", { name: "Into the Marshes", exact: true })
      .waitFor();
    await p.getByRole("button", { name: "Show reverse", exact: true }).click();
    assert.equal(
      await p
        .getByRole("button", { name: "Show front", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await p.locator(".card-detail-art img").getAttribute("src"),
      printedInto.back_imagesrc,
      "the reverse uses the exact printed quest scan",
    );
    await capture(p, `printed-quest-${width}`, height);
    await context.close();
  }
  assert.deepEqual(errors, [], "no browser errors");
  console.log(
    "Dead Marshes UI passed: explicit preparing, commitment and action windows, ability reachability, Gollum tokens, printed quest reverse, save/reload, and responsive layouts.",
  );
} finally {
  await browser.close();
}
