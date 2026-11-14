import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, progressLocation } from "../src/game/board.ts";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes.ts";
import { forOwner } from "../src/game/table.ts";
import {
  HD,
  HELMS_DEEP_QUESTS,
  HELMS_DEEP_RECIPES,
  helmsDeepDefense,
} from "../src/game/helms-deep.ts";
import {
  activate,
  allies,
  base,
  engaged,
  hand,
  settle,
  stage,
} from "../tests/helms-deep-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  opening,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/helms-deep-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/helms-deep-browser";
await fs.mkdir(dir, { recursive: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
  setups = [],
  artwork = [];
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
let page;
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
const panel = "[data-scenario-panel='helms-deep']";
const run = (s, ...effects) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s, code, player) => {
  s.encounterDeck.unshift(code);
  return run(s, fx("reveal", { player }));
};
const checkAs = (s, player) => {
  forOwner(s, player, () => check(s));
  flush(s);
  return settle(s);
};
try {
  for (const width of [1280, 390, 320]) {
    const view = await context(
      browser,
      width,
      width === 1280 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
    if (width === 1280)
      for (const easy of [false, true])
        for (const players of [1, 2, 3, 4]) {
          await fresh(page, "helms-deep", players, easy);
          await page.locator("#start-btn").click();
          // Stop at the players' choice, once the hands are kept.
          for (let n = 0; n < 100; n++) {
            await reviewedState(page);
            const state = await saved(page);
            if (state.choice) break;
            if (state.phase === "setup")
              await page
                .getByRole("button", { name: "Keep hand", exact: true })
                .click();
            else await page.waitForTimeout(25);
          }
          let s = await saved(page);
          assert.match(
            s.choice.title,
            /^The King of the Golden Hall · The players must choose/,
          );
          if (players === 2 && !easy)
            await checkpoint("poisoned-counsels-or-stage-2a", width);
          // Odd numbers of players take Poisoned Counsels; even numbers advance.
          s = await choose(page, players % 2 ? "counsels" : "advance");
          s = await opening(page);
          for (let n = 0; s.choice && n < 30; n++)
            s = await choose(page, s.choice.options[0].id);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.helmsDeep.setAside,
            ...(s.removedEncounter ?? []),
            ...(s.victoryCards ?? []),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.heroes.filter((h) => h.code === TOS_ARAGORN).map((h) => h.code),
            ),
            ...seats.flatMap((p) =>
              [...p.deck, ...p.hand.map((u) => u.code), ...p.discard].filter(
                (c) => c === HD.counsels,
              ),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            // Scaling Ladders attached to a location, and shadow cards.
            ...[
              ...s.staging,
              ...seats.flatMap((p) => p.engaged),
              ...(s.activeLocation ? [s.activeLocation] : []),
            ].flatMap((u) => [
              ...u.attachments.map((a) => a.code),
              ...u.shadows,
            ]),
            ...HELMS_DEEP_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            HELMS_DEEP_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, players % 2 ? 1 : 2);
          assert.equal(s.helmsDeep.counsels, players % 2 === 1);
          assert.deepEqual((await resume(page)).helmsDeep, s.helmsDeep);
          await page.locator(`${panel} [data-stage='${s.stage}']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The five printed quest cards.
    for (const [index, code] of HELMS_DEEP_QUESTS.map(
      (q) => q.code,
    ).entries()) {
      const s = base(1, Math.max(2, index + 1));
      s.helmsDeep.currentQuest = code;
      s.stage = index + 1;
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(code).name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint(`quest-${index + 1}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${index + 1}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Stage 1B puts an ally that matches a hero's sphere into play.
    const king = base(1, 2);
    king.helmsDeep.currentQuest = HD.king;
    king.stage = 1;
    king.staging = [];
    hand(king, ["01013", "01062"]);
    run(king, fx("hdAlly", { player: 0 }));
    assert.match(king.choice.title, /Put an ally into play/);
    await load(page, king);
    await checkpoint("stage-1b-ally", width);
    // Assault on Helm's Deep: the Defense of Helm's Deep holds 5 tokens.
    const assault = base(2, 2);
    helmsDeepDefense(assault).resources = 5;
    activate(assault, HD.wall);
    stage(assault, HD.soldier);
    engaged(assault, HD.hillman, 1);
    await load(page, assault);
    await page.locator(`${panel} [data-tokens='5']`).waitFor();
    await page.locator(`${panel} [data-defense='true']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^2B$/ }).waitFor();
    await checkpoint("assault-on-helms-deep", width);
    // The encounter cards' choices.
    for (const [label, code, title, prepare] of [
      [
        "night-without-end",
        HD.night,
        /^Night Without End · Choose one/,
        (s) => (helmsDeepDefense(s).resources = 3),
      ],
      [
        "reckless-hate",
        HD.hate,
        /^Warrior of Dunland · Immediate attack/,
        (s) => stage(s, HD.warrior),
      ],
    ]) {
      const state = base(1, 2);
      prepare(state);
      state.phase = "quest";
      reveal(state, code, 0);
      assert.match(state.choice.title, title);
      await load(page, state);
      await checkpoint(label, width);
    }
    // Devilry of Saruman: every character's text box is blank this round.
    let devilry = base(1, 3);
    devilry.phase = "quest";
    devilry = settle(reveal(devilry, HD.devilry, 0));
    devilry.phase = "planning";
    await load(page, devilry);
    await page.locator(`${panel} [data-round-effects='true']`).waitFor();
    await checkpoint("devilry-of-saruman", width);
    // The Hornburg is explored: its damage is assigned among characters.
    const hornburg = base(1, 3);
    stage(hornburg, HD.hillman);
    allies(hornburg, ["01013"]);
    const tower = activate(hornburg, HD.hornburg);
    progressLocation(hornburg, tower, 3);
    flush(hornburg);
    assert.match(hornburg.choice.title, /^The Hornburg · Assign damage/);
    await load(page, hornburg);
    await checkpoint("the-hornburg", width);
    // The Wall is Breached!
    const breached = base(2, 4);
    breached.progress = 6;
    stage(breached, HD.soldier);
    stage(breached, HD.hillman);
    await load(page, breached);
    await page.locator(".quest-stage-seal", { hasText: /^4B$/ }).waitFor();
    await checkpoint("the-wall-is-breached", width);
    // The King Rides Out, and the victory.
    const rides = base(1, 5);
    stage(rides, HD.hillman);
    await load(page, rides);
    await page.locator(`${panel} [data-stage='5']`).waitFor();
    await checkpoint("the-king-rides-out", width);
    let won = base(1, 5);
    won = checkAs(won, 0);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("helms-deep-holds", width);
    // Defeat: the encounter deck defeats The Wall is Breached!.
    let lost = base(1, 4);
    lost.progress = 8;
    lost = checkAs(lost, 0);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("helms-deep-falls", width);
    await view.c.close();
  }
  const p = await browser.newPage();
  for (const a of art) {
    const r = await p.request.get(new URL(a.localPath, url).href);
    assert.equal(r.status(), 200);
    const bytes = await r.body();
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
    const size = await p.evaluate(
      async (bytes) => {
        const b = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const size = { width: b.width, height: b.height };
        b.close();
        return size;
      },
      [...bytes],
    );
    assert.ok(size.width > 0 && size.height > 0);
    artwork.push({ ...a, ...size });
  }
  await p.close();
  await report(dir, {
    sourceScriptSha256,
    errors,
    entries,
    screenshots,
    checks,
    setups,
    artwork,
  });
  console.log(
    `Helm's Deep browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
    await fs.writeFile(
      `${dir}/failure.json`,
      JSON.stringify(
        {
          error: String(error),
          stack: error.stack,
          state: await saved(page).catch(() => null),
          errors,
          checks,
        },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  await browser.close();
}
