import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as fixture } from "../tests/chetwood-fixtures.ts";
import { applyAction, createGame, validateSave } from "../src/game/engine.ts";
import { STARTERS, imageUrl } from "../src/game/cards.ts";
import { make, fx } from "../src/game/core.ts";
import { revealed } from "../src/game/board.ts";
import { flush, handle } from "../src/game/effects.ts";
import { syncSeat, forOwner, seatView } from "../src/game/table.ts";
import { currentQuestCode } from "../src/game/quest-state.ts";
import {
  CHETWOOD as C,
  CHETWOOD_ENCOUNTERS,
  CHETWOOD_QUESTS,
} from "../src/game/chetwood-support.ts";
import { chetwoodRefreshEnd } from "../src/game/chetwood.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178",
  dir = "output/chetwood";
await fs.mkdir(dir, { recursive: true });
function side(s, code) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function selected(s, code) {
  const u = s.staging.find((u) => u.code === code);
  s.phase = "staging";
  s.sideQuestSelections = { shared: { id: u.id, code } };
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  s.heroes[0].tempWill = 20;
  return s;
}
const selection = fixture(2);
forOwner(selection, 0, () => selection.hand.push(make(selection, "01057")));
forOwner(selection, 1, () => selection.hand.push(make(selection, "01050")));
revealed(selection, C.wilderness);
flush(selection);
revealed(selection, C.rescue);
flush(selection);
side(selection, C.rearguard);
side(selection, "09014");
selection.table.first = 1;
handle(selection, fx("startQuest"));
flush(selection);
const rescue = fixture();
rescue.allies[0].damage = 2;
const iarionId = rescue.allies[0].id;
revealed(rescue, C.rescue);
flush(rescue);
selected(rescue, C.rescue);
rescue.activeLocation = make(rescue, C.country);
const wilderness = fixture();
wilderness.hand.push(make(wilderness, "01057"), make(wilderness, "01050"));
const hiddenIds = wilderness.hand.map((u) => u.id);
revealed(wilderness, C.wilderness);
flush(wilderness);
selected(wilderness, C.wilderness);
const capped = fixture();
side(capped, C.rearguard);
capped.phase = "staging";
capped.progress = 2;
capped.heroes[0].committed = true;
capped.heroes[0].tempWill = 20;
capped.activeLocation = make(capped, C.country);
const needs = fixture();
needs.phase = "travel";
const needsSide = side(needs, C.wilderness);
revealed(needs, C.needs);
flush(needs);
const shadow = fixture();
const attacker = make(shadow, C.orc);
shadow.engaged.push(attacker);
shadow.heroes[0].tempDefense = 20;
shadow.encounterDeck = [C.forest];
handle(shadow, fx("immediateAttack", { target: attacker.id }));
flush(shadow);
let captain = fixture();
captain.phase = "defense";
const captainEnemy = make(captain, C.captain),
  victim = make(captain, "01016");
