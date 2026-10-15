import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/escape-umbar-fixtures.ts";
import {
  UMBAR as C,
  UMBAR_ENCOUNTERS,
  UMBAR_QUESTS,
} from "../src/game/escape-umbar-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { make } from "../src/game/core.ts";
import { allEngaged, forOwner, syncSeat } from "../src/game/table.ts";
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

const sourceScriptSha256 = crypto
  .createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const widths = process.env.UMBAR_WIDTHS
  ? process.env.UMBAR_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(widths.length && widths.every((w) => [1280, 390, 320].includes(w)));
const dir = process.env.UMBAR_OUTPUT_DIR ?? "output/escape-umbar";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [],
  entries = new Set(),
  checks = [],
  printedFaces = new Set(),
  artwork = [];
let page;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
const add = (s, code) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
async function shot(p, label, width) {
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
      return i.naturalWidth > 0 && i.naturalHeight > 0;
    }),
  );
  const shadow = p.locator(".card-detail-primary .shadow-text");
  if (expected.shadow)
    assert.equal(await shadow.textContent(), plain(expected.shadow));
  else assert.equal(await shadow.count(), 0);
  printedFaces.add(expected.imagesrc);
}
async function travel(p, u) {
  await boardCard(p, u.id)
    .getByRole("button", { name: "Travel here", exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
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
    .getByRole("button", { name: /^Attack · [0-9]+ power$/ })
    .click();
  await reviewedState(p);
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
    for (const players of [1, 2, 3, 4])
      for (const easy of [false, true]) {
        await fresh(page, "escape-from-umbar", players, easy);
        await page.locator("#start-btn").click();
        let s = await opening(page);
        assert.equal(s.umbar.initialized, true);
        assert.equal(s.stage, 1);
        const locs = s.staging.filter(
          (u) => card(u.code).type_code === "location",
        );
        assert.equal(locs.length, players);
        assert.equal(new Set(locs.map((u) => u.code)).size, players);
        assert.equal(allEngaged(s).length, players);
        assert.equal(
          s.encounterDeck.filter((c) => c === C.sentry).length,
          (easy ? 4 : 5) - players,
        );
        await shot(
          page,
          `setup-${players}-${easy ? "easy" : "standard"}`,
          width,
        );
        assert.deepEqual((await resume(page)).umbar, s.umbar);
      }
    // Real travel and optional Alleyway choice retain a remote physical enemy.
    let s = F.base(2);
    s.phase = "travel";
    let alley = add(s, C.alley),
      enemy = make(s, C.soldier);
    enemy.owner = 1;
    forOwner(s, 1, () => s.engaged.push(enemy));
    await load(page, s);
    s = await travel(page, alley);
    assert.match(s.choice.title, /Narrow Alleyway/);
    await shot(page, "alley-real-travel-optional-response", width);
    await resume(page);
    await choose(page, enemy.id);
    s = await saved(page);
    assert.equal(allEngaged(s).length, 0);
    assert.equal(s.umbar.underAlley[0].enemies[0].id, enemy.id);
    await shot(page, "alley-physical-out-of-play-after-reload", width);
    assert.deepEqual((await resume(page)).umbar.underAlley, s.umbar.underAlley);
    // Real Estate travel searches the public deck/discard then bypasses the active location.
    s = F.base();
    s.phase = "travel";
    const estate = add(s, C.estate);
    s.encounterDeck = [C.captain, C.alley];
    await load(page, s);
    s = await travel(page, estate);
    assert.match(s.choice.title, /Haradrim Estate/);
    await shot(page, "estate-real-travel-search-choice", width);
    await choose(page, s.choice.options[0].id);
    s = await saved(page);
    assert.equal(s.progress, 1);
    assert.equal(s.activeLocation.code, C.estate);
    assert.ok(allEngaged(s).some((u) => u.code === C.captain));
    await shot(page, "estate-search-engages-and-bypasses-progress", width);
    // Travel cost assigns Port damage through the actual allocation buttons.
    s = F.base(2);
    s.phase = "travel";
    const port = add(s, C.port);
    enemy = make(s, C.sentry);
    s.engaged.push(enemy);
    await load(page, s);
    s = await travel(page, port);
    assert.match(s.choice.title, /Assign 1 damage/);
    const damagedId = s.heroes[0].id;
    await choose(page, damagedId);
    s = await saved(page);
    assert.equal(s.activeLocation.code, C.port);
    assert.equal(s.heroes[0].damage, 1);
    await shot(page, "port-travel-assigned-cost-damage", width);
    // Questing explores the Alleyway; its returning enemy prevents advancement at the printed ceiling.
    s = F.base(2);
    s.phase = "staging";
    s.progress = 14;
    forOwner(s, 0, () => {
      s.heroes[0].committed = true;
      s.heroes[0].exhausted = true;
      s.heroes[0].tempWill = 30;
      s.committedIds = [s.heroes[0].id];
    });
    enemy = make(s, C.sentry);
    const exploredAlley = make(s, C.alley);
    s.activeLocation = exploredAlley;
    s.umbar.underAlley = [{ locationId: exploredAlley.id, enemies: [enemy] }];
    syncSeat(s);
    await load(page, s);
    await page
      .getByRole("button", { name: "Resolve quest", exact: true })
      .last()
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.progress, 15);
    assert.equal(s.stage, 1);
    assert.equal(s.umbar.underAlley.length, 0);
    assert.ok(allEngaged(s).some((u) => u.id === enemy.id));
    await shot(page, "quest-real-resolution-cap-and-alley-return-lock", width);
    // Defeating the last engaged enemy advances stage and ends the combat phase.
    s = F.base();
    s.phase = "attack";
    s.progress = 15;
    s.encounterDeck = [C.alley, C.sentry];
    enemy = make(s, C.sentry);
    s.engaged.push(enemy);
    s.heroes[0].tempAttack = 10;
    await load(page, s);
    s = await attack(page, enemy, s.heroes[0]);
    assert.equal(s.stage, 2);
    assert.equal(s.umbar.currentQuest, C.flee);
    assert.equal(s.progress, 0);
    await shot(page, "last-enemy-defeat-stage-transition-ends-phase", width);
    await resume(page);
    // Every original scenario face opens through the real public discard and quest dialogs.
    s = F.base();
    s.encounterDiscard = UMBAR_ENCOUNTERS.map((c) => c.code);
    await load(page, s);
    await page
      .getByRole("button", {
        name: `Browse encounter discard: ${UMBAR_ENCOUNTERS.length} cards`,
        exact: true,
      })
      .click();
    for (const c of UMBAR_ENCOUNTERS) {
      await page
        .locator(".pile-entry")
        .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
        .getByRole("button")
        .first()
        .click();
      await printed(page, card(c.code));
      await shot(page, `printed-${c.code.slice(6, 14)}`, width);
      await close(page);
    }
    await close(page);
    for (const [index, c] of UMBAR_QUESTS.toSorted(
      (a, b) => Number(a.cost) - Number(b.cost),
    ).entries()) {
      s = F.base();
      if (index) {
        s.stage = 2;
        s.umbar.completedQuests = [C.stranded];
        s.umbar.currentQuest = C.flee;
        s.umbar.questDeck = [];
      }
      await load(page, s);
      await page.locator(".journey-area .quest-card-stack").click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      await printed(page, c);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await printed(page, c, true);
      await shot(page, `printed-quest-${index + 1}-both-faces`, width);
      await close(page);
    }
    await view.c.close();
  }
  const bundle = JSON.parse(
    await fs.readFile("src/data/pending/escape-from-umbar-import.json", "utf8"),
  );
  const artPage = await browser.newPage();
  for (const a of bundle.artwork) {
    const response = await artPage.request.get(
      new URL(a.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178")
        .href,
    );
    assert.equal(response.status(), 200);
    const body = await response.body();
    assert.equal(
      crypto.createHash("sha256").update(body).digest("hex"),
      a.sha256,
      a.localPath,
    );
    const decoded = await artPage.evaluate(
      async ({ bytes }) => {
        const bmp = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const result = { width: bmp.width, height: bmp.height };
        bmp.close();
        return result;
      },
      { bytes: [...body] },
    );
    assert.ok(decoded.width > 0 && decoded.height > 0);
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
    `Escape from Umbar browser checks passed: ${checks.length}; original artworks: ${artwork.length}`,
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
