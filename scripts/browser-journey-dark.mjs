import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { flush } from "../src/game/effects.ts";
import { check, progress } from "../src/game/board.ts";
import { applyAction } from "../src/game/engine.ts";
import { ringBearer } from "../src/game/lotr-saga.ts";
import { ROAD_DARKENS_FRODO } from "../src/game/lotr-saga-codes.ts";
import { seatView } from "../src/game/table.ts";
import {
  JD,
  JOURNEY_DARK_HOOKS,
  JOURNEY_DARK_QUESTS,
  JOURNEY_DARK_RECIPES,
} from "../src/game/journey-dark.ts";
import {
  activate,
  balrog,
  base,
  stage,
} from "../tests/journey-dark-fixtures.ts";
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
    new URL("../tests/journey-dark-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/journey-dark-browser";
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
const panel = "[data-scenario-panel='journey-in-the-dark']";
const H = JOURNEY_DARK_HOOKS;
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
          await fresh(page, "journey-in-the-dark", players, easy);
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
            ...s.journeyDark.setAside,
            ...(s.victoryCards ?? []),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              [...p.heroes, ...p.allies]
                .flatMap((u) => u.attachments)
                .map((a) => a.code)
                .filter((c) => c.startsWith("octgn:")),
            ),
            ...seats.flatMap((p) =>
              p.heroes
                .filter((h) => h.code === ROAD_DARKENS_FRODO)
                .map((h) => h.code),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...JOURNEY_DARK_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            JOURNEY_DARK_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.equal(
            s.staging.filter((u) => card(u.code).type_code === "location")
              .length,
            players,
          );
          assert.deepEqual((await resume(page)).journeyDark, s.journeyDark);
          await page.locator(`${panel} [data-stage='1']`).waitFor();
          await page.locator(`${panel} [data-doom='10']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The three printed quest stages.
    for (const [index, code] of [
      JD.moria,
      JD.drums,
      JD.bridgeStage,
    ].entries()) {
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
    // Doom, Doom, Doom: the last token brings the Balrog, which attacks.
    const rising = base(2, 1, 1);
    H.endQuest(rising);
    flush(rising);
    assert.ok(rising.combat?.immediate);
    await load(page, rising);
    await page.locator(`${panel} [data-balrog='staging']`).waitFor();
    await page.locator(`${panel} [data-doom='0']`).waitFor();
    await checkpoint("balrog-rises", width);
    // Drums in the Deep: tokens and Chamber of Mazarbul.
    const drums = base(2, 2);
    drums.journeyDark.drums = 4;
    const chamber = stage(drums, JD.mazarbul);
    drums.encounterDeck = [
      JD.chieftain,
      JD.orc,
      JD.troll,
      ...drums.encounterDeck,
    ];
    drums.phase = "travel";
    await load(page, drums);
    await page
      .locator(`${panel} [data-drums='4'][data-drums-goal='6']`)
      .waitFor();
    await checkpoint("drums-in-the-deep", width);
    const searching = applyAction(drums, { type: "TRAVEL", id: chamber.id });
    assert.match(searching.choice.title, /^Chamber of Mazarbul · Search/);
    await load(page, searching);
    await checkpoint("mazarbul-search", width);
    let s = await choose(page, `deck-${JD.chieftain}`);
    assert.match(s.choice.title, /^Chamber of Mazarbul · Search/);
    s = await choose(page, s.choice.options[0].id);
    for (let n = 0; s.choice && n < 10; n++)
      s = await choose(page, s.choice.options[0].id);
    assert.equal(s.activeLocation.code, JD.mazarbul);
    // The Bridge of Khazad-dûm: no more than 5 progress a round.
    const bridge = base(1, 3);
    bridge.round = 3;
    progress(bridge, 8);
    assert.equal(bridge.progress, 5);
    await load(page, bridge);
    await page.locator(`${panel} [data-bridge-placed='5']`).waitFor();
    await checkpoint("bridge-cap", width);
    // The Great Bridge's response: a hero for the Balrog's keywords.
    const crossing = base(2, 3, 0);
    balrog(crossing).damage = 12;
    const span = activate(crossing, JD.bridge);
    span.progress = 4;
    progress(crossing, 1);
    flush(crossing);
    assert.match(crossing.choice.title, /^The Great Bridge · Response/);
    await load(page, crossing);
    await checkpoint("great-bridge-response", width);
    const hero = seatView(crossing, 1).heroes[0];
    s = await choose(page, hero.id);
    for (let n = 0; s.choice && n < 10; n++)
      s = await choose(page, s.choice.options[0].id);
    assert.ok(s.journeyDark.balrogUnbound);
    await page.locator(`${panel} [data-unbound='true']`).waitFor();
    await checkpoint("balrog-unbound", width);
    // Victory: 15 progress on 3B with The Great Bridge explored.
    const won = base(1, 3);
    won.progress = 15;
    check(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("escape-from-moria", width);
    // Defeat: The One Ring leaves play with the Ring-bearer.
    const lost = base(1, 2);
    const bearer = ringBearer(lost);
    lost.heroes = lost.heroes.filter((h) => h.id !== bearer.id);
    check(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("ring-lost-in-moria", width);
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
    `Journey in the Dark browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
