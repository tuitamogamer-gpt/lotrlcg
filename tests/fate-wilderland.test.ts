import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  get,
  make,
  stats,
  threatOf,
  engagementCost,
  stageInfo,
} from "../src/game/core";
import {
  damage,
  check,
  destroy,
  discardLocation,
  engage,
  progressLocation,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  consideredEngaged,
  dealEnemyShadows,
  engagedEnemies,
} from "../src/game/considered-engagement";
import { startGuided } from "../src/game/presentation";
import {
  FATE_WILDERLAND as F,
  fateWilderlandPublicState,
  FATE_WILDERLAND_QUESTS,
} from "../src/game/fate-wilderland-support";
import {
  fateWilderlandAttackFinished,
  fateWilderlandShadow,
} from "../src/game/fate-wilderland";
import {
  base,
  start,
  reload,
  settle,
  choose,
} from "./fate-wilderland-fixtures";
import type { GameState, Unit } from "../src/game/types";

const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const objective = (s: GameState, code: string) =>
  s.staging.find((u) => u.code === code)!;
const finish = (s: GameState) => {
  check(s);
  flush(s);
  return settle(s);
};
function target(s: GameState, id: string) {
  const o = s.choice!.options.find(
    (o) =>
      o.id === id ||
      o.effects.some((e) => e.target === id || e.ids?.includes(id)),
  );
  assert.ok(o, JSON.stringify(s.choice));
  return o.id;
}
function stage(s: GameState, n: 1 | 2 | 3) {
  s.stage = n;
  s.fateWilderland!.currentQuest = [F.first, F.second, F.third][n - 1];
}
function enemy(s: GameState, code: string, player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => {
    u.owner = player;
    s.engaged.push(u);
  });
  return u;
}
for (const easy of [false, true])
  for (const n of [1, 2, 3, 4])
    test(`Fate of Wilderland ${easy ? "easy" : "normal"} ${n}-seat original setup conserves every physical encounter`, () => {
      const s = start(n, easy, 899, false, true);
      assert.equal(s.status, "playing");
      assert.ok(s.fateWilderland?.initialized);
      assert.equal(s.staging.length, n + 3);
      assert.equal(
        s.staging.filter((u) => card(u.code).type_code === "enemy").length,
        n + 1,
      );
      assert.equal(
        s.encounterDeck.length + s.encounterDiscard.length + n,
        easy ? 30 : 43,
      );
      for (const code of [F.urdug, F.assault, F.defense])
        assert.equal(s.staging.filter((u) => u.code === code).length, 1);
      assert.equal(stageInfo(s).quest, 0);
      assert.ok(validateSave(reload(s)));
    });
