import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import { forOwner } from "../src/game/table.ts";
import { LAND_SHADOW_FRODO } from "../src/game/lotr-saga-codes.ts";
import {
  POM,
  PASSAGE_MARSHES_QUESTS,
  PASSAGE_MARSHES_RECIPES,
  pomGollum,
  pomSmeagol,
} from "../src/game/passage-marshes.ts";
import {
  activate,
  allies,
  base,
  engaged,
  settle,
  stage,
} from "../tests/passage-marshes-fixtures.ts";
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
    new URL("../tests/passage-marshes-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/passage-marshes-browser";
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
const panel = "[data-scenario-panel='the-passage-of-the-marshes']";
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
/** The refresh phase ends the round; stops at the first decision. */
const refresh = (s) => {
  run(s, fx("refreshReady"));
  s = settle(s);
  s.queue.push(fx("phaseEnd"), fx("endRound"));
  flush(s);
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
          await fresh(page, "the-passage-of-the-marshes", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...(s.victoryCards ?? []),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...[
              ...s.staging,
              ...seats.flatMap((p) => p.engaged),
              ...(s.activeLocation ? [s.activeLocation] : []),
            ].flatMap((u) => [
              ...u.attachments.map((a) => a.code),
              ...u.shadows,
            ]),
            ...Object.values(s.questAttachments ?? {})
              .flat()
              .map((a) => a.code),
            ...PASSAGE_MARSHES_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            PASSAGE_MARSHES_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.filter((r) =>
                [
                  "sharedQuestDeck",
                  "sharedEncounterDeck",
                  "sharedStagingArea",
                ].includes(r.section),
              )
              .flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].engaged.some((u) => u.code === POM.gollum),
            "Gollum is engaged with the first player",
          );
          assert.ok(
            seats[first].heroes.some((h) => h.code === LAND_SHADOW_FRODO),
            "the first player controls Frodo Baggins",
          );
          assert.ok(
            s.staging.filter((u) => card(u.code).type_code === "location")
              .length >= players,
            "each player revealed a location",
          );
          assert.deepEqual(
            (await resume(page)).passageMarshes,
            s.passageMarshes,
          );
          await page
            .locator(`${panel} [data-stage='1'] ~ [data-gollum-side='gollum']`)
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The three printed quest cards.
    for (const [index, code] of PASSAGE_MARSHES_QUESTS.map(
      (q) => q.code,
    ).entries()) {
      const s = base(1, index + 1);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(code).back_name}`,
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
    // The setup search: each player reveals a location.
    const search = base(1, 1);
    search.encounterDeck = [POM.fens, POM.softMires, POM.mere, POM.pools];
    run(search, fx("pomSetupSearch", { player: 0 }));
    assert.match(search.choice.title, /^The Taming of Sméagol · Reveal a location/);
    await load(page, search);
    await checkpoint("setup-search", width);
    // Mire: the panel counts the tokens; Haunted Mere's Forced effect.
    let mire = base(2, 2);
    const mere = stage(mire, POM.mere);
    mere.resources = 1;
    stage(mire, POM.pools).resources = 3;
    mire.encounterDeck = [POM.candle, POM.softMires, POM.softMires];
    mire = refresh(mire);
    assert.match(mire.choice.title, /^Haunted Mere · Reveal an Undead enemy/);
    await load(page, mire);
    await page.locator(`${panel} [data-mire='4']`).waitFor();
    await checkpoint("mire-haunted-mere", width);
    // The Taming of Sméagol: Gollum is engaged; the Ring-bearer's action.
    const taming = base(1, 1);
    activate(taming, POM.fens);
    stage(taming, POM.softMires);
    await load(page, taming);
    await page
      .getByRole("button", {
        name: /^Frodo Baggins · Spend 1 resource and exhaust The One Ring/,
      })
      .first()
      .waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^1B$/ }).waitFor();
    await checkpoint("the-taming-of-smeagol", width);
    // We Hates Them!: the first player may cancel with The One Ring.
    const hates = base(1, 2);
    hates.phase = "staging";
    reveal(hates, POM.hates, 0);
    assert.match(hates.choice.title, /^We Hates Them! · Cancel this effect/);
    await load(page, hates);
    await page.locator(`${panel} [data-gollum-side='smeagol']`).waitFor();
    await checkpoint("we-hates-them", width);
    // Call of the Ring: the first player must choose.
    const call = base(2, 2);
    call.phase = "staging";
    call.encounterDeck = [POM.wraith, POM.softMires];
    reveal(call, POM.call, 0);
    assert.match(call.choice.title, /^Call of the Ring · The first player must choose/);
    await load(page, call);
    await checkpoint("call-of-the-ring", width);
    // Across the Marshes: Sméagol guides; 2 of 4 locations in the victory display.
    const across = base(2, 2);
    across.victoryCards = [POM.fens, POM.softMires];
    stage(across, POM.pools);
    engaged(across, POM.groping, 1);
    await load(page, across);
    await page.locator(`${panel} [data-victory-locations='2']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^2B$/ }).waitFor();
    await checkpoint("across-the-marshes", width);
    // "Don't Look at the Lights!": the Undead enemies engage each player.
    const lights = base(2, 2);
    lights.encounterDeck = [POM.groping, POM.softMires];
    lights.encounterDiscard = [POM.candle];
    lights.progress = 12;
    lights.victoryCards = [POM.fens, POM.mere, POM.softMires, POM.pools];
    check(lights);
    flush(lights);
    assert.match(lights.choice.title, /^"Don't Look at the Lights!" · Put an Undead enemy/);
    await load(page, lights);
    await checkpoint("dont-look-at-the-lights", width);
    // Victory: Sméagol guides the hobbits across.
    let won = base(1, 3);
    won.progress = 24;
    won = checkAs(won, 0);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("the-marshes-crossed", width);
    // Defeat: Sméagol is destroyed.
    let lost = base(1, 2);
    const smeagol = pomSmeagol(lost);
    smeagol.damage = 4;
    run(lost, fx("damage", { target: smeagol.id, value: 1, player: 0 }));
    lost = settle(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("smeagol-destroyed", width);
    // An attack on Gollum (1B) with allies ready.
    const attack = base(1, 1);
    allies(attack, ["01073"]);
    attack.phase = "attack";
    assert.ok(pomGollum(attack));
    await load(page, attack);
    await checkpoint("attack-gollum", width);
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
    `The Passage of the Marshes browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
