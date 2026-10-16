import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/cirith-gurat-browser-fixtures.ts";
import {
  CIRITH_GURAT as C,
  CIRITH_GURAT_MAIN_QUESTS,
} from "../src/game/cirith-gurat-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { allEngaged } from "../src/game/table.ts";
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
  settle,
} from "./browser-angmar-helpers.mjs";
const widths = process.env.CIRITH_GURAT_WIDTHS
  ? process.env.CIRITH_GURAT_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(widths.length && widths.every((n) => [1280, 390, 320].includes(n)));
const dir = process.env.CIRITH_GURAT_OUTPUT_DIR ?? "output/cirith-gurat";
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
  printedFaces = new Set(),
  artwork = [];
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
  else if (await rules.count())
    assert.equal(await rules.textContent(), "No additional abilities.");
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
async function defend(p, enemy, defender) {
  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Defend", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(defender.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
}
const bundle = JSON.parse(
  await fs.readFile(
    "src/data/pending/the-dungeons-of-cirith-gurat-import.json",
    "utf8",
  ),
);
const encounters = bundle.cards
  .filter((c) => c.type_code !== "quest")
  .map((c) => card(c.code));
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
    for (const players of [1, 2, 3, 4])
      for (const easy of [false, true]) {
        await fresh(page, "the-dungeons-of-cirith-gurat", players, easy);
        await page.locator("#start-btn").click();
        const s = await opening(page);
        assert.equal(s.scenarioId, "the-dungeons-of-cirith-gurat");
        assert.equal(s.stage, 1);
        assert.ok(s.cirithGurat.initialized);
        assert.equal(s.cirithGurat.captives.length, players + 1);
        assert.equal(new Set(s.cirithGurat.setupOrcs).size, players);
        assert.equal(s.encounterDeck.length, (easy ? 32 : 42) - players);
        assert.equal(
          await page.locator('[data-scenario-panel="cirith-gurat"]').count(),
          1,
        );
        await checkpoint(
          page,
          `setup-${players}-${easy ? "easy" : "standard"}`,
          width,
        );
        assert.deepEqual((await resume(page)).cirithGurat, s.cirithGurat);
      }
    for (const code of [C.gate, C.guardroom, C.mines]) {
      const f = F.cirithTravel(code);
      await load(page, f.s);
      await boardCard(page, f.location.id)
        .getByRole("button", { name: "Travel here", exact: true })
        .click();
      await reviewedState(page);
      await resume(page);
      const s = await settle(page);
      assert.equal(s.activeLocation?.id, f.location.id);
      await checkpoint(page, `native-travel-${code.slice(6, 14)}`, width);
    }
    for (const code of [C.prisoner, C.tormented, C.torture, C.captured]) {
      const f = F.cirithReveal(code);
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
    for (const code of [C.jailer, C.prisoner, C.warg, C.tormented]) {
      const f = F.cirithShadow(code);
      await load(page, f.s);
      await defend(page, f.enemy, f.defender);
      const s = await settle(page);
      await resume(page);
      assert.equal(s.status, "playing");
      await checkpoint(page, `native-shadow-${code.slice(6, 14)}`, width);
    }
    for (const stage of [1, 2]) {
      const f = F.cirithQuest(stage);
      await load(page, f.s);
      await page
        .getByRole("button", { name: "Resolve quest", exact: true })
        .last()
        .click();
      await reviewedState(page);
      await resume(page);
      const s = await settle(page);
      assert.equal(s.stage, stage + 1);
      await checkpoint(page, `native-stage-${stage}-advance`, width);
    }
    {
      const f = F.cirithVictory();
      await load(page, f.s);
      await boardCard(page, f.guard.id)
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
      await checkpoint(page, "native-last-rescue-victory", width);
      await resume(page);
    }
    let s = F.cirithTravel().s;
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
      await checkpoint(page, `printed-encounter-${c.code.slice(6, 14)}`, width);
      await close(page);
    }
    await close(page);
    for (const [i, c] of CIRITH_GURAT_MAIN_QUESTS.map(card).entries()) {
      s = F.cirithTravel().s;
      await load(page, s);
      const details = page.locator(
        '[data-scenario-panel="cirith-gurat"] details',
      );
      await details.locator("summary").click();
      await details
        .getByRole("button", { name: `${i + 1}A/B · ${c.name}`, exact: true })
        .click();
      await printed(page, c);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await printed(page, c, true);
      await checkpoint(page, `printed-quest-${i + 1}-both-faces`, width);
      await close(page);
    }
    await view.c.close();
  }
  const artPage = await browser.newPage();
  for (const a of bundle.artwork) {
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
    `Cirith Gurat browser passed ${checks.length} checkpoints, ${artwork.length} original faces`,
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
