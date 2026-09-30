import { legacyReviews } from "./browser-review-helpers.mjs";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.GAME_URL ?? "http://localhost:5178";
const dir = "output/motion";
await fs.mkdir(dir, { recursive: true });
const ui = JSON.parse(
  await fs.readFile("output/ui-review/fixture.json", "utf8"),
);
const fixtures = JSON.parse(
  await fs.readFile("output/presentation/fixtures.json", "utf8"),
);
const browser = await chromium.launch();
const errors = [];
const evidence = [];
const state = (p) => p.evaluate(() => JSON.parse(window.render_game_to_text()));
async function drain(p) {
  for (let i = 0; i < 40 && (await state(p)).resolution; i++) {
    await p.locator(".resolution-continue").click();
  }
  assert.ok(
    !(await state(p)).resolution,
    "reviews finish only through Continue",
  );
}
async function load(p, save) {
  await p.goto(base);
  await p.evaluate((save) => {
    localStorage.removeItem("there-and-back-again.choices.v1");
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(save));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.setItem("there-and-back-again.hover-cards", "off");
  }, save);
  await p.reload();
  await p.locator("#start-btn").click();
  await p.waitForTimeout(900);
}
async function shot(p, label) {
  await p.screenshot({ path: `${dir}/${label}.png`, animations: "allow" });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${label}: no page overflow`,
  );
}
async function sample(p, selector) {
  return p
    .locator(selector)
    .first()
    .evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      animations: el.getAnimations({ subtree: true }).map((a) => ({
        name: a.animationName ?? a.transitionProperty ?? "motion",
        state: a.playState,
        duration: a.effect.getTiming().duration,
      })),
    }));
}

try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const p = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion,
    });
    await legacyReviews(p);
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await load(p, ui);
    const original = await state(p);
    await p.getByRole("combobox", { name: "Sort hand" }).selectOption("name");
    await p.waitForTimeout(80);
    await shot(p, `${reducedMotion}-hand-reorder`);
    assert.deepEqual(
      (await state(p)).hand,
      original.hand,
      "sorting is presentation only",
    );
    await p.waitForTimeout(700);

    // A real payment, ally entering play and resource count changes.
    await p
      .locator(".hand-card")
      .filter({
        has: p.getByRole("button", {
          name: "Inspect Guard of the Citadel",
          exact: true,
        }),
      })
      .locator(".hand-play")
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    assert.ok((await state(p)).allies.some((u) => u.code === "01013"));
    await p.waitForTimeout(100);
    await shot(p, `${reducedMotion}-ally-play`);
    await drain(p);
    await p.waitForTimeout(1200);
    assert.equal(
      await p.locator("[inert][data-motion-card]").count(),
      0,
      "departed cards leave no controls behind",
    );
    await shot(p, `${reducedMotion}-table`);

    await p.locator(".turn-panel .turn-actions .primary").click();
    await drain(p);
    assert.equal((await state(p)).phase, "quest");
    await p
      .locator(".character-card")
      .filter({
        has: p.getByRole("button", { name: "Commit Glóin", exact: true }),
      })
      .locator(".character-art")
      .click();
    assert.ok((await state(p)).willpower > 0);
    await shot(p, `${reducedMotion}-quest-selection`);

    await load(p, fixtures.combat);
    await p.locator(".engaged-zone .card-action").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Aragorn/ })
      .click();
    await p
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await p.getByRole("button", { name: "Inspect table while paused" }).click();
    assert.equal((await state(p)).heroes[0].exhausted, true);
    await shot(p, `${reducedMotion}-exhaustion`);
    await p
      .getByRole("button", { name: "Review current event", exact: true })
      .click();
    for (
      let i = 0;
      i < 10 && (await state(p)).resolution.kind !== "shadow";
      i++
    ) {
      await p.locator(".resolution-continue").click();
    }
    assert.equal((await state(p)).resolution.kind, "shadow");
    const frozen = await state(p);
    const flip = await sample(p, ".reveal-card-face > img");
    evidence.push({ reducedMotion, flip });
    if (reducedMotion === "no-preference")
      assert.ok(flip.animations.some((a) => a.name === "reveal-front"));
    else
      assert.equal(flip.animations.length, 0, "reduced motion skips the flip");
    await shot(p, `${reducedMotion}-shadow-flip`);
    await p.waitForTimeout(1300);
    assert.deepEqual(
      await state(p),
      frozen,
      "finishing every animation cannot advance the event",
    );
    await shot(p, `${reducedMotion}-shadow-readable`);
    await p.locator(".resolution-continue").dblclick();
    assert.equal(
      (await state(p)).resolution.id,
      frozen.resolution.id + 1,
      "animation cannot bypass double-click guard",
    );
    await p.locator(".resolution-continue").click();
    assert.equal((await state(p)).heroes[0].damage, 1);
    await shot(p, `${reducedMotion}-combat`);

    // Animated progress preserves exact values, and pending events survive reload.
    await load(p, fixtures.quest);
    await p.locator(".turn-panel .turn-actions .primary").click();
    const pending = await state(p);
    assert.ok(pending.quest.progress > 0);
    await p.reload();
    await p.locator("#start-btn").click();
    assert.deepEqual(await state(p), pending);
    await p.getByRole("button", { name: "Inspect table while paused" }).click();
    assert.equal(
      Number(
        await p
          .getByRole("progressbar", { name: "Quest progress", exact: true })
          .getAttribute("aria-valuenow"),
      ),
      pending.quest.progress,
    );
    await shot(p, `${reducedMotion}-progress`);
    await p.close();
  }
  const small = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await legacyReviews(small);
  small.on("pageerror", (e) => errors.push(e.message));
  await load(small, ui);
  await shot(small, "laptop-table");
  for (const selector of [".hand-cards", ".fellowship-zone"]) {
    await small.locator(selector).evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
  }
  await small.getByRole("combobox", { name: "Sort hand" }).selectOption("cost");
  await small.waitForTimeout(800);
  await shot(small, "laptop-scrolled");
  await small.setViewportSize({ width: 390, height: 844 });
  await small.waitForTimeout(600);
  await shot(small, "mobile-table");
  const seats = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await legacyReviews(seats);
  seats.on("pageerror", (e) => errors.push(e.message));
  await load(seats, fixtures.setup);
  await drain(seats);
  for (const index of [1, 2, 0, 2, 1, 0]) {
    await seats.locator(".seat-tab").nth(index).click();
    assert.equal((await state(seats)).table.active, index);
    const visibleIds = await seats
      .locator(".hand-cards [data-motion-card]:not([inert])")
      .evaluateAll((cards) => cards.map((c) => c.dataset.motionCard));
    assert.deepEqual(
      visibleIds,
      (await state(seats)).hand.map((c) => c.id),
      "seat switch shows only the active hand",
    );
  }
  await seats.waitForTimeout(800);
  await shot(seats, "hotseat-switch");
  await seats.close();
  assert.deepEqual(errors, [], "no browser errors");
  await fs.writeFile(
    `${dir}/verification.json`,
    JSON.stringify(
      {
        errors,
        evidence,
        checks: [
          "sort preserves hand",
          "ally play/payment",
          "quest selection",
          "exhaustion",
          "shadow flip",
          "manual pause",
          "double-click guard",
          "combat damage",
          "progress",
          "save/reload",
          "reduced motion",
          "scrolled laptop",
          "mobile overflow",
          "rapid hot-seat switching",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Motion browser passed: real card play, sorting, exhaustion, shadow/combat, progress, pause/reload, reduced motion, responsive layouts and rapid hot-seat switching.",
  );
} finally {
  await browser.close();
}