test("solo setup and guided setup serialize the same original quest and three objective identities", () => {
  for (const guided of [false, true]) {
    const s = start(1, false, 899, guided, false);
    assert.equal(s.table, undefined);
    assert.equal(s.fateWilderland!.currentQuest, F.first);
    assert.equal(objective(s, F.assault).progress, 0);
    assert.equal(objective(s, F.defense).resources, 0);
    assert.ok(validateSave(reload(s)));
  }
});
test("quest progress never advances a stage; Assault thresholds are checked only at round end", () => {
  let s = base(2);
  s.progress = 100;
  objective(s, F.assault).progress = 6;
  s = finish(s);
  assert.equal(s.stage, 1);
  s.phase = "refresh";
  handle(s, fx("wilderRoundEnd"));
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(objective(s, F.assault).progress, 7);
  assert.equal(s.progress, 0);
  assert.equal(s.fateWilderland!.currentQuest, F.second);
});
test("stage one counts only staged enemies; stage three counts every physical enemy once", () => {
  let s = base(2);
  enemy(s, F.troop, 0);
  enemy(s, F.wargs, 1);
  staged(s, F.vanguard);
  handle(s, fx("wilderRoundEnd"));
  s = finish(s);
  assert.equal(objective(s, F.assault).progress, 2);
  stage(s, 3);
  handle(s, fx("wilderRoundEnd"));
  s = finish(s);
  assert.equal(objective(s, F.assault).progress, 6);
});
test("stage two preserves Assault counters and stage three loses at its printed player-scaled threshold", () => {
  let s = base();
  stage(s, 2);
  objective(s, F.assault).progress = 8;
  handle(s, fx("wilderRoundEnd"));
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.equal(objective(s, F.assault).progress, 8);
  objective(s, F.assault).progress = 15;
  handle(s, fx("wilderRoundEnd"));
  s = finish(s);
  assert.equal(s.status, "lost");
  assert.equal(objective(s, F.assault).progress, 16);
});
test("guided end-of-round advancement preserves its queued stage reveal across reload", () => {
  let s = startGuided(base(2));
  s.phase = "refresh";
  objective(s, F.assault).progress = 5;
  s.queue.push(fx("wilderRoundEnd"));
  flush(s);
  for (let n = 0; s.stage === 1; n++) {
    assert.ok(n < 8);
    s = applyAction(reload(s), {
      type: "CONTINUE",
      stepId: s.flow!.pending!.id,
    });
  }
  assert.ok(s.stageRevealing);
  assert.equal(s.fateWilderland!.currentQuest, F.second);
  s = settle(reload(s));
  assert.equal(s.stageRevealing, false);
  assert.equal(s.stage, 2);
});
test("a destroyed enemy offers an optional Defense resource, while a staging Gate prevents every placement", () => {
  let s = base();
  const e = staged(s, F.vanguard);
  destroy(s, e);
  flush(s);
  assert.match(s.choice!.title, /Heroes/);
  s = choose(reload(s), "resource");
  assert.equal(objective(s, F.defense).resources, 1);
  staged(s, F.gate);
  const next = staged(s, F.elite);
  destroy(s, next);
  s = finish(s);
  assert.equal(objective(s, F.defense).resources, 1);
  handle(s, fx("wilderDefense"));
  assert.equal(objective(s, F.defense).resources, 1);
});
test("Defense consideration keeps one staged Urdug and reaches every fellowship at five resources per player", () => {
  const s = base(3),
    boss = objective(s, F.urdug);
  objective(s, F.defense).resources = 14;
  assert.ok(playerOrder(s).every((p) => !consideredEngaged(s, boss, p)));
  objective(s, F.defense).resources = 15;
  for (const p of playerOrder(s))
    assert.equal(
      engagedEnemies(s, p).filter((u) => u.id === boss.id).length,
      1,
    );
  assert.equal(allEngaged(s).filter((u) => u.id === boss.id).length, 0);
  assert.ok(s.staging.some((u) => u.id === boss.id));
});
test("Urdug's Defense counts staged and engaged enemies, including encounter Goblin Troop bonuses after virtual engagement", () => {
  const s = base(2),
    boss = objective(s, F.urdug);
  enemy(s, F.troop, 1);
  staged(s, F.elite);
  assert.equal(stats(s, boss).defense, 6);
  objective(s, F.defense).resources = 10;
  assert.equal(stats(s, boss).defense, 7);
  assert.equal(stats(s, boss).attack, 4);
});
for (const n of [1, 2, 3] as const)
  test(`Urdug can be defeated at stage ${n} after a real resolved attack, with Victory 5 and no duplicate staged boss`, () => {
    let s = base();
    stage(s, n);
    s.phase = "attack";
    const boss = objective(s, F.urdug),
      h = s.heroes[0],
      a = make(s, "01057");
    h.attachments.push({ id: a.id, code: a.code, exhausted: false });
    objective(s, F.defense).resources = 5;
    s.encounterDeck = [F.watchtower, F.hills];
    assert.equal(damage(s, boss.id, 1), false);
    handle(s, fx("immediateAttack", { target: boss.id, player: 0 }));
    flush(s);
    assert.equal(
      s.combat!.attackBonus,
      0,
      "printed X threat is zero outside play",
    );
    s = choose(reload(s), target(s, h.id));
    s = settle(s);
    assert.equal(s.fateWilderland!.urdugAttack?.phase, "combat");
    s = applyAction(reload(s), {
      type: "ABILITY",
      id: h.id,
      attachmentId: a.id,
    });
    s = applyAction(reload(s), {
      type: "ATTACK",
      enemyId: boss.id,
      attackerIds: s.heroes.map((h) => h.id),
    });
    s = settle(s);
    assert.equal(s.status, "won");
    assert.equal(s.staging.filter((u) => u.id === boss.id).length, 0);
    assert.equal(s.victoryCards!.filter((code) => code === F.urdug).length, 1);
    assert.equal(s.victory, 5);
  });
