import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, createGame, canPlay } from "../src/game/engine.ts";
import { STARTERS, card } from "../src/game/cards.ts";
import {
  damage,
  discardCharacter,
  engage,
  progress,
  progressLocation,
  revealed,
  check,
  shadow,
} from "../src/game/board.ts";
import { fx, get, make, locationQuest, threatOf } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { playerAttack, beginEnemyAttack } from "../src/game/combat.ts";
import { prepareEnemyShadows } from "../src/game/considered-engagement.ts";
import { forOwner, seatView } from "../src/game/table.ts";
import {
  morgulAddProgress,
  morgulTowerProgress,
} from "../src/game/morgul-vale.ts";
import {
  MORGUL_VALE as M,
  MORGUL_VALE_RECIPES,
} from "../src/game/morgul-vale-support.ts";
import {
  base as fixture,
  choose,
  reload,
} from "./against-shadow-final-fixtures.ts";
const base = (p = 1) => {
  const s = fixture("the-morgul-vale", p);
  s.staging = [make(s, M.tower)];
  return s;
};
test("Morgul recipes include their set-aside Captains and exact original/easy quantities", () => {
  for (const easy of [false, true]) {
    const r = MORGUL_VALE_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!,
      counts: Record<string, number> = {};
    for (const row of r.cards.filter((r) => r.section !== "sharedQuestDeck"))
      counts[row.code] = (counts[row.code] ?? 0) + row.quantity;
    for (const [code, n] of Object.entries(counts))
      assert.equal(
        easy
          ? (card(code).easy_quantity ?? card(code).quantity)
          : card(code).quantity,
        n,
        card(code).name,
      );
  }
});
test("Morgul setup removes all Faramir cards, including hand copies; hero Faramir is prohibited", () => {
  const d = STARTERS[0],
    s = createGame(4, d.cards, d.heroes, d.id, {
      scenarioId: "the-morgul-vale",
    });
  assert.ok(
    ![...s.hand.map((u) => u.code), ...s.deck].some(
      (c) => card(c).name === "Faramir",
    ),
  );
  assert.equal(s.staging.length, 3);
  const custom = STARTERS.find((d) => d.heroes.includes("06081"));
  if (custom)
    assert.throws(
      () =>
        createGame(4, custom.cards, custom.heroes, custom.id, {
          scenarioId: "the-morgul-vale",
        }),
      /Faramir/,
    );
});
test("Only destroying each current Captain advances, and progress cannot bypass them", () => {
  const s = base();
  const murzag = make(s, M.murzag);
  s.engaged = [murzag];
  progress(s, 999);
  flush(s);
  assert.equal(s.stage, 1);
  assert.equal(s.progress, 0);
  discardCharacter(s, murzag);
  assert.ok(get(s, murzag.id));
  damage(s, murzag.id, 7);
  flush(s);
  assert.equal(s.stage, 2);
  assert.ok(s.staging.some((u) => u.code === M.alcaron));
  reload(s);
  morgulAddProgress(s, 1);
  damage(s, s.staging.find((u) => u.code === M.alcaron)!.id, 5);
  flush(s);
  assert.equal(s.stage, 3);
  assert.ok(s.staging.some((u) => u.code === M.bridge));
  const nazgul = s.staging.find((u) => u.code === M.nazgul)!;
  for (let n = 0; n < 5; n++) {
    damage(s, nazgul.id, 8);
    flush(s);
  }
  assert.equal(s.status, "won");
});
test("Nazgul reduces each assignment to one and cannot receive attachments", () => {
  const s = base();
  s.stage = 3;
  const u = make(s, M.nazgul);
  s.engaged = [u];
  damage(s, u.id, 20);
  assert.equal(u.damage, 1);
  u.attachments.push({ id: "illegal", code: "01056", exhausted: false });
  check(s);
  assert.equal(u.attachments.length, 0);
  assert.ok(s.encounterDiscard.length === 0);
});
test("Bodyguard redirects all Captain damage through a saved first-player choice", () => {
  let s = base(2);
  const captain = make(s, M.murzag),
    a = make(s, M.bodyguard),
    b = make(s, M.bodyguard);
  s.staging.push(captain, a);
  forOwner(s, 1, () => s.engaged.push(b));
  damage(s, captain.id, 4);
  flush(s);
  assert.equal(captain.damage, 0);
  assert.equal(s.choice!.options.length, 2);
  s = reload(s);
  s = choose(s, `${b.id}:4`);
  assert.equal(get(s, b.id)!.damage, 4);
  assert.equal(get(s, captain.id)!.damage, 0);
});
test("Nazgul and Bodyguard damage replacements expose both legal orderings", () => {
  let s = base();
  s.stage = 3;
  const c = make(s, M.nazgul),
    g = make(s, M.bodyguard);
  s.staging.push(c, g);
  damage(s, c.id, 4);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [`${g.id}:4`, `${g.id}:1`],
  );
  s = choose(s, `${g.id}:4`);
  assert.equal(get(s, g.id)!.damage, 4);
  assert.equal(get(s, c.id)!.damage, 0);
});
test("A Captain attack that kills the Bodyguard retains attack-destruction responses", () => {
  let s = base();
  s.phase = "attack";
  s.heroes = [make(s, "01005")];
  s.heroes[0].tempAttack = 12;
  const c = make(s, M.murzag),
    g = make(s, M.bodyguard);
  s.engaged = [c, g];
  playerAttack(s, c, [s.heroes[0].id]);
  flush(s);
  s = choose(s, `${g.id}:13`);
  assert.ok(!get(s, g.id));
  assert.equal(get(s, c.id)!.damage, 0);
  assert.ok(s.log.some((l) => l.text.includes("Bodyguard")));
});
test("Tower progress deals one shadow to every Sorcerer per placement, and ten loses immediately", () => {
  const s = base();
  const a = make(s, M.sorcerer),
    b = make(s, M.sorcerer);
  s.staging.push(a);
  s.engaged = [b];
  morgulAddProgress(s, 3);
  flush(s);
  assert.equal(a.shadows.length, 1);
  assert.equal(b.shadows.length, 1);
  morgulAddProgress(s, 7);
  assert.equal(s.status, "lost");
  assert.equal(s.choice, null);
});
test("White Bridge threat and quest points track Tower progress", () => {
  const s = base();
  const u = make(s, M.bridge);
  s.staging.push(u);
  morgulAddProgress(s, 4);
  flush(s);
  assert.equal(threatOf(s, u), 4);
  assert.equal(locationQuest(s, u), 4);
});
test("Morgul Tracker triggers for optional engagement, not forced engagement", () => {
  const s = base();
  engage(s, make(s, M.tracker), false);
  flush(s);
  assert.equal(morgulTowerProgress(s), 0);
  engage(s, make(s, M.tracker), true);
  flush(s);
  assert.equal(morgulTowerProgress(s), 1);
});
test("Morgul Road offers progress removal or damage and preserves the choice through reload", () => {
  let s = base();
  morgulAddProgress(s, 3);
  const u = make(s, M.road);
  s.activeLocation = u;
  progressLocation(s, u, 5);
  flush(s);
  s = reload(s);
  s = choose(s, "reduce");
  assert.equal(morgulTowerProgress(s), 2);
});
test("Impenetrable Fog lets the first player choose either three progress or player-scaled reveals", () => {
  let s = base(2);
  revealed(s, M.fog);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["progress", "reveal"],
  );
  s = choose(s, "reveal");
  assert.equal(s.staging.filter((u) => u.code === "01099").length, 2);
  assert.equal(morgulTowerProgress(s), 0);
});
test("Sleepless Malice requires a full three-card discard and applies Doomed to every player", () => {
  let s = base(2);
  s.hand = [make(s, "01013"), make(s, "01014")];
  revealed(s, M.malice);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["progress"],
  );
  s = choose(s, "progress");
  s = choose(s, "progress");
  assert.equal(morgulTowerProgress(s), 2);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
});
test("Morgul Vale returns one chosen enemy for each player at round end", () => {
  let s = base(2);
  s.staging.push(make(s, M.vale));
  s.engaged = [make(s, M.tracker)];
  forOwner(s, 1, () => s.engaged.push(make(s, M.bodyguard)));
  s.queue = [fx("endRound")];
  flush(s);
  s = choose(s, s.choice!.options[0].id);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(seatView(s, 0).engaged.length, 0);
  assert.equal(seatView(s, 1).engaged.length, 0);
  assert.ok(s.staging.some((u) => u.code === M.bodyguard));
});
test("Alcaron schedules additional attacks when a dealt shadow has no effect, even if it is discarded", () => {
  const s = base();
  s.stage = 2;
  s.phase = "defense";
  const u = make(s, M.alcaron);
  s.engaged = [u];
  s.encounterDeck = ["01099"];
  prepareEnemyShadows(s, u);
  assert.equal(u.morgulExtraAttacks, 1);
  u.shadows = [];
  delete u.faceupShadows;
  reload(s);
});
test("Murzag reveals a non-enemy normally and engages the new enemy copy only", () => {
  const s = base();
  const old = make(s, M.tracker);
  s.staging.push(old);
  s.encounterDeck = [M.tracker, "01099"];
  s.queue = [fx("morgulMurzag", { player: 0 })];
  flush(s);
  assert.ok(s.staging.some((u) => u.id === old.id));
  assert.equal(s.engaged.length, 1);
  assert.notEqual(s.engaged[0].id, old.id);
  assert.ok(s.staging.some((u) => u.code === "01099"));
});
test("White Bridge is explored at zero and when removing Tower progress lowers its threshold", () => {
  let s = base();
  const zero = make(s, M.bridge);
  s.staging.push(zero);
  check(s);
  assert.ok(!get(s, zero.id));
  s = base();
  morgulAddProgress(s, 3);
  const bridge = make(s, M.bridge);
  bridge.progress = 2;
  s.activeLocation = bridge;
  s.queue = [fx("morgulReduce")];
  flush(s);
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes(M.bridge));
});
test("Alcaron's full additional attack deals a new shadow and raises Tower progress again", () => {
  let s = base();
  s.stage = 2;
  s.phase = "defense";
  const u = make(s, M.alcaron);
  s.engaged = [u];
  s.allies = [make(s, "01016"), make(s, "01016")];
  s.encounterDeck = ["01099", M.city];
  prepareEnemyShadows(s, u);
  beginEnemyAttack(s, u, [s.allies[0].id]);
  flush(s);
  assert.equal(morgulTowerProgress(s), 2);
  assert.ok(s.choice?.title.includes("Immediate attack"));
  s = reload(s);
  s = choose(s, s.allies[0].id);
  assert.equal(s.allies.length, 0);
  assert.equal(s.combat, null);
  assert.equal(s.phase, "attack");
  assert.equal(morgulTowerProgress(s), 2);
});
test("Sorcerer shadow offers an actual saved choice and resolves a shadow dealt during the attack", () => {
  let s = base();
  s.phase = "defense";
  const u = make(s, M.sorcerer);
  s.engaged = [u];
  s.allies = [make(s, "01016")];
  s.encounterDeck = [M.sorcerer, M.city];
  prepareEnemyShadows(s, u);
  beginEnemyAttack(s, u, [s.allies[0].id]);
  flush(s);
  assert.match(s.choice!.title, /Sorcerer/);
  s = reload(s);
  s = choose(s, "progress");
  assert.equal(morgulTowerProgress(s), 1);
  assert.equal(s.engaged[0].revealedShadowCount, 2);
  assert.equal(s.allies.length, 0);
  s = base();
  s.phase = "defense";
  const e = make(s, M.bodyguard);
  s.engaged = [e];
  s.encounterDeck = [M.sorcerer];
  prepareEnemyShadows(s, e);
  beginEnemyAttack(s, e, [s.heroes[0].id]);
  flush(s);
  s = choose(s, "undefended");
  assert.match(s.choice!.title, /Assign .* damage/);
  assert.equal(s.combat!.defenderId, null);
  assert.equal(morgulTowerProgress(s), 0);
});
test("Morgul Vale shadow progresses the Tower only if combat damage destroys a character", () => {
  const s = base();
  s.phase = "defense";
  const u = make(s, M.bodyguard);
  s.engaged = [u];
  s.allies = [make(s, "01016")];
  s.encounterDeck = [M.vale];
  prepareEnemyShadows(s, u);
  beginEnemyAttack(s, u, [s.allies[0].id]);
  flush(s);
  assert.equal(morgulTowerProgress(s), 1);
  assert.equal(s.combat, null);
});
test("Bodyguard shadow suspends the current attack, engages the next player and returns to the original defender", () => {
  let s = base(2);
  s.phase = "defense";
  const u = make(s, M.bodyguard);
  s.engaged = [u];
  s.allies = [make(s, "01016")];
  forOwner(s, 1, () => s.allies.push(make(s, "01016")));
  s.encounterDeck = [M.bodyguard, M.city];
  prepareEnemyShadows(s, u);
  beginEnemyAttack(s, u, [s.allies[0].id]);
  flush(s);
  assert.ok(s.choice?.title.includes("Immediate attack"));
  assert.equal(seatView(s, 1).engaged[0].id, u.id);
  s = reload(s);
  s = choose(s, seatView(s, 1).allies[0].id);
  assert.equal(seatView(s, 0).allies.length, 0);
  assert.equal(seatView(s, 1).allies.length, 0);
  assert.equal(s.suspendedCombats.length, 0);
  assert.equal(s.combat, null);
});
test("Combat end discards staging Sorcerer shadows and does not carry prevented Alcaron attacks to the next round", () => {
  const s = base();
  const sorcerer = make(s, M.sorcerer),
    captain = make(s, M.alcaron);
  s.staging.push(sorcerer);
  s.engaged = [captain];
  sorcerer.shadows = [M.city];
  captain.morgulExtraAttacks = 2;
  s.queue = [fx("endCombat")];
  flush(s);
  assert.equal(sorcerer.shadows.length, 0);
  assert.equal(captain.morgulExtraAttacks, undefined);
  assert.ok(s.encounterDiscard.includes(M.city));
});
