import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { STARTERS, card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, engage } from "../src/game/board.ts";
import { forOwner } from "../src/game/table.ts";
import { MOUNTAIN_FIRE_FRODO } from "../src/game/lotr-saga-codes.ts";
import {
  MD,
  MD_GASP_PROGRESS,
  MOUNT_DOOM_HOOKS,
  MOUNT_DOOM_QUESTS,
  MOUNT_DOOM_RECIPES,
} from "../src/game/mount-doom.ts";
import {
  activate,
  allies,
  base,
  created,
  doom,
  engaged,
  frodo,
  ring,
  settle,
  stage,
} from "../tests/mount-doom-fixtures.ts";
import { applyAction, createGame } from "../src/game/engine.ts";
import { make } from "../src/game/core.ts";
import { epicTeams } from "../src/game/epic.ts";
import { ME } from "../src/game/mof-epic-support.ts";
import { BG } from "../src/game/black-gate-support.ts";
import { autoplay } from "../tests/nightmare-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  next,
  opening,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";
const art = [
  ...JSON.parse(
    await fs.readFile(
      new URL("../tests/mount-doom-art.json", import.meta.url),
      "utf8",
    ),
  ),
  // The Mountain of Fire's epic multiplayer cards.
  ...JSON.parse(
    await fs.readFile(
      new URL("../tests/mof-epic-art.json", import.meta.url),
      "utf8",
    ),
  ),
];
/** The Mountain of Fire's epic mode: two teams of two, set up and played up to a condition. */
function epicGame(until) {
  let s = createGame(
    41,
    STARTERS[0].cards,
    STARTERS[0].heroes,
    STARTERS[0].id,
    {
      scenarioId: "the-black-gate-opens",
      epic: [0, 1].map(() =>
        STARTERS.slice(0, 2).map((d) => ({
          deckId: d.id,
          heroes: [...d.heroes],
        })),
      ),
    },
  );
  for (let n = 0; n < 800 && s.status === "playing" && !until(s); n++)
    s = autoplay(s, 1);
  assert.equal(s.status, "playing");
  return s;
}
const epicPlanning = (s) =>
  s.round === 1 &&
  s.epicTeam === 0 &&
  s.phase === "planning" &&
  !s.choice &&
  !s.flow?.pending;
