import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check, progressLocation } from "../src/game/board.ts";
import { forOwner } from "../src/game/table.ts";
import { OATH } from "../src/game/the-oath-support.ts";
import {
  CAVES,
  CAVES_QUESTS,
  cavesRecipe,
} from "../src/game/caves-nibin-dum-support.ts";
import {
  activate,
  atStage,
  base,
  engaged,
} from "../tests/caves-nibin-dum-fixtures.ts";
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
    new URL("../tests/caves-nibin-dum-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/caves-nibin-dum-browser";
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
const panel = "[data-scenario-panel='the-caves-of-nibin-dum']";
const stage = (s, code) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const aside = (s, code) => {
  s.caves.setAside = s.caves.setAside.filter((c) => c !== code);
};
const heroesOf = (s) =>
  s.table ? s.table.seats.flatMap((x) => x.heroes) : s.heroes;
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
      for (const scenarioId of [
        "the-caves-of-nibin-dum-2018",
        "the-caves-of-nibin-dum",
      ])
        for (const easy of [false, true])
          for (const players of [1, 2, 3, 4]) {
            await fresh(page, scenarioId, players, easy);
            await page.locator("#start-btn").click();
            let s = await opening(page);
            // 1A attaches Cave Torch; 1B adds a different location per player.
            for (let n = 0; s.choice && n < 20; n++)
              s = await choose(page, s.choice.options[0].id);
            const torchHeroes = heroesOf(s).filter((h) =>
              h.attachments.some((a) => a.code === CAVES.torch),
            );
            assert.equal(torchHeroes.length, 1, "Cave Torch is attached");
            const physical = [
              ...s.encounterDeck,
              ...s.encounterDiscard,
              ...s.staging.map((u) => u.code),
              ...s.caves.setAside,
              CAVES.torch,
              ...CAVES_QUESTS.map((c) => c.code),
            ].sort();
            assert.deepEqual(
              physical,
              cavesRecipe(scenarioId, easy)
                .cards.flatMap((r) => Array(r.quantity).fill(r.code))
                .sort(),
            );
            assert.equal(s.staging.length, players);
            assert.equal(
              new Set(s.staging.map((u) => card(u.code).name)).size,
              players,
            );
            assert.deepEqual(
              [...s.caves.setAside].sort(),
              [CAVES.chieftain, CAVES.pillar].sort(),
            );
            assert.equal(
              s.caves.edition,
              scenarioId === "the-caves-of-nibin-dum" ? "2022" : "2018",
            );
            assert.deepEqual((await resume(page)).caves, s.caves);
            await page.locator(panel).waitFor();
            await page.locator(`${panel} [data-torch='ready']`).waitFor();
            await page.locator(`${panel} [data-chieftain='aside']`).waitFor();
            await page.locator(`${panel} [data-pillar='aside']`).waitFor();
            await page
              .locator(`${panel} [data-edition='${s.caves.edition}']`)
              .waitFor();
            setups.push({ scenarioId, players, easy });
            await checkpoint(
              `setup-${scenarioId}-${players}-${easy ? "easy" : "normal"}`,
              width,
            );
          }
    for (const index of [0, 1, 2, 3]) {
      const s = base(1);
      atStage(s, index + 1);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(CAVES_QUESTS[index].code).name}`,
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
    // 1B is defeated: 2A's Goblin Chieftain and the search for an enemy.
    const surprise = base(1);
    surprise.encounterDeck = [CAVES.warg, OATH.sniper, CAVES.passage];
    surprise.encounterDiscard = [CAVES.troll];
    surprise.progress = 8;
    check(surprise);
    flush(surprise);
    assert.equal(surprise.stage, 2);
    assert.match(
      surprise.choice.title,
      /^Surprise Attack · Add a different enemy/,
    );
    await load(page, surprise);
    await page.locator(`${panel} [data-side='2B']`).waitFor();
    await page.locator(`${panel} [data-chieftain='play']`).waitFor();
    await checkpoint("surprise-attack-search", width);
    let s = await choose(page, CAVES.troll);
    assert.ok(s.staging.some((u) => u.code === CAVES.troll));
    // Cave Torch: exhaust it to place progress on a Dark location.
    const lit = base(1);
    stage(lit, CAVES.tunnels);
    lit.encounterDeck = [CAVES.warg, CAVES.passage];
    await load(page, lit);
    await page
      .getByRole("button", {
        name: "Cave Torch · Action: exhaust it to place up to 3 progress on a Dark location",
      })
      .first()
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.match(s.choice.title, /^Cave Torch · Place up to 3 progress/);
    await checkpoint("cave-torch", width);
    s = await choose(page, s.choice.options[0].id);
    assert.equal(s.staging.find((u) => u.code === CAVES.tunnels).progress, 3);
    assert.ok(s.staging.some((u) => u.code === CAVES.warg));
    await page.locator(`${panel} [data-torch='exhausted']`).waitFor();
    // Cavern Warg attacks the player with Cave Torch.
    const warg = base(1);
    const cavern = engaged(warg, CAVES.warg);
    warg.encounterDeck = [CAVES.passage];
    warg.phase = "defense";
    warg.queue.push(fx("cavesWargOffer", { target: cavern.id, player: 0 }));
    warg.combat = {
      enemyId: cavern.id,
      attackPlayer: 0,
      defenderId: null,
      defenderIds: [],
      attackBonus: 0,
      damageDealt: 0,
    };
    flush(warg);
    assert.match(warg.choice.title, /^Cavern Warg · Exhaust Cave Torch/);
    await load(page, warg);
    await checkpoint("cavern-warg", width);
    // Lost in the Dark: the torch's player chooses.
    const lost = base(1);
    lost.phase = "staging";
    lost.encounterDeck = [CAVES.lost, CAVES.passage];
    lost.queue.push(fx("reveal", { player: 0 }));
    flush(lost);
    assert.match(lost.choice.title, /^Lost in the Dark · Exhaust Cave Torch/);
    await load(page, lost);
    await checkpoint("lost-in-the-dark", width);
    s = await choose(page, "dark");
    // Watchful Eyes is attached to a hero of the first player.
    const eyes = base(1);
    eyes.encounterDeck = [CAVES.eyes, CAVES.passage];
    eyes.queue.push(fx("reveal", { player: 0 }));
    flush(eyes);
    assert.match(eyes.choice.title, /^Watchful Eyes · Attach it/);
    await load(page, eyes);
    await checkpoint("watchful-eyes", width);
    s = await choose(page, eyes.heroes[1].id);
    assert.ok(s.heroes[1].attachments.some((a) => a.code === CAVES.eyes));
    // Branching Paths: explored, the players reveal 1 of the top 3.
    const branching = base(1);
    const paths = activate(branching, CAVES.branching);
    paths.progress = 2;
    branching.encounterDeck = [
      CAVES.troll,
      CAVES.mine,
      CAVES.warg,
      CAVES.passage,
    ];
    progressLocation(branching, paths, 1);
    flush(branching);
    assert.match(branching.choice.title, /^Branching Paths · Choose 1/);
    await load(page, branching);
    await checkpoint("branching-paths", width);
    s = await choose(page, "1");
    assert.ok(s.staging.some((u) => u.code === CAVES.mine));
    // The Chasm: the first player attacks Cracked Pillar, then travels there.
    const chasm = base(1);
    atStage(chasm, 3);
    aside(chasm, CAVES.pillar);
    stage(chasm, CAVES.pillar);
    chasm.phase = "attack";
    await load(page, chasm);
    await page.locator(`${panel} [data-pillar='staging']`).waitFor();
    await page
      .getByRole("button", {
        name: "Cracked Pillar · Attack it as if it were an enemy engaged with you",
      })
      .first()
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.match(s.choice.title, /^Cracked Pillar · Declare attackers/);
    for (const hero of s.heroes) s = await choose(page, hero.id);
    s = await choose(page, "attack");
    const damage = s.staging.find((u) => u.code === CAVES.pillar).damage;
    assert.ok(damage >= 4, `${damage} damage on Cracked Pillar`);
    await page.locator(`${panel} [data-pillar-damage='${damage}']`).waitFor();
    await checkpoint("cracked-pillar-attack", width);
    const crossing = base(1);
    atStage(crossing, 3);
    aside(crossing, CAVES.pillar);
    stage(crossing, CAVES.pillar).damage = 5;
    crossing.phase = "travel";
    await load(page, crossing);
    s = await travel();
    assert.equal(s.activeLocation.code, CAVES.pillar);
    assert.equal(s.activeLocation.damage, 1);
    await page.locator(`${panel} [data-pillar='active']`).waitFor();
    await checkpoint("cracked-pillar-active", width);
    // Goblin Chieftain's Forced effect after it attacks.
    const chief = base(1);
    atStage(chief, 4);
    aside(chief, CAVES.chieftain);
    const leader = engaged(chief, CAVES.chieftain);
    chief.progress = 12;
    chief.queue.push(
      fx("cavesChieftainForced", { target: leader.id, player: 0 }),
    );
    flush(chief);
    assert.match(chief.choice.title, /^Goblin Chieftain · Remove 4 progress/);
    await load(page, chief);
    await page.locator(`${panel} [data-side='4B']`).waitFor();
    await checkpoint("goblin-chieftain", width);
    s = await choose(page, "progress");
    assert.equal(s.progress, 8);
    // 4B waits while Goblin Chieftain is in play.
    const waiting = base(1);
    atStage(waiting, 4);
    aside(waiting, CAVES.chieftain);
    forOwner(waiting, 0, () =>
      waiting.engaged.push(make(waiting, CAVES.chieftain)),
    );
    waiting.progress = 9;
    check(waiting);
    assert.equal(waiting.status, "playing");
    await load(page, waiting);
    await page.locator(`${panel} [data-chieftain='play']`).waitFor();
    await checkpoint("chieftain-engaged", width);
    // Victory: the Chieftain is destroyed with 8 progress on 4B.
    const won = base(1);
    atStage(won, 4);
    aside(won, CAVES.chieftain);
    const fallen = engaged(won, CAVES.chieftain);
    won.progress = 8;
    fallen.damage = 8;
    check(won);
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("oathkeepers-defeated", width);
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
    `The Caves of Nibin-Dûm browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
