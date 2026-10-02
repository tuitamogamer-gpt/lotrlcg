import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction as act,
  createGame,
  availableAbilities,
  validateSave,
  restoreSave,
  playTargets,
} from "../src/game/engine";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  advanceQuest,
  check,
  charactersCommitted,
  damage,
  discardCharacter,
  engage,
  progress,
  progressLocation,
  resolveReveal,
  shadow,
  spendEvent,
} from "../src/game/board";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import { playerAttack } from "../src/game/combat";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  engagedEnemies,
  consideredEngaged,
  normalAttackPending,
  markEnemyAttack,
  resetEnemyAttacks,
  prepareEnemyShadows,
  beginConsideredEnemyShadows,
  finishEnemyShadows,
} from "../src/game/considered-engagement";
import {
  SHADOW_FLAME as S,
  SHADOW_FLAME_ENCOUNTERS,
  SHADOW_FLAME_QUESTS,
  shadowFlameEngagedPlayers,
  shadowFlameAttackBonus,
  shadowFlameCanMove,
  shadowFlameEventCancelled,
  shadowFlameAbilityProblem,
  shadowFlameAbility,
  shadowFlameCharactersCommitted,
  shadowFlameQuestEnd,
  shadowFlameRoundEnd,
  shadowFlameLocationProgressBlocked,
} from "../src/game/shadow-flame";
import { EMYN } from "../src/game/emyn-muil";
import { KHAZAD } from "../src/game/khazad-dum";
import { CARROCK } from "../src/game/carrock";
import {
  attachToQuest,
  currentQuestCode,
  currentQuestUnit,
} from "../src/game/quest-state";
import recipes from "../public/scenarios.json";
import type { GameState, Unit } from "../src/game/types";
const leadership = STARTERS[0];
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function settle(s: GameState) {
  for (let i = 0; i < 500 && s.status === "playing"; i++) {
    if (s.choice)
      s = choose(
        s,
        s.choice.options.find((o) => ["skip", "resolve", "done"].includes(o.id))
          ?.id ?? s.choice.options[0].id,
      );
    else if (s.phase === "setup") s = act(s, { type: "KEEP" });
    else break;
  }
  return s;
}
function start(players = 1, easy = false, seed = 1) {
  return createGame(seed, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "shadow-and-flame",
    easy,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
}
function base(players = 1) {
  const s = settle(start(players));
  Object.assign(s, {
    status: "playing",
    phase: "planning",
    stage: 1,
    stageRevealing: false,
    progress: 0,
    queue: [],
    choice: null,
    activeLocation: null,
    extraActiveLocations: [],
    staging: [],
    encounterDeck: Array(20).fill(S.deep),
    encounterDiscard: [],
    shadowFlame: { roundAttackBonus: 0 },
    combat: null,
    suspendedCombats: [],
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.hand = [];
      s.allies = [];
      s.engaged = [];
      s.used = [];
      s.committedIds = [];
      for (const h of s.heroes)
        Object.assign(h, {
          resources: 10,
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
          tempAttack: 0,
          tempDefense: 0,
          tempWill: 0,
        });
    });
  selectSeat(s, s.table?.first ?? 0);
  s.staging = [make(s, S.bane)];
  syncSeat(s);
  return s;
}
const balrog = (s: GameState) => s.staging.find((u) => u.code === S.bane)!;
function attach(s: GameState, u: Unit, code: string, owner?: number) {
  const a = {
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    ...(owner === undefined ? {} : { owner }),
  };
  u.attachments.push(a);
  return a;
}
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  if (
    s.choice?.options.some((o) => o.id === "resolve") &&
    s.choice.title.includes("When")
  )
    s = choose(s, "resolve");
  return s;
}
function saved(s: GameState) {
  assert.ok(validateSave(s));
  const r = restoreSave(JSON.parse(JSON.stringify(s)));
  assert.ok(r);
  return r!;
}
function startCombat(s: GameState) {
  handle(s, fx("startCombat"));
  flush(s);
  return s;
}
function physical(s: GameState) {
  return [
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...s.staging.map((u) => u.code),
    ...allEngaged(s).map((u) => u.code),
    ...allActiveLocations(s).map((u) => u.code),
    ...allCharacters(s).flatMap((u) =>
      u.attachments
        .filter((a) => card(a.code).sphere_code === "encounter")
        .map((a) => a.code),
    ),
    ...s.staging.flatMap((u) =>
      u.attachments
        .filter((a) => card(a.code).sphere_code === "encounter")
        .map((a) => a.code),
    ),
    ...s.removed,
    S.pit,
  ];
}

