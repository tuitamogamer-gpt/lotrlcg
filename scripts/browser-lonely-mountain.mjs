import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  TLM as T,
  TLM_QUESTS,
  TLM_RECIPES,
} from "../src/game/lonely-mountain-support.ts";
import { EREBOR_TREASURES, OTD_BILBO } from "../src/game/hobbit-codes.ts";
import { base, deck, hand } from "../tests/lonely-mountain-fixtures.ts";
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
    new URL("../tests/lonely-mountain-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/lonely-mountain-browser";
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
const GUARD = "01013";
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
          await fresh(page, "the-lonely-mountain", players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.phase, "resource");
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...s.lonelyMountain.setAside.map((u) => u.code),
            ...s.lonelyMountain.stack,
            ...TLM_QUESTS.map((c) => c.code),
            OTD_BILBO,
          ].sort();
          assert.deepEqual(
            physical,
            TLM_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.lonelyMountain.stack.length, 5);
          assert.deepEqual(
            (await resume(page)).lonelyMountain,
            s.lonelyMountain,
          );
          await page
            .locator("[data-scenario-panel='the-lonely-mountain']")
            .waitFor();
          await page.locator("[data-treasure-stack='5']").waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    for (const index of [0, 2]) {
      const s = base(1);
      if (index === 2) handle(s, fx("tlmStageThree", { player: 0 }));
      else {
        s.stage = 1;
        s.lonelyMountain.currentQuest = T.welcome;
      }
      flush(s);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(TLM_QUESTS[index].code).name}`,
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
    // Stage 2B: a successful burgle takes the top treasure and may advance.
    const burgle = base(1);
    burgle.lonelyMountain.stack = [...EREBOR_TREASURES];
    burgle.encounterDeck = [T.path, T.belching, T.path];
    deck(burgle, Array(4).fill(GUARD));
    hand(burgle, [GUARD]);
    burgle.phase = "quest";
    handle(burgle, fx("questSucceeded", { value: 1, player: 0 }));
    flush(burgle);
    assert.match(burgle.choice.title, /Burgle attempt/);
    await load(page, burgle);
    await page.locator("[data-burgle]").waitFor();
    await page.locator("[data-smaug-progress='1']").waitFor();
    await checkpoint("burgle-attempt", width);
    let s = await choose(page, "discard");
    assert.deepEqual(s.lonelyMountain.treasures, [EREBOR_TREASURES[0]]);
    assert.ok(s.hand.some((u) => u.code === EREBOR_TREASURES[0]));
    assert.match(s.choice.title, /Advance to stage 3/);
    await page.locator("[data-treasure-stack='4']").waitFor();
    await checkpoint("burgled-treasure", width);
    s = await choose(page, "advance");
    assert.equal(s.lonelyMountain.currentQuest, T.inside);
    assert.ok(s.staging.some((u) => u.code === T.magnificent));
    await page.locator("[data-smaug-damage='0']").waitFor();
    await checkpoint("inside-information", width);
    // Smaug the Golden's 6th progress token wakes him: stage 4A.
    const wake = base(1);
    wake.staging.find((u) => u.code === T.golden).progress = 5;
    wake.phase = "quest";
    handle(wake, fx("questSucceeded", { value: 1, player: 0 }));
    flush(wake);
    assert.equal(wake.lonelyMountain.currentQuest, T.thieves);
    await load(page, wake);
    await page.locator("[data-smaug-damage='0']").waitFor();
    await checkpoint("smaug-wakes", width);
    // Victory at stage 3 once Smaug the Magnificent has left play.
    const victory = base(1);
    victory.lonelyMountain.treasures = [EREBOR_TREASURES[1]];
    victory.lonelyMountain.stack = EREBOR_TREASURES.filter(
      (c) => c !== EREBOR_TREASURES[1],
    );
    handle(victory, fx("tlmStageThree", { player: 0 }));
    flush(victory);
    victory.staging = victory.staging.filter(
      (u) => ![T.magnificent, T.patch].includes(u.code),
    );
    victory.lonelyMountain.setAside = victory.lonelyMountain.setAside.filter(
      (u) => u.code === T.golden,
    );
    victory.encounterDiscard.push(T.patch);
    victory.removedEncounter = [T.magnificent];
    victory.phase = "staging";
    victory.heroes[0].committed = true;
    victory.heroes[0].exhausted = true;
    victory.heroes[0].tempWill = 40;
    await load(page, victory);
    s = await next(page);
    assert.equal(s.status, "won");
    assert.deepEqual(s.lonelyMountain.treasures, [EREBOR_TREASURES[1]]);
    await checkpoint("lonely-mountain-victory", width);
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
    `The Lonely Mountain browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
