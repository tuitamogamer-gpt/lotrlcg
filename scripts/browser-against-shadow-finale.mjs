import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as fixture } from "../tests/against-shadow-final-fixtures.ts";
import { validateSave } from "../src/game/engine.ts";
import { make } from "../src/game/core.ts";
import { revealed } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { bloodTakeHidden } from "../src/game/blood-gondor.ts";
import { BLOOD_GONDOR as B } from "../src/game/blood-gondor-support.ts";
import { MORGUL_VALE as M } from "../src/game/morgul-vale-support.ts";
import { prepareEnemyShadows } from "../src/game/considered-engagement.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/against-shadow-finale";
await fs.mkdir(dir, { recursive: true });
const blood = fixture("the-blood-of-gondor");
blood.phase = "defense";
blood.allies = [make(blood, B.faramir), make(blood, B.alcaron)];
blood.encounterDeck = [B.uruk];
bloodTakeHidden(blood, 0);
const hiddenId = blood.bloodGondor.hidden[0][0].id;
const morgul = fixture("the-morgul-vale");
morgul.staging = [make(morgul, M.tower), make(morgul, M.murzag)];
revealed(morgul, M.fog);
flush(morgul);
const voice = fixture("mirkwood");
voice.heroes = [make(voice, "07002")];
voice.heroes[0].resources = 10;
voice.hand = [make(voice, "07003")];
voice.staging = [make(voice, "01096")];
const enemyId = voice.staging[0].id;
const lamp = fixture("mirkwood");
lamp.phase = "defense";
lamp.heroes[0].attachments = [
  { id: "browser-lamp", code: "07009", exhausted: false },
];
lamp.engaged = [make(lamp, "01096")];
lamp.encounterDeck = ["01076"];
prepareEnemyShadows(lamp, lamp.engaged[0]);
for (const s of [blood, morgul, voice, lamp]) assert.ok(validateSave(s));

const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [];
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
async function resume(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function load(p, s) {
  await p.evaluate((state) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(state));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  return resume(p);
}
async function choose(p, id) {
  const s = await reviewedState(p);
  const i = s.choice.options.findIndex((o) => o.id === id);
  assert.ok(i >= 0, JSON.stringify(s.choice));
  await p
    .getByRole("dialog")
    .locator(".choice-list .decision-select")
    .nth(i)
    .click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  const failed = await p.evaluate(async () => {
    const root =
      [...document.querySelectorAll('dialog[open], [role="dialog"]')].at(-1) ??
      document;
    const visible = [...root.querySelectorAll("img")].filter((i) => {
      const r = i.getBoundingClientRect();
      return (
        i.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        r.width &&
        r.height &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth
      );
    });
    return (
      await Promise.all(
        visible.map(async (i) => {
          i.loading = "eager";
          try {
            await i.decode();
            return null;
          } catch {
            return i.src;
          }
        }),
      )
    ).filter(Boolean);
  });
  assert.deepEqual(failed, [], `${name}: missing visible art`);
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: horizontal overflow`,
  );
  const modal = p.getByRole("dialog");
  if (await modal.count()) {
    const r = await modal.last().boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= height + 1,
      `${name}: clipped dialog`,
    );
  }
  const path = `${dir}/${name}.png`;
  await p.screenshot({ path });
  screenshots.push(path);
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
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);
    await load(p, blood);
    assert.match(
      await p.locator(".scenario-state-summary").innerText(),
      /1 hidden cards/,
    );
    assert.ok(!(await p.locator("body").innerText()).includes("Brutal Uruk"));
    await p
      .getByRole("button", {
        name: "Reveal a hidden card · Deal 3 damage if it is an enemy",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await capture(p, `hidden-choice-${width}`, height);
    await resume(p);
    await choose(p, hiddenId);
    assert.equal((await saved(p)).engaged[0].damage, 3);
    await capture(p, `hidden-turned-${width}`, height);

    await load(p, morgul);
    await capture(p, `tower-choice-${width}`, height);
    await resume(p);
    await choose(p, "progress");
    assert.equal(
      (await saved(p)).staging.find((u) => u.code === M.tower).progress,
      3,
    );
    assert.match(await p.locator(".tower-counter").innerText(), /3 \/ 10/);
    await capture(p, `tower-counter-${width}`, height);

    await load(p, voice);
    await p
      .getByRole("button", {
        name: "Reduce your next card's cost by 1 · Doomed 1",
        exact: true,
      })
      .click();
    await reviewedState(p);
    await p.locator(".hand-play:not(.hand-ability)").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    assert.equal((await saved(p)).threat, 24);
    await capture(p, `saruman-choice-${width}`, height);
    await resume(p);
    await choose(p, enemyId);
    assert.equal((await saved(p)).isengard.outOfPlay[0].cards[0].id, enemyId);
    await capture(p, `saruman-out-of-play-${width}`, height);

    await load(p, lamp);
    const button = p.getByRole("button", { name: /^Inspect faceup shadow:/ });
    assert.equal(await button.count(), 1);
    await capture(p, `lamp-visible-${width}`, height);
    await button.click();
    await capture(p, `lamp-inspect-${width}`, height);
    await resume(p);
    assert.equal((await saved(p)).engaged[0].revealedShadowCount, 0);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ screenshots, errors, widths: [1280, 390, 320] }, null, 2) +
      "\n",
  );
  console.log(
    `Against the Shadow finale / Voice of Isengard: ${screenshots.length} screenshots; no browser errors.`,
  );
} finally {
  await browser.close();
}
