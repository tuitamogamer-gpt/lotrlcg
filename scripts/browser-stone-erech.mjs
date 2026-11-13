import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import {
  SE,
  STONE_ERECH_QUESTS,
  STONE_ERECH_RECIPES,
} from "../src/game/stone-erech-support.ts";
import {
  activate,
  allies,
  base,
  night,
} from "../tests/stone-erech-fixtures.ts";
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
    new URL("../tests/stone-erech-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/stone-erech-browser";
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
const panel = "[data-scenario-panel='the-stone-of-erech']";
const stage = (s, code) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
async function travel() {
  await page.getByRole("button", { name: "Travel here" }).first().click();
  await reviewedState(page);
  return saved(page);
}
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
          await fresh(page, "the-stone-of-erech", players, easy);
          await page.locator("#start-btn").click();
          let s = await opening(page);
          for (let n = 0; s.choice && n < 20; n++)
            s = await choose(page, s.choice.options[0].id);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.stoneErech.setAside,
            s.stoneErech.night.code,
            ...(s.victoryCards ?? []),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              [...p.heroes, ...p.allies]
                .flatMap((u) => u.attachments)
                .map((a) => a.code)
                .filter((c) => c.startsWith("octgn:")),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...STONE_ERECH_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            STONE_ERECH_RECIPES[0].cards
              .flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          // Tarlang's Neck is active unless Vale of Shadows took its place.
          assert.ok(
            s.activeLocation?.code === SE.neck ||
              (s.activeLocation?.code === SE.vale &&
                s.staging.some((u) => u.code === SE.neck)),
          );
          assert.deepEqual((await resume(page)).stoneErech, s.stoneErech);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-derufin='aside']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const index of [0, 1, 2]) {
      const s = base(1);
      s.stage = index + 1;
      s.stoneErech.currentQuest = STONE_ERECH_QUESTS[index].code;
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(STONE_ERECH_QUESTS[index].code).name}`,
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
    // Tarlang's Neck at the beginning of the encounter phase.
    const neck = base(1);
    activate(neck, SE.neck);
    stage(neck, SE.restless);
    neck.phase = "travel";
    neck.queue.push(fx("startEncounter"));
    flush(neck);
    assert.match(neck.choice.title, /^Tarlang's Neck/);
    await load(page, neck);
    await checkpoint("tarlangs-neck", width);
    let s = await choose(page, "engage");
    assert.equal(s.engaged.length, 1);
    // The night falls: Dusk in the panel after Eventide's fourth progress.
    const dusk = base(1);
    dusk.stoneErech.night.progress = 3;
    dusk.queue.push(fx("seNightProgress", { player: 0 }));
    flush(dusk);
    assert.equal(dusk.stoneErech.night.code, SE.dusk);
    await load(page, dusk);
    await page.locator(`${panel} [data-night='Dusk']`).waitFor();
    await checkpoint("dusk-falls", width);
    // Stage 2: travel to The Stone of Erech; Derufin joins the first player.
    const terror = base(1);
    terror.progress = 6;
    check(terror);
    flush(terror);
    assert.equal(terror.stage, 2);
    terror.phase = "travel";
    await load(page, terror);
    await page.locator(`${panel} [data-derufin='attached']`).waitFor();
    await checkpoint("stone-of-erech-derufin", width);
    s = await travel();
    assert.equal(s.activeLocation.code, SE.stone);
    assert.ok(s.allies.some((u) => u.code === SE.derufin));
    await page.locator(`${panel} [data-derufin='controlled']`).waitFor();
    await checkpoint("derufin-rescued", width);
    // Terror of the Dead at the beginning of the round.
    const round = base(1);
    round.stage = 2;
    round.stoneErech.currentQuest = SE.terror;
    round.queue.push(...[fx("seTerror", { player: 0 })]);
    flush(round);
    await load(page, round);
    await checkpoint("terror-of-the-dead", width);
    s = await choose(page, "resources");
    await page.locator(`${panel} [data-no-resources='true']`).waitFor();
    // Haunted Valley's Planning Action.
    const valley = base(1);
    const haunted = stage(valley, SE.haunted);
    await load(page, valley);
    await page
      .getByRole("button", {
        name: "Haunted Valley · Planning Action: exhaust a hero you control",
      })
      .first()
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.match(s.choice.title, /^Haunted Valley/);
    await checkpoint("haunted-valley", width);
    s = await choose(page, s.choice.options[0].id);
    assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
    assert.ok(s.staging.some((u) => u.id === haunted.id));
    // Stage 3: the Shadow Host search, then a Midnight battle.
    const host = base(1);
    host.stage = 2;
    host.stoneErech.currentQuest = SE.terror;
    host.stoneErech.setAside = host.stoneErech.setAside.filter(
      (c) => c !== SE.derufin && c !== SE.stone,
    );
    host.stoneErech.derufin = "attached";
    host.encounterDeck = [SE.banks, SE.captain, SE.banks];
    host.progress = 8;
    check(host);
    flush(host);
    assert.match(host.choice.title, /^Search for an Oathbreaker enemy/);
    await load(page, host);
    await checkpoint("shadow-host-search", width);
    s = await choose(page, `deck-${SE.captain}`);
    assert.ok(s.staging.some((u) => u.code === SE.lord));
    const battle = base(1);
    battle.stage = 3;
    battle.stoneErech.currentQuest = SE.host;
    battle.stoneErech.setAside = [];
    battle.stoneErech.derufin = "controlled";
    allies(battle, [SE.derufin]);
    night(battle, SE.midnight, 2);
    await load(page, battle);
    await page.locator(`${panel} [data-night='Midnight']`).waitFor();
    await checkpoint("midnight-battle", width);
    // Victory: The Shadow Host is defeated with Derufin.
    const won = base(1);
    won.stage = 3;
    won.stoneErech.currentQuest = SE.host;
    won.stoneErech.setAside = [];
    won.stoneErech.derufin = "controlled";
    allies(won, [SE.derufin]);
    won.progress = 14;
    check(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("escaped-with-derufin", width);
    // Defeat: Derufin leaves play.
    const lost = base(1);
    const derufin = allies(lost, [SE.derufin])[0];
    lost.stoneErech.derufin = "controlled";
    lost.stoneErech.setAside = lost.stoneErech.setAside.filter(
      (c) => c !== SE.derufin,
    );
    derufin.damage = 2;
    check(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("derufin-lost", width);
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
    `The Stone of Erech browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