test("Shadow and Flame imports thirteen exact designs, three double-sided quests and every physical easy quantity", () => {
  assert.equal(SHADOW_FLAME_ENCOUNTERS.length, 13);
  assert.equal(SHADOW_FLAME_QUESTS.length, 3);
  for (const c of [...SHADOW_FLAME_ENCOUNTERS, ...SHADOW_FLAME_QUESTS])
    assert.ok(SCRIPTED.has(c.code), c.name);
  for (const q of SHADOW_FLAME_QUESTS) {
    assert.ok(q.back_imagesrc);
    assert.ok(q.back_text);
  }
  const easy = recipes.find((r) => r.id === "E02.9")!;
  for (const c of SHADOW_FLAME_ENCOUNTERS)
    assert.equal(
      c.easy_quantity,
      easy.cards.find((x) => x.code === c.code)?.quantity ?? 0,
      c.name,
    );
});
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`${players}-player ${easy ? "easy" : "normal"} Shadow setup places a single Bane, sets every threat to zero and reveals players minus one complete cards`, () => {
      const s = settle(start(players, easy));
      assert.equal(s.staging.filter((u) => u.code === S.bane).length, 1);
      assert.ok(
        !physical(s)
          .filter((c) => c === S.bane)
          .slice(1).length,
      );
      assert.ok(!s.encounterDeck.includes(S.pit));
      assert.equal(physical(s).length, easy ? 42 : 56);
      for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 0);
      assert.equal(s.stageRevealing, false);
      assert.equal(s.choice, null);
    });
test("considered engagement keeps one physical staging Bane and includes only living players at threat one or higher", () => {
  const s = base(3),
    b = balrog(s);
  forOwner(s, 1, () => (s.threat = 0));
  assert.deepEqual(shadowFlameEngagedPlayers(s, b), [0, 2]);
  assert.equal(consideredEngaged(s, b, 1), false);
  assert.ok(engagedEnemies(s, 2).includes(b));
  assert.equal(allEngaged(s).length, 0);
  assert.equal(threatOf(s, b), 4);
  assert.equal(shadowFlameCanMove(s, b), false);
  engage(s, b);
  assert.equal(s.staging[0].id, b.id);
  assert.equal(s.engaged.length, 0);
});
test("normal enemy attack ledger is distinct from player attacks and records a finished Bane attack even if threat fell to zero", () => {
  const s = base(2),
    b = balrog(s);
  assert.equal(normalAttackPending(s, b, 0), true);
  b.attackedBy = [0];
  assert.equal(normalAttackPending(s, b, 0), true);
  forOwner(s, 0, () => (s.threat = 0));
  markEnemyAttack(s, b, 0);
  forOwner(s, 0, () => (s.threat = 1));
  assert.equal(normalAttackPending(s, b, 0), false);
  assert.equal(normalAttackPending(s, b, 1), true);
  assert.deepEqual(b.attackedBy, [0]);
  resetEnemyAttacks(b);
  assert.equal(normalAttackPending(s, b, 0), true);
});
test("Bane skips framework shadow dealing and gets a fresh physical shadow for each actual attack", () => {
  const s = base(),
    b = balrog(s);
  s.encounterDeck = [S.flame, S.lash];
  prepareEnemyShadows(s, b);
  assert.deepEqual(s.encounterDeck, [S.flame, S.lash]);
  assert.deepEqual(b.shadows, []);
  assert.equal(beginConsideredEnemyShadows(s, b), true);
  assert.deepEqual(b.shadows, [S.flame]);
  b.shadowCancelsDamage = true;
  finishEnemyShadows(s, b);
  assert.deepEqual(s.encounterDiscard, [S.flame]);
  assert.equal(b.shadowCancelsDamage, undefined);
  beginConsideredEnemyShadows(s, b);
  assert.deepEqual(b.shadows, [S.lash]);
  finishEnemyShadows(s, b);
  assert.deepEqual(s.encounterDiscard, [S.flame, S.lash]);
});
test("a fresh normal Bane attack discards old physical shadows instead of silently losing them", () => {
  const s = base(),
    b = balrog(s);
  b.shadows = [S.flame];
  s.encounterDeck = [S.deep];
  beginConsideredEnemyShadows(s, b);
  assert.deepEqual(b.shadows, [S.deep]);
  assert.deepEqual(s.encounterDiscard, [S.flame]);
});
for (const players of [2, 3, 4])
  test(`normal combat gives one fresh Bane shadow per actual attack across ${players} fellowships`, () => {
    let s = base(players);
    for (const p of playerOrder(s))
      forOwner(s, p, () => {
        for (const h of s.heroes) h.tempDefense = 10;
      });
    const physicalId = balrog(s).id;
    s.encounterDeck = Array(players).fill(S.deep);
    s = startCombat(s);
    assert.equal(s.encounterDeck.length, players);
    for (let p = 0; p < players; p++) {
      assert.equal(s.table!.active, p);
      assert.equal(s.phase, "defense");
      s = act(s, {
        type: "DEFEND",
        enemyId: physicalId,
        defenderId: s.heroes[0].id,
      });
      s = settle(s);
      assert.equal(balrog(s).id, physicalId);
      assert.equal(balrog(s).shadows.length, 0);
      assert.equal(s.encounterDeck.length, players - p - 1);
      assert.equal(
        s.encounterDiscard.filter((c) => c === S.deep).length,
        p + 1,
      );
      assert.deepEqual(
        balrog(s).consideredEnemyAttackedBy,
        Array.from({ length: p + 1 }, (_, i) => i),
      );
      assert.equal(allEngaged(s).length, 0);
    }
    assert.equal(s.phase, "attack");
  });
