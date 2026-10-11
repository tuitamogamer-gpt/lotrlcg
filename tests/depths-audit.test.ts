import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import {
  fx,
  get,
  make,
  stats,
  stagingThreat,
  threatOf,
} from "../src/game/core";
import {
  check,
  damage,
  destroy,
  engage,
  progress,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { publicState } from "../src/game/actions";
import {
  allCharacters,
  allEngaged,
  forOwner,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  DEPTHS as D,
  DEPTHS_CORSAIR_RAIDERS,
  depthsGrappledWith,
  depthsState,
} from "../src/game/depths-support";
import { base, choose, reload } from "./against-shadow-final-fixtures";
import { base as depthsBase } from "./depths-fixtures";
import type { GameState } from "../src/game/types";

function settle(s: GameState) {
  flush(s);
  for (let n = 0; s.choice && s.status === "playing"; n++) {
    assert.ok(n < 100, "printed Depths choices terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}

function third(players = 1) {
  let s = base("the-thing-in-the-depths", players);
  (s.victoryCards ??= []).push(D.helm);
  progress(s, 4);
  s = settle(s);
  assert.equal(
    s.stage,
    3,
    "real main-quest progress performs the complete printed transition",
  );
  assert.equal(depthsState(s)!.currentQuest, D.defend);
  // Isolate later clauses after the real transition and its initial discard/Grapple instruction.
  s.staging = s.staging.filter((u) => u.code === D.thing);
  s.encounterDeck = [D.cargo, D.cargo, D.cargo];
  s.encounterDiscard = [];
  s.queue = [];
  s.choice = null;
  return reload(s);
}

function boss(s: GameState) {
  const u = s.staging.find((u) => u.code === D.thing);
  assert.ok(u);
  return u;
}

function staged(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}

test("Depths audit: Grapple chooses printed threat, counts only +2 host threat, and keeps facedown identity private", () => {
  let s = third();
  const highPrinted = staged(s, D.quarter),
    highCurrent = staged(s, D.crew);
  highCurrent.tempThreat = 20;
  const before = stagingThreat(s);
  revealed(s, D.grasping);
  s = settle(s);
  const arm = depthsGrappledWith(s, highPrinted.id)[0];
  assert.ok(
    arm,
    "Quarter Deck has printed 4, while Crew Quarters has printed 1",
  );
  assert.equal(depthsGrappledWith(s, highCurrent.id).length, 0);
  assert.equal(threatOf(s, get(s, highPrinted.id)!), 6);
  assert.equal(
    stagingThreat(s),
    before + 2,
    "the arm's printed threat is never added separately",
  );
  assert.ok(!s.staging.some((u) => u.id === arm.id));
  assert.ok(
    !JSON.stringify((publicState(s) as any).depths).includes(D.grasping),
  );
  damage(s, arm.id, 99);
  destroy(s, arm, false, "discard", true);
  engage(s, arm, true);
  assert.equal(depthsGrappledWith(s, highPrinted.id)[0].id, arm.id);
  assert.equal(arm.damage, 0);
  assert.ok(!s.encounterDiscard.includes(D.grasping));
  assert.ok(!allEngaged(s).some((u) => u.id === arm.id));
  reload(s);
});

test("Depths audit: Giant Arm selects the lowest printed quest points among staged Ship locations", () => {
  let s = third();
  const cargo = staged(s, D.cargo),
    crew = staged(s, D.crew),
    quarter = staged(s, D.quarter);
  revealed(s, D.giant);
  s = settle(s);
  assert.equal(depthsGrappledWith(s, cargo.id).length, 1);
  assert.equal(depthsGrappledWith(s, crew.id).length, 0);
  assert.equal(depthsGrappledWith(s, quarter.id).length, 0);
  reload(s);
});

test("Depths audit: destroying a trapped Creature uses its last known current threat; discarding it does not", () => {
  let s = third();
  const thing = boss(s),
    arm = staged(s, D.thrashing);
  arm.attachments.push({
    id: `a${s.nextId++}`,
    code: "05017",
    exhausted: false,
    owner: 0,
  });
  assert.equal(threatOf(s, arm), 1);
  arm.damage = 1;
  engage(s, arm);
  s.phase = "attack";
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: arm.id,
    attackerIds: s.heroes.map((u) => u.id),
  });
  s = settle(s);
  assert.equal(get(s, thing.id)!.damage, 1);
  assert.ok(s.discard.includes("05017"));
  const eye = staged(s, D.eye);
  destroy(s, eye, false);
  flush(s);
  assert.equal(get(s, thing.id)!.damage, 1, "discard is not destruction");
  reload(s);
});

test("Depths audit: the boss's Creature-destruction Forced effect resolves before Secret Vigil's optional Response", () => {
  let s = third();
  const thing = boss(s),
    arm = staged(s, D.thrashing);
  thing.damage = stats(s, thing).health - 1;
  arm.attachments.push({
    id: `a${s.nextId++}`,
    code: "09012",
    exhausted: false,
    owner: 0,
  });
  assert.equal(threatOf(s, arm), 2);
  arm.damage = 1;
  engage(s, arm);
  s.phase = "attack";
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: arm.id,
    attackerIds: s.heroes.map((u) => u.id),
  });
  assert.equal(
    s.status,
    "won",
    `the boss's Forced damage wins before optional destruction Responses can be offered; pending choice: ${s.choice?.title ?? "none"}`,
  );
  assert.equal(s.choice, null);
  assert.ok(!get(s, arm.id));
  assert.ok(!get(s, thing.id));
  assert.ok(s.discard.includes("09012"));
  assert.equal(
    s.threat,
    20,
    "Secret Vigil did not reduce threat before victory",
  );
  reload(s);
});

