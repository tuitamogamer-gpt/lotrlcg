import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  base as gBase,
  second as gSecond,
  setQuest,
  giveSword,
} from "../tests/mount-gundabad-fixtures.ts";
import { base as fBase } from "../tests/fate-wilderland-fixtures.ts";
import { applyAction, validateSave } from "../src/game/engine.ts";
import { card, imageUrl } from "../src/game/cards.ts";
import { fx, make, stats } from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import { allCharacters, syncSeat, seatView } from "../src/game/table.ts";
import {
  GUNDABAD as G,
  gundabadDragon,
  mountGundabadPublicState,
} from "../src/game/mount-gundabad-support.ts";
import {
  FATE_WILDERLAND as F,
  FATE_WILDERLAND_QUESTS,
  FATE_WILDERLAND_RECIPES,
  fateWilderlandPublicState,
} from "../src/game/fate-wilderland-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/ered-finale";
await fs.mkdir(dir, { recursive: true });
const mountSource = JSON.parse(
  await fs.readFile("src/data/pending/mount-gundabad-import.json", "utf8"),
);
const fateCodes = [
  ...new Set([
    ...FATE_WILDERLAND_QUESTS.map((c) => c.code),
    ...FATE_WILDERLAND_RECIPES.flatMap((r) => r.cards.map((c) => c.code)),
  ]),
];
const faces = [...mountSource.cards, ...fateCodes.map(card)].flatMap((c) => [
  imageUrl(c),
  ...(c.back_imagesrc ? [c.back_imagesrc] : []),
]);
assert.equal(faces.length, 71, "all original face entries across both quests");
const add = (s, code) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const committed = (s, hero = 0) => {
  s.phase = "staging";
  Object.assign(s.heroes[hero], {
    committed: true,
    exhausted: true,
    tempWill: 40,
  });
  s.committedIds = [s.heroes[hero].id];
  return s;
};
const door = gBase();
const front = setQuest(gSecond(), G.lower, true);
front.progress = 2;
const deep = gSecond();
deep.phase = "travel";
const stair = add(deep, G.stairs);
const lake = deep.mountGundabad.cavesDeck.find((u) => u.code === G.lake);
assert.ok(lake);
deep.mountGundabad.cavesDeck = [
  lake,
  ...deep.mountGundabad.cavesDeck.filter((u) => u.id !== lake.id),
];
const firstCave = deep.mountGundabad.cavesDeck[0];
const forgeTravel = gSecond(2);
forgeTravel.phase = "travel";
const forge = forgeTravel.mountGundabad.setAside.shift();
forgeTravel.staging.push(forge);
let forgeExplore = applyAction(forgeTravel, { type: "TRAVEL", id: forge.id });
flush(forgeExplore);
committed(forgeExplore, 1);
forgeExplore.encounterDeck = Array(30).fill(G.ruins);
const swordId = allCharacters(forgeExplore)
  .flatMap((u) => u.attachments)
  .find((a) => a.code === G.sword).id;
