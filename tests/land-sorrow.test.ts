import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canTravel,
  publicState,
  validateSave,
} from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  make,
  stageInfo,
  stats,
  threatOf,
} from "../src/game/core";
import {
  check,
  damage,
  engage,
  progress,
  progressLocation,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  LAND_SORROW_QUESTS,
  LAND_SORROW_RECIPES,
  SORROW as S,
  SORROW_CAMPS,
  SORROW_CAPTIVES,
  SORROW_WARDENS,
  sorrowQuestPoints,
} from "../src/game/land-sorrow-support";
import {
  LAND_SORROW_HOOKS as hooks,
  sorrowArcheryTotal,
} from "../src/game/land-sorrow";
import { base, start, choose, reload, settle } from "./land-sorrow-fixtures";
import type { GameState, Unit } from "../src/game/types";
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const effect = (s: GameState, kind: string, extra = {}) => {
  handle(s, fx(kind, extra));
  flush(s);
  return s;
};
/** Place one physical Camp with its guarded Captive and faceup Warden. */
function camp(s: GameState, code: string, captive: string, warden: string) {
  const u = staged(s, code),
    c = make(s, captive);
  u.attachments.push({ id: c.id, code: captive, exhausted: false });
  s.landSorrow!.camps.push({ location: u.id, code, warden: make(s, warden) });
  return u;
}
function freeCaptive(s: GameState, code: string, player = 0) {
  const u = make(s, code);
  u.controller = player;
  u.owner = player;
  forOwner(s, player, () => s.allies.push(u));
  s.landSorrow!.freed.push({ id: u.id, code });
  return u;
}
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`The Land of Sorrow ${players} players ${easy ? "easy" : "normal"}: native setup and exact inventory`, () => {
      const s = start(players, easy, 91, true, true);
      assert.equal(s.phase, "resource");
      const camps = s.staging.filter((u) => SORROW_CAMPS.includes(u.code));
      assert.equal(camps.length, 3);
      assert.equal(s.staging.length, 3 + players - 1);
      assert.deepEqual(
        camps.flatMap((u) => u.attachments.map((a) => a.code)).sort(),
        [...SORROW_CAPTIVES].sort(),
      );
      assert.deepEqual(
        s.landSorrow!.camps.map((c) => c.warden!.code).sort(),
        [...SORROW_WARDENS].sort(),
      );
      assert.equal(s.landSorrow!.setAside.length, 0);
      assert.equal(stageInfo(s).quest, 15);
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...s.staging.flatMap((u) => u.attachments.map((a) => a.code)),
        ...s.landSorrow!.camps.map((c) => c.warden!.code),
        ...LAND_SORROW_QUESTS.map((c) => c.code),
      ].sort();
      const r = LAND_SORROW_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      assert.deepEqual(
        physical,
        r.cards.flatMap((r) => Array<string>(r.quantity).fill(r.code)).sort(),
      );
      reload(s);
    });
