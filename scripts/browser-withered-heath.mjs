import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { card, plain } from "../src/game/cards.ts";
import {
  WITHERED_HEATH as H,
  WITHERED_HEATH_MAIN_QUESTS,
} from "../src/game/withered-heath-support.ts";
import { make } from "../src/game/core.ts";
import { syncSeat } from "../src/game/table.ts";
import {
  base,
  finalFixture,
  travelFixture,
} from "../tests/withered-heath-fixtures.ts";
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
  settle,
  url,
} from "./browser-angmar-helpers.mjs";
import { reviewedState } from "./browser-review-helpers.mjs";

const widths = process.env.WITHERED_HEATH_WIDTHS
  ? process.env.WITHERED_HEATH_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(widths.length && widths.every((n) => [1280, 390, 320].includes(n)));
const dir = process.env.WITHERED_HEATH_OUTPUT_DIR ?? "output/withered-heath";
await fs.mkdir(dir, { recursive: true });
const sourceScriptSha256 = crypto
  .createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const browser = await chromium.launch({ headless: true }),
  errors = [],
  screenshots = [],
  entries = new Set(),
  checks = [],
  artwork = [],
  printedFaces = new Set();
const bundle = JSON.parse(
  await fs.readFile("src/data/pending/the-withered-heath-import.json", "utf8"),
);
let page;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function checkpoint(p, label, width) {
  await reviewedState(p);
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function close(p) {
  await p
    .getByRole("button", { name: "Close dialog", exact: true })
    .last()
    .click();
}
async function printed(p, c, reverse = false) {
  const expected = reverse
    ? {
        ...c,
        name: c.back_name ?? c.name,
        text: c.back_text,
        imagesrc: c.back_imagesrc,
        shadow: undefined,
      }
    : c;
  assert.equal(
    await p.locator("[data-card-primary-name]").textContent(),
    expected.name,
  );
  const rules = p.locator("[data-card-primary-rules]");
  if (plain(expected.text))
    assert.equal(await rules.textContent(), plain(expected.text));
  const img = p.locator(".card-detail img[data-card-code]");
  assert.equal(
    new URL(await img.getAttribute("src"), p.url()).pathname,
    expected.imagesrc,
  );
  assert.ok(
    await img.evaluate(async (i) => {
      await i.decode();
      return i.naturalWidth > 0;
    }),
  );
  const shadow = p.locator(".card-detail-primary .shadow-text");
  if (expected.shadow)
    assert.equal(await shadow.textContent(), plain(expected.shadow));
  else assert.equal(await shadow.count(), 0);
  printedFaces.add(expected.imagesrc);
}
try {
  for (const width of widths) {
    const view = await context(
      browser,
      width,
      width === 1280 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    const players = width === 1280 ? 1 : width === 390 ? 4 : 2,
      easy = width === 390;
    await fresh(page, "the-withered-heath", players, easy);
    await page.locator("#start-btn").click();
    let s = await opening(page);
    assert.equal(s.scenarioId, "the-withered-heath");
    assert.ok(s.witheredHeath.initialized);
    assert.equal(s.witheredHeath.cavesDeck.length, 8);
    assert.equal(s.witheredHeath.setAside.length, 3);
    assert.equal(s.staging.length, players);
    assert.equal(
      await page.locator('[data-scenario-panel="withered-heath"]').count(),
      1,
    );
    await checkpoint(
      page,
      `setup-${players}-${easy ? "easy" : "standard"}`,
      width,
    );
    assert.deepEqual((await resume(page)).witheredHeath, s.witheredHeath);
    // A native travel action pays threat, replaces the active location with the
    // actual Caves objective and discards treacheries until its enemy guard.
    const f = travelFixture();
    await load(page, f.s);
    await boardCard(page, f.location.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    s = await settle(page);
    assert.equal(s.activeLocation, null);
    assert.equal(s.threat, 21);
    assert.equal(s.witheredHeath.guards[0].sign.id, f.sign.id);
    assert.ok(s.encounterDiscard.includes(H.snow));
    assert.equal(
      s.heroes.some((h) => h.exhausted),
      false,
    );
    assert.ok(s.staging.some((u) => u.code === H.hatchling));
    await checkpoint(page, "native-deep-dragon-sign-guard", width);
    assert.deepEqual(
      (await resume(page)).witheredHeath.guards,
      s.witheredHeath.guards,
    );
    // Printed objective and current quest use the real inspector and both faces.
    await page
      .locator('[data-scenario-panel="withered-heath"]')
      .getByRole("button", { name: "Inspect Dragon Sign", exact: true })
      .click();
    await printed(page, card(H.sign));
    await close(page);
    await page
      .locator('[data-scenario-panel="withered-heath"]')
      .getByRole("button", { name: "Inspect current quest", exact: true })
      .click();
    await printed(page, card(H.search), true);
    await close(page);
    // Native staging reveals Heavy Snow, then its pending exhaust choice survives
    // browser reload before the owner chooses a real character.
    const snow = base();
    snow.phase = "quest";
    snow.heroes[2].tempWill = 20;
    snow.encounterDeck = [H.snow, ...Array(20).fill(H.pass)];
    syncSeat(snow);
    await load(page, snow);
    await page
      .getByRole("button", {
        name: `Commit ${card(snow.heroes[2].code).name}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .last()
      .click();
    await reviewedState(page);
    s = await saved(page);
    if (s.choice?.options.some((o) => o.id === "resolve"))
      s = await choose(page, "resolve");
    assert.match(s.choice?.title ?? "", /Heavy Snow/);
    await resume(page);
    s = await settle(page);
    assert.equal(s.witheredHeath.playerReadyBlockedRound, s.round);
    assert.equal(
      s.threat,
      21,
      "Heavy Snow's native Doomed 1 resolves before its exhaust effect",
    );
    assert.ok(s.heroes.filter((h) => h.exhausted).length >= 2);
    await checkpoint(page, "native-heavy-snow-resolved", width);
    const boss = finalFixture();
    await load(page, boss.s);
    await boardCard(page, boss.boss.id)
      .getByRole("button", { name: "Attack", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: card(boss.hero.code).name, exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Attack ·/ })
      .click();
    s = await settle(page);
    assert.equal(s.status, "won");
    assert.ok(s.victoryCards.includes(H.drake));
    await checkpoint(page, "native-cold-drake-victory", width);
    await resume(page);
    // One width covers every printed face; responsive behavior is covered above.
    if (width === widths[0]) {
      const inspect = base();
      inspect.phase = "travel";
      inspect.staging.push(make(inspect, H.pass));
      inspect.encounterDiscard = bundle.cards
        .filter(
          (c) =>
            c.type_code !== "quest" && c.code !== H.sign && c.code !== H.drake,
        )
        .map((c) => c.code);
      syncSeat(inspect);
      await load(page, inspect);
      await page
        .getByRole("button", {
          name: `Browse encounter discard: ${inspect.encounterDiscard.length} cards`,
          exact: true,
        })
        .click();
      for (const code of inspect.encounterDiscard) {
        const c = card(code);
        await page
          .locator(".pile-entry")
          .filter({ has: page.locator(`img[data-card-code="${code}"]`) })
          .getByRole("button")
          .first()
          .click();
        await printed(page, c);
        await close(page);
      }
      await close(page);
      await page
        .locator('[data-scenario-panel="withered-heath"]')
        .getByRole("button", { name: "Inspect Cold-Drake", exact: true })
        .click();
      await printed(page, card(H.drake));
      await close(page);
      const details = page.locator(
        '[data-scenario-panel="withered-heath"] details',
      );
      await details.locator("summary").click();
      for (const [i, code] of WITHERED_HEATH_MAIN_QUESTS.entries()) {
        await details
          .getByRole("button", {
            name: `${i + 1}A/B · ${card(code).name}`,
            exact: true,
          })
          .click();
        await printed(page, card(code));
        await page
          .getByRole("button", { name: "Show reverse", exact: true })
          .click();
        await printed(page, card(code), true);
        await close(page);
      }
      await checkpoint(page, "all-printed-faces-inspected", width);
    }
    await view.c.close();
  }
  const artPage = await browser.newPage();
  for (const a of bundle.artwork) {
    const response = await artPage.request.get(new URL(a.localPath, url).href);
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      a.sha256,
    );
    const decoded = await artPage.evaluate(
      async (bytes) => {
        const bmp = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const result = { width: bmp.width, height: bmp.height };
        bmp.close();
        return result;
      },
      [...bytes],
    );
    assert.ok(decoded.width && decoded.height);
    artwork.push({ path: a.localPath, sha256: a.sha256, ...decoded });
  }
  assert.deepEqual(
    [...printedFaces].sort(),
    bundle.artwork.map((a) => a.localPath).sort(),
  );
  await artPage.close();
  await report(dir, {
    smoke: widths.join(",") !== "1280,390,320",
    sourceScriptSha256,
    errors,
    screenshots,
    entries,
    checks,
    printedFaces: [...printedFaces],
    artwork,
  });
  console.log(
    `Withered Heath browser passed ${checks.length} checkpoints and ${artwork.length} original faces`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        error: String(error),
        stack: error.stack,
        checks,
        errors,
        printedFaces: [...printedFaces],
        artwork,
      },
      null,
      2,
    ),
  );
  if (page && !page.isClosed())
    await page.screenshot({ path: `${dir}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