test("Depths audit: replacement travel detaches the same Crushing Arm and attacks the current first player", () => {
  let s = third(2);
  const previous = make(s, D.crew),
    destination = staged(s, D.cargo);
  previous.progress = 1;
  s.activeLocation = previous;
  s.table!.first = 1;
  s.table!.turn = 1;
  selectSeat(s, 1);
  revealed(s, D.crushing);
  s = settle(s);
  const armId = depthsGrappledWith(s, destination.id)[0].id;
  s.encounterDeck = [D.cargo];
  s.phase = "travel";
  assert.equal(canTravel(s, get(s, destination.id)!), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: destination.id });
  assert.equal(s.activeLocation?.id, destination.id);
  assert.equal(s.staging.find((u) => u.id === previous.id)?.progress, 1);
  assert.equal(depthsGrappledWith(s, destination.id).length, 0);
  assert.ok(s.staging.some((u) => u.id === armId && u.code === D.crushing));
  assert.equal(s.combat?.enemyId, armId);
  assert.equal(s.combat?.attackPlayer, 1);
  assert.equal(s.table!.active, 1);
  assert.ok(
    s.choice!.options.every((o) => o.effects.every((e) => e.player === 1)),
  );
  const defender = seatView(s, 1).heroes[0];
  s = choose(reload(s), defender.id);
  s = settle(s);
  assert.equal(
    get(s, defender.id)!.damage,
    Math.max(0, 3 - stats(s, get(s, defender.id)!).defense),
  );
  assert.ok(seatView(s, 0).heroes.every((u) => u.damage === 0));
  assert.equal(s.activeLocation?.id, destination.id);
  assert.equal(s.staging.find((u) => u.id === previous.id)?.progress, 1);
  assert.equal(depthsState(s)!.travelUsed, true);
  assert.ok(
    canTravel(
      s,
      s.staging.find((u) => u.id === previous.id)!,
    ),
  );
  assert.throws(
    () => applyAction(reload(s), { type: "TRAVEL", id: previous.id }),
    /Travel|travel/,
  );
  reload(s);
});