test("Stage 1 needs all three Captives; stage 2 returns Wardens from the victory display and finds one enemy per other player", () => {
  let s = base(3);
  progress(s, 20);
  check(s);
  flush(s);
  assert.equal(s.stage, 1);
  assert.equal(s.progress, 20);
  for (const code of SORROW_CAPTIVES) freeCaptive(s, code);
  s.victoryCards = [S.ulwarth, S.barracks, S.lorgan];
  s.victory = 3;
  s.encounterDeck = [S.fields, S.slaver, S.tower, S.tower, S.raider];
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(stageInfo(s).side, "B");
  assert.deepEqual(s.victoryCards, [S.barracks]);
  assert.equal(s.victory, 1);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [S.ulwarth, S.lorgan, S.slaver, S.raider].sort(),
  );
  assert.deepEqual(s.encounterDiscard, [S.fields, S.tower, S.tower]);
  assert.equal(sorrowQuestPoints(s), 40);
  reload(s);
});
test("Stage 2 cannot be defeated while a Warden is in play, then the players win", () => {
  const s = base(2);
  Object.assign(s, { stage: 2 });
  s.landSorrow!.currentQuest = S.last;
  for (const code of SORROW_CAPTIVES) freeCaptive(s, code);
  const warden = staged(s, S.borlach);
  progress(s, 30);
  check(s);
  assert.equal(s.status, "playing");
  s.staging = s.staging.filter((u) => u.id !== warden.id);
  check(s);
  assert.equal(s.status, "won");
});
test("Camps are immune and blocked while a Warden is in play; travel and exploration free the guarded Captive", () => {
  let s = base(2);
  const barracks = camp(s, S.barracks, S.edrahil, S.ulwarth);
  check(s);
  assert.equal(barracks.immuneToPlayerEffects, true);
  s.phase = "travel";
  const blocker = staged(s, S.lorgan);
  assert.match(canTravel(s, barracks)!, /Warden/);
  s.staging = s.staging.filter((u) => u.id !== blocker.id);
  assert.equal(canTravel(s, barracks), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: barracks.id });
  s = settle(s);
  const ulwarth = s.staging.find((u) => u.code === S.ulwarth)!;
  assert.ok(ulwarth);
  assert.equal(ulwarth.roundCannotTakeDamage, true);
  assert.equal(s.landSorrow!.camps[0].warden, undefined);
  const active = get(s, barracks.id)!;
  progressLocation(s, active, 5);
  flush(s);
  const edrahil = allCharacters(s).find((u) => u.code === S.edrahil)!;
  assert.ok(edrahil);
  assert.equal(edrahil.controller, playerOrder(s)[0]);
  assert.ok(
    seatView(s, playerOrder(s)[0]).allies.some((u) => u.id === edrahil.id),
  );
  assert.ok(s.victoryCards?.includes(S.barracks));
  assert.deepEqual(
    s.landSorrow!.freed.map((f) => f.code),
    [S.edrahil],
  );
  assert.equal(s.landSorrow!.camps.length, 0);
  reload(s);
});
test("Storehouse Warden gets +3 attack and -30 engagement this round; Slave Quarters Warden engages the first player and attacks", () => {
  let s = base(2);
  const store = camp(s, S.storehouse, S.arador, S.borlach);
  s.staging = s.staging.filter((u) => u.id !== store.id);
  s.activeLocation = store;
  hooks.travelEntered!(s, store, true);
  flush(s);
  const borlach = s.staging.find((u) => u.code === S.borlach)!;
  assert.equal(stats(s, borlach).attack, 9);
  assert.equal(engagementCost(s, borlach), 3);
  s.round++;
  assert.equal(engagementCost(s, borlach), 33);
  s = base(2);
  const quarters = camp(s, S.quarters, S.farin, S.lorgan);
  s.staging = s.staging.filter((u) => u.id !== quarters.id);
  s.activeLocation = quarters;
  hooks.travelEntered!(s, quarters, true);
  flush(s);
  const first = playerOrder(s)[0];
  assert.ok(seatView(s, first).engaged.some((u) => u.code === S.lorgan));
  assert.equal(s.combat?.immediate, true);
});
test("A freed Captive leaving play loses the game; each Camp in staging raises threat at round end during stage 1", () => {
  const s = base(2);
  camp(s, S.barracks, S.edrahil, S.ulwarth);
  camp(s, S.quarters, S.farin, S.lorgan);
  const before = playerOrder(s).map((p) => seatView(s, p).threat);
  for (const e of hooks.roundEnd!(s)) handle(s, e);
  flush(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    before.map((t) => t + 2),
  );
  const arador = freeCaptive(s, S.arador);
  damage(s, arador.id, 5);
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Arador has left play/);
});
test("Nurn Slaver surges below one Camp per player; its shadow counts Camps in the victory display", () => {
  const s = base(2);
  camp(s, S.barracks, S.edrahil, S.ulwarth);
  assert.equal(hooks.revealedSurge!(s, S.slaver), true);
  camp(s, S.quarters, S.farin, S.lorgan);
  assert.equal(hooks.revealedSurge!(s, S.slaver), false);
  s.victoryCards = [S.storehouse];
  s.combat = { enemyId: "x", attackBonus: 0 } as GameState["combat"];
  hooks.shadow!(s, S.slaver);
  assert.equal(s.combat!.attackBonus, 1);
});
test("Archery totals Guards, Raiders, Recurve Bows and Watch Tower X; Easterling Guard assigns that total when revealed", () => {
  let s = base(2);
  const guard = staged(s, S.guard);
  staged(s, S.raider).attachments.push({
    id: "bow",
    code: S.bow,
    exhausted: false,
  });
  const tower = staged(s, S.tower);
  freeCaptive(s, S.edrahil);
  assert.equal(threatOf(s, tower), 2);
  assert.equal(sorrowArcheryTotal(s), 2 + 1 + 2 + 2);
  hooks.encounter!(s, S.guard);
  flush(s);
  for (let i = 0; i < 7 && s.choice; i++) {
    const least = [...s.choice.options].sort(
      (a, b) => (get(s, a.id)?.damage ?? 9) - (get(s, b.id)?.damage ?? 9),
    )[0];
    s = choose(s, least.id);
  }
  const dealt = allCharacters(s).reduce((n, u) => n + u.damage, 0);
  assert.equal(dealt, 7);
  assert.ok(guard);
});
test("Working Fields blocks healing in staging and its travel cost damages each player's character", () => {
  let s = base(2);
  const fields = staged(s, S.fields);
  assert.equal(hooks.cannotHeal!(s, s.heroes[0]), true);
  const effects = hooks.travelEffects!(s, fields)!;
  assert.equal(effects.length, 2);
  s.queue.push(...effects);
  flush(s);
  s = settle(s);
  for (const p of playerOrder(s))
    assert.equal(
      seatView(s, p).heroes.reduce((n, h) => n + h.damage, 0),
      1,
    );
});
test("Overseer's Whip attaches to the lowest engagement Easterling, strengthens Raiders and damages an exhausted character when it attacks", () => {
  let s = base();
  const raider = staged(s, S.raider),
    guard = staged(s, S.guard);
  hooks.encounter!(s, S.whip);
  flush(s);
  if (s.choice) s = choose(s, s.choice.options[0].id);
  const host = get(s, raider.id)!;
  assert.ok(host.attachments.some((a) => a.code === S.whip));
  assert.equal(get(s, guard.id)!.attachments.length, 0);
  assert.equal(stats(s, host).attack, 3);
  assert.equal(s.landSorrow!.resolving.length, 0);
  s.heroes[1].exhausted = true;
  s.combat = {
    enemyId: host.id,
    attackPlayer: 0,
    attackBonus: 0,
  } as GameState["combat"];
  hooks.enemyAttackStarted!(s, host, 0);
  flush(s);
  s = settle(s);
  assert.equal(s.heroes[1].damage, 1);
});
test("Cruelty of Mordor damages, then each player picks damage or threat; its shadow adds defense this phase", () => {
  let s = base();
  hooks.encounter!(s, S.cruelty);
  flush(s);
  s = choose(s, s.heroes[0].id);
  assert.match(s.choice!.title, /punishment/);
  const threat = s.threat;
  s = choose(s, "threat");
  assert.equal(s.threat, threat + 1);
  assert.ok(s.encounterDiscard.includes(S.cruelty));
  const enemy = staged(s, S.raider);
  s.combat = { enemyId: enemy.id, attackBonus: 0 } as GameState["combat"];
  hooks.shadow!(s, S.cruelty);
  assert.equal(stats(s, enemy).defense, 4);
});
test("Broken Captives exhausts damaged characters, otherwise gains surge and doomed 1; its shadow makes Wardens attack again", () => {
  let s = base();
  s.heroes[0].damage = 1;
  hooks.encounter!(s, S.broken);
  flush(s);
  assert.equal(s.heroes[0].exhausted, true);
  s = base();
  const threat = s.threat;
  s.encounterDeck = [S.plains];
  hooks.encounter!(s, S.broken);
  flush(s);
  s = settle(s);
  assert.equal(s.threat, threat + 1);
  const warden = staged(s, S.ulwarth);
  s.combat = { enemyId: warden.id, attackBonus: 0 } as GameState["combat"];
  hooks.shadow!(s, S.broken);
  assert.equal(s.combat!.extraAttacks, 1);
});
test("Wardens accept attackers and defenders only from their engaged player; Ulwarth also refuses allies", () => {
  const s = base(2);
  const [p0, p1] = playerOrder(s);
  const ulwarth = make(s, S.ulwarth),
    lorgan = make(s, S.lorgan);
  forOwner(s, p0, () => {
    engage(s, ulwarth);
    engage(s, lorgan);
  });
  const own = seatView(s, p0).heroes[0],
    other = seatView(s, p1).heroes[0];
  const ally = freeCaptive(s, S.arador, p0);
  assert.equal(hooks.cannotAttack!(s, own, lorgan), false);
  assert.equal(hooks.cannotAttack!(s, other, lorgan), true);
  assert.equal(hooks.cannotDefend!(s, lorgan, other), true);
  assert.equal(hooks.cannotDefend!(s, ulwarth, ally), true);
  assert.equal(hooks.cannotAttack!(s, ally, ulwarth), true);
  const staging = staged(s, S.borlach);
  assert.equal(hooks.cannotAttack!(s, own, staging), true);
});
test("Lorgan raises threat after attacking (2 after a kill); Borlach's excess damage is assigned among the defender's characters", () => {
  let s = base();
  const threat = s.threat;
  const c = {
    enemyId: "x",
    attackPlayer: 0,
    attackBonus: 0,
    attackResolved: true,
    sorrowEnemy: S.lorgan,
    sorrowKilled: true,
  } as unknown as NonNullable<GameState["combat"]>;
  for (const e of hooks.attackFinished!(s, c)) handle(s, e);
  flush(s);
  assert.equal(s.threat, threat + 2);
  const b = {
    ...c,
    sorrowEnemy: S.borlach,
    sorrowExcess: 2,
  } as NonNullable<GameState["combat"]>;
  for (const e of hooks.attackFinished!(s, b)) handle(s, e);
  flush(s);
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
});
test("Captive responses: Edrahil draws, Arador readies once per round, Farin damages an engaged enemy", () => {
  let s = base(2);
  const edrahil = freeCaptive(s, S.edrahil),
    arador = freeCaptive(s, S.arador),
    farin = freeCaptive(s, S.farin);
  edrahil.committed = true;
  hooks.questSucceeded!(s, 1);
  flush(s);
  const hand = seatView(s, 1).hand.length;
  s = choose(s, "draw-1");
  assert.equal(seatView(s, 1).hand.length, hand + 1);
  const a = get(s, arador.id)!;
  a.exhausted = true;
  for (const e of hooks.defendersDeclared!(s, a, [a])) handle(s, e);
  flush(s);
  s = choose(s, "ready");
  assert.equal(get(s, arador.id)!.exhausted, false);
  get(s, arador.id)!.exhausted = true;
  for (const e of hooks.defendersDeclared!(s, a, [get(s, arador.id)!]))
    handle(s, e);
  flush(s);
  assert.equal(s.choice, null);
  const enemy = make(s, S.raider);
  forOwner(s, 1, () => engage(s, enemy));
  for (const e of hooks.attackersDeclared!(s, enemy, [farin.id])) handle(s, e);
  flush(s);
  s = choose(s, enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 1);
});
test("Lead the Revolt makes each committing player not engaged with a Warden reveal an encounter card", () => {
  const s = base(2);
  Object.assign(s, { stage: 2 });
  s.landSorrow!.currentQuest = S.last;
  const [p0, p1] = playerOrder(s);
  forOwner(s, p0, () => (s.heroes[0].committed = true));
  forOwner(s, p1, () => {
    s.heroes[0].committed = true;
    engage(s, make(s, S.ulwarth));
  });
  hooks.committed!(s);
  const reveals = s.queue.filter((e) => e.kind === "reveal");
  assert.equal(reveals.length, 1);
  assert.equal(reveals[0].player, p0);
});
test("Rolling Plains and Weary Lands bonuses last for the phase; Rocky Outcrop needs a ready hero", () => {
  const s = base();
  const plains = staged(s, S.plains);
  s.phase = "quest";
  hooks.encounter!(s, S.plains);
  hooks.encounter!(s, S.weary);
  assert.equal(threatOf(s, plains), 4);
  s.heroes[0].exhausted = true;
  assert.equal(
    stats(s, s.heroes[0]).will,
    card(s.heroes[0].code).willpower! - 1,
  );
  s.phase = "travel";
  assert.equal(threatOf(s, plains), 2);
  const outcrop = staged(s, S.outcrop);
  for (const h of s.heroes) h.exhausted = true;
  assert.match(hooks.travelProblem!(s, outcrop)!, /ready hero/);
});
test("Malformed Land of Sorrow saves are rejected and public state shows faceup Wardens", () => {
  const s = base();
  camp(s, S.barracks, S.edrahil, S.ulwarth);
  const pub = publicState(s) as {
    landSorrow?: { camps: { warden: string }[] };
  };
  assert.equal(pub.landSorrow!.camps[0].warden, S.ulwarth);
  for (const mutate of [
    (x: GameState) => (x.landSorrow!.currentQuest = S.last),
    (x: GameState) => (x.landSorrow!.camps[0].code = S.raider),
    (x: GameState) => x.landSorrow!.freed.push({ id: "z", code: S.raider }),
    (x: GameState) => (x.landSorrow!.noReady = [{ id: "y", round: 99 }]),
  ]) {
    const raw = JSON.parse(JSON.stringify(s));
    mutate(raw);
    assert.equal(validateSave(raw), false);
  }
  const unit: Unit | undefined = s.staging[0];
  assert.ok(unit);
  selectSeat(s, 0);
  reload(s);
});
