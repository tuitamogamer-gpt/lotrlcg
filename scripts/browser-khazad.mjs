import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import { KHAZAD as K, KHAZAD_QUESTS } from "../src/game/khazad-dum.ts";
import { questFace, questStageLabel } from "../src/ui/tabletop.tsx";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5201",
  dir = "output/khazad";
await fs.mkdir(dir, { recursive: true });
function fixture(scenarioId = "mirkwood", deckId = "leadership") {
  const deck = STARTERS.find((d) => d.id === deckId);
  let s = createGame(711, deck.cards, deck.heroes, deck.id, { scenarioId });
  for (let i = 0; i < 100 && (s.choice || s.phase === "setup"); i++)
    s = applyAction(
      s,
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  s.phase = "planning";
  s.queue = [];
  s.choice = null;
  s.staging = [];
  s.hand = [];
  s.engaged = [];
  s.activeLocation = null;
  s.victory = 0;
  s.progress = 0;
  s.lastReveal = null;
  s.heroes.forEach((h) => {
    h.resources = 8;
    h.exhausted = false;
    h.committed = false;
    h.attachments = [];
  });
  return s;
}
const book = fixture("the-seventh-level");
book.staging = [make(book, K.book)];
const tools = fixture("flight-from-moria");
tools.khazad.activeQuest = K.darkness;
tools.khazad.questSide = "B";
tools.khazad.questDeck = KHAZAD_QUESTS.filter(
  (q) =>
    q.encounter_set === "Flight from Moria" &&
    ![K.presence, K.darkness].includes(q.code),
).map((q) => q.code);
tools.staging = [make(tools, K.tools)];
const route = structuredClone(tools);
route.phase = "quest";
route.khazad.activeQuest = K.up;
route.khazad.questSide = "A";
route.khazad.questDeck = KHAZAD_QUESTS.filter(
  (q) =>
    q.encounter_set === "Flight from Moria" &&
    ![K.presence, K.up].includes(q.code),
).map((q) => q.code);
route.staging = [make(route, K.nameless)];
const count = fixture("mirkwood", "tactics");
count.heroes[0].attachments.push({
  id: "keeping-count-ui",
  code: "04005",
  exhausted: false,
  owner: 0,
  resourceTokens: 2,
});
const bofur = fixture("mirkwood", "spirit");
bofur.phase = "staging";
bofur.hand = [make(bofur, "04006")];
for (const s of [book, tools, route, count, bofur])
  assert.ok(validateSave(s), `${s.scenarioId} fixture is save-compatible`);
const browser = await chromium.launch({ headless: true }),
  errors = [];
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
async function capture(p, name, height) {
  await p
    .waitForFunction(
      () =>
        [
          ...(
            document.querySelector("dialog[open]") ?? document
          ).querySelectorAll("img"),
        ].every((img) => {
          const r = img.getBoundingClientRect();
          return r.bottom < 0 || r.top > innerHeight || img.complete;
        }),
      null,
      { timeout: 25000 },
    )
    .catch(async (error) => {
      console.log(
        await p.evaluate(() =>
          [...document.images]
            .filter((img) => !img.complete)
            .map((img) => ({
              src: img.src,
              rect: img.getBoundingClientRect().toJSON(),
            })),
        ),
      );
      await p.screenshot({ path: `${dir}/${name}-image-wait.png` });
      throw error;
    });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    name,
  );
  const dialog = p.getByRole("dialog");
  if (await dialog.count()) {
    const r = await dialog.boundingBox();
    assert.ok(r.y >= 0 && r.y + r.height <= height + 1, `${name} dialog fits`);
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
    await load(p, book);
    await p
      .getByRole("button", { name: "Claim · Exhaust hero", exact: true })
      .click();
    await capture(p, `book-claim-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Aragorn", exact: true })
      .click();
    let s = await reviewedState(p);
    assert.ok(s.heroes[0].exhausted);
    assert.equal(s.threat, book.threat);
    assert.equal(s.heroes[0].attachments[0].code, K.book);
    await p
      .getByRole("button", {
        name: "Move Book of Mazarbul · Exhaust a hero",
        exact: true,
      })
      .click();
    assert.equal(
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Aragorn", exact: true })
        .count(),
      0,
    );
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Théodred", exact: true })
      .click();
    s = await reviewedState(p);
    assert.equal(s.heroes[0].attachments.length, 0);
    assert.equal(s.heroes[1].attachments[0].code, K.book);
    s = await reload(p);
    assert.equal(s.heroes[1].attachments[0].code, K.book);
    await load(p, tools);
    await p
      .getByRole("button", { name: "Claim · Exhaust hero", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Aragorn", exact: true })
      .click();
    s = await reviewedState(p);
    assert.equal(s.heroes[0].attachments[0].code, K.tools);
    assert.equal(s.threat, tools.threat);
    await load(p, route);
    assert.equal(
      await p.locator(".quest-stage-seal").innerText(),
      questStageLabel(route),
    );
    assert.equal(
      await p.locator(".quest-card-stack img").getAttribute("src"),
      questFace(route),
    );
    await p.locator(".quest-card-stack").click();
    await capture(p, `route-front-${width}`, height);
    await p
      .getByRole("button", { name: "Read printed quest", exact: true })
      .click();
    await p.getByRole("button", { name: "Show reverse", exact: true }).click();
    assert.equal(
      await p.getByRole("button", { name: "Show front", exact: true }).count(),
      1,
    );
    await capture(p, `route-reverse-${width}`, height);
    const back = structuredClone(route);
    back.khazad.questSide = "B";
    await load(p, back);
    assert.equal(
      await p.locator(".quest-card-stack img").getAttribute("src"),
      questFace(back),
    );
    assert.equal(
      await p.locator(".quest-stage-seal").innerText(),
      questStageLabel(back),
    );
    await load(p, count);
    const chip = p.getByRole("button", {
      name: "Inspect attachment: Keeping Count",
      exact: true,
    });
    assert.equal(await chip.locator(".token-resource b").innerText(), "2");
    await chip.click();
    assert.match(
      await p.getByRole("dialog").innerText(),
      /Live resource tokens: 2/,
    );
    await capture(p, `keeping-count-${width}`, height);
    await load(p, bofur);
    assert.equal(
      await p.locator(".hand-ability").innerText(),
      "Pay 1 Spirit · enter exhausted and committed",
    );
    await p.locator(".hand-ability").click();
    await capture(p, `bofur-hand-action-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Éowyn", exact: true })
      .click();
    s = await reviewedState(p);
    assert.equal(s.heroes[0].resources, 7);
    assert.ok(s.allies[0].committed && s.allies[0].exhausted);
    s = await reload(p);
    assert.ok(s.allies[0].committed && s.allies[0].exhausted);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Khazad UI passed: Book claim/movement and save, Tools claim, Flight printed A/B quest faces/reverse, Keeping Count physical counter/inspector, Bofur hand action/save, and 1280/390/320 layouts.",
  );
} finally {
  await browser.close();
}
