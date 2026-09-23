import {
  installReviewHandler,
  acknowledgeReviews,
  reviewedState,
} from "./browser-review-helpers.mjs";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.GAME_URL ?? "http://localhost:5178",
  dir = "output/hotseat";
await fs.mkdir(dir, { recursive: true });
const fixtures = JSON.parse(await fs.readFile(`${dir}/fixtures.json`, "utf8"));
const browser = await chromium.launch({ headless: true }),
  errors = [];
const state = reviewedState;
async function page(width = 1440, height = 1000) {
  const c = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const p = await c.newPage();
  await installReviewHandler(p);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.goto(base);
  return p;
}
async function load(p, s) {
  await p.evaluate((s) => {
    localStorage.setItem(
      s.playMode === "campaign"
        ? "there-and-back-again.campaign.v1"
        : "there-and-back-again.save.v1",
      JSON.stringify(s),
    );
    localStorage.setItem("there-and-back-again.mode.v1", s.playMode);
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
}
async function settle(p) {
  for (let i = 0; i < 40; i++) {
    const s = await state(p);
    if (!s.choice || s.mode !== "playing") return;
    const n = s.choice.options.findIndex((o) => o.id === "skip"),
      r = s.choice.options.findIndex((o) => o.id === "resolve");
    await p
      .locator("dialog[open] .choice-list button")
      .nth(n >= 0 ? n : r >= 0 ? r : 0)
      .click();
  }
  throw Error("Choice stuck");
}
const turn = async (p) =>
  p.locator(".turn-panel .turn-actions .primary").click();
async function shot(p, name) {
  await acknowledgeReviews(p);
  await p.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name} horizontal overflow`,
  );
}
for (const n of [1, 2, 3]) {
  const p = await page();
  await p
    .getByRole("button", {
      name: `${n} ${n === 1 ? "hero" : "heroes"}`,
      exact: true,
    })
    .click();
  assert.equal(await p.locator(".hero-selection").count(), n);
  if (n === 2)
    await p
      .getByRole("combobox", { name: "Hero 2", exact: true })
      .selectOption("01012");
  await p.locator("#start-btn").click();
  let s = await state(p);
  assert.equal(s.table.seats.length, n);
  assert.equal(s.heroes.length, 1);
  for (let i = 0; i < n; i++) {
    assert.equal((await state(p)).table.active, i);
    await turn(p);
  }
  s = await state(p);
  assert.equal(s.phase, "planning");
  assert.ok(
    s.table.seats.every(
      (p) =>
        p.hand.length === 7 &&
        p.heroes.length === 1 &&
        p.heroes[0].resources === 1,
    ),
  );
  if (n === 2) assert.equal(s.table.seats[1].hero, "01012");
  await p.context().close();
}
const p = await page();
await shot(p, "lobby-desktop");
await load(p, fixtures.round);
const original = (await state(p)).table.seats.map((x) => x.hand);
await p.getByRole("button", { name: "Control Legolas", exact: true }).click();
assert.equal((await state(p)).deck, "tactics");
assert.deepEqual(
  (await state(p)).hand.map((u) => u.code),
  original[2].map((u) => u.code),
);
await shot(p, "view-another-hero");
await turn(p);
assert.equal((await state(p)).table.active, 0);
for (let i = 0; i < 3; i++) {
  await turn(p);
  assert.equal((await state(p)).phase, i === 2 ? "quest" : "planning");
}
for (let i = 0; i < 3; i++) {
  await p.locator(".character-art").first().click();
  await turn(p);
  await settle(p);
}
assert.equal((await state(p)).willpower, 7);
assert.equal((await state(p)).encounterCount, 37);
await shot(p, "shared-quest");
await turn(p);
await settle(p);
await p
  .locator(".board-card")
  .filter({ hasText: "Old Forest Road" })
  .first()
  .getByRole("button", { name: "Travel here" })
  .click();
await settle(p);
for (let i = 0; i < 3; i++) await turn(p);
await settle(p);
assert.equal((await state(p)).phase, "attack");
for (let i = 0; i < 3; i++) await turn(p);
await turn(p);
assert.equal((await state(p)).round, 2);
assert.equal((await state(p)).table.first, 1);
const before = await state(p);
await p.reload();
await p.locator("#start-btn").click();
assert.deepEqual(await state(p), before);
await shot(p, "round-two");
await load(p, fixtures.defense);
await p.locator(".engaged-zone .card-action").click();
await p
  .getByRole("dialog")
  .getByRole("button", { name: /Aragorn/ })
  .click();
await p
  .getByRole("button", { name: "Resolve enemy attack", exact: true })
  .click();
await settle(p);
assert.equal((await state(p)).table.seats[0].heroes[0].exhausted, true);
assert.equal((await state(p)).phase, "attack");
await load(p, fixtures.ranged);
await p.locator(".engaged-zone .card-action").click();
await p
  .getByRole("dialog")
  .getByRole("button", { name: /Aragorn/ })
  .click();
await p
  .getByRole("dialog")
  .getByRole("button", { name: /Legolas/ })
  .click();
await shot(p, "ranged-combat");
await p.getByRole("button", { name: /Attack · 6 power/ }).click();
assert.equal((await state(p)).engaged[0].damage, 3);
await load(p, fixtures.support);
await p.locator(".hand-card .hand-play").click();
await p
  .getByRole("dialog")
  .locator("select")
  .selectOption(fixtures.support.table.seats[2].heroes[0].id);
await p
  .getByRole("dialog")
  .getByRole("button", { name: "Play card", exact: true })
  .click();
assert.equal((await state(p)).heroes[0].resources, 3);
await p
  .getByRole("button", { name: "Steward of Gondor · Legolas", exact: true })
  .click();
assert.equal((await state(p)).table.seats[2].heroes[0].resources, 3);
await load(p, fixtures.campaign);
await turn(p);
assert.equal((await state(p)).mode, "won");
await p.getByRole("button", { name: "Continue campaign", exact: true }).click();
assert.equal(await p.getByRole("dialog").locator("select").count(), 3);
await p
  .getByRole("combobox", { name: "Campaign hero 1" })
  .selectOption("01002");
await p
  .getByRole("button", { name: "Begin next chapter", exact: true })
  .click();
await settle(p);
let s = await state(p);
assert.equal(s.scenario, "anduin");
assert.equal(s.table.seats.length, 3);
assert.equal(s.table.seats[0].hero, "01002");
assert.deepEqual(s.campaign.seatPenalties, [1, 0, 0]);
await shot(p, "campaign-three-seats");
await load(p, fixtures.fallenCampaign);
await turn(p);
await settle(p);
await p.getByRole("button", { name: "Continue campaign", exact: true }).click();
assert.equal(
  await p
    .getByRole("combobox", { name: "Campaign hero 1", exact: true })
    .inputValue(),
  "01001",
);
assert.equal(
  await p
    .getByRole("combobox", { name: "Campaign hero 3", exact: true })
    .inputValue(),
  "01005",
  "surviving heroes keep their original seats",
);
await p
  .getByRole("combobox", { name: "Campaign hero 2", exact: true })
  .selectOption("01008");
await p
  .getByRole("button", { name: "Begin next chapter", exact: true })
  .click();
await settle(p);
s = await state(p);
assert.deepEqual(s.campaign.seatPenalties, [0, 1, 0]);
assert.equal(s.table.seats[1].hero, "01008");

for (const width of process.env.DESKTOP_ONLY
  ? [1280, 1440, 1920, 2560]
  : [320, 390, 768, 820, 1024, 1280, 1440, 1920, 2560]) {
  const height =
    width === 1280
      ? 720
      : width === 1440
        ? 900
        : width === 1920
          ? 1080
          : width === 2560
            ? 1440
            : 1000;
  const q = await page(width, height);
  await shot(q, `lobby-${width}`);
  const start = await q.locator("#start-btn").boundingBox();
  assert.ok(
    start && start.x >= 0 && start.x + start.width <= width,
    `start button is on-screen at ${width}px`,
  );
  await load(q, fixtures.round);
  await shot(q, `table-${width}`);
  if (width >= 1100) {
    for (const selector of [
      ".hand-play",
      ".turn-panel .turn-actions .primary",
    ]) {
      const rect = await q.locator(selector).first().boundingBox();
      assert.ok(
        rect && rect.y > 0 && rect.y + rect.height <= height,
        `${selector} stays in the ${width}×${height} viewport`,
      );
    }
    assert.equal(
      await q.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
      true,
      "desktop table fits without page scrolling",
    );
    await q.keyboard.press("3");
    assert.equal((await state(q)).table.active, 2);
    assert.match(
      await q.locator("#your-hand .zone-label").textContent(),
      /LEGOLAS/,
    );
    await q.keyboard.press("1");
    assert.equal((await state(q)).table.active, 0);
    await q.keyboard.press("h");
    assert.equal(
      await q.evaluate(() => document.activeElement?.id),
      "your-hand",
    );
    await q.locator(".hand-art").first().click();
    await q.keyboard.press("2");
    assert.equal(
      (await state(q)).table.active,
      0,
      "hero shortcuts pause in a card dialog",
    );
    await q.keyboard.press("Escape");
    await load(q, fixtures.ranged);
    await shot(q, `combat-${width}`);
    const hand = await q.locator(".hand-zone").boundingBox();
    assert.ok(
      hand && hand.y + hand.height <= height,
      "combat keeps the hand anchored",
    );
  }
  if (width < 900) {
    await q
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await q
      .getByRole("button", { name: "How to play", exact: true })
      .first()
      .click();
    assert.ok(
      await q
        .getByRole("heading", { name: "One company. Separate fellowships." })
        .isVisible(),
    );
  }
  await q.context().close();
}
await p.context().close();
await browser.close();
assert.deepEqual(errors, []);
console.log(
  "Hot-seat browser passed: setup 1–3, separate hands, full round, reload, Sentinel, Ranged, borrowed attachments, campaign carry-over, desktop action reachability and hero shortcuts; no console errors.",
);
