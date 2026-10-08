import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as fixture, second } from "../tests/deadmens-dike-fixtures.ts";
import { validateSave } from "../src/game/engine.ts";
import { imageUrl } from "../src/game/cards.ts";
import { fx, get, make } from "../src/game/core.ts";
import { engage, revealed } from "../src/game/board.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  seatName,
  seatView,
  syncSeat,
} from "../src/game/table.ts";
import { allQuestUnits, currentQuestCode } from "../src/game/quest-state.ts";
import { DIKE as D } from "../src/game/deadmens-dike-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/deadmens-dike";
await fs.mkdir(dir, { recursive: true });
const source = JSON.parse(
  await fs.readFile(
    new URL("../src/data/pending/deadmen-s-dike-import.json", import.meta.url),
    "utf8",
  ),
);
function side(s, code) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function committed(s, q) {
  s.phase = "staging";
  const h = s.heroes[0];
  Object.assign(h, { committed: true, exhausted: true, tempWill: 30 });
  s.committedIds = [h.id];
  if (q) s.sideQuestSelections = { shared: { id: q.id, code: q.code } };
  return s;
}
function boss(s) {
  return [...s.staging, ...allEngaged(s)].find((u) => u.code === D.thaurdir);
}
const selection = fixture(2);
const selectedPower = side(selection, D.power);
side(selection, D.world);
side(selection, D.seal);
side(selection, "09014");
selection.table.first = 1;
handle(selection, fx("startQuest"));
flush(selection);

const curse = fixture();
const cursedQuest = side(curse, D.world);
committed(curse, cursedQuest);
curse.encounterDeck = [D.tombs, ...Array(30).fill(D.tombs)];
revealed(curse, D.curse);
flush(curse);

const cost = fixture();
cost.hand = [make(cost, "01013")];
cost.discard = ["01013"];
cost.encounterDeck = Array(30).fill(D.tombs);
revealed(cost, D.curse);
flush(cost);

const time = fixture(2);
const battlements = side(time, D.battlements);
battlements.timeCounters = 1;
time.phase = "refresh";
for (const p of playerOrder(time))
  forOwner(time, p, () => {
    time.deck = Array(20).fill("01057");
  });

const fog = fixture(2);
fog.phase = "staging";
for (const p of playerOrder(fog))
  forOwner(fog, p, () => {
    fog.heroes[0].committed = true;
    fog.heroes[0].exhausted = true;
    fog.committedIds = [fog.heroes[0].id];
  });
revealed(fog, D.fog);
flush(fog);

const damned = fixture();
damned.deck = ["01013", "01050", ...Array(25).fill("01057")];
const damnedEnemy = make(damned, D.damned);
damned.staging.push(damnedEnemy);
engage(damned, damnedEnemy);
flush(damned);

const sorcery = second();
boss(sorcery).damage = 9;
sorcery.heroes[0].tempDefense = 20;
sorcery.encounterDeck = Array(30).fill(D.tombs);
revealed(sorcery, D.sorcery);
flush(sorcery);

const shadow = fixture();
shadow.phase = "defense";
shadow.heroes[0].tempDefense = 20;
shadow.deck = ["01013", "01013", ...Array(25).fill("01057")];
const shadowEnemy = make(shadow, D.shade);
shadow.engaged.push(shadowEnemy);
shadow.encounterDeck = [D.keep, ...Array(30).fill(D.tombs)];
handle(shadow, fx("immediateAttack", { target: shadowEnemy.id }));
flush(shadow);

const killed = second();
killed.phase = "defense";
const doomedAlly = make(killed, "01016");
killed.allies.push(doomedAlly);
const killingBoss = boss(killed);
engage(killed, killingBoss);
killed.encounterDeck = Array(30).fill(D.tombs);
handle(killed, fx("immediateAttack", { target: killingBoss.id }));
flush(killed);

const advance = fixture();
committed(advance);
advance.progress = 10;
advance.encounterDeck = Array(30).fill(D.tombs);
const originalBossId = advance.deadmensDike.setAside[0].id;

const blocked = second();
committed(blocked);
blocked.progress = 13;
boss(blocked).damage = 8;

const victory = second();
committed(victory);
victory.progress = 12;
boss(victory).damage = 9;

const loss = fixture();
loss.phase = "refresh";
loss.deck = ["01057"];

