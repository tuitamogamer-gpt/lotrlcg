import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/roam-rhovanion-browser-fixtures.ts";
import { base } from "../tests/roam-rhovanion-fixtures.ts";
import {
  ROAM_RHOVANION as R,
  ROAM_RHOVANION_QUEST_CODES,
} from "../src/game/roam-rhovanion-support.ts";
import { card, plain } from "../src/game/cards.ts";
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
const widths = process.env.ROAM_RHOVANION_WIDTHS
  ? process.env.ROAM_RHOVANION_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
const focusedCancellation = process.env.ROAM_RHOVANION_FOCUSED_CANCEL === "1";
assert.ok(widths.length && widths.every((w) => [1280, 390, 320].includes(w)));
const dir = process.env.ROAM_RHOVANION_OUTPUT_DIR ?? "output/roam-rhovanion";
await fs.mkdir(dir, { recursive: true });
const sourceScriptSha256 = crypto
    .createHash("sha256")
    .update(await fs.readFile(new URL(import.meta.url)))
    .digest("hex"),
  browser = await chromium.launch({ headless: true }),
  errors = [],
  screenshots = [],
  entries = new Set(),
  checks = [],
  printedFaces = new Set(),
  artwork = [],
  transitions = [];
const bundle = JSON.parse(
  await fs.readFile(
    "src/data/pending/roam-across-rhovanion-import.json",
    "utf8",
  ),
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
  const face = reverse
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
    face.name,
  );
  const rules = p.locator("[data-card-primary-rules]");
  if (plain(face.text))
    assert.equal(await rules.textContent(), plain(face.text));
  const img = p.locator(".card-detail img[data-card-code]");
  assert.equal(
    new URL(await img.getAttribute("src"), p.url()).pathname,
    face.imagesrc,
  );
  assert.ok(
    await img.evaluate(async (i) => {
      await i.decode();
      return i.naturalWidth > 0;
    }),
  );
  printedFaces.add(face.imagesrc);
}
async function attack(p, enemy, hero) {
  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Attack", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(hero.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: /^Attack ·/ })
    .click();
  return settle(p);
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
    if (focusedCancellation) {
      for (const code of [R.bear, R.weather]) {
        const f = F.roamCancellation(code);
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
        let pending = await saved(page);
        if (code === R.bear) {
          assert.ok(
            pending.choice?.options.some((o) => o.code === "01050"),
            "enemy when-revealed retains its cancellation window during Rescue Tiny",
          );
          await resume(page);
          pending = await saved(page);
          await choose(
            page,
            pending.choice.options.find((o) => o.code === "01050").id,
          );
          const done = await settle(page);
          assert.ok(done.staging.some((u) => u.code === R.bear));
          assert.ok(done.discard.includes("01050"));
          assert.ok(!done.hand.some((u) => u.id === f.event.id));
          assert.ok(!done.choice);
          transitions.push({
            width,
            branch: "rescue-tiny-enemy-cancel-allowed",
            eventSpent: true,
          });
          await checkpoint(page, "native-bear-cancel-allowed", width);
        } else {
          assert.match(pending.choice?.title ?? "", /Harsh Weather/);
          assert.ok(!pending.choice.options.some((o) => o.code === "01050"));
          await resume(page);
          while ((await saved(page)).choice) await choose(page, "threat");
          const done = await settle(page);
          assert.ok(done.hand.some((u) => u.id === f.event.id));
          assert.ok(done.threat > 20);
          transitions.push({
            width,
            branch: "rescue-tiny-treachery-cancel-blocked",
            eventRetained: true,
          });
          await checkpoint(page, "native-weather-cancel-blocked", width);
        }
      }
      await view.c.close();
      continue;
    }
    await fresh(page, "roam-across-rhovanion", 1, false);
    await page.locator("#start-btn").click();
    let s = await opening(page);
    assert.ok(s.roamRhovanion.initialized);
    assert.equal(s.staging.length, 1);
    assert.equal(
      await page.locator('[data-scenario-panel="roam-rhovanion"]').count(),
      1,
    );
    await checkpoint(page, "original-setup", width);
    assert.deepEqual((await resume(page)).roamRhovanion, s.roamRhovanion);
    if (width === 1280) {
      await fresh(page, "roam-across-rhovanion", 4, true);
      await page.locator("#start-btn").click();
      s = await opening(page);
      assert.equal(s.staging.length, 4);
      assert.equal(
        s.encounterDeck.length + s.encounterDiscard.length + s.staging.length,
        26,
      );
      await checkpoint(page, "four-player-easy", width);
    }
    {
      const f = F.roamTravel();
      await load(page, f.s);
      await boardCard(page, f.location.id)
        .getByRole("button", { name: "Travel here", exact: true })
        .click();
      await reviewedState(page);
      assert.match((await saved(page)).choice?.title ?? "", /Deep Ravine/);
      await resume(page);
      await choose(page, width === 390 ? "threat" : "urdug");
      s = await settle(page);
      assert.equal(s.activeLocation?.id, f.location.id);
      if (width === 390) assert.equal(s.threat, 22);
      else assert.ok(s.allies.find((u) => u.code === R.urdug).exhausted);
      transitions.push({
        width,
        branch: "ravine-travel",
        cost: width === 390 ? "all-player-threat" : "urdug-exhausted",
      });
      await checkpoint(page, "native-travel-cost", width);
    }
    {
      const f = F.roamReveal();
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
      for (let i = 0; i < 12; i++) {
        const pending = await saved(page);
        if (!pending.choice || pending.choice.title.includes("Harsh Weather"))
          break;
        await choose(
          page,
          pending.choice.options.find((o) => o.id === "skip")?.id ??
            pending.choice.options[0].id,
        );
      }
      assert.match((await saved(page)).choice?.title ?? "", /Harsh Weather/);
      await checkpoint(page, "native-weather-pending", width);
      await resume(page);
      while ((await saved(page)).choice) await choose(page, "threat");
      s = await settle(page);
      assert.ok(s.threat > 20);
      transitions.push({
        width,
        branch: "weather-reveal-reload",
        threat: s.threat,
      });
      await checkpoint(page, "native-weather-resolved", width);
    }
    {
      const f = F.roamStage(),
        next = f.s.roamRhovanion.questDeck[0];
      await load(page, f.s);
      await page
        .getByRole("button", { name: "Resolve quest", exact: true })
        .last()
        .click();
      s = await settle(page);
      assert.equal(s.stage, 2);
      assert.equal(s.roamRhovanion.currentQuest, next);
      assert.equal(s.roamRhovanion.guarded.length, 1);
      transitions.push({
        width,
        branch: "task-unlocked",
        quest: next,
        guarded: s.roamRhovanion.guarded[0].card.code,
      });
      await checkpoint(page, "native-random-task", width);
      await resume(page);
    }
    {
      const f = F.roamVictory();
      await load(page, f.s);
      s = await attack(page, f.tiny, f.first);
      assert.ok(!s.engaged.some((u) => u.id === f.tiny.id));
      assert.equal(s.status, "playing");
      s = await attack(page, f.urdug, f.second);
      assert.equal(s.status, "won");
      transitions.push({
        width,
        branch: "tiny-then-urdug-victory",
        urdugDamage: s.engaged.find((u) => u.id === f.urdug.id)?.damage,
      });
      await checkpoint(page, "native-finale-victory", width);
      await resume(page);
    }
    {
      const f = F.roamLoss();
      await load(page, f.s);
      await page
        .getByRole("button", { name: "Resolve quest", exact: true })
        .last()
        .click();
      s = await settle(page);
      assert.equal(s.status, "lost");
      assert.equal(s.progress, 5);
      assert.equal(s.threat, 20);
      transitions.push({
        width,
        branch: "failed-quest-loss",
        mainProgress: s.progress,
        threat: s.threat,
      });
      await checkpoint(page, "native-finale-loss", width);
    }
    if (width === 1280) {
      const encounters = bundle.cards
        .filter((c) => c.type_code !== "quest")
        .map((c) => card(c.code));
      s = base();
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
        if (c.back_imagesrc) {
          await page
            .getByRole("button", { name: "Show reverse", exact: true })
            .click();
          await printed(page, c, true);
        }
        await close(page);
      }
      await close(page);
      s = base();
      await load(page, s);
      const detail = page.locator(
        '[data-scenario-panel="roam-rhovanion"] details',
      );
      await detail.locator("summary").click();
      for (const code of ROAM_RHOVANION_QUEST_CODES) {
        const c = card(code);
        await detail.getByRole("button", { name: c.name, exact: true }).click();
        await printed(page, c);
        await page
          .getByRole("button", { name: "Show reverse", exact: true })
          .click();
        await printed(page, c, true);
        await close(page);
      }
      await checkpoint(page, "all-original-printed-faces", width);
    }
    await view.c.close();
  }
  const artPage = await browser.newPage();
  for (const a of focusedCancellation ? [] : bundle.artwork) {
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
      async (data) => {
        const bmp = await createImageBitmap(new Blob([Uint8Array.from(data)]));
        const result = { width: bmp.width, height: bmp.height };
        bmp.close();
        return result;
      },
      [...bytes],
    );
    assert.ok(decoded.width && decoded.height);
    artwork.push({ path: a.localPath, sha256: a.sha256, ...decoded });
  }
  await artPage.close();
  if (!focusedCancellation && widths.includes(1280))
    assert.deepEqual(
      [...printedFaces].sort(),
      bundle.artwork.map((a) => a.localPath).sort(),
    );
  await report(dir, {
    smoke: focusedCancellation || widths.join(",") !== "1280,390,320",
    focusedCancellation,
    sourceScriptSha256,
    errors,
    screenshots,
    entries,
    checks,
    transitions,
    printedFaces: [...printedFaces],
    artwork,
  });
  console.log(
    `Roam browser passed ${checks.length} checkpoints; ${artwork.length} original face hashes/decode`,
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
        transitions,
        printedFaces: [...printedFaces],
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
