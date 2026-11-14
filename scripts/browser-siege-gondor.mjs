import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, progressLocation } from "../src/game/board.ts";
import {
  FLAME_WEST_ARAGORN,
  fellowshipAragorn,
} from "../src/game/lotr-saga.ts";
import {
  SG,
  SIEGE_GONDOR_HOOKS,
  SIEGE_GONDOR_QUESTS,
  SIEGE_GONDOR_RECIPES,
} from "../src/game/siege-gondor.ts";
import {
  activate,
  allies,
  base,
  created,
  engaged,
  fleet,
  stage,
} from "../tests/siege-gondor-fixtures.ts";
import { applyAction } from "../src/game/engine.ts";
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
    new URL("../tests/siege-gondor-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/siege-gondor-browser";
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
const panel = "[data-scenario-panel='the-siege-of-gondor']";
const run = (s, ...effects) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s, code, player = 0) => {
  s.phase = "staging";
  s.encounterDeck.unshift(code);
  return run(s, fx("reveal", { player }));
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
/** An engaged enemy attacks with the given facedown shadow cards. */
const defend = (s, enemy, defender, shadows = []) => {
  s.phase = "defense";
  s.combat = null;
  enemy.shadows = [...shadows];
  enemy.faceupShadows = shadows.map(() => false);
  return applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
};
/** Decline other decisions (player responses) until the one matching. */
const until = (s, title) => {
  for (let n = 0; s.choice && !title.test(s.choice.title); n++) {
    assert.ok(n < 20, s.choice.title);
    s = applyAction(s, {
      type: "CHOOSE",
      id: (s.choice.options.find((o) => o.id === "skip") ?? s.choice.options[0])
        .id,
    });
  }
  assert.match(s.choice?.title ?? "", title);
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
          await fresh(page, "the-siege-of-gondor", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const q = s.siegeGondor;
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...(s.victoryCards ?? []),
            ...q.setAside,
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.heroes
                .filter((u) => u.code === FLAME_WEST_ARAGORN)
                .map((u) => u.code),
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
            ...SIEGE_GONDOR_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            SIEGE_GONDOR_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.ok(s.staging.some((u) => u.code === SG.fleet));
          assert.ok(s.staging.some((u) => u.code === SG.greatShip));
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].heroes.some((h) => h.code === FLAME_WEST_ARAGORN),
            "the first player controls the Fellowship Aragorn",
          );
          assert.deepEqual((await resume(page)).siegeGondor, s.siegeGondor);
          await page
            .locator(`${panel} [data-stage='1'] ~ [data-fleet]`)
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The printed quest card, both sides.
    {
      const code = SIEGE_GONDOR_QUESTS[0].code;
      const s = base(1);
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
      await checkpoint("quest-1-front", width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint("quest-1-back", width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Setup: each player searches the encounter deck for a Ship location.
    const setup = created(2, false, 705);
    assert.match(
      setup.choice.title,
      /^Attack on Pelargir · Search the encounter deck for a Ship location/,
    );
    await load(page, setup);
    await checkpoint("ship-search", width);
    // The Corsair Fleet at the beginning of the staging step.
    let fleetTurn = base(2);
    fleet(fleetTurn).resources = 2;
    fleetTurn.phase = "quest";
    fleetTurn = applyAction(fleetTurn, { type: "COMMIT" });
    fleetTurn = applyAction(fleetTurn, { type: "COMMIT" });
    fleetTurn = until(fleetTurn, /^The Corsair Fleet · Choose one/);
    await load(page, fleetTurn);
    await page.locator(`${panel} [data-fleet='3']`).waitFor();
    await checkpoint("corsair-fleet", width);
    // Great Corsair Ship: each player searches for a Corsair enemy.
    let ship = base(2);
    const great = ship.staging.find((u) => u.code === SG.greatShip);
    ship.victoryCards = [SG.galley, SG.dromon, SG.dromon];
    ship.phase = "travel";
    ship.encounterDeck = [SG.corsair, SG.captain, SG.pirate];
    ship = applyAction(ship, { type: "TRAVEL", id: great.id });
    assert.match(
      ship.choice.title,
      /^Great Corsair Ship · Search for a Corsair enemy/,
    );
    // The travel cost is paid while the Ship is still in the staging area.
    await load(page, ship);
    await page
      .locator(`${panel} [data-ships='3'][data-great-ship='staging']`)
      .waitFor();
    await checkpoint("great-corsair-ship", width);
    ship = applyAction(ship, { type: "CHOOSE", id: `deck-${SG.corsair}` });
    assert.deepEqual(
      ship.choice.options.map((o) => o.id),
      [`deck-${SG.captain}`],
    );
    ship = applyAction(ship, { type: "CHOOSE", id: `deck-${SG.captain}` });
    assert.equal(ship.activeLocation?.code, SG.greatShip);
    await load(page, ship);
    await page.locator(`${panel} [data-great-ship='active']`).waitFor();
    await checkpoint("great-ship-active", width);
    // Corsair Dromon: Archery 1 for each Corsair enemy in the staging area.
    const dromon = base(1);
    stage(dromon, SG.corsair);
    stage(dromon, SG.pirate);
    activate(dromon, SG.dromon);
    SIEGE_GONDOR_HOOKS.combatBegin(dromon);
    flush(dromon);
    assert.match(dromon.choice.title, /^Assign Archery damage · 2 remaining/);
    await load(page, dromon);
    await checkpoint("corsair-dromon-archery", width);
    // Port of Pelargir and Pelargir Quays in the panel.
    const city = base(2);
    stage(city, SG.port);
    const quays = stage(city, SG.quays);
    quays.damage = 3;
    await load(page, city);
    await page.locator(`${panel} [data-port='true']`).waitFor();
    await page.locator(`${panel} [data-quays='3']`).waitFor();
    await checkpoint("pelargir-city", width);
    // Pelargir Quays is discarded at 4 damage tokens: 4 damage among characters.
    const docks = base(2);
    stage(docks, SG.quays).damage = 3;
    run(docks, fx("sgQuays", { target: docks.staging.at(-1).id, player: 0 }));
    assert.match(docks.choice.title, /^Pelargir Quays · Assign damage · 4/);
    await load(page, docks);
    await checkpoint("pelargir-quays", width);
    // Fell Folk of Umbar (Peril): return the Corsairs or engage another.
    const fell = base(1);
    engaged(fell, SG.corsair);
    fell.encounterDeck = [SG.port, SG.crew];
    pastReveal(reveal(fell, SG.fellFolk));
    assert.match(fell.choice.title, /^Fell Folk of Umbar · Choose one/);
    await load(page, fell);
    await checkpoint("fell-folk", width);
    // Black Sails: a Ship location from the deck or discard pile.
    const sails = base(1);
    sails.encounterDeck = [SG.port, SG.galley];
    sails.encounterDiscard = [SG.dromon];
    pastReveal(reveal(sails, SG.sails));
    assert.match(
      sails.choice.title,
      /^Black Sails · Search for a Ship location/,
    );
    await load(page, sails);
    await checkpoint("black-sails", width);
    // Raiding the Coasts: 3 threat or the highest cost attachment.
    const raid = base(1);
    raid.heroes
      .find((h) => h.code !== FLAME_WEST_ARAGORN)
      .attachments.push({
        id: "blade-b",
        code: "01039",
        exhausted: false,
        owner: 0,
      });
    pastReveal(reveal(raid, SG.raiding));
    assert.match(raid.choice.title, /^Raiding the Coasts · Choose one/);
    await load(page, raid);
    await checkpoint("raiding-the-coasts", width);
    // Driven to the Brink (Peril): end the quest phase or X damage.
    let brink = base(1);
    fleet(brink).resources = 1;
    const quester = brink.heroes.find((h) => h.code !== FLAME_WEST_ARAGORN);
    brink.phase = "quest";
    brink = applyAction(brink, { type: "TOGGLE_QUEST", id: quester.id });
    brink = applyAction(brink, { type: "COMMIT" });
    brink = until(brink, /^The Corsair Fleet · Choose one/);
    brink.encounterDeck = [SG.brink, SG.corsair];
    brink = applyAction(brink, { type: "CHOOSE", id: "reveal" });
    brink = pastReveal(brink);
    assert.match(brink.choice.title, /^Driven to the Brink · Choose one/);
    await load(page, brink);
    await checkpoint("driven-to-the-brink", width);
    // Umbar Pirate Crew's shadow: the attacker returns to the staging area.
    let crew = base(1);
    const [scout] = allies(crew, ["01016"]);
    const pirate = engaged(crew, SG.pirate);
    activate(crew, SG.galley);
    crew = defend(crew, pirate, scout, [SG.crew]);
    while (crew.choice)
      crew = applyAction(crew, {
        type: "CHOOSE",
        id: (
          crew.choice.options.find((o) => ["skip", "resolve"].includes(o.id)) ??
          crew.choice.options[0]
        ).id,
      });
    assert.ok(crew.staging.some((u) => u.id === pirate.id));
    await load(page, crew);
    await checkpoint("pirate-crew-shadow", width);
    // Victory: Great Corsair Ship is explored with 20 progress on the stage.
    const won = base(1);
    const greatShip = won.staging.find((u) => u.code === SG.greatShip);
    won.staging = won.staging.filter((u) => u.id !== greatShip.id);
    won.activeLocation = greatShip;
    won.progress = 20;
    won.phase = "quest";
    progressLocation(won, greatShip, 5);
    flush(won);
    check(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("great-ship-taken", width);
    // Defeat: Aragorn leaves play.
    const lost = base(1);
    const aragorn = fellowshipAragorn(lost);
    aragorn.damage = card(FLAME_WEST_ARAGORN).health - 1;
    lost.queue.push(fx("damage", { target: aragorn.id, value: 1, player: 0 }));
    flush(lost);
    while (lost.choice && lost.status === "playing") {
      lost.choice = null;
      flush(lost);
    }
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("aragorn-falls", width);
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
    `The Siege of Gondor browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