test("Depths audit: each remote Eye triggers a boss attack with a fresh shadow and never attacks itself", () => {
  let s = third(2);
  const thing = boss(s),
    firstEye = staged(s, D.eye),
    secondEye = staged(s, D.eye);
  engage(s, firstEye);
  forOwner(s, 1, () => engage(s, secondEye));
  const defenders = [seatView(s, 0).heroes[0], seatView(s, 1).heroes[0]];
  defenders.forEach((u, player) =>
    u.attachments.push({
      id: `a${s.nextId++}`,
      code: "01039",
      exhausted: false,
      owner: player,
    }),
  );
  s.activeLocation = make(s, D.quarter);
  const quarterId = s.activeLocation.id;
  // Quarter deals the first three cards to the boss and the two Eyes.
  // Its old boss shadow must not replace the fresh shadow for an additional attack (FAQ 1.42).
  s.encounterDeck = [D.quarter, ...Array(7).fill(D.cargo)];
  s.phase = "encounter";
  handle(s, fx("startCombat"));
  flush(s);
  for (const player of [0, 1]) {
    assert.equal(s.combat?.enemyId, thing.id);
    assert.equal(s.combat?.attackPlayer, player);
    assert.deepEqual(get(s, thing.id)!.shadows, [D.cargo]);
    assert.equal(
      s.encounterDiscard.filter((code) => code === D.quarter).length,
      1,
      "the boss's previously dealt Quarter shadow was discarded before its additional attack",
    );
    assert.equal(s.activeLocation?.id, quarterId);
    assert.ok(
      ![s.combat!, ...s.suspendedCombats].some((combat) =>
        combat.immediatePreviousShadows?.includes(D.quarter),
      ),
      "the discarded physical Quarter copy is not also held for restoration",
    );
    assert.equal(
      s.encounterDeck.filter((code) => code === D.quarter).length,
      0,
    );
    s = choose(reload(s), defenders[player].id);
  }
  assert.equal(s.combat, null);
  assert.equal(s.activeLocation?.id, quarterId);
  assert.equal(
    s.encounterDiscard.filter((code) => code === D.quarter).length,
    1,
    "both attacks preserve exactly the active Quarter and the discarded Quarter shadow",
  );
  for (const defender of defenders) {
    const current = get(s, defender.id)!;
    assert.equal(current.damage, 5 - stats(s, current).defense);
    assert.ok(current.attachments.some((a) => a.code === "01039"));
  }
  assert.ok(
    allEngaged(s)
      .filter((u) => u.code === D.eye)
      .every((u) => !u.attacked),
  );
  assert.ok(!allEngaged(s).some((u) => u.id === thing.id));
  reload(s);
});

test("Depths audit: repeated Giant Arm shadows wait until damage, save safely, and consume both exact shadow copies", () => {
  let s = third();
  const host = staged(s, D.cargo),
    attacker = staged(s, D.thrashing),
    defender = s.heroes[0];
  engage(s, attacker);
  attacker.shadows = [D.giant, D.giant];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: attacker.id,
    defenderId: defender.id,
  });
  assert.match(s.choice?.title ?? "", /next after-attack/);
  assert.equal(
    get(s, defender.id)!.damage,
    5 - stats(s, get(s, defender.id)!).defense,
  );
  const pending = depthsState(s)!.pendingEnemies.map((u) => u.id);
  assert.equal(pending.length, 2);
  assert.equal(new Set(pending).size, 2);
  assert.ok(pending.every((id) => id !== attacker.id));
  assert.deepEqual(get(s, attacker.id)!.shadows, []);
  assert.equal(s.choice!.options.length, 2);
  assert.ok(s.choice!.options.every((o) => o.code === D.giant));
  const secondFirst = s.choice!.options.find(
    (o) => o.effects[0].target === pending[1],
  )!;
  s = choose(reload(s), secondFirst.id);
  assert.match(s.choice?.title ?? "", /Giant Arm.*After this attack/);
  s = choose(reload(s), "grapple");
  assert.equal(
    depthsGrappledWith(s, host.id)[0].id,
    pending[1],
    "the first player can reverse the two already-created delayed instructions",
  );
  assert.match(s.choice?.title ?? "", /Giant Arm.*After this attack/);
  s = choose(reload(s), "grapple");
  s = settle(s);
  assert.deepEqual(
    depthsGrappledWith(s, host.id)
      .map((u) => u.id)
      .sort(),
    pending.sort(),
  );
  assert.equal(s.encounterDiscard.filter((c) => c === D.giant).length, 0);
  assert.ok(
    allEngaged(s).some((u) => u.id === attacker.id && u.code === D.thrashing),
  );
  reload(s);
});

