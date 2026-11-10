import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card, playerCards, SCRIPTED } from "../src/game/cards.ts";
import { availableAbilities, createGame } from "../src/game/engine.ts";
import { fx, get, make } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  FORTRESS_NURN_QUESTS,
  FORTRESS_NURN_RECIPES,
  NURN as N,
  NURN_STORMS,
} from "../src/game/fortress-nurn-support.ts";
import { NURN_PLAYER as P } from "../src/game/fortress-nurn-player.ts";
import { base } from "../tests/fortress-nurn-fixtures.ts";
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
    new URL("../tests/fortress-nurn-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/fortress-nurn-browser";
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
const garrison = NURN_STORMS.find((c) => `${c}:B` === N.garrison);
function castle(s, code, power, buried = 0) {
  const u = make(s, code);
  s.staging.push(u);
  if (power) s.fortressNurn.powered.push({ questId: u.id, code: power });
  if (buried)
    s.fortressNurn.under.push({
      questId: u.id,
      player: 0,
      cards: Array.from({ length: buried }, () => ({
        ...make(s, "01013"),
        owner: 0,
      })),
    });
  return u;
}
const pick = (sphere, n) =>
  playerCards
    .filter(
      (c) =>
        SCRIPTED.has(c.code) &&
        c.sphere_code === sphere &&
        ["event", "attachment", "ally"].includes(c.type_code) &&
        (c.deck_limit ?? 3) >= 2,
    )
    .reduce((deck, c) => {
      const used = Object.values(deck).reduce((a, b) => a + b, 0);
      if (used < n && !Object.keys(deck).some((k) => card(k).name === c.name))
        deck[c.code] = Math.min(2, n - used);
      return deck;
    }, {});
const BOND_DECK = {
  ...pick("leadership", 10),
  ...pick("lore", 10),
  ...pick("spirit", 10),
  ...pick("tactics", 10),
  ...pick("neutral", 10),
  [P.bond]: 1,
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
          await fresh(page, "the-fortress-of-nurn", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          assert.equal(
            s.staging.filter((u) => NURN_STORMS.includes(u.code)).length,
            4,
          );
          assert.ok(s.staging.some((u) => u.code === N.ulchor));
          const engaged = [
            ...s.engaged,
            ...(s.table?.seats ?? []).flatMap((p, i) =>
              i === s.table.active ? [] : p.engaged,
            ),
          ];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...engaged.map((u) => u.code),
            ...s.fortressNurn.powerDeck,
            ...s.fortressNurn.powered.map((p) => p.code),
            ...FORTRESS_NURN_QUESTS.map((c) => c.code),
          ].sort();
          const recipe = FORTRESS_NURN_RECIPES.find(
            (r) => r.mode === (easy ? "easy" : "standard"),
          );
          assert.deepEqual(
            physical,
            recipe.cards.flatMap((r) => Array(r.quantity).fill(r.code)).sort(),
          );
          assert.deepEqual((await resume(page)).fortressNurn, s.fortressNurn);
          await page
            .locator('[data-scenario-panel="the-fortress-of-nurn"]')
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
      s.fortressNurn.currentQuest = FORTRESS_NURN_QUESTS[stage - 1].code;
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(s.fortressNurn.currentQuest).name}`,
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
    const storm = base(2);
    const u = castle(storm, garrison, N.armies, 3);
    storm.encounterDeck = [N.dogs, N.plaza, N.soldier, N.tower, N.olog];
    storm.progress = 3;
    storm.phase = "quest";
    handle(storm, fx("sideQuestChoose", { player: 0 }));
    flush(storm);
    await load(page, storm);
    const panel = page.locator('[data-scenario-panel="the-fortress-of-nurn"]');
    await panel
      .getByRole("button", {
        name: "Inspect The Armies of Mordor",
        exact: true,
      })
      .waitFor();
    let s = await saved(page);
    assert.ok(!s.choice.options.some((o) => o.id === "main"));
    await checkpoint("castle-choice", width);
    s = await choose(page, u.id);
    while (s.choice || s.flow?.pending) {
      if (s.flow?.pending) {
        await reviewedState(page);
        s = await saved(page);
        continue;
      }
      s = await choose(page, s.choice.options[0].id);
    }
    assert.equal(get(s, u.id).code, N.garrison);
    assert.ok(s.staging.some((x) => x.code === N.armies));
    await panel.getByText("Castle Garrison").first().waitFor();
    assert.deepEqual((await resume(page)).fortressNurn, s.fortressNurn);
    await checkpoint("castle-garrison", width);
    const victory = base();
    victory.stage = 2;
    victory.fortressNurn.currentQuest = N.last;
    victory.phase = "planning";
    victory.victoryCards = [N.garrison, N.quarter, N.stronghold, N.ulchor];
    victory.victory = 36;
    await load(page, victory);
    s = await next(page);
    assert.equal(s.status, "won");
    await checkpoint("ulchor-defeated", width);
    const bond = createGame(
      431,
      BOND_DECK,
      ["01001", "01005", "01007", "01010"],
      "custom",
      { scenarioId: "the-fortress-of-nurn" },
    );
    await load(page, bond);
    s = await opening(page);
    assert.equal(s.heroes.length, 4);
    await page.locator("[data-bond-contract]").waitFor();
    await checkpoint("bond-of-friendship", width);
    const ara = base();
    const aragorn = make(ara, P.aragorn);
    aragorn.owner = 0;
    ara.heroes[0] = aragorn;
    const plaza = make(ara, N.plaza);
    ara.staging.push(plaza);
    await load(page, ara);
    s = await saved(page);
    const ability = availableAbilities(s, get(s, aragorn.id))[0];
    assert.ok(ability && !ability.disabled);
    let button = page.getByRole("button", { name: ability.label, exact: true });
    if (!(await button.count()))
      button = page.getByRole("button", {
        name: `${card(aragorn.code).name} · ${ability.label}`,
        exact: true,
      });
    await button.first().click();
    await reviewedState(page);
    s = await choose(page, plaza.id);
    assert.equal(get(s, plaza.id).progress, 1);
    await checkpoint("aragorn-scout", width);
    const path = base();
    for (const h of path.heroes) {
      h.phaseResourceIcons = ["spirit"];
      h.committed = true;
      h.exhausted = true;
    }
    const event = make(path, P.path);
    event.owner = 0;
    path.hand.push(event);
    path.phase = "quest";
    path.encounterDeck = [N.dogs, N.defense, N.plaza];
    handle(path, fx("nurnPlayerPathOffer", { player: 0 }));
    flush(path);
    await load(page, path);
    s = await saved(page);
    assert.match(s.choice.title, /A Desperate Path/);
    await checkpoint("desperate-path-offer", width);
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
    `Fortress of Nurn browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