const depleted = fixture(2);
depleted.phase = "refresh";
depleted.deck = ["01057"];
const returningShade = make(depleted, D.shade);
returningShade.damage = 2;
depleted.engaged.push(returningShade);

const power = fixture(2);
const powerQuest = side(power, D.power);
committed(power, powerQuest);
for (const player of playerOrder(power))
  forOwner(power, player, () => {
    power.deck = Array(20).fill("01057");
    power.discard = ["01013", "01016", "01050", "01053", "01057", "01023"];
  });

const sideRefresh = fixture(2);
side(sideRefresh, D.world);
side(sideRefresh, D.seal);
sideRefresh.phase = "refresh";
sideRefresh.encounterDeck = [
  D.gate,
  D.cursed,
  D.fog,
  ...Array(30).fill(D.tombs),
];
sideRefresh.engaged.push(make(sideRefresh, D.shade));
forOwner(sideRefresh, 1, () =>
  sideRefresh.engaged.push(
    make(sideRefresh, D.cursed),
    make(sideRefresh, D.lord),
  ),
);

const borrowedFixtures = [false, true].map((ownerHasCopy) => {
  const s = fixture(2);
  s.questAttachments = {
    [D.shades]: [{ id: `a${s.nextId++}`, code: D.curse, exhausted: false }],
  };
  s.discard = ownerHasCopy ? ["01013"] : [];
  forOwner(s, 1, () => {
    s.discard = ownerHasCopy ? [] : ["01013"];
    s.heroes[0] = make(s, "01001");
    s.heroes[0].resources = 10;
  });
  const passed = make(s, "01013");
  s.hand = [passed, make(s, "08032")];
  s.heroes[2] = make(s, "01012");
  s.heroes[2].resources = 10;
  return { s, passedId: passed.id, ownerHasCopy };
});

for (const [name, s] of Object.entries({
  selection,
  curse,
  cost,
  time,
  fog,
  damned,
  sorcery,
  shadow,
  killed,
  advance,
  blocked,
  victory,
  loss,
  depleted,
  power,
  sideRefresh,
})) {
  syncSeat(s);
  assert.ok(validateSave(s), `valid ${name} Deadmen's Dike browser fixture`);
}
for (const { s, ownerHasCopy } of borrowedFixtures) {
  syncSeat(s);
  assert.ok(validateSave(s), `valid borrowed-owner ${ownerHasCopy} fixture`);
}

const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [],
  setups = [],
  entries = new Set();