test("actual Feint suppresses only the selected considered-engaged fellowship's attack", () => {
  let s = base(3);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) h.tempDefense = 10;
    });
  s = startCombat(s);
  selectSeat(s, 1);
  s.hand = [make(s, "01034")];
  s = act(s, { type: "PLAY", id: s.hand[0].id, target: balrog(s).id });
  assert.ok(s.choice!.options.some((o) => o.id === "feint-0"));
  s = choose(s, "feint-0");
  assert.equal(s.table!.active, 1);
  assert.deepEqual(balrog(s).preventedAttacks, [0]);
  s = settle(
    act(s, {
      type: "DEFEND",
      enemyId: balrog(s).id,
      defenderId: s.heroes[0].id,
    }),
  );
  assert.equal(s.table!.active, 2);
  s = settle(
    act(s, {
      type: "DEFEND",
      enemyId: balrog(s).id,
      defenderId: s.heroes[0].id,
    }),
  );
  assert.equal(s.phase, "attack");
  assert.deepEqual(balrog(s).consideredEnemyAttackedBy, [1, 2]);
});
test("each considered-engaged player may declare its own normal non-Ranged attack and another player's Ranged character can join", () => {
  let s = base(2);
  s.phase = "attack";
  s.table!.turn = 0;
  s.heroes[0].tempAttack = 3;
  const ranged = seatView(s, 1).heroes.find((h) => h.code === "01005")!;
  s = act(s, {
    type: "ATTACK",
    enemyId: balrog(s).id,
    attackerIds: [s.heroes[0].id, ranged.id],
  });
  s = settle(s);
  assert.equal(balrog(s).damage, 6);
  assert.deepEqual(balrog(s).attackedBy, [0]);
  assert.equal(balrog(s).consideredEnemyAttackedBy, undefined);
  s = act(s, { type: "END_ATTACKS" });
  assert.equal(s.table!.active, 1);
  s.heroes.find((h) => h.code === "01004")!.tempAttack = 3;
  s = settle(
    act(s, {
      type: "ATTACK",
      enemyId: balrog(s).id,
      attackerIds: [s.heroes.find((h) => h.code === "01004")!.id],
    }),
  );
  assert.equal(balrog(s).damage, 8);
  assert.deepEqual(balrog(s).attackedBy, [0, 1]);
});
test("canceled A Test of Will resumes the original When Revealed instead of losing it", () => {
  let s = base(3);
  attach(s, balrog(s), S.counter);
  forOwner(s, 2, () => {
    s.hand = [make(s, "01050")];
  });
  s.encounterDeck = [S.flame];
  resolveReveal(s, S.ranging);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === "cancel-2"));
  s = choose(s, "cancel-2");
  s = settle(s);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).heroes[0].damage, 1);
  assert.ok(s.staging.some((u) => u.code === S.ranging));
  assert.ok(seatView(s, 2).discard.includes("01050"));
});
test("canceled Hasty Stroke resolves the original actual Bane shadow", () => {
  let s = base(3);
  attach(s, balrog(s), S.counter);
  s.heroes[0].tempDefense = 4;
  forOwner(s, 2, () => {
    s.hand = [make(s, "01048")];
  });
  s.encounterDeck = [S.flame, S.shadow];
  s = startCombat(s);
  s = act(s, {
    type: "DEFEND",
    enemyId: balrog(s).id,
    defenderId: s.heroes[0].id,
  });
  assert.equal(s.choice!.title, "A shadow falls");
  s = choose(s, "cancel-2");
  assert.equal(seatView(s, 0).heroes[0].damage, 3);
  assert.deepEqual(balrog(s).consideredEnemyAttackedBy, [0]);
  assert.ok(s.encounterDiscard.includes(S.flame));
  assert.ok(seatView(s, 2).discard.includes("01048"));
});
test("canceled Swift Strike spends its resources and cannot damage Bane", () => {
  let s = base(2);
  attach(s, balrog(s), S.counter);
  s.heroes[0].tempDefense = 10;
  forOwner(s, 1, () => {
    s.hand = [make(s, "01037")];
  });
  const funds = seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0);
  s.encounterDeck = [S.deep, S.flame];
  s = startCombat(s);
  s = act(s, {
    type: "DEFEND",
    enemyId: balrog(s).id,
    defenderId: s.heroes[0].id,
  });
  assert.equal(s.choice!.title, "Swift Strike");
  s = choose(s, "play-1");
  assert.equal(balrog(s).damage, 0);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0),
    funds - 2,
  );
  assert.ok(seatView(s, 1).discard.includes("01037"));
});
test("canceled Strength of Will still pays character exhaustion and cannot place its progress", () => {
  let s = base(3);
  attach(s, balrog(s), S.counter);
  s.phase = "travel";
  const loc = make(s, S.deep);
  s.staging.push(loc);
  selectSeat(s, 2);
  s.hand = [make(s, "01047")];
  s.encounterDeck = [S.flame];
  s = act(s, { type: "TRAVEL", id: loc.id });
  assert.equal(s.choice!.title, "Strength of Will");
  const defender = s.heroes[0].id;
  s = choose(s, defender);
  assert.equal(get(s, defender)!.exhausted, true);
  assert.equal(s.activeLocation!.progress, 0);
  assert.ok(seatView(s, 2).discard.includes("01047"));
});
test("an immediate Bane attack preserves the suspended normal attack's physical shadow and protections across save/reload", () => {
  let s = base(2);
  s.phase = "defense";
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) h.tempDefense = 10;
    });
  const b = balrog(s),
    h = s.heroes[0].id;
  b.shadows = [S.flame];
  b.revealedShadowCount = 1;
  b.shadowCancelsCombatDamage = true;
  s.combat = {
    enemyId: b.id,
    attackPlayer: 0,
    defenderId: h,
    defenderIds: [h],
    attackBonus: 3,
    damageDealt: 0,
  };
  s.encounterDeck = [S.deep];
  handle(s, fx("immediateAttack", { target: b.id, player: 1 }));
  flush(s);
  assert.equal(s.suspendedCombats.length, 1);
  assert.equal(s.combat!.immediate, true);
  assert.deepEqual(balrog(s).shadows, [S.deep]);
  assert.deepEqual(s.combat!.immediatePreviousShadows, [S.flame]);
  s = saved(s);
  s = choose(s, s.choice!.options.find((o) => o.id !== "undefended")!.id);
  s = settle(s);
  assert.equal(s.combat!.immediate, undefined);
  assert.equal(s.combat!.attackPlayer, 0);
  assert.equal(s.combat!.attackBonus, 3);
  assert.deepEqual(balrog(s).shadows, [S.flame]);
  assert.equal(balrog(s).revealedShadowCount, 1);
  assert.equal(balrog(s).shadowCancelsCombatDamage, true);
  assert.ok(s.encounterDiscard.includes(S.deep));
  assert.equal(balrog(s).consideredEnemyAttackedBy, undefined);
});
test("Regenerate resolves before the refresh Dark Pit action window, after the first-player token passes", () => {
  const s = base(2);
  balrog(s).damage = 25;
  s.stage = 3;
  s.phase = "attack";
  s.activeLocation = make(s, S.pit);
  handle(s, fx("refreshReady"));
  flush(s);
  assert.equal(s.phase, "refresh");
  assert.equal(s.table!.first, 1);
  assert.equal(balrog(s).damage, 22);
});
test("Web refresh costs finish before passing first player and regenerating, and ending the round does not regenerate twice", () => {
  let s = base(2);
  const hero = s.heroes[0];
  hero.exhausted = true;
  attach(s, hero, "01080");
  balrog(s).damage = 8;
  s.phase = "attack";
  handle(s, fx("refreshReady"));
  flush(s);
  assert.equal(s.choice!.title, `Free ${card(hero.code).name} from the web?`);
  assert.equal(s.table!.first, 0);
  assert.equal(balrog(s).damage, 8);
  s = choose(s, "pay");
  assert.equal(get(s, hero.id)!.exhausted, false);
  assert.equal(s.table!.first, 1);
  assert.equal(balrog(s).damage, 5);
  s = settle(act(s, { type: "NEXT" }));
  assert.equal(s.table!.first, 1);
  assert.equal(balrog(s).damage, 5);
});
test("an actual Swift Strike reducing Bane to zero interrupts the normal attack with the final-stage fresh-shadow attack", () => {
  let s = base(2);
  s.stage = 2;
  balrog(s).damage = 25;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) h.tempDefense = 10;
    });
  forOwner(s, 1, () => {
    s.hand = [make(s, "01037")];
  });
  s.encounterDeck = [S.deep, S.hall, S.deep];
  s = startCombat(s);
  const original = s.heroes[0].id;
  s = act(s, { type: "DEFEND", enemyId: balrog(s).id, defenderId: original });
  s = choose(s, "play-1");
  assert.equal(s.stage, 3);
  assert.equal(s.suspendedCombats.length, 1);
  assert.equal(s.combat!.immediate, true);
  assert.deepEqual(s.combat!.immediatePreviousShadows, [S.deep]);
  assert.deepEqual(balrog(s).shadows, [S.hall]);
  assert.ok(!s.staging.some((u) => u.code === S.pit));
  s = saved(s);
  s = choose(s, s.choice!.options.find((o) => o.id !== "undefended")!.id);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === S.pit));
  assert.equal(s.suspendedCombats.length, 0);
  assert.deepEqual(balrog(s).consideredEnemyAttackedBy, [0]);
  assert.deepEqual(balrog(s).shadows, []);
  assert.ok(s.encounterDiscard.includes(S.deep));
  assert.ok(s.encounterDiscard.includes(S.hall));
});
test("threat raised from zero during enemy attacks creates a later eligible normal attack with a fresh shadow", () => {
  let s = base(2);
  forOwner(s, 1, () => {
    s.threat = 0;
    for (const h of s.heroes) h.tempDefense = 10;
  });
  s.heroes[0].tempDefense = 10;
  s.encounterDeck = [S.deep, S.hall];
  s = startCombat(s);
  forOwner(s, 1, () => {
    s.threat = 1;
  });
  s = settle(
    act(s, {
      type: "DEFEND",
      enemyId: balrog(s).id,
      defenderId: s.heroes[0].id,
    }),
  );
  assert.equal(s.table!.active, 1);
  s = settle(
    act(s, {
      type: "DEFEND",
      enemyId: balrog(s).id,
      defenderId: s.heroes[0].id,
    }),
  );
  assert.deepEqual(balrog(s).consideredEnemyAttackedBy, [0, 1]);
  assert.deepEqual(s.encounterDiscard, [S.deep, S.hall]);
  assert.equal(s.phase, "attack");
});
test("the normal attack ledger survives elimination of the other fellowship without duplicating Bane", () => {
  let s = base(3);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) h.tempDefense = 10;
    });
  s = startCombat(s);
  s = settle(
    act(s, {
      type: "DEFEND",
      enemyId: balrog(s).id,
      defenderId: s.heroes[0].id,
    }),
  );
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  check(s);
  assert.deepEqual(playerOrder(s), [0, 2]);
  assert.equal(s.table!.active, 2);
  s = settle(
    act(s, {
      type: "DEFEND",
      enemyId: balrog(s).id,
      defenderId: s.heroes[0].id,
    }),
  );
  assert.deepEqual(balrog(s).consideredEnemyAttackedBy, [0, 2]);
  assert.equal(s.staging.filter((u) => u.code === S.bane).length, 1);
  assert.equal(allEngaged(s).length, 0);
  s = saved(s);
  assert.deepEqual(balrog(s).consideredEnemyAttackedBy, [0, 2]);
});
test("save validation rejects duplicated or nonexistent considered-attack players and malformed Shadow lasting state", () => {
  const s = base(2),
    b = balrog(s);
  b.consideredEnemyAttackedBy = [0, 0];
  assert.equal(validateSave(s), false);
  b.consideredEnemyAttackedBy = [2];
  assert.equal(validateSave(s), false);
  b.consideredEnemyAttackedBy = [0];
  assert.equal(validateSave(s), true);
  s.shadowFlame!.roundAttackBonus = -1;
  assert.equal(validateSave(s), false);
});
test("a started fresh-shadow attack still discards its shadows if Bane becomes blanked before completion", () => {
  const s = base(),
    b = balrog(s);
  s.encounterDeck = [S.flame];
  beginConsideredEnemyShadows(s, b);
  b.blanked = true;
  assert.equal(finishEnemyShadows(s, b, true), true);
  assert.equal(b.shadows.length, 0);
  assert.deepEqual(s.encounterDiscard, [S.flame]);
});
test("Indestructible accepts lethal and excess damage without destruction or enemy-kill rewards", () => {
  const s = base(),
    b = balrog(s);
  damage(s, b.id, 30);
  check(s);
  assert.equal(b.damage, 30);
  assert.ok(s.staging.includes(b));
  assert.equal(s.status, "playing");
  assert.ok(!s.encounterDiscard.includes(S.bane));
  assert.equal(s.victory, 0);
});
test("Fiery Sword is unique, adds exactly three attack and is still legal despite Bane's player-attachment play restriction", () => {
  let s = base();
  s = reveal(s, S.sword);
  assert.equal(stats(s, balrog(s)).attack, 9);
  s = reveal(s, S.sword);
  assert.equal(
    balrog(s).attachments.filter((a) => a.code === S.sword).length,
    1,
  );
  assert.ok(s.encounterDiscard.includes(S.sword));
});
test("Sword blanking suppresses its bonus but a resolved Inner Flame lasts independently until round end", () => {
  let s = base();
  attach(s, balrog(s), S.sword);
  s = reveal(s, S.flame);
  s = choose(s, "resolve");
  assert.equal(stats(s, balrog(s)).attack, 12);
  s.activeLocation = make(s, EMYN.amonLhaw);
  assert.equal(stats(s, balrog(s)).attack, 9);
  shadowFlameRoundEnd(s);
  assert.equal(stats(s, balrog(s)).attack, 6);
});
test("Counter-Spell permits a non-treachery discard, stays attached and does not reveal that card", () => {
  const s = base(),
    b = balrog(s);
  attach(s, b, S.counter);
  s.hand = [make(s, "01023"), make(s, "01016")];
  s.encounterDeck = [S.ranging];
  assert.equal(spendEvent(s, "01023"), true);
  assert.equal(s.hand.length, 1);
  assert.equal(b.attachments.length, 1);
  assert.ok(s.encounterDiscard.includes(S.ranging));
  assert.equal(s.staging.length, 1);
  assert.equal(s.heroes[0].damage, 0);
});
test("Counter-Spell cancellation pays the event cost, discards its physical event and remaining hand, then discards the Counter", () => {
  const s = base(),
    b = balrog(s);
  attach(s, b, S.counter);
  s.hand = [make(s, "01023"), make(s, "01016"), make(s, "01034")];
  s.encounterDeck = [S.flame];
  const funds = s.heroes.reduce((n, h) => n + h.resources, 0);
  assert.equal(spendEvent(s, "01023"), false);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    funds - 1,
  );
  assert.equal(s.hand.length, 0);
  assert.equal(s.discard.length, 2);
  assert.equal(s.resolvingEvents?.[0].unit.code, "01023");
  assert.ok(validateSave(s));
  flush(s);
  assert.equal(s.discard.length, 3);
  assert.equal(b.attachments.length, 0);
  assert.ok(s.encounterDiscard.includes(S.counter));
  assert.equal(shadowFlameAttackBonus(s, b), 0);
});
test("all Counter copies resolve their Forced tests even after one already cancels the event", () => {
  const s = base(),
    b = balrog(s);
  attach(s, b, S.counter);
  attach(s, b, S.counter);
  s.hand = [make(s, "01023"), make(s, "01016")];
  s.encounterDeck = [S.flame, S.deep];
  assert.equal(spendEvent(s, "01023"), false);
  assert.equal(s.encounterDeck.length, 0);
  assert.equal(b.attachments.length, 1);
  assert.deepEqual(s.encounterDiscard, [S.flame, S.counter, S.deep]);
});
test("blanked Counter-Spell does not cancel and does not discard an encounter card", () => {
  const s = base(),
    b = balrog(s);
  attach(s, b, S.counter);
  s.activeLocation = make(s, EMYN.amonLhaw);
  s.hand = [make(s, "01023")];
  s.encounterDeck = [S.flame];
  assert.equal(spendEvent(s, "01023"), true);
  assert.deepEqual(s.encounterDeck, [S.flame]);
  assert.equal(b.attachments.length, 1);
});
test("an actual hand-played event is countered before its effects and still counts as played", () => {
  let s = base();
  attach(s, balrog(s), S.counter);
  s.hand = [make(s, "01023"), make(s, "01016")];
  s.encounterDeck = [S.flame];
  s = act(s, { type: "PLAY", id: s.hand[0].id });
  assert.equal(s.allies.length, 0);
  assert.equal(s.hand.length, 0);
  assert.ok(s.discard.includes("01023"));
  assert.equal(s.choice, null);
});
test("Inner Flame cancellation removes only an explicitly chosen first-player questing hero and retains round commitment history", () => {
  let s = base(2);
  s.stage = 2;
  s.phase = "quest";
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  charactersCommitted(s, [s.heroes[0]]);
  s.queue = [];
  forOwner(s, 1, () => (s.heroes[0].committed = true));
  s = reveal(s, S.flame);
  assert.ok(
    s
      .choice!.options.filter((o) => o.id !== "resolve")
      .every((o) => s.heroes.some((h) => h.id === o.id)),
  );
  const h = s.heroes[0].id;
  s = choose(s, h);
  assert.equal(s.heroes[0].committed, false);
  assert.equal(stats(s, balrog(s)).attack, 6);
  shadowFlameQuestEnd(s);
  flush(s);
  assert.equal(s.progress, 4);
});
test("Inner Shadow retains its surge when a hero cancels the heal, and resolving heals up to five", () => {
  let s = base();
  balrog(s).damage = 8;
  s.heroes[0].committed = true;
  s.encounterDeck = [S.deep];
  s = reveal(s, S.shadow);
  s = choose(s, s.heroes[0].id);
  s = settle(s);
  assert.equal(balrog(s).damage, 8);
  assert.ok(s.staging.some((u) => u.code === S.deep));
  s = base();
  balrog(s).damage = 3;
  s.encounterDeck = [S.deep];
  s = reveal(s, S.shadow);
  s = choose(s, "resolve");
  s = settle(s);
  assert.equal(balrog(s).damage, 0);
});
test("Second Deep blocks both direct and buffered framework progress until Bane has actual damage", () => {
  const s = base(),
    l = make(s, S.deep);
  s.activeLocation = l;
  assert.equal(shadowFlameLocationProgressBlocked(s, l), true);
  progressLocation(s, l, 3);
  progress(s, 20);
  assert.equal(l.progress, 0);
  assert.equal(s.progress, 0);
  balrog(s).damage = 1;
  progress(s, 4);
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 1);
});
test("Rear Guard four progress bypasses active locations and requires a hero commitment this round, even if that hero later leaves the quest", () => {
  let s = base();
  s.stage = 2;
  s.phase = "quest";
  s.activeLocation = make(s, S.deep);
  const h = s.heroes[0];
  h.committed = true;
  shadowFlameCharactersCommitted(s, [h]);
  h.committed = false;
  shadowFlameQuestEnd(s);
  flush(s);
  assert.equal(s.progress, 4);
  assert.equal(s.activeLocation.progress, 0);
  shadowFlameRoundEnd(s);
  shadowFlameQuestEnd(s);
  flush(s);
  assert.equal(s.progress, 4);
  s = base();
  s.stage = 2;
  const ally = make(s, "01016");
  ally.committed = true;
  shadowFlameCharactersCommitted(s, [ally]);
  shadowFlameQuestEnd(s);
  flush(s);
  assert.equal(s.progress, 0);
});
test("Ranging Goblin revelation makes every fellowship choose a hero before its own damage effect", () => {
  let s = base(2);
  s = reveal(s, S.ranging);
  s = choose(s, s.heroes[0].id);
  assert.equal(seatView(s, 0).heroes[0].damage, 1);
  assert.equal(s.table!.active, 1);
  s = choose(s, seatView(s, 1).heroes[1].id);
  assert.equal(seatView(s, 1).heroes[1].damage, 1);
});
test("Ranging Goblin shuffles itself and the top encounter discard after a character leaves; this is not enemy destruction", () => {
  const s = base(),
    g = make(s, S.ranging),
    a = make(s, "01016");
  s.staging.push(g);
  s.allies = [a];
  s.encounterDeck = [];
  s.encounterDiscard = [S.flame];
  discardCharacter(s, a);
  flush(s);
  assert.ok(!s.staging.some((u) => u.id === g.id));
  assert.deepEqual(new Set(s.encounterDeck), new Set([S.ranging, S.flame]));
  assert.equal(s.victory, 0);
});
test("multiple Ranging Goblins and active Second Hall let the first player order their Forced effects", () => {
  let s = base(2);
  const one = make(s, S.ranging),
    two = make(s, S.ranging),
    hall = make(s, S.hall);
  s.staging.push(one, two);
  s.activeLocation = hall;
  s.allies = [make(s, "01016")];
  s.encounterDiscard = [S.flame, S.shadow];
  s.encounterDeck = [S.deep];
  discardCharacter(s, s.allies[0]);
  flush(s);
  assert.equal(s.table!.active, s.table!.first);
  assert.equal(s.choice!.options.length, 3);
  s = choose(s, hall.id);
  assert.ok(s.staging.some((u) => u.code === S.deep));
  s = settle(s);
  assert.ok(!s.staging.some((u) => [one.id, two.id].includes(u.id)));
});
test("Fires chooses every player's ally before discard and only surges when it discarded no ally", () => {
  let s = base(2);
  s.allies = [make(s, "01016")];
  forOwner(s, 1, () => (s.allies = [make(s, "01028")]));
  s.encounterDeck = [S.deep];
  s = reveal(s, S.fires);
  s = choose(s, s.allies[0].id);
  assert.equal(seatView(s, 0).allies.length, 1);
  s = choose(s, seatView(s, 1).allies[0].id);
  assert.equal(
    allCharacters(s).filter((u) => card(u.code).type_code === "ally").length,
    0,
  );
  assert.deepEqual(s.encounterDeck, [S.deep]);
  s = base();
  s.encounterDeck = [S.deep];
  s = reveal(s, S.fires);
  assert.ok(s.staging.some((u) => u.code === S.deep));
});
test("Fires shadow discards only an ally controlled by the actual defending fellowship", () => {
  let s = base(2);
  s.allies = [make(s, "01016")];
  forOwner(s, 1, () => (s.allies = [make(s, "01028")]));
  s.combat = {
    enemyId: balrog(s).id,
    defenderId: null,
    attackBonus: 0,
    attackPlayer: 1,
  };
  shadow(s, S.fires);
  flush(s);
  s = choose(s, seatView(s, 1).allies[0].id);
  assert.equal(seatView(s, 0).allies.length, 1);
  assert.equal(seatView(s, 1).allies.length, 0);
});
test("Whip Lash includes controlled quest attachments and keeps uncontrolled encounter attachments on Bane", () => {
  let s = base();
  attach(s, balrog(s), S.sword);
  attachToQuest(s, currentQuestCode(s)!, {
    id: "quest-long",
    code: "10122",
    exhausted: false,
    owner: 0,
  });
  s = reveal(s, S.lash);
  assert.ok(s.choice!.options.some((o) => o.id === "quest-long"));
  assert.ok(!s.choice!.options.some((o) => o.code === S.sword));
  s = choose(s, "quest-long");
  assert.equal(currentQuestUnit(s)!.attachments.length, 0);
  assert.equal(balrog(s).attachments.length, 1);
});
test("Whip Lash shadow discards every defending-player attachment including an enemy trap and quest card, but no other player's", () => {
  const s = base(2),
    b = balrog(s);
  attach(s, b, S.sword);
  attach(s, s.heroes[0], "01026", 0);
  attach(s, seatView(s, 1).heroes[0], "01042", 1);
  attach(s, b, "01069", 0);
  attachToQuest(s, currentQuestCode(s)!, {
    id: "quest-long",
    code: "10122",
    exhausted: false,
    owner: 0,
  });
  s.combat = {
    enemyId: b.id,
    defenderId: null,
    attackBonus: 0,
    attackPlayer: 0,
  };
  shadow(s, S.lash);
  flush(s);
  assert.equal(s.heroes[0].attachments.length, 0);
  assert.equal(currentQuestUnit(s)!.attachments.length, 0);
  assert.equal(seatView(s, 1).heroes[0].attachments.length, 1);
  assert.deepEqual(
    b.attachments.map((a) => a.code),
    [S.sword],
  );
});
test("Inner Flame and Leaping Flame shadows add three only to Bane attacks", () => {
  const s = base();
  s.combat = { enemyId: balrog(s).id, defenderId: null, attackBonus: 0 };
  shadow(s, S.flame);
  shadow(s, S.leaping);
  assert.equal(s.combat.attackBonus, 6);
  const other = make(s, S.ranging);
  s.staging.push(other);
  s.combat = { enemyId: other.id, defenderId: null, attackBonus: 0 };
  shadow(s, S.flame);
  assert.equal(s.combat.attackBonus, 0);
});
test("Dark Pit offers only one to three owned exhaustible characters during refresh after travel", () => {
  const s = base(2),
    pit = make(s, S.pit);
  s.activeLocation = pit;
  s.phase = "refresh";
  s.deck = ["01073"];
  attach(s, s.heroes[0], CARROCK.sacked);
  assert.equal(shadowFlameAbilityProblem(s, pit), null);
  shadowFlameAbility(s, pit);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["pit:1", "pit:2", "pit:3"],
  );
  s.choice = null;
  attach(s, s.heroes[1], KHAZAD.fear);
  attach(s, s.heroes[2], "octgn:51223bd0-ffd1-11df-a976-0801210c9022");
});
function attemptPit(s: GameState, count: number) {
  s = act(s, { type: "ABILITY", id: s.activeLocation!.id });
  s = choose(s, `pit:${count}`);
  while (s.choice?.title.includes("Dark Pit"))
    s = choose(s, s.choice.options[0].id);
  return s;
}
test("Dark Pit uses combined printed costs, requires strictly greater remaining hit points and wins without quest progress", () => {
  let s = base();
  s.stage = 3;
  s.phase = "refresh";
  s.activeLocation = make(s, S.pit);
  balrog(s).damage = 22;
  s.deck = ["01073"];
  s = attemptPit(s, 1);
  assert.equal(s.status, "playing");
  assert.equal(s.progress, 0);
  assert.ok(s.staging.some((u) => u.code === S.bane));
  assert.equal(s.discard[0], "01073");
  s = base();
  s.stage = 3;
  s.phase = "refresh";
  s.activeLocation = make(s, S.pit);
  balrog(s).damage = 23;
  s.deck = ["01073"];
  s = attemptPit(s, 1);
  assert.equal(s.status, "won");
  assert.equal(s.progress, 0);
  assert.ok(s.encounterDiscard.includes(S.bane));
  assert.ok(!s.staging.some((u) => u.code === S.bane));
});
test("Dark Pit can discard fewer deck cards than its paid exhaustion count and preserves physical ownership", () => {
  let s = base(2);
  s.stage = 3;
  s.phase = "refresh";
  s.activeLocation = make(s, S.pit);
  selectSeat(s, 1);
  s.deck = ["01073"];
  balrog(s).damage = 23;
  s = attemptPit(s, 3);
  assert.equal(s.status, "won");
  assert.equal(
    seatView(s, 0).heroes.some((h) => h.exhausted),
    false,
  );
  assert.equal(
    seatView(s, 1).heroes.every((h) => h.exhausted),
    true,
  );
  assert.ok(seatView(s, 1).discard.includes("01073"));
});
test("Dark Pit's count and character selections survive save/reload before atomic exhaustion and discard", () => {
  let s = base();
  s.stage = 3;
  s.phase = "refresh";
  s.activeLocation = make(s, S.pit);
  s.deck = ["01028", "01016"];
  s = act(s, { type: "ABILITY", id: s.activeLocation.id });
  s = choose(s, "pit:2");
  const h = s.heroes[0].id;
  s = choose(s, h);
  assert.equal(s.heroes[0].exhausted, false);
  s = saved(s);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 2);
  assert.equal(s.discard.length, 2);
  assert.equal(s.choice, null);
});
test("final quest progress alone cannot win while Bane remains in play", () => {
  const s = base();
  s.stage = 3;
  s.progress = 100;
  advanceQuest(s);
  assert.equal(s.status, "playing");
});
test("Bane reaching zero hit points advances Rear Guard immediately and stage three attacks before Dark Pit enters staging", () => {
  let s = base();
  s.phase = "quest";
  s.stage = 2;
  s.encounterDeck = [S.deep];
  damage(s, balrog(s).id, 27);
  flush(s);
  assert.equal(s.stage, 3);
  assert.ok(!s.staging.some((u) => u.code === S.pit));
  assert.ok(s.choice || s.combat);
  s = settle(s);
  if (s.combat) {
    s = act(s, {
      type: "DEFEND",
      enemyId: balrog(s).id,
      ids: [s.heroes[0].id],
    });
    s = settle(s);
  }
  assert.ok(s.staging.some((u) => u.code === S.pit));
  assert.equal(s.stageRevealing, false);
});
