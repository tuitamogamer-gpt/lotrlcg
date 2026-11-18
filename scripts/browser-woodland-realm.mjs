import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import { forOwner } from "../src/game/table.ts";
import {
  WR,
  WR_QUESTS,
  WR_STAGE2,
  WR_STAGE3,
  wrCost,
  wrRecipe,
} from "../src/game/woodland-realm-support.ts";
import {
  atQuest,
  base,
  engaged,
  mendor,
  takeBox,
} from "../tests/woodland-realm-fixtures.ts";
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
    new URL("../tests/woodland-realm-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/woodland-realm-browser";
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
const panel = "[data-scenario-panel='the-woodland-realm']";
const stage = (s, code) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
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
  throw Error("The Woodland Realm opening did not finish");
}
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
      for (const easy of [false, true])
        for (const players of [1, 2, 3, 4]) {
          const stage2 = WR_STAGE2[(players - 1) % 3];
          const stage3 = WR_STAGE3[players % 3];
          const set = `set:${players + (easy ? 4 : 0)}`;
          await fresh(page, "the-woodland-realm", players, easy);
          await page.locator("#start-btn").click();
          const s = await build([stage2, stage3, set, "random"]);
          const q = s.woodlandRealm;
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
            wrRecipe()
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          // Spider Den and a different 0 cost enemy or location per player.
          assert.equal(s.staging.filter((u) => u.code === WR.den).length, 1);
          const zero = s.staging.filter((u) => u.code !== WR.den);
          assert.equal(zero.length, players);
          assert.equal(
            new Set(zero.map((u) => card(u.code).name)).size,
            players,
          );
          assert.ok(zero.every((u) => wrCost(u.code) === 0));
          assert.deepEqual((await resume(page)).woodlandRealm, q);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-side='1B']`).waitFor();
          await page.locator(`${panel} [data-den='staging']`).waitFor();
          await page
            .locator(`${panel} button[aria-label='Inspect Spider Den']`)
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
    await fresh(page, "the-woodland-realm", 2, false);
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
    s = await choose(page, WR.ambush);
    s = await choose(page, "random");
    assert.match(s.choice.title, /Choose encounter set 1 of 7/);
    await checkpoint("choose-encounter-sets", width);
    s = await choose(page, "set:1");
    s = await choose(page, "random");
    assert.match(
      s.choice.title,
      /^Captured by Spiders · The opposing team adds/,
    );
    await checkpoint("captured-by-spiders-setup", width);
    // Every quest card, front and back.
    for (const q of WR_QUESTS) {
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
    // Spider Den: its travel cost adds an enemy; explored, Mendor joins the first player.
    const den = base(1);
    takeBox(den, WR.den);
    stage(den, WR.den);
    den.encounterDiscard = [WR.spiders];
    den.phase = "travel";
    await load(page, den);
    await page.locator(`${panel} [data-den='staging']`).waitFor();
    s = await travel();
    assert.match(
      s.choice.title,
      /^Spider Den · The opposing team adds an enemy/,
    );
    await checkpoint("spider-den-travel", width);
    s = await choose(page, WR.spiders);
    await page.locator(`${panel} [data-den='active']`).waitFor();
    const rescued = base(1);
    mendor(rescued, 0);
    await load(page, rescued);
    await page.locator(`${panel} [data-mendor='0']`).waitFor();
    await page
      .locator(`${panel} button[aria-label='Inspect Mendor']`)
      .waitFor();
    await checkpoint("mendor", width);
    // 2A: the opposing team's search of the top 5 cards.
    const path = base(1);
    mendor(path, 0);
    path.encounterDeck = [WR.spawn, WR.beast, WR.giant, WR.spiders, WR.bear];
    path.progress = 10;
    check(path);
    flush(path);
    assert.match(
      path.choice.title,
      /^A Chosen Path · The opposing team chooses a card/,
    );
    await load(page, path);
    await page.locator(`${panel} [data-side='2A']`).waitFor();
    await checkpoint("a-chosen-path-search", width);
    s = await choose(page, WR.spiders);
    await page.locator(`${panel} [data-side='2B']`).waitFor();
    // Stage 2's progress cap after the commit.
    const capped = base(1);
    mendor(capped, 0);
    atQuest(capped, WR.path);
    capped.woodlandRealm.defeated = [WR.request];
    capped.woodlandRealm.cap = { round: capped.round, limit: 5, placed: 2 };
    await load(page, capped);
    await page.locator(`${panel} [data-cap='3']`).waitFor();
    await checkpoint("progress-cap", width);
    // Caught in a Web: the opposing team attaches it to a hero.
    const web = base(1);
    web.encounterDeck = [WR.web];
    web.queue.push(fx("reveal", { player: 0 }));
    flush(web);
    await load(page, web);
    s = await saved(page);
    if (s.choice?.title.startsWith("Revealed"))
      s = await choose(page, "resolve");
    assert.match(
      s.choice.title,
      /^Caught in a Web · The opposing team attaches/,
    );
    await checkpoint("caught-in-a-web", width);
    s = await choose(page, s.choice.options[0].id);
    assert.ok(
      s.heroes.some((h) => h.attachments.some((a) => a.code === WR.web)),
    );
    // The Forest of Great Fear: the enemy with a resource, and Turned Around.
    const fear = base(1);
    mendor(fear, 0);
    atQuest(fear, WR.fear);
    fear.woodlandRealm.defeated = [WR.request, WR.dark];
    forOwner(fear, 0, () => {
      const beast = make(fear, WR.beast);
      beast.resources = 1;
      fear.engaged.push(beast);
      fear.woodlandRealm.markedId = beast.id;
    });
    fear.questAttachments = {
      [WR.fear]: [{ id: "turned-1", code: WR.turned, exhausted: false }],
    };
    fear.progress = 20;
    check(fear);
    assert.equal(fear.status, "playing");
    await load(page, fear);
    await page.locator(`${panel} [data-marked='${WR.beast}']`).waitFor();
    await page.locator(`${panel} [data-turned='1']`).waitFor();
    await checkpoint("forest-of-great-fear", width);
    // To the Elvenking's Halls: defeated, the players win.
    const won = base(1);
    mendor(won, 0);
    atQuest(won, WR.halls);
    won.woodlandRealm.defeated = [WR.request, WR.dark];
    won.progress = 20;
    check(won);
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("players-win", width);
    void engaged;
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
    `The Woodland Realm browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