test("Depths audit: repeated undefended Grasping shadows preserve the later Forecastle shadow and physical copies", () => {
  let s = third();
  const host = staged(s, D.cargo),
    attacker = staged(s, "01096"),
    recipient = s.heroes[0];
  engage(s, attacker);
  attacker.shadows = [D.grasping, D.grasping, D.forecastle];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: attacker.id,
    defenderIds: [],
  });
  assert.ok(
    s.choice,
    "undefended damage still asks for its real hero recipient",
  );
  assert.equal(
    s.combat?.attackBonus,
    1,
    "the later Forecastle shadow resolves once; an undefended attack has no defending character",
  );
  assert.deepEqual(get(s, attacker.id)!.shadows, [D.forecastle]);
  const attached = depthsGrappledWith(s, host.id);
  assert.equal(attached.length, 2);
  assert.equal(new Set(attached.map((u) => u.id)).size, 2);
  assert.ok(
    attached.every((u) => u.id !== attacker.id && u.code === D.grasping),
  );
  s = choose(reload(s), recipient.id);
  s = settle(s);
  assert.equal(
    get(s, recipient.id)!.damage,
    4,
    "Forest Spider's engagement bonus remains part of the actual undefended attack",
  );
  assert.equal(
    s.encounterDiscard.filter((code) => code === D.grasping).length,
    0,
  );
  reload(s);
});

test("Depths audit: the recovered Forecastle shadow checks resources on heroes and objective allies", () => {
  for (const objective of [false, true])
    for (const resources of [0, 1]) {
      let s = third();
      const defender = objective
          ? s.allies.find((u) => u.code === D.sahirAlly)!
          : s.heroes[0],
        attacker = staged(s, "01096");
      defender.resources = resources;
      engage(s, attacker);
      const beforeShadowAttack = stats(s, attacker).attack;
      attacker.shadows = [D.forecastle];
      s.phase = "defense";
      s = applyAction(reload(s), {
        type: "DEFEND",
        enemyId: attacker.id,
        defenderId: defender.id,
      });
      s = settle(s);
      assert.equal(
        get(s, defender.id)!.damage,
        beforeShadowAttack +
          (resources === 0 ? 2 : 1) -
          stats(s, get(s, defender.id)!).defense,
      );
      reload(s);
    }
});

test("Depths audit: controller elimination loses immediately when a required objective ally leaves play", () => {
  const s = third(2);
  assert.ok(allCharacters(s).some((u) => u.code === D.sahirAlly));
  forOwner(s, 0, () => {
    s.threat = 50;
  });
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Sahír|leaves play/);
  reload(s);
});

test("Depths audit: middle-seat elimination leaves both Elite allies in play and recalculates the boss's continuous health", () => {
  const s = third(3),
    thing = boss(s);
  assert.equal(stats(s, thing).health, 17);
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.ok(allCharacters(s).some((u) => u.code === D.sahirAlly));
  assert.ok(allCharacters(s).some((u) => u.code === D.naasiyahAlly));
  assert.equal(stats(s, thing).health, 14);
  reload(s);
});

test("Depths audit: middle-seat elimination immediately destroys a boss whose recalculated health is below its damage", () => {
  const s = third(3),
    thing = boss(s);
  thing.damage = 15;
  assert.equal(stats(s, thing).health, 17);
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  check(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.ok(allCharacters(s).some((u) => u.code === D.sahirAlly));
  assert.ok(allCharacters(s).some((u) => u.code === D.naasiyahAlly));
  assert.equal(
    s.status,
    "won",
    "the same elimination action must finish the scenario when continuous boss health falls below damage",
  );
  assert.ok(!get(s, thing.id));
  reload(s);
});

test("Depths audit: an indestructible Captain at lethal damage never blocks a later fellowship elimination", () => {
  let s = depthsBase(2);
  const helm = s.staging.find((u) => u.code === D.helm)!;
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: helm.id });
  s = settle(s);
  const captain = s.staging.find((u) => u.code === D.sahir)!;
  assert.ok(
    captain,
    "actual Helm travel brings the reserved Captain into staging",
  );
  engage(s, captain);
  damage(s, captain.id, 99);
  assert.ok(
    get(s, captain.id),
    "the quest's printed indestructible effect keeps the physical enemy in play",
  );
  assert.ok(captain.damage >= stats(s, captain).health);
  forOwner(s, 0, () => {
    s.threat = 50;
  });
  check(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(
    s.status,
    "playing",
    "the other fellowship remains in the stage-one game",
  );
  assert.ok(s.staging.some((u) => u.id === captain.id));
  reload(s);
});

