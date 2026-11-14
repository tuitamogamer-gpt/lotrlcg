import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  stagingThreat,
  stats,
} from "../src/game/core";
import { check, damage, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatView,
} from "../src/game/table";
import {
  CROSS_ROADS_HOOKS,
  CROSS_ROADS_RECIPES,
  JTC,
  blackGateLimit,
  crossRoadsPublicState,
} from "../src/game/cross-roads";
import {
  activate,
  allies,
  base,
  choose,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./cross-roads-fixtures";
import type { GameState } from "../src/game/types";

const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s: GameState, code: string, p = 0) => {
  s.encounterDeck.unshift(code);
  s.queue.push({ kind: "reveal", player: p });
  flush(s);
  return s;
};
const run = (s: GameState, kind: string, p = 0, extra = {}) => {
  s.queue.push(fx(kind, { player: p, ...extra }));
  flush(s);
  return s;
};
const pastReveal = (s: GameState) => {
  while (s.choice && /^Revealed · /.test(s.choice.title))
    s = choose(s, "resolve");
  return s;
};
const GUARD = "01013",
  GANDALF = "01073",
  SNOWBOURN = "01016";
const recipe = (easy: boolean) =>
  CROSS_ROADS_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!;
const count = (easy: boolean, section: string) =>
  recipe(easy)
    .cards.filter((c) => c.section === section)
    .reduce((n, c) => n + c.quantity, 0);

test("Setup: The Black Gate and The Cross-roads in the staging area, the Men of Harad under The Cross-roads, and a different location from each player but the first", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy, 911 + players);
      const q = s.crossRoads!;
      assert.equal(q.underCrossroads.length, 9);
      assert.ok(
        q.underCrossroads.every((c) => card(c).traits?.includes("Harad")),
      );
      assert.ok(s.staging.some((u) => u.code === JTC.blackGate));
      assert.ok(s.staging.some((u) => u.code === JTC.crossroads));
      const locations = s.staging.filter(
        (u) =>
          card(u.code).type_code === "location" && u.code !== JTC.crossroads,
      );
      assert.equal(locations.length, players - 1);
      assert.equal(
        new Set(locations.map((u) => card(u.code).name)).size,
        players - 1,
        "different locations",
      );
      assert.ok(locations.every((u) => !card(u.code).is_unique));
      assert.equal(
        s.encounterDeck.length + locations.length,
        count(easy, "sharedEncounterDeck"),
      );
      // The Cross-roads: 9 threat, -1 for each facedown card.
      const crossroads = s.staging.find((u) => u.code === JTC.crossroads)!;
      assert.equal(
        stagingThreat(s) -
          locations.reduce((n, u) => n + (card(u.code).threat ?? 0), 0),
        0,
        `${players}/${easy}`,
      );
      assert.ok(crossroads);
      assert.equal(s.round, 1);
    }
});

test("Stage 1B reveals a card from under The Cross-roads at the beginning of each quest phase; The Black Gate takes the staged Harad enemies at the end of the planning phase, and too many lose the game", () => {
  let s = base(2);
  const q = s.crossRoads!;
  q.underCrossroads = [JTC.soldier, JTC.oliphaunt];
  s.phase = "planning";
  s = settle(act(s, { type: "NEXT" }));
  forOwner(s, 1, () => undefined);
  s = settle(s);
  // Both players pass the planning phase.
  while (s.phase === "planning") s = settle(act(s, { type: "NEXT" }));
  assert.equal(s.phase, "quest");
  assert.ok(s.staging.some((u) => u.code === JTC.soldier));
  assert.deepEqual(s.crossRoads!.underCrossroads, [JTC.oliphaunt]);
  // The Black Gate: Harad enemies in the staging area go under it.
  s = base(2);
  stage(s, JTC.man);
  stage(s, JTC.captain);
  s.phase = "planning";
  while (s.phase === "planning") s = settle(act(s, { type: "NEXT" }));
  assert.equal(s.crossRoads!.underBlackGate.length, 2);
  assert.ok(!s.staging.some((u) => u.code === JTC.man));
  assert.equal(blackGateLimit(s), 5);
  // At 3 more than the number of players, the players lose.
  s = base(1);
  s.crossRoads!.underBlackGate = [JTC.man, JTC.man, JTC.captain, JTC.soldier];
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Black Gate/);
});

