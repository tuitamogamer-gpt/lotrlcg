import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.GAME_URL ?? "http://localhost:5178",
  dir = "output/presentation";
const fixtures = JSON.parse(await fs.readFile(`${dir}/fixtures.json`, "utf8"));
const browser = await chromium.launch(),
  errors = [];
async function page(width = 1440, height = 900) {
  const p = await browser.newPage({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.goto(base);
  return p;
}
const state = async (p) =>
  JSON.parse(await p.evaluate(() => window.render_game_to_text()));
const confirm = async (p) => p.locator(".resolution-continue").click();
async function drain(p) {
  for (let i = 0; i < 100; i++) {
    if (!(await state(p)).resolution) return;
    await confirm(p);
  }
  throw Error("Reviews stuck");
}
async function until(p, kind) {
  for (let i = 0; i < 50; i++) {
    if ((await state(p)).resolution?.kind === kind) return;
    assert.ok((await state(p)).resolution);
    await confirm(p);
  }
  throw Error(`Missing ${kind}`);
}
async function load(p, s) {
  await p.evaluate((s) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(s));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
}
async function shot(p, name) {
  await p.screenshot({ path: `${dir}/${name}.png` });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
}
const p = await page();
await p.locator("#start-btn").click();
let frozen = await state(p);
assert.equal(frozen.resolution.kind, "setup");
await p.evaluate(() => window.advanceTime(60000));
await p.waitForTimeout(600);
await p.keyboard.press("Escape");
await p.keyboard.press("n");
assert.deepEqual(
  await state(p),
  frozen,
  "time, Escape and N cannot advance a review",
);
await p.getByRole("button", { name: "Inspect table while paused" }).click();
assert.equal(await p.locator(".resolution-dialog").count(), 0);
assert.equal((await state(p)).resolution.id, frozen.resolution.id);
await p
  .getByRole("button", { name: "Review current event", exact: true })
  .click();
await confirm(p);
for (let i = 0; i < 3; i++) {
  await p.locator(".turn-panel .turn-actions .primary").click();
  if (i < 2) await drain(p);
}
assert.equal((await state(p)).resolution.kind, "round");
assert.equal((await state(p)).table.seats.length, 3);
assert.match(await p.locator(".resolution-changes").textContent(), /Resources/);
await shot(p, "round-resources");
frozen = await state(p);
await p.reload();
await p.locator("#start-btn").click();
assert.deepEqual(
  await state(p),
  frozen,
  "reload preserves the exact pending event",
);
await drain(p);
await load(p, fixtures.encounter);
await p.locator(".turn-panel .turn-actions .primary").click();
await until(p, "reveal");
assert.equal((await state(p)).heroes[0].damage, 0);
assert.match(await p.locator(".resolution-rules").textContent(), /exhausted/);
await shot(p, "encounter-before-effect");
await p.locator(".resolution-card").click();
assert.ok(
  await p
    .getByRole("dialog", { name: "The Necromancer's Reach", exact: true })
    .isVisible(),
);
await p.keyboard.press("Escape");
assert.equal((await state(p)).heroes[0].damage, 0);
await confirm(p);
assert.equal((await state(p)).heroes[0].damage, 1);
assert.ok((await state(p)).resolution);
await shot(p, "visible-damage");
await drain(p);
await load(p, fixtures.combat);
await p.locator(".engaged-zone .card-action").click();
await p
  .getByRole("dialog")
  .getByRole("button", { name: /Aragorn/ })
  .click();
await p
  .getByRole("button", { name: "Resolve enemy attack", exact: true })
  .click();
assert.equal((await state(p)).resolution.title, "Defense declared");
await until(p, "shadow");
assert.equal((await state(p)).heroes[0].damage, 0);
await shot(p, "shadow-before-effect");
await p.getByRole("button", { name: "Inspect table while paused" }).click();
assert.ok(await p.locator(".engaged-zone .card-action").isDisabled());
assert.ok(
  await p
    .getByRole("button", { name: "Inspect Aragorn", exact: true })
    .isVisible(),
);
await p.getByRole("button", { name: "Inspect Aragorn", exact: true }).click();
await p.keyboard.press("Escape");
await p.keyboard.press("n");
assert.equal((await state(p)).heroes[0].damage, 0);
await confirm(p);
assert.equal((await state(p)).heroes[0].damage, 0);
assert.match(
  await p.locator(".resolution-changes").textContent(),
  /Shadow bonus/,
);
await confirm(p);
assert.equal((await state(p)).heroes[0].damage, 1);
await shot(p, "combat-result");
await drain(p);
await p.getByRole("button", { name: "Chronicle", exact: true }).click();
await p
  .locator(".resolution-chronicle summary")
  .filter({ hasText: "Shadow ·" })
  .click();
assert.match(
  await p.locator(".resolution-chronicle details[open]").textContent(),
  /attacking enemy/i,
);
await shot(p, "event-chronicle");
await p.keyboard.press("Escape");
await load(p, fixtures.quest);
await p.locator(".turn-panel .turn-actions .primary").click();
assert.equal((await state(p)).phase, "staging");
assert.equal((await state(p)).resolution.kind, "quest");
await drain(p);
assert.equal((await state(p)).phase, "travel");
await load(p, fixtures.victory);
await p.locator(".turn-panel .turn-actions .primary").click();
assert.equal((await state(p)).mode, "won");
assert.ok((await state(p)).resolution);
assert.equal(
  await p.getByRole("dialog", { name: "Beyond the shadow" }).count(),
  0,
);
await drain(p);
assert.ok(
  await p.getByRole("dialog", { name: "Beyond the shadow" }).isVisible(),
);
await p.close();
for (const [width, height] of [
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
]) {
  const q = await page(width, height);
  await load(q, fixtures.combat);
  await q.locator(".engaged-zone .card-action").click();
  await q
    .getByRole("dialog")
    .getByRole("button", { name: /Aragorn/ })
    .click();
  await q
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
    .click();
  await until(q, "shadow");
  const r = await q.locator(".resolution-continue").boundingBox();
  assert.ok(
    r && r.y >= 0 && r.y + r.height <= height,
    "continue control always visible",
  );
  const before = await state(q);
  await q.locator(".resolution-continue").dispatchEvent("click", { detail: 2 });
  assert.deepEqual(
    await state(q),
    before,
    "double click cannot skip the next event",
  );
  await shot(q, `shadow-${width}`);
  if (width === 1280) {
    await q.locator(".resolution-continue").dblclick();
    assert.equal((await state(q)).resolution.id, before.resolution.id + 1);
    assert.equal((await state(q)).heroes[0].damage, 0);
    const modifier = await state(q);
    await q
      .locator(".resolution-continue")
      .dispatchEvent("keydown", { key: "Enter", repeat: true });
    assert.deepEqual(
      await state(q),
      modifier,
      "held Enter cannot consume the next review",
    );
  }
  await q.close();
}
await browser.close();
assert.deepEqual(errors, []);
console.log(
  "Guided browser passed: real pauses, reveal-before-effect, shadow modifier/damage steps, table inspection, full card inspection, resource summary, exact pending reload, event history, quest/result gates, guarded double click and four desktop viewports.",
);