test("Urdug's damage permission lasts through the whole combat phase and expires at phase end", () => {
  let s = base();
  s.phase = "defense";
  const boss = objective(s, F.urdug);
  fateWilderlandAttackFinished(s, {
    enemyId: boss.id,
    defenderId: null,
    attackBonus: 0,
    attackResolved: true,
  });
  assert.equal(damage(s, boss.id, 1), true);
  s.phase = "attack";
  assert.equal(damage(s, boss.id, 1), true);
  s.phase = "refresh";
  assert.equal(damage(s, boss.id, 1), false);
  assert.equal(get(s, boss.id)!.damage, 2);
});
test("Elite and Vanguard engagement costs belong to the engaged player and persist correctly", () => {
  let s = base(2);
  selectSeat(s, 1);
  const elite = staged(s, F.elite);
  engage(s, elite, false);
  flush(s);
  s = choose(reload(s), "exhaust");
  assert.ok(s.choice!.options.every((o) => ownerOf(s, get(s, o.id)!) === 1));
  const h = s.heroes[0];
  s = choose(reload(s), h.id);
  assert.ok(get(s, h.id)!.exhausted);
  const v = staged(s, F.vanguard);
  engage(s, v, false);
  flush(s);
  s = choose(reload(s), "attack");
  assert.equal(stats(s, get(s, v.id)!).attack, 4);
  handle(s, fx("phaseEnd"));
  s = finish(s);
  assert.equal(stats(s, get(s, v.id)!).attack, 4);
  s.round++;
  assert.equal(stats(s, get(s, v.id)!).attack, 2);
});
test("Warg-rider's real dealt blank shadow interrupts before declaration and can return the physical enemy", () => {
  let s = base(2);
  const e = enemy(s, F.rider, 1);
  s.encounterDeck = [F.watchtower, F.command];
  dealEnemyShadows(s, e);
  flush(s);
  assert.match(s.choice!.title, /Warg-rider/);
  assert.equal(activeSeat(s), 1);
  s = choose(reload(s), "return");
  assert.ok(s.staging.some((u) => u.id === e.id));
  assert.ok(!allEngaged(s).some((u) => u.id === e.id));
  assert.equal(get(s, e.id)!.shadows.length, 0);
  assert.ok(s.encounterDiscard.includes(F.watchtower));
  const next = enemy(s, F.rider, 1);
  dealEnemyShadows(s, next);
  s = finish(s);
  assert.equal(
    s.choice,
    null,
    "an effectful shadow never triggers the printed blank-shadow Forced ability",
  );
});
test("Pack of Wargs resolves one additional actual attack with no new shadow after a blank was dealt", () => {
  let s = base();
  stage(s, 2);
  const e = enemy(s, F.wargs);
  s.encounterDeck = [F.watchtower, F.gate, F.command];
  handle(s, fx("startCombat"));
  flush(s);
  assert.equal(get(s, e.id)!.shadows.length, 1);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: s.heroes[0].id,
  });
  assert.ok(s.choice);
  s = choose(reload(s), target(s, s.heroes[1].id));
  s = settle(s);
  assert.equal(objective(s, F.assault).progress, 2);
  assert.equal(
    s.encounterDeck.length,
    2,
    "the additional attack deals no shadow",
  );
  assert.equal(s.fateWilderland!.blankShadows[e.id], undefined);
  assert.equal(get(s, e.id)!.shadows.length, 0);
  assert.equal(s.encounterDiscard.filter((c) => c === F.watchtower).length, 1);
});
test("Watchtower's optional explored response offers both counters and its Victory 2 is retained", () => {
  let s = base();
  const l = staged(s, F.watchtower);
  objective(s, F.assault).progress = 3;
  s.activeLocation = l;
  s.staging = s.staging.filter((u) => u.id !== l.id);
  assert.equal(
    stats(s, s.heroes[0]).defense,
    card(s.heroes[0].code).defense! + 1,
  );
  progressLocation(s, l, 5);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === "resource"));
  s = choose(reload(s), "remove");
  assert.equal(objective(s, F.assault).progress, 2);
  assert.ok(s.victoryCards!.includes(F.watchtower));
  assert.equal(s.victory, 2);
});
test("Gate travel pays an actual Goblin Troop search from victory before removing its resource prohibition", () => {
  let s = base();
  const l = staged(s, F.gate);
  s.phase = "travel";
  s.encounterDeck = [F.watchtower];
  s.encounterDiscard = [];
  s.victoryCards = [F.troop];
  assert.equal(canTravel(s, l), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  assert.match(s.choice!.title, /Gate/);
  s = choose(reload(s), "victory-0");
  assert.equal(s.activeLocation!.id, l.id);
  assert.ok(s.staging.some((u) => u.code === F.troop));
  assert.ok(!s.victoryCards!.includes(F.troop));
  handle(s, fx("wilderDefense"));
  assert.equal(objective(s, F.defense).resources, 1);
});
test("Hilltop engagement reduction stacks only on non-unique enemies; exploration adds discarded enemies without revealing them", () => {
  let s = base(2);
  const l = staged(s, F.battlements),
    e = staged(s, F.vanguard);
  staged(s, F.battlements);
  assert.equal(engagementCost(s, e), 10);
  assert.equal(engagementCost(s, objective(s, F.urdug)), 50);
  s.encounterDeck = [F.elite, F.fierce, F.command];
  progressLocation(s, l, 3);
  s = finish(s);
  assert.ok(s.staging.some((u) => u.code === F.elite));
  assert.ok(!allCharacters(s).some((u) => u.exhausted));
  assert.equal(objective(s, F.assault).progress, 0);
  assert.equal(s.encounterDeck.length, 1);
});
test("Fierce Attack uses the current main stage and Dark Clouds stacks unsuccessful-quest progress without replacing ordinary threat", () => {
  let s = base(2);
  stage(s, 2);
  s.phase = "staging";
  revealed(s, F.fierce);
  s = finish(s);
  assert.equal(objective(s, F.assault).progress, 2);
  assert.equal(s.threat, 21);
  revealed(s, F.clouds);
  s = finish(s);
  revealed(s, F.clouds);
  s = finish(s);
  assert.equal(threatOf(s, objective(s, F.urdug)), 4);
  handle(s, fx("failedQuest", { value: 3 }));
  s = finish(s);
  assert.equal(objective(s, F.assault).progress, 6);
  assert.equal(seatView(s, 0).threat, 24);
  assert.equal(seatView(s, 1).threat, 24);
});
test("Dark Clouds recalculates its encounter lasting threat for later entrants, staging departures and phase changes", () => {
  let s = base();
  s.phase = "staging";
  revealed(s, F.clouds);
  s = finish(s);
  revealed(s, F.clouds);
  s = finish(s);
  revealed(s, F.elite);
  s = finish(s);
  const elite = objective(s, F.elite);
  assert.equal(threatOf(s, elite), (card(F.elite).threat ?? 0) + 2);
  elite.blanked = true;
  assert.equal(threatOf(s, elite), (card(F.elite).threat ?? 0) + 2);
  engage(s, elite, false);
  s = finish(s);
  assert.equal(threatOf(s, get(s, elite.id)!), card(F.elite).threat);
  assert.equal(threatOf(s, objective(s, F.urdug)), 4);
  s = reload(s);
  s.phase = "travel";
  assert.equal(threatOf(s, objective(s, F.urdug)), 2);
});
test("Slopes provides a real extra-reveal choice and its shadow prevents damage for the whole phase", () => {
  let s = base();
  s.encounterDeck = [F.watchtower];
  revealed(s, F.slopes);
  flush(s);
  s = choose(reload(s), "reveal");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === F.watchtower));
  assert.equal(objective(s, F.assault).progress, 0);
  const e = enemy(s, F.vanguard);
  s.phase = "defense";
  s.combat = { enemyId: e.id, defenderId: null, attackBonus: 0 };
  fateWilderlandShadow(s, F.slopes);
  assert.equal(damage(s, e.id, 1), false);
  s.phase = "attack";
  assert.equal(damage(s, e.id, 1), false);
  s.phase = "refresh";
  assert.equal(damage(s, e.id, 1), true);
});
test("Urdug's Command and its Command shadow each add Assault progress after the same actual character destruction", () => {
  let s = base(2);
  stage(s, 2);
  s.phase = "staging";
  const victim = make(s, "01016");
  s.allies.push(victim);
  s.encounterDeck = [F.command, F.watchtower];
  revealed(s, F.command);
  flush(s);
  assert.match(s.choice!.title, /Immediate attack/);
  s = choose(reload(s), target(s, victim.id));
  s = settle(s);
  assert.ok(!get(s, victim.id));
  assert.equal(
    objective(s, F.assault).progress,
    3,
    "stage-two Forced plus both independent Command abilities",
  );
  assert.equal(s.encounterDiscard.filter((c) => c === F.command).length, 2);
  assert.ok(fateWilderlandPublicState(s)!.urdugCanTakeDamage);
});
test("Lonely Lands stores the actual resolving Will of the West once while its printed Action still shuffles", () => {
  let s = base(2);
  s.phase = "staging";
  s.heroes[0] = make(s, "01007");
  s.heroes[0].resources = 1;
  const lands = staged(s, F.lonely),
    event = make(s, "01049");
  s.hand = [event];
  s.discard = ["01057", "01016"];
  const before = s.deck.length;
  s = applyAction(reload(s), { type: "PLAY", id: event.id });
  assert.match(s.choice!.title, /Lonely Lands/);
  s = choose(reload(s), lands.id);
  assert.match(s.choice!.title, /Will of the West/);
  assert.equal(
    s.resolvingEvents!.find((e) => e.unit.id === event.id)!.destination,
    "spent",
  );
  assert.equal(s.fateWilderland!.storedCards[0].cards[0].id, event.id);
  assert.equal(threatOf(s, get(s, lands.id)!), 4);
  s = choose(reload(s), "player-0");
  assert.equal(s.deck.length, before + 2);
  assert.equal(s.discard.length, 0);
  assert.ok(!s.removed.includes("01049"));
  assert.equal(s.resolvingEvents, undefined);
  assert.equal(s.fateWilderland!.storedCards.length, 1);
  discardLocation(s, get(s, lands.id)!);
  s = finish(s);
  assert.deepEqual(s.discard, ["01049"]);
  assert.equal(s.fateWilderland!.storedCards.length, 0);
});
test("Hills of Wilderland uses the largest fellowship and only the first player can pay its Quest Action", () => {
  let s = base(2);
  const l = staged(s, F.hills);
  s.phase = "quest";
  forOwner(s, 1, () => s.allies.push(make(s, "01016")));
  assert.equal(threatOf(s, l), 4);
  s = applyAction(reload(s), { type: "ABILITY", id: l.id });
  const h = s.heroes[0];
  s = choose(reload(s), h.id);
  assert.ok(get(s, h.id)!.exhausted);
  assert.equal(threatOf(s, get(s, l.id)!), 3);
  selectSeat(s, 1);
  assert.throws(
    () => applyAction(reload(s), { type: "ABILITY", id: l.id }),
    /first player/,
  );
});
test("elimination immediately reduces Defense and end-of-round Assault player thresholds", () => {
  let s = base(2);
  const boss = objective(s, F.urdug);
  objective(s, F.defense).resources = 5;
  assert.equal(consideredEngaged(s, boss, 0), false);
  for (const h of [...seatView(s, 1).heroes]) destroy(s, h);
  s = finish(s);
  assert.equal(s.status, "playing");
  assert.ok(s.table!.seats[1].eliminated);
  assert.equal(consideredEngaged(s, get(s, boss.id)!, 0), true);
  assert.equal(fateWilderlandPublicState(s)!.defenseGoal, 5);
  objective(s, F.assault).progress = 3;
  handle(s, fx("wilderRoundEnd"));
  s = finish(s);
  assert.equal(s.stage, 2);
});
test("Grey Mountain Goblins preserve encounter bonuses, forced Stray engagement and actual shadow identity", () => {
  let s = base(2);
  selectSeat(s, 1);
  const stray = staged(s, F.stray),
    troop = staged(s, F.troop);
  engage(s, troop, false);
  s = finish(s);
  assert.equal(ownerOf(s, get(s, stray.id)!), 1);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === stray.id));
  assert.equal(stats(s, get(s, stray.id)!).attack, 3);
  assert.equal(stats(s, get(s, stray.id)!).defense, 1);
  const holder = get(s, troop.id)!;
  holder.shadows = [F.stray];
  holder.revealedShadowCount = 1;
  s.phase = "defense";
  s.combat = {
    enemyId: holder.id,
    defenderId: null,
    attackBonus: 0,
    attackPlayer: 1,
  };
  fateWilderlandShadow(s, F.stray);
  assert.equal(holder.shadows.length, 0);
  assert.equal(s.staging.filter((u) => u.code === F.stray).length, 1);
  assert.ok(validateSave(reload(s)));
});
test("Swarms of Bats discards every actual hero resource and gains Surge only when nobody discarded any", () => {
  let s = base(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) h.resources = 0;
    });
  forOwner(s, 1, () => {
    s.heroes[0].resources = 2;
  });
  s.encounterDeck = [F.watchtower, F.gate];
  revealed(s, F.bats);
  s = finish(s);
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 22);
  assert.equal(s.encounterDeck.length, 2);
  assert.ok(
    allCharacters(s)
      .filter((u) => card(u.code).type_code === "hero")
      .every((h) => h.resources === 0),
  );
  revealed(s, F.bats);
  s = finish(s);
  assert.equal(s.encounterDeck.length, 1);
  assert.ok(s.staging.some((u) => u.code === F.watchtower));
});
test("Gathering Gloom offers each fellowship's own ally count or a genuine additional reveal", () => {
  let s = base(2);
  s.allies.push(make(s, "01016"));
  forOwner(s, 1, () => {
    s.allies.push(make(s, "01016"), make(s, "01016"));
  });
  s.encounterDeck = [F.watchtower, F.gate];
  revealed(s, F.gloom);
  flush(s);
  assert.equal(activeSeat(s), 0);
  s = choose(reload(s), "threat");
  assert.equal(activeSeat(s), 1);
  s = choose(reload(s), "reveal");
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 22, "Doomed 1 plus one allied character");
  assert.equal(
    seatView(s, 1).threat,
    21,
    "only Doomed 1; this fellowship chose a reveal",
  );
  assert.ok(s.staging.some((u) => u.code === F.watchtower));
});
test("Dark Clouds shadow can discard a controlled threat-dial attachment and excludes objective attachments", () => {
  let s = base(2);
  selectSeat(s, 1);
  const foe = enemy(s, F.elite, 1),
    favor = make(s, "10124"),
    clue = make(s, "octgn:2e5e6e97-003b-4500-8372-495f5ee86051");
  const bearerId = s.heroes[0].id;
  s.threatAttachments = [
    {
      id: favor.id,
      code: favor.code,
      exhausted: false,
      owner: 0,
      controller: 1,
    },
  ];
  s.heroes[0].attachments.push({
    id: clue.id,
    code: clue.code,
    exhausted: false,
    controller: 1,
  });
  s.phase = "defense";
  s.combat = {
    enemyId: foe.id,
    defenderId: null,
    attackBonus: 0,
    attackPlayer: 1,
  };
  fateWilderlandShadow(s, F.clouds);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [favor.id],
  );
  s = choose(reload(s), favor.id);
  assert.equal(seatView(s, 1).threatAttachments?.length, 0);
  assert.ok(seatView(s, 0).discard.includes(favor.code));
  assert.ok(
    get(s, clue.id) === undefined,
    "the objective stays attached rather than becoming a standalone unit",
  );
  assert.ok(get(s, bearerId)!.attachments.some((a) => a.id === clue.id));
});
test("Dark Clouds shadow uses a hero attachment's controller while returning it to its physical owner's discard", () => {
  let s = base(2);
  selectSeat(s, 1);
  const foe = enemy(s, F.elite, 1),
    stone = make(s, "01027"),
    bearerId = s.heroes[0].id;
  s.heroes[0].attachments.push({
    id: stone.id,
    code: stone.code,
    owner: 0,
    exhausted: false,
  });
  s.phase = "defense";
  s.combat = {
    enemyId: foe.id,
    defenderId: null,
    attackBonus: 0,
    attackPlayer: 1,
  };
  fateWilderlandShadow(s, F.clouds);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [stone.id],
  );
  s = choose(reload(s), stone.id);
  assert.ok(!get(s, bearerId)!.attachments.some((a) => a.id === stone.id));
  assert.ok(seatView(s, 0).discard.includes(stone.code));
  assert.ok(!seatView(s, 1).discard.includes(stone.code));
});
test("a Spearman destroys the attacker at declaration before it can trigger stage two's resolved-attack progress", () => {
  let s = base();
  stage(s, 2);
  const foe = enemy(s, F.vanguard),
    spearman = make(s, "01029");
  foe.damage = 2;
  s.allies.push(spearman);
  handle(s, fx("startCombat"));
  flush(s);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: foe.id,
    defenderId: spearman.id,
  });
  s = settle(s);
  assert.ok(!get(s, foe.id));
  assert.equal(objective(s, F.assault).progress, 0);
  assert.equal(get(s, spearman.id)!.damage, 0);
});
test("Urdug's later real attack remains immune to a defending Spearman after its damage gate has opened", () => {
  let s = base(2);
  const boss = objective(s, F.urdug),
    firstDefender = s.heroes[0];
  objective(s, F.defense).resources = 10;
  s.phase = "defense";
  s.encounterDeck = [F.watchtower, F.hills, F.watchtower, F.watchtower];
  handle(s, fx("immediateAttack", { target: boss.id, player: 0 }));
  flush(s);
  s = choose(reload(s), target(s, firstDefender.id));
  s = settle(s);
  assert.ok(fateWilderlandPublicState(s)!.urdugCanTakeDamage);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: boss.id,
    defenderId: s.heroes[1].id,
  });
  s = settle(s);
  assert.equal(activeSeat(s), 1);
  const spearman = make(s, "01029");
  s.allies.push(spearman);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: boss.id,
    defenderId: spearman.id,
  });
  s = settle(s);
  assert.equal(
    get(s, boss.id)!.damage,
    0,
    "a printed player-card Response cannot damage immune Urdug",
  );
});
test("considered-engaged Urdug receives a fresh physical shadow for each player's actual normal attack", () => {
  let s = base(2);
  const boss = objective(s, F.urdug);
  objective(s, F.defense).resources = 10;
  s.encounterDeck = [
    F.command,
    F.hills,
    F.watchtower,
    F.hills,
    F.clouds,
    F.watchtower,
  ];
  handle(s, fx("startCombat"));
  flush(s);
  assert.equal(
    get(s, boss.id)!.shadows.length,
    0,
    "this boss receives its fresh shadow when it actually attacks",
  );
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: boss.id,
    defenderId: s.heroes[0].id,
  });
  s = settle(s);
  assert.equal(activeSeat(s), 1);
  assert.equal(get(s, boss.id)!.shadows.length, 0);
  assert.ok(s.encounterDiscard.includes(F.command));
  assert.equal(s.encounterDeck[0], F.watchtower);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: boss.id,
    defenderId: s.heroes[0].id,
  });
  s = settle(s);
  assert.equal(get(s, boss.id)!.shadows.length, 0);
  assert.ok(s.encounterDiscard.includes(F.watchtower));
  assert.equal(s.encounterDeck.length, 2);
  assert.equal(s.staging.filter((u) => u.id === boss.id).length, 1);
});
test("advancing via Assault counters discards quest attachments without defeating the old quest", () => {
  let s = base(2);
  const road = make(s, "16012"),
    defeat = make(s, "10122");
  s.questAttachments = {
    [F.first]: [
      { id: road.id, code: road.code, exhausted: false, owner: 0 },
      { id: defeat.id, code: defeat.code, exhausted: false, owner: 0 },
    ],
  };
  s.heroes[0].damage = 1;
  objective(s, F.assault).progress = 5;
  handle(s, fx("wilderRoundEnd"));
  flush(s);
  assert.equal(s.stage, 2);
  assert.equal(
    s.choice,
    null,
    "neither Road Goes Ever On nor The Long Defeat sees a defeated quest",
  );
  assert.ok(seatView(s, 0).discard.includes(road.code));
  assert.ok(seatView(s, 0).discard.includes(defeat.code));
  assert.ok(!s.victoryCards?.includes(F.first));
  assert.ok(validateSave(reload(s)));
});
