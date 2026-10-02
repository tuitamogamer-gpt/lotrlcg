import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make, stats } from "../src/game/core.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/druadan";
await fs.mkdir(dir, { recursive: true });
function fixture(sphere) {
  const d = STARTERS.find((d) => d.id === sphere),
    s = applyAction(createGame(743, d.cards, d.heroes, d.id), { type: "KEEP" });
  Object.assign(s, {
    queue: [],
    choice: null,
    staging: [],
    engaged: [],
    hand: [],
    activeLocation: null,
    lastReveal: null,
    encounterDeck: [],
    encounterDiscard: [],
    allies: [],
    used: [],
  });
  s.heroes.forEach((h) =>
    Object.assign(h, {
      resources: 10,
      damage: 0,
      exhausted: false,
      committed: false,
      attachments: [],
    }),
  );
  return s;
}
const trained = fixture("tactics");
trained.phase = "quest";
trained.hand = [make(trained, "06036")];
trained.encounterDeck = ["01087"];
const against = fixture("spirit");
against.phase = "defense";
against.hand = [make(against, "06038")];
against.engaged = [make(against, "01089")];
const watcher = fixture("leadership");
watcher.phase = "defense";
watcher.engaged = [make(watcher, "01082")];
watcher.allies = [make(watcher, "06041")];
watcher.allies[0].exhausted = true;
for (const s of [trained, against, watcher]) assert.ok(validateSave(s));
const browser = await chromium.launch({ headless: true }),
  errors = [];
async function saved(p) {
  return p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
}
async function load(p, s) {
  await p.evaluate((game) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(game));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function reload(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function choose(p, id) {
  const s = await reviewedState(p),
    o = s.choice.options.find((o) => o.id === id);
  assert.ok(o, `Missing ${id}: ${JSON.stringify(s.choice)}`);
  await p
    .getByRole("dialog")
    .getByRole("button", { name: o.label, exact: true })
    .click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  await p.waitForFunction(
    () =>
      [...document.images].every((img) => {
        const r = img.getBoundingClientRect();
        return (
          !r.width ||
          !r.height ||
          r.bottom < 0 ||
          r.top > innerHeight ||
          img.complete
        );
      }),
    null,
    { timeout: 25000 },
  );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name,
  );
  if (await p.getByRole("dialog").count()) {
    const r = await p.getByRole("dialog").boundingBox();
    assert.ok(r.y >= 0 && r.y + r.height <= height + 1, name);
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
      }),
      p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);
    await load(p, trained);
    assert.match(await p.locator(".forecast").innerText(), /Willpower/);
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    assert.match(await p.locator(".forecast").innerText(), /Attack/);
    for (const hero of ["Legolas", "Gimli", "Thalin"])
      await p
        .getByRole("button", { name: `Commit ${hero}`, exact: true })
        .click();
    assert.match(await p.locator(".forecast").innerText(), /7/);
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .click();
    await reviewedState(p);
    await reload(p);
    assert.match(await p.locator(".forecast").innerText(), /Attack/);
    await capture(p, `trained-for-war-attack-${width}`, height);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    assert.ok(
      !(await saved(p)).used.some((key) =>
        key.startsWith("phase:trained-war:"),
      ),
    );
    await load(p, against);
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    await reload(p);
    let s = await saved(p);
    assert.equal(stats(s, s.heroes[0]).defense, 4);
    await p.getByRole("button", { name: "Defend", exact: true }).click();
    const eowyn = p
      .getByRole("dialog")
      .getByRole("button", { name: "Éowyn", exact: true });
    assert.ok(await eowyn.count());
    await capture(p, `against-shadow-defense-${width}`, height);
    await eowyn.click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.equal(s.heroes[0].damage, 0);
    assert.equal(s.heroes[0].exhausted, true);
    await load(p, watcher);
    await p.getByRole("button", { name: "Defend", exact: true }).click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Leave undefended/ })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.ok(s.choice.options.some((o) => o.id === watcher.allies[0].id));
    await capture(p, `watchman-undefended-choice-${width}`, height);
    await reload(p);
    await choose(p, watcher.allies[0].id);
    s = await saved(p);
    assert.ok(s.heroes.every((h) => h.damage === 0));
    assert.equal(s.allies.length, 0);
    assert.ok(s.discard.includes("06041"));
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Druadan client passed: Trained for War Attack forecast and phase expiry, Against the Shadow defense substitution, exhausted White Tower Watchman explicit undefended assignment/save/reload at 1280/390/320.",
  );
} finally {
  await browser.close();
}
