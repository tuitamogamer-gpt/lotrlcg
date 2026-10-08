import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base } from "../tests/weather-hills-fixtures.ts";
import { validateSave } from "../src/game/engine.ts";
import { make } from "../src/game/core.ts";
import { syncSeat } from "../src/game/table.ts";
import { WEATHER as W } from "../src/game/weather-hills-support.ts";
import { CHETWOOD as C } from "../src/game/chetwood-support.ts";
import { legacyReviews } from "./browser-review-helpers.mjs";

const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/significant-moments";
await fs.mkdir(dir, { recursive: true });
function second(s) {
  s.stage = 2;
  s.staging[0].flipped = true;
  s.staging[0].resources = 4;
  s.weatherHills.orcDeck = [];
  s.weatherHills.setAside = [];
  return s;
}
function committed(s, q) {
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  s.heroes[0].tempWill = 20;
  s.committedIds = [s.heroes[0].id];
  if (q) s.sideQuestSelections = { shared: { id: q.id, code: q.code } };
  return s;
}
const stage = base();
stage.staging[0].resources = 3;
const hunted = make(stage, W.cornered);
hunted.damage = 1;
stage.engaged.push(hunted);
stage.hand = [make(stage, "01073")];
const sideQuest = second(base());
const q = make(sideQuest, W.camp);
sideQuest.staging.push(q);
committed(sideQuest, q);
sideQuest.heroes[0].damage = 1; // Keeps an optional response open so the ribbon must wait.
const heroFall = second(base());
heroFall.phase = "defense";
heroFall.heroes[0].damage = 4;
heroFall.engaged.push(make(heroFall, C.captain));
const victory = committed(second(base()));
victory.progress = 19;
const defeat = second(base());
defeat.phase = "travel";
defeat.staging[0].resources = 1;
const valley = make(defeat, W.valley);
defeat.staging.push(valley);
const routine = base();
routine.hand = [make(routine, "01013")];
const seats = base(2);
for (const [name, s] of Object.entries({
  stage,
  sideQuest,
  heroFall,
  victory,
  defeat,
  routine,
  seats,
})) {
  syncSeat(s);
  assert.ok(validateSave(s), `valid ${name} motion fixture`);
}
const browser = await chromium.launch({ headless: true });
const errors = [],
  checkpoints = [],
  screenshots = [],
  media = [];
