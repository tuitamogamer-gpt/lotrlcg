import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import * as W from "../tests/wastes-eriador-fixtures.ts";
import * as G from "../tests/mount-gram-fixtures.ts";
import * as E from "../tests/ettenmoors-fixtures.ts";
import * as R from "../tests/rhudaur-fixtures.ts";
import * as C from "../tests/carn-dum-fixtures.ts";
import * as D from "../tests/dread-realm-fixtures.ts";
import { WASTES } from "../src/game/wastes-eriador-support.ts";
import {
  GRAM,
  gramQuestUnit,
  gramAllAreaUnits,
} from "../src/game/mount-gram-support.ts";
import { ETTEN } from "../src/game/ettenmoors-support.ts";
import { RHUDAUR } from "../src/game/rhudaur-support.ts";
import { CARN } from "../src/game/carn-dum-support.ts";
import { DREAD } from "../src/game/dread-realm-support.ts";
import { dreadReanimate } from "../src/game/dread-realm.ts";
import { stats } from "../src/game/engine.ts";
import { card, imageUrl, cachedImageSource, plain } from "../src/game/cards.ts";
import { fx, make, get } from "../src/game/core.ts";
import { revealed } from "../src/game/board.ts";
import { handle, flush } from "../src/game/effects.ts";
import {
  allCharacters,
  allEngaged,
  allActiveLocations,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table.ts";
import { allQuestUnits } from "../src/game/quest-state.ts";
import {
  sideQuestStart,
  addCurrentQuestProgress,
} from "../src/game/side-quests.ts";
import {
  url,
  saved,
  load,
  resume,
  choose,
  settle,
  opening,
  fresh,
  next,
  context,
  capture,
  report,
} from "./browser-angmar-helpers.mjs";

const smoke = process.env.ANGMAR_BROWSER_SMOKE === "1";
const dir = "output/angmar-quests";
await fs.mkdir(dir, { recursive: true });
const quests = [
  ["wastes-of-eriador", "the-wastes-of-eriador", "wastes", W],
  ["escape-from-mount-gram", "escape-from-mount-gram", "gram", G],
  ["across-the-ettenmoors", "across-the-ettenmoors", "etten", E],
  ["the-treachery-of-rhudaur", "the-treachery-of-rhudaur", "rhudaur", R],
  ["the-battle-of-carn-dum", "the-battle-of-carn-dum", "carn", C],
  ["the-dread-realm", "the-dread-realm", "dread", D],
];
const sources = Object.fromEntries(
  await Promise.all(
    quests.map(async ([id, slug]) => [
      id,
      JSON.parse(
        await fs.readFile(
          new URL(`../src/data/pending/${slug}-import.json`, import.meta.url),
          "utf8",
        ),
      ),
    ]),
  ),
);
const browser = await chromium.launch({ headless: true }),
  errors = [],
  screenshots = [],
  setups = [],
  entries = new Set(),
  checks = [];
let activePage;
function questing(s, will = 30) {
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  s.heroes[0].tempWill = will;
  s.committedIds = [s.heroes[0].id];
  return s;
}
function inventory(s) {
  const units = s.mountGram?.split
    ? gramAllAreaUnits(s)
    : [...s.staging, ...allActiveLocations(s)];
  const aside = [s.wastesEriador, s.mountGram, s.rhudaur, s.dreadRealm].flatMap(
    (q) => q?.setAside ?? [],
  );
  return [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...(s.removedEncounter ?? []),
    ...(s.mountGram?.orcDeck ?? []),
    ...(s.mountGram?.removedEncounter ?? []),
    ...(s.victoryCards ?? []),
    ...units.map((u) => u.code),
    ...allEngaged(s).map((u) => u.code),
    ...aside.map((u) => u.code),
    ...allCharacters(s)
      .filter((u) => card(u.code).sphere_code === "encounter")
      .map((u) => u.code),
    ...[...units, ...allEngaged(s)].flatMap((u) => u.shadows),
    ...allQuestUnits(s).flatMap((u) => u.attachments.map((a) => a.code)),
    ...allCharacters(s).flatMap((u) => u.attachments.map((a) => a.code)),
  ];
}
function verifyRecipe(s, easy) {
  const source = sources[s.scenarioId],
    recipe = source.recipes.find(
      (r) => r.mode === (easy ? "easy" : "standard"),
    );
  const expected = recipe.cards
    .filter(
      (c) =>
        !["quest", "rules"].includes(
          source.cards.find((def) => def.code === c.code)?.type_code,
        ),
    )
    .flatMap((c) => Array(c.quantity).fill(c.code));
  const physical = inventory(s);
  for (const code of new Set(expected))
    assert.equal(
      physical.filter((x) => x === code).length,
      expected.filter((x) => x === code).length,
      `${s.scenarioId} ${card(code).name} physical recipe copies`,
    );
}
async function checkpoint(p, name, width) {
  await capture(p, dir, `${name}-${width}`, screenshots);
  checks.push(name);
  console.log(`PASS ${name} @ ${width}`);
}
async function finishChoice(p, id) {
  await choose(p, id);
  return settle(p);
}
async function defendChoice(p, s, id) {
  const option = s.choice.options.find(
    (o) => o.id === id || o.effects.some((e) => e.ids?.includes(id)),
  );
  assert.ok(option, JSON.stringify(s.choice));
  await choose(p, option.id);
  return settle(p);
}
async function primaryFace(p, c, reverse = false) {
  assert.equal(
    await p.locator("[data-card-primary-name]").innerText(),
    reverse ? (c.back_name ?? c.name) : c.name,
  );
  assert.equal(
    await p.locator("[data-card-primary-traits]").innerText(),
    (reverse ? (c.back_traits ?? c.traits) : c.traits) ?? "",
  );
  assert.equal(
    await p.locator("[data-card-primary-rules]").textContent(),
    plain(reverse ? (c.back_text ?? c.text) : c.text) ||
      "No additional abilities.",
  );
  const other = p.locator("[data-card-other-face]");
  assert.match(await other.locator("h4").innerText(), /Other printed face/);
  assert.equal(
    await other.locator(".rules-text").textContent(),
    plain(reverse ? c.text : c.back_text),
  );
}
async function semantics(p, width) {
  // End-of-round Time is an actual dispatch, and reload does not repeat its forced reveal.
  let s = W.base();
  s.phase = "refresh";
  const n = s.encounterDeck.length;
  await load(p, s);
  await next(p);
  s = await settle(p);
  assert.equal(s.staging.find((u) => u.code === WASTES.time).flipped, true);
  assert.equal(s.encounterDeck.length, n - 1);
  assert.equal(s.round, 2);
  await checkpoint(p, "wastes-nightfall", width);
  const beforeTimeReading = await saved(p);
  await p
    .getByRole("button", { name: "Read the Time objective", exact: true })
    .click();
  await primaryFace(p, card(WASTES.time), true);
  const nightImage = await p
    .locator(".card-detail-art img")
    .getAttribute("src");
  assert.ok(
    nightImage.endsWith(cachedImageSource(card(WASTES.time).back_imagesrc)),
  );
  await p.getByRole("button", { name: "Show front", exact: true }).click();
  await primaryFace(p, card(WASTES.time));
  const dayImage = await p.locator(".card-detail-art img").getAttribute("src");
  assert.notEqual(
    dayImage,
    nightImage,
    "Time inspection can show the other printed face",
  );
  assert.ok(dayImage.endsWith(imageUrl(card(WASTES.time))));
  await checkpoint(p, "wastes-time-other-face", width);
  assert.equal(
    await p
      .getByRole("button", { name: "Show reverse", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await p.getByRole("button", { name: "Show reverse", exact: true }).click();
  await primaryFace(p, card(WASTES.time), true);
  assert.equal(
    await p
      .getByRole("button", { name: "Show front", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await p.locator(".card-detail-art img").getAttribute("src"),
    nightImage,
  );
  assert.deepEqual(
    await saved(p),
    beforeTimeReading,
    "inspecting Time faces changes no game state",
  );
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  const same = await resume(p);
  assert.equal(same.encounterDeck.length, n - 1);
  s = W.night(questing(W.base()));
  await load(p, s);
  await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
  s = await settle(p);
  assert.equal(s.progress, 0);
  await checkpoint(p, "wastes-night-progress-blocked", width);
  s = W.base();
  s.allies.push(make(s, "01016"));
  revealed(s, WASTES.predatory);
  flush(s);
  await load(p, s);
  await checkpoint(p, "wastes-predatory-choice", width);
  await resume(p);
  s = await finishChoice(p, "discard");
  assert.ok(s.discard.includes("01016"));
  await checkpoint(p, "wastes-predatory-resolved", width);
  // Each dungeon retains a physical quest, while its prisoners stay facedown in public UI.
  s = G.base(2);
  let dungeon = gramQuestUnit(s);
  const prisoner = G.captive(s, dungeon, "01016", 0);
  G.capturedDeck(s, ["01014", "01027"], 0);
  questing(s, 1);
  await load(p, s);
  assert.match(
    await p.locator(".tabletop-progress").innerText(),
    /1 captives remaining/,
  );
  assert.equal(
    await p
      .locator('[data-scenario-panel="gram"] [data-card-code="01016"]')
      .count(),
    0,
  );
  await checkpoint(p, "gram-private-dungeon-prisoners", width);
  await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
  s = await settle(p);
  assert.ok(seatView(s, 0).hand.some((u) => u.id === prisoner.id));
  await checkpoint(p, "gram-prisoner-rescued", width);
  s = G.base(2);
  await load(p, s);
  await p.locator(".seat-tab").nth(1).click();
  s = await saved(p);
  assert.equal(s.table.active, 1);
  assert.equal(
    s.mountGram.areas.find((a) => a.players.includes(1)).id,
    s.mountGram.activeArea,
  );
  await checkpoint(p, "gram-other-staging-area", width);
  // Three real commitment turns hand staging back to the first unresolved private area.
  s = G.base(3);
  for (const owner of s.table.seats.map((_, i) => i)) {
    const area = s.mountGram.areas.find((a) => a.players.includes(owner));
    G.captive(s, area.quest, "01016", owner);
    G.captive(s, area.quest, "01017", owner);
    forOwner(s, owner, () => {
      s.heroes[0].tempWill = 1 - stats(s, s.heroes[0]).will;
    });
  }
  s.phase = "quest";
  await load(p, s);
  for (let owner = 0; owner < 3; owner++) {
    s = await saved(p);
    if (s.table.active !== s.table.turn) {
      await next(p);
      s = await settle(p);
    }
    assert.equal(s.table.active, owner);
    const hero = s.heroes[0];
    await p
      .locator(`[data-motion-card="${hero.id}"]`)
      .getByRole("button", {
        name: `Commit ${card(hero.code).name}`,
        exact: true,
      })
      .click();
    await next(p);
    s = await settle(p);
  }
  assert.equal(s.phase, "staging");
  assert.equal(
    s.table.active,
    0,
    "staging starts in the first player's unresolved dungeon",
  );
  assert.equal(
    s.table.turn,
    0,
    "the resolution action belongs to the visible dungeon owner",
  );
  await checkpoint(p, "gram-three-player-staging-handoff", width);
  s = await resume(p);
  await next(p);
  s = await settle(p);
  assert.equal(s.phase, "staging");
  assert.equal(
    s.table.active,
    1,
    "resolving the first area selects the second unresolved dungeon",
  );
  assert.equal(s.table.turn, 1);
  await checkpoint(p, "gram-three-player-next-area", width);
  s = G.browserJoin();
  const joiningQuest = gramQuestUnit(s);
  const destination = s.mountGram.areas.find((a) => a.players.includes(2));
  const destinationPrisoner = s.mountGram.captured[destination.quest.id][0].id;
  await load(p, s);
  await next(p);
  s = await saved(p);
  assert.match(s.choice.title, /Join another staging area/);
  await checkpoint(p, "gram-three-player-join-choice", width);
  await resume(p);
  s = await finishChoice(p, destination.id);
  assert.equal(s.stage, 2);
  assert.equal(s.mountGram.areas.length, 2);
  assert.deepEqual(
    s.mountGram.areas
      .find((a) => a.id === destination.id)
      .players.slice()
      .sort((a, b) => a - b),
    [0, 2],
  );
  assert.equal(
    s.mountGram.captured[destination.quest.id][0].id,
    destinationPrisoner,
  );
  assert.ok(s.mountGram.removedQuests.some((q) => q.id === joiningQuest.id));
  await checkpoint(p, "gram-three-player-joined-area", width);
  s = await resume(p);
  assert.equal(s.mountGram.areas.length, 2);
  s = G.flight();
  const gate = G.gate(s);
  s.phase = "travel";
  s.progress = 16;
  await load(p, s);
  await p
    .getByRole("button", { name: /Travel/ })
    .filter({ hasText: "Travel" })
    .first()
    .click();
  s = await settle(p);
  assert.equal(s.activeLocation?.id, gate.id);
  assert.equal(s.status, "playing");
  await checkpoint(p, "gram-gate-blocks-victory", width);
  // Safe keyword resolves before its optional Response; declining preserves damage.
  for (const accept of [false, true]) {
    s = E.base(2);
    s.phase = "travel";
    const safe = make(s, ETTEN.hoarwell);
    s.staging.push(safe);
    for (const owner of playerOrder(s))
      forOwner(s, owner, () => {
        s.heroes[0].damage = 2;
        const e = make(s, ETTEN.goblin);
        s.engaged.push(e);
      });
    await load(p, s);
    await p
      .getByRole("button", { name: "Travel here", exact: true })
      .first()
      .click();
    await checkpoint(
      p,
      `etten-safe-${accept ? "use" : "skip"}-response`,
      width,
    );
    await resume(p);
    s = await finishChoice(p, accept ? "use" : "skip");
    assert.equal(allEngaged(s).length, 0);
    for (const owner of playerOrder(s))
      assert.equal(seatView(s, owner).heroes[0].damage, accept ? 1 : 2);
    assert.equal(s.activeLocation.id, safe.id);
    await checkpoint(p, `etten-safe-${accept ? "healed" : "declined"}`, width);
  }
  // Side quest flips in place; the Clue Action attaches that same card to its chosen hero.
  s = R.base();
  const clue = s.staging.find((u) => u.code === RHUDAUR.debris);
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = R.choose(s, clue.id);
  addCurrentQuestProgress(s, 18);
  flush(s);
  s = R.settle(s);
  await load(p, s);
  assert.equal(get(s, clue.id).code, RHUDAUR.heirloom);
  await checkpoint(p, "rhudaur-clue-unclaimed", width);
  const ability = p.getByRole("button", {
    name: "Exhaust a hero or Amarthiúl · Claim this Clue",
    exact: true,
  });
  await ability.click();
  await checkpoint(p, "rhudaur-clue-claim", width);
  s = await saved(p);
  const h = s.heroes[0];
  s = await finishChoice(p, h.id);
  assert.ok(get(s, h.id).attachments.some((a) => a.id === clue.id));
  await checkpoint(p, "rhudaur-clue-attached", width);
  s = R.base();
  s.rhudaur.time = 1;
  s.phase = "refresh";
  await load(p, s);
  await next(p);
  s = await settle(p);
  assert.equal(s.stage, 2);
  assert.equal(s.rhudaur.time, 0);
  assert.ok(
    !s.staging.some((u) =>
      [RHUDAUR.spirits, RHUDAUR.texts, RHUDAUR.debris].includes(u.code),
    ),
  );
  await checkpoint(p, "rhudaur-time-expired", width);
  await resume(p);
  // Printed Thaurdir faces retain the same physical card and shadow pile after flipping.
  s = C.browserCaptain();
  await load(p, s);
  assert.match(
    await p.locator('[data-scenario-panel="carn"]').innerText(),
    /Captain/,
  );
  await checkpoint(p, "carn-captain", width);
  s = C.browserChampion();
  await load(p, s);
  assert.match(
    await p.locator('[data-scenario-panel="carn"]').innerText(),
    /Champion.*6 \/ 9 hit points/s,
  );
  const beforeThaurdirReading = await saved(p);
  await p
    .getByRole("button", { name: "Read Thaurdir’s current face", exact: true })
    .click();
  await primaryFace(p, card(CARN.thaurdir), true);
  const championImage = await p
    .locator(".card-detail-art img")
    .getAttribute("src");
  assert.ok(
    championImage.endsWith(
      cachedImageSource(card(CARN.thaurdir).back_imagesrc),
    ),
  );
  await checkpoint(p, "carn-champion-print", width);
  await p.getByRole("button", { name: "Show front", exact: true }).click();
  await primaryFace(p, card(CARN.thaurdir));
  const captainImage = await p
    .locator(".card-detail-art img")
    .getAttribute("src");
  assert.notEqual(
    captainImage,
    championImage,
    "Thaurdir inspection can show the other printed face",
  );
  assert.ok(captainImage.endsWith(imageUrl(card(CARN.thaurdir))));
  await checkpoint(p, "carn-captain-other-face", width);
  assert.equal(
    await p
      .getByRole("button", { name: "Show reverse", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await p.getByRole("button", { name: "Show reverse", exact: true }).click();
  await primaryFace(p, card(CARN.thaurdir), true);
  assert.equal(
    await p
      .getByRole("button", { name: "Show front", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await p.locator(".card-detail-art img").getAttribute("src"),
    championImage,
  );
  assert.deepEqual(
    await saved(p),
    beforeThaurdirReading,
    "inspecting Thaurdir faces changes no game state",
  );
  s = C.browserFlipChoice();
  const boss = s.staging.find((u) => u.code === CARN.thaurdir);
  s.heroes[0].tempDefense = 20;
  await load(p, s);
  await checkpoint(p, "carn-flip-immediate-attack", width);
  const savedFlip = await resume(p);
  assert.equal(
    savedFlip.staging.find((u) => u.id === boss.id).shadows.length,
    boss.shadows.length,
    "flipping and saving retain the existing and freshly dealt shadows before the attack",
  );
  s = await defendChoice(p, await saved(p), s.heroes[0].id);
  assert.equal(
    s.staging.find((u) => u.id === boss.id).shadows.length,
    0,
    "resolved shadows leave after the immediate attack; only unresolved shadows stay in stage 1",
  );
  assert.equal(s.staging.find((u) => u.id === boss.id).flipped, true);
  await checkpoint(p, "carn-flip-attack-shadows-resolved", width);
  // Reanimated units present only their generic enemy face; their original identity remains hidden.
  s = D.base(2);
  const hidden = make(s, "01020");
  const dead = dreadReanimate(s, hidden, 1);
  flush(s);
  s = D.settle(s);
  await load(p, s);
  assert.match(
    await p.locator('[data-scenario-panel="dread"]').innerText(),
    /Reanimated Dead · 1 in play/,
  );
  assert.equal(
    await p.locator(`img[data-card-code="${hidden.code}"]`).count(),
    0,
  );
  await checkpoint(p, "dread-hidden-reanimated", width);
  await p.locator(".seat-tab").nth(1).click();
  await p
    .getByRole("button", { name: "Inspect Reanimated Dead", exact: true })
    .first()
    .click();
  assert.ok(
    !(await p.getByRole("dialog").innerText()).includes(card(hidden.code).name),
  );
  await checkpoint(p, "dread-reanimated-inspection", width);
  s = D.second();
  s.allies.push(make(s, "01016"));
  revealed(s, DREAD.possession);
  flush(s);
  await load(p, s);
  await checkpoint(p, "dread-sorcery-choice", width);
  s = await settle(p);
  assert.ok(s.staging.some((u) => u.code === DREAD.daechanar));
  await checkpoint(p, "dread-sorcery-resolved", width);
}
try {
  for (const [width, height] of smoke
    ? [[1280, 900]]
    : [
        [1280, 900],
        [390, 844],
      ]) {
    const { c, p } = await context(browser, width, height, errors, entries);
    activePage = p;
    for (const [id, , panel] of smoke ? [] : quests) {
      for (const players of [1, 2, 3, 4])
        for (const easy of [false, true]) {
          await fresh(p, id, players, easy);
          if (players === 1 && !easy) await checkpoint(p, `${id}-menu`, width);
          await p.locator("#start-btn").click();
          const s = await opening(p);
          assert.equal(s.scenarioId, id);
          assert.equal(!!s.easyMode, easy);
          assert.equal(s.table.seats.length, players);
          assert.equal(s.status, "playing");
          verifyRecipe(s, easy);
          assert.ok(
            await p.locator(`[data-scenario-panel="${panel}"]`).count(),
          );
          await checkpoint(
            p,
            `${id}-${players}p-${easy ? "easy" : "normal"}`,
            width,
          );
          setups.push({ id, players, easy, width, stage: s.stage });
          const restored = await resume(p);
          assert.equal(restored.scenarioId, id);
          assert.equal(restored.round, s.round);
          assert.equal(restored.stage, s.stage);
          verifyRecipe(restored, easy);
        }
    }
    await semantics(p, width);
    // Decode every runtime front/reverse, including Clue reward faces.
    const faces = [
      ...new Set(
        quests.flatMap(([id]) =>
          sources[id].cards.flatMap((source) => {
            return [
              imageUrl(source),
              ...(source.back_imagesrc
                ? [cachedImageSource(source.back_imagesrc)]
                : []),
            ];
          }),
        ),
      ),
    ];
    const broken = await p.evaluate(
      async (urls) =>
        (
          await Promise.all(
            urls.map(async (url) => {
              const i = new Image();
              i.src = url;
              try {
                await i.decode();
                return null;
              } catch {
                return url;
              }
            }),
          )
        ).filter(Boolean),
      faces,
    );
    assert.deepEqual(broken, []);
    checks.push(`${faces.length} original faces decoded at ${width}`);
    await c.close();
  }
  const { c, p } = await context(browser, 320, 750, errors, entries);
  activePage = p;
  for (const [id, , , fixture] of smoke ? [] : quests) {
    await load(p, fixture.base());
    await checkpoint(p, `${id}-narrow-public-state`, 320);
  }
  await c.close();
  await report(dir, {
    entries,
    errors,
    screenshots,
    setups,
    checks,
    reviewMode: "all",
    smoke,
  });
  console.log(
    `Angmar quests: ${screenshots.length} browser checkpoints; ${setups.length} real menu setups passed (${url}).`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        url,
        entries: [...entries],
        errors,
        screenshots,
        setups,
        failure: String(error),
        stack: error.stack,
        lastState:
          activePage && !activePage.isClosed()
            ? await saved(activePage).catch(() => null)
            : null,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
