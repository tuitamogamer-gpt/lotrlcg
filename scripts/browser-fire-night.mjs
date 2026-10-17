import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/fire-night-browser-fixtures.ts";
import {
  FIRE_NIGHT as N,
  FIRE_NIGHT_ENCOUNTERS,
} from "../src/game/fire-night-support.ts";
import { card, plain } from "../src/game/cards.ts";
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
  settle,
} from "./browser-angmar-helpers.mjs";
const widths = process.env.FIRE_NIGHT_WIDTHS
  ? process.env.FIRE_NIGHT_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(widths.length && widths.every((n) => [1280, 390, 320].includes(n)));
const dir = process.env.FIRE_NIGHT_OUTPUT_DIR ?? "output/fire-night";
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
const bundle = JSON.parse(
  await fs.readFile("src/data/pending/fire-in-the-night-import.json", "utf8"),
);
const focusedPrinted = process.env.FIRE_NIGHT_FOCUSED_PRINTED === "1";
let page;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function close() {
  await page
    .getByRole("button", { name: "Close dialog", exact: true })
    .last()
    .click();
}
async function printed(c, reverse = false) {
  const e = reverse
    ? {
        ...c,
        name: c.back_name ?? c.name,
        text: c.back_text,
        imagesrc: c.back_imagesrc,
        shadow: undefined,
      }
    : c;
  assert.equal(
    await page.locator("[data-card-primary-name]").textContent(),
    e.name,
  );
  const rules = page.locator("[data-card-primary-rules]");
  if (plain(e.text)) assert.equal(await rules.textContent(), plain(e.text));
  const img = page.locator(".card-detail img[data-card-code]");
  assert.equal(
    new URL(await img.getAttribute("src"), page.url()).pathname,
    e.imagesrc,
  );
  assert.ok(
    await img.evaluate(async (i) => {
      await i.decode();
      return i.naturalWidth > 0;
    }),
  );
  const shadow = page.locator(".card-detail-primary .shadow-text");
  if (e.shadow) assert.equal(await shadow.textContent(), plain(e.shadow));
  else assert.equal(await shadow.count(), 0);
  if (e.printed_stats?.threat === "X" && e.health !== undefined)
    assert.equal(
      await page
        .locator(".detail-stats .stat-badge--threat .stat-value")
        .textContent(),
      "X",
      "printed variable threat stays X in the inspector",
    );
  printedFaces.add(e.imagesrc);
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
    if (focusedPrinted) {
      const faces = FIRE_NIGHT_ENCOUNTERS.filter((c) =>
        [N.dagnir, N.tower].includes(c.code),
      );
      const s = F.fireTravel().s;
      s.encounterDiscard = faces.map((c) => c.code);
      await load(page, s);
      const dragon = s.staging.find((u) => u.code === N.dagnir);
      assert.equal(
        await boardCard(page, dragon.id)
          .locator(".stat-badge--threat .stat-value")
          .first()
          .textContent(),
        "1",
        "live Dagnir threat remains numeric",
      );
      await page
        .getByRole("button", {
          name: `Browse encounter discard: ${faces.length} cards`,
          exact: true,
        })
        .click();
      for (const c of faces) {
        await page
          .locator(".pile-entry")
          .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
          .getByRole("button")
          .first()
          .click();
        await printed(c);
        await checkpoint(
          `printed-variable-${c.name.replaceAll(" ", "-")}`,
          width,
        );
        await close();
      }
      await close();
      await view.c.close();
      continue;
    }
    // Every player count and both modes enters through the real adventure picker.
    for (const players of process.env.FIRE_NIGHT_SKIP_SETUP ? [] : [1, 2, 3, 4])
      for (const easy of [false, true]) {
        await fresh(page, "fire-in-the-night", players, easy);
        await page.locator("#start-btn").click();
        const s = await opening(page);
        assert.ok(s.fireNight.initialized);
        assert.equal(s.fireNight.sideDeck.length, 8);
        assert.equal(
          await page.locator('[data-scenario-panel="fire-night"]').count(),
          1,
        );
        assert.deepEqual((await resume(page)).fireNight, s.fireNight);
        checks.push(`setup-${players}-${easy ? "easy" : "normal"}-${width}`);
      }
    if (!process.env.FIRE_NIGHT_SKIP_SETUP) await checkpoint("setup", width);
    {
      const f = F.firePlanning();
      await load(page, f.s);
      await next(page);
      let s = await saved(page);
      assert.ok(s.choice?.title.includes("Immediate attack"));
      assert.equal(s.fireNight.sideDeck.length, 7);
      await resume(page);
      await choose(page, "undefended");
      await settle(page);
      s = await saved(page);
      assert.equal(s.fireNight.hillDamage, 7);
      assert.equal(s.encounterDeck.length, 30);
      await checkpoint("native-planning-town-attack", width);
      const publicState = JSON.parse(
        await page.evaluate(() => window.render_game_to_text()),
      );
      assert.equal(typeof publicState.fireNight.sideDeck, "number");
    }
    {
      const f = F.fireTravel();
      await load(page, f.s);
      await boardCard(page, f.location.id)
        .getByRole("button", { name: "Travel here", exact: true })
        .click();
      await reviewedState(page);
      await resume(page);
      await choose(page, f.hero.id);
      const s = await settle(page);
      assert.equal(s.activeLocation.id, f.location.id);
      assert.equal(s.heroes.find((h) => h.id === f.hero.id).exhausted, false);
      await checkpoint("native-palisade-travel", width);
    }
    {
      const f = F.fireReveal();
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
      for (let n = 0; n < 20; n++) {
        const current = await saved(page);
        if (
          !current.choice ||
          current.choice.options.some((o) => o.id === "hill")
        )
          break;
        await choose(
          page,
          current.choice.options.find((o) => o.id === "skip")?.id ??
            current.choice.options.find((o) => o.id === "resolve")?.id ??
            current.choice.options[0].id,
        );
      }
      await resume(page);
      await choose(page, "hill");
      const s = await settle(page);
      assert.equal(s.fireNight.hillDamage, 3);
      await checkpoint("native-orc-reveal-choice", width);
    }
    {
      const f = F.fireShadow();
      await load(page, f.s);
      await boardCard(page, f.enemy.id)
        .getByRole("button", { name: "Defend", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: card(f.hero.code).name, exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Resolve enemy attack", exact: true })
        .click();
      await reviewedState(page);
      const s = await settle(page);
      assert.ok(s.fireNight.hillDamage > 0);
      assert.ok(!s.heroes.some((h) => h.id === f.hero.id));
      await checkpoint("native-wrath-shadow-excess", width);
    }
    {
      await load(page, F.fireVictory().s);
      await next(page);
      const s = await settle(page);
      assert.equal(s.status, "won");
      await checkpoint("native-face-dragon-victory", width);
      await resume(page);
      await load(page, F.firePlanning(true).s);
      await next(page);
      await choose(page, "undefended");
      assert.equal((await settle(page)).status, "lost");
      await checkpoint("native-town-loss", width);
    }
    // Inspect every original encounter face once at desktop, with representative
    // long text/quest dialogs repeated on both mobile widths.
    const faces =
      width === 1280
        ? FIRE_NIGHT_ENCOUNTERS
        : FIRE_NIGHT_ENCOUNTERS.filter((c) =>
            [N.dagnir, N.rout, N.drawFire, N.wrath].includes(c.code),
          );
    let s = F.fireTravel().s;
    s.encounterDiscard = faces.map((c) => c.code);
    await load(page, s);
    await page
      .getByRole("button", {
        name: `Browse encounter discard: ${faces.length} cards`,
        exact: true,
      })
      .click();
    for (const c of faces) {
      await page
        .locator(".pile-entry")
        .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
        .getByRole("button")
        .first()
        .click();
      await printed(c);
      if ([N.rout, N.dagnir].includes(c.code))
        await checkpoint(`printed-${c.name.replaceAll(" ", "-")}`, width);
      await close();
    }
    await close();
    await page
      .locator('[data-scenario-panel="fire-night"]')
      .getByRole("button", {
        name: "Inspect Hrogar’s Hill · Both faces",
        exact: true,
      })
      .click();
    await printed(card(N.hill), true);
    await page.getByRole("button", { name: "Show front", exact: true }).click();
    await printed(card(N.hill));
    await checkpoint("printed-hill-both-faces", width);
    await close();
    await view.c.close();
  }
  const artPage = await browser.newPage();
  for (const a of bundle.artwork) {
    const r = await artPage.request.get(
      new URL(a.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178")
        .href,
    );
    assert.equal(r.status(), 200);
    const bytes = await r.body();
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      a.sha256,
    );
    const dimensions = await artPage.evaluate(
      async (bytes) => {
        const b = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const d = { width: b.width, height: b.height };
        b.close();
        return d;
      },
      [...bytes],
    );
    assert.ok(dimensions.width && dimensions.height);
    artwork.push({ path: a.localPath, sha256: a.sha256, ...dimensions });
  }
  if (!focusedPrinted && widths.includes(1280))
    assert.deepEqual(
      [...printedFaces].sort(),
      bundle.artwork.map((a) => a.localPath).sort(),
    );
  await artPage.close();
  await report(dir, {
    smoke:
      focusedPrinted ||
      !!process.env.FIRE_NIGHT_SKIP_SETUP ||
      widths.join(",") !== "1280,390,320",
    focusedPrinted,
    sourceScriptSha256,
    errors,
    screenshots,
    entries,
    checks,
    printedFaces: [...printedFaces],
    artwork,
  });
  console.log(
    `Fire in the Night browser passed ${checks.length} checks and ${artwork.length} original faces`,
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