captain.engaged.push(captainEnemy);
captain.allies.push(victim);
captainEnemy.shadows = [C.speed];
captain.deck = ["01016", "01057"];
captain.encounterDeck = [C.homestead];
captain.heroes[0].tempDefense = 20;
captain = applyAction(captain, {
  type: "DEFEND",
  enemyId: captainEnemy.id,
  defenderId: victim.id,
});
const loss = fixture();
revealed(loss, C.rescue);
flush(loss);
loss.phase = "refresh";
loss.staging[0].timeCounters = 1;
chetwoodRefreshEnd(loss);
flush(loss);
const victory = fixture();
victory.progress = 30;
const party = make(victory, C.party);
party.damage = 3;
victory.engaged.push(party);
victory.hand = [make(victory, "01073")];
function fourPlayer(easy) {
  return createGame(78, STARTERS[0].cards, STARTERS[0].heroes, STARTERS[0].id, {
    scenarioId: "intruders-in-chetwood",
    easy,
    seats: STARTERS.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
  });
}
for (const [name, s] of Object.entries({
  selection,
  rescue,
  wilderness,
  capped,
  needs,
  shadow,
  captain,
  loss,
  victory,
})) {
  syncSeat(s);
  assert.ok(validateSave(s), `valid ${name} browser fixture`);
}
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [];
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
async function resume(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
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
  const s = await reviewedState(p);
  const option = s.choice?.options.find((o) => o.id === id);
  assert.ok(option, JSON.stringify(s.choice));
  const index = s.choice.options.findIndex((o) => o.id === id);
  const occurrence = s.choice.options
    .slice(0, index)
    .filter((o) => o.label === option.label).length;
  await p
    .getByRole("dialog")
    .getByRole("button", { name: option.label, exact: true })
    .nth(occurrence)
    .click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  if (!(await p.getByRole("dialog").count())) {
    const quest = p.locator(".quest-card-stack img");
    if (await quest.count()) {
      assert.ok(
        await quest.evaluate((i) => !!i.getAttribute("src")),
        `${name}: quest face has a source`,
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
async function choices(p) {
  for (let i = 0; i < 100; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (!s.choice) return s;
    assert.ok(i < 99);
    await choose(
      p,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  throw Error("choices stalled");
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
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);
    await p.getByRole("button", { name: /Classic solo/ }).click();
    await p.locator(".mission-intruders-in-chetwood").click();
    await capture(p, `quest-menu-${width}`, height);
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    await reviewedState(p);
    await capture(p, `setup-location-${width}`, height);
    await resume(p);
    let s = await choices(p);
    assert.equal(s.chetwood.setupLocations.length, 1);
    assert.equal(s.encounterDeck.length, 35);
    assert.equal(s.staging.filter((u) => u.code === C.party).length, 1);
    assert.equal(s.allies[0].code, C.iarion);
    await capture(p, `opening-board-${width}`, height);
    await load(p, selection);
    await capture(p, `side-quest-choice-${width}`, height);
    s = await resume(p);
    assert.equal(s.table.active, 1);
    const selectedId = s.staging.find((u) => u.code === C.rescue).id;
    await choose(p, selectedId);
    await resume(p);
    assert.equal(currentQuestCode(await saved(p)), C.rescue);
    await p.locator(".journey-area").scrollIntoViewIfNeeded();
    await capture(p, `current-side-quest-${width}`, height);
    assert.match(await p.locator(".tabletop-progress").innerText(), /0 \/ 6/);
    assert.equal(
      await p.getByLabel("Iârion is captured beneath this quest").count(),
      1,
    );
    assert.equal(
      await p.getByLabel("2 facedown hand cards", { exact: true }).count(),
      1,
    );
    await p
      .getByRole("button", { name: "Inspect main quest", exact: true })
      .click();
    await capture(p, `main-quest-inspection-${width}`, height);
    await load(p, rescue);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.equal(s.chetwood.captive, undefined);
    assert.ok(s.victoryCards.includes(C.rescue));
    assert.equal(s.allies.find((u) => u.code === C.iarion).id, iarionId);
    assert.equal(s.allies.find((u) => u.code === C.iarion).damage, 2);
    assert.equal(s.allies.find((u) => u.code === C.iarion).exhausted, true);
    assert.equal(s.progress, 0);
    assert.equal(s.activeLocation, null);
    assert.equal(s.phase, "travel");
    await capture(p, `iarion-rescued-${width}`, height);
    await load(p, wilderness);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.deepEqual(
      s.hand.map((u) => u.id),
      hiddenIds,
    );
    assert.ok(s.victoryCards.includes(C.wilderness));
    assert.equal(s.progress, 0);
    await capture(p, `hands-restored-${width}`, height);
    await load(p, capped);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await choices(p);
    assert.equal(s.progress, 5);
    assert.equal(s.activeLocation, null);
    assert.ok(s.staging.some((u) => u.code === C.rearguard));
    await capture(p, `rearguard-progress-cap-${width}`, height);
    await load(p, needs);
    await capture(p, `pressing-needs-${width}`, height);
    await resume(p);
    await choose(p, needsSide.id);
    s = await saved(p);
    assert.equal(s.phase, "travel");
    assert.equal(currentQuestCode(s), C.wilderness);
    await capture(p, `travel-current-side-quest-${width}`, height);
    await load(p, shadow);
    await capture(p, `immediate-attack-${width}`, height);
    s = await saved(p);
    await choose(p, s.heroes[0].id);
    await capture(p, `forest-shadow-${width}`, height);
    await resume(p);
    await choose(p, "return");
    s = await choices(p);
    assert.ok(s.staging.some((u) => u.id === attacker.id));
    assert.equal(s.heroes[0].damage, 0);
    assert.equal(
      s.encounterDiscard.filter((code) => code === C.forest).length,
      1,
    );
    await capture(p, `attacker-returned-${width}`, height);
    await load(p, captain);
    await capture(p, `after-attack-order-${width}`, height);
    await resume(p);
    s = await saved(p);
    await choose(
      p,
      s.choice.options.find((o) => o.effects[0].kind === "chetReturn").id,
    );
    s = await saved(p);
    assert.equal(s.combat.enemyId, captainEnemy.id);
    assert.ok(s.staging.some((u) => u.id === captainEnemy.id));
    assert.deepEqual(s.staging.find((u) => u.id === captainEnemy.id).shadows, [
      C.homestead,
    ]);
    await capture(p, `captain-extra-attack-${width}`, height);
    await choose(p, s.heroes[0].id);
    s = await choices(p);
    assert.equal(s.phase, "attack");
    assert.ok(s.discard.includes("01016"));
    await load(p, loss);
    await capture(p, `rescue-time-expired-${width}`, height);
    await resume(p);
    s = await choices(p);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Iârion/);
    await capture(p, `rescue-loss-${width}`, height);
    await load(p, victory);
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
    await choose(p, s.choice.options.find((o) => o.code === C.party).id);
    s = await choices(p);
    assert.equal(s.status, "won");
    await capture(p, `chetwood-victory-${width}`, height);
    for (const easy of [false, true]) {
      await load(p, fourPlayer(easy));
      for (let i = 0; i < 70; i++) {
        s = await saved(p);
        if (s.choice) await choose(p, s.choice.options[0].id);
        else if (s.phase === "setup") {
          await p
            .getByRole("button", { name: "Keep hand", exact: true })
            .click();
          await reviewedState(p);
        } else break;
      }
      s = await saved(p);
      assert.equal(s.chetwood.setupLocations.length, 4);
      assert.equal(new Set(s.chetwood.setupLocations).size, 4);
      assert.equal(s.encounterDeck.length, (easy ? 24 : 36) - 4);
      assert.equal(s.staging.filter((u) => u.code === C.party).length, 1);
      for (const player of [0, 1, 2, 3])
        for (const hero of seatView(s, player).heroes)
          assert.equal(hero.resources, easy ? 2 : 1);
      await capture(
        p,
        `four-player-${easy ? "easy" : "normal"}-${width}`,
        height,
      );
      await resume(p);
    }
    const sources = [...CHETWOOD_ENCOUNTERS, ...CHETWOOD_QUESTS].flatMap(
      (c) => [imageUrl(c), ...(c.back_imagesrc ? [c.back_imagesrc] : [])],
    );
    assert.equal(sources.length, 20);
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
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify({ url: base, screenshots, errors }, null, 2),
  );
  console.log(
    `Intruders in Chetwood: ${screenshots.length} browser checkpoints passed (${base}).`,
  );
} finally {
  await browser.close();
}
