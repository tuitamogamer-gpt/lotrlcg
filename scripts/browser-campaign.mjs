import { finishResourcePhase } from "./browser-review-helpers.mjs";
import {
  installReviewHandler,
  acknowledgeReviews,
  reviewedState,
} from "./browser-review-helpers.mjs";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.GAME_URL ?? "http://localhost:5178";
const directory = "output/core-campaign";
await fs.mkdir(directory, { recursive: true });
const fixtures = JSON.parse(
  await fs.readFile(`${directory}/fixtures.json`, "utf8"),
);
const normalKey = "there-and-back-again.save.v1";
const campaignKey = "there-and-back-again.campaign.v1";
const modeKey = "there-and-back-again.mode.v1";
const browser = await chromium.launch({ headless: true });
const errors = [];
const state = reviewedState;
async function settle(p) {
  for (let n = 0; n < 50; n++) {
    const s = await state(p);
    if (!s.choice || s.mode !== "playing") return;
    let i = s.choice.options.findIndex((o) => o.id === "skip");
    if (i < 0) i = s.choice.options.findIndex((o) => o.id === "resolve");
    if (i < 0) i = 0;
    await p
      .locator("dialog[open] .choice-list .decision-select")
      .nth(i)
      .click();
  }
  throw Error("Choice did not settle");
}
async function page(width = 1512, height = 982) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const p = await context.newPage();
  await installReviewHandler(p);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.goto(base);
  await p.getByRole("button", { name: /Classic solo/ }).click();
  return p;
}
async function screenshot(p, name) {
  await acknowledgeReviews(p);
  await p.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: no horizontal overflow`,
  );
}
async function load(p, save) {
  await p.evaluate(
    ({ save, campaignKey, modeKey }) => {
      localStorage.removeItem("there-and-back-again.choices.v1");
      localStorage.setItem(campaignKey, JSON.stringify(save));
      localStorage.setItem(modeKey, "campaign");
    },
    { save, campaignKey, modeKey },
  );
  await p.reload();
  await p.locator("#start-btn").click();
}
for (const id of ["mirkwood", "anduin", "dol-guldur"]) {
  const p = await page();
  await p.locator(`.mission-${id}`).click();
  assert.equal((await state(p)).scenario, id);
  if (id === "anduin") await screenshot(p, "normal-missions");
  await p.locator("#start-btn").click();
  await settle(p);
  let s = await state(p);
  assert.equal(s.scenario, id);
  assert.equal(s.playMode, "normal");
  assert.equal(s.campaign, null);
  if (id === "anduin")
    assert.ok(s.staging.some((u) => u.name === "Hill Troll"));
  if (id === "dol-guldur") {
    assert.equal(s.heroes.length, 2);
    assert.ok(s.prisoner);
  }
  await p.getByRole("button", { name: "Keep hand", exact: true }).click();
  await finishResourcePhase(p);
  await p.getByRole("button", { name: "Begin quest", exact: true }).click();
  await p.locator(".character-art").first().click();
  await p.getByRole("button", { name: "Commit & reveal", exact: true }).click();
  await settle(p);
  await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
  await settle(p);
  await screenshot(p, `${id}-quest`);
  console.log(`${id}: normal setup and quest resolution passed`);
  await p.context().close();
}
const p = await page();
await p.locator("#start-btn").click();
await p.getByRole("button", { name: "Keep hand", exact: true }).click();
await finishResourcePhase(p);
await acknowledgeReviews(p);
const normal = await p.evaluate((key) => localStorage.getItem(key), normalKey);
await p
  .getByRole("navigation")
  .getByRole("button", { name: "Adventures", exact: true })
  .click();
await p.getByRole("button", { name: /Campaign mode/ }).click();
assert.ok(await p.locator(".mission-anduin").isDisabled());
assert.ok(await p.locator(".mission-dol-guldur").isDisabled());
await screenshot(p, "campaign-lobby");
await p.getByRole("button", { name: "Begin campaign", exact: true }).click();
assert.equal((await state(p)).allies[0].code, "rc135");
await p.reload();
assert.equal((await state(p)).playMode, "campaign");
await p.getByRole("button", { name: /Normal game/ }).click();
await p.locator("#start-btn").click();
assert.equal((await state(p)).playMode, "normal");
assert.equal(
  await p.evaluate((key) => localStorage.getItem(key), normalKey),
  normal,
);
// A controlled checkpoint gives us real victory, chapter preparation, and carry-over UI.
await load(p, fixtures.mirkwood);
await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
let s = await state(p);
assert.equal(s.mode, "won");
assert.equal(s.campaign.completed.length, 1);
await screenshot(p, "chapter-one-rewards");
await p.getByRole("button", { name: "Mendor’s Support", exact: true }).click();
assert.ok(
  await p
    .getByRole("dialog", { name: "Mendor’s Support", exact: true })
    .isVisible(),
);
await p.getByRole("button", { name: "Close dialog", exact: true }).click();
await p.getByRole("button", { name: "Continue campaign", exact: true }).click();
await p
  .getByRole("group", { name: "Campaign hero 3", exact: true })
  .getByRole("button", { name: "Change hero", exact: true })
  .click();
await p
  .getByRole("group", { name: "Campaign hero 3", exact: true })
  .getByRole("button", { name: "Choose Gimli", exact: true })
  .click();
await screenshot(p, "chapter-preparation");
await p
  .getByRole("button", { name: "Begin next chapter", exact: true })
  .click();
await settle(p);
s = await state(p);
assert.equal(s.scenario, "anduin");
assert.equal(s.campaign.threatPenalty, 1);
assert.ok(s.heroes.some((h) => h.code === "01004"));
assert.ok(s.campaign.burdens.includes("rc136"));
const anduin = JSON.parse(
  await p.evaluate((key) => localStorage.getItem(key), campaignKey),
);
assert.ok(
  [...anduin.deck, ...anduin.hand.map((h) => h.code)].includes("rc132"),
);
await p.getByRole("button", { name: "Keep hand", exact: true }).click();
await finishResourcePhase(p);
await acknowledgeReviews(p);
// Controlled final fight; victory and prisoner selection still go through the rules engine.
const finalFight = JSON.parse(
  await p.evaluate((key) => localStorage.getItem(key), campaignKey),
);
finalFight.stage = 3;
finalFight.phase = "attack";
finalFight.queue = [];
finalFight.choice = null;
finalFight.staging = [];
finalFight.activeLocation = null;
finalFight.engaged = [
  {
    id: "test-final-enemy",
    code: "01083",
    damage: 1,
    progress: 0,
    resources: 0,
    exhausted: false,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  },
];
finalFight.heroes[1].damage = 2;
await load(p, finalFight);
await p.locator(".engaged-zone .card-action").click();
await p.locator("dialog[open] .choice-list .decision-select").first().click();
await p.locator("dialog[open] .primary").click();
s = await state(p);
assert.equal(s.mode, "won");
assert.equal(s.campaign.prisoner, "01002");
await p.getByRole("button", { name: "Continue campaign", exact: true }).click();
await p
  .getByRole("button", { name: "Begin next chapter", exact: true })
  .click();
assert.equal((await state(p)).choice.title, "Appointed by Fate");
await p.locator("dialog[open] .choice-list .decision-select").first().click();
await settle(p);
s = await state(p);
assert.equal(s.scenario, "dol-guldur");
assert.equal(s.prisoner, "Théodred");
assert.equal(s.captiveMendor, true);
await p.getByRole("button", { name: "Keep hand", exact: true }).click();
await finishResourcePhase(p);
await screenshot(p, "campaign-dungeon");
const dungeon = JSON.parse(
  await p.evaluate((key) => localStorage.getItem(key), campaignKey),
);
// Resolve the guards to expose the objective controls and rescue Mendor.
dungeon.staging = dungeon.staging.filter((u) =>
  ["01108", "01109", "01110"].includes(u.code),
);
dungeon.engaged = [];
dungeon.activeLocation = null;
await load(p, dungeon);
await p
  .locator(".board-card")
  .filter({
    has: p.getByRole("button", { name: "Inspect Gandalf's Map", exact: true }),
  })
  .getByRole("button", { name: "Claim · +2 threat" })
  .click();
await p.locator("dialog[open] .choice-list .decision-select").first().click();
s = await state(p);
assert.equal(s.captiveMendor, false);
assert.equal(s.allies.find((u) => u.code === "rc135").damage, 1);
assert.ok(s.heroes[0].attachments.some((a) => a.code === "01108"));
await screenshot(p, "objective-rescue");
// A legal final progress checkpoint verifies campaign completion and the saved Mendor reward.
const escape = JSON.parse(
  await p.evaluate((key) => localStorage.getItem(key), campaignKey),
);
escape.heroes.push({ ...escape.prisoner, damage: 1 });
escape.prisoner = null;
escape.staging = [];
escape.stage = 3;
escape.progress = 6;
escape.phase = "staging";
escape.nazgulDefeated = true;
escape.heroes[0].committed = true;
escape.heroes[0].exhausted = true;
escape.heroes[1].attachments.push(
  { id: "test-torch", code: "01109", exhausted: false },
  { id: "test-key", code: "01110", exhausted: false },
);
await load(p, escape);
await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
s = await state(p);
assert.equal(s.mode, "won");
assert.equal(s.campaign.completed.length, 3);
assert.equal(s.campaign.mendorSaved, true);
await screenshot(p, "campaign-complete");
assert.ok(await p.getByText("Your tale is complete.").isVisible());
assert.equal(
  await p.evaluate((key) => localStorage.getItem(key), normalKey),
  normal,
);
console.log(
  "Campaign: rewards, hero change, permanent threat, all chapters, prisoner, objective claim, Mendor rescue, completion, mode persistence and save isolation passed",
);
await p.context().close();
for (const width of process.env.DESKTOP_ONLY ? [] : [390, 320]) {
  const p = await page(width, 844);
  await p.getByRole("button", { name: /Campaign mode/ }).click();
  await screenshot(p, `mobile-${width}-campaign`);
  await load(p, dungeon);
  await screenshot(p, `mobile-${width}-dungeon`);
  await p.context().close();
}
await browser.close();
assert.deepEqual(errors, []);
