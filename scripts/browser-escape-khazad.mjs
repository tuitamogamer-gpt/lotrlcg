import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import {
  EK,
  EK_QUESTS,
  EK_STAGE2,
  EK_STAGE3,
  ekCost,
  ekRecipe,
  escapeKhazadPublicState,
} from "../src/game/escape-khazad-support.ts";
import {
  atQuest,
  bane,
  baneAside,
  base,
  pit,
  stage,
} from "../tests/escape-khazad-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/escape-khazad-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/escape-khazad-browser";
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
const panel = "[data-scenario-panel='escape-from-khazad-dum']";
/** The opening hands, then the quick build through the actual dialogs. */
async function build(picks) {
  const queue = [...picks];
  for (let i = 0; i < 300; i++) {
    await reviewedState(page);
    const s = await saved(page);
    if (s.choice) {
      const next = queue.find((id) =>
        s.choice.options.some((o) => o.id === id),
      );
      if (next) queue.splice(queue.indexOf(next), 1);
      await choose(
        page,
        next ??
          s.choice.options.find((o) => o.id === "resolve")?.id ??
          s.choice.options[0].id,
      );
    } else if (s.phase === "setup")
      await page
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
    else if (!s.queue.length && !s.flow?.pending) return s;
    else await page.waitForTimeout(25);
  }
  throw Error("Escape from Khazad-dûm opening did not finish");
}
async function travelTo() {
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
          const stage2 = EK_STAGE2[(players - 1) % 3];
          const stage3 = EK_STAGE3[players % 3];
          const set = `set:${players + (easy ? 20 : 16)}`;
          await fresh(page, "escape-from-khazad-dum", players, easy);
          await page.locator("#start-btn").click();
          const s = await build([stage2, stage3, set, "random"]);
          const q = s.escapeKhazad;
          assert.equal(q.building, null);
          assert.deepEqual(q.questDeck, [stage2, stage3]);
          assert.equal(q.sets.length, 7);
          assert.ok(q.sets.includes(Number(set.slice(4))));
          // Every physical card of the recipe is in one zone.
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...q.box,
            ...q.questDeck,
            q.currentQuest,
          ].sort();
          assert.deepEqual(
            physical,
            ekRecipe()
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          // 1A: Dark Pit and one different 0 cost enemy or location per player.
          assert.equal(s.staging[0].code, EK.pit);
          assert.equal(s.staging.length, 1 + players);
          assert.ok(s.staging.slice(1).every((u) => ekCost(u.code) === 0));
          assert.ok(
            s.heroes.every((h) => h.resources === (easy ? 2 : 1)),
            "each hero has the round's resource",
          );
          assert.deepEqual((await resume(page)).escapeKhazad, q);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-side='1B']`).waitFor();
          await page.locator(`${panel} [data-pit='staging']`).waitFor();
          await page
            .locator(`${panel} button[aria-label='Inspect Dark Pit']`)
            .waitFor();
          await page.locator(`${panel} [data-stage2='${stage2}']`).waitFor();
          await page.locator(`${panel} [data-stage3='${stage3}']`).waitFor();
          await page
            .locator(`${panel} [data-sets='${q.sets.join(",")}']`)
            .waitFor();
          setups.push({ players, easy, stage2, stage3, sets: q.sets });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The quick build's dialogs.
    await fresh(page, "escape-from-khazad-dum", 2, false);
    await page.locator("#start-btn").click();
    for (let i = 0; i < 50; i++) {
      await reviewedState(page);
      const s = await saved(page);
      if (s.choice) break;
      await page
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
    }
    let s = await saved(page);
    assert.match(s.choice.title, /Choose the stage 2 quest card/);
    await page.locator(`${panel} [data-stage2='']`).waitFor();
    await checkpoint("choose-stage-2", width);
    s = await choose(page, EK.wayUp);
    s = await choose(page, "random");
    assert.match(s.choice.title, /Choose encounter set 1 of 7/);
    await checkpoint("choose-encounter-sets", width);
    s = await choose(page, "set:15");
    s = await choose(page, "random");
    await checkpoint("choose-sets-done", width);
    // Every quest card, front and back.
    for (const q of EK_QUESTS) {
      const t = base(1);
      atQuest(t, q.code);
      await load(page, t);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${q.back_name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint(`quest-${q.back_name.replaceAll('"', "")}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${q.back_name.replaceAll('"', "")}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Dark Pit's travel: the opposing team's search of the top 5 cards.
    const travel = base(2);
    const darkPit = pit(travel);
    travel.encounterDeck = [
      EK.hobgoblin,
      EK.greatBridge,
      EK.mithril,
      EK.mithril,
    ];
    travel.phase = "travel";
    await load(page, travel);
    await page.locator(`${panel} [data-pit='staging']`).waitFor();
    await checkpoint("dark-pit", width);
    s = await travelTo(darkPit.id);
    assert.match(
      s.choice.title,
      /^Dark Pit · The opposing team chooses a card with cost 2 or less/,
    );
    await checkpoint("dark-pit-search", width);
    s = await choose(page, EK.hobgoblin);
    await page.locator(`${panel} [data-pit='active']`).waitFor();
    // Explored: each player searches the top 5 cards of his deck.
    const flip = base(1);
    pit(flip);
    flip.staging = flip.staging.filter((u) => u.code !== EK.pit);
    flip.deck = ["01013", "01016", "01017", "01020", "01021", "01022"];
    flip.queue.push(fx("ekPitFlip", { code: EK.pit, player: 0 }));
    flush(flip);
    await load(page, flip);
    s = await saved(page);
    assert.match(
      s.choice.title,
      /^Out of the Depths · Search the top 5 cards of your deck/,
    );
    await page.locator(`${panel} [data-bane='aside']`).waitFor();
    await checkpoint("out-of-the-depths-search", width);
    s = await choose(page, "01017");
    // Old One Lair: the enemy with a resource keeps progress off the stage.
    const lair = base(1);
    baneAside(lair);
    atQuest(lair, EK.lair);
    lair.escapeKhazad.defeated = [EK.depths];
    lair.encounterDeck = [EK.hobgoblin, EK.mithril];
    lair.queue.push(fx("ekLair", { player: 0 }));
    flush(lair);
    await load(page, lair);
    s = await saved(page);
    assert.match(
      s.choice.title,
      /^Old One Lair · The opposing team adds an enemy/,
    );
    await checkpoint("old-one-lair", width);
    s = await choose(page, EK.hobgoblin);
    await page.locator(`${panel} [data-lair='1']`).waitFor();
    // Goblin Dungeon guards an ally; Nameless Thing holds a player card.
    const guard = base(1);
    baneAside(guard);
    atQuest(guard, EK.wayUp);
    guard.escapeKhazad.defeated = [EK.depths];
    const dungeon = stage(guard, EK.dungeon);
    const thing = stage(guard, EK.nameless);
    guard.escapeKhazad.dungeon = [
      {
        locationId: dungeon.id,
        player: 0,
        ally: { ...thing, id: "guarded-ally", code: "01013", owner: 0 },
      },
    ];
    guard.escapeKhazad.nameless = [
      { enemyId: thing.id, player: 0, code: "01019" },
    ];
    await load(page, guard);
    await page.locator(`${panel} [data-dungeon='1']`).waitFor();
    await page.locator(`${panel} [data-nameless='1']`).waitFor();
    await checkpoint("goblin-dungeon-nameless-thing", width);
    // The Bridge of Khazad-dûm: Durin's Bane attacks; damage goes onto the stage.
    const bridge = base(1);
    bane(bridge);
    atQuest(bridge, EK.bridge);
    bridge.escapeKhazad.defeated = [EK.depths, EK.lair];
    bridge.escapeKhazad.bridgeDamage = 3;
    bridge.encounterDeck = [EK.mithril, EK.mithril];
    bridge.phase = "quest";
    bridge.queue.push(fx("ekBridgeAttack", { player: 0 }));
    flush(bridge);
    await load(page, bridge);
    s = await saved(page);
    assert.match(s.choice.title, /^Durin's Bane · Immediate attack/);
    await page.locator(`${panel} [data-bridge-damage='3']`).waitFor();
    await checkpoint("the-bridge-of-khazad-dum", width);
    s = await choose(page, "undefended");
    assert.equal(s.status, "lost");
    // Last Lord of Moria, defeated once Durin's Bane leaves play: the players win.
    const won = base(1);
    atQuest(won, EK.lastLord);
    won.escapeKhazad.defeated = [EK.depths, EK.lair];
    won.escapeKhazad.box.splice(won.escapeKhazad.box.indexOf(EK.pit), 1);
    won.victoryCards = [EK.bane];
    won.victory = 5;
    won.progress = 15;
    check(won);
    flush(won);
    assert.equal(won.status, "won");
    assert.equal(escapeKhazadPublicState(won).bane, "victory");
    await load(page, won);
    await checkpoint("players-win", width);
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
    `Escape from Khazad-dûm browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
