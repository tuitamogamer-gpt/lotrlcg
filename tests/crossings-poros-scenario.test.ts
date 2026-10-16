import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, prepend, stats, threatOf } from "../src/game/core";
import {
  damage,
  discardCharacter,
  engage,
  enterAlly,
  placeEncounter,
  progressLocation,
  readyCharacter,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { addQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  allCharacters,
  allEngaged,
  ownerOf,
  selectSeat,
  forOwner,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table";
import {
  CROSSINGS_POROS as P,
  CROSSINGS_POROS_RECIPES,
  CROSSINGS_POROS_SETS,
  CROSSINGS_POROS_STAGE_TWO,
  CROSSINGS_POROS_STAGE_THREE,
  crossingsPorosAdvance,
  crossingsPorosAllyEntered,
  crossingsPorosCombatEnd,
  crossingsPorosEncounterEnd,
  crossingsPorosSet,
  crossingsPorosStageInfo,
} from "../src/game/crossings-poros";
import {
  base,
  choose,
  reload,
  setStage,
  settle,
  start,
} from "./crossings-poros-fixtures";
import * as F from "./crossings-poros-browser-fixtures";
import type { GameState } from "../src/game/types";
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finish = (s: GameState, id?: string) => {
  flush(s);
  return settle(s, id);
};
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Poros original ${players}p ${easy ? "easy" : "standard"} setup conserves all physical sets`, () => {
      const s = reload(start(players, easy)),
        q = s.crossingsPoros!;
      assert.equal(s.stage, 1);
      assert.equal(q.currentQuest, P.flight);
      assert.ok(q.setAside.length <= (easy ? 37 : 48));
      assert.equal(s.staging.filter((u) => u.code === P.serpent).length, 1);
      assert.ok(q.setAside.some((u) => u.code === P.garrison));
      assert.equal(q.completedQuests.length + q.questDeck.length + 1, 7);
      assert.equal(
        CROSSINGS_POROS_RECIPES.find(
          (r) => r.mode === (easy ? "easy" : "standard"),
        )!.cards.reduce((a, r) => a + r.quantity, 0),
        easy ? 57 : 71,
      );
      assert.ok(q.initialized);
    });
test("Native planning ends stage one with a deterministic random route, incorporates one set and permanently removes the other", () => {
  const routes = new Set<string>();
  for (let seed = 1; seed <= 12; seed++) {
    let s = start(1, false, seed);
    if (s.phase === "resource")
      s = settle(applyAction(reload(s), { type: "NEXT" }));
    s = applyAction(reload(s), { type: "NEXT" });
    s = settle(s);
    const q = s.crossingsPoros!;
    assert.equal(s.stage, 2);
    assert.equal(s.phase, "quest");
    routes.add(q.currentQuest);
    assert.equal(q.removedQuests.length, 1);
    const removed =
      q.currentQuest === P.desert ? "Mountains of Shadow" : "Desert Sands";
    assert.ok(q.removed.length > 0);
    assert.ok(q.removed.every((u) => crossingsPorosSet(u.code) === removed));
    assert.ok(!q.setAside.some((u) => crossingsPorosSet(u.code) === removed));
  }
  assert.deepEqual([...routes].sort(), [...CROSSINGS_POROS_STAGE_TWO].sort());
});
for (const route of CROSSINGS_POROS_STAGE_TWO)
  test(`Native quest defeats ${card(route).name} and reveals one of all three real stage threes`, () => {
    const f = F.porosQuest(route);
    let s = applyAction(reload(f.s), { type: "NEXT" });
    s = settle(s);
    assert.equal(s.stage, 3);
    assert.ok(
      CROSSINGS_POROS_STAGE_THREE.includes(s.crossingsPoros!.currentQuest),
    );
    assert.equal(s.crossingsPoros!.setAsideQuests.length, 2);
    assert.equal(s.crossingsPoros!.questDeck.length, 1);
    assert.equal(
      s.crossingsPoros!.currentQuest === P.orcs
        ? crossingsPorosStageInfo(s)!.quest >= 15
        : crossingsPorosStageInfo(s)!.quest === 15,
      true,
    );
  });
for (const route of CROSSINGS_POROS_STAGE_THREE)
  test(`Native quest defeats ${card(route).name}, releases Garrison and searches only already-incorporated unchosen-set enemies`, () => {
    const f = F.porosQuest(route);
    const s = f.s,
      q = s.crossingsPoros!;
    const other = route === P.creatures ? "Harad Soldiers" : "Desert Creatures",
      enemy = q.setAside.find(
        (u) =>
          crossingsPorosSet(u.code) === other &&
          card(u.code).type_code === "enemy",
      )!;
    q.setAside = q.setAside.filter((u) => u.id !== enemy.id);
    s.encounterDiscard.push(enemy.code);
    const before = q.setAside.length;
    let result = applyAction(reload(s), { type: "NEXT" });
    result = settle(result);
    assert.equal(result.stage, 4);
    assert.equal(result.crossingsPoros!.setAside.length, before - 1);
    assert.ok(result.staging.some((u) => u.code === enemy.code));
    assert.ok(allCharacters(result).some((u) => u.code === P.garrison));
    assert.equal(result.crossingsPoros!.garrisonEntered, true);
  });
test("The Black Serpent scales with the main stage, remains in staging and takes no damage", () => {
  const s = base();
  const serpent = add(s, P.serpent);
  for (const [stage, code] of [
    [1, P.flight],
    [2, P.desert],
    [3, P.creatures],
    [4, P.battle],
  ] as const) {
    setStage(s, code);
    assert.equal(threatOf(s, serpent), stage);
    assert.equal(stats(s, serpent).attack, 2 + stage);
    assert.equal(stats(s, serpent).defense, 1 + stage);
    damage(s, serpent.id, 99);
    assert.equal(serpent.damage, 0);
    engage(s, serpent);
    assert.ok(s.staging.some((u) => u.id === serpent.id));
  }
});
test("The Black Serpent's encounter-end choice removes exactly the stage number or attacks the first player", () => {
  let s = base(2);
  setStage(s, P.creatures);
  const serpent = add(s, P.serpent);
  s.progress = 6;
  prepend(s, ...crossingsPorosEncounterEnd(s));
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === "progress"));
  s = finish(choose(reload(s), "progress"));
  assert.equal(s.progress, 3);
  s.progress = 2;
  prepend(s, ...crossingsPorosEncounterEnd(s));
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["attack"],
  );
  assert.equal(s.choice!.options[0].effects[0].target, serpent.id);
});
test("Ally entry exhausts every stage one ally; only playing an ally triggers either stage two choice", () => {
  for (const code of [P.flight, P.desert, P.mountains]) {
    const s = base();
    setStage(s, code);
    const ally = make(s, "01013");
    ally.owner = 0;
    s.allies.push(ally);
    const handled = crossingsPorosAllyEntered(s, ally, true, true);
    if (code === P.flight) {
      assert.equal(handled, false);
      assert.equal(ally.exhausted, true);
    } else {
      assert.equal(handled, true);
      flush(s);
      assert.ok(s.choice!.options.some((o) => o.id === "penalty"));
      const r = finish(choose(reload(s), "penalty"));
      assert.equal(
        code === P.desert ? get(r, ally.id)!.damage : seatView(r, 0).threat,
        code === P.desert ? 1 : 21,
      );
    }
  }
});
for (const code of [P.land, P.waste])
  test(`Native ${card(code).name} travel chooses a random physical card from the largest set`, () => {
    const f = F.porosTravel(code);
    const old = f.s.crossingsPoros!.setAside.length;
    let s = applyAction(reload(f.s), { type: "TRAVEL", id: f.location.id });
    s = settle(s);
    assert.equal(s.activeLocation!.id, f.location.id);
    assert.ok(s.crossingsPoros!.setAside.length < old);
    assert.ok(!s.crossingsPoros!.removed.length);
  });
test("Largest-set ties give the first player a choice and empty/removed sets cannot be selected", () => {
  const s = base();
  s.crossingsPoros!.setAside = s.crossingsPoros!.setAside.filter(
    (u) => u.code === P.garrison,
  );
  prepend(s, fx("crossingsPorosAside", { flag: true }));
  flush(s);
  assert.equal(s.choice, null);
  const a = make(s, P.warg),
    b = make(s, P.prowler);
  a.code = P.viper;
  b.code = "octgn:ad251ffd-8653-4a45-b88e-def2ffecc2dc";
  s.crossingsPoros!.setAside.push(a, b);
  prepend(s, fx("crossingsPorosAside", { flag: true }));
  flush(s);
  assert.deepEqual(s.choice!.options.map((o) => o.id).sort(), [
    "Desert Creatures",
    "Mordor Orcs",
  ]);
});
for (const code of [P.prowler, P.warg])
  test(`Native ${card(code).name} reveal consumes a random set-aside enemy instead of its alternative`, () => {
    const f = F.porosReveal(code);
    const set = code === P.prowler ? "Mordor Orcs" : "Desert Creatures",
      n = f.s.crossingsPoros!.setAside.filter(
        (u) => crossingsPorosSet(u.code) === set,
      ).length;
    let s = applyAction(reload(f.s), { type: "TOGGLE_QUEST", id: f.hero.id });
    s = applyAction(reload(s), { type: "COMMIT" });
    s = settle(s, "discard");
    assert.equal(
      s.crossingsPoros!.setAside.filter(
        (u) => crossingsPorosSet(u.code) === set,
      ).length,
      n - 1,
    );
    assert.ok(s.encounterDiscard.some((c) => crossingsPorosSet(c) === set));
  });
test("Southron Outrider's engagement consumes a real Harad enemy or gains +3 attack for the entire round", () => {
  let s = base();
  setStage(s, P.desert);
  const u = add(s, P.outrider);
  engage(s, u);
  s = finish(s, "attack");
  assert.equal(stats(s, get(s, u.id)!).attack, 6);
});
test("All stage-three engagement penalties resolve for the enemy's actual player", () => {
  for (const code of CROSSINGS_POROS_STAGE_THREE) {
    let s = base(2);
    setStage(s, code);
    s.progress = 5;
    const u = add(s, P.outrider);
    forOwner(s, 1, () => engage(s, u));
    s = finish(s, "discard");
    if (code === P.creatures)
      assert.equal(
        seatView(s, 1).heroes.reduce((a, h) => a + h.damage, 0),
        1,
      );
    if (code === P.pursuit) assert.equal(s.progress, 4);
    if (code === P.orcs) assert.equal(seatView(s, 1).threat, 21);
  }
});
test("Deadly Creatures protects every staging enemy, and Orc Patrols quest points change as enemies engage", () => {
  const s = base();
  setStage(s, P.creatures);
  const e = add(s, P.outrider);
  damage(s, e.id, 2);
  assert.equal(e.damage, 0);
  setStage(s, P.orcs);
  assert.equal(crossingsPorosStageInfo(s)!.quest, 17);
  engage(s, e);
  assert.equal(crossingsPorosStageInfo(s)!.quest, 15);
});
test("Southron Champion selects a physical Harad enemy and blocks damage, its side quest and the main quest until defeated", () => {
  let s = base();
  setStage(s, P.desert);
  s.encounterDeck = [P.waste, P.outrider];
  placeEncounter(s, P.champion, false, 0, undefined, true);
  s = finish(s);
  const q = s.staging.find((u) => u.code === P.champion)!,
    e = s.staging.find((u) => u.code === P.outrider)!;
  assert.equal(e.resources, 1);
  assert.equal(stats(s, e).attack, 5);
  assert.equal(threatOf(s, e), 4);
  damage(s, e.id, 99);
  assert.equal(e.damage, 0);
  s.progress = 10;
  crossingsPorosAdvance(s);
  assert.equal(s.stage, 2);
  addQuestProgress(s, q, 4);
  assert.ok(s.staging.some((u) => u.id === q.id));
  damage(s, e.id, 99, { combatDamage: true });
  s = finish(s);
  assert.ok(!s.staging.some((u) => u.id === e.id));
});
test("Poros Garrison's printed stats and loss condition persist across reload", () => {
  const f = F.porosBoss();
  let s = reload(f.s);
  assert.deepEqual(
    [
      stats(s, get(s, f.garrison.id)!).will,
      stats(s, get(s, f.garrison.id)!).attack,
      stats(s, get(s, f.garrison.id)!).defense,
      stats(s, get(s, f.garrison.id)!).health,
    ],
    [3, 4, 3, 6],
  );
  discardCharacter(s, get(s, f.garrison.id)!);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Garrison/);
});
test("Battle at the Crossings cannot win on progress or an attack, then wins at the native end of combat", () => {
  const f = F.porosBoss();
  let s = applyAction(reload(f.s), {
    type: "ATTACK",
    enemyId: f.enemy.id,
    attackerIds: [f.hero.id],
  });
  s = settle(s);
  assert.equal(s.status, "playing");
  s = applyAction(reload(s), { type: "END_ATTACKS" });
  s = settle(s);
  assert.equal(s.status, "won");
});
for (const code of [
  P.outrider,
  P.prowler,
  P.warg,
  P.waste,
  P.danger,
  P.shadow,
  P.exhaustion,
  P.sandstorm,
  P.scorpion,
])
  test(`Native defense resolves ${card(code).name} shadow and reloads its continuations`, () => {
    const f = F.porosShadow(code);
    let s = applyAction(reload(f.s), {
      type: "DEFEND",
      enemyId: f.enemy.id,
      defenderId: f.defender.id,
    });
    s = settle(s);
    assert.equal(s.status, "playing");
  });
test("Battle's destroyed-character penalty and Danger/Mountains shadow follow-ups occur after the actual attack", () => {
  const f = F.porosShadow(P.shadow, true);
  f.s.progress = 20;
  let s = applyAction(reload(f.s), {
    type: "DEFEND",
    enemyId: f.enemy.id,
    defenderId: f.defender.id,
  });
  s = settle(s);
  assert.equal(s.progress, 18);
  assert.equal(s.threat, 22);
});
test("Shared Desert Sands and Creatures: progress lock, damaged text blanking, ready lock and Scorpion poison", () => {
  let s = base();
  setStage(s);
  const l = add(s, P.waste);
  add(s, P.dunes);
  progressLocation(s, l, 1);
  assert.equal(l.progress, 0);
  placeEncounter(s, P.exhaustion, false, 0, undefined, true);
  s = finish(s);
  assert.equal(
    s.heroes.reduce((a, u) => a + u.damage, 0),
    1,
  );
  add(s, P.water);
  const h = s.heroes[1];
  h.exhausted = true;
  readyCharacter(s, h);
  assert.equal(h.exhausted, true);
});
test("Poros saves reject wrong quest branches, duplicate physical cards and forged pending poison markers", () => {
  const s = start();
  assert.ok(validateSave(s));
  for (const mutate of [
    (x: GameState) => {
      x.crossingsPoros!.questDeck.reverse();
      x.crossingsPoros!.questDeck.push(P.flight);
    },
    (x: GameState) => {
      x.crossingsPoros!.setAside.push(
        structuredClone(x.crossingsPoros!.setAside[0]),
      );
    },
    (x: GameState) => {
      x.crossingsPoros!.currentQuest = P.battle;
    },
    (x: GameState) => {
      x.crossingsPoros!.poisoned = [{ id: "x", round: 99 }];
    },
  ]) {
    const x = structuredClone(s);
    mutate(x);
    assert.equal(validateSave(x), false);
  }
});
test("Foothills blocks native When Revealed cancellation while the same staging location permits shadow cancellation", () => {
  for (const present of [false, true]) {
    const f = F.porosReveal(P.danger);
    f.hero.code = "01007";
    f.s.hand.push(make(f.s, "01050"));
    if (present) add(f.s, P.foothills);
    let s = applyAction(reload(f.s), { type: "TOGGLE_QUEST", id: f.hero.id });
    s = applyAction(reload(s), { type: "COMMIT" });
    assert.equal(!!s.choice?.options.some((o) => o.id === "cancel"), !present);
    const d = F.porosShadow(P.shadow);
    d.s.heroes[0].code = "01007";
    d.s.hand.push(make(d.s, "01048"));
    if (present) add(d.s, P.foothills);
    s = applyAction(reload(d.s), {
      type: "DEFEND",
      enemyId: d.enemy.id,
      defenderId: d.defender.id,
    });
    assert.equal(!!s.choice?.options.some((o) => o.id === "cancel"), true);
  }
});
test("Find a Way Down blocks real threat reductions until its defeated response reduces every player's threat", () => {
  let s = base(2);
  setStage(s);
  const side = add(s, P.wayDown);
  prepend(s, fx("threat", { player: 0, value: -3 }));
  s = finish(s);
  assert.equal(seatView(s, 0).threat, 20);
  addQuestProgress(s, get(s, side.id)!, 6);
  s = finish(s, "use");
  assert.equal(seatView(s, 0).threat, 17);
  assert.equal(seatView(s, 1).threat, 17);
});

test("The actual first player gains Poros Garrison and natively engages twice, then cannot take a third optional enemy", () => {
  let s = base(2);
  setStage(s, P.creatures);
  s.table!.first = 1;
  s.table!.turn = 1;
  selectSeat(s, 1);
  s.phase = "staging";
  s.progress = 15;
  crossingsPorosAdvance(s);
  s = finish(s);
  const g = allCharacters(s).find((u) => u.code === P.garrison)!;
  assert.ok(g);
  assert.equal(ownerOf(s, g), 1);
  s.phase = "encounter";
  s.progress = 0;
  s.optionalEngagement = false;
  s.table!.turn = 1;
  const foes = [add(s, P.prowler), add(s, P.prowler), add(s, P.prowler)];
  syncSeat(s);
  s = settle(applyAction(reload(s), { type: "ENGAGE", id: foes[0].id }));
  s = settle(applyAction(reload(s), { type: "ENGAGE", id: foes[1].id }));
  assert.equal(
    seatView(s, 1).engaged.filter((u) => foes.some((e) => e.id === u.id))
      .length,
    2,
  );
  assert.throws(
    () => applyAction(reload(s), { type: "ENGAGE", id: foes[2].id }),
    /optionally engage one enemy/,
  );
});
