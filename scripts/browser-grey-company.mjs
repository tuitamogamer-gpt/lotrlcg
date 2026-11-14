import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { progressLocation } from "../src/game/board.ts";
import {
  FLAME_WEST_ARAGORN,
  fellowshipAragorn,
} from "../src/game/lotr-saga.ts";
import {
  GC,
  GREY_COMPANY_QUESTS,
  GREY_COMPANY_RECIPES,
} from "../src/game/grey-company.ts";
import {
  activate,
  allies,
  base,
  created,
  engaged,
  fearAside,
  stage,
} from "../tests/grey-company-fixtures.ts";
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
    new URL("../tests/grey-company-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/grey-company-browser";
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
const panel = "[data-scenario-panel='the-passing-of-the-grey-company']";
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
          await fresh(page, "the-passing-of-the-grey-company", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const q = s.greyCompany;
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...(s.victoryCards ?? []),
            ...q.setAside,
            ...Array(q.fearAside + q.fearRemoved).fill(GC.fear),
            ...seats.flatMap((p) =>
              (p.threatAttachments ?? []).map((a) => a.code),
            ),
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
            ...GREY_COMPANY_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            GREY_COMPANY_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.stage, 1);
          assert.equal(q.fearRemoved, 4 - players);
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].heroes.some((h) => h.code === FLAME_WEST_ARAGORN),
            "the first player controls the Fellowship Aragorn",
          );
          assert.ok(
            seats.every((p) =>
              (p.threatAttachments ?? []).some((a) => a.code === GC.fear),
            ),
            "each player begins Overcome by Fear",
          );
          assert.deepEqual((await resume(page)).greyCompany, s.greyCompany);
          await page
            .locator(
              `${panel} [data-stage='1'] ~ [data-fear='${"1".repeat(players)}']`,
            )
            .waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // The three printed quest cards, both sides.
    for (const [index, code] of GREY_COMPANY_QUESTS.map(
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
    // The Forbidden Door: 1 resource on each hero for 3 threat.
    const door = created(2, false, 905);
    assert.match(door.choice.title, /^The Forbidden Door · Add resources/);
    await load(page, door);
    await checkpoint("forbidden-door", width);
    // The Paths of the Dead: each player searches for a different location.
    const paths = base(2, 1);
    paths.encounterDeck = [GC.haunted, GC.deadly, GC.trysting, GC.darkDoor];
    run(paths, fx("phaseEnd"), fx("startQuest"));
    assert.match(
      paths.choice.title,
      /^The Paths of the Dead · Search the encounter deck/,
    );
    await load(page, paths);
    await page.locator(".quest-stage-seal", { hasText: /^2A$/ }).waitFor();
    await checkpoint("paths-search", width);
    // 2B: raise the threat by 1, or play no card this phase.
    const planning = base(2, 2);
    run(planning, fx("startPlanning"));
    assert.match(planning.choice.title, /^The Paths of the Dead · Choose one/);
    await load(page, planning);
    await page.locator(`${panel} [data-stage='2']`).waitFor();
    await checkpoint("paths-planning", width);
    // Phantom: the Dead Man's damage raises the defending player's threat.
    let phantom = base(1, 2);
    const [guard] = allies(phantom, ["01013"]);
    const dead = engaged(phantom, GC.deadMan);
    phantom = defend(phantom, dead, guard);
    while (phantom.choice)
      phantom = applyAction(phantom, {
        type: "CHOOSE",
        id: (
          phantom.choice.options.find((o) =>
            ["skip", "resolve"].includes(o.id),
          ) ?? phantom.choice.options[0]
        ).id,
      });
    assert.equal(phantom.threat, 22);
    assert.ok(phantom.log.some((l) => /^Phantom: the 2 damage/.test(l.text)));
    await load(page, phantom);
    await checkpoint("phantom", width);
    // Overcome by Fear at the end of the round: Aragorn's Fellowship resource.
    const fear = base(1, 2);
    run(fear, fx("endRound"));
    assert.match(
      fear.choice.title,
      /^Overcome by Fear · Spend 1 Fellowship resource/,
    );
    await load(page, fear);
    await checkpoint("overcome-by-fear", width);
    // Whispers in the Dark: Peril, with a set-aside Overcome by Fear.
    const whispers = base(1, 2);
    fearAside(whispers, 0);
    pastReveal(reveal(whispers, GC.whispers));
    assert.match(whispers.choice.title, /^Whispers in the Dark · Choose one/);
    await load(page, whispers);
    await page
      .locator(`${panel} [data-fear='0'][data-fear-aside='1']`)
      .waitFor();
    await checkpoint("whispers-in-the-dark", width);
    // Haunted Path's shadow: 2 threat, or the enemy returns to staging.
    let haunted = base(1, 2);
    const [g2] = allies(haunted, ["01013"]);
    const d2 = engaged(haunted, GC.deadMan);
    haunted = defend(haunted, d2, g2, [GC.haunted]);
    for (
      let n = 0;
      n < 5 && haunted.choice && !/^Haunted Path/.test(haunted.choice.title);
      n++
    )
      haunted = applyAction(haunted, {
        type: "CHOOSE",
        id: haunted.choice.options[0].id,
      });
    assert.match(haunted.choice.title, /^Haunted Path · Choose one/);
    await load(page, haunted);
    await checkpoint("haunted-path-shadow", width);
    // The Dead are Following: The Stone of Erech and Army of the Dead.
    const following = base(2, 2);
    run(following, fx("gcStageThree", { player: 0 }));
    assert.match(
      following.choice.title,
      /^The Dead are Following · Overcome by Fear/,
    );
    await load(page, following);
    await checkpoint("dead-are-following", width);
    // The Stone of Erech becomes active: each player finds an Oathbreaker.
    let erech = base(1, 3);
    fearAside(erech, 0);
    const stone = stage(erech, GC.stone);
    erech.progress = 5;
    erech.phase = "travel";
    erech.encounterDeck = [GC.deadMan, GC.ghosts, GC.deadly];
    erech = applyAction(erech, { type: "TRAVEL", id: stone.id });
    assert.match(
      erech.choice.title,
      /^The Stone of Erech · Search for an Oathbreaker enemy/,
    );
    await load(page, erech);
    await page.locator(`${panel} [data-stone='active']`).waitFor();
    await page.locator(".quest-stage-seal", { hasText: /^3B$/ }).waitFor();
    await checkpoint("stone-of-erech", width);
    // Victory: The Stone of Erech is explored.
    const won = base(1, 3);
    fearAside(won, 0);
    const erechStone = activate(won, GC.stone);
    won.phase = "quest";
    progressLocation(won, erechStone, 5);
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("stone-explored", width);
    // Defeat: Aragorn leaves play.
    const lost = base(1, 2);
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
    `The Passing of the Grey Company browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
