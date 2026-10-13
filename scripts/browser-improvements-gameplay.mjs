import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { make } from "../src/game/core.ts";
import { startGuided } from "../src/game/presentation.ts";
import { applyPlanningFixtureAction } from "./fixture-phase-helper.ts";
import {
  collectBrowserArtifactEvidence,
  observeBrowserArtifact,
} from "./browser-artifact-evidence.mjs";

const url = process.env.GAME_URL ?? "http://127.0.0.1:5182";
const dir = "output/improvement-round-20261013/ux-gameplay/verification";
await fs.mkdir(dir, { recursive: true });
const starter = STARTERS[0];
function defense() {
  const s = applyPlanningFixtureAction(
    createGame(77, starter.cards, starter.heroes, starter.id),
    { type: "KEEP" },
  );
  s.hand = [];
  s.phase = "defense";
  s.staging = [];
  s.engaged = [make(s, "01089")];
  s.engaged[0].shadows = ["01085"];
  return startGuided(s);
}
function company() {
  let s = createGame(99, starter.cards, starter.heroes, starter.id, {
    seats: [
      { heroes: ["01001"], deckId: "leadership" },
      { heroes: ["01007"], deckId: "spirit" },
      { heroes: ["01005"], deckId: "tactics" },
    ],
  });
  while (s.phase === "setup")
    s = applyPlanningFixtureAction(s, { type: "KEEP" });
  return s;
}
for (const s of [defense(), company()])
  assert.ok(validateSave(s), "actual gameplay fixture is restorable");
const browser = await chromium.launch({ headless: true });
const errors = [],
  checks = [],
  screenshots = [],
  entries = new Set();