test("Depths audit: saves reject malformed boosts and a grappled enemy duplicated into a public zone", () => {
  let s = third();
  const host = staged(s, D.cargo);
  revealed(s, D.grasping);
  s = settle(s);
  const valid = reload(s);
  assert.ok(depthsGrappledWith(valid, host.id).length);
  const duplicate = JSON.parse(JSON.stringify(valid)) as GameState;
  duplicate.staging.push(duplicate.depths!.grappled[0].enemy);
  assert.equal(validateSave(duplicate), false);
  const malformed = JSON.parse(JSON.stringify(valid)) as GameState;
  malformed.depths!.combatBoosts.push({
    characterId: "forged",
    enemyId: "forged",
    playerAttack: true,
    attack: -2,
    defense: 0,
  });
  assert.equal(validateSave(malformed), false);
  const invalidHost = JSON.parse(JSON.stringify(valid)) as GameState;
  invalidHost.depths!.grappled[0].locationId = boss(invalidHost).id;
  assert.equal(validateSave(invalidHost), false);
});

test("Depths audit: a Ship at exactly nine total threat loses at end of round", () => {
  let s = third();
  const ship = staged(s, D.crew);
  s.activeLocation = make(s, D.quarter);
  for (let n = 0; n < 4; n++) {
    revealed(s, D.grasping);
    s = settle(s);
  }
  assert.equal(depthsGrappledWith(s, ship.id).length, 4);
  assert.equal(threatOf(s, get(s, ship.id)!), 9);
  assert.equal(
    s.status,
    "playing",
    "the printed loss is not an immediate state check",
  );
  s.phase = "refresh";
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Stormcaller|Ship|threat/i);
  assert.ok(validateSave(s));
});

test("Depths audit: stage-two removes Raider identities from hidden shadows and flips the same Elite cards", () => {
  let s = base("the-thing-in-the-depths", 2);
  const q = depthsState(s)!,
    elites = q.setAside.filter((u) => [D.sahir, D.naasiyah].includes(u.code)),
    host = staged(s, D.cargo),
    remote = make(s, D.raider);
  assert.equal(elites.length, 2);
  const backs = new Map(elites.map((u) => [u.id, `${u.code}:B`]));
  for (const u of elites) {
    u.resources = 5;
    u.damage = 1;
    u.progress = 2;
  }
  remote.attachments.push({
    id: `a${s.nextId++}`,
    code: "01069",
    exhausted: false,
    owner: 1,
  });
  remote.shadows = [D.hardened, D.crew];
  forOwner(s, 1, () => s.engaged.push(remote));
  s.encounterDeck = [D.raider, D.infiltrator, D.leader, D.hardened, D.cargo];
  s.encounterDiscard = [D.raider, D.crew];
  (s.victoryCards ??= []).push(D.helm);
  progress(s, 4);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.ok(get(s, host.id), "The Stormcaller location survives the purge");
  for (const u of elites) {
    const ally = allCharacters(s).find((a) => a.id === u.id)!;
    assert.ok(ally, "flipping preserves physical Elite identity");
    assert.equal(ally.code, backs.get(u.id));
    assert.equal(ally.resources, 0);
    assert.equal(ally.damage, 0);
    assert.equal(ally.progress, 0);
  }
  const publicZones = [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...s.staging.map((u) => u.code),
    ...allEngaged(s).flatMap((u) => [u.code, ...u.shadows]),
  ];
  assert.ok(
    publicZones.every((code) => !DEPTHS_CORSAIR_RAIDERS.includes(code)),
  );
  assert.ok(seatView(s, 1).discard.includes("01069"));
  reload(s);
});
