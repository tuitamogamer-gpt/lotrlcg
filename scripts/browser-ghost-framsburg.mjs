import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/ghost-framsburg-browser-fixtures.ts";
import {
  GHOST_FRAMSBURG as G,
  GHOST_FRAMSBURG_QUESTS,
} from "../src/game/ghost-framsburg-support.ts";
import { card, plain, imageUrl } from "../src/game/cards.ts";
import { cachedImageSource } from "../src/game/scenario-image-source.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  next,
  opening,
  report,
  resume,
  saved,
  settle,
} from "./browser-angmar-helpers.mjs";
const widths = process.env.GHOST_FRAMSBURG_WIDTHS
  ? process.env.GHOST_FRAMSBURG_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(widths.length && widths.every((n) => [1280, 390, 320].includes(n)));
const dir = process.env.GHOST_FRAMSBURG_OUTPUT_DIR ?? "output/ghost-framsburg";
await fs.mkdir(dir, { recursive: true });
const sourceScriptSha256 = crypto
  .createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const bundle = JSON.parse(
  await fs.readFile(
    "src/data/pending/the-ghost-of-framsburg-import.json",
    "utf8",
  ),
);
const browser = await chromium.launch({ headless: true }),
  errors = [],
  screenshots = [],
  entries = new Set(),
  checks = [],
  printedFaces = new Set(),
  artwork = [];
let page;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
const close = (p) =>
  p.getByRole("button", { name: "Close dialog", exact: true }).last().click();
