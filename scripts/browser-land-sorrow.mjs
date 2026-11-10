import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card, playerCards, SCRIPTED } from "../src/game/cards.ts";
import { availableAbilities, createGame } from "../src/game/engine.ts";
import { fx, get, make } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import { forOwner } from "../src/game/table.ts";
import {
  LAND_SORROW_QUESTS,
  LAND_SORROW_RECIPES,
  SORROW as S,
  SORROW_CAMPS,
  SORROW_CAPTIVES,
} from "../src/game/land-sorrow-support.ts";
import { LAND_SORROW_HOOKS as hooks } from "../src/game/land-sorrow.ts";
import { SORROW_PLAYER as P } from "../src/game/land-sorrow-player.ts";
import { base } from "../tests/land-sorrow-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  opening,
  next,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/land-sorrow-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/land-sorrow-browser";
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
const board = (id) => page.locator(`[data-motion-card="${id}"]`);
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function play(id, target) {
  await board(id)
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  if (target)
    await page
      .locator(`.decision-card[data-unit-id="${target}"] .decision-select`)
      .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  await reviewedState(page);
}
function camp(s, code, captive, warden) {
  const u = make(s, code),
    c = make(s, captive);
  u.attachments.push({ id: c.id, code: captive, exhausted: false });
  s.staging.push(u);
  s.landSorrow.camps.push({ location: u.id, code, warden: make(s, warden) });
  return u;
}
const KING_DECK = {
  ...Object.fromEntries(
    playerCards
      .filter(
        (c) =>
          SCRIPTED.has(c.code) &&
          c.type_code === "event" &&
          c.sphere_code === "leadership" &&
          c.deck_limit !== 0,
      )
      .slice(0, 17)
      .map((c) => [c.code, 3]),
  ),
  "01014": 1,
  [P.king]: 1,
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
          await fresh(page, "the-land-of-sorrow", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          const camps = s.staging.filter((u) => SORROW_CAMPS.includes(u.code));
          assert.equal(camps.length, 3);
          assert.equal(s.staging.length, 3 + players - 1);
          assert.deepEqual(
            camps.flatMap((u) => u.attachments.map((a) => a.code)).sort(),
            [...SORROW_CAPTIVES].sort(),
          );
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...s.staging.flatMap((u) => u.attachments.map((a) => a.code)),
            ...s.landSorrow.camps.map((c) => c.warden.code),
            ...LAND_SORROW_QUESTS.map((c) => c.code),
          ].sort();
          const recipe = LAND_SORROW_RECIPES.find(
            (r) => r.mode === (easy ? "easy" : "standard"),
          );
          assert.deepEqual(
            physical,
            recipe.cards.flatMap((r) => Array(r.quantity).fill(r.code)).sort(),
          );
          assert.deepEqual((await resume(page)).landSorrow, s.landSorrow);
          await page
            .locator('[data-scenario-panel="the-land-of-sorrow"]')
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const stage of [1, 2]) {
      const s = base();
      s.stage = stage;
      s.landSorrow.currentQuest = LAND_SORROW_QUESTS[stage - 1].code;
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(s.landSorrow.currentQuest).name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await checkpoint(`quest-${stage}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${stage}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    const travel = base(2);
    travel.phase = "travel";
    const barracks = camp(travel, S.barracks, S.edrahil, S.ulwarth);
    await load(page, travel);
    const panel = page.locator('[data-scenario-panel="the-land-of-sorrow"]');
    await panel.getByText("Ulwarth waits beneath it").waitFor();
    await panel
      .getByRole("button", { name: "Inspect Ulwarth", exact: true })
      .click();
    await checkpoint("warden-inspected", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    await board(barracks.id)
      .getByRole("button", { name: "Travel here" })
      .click();
    await reviewedState(page);
    let s = await saved(page);
    assert.equal(s.activeLocation.id, barracks.id);
    const ulwarth = s.staging.find((u) => u.code === S.ulwarth);
    assert.ok(ulwarth, "Ulwarth enters staging when The Barracks is active");
    assert.equal(ulwarth.roundCannotTakeDamage, true);
    assert.deepEqual((await resume(page)).landSorrow, s.landSorrow);
    await checkpoint("barracks-warden", width);
    const freed = base(2);
    const free = camp(freed, S.storehouse, S.arador, S.borlach);
    freed.staging = freed.staging.filter((u) => u.id !== free.id);
    freed.activeLocation = free;
    freed.landSorrow.camps[0].warden = undefined;
    hooks.explored(freed, free, true);
    freed.activeLocation = null;
    await load(page, freed);
    s = await saved(page);
    assert.ok(s.allies.some((u) => u.code === S.arador));
    await board(s.allies.find((u) => u.code === S.arador).id).waitFor();
    await checkpoint("captive-freed", width);
    const cruel = base();
    hooks.encounter(cruel, S.cruelty);
    flush(cruel);
    await load(page, cruel);
    s = await saved(page);
    assert.deepEqual((await resume(page)).choice, s.choice);
    await checkpoint("cruelty-pending", width);
    s = await choose(page, cruel.heroes[0].id);
    assert.match(s.choice.title, /punishment/);
    s = await choose(page, "damage");
    assert.equal(get(s, cruel.heroes[0].id).damage, 2);
    await checkpoint("cruelty-resolved", width);
    const victory = base();
    victory.phase = "staging";
    victory.stage = 2;
    victory.landSorrow.currentQuest = S.last;
    for (const code of SORROW_CAPTIVES) {
      const u = make(victory, code);
      u.controller = 0;
      victory.allies.push(u);
      victory.landSorrow.freed.push({ id: u.id, code });
    }
    victory.heroes[0].committed = true;
    victory.heroes[0].exhausted = true;
    victory.heroes[0].tempWill = 40;
    await load(page, victory);
    s = await next(page);
    assert.equal(s.status, "won");
    await checkpoint("revolt-victory", width);
    const king = createGame(431, KING_DECK, ["01001", "01002"], "custom", {
      scenarioId: "the-land-of-sorrow",
    });
    await load(page, king);
    s = await saved(page);
    assert.match(s.choice.title, /Messenger of the King/);
    await checkpoint("messenger-choice", width);
    s = await choose(page, "01014");
    s = await opening(page);
    assert.ok(s.heroes.some((h) => h.code === "01014"));
    await page.locator("[data-messenger-contract]").waitFor();
    await checkpoint("messenger-hero", width);
    const song = base();
    const host = song.heroes[0];
    host.damage = 2;
    const songId = `a${song.nextId++}`;
    host.attachments.push({
      id: songId,
      code: P.song,
      owner: 0,
      exhausted: false,
    });
    const discard = make(song, "01013");
    discard.owner = 0;
    song.hand.push(discard);
    await load(page, song);
    s = await saved(page);
    const songAbility = availableAbilities(s, get(s, host.id)).find(
      (a) => a.id === songId && !a.disabled,
    );
    assert.ok(songAbility, "Song of Healing is an enabled ability");
    let songButton = page.getByRole("button", {
      name: songAbility.label,
      exact: true,
    });
    if (!(await songButton.count()))
      songButton = page.getByRole("button", {
        name: `${card(host.code).name} · ${songAbility.label}`,
        exact: true,
      });
    await songButton.first().click();
    await reviewedState(page);
    s = await saved(page);
    if (s.choice?.options.some((o) => o.id === discard.id))
      s = await choose(page, discard.id);
    assert.equal(get(s, host.id).damage, 1);
    await checkpoint("song-of-healing", width);
    const smoke = base();
    for (const h of smoke.heroes)
      h.phaseResourceIcons = ["spirit", "leadership"];
    const pipeId = `a${smoke.nextId++}`;
    smoke.heroes[0].attachments.push({
      id: pipeId,
      code: P.pipe,
      owner: 0,
      exhausted: false,
    });
    const event = make(smoke, P.smoke);
    event.owner = 0;
    smoke.hand.push(event);
    await load(page, smoke);
    await play(event.id);
    s = await saved(page);
    assert.deepEqual(s.landSorrowPlayers.smoke, [{ player: 0, amount: 1 }]);
    await checkpoint("smoke-and-think", width);
    const wily = base(2);
    const w = make(wily, P.wilyador);
    forOwner(wily, 0, () => wily.allies.push(w));
    handle(wily, fx("sorrowPlayerWilyador", { target: w.id, player: 0 }));
    flush(wily);
    await load(page, wily);
    s = await saved(page);
    assert.match(s.choice.title, /Wilyador/);
    await checkpoint("wilyador-upkeep", width);
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
    `Land of Sorrow browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
