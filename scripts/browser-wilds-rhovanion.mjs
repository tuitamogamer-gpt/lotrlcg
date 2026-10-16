import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/wilds-rhovanion-browser-fixtures.ts";
import {
  WILDS_RHOVANION as W,
  WILDS_RHOVANION_QUESTS,
} from "../src/game/wilds-rhovanion-support.ts";
import { card, plain, imageUrl as cardImage } from "../src/game/cards.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  context,
  fresh,
  load,
  opening,
  report,
  resume,
  saved,
  settle,
} from "./browser-angmar-helpers.mjs";
const widths = process.env.WILDS_RHOVANION_WIDTHS
  ? process.env.WILDS_RHOVANION_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(widths.length && widths.every((n) => [1280, 390, 320].includes(n)));
const dir = process.env.WILDS_RHOVANION_OUTPUT_DIR ?? "output/wilds-rhovanion";
await fs.mkdir(dir, { recursive: true });
const sourceScriptSha256 = crypto
  .createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const bundles = await Promise.all(
  ["journey-up-the-anduin", "lost-in-mirkwood", "the-king-s-quest"].map(
    async (slug) =>
      JSON.parse(
        await fs.readFile(`src/data/pending/${slug}-import.json`, "utf8"),
      ),
  ),
);
const originals = [
    ...new Map(
      bundles.flatMap((b) => b.cards).map((c) => [c.code, c]),
    ).values(),
  ],
  art = [
    ...new Map(
      bundles.flatMap((b) => b.artwork).map((a) => [a.localPath, a]),
    ).values(),
  ];
const browser = await chromium.launch({ headless: true }),
  errors = [],
  screenshots = [],
  entries = new Set(),
  checks = [],
  printedFaces = new Set(),
  artwork = [];
let page;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
const close = async (p) =>
  p.getByRole("button", { name: "Close dialog", exact: true }).last().click();
