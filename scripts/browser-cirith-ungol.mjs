import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, destroy, engage, progressLocation } from "../src/game/board.ts";
import { firstPlayer, seatView } from "../src/game/table.ts";
import {
  MOUNTAIN_FIRE_FRODO,
  MOUNTAIN_FIRE_ONE_RING,
} from "../src/game/lotr-saga.ts";
import {
  CU,
  CU_CHAMBER_PROGRESS,
  CU_ESCAPE_PROGRESS,
  CIRITH_UNGOL_QUESTS,
  CIRITH_UNGOL_RECIPES,
} from "../src/game/cirith-ungol.ts";
import {
  FILLER,
  allies,
  base,
  created,
  engaged,
  flipped,
  frodo,
  hand,
  host,
  settle,
  stage,
  watchers,
} from "../tests/cirith-ungol-fixtures.ts";
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
    new URL("../tests/cirith-ungol-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/cirith-ungol-browser";
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
const panel = "[data-scenario-panel='the-tower-of-cirith-ungol']";
const GUARD = "01013",
  BLADE = "01039";
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
/** A hero of the first player without Last of the Company. */
const hero = (s) =>
  s.heroes.find((h) => !h.attachments.some((a) => a.code === CU.company));
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
          await fresh(page, "the-tower-of-cirith-ungol", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const q = s.cirithUngol;
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...(s.victoryCards ?? []),
            ...q.setAside,
            ...q.resolving.map((u) => u.code),
            ...(q.captive ? [q.captive.code] : []),
            ...(q.company ? [q.company.code] : []),
            ...(q.ring ? [q.ring.code] : []),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.heroes
                .filter((u) => u.code === MOUNTAIN_FIRE_FRODO)
                .map((u) => u.code),
            ),
            ...seats.flatMap((p) =>
              p.heroes.flatMap((u) =>
                u.attachments
                  .filter((a) =>
                    [CU.company, MOUNTAIN_FIRE_ONE_RING].includes(a.code),
                  )
                  .map((a) => a.code),
              ),
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
            ...CIRITH_UNGOL_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            CIRITH_UNGOL_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.equal(q.captive?.code, MOUNTAIN_FIRE_FRODO);
          assert.ok(q.setAside.includes(CU.shagrat));
          assert.equal(q.ringPlaced, true);
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].heroes.some((h) =>
              h.attachments.some((a) => a.code === CU.company),
            ),
            "the first player's hero carries Last of the Company",
          );
          assert.deepEqual((await resume(page)).cirithUngol, s.cirithUngol);
          await panelState({
            stage: 1,
            watchers: "location",
            captive: "true",
            chamber: "play",
            shagrat: "set-aside",
          });
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The printed quest cards, both sides.
    for (const [i, quest] of [
      [1, CIRITH_UNGOL_QUESTS[0]],
      [3, CIRITH_UNGOL_QUESTS[2]],
    ]) {
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
    // Setup: the first player attaches Last of the Company and The One Ring.
    const company = created(2, false, 611);
    assert.match(
      company.choice.title,
      /^Pass the Two Watchers · Attach Last of the Company and The One Ring to a hero/,
    );
    await load(page, company);
    await checkpoint("last-of-the-company-setup", width);
    // 1B: The Two Watchers waits as a location; non-unique locations stay.
    const pass = base(2, 1);
    stage(pass, CU.passage);
    await load(page, pass);
    await panelState({ stage: 1, watchers: "location", captive: "true" });
    await checkpoint("pass-the-two-watchers", width);
    // Travelling to The Two Watchers flips it to its enemy side.
    let flip = base(2, 1);
    flip = settle(travel(flip, watchers(flip)));
    assert.equal(watchers(flip).code, CU.watchersEnemy);
    await load(page, flip);
    await panelState({ stage: 1, watchers: "enemy" });
    await checkpoint("watchers-flipped", width);
    // Its attack raises the defending player's threat instead of damage.
    let attack = base(1, 1);
    const enemy = flipped(attack);
    attack = settle(defend(attack, enemy, hero(attack)));
    assert.ok(attack.threat > 20);
    assert.ok(attack.heroes.every((h) => h.damage === 0));
    await load(page, attack);
    await checkpoint("watchers-attack", width);
    // Destroying it defeats 1B: 2A adds one enemy per player.
    let tower = base(2, 1);
    const w = flipped(tower);
    tower.encounterDeck = [CU.orc, CU.passage, CU.archer, CU.passage];
    destroy(tower, w, true);
    check(tower);
    flush(tower);
    tower = settle(tower);
    assert.equal(tower.stage, 2);
    await load(page, tower);
    await panelState({ stage: 2, watchers: "victory", captive: "true" });
    await checkpoint("fighting-in-the-tower", width);
    // 2B: an enemy discarded at the beginning of the quest phase, or its copy.
    let begin = base(1, 2);
    stage(begin, CU.orc);
    begin.encounterDeck = [CU.passage, CU.orc, CU.passage];
    begin = run(begin, fx("cuTowerBegin", { player: 0 }));
    assert.ok(!begin.staging.some((u) => u.code === CU.orc));
    await load(page, begin);
    await checkpoint("tower-copy-discarded", width);
    // Topmost Chamber: 18 progress, Shagrat enters with its Travel cost.
    let chamber = base(2, 2);
    chamber.progress = CU_CHAMBER_PROGRESS;
    chamber = settle(
      travel(
        chamber,
        chamber.staging.find((u) => u.code === CU.chamber),
      ),
    );
    assert.equal(chamber.activeLocation?.code, CU.chamber);
    assert.ok(chamber.staging.some((u) => u.code === CU.shagrat));
    await load(page, chamber);
    await panelState({ stage: 2, captive: "true", shagrat: "out" });
    await checkpoint("topmost-chamber-shagrat", width);
    // Exploring the Chamber frees the Ring-bearer to the first player.
    chamber.encounterDeck = [CU.passage, CU.passage, CU.passage];
    progressLocation(chamber, chamber.activeLocation, 1);
    flush(chamber);
    assert.ok(
      seatView(chamber, firstPlayer(chamber)).heroes.some(
        (h) => h.code === MOUNTAIN_FIRE_FRODO,
      ),
    );
    await load(page, chamber);
    await panelState({ stage: 2, captive: "false", chamber: "victory" });
    await checkpoint("ring-bearer-freed", width);
    // 2B defeated: 3A brings The One Ring to Frodo and the Watchers back.
    check(chamber);
    flush(chamber);
    chamber = settle(chamber);
    assert.equal(chamber.stage, 3);
    assert.equal(host(chamber), undefined);
    await load(page, chamber);
    await panelState({ stage: 3, watchers: "location", captive: "false" });
    await checkpoint("escape-from-cirith-ungol", width);
    // 3B: 12 progress, then The Two Watchers flips with +3 threat and defense.
    let escape = base(1, 3);
    escape.progress = CU_ESCAPE_PROGRESS;
    escape = settle(travel(escape, watchers(escape)));
    assert.equal(watchers(escape).code, CU.watchersEnemy);
    await load(page, escape);
    await panelState({ stage: 3, watchers: "enemy" });
    await checkpoint("escape-watchers-flipped", width);
    // Last of the Company's Action: an enemy gets -X threat this phase.
    let lessen = base(1, 1);
    const target = flipped(lessen);
    const bearer = host(lessen);
    lessen.phase = "quest";
    lessen = applyAction(lessen, {
      type: "ABILITY",
      id: bearer.id,
      attachmentId: bearer.attachments.find((a) => a.code === CU.company).id,
    });
    assert.match(lessen.choice.title, /^Last of the Company · Choose an enemy/);
    await load(page, lessen);
    await checkpoint("last-of-the-company-action", width);
    lessen = applyAction(lessen, { type: "CHOOSE", id: target.id });
    await load(page, lessen);
    await checkpoint("last-of-the-company-lessened", width);
    // Frodo Baggins' Planning Action: a resource for a hero.
    let planning = base(1, 3);
    planning = applyAction(planning, {
      type: "ABILITY",
      id: frodo(planning).id,
    });
    assert.match(
      planning.choice.title,
      /^Frodo Baggins · Add 1 resource to a hero's pool/,
    );
    await load(page, planning);
    await checkpoint("frodo-planning-action", width);
    // Treacheries: Orcish Howls, Drawn to the Ring, Deep Shadows, Evil Vigilance.
    let howls = base(1, 2);
    stage(howls, CU.archer);
    howls = settle(pastReveal(reveal(howls, CU.howls)));
    await load(page, howls);
    await checkpoint("orcish-howls", width);
    let drawn = base(1, 2);
    drawn.encounterDeck = [CU.drawn, CU.passage, CU.soldier, CU.passage];
    drawn.phase = "staging";
    drawn = pastReveal(run(drawn, fx("reveal", { player: 0 })));
    assert.match(drawn.choice.title, /^Drawn to the Ring · Choose one/);
    await load(page, drawn);
    await checkpoint("drawn-to-the-ring", width);
    let deep = base(2, 2);
    hand(deep, [FILLER, FILLER, FILLER], 0);
    deep.encounterDeck = [CU.deep, CU.hall, CU.passage];
    deep.phase = "staging";
    deep = pastReveal(run(deep, fx("reveal", { player: 0 })));
    assert.match(deep.choice.title, /^Deep Shadows · Choose one/);
    await load(page, deep);
    await checkpoint("deep-shadows", width);
    let vigilance = base(1, 2);
    const [guard] = allies(vigilance, [GUARD]);
    guard.committed = true;
    vigilance = pastReveal(reveal(vigilance, CU.vigilance));
    assert.match(vigilance.choice.title, /^Evil Vigilance · Choose one/);
    await load(page, vigilance);
    await checkpoint("evil-vigilance", width);
    // Locations: Winding Stairs, Bloodied Courtyard and Torch-lit Hall.
    let stairs = base(2, 2);
    stairs = travel(stairs, stage(stairs, CU.stairs));
    assert.match(
      stairs.choice.title,
      /^Winding Stairs · Exhaust a character you control/,
    );
    await load(page, stairs);
    await checkpoint("winding-stairs", width);
    let yard = base(2, 2);
    yard = settle(travel(yard, stage(yard, CU.courtyard)));
    yard = settle(pastReveal(reveal(yard, CU.archer)));
    assert.equal(
      yard.staging.find((u) => u.code === CU.archer).damage,
      1,
      "Bloodied Courtyard damages the entering enemy",
    );
    await load(page, yard);
    await checkpoint("bloodied-courtyard", width);
    let hall = base(1, 2);
    hall.encounterDeck = [CU.passage, CU.wounded, CU.passage];
    hall = settle(travel(hall, stage(hall, CU.hall)));
    assert.equal(hall.staging.find((u) => u.code === CU.wounded).damage, 2);
    await load(page, hall);
    await checkpoint("torch-lit-hall", width);
    // Enemies: Gorbag's immediate attack, Shagrat, the Orcish Howls shadow.
    const gorbag = base(1, 2);
    const g = stage(gorbag, CU.gorbag);
    engage(gorbag, g);
    flush(gorbag);
    assert.match(gorbag.choice.title, /^Gorbag · Immediate attack/);
    await load(page, gorbag);
    await checkpoint("gorbag-immediate-attack", width);
    const shagrat = base(1, 2);
    stage(shagrat, CU.shagrat).attachments = [];
    await load(page, shagrat);
    await checkpoint("shagrat", width);
    let redirect = base(1, 2);
    const soldier = engaged(redirect, CU.soldier);
    engaged(redirect, CU.orc);
    redirect = defend(redirect, soldier, hero(redirect), [CU.howls]);
    assert.match(
      redirect.choice.title,
      /^Orcish Howls · Resolve this attack against another enemy/,
    );
    await load(page, redirect);
    await checkpoint("orcish-howls-shadow", width);
    let drawnShadow = base(1, 2);
    const orc = engaged(drawnShadow, CU.orc);
    hero(drawnShadow).attachments.push({
      id: "blade-1",
      code: BLADE,
      exhausted: false,
    });
    drawnShadow = defend(drawnShadow, orc, hero(drawnShadow), [CU.drawn]);
    assert.match(
      drawnShadow.choice.title,
      /^Drawn to the Ring · Discard a non-objective attachment/,
    );
    await load(page, drawnShadow);
    await checkpoint("drawn-to-the-ring-shadow", width);
    // Victory: The Two Watchers destroyed with 12 progress on 3B.
    const won = base(1, 3);
    won.progress = CU_ESCAPE_PROGRESS;
    const last = flipped(won);
    destroy(won, last, true);
    check(won);
    flush(won);
    assert.equal(won.status, "won");
    assert.match(won.reason, /Ring-bearer is free of the tower/);
    await load(page, won);
    await checkpoint("escape-won", width);
    // Defeat: The One Ring leaves play with its hero.
    const lost = base(1, 1);
    destroy(lost, host(lost), false);
    check(lost);
    assert.equal(lost.status, "lost");
    assert.match(lost.reason, /The One Ring has left play/);
    await load(page, lost);
    await checkpoint("one-ring-lost", width);
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
    `The Tower of Cirith Ungol browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