test("The Cross-roads: its threat drops with its facedown cards, the players travel there only with none and 20 progress, and exploring it wins", () => {
  let s = base(1);
  const crossroads = s.staging.find((u) => u.code === JTC.crossroads)!;
  s.crossRoads!.underCrossroads = [JTC.man, JTC.man];
  assert.equal(stagingThreat(s), 9 - 2);
  s.phase = "travel";
  assert.throws(
    () => act(s, { type: "TRAVEL", id: crossroads.id }),
    /facedown cards/,
  );
  s.crossRoads!.underCrossroads = [];
  s.progress = 19;
  assert.throws(
    () => act(s, { type: "TRAVEL", id: crossroads.id }),
    /20 progress/,
  );
  // The stage is never defeated: progress beyond 20 stays on it.
  s.progress = 25;
  check(s);
  flush(s);
  assert.equal(s.status, "playing");
  s = settle(act(s, { type: "TRAVEL", id: crossroads.id }));
  assert.equal(s.activeLocation?.id, crossroads.id);
  progressLocation(s, s.activeLocation!, 9);
  flush(s);
  s = settle(s);
  assert.equal(s.status, "won");
  assert.match(s.reason!, /Cross-roads is explored/);
});

test("Henneth Annûn: travelling there returns the engaged enemies to the staging area, the encounter and combat phases are skipped, and 1B and The Black Gate are ignored", () => {
  let s = base(1);
  const henneth = stage(s, JTC.henneth);
  const enemy = engaged(s, JTC.captain);
  s.phase = "travel";
  s = settle(act(s, { type: "TRAVEL", id: henneth.id }));
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.equal(s.engaged.length, 0);
  s = settle(act(s, { type: "NEXT" }));
  assert.ok(s.log.some((l) => /Skip the encounter phase/.test(l.text)));
  assert.ok(s.log.some((l) => /Skip the combat phase/.test(l.text)));
  assert.equal(s.round, 2, "the round ends after the refresh phase");
  assert.ok(
    s.staging.some((u) => u.id === enemy.id),
    "no engagement check: the Captain of Harad stays in the staging area",
  );
  // 1B and The Black Gate are ignored.
  s = base(1);
  activate(s, JTC.henneth);
  stage(s, JTC.man);
  s.crossRoads!.underCrossroads = [JTC.soldier];
  s.phase = "planning";
  s = settle(act(s, { type: "NEXT" }));
  assert.equal(s.crossRoads!.underBlackGate.length, 0);
  assert.deepEqual(s.crossRoads!.underCrossroads, [JTC.soldier]);
  assert.equal(crossRoadsPublicState(s)!.refuge, true);
});

test("Southward Road, Ithilien Woods, Foothills of Ephel Dúath and Hills of Ithilien: their travel costs and their effects while active", () => {
  // Southward Road: reveal a card from under The Cross-roads to travel; an additional optional engagement.
  let s = base(1);
  const road = stage(s, JTC.southward);
  s.phase = "travel";
  assert.throws(
    () => act(s, { type: "TRAVEL", id: road.id }),
    /no facedown card/,
  );
  s.crossRoads!.underCrossroads = [JTC.archer];
  s = settle(act(s, { type: "TRAVEL", id: road.id }));
  assert.equal(s.activeLocation?.id, road.id);
  assert.ok(s.staging.some((u) => u.code === JTC.archer));
  assert.equal(CROSS_ROADS_HOOKS.extraOptionalEngagements!(s, 0), 1);
  // Ithilien Woods: reveal the top encounter card; engaging a Harad enemy readies a character.
  s = base(1);
  const woods = stage(s, JTC.woods);
  s.encounterDeck = [JTC.man, JTC.hills, JTC.hills];
  s.phase = "travel";
  s = settle(act(s, { type: "TRAVEL", id: woods.id }));
  assert.equal(s.activeLocation?.id, woods.id);
  assert.ok(
    s.staging.some((u) => u.code === JTC.man),
    "Man of Harad revealed",
  );
  const tired = s.heroes[0];
  tired.exhausted = true;
  const captain = stage(s, JTC.captain);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: captain.id });
  assert.match(s.choice!.title, /^Ithilien Woods · Ready a character/);
  s = choose(s, tired.id);
  assert.equal(get(s, tired.id)!.exhausted, false);
  // Foothills of Ephel Dúath: engage an enemy to travel; Harad enemies get -1 threat.
  s = base(1);
  const foothills = stage(s, JTC.foothills);
  s.phase = "travel";
  assert.throws(() => act(s, { type: "TRAVEL", id: foothills.id }), /no enemy/);
  const man = stage(s, JTC.man);
  const soldier = stage(s, JTC.soldier);
  s = act(s, { type: "TRAVEL", id: foothills.id });
  s = choose(s, soldier.id);
  s = settle(s);
  assert.equal(s.activeLocation?.id, foothills.id);
  assert.ok(s.engaged.some((u) => u.id === soldier.id));
  assert.equal(
    stagingThreat(s),
    9 + card(JTC.man).threat! - 1,
    "The Cross-roads 9 with no facedown card, Man of Harad -1",
  );
  assert.ok(s.staging.some((u) => u.id === man.id));
  // Hills of Ithilien: engaging a Harad enemy deals it 1 damage.
  s = base(1);
  activate(s, JTC.hills);
  const archer = stage(s, JTC.archer);
  s.phase = "encounter";
  s = settle(act(s, { type: "ENGAGE", id: archer.id }), "skip");
  assert.equal(
    get(s, archer.id)?.damage ??
      s.engaged.find((u) => u.id === archer.id)!.damage,
    1,
  );
});

