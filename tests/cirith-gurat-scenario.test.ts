import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, publicState, validateSave } from "../src/game/engine";
import {
  check,
  damage,
  destroy,
  engage,
  placeEncounter,
  progressLocation,
} from "../src/game/board";
import {
  fx,
  get,
  make,
  prepend,
  stats,
  threatOf,
  engagementCost,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table";
import { addQuestProgress } from "../src/game/side-quests";
import {
  CIRITH_GURAT as C,
  cirithGuratRoundEnd,
  cirithGuratStats,
  cirithGuratAdvance,
  cirithGuratCheck,
  cirithGuratThreatReduction,
} from "../src/game/cirith-gurat";
import {
  add,
  ally,
  base,
  choose,
  reload,
  setStage,
  settle,
  start,
} from "./cirith-gurat-fixtures";
const finish = (s: ReturnType<typeof base>, preferred?: string) => {
  flush(s);
  return settle(s, preferred);
};
for (const p of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Cirith Gurat ${p} player ${easy ? "easy" : "standard"} setup searches different actual Orcs and captures exact deck allies`, () => {
      const s = start(p, easy),
        q = s.cirithGurat!;
      assert.equal(q.initialized, true);
      assert.equal(q.captives.length, p + 1);
      assert.equal(q.setupOrcs.length, p);
      assert.equal(new Set(q.setupOrcs).size, p);
      assert.equal(s.staging.filter((u) => u.code === C.cell).length, 1);
      assert.equal(s.staging.filter((u) => u.code === C.captives).length, 1);
      assert.equal(s.encounterDeck.length, (easy ? 32 : 42) - p);
      assert.equal(q.setAside[0].code, C.chieftain);
      assert.ok(
        q.captives.every(
          (u) => !u.damage && !u.resources && !u.attachments.length,
        ),
      );
      assert.ok(validateSave(s));
    });
test("Taken Prisoner preserves physical ally ownership, clears tokens/attachments and rescues exhausted after native defeat", () => {
  let s = base(2);
  const a = ally(s, "01013", 0),
    guard = add(s, C.guard);
  a.damage = 1;
  a.resources = 3;
  const at = make(s, "01042");
  a.attachments.push({ id: at.id, code: at.code, owner: 0, exhausted: false });
  placeEncounter(s, C.prisoner, false, 0, undefined, true);
  s = finish(s);
  assert.equal(s.cirithGurat!.captives[0].id, a.id);
  assert.equal(s.cirithGurat!.guarding[a.id], guard.id);
  assert.ok(seatView(s, 0).discard.includes("01042"));
  assert.equal(stats(s, get(s, guard.id)!).defense, 3);
  destroy(s, get(s, guard.id)!);
  s = finish(s);
  assert.ok(allCharacters(s).some((u) => u.id === a.id && u.exhausted));
  assert.equal(s.cirithGurat!.captives.length, 0);
  assert.ok(validateSave(s));
});
test("Taken Prisoner gains Doomed 2 for all players only if no legal ally and unattached staging host exist", () => {
  let s = base(3);
  ally(s);
  placeEncounter(s, C.prisoner, false, 0, undefined, true);
  s = finish(s);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 22);
});
test("Torture Room takes a real private-deck ally, removes other in-play copies and applies its round-end tax", () => {
  let s = base(2);
  const other = ally(s, "01013", 1);
  forOwner(s, 0, () => {
    s.deck = ["01050", "01013", "01050"];
  });
  placeEncounter(s, C.torture, false, 0, undefined, true);
  s = finish(s);
  assert.equal(s.cirithGurat!.captives[0].code, "01013");
  assert.ok(!allCharacters(s).some((u) => u.id === other.id));
  assert.deepEqual(seatView(s, 0).deck, ["01050"]);
  assert.ok(seatView(s, 0).discard.includes("01050"));
  prepend(s, ...cirithGuratRoundEnd(s));
  s = finish(s);
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 21);
});
test("Captured! preserves multiplayer captives and frees each owner with printed-cost threat reduction on side-quest defeat", () => {
  let s = base(2);
  const a = ally(s, "01013", 0),
    b = ally(s, "01017", 1);
  placeEncounter(s, C.captured, false, 0, undefined, true);
  s = finish(s);
  const side = s.staging.find((u) => u.code === C.captured)!;
  assert.equal(s.cirithGurat!.captives.length, 2);
  addQuestProgress(s, side, 5);
  s = finish(s);
  assert.ok(allCharacters(s).some((u) => u.id === a.id && u.exhausted));
  assert.ok(allCharacters(s).some((u) => u.id === b.id && u.exhausted));
  assert.equal(seatView(s, 0).threat, 18);
  assert.equal(seatView(s, 1).threat, 17);
});
test("Stage 1 guards are immune only in staging; stage 2 progress boosts staging engagement and forbids all damage there", () => {
  let s = base();
  const a = ally(s),
    e = add(s, C.guard);
  prepend(s, fx("cirithGuratCapture", { target: a.id, source: e.id }));
  s = finish(s);
  setStage(s, 2);
  s.progress = 7;
  assert.equal(engagementCost(s, get(s, e.id)!), 37);
  damage(s, e.id, 2, { combatDamage: true });
  assert.equal(get(s, e.id)!.damage, 0);
  engage(s, get(s, e.id)!);
  damage(s, e.id, 1, { combatDamage: true });
  assert.equal(get(s, e.id)!.damage, 1);
});
for (const players of [3, 4])
  test(`Cirith Gurat ${players}-player terminal elimination settles returned guard immunity before public rendering`, () => {
    let s = base(players);
    const last = players - 1,
      captive = ally(s, "01013", last),
      guard = add(s, C.guard);
    prepend(
      s,
      fx("cirithGuratCapture", { target: captive.id, source: guard.id }),
    );
    s = finish(s);
    forOwner(s, last, () => engage(s, get(s, guard.id)!));
    s = finish(s);
    for (let player = 0; player < last; player++)
      forOwner(s, player, () => {
        s.threat = 50;
      });
    check(s);
    assert.equal(s.status, "playing");
    assert.ok(seatView(s, last).engaged.some((u) => u.id === guard.id));
    assert.equal(get(s, guard.id)!.immuneToPlayerEffects, undefined);
    forOwner(s, last, () => {
      s.threat = 50;
    });
    check(s);
    assert.equal(s.status, "lost");
    assert.ok(s.table!.seats.every((seat) => seat.eliminated));
    assert.ok(s.staging.some((u) => u.id === guard.id));
    const before = JSON.stringify(s);
    for (let viewer = 0; viewer < players; viewer++)
      publicState(seatView(s, viewer));
    assert.equal(
      JSON.stringify(s),
      before,
      "terminal public rendering preserves the exact saved state",
    );
    assert.equal(get(s, guard.id)!.immuneToPlayerEffects, true);
    assert.ok(validateSave(s));
  });
test("Stage 2 quiet resources follow reveal; a new engagement in that reveal blocks the resource", () => {
  let s = base();
  setStage(s, 2);
  s.encounterDeck = [C.mines];
  prepend(s, ...cirithGuratRoundEnd(s));
  s = finish(s);
  assert.equal(s.cirithGurat!.sneakResources, 1);
  s.cirithGurat!.engagedRound = s.round;
  s.encounterDeck = [C.mines];
  prepend(s, ...cirithGuratRoundEnd(s));
  s = finish(s);
  assert.equal(s.cirithGurat!.sneakResources, 1);
});
test("Dungeon Cell threat uses printed captive willpower and rescues exact Abaan when explored", () => {
  let s = start();
  const cell = s.staging.find((u) => u.code === C.cell)!,
    abaan = s.cirithGurat!.captives.find((u) => u.code === C.abaan)!;
  assert.equal(threatOf(s, cell), 2);
  progressLocation(s, cell, 5);
  s = finish(s);
  assert.ok(allCharacters(s).some((u) => u.id === abaan.id && u.exhausted));
  {
    const a = allCharacters(s).find((u) => u.id === abaan.id)!;
    damage(s, a.id, 9);
  }
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Abaan/);
});
test("Abaan exhaustion offers an optional Harad bonus once and preserves it through saved continuations", () => {
  let s = base();
  const a = ally(s, C.abaan);
  a.exhausted = true;
  cirithGuratCheck(s);
  s = finish(s, a.id);
  assert.equal(cirithGuratStats(s, get(s, a.id)!).attack, 1);
  cirithGuratCheck(s);
  assert.equal(s.queue.length, 0);
  s.round++;
  assert.equal(cirithGuratStats(s, get(s, a.id)!).attack, 0);
});
test("Mines caps only player-card threat reduction and Gate blocks progress only in staging", () => {
  const s = base(),
    mines = add(s, C.mines),
    gate = add(s, C.gate);
  assert.equal(cirithGuratThreatReduction(s, 6), 1);
  assert.equal(cirithGuratThreatReduction(s, 6, "encounter"), 6);
  progressLocation(s, mines, 2);
  assert.equal(mines.progress, 0);
  s.staging = s.staging.filter((u) => u.id !== gate.id);
  s.activeLocation = gate;
  progressLocation(s, mines, 1);
  assert.equal(mines.progress, 1);
});
test("A real quest advance follows the physical chain, captures stage-three heroes and applies standard checks", () => {
  let s = base();
  setStage(s, 2);
  s.progress = 15;
  s.cirithGurat!.sneakResources = 2;
  add(s, C.guard);
  cirithGuratAdvance(s);
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.equal(s.cirithGurat!.captives.length, 1);
  assert.ok(
    allEngaged(s).some((u) => u.code === C.chieftain || u.code === C.guard),
  );
  assert.equal(s.cirithGurat!.stageThreeChecks, false);
});
test("Stage three cannot win with guarded captives; freeing the last captive at ten progress wins", () => {
  let s = base();
  setStage(s, 3);
  const a = ally(s),
    guard = add(s, C.guard);
  prepend(s, fx("cirithGuratCapture", { target: a.id, source: guard.id }));
  s = finish(s);
  s.progress = 10;
  cirithGuratAdvance(s);
  assert.equal(s.status, "playing");
  destroy(s, get(s, guard.id)!);
  s = finish(s);
  assert.equal(s.status, "won");
});
test("Cirith Gurat save rejects malformed quest order, duplicate physical captives, unknown guards and invalid quiet counters", () => {
  const s = start();
  for (const mutate of [
    (x: typeof s) => {
      x.cirithGurat!.questDeck.reverse();
    },
    (x: typeof s) => {
      x.cirithGurat!.captives.push(structuredClone(x.cirithGurat!.captives[0]));
    },
    (x: typeof s) => {
      x.cirithGurat!.guarding[x.cirithGurat!.captives[0].id] = "missing";
    },
    (x: typeof s) => {
      x.cirithGurat!.sneakResources = -1;
    },
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.equal(validateSave(bad), false);
  }
  assert.ok(validateSave(reload(s)));
});
for (const code of [C.jailer, C.prisoner, C.warg, C.tormented])
  test(`Native defense resolves saved Cirith Gurat shadow ${code}`, async () => {
    const { cirithShadow } = await import("./cirith-gurat-browser-fixtures");
    const f = cirithShadow(code);
    let s = applyAction(reload(f.s), {
      type: "DEFEND",
      enemyId: f.enemy.id,
      defenderId: f.defender.id,
    });
    s = settle(s);
    assert.equal(s.status, "playing");
    if (code === C.jailer)
      assert.ok(s.cirithGurat!.captives.some((u) => u.id === f.defender.id));
    assert.ok(validateSave(s));
  });
test("Native Prison Guard combat captures a surviving damaged ally after the attack, clearing damage", () => {
  let s = base();
  setStage(s, 3);
  s.phase = "defense";
  const enemy = make(s, C.guard);
  enemy.owner = 0;
  s.engaged.push(enemy);
  const defender = ally(s, "01014");
  defender.tempDefense = 0;
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  s = settle(s);
  const captive = s.cirithGurat!.captives.find((u) => u.id === defender.id);
  assert.ok(captive);
  assert.equal(captive.damage, 0);
  assert.equal(s.cirithGurat!.guarding[captive.id], enemy.id);
});
test("A destroyed ally's exact physical copy becomes a Dungeon Cell objective after entering its owner's discard", () => {
  let s = base();
  setStage(s, 3);
  const cell = add(s, C.cell),
    a = ally(s);
  damage(s, a.id, 9);
  s = finish(s);
  assert.equal(s.cirithGurat!.guarding[a.id], cell.id);
  assert.ok(!seatView(s, 0).discard.includes(a.code));
  assert.equal(s.cirithGurat!.captives.find((u) => u.id === a.id)!.damage, 0);
  assert.ok(validateSave(s));
});
for (const stage of [1, 2])
  test(`Native Resolve quest advances Cirith Gurat stage ${stage}`, async () => {
    const { cirithQuest } = await import("./cirith-gurat-browser-fixtures");
    const f = cirithQuest(stage);
    let s = applyAction(reload(f.s), { type: "NEXT" });
    s = settle(s);
    assert.equal(s.stage, stage + 1);
    assert.ok(validateSave(s));
  });
test("Tormented by Orcs counts player-owned captives and does not assign encounter-owned Abaan to a player", () => {
  let s = base();
  const cell = add(s, C.cell),
    abaan = make(s, C.abaan);
  abaan.owner = 0;
  s.cirithGurat!.captives.push(abaan);
  s.cirithGurat!.guarding[abaan.id] = cell.id;
  s.encounterDeck = [C.mines];
  placeEncounter(s, C.tormented, false, 0, undefined, true);
  s = finish(s);
  assert.equal(s.threat, 20);
  assert.ok(s.staging.some((u) => u.code === C.mines));
});
test("Public Cirith Gurat view exposes face-up captives and withholds unrevealed quest and private deck order", async () => {
  const { cirithGuratPublicState } =
    await import("../src/game/cirith-gurat-support");
  const s = start(2),
    view = cirithGuratPublicState(s)!;
  assert.equal(view.questDeck, 2);
  assert.equal(view.setAside, 1);
  assert.equal(view.captives.length, 3);
  assert.ok(
    view.captives.every(
      (u) => typeof u.code === "string" && typeof u.guardId === "string",
    ),
  );
  assert.equal("deck" in view, false);
  assert.equal("setupOrcs" in view, false);
});
test("The stage 1 rescue encounter resolves before advancement and can capture a new objective", () => {
  let s = base();
  const a = ally(s),
    b = ally(s, "01014"),
    guard = add(s, C.guard),
    other = add(s, C.guard);
  prepend(s, fx("cirithGuratCapture", { target: a.id, source: guard.id }));
  s = finish(s);
  s.progress = 10;
  s.encounterDeck = [C.prisoner, C.mines];
  destroy(s, get(s, guard.id)!);
  assert.equal(s.stage, 1);
  s = finish(s, b.id);
  assert.equal(s.stage, 1);
  assert.equal(s.cirithGurat!.captives.length, 1);
  assert.equal(s.cirithGurat!.guarding[b.id], other.id);
  assert.equal(s.cirithGurat!.rescuePending, 0);
});
