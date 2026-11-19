import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { revealed } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { NIGHTMARE_CORE as N } from "../src/game/nightmare.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  load,
  opening,
  report,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";

const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/nightmare-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/nightmare-browser";
await fs.mkdir(dir, { recursive: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
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
    // Passage Through Mirkwood in Nightmare mode, from the lobby.
    await page.evaluate(() => {
      for (const k of [
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
      localStorage.setItem("there-and-back-again.mode.v1", "normal");
    });
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page.locator(".mission-mirkwood").click();
    await page.locator(".easy-toggle input").setChecked(true);
    const nightmare = page.locator(".nightmare-toggle input");
    await nightmare.setChecked(true);
    assert.equal(await page.locator(".easy-toggle input").isChecked(), false);
    await checkpoint("lobby", width);
    await page.locator("#start-btn").click();
    let s = await opening(page);
    assert.equal(s.scenarioId, "mirkwood");
    assert.equal(s.nightmareMode, true);
    assert.equal(s.easyMode, undefined);
    const names = s.staging.map((u) => card(u.code).name);
    assert.ok(names.includes("Forest Spider"), names.join());
    assert.ok(names.includes("Old Forest Road"), names.join());
    assert.ok(s.staging.length >= 3, "the setup card's reveal");
    // The Nightmare card in the quest inspector, its rules side first.
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/each player revealed 1 card/)
      .waitFor();
    await checkpoint("nightmare-card", width);
    await page
      .getByRole("button", {
        name: "Nightmare card · Passage Through Mirkwood",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByText(/You are playing Nightmare mode\./)
      .first()
      .waitFor();
    await checkpoint("nightmare-detail", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // The Spider's Web: the highest-threat player's heroes are exhausted, and
    // it attaches to one of them.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "staging", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      revealed(t, N.web);
      flush(t);
      s = await load(page, t);
    }
    assert.match(
      s.choice.title,
      /^The Spider's Web · Attach it to one of your heroes/,
    );
    await checkpoint("spiders-web", width);
    s = await choose(page, s.heroes[0].id);
    assert.ok(s.heroes[0].attachments.some((a) => a.code === N.web));
    assert.ok(s.heroes.every((h) => h.exhausted));
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
    artwork,
  });
  console.log(
    `The Nightmare browser passed ${checks.length} checkpoints and ${artwork.length} original faces`,
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
