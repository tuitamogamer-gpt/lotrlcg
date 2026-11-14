import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, progressLocation } from "../src/game/board.ts";
import { LAND_SHADOW_FRODO } from "../src/game/lotr-saga-codes.ts";
import {
  SL,
  SHELOB_LAIR_QUESTS,
  SHELOB_LAIR_RECIPES,
} from "../src/game/shelob-lair.ts";
import {
  activate,
  base,
  hand,
  settle,
  shelob,
  stage,
} from "../tests/shelob-lair-fixtures.ts";
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
    new URL("../tests/shelob-lair-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/shelob-lair-browser";
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
const panel = "[data-scenario-panel='shelobs-lair']";
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
/** The first player reveals a known card during the staging step. */
const revealAs = (s, code) => {
  s.phase = "staging";
  return reveal(s, code, 0);
};
/** Past the "Revealed" confirmation of a treachery. */
const pastReveal = (s) => {
  while (s.choice && /^Revealed · /.test(s.choice.title)) {
    const resolve = s.choice.options.find((o) => o.id === "resolve");
    s.choice = null;
    s.queue.unshift(...resolve.effects);
    flush(s);
  }
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
          await fresh(page, "shelobs-lair", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...(s.victoryCards ?? []),
            ...s.shelobLair.setAside,
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.allies
                .filter((u) => u.code === SL.smeagol)
                .map(() => SL.gollum),
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
            ...SHELOB_LAIR_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            SHELOB_LAIR_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.filter((r) =>
                [
                  "sharedQuestDeck",
                  "sharedEncounterDeck",
                  "sharedEncounterDeck2",
                  "sharedSetAside",
                  "sharedStagingArea",
                  "sharedActiveLocation",
                ].includes(r.section),
              )
              .flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.equal(s.activeLocation.code, SL.vale);
          assert.deepEqual(
            s.staging.map((u) => u.code),
            [SL.secretWay],
          );
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].allies.some((u) => u.code === SL.smeagol),
            "the first player controls Sméagol",
          );
          assert.ok(
            seats[first].heroes.some((h) => h.code === LAND_SHADOW_FRODO),
            "the first player controls Frodo Baggins",
          );
          assert.deepEqual((await resume(page)).shelobLair, s.shelobLair);
          await page
            .locator(
              `${panel} [data-stage='1'] ~ [data-secret-way-victory='false']`,
            )
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The three printed quest cards, both sides.
    for (const [index, code] of SHELOB_LAIR_QUESTS.map(
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
    // Sméagol's Secret Way explored: the Forced choice, then the Response.
    let way = base(1, 1);
    const secret = activate(way, SL.secretWay);
    stage(way, SL.wraith);
    hand(way, ["01013", "01013", "01013", "01013"]);
    progressLocation(way, secret, 2);
    flush(way);
    assert.match(
      way.choice.title,
      /^Sméagol's Secret Way · Exhaust a character or discard a random card/,
    );
    await load(page, way);
    await checkpoint("secret-way-explored", width);
    way = settle(way, "discard");
    // Morgul Vale explored: the first player's choice.
    const vale = base(2, 1);
    const morgul = activate(vale, SL.vale);
    vale.encounterDeck = [SL.den, SL.wraith, SL.den];
    progressLocation(vale, morgul, 2);
    flush(vale);
    assert.match(
      vale.choice.title,
      /^Morgul Vale · The first player must choose/,
    );
    await load(page, vale);
    await checkpoint("morgul-vale", width);
    // The Spider's Pass: Shelob in the staging area; her Forced choice.
    const pass = base(2, 2);
    stage(pass, SL.den);
    pass.queue.push(fx("slShelobForced", { player: 0 }));
    flush(pass);
    assert.match(pass.choice.title, /^Shelob · Choose one/);
    await load(page, pass);
    await page.locator(`${panel} [data-stage='2']`).waitFor();
    await page.locator(`${panel} [data-shelob-resources='0']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^2B$/ }).waitFor();
    await checkpoint("the-spiders-pass", width);
    // Shelob's Poison: attach to a hero.
    const poison = pastReveal(revealAs(base(1, 2), SL.poison));
    assert.match(poison.choice.title, /^Shelob's Poison · Attach to a hero/);
    await load(page, poison);
    await checkpoint("shelobs-poison", width);
    // Lurking Malice: a resource or her attack.
    const feeding = base(2, 2);
    shelob(feeding).resources = 2;
    const malice = pastReveal(revealAs(feeding, SL.malice));
    assert.match(malice.choice.title, /^Lurking Malice · Choose one/);
    await load(page, malice);
    await page.locator(`${panel} [data-shelob-resources='2']`).waitFor();
    await checkpoint("lurking-malice", width);
    // Orc of Cirith Ungol: Peril.
    const orc = pastReveal(revealAs(base(2, 2), SL.cirithOrc));
    assert.match(orc.choice.title, /^Orc of Cirith Ungol · Choose one/);
    await load(page, orc);
    await checkpoint("orc-of-cirith-ungol", width);
    // Blocked Tunnel: revealed, it becomes the active location.
    const blocked = base(1, 2);
    activate(blocked, SL.den);
    const tunnel = settle(revealAs(blocked, SL.tunnel));
    assert.equal(tunnel.activeLocation.code, SL.tunnel);
    await load(page, tunnel);
    await checkpoint("blocked-tunnel", width);
    // Gollum's Betrayal: Shelob's resources and the victory display.
    const betrayal = base(2, 3);
    shelob(betrayal).resources = 2;
    await load(page, betrayal);
    await page
      .locator(
        `${panel} [data-shelob-victory='false'][data-gollum-victory='false']`,
      )
      .waitFor();
    await page.locator(`${panel} [data-cleft-victory='false']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^3B$/ }).waitFor();
    await checkpoint("gollums-betrayal", width);
    // Victory: Shelob and Gollum in the victory display.
    const won = base(1, 3);
    won.victoryCards = [SL.cleft, SL.gollum, SL.shelob];
    won.engaged = won.engaged.filter((u) => u.code !== SL.gollum);
    won.staging = won.staging.filter(
      (u) => u.code !== SL.shelob && u.code !== SL.cleft,
    );
    won.progress = 8;
    check(won);
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("shelob-defeated", width);
    // Defeat: Sméagol is destroyed.
    let lost = base(1, 2);
    const smeagol = lost.allies.find((u) => u.code === SL.smeagol);
    smeagol.damage = card(SL.smeagol).health - 1;
    lost.queue.push(fx("damage", { target: smeagol.id, value: 1, player: 0 }));
    flush(lost);
    lost = settle(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("smeagol-destroyed", width);
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
    `Shelob's Lair browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