test("The Men of Harad: Man of Harad, Captain of Harad, Oliphaunt, Haradrim Soldier and Haradrim Archer engage with their Forced effects", () => {
  // Man of Harad: discard a random card.
  let s = base(1);
  hand(s, [GUARD, GUARD]);
  const man = stage(s, JTC.man);
  s.phase = "encounter";
  s = settle(act(s, { type: "ENGAGE", id: man.id }));
  assert.equal(s.hand.length, 1);
  assert.equal(s.discard.length, 1);
  // Captain of Harad: each Harad enemy +1 attack and -10 engagement this round.
  s = base(1);
  const other = stage(s, JTC.soldier);
  const captain = stage(s, JTC.captain);
  s.phase = "encounter";
  s = settle(act(s, { type: "ENGAGE", id: captain.id }));
  const soldier = s.staging.find((u) => u.id === other.id)!;
  assert.equal(stats(s, soldier).attack, card(JTC.soldier).attack! + 1);
  assert.equal(engagementCost(s, soldier), card(JTC.soldier).engagement! - 10);
  // Oliphaunt: each ally exhausts; at most 3 damage each round; no attachments.
  s = base(1);
  const [ally] = allies(s, [SNOWBOURN]);
  const oliphaunt = stage(s, JTC.oliphaunt);
  s.phase = "encounter";
  s = settle(act(s, { type: "ENGAGE", id: oliphaunt.id }));
  assert.equal(get(s, ally.id)!.exhausted, true);
  const o = s.engaged.find((u) => u.id === oliphaunt.id)!;
  damage(s, o.id, 5, { combatDamage: true });
  assert.equal(o.damage, 3);
  damage(s, o.id, 2, { combatDamage: true });
  assert.equal(o.damage, 3, "no more damage this round");
  assert.equal(CROSS_ROADS_HOOKS.cannotAttach!(s, o, "01056"), true);
  // Haradrim Soldier: an immediate attack.
  s = base(1);
  const soldier2 = stage(s, JTC.soldier);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: soldier2.id });
  assert.ok(
    s.log.some((l) =>
      /Haradrim Soldier makes an immediate attack/.test(l.text),
    ),
  );
  s = settle(s);
  // Haradrim Archer: X threat and X damage, X the number of players.
  s = base(2);
  const archer = stage(s, JTC.archer);
  assert.equal(stagingThreat(s), 9 + 2, "The Cross-roads 9, Haradrim Archer 2");
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: archer.id });
  assert.match(
    s.choice!.title,
    /^Haradrim Archer · Assign damage · 2 remaining/,
  );
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0) +
      s.allies.reduce((n, u) => n + u.damage, 0),
    2,
  );
});

