import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { applyAction } from "../src/game/engine.ts";
import { flush } from "../src/game/effects.ts";
import { addVictoryCard, check, progressLocation } from "../src/game/board.ts";
import {
  RB,
  RB_QUEST_CODES,
  rbRecipe,
} from "../src/game/ruins-belegost-support.ts";
import {
  activate,
  atQuest,
  base,
  engaged,
  loot,
  stage,
} from "../tests/ruins-belegost-fixtures.ts";
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
    new URL("../tests/ruins-belegost-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/ruins-belegost-browser";
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
const panel = "[data-scenario-panel='the-ruins-of-belegost']";
const stalking = (s) => s.staging.find((u) => u.code === RB.stalking);
const lootOn = (u) => u.attachments.map((a) => a.code);
const unaside = (s, code) => {
  s.ruinsBelegost.setAside = s.ruinsBelegost.setAside.filter((c) => c !== code);
};
async function travel() {
  await page.getByRole("button", { name: "Travel here" }).first().click();
  await reviewedState(page);
  return saved(page);
}
async function settleAll(s) {
  for (let n = 0; s.choice && n < 40; n++)
    s = await choose(
      page,
      s.choice.options.find((o) => o.id === "undefended")?.id ??
        s.choice.options[0].id,
    );
  assert.equal(s.choice, null);
  return s;
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
          await fresh(page, "the-ruins-of-belegost", players, easy);
          await page.locator("#start-btn").click();
          let s = await opening(page);
          for (let n = 0; s.choice && n < 20; n++)
            s = await choose(page, s.choice.options[0].id);
          const q = s.ruinsBelegost;
          // No encounter card is revealed during setup: every physical card
          // of the recipe is accounted for.
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...q.setAside,
            ...(q.under ? [q.under] : []),
            ...RB_QUEST_CODES,
          ].sort();
          assert.deepEqual(
            physical,
            rbRecipe(easy)
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.deepEqual(
            s.staging.map((u) => u.code).sort(),
            [RB.stalking, ...Array(players).fill(RB.mine)].sort(),
          );
          assert.equal(q.currentQuest, RB.first);
          assert.ok(q.under);
          assert.deepEqual((await resume(page)).ruinsBelegost, q);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-side='1B']`).waitFor();
          await page.locator(`${panel} [data-stalking='0']`).waitFor();
          await page.locator(`${panel} [data-naurlhug='aside']`).waitFor();
          await page.locator(`${panel} [data-loot='0']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // All seven printed quest cards, both faces.
    for (const code of RB_QUEST_CODES) {
      const s = base(1);
      atQuest(s, code);
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
      const side = card(code)
        .name.replace(/[^A-Za-z]+/g, "-")
        .toLowerCase();
      await checkpoint(`quest-${side}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${side}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Discover 2 on Darkened Tunnel with two Loot: one is chosen and guarded.
    const two = base(1);
    stage(two, RB.tunnel);
    two.encounterDeck = [RB.book, RB.gem, RB.orc];
    two.phase = "travel";
    await load(page, two);
    let s = await travel();
    assert.match(s.choice.title, /^Discover · Choose a Loot objective/);
    await checkpoint("discover-loot", width);
    s = await choose(page, RB.gem);
    assert.deepEqual(lootOn(s.activeLocation), [RB.gem]);
    assert.deepEqual(s.encounterDiscard, [RB.book]);
    await page.locator(`${panel} [data-stalking='1']`).waitFor();
    // Abandoned Mine looks at 1 more card; Concealed Spikes is revealed.
    const spikes = base(1);
    stage(spikes, RB.mine);
    spikes.encounterDeck = [RB.map, RB.spikes, RB.tunnel, RB.orc, RB.orc];
    spikes.phase = "travel";
    await load(page, spikes);
    s = await travel();
    assert.match(
      s.choice.title,
      /^Concealed Spikes · Assign damage.*3 remaining/,
    );
    await checkpoint("discover-hazard", width);
    s = await settleAll(s);
    assert.deepEqual(lootOn(s.activeLocation), [RB.map]);
    assert.equal(
      s.heroes.reduce((n, h) => n + h.damage, 0),
      3,
    );
    // An explored guarding location: the first player claims its Loot.
    const claim = base(1);
    const mine = activate(claim, RB.mine);
    mine.attachments.push({ id: "a-loot", code: RB.torch, exhausted: false });
    progressLocation(claim, mine, 3);
    flush(claim);
    assert.match(claim.choice.title, /^Dwarven Torch · Attach it to a hero/);
    await load(page, claim);
    await checkpoint("claim-loot", width);
    s = await choose(page, claim.heroes[1].id);
    assert.deepEqual(lootOn(s.heroes[1]), [RB.torch]);
    await page.locator(`${panel} [data-loot='1']`).waitFor();
    // 2D: resources for explored locations, Loot and Stalking the Ruins.
    const deeper = base(2);
    atQuest(deeper, RB.deeper);
    loot(deeper, RB.keys);
    deeper.ruinsBelegost.questResources = 2;
    stalking(deeper).resources = 1;
    await load(page, deeper);
    await page.locator(`${panel} [data-side='2D']`).waitFor();
    await page.locator(`${panel} [data-quest-resources='2']`).waitFor();
    await page.locator(`${panel} [data-stalking='1']`).waitFor();
    await checkpoint("deeper-into-the-past", width);
    // Keys of Belegost: exhaust to add a resource to a hero's pool.
    const keys = base(1);
    loot(keys, RB.keys);
    await load(page, keys);
    await page
      .getByRole("button", {
        name: "Keys of Belegost · Action: exhaust to add 1 resource to a hero's pool",
      })
      .first()
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.match(s.choice.title, /^Keys of Belegost · Choose a target/);
    await checkpoint("keys-of-belegost", width);
    s = await choose(page, keys.heroes[2].id);
    assert.equal(s.heroes[2].resources, 11);
    // Sword of Belegost cancels Sunken Treasury's shadow.
    let sword = base(1);
    const blade = loot(sword, RB.sword);
    const goblin = engaged(sword, RB.goblin);
    goblin.shadows = [RB.treasury];
    sword.phase = "defense";
    sword = applyAction(sword, {
      type: "DEFEND",
      enemyId: goblin.id,
      defenderId: sword.heroes[0].id,
    });
    assert.equal(sword.choice.title, "A shadow falls");
    await load(page, sword);
    await checkpoint("sword-of-belegost", width);
    s = await choose(page, `sword-${blade.id}`);
    s = await settleAll(s);
    assert.equal(
      s.heroes[0].attachments.find((a) => a.id === blade.id).exhausted,
      true,
    );
    assert.equal(
      s.heroes.filter((h) => h.exhausted).length,
      1,
      "only the defender is exhausted",
    );
    // Orc of Ered Luin attacks each player that controls a Loot.
    const orc = base(2);
    loot(orc, RB.keys, 0);
    loot(orc, RB.map, 1);
    orc.encounterDeck = [RB.orc, RB.mine, RB.mine, RB.mine];
    orc.queue.push(fx("reveal", { player: 0 }));
    flush(orc);
    assert.match(orc.choice.title, /^Orc of Ered Luin · Immediate attack/);
    await load(page, orc);
    await checkpoint("orc-of-ered-luin", width);
    s = await settleAll(await saved(page));
    assert.equal(
      s.log.filter((l) => /^Orc of Ered Luin attacks/.test(l.text)).length,
      2,
      "one immediate attack against each player with a Loot",
    );
    // The Lurker of the Depths is considered engaged with each player.
    const lurker = base(2);
    atQuest(lurker, RB.evils);
    unaside(lurker, RB.lurker);
    stage(lurker, RB.lurker);
    await load(page, lurker);
    await page.locator(`${panel} [data-side='2B']`).waitFor();
    await checkpoint("lurker-of-the-depths", width);
    // Stage 3 loops until the matching Loot is attached: 3B leads to 3C.
    const loop = base(1);
    atQuest(loop, RB.servants);
    loop.encounterDeck = [RB.mine, RB.mine, RB.mine];
    loop.progress = 6;
    check(loop);
    flush(loop);
    assert.equal(loop.ruinsBelegost.currentQuest, RB.roots);
    assert.equal(loop.choice, null);
    await load(page, loop);
    await page.locator(`${panel} [data-side='3D']`).waitFor();
    await checkpoint("stage-3-loop", width);
    // 4B: Naurlhûg can take damage once his lair is in the victory display.
    const beast = base(1);
    atQuest(beast, RB.beast);
    addVictoryCard(beast, RB.lair);
    unaside(beast, RB.naurlhug);
    unaside(beast, RB.lair);
    stalking(beast).resources = 2;
    const dragon = engaged(beast, RB.naurlhug);
    await load(page, beast);
    await page.locator(`${panel} [data-naurlhug='play']`).waitFor();
    await page.locator(`${panel} [data-side='4B']`).waitFor();
    await checkpoint("naurlhug-4b", width);
    // Defeating Naurlhûg wins the game.
    dragon.damage = 19;
    beast.queue.push(fx("damage", { target: dragon.id, value: 1 }));
    flush(beast);
    assert.equal(beast.status, "won");
    await load(page, beast);
    await checkpoint("naurlhug-defeated", width);
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
    `The Ruins of Belegost browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
