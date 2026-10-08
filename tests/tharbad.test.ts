import assert from "node:assert/strict";
import test from "node:test";
import {
  createGame,
  applyAction,
  validateSave,
  canTravel,
  publicState,
} from "../src/game/engine.ts";
import { card, imageUrl, STARTERS, SCRIPTED } from "../src/game/cards.ts";
import {
  make,
  fx,
  get,
  stats,
  threatOf,
  locationQuest,
  engagementCost,
  stageInfo,
} from "../src/game/core.ts";
import {
  check,
  damage,
  destroy,
  discardCharacter,
  progress,
  progressLocation,
  phaseEnd,
  returnAlly,
  raiseThreat,
  placeEncounter,
} from "../src/game/board.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import {
  forOwner,
  playerOrder,
  seatView,
  ownerOf,
  selectSeat,
  allCharacters,
  allEngaged,
} from "../src/game/table.ts";
import {
  THARBAD as T,
  THARBAD_ENCOUNTERS,
  THARBAD_QUESTS,
  THARBAD_RECIPES,
  threatElimination,
} from "../src/game/tharbad-support.ts";
import {
  tharbadEncounter,
  tharbadShadow,
  tharbadNalir,
  tharbadCheck,
} from "../src/game/tharbad.ts";
import { reduceThreat } from "../src/game/threat-reduction.ts";
import { removeQuestTime, canRemoveQuestTime } from "../src/game/quest-time.ts";
import { holdPlayedEvent } from "../src/game/event-resolution.ts";
import { useHeirsPlayerAbility } from "../src/game/heirs-player-cards.ts";
import { useWatcherPlayerAbility } from "../src/game/watcher-player-cards.ts";
import { useElfAbility } from "../src/game/elf-player-cards.ts";
import { CATCH_ORC as C } from "../src/game/catch-orc-support.ts";
import { automatedScenarioId } from "../src/game/support.ts";
import { base, choose, reload } from "./tharbad-fixtures.ts";
import type { GameState, Unit } from "../src/game/types.ts";
function settle(s: GameState) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 180, "choices terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function mugVictory(s: GameState) {
  s.victoryCards = [T.mug];
  s.victory = 4;
}
function enemy(s: GameState, code = T.spy, player = 0) {
  let u: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u!;
}
function final(players = 1) {
  let s = base(players);
  effect(s, fx("tharbadAdvance"));
  s = settle(s);
  s.staging = s.staging.filter((u) => u.code === T.crossing);
  return s;
}
function attach(s: GameState, u: Unit, code: string, owner?: number) {
  const a = {
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    ...(owner !== undefined ? { owner } : {}),
  };
  u.attachments.push(a);
  return a;
}
test("Tharbad imports sixteen encounters, two quests, twenty faces and exact 40/32 recipes", () => {
  assert.equal(THARBAD_ENCOUNTERS.length, 16);
  assert.equal(THARBAD_QUESTS.length, 2);
  for (const r of THARBAD_RECIPES) {
    const rows = r.cards.filter((c) => c.section !== "sharedQuestDeck");
    assert.equal(
      rows.reduce((n, c) => n + c.quantity, 0),
      r.mode === "easy" ? 32 : 40,
    );
    for (const c of rows)
      assert.equal(
        r.mode === "easy" ? card(c.code).easy_quantity : card(c.code).quantity,
        c.quantity,
      );
  }
  let faces = 0;
  for (const c of [...THARBAD_ENCOUNTERS, ...THARBAD_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code));
    assert.match(imageUrl(c), /^\/cards\//);
    faces++;
    if (c.back_imagesrc) {
      faces++;
      assert.match(imageUrl({ ...c, imagesrc: c.back_imagesrc }), /^\/cards\//);
    }
  }
  assert.equal(faces, 20);
  for (const mode of ["standard", "easy"])
    assert.equal(
      automatedScenarioId({ name: "Trouble in Tharbad", mode }),
      "trouble-in-tharbad",
    );
  for (const mode of ["campaign", "nightmare"])
    assert.equal(
      automatedScenarioId({ name: "Trouble in Tharbad", mode }),
      null,
    );
});
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Tharbad setup ${players} players / ${easy ? "easy" : "normal"} preserves opening hands and exact physical setup`, () => {
      const d = STARTERS[0];
      let s = createGame(25, d.cards, d.heroes, d.id, {
        scenarioId: "trouble-in-tharbad",
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
      assert.equal(s.encounterDeck.length, easy ? 28 : 36);
      assert.equal(s.tharbad!.setAside.length, 2);
      for (let p = 0; p < players; p++) {
        s = applyAction(reload(s), { type: "MULLIGAN" });
        s = applyAction(reload(s), { type: "KEEP" });
      }
      s = settle(s);
      assert.equal(s.phase, "resource");
      assert.equal(s.activeLocation!.code, T.mug);
      assert.equal(tharbadNalir(s)!.code, T.nalir);
      assert.equal(ownerOf(s, tharbadNalir(s)!), 0);
      assert.equal(s.staging.filter((u) => u.code === T.spy).length, players);
      assert.equal(s.encounterDeck.length, (easy ? 28 : 36) - players);
      assert.equal(s.tharbad!.time, 4);
      assert.equal(s.tharbad!.elimination, 50);
      assert.ok(playerOrder(s).every((p) => seatView(s, p).hand.length === 7));
      reload(s);
    });
test("The Empty Mug blocks quest and player reductions while in play", () => {
  const s = base();
  s.activeLocation = make(s, T.mug);
  reduceThreat(s, 9);
  assert.equal(s.threat, 20);
  s.staging.push(s.activeLocation);
  s.activeLocation = null;
  progress(s, 10);
  assert.equal(s.threat, 20);
  assert.equal(s.progress, 0);
});
test("Exploring The Empty Mug lets excess quest progress reduce threat without removing a player card", () => {
  let s = base();
  s.activeLocation = make(s, T.mug);
  progress(s, 10);
  s = settle(s);
  assert.equal(s.activeLocation, null);
  assert.equal(s.threat, 14);
  assert.ok(s.victoryCards!.includes(T.mug));
  assert.equal(s.removed.length, 0);
});
test("All living players must reach zero before advancement and the narrowed threat limit persists", () => {
  let s = base(2);
  s.tharbad!.elimination = 40;
  forOwner(s, 1, () => (s.threat = 25));
  s.encounterDeck = [C.skirmisher, T.inn, C.hunter, T.lot];
  progress(s, 20);
  s = settle(s);
  assert.equal(s.stage, 1);
  assert.equal(seatView(s, 0).threat, 0);
  assert.equal(seatView(s, 1).threat, 5);
  progress(s, 5);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.tharbad!.time, 3);
  assert.equal(s.tharbad!.elimination, 40);
  assert.equal(
    s.staging.filter((u) => [C.skirmisher, C.hunter].includes(u.code)).length,
    2,
  );
  assert.equal(s.staging.filter((u) => u.code === T.bellach).length, 1);
  assert.equal(s.staging.filter((u) => u.code === T.crossing).length, 1);
  assert.equal(s.encounterDeck.length + s.encounterDiscard.length, 2);
  assert.equal(s.tharbad!.setAside.length, 0);
  assert.match(stageInfo(s).questImage!, /\.B\.jpg$/);
});
test("First-stage Time lowers the elimination level, checks exact equality and resets only if the game survives", () => {
  let s = base();
  s.tharbad!.time = 1;
  s.threat = 39;
  removeQuestTime(s);
  s = settle(s);
  assert.equal(threatElimination(s), 40);
  assert.equal(s.tharbad!.time, 4);
  assert.equal(s.status, "playing");
  s.threat = 40;
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /40/);
});
test("Time elimination of a non-Nalir fellowship permits other players to continue", () => {
  let s = base(2);
  s.tharbad!.time = 1;
  s.threat = 35;
  forOwner(s, 1, () => (s.threat = 42));
  removeQuestTime(s);
  s = settle(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(s.status, "playing");
  assert.ok(tharbadNalir(s));
  assert.equal(s.tharbad!.time, 4);
  reload(s);
});
test("Eliminating Nalir’s controller loses the whole game instead of moving him to the next player", () => {
  let s = base(2);
  s.threat = 45;
  s.tharbad!.time = 1;
  removeQuestTime(s);
  s = settle(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Nalir/);
});
test("Zero threat is still eliminated when the threat elimination level reaches zero", () => {
  let s = base();
  s.tharbad!.elimination = 10;
  s.tharbad!.time = 1;
  s.threat = 0;
  s.stageRevealing = true;
  removeQuestTime(s);
  s = settle(s);
  assert.equal(s.status, "lost");
  assert.equal(threatElimination(s), 0);
});
test("Nalir follows first player while retaining damage, attachments and identity", () => {
  const s = base(2),
    n = tharbadNalir(s)!;
  n.damage = 1;
  const a = attach(s, n, "04082");
  s.table!.first = 1;
  check(s);
  const moved = tharbadNalir(s)!;
  assert.equal(moved.id, n.id);
  assert.equal(ownerOf(s, moved), 1);
  assert.equal(moved.damage, 1);
  assert.equal(moved.attachments[0].id, a.id);
});
test("Nalir raises the current controller’s threat at refresh beginning before exhausted Elfhelm readies", () => {
  let s = base(2);
  s.table!.first = 1;
  check(s);
  forOwner(s, 1, () => {
    const h = make(s, "02100");
    h.exhausted = true;
    s.allies.push(h);
  });
  s.phase = "attack";
  effect(s, fx("refreshReady"));
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 23);
  assert.equal(s.phase, "refresh");
  assert.ok(!allCharacters(s).find((u) => u.code === "02100")!.exhausted);
});
for (const leave of ["damage", "discard", "hand"] as const)
  test(`Nalir leaving by ${leave} loses immediately`, () => {
    let s = base();
    const n = tharbadNalir(s)!;
    if (leave === "damage") damage(s, n.id, 10);
    else if (leave === "discard") discardCharacter(s, n);
    else returnAlly(s, n);
    s = settle(s);
    assert.equal(s.status, "lost");
  });
test("Tharbad Hideout prevents all Time loss and disables unpayable shared Orc choices", () => {
  let s = base();
  s.activeLocation = make(s, T.hideout);
  assert.equal(canRemoveQuestTime(s), false);
  removeQuestTime(s, 10);
  assert.equal(s.tharbad!.time, 4);
  for (const kind of [
    "catchHunter",
    "catchSkirmisher",
    "tharbadCorneredChoice",
    "tharbadTailChoice",
  ]) {
    s.choice = null;
    effect(s, fx(kind));
    assert.ok(s.choice!.options.every((o) => o.id !== "time"));
  }
  s.choice = null;
  effect(s, fx("startQuest"));
  s = settle(s);
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes(T.hideout));
  assert.equal(canRemoveQuestTime(s), true);
});
test("Hideout gains its quest-start progress even in staging", () => {
  let s = base();
  s.staging = [make(s, T.hideout)];
  effect(s, fx("startQuest"));
  s = settle(s);
  assert.equal(s.staging.length, 0);
  assert.ok(s.encounterDiscard.includes(T.hideout));
});
test("Marauders get two real shadow cards per counter actually removed, preserving Silver Lamp visibility", () => {
  let s = base(),
    m = enemy(s, T.marauder);
  attach(s, s.heroes[0], "07009");
  s.encounterDeck = Array(10).fill(T.crossing);
  removeQuestTime(s, 2);
  s = settle(s);
  m = get(s, m.id)!;
  assert.equal(m.shadows.length, 4);
  assert.deepEqual(m.faceupShadows, [true, true, true, true]);
  assert.equal(s.tharbad!.time, 2);
});
test("Spy’s attack removes Time before declaring defenders and attack prevention suppresses its trigger", () => {
  let s = base();
  const spy = enemy(s);
  effect(s, fx("immediateAttack", { target: spy.id }));
  flush(s);
  assert.equal(s.tharbad!.time, 3);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  get(s, spy.id)!.feinted = true;
  effect(s, fx("immediateAttack", { target: spy.id }));
  s = settle(s);
  assert.equal(s.tharbad!.time, 3);
});
test("A Marauder Time shadow schedules both newly dealt shadows during that same attack", () => {
  let s = base();
  const m = enemy(s, T.marauder);
  s.encounterDeck = [T.marauder, T.cornered, T.cornered];
  s.heroes[0].tempDefense = 10;
  effect(s, fx("immediateAttack", { target: m.id }));
  flush(s);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(s.tharbad!.time, 3);
  assert.equal(s.encounterDiscard.length, 3);
  assert.equal(s.encounterDeck.length, 0);
  assert.equal(s.heroes[0].damage, 0);
});
test("Ruins City auras stack only in staging and active Ruins add combat shadows", () => {
  let s = base();
  const r = make(s, T.ruins),
    street = make(s, T.streets);
  s.staging = [r, street];
  assert.equal(threatOf(s, street), 4);
  s.staging.push(make(s, T.ruins));
  assert.equal(threatOf(s, street), 5);
  s.staging = s.staging.filter((u) => u.id !== r.id);
  s.activeLocation = r;
  const e = enemy(s);
  s.encounterDeck = [T.crossing, T.crossing];
  effect(s, fx("combatStartEffects"));
  effect(s, fx("prepareCombat"));
  s = settle(s);
  assert.equal(get(s, e.id)!.shadows.length, 2);
});
test("Streets cannot receive staging progress and reduce engagement cost only while active", () => {
  const s = base(),
    l = make(s, T.streets),
    e = enemy(s);
  s.staging = [l];
  progressLocation(s, l, 10);
  assert.equal(l.progress, 0);
  assert.equal(engagementCost(s, e), 40);
  s.staging = [];
  s.activeLocation = l;
  assert.equal(engagementCost(s, e), 20);
});
test("Rooftops returns enemies, raises their threat and stops automatic but not optional engagement", () => {
  let s = base();
  s.phase = "travel";
  const roof = make(s, T.rooftops),
    e = enemy(s);
  s.staging = [roof];
  s = applyAction(reload(s), { type: "TRAVEL", id: roof.id });
  s = settle(s);
  assert.equal(s.engaged.length, 0);
  assert.equal(threatOf(s, get(s, e.id)!), 3);
  s.threat = 49;
  effect(s, fx("engagementRound"));
  s = settle(s);
  assert.equal(s.engaged.length, 0);
  s.phase = "encounter";
  s = applyAction(reload(s), { type: "ENGAGE", id: e.id });
  s = settle(s);
  assert.equal(s.engaged.length, 1);
});
test("Hidden Alleyway pays each player’s threat and adds Time only after entering", () => {
  let s = base(2);
  s.phase = "travel";
  const l = make(s, T.alley);
  s.staging = [l, make(s, T.spy)];
  enemy(s, T.marauder, 1);
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
  assert.equal(s.tharbad!.time, 5);
  assert.equal(s.activeLocation!.id, l.id);
});
test("Seedy Inn searches deck or discard for a Spy, adding it without revelation", () => {
  let s = base();
  s.phase = "travel";
  const l = make(s, T.inn);
  s.staging = [l];
  s.encounterDiscard = [T.spy];
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  assert.ok(s.choice!.options.some((o) => o.id === `discard:${T.spy}`));
  s = choose(reload(s), `discard:${T.spy}`);
  s = settle(s);
  assert.equal(s.activeLocation!.id, l.id);
  assert.ok(s.staging.some((u) => u.code === T.spy));
  assert.equal(s.tharbad!.time, 4);
});
test("Bellach boosts only Orc/Creature enemies and shuffles back only after destruction", () => {
  let s = base(2);
  const b = enemy(s, T.bellach);
  s.staging = [make(s, T.spy)];
  assert.equal(threatOf(s, b), 2);
  assert.equal(threatOf(s, s.staging[0]), 3);
  assert.equal(engagementCost(s, s.staging[0]), 10);
  assert.equal(engagementCost(s, b), 50);
  damage(s, b.id, 100);
  s = settle(s);
  assert.ok(s.encounterDeck.includes(T.bellach));
  assert.equal(s.encounterDiscard.includes(T.bellach), false);
  assert.equal(threatOf(s, s.staging[0]), 2);
  const another = enemy(s, T.bellach);
  discardCharacter(s, another);
  assert.ok(s.encounterDiscard.includes(T.bellach));
});
test("Cornered modifiers affect current enemies through phase end but expire at round end", () => {
  let s = base();
  const e = enemy(s);
  effect(s, fx("tharbadCorneredBonus"));
  phaseEnd(s);
  assert.equal(stats(s, e).attack, 4);
  assert.equal(engagementCost(s, e), 20);
  const later = enemy(s);
  assert.equal(stats(s, later).attack, 3);
  s.phase = "refresh";
  effect(s, fx("endRoundAfterCollector"));
  s = settle(s);
  assert.equal(stats(s, get(s, e.id)!).attack, 3);
  assert.equal(engagementCost(s, get(s, e.id)!), 40);
});
test("Constant Tail returns every player’s enemies and boosts only current staging Spies until phase end", () => {
  let s = base(2);
  const spy = enemy(s),
    hound = enemy(s, C.hound, 1);
  tharbadEncounter(s, T.tail);
  flush(s);
  s = choose(reload(s), "spies");
  assert.equal(allEngaged(s).length, 0);
  assert.equal(threatOf(s, get(s, spy.id)!), 4);
  assert.equal(threatOf(s, get(s, hound.id)!), 1);
  phaseEnd(s);
  assert.equal(threatOf(s, get(s, spy.id)!), 2);
});
test("Conspicuous Lot counts objective allies, checks surge after threat rises, and cancels as one When Revealed", () => {
  let s = base();
  s.threat = 20;
  s.encounterDeck = [T.streets];
  tharbadEncounter(s, T.lot);
  s = settle(s);
  assert.equal(s.threat, 21);
  assert.equal(s.encounterDeck.length, 1);
  s.threat = 19;
  placeEncounter(s, T.lot, true);
  s = settle(s);
  assert.equal(s.threat, 19);
  assert.equal(s.encounterDeck.length, 1);
});
test("Get That Dwarf selects the current highest attack, engages first player and permits ordinary defenders", () => {
  let s = base();
  const spy = make(s, T.spy),
    hound = make(s, C.hound);
  hound.tempAttack = 4;
  s.staging = [spy, hound];
  s.encounterDeck = [T.crossing];
  tharbadEncounter(s, T.dwarf);
  flush(s);
  assert.match(s.choice!.title, /Exhaust a character/);
  s = choose(reload(s), s.heroes[2].id);
  assert.equal(s.combat!.enemyId, hound.id);
  assert.equal(s.combat!.undefendedTargetId, tharbadNalir(s)!.id);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(tharbadNalir(s)!.damage, 0);
  assert.equal(s.heroes[0].damage, 4);
});
test("Undefended damage from an attack against Nalir must hit him, ignoring eligible hero/ally alternatives", () => {
  let s = base();
  s.staging = [make(s, T.bellach)];
  s.encounterDeck = [T.crossing];
  tharbadEncounter(s, T.dwarf);
  flush(s);
  s = choose(reload(s), "undefended");
  assert.equal(s.status, "lost");
  assert.equal(tharbadNalir(s), undefined);
  assert.ok(s.heroes.every((h) => h.damage === 0));
});
test("Get That Dwarf offers an explicit tie and surges if no staging enemy is present", () => {
  let s = base();
  s.staging = [make(s, T.spy), make(s, C.hunter)];
  tharbadEncounter(s, T.dwarf);
  flush(s);
  assert.equal(s.choice!.options.length, 2);
  s = base();
  s.encounterDeck = [T.streets];
  tharbadEncounter(s, T.dwarf);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === T.streets));
});
test("Second-stage Time offers Bellach attacking Nalir only when Bellach is in play", () => {
  let s = final();
  s.tharbad!.time = 1;
  removeQuestTime(s);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["threat"],
  );
  s = choose(reload(s), "threat");
  s = settle(s);
  assert.equal(s.threat, 23);
  assert.equal(s.tharbad!.time, 3);
  const b = enemy(s, T.bellach);
  s.tharbad!.time = 1;
  s.encounterDeck = [T.crossing];
  removeQuestTime(s);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === "attack"));
  s = choose(reload(s), "attack");
  assert.equal(s.combat!.enemyId, b.id);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(tharbadNalir(s)!.damage, 0);
  assert.equal(s.tharbad!.time, 3);
});
test("Every character departure at stage two raises its controller’s threat, including hand returns", () => {
  let s = final(2);
  let a: Unit;
  forOwner(s, 1, () => {
    a = make(s, "01014");
    s.allies.push(a);
  });
  returnAlly(s, a!);
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 22);
});
for (const players of [1, 2, 3, 4])
  test(`Crossing ${players} players is immune, cannot travel, scales quest points and wins on quest-effect exploration`, () => {
    let s = final(players);
    const l = s.staging.find((u) => u.code === T.crossing)!;
    assert.equal(locationQuest(s, l), 10 + 2 * players);
    s.phase = "travel";
    assert.match(canTravel(s, l)!, /staging/);
    effect(s, fx("locationProgress", { target: l.id, value: 100 }));
    assert.equal(l.progress, 0);
    progress(s, 9 + 2 * players);
    s = settle(s);
    assert.equal(s.status, "playing");
    progress(s, 1);
    s = settle(s);
    assert.equal(s.status, "won");
  });
test("Seedy Inn shadows raise the defending player’s threat by actual damage, once per physical shadow", () => {
  let s = base();
  const e = enemy(s, T.spy);
  s.encounterDeck = [T.inn];
  effect(s, fx("immediateAttack", { target: e.id }));
  flush(s);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.threat, 21);
});
test("Threshold shadows use the defending player’s current threat and Dwarf undefended shadow hits Nalir separately", () => {
  const s = base(),
    e = enemy(s);
  s.combat = { enemyId: e.id, attackBonus: 0, defenderId: null };
  tharbadShadow(s, T.cornered);
  assert.equal(s.combat.attackBonus, 2);
  s.threat = 21;
  tharbadShadow(s, T.lot);
  assert.equal(s.combat.attackBonus, 3);
  tharbadShadow(s, T.dwarf);
  flush(s);
  assert.equal(tharbadNalir(s)!.damage, 2);
});
test("Mug removes the physical resolving event after a real reduction, including bottom-of-deck destinations", () => {
  let s = base();
  mugVictory(s);
  const u = make(s, "01046");
  holdPlayedEvent(s, u, true);
  reduceThreat(s, 6, u.id);
  s = settle(s);
  assert.equal(s.threat, 14);
  assert.deepEqual(s.removed, ["01046"]);
  assert.equal(s.discard.includes("01046"), false);
  assert.equal(s.resolvingEvents, undefined);
});
test("A zero reduction does not remove its source and quest reductions never remove player cards", () => {
  let s = base();
  mugVictory(s);
  s.threat = 0;
  s.stageRevealing = true;
  const g = make(s, "01073");
  s.allies.push(g);
  reduceThreat(s, 5, g.id);
  s = settle(s);
  assert.ok(get(s, g.id));
  assert.equal(s.removed.length, 0);
  s.threat = 10;
  reduceThreat(s, 3, undefined, "quest-card");
  s = settle(s);
  assert.equal(s.threat, 7);
  assert.equal(s.removed.length, 0);
});
test("Gandalf’s real entry choice removes Gandalf without a destruction resource response", () => {
  let s = base();
  mugVictory(s);
  attach(s, s.heroes[0], "01042");
  const g = make(s, "01073");
  s.hand = [g];
  s = applyAction(reload(s), { type: "PLAY", id: g.id });
  assert.match(s.choice!.title, /Gandalf/);
  const before = s.heroes[0].resources;
  s = choose(reload(s), "threat");
  s = settle(s);
  assert.equal(s.threat, 15);
  assert.equal(get(s, g.id), undefined);
  assert.ok(s.removed.includes(g.code));
  assert.equal(s.heroes[0].resources, before);
});
test("Galadriel is removed only after the chosen player also draws their card", () => {
  let s = base(2);
  mugVictory(s);
  s.heroes[0].code = "08112";
  const id = s.heroes[0].id,
    n = seatView(s, 1).hand.length;
  useElfAbility(s, s.heroes[0]);
  s = choose(reload(s), "player-1");
  s = settle(s);
  assert.equal(seatView(s, 1).hand.length, n + 1);
  assert.equal(seatView(s, 1).threat, 19);
  assert.equal(get(s, id), undefined);
  assert.ok(seatView(s, 0).removed.includes("08112"));
});
test("Damrod’s discard cost resolves before reduction and Mug removes him from his physical owner’s discard", () => {
  let s = base();
  mugVictory(s);
  s.staging = [make(s, T.spy)];
  const damrod = make(s, "05010");
  s.allies.push(damrod);
  useHeirsPlayerAbility(s, damrod);
  s = settle(s);
  assert.equal(s.threat, 19);
  assert.ok(s.removed.includes("05010"));
  assert.equal(s.discard.includes("05010"), false);
});
test("A borrowed threat-reducing attachment is removed to its owner while the hero stays in play", () => {
  let s = base(2);
  mugVictory(s);
  const h = s.heroes[0],
    a = attach(s, h, "04082", 1);
  reduceThreat(s, 1, { id: a.id, code: a.code });
  s = settle(s);
  assert.ok(get(s, h.id));
  assert.equal(get(s, h.id)!.attachments.length, 0);
  assert.ok(seatView(s, 1).removed.includes("04082"));
  assert.equal(seatView(s, 0).removed.length, 0);
});
test("Aragorn’s starting-threat reset respects Mug prevention and removes its hero source after real reduction", () => {
  let s = base();
  s.phase = "refresh";
  s.heroes[0].code = "04053";
  s.threat = 40;
  s.activeLocation = make(s, T.mug);
  useWatcherPlayerAbility(s, s.heroes[0]);
  assert.equal(s.threat, 40);
  s.used = [];
  s.activeLocation = null;
  mugVictory(s);
  const id = s.heroes[0].id;
  useWatcherPlayerAbility(s, s.heroes[0]);
  s = settle(s);
  assert.equal(s.threat, s.startingThreat);
  assert.equal(get(s, id), undefined);
  assert.ok(s.removed.includes("04053"));
});
test("Fall of Gil-Galad is removed from victory after reducing threat, retaining the attachment owner", () => {
  let s = base(2);
  mugVictory(s);
  forOwner(s, 1, () => s.discard.push("08007"));
  effect(
    s,
    fx("dunlandFallVictory", {
      owner: 1,
      value: 0,
      count: 7,
      source: "fallen-song",
    }),
  );
  s = settle(s);
  assert.equal(s.threat, 13);
  assert.equal(s.victoryCards!.includes("08007"), false);
  assert.ok(seatView(s, 1).removed.includes("08007"));
});
test("Saved threat limits, source removals, round bonuses and Nalir attacks reject malformed values", () => {
  const s = base();
  assert.ok(validateSave(s));
  for (const change of [
    (s: GameState) => {
      s.tharbad!.elimination = 35;
    },
    (s: GameState) => {
      s.tharbad!.time = -1;
    },
    (s: GameState) => {
      s.tharbad!.setAside[1].id = s.tharbad!.setAside[0].id;
    },
    (s: GameState) => {
      s.tharbad!.removedSources = ["x", "x"];
    },
    (s: GameState) => {
      s.queue = [
        { kind: "immediateAttack", damageTarget: 12 as unknown as string },
      ];
    },
  ]) {
    const x = structuredClone(s);
    change(x);
    assert.equal(validateSave(x), false);
  }
  s.tharbad!.elimination = 30;
  const p = publicState(s);
  assert.equal(p.threatElimination, 30);
  assert.equal(p.questTime, 4);
});
test("Mug removes the exact second copy of an ally, keeping an earlier copy in play", () => {
  let s = base();
  mugVictory(s);
  const a = make(s, "08117"),
    b = make(s, "08117");
  s.allies.push(a, b);
  reduceThreat(s, 1, { id: b.id, code: b.code });
  s = settle(s);
  assert.ok(get(s, a.id));
  assert.equal(get(s, b.id), undefined);
  assert.deepEqual(s.removed, ["08117"]);
});
test("An unavailable explicit source never removes a different physical copy", () => {
  let s = base();
  mugVictory(s);
  const a = make(s, "08117");
  s.allies.push(a);
  reduceThreat(s, 1, { id: "already-gone", code: a.code });
  s = settle(s);
  assert.ok(get(s, a.id));
  assert.equal(s.removed.length, 0);
});
test("A multiplayer Greeting removes its borrowed physical event once after reducing every player", () => {
  let s = base(2);
  mugVictory(s);
  s.heroes[0].code = "01007";
  const g = make(s, "01046");
  g.owner = 1;
  s.hand = [g];
  s = applyAction(reload(s), { type: "PLAY", id: g.id });
  s = choose(reload(s), "everyone");
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 18);
  assert.equal(seatView(s, 1).threat, 18);
  assert.deepEqual(seatView(s, 1).removed, ["01046"]);
  assert.equal(seatView(s, 0).removed.length, 0);
});
test("Removing borrowed Gandalf raises his controller’s stage-two threat but returns him to his physical owner", () => {
  let s = final(2);
  mugVictory(s);
  const g = make(s, "01073");
  g.owner = 1;
  s.hand = [g];
  s = applyAction(reload(s), { type: "PLAY", id: g.id });
  s = choose(reload(s), "threat");
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 17);
  assert.equal(seatView(s, 1).threat, 20);
  assert.deepEqual(seatView(s, 1).removed, ["01073"]);
});
test("Elfhelm’s reduction removes Elfhelm before the departure threat can trigger another response", () => {
  let s = final();
  mugVictory(s);
  const e = make(s, "02100");
  s.allies.push(e);
  raiseThreat(s, 1, "encounter");
  flush(s);
  s = choose(reload(s), "reduce");
  s = settle(s);
  assert.equal(s.threat, 22);
  assert.equal(get(s, e.id), undefined);
  assert.deepEqual(s.removed, ["02100"]);
  assert.equal(s.choice, null);
});
for (const prevention of ["feint", "snare"])
  test(`Stage-two Time cannot choose Bellach’s prevented attack (${prevention})`, () => {
    let s = final();
    const b = enemy(s, T.bellach);
    if (prevention === "feint") b.feinted = true;
    else attach(s, b, "01069");
    s.tharbad!.time = 1;
    removeQuestTime(s);
    flush(s);
    assert.deepEqual(
      s.choice!.options.map((o) => o.id),
      ["threat"],
    );
  });
test("Bellach can attack Nalir across fellowships while retaining his engagement and defender restrictions", () => {
  let s = final(2);
  const b = enemy(s, T.bellach, 1),
    own = s.heroes[0];
  s.encounterDeck = [T.crossing];
  s.tharbad!.time = 1;
  removeQuestTime(s);
  flush(s);
  s = choose(reload(s), "attack");
  assert.ok(s.choice!.options.some((o) => o.id === own.id));
  assert.ok(
    seatView(s, 1)
      .heroes.filter((h) => !/Sentinel/.test(card(h.code).text ?? ""))
      .every((h) => !s.choice!.options.some((o) => o.id === h.id)),
  );
  s = choose(reload(s), own.id);
  s = settle(s);
  assert.equal(ownerOf(s, get(s, b.id)!), 1);
  assert.equal(tharbadNalir(s)!.damage, 0);
  assert.equal(s.tharbad!.time, 3);
});