/** Each team in its planning phase of the same round, nothing queued. */
function quietEpic(s) {
  for (const t of epicTeams(s))
    Object.assign(t, {
      round: s.round,
      phase: "planning",
      queue: [],
      choice: null,
      combat: null,
      suspendedCombats: [],
      stageRevealing: false,
    });
  s.epic.held = [];
  s.epic.pass = [];
  return s;
}
const epicPanel = "[data-scenario-panel='mof-epic']";
const dir = "output/mount-doom-browser";
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
const panel = "[data-scenario-panel='mount-doom']";
const GUARD = "01013";
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
  while (s.choice && /^Revealed · /.test(s.choice.title))
    s = applyAction(s, { type: "CHOOSE", id: "resolve" });
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
const travel = (s, u) => {
  s.phase = "travel";
  return applyAction(s, { type: "TRAVEL", id: u.id });
};
/** Commit heroes to the current Fortitude test and discard its cards. */
const commit = (s, heroes = []) => {
  for (const u of heroes) s = applyAction(s, { type: "CHOOSE", id: u.id });
  return applyAction(s, { type: "CHOOSE", id: "done" });
};
/** A hero of the first player other than Frodo. */
const hero = (s) => s.heroes.find((h) => h.code !== MOUNTAIN_FIRE_FRODO);
const panelState = async (attrs) =>
  page
    .locator(
      `${panel} ${Object.entries(attrs)
        .map(([k, v]) => `[data-${k}='${v}']`)
        .join(" ~ ")}`,
    )
    .waitFor();
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
          await fresh(page, "mount-doom", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const q = s.mountDoom;
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...(s.victoryCards ?? []),
            ...q.resolving.map((u) => u.code),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.heroes
                .filter((u) => u.code === MOUNTAIN_FIRE_FRODO)
                .map((u) => u.code),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...[
              ...s.staging,
              ...seats.flatMap((p) => [...p.engaged, ...p.heroes, ...p.allies]),
              ...(s.activeLocation ? [s.activeLocation] : []),
            ].flatMap((u) => [
              ...u.attachments
                .filter(
                  (a) =>
                    card(a.code).type_code === "objective" ||
                    card(a.code).sphere_code === "encounter",
                )
                .map((a) => a.code),
              ...u.shadows,
            ]),
            ...MOUNT_DOOM_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            MOUNT_DOOM_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.equal(q.currentQuest, MD.land);
          assert.ok(q.ready);
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].heroes.some((h) => h.code === MOUNTAIN_FIRE_FRODO),
            "the first player controls the Ring-bearer",
          );
          assert.equal(
            s.staging.filter((u) => card(u.code).type_code === "location")
              .length,
            1 + players,
            "Mount Doom and a different location for each player",
          );
          assert.deepEqual((await resume(page)).mountDoom, s.mountDoom);
          await panelState({ stage: 1, failed: 0, doom: "staging" });
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The printed quest cards, both sides.
    for (const [i, quest] of MOUNT_DOOM_QUESTS.map((q, i) => [i + 1, q])) {
      const s = base(1, i);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(quest.code).back_name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint(`quest-${i}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${i}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // 1A: Brake of Thorns' damage at setup, then the searches.
    let setup = created(2, false, 711);
    assert.match(setup.choice.title, /^Brake of Thorns · Assign damage/);
    await load(page, setup);
    await checkpoint("setup-brake", width);
    while (setup.choice && /^Brake of Thorns/.test(setup.choice.title))
      setup = applyAction(setup, {
        type: "CHOOSE",
        id: setup.choice.options[0].id,
      });
    assert.match(setup.choice.title, /^The Land of Mordor · Search/);
    await load(page, setup);
    await checkpoint("setup-search", width);
    // A Fortitude test: committing heroes, then the action window.
    let test = base(1);
    test.encounterDeck = [MD.master, MD.eye, ...Array(6).fill(MD.plain)];
    test = pastReveal(reveal(test, MD.eye));
    assert.match(test.choice.title, /^Fortitude test · Commit heroes/);
    await load(page, test);
    await checkpoint("fortitude-commit", width);
    test = commit(test, [hero(test)]);
    assert.equal(test.hideTest.phase, "actions");
    await load(page, test);
    await page
      .locator("[data-test-kind='fortitude'][data-hide-test='actions']")
      .waitFor();
    await checkpoint("fortitude-actions", width);
    // Gollum discarded during a test: engaged with the first player, and a card's icons ignored.
    let gollum = base(1);
    gollum.encounterDeck = [
      MD.gollum,
      MD.master,
      MD.eye,
      ...Array(6).fill(MD.plain),
    ];
    gollum.threat = 30;
    gollum = run(gollum, fx("hideFortitude", { player: 0, code: MD.eye }));
    gollum = commit(gollum);
    assert.match(gollum.choice.title, /^Gollum · Choose an encounter card/);
    await load(page, gollum);
    await checkpoint("fortitude-gollum", width);
    // 2A: Mordor Road joins the staging area and the players travel there.
    let road = base(2, 1);
    activate(road, MD.plain);
    road.encounterDeck = [MD.uruk, MD.plain, MD.mordorRoad, MD.plain];
    road.progress = 12;
    check(road);
    road = settle(run(road));
    assert.equal(road.activeLocation.code, MD.mordorRoad);
    await load(page, road);
    await panelState({ stage: 2, failed: 0 });
    await checkpoint("road-2a", width);
    // 2B: the Fortitude test after progress from a successful quest.
    let road2 = base(2, 2);
    road2.encounterDeck = Array(10).fill(MD.plain);
    MOUNT_DOOM_HOOKS.successfulQuestProgress(road2, 3);
    flush(road2);
    road2 = commit(road2, [hero(road2)]);
    road2 = applyAction(road2, { type: "RESOLVE_HIDE" });
    assert.equal(road2.mountDoom.resources, 1);
    await load(page, road2);
    await panelState({ stage: 2, failed: 0, resources: 1 });
    await checkpoint("road-2b-resource", width);
    // 3A: a location for each player.
    let gasp = base(2, 2);
    gasp.mountDoom.resources = 2;
    gasp.encounterDeck = [MD.plain, MD.hold, MD.uruk, MD.water];
    MOUNT_DOOM_HOOKS.endQuest(gasp);
    gasp = settle(run(gasp));
    assert.equal(gasp.stage, 3);
    await load(page, gasp);
    await panelState({ stage: 3 });
    await checkpoint("gasp-3a", width);
    // 3B: the first player fails the quest-phase test: no more than 5 progress.
    let capped = base(1, 3);
    capped.encounterDeck = [MD.master, MD.eye, ...Array(6).fill(MD.plain)];
    capped = run(capped, ...MOUNT_DOOM_HOOKS.questBegin(capped));
    capped = applyAction(commit(capped), { type: "RESOLVE_HIDE" });
    await load(page, capped);
    await page.locator(`${panel} [data-capped]`).waitFor();
    await checkpoint("gasp-capped", width);
    // The travel to Mount Doom: each player's test, then 4A.
    let climb = base(1, 3);
    climb.progress = MD_GASP_PROGRESS;
    climb.encounterDeck = [MD.plain, MD.plain, MD.captain, MD.plain, MD.plain];
    climb = travel(climb, doom(climb));
    assert.match(climb.choice.title, /^Fortitude test · Commit heroes/);
    await load(page, climb);
    await checkpoint("mount-doom-travel", width);
    climb = settle(commit(climb, [hero(climb)]));
    assert.equal(climb.stage, 4);
    await load(page, climb);
    await panelState({ stage: 4 });
    await checkpoint("crack-4a", width);
    // 4B: the last test wins or loses the game.
    let won = base(1, 4);
    won.encounterDeck = Array(10).fill(MD.plain);
    MOUNT_DOOM_HOOKS.explored(won, doom(won), true);
    flush(won);
    won = applyAction(commit(won, [hero(won)]), { type: "RESOLVE_HIDE" });
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("crack-won", width);
    let lost = base(1, 4);
    lost.encounterDeck = [MD.master, MD.eye, ...Array(8).fill(MD.plain)];
    MOUNT_DOOM_HOOKS.explored(lost, doom(lost), true);
    flush(lost);
    lost = applyAction(commit(lost, [hero(lost)]), { type: "RESOLVE_HIDE" });
    assert.equal(lost.status, "lost");
    assert.match(lost.reason, /claims The One Ring/);
    await load(page, lost);
    await checkpoint("crack-lost", width);
    // Locations: Orc-hold, Plain of Gorgoroth, Brake of Thorns, Old Water-course.
    let hold = base(1);
    const holdUnit = stage(hold, MD.hold);
    hold.encounterDeck = [MD.plain, MD.snuffler, MD.plain];
    hold = settle(travel(hold, holdUnit));
    assert.ok(hold.engaged.some((u) => u.code === MD.snuffler));
    await load(page, hold);
    await checkpoint("orc-hold", width);
    let plain = base(2);
    const plainUnit = stage(plain, MD.plain);
    plain.encounterDeck = Array(6).fill(MD.plain);
    plain = travel(plain, plainUnit);
    assert.match(plain.choice.title, /^Fortitude test · Commit heroes/);
    await load(page, plain);
    await checkpoint("plain-of-gorgoroth", width);
    let brake = base(1);
    brake.threat = 34;
    const brakeUnit = stage(brake, MD.brake);
    brake = travel(brake, brakeUnit);
    assert.match(brake.choice.title, /^Brake of Thorns · Assign damage/);
    await load(page, brake);
    await checkpoint("brake-of-thorns", width);
    let water = base(1);
    const waterUnit = stage(water, MD.water);
    water = settle(travel(water, waterUnit));
    water.threat = 40;
    MOUNT_DOOM_HOOKS.explored(water, water.activeLocation, true);
    flush(water);
    assert.match(water.choice.title, /^Old Water-course · Response/);
    await load(page, water);
    await checkpoint("old-water-course", width);
    // Enemies: Gollum, Ringwraith of Sauron, Orc Captain, Big Uruk, Little Snuffler.
    let gollum2 = base(2);
    gollum2.encounterDeck = Array(6).fill(MD.plain);
    gollum2 = settle(reveal(gollum2, MD.gollum, 1));
    await load(page, gollum2);
    await panelState({ stage: 1, gollum: "engaged" });
    await checkpoint("gollum-engaged", width);
    let wraith = base(1);
    stage(wraith, MD.wraith);
    wraith.encounterDeck = [MD.master, MD.plain, MD.plain, MD.plain];
    wraith = run(wraith, fx("hideFortitude", { player: 0, code: MD.captain }));
    wraith = applyAction(commit(wraith), { type: "RESOLVE_HIDE" });
    assert.match(wraith.choice?.title ?? "", /Immediate attack/i);
    await load(page, wraith);
    await panelState({ stage: 1, failed: 1 });
    await checkpoint("ringwraith-of-sauron", width);
    let captain = base(1);
    const captainUnit = stage(captain, MD.captain);
    captain.encounterDeck = Array(6).fill(MD.plain);
    forOwner(captain, 0, () => engage(captain, captainUnit));
    flush(captain);
    assert.match(captain.choice.title, /^Fortitude test · Commit heroes/);
    await load(page, captain);
    await checkpoint("orc-captain", width);
    let uruk = base(1);
    const urukUnit = stage(uruk, MD.uruk);
    forOwner(uruk, 0, () => engage(uruk, urukUnit));
    flush(uruk);
    assert.match(uruk.choice.title, /^Big Uruk · Choose one/);
    await load(page, uruk);
    await checkpoint("big-uruk", width);
    let snuffler = base(1);
    allies(snuffler, [GUARD]);
    snuffler.encounterDeck = Array(6).fill(MD.plain);
    snuffler = pastReveal(reveal(snuffler, MD.snuffler));
    assert.match(snuffler.choice.title, /^Little Snuffler · Choose one/);
    await load(page, snuffler);
    await checkpoint("little-snuffler", width);
    // Treacheries: “Wicked Master!”, Foul Fumes, Heavy and Tired.
    let master = base(1);
    engaged(master, MD.gollum);
    master.encounterDeck = Array(6).fill(MD.plain);
    master = pastReveal(reveal(master, MD.master));
    assert.match(master.choice?.title ?? "", /Immediate attack/i);
    await load(page, master);
    await checkpoint("wicked-master", width);
    let fumes = base(1);
    allies(fumes, [GUARD]);
    fumes.encounterDeck = [MD.master, MD.plain, ...Array(6).fill(MD.plain)];
    fumes = pastReveal(reveal(fumes, MD.fumes));
    fumes = settle(applyAction(commit(fumes), { type: "RESOLVE_HIDE" }));
    assert.ok(fumes.allies.every((u) => u.blanked));
    await load(page, fumes);
    await checkpoint("foul-fumes", width);
    let heavy = base(1);
    heavy.encounterDeck = Array(6).fill(MD.plain);
    heavy = settle(reveal(heavy, MD.heavy));
    assert.ok(frodo(heavy).attachments.some((a) => a.code === MD.heavy));
    assert.ok(ring(heavy));
    await load(page, heavy);
    await checkpoint("heavy-and-tired", width);
    // Foul Fumes' shadow after a failed test: the attack is undefended.
    let shadow = base(1);
    shadow.mountDoom.failed = { round: shadow.round, players: [0] };
    const enemy = engaged(shadow, MD.snuffler);
    shadow = defend(shadow, enemy, hero(shadow), [MD.fumes]);
    await load(page, shadow);
    await checkpoint("foul-fumes-shadow", width);
    // The Mountain of Fire's epic multiplayer mode.
    if (width === 1280) {
      // The lobby's switch on a hot-seat table: two teams of two players.
      await fresh(page, "the-black-gate-opens", 2, false);
      await page.locator(".epic-toggle input").setChecked(true);
      await page.locator("#start-btn").click();
      let e = await opening(page);
      assert.equal(e.epic.kind, "mountain-of-fire");
      assert.deepEqual(
        [e, e.epic.teams[1]].map((t) => [t.scenarioId, t.table.seats.length]),
        [
          ["the-black-gate-opens", 2],
          ["mount-doom", 2],
        ],
      );
      await page
        .getByText("Epic multiplayer mode · The Black Gate Opens team", {
          exact: true,
        })
        .waitFor();
      await page.locator(`${epicPanel} [data-eye='doom']`).waitFor();
      await page
        .locator(`${epicPanel} li[data-epic-scenario='0'][aria-current='true']`)
        .waitFor();
      await page.locator(`${epicPanel} li[data-epic-scenario='1']`).waitFor();
      assert.equal((await resume(page)).epic.kind, "mountain-of-fire");
      await checkpoint("epic-gate-team", width);
      // The Black Gate Opens' round ends on the table: Mount Doom's turn.
      const refresh = epicGame(
        (s) =>
          s.round === 1 &&
          s.epicTeam === 0 &&
          s.phase === "refresh" &&
          !s.choice &&
          !s.flow?.pending,
      );
      await load(page, refresh);
      await next(page);
      e = await saved(page);
      assert.equal(e.epicTeam, 1);
      assert.deepEqual(e.epic.held, [0]);
      await page
        .getByText("Epic multiplayer mode · Mount Doom team", { exact: true })
        .waitFor();
      await page
        .locator(`${epicPanel} li[data-epic-scenario='1'][aria-current='true']`)
        .waitFor();
      await checkpoint("epic-doom-team", width);
      // The Eye of Sauron's Forced effect at The Black Gate Opens.
      const eye = quietEpic(epicGame(epicPlanning));
      const doomTeam = epicTeams(eye)[1];
      doomTeam.staging = doomTeam.staging.filter((u) => u.code !== ME.eyeDoom);
      eye.staging.push(make(eye, ME.eyeGate), make(eye, BG.nazgul));
      run(eye, fx("meEye", { player: 0 }));
      assert.match(eye.choice.title, /^The Eye of Sauron · /);
      await load(page, eye);
      await checkpoint("epic-eye-choice", width);
      const moved = await choose(page, "move");
      assert.ok(moved.epic.teams[1].staging.some((u) => u.code === ME.eyeDoom));
      assert.ok(moved.epic.teams[1].staging.some((u) => u.code === BG.nazgul));
      await page.locator(`${epicPanel} [data-eye='doom']`).waitFor();
    }
    // The Eye of Sauron at The Black Gate Opens, after In Darkness Bind Them.
    const bound = quietEpic(epicGame(epicPlanning));
    const doomSide = epicTeams(bound)[1];
    doomSide.staging = doomSide.staging.filter((u) => u.code !== ME.eyeDoom);
    bound.staging.push(make(bound, ME.eyeGate));
    bound.epicBound = bound.round;
    await load(page, bound);
    await page.locator(`${epicPanel} [data-eye='gate']`).waitFor();
    await page.locator(`${epicPanel} [data-bound='true']`).waitFor();
    await checkpoint("epic-eye-gate", width);
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
    `Mount Doom browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