const wormWin = setQuest(gSecond(), G.worm, false, [
  G.door,
  G.upper,
  G.lower,
  G.warriors,
  G.wrath,
]);
giveSword(wormWin, 0, true);
wormWin.phase = "attack";
gundabadDragon(wormWin).damage = stats(wormWin, gundabadDragon(wormWin)).health;
const swordLoss = gSecond();
swordLoss.phase = "defense";
swordLoss.heroes[0].damage = 4;
swordLoss.heroes[0].tempDefense = 0;
handle(
  swordLoss,
  fx("immediateAttack", { target: gundabadDragon(swordLoss).id }),
);
flush(swordLoss);
const assault = fBase();
assault.phase = "refresh";
assault.staging.find((u) => u.code === F.assault).progress = 4;
const defense = fBase();
const troop = add(defense, F.troop);
troop.damage = Math.max(0, stats(defense, troop).health - 4);
defense.hand = [make(defense, "01073")];
const urdugAttack = fBase();
urdugAttack.phase = "defense";
urdugAttack.heroes[0].tempDefense = 100;
const urdug = urdugAttack.staging.find((u) => u.code === F.urdug);
handle(urdugAttack, fx("immediateAttack", { target: urdug.id }));
flush(urdugAttack);
const fateWin = fBase();
fateWin.phase = "attack";
fateWin.staging.find((u) => u.code === F.defense).resources = 5;
fateWin.heroes[0].tempAttack = 100;
fateWin.fateWilderland.urdugAttack = { round: fateWin.round, phase: "combat" };
const fateLoss = fBase();
fateLoss.stage = 3;
fateLoss.fateWilderland.currentQuest = F.third;
fateLoss.phase = "refresh";
fateLoss.staging.find((u) => u.code === F.assault).progress = 16;
for (const [name, s] of Object.entries({
  door,
  front,
  deep,
  forgeTravel,
  forgeExplore,
  wormWin,
  swordLoss,
  assault,
  defense,
  urdugAttack,
  fateWin,
  fateLoss,
})) {
  syncSeat(s);
  assert.ok(validateSave(s), `valid ${name} finale fixture`);
}
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [],
  setups = [],
  entries = new Set();
