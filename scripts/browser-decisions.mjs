import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.GAME_URL ?? "http://localhost:5178";
const fixtures = JSON.parse(
  await fs.readFile("output/presentation/fixtures.json", "utf8"),
);
const play = JSON.parse(
  await fs.readFile("output/ui-review/fixture.json", "utf8"),
);
const dir = "output/decisions";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const state = async (p) =>
  JSON.parse(await p.evaluate(() => window.render_game_to_text()));
async function load(p, save) {
  await p.goto(base);
  await p.evaluate((save) => {
    localStorage.removeItem("there-and-back-again.choices.v1");
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(save));
  }, save);
  await p.reload();
  await p.locator("#start-btn").click();
}
async function result(p) {
  for (let n = 0; n < 30; n++) {
    if (await p.locator(".combat-scene").count()) return;
    assert.ok((await state(p)).resolution, "combat stays in guided flow");
    await p.locator(".resolution-continue").click();
  }
  throw Error("Combat result never appeared");
}
async function fits(p, height) {
  const box = await p.locator(".decision-footer").boundingBox();
  assert.ok(
    box && box.y >= 0 && box.y + box.height <= height,
    "confirmation stays in viewport",
  );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "no page overflow",
  );
}
try {
  for (const [width, height, reducedMotion] of [
    [1440, 900, "no-preference"],
    [1280, 720, "reduce"],
    [390, 844, "reduce"],
  ]) {
    const p = await browser.newPage({
      viewport: { width, height },
      reducedMotion,
    });
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await load(p, fixtures.combat);
    await p.locator(".engaged-zone .card-action").click();
    const confirm = p.getByRole("button", {
      name: "Resolve enemy attack",
      exact: true,
    });
    assert.ok(
      await confirm.isDisabled(),
      "defense is never implicitly undefended",
    );
    assert.equal(
      await p.locator(".combat-company .decision-face img").count(),
      3,
    );
    await p
      .locator(".combat-company")
      .getByRole("button", { name: "Aragorn", exact: true })
      .click();
    assert.equal(await p.locator(".combat-company .is-selected").count(), 1);
    const frozen = await state(p);
    await p.locator(".combat-company .is-selected .decision-inspect").click();
    assert.ok(
      await p.getByRole("dialog", { name: "Aragorn", exact: true }).isVisible(),
    );
    await p.keyboard.press("Escape");
    assert.equal(
      await p.locator(".combat-company .is-selected").count(),
      1,
      "inspection preserves selection",
    );
    assert.deepEqual(await state(p), frozen, "inspection never advances rules");
    await fits(p, height);
    await p.screenshot({ path: `${dir}/defender-${width}.png` });
    await confirm.click();
    await result(p);
    assert.equal(await p.locator(".combat-strikers img").count(), 1);
    assert.equal(await p.locator(".combat-receivers img").count(), 1);
    assert.equal((await state(p)).heroes[0].damage, 1);
    const animation = await p
      .locator(".combat-strikers img")
      .evaluate((el) => getComputedStyle(el).animationName);
    assert.equal(
      animation,
      reducedMotion === "reduce" ? "none" : "combat-strike",
    );
    const paused = await state(p);
    await p.waitForTimeout(800);
    assert.deepEqual(
      await state(p),
      paused,
      "animation does not advance the game",
    );
    await p.screenshot({ path: `${dir}/attack-result-${width}.png` });

    await load(p, fixtures.combat);
    await p.locator(".engaged-zone .card-action").click();
    await p.getByRole("button", { name: /Leave undefended/ }).click();
    assert.ok(await confirm.isEnabled());
    await confirm.click();
    for (let n = 0; n < 30 && (await state(p)).resolution; n++)
      await p.locator(".resolution-continue").click();
    assert.match((await state(p)).choice.title, /Assign/);
    assert.equal(
      await p.locator(".decision-grid .decision-face img").count(),
      3,
      "damage assignment shows full heroes",
    );
    await fits(p, height);
    await p.screenshot({ path: `${dir}/damage-choice-${width}.png` });
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Aragorn", exact: true })
      .click();
    await result(p);

    const attack = structuredClone(fixtures.combat);
    attack.phase = "attack";
    attack.engaged[0].shadows = [];
    await load(p, attack);
    await p.locator(".engaged-zone .card-action").click();
    assert.ok(await p.locator(".decision-actions .primary").isDisabled());
    await p.locator(".combat-company .decision-select").nth(0).click();
    await p.locator(".combat-company .decision-select").nth(1).click();
    assert.equal(await p.locator(".combat-company .is-selected").count(), 2);
    await p.locator(".decision-actions .primary").click();
    await result(p);
    assert.equal(await p.locator(".combat-strikers img").count(), 2);
    assert.equal(
      await p.locator(".combat-receivers img").count(),
      1,
      "defeated enemy remains visible in result",
    );

    await load(p, play);
    await p
      .locator(".hand-card")
      .filter({ hasText: "Steward of Gondor" })
      .locator(".hand-play")
      .click();
    assert.ok(
      await p
        .locator(".decision-dialog")
        .getByRole("button", { name: "Play card", exact: true })
        .isDisabled(),
    );
    assert.equal(
      await p.locator(".target-selection .decision-face img").count(),
      3,
    );
    await p
      .locator(
        `.target-selection [data-unit-id="${play.heroes[0].id}"] .decision-select`,
      )
      .click();
    assert.ok(
      await p
        .locator(".decision-dialog")
        .getByRole("button", { name: "Play card", exact: true })
        .isEnabled(),
    );
    await fits(p, height);
    await p.screenshot({ path: `${dir}/target-${width}.png` });
    await p
      .locator(".decision-dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    assert.ok(
      (await state(p)).heroes[0].attachments.some((a) => a.code === "01026"),
    );
    await p.close();
    console.log(
      `${width}×${height}: visual defense/attack/targets/damage choice, inspection, explicit undefended, animation pause, reduced motion passed`,
    );
  }
} finally {
  await browser.close();
}
assert.deepEqual(errors, []);
