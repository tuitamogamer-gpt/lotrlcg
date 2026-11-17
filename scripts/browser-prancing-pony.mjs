import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { addVictoryCard, progressLocation } from "../src/game/board.ts";
import {
  PP,
  PP_QUEST_CODES,
  ppRecipe,
} from "../src/game/prancing-pony-support.ts";
import {
  activate,
  atQuest,
  base,
  engaged,
  stage,
} from "../tests/prancing-pony-fixtures.ts";
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
    new URL("../tests/prancing-pony-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/prancing-pony-browser";
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
const panel = "[data-scenario-panel='murder-at-the-prancing-pony']";
const explore = (s, code) => {
  const u = activate(s, code);
  progressLocation(s, u, card(code).quest);
  flush(s);
  return s;
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
          await fresh(page, "murder-at-the-prancing-pony", players, easy);
          await page.locator("#start-btn").click();
          let s = await opening(page);
          for (let n = 0; s.choice && n < 20; n++)
            s = await choose(page, s.choice.options[0].id);
          const q = s.prancingPony;
          // No encounter card is revealed during setup: every physical card
          // of the recipe is accounted for.
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...q.setAside,
            ...q.investigation,
            q.guilty.suspect,
            q.guilty.hideout,
            ...PP_QUEST_CODES,
          ].sort();
          assert.deepEqual(
            physical,
            ppRecipe(easy)
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.activeLocation.code, PP.pony);
          assert.deepEqual(
            s.staging.map((u) => u.code),
            [PP.manor],
          );
          assert.deepEqual((await resume(page)).prancingPony, q);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-side='1B']`).waitFor();
          await page.locator(`${panel} [data-hidden='true']`).waitFor();
          await page
            .locator(
              `${panel} [data-investigation='${q.investigation.length}']`,
            )
            .waitFor();
          assert.equal(
            await page.locator(`${panel} [data-checked='true']`).count(),
            0,
          );
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // All three printed quest cards, both faces.
    for (const code of PP_QUEST_CODES) {
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
    // The Prancing Pony explored: look at the top 2 Investigation cards.
    const pony = explore(base(1), PP.pony);
    assert.match(pony.choice.title, /^The Prancing Pony · Look at the top 2/);
    await load(page, pony);
    await checkpoint("prancing-pony-explored", width);
    let s = await choose(page, "look");
    assert.deepEqual(s.prancingPony.checked, [PP.susie, PP.staddle]);
    assert.equal(
      await page.locator(`${panel} [data-checked='true']`).count(),
      2,
    );
    await checkpoint("investigation-list", width);
    // Investigating the Crime: raise threat or reveal an extra card.
    const hurry = base(2);
    hurry.phase = "resource";
    hurry.queue.push(fx("ppHurry", { player: 0 }));
    flush(hurry);
    await load(page, hurry);
    await checkpoint("investigating-the-crime", width);
    s = await choose(page, "threat");
    assert.equal(s.table.seats[0].threat, 22);
    // Old Warehouse: 2 more cards or −3 threat.
    const warehouse = explore(base(1), PP.warehouse);
    assert.match(warehouse.choice.title, /^Old Warehouse · /);
    await load(page, warehouse);
    await checkpoint("old-warehouse", width);
    s = await choose(page, "look");
    assert.equal(s.prancingPony.checked.length, 3);
    // Village Stable: bring a looked-at Suspect out.
    const stableState = base(1);
    stableState.prancingPony.investigation = [PP.jake];
    explore(stableState, PP.stable);
    assert.match(stableState.choice.title, /^Village Stable · /);
    await load(page, stableState);
    await checkpoint("village-stable", width);
    s = await choose(page, "stable");
    assert.ok(s.staging.some((u) => u.code === PP.jake));
    // Running out of Time: reveal, or the accusation.
    const time = base(1);
    atQuest(time, PP.time);
    time.queue.push(fx("ppAccuseChoice", { player: 0 }));
    flush(time);
    await load(page, time);
    await page.locator(`${panel} [data-side='2B']`).waitFor();
    await checkpoint("running-out-of-time", width);
    s = await choose(page, "accuse");
    assert.match(s.choice.title, /^The accusation · Name a Suspect/);
    await checkpoint("name-a-suspect", width);
    s = await choose(page, PP.todd);
    assert.match(s.choice.title, /^The accusation · Name a Hideout/);
    await checkpoint("name-a-hideout", width);
    s = await choose(page, PP.ferneyHouse);
    for (let n = 0; s.choice && n < 10; n++)
      s = await choose(page, s.choice.options[0].id);
    assert.equal(s.prancingPony.accusation.correct, true);
    assert.equal(s.prancingPony.currentQuest, PP.killer);
    await page.locator(`${panel} [data-hidden='false']`).waitFor();
    await checkpoint("accusation-correct", width);
    // A wrong accusation brings the named cards and 3 threat.
    const wrong = base(1);
    atQuest(wrong, PP.time);
    wrong.queue.push(fx("ppAccuse", { player: 0 }));
    flush(wrong);
    await load(page, wrong);
    s = await choose(page, PP.johnny);
    s = await choose(page, PP.archet);
    for (let n = 0; s.choice && n < 10; n++)
      s = await choose(page, s.choice.options[0].id);
    assert.equal(s.prancingPony.accusation.correct, false);
    assert.equal(s.threat, 23);
    await checkpoint("accusation-wrong", width);
    // Apprehending the Killer: a Hideout protects the Suspects.
    const killer = base(1);
    atQuest(killer, PP.killer);
    engaged(killer, PP.todd);
    stage(killer, PP.ferneyHouse);
    killer.prancingPony.guilty = null;
    killer.prancingPony.accusation = {
      suspect: PP.todd,
      hideout: PP.ferneyHouse,
      correct: true,
    };
    await load(page, killer);
    await page.locator(`${panel} [data-side='3B']`).waitFor();
    await checkpoint("apprehending-the-killer", width);
    // The last Suspect falls: the players win.
    const won = base(1);
    atQuest(won, PP.killer);
    won.prancingPony.guilty = null;
    const todd = engaged(won, PP.todd);
    todd.damage = 9;
    won.queue.push(fx("damage", { target: todd.id, value: 1 }));
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("killer-apprehended", width);
    // Greenway Footpad and Taken by Surprise.
    const footpad = base(2);
    footpad.encounterDeck = [PP.footpad];
    footpad.queue.push(fx("reveal", { player: 0 }));
    flush(footpad);
    assert.match(footpad.choice.title, /^Greenway Footpad · /);
    await load(page, footpad);
    await checkpoint("greenway-footpad", width);
    const surprise = base(1);
    surprise.prancingPony.investigation = [PP.surprise, PP.susie];
    surprise.encounterDeck = [PP.manor, PP.outlaw];
    surprise.queue.push(fx("ppLookTop", { value: 2, player: 0 }));
    flush(surprise);
    assert.ok(surprise.engaged.some((u) => u.code === PP.outlaw));
    await load(page, surprise);
    await checkpoint("taken-by-surprise", width);
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
    `Murder at the Prancing Pony browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