const buildEntries = new Set();
let pausedReviews = 0;
const raw = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
const banner = (p, kind) => p.locator(`[data-significant-moment="${kind}"]`);
async function reviewedState(p) {
  for (let i = 0; i < 160; i++) {
    const review = p.locator(".resolution-dialog[open]");
    if (!(await review.count()))
      return p.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal(
      await p.locator("[data-significant-moment]").count(),
      0,
      "a resolution review pauses significant-moment decoration",
    );
    pausedReviews++;
    // Explicitly acknowledge this review through its real Continue button.
    // Pointer availability is separately exercised through quest inspection.
    await review.locator(".resolution-continue").evaluate((b) => b.click());
    await p.waitForTimeout(25);
  }
  throw Error("significant-moment resolution review did not settle");
}
async function load(p, s) {
  await p.goto(url);
  await p.evaluate((save) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(save));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.setItem("there-and-back-again.hover-cards", "off");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  await p.reload();
  buildEntries.add(
    await p.locator('script[type="module"][src]').first().getAttribute("src"),
  );
  await p.locator("#start-btn").click();
  await reviewedState(p);
  assert.equal(
    await p.locator("[data-significant-moment]").count(),
    0,
    "initial resume cannot replay a milestone",
  );
}
async function choose(p, id) {
  const s = await reviewedState(p),
    o = s.choice?.options.find((o) => o.id === id);
  assert.ok(o, JSON.stringify(s.choice));
  const index = s.choice.options.findIndex((o) => o.id === id),
    occurrence = s.choice.options
      .slice(0, index)
      .filter((v) => v.label === o.label).length;
  await p
    .getByRole("dialog")
    .getByRole("button", { name: o.label, exact: true })
    .nth(occurrence)
    .click();
  await reviewedState(p);
}
async function choices(p) {
  for (let i = 0; i < 100; i++) {
    await reviewedState(p);
    const s = await raw(p);
    if (!s.choice) return;
    const o =
      s.choice.options.find((o) => o.id === "skip") ??
      s.choice.options.find((o) => o.id === "resolve") ??
      s.choice.options.find((o) =>
        o.effects.some(
          (e) =>
            e.kind === "used" && e.text === "phase:weather-additional-reveal",
        ),
      ) ??
      s.choice.options[0];
    await choose(p, o.id);
  }
  throw Error("significant-moment fixture choices stalled");
}
async function capture(p, label) {
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${label}: no horizontal overflow`,
  );
  const b = p.locator("[data-significant-moment]");
  if (await b.count()) {
    const r = await b.boundingBox();
    assert.ok(
      r.x >= 0 && r.x + r.width <= p.viewportSize().width + 1,
      `${label}: moment fits viewport`,
    );
    assert.equal(await b.getAttribute("role"), "status");
    assert.ok((await b.innerText()).trim());
    assert.equal(
      await b.getByRole("button").count(),
      0,
      "decorative media has no game controls",
    );
  }
  const path = `${dir}/${label}.png`;
  await p.screenshot({ path });
  screenshots.push(path);
}
async function inspectMoment(p, kind, label, reduced) {
  await banner(p, kind).waitFor({ state: "visible" });
  assert.equal(
    await banner(p, kind).getAttribute("data-reduced-motion"),
    String(reduced),
  );
  await p.waitForTimeout(160);
  if (reduced) {
    assert.equal(
      await banner(p, kind).locator("video").count(),
      0,
      "reduced motion never loads Tesseract video",
    );
    assert.equal(
      await banner(p, kind).locator("[data-significant-moment-visual]").count(),
      0,
      "reduced motion bypasses Remotion",
    );
    assert.ok(
      await banner(p, kind).locator("[data-moment-emblem] > svg").count(),
    );
  } else if (kind === "hero-fall") {
    const v = banner(p, kind).locator("video");
    await v.waitFor();
    await v.evaluate((v) =>
      v.readyState >= 2
        ? undefined
        : new Promise((resolve, reject) => {
            v.addEventListener("loadeddata", resolve, { once: true });
            v.addEventListener(
              "error",
              () => reject(new Error("hero-fall video failed")),
              { once: true },
            );
          }),
    );
    assert.equal(await v.getAttribute("controls"), null);
    assert.equal(await v.getAttribute("loop"), null);
    assert.ok(await v.evaluate((v) => v.muted));
    media.push({
      label,
      kind,
      source: await v.getAttribute("src"),
      ready: await v.evaluate((v) => v.readyState),
    });
  } else {
    await banner(p, kind)
      .locator("[data-significant-moment-visual]")
      .waitFor({ state: "attached" });
    assert.equal(
      await banner(p, kind).locator("video").count(),
      0,
      "Tesseract video appears only for hero fall",
    );
  }
  await capture(p, label);
  checkpoints.push(label);
  console.log(`Verified ${label}`);
}
async function noAdvance(p, label) {
  const stable = await raw(p);
  await p.waitForTimeout(2900);
  assert.deepEqual(
    await raw(p),
    stable,
    `${label}: animation completion cannot advance or change rules`,
  );
  assert.equal(
    await p.locator("[data-significant-moment]").count(),
    0,
    `${label}: one finite acknowledgement`,
  );
}
async function resumeAfterReload(p, ended = false) {
  await p.reload();
  if (ended) {
    const button = p.getByRole("button", {
      name: "Return to adventure",
      exact: true,
    });
    const navigation = p.locator(".mobile-menu");
    if (
      (await navigation.isVisible()) &&
      (await navigation.getAttribute("aria-expanded")) === "false"
    )
      await navigation.click();
    await button.click();
  } else await p.locator("#start-btn").click();
  await reviewedState(p);
  assert.equal(
    await p.locator("[data-significant-moment]").count(),
    0,
    "reload never replays an acknowledgement",
  );
}
async function killHero(p) {
  await p.locator(".engaged-zone .card-action").first().click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: /Aragorn/ })
    .click();
  await p
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
    .click();
  await reviewedState(p);
  await choices(p);
}
try {
  const widths = (process.env.MOMENT_WIDTHS ?? "1280,390")
    .split(",")
    .map(Number);
  const preferences = (
    process.env.MOMENT_PREFERENCES ?? "no-preference,reduce"
  ).split(",");
  for (const width of widths)
    for (const reducedMotion of preferences) {
      const reduced = reducedMotion === "reduce",
        label = `${width}-${reducedMotion}`;
      const context = await browser.newContext({
        viewport: { width, height: width === 1280 ? 900 : 844 },
        reducedMotion,
      });
      const p = await context.newPage();
      await legacyReviews(p);
      p.on("pageerror", (e) => errors.push(e.message));
      p.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      const requests = [];
      p.on("request", (r) => requests.push(r.url()));

      await load(p, stage);
      await p
        .locator(
          '.hand-card:has(img[data-card-code="01073"]) .hand-play:not(.hand-ability)',
        )
        .click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Play card", exact: true })
        .click();
      await reviewedState(p);
      const gandalf = (await raw(p)).choice.options.find(
        (o) => o.code === W.cornered,
      );
      assert.ok(gandalf);
      await choose(p, gandalf.id);
      assert.equal(
        await banner(p, "stage").count(),
        0,
        "stage ribbon waits for mandatory stage-2 choices",
      );
      await choices(p);
      assert.equal((await raw(p)).stage, 2);
      await inspectMoment(p, "stage", `${label}-stage`, reduced);
      // The ribbon has no pointer shield. Real card inspection remains available.
      await p.locator(".quest-card-stack").click();
      assert.equal(
        await banner(p, "stage").count(),
        0,
        "detail dialog pauses decoration",
      );
      await p
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
      await banner(p, "stage").waitFor({ state: "visible" });
      await noAdvance(p, `${label}-stage`);
      const persisted = await raw(p);
      await resumeAfterReload(p);
      assert.deepEqual(await raw(p), persisted);

      await load(p, sideQuest);
      await p.locator(".turn-actions .primary:visible").click();
      await reviewedState(p);
      assert.ok(
        (await reviewedState(p)).choice,
        "side quest has its optional heal response",
      );
      assert.equal(
        await banner(p, "side-quest").count(),
        0,
        "side quest ribbon waits for its response choice",
      );
      await choose(p, "skip");
      await inspectMoment(p, "side-quest", `${label}-side-quest`, reduced);
      await noAdvance(p, `${label}-side-quest`);

      await load(p, heroFall);
      await killHero(p);
      assert.equal((await raw(p)).heroes.length, 2);
      await inspectMoment(p, "hero-fall", `${label}-hero-fall`, reduced);
      await noAdvance(p, `${label}-hero-fall`);
      await load(p, heroFall);
      await killHero(p);
      await banner(p, "hero-fall").waitFor({ state: "visible" });
      await p
        .getByRole("button", { name: "Undo last action", exact: true })
        .click();
      assert.equal(
        await p.locator("[data-significant-moment]").count(),
        0,
        "Undo clears a pending or playing ribbon/video",
      );
      checkpoints.push(`${label}-undo-clears`);

      await load(p, victory);
      await p.locator(".turn-actions .primary:visible").click();
      await reviewedState(p);
      assert.equal((await raw(p)).status, "won");
      await inspectMoment(p, "victory", `${label}-victory`, reduced);
      assert.ok(
        await p
          .getByRole("dialog")
          .locator('[data-significant-moment="victory"]')
          .count(),
        "victory stays in the result dialog",
      );
      await noAdvance(p, `${label}-victory`);
      await resumeAfterReload(p, true);

      await load(p, defeat);
      await p
        .locator(
          `.board-card:has(img[data-card-code="${W.valley}"]) .card-action`,
        )
        .click();
      await reviewedState(p);
      assert.equal((await raw(p)).status, "lost");
      await inspectMoment(p, "defeat", `${label}-defeat`, reduced);
      await noAdvance(p, `${label}-defeat`);
      await resumeAfterReload(p, true);

      await load(p, routine);
      await p
        .locator(
          '.hand-card:has(img[data-card-code="01013"]) .hand-play:not(.hand-ability)',
        )
        .click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Play card", exact: true })
        .click();
      await reviewedState(p);
      assert.equal(
        await p.locator("[data-significant-moment]").count(),
        0,
        "routine ally play/resources does not announce a milestone",
      );
      await p.locator(".turn-actions .primary:visible").click();
      await reviewedState(p);
      assert.equal(
        await p.locator("[data-significant-moment]").count(),
        0,
        "ordinary phase change does not announce a milestone",
      );
      await load(p, seats);
      await p.locator(".seat-tab").nth(1).click();
      assert.equal(
        await p.locator("[data-significant-moment]").count(),
        0,
        "seat switch does not announce missing active heroes",
      );
      if (reduced)
        assert.ok(
          !requests.some((u) =>
            /SignificantMomentVisual|hero-fall\.webm/.test(u),
          ),
          "reduced-motion session requests no heavy decorative media",
        );
      checkpoints.push(`${label}-routine-and-reload`);
      await context.close();
    }
  assert.deepEqual(errors, [], "no console or browser errors");
  assert.ok(pausedReviews > 0, "actual resolution reviews were checked");
  assert.equal(buildEntries.size, 1, "the suite tested one consistent build");
  await fs.writeFile(
    `${dir}/verification.json`,
    JSON.stringify(
      {
        url,
        buildEntries: [...buildEntries],
        checkpoints,
        pausedReviews,
        screenshots,
        media,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Significant moments browser passed ${checkpoints.length} checkpoints: all five real events, responsive normal/reduced motion, independent engine state, paused choices/reviews/details, reload, Undo and routine actions.`,
  );
} catch (error) {
  for (const context of browser.contexts())
    for (const p of context.pages())
      await p.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