async function ability(label, hero) {
  let button = page.getByRole("button", { name: label, exact: true });
  if (!(await button.count()))
    button = page.getByRole("button", {
      name: `${card(hero.code).name} · ${label}`,
      exact: true,
    });
  await button.first().click();
  await reviewedState(page);
}
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function printed(c, reverse = false) {
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
    await page.locator("[data-card-primary-name]").textContent(),
    expected.name,
  );
  if (plain(expected.text))
    assert.equal(
      await page.locator("[data-card-primary-rules]").textContent(),
      plain(expected.text),
    );
  const img = page.locator(".card-detail img[data-card-code]");
  const path = new URL(await img.getAttribute("src"), page.url()).pathname;
  assert.equal(
    path,
    reverse ? cachedImageSource(expected.imagesrc) : imageUrl(c),
  );
  assert.ok(
    await img.evaluate(async (i) => {
      await i.decode();
      return i.naturalWidth > 0;
    }),
  );
  if (expected.shadow)
    assert.equal(
      await page.locator(".card-detail-primary .shadow-text").textContent(),
      plain(expected.shadow),
    );
  printedFaces.add(path);
}
try {
  for (const width of widths) {
    let view = await context(
      browser,
      width,
      width === 1280 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    let setupCount = 0;
    for (const players of width === 1280 ? [1, 2, 3, 4] : [4])
      for (const easy of width === 1280 ? [false, true] : [true]) {
        await fresh(page, "the-ghost-of-framsburg", players, easy);
        await page.locator("#start-btn").click();
        const s = await opening(page);
        assert.ok(s.ghostFramsburg.initialized);
        assert.equal(s.staging.length, players);
        assert.equal(new Set(s.staging.map((u) => u.code)).size, players);
        assert.equal(s.encounterDeck.length + players, easy ? 29 : 41);
        assert.equal(
          await page.locator('[data-scenario-panel="ghost-framsburg"]').count(),
          1,
        );
        assert.deepEqual((await resume(page)).ghostFramsburg, s.ghostFramsburg);
        checks.push(
          `native-setup-${players}-${easy ? "easy" : "normal"}-${width}`,
        );
        setupCount++;
        if (width === 1280 && setupCount % 2 === 0 && setupCount < 8) {
          await view.c.close();
          view = await context(browser, width, 1000, errors, entries);
          page = view.p;
        }
      }
    await checkpoint("setup-four-player-easy", width);
    {
      const f = F.ghostDiscover();
      await load(page, f.s);
      await boardCard(page, f.location.id)
        .getByRole("button", { name: "Travel here", exact: true })
        .click();

      await reviewedState(page);
      let s = await saved(page);
      assert.ok(s.choice?.title.startsWith("Discover"));
      const key = s.choice.options.find((o) => o.code === G.key);
      assert.ok(key);
      await checkpoint("native-discover-loot-decision", width);
      await resume(page);
      await choose(page, key.id);
      s = await settle(page);
      assert.equal(s.ghostFramsburg.loot[0].unit.code, G.key);
      assert.ok(s.staging.some((u) => u.code === G.spectre));
      assert.ok(s.encounterDiscard.includes(G.lantern));
      await checkpoint("native-discover-random-hazard", width);
    }
    {
      const f = F.ghostClaim();
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
      await resume(page);
      let s = await settle(page);
      assert.equal(s.phase, "staging");
      await next(page);
      await resume(page);
      s = await settle(page);
      assert.ok(
        s.heroes.some((h) => h.attachments.some((a) => a.id === f.loot.id)),
      );
      assert.equal(s.activeLocation, null);
      await checkpoint("native-quest-explores-guard-and-claims", width);
    }
    {
      const f = F.ghostAbilities();
      await load(page, f.s);
      await ability("Exhaust Old Lantern to look for a card", f.hero);
      await reviewedState(page);
      await choose(page, "0");
      await resume(page);
      let s = await settle(page);
      assert.deepEqual(
        s.hand.map((u) => u.code),
        ["01013"],
      );
      assert.deepEqual(s.deck, ["01015", "01016", "01014"]);
      await ability("Exhaust Scatha's Teeth and hero to reduce threat", f.hero);
      await reviewedState(page);
      await choose(page, "0");
      s = await settle(page);
      assert.equal(s.threat, 18);
      assert.ok(s.heroes[0].exhausted);
      assert.ok(s.heroes[0].attachments.every((a) => a.exhausted));
      await checkpoint("native-loot-abilities-and-costs", width);
    }
    for (const code of [G.ruins, G.afraid, G.slammed]) {
      const f = F.ghostReveal(code);
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
      await resume(page);
      const s = await settle(page);
      assert.equal(s.status, "playing");
      await checkpoint(
        `native-reveal-${card(code).name.toLowerCase().replaceAll(" ", "-")}`,
        width,
      );
    }
    {
      const f = F.ghostBoss();
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
      assert.ok(s.victoryCards.includes(G.shade));
      await checkpoint("native-frams-shade-victory", width);
    }
    if (width === 1280) {
      const s = F.ghostDiscover().s,
        encounters = bundle.cards
          .filter((c) => c.type_code !== "quest")
          .map((c) => card(c.code));
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
        await printed(c);
        if ([G.key, G.tomb, G.stalker, G.moonlit].includes(c.code))
          await checkpoint(
            `printed-${c.name.toLowerCase().replaceAll(" ", "-")}`,
            width,
          );
        await close(page);
      }
      await close(page);
      for (const c of GHOST_FRAMSBURG_QUESTS) {
        await load(page, F.ghostDiscover().s);
        const details = page.locator(
          '[data-scenario-panel="ghost-framsburg"] details',
        );
        await details.locator("summary").click();
        await details
          .getByRole("button", {
            name: `${c.cost}A/B · ${c.name}`,
            exact: true,
          })
          .click();
        await printed(card(c.code));
        await page
          .getByRole("button", { name: "Show reverse", exact: true })
          .click();
        await printed(card(c.code), true);
        await checkpoint(`printed-quest-${c.cost}-both-faces`, width);
        await close(page);
      }
    } else {
      await load(page, F.ghostDiscover().s);
      await page
        .locator('[data-scenario-panel="ghost-framsburg"]')
        .getByRole("button", { name: /Inspect The Cursed Tomb/ })
        .click();
      await printed(card(G.tomb));
      await checkpoint("printed-tomb-responsive", width);
      await close(page);
    }
    await view.c.close();
  }
  const p = await browser.newPage();
  for (const a of bundle.artwork) {
    const response = await p.request.get(
      new URL(a.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178")
        .href,
    );
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(bytes.length, a.bytes);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      a.sha256,
    );
    const decoded = await p.evaluate(
      async (bytes) => {
        const b = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const r = { width: b.width, height: b.height };
        b.close();
        return r;
      },
      [...bytes],
    );
    assert.ok(decoded.width && decoded.height);
    artwork.push({ path: a.localPath, sha256: a.sha256, ...decoded });
  }
  await p.close();
  if (widths.includes(1280))
    assert.deepEqual(
      [...printedFaces].sort(),
      bundle.artwork.map((a) => a.localPath).sort(),
    );
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
    `Ghost browser passed ${checks.length} checkpoints and ${artwork.length} original faces`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        error: String(error),
        stack: error.stack,
        errors,
        checks,
        printedFaces: [...printedFaces],
        artwork,
      },
      null,
      2,
    ),
  );
  if (page && !page.isClosed())
    await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