let page;
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
async function resume(p) {
  await p.reload();
  entries.add(
    await p.locator('script[type="module"][src]').first().getAttribute("src"),
  );
  await p.locator("#start-btn").click();
  await reviewedState(p);
  return saved(p);
}
async function load(p, s) {
  await p.evaluate((s) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(s));
    localStorage.removeItem("there-and-back-again.choices.v1");
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
  }, s);
  return resume(p);
}
async function choose(p, id) {
  await reviewedState(p);
  const s = await saved(p),
    index = s.choice?.options.findIndex((o) => o.id === id) ?? -1;
  assert.ok(index >= 0, JSON.stringify(s.choice));
  const o = s.choice.options[index],
    occurrence = s.choice.options
      .slice(0, index)
      .filter((x) => x.label === o.label).length;
  await p
    .getByRole("dialog")
    .getByRole("button", { name: o.label, exact: true })
    .nth(occurrence)
    .click();
  await reviewedState(p);
  return saved(p);
}
async function choices(p) {
  for (let i = 0; i < 300; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (!s.choice) return s;
    await choose(
      p,
      s.choice.options.find((o) =>
        ["skip", "resolve", "stay", "assault"].includes(o.id),
      )?.id ?? s.choice.options[0].id,
    );
  }
  throw Error("Finale choices stalled");
}
async function opening(p) {
  for (let i = 0; i < 350; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (s.choice)
      await choose(
        p,
        s.choice.options.find((o) =>
          ["resolve", "skip", "assault"].includes(o.id),
        )?.id ?? s.choice.options[0].id,
      );
    else if (s.phase === "setup")
      await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    else if (!s.queue.length && !s.flow?.pending) return s;
    else await p.waitForTimeout(25);
  }
  throw Error("Opening stalled");
}
async function capture(p, label, height) {
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${label}: overflow`,
  );
  if (await p.getByRole("dialog").count()) {
    const b = await p.getByRole("dialog").last().boundingBox();
    assert.ok(
      b.y >= 0 && b.y + b.height <= height + 1,
      `${label}: clipped dialog`,
    );
  }
  const broken = await p.evaluate(async () =>
    (
      await Promise.all(
        [...document.images]
          .filter((i) => {
            const r = i.getBoundingClientRect();
            return (
              i.checkVisibility() &&
              r.bottom > 0 &&
              r.top < innerHeight &&
              r.right > 0 &&
              r.left < innerWidth
            );
          })
          .map(async (i) => {
            try {
              i.loading = "eager";
              await i.decode();
              return null;
            } catch {
              return i.src;
            }
          }),
      )
    ).filter(Boolean),
  );
  assert.deepEqual(broken, [], label);
  const file = `${dir}/${label}.png`;
  await p.screenshot({ path: file });
  screenshots.push(file);
}
async function menu(p, scenario, players, easy, classic = false) {
  await p.evaluate(() => {
    localStorage.removeItem("there-and-back-again.save.v1");
    localStorage.removeItem("there-and-back-again.choices.v1");
  });
  await p.reload();
  await p
    .getByRole("button", { name: classic ? /Classic solo/ : /Solo hot-seat/ })
    .click();
  if (!classic)
    await p
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", {
        name: `${players} ${players === 1 ? "player" : "players"}`,
        exact: true,
      })
      .click();
  await p.locator(`.mission-${scenario}`).click();
  await p.locator(".easy-toggle input").setChecked(easy);
}
async function panelMatches(p, s) {
  if (s.mountGundabad) {
    const v = mountGundabadPublicState(s),
      panel = p.locator('[data-scenario-panel="mount-gundabad"]');
    assert.ok(await panel.count());
    const text = await panel.innerText();
    assert.ok(text.includes(`Quest deck · ${v.questDeck} face-down cards`));
    assert.ok(text.includes(`Caves deck · ${v.cavesDeck} face-down cards`));
    assert.ok(
      text.includes(v.reforged ? "Wormsbane · Reforged" : "Wormsbane · Broken"),
    );
  } else {
    const v = fateWilderlandPublicState(s),
      panel = p.locator('[data-scenario-panel="fate-wilderland"]');
    assert.ok(await panel.count());
    assert.ok(
      (await panel.innerText()).includes(
        `The Heroes’ Defense · ${v.defenseResources} / ${v.defenseGoal} resources`,
      ),
    );
    assert.ok(
      (await panel.innerText()).includes(
        `The Goblins’ Assault · ${v.assaultProgress} progress`,
      ),
    );
  }
}
async function inspect(p, buttonName, label, height, reverse) {
  await p.getByRole("button", { name: buttonName, exact: true }).click();
  const art = p.getByRole("dialog").locator(".card-detail img").first();
  await art.evaluate((i) => i.decode());
  if (buttonName.endsWith("Side A")) {
    assert.equal(
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Show reverse", exact: true })
        .count(),
      0,
      "unknown 2B has no flip control",
    );
    assert.doesNotMatch(
      await p.getByRole("dialog").innerText(),
      /The Lower Deeps/,
      "unknown back title stays hidden",
    );
  }
  if (reverse !== undefined)
    assert.equal(/\.B\./.test(await art.getAttribute("src")), reverse);
  await capture(p, label, height);
  await resume(p);
}
async function attack(p, code) {
  await p
    .locator(`.board-card:has(img[data-card-code="${code}"]) .card-action`)
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: /Aragorn/ })
    .first()
    .click();
  await p.getByRole("button", { name: /^Attack · \d+ power$/ }).click();
  await reviewedState(p);
}
try {
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [320, 750],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const p = await context.newPage();
    page = p;
    await installReviewHandler(p);
    await p.addInitScript(() =>
      localStorage.setItem(
        "there-and-back-again.audio.v1",
        '{"muted":true,"volume":0.3}',
      ),
    );
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.goto(url);
    entries.add(
      await p.locator('script[type="module"][src]').first().getAttribute("src"),
    );
    for (const scenario of ["mount-gundabad", "the-fate-of-wilderland"]) {
      await menu(p, scenario, 1, false, true);
      await capture(p, `${scenario}-menu-${width}`, height);
      await p.locator("#start-btn").click();
      let s = await opening(p);
      assert.equal(s.scenarioId, scenario);
      assert.equal(s.status, "playing");
      assert.equal(!!s.table, false);
      await panelMatches(p, s);
      await capture(p, `${scenario}-classic-${width}`, height);
      for (const players of [1, 2, 3, 4])
        for (const easy of [false, true]) {
          await menu(p, scenario, players, easy);
          await p.locator("#start-btn").click();
          s = await opening(p);
          assert.equal(s.scenarioId, scenario);
          assert.equal(s.status, "playing");
          assert.equal(!!s.easyMode, easy);
          assert.equal(s.table.seats.length, players);
          if (s.mountGundabad) {
            assert.equal(s.mountGundabad.initialized, true);
            assert.equal(s.mountGundabad.questDeck.length, 7);
            assert.equal(s.mountGundabad.cavesDeck.length, 8);
            assert.equal(s.mountGundabad.setAside[0].code, G.forge);
            assert.equal(
              allCharacters(s)
                .flatMap((u) => u.attachments)
                .filter((a) => a.code === G.sword).length,
              1,
            );
            assert.ok(gundabadDragon(s));
            assert.equal(
              s.staging.filter((u) => card(u.code).type_code === "location")
                .length,
              players - 1,
            );
          } else {
            assert.equal(s.fateWilderland.initialized, true);
            for (const code of [F.urdug, F.assault, F.defense])
              assert.equal(s.staging.filter((u) => u.code === code).length, 1);
          }
          await panelMatches(p, s);
          setups.push({
            scenario,
            width,
            players,
            easy,
            encounter: s.encounterDeck.length,
          });
          await capture(
            p,
            `${scenario}-${players}p-${easy ? "easy" : "normal"}-${width}`,
            height,
          );
          const before = s.mountGundabad
            ? mountGundabadPublicState(s)
            : fateWilderlandPublicState(s);
          s = await resume(p);
          assert.deepEqual(
            s.mountGundabad
              ? mountGundabadPublicState(s)
              : fateWilderlandPublicState(s),
            before,
          );
        }
    }
    await load(p, door);
    await p
      .getByRole("button", { name: "Begin quest", exact: true })
      .first()
      .click();
    await reviewedState(p);
    await capture(p, `quest-peek-choice-${width}`, height);
    const peek = await resume(p);
    assert.equal(peek.choice.options.length, 2);
    await choose(p, peek.choice.options[1].id);
    let s = await choices(p);
    assert.equal(s.stage, 2);
    assert.equal(s.mountGundabad.questFront, false);
    await capture(p, `new-passage-side-b-${width}`, height);
    await load(p, front);
    const hiddenFront = JSON.stringify(await reviewedState(p));
    assert.ok(
      !hiddenFront.includes(G.lower),
      "public state hides unknown selected 2B identity",
    );
    assert.ok(
      !hiddenFront.includes(card(G.lower).back_name),
      "public state hides unknown selected 2B title",
    );
    await panelMatches(p, await saved(p));
    await inspect(
      p,
      "Inspect current quest · Side A",
      `quest-side-a-inspection-${width}`,
      height,
      false,
    );
    await p
      .getByRole("button", { name: "Begin quest", exact: true })
      .first()
      .click();
    s = await choices(p);
    assert.equal(s.mountGundabad.questFront, false);
    assert.equal(s.progress, 0);
    await inspect(
      p,
      "Inspect current quest · Both faces",
      `quest-side-b-inspection-${width}`,
      height,
      true,
    );
    await load(p, deep);
    await p
      .locator(
        `.board-card:has(img[data-card-code="${stair.code}"]) .card-action`,
      )
      .click();
    s = await choices(p);
    assert.equal(s.activeLocation.id, firstCave.id);
    await panelMatches(p, s);
    await capture(p, `deep-physical-caves-card-${width}`, height);
    await resume(p);
    await load(p, forgeTravel);
    await p
      .locator(`.board-card:has(img[data-card-code="${G.forge}"]) .card-action`)
      .click();
    s = await choices(p);
    assert.equal(s.heroes[0].exhausted, true);
    await capture(p, `first-forge-bearer-exhausted-${width}`, height);
    await load(p, forgeExplore);
    await p
      .getByRole("button", { name: "Resolve quest", exact: true })
      .first()
      .click();
    await reviewedState(p);
    await capture(p, `reforge-response-${width}`, height);
    await resume(p);
    await choose(p, "use");
    await capture(p, `reforge-remote-bearer-choice-${width}`, height);
    await resume(p);
    await choose(p, seatView(forgeExplore, 1).heroes[0].id);
    s = await choices(p);
    assert.equal(s.mountGundabad.reforged, true);
    assert.ok(
      seatView(s, 1).heroes[0].attachments.some((a) => a.id === swordId),
    );
    await inspect(
      p,
      "Inspect Wormsbane · Both faces",
      `reforged-wormsbane-${width}`,
      height,
      true,
    );
    await p.locator(".seat-tab").nth(1).click();
    await reviewedState(p);
    await inspect(
      p,
      "Inspect attachment: Wormsbane",
      `physical-reforged-wormsbane-${width}`,
      height,
      true,
    );
    await load(p, wormWin);
    await attack(p, G.dagnir);
    await capture(p, `great-worm-victory-response-${width}`, height);
    await resume(p);
    await choose(p, "use");
    s = await choices(p);
    assert.equal(s.status, "won");
    assert.ok(s.victoryCards.includes(G.dagnir));
    await capture(p, `gundabad-victory-${width}`, height);
    await load(p, swordLoss);
    await choose(p, swordLoss.heroes[0].id);
    s = await choices(p);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Wormsbane/i);
    await capture(p, `wormsbane-bearer-loss-${width}`, height);
    await load(p, assault);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .first()
      .click();
    s = await choices(p);
    assert.equal(s.stage, 2);
    assert.equal(s.fateWilderland.currentQuest, F.second);
    await panelMatches(p, s);
    await capture(p, `assault-end-round-stage-two-${width}`, height);
    await resume(p);
    await load(p, defense);
    await p
      .locator(
        '.hand-card:has(img[data-card-code="01073"]) .hand-play:not(.hand-ability)',
      )
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    await choose(
      p,
      s.choice.options.find((o) => o.effects.some((e) => e.target === troop.id))
        .id,
    );
    await capture(p, `heroes-defense-response-${width}`, height);
    await resume(p);
    await choose(p, "resource");
    s = await choices(p);
    assert.equal(s.staging.find((u) => u.code === F.defense).resources, 1);
    await panelMatches(p, s);
    await capture(p, `heroes-defense-resource-${width}`, height);
    await load(p, urdugAttack);
    await capture(p, `urdug-defender-choice-${width}`, height);
    await resume(p);
    await choose(p, urdugAttack.heroes[0].id);
    s = await choices(p);
    assert.equal(fateWilderlandPublicState(s).urdugCanTakeDamage, true);
    await panelMatches(p, s);
    await capture(p, `urdug-damage-window-${width}`, height);
    await load(p, fateWin);
    await attack(p, F.urdug);
    s = await choices(p);
    assert.equal(s.status, "won");
    await capture(p, `wilderland-victory-${width}`, height);
    await load(p, fateLoss);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .first()
      .click();
    s = await choices(p);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Assault|Urdug|Wilderland/i);
    await capture(p, `assault-stage-three-loss-${width}`, height);
    assert.deepEqual(
      await p.evaluate(
        async (faces) =>
          (
            await Promise.all(
              faces.map(async (src) => {
                const i = new Image();
                i.src = src;
                try {
                  await i.decode();
                  return null;
                } catch {
                  return src;
                }
              }),
            )
          ).filter(Boolean),
        faces,
      ),
      [],
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(entries.size, 1, "stable browser build");
  if (process.env.EXPECTED_ENTRY)
    assert.ok(
      [...entries].every((entry) =>
        entry.endsWith(`/assets/${process.env.EXPECTED_ENTRY}`),
      ),
    );
  await fs.rm(`${dir}/failure.json`, { force: true });
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      {
        url,
        checkedAt: new Date().toISOString(),
        releaseSha: process.env.RELEASE_SHA ?? null,
        entries: [...entries],
        screenshots,
        setups,
        faces: faces.length,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Ered Mithrin finale: ${screenshots.length} checkpoints passed (${url}).`,
  );
} catch (error) {
  const lastState =
    page && !page.isClosed() ? await saved(page).catch(() => null) : null;
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      { url, screenshots, setups, errors, lastState, failure: String(error) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