let page;
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
async function load(p, s) {
  await p.goto(url);
  await p.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(s));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.setItem("there-and-back-again.tutorial", "seen");
    localStorage.setItem("there-and-back-again.review-mode", "decisions");
    localStorage.setItem("there-and-back-again.hover-cards", "off");
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
  for (const src of await p
    .locator('script[type="module"][src]')
    .evaluateAll((els) => els.map((e) => e.src)))
    entries.add(src);
}
async function shot(p, name, width) {
  const path = `${dir}/${name}-${width}.png`;
  await p.screenshot({ path });
  screenshots.push(path);
}
function pass(name, width) {
  checks.push(`${name} @ ${width}`);
  console.log(`PASS ${name} @ ${width}`);
}
try {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 700],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
      hasTouch: width < 500,
    });
    page = await context.newPage();
    observeBrowserArtifact(page);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await load(page, defense());
    await page.locator(".engaged-zone .card-action").click();
    const dialog = page.getByRole("dialog", {
      name: "Choose your defender",
      exact: true,
    });
    const firstDefender = dialog
      .locator(".combat-company .decision-select")
      .first();
    const visible = await firstDefender.evaluate((button) => {
      const card = button.getBoundingClientRect();
      const body = button.closest(".decision-body").getBoundingClientRect();
      return {
        x: card.x + card.width / 2,
        top: Math.max(card.top, body.top),
        bottom: Math.min(card.bottom, body.bottom),
        width: card.width,
      };
    });
    assert.ok(
      visible.bottom - visible.top >= 44,
      "a legal defender has a touch-sized visible area before any scrolling",
    );
    assert.ok(visible.width >= 44);
    if (width < 500)
      await page.touchscreen.tap(
        visible.x,
        visible.top + Math.min(visible.bottom - visible.top, 72) / 2,
      );
    else
      await page.mouse.click(
        visible.x,
        visible.top + Math.min(visible.bottom - visible.top, 72) / 2,
      );
    assert.equal(
      await dialog.locator(".combat-company .is-selected").count(),
      1,
      "the visible defender can actually be selected",
    );
    pass("legal defender visible and selectable without scrolling", width);
    const beforeInspection = await saved(page);
    const inspect = dialog.locator(".combat-company .decision-inspect").first();
    await inspect.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "Aragorn", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await inspect.waitFor();
    assert.ok(
      await inspect.evaluate((el) => document.activeElement === el),
      "Escape restores the nested inspector's opener",
    );
    assert.deepEqual(
      await saved(page),
      beforeInspection,
      "keyboard inspection never changes the rules state",
    );
    assert.equal(
      await dialog.locator(".combat-company .is-selected").count(),
      1,
    );
    pass("nested card Escape restores focus and selection", width);
    await inspect.click();
    await page
      .getByRole("dialog", { name: "Aragorn", exact: true })
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    assert.ok(
      await inspect.evaluate((el) => document.activeElement === el),
      "close control also restores the parent opener",
    );
    assert.deepEqual(await saved(page), beforeInspection);
    pass("nested card close control restores focus", width);
    const footer = await dialog.locator(".decision-footer").boundingBox();
    assert.ok(
      footer.y >= 0 && footer.y + footer.height <= height,
      "combat confirmation stays in the viewport",
    );
    if (width < 500) {
      for (const control of await dialog
        .locator(".decision-inspect,.decision-footer button")
        .evaluateAll((els) =>
          els.map((el) => ({
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
          })),
        ))
        assert.ok(
          control.width >= 44 && control.height >= 44,
          "combat controls retain 44px touch targets",
        );
    }
    await shot(page, "defender-selected", width);
    await dialog
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await page.waitForFunction(
      () => JSON.parse(window.render_game_to_text()).heroes[0].damage === 1,
    );
    const defended = await saved(page);
    assert.equal(defended.heroes[0].damage, 1);
    assert.equal(defended.heroes[0].exhausted, true);
    assert.ok(validateSave(defended));
    pass("actual enemy attack resolves with the selected defender", width);
    await load(page, company());
    await page
      .getByRole("button", { name: "Control Legolas", exact: true })
      .click();
    const beforeReturn = await saved(page);
    const primary = page.locator(
      width < 500
        ? ".mobile-action-bar .primary"
        : ".turn-panel .turn-actions .primary",
    );
    const bounds = await primary.boundingBox();
    assert.ok(
      bounds &&
        bounds.x >= 0 &&
        bounds.x + bounds.width <= width &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= height,
      "off-turn continuation fits fully inside the viewport",
    );
    assert.ok(bounds.width >= 44 && bounds.height >= 44);
    if (width < 500) {
      const overflow = await page
        .locator(".mobile-action-bar")
        .evaluate((el) => el.scrollWidth > el.clientWidth);
      assert.equal(
        overflow,
        false,
        "hotseat action bar has no clipped content",
      );
    }
    await shot(page, "off-turn-fit", width);
    pass("off-turn continuation fits and remains touch sized", width);
    await primary.click();
    const returned = await saved(page);
    assert.equal(returned.table.active, returned.table.turn);
    assert.equal(returned.phase, beforeReturn.phase);
    assert.equal(returned.round, beforeReturn.round);
    assert.ok(validateSave(returned));
    pass("actual hotseat continuation returns to the current player", width);
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(entries.size, 1, "all checks use the same browser artifact");
  if (process.env.EXPECTED_ENTRY)
    assert.ok(
      [...entries].every((src) =>
        src.endsWith(`/assets/${process.env.EXPECTED_ENTRY}`),
      ),
    );
  const artifactEvidence = await collectBrowserArtifactEvidence(entries);
  await fs.rm(`${dir}/failure.json`, { force: true });
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      {
        checks,
        errors,
        screenshots,
        entries: [...entries],
        url,
        checkedAt: new Date().toISOString(),
        releaseSha: process.env.RELEASE_SHA ?? null,
        artifactEvidence,
      },
      null,
      2,
    ),
  );
  console.log(`Gameplay improvements: ${checks.length} checks passed.`);
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      { error: String(error), stack: error.stack, checks, errors },
      null,
      2,
    ),
  );
  if (page && !page.isClosed())
    await page.screenshot({ path: `${dir}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
