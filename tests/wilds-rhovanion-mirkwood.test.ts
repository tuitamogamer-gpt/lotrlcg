import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, locationQuest, make, prepend } from "../src/game/core";
import {
  check,
  damage,
  destroy,
  progressLocation,
  revealed,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { addQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  allEngaged,
  forOwner,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table";
import {
  WILDS_RHOVANION as W,
  wildsRhovanionRoundEnd,
} from "../src/game/wilds-rhovanion";
import { base, choose, reload, settle } from "./wilds-rhovanion-fixtures";
import type { GameState, Unit } from "../src/game/types";
const quests = [
  W.ambushed,
  W.spiders,
  W.orcs,
  W.carried,
  W.trulyLost,
  W.fear,
  W.escape,
];
function stage(s: GameState, code: string) {
  const n = Number(card(code).cost),
    previous =
      n === 2
        ? [W.ambushed]
        : n === 3
          ? [W.ambushed, W.spiders]
          : n === 4
            ? [W.ambushed, W.spiders, W.carried]
            : [];
  s.stage = n;
  s.progress = 0;
  s.stageRevealing = false;
  Object.assign(s.wildsRhovanion!, {
    currentQuest: code,
    completedQuests: previous,
    questDeck: quests.filter((q) => q !== code && !previous.includes(q)),
    advancing: false,
  });
}
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};
function revealStage(s: GameState) {
  prepend(s, fx("wildsMirkwoodReveal", { player: s.table?.first ?? 0 }));
  flush(s);
  return s;
}
function capture(players = 1) {
  const s = base("lost-in-mirkwood", players);
  stage(s, W.carried);
  s.encounterDeck = Array(players).fill("01097");
  return revealStage(s);
}
for (const side of ["A", "C"])
  test(`Mirkwood native objective travel follows side ${side} through all four numbered stages`, () => {
    let s = base("lost-in-mirkwood");
    s.wildsRhovanion!.setAside = side === "A" ? [make(s, "01090")] : [];
    for (let n = 2; n <= 4; n++) {
      if (s.activeLocation) {
        progressLocation(
          s,
          s.activeLocation,
          locationQuest(s, s.activeLocation),
        );
        s = finish(s);
      }
      s.encounterDeck = Array(20).fill("01099");
      s.encounterDiscard = [];
      s.phase = "travel";
      const location = add(s, side === "A" ? W.hilltop : W.clearing);
      s = applyAction(reload(s), { type: "TRAVEL", id: location.id });
      s = settle(s);
      assert.equal(s.stage, n);
      assert.equal(
        s.wildsRhovanion!.currentQuest,
        n === 2
          ? side === "A"
            ? W.spiders
            : W.orcs
          : n === 3
            ? side === "A"
              ? W.carried
              : W.trulyLost
            : side === "A"
              ? W.fear
              : W.escape,
      );
      assert.equal(
        new Set([
          ...s.wildsRhovanion!.completedQuests,
          s.wildsRhovanion!.currentQuest,
          ...s.wildsRhovanion!.questDeck,
        ]).size,
        7,
      );
      s = reload(s);
    }
  });
test("Searching replaces main-quest progress and finds the topmost discarded objective, whose guard is added without revealing", () => {
  let s = base("lost-in-mirkwood");
  add(s, W.searching);
  s.encounterDeck = ["01092", W.hilltop, "01089"];
  addQuestProgress(s, mainQuestUnit(s)!, 2);
  assert.equal(s.progress, 0);
  s = finish(s);
  const objective = s.staging.find((u) => u.code === W.hilltop)!,
    guard = s.staging.find((u) => u.guarding === objective.id)!;
  assert.ok(objective);
  assert.equal(guard.code, "01089");
  assert.ok(s.encounterDiscard.includes("01092"));
  s = reload(s);
  addQuestProgress(s, mainQuestUnit(s)!, 3);
  assert.equal(
    s.progress,
    3,
    "an objective in play allows ordinary quest progress",
  );
});
test("Carried Away captures one physical hero per player; guard defeat returns it exhausted to its owner", () => {
  let s = capture(2);
  const chosen = playerOrder(s).map((p) => seatView(s, p).heroes[0]);
  for (const h of chosen) {
    assert.match(s.choice!.title, /Carried Away/);
    s = choose(reload(s), h.id);
  }
  assert.equal(s.wildsRhovanion!.guardedHeroes.length, 2);
  s = reload(s);
  for (const batch of [...s.wildsRhovanion!.guardedHeroes]) {
    const guard = get(s, batch.guardId)!;
    damage(s, guard.id, 1);
    assert.equal(guard.damage, 0, "guard cannot take non-combat damage");
    destroy(s, guard);
    s = finish(s);
    assert.ok(
      seatView(s, batch.player).heroes.some(
        (h) => h.id === batch.hero.id && h.exhausted,
      ),
    );
  }
  assert.equal(s.wildsRhovanion!.guardedHeroes.length, 0);
  s = reload(s);
});
test("Carried Away keeps an undefeated guard's hero uncontrolled and discards abandoned heroes when advancing", () => {
  let s = capture(),
    hero = s.heroes[0];
  s = choose(reload(s), hero.id);
  const captive = s.wildsRhovanion!.guardedHeroes[0];
  destroy(s, get(s, captive.guardId)!, false);
  s = finish(s);
  assert.equal(s.wildsRhovanion!.guardedHeroes[0].guardId, "");
  assert.ok(!s.heroes.some((h) => h.id === hero.id));
  s = reload(s);
  s.phase = "travel";
  s.encounterDeck = Array(10).fill("01099");
  s.wildsRhovanion!.setAside = [];
  const objective = add(s, W.clearing);
  s = applyAction(reload(s), { type: "TRAVEL", id: objective.id });
  s = settle(s);
  assert.equal(s.stage, 4);
  assert.equal(s.wildsRhovanion!.guardedHeroes.length, 0);
  assert.ok(s.discard.includes(hero.code));
});
test("Truly Lost stores private physical hands under different locations, increases quest points and restores cards only after exploration", () => {
  let s = base("lost-in-mirkwood", 2);
  stage(s, W.trulyLost);
  const hands = playerOrder(s).map((p) => {
    let u!: Unit;
    forOwner(s, p, () => {
      u = make(s, "01013");
      s.hand = [u];
    });
    return u;
  });
  s.encounterDeck = ["01099", "01100"];
  s = revealStage(s);
  const first = s.choice!.options[0].id;
  s = choose(reload(s), first);
  assert.ok(!s.choice!.options.some((o) => o.id === first));
  s = choose(reload(s), s.choice!.options[0].id);
  assert.equal(s.wildsRhovanion!.storedCards.length, 2);
  assert.deepEqual(
    s.wildsRhovanion!.storedCards.map((v) => v.cards[0].id),
    hands.map((u) => u.id),
  );
  const state = publicState(s);
  assert.ok(state.wildsRhovanion!.storedCards.every((v) => !("cards" in v)));
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.equal(seatView(s, 1).hand.length, 0);
  const batch = s.wildsRhovanion!.storedCards[0],
    location = get(s, batch.locationId)!;
  assert.equal(
    locationQuest(s, location),
    (card(location.code).quest ?? 0) + 1,
  );
  progressLocation(s, location, locationQuest(s, location));
  s = finish(s);
  assert.ok(seatView(s, batch.player).hand.some((u) => u.id === hands[0].id));
  assert.equal(s.wildsRhovanion!.storedCards.length, 1);
  s = reload(s);
});
test("Truly Lost stage advance discards each remaining hidden card to its actual owner", () => {
  let s = base("lost-in-mirkwood", 2);
  stage(s, W.trulyLost);
  const location = add(s, "01100");
  for (const player of playerOrder(s)) {
    let u!: Unit;
    forOwner(s, player, () => {
      u = make(s, "01013");
    });
    s.wildsRhovanion!.storedCards.push({
      locationId: location.id,
      player,
      cards: [u],
    });
  }
  s.phase = "travel";
  s.encounterDeck = Array(10).fill("01099");
  const objective = add(s, W.clearing);
  s = applyAction(reload(s), { type: "TRAVEL", id: objective.id });
  s = settle(s);
  assert.equal(s.wildsRhovanion!.storedCards.length, 0);
  for (const p of playerOrder(s))
    assert.ok(seatView(s, p).discard.includes("01013"));
  s = reload(s);
});
test("Mirkwood Patrol takes an unguarded objective at native encounter phase completion", () => {
  let s = base("lost-in-mirkwood");
  s.phase = "encounter";
  const patrol = add(s, W.patrol),
    objective = add(s, W.path);
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  assert.equal(get(s, patrol.id)!.guarding, objective.id);
});
for (const [quest, enemy] of [
  [W.spiders, "01096"],
  [W.orcs, "01089"],
])
  test(`Only the first ${quest === W.spiders ? "Spider" : "Orc"} revealed in a quest phase gains surge`, () => {
    let s = base("lost-in-mirkwood");
    stage(s, quest);
    s.phase = "quest";
    s.encounterDeck = ["01099"];
    revealed(s, enemy);
    s = finish(s);
    assert.equal(s.encounterDeck.length, 0);
    assert.ok(s.staging.some((u) => u.code === "01099"));
    s.encounterDeck = ["01100"];
    revealed(s, enemy);
    s = finish(s);
    assert.deepEqual(s.encounterDeck, ["01100"]);
    s.round++;
    revealed(s, enemy);
    s = finish(s);
    assert.equal(s.encounterDeck.length, 0);
  });
test("Fear nemesis ignores damage until eight progress, returns for its round attack and wins only on defeat", () => {
  let s = base("lost-in-mirkwood");
  stage(s, W.fear);
  s.wildsRhovanion!.setAside = [make(s, "01090")];
  s = revealStage(s);
  s = settle(s);
  const enemy = get(s, s.wildsRhovanion!.nemesisId)!;
  damage(s, enemy.id, 3, { combatDamage: true });
  assert.equal(enemy.damage, 0);
  s.staging = s.staging.filter((u) => u.id !== enemy.id);
  s.engaged.push(enemy);
  enemy.owner = 0;
  prepend(s, ...wildsRhovanionRoundEnd(s));
  s = finish(s);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  s.progress = 8;
  damage(s, enemy.id, 100, { combatDamage: true });
  assert.equal(s.status, "won");
});
test("Taur-nu-Fuin engagement gate holds sixteen progress until all engaged enemies leave", () => {
  let s = base("lost-in-mirkwood");
  stage(s, W.escape);
  const e = make(s, "01097");
  s.engaged.push(e);
  s.progress = 16;
  check(s);
  assert.equal(s.status, "playing");
  destroy(s, e);
  s = finish(s);
  assert.equal(s.status, "won");
});
test("Taur-nu-Fuin round end raises each player's threat by only that player's engaged enemies", () => {
  let s = base("lost-in-mirkwood", 2);
  stage(s, W.escape);
  forOwner(s, 0, () => s.engaged.push(make(s, "01097"), make(s, "01097")));
  forOwner(s, 1, () => s.engaged.push(make(s, "01097")));
  prepend(s, ...wildsRhovanionRoundEnd(s));
  s = finish(s);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 21);
  assert.equal(allEngaged(s).length, 3);
});
test("Carried Away strips and captures every chosen hero before searching for any guard, even if no enemy remains", () => {
  let s = base("lost-in-mirkwood", 2);
  stage(s, W.carried);
  s.encounterDeck = ["01099"];
  const heroes = playerOrder(s).map((p) => seatView(s, p).heroes[0]);
  heroes[0].resources = 8;
  heroes[0].damage = 2;
  s = revealStage(s);
  s = choose(reload(s), heroes[0].id);
  assert.equal(
    s.encounterDeck.length,
    1,
    "the second player chooses before guards are searched",
  );
  s = choose(reload(s), heroes[1].id);
  assert.equal(s.wildsRhovanion!.guardedHeroes.length, 2);
  assert.ok(s.wildsRhovanion!.guardedHeroes.every((h) => h.guardId === ""));
  assert.equal(s.wildsRhovanion!.guardedHeroes[0].hero.resources, 0);
  assert.equal(s.wildsRhovanion!.guardedHeroes[0].hero.damage, 0);
  s = reload(s);
});
test("Mirkwood Patrol retains an existing guarded objective when it guards a second one", () => {
  let s = base("lost-in-mirkwood");
  s.phase = "encounter";
  const patrol = add(s, W.patrol),
    first = add(s, W.path),
    second = add(s, W.hilltop);
  patrol.guarding = first.id;
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  const guard = get(s, patrol.id)!;
  assert.equal(guard.guarding, first.id);
  assert.deepEqual(guard.cobasGuarding, [second.id]);
  s = reload(s);
});
test("Truly Lost restores or discards a borrowed physical card to its original owner", () => {
  for (const explore of [true, false]) {
    let s = base("lost-in-mirkwood", 2);
    stage(s, W.trulyLost);
    const location = add(s, "01100"),
      borrowed = make(s, "01013");
    borrowed.owner = 1;
    s.wildsRhovanion!.storedCards.push({
      locationId: location.id,
      player: 0,
      cards: [borrowed],
    });
    s = reload(s);
    if (explore) {
      progressLocation(s, get(s, location.id)!, 10);
      s = finish(s);
      assert.ok(seatView(s, 1).hand.some((u) => u.id === borrowed.id));
      assert.ok(!seatView(s, 0).hand.some((u) => u.id === borrowed.id));
    } else {
      destroy(s, get(s, location.id)!, false);
      s = finish(s);
      assert.ok(seatView(s, 1).discard.includes(borrowed.code));
      assert.ok(!seatView(s, 0).discard.includes(borrowed.code));
    }
    s = reload(s);
  }
});
