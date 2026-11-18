import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { check } from "../src/game/board.ts";
import {
  MM,
  MM_QUESTS,
  MM_STAGE2,
  MM_STAGE3,
  mmRecipe,
} from "../src/game/mines-moria-support.ts";
import {
  atQuest,
  base,
  chamber,
  watcher,
} from "../tests/mines-moria-fixtures.ts";
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
    new URL("../tests/mines-moria-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/mines-moria-browser";
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
const panel = "[data-scenario-panel='the-mines-of-moria']";
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
  throw Error("The Mines of Moria opening did not finish");
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
          const stage2 = MM_STAGE2[(players - 1) % 3];
          const stage3 = MM_STAGE3[players % 3];
          const set = `set:${players + (easy ? 6 : 2)}`;
          await fresh(page, "the-mines-of-moria", players, easy);
          await page.locator("#start-btn").click();
          const s = await build([stage2, stage3, set, "random"]);
          const q = s.minesMoria;
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
            mmRecipe()
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          // 1A: The Watcher, and a resource for each hero.
          assert.deepEqual(
            s.staging.map((u) => u.code),
            [MM.watcher],
          );
          assert.ok(
            s.heroes.every((h) => h.resources === (easy ? 3 : 2)),
            "each hero has 1A's resource and the round's",
          );
          assert.deepEqual((await resume(page)).minesMoria, q);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-side='1B']`).waitFor();
          await page.locator(`${panel} [data-watcher='staging']`).waitFor();
          await page
            .locator(`${panel} button[aria-label='Inspect The Watcher']`)
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
    await fresh(page, "the-mines-of-moria", 2, false);
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
    s = await choose(page, MM.narrow);
    s = await choose(page, "random");
    assert.match(s.choice.title, /Choose encounter set 1 of 7/);
    await checkpoint("choose-encounter-sets", width);
    s = await choose(page, "set:1");
    s = await choose(page, "random");
    await checkpoint("choose-sets-done", width);
    // Every quest card, front and back.
    for (const q of MM_QUESTS) {
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
    // The Watcher at the West-door: with 5 progress it is engaged with each player.
    const west = base(1);
    watcher(west);
    west.progress = 5;
    await load(page, west);
    await page.locator(`${panel} [data-watcher='staging']`).waitFor();
    await checkpoint("the-watcher", width);
    // Chamber of Mazarbul in the staging area.
    const room = base(1);
    chamber(room);
    atQuest(room, MM.presence);
    await load(page, room);
    await page.locator(`${panel} [data-chamber='staging']`).waitFor();
    await page
      .locator(`${panel} button[aria-label='Inspect Chamber of Mazarbul']`)
      .waitFor();
    await checkpoint("chamber-of-mazarbul", width);
    // 2A: the opposing team's search of the top 5 cards.
    const pit = base(1);
    chamber(pit);
    pit.encounterDeck = [MM.brood, MM.savage, MM.hall, MM.bats, MM.forge];
    pit.progress = 5;
    check(pit);
    flush(pit);
    assert.match(
      pit.choice.title,
      /^Journey in the Black Pit · The opposing team chooses a card/,
    );
    await load(page, pit);
    await page.locator(`${panel} [data-side='2A']`).waitFor();
    await checkpoint("journey-in-the-black-pit-search", width);
    s = await choose(page, MM.hall);
    await page.locator(`${panel} [data-side='2B']`).waitFor();
    // A Presence in the Dark: the opposing team orders the top 2 cards.
    const presence = base(1);
    chamber(presence);
    atQuest(presence, MM.presence);
    presence.minesMoria.defeated = [MM.request];
    presence.encounterDeck = [MM.hall, MM.savage, MM.forge];
    presence.queue.push(fx("mmPresence", { player: 0 }));
    flush(presence);
    await load(page, presence);
    s = await saved(page);
    assert.match(
      s.choice.title,
      /^A Presence in the Dark · The opposing team puts/,
    );
    await checkpoint("a-presence-in-the-dark", width);
    s = await choose(page, "bottom:0");
    // Narrow Paths guards an attachment; Hidden Threat waits under the quest.
    const narrow = base(1);
    chamber(narrow);
    atQuest(narrow, MM.narrow);
    narrow.minesMoria.defeated = [MM.request];
    narrow.minesMoria.guarded = [
      {
        owner: 0,
        attachment: {
          id: "guarded-1",
          code: "01039",
          exhausted: false,
          owner: 0,
        },
      },
    ];
    narrow.minesMoria.hidden = [MM.hall];
    narrow.minesMoria.box.splice(narrow.minesMoria.box.indexOf(MM.hall), 1);
    await load(page, narrow);
    await page.locator(`${panel} [data-guarded='1']`).waitFor();
    await page.locator(`${panel} [data-hidden='1']`).waitFor();
    await checkpoint("narrow-paths-hidden-threat", width);
    // The Fate of Balin: the first player's choice at the staging step.
    const balin = base(1);
    chamber(balin);
    atQuest(balin, MM.balin);
    balin.minesMoria.defeated = [MM.request, MM.presence];
    balin.phase = "staging";
    balin.queue.push(fx("mmBalin", { player: 0 }));
    flush(balin);
    await load(page, balin);
    s = await saved(page);
    assert.match(s.choice.title, /^The Fate of Balin · Reveal an additional/);
    await checkpoint("the-fate-of-balin", width);
    s = await choose(page, "cap");
    await page.locator(`${panel} [data-cap='5']`).waitFor();
    // Continuing Eastward, defeated with Chamber of Mazarbul explored: the players win.
    const won = base(1);
    atQuest(won, MM.eastward);
    won.minesMoria.defeated = [MM.request, MM.presence];
    won.minesMoria.box.splice(won.minesMoria.box.indexOf(MM.watcher), 1);
    won.victoryCards = [MM.chamber];
    won.victory = 5;
    won.progress = 15;
    check(won);
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("players-win", width);
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
    `The Mines of Moria browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
