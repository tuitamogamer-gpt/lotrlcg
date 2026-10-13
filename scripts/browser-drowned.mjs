import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/drowned-fixtures.ts";
import {
  DROWNED as D,
  DROWNED_ENCOUNTERS,
  DROWNED_QUESTS,
  DROWNED_GROTTO_CODES,
  drownedFront,
} from "../src/game/drowned-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import {
  allCharacters,
  forOwner,
  ownerOf,
  playerOrder,
  syncSeat,
} from "../src/game/table.ts";
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
const dir = "output/drowned-scenario";
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
async function checkpoint(p, label, width) {
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
async function inspect(p, id) {
  const candidate = boardCard(p, id).getByRole("button", { name: /^Inspect / });
  if (await candidate.count()) await candidate.first().click();
  else
    await p
      .getByRole("button", {
        name: new RegExp(
          `^Inspect active location: ${card(get(await saved(p), id).code).name}$`,
        ),
      })
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
async function chooseOption(p, predicate) {
  const s = await saved(p);
  assert.ok(s.choice, "the actual action opened its printed decision");
  const option = s.choice.options.find(predicate);
  assert.ok(option, JSON.stringify(s.choice));
  return choose(p, option.id);
}
function commitPower(s, power) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.heroes[0].committed = true;
      s.heroes[0].exhausted = true;
      s.heroes[0].tempWill = power;
      s.committedIds = [s.heroes[0].id];
    });
  syncSeat(s);
}
async function resolveQuest(p) {
  await p
    .getByRole("button", { name: "Resolve quest", exact: true })
    .last()
    .click();
  await reviewedState(p);
  return saved(p);
}
function physicalLocations(s) {
  return [
    ...s.drowned.grottoDeck,
    ...s.drowned.setAside,
    ...s.drowned.victoryLocations,
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
  ].filter((u) => s.drowned.originalCodes[u.id]);
}
function assertConservation(s) {
  const units = physicalLocations(s);
  assert.equal(units.length, 9);
  assert.equal(new Set(units.map((u) => u.id)).size, 9);
  for (const u of units)
    assert.ok(
      [
        drownedFront(s.drowned.originalCodes[u.id]),
        `${s.drowned.originalCodes[u.id]}:B`,
      ].includes(u.code),
    );
}
async function assertPrivateGrotto(p, s) {
  const publicText = JSON.stringify(await reviewedState(p));
  assert.ok(!publicText.includes('"originalCodes"'));
  const publicCards = [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
  ].filter((u) => u.code.startsWith("drowned-"));
  for (const u of publicCards) {
    const physical = s.drowned.originalCodes[u.id];
    assert.ok(
      !publicText.includes(`${physical}:B`),
      "the generic Grotto card conceals its paired reverse",
    );
    const element = boardCard(p, u.id);
    if (await element.count())
      assert.ok(
        !(await element.evaluate((e) => e.outerHTML)).includes(`${physical}:B`),
      );
  }
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
    for (const players of [1, 2, 3, 4])
      for (const easy of [false, true]) {
        await fresh(page, "the-drowned-ruins", players, easy);
        await page.locator("#start-btn").click();
        const s = await opening(page);
        assert.equal(s.scenarioId, "the-drowned-ruins");
        assert.equal(s.stage, 1);
        assert.equal(s.drowned.currentQuest, D.grotto);
        assert.equal(s.encounterDeck.length, easy ? 21 : 30);
        assert.equal(s.drowned.grottoDeck.length, players >= 3 ? 5 : 6);
        assert.equal(
          s.staging.filter((u) => u.code.startsWith("drowned-")).length,
          players >= 3 ? 3 : 2,
        );
        assert.deepEqual(
          s.drowned.setAside.map((u) => u.code),
          [D.shrine],
        );
        assert.equal(
          ownerOf(
            s,
            allCharacters(s).find((u) => u.code === D.sahirAlly),
          ),
          0,
        );
        assert.equal(
          ownerOf(
            s,
            allCharacters(s).find((u) => u.code === D.naasiyahAlly),
          ),
          players - 1,
        );
        assert.equal(
          await page.locator('[data-scenario-panel="drowned"]').count(),
          1,
        );
        assertConservation(s);
        await assertPrivateGrotto(page, s);
        if (players === 1 && !easy) {
          await page
            .getByRole("button", { name: /^Inspect top Grotto location:/ })
            .click();
          await printed(page, card(s.drowned.grottoDeck[0].code));
          assert.equal(
            await page
              .getByRole("button", { name: "Show reverse", exact: true })
              .count(),
            0,
            "the public top Grotto face cannot expose its Underwater reverse",
          );
          await checkpoint(
            page,
            "top-grotto-inspection-keeps-reverse-private",
            width,
          );
          await close(page);
        }
        await checkpoint(
          page,
          `setup-${players}-${easy ? "easy" : "normal"}`,
          width,
        );
        const after = await resume(page);
        assert.deepEqual(
          after.drowned,
          s.drowned,
          "physical cards, front/back pairings and Grotto order survive reload",
        );
      }

    // The real Travel control opens the optional flip; the physical ID survives.
    let s = F.base();
    s.phase = "travel";
    const location = s.staging.find((u) => u.code.startsWith("drowned-"));
    const original = s.drowned.originalCodes[location.id];
    await load(page, s);
    await inspect(page, location.id);
    await printed(page, card(location.code));
    assert.equal(
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .count(),
      0,
      "an unexplored Grotto inspection cannot reveal its hidden Underwater face",
    );
    await close(page);
    await boardCard(page, location.id)
      .getByRole("button", { name: "Travel here", exact: true })
      .click();
    await reviewedState(page);
    s = await chooseOption(
      page,
      (o) =>
        /flip/i.test(o.label) && !/do not|without|keep|leave/i.test(o.label),
    );
    s = await settle(page);
    assert.equal(s.activeLocation.id, location.id);
    assert.equal(s.activeLocation.code, `${original}:B`);
    assert.equal(s.activeLocation.progress, 0);
    assertConservation(s);
    await inspect(page, location.id);
    await printed(page, card(`${original}:B`));
    await checkpoint(page, "travel-flips-the-same-physical-location", width);
    await close(page);
    const flipped = await resume(page);
    assert.deepEqual(flipped.drowned, s.drowned);
    assert.equal(flipped.activeLocation.code, `${original}:B`);

    // The legal hand inspector explains and blocks both restricted card types.
    s = flipped;
    s.phase = "planning";
    s.hand = [make(s, "01014"), make(s, "01026")];
    for (const hero of s.heroes) hero.resources = 10;
    await load(page, s);
    for (const u of s.hand) {
      await inspect(page, u.id);
      assert.match(
        await page.locator(".inspector-action").innerText(),
        /Allies and attachments cannot be played while the active location is Underwater/,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Play this card", exact: true })
          .isDisabled(),
        true,
      );
      await checkpoint(
        page,
        `underwater-prevents-${card(u.code).type_code}`,
        width,
      );
      await close(page);
    }

    // Quest progress explores an Underwater card and reveals the next Grotto.
    s = F.base();
    const active = F.setActive(s, DROWNED_GROTTO_CODES[0], true);
    s.phase = "staging";
    commitPower(s, 30);
    const remaining = s.drowned.grottoDeck.length;
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.ok(s.drowned.victoryLocations.some((u) => u.id === active.id));
    assert.ok(s.victoryCards.includes(active.code));
    assert.equal(s.drowned.grottoDeck.length, remaining - 1);
    assert.equal(
      s.stage,
      1,
      "one Underwater victory cannot bypass the three-location gate",
    );
    assertConservation(s);
    await checkpoint(page, "underwater-victory-replenishes-grotto", width);
    await resume(page);

    // Exploring a Grotto front shuffles it back into the hidden pile. Fresh
    // opaque handles prevent tracking a previously seen reverse through it.
    s = F.base();
    const recycled = F.setActive(s, DROWNED_GROTTO_CODES[0], false);
    s.phase = "staging";
    commitPower(s, 30);
    const oldHiddenIds = new Set([
      ...s.drowned.grottoDeck.map((u) => u.id),
      recycled.id,
    ]);
    const originalPairs = Object.values(s.drowned.originalCodes).sort();
    const grottoCount = s.drowned.grottoDeck.length;
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.drowned.victoryLocations.length, 0);
    assert.equal(s.drowned.grottoDeck.length, grottoCount);
    assert.deepEqual(
      Object.values(s.drowned.originalCodes).sort(),
      originalPairs,
    );
    assert.ok(
      Object.keys(s.drowned.originalCodes).every((id) => !oldHiddenIds.has(id)),
      "the shuffled pile exposes no old trackable card handles",
    );
    assertConservation(s);
    await assertPrivateGrotto(page, s);
    await checkpoint(
      page,
      "grotto-exploration-reseals-shuffled-identities",
      width,
    );
    const resealed = await resume(page);
    assert.deepEqual(
      resealed.drowned,
      s.drowned,
      "reload preserves the newly sealed pile without resealing it again",
    );

    // Two saved Underwater victories plus a third actual exploration trigger Betrayal.
    s = F.base(2);
    s.encounterDeck = [D.drowned, D.drowned, ...s.encounterDeck];
    for (let i = 0; i < 2; i++) {
      const u = s.drowned.grottoDeck.shift();
      u.code = `${s.drowned.originalCodes[u.id]}:B`;
      u.progress = card(u.code).quest;
      s.drowned.victoryLocations.push(u);
      s.victoryCards ??= [];
      s.victoryCards.push(u.code);
    }
    const third = F.setActive(
      s,
      s.drowned.originalCodes[s.drowned.grottoDeck[0].id],
      true,
    );
    s.phase = "staging";
    s.progress = 15;
    commitPower(s, 30);
    const sahirId = allCharacters(s).find((u) => u.code === D.sahirAlly).id;
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.stage, 2);
    assert.equal(s.drowned.currentQuest, D.betrayal);
    assert.equal(s.activeLocation.code, D.shrine);
    assert.ok(s.drowned.victoryLocations.some((u) => u.id === third.id));
    assert.ok(s.drowned.removedUnits.some((u) => u.id === sahirId));
    assert.ok(!allCharacters(s).some((u) => u.id === sahirId));
    assert.ok(
      s.staging.filter((u) => card(u.code).traits?.includes("Undead."))
        .length >= 2,
    );
    assertConservation(s);
    await checkpoint(page, "third-underwater-victory-triggers-betrayal", width);
    await resume(page);

    // Shrine flips at the next quest phase and retains accumulated progress.
    s = F.stage2();
    s.phase = "planning";
    s.activeLocation.progress = 7;
    await load(page, s);
    s = await next(page);
    s = await settle(page);
    assert.equal(s.phase, "quest");
    assert.equal(s.activeLocation.code, `${D.shrine}:B`);
    assert.equal(s.activeLocation.progress, 7);
    await checkpoint(page, "shrine-forced-flip-preserves-progress", width);
    await resume(page);

    // Actual quest resolution reaches the printed Shrine victory condition.
    s = F.stage2();
    s.phase = "staging";
    s.activeLocation.code = `${D.shrine}:B`;
    s.activeLocation.progress = 17;
    commitPower(s, 60);
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.status, "won");
    assert.ok(
      s.drowned.victoryLocations.some((u) => u.code === `${D.shrine}:B`),
    );
    assert.ok(
      await page
        .getByRole("heading", { name: "Beyond the shadow", exact: true })
        .isVisible(),
    );
    await checkpoint(page, "shrine-exploration-victory", width);

    // Undertow can keep the Shrine's printed Grotto face active; its own victory
    // sentence still wins when actual quest resolution explores that face.
    s = F.stage2();
    s.phase = "staging";
    s.drowned.flipLockedRound = s.round;
    s.activeLocation.progress = 17;
    commitPower(s, 60);
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.status, "won");
    assert.ok(s.drowned.victoryLocations.some((u) => u.code === D.shrine));
    assert.ok(s.victoryCards.includes(D.shrine));
    assert.ok(
      await page
        .getByRole("heading", { name: "Beyond the shadow", exact: true })
        .isVisible(),
    );
    await checkpoint(page, "locked-grotto-shrine-exploration-victory", width);

    // A surviving flooded Shrine raises threat by five through the quest control.
    s = F.stage2();
    s.phase = "staging";
    s.activeLocation.code = `${D.shrine}:B`;
    s.threat = 45;
    s.staging = s.staging.filter((u) => s.drowned.originalCodes[u.id]);
    commitPower(s, 0);
    for (const u of allCharacters(s)) {
      u.committed = false;
      u.tempWill = 0;
    }
    s.committedIds = [];
    await load(page, s);
    await resolveQuest(page);
    s = await settle(page);
    assert.equal(s.status, "lost");
    assert.ok(
      await page
        .getByRole("heading", {
          name: "The fellowship has fallen",
          exact: true,
        })
        .isVisible(),
    );
    await checkpoint(page, "flooded-shrine-threat-defeat", width);

    // An actual defended enemy attack destroys the companion and loses the game.
    s = F.base();
    s.phase = "defense";
    const companion = allCharacters(s).find((u) => u.code === D.naasiyahAlly);
    companion.damage = stats(s, companion).health - 1;
    companion.exhausted = false;
    const enemy = make(s, D.scorpion);
    enemy.owner = 0;
    enemy.tempAttack = 5;
    enemy.shadows = [];
    s.engaged.push(enemy);
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
    s = await settle(page);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Na'asiyah/);
    await checkpoint(page, "companion-destruction-defeat", width);

    // Inspect all public Grotto fronts and every resolved paired Underwater face.
    for (const code of [...new Set(DROWNED_GROTTO_CODES)]) {
      s = F.base();
      let u = F.setActive(s, code, false);
      await load(page, s);
      await inspect(page, u.id);
      await printed(page, card(u.code));
      assert.equal(
        await page
          .getByRole("button", { name: "Show reverse", exact: true })
          .count(),
        0,
      );
      await close(page);
      u = F.setActive(s, code, true);
      await load(page, s);
      await inspect(page, u.id);
      await printed(page, card(u.code));
      await checkpoint(page, `printed-underwater-${code.slice(6, 14)}`, width);
      await close(page);
    }
    const ordinary = DROWNED_ENCOUNTERS.filter(
      (c) =>
        !c.code.endsWith(":B") &&
        !c.code.startsWith("drowned-") &&
        !DROWNED_GROTTO_CODES.includes(c.code) &&
        ![D.shrine, D.sahir, D.naasiyah].includes(c.code),
    );
    s = F.base();
    s.encounterDiscard = ordinary.map((c) => c.code);
    await load(page, s);
    await page
      .getByRole("button", {
        name: `Browse encounter discard: ${ordinary.length} cards`,
        exact: true,
      })
      .click();
    for (const c of ordinary) {
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
    for (const code of [D.sahirAlly, D.naasiyahAlly]) {
      s = F.base();
      await load(page, s);
      const u = allCharacters(s).find((u) => u.code === code);
      await inspect(page, u.id);
      await printed(page, card(code));
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await printed(page, card(code), true, card(code.slice(0, -2)));
      await checkpoint(page, `printed-companion-${code.slice(6, 14)}`, width);
      await close(page);
    }
    s = F.stage2();
    await load(page, s);
    await inspect(page, s.activeLocation.id);
    await printed(page, card(D.shrine));
    await page
      .getByRole("button", { name: "Show reverse", exact: true })
      .click();
    await printed(page, card(D.shrine), true);
    await checkpoint(page, "printed-shrine-both-faces", width);
    await close(page);
    for (const [index, c] of DROWNED_QUESTS.entries()) {
      s = index === 0 ? F.base() : F.stage2();
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
      await checkpoint(page, `printed-quest-${index + 1}-both-faces`, width);
      await close(page);
    }
    await view.c.close();
  }
  const bundle = JSON.parse(
    await fs.readFile("src/data/pending/the-drowned-ruins-import.json", "utf8"),
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
        const value = { width: bmp.width, height: bmp.height };
        bmp.close();
        return value;
      },
      { bytes: [...body] },
    );
    assert.ok(decoded.width > 0 && decoded.height > 0);
    artwork.push({ path: a.localPath, sha256: a.sha256, ...decoded });
  }
  assert.equal(
    artwork.length,
    bundle.artwork.length,
    "all imported original front, reverse and rulesheet files are served intact",
  );
  assert.ok(
    printedFaces.size >= 25,
    "actual inspection controls exercised the scenario's printed gameplay faces",
  );
  await artPage.close();
  await report(dir, {
    smoke: false,
    sourceScriptSha256,
    errors,
    screenshots,
    entries,
    checks,
    printedFaces: [...printedFaces],
    artwork,
  });
  console.log(
    `Drowned browser checks passed: ${checks.length}; original artworks: ${artwork.length}`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        smoke: false,
        sourceScriptSha256,
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