let activePage;
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
async function resume(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  await reviewedState(p);
  return saved(p);
}
async function load(p, s) {
  await p.evaluate((state) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(state));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  return resume(p);
}
async function choose(p, id) {
  await reviewedState(p);
  const s = await saved(p);
  const index = s.choice?.options.findIndex((o) => o.id === id) ?? -1;
  assert.ok(index >= 0, JSON.stringify(s.choice));
  const option = s.choice.options[index];
  const occurrence = s.choice.options
    .slice(0, index)
    .filter((o) => o.label === option.label).length;
  await p
    .getByRole("dialog")
    .getByRole("button", { name: option.label, exact: true })
    .nth(occurrence)
    .click();
  await reviewedState(p);
  return saved(p);
}
async function choices(p) {
  for (let i = 0; i < 180; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (!s.choice) return s;
    await choose(
      p,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  throw Error("Deadmen's Dike choices stalled");
}
async function finishOpening(p) {
  for (let i = 0; i < 180; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (s.choice)
      await choose(
        p,
        s.choice.options.find((o) => o.id === "resolve")?.id ??
          s.choice.options.find((o) => o.id === "skip")?.id ??
          s.choice.options[0].id,
      );
    else if (s.phase === "setup")
      await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    else if (!s.queue.length && !s.flow?.pending) return s;
    else await p.waitForTimeout(25);
  }
  throw Error("Deadmen's Dike opening did not finish");
}
async function capture(p, name, height) {
  if (!(await p.getByRole("dialog").count())) {
    const quest = p.locator(".quest-card-stack img");
    if (await quest.count()) {
      assert.ok(
        await quest.getAttribute("src"),
        `${name}: missing current quest face`,
      );
      await quest.evaluate((i) => i.decode());
    }
  }
  const failed = await p.evaluate(async () => {
    const root =
      [...document.querySelectorAll('dialog[open], [role="dialog"]')].at(-1) ??
      document;
    const visible = [...root.querySelectorAll("img")].filter((i) => {
      const r = i.getBoundingClientRect();
      return (
        i.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        r.width &&
        r.height &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth
      );
    });
    return (
      await Promise.all(
        visible.map(async (i) => {
          i.loading = "eager";
          try {
            await i.decode();
            return null;
          } catch {
            return i.src;
          }
        }),
      )
    ).filter(Boolean);
  });
  assert.deepEqual(failed, [], `${name}: missing visible art`);
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: horizontal overflow`,
  );
  const modal = p.getByRole("dialog");
  if (await modal.count()) {
    const r = await modal.last().boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= height + 1,
      `${name}: clipped dialog`,
    );
  }
  const path = `${dir}/${name}.png`;
  await p.screenshot({ path });
  screenshots.push(path);
}
async function freshMenu(p, players, easy) {
  await p.evaluate(() => {
    localStorage.removeItem("there-and-back-again.save.v1");
    localStorage.removeItem("there-and-back-again.choices.v1");
  });
  await p.reload();
  await p.getByRole("button", { name: /Solo hot-seat/ }).click();
  await p
    .getByRole("group", { name: "Number of players", exact: true })
    .getByRole("button", {
      name: `${players} ${players === 1 ? "player" : "players"}`,
      exact: true,
    })
    .click();
  await p.locator(".mission-deadmens-dike").click();
  await p.locator(".easy-toggle input").setChecked(easy);
}
async function inspectBoss(p, width, height, prefix) {
  const button = p
    .getByRole("button", { name: "Inspect Thaurdir", exact: true })
    .first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  assert.equal(
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Show reverse", exact: true })
      .count(),
    0,
    "Original Thaurdir has only one face",
  );
  assert.match(await p.getByRole("dialog").innerText(), /Indestructible/);
  await capture(p, `${prefix}-thaurdir-inspection-${width}`, height);
  await resume(p);
}
async function assertBossHealth(p, damage) {
  assert.equal(
    await p
      .locator('.board-card-art[aria-label="Inspect Thaurdir"]')
      .getAttribute("aria-description"),
    `${damage} damage. ${9 - damage} hit points remaining.`,
    "Thaurdir exposes damage and remaining original nine hit points",
  );
  assert.match(
    await p.getByLabel("Scenario counters", { exact: true }).innerText(),
    new RegExp(
      `Thaurdir.*${9 - damage} / 9 hit points remaining.*Indestructible`,
    ),
    "Scenario counters explain Thaurdir's original health and Indestructible objective",
  );
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
    activePage = p;
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);
    assert.equal(
      await p.evaluate(() =>
        localStorage.getItem("there-and-back-again.review-mode"),
      ),
      "all",
    );
    for (const src of await p
      .locator('script[type="module"][src]')
      .evaluateAll((els) => els.map((e) => e.src)))
      entries.add(src);
    await p.getByRole("button", { name: /Classic solo/ }).click();
    await p.locator(".mission-deadmens-dike").click();
    await p.locator(".easy-toggle input").check();
    assert.equal(await p.locator(".easy-toggle input").isChecked(), true);
    await p.locator(".easy-toggle input").uncheck();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    let s = await finishOpening(p);
    assert.equal(s.scenarioId, "deadmens-dike");
    assert.equal(s.status, "playing");
    assert.equal(s.deadmensDike.setAside[0].code, D.thaurdir);
    assert.match(
      await p.getByLabel("Scenario counters", { exact: true }).innerText(),
      /Thaurdir.*Set aside/,
    );
    await capture(p, `classic-opening-${width}`, height);
    await resume(p);

    for (const players of [1, 2, 3, 4])
      for (const easy of [false, true]) {
        await freshMenu(p, players, easy);
        await p.locator("#start-btn").click();
        s = await finishOpening(p);
        assert.equal(s.scenarioId, "deadmens-dike");
        assert.equal(!!s.easyMode, easy);
        assert.equal(s.status, "playing");
        assert.equal(s.table.seats.length, players);
        assert.deepEqual(
          s.deadmensDike.setAside.map((u) => u.code),
          [D.thaurdir],
        );
        assert.equal(
          allCharacters(s).filter((u) => u.code === D.iarion).length,
          1,
        );
        assert.ok(s.staging.some((u) => u.code === D.square));
        for (let player = 0; player < players; player++) {
          assert.ok(
            seatView(s, player).engaged.some((u) => u.code === D.shade),
          );
          for (const hero of seatView(s, player).heroes)
            assert.equal(hero.resources, easy ? 2 : 1);
          assert.equal(
            (
              await p
                .locator(".seat-tab")
                .nth(player)
                .locator('[title="Cards in deck"]')
                .innerText()
            ).trim(),
            String(seatView(s, player).deck.length),
            "Each fellowship displays its actual remaining deck count",
          );
          assert.ok(
            (
              await p
                .getByLabel("Scenario counters", { exact: true })
                .innerText()
            ).includes(
              `${seatName(s, player)} · ${seatView(s, player).deck.length} cards remaining`,
            ),
            "Scenario summary exposes every player's actual remaining deck count",
          );
        }
        const physical = [
          ...s.encounterDeck,
          ...s.encounterDiscard,
          ...s.staging.map((u) => u.code),
          ...allEngaged(s).map((u) => u.code),
          ...allQuestUnits(s).flatMap((u) => u.attachments.map((a) => a.code)),
        ];
        assert.equal(
          physical.length,
          easy ? 29 : 42,
          "exact encounter recipe plus fixed Square survives setup effects",
        );
        assert.match(await p.locator("body").innerText(), /Thaurdir/);
        setups.push({
          width,
          players,
          easy,
          encounter: s.encounterDeck.length,
          playerDecks: playerOrder(s).map(
            (player) => seatView(s, player).deck.length,
          ),
        });
        await capture(
          p,
          `${players}-player-${easy ? "easy" : "normal"}-${width}`,
          height,
        );
        const reloaded = await resume(p);
        assert.deepEqual(reloaded.deadmensDike, s.deadmensDike);
      }

    await load(p, selection);
    await capture(p, `first-player-side-quest-choice-${width}`, height);
    s = await resume(p);
    assert.equal(s.table.active, 1);
    await choose(p, selectedPower.id);
    s = await saved(p);
    assert.equal(currentQuestCode(s), D.power);
    await p.locator(".journey-area").scrollIntoViewIfNeeded();
    assert.match(await p.locator(".tabletop-progress").innerText(), /0 \/ 8/);
    await capture(p, `current-side-quest-${width}`, height);
    await p
      .getByRole("button", { name: "Inspect main quest", exact: true })
      .click();
    await capture(p, `main-quest-inspection-${width}`, height);

    await load(p, power);
    await capture(p, `power-of-angmar-current-quest-${width}`, height);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.ok(s.victoryCards.includes(D.power));
    for (const player of playerOrder(s)) {
      assert.deepEqual(seatView(s, player).discard, ["01013"]);
      assert.equal(seatView(s, player).deck.length, 25);
    }
    await capture(p, `power-of-angmar-discard-restored-${width}`, height);
    await resume(p);

    await load(p, sideRefresh);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .first()
      .click();
    await capture(p, `side-quests-refresh-order-${width}`, height);
    await resume(p);
    s = await choices(p);
    assert.equal(seatView(s, 0).discard.length, 2);
    assert.equal(seatView(s, 1).discard.length, 3);
    assert.ok(s.staging.some((u) => u.code === D.cursed));
    assert.deepEqual(s.encounterDiscard.slice(0, 2), [D.gate, D.fog]);
    await capture(p, `seal-and-shadow-world-refresh-${width}`, height);

    await load(p, curse);
    s = await choices(p);
    assert.equal(currentQuestCode(s), D.world);
    assert.ok(
      get(s, cursedQuest.id).attachments.some((a) => a.code === D.curse),
    );
    const condition = p.locator(".journey-area").getByRole("button", {
      name: "Inspect attachment: Heavy Curse",
      exact: true,
    });
    await condition.scrollIntoViewIfNeeded();
    assert.ok(
      await condition.evaluate((b) => {
        const r = b.getBoundingClientRect(),
          area = b.closest(".journey-area").getBoundingClientRect();
        return (
          b.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
          r.left >= area.left &&
          r.right <= area.right &&
          r.top >= area.top &&
          r.bottom <= area.bottom
        );
      }),
      "Current quest Condition remains within the Journey area",
    );
    await capture(p, `heavy-curse-current-side-${width}`, height);
    await condition.click();
    await capture(p, `heavy-curse-inspection-${width}`, height);
    await resume(p);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.ok(s.victoryCards.includes(D.world));
    assert.ok(s.encounterDiscard.includes(D.curse));
    await capture(p, `condition-discarded-with-side-${width}`, height);

    await load(p, cost);
    s = await choices(p);
    const beforeResources = s.heroes.reduce((n, h) => n + h.resources, 0);
    await p
      .locator(
        '.hand-card:has(img[data-card-code="01013"]) .hand-play:not(.hand-ability)',
      )
      .click();
    assert.match(await p.getByRole("dialog").innerText(), /Pay 3 resources/);
    await capture(p, `heavy-curse-additional-payment-${width}`, height);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    s = await choices(p);
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      beforeResources - 3,
    );
    assert.ok(s.allies.some((u) => u.code === "01013"));
    await capture(p, `heavy-curse-card-played-${width}`, height);
    await resume(p);

    for (const { s: borrowed, passedId, ownerHasCopy } of borrowedFixtures) {
      const expectedCost = ownerHasCopy ? 3 : 2;
      await load(p, borrowed);
      await p
        .locator(
          '.hand-card:has(img[data-card-code="08032"]) .hand-play:not(.hand-ability)',
        )
        .click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Play card", exact: true })
        .click();
      await choose(p, "player-0");
      await choose(p, passedId);
      await choose(p, "player-1");
      await choices(p);
      await p
        .getByRole("button", { name: "Finish planning", exact: true })
        .first()
        .click();
      await reviewedState(p);
      s = await saved(p);
      assert.equal(s.table.active, 1);
      assert.equal(s.hand.find((u) => u.id === passedId).owner, 0);
      const before = s.heroes[0].resources;
      await p
        .locator(
          '.hand-card:has(img[data-card-code="01013"]) .hand-play:not(.hand-ability)',
        )
        .click();
      assert.match(
        await p.getByRole("dialog").innerText(),
        new RegExp(`Pay ${expectedCost} resources`),
      );
      await capture(
        p,
        `borrowed-owner-${ownerHasCopy ? "matching" : "empty"}-payment-${width}`,
        height,
      );
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Play card", exact: true })
        .click();
      s = await choices(p);
      assert.equal(s.heroes[0].resources, before - expectedCost);
      assert.equal(s.allies.find((u) => u.id === passedId).owner, 0);
      await resume(p);
    }

    await load(p, time);
    await capture(p, `battlements-last-time-counter-${width}`, height);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .first()
      .click();
    await capture(p, `refresh-forced-order-${width}`, height);
    await resume(p);
    s = await choices(p);
    assert.equal(get(s, battlements.id).timeCounters, 2);
    for (const player of playerOrder(s))
      assert.equal(
        seatView(s, player).discard.filter((c) => c === "01057").length,
        6,
      );
    await capture(p, `battlements-two-player-time-reset-${width}`, height);

    await load(p, fog);
    await capture(p, `fog-first-player-choice-${width}`, height);
    await resume(p);
    await choose(p, "discard");
    await capture(p, `fog-second-player-choice-${width}`, height);
    await resume(p);
    await choose(p, "remove");
    s = await choices(p);
    assert.equal(seatView(s, 0).deck.length, 29);
    assert.equal(seatView(s, 1).deck.length, 30);
    assert.equal(seatView(s, 0).heroes[0].committed, true);
    assert.equal(seatView(s, 1).heroes[0].committed, false);
    await capture(p, `fog-player-scopes-${width}`, height);

    await load(p, damned);
    await capture(p, `damned-allocate-damage-${width}`, height);
    await resume(p);
    await choose(p, `${damned.heroes[0].id}:3`);
    s = await choices(p);
    assert.equal(s.heroes[0].damage, 3);
    assert.equal(s.deck.length, 25);
    assert.deepEqual(s.discard, ["01013", "01050"]);
    await capture(p, `damned-damage-assigned-${width}`, height);

    await load(p, sorcery);
    await capture(p, `sorcery-immediate-attack-choice-${width}`, height);
    s = await resume(p);
    assert.equal(boss(s).damage, 6);
    await choose(p, sorcery.heroes[0].id);
    s = await choices(p);
    assert.equal(boss(s).damage, 6);
    assert.equal(s.heroes[0].damage, 0);
    assert.ok(
      s.encounterDiscard.includes(D.tombs),
      "immediate attack receives a fresh real shadow",
    );
    await assertBossHealth(p, 6);
    await capture(p, `thaurdir-three-hp-restored-${width}`, height);
    await inspectBoss(p, width, height, "restored");

    await load(p, shadow);
    await capture(p, `shade-defender-choice-${width}`, height);
    await resume(p);
    await choose(p, shadow.heroes[0].id);
    s = await choices(p);
    assert.equal(s.deck.length, 25);
    assert.deepEqual(s.discard, ["01013", "01013"]);
    assert.equal(s.heroes[0].damage, 0);
    await capture(p, `shade-haunted-keep-shadow-${width}`, height);
    await resume(p);

    await load(p, killed);
    await choose(p, doomedAlly.id);
    await capture(p, `thaurdir-character-destruction-choice-${width}`, height);
    await resume(p);
    await choose(p, "return");
    s = await choices(p);
    assert.ok(s.staging.some((u) => u.id === killingBoss.id));
    assert.ok(!s.allies.some((u) => u.id === doomedAlly.id));
    assert.equal(s.deck.length, 30);
    await capture(p, `thaurdir-returned-to-staging-${width}`, height);

    await load(p, advance);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.equal(s.stage, 2);
    assert.equal(boss(s).id, originalBossId);
    assert.equal(s.deadmensDike.setAside.length, 0);
    await assertBossHealth(p, 0);
    assert.match(await p.locator(".tabletop-progress").innerText(), /0 \/ 13/);
    await capture(p, `original-thaurdir-stage-two-${width}`, height);
    await inspectBoss(p, width, height, "original");

    await load(p, blocked);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.equal(s.status, "playing");
    assert.equal(boss(s).damage, 8);
    assert.ok(s.progress >= 13);
    await assertBossHealth(p, 8);
    await capture(p, `thaurdir-one-hp-blocks-victory-${width}`, height);
    await resume(p);
    await load(p, victory);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.equal(s.status, "won");
    assert.equal(boss(s).damage, 9);
    await assertBossHealth(p, 9);
    assert.ok(!s.encounterDiscard.includes(D.thaurdir));
    await capture(p, `deadmens-dike-victory-${width}`, height);

    await load(p, depleted);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .first()
      .click();
    s = await choices(p);
    assert.equal(s.status, "playing");
    assert.equal(s.table.seats[0].eliminated, true);
    assert.equal(s.table.first, 1);
    assert.ok(seatView(s, 1).allies.some((u) => u.code === D.iarion));
    assert.equal(get(s, returningShade.id).damage, 2);
    assert.match(
      await p.getByLabel("Scenario counters", { exact: true }).innerText(),
      /0 cards remaining · Eliminated/,
    );
    await capture(p, `depleted-player-iarion-transfer-${width}`, height);
    s = await resume(p);
    assert.equal(s.table.seats[0].eliminated, true);

    await load(p, loss);
    await p
      .getByRole("button", { name: "Begin next round", exact: true })
      .first()
      .click();
    s = await choices(p);
    assert.equal(s.status, "lost");
    assert.equal(s.deck.length, 0);
    assert.match(s.reason, /deck|eliminated|fellowship/i);
    await capture(p, `empty-player-deck-loss-${width}`, height);

    const sources = source.cards.flatMap((c) => [
      imageUrl(c),
      ...(c.back_imagesrc ? [c.back_imagesrc] : []),
    ]);
    assert.equal(sources.length, 23);
    const failures = await p.evaluate(
      async (sources) =>
        (
          await Promise.all(
            sources.map(async (src) => {
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
      sources,
    );
    assert.deepEqual(failures, []);
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(
    entries.size,
    1,
    "all browser checks used one stable entry module",
  );
  if (process.env.EXPECTED_ENTRY)
    assert.ok(
      [...entries].every((entry) =>
        entry.endsWith(`/assets/${process.env.EXPECTED_ENTRY}`),
      ),
      "browser loaded expected release entry",
    );
  await fs.rm(`${dir}/failure.json`, { force: true });
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      {
        url: base,
        checkedAt: new Date().toISOString(),
        releaseSha: process.env.RELEASE_SHA ?? null,
        reviewMode: "all",
        entries: [...entries],
        screenshots,
        setups,
        faces: 23,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Deadmen's Dike: ${screenshots.length} browser checkpoints passed (${base}).`,
  );
} catch (error) {
  const lastState =
    activePage && !activePage.isClosed()
      ? await saved(activePage).catch(() => null)
      : null;
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        url: base,
        entries: [...entries],
        screenshots,
        setups,
        errors,
        lastState,
        failure: String(error),
      },
      null,
      2,
    ),
  );
  if (errors.length) console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
