import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx, make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { applyAction } from "../src/game/engine.ts";
import {
  KD,
  KNIFE_DARK_QUESTS,
  KNIFE_DARK_RECIPES,
} from "../src/game/knife-dark-support.ts";
import { SAGA_FRODO, ONE_RING } from "../src/game/lotr-saga-codes.ts";
import { oneRing } from "../src/game/lotr-saga.ts";
import { base, engaged, hand } from "../tests/knife-dark-fixtures.ts";
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
    new URL("../tests/knife-dark-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/knife-dark-browser";
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
const panel = "[data-scenario-panel='a-knife-in-the-dark']";
const stage = (s, code) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
async function travel(name) {
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
          await fresh(page, "a-knife-in-the-dark", players, easy);
          await page.locator("#start-btn").click();
          let s = await opening(page);
          for (let n = 0; s.choice && n < 20; n++)
            s = await choose(page, s.choice.options[0].id);
          const seats = s.table
            ? s.table.seats.map((p, i) => (i === s.table.active ? s : p))
            : [s];
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.knifeDark.setAside,
            ...s.knifeDark.hills.flatMap((h) => h.codes),
            ...s.staging.map((u) => u.code),
            ...seats.flatMap((p) => p.engaged.map((u) => u.code)),
            ...seats.flatMap((p) =>
              p.heroes.filter((h) => h.code === SAGA_FRODO).map((h) => h.code),
            ),
            ...seats.flatMap((p) =>
              [...p.heroes, ...p.allies]
                .flatMap((u) => u.attachments)
                .map((a) => a.code)
                .filter((c) => c.startsWith("octgn:")),
            ),
            ...(s.activeLocation ? [s.activeLocation.code] : []),
            ...KNIFE_DARK_QUESTS.map((c) => c.code),
          ].sort();
          assert.deepEqual(
            physical,
            KNIFE_DARK_RECIPES.find(
              (r) => r.mode === (easy ? "easy" : "standard"),
            )
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          const first = s.table?.first ?? 0;
          assert.ok(
            seats[first].heroes.some(
              (h) =>
                h.code === SAGA_FRODO &&
                h.attachments.some((a) => a.code === ONE_RING),
            ),
          );
          assert.deepEqual((await resume(page)).knifeDark, s.knifeDark);
          await page.locator(panel).waitFor();
          await page
            .locator(`${panel} [data-ringwraiths='${easy ? 2 : 4}']`)
            .waitFor();
          await page.locator(`${panel} [data-pony='in-play']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const index of [0, 1, 2]) {
      const s = base(1);
      s.stage = index + 1;
      s.knifeDark.currentQuest = KNIFE_DARK_QUESTS[index].code;
      if (index === 2) s.knifeDark.finale = true;
      if (index === 2) stage(s, KD.witchKing);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(KNIFE_DARK_QUESTS[index].code).name}`,
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
    // Bill Ferny at the beginning of the staging step.
    let ferny = base(1);
    stage(ferny, KD.ferny);
    ferny.phase = "quest";
    ferny.encounterDeck = Array(6).fill(KD.hills);
    ferny = applyAction(ferny, { type: "COMMIT" });
    assert.match(ferny.choice.title, /Bill Ferny/);
    await load(page, ferny);
    await checkpoint("bill-ferny", width);
    let s = await choose(page, "ringwraith");
    assert.equal(
      s.knifeDark.setAside.filter((c) => c === KD.ringwraith).length,
      3,
    );
    await page.locator(`${panel} [data-ringwraiths='3']`).waitFor();
    // The Prancing Pony: put an ally into play from the first player's hand.
    const pony = base(1);
    stage(pony, KD.pony);
    hand(pony, ["01014"]);
    pony.phase = "travel";
    await load(page, pony);
    await page.locator(`${panel} [data-pony='in-play']`).waitFor();
    s = await travel();
    assert.match(s.choice.title, /The Prancing Pony · Put an ally/);
    await checkpoint("prancing-pony", width);
    s = await choose(page, s.choice.options.find((o) => o.code === "01014").id);
    assert.ok(s.allies.some((u) => u.code === "01014"));
    // Midgewater: the engaged enemies return to the staging area.
    const marsh = base(1);
    marsh.stage = 2;
    marsh.knifeDark.currentQuest = KD.wild;
    marsh.knifeDark.setAside = marsh.knifeDark.setAside.filter(
      (c) => c !== KD.midgewater,
    );
    engaged(marsh, KD.shady);
    stage(marsh, KD.midgewater);
    marsh.phase = "travel";
    await load(page, marsh);
    await page.locator(`${panel} [data-midgewater='in-play']`).waitFor();
    s = await travel();
    assert.equal(s.engaged.length, 0);
    assert.ok(s.staging.some((u) => u.code === KD.shady));
    await checkpoint("midgewater", width);
    // Weather Hills: a non-unique enemy hides under the location.
    const hills = base(1);
    stage(hills, KD.hills);
    engaged(hills, KD.ringwraith);
    hills.phase = "travel";
    await load(page, hills);
    s = await travel();
    assert.match(s.choice.title, /Weather Hills/);
    await checkpoint("weather-hills", width);
    s = await choose(
      page,
      s.choice.options.find((o) => o.code === KD.ringwraith).id,
    );
    assert.equal(s.knifeDark.hills.length, 1);
    await page.locator(`${panel} [data-hidden='1']`).waitFor();
    // Weathertop: exhaust The One Ring to travel there.
    const top = base(1);
    top.stage = 3;
    top.knifeDark.currentQuest = KD.attack;
    top.knifeDark.setAside = [];
    top.knifeDark.finale = true;
    stage(top, KD.weathertop);
    stage(top, KD.witchKing);
    top.phase = "travel";
    await load(page, top);
    await page.locator(`${panel} [data-weathertop='in-play']`).waitFor();
    s = await travel();
    assert.equal(s.activeLocation.code, KD.weathertop);
    assert.equal(oneRing(s).exhausted, true);
    await page.locator(`${panel} [data-ring-exhausted='true']`).waitFor();
    await checkpoint("weathertop", width);
    // Stage 3A brings every Nazgûl; with none left in play the players win.
    const attack = base(1);
    attack.stage = 2;
    attack.knifeDark.currentQuest = KD.wild;
    attack.knifeDark.setAside = [KD.witchKing, KD.weathertop];
    attack.encounterDeck = [KD.hills, KD.ringwraith, KD.hills];
    attack.queue.push(fx("kdNextStage", { player: 0 }));
    flush(attack);
    assert.equal(attack.stage, 3);
    await load(page, attack);
    await page.locator(`${panel} [data-nazgul='2']`).waitFor();
    await checkpoint("ringwraiths-attack", width);
    const won = structuredClone(attack);
    won.staging = won.staging.filter(
      (u) => ![KD.witchKing, KD.ringwraith].includes(u.code),
    );
    won.queue.push(fx("kdMidgewaterReturn", { player: 0 }));
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("nazgul-driven-off", width);
    // The One Ring leaves play: the players lose.
    const lost = base(1);
    const frodo = lost.heroes.find((h) => h.code === SAGA_FRODO);
    lost.queue.push(fx("damage", { target: frodo.id, value: 9, player: 0 }));
    flush(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("ring-lost", width);
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
    `A Knife in the Dark browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
