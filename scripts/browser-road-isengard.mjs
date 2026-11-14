import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { draw, fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, progressLocation } from "../src/game/board.ts";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes.ts";
import { forOwner } from "../src/game/table.ts";
import {
  RI,
  ROAD_ISENGARD_QUESTS,
  ROAD_ISENGARD_RECIPES,
  roadIsengardSaruman,
} from "../src/game/road-isengard.ts";
import {
  FILLER,
  activate,
  allies,
  base,
  deck,
  engaged,
  settle,
  stage,
} from "../tests/road-isengard-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  context,
  fresh,
  load,
  opening,
  report,
  resume,
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/road-isengard-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/road-isengard-browser";
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
const panel = "[data-scenario-panel='the-road-to-isengard']";
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
/** Orthanc becomes the active location. */
const orthancActive = (s) => {
  const orthanc = s.staging.find((u) => u.code === RI.orthanc);
  s.staging = s.staging.filter((u) => u.id !== orthanc.id);
  s.activeLocation = orthanc;
  return s;
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
          await fresh(page, "the-road-to-isengard", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.roadIsengard.setAside,
            ...(s.removedEncounter ?? []),
            ...(s.victoryCards ?? []),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.heroes.filter((h) => h.code === TOS_ARAGORN).map((h) => h.code),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...[
              ...s.staging,
              ...seats.flatMap((p) => p.engaged),
              ...(s.activeLocation ? [s.activeLocation] : []),
            ].flatMap((u) => [
              ...u.attachments.map((a) => a.code),
              ...u.shadows,
            ]),
            ...ROAD_ISENGARD_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            ROAD_ISENGARD_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.equal(
            s.staging.filter((u) => u.code === RI.ent).length,
            4,
            "the four Ents of Fangorn",
          );
          // Rouse the Ents: the resource phase gave nothing.
          for (const seat of seats) {
            assert.equal(seat.hand.length, 6);
            assert.ok(seat.heroes.every((h) => h.resources === (easy ? 1 : 0)));
          }
          assert.deepEqual((await resume(page)).roadIsengard, s.roadIsengard);
          await page
            .locator(`${panel} [data-stage='1'] ~ [data-ents='4']`)
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The three printed quest cards.
    for (const [index, code] of ROAD_ISENGARD_QUESTS.map(
      (q) => q.code,
    ).entries()) {
      const s = base(1, index + 1);
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
    // Rouse the Ents: an Ent's Quest Action asks for a hero to exhaust.
    const rouse = base(1, 1);
    rouse.phase = "quest";
    rouse.staging[0].resources = 2;
    run(rouse, fx("riEntHero", { target: rouse.staging[0].id, player: 0 }));
    assert.match(rouse.choice.title, /^Ent of Fangorn · Exhaust a hero/);
    await load(page, rouse);
    await checkpoint("ent-of-fangorn-quest-action", width);
    // The end of the round: the players may advance to stage 2.
    const advance = base(2, 1);
    advance.roadIsengard.rouse = 1;
    advance.staging.pop();
    allies(advance, [RI.ent], 1);
    run(advance, fx("riRouseRound", { player: 0 }));
    assert.match(advance.choice.title, /^Rouse the Ents · The players may/);
    await load(page, advance);
    await page.locator(`${panel} [data-rouse='2']`).waitFor();
    await checkpoint("rouse-the-ents-advance", width);
    // Breaking Isengard: 3 damage; Gates of Isengard is the active location.
    const breaking = base(2, 2);
    breaking.roadIsengard.breaking = 3;
    activate(breaking, RI.gates);
    stage(breaking, RI.vent);
    allies(breaking, [RI.ent], 0);
    engaged(breaking, RI.wolf, 1);
    await load(page, breaking);
    await page.locator(`${panel} [data-breaking='3']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^2B$/ }).waitFor();
    await checkpoint("breaking-isengard", width);
    // Wizardry: Steaming Vent is explored in the staging area.
    const vent = base(2, 2);
    progressLocation(vent, stage(vent, RI.vent), 4);
    flush(vent);
    assert.match(vent.choice.title, /^Steaming Vent · Assign damage · 3/);
    await load(page, vent);
    await checkpoint("wizardry-steaming-vent", width);
    // The Voice of Saruman: Orthanc is active, Saruman is engaged.
    const voice = orthancActive(base(2, 3));
    voice.progress = 9;
    roadIsengardSaruman(voice).damage = 4;
    await load(page, voice);
    await page
      .locator(`${panel} [data-staff='true'][data-engaged='true']`)
      .waitFor();
    await page.locator(`${panel} [data-saruman-hp='2']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^3B$/ }).waitFor();
    await checkpoint("the-voice-of-saruman", width);
    // Saruman's Staff: a draw brings Saruman's attack with 2 shadow cards.
    const staff = base(1, 3);
    deck(staff, [FILLER, FILLER]);
    draw(staff, 1);
    flush(staff);
    assert.match(staff.choice.title, /^Saruman · Immediate attack/);
    assert.equal(roadIsengardSaruman(staff).shadows.length, 2);
    await load(page, staff);
    await checkpoint("sarumans-staff", width);
    // Orthanc in the staging area: reveal 1 of the top 3 cards.
    const look = base(1, 3);
    look.phase = "quest";
    look.encounterDeck = [RI.lieutenant, RI.ringWall, RI.blast, RI.pit];
    look.lastQuest = { will: 5, threat: 0, net: 5 };
    run(look, fx("questSucceeded", { value: 5, player: 0 }));
    assert.match(look.choice.title, /^Orthanc · Reveal 1 of the top 3/);
    await load(page, look);
    await checkpoint("orthanc-look", width);
    // Isengard Orc's choice.
    const orc = base(1, 3);
    orc.phase = "quest";
    reveal(orc, RI.orc, 0);
    assert.match(orc.choice.title, /^Isengard Orc · Choose one/);
    await load(page, orc);
    await checkpoint("isengard-orc", width);
    // Victory: the stage is defeated and Saruman has no hit points remaining.
    let won = base(1, 3);
    won.progress = 15;
    roadIsengardSaruman(won).damage = 7;
    won = checkAs(won, 0);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("isengard-falls", width);
    // Defeat: a player with no cards in hand is eliminated.
    let lost = base(1, 3);
    lost.hand = [];
    lost = checkAs(lost, 0);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("the-voice-prevails", width);
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
    `The Road to Isengard browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