async function checkpoint(p, label, width) {
  await reviewedState(p);
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
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
    reverse ? expected.imagesrc : cardImage(c),
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
  printedFaces.add(reverse ? expected.imagesrc : cardImage(c));
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
    for (const id of [
      "journey-up-the-anduin",
      "lost-in-mirkwood",
      "the-kings-quest",
    ])
      for (const players of [1, 2, 3, 4])
        for (const easy of [false, true]) {
          await fresh(page, id, players, easy);
          await page.locator("#start-btn").click();
          const s = await opening(page);
          assert.equal(s.scenarioId, id);
          assert.ok(s.wildsRhovanion.initialized);
          assert.equal(s.stage, 1);
          assert.equal(
            await page
              .locator('[data-scenario-panel="wilds-rhovanion"]')
              .count(),
            1,
          );
          await checkpoint(
            page,
            `setup-${id}-${players}-${easy ? "easy" : "standard"}`,
            width,
          );
          assert.deepEqual(
            (await resume(page)).wildsRhovanion,
            s.wildsRhovanion,
          );
        }
    {
      const f = F.wildsDeep();
      await load(page, f.s);
      await boardCard(page, f.location.id)
        .getByRole("button", { name: "Travel here", exact: true })
        .click();
      await reviewedState(page);
      await resume(page);
      const s = await settle(page);
      assert.equal(s.activeLocation?.id, f.cave.id);
      assert.ok(s.encounterDiscard.includes(W.tunnel));
      await checkpoint(page, "native-deep-caves-replacement", width);
    }
    for (const code of [W.hilltop, W.clearing]) {
      const f = F.wildsBranch(code);
      await load(page, f.s);
      await boardCard(page, f.location.id)
        .getByRole("button", { name: "Travel here", exact: true })
        .click();
      await reviewedState(page);
      await resume(page);
      const s = await settle(page);
      assert.equal(s.stage, 2);
      assert.equal(
        s.wildsRhovanion.currentQuest,
        code === W.hilltop ? W.spiders : W.orcs,
      );
      await checkpoint(
        page,
        `native-mirkwood-branch-${code === W.hilltop ? "a" : "c"}`,
        width,
      );
    }
    for (const [code, id] of [
      [W.frenzied, "journey-up-the-anduin"],
      [W.supplies, "journey-up-the-anduin"],
      [W.gloom, "lost-in-mirkwood"],
      [W.afraid, "the-kings-quest"],
      [W.darkPlaces, "the-kings-quest"],
    ]) {
      const f = F.wildsReveal(code, id);
      await load(page, f.s);
      await page
        .getByRole("button", {
          name: `Commit ${card(f.hero.code).name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Commit & reveal", exact: true })
        .last()
        .click();
      await reviewedState(page);
      await checkpoint(
        page,
        `native-reveal-${code.slice(6, 14)}-pending`,
        width,
      );
      await resume(page);
      const s = await settle(page);
      assert.equal(s.status, "playing");
      await checkpoint(
        page,
        `native-reveal-${code.slice(6, 14)}-resolved`,
        width,
      );
    }
    {
      const f = F.wildsBoss();
      await load(page, f.s);
      await boardCard(page, f.boss.id)
        .getByRole("button", { name: "Attack", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: card(f.hero.code).name, exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /^Attack ·/ })
        .click();
      const s = await settle(page);
      assert.equal(s.status, "won");
      assert.equal(s.progress, 0);
      await checkpoint(page, "native-fire-drake-paid-attack-victory", width);
    }
    const encounters = originals
      .filter((c) => c.type_code !== "quest")
      .map((c) => card(c.code));
    let s = F.wildsDeep().s;
    s.encounterDiscard = encounters.map((c) => c.code);
    await load(page, s);
    await page
      .getByRole("button", {
        name: `Browse encounter discard: ${encounters.length} cards`,
        exact: true,
      })
      .click();
    for (const c of encounters) {
      await page
        .locator(".pile-entry")
        .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
        .getByRole("button")
        .first()
        .click();
      await printed(page, c);
      await checkpoint(
        page,
        `printed-encounter-${c.code.replace("octgn:", "")}`,
        width,
      );
      if (c.back_imagesrc) {
        await page
          .getByRole("button", { name: "Show reverse", exact: true })
          .click();
        await printed(page, c, true);
        await checkpoint(
          page,
          `printed-encounter-${c.code.replace("octgn:", "")}-reverse`,
          width,
        );
      }
      await close(page);
    }
    await close(page);
    for (const c of WILDS_RHOVANION_QUESTS) {
      const id =
        c.encounter_set === "Journey Up the Anduin"
          ? "journey-up-the-anduin"
          : c.encounter_set === "Lost in Mirkwood"
            ? "lost-in-mirkwood"
            : "the-kings-quest";
      s = F.wildsReveal(W.darkPlaces, id).s;
      await load(page, s);
      const details = page.locator(
        '[data-scenario-panel="wilds-rhovanion"] details',
      );
      await details.locator("summary").click();
      await details
        .getByRole("button", {
          name: `${c.cost}${[W.orcs, W.trulyLost, W.escape].includes(c.code) ? "C/D" : "A/B"} · ${c.name}`,
          exact: true,
        })
        .click();
      await printed(page, card(c.code));
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await printed(page, card(c.code), true);
      await checkpoint(
        page,
        `printed-quest-${c.code.replace("octgn:", "")}-both-faces`,
        width,
      );
      await close(page);
    }
    await view.c.close();
  }
  const artPage = await browser.newPage();
  for (const a of art) {
    const response = await artPage.request.get(
      new URL(a.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178")
        .href,
    );
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      a.sha256,
    );
    const decoded = await artPage.evaluate(
      async (bytes) => {
        const bmp = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const r = { width: bmp.width, height: bmp.height };
        bmp.close();
        return r;
      },
      [...bytes],
    );
    assert.ok(decoded.width && decoded.height);
    artwork.push({ path: a.localPath, sha256: a.sha256, ...decoded });
  }
  assert.deepEqual(
    [...printedFaces].sort(),
    art.map((a) => a.localPath).sort(),
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
    `Wilds of Rhovanion browser passed ${checks.length} checkpoints, ${artwork.length} original faces`,
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
