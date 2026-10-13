import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/temple-fixtures.ts";
import {
  TEMPLE as T,
  TEMPLE_ENCOUNTERS,
  TEMPLE_QUESTS,
  TEMPLE_LOST_FACES,
  TEMPLE_TEMPLE_FACES,
} from "../src/game/temple-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, stats, locationQuest, fx } from "../src/game/core.ts";
import {
  allCharacters,
  forOwner,
  playerOrder,
  seatView,
  ownerOf,
  selectSeat,
} from "../src/game/table.ts";
import { engage } from "../src/game/board.ts";
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

const dir = "output/temple-scenario";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [],
  entries = new Set(),
  checks = [],
  printedFaces = new Set(),
  artwork = [];
let page;
const tile = (p, id) => p.locator(`[data-temple-map-cell="${id}"]`);
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function checkpoint(p, label, width) {
  // A dispatched action may mount its review on the following React frame.
  // Drain the actual review before measuring a dialog that could be closed by
  // the installed review handler while capture reads its bounding rectangle.
  await p.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
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
async function printed(p, c, reverse = false, opposite) {
  const expected = reverse
    ? (opposite ?? {
        ...c,
        name: c.back_name ?? c.name,
        text: c.back_text,
        imagesrc: c.back_imagesrc,
        shadow: undefined,
      })
    : c;
  assert.equal(
    await p.locator("[data-card-primary-name]").textContent(),
    expected.name,
  );
  const rules = p.locator("[data-card-primary-rules]");
  if (plain(expected.text))
    assert.equal(await rules.textContent(), plain(expected.text));
  else assert.equal(await rules.count(), 0);
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
async function assertPrivateMap(p, s) {
  assert.equal(await p.locator("[data-temple-map-cell]").count(), 15);
  for (const [id, original] of Object.entries(s.temple.hiddenBacks)) {
    const dom = await tile(p, id).evaluate((e) => e.outerHTML);
    const generic = F.cell(
      s,
      s.temple.map.find((c) => c.id === id).row,
      s.temple.map.find((c) => c.id === id).column,
    ).code;
    assert.ok(dom.includes(generic));
    assert.ok(
      !dom.includes(original),
      "the opaque map tile never embeds its private printed identity",
    );
    assert.ok(
      !dom.includes(original.slice(6)),
      "private UUID is absent from image paths and attributes",
    );
  }
  const publicView = await reviewedState(p);
  assert.equal(publicView.temple.originalCodes, undefined);
  assert.equal(publicView.temple.hiddenBacks, undefined);
  const observer = s.table?.active ?? 0;
  const known = new Set(
    s.temple.map
      .filter(
        (c) =>
          !s.temple.hiddenBacks[c.id] ||
          s.temple.lookedBy[c.id]?.includes(observer),
      )
      .map((c) => s.temple.originalCodes[c.id]),
  );
  const html = await p.locator("body").evaluate((e) => e.outerHTML),
    publicText = JSON.stringify(publicView);
  for (const original of Object.values(s.temple.hiddenBacks).filter(
    (code) => !known.has(code),
  )) {
    assert.ok(
      !html.includes(original.slice(6)),
      "undiscovered identities are absent from the whole DOM, including previews and attributes",
    );
    assert.ok(
      !publicText.includes(original),
      "public state and event reviews omit undiscovered printed identities",
    );
  }
}
async function attack(p, enemyId, attackerId) {
  await boardCard(p, enemyId)
    .getByRole("button", { name: "Attack", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", {
      name: card(get(await saved(p), attackerId).code).name,
      exact: true,
    })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: /^Attack · \d+ power$/ })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function inspectUnit(p, id) {
  await boardCard(p, id)
    .getByRole("button", { name: /^Inspect / })
    .first()
    .click();
}
try {
  for (const width of [1440, 390, 320]) {
    const view = await context(
      browser,
      width,
      width === 1440 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    for (const easy of [false, true])
      for (const players of [1, 2, 3, 4]) {
        await fresh(page, "temple-of-the-deceived", players, easy);
        await page.locator("#start-btn").click();
        let s = await opening(page);
        assert.equal(s.temple.map.length, 15);
        assert.equal(s.encounterDeck.length, easy ? 25 : 32);
        assert.equal(s.temple.setAside.length, 0);
        assert.equal(s.stage, 1);
        assert.equal(
          ownerOf(
            s,
            allCharacters(s).find((u) => u.code === T.sahirAlly),
          ),
          0,
        );
        assert.equal(
          ownerOf(
            s,
            allCharacters(s).find((u) => u.code === T.naasiyahAlly),
          ),
          players - 1,
        );
        assert.equal(Object.keys(s.temple.lookedBy).length, 0);
        await assertPrivateMap(page, s);
        await checkpoint(
          page,
          `setup-${players}-${easy ? "easy" : "standard"}`,
          width,
        );
        const q = structuredClone(s.temple);
        s = await resume(page);
        assert.deepEqual(s.temple, q);
      }

    // Generic back inspection cannot turn into any undiscovered printed face.
    let s = F.base(2);
    F.setActive(s, T.cursed);
    await load(page, s);
    for (const code of [T.lost, T.temple]) {
      const target = s.temple.map
        .map((c) => F.cell(s, c.row, c.column))
        .find((u) => u.code === code);
      await tile(page, target.id).locator(".temple-card-inspect").click();
      await printed(page, card(code));
      assert.equal(
        await page
          .getByRole("button", { name: "Show reverse", exact: true })
          .count(),
        0,
      );
      assert.equal(await page.locator("[data-card-other-face]").count(), 0);
      const privateCode = s.temple.hiddenBacks[target.id];
      assert.ok(
        !(
          await page
            .getByRole("dialog")
            .last()
            .evaluate((e) => e.outerHTML)
        ).includes(privateCode.slice(6)),
      );
      await checkpoint(page, `private-${code}`, width);
      await close(page);
    }
    const firstInspect = page.locator(
      '[data-temple-inspect-row="0"][data-temple-inspect-column="0"]',
    );
    await firstInspect.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("data-temple-inspect-column"),
      ),
      "1",
    );
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("data-temple-inspect-row"),
      ),
      "1",
    );
    const controls = await page
      .locator(".temple-map-action")
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height));
    assert.ok(controls.every((h) => h >= 44));
    await checkpoint(page, "map-keyboard-and-touch-targets", width);

    // Winding Caverns exposes every legal destination up to three map steps,
    // even when it is outside the ordinary adjacent staging cells.
    s = F.base();
    const caverns = F.setActive(s, T.caverns),
      distant = F.cell(s, 2, 3);
    caverns.progress = 6;
    F.setFace(s, distant.id, T.flooded, true);
    s.phase = "travel";
    assert.ok(!s.staging.some((u) => u.id === distant.id));
    await load(page, s);
    assert.equal(
      await tile(page, distant.id).locator(".temple-map-travel").isEnabled(),
      true,
    );
    await tile(page, distant.id).locator(".temple-map-travel").click();
    s = await settle(page);
    assert.equal(s.activeLocation.id, distant.id);
    assert.equal(s.activeLocation.code, T.flooded);
    assert.equal(F.cell(s, 1, 1).code, T.caverns);
    assert.equal(F.cell(s, 1, 1).progress, 0);
    await checkpoint(page, "winding-caverns-actual-three-step-travel", width);

    // Pay the actual four progress and retain private seat knowledge after reload.
    s = F.base(2);
    F.setActive(s, T.cursed);
    const island = F.cell(s, 1, 2);
    island.progress = 4;
    await load(page, s);
    await tile(page, island.id).locator(".temple-map-peek").click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(get(s, island.id).progress, 0);
    assert.equal(get(s, island.id).code, T.lost);
    assert.deepEqual(s.temple.lookedBy[island.id], [0]);
    await choose(page, "close");
    s = await resume(page);
    assert.equal(
      await tile(page, island.id).locator(".temple-looked-inspect").count(),
      1,
    );
    await tile(page, island.id).locator(".temple-looked-inspect").click();
    await printed(page, card(s.temple.hiddenBacks[island.id]));
    await close(page);
    await checkpoint(
      page,
      "paid-peek-keeps-physical-back-and-reload-knowledge",
      width,
    );
    await page.keyboard.press("2");
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.table.active, 1);
    assert.equal(
      await tile(page, island.id).locator(".temple-looked-inspect").count(),
      0,
    );
    await assertPrivateMap(page, await saved(page));
    await checkpoint(page, "other-seat-cannot-inspect-private-peek", width);

    // Normal combat destroys the actual Guardian, then a ready hero claims Key.
    s = F.base();
    F.setActive(s, T.cursed);
    const guardian = s.staging.find((u) => u.code === T.guardian),
      key = s.staging.find((u) => u.code === T.key);
    engage(s, guardian, true);
    s.phase = "attack";
    const attacker = s.heroes[0];
    attacker.tempAttack = 20;
    await load(page, s);
    s = await attack(page, guardian.id, attacker.id);
    assert.equal(s.temple.victoryEnemies[0].id, guardian.id);
    assert.ok(s.victoryCards.includes(T.guardian));
    assert.equal(s.victory, 4);
    await checkpoint(page, "actual-guardian-defeat-releases-key", width);
    await boardCard(page, key.id)
      .getByRole("button", { name: "Claim · Exhaust hero", exact: true })
      .click();
    const claimer = s.heroes[1];
    await page
      .getByRole("dialog")
      .getByRole("button", { name: new RegExp(`^${card(claimer.code).name}`) })
      .click();
    s = await saved(page);
    assert.ok(get(s, claimer.id).attachments.some((a) => a.id === key.id));
    assert.equal(get(s, claimer.id).exhausted, true);
    await checkpoint(page, "claim-key-exhausts-ready-hero", width);
    // Subsequent legal planning window: both physical Key and hero are ready.
    s.phase = "planning";
    get(s, claimer.id).exhausted = false;
    get(s, claimer.id).resources = 3;
    const temple = F.cell(s, 1, 4);
    await load(page, s);
    await boardCard(page, claimer.id)
      .getByRole("button", { name: /Exhaust Key and hero/ })
      .click();
    await choose(page, temple.id);
    await choose(page, "close");
    s = await saved(page);
    assert.equal(get(s, claimer.id).resources, 0);
    assert.equal(get(s, claimer.id).exhausted, true);
    assert.equal(
      get(s, claimer.id).attachments.find((a) => a.id === key.id).exhausted,
      true,
    );
    assert.deepEqual(s.temple.lookedBy[temple.id], [0]);
    await checkpoint(
      page,
      "key-paid-peek-costs-three-and-two-exhaustions",
      width,
    );

    // Enter the rightmost Temple through its actual travel button and pay Key.
    get(s, claimer.id).attachments.find((a) => a.id === key.id).exhausted =
      false;
    const old = F.setActive(s, T.cursed, 1, 3);
    old.progress = 3;
    F.setFace(s, temple.id, T.halls, true);
    s.phase = "travel";
    await load(page, s);
    await tile(page, temple.id).locator(".temple-map-travel").click();
    s = await settle(page);
    assert.equal(s.activeLocation.id, temple.id);
    assert.equal(s.activeLocation.code, T.halls);
    assert.equal(s.temple.victoryEnemies.length, 0);
    assert.equal(get(s, guardian.id).damage, 0);
    assert.ok(s.engaged.some((u) => u.id === guardian.id));
    assert.equal(
      get(s, claimer.id).attachments.find((a) => a.id === key.id).exhausted,
      true,
    );
    assert.equal(F.cell(s, 1, 3).progress, 0);
    assert.equal(s.temple.map.length, 15);
    await checkpoint(
      page,
      "key-travel-flips-temple-and-restores-same-guardian",
      width,
    );
    await resume(page);

    // WHEN-right attacks happen before the destination's AFTER flip instruction.
    s = F.base(2);
    const origin = F.setActive(s, T.cursed),
      destination = F.cell(s, 1, 2);
    origin.progress = 3;
    F.setFace(s, destination.id, T.jungle, true);
    const profane = F.add(s, T.profane, "engaged", 1);
    s.phase = "travel";
    s.encounterDeck = Array(20).fill(T.sunken);
    await load(page, s);
    await tile(page, destination.id).locator(".temple-map-travel").click();
    await reviewedState(page);
    s = await saved(page);
    assert.equal(s.activeLocation.code, T.lost);
    assert.match(s.choice.title, /Immediate/);
    assert.equal(s.table.active, 1);
    await checkpoint(
      page,
      "right-travel-pauses-for-correct-seat-profane-attack",
      width,
    );
    s = await resume(page);
    assert.equal(s.activeLocation.code, T.lost);
    s = await settle(page);
    assert.equal(s.activeLocation.code, T.jungle);
    assert.equal(s.table.turn, 0);
    if (s.table.active !== 0) {
      await page.keyboard.press("1");
      await reviewedState(page);
      s = await saved(page);
    }
    assert.equal(s.table.active, 0);
    assert.ok(get(s, profane.id));
    await checkpoint(page, "saved-profane-attack-before-jungle-flip", width);

    // Printed objective action uses real hero spending, then disables this round.
    s = F.base();
    const sahir = allCharacters(s).find((u) => u.code === T.sahirAlly);
    sahir.resources = 0;
    await load(page, s);
    await boardCard(page, sahir.id)
      .getByRole("button", { name: /Spend 1 hero resource/ })
      .click();
    const payer = s.heroes[0];
    await choose(page, payer.id);
    s = await saved(page);
    assert.equal(get(s, payer.id).resources, 9);
    assert.equal(get(s, sahir.id).resources, 1);
    assert.equal(stats(s, get(s, sahir.id)).will, 1);
    await checkpoint(
      page,
      "captain-paid-resource-action-once-per-round",
      width,
    );

    // Actual quest progress can be redirected to a staging map location.
    s = F.base();
    F.setActive(s, T.cursed);
    s.activeLocation.progress = 3;
    const allocation = F.cell(s, 1, 2);
    s.phase = "staging";
    s.queue = [fx("resolveQuestResult")];
    s.heroes[0].committed = true;
    s.heroes[0].tempWill = 30;
    s.committedIds = [s.heroes[0].id];
    await load(page, s);
    await reviewedState(page);
    s = await saved(page);
    assert.match(s.choice.title, /Place .* progress/);
    await choose(page, `${allocation.id}:4`);
    s = await settle(page);
    assert.equal(get(s, allocation.id).progress, 4);
    assert.equal(get(s, allocation.id).code, T.lost);
    await checkpoint(
      page,
      "actual-quest-progress-allocation-keeps-map-card",
      width,
    );

    // Win and lose through normal gameplay rather than preset ended states.
    s = F.base();
    const grotto = F.setActive(s, T.grotto, 1, 4);
    grotto.progress = 7;
    s.phase = "staging";
    s.queue = [fx("resolveQuestResult")];
    s.heroes[0].committed = true;
    s.heroes[0].tempWill = 40;
    s.committedIds = [s.heroes[0].id];
    await load(page, s);
    s = await settle(page);
    assert.equal(s.status, "won");
    assert.ok(
      await page
        .getByRole("heading", { name: "Beyond the shadow", exact: true })
        .isVisible(),
    );
    await checkpoint(page, "actual-eighth-grotto-progress-victory", width);
    s = F.base();
    const naasiyah = allCharacters(s).find((u) => u.code === T.naasiyahAlly);
    naasiyah.damage = 3;
    const enemy = F.add(s, T.drowned, "engaged");
    enemy.shadows = [T.sunken];
    s.phase = "defense";
    await load(page, s);
    await boardCard(page, enemy.id)
      .getByRole("button", { name: "Defend", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Na'asiyah", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(page);
    s = await saved(page);
    if (s.choice?.title.includes("Na'asiyah")) await choose(page, "continue");
    s = await settle(page);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Na'asiyah/);
    await checkpoint(page, "actual-companion-destruction-defeat", width);

    // Inspect every printed map face in its legal fixed map position.
    for (const code of [...TEMPLE_LOST_FACES, ...TEMPLE_TEMPLE_FACES]) {
      s = F.base();
      const u = F.setActive(
        s,
        code,
        1,
        TEMPLE_TEMPLE_FACES.includes(code) ? 4 : 1,
      );
      await load(page, s);
      await tile(page, u.id).locator(".temple-card-inspect").click();
      const c = card(code);
      await printed(page, c);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await printed(page, c, true);
      await checkpoint(page, `printed-map-${code.slice(6, 14)}`, width);
      await close(page);
    }
    // Normal encounter discard, with no map/companion cards illegally routed there.
    const fronts = TEMPLE_ENCOUNTERS.filter(
      (c) =>
        !c.code.endsWith(":B") &&
        ![
          ...TEMPLE_LOST_FACES,
          ...TEMPLE_TEMPLE_FACES,
          T.sahir,
          T.naasiyah,
          T.guardian,
          T.key,
        ].includes(c.code),
    );
    s = F.base();
    s.encounterDiscard = fronts.map((c) => c.code);
    await load(page, s);
    await page
      .getByRole("button", {
        name: `Browse encounter discard: ${fronts.length} cards`,
        exact: true,
      })
      .click();
    for (const c of fronts) {
      await page
        .locator(".pile-entry")
        .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
        .getByRole("button")
        .first()
        .click();
      await printed(page, card(c.code));
      await checkpoint(page, `printed-encounter-${c.code.slice(6, 14)}`, width);
      await close(page);
    }
    await close(page);
    s = F.base();
    await load(page, s);
    for (const code of [T.guardian, T.key, T.sahirAlly, T.naasiyahAlly]) {
      const u = [...s.staging, ...allCharacters(s)].find(
        (u) => u.code === code,
      );
      await inspectUnit(page, u.id);
      await printed(page, card(code));
      if (code.endsWith(":B")) {
        await page
          .getByRole("button", { name: "Show reverse", exact: true })
          .click();
        await printed(page, card(code), true, card(code.slice(0, -2)));
      }
      await checkpoint(page, `printed-objective-${code.slice(6, 14)}`, width);
      await close(page);
    }
    await page.locator(".journey-area .quest-card-stack").click();
    await page
      .getByRole("button", { name: "Read printed quest", exact: true })
      .click();
    await printed(page, TEMPLE_QUESTS[0]);
    await page
      .getByRole("button", { name: "Show reverse", exact: true })
      .click();
    await printed(page, TEMPLE_QUESTS[0], true);
    await checkpoint(page, "printed-quest-both-faces", width);
    await close(page);
    await view.c.close();
  }
  // Original rulesheet/reference faces are proof artifacts, never hidden map DOM.
  const bundle = JSON.parse(
    await fs.readFile(
      "src/data/pending/temple-of-the-deceived-import.json",
      "utf8",
    ),
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
        const blob = new Blob([Uint8Array.from(bytes)]),
          bmp = await createImageBitmap(blob);
        const value = { width: bmp.width, height: bmp.height };
        bmp.close();
        return value;
      },
      { bytes: [...body] },
    );
    assert.ok(decoded.width > 0 && decoded.height > 0);
    artwork.push({ path: a.localPath, sha256: a.sha256, ...decoded });
  }
  assert.equal(artwork.length, 40);
  assert.equal(
    printedFaces.size,
    38,
    "36 original gameplay faces plus two privacy-safe public substitutes",
  );
  await artPage.close();
  await report(dir, {
    errors,
    screenshots,
    entries,
    checks,
    printedFaces: [...printedFaces],
    artwork,
  });
  console.log(
    `Temple browser checks passed: ${checks.length}; original artworks: ${artwork.length}`,
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
