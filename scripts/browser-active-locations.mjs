import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201";
const dir = "output/active-locations";
await fs.mkdir(dir, { recursive: true });
const deck = STARTERS[0];
let fixture = applyAction(createGame(92, deck.cards, deck.heroes, deck.id), {
  type: "KEEP",
});
fixture.activeLocation = make(fixture, "01100");
fixture.activeLocation.progress = 1;
fixture.extraActiveLocations = [make(fixture, "01078")];
fixture.extraActiveLocations[0].progress = 2;
fixture.hand = [];
fixture.heroes[0].attachments.push({
  id: `hidden-${fixture.nextId++}`,
  code: "131011",
  owner: 0,
  exhausted: false,
  facedown: true,
});
assert.ok(validateSave(fixture));
const browser = await chromium.launch({ headless: true });
const errors = [];
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
    await p.evaluate((s) => {
      localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(s));
      localStorage.setItem("there-and-back-again.mode.v1", "normal");
      localStorage.removeItem("there-and-back-again.choices.v1");
    }, fixture);
    await p.reload();
    await p.locator("#start-btn").click();
    await reviewedState(p);
    assert.equal(await p.locator(".active-location-entry").count(), 2);
    assert.match(
      await p.locator(".multiple-active-locations").innerText(),
      /Forest Gate.*1 \/ 4 progress.*Mountains of Mirkwood.*2 \/ 3 progress/s,
    );
    const hidden = p.getByLabel("Facedown attachment", { exact: true });
    assert.equal(await hidden.count(), 1);
    assert.equal(await hidden.locator(".table-card-back").count(), 1);
    assert.equal(
      await hidden.locator("img").getAttribute("src"),
      "/art/premium/fellowship-back.webp",
    );
    assert.equal(await hidden.locator("[data-card-code]").count(), 0);
    assert.equal(
      await p
        .getByRole("button", { name: "Inspect attachment: Cram", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await p.getByRole("button", { name: "Cram", exact: true }).count(),
      0,
    );
    await p.locator(".multiple-active-locations").scrollIntoViewIfNeeded();
    await p.waitForFunction(() =>
      [...document.querySelectorAll(".multiple-active-locations img")].every(
        (i) => i.complete,
      ),
    );
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.screenshot({ path: `${dir}/locations-${width}.png` });
    await p
      .getByRole("button", {
        name: "Inspect active location: Mountains of Mirkwood",
        exact: true,
      })
      .click();
    await p
      .getByRole("dialog", { name: "Mountains of Mirkwood", exact: true })
      .waitFor();
    await p.keyboard.press("Escape");
    await p.reload();
    await p.locator("#start-btn").click();
    await reviewedState(p);
    assert.equal(await p.locator(".active-location-entry").count(), 2);
    assert.equal(
      await p.getByLabel("Facedown attachment", { exact: true }).count(),
      1,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Active-location UI passed: both locations and progress counters, independent inspection, hidden attachment identity, save/reload, and responsive layouts.",
  );
} finally {
  await browser.close();
}