test("Treacheries: The Dark Lord's Summons, Arrows Thick in the Air, Marching Up the Road and Fierce Southrons", () => {
  // The Dark Lord's Summons: under The Black Gate, or the top card under The Cross-roads engages you.
  let s = base(1);
  engaged(s, JTC.captain);
  const weak = engaged(s, JTC.man);
  s.crossRoads!.underCrossroads = [JTC.oliphaunt];
  s.phase = "staging";
  reveal(s, JTC.summons);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^The Dark Lord's Summons · Choose one/);
  s = choose(s, "gate");
  s = settle(s);
  assert.deepEqual(s.crossRoads!.underBlackGate, [JTC.man]);
  assert.ok(!s.engaged.some((u) => u.id === weak.id));
  s = base(1);
  s.crossRoads!.underCrossroads = [JTC.oliphaunt];
  s.phase = "staging";
  reveal(s, JTC.summons);
  s = pastReveal(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["cross-roads"],
  );
  s = choose(s, "cross-roads");
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === JTC.oliphaunt));
  // Arrows Thick in the Air: Harad enemies gain Archery 2 this round.
  s = base(1);
  stage(s, JTC.man);
  stage(s, JTC.soldier);
  s.phase = "staging";
  reveal(s, JTC.arrows);
  s = settle(s);
  assert.equal(s.crossRoads!.arrows?.count, 1);
  s.phase = "defense";
  run(s, "combatStartEffects");
  assert.match(s.choice!.title, /Archery damage · 5 remaining/, "1 + 2 + 2");
  // Marching Up the Road: return an engaged enemy, or a Harad enemy from the deck engages you.
  s = base(1);
  const returned = engaged(s, JTC.captain);
  s.encounterDeck = [JTC.soldier, JTC.hills];
  s.phase = "staging";
  reveal(s, JTC.marching);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Marching Up the Road · Choose one/);
  s = choose(s, `return-${returned.id}`);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === returned.id));
  s = base(1);
  s.encounterDeck = [JTC.hills, JTC.soldier, JTC.hills];
  s.phase = "staging";
  reveal(s, JTC.marching);
  s = pastReveal(s);
  s = choose(s, `deck-${JTC.soldier}`);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === JTC.soldier));
  // Fierce Southrons: under The Black Gate and another card, or each staged enemy attacks.
  s = base(1);
  stage(s, JTC.captain);
  stage(s, JTC.man);
  s.encounterDeck = [JTC.hills, JTC.hills];
  s.phase = "staging";
  reveal(s, JTC.southrons);
  s = pastReveal(s);
  s = choose(s, "gate");
  s = settle(s);
  assert.deepEqual(s.crossRoads!.underBlackGate, [JTC.man]);
  s = base(1);
  stage(s, JTC.captain);
  s.phase = "staging";
  reveal(s, JTC.southrons);
  s = pastReveal(s);
  s = choose(s, "attack");
  assert.ok(
    s.log.some((l) =>
      /each enemy in the staging area makes an immediate attack/.test(l.text),
    ),
  );
  s = settle(s);
});

test("Shadows: the Men of Harad, Arrows Thick in the Air, Marching Up the Road and Hills of Ithilien", () => {
  const attacking = (s: GameState, code: string) => {
    const enemy = engaged(s, code);
    s.combat = {
      enemyId: enemy.id,
      attackPlayer: 0,
      defenderId: null,
      defenderIds: [],
      attackBonus: 0,
    };
    return enemy;
  };
  let s = base(1);
  attacking(s, JTC.captain);
  run(s, "shadowEffect", 0, { code: JTC.oliphaunt });
  assert.equal(s.combat!.attackBonus, 3);
  run(s, "shadowEffect", 0, { code: JTC.soldier });
  assert.equal(s.combat!.extraAttacks, 1);
  run(s, "shadowEffect", 0, { code: JTC.marching });
  assert.equal(s.combat!.attackBonus, 4);
  assert.equal(s.combat!.jtcGateOnKill, true);
  run(s, "shadowEffect", 0, { code: JTC.captain });
  assert.equal(s.combat!.jtcReturnOnKill, true);
  // Arrows Thick in the Air: under The Black Gate after this attack, or attack again.
  s = base(1);
  const enemy = attacking(s, JTC.man);
  run(s, "shadowEffect", 0, { code: JTC.arrows });
  assert.match(s.choice!.title, /^Arrows Thick in the Air · Choose one/);
  s = choose(s, "gate");
  assert.equal(s.combat!.jtcGateAfter, true);
  const effects = CROSS_ROADS_HOOKS.attackFinished!(s, s.combat!, false);
  assert.deepEqual(
    effects.map((e) => e.kind),
    ["jtcUnderGate"],
  );
  s.queue.push(...effects);
  flush(s);
  assert.deepEqual(s.crossRoads!.underBlackGate, [JTC.man]);
  assert.ok(!globalEngaged(s).some((u) => u.id === enemy.id));
  // Man of Harad: a random card; Hills of Ithilien: a non-objective attachment.
  s = base(1);
  hand(s, [GUARD]);
  attacking(s, JTC.captain);
  run(s, "shadowEffect", 0, { code: JTC.man });
  assert.equal(s.hand.length, 0);
  run(s, "shadowEffect", 0, { code: JTC.hills });
  assert.ok(
    s.log.some((l) =>
      /Hills of Ithilien: .* no non-objective attachment/.test(l.text),
    ),
  );
  // Public state and save restoration.
  const view = publicState(s) as unknown as {
    crossRoads: { underBlackGate: number; blackGateLimit: number };
  };
  assert.equal(view.crossRoads.blackGateLimit, 4);
  reload(s);
  assert.equal(firstPlayer(s), 0);
  assert.equal(playerOrder(s).length, 1);
  assert.ok(seatView(s, 0));
});
