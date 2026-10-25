import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  canPlay,
  canTravel,
  publicState,
  validateSave,
} from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  draw,
  fx,
  get,
  locationQuest,
  make,
  stageInfo,
  stagingThreat,
  stats,
  threatOf,
} from "../src/game/core";
import {
  check,
  damage,
  discardLocation,
  engage,
  progressLocation,
  raiseThreat,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  syncSeat,
  selectSeat,
} from "../src/game/table";
import { addQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "../src/game/rhosgobel";
import { threatEliminationLevel } from "../src/game/tharbad-support";
import { reduceThreat } from "../src/game/threat-reduction";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import {
  TEMPLE_DOOM as T,
  TEMPLE_DOOM_POWER,
  TEMPLE_DOOM_QUESTS,
  TEMPLE_DOOM_STAGE_TWOS,
  templeDoomPublicState,
  templeDoomQuestCount,
} from "../src/game/temple-doom-support";
import { TEMPLE_DOOM_HOOKS, templeDoomShadow } from "../src/game/temple-doom";
import { SHADOW_EAST as E } from "../src/game/shadow-east-encounters";
import { base, choose, reload, settle, start } from "./temple-doom-fixtures";
import type { GameState, Unit } from "../src/game/types";

const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const boss = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].find((u) => u.code === T.ulchor)!;
const tribute = (s: GameState) => s.staging.find((u) => u.code === T.tribute)!;
function finish(s: GameState) {
  check(s);
  flush(s);
  return settle(s);
}
function stage(s: GameState, code: string, completed = 1) {
  const q = s.templeDoom!;
  q.currentQuest = code;
  s.stage = 2;
  s.progress = 0;
  q.questResources = 2;
  s.victoryCards = [
    T.first,
    ...TEMPLE_DOOM_STAGE_TWOS.filter((c) => c !== code),
  ].slice(0, completed);
  q.questDeck = TEMPLE_DOOM_STAGE_TWOS.filter(
    (c) => c !== code && !s.victoryCards!.includes(c),
  );
}
function reveal(s: GameState, code: string) {
  revealed(s, code);
  flush(s);
  return settle(s);
}
function enemy(s: GameState, code: string, player = 0) {
  const u = make(s, code);
  u.owner = player;
  forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function shadow(s: GameState, code: string, defender?: Unit) {
  const e = enemy(s, E.raider);
  s.combat = {
    enemyId: e.id,
    defenderId: defender?.id ?? null,
    defenderIds: defender ? [defender.id] : [],
    attackBonus: 0,
  };
  templeDoomShadow(s, code);
  return e;
}

for (const easy of [false, true])
  for (const count of [1, 2, 3, 4])
    test(`Temple of Doom original ${easy ? "easy" : "normal"} ${count}-player native setup preserves both decks and every quest`, () => {
      const s = start(count, easy, 899, false, true);
      assert.equal(s.encounterDeck.length, easy ? 25 : 37);
      assert.equal(s.templeDoom!.powerDeck.length, 5);
      assert.deepEqual(
        [...s.templeDoom!.powerDeck].sort(),
        [...TEMPLE_DOOM_POWER].sort(),
      );
      assert.deepEqual(
        [...s.templeDoom!.questDeck].sort(),
        [...TEMPLE_DOOM_STAGE_TWOS].sort(),
      );
      assert.equal(s.staging.length, 2);
      assert.equal(stageInfo(s).quest, 0);
      assert.equal(tribute(s).damage, 0);
      assert.equal(boss(s).damage, 0);
      assert.ok(validateSave(reload(s)));
    });
test("Temple source corrections retain native quest numbers, goals, shadows and quest-skip text", () => {
  assert.match(card(T.first).back_text!, /Skip the quest phase/);
  for (const code of TEMPLE_DOOM_STAGE_TWOS) {
    assert.equal(Number(card(code).cost), 2);
    assert.equal(card(code).victory, 1);
  }
  assert.equal(card(T.tribute).quest, 12);
  assert.equal(card(T.lost).quest, 8);
  assert.match(card(T.tunnel).shadow!, /top card/i);
  assert.match(card(T.shadows).shadow!, /cannot ready/i);
  assert.equal(card(T.ulchor).health, 9);
});
test("first planning end skips the entire quest; second advances before the next quest phase", () => {
  let s = base();
  s = settle(applyAction(reload(s), { type: "NEXT" }));
  assert.equal(s.phase, "travel");
  assert.equal(s.templeDoom!.questResources, 1);
  assert.equal(s.encounterDeck.length, 30);
  s.phase = "planning";
  s = settle(applyAction(reload(s), { type: "NEXT" }));
  assert.equal(s.stage, 2);
  assert.equal(s.phase, "quest");
  assert.equal(templeDoomQuestCount(s), 1);
  assert.equal(s.templeDoom!.questDeck.length, 3);
  assert.ok(s.staging.some((u) => u.code === T.temple));
});
for (const code of TEMPLE_DOOM_STAGE_TWOS)
  test(`${card(code).name} advances physically before four completed stages, then prevents further progress`, () => {
    let s = base();
    stage(s, code, 1);
    s.templeDoom!.lordLimit = { round: s.round, value: 100, placed: 0 };
    addQuestProgress(s, mainQuestUnit(s)!, 99);
    s = finish(s);
    assert.ok(s.victoryCards!.includes(code));
    assert.notEqual(s.templeDoom!.currentQuest, code);
    s = base();
    stage(s, code, 4);
    s.templeDoom!.lordLimit = { round: s.round, value: 100, placed: 0 };
    addQuestProgress(s, mainQuestUnit(s)!, 99);
    s = finish(s);
    assert.equal(s.progress, 0);
    assert.equal(s.templeDoom!.currentQuest, code);
  });
test("only main quest stages contribute to X, including the highest shadow and location values", () => {
  const s = base();
  stage(s, T.memory, 2);
  s.victoryCards!.push(T.lost, E.warriors, "09014");
  const hall = staged(s, T.hall);
  assert.equal(templeDoomQuestCount(s), 2);
  assert.equal(threatOf(s, hall), 3);
  assert.equal(threatOf(s, boss(s)), 3);
  shadow(s, T.temple);
  assert.equal(s.combat!.attackBonus, 2);
});
test("a stage stays on side A without progress while its When Revealed sequence is pending", () => {
  let s = base();
  stage(s, T.legacy);
  s.stageRevealing = true;
  s = reload(s);
  assert.equal(stageInfo(s).side, "A");
  assert.equal(stageInfo(s).quest, 0);
  assert.equal(stageInfo(s).questImage, card(T.legacy).imagesrc);
  assert.deepEqual(TEMPLE_DOOM_HOOKS.questBegin!(s), []);
  addQuestProgress(s, mainQuestUnit(s)!, 5);
  assert.equal(s.progress, 0);
  handle(s, fx("doomFinishStage"));
  assert.equal(stageInfo(s).side, "B");
  assert.equal(stageInfo(s).quest, 8);
  assert.equal(TEMPLE_DOOM_HOOKS.questBegin!(s)!.length, 1);
  addQuestProgress(s, mainQuestUnit(s)!, 5);
  assert.equal(s.progress, 5);
});
test("Memory counts different discarded card types and only modifies the quest phase", () => {
  let s = base();
  stage(s, T.memory, 2);
  s.phase = "quest";
  s.encounterDeck = [T.temple, E.raider, T.shadows, T.temple];
  handle(s, fx("doomMemory"));
  s = finish(s);
  assert.deepEqual(s.encounterDiscard.slice(0, 3), [
    T.temple,
    E.raider,
    T.shadows,
  ]);
  assert.equal(s.templeDoom!.memoryThreat.value, 6);
  const withBonus = stagingThreat(s);
  s.phase = "travel";
  assert.equal(stagingThreat(s), withBonus - 6);
});
test("Shrine discards matching controlled and hand copies while retaining the other player's copies", () => {
  let s = base(2);
  stage(s, T.shrine);
  const local = make(s, "01073"),
    hand = make(s, "01073"),
    remote = make(s, "01073");
  forOwner(s, 0, () => {
    s.deck = ["01073", "01014", "01041"];
    s.allies.push(local);
    s.hand.push(hand);
  });
  forOwner(s, 1, () => s.allies.push(remote));
  handle(s, fx("doomShrine", { player: 0 }));
  s = finish(s);
  assert.equal(seatView(s, 0).discard.filter((c) => c === "01073").length, 3);
  assert.ok(seatView(s, 1).allies.some((u) => u.id === remote.id));
});
test("Shrine follows the Rules Reference definition of copies by title across ally and hero printings", () => {
  let s = base();
  stage(s, T.shrine);
  s.heroes[0].code = "06081";
  s.startingHeroes[0] = "06081";
  s.deck = ["21005", "01041", "01016"];
  handle(s, fx("doomShrine", { player: 0 }));
  s = finish(s);
  assert.equal(
    s.heroes.some((u) => card(u.code).name === "Faramir"),
    false,
  );
  assert.ok(s.discard.includes("06081"));
  assert.ok(s.discard.includes("21005"));
});
test("Lord's saved per-player discard choices set and consume one round's combined progress cap", () => {
  let s = base(2);
  stage(s, T.lord);
  forOwner(s, 0, () => s.hand.push(make(s, "01073")));
  forOwner(s, 1, () => s.hand.push(make(s, "01041")));
  s.queue.push(...TEMPLE_DOOM_HOOKS.questBegin!(s)!);
  flush(s);
  s = choose(reload(s), s.choice!.options[0].id);
  s = settle(s);
  assert.equal(s.templeDoom!.lordLimit.value, 7);
  assert.equal(stageInfo(s).quest, 8);
  addQuestProgress(s, mainQuestUnit(s)!, 4);
  addQuestProgress(s, mainQuestUnit(s)!, 4);
  assert.equal(s.progress, 7);
  assert.equal(s.templeDoom!.lordLimit.placed, 7);
  assert.ok(validateSave(reload(s)));
});
test("Legacy damages and exhausts a selected hero, preventing healing and readying until refresh", () => {
  let s = base();
  stage(s, T.legacy);
  s.phase = "quest";
  handle(s, fx("doomLegacy", { player: 0 }));
  flush(s);
  const id = s.heroes[0].id;
  s = choose(reload(s), id);
  const hero = get(s, id)!;
  assert.equal(hero.damage, 1);
  assert.equal(hero.exhausted, true);
  assert.equal(rhosgobelHealingAllowed(s, hero), false);
  assert.equal(rhosgobelHeal(s, hero, 5), 0);
  assert.equal(TEMPLE_DOOM_HOOKS.cannotReady!(s, hero), true);
  s.phase = "refresh";
  assert.equal(TEMPLE_DOOM_HOOKS.cannotReady!(s, hero), false);
  assert.equal(rhosgobelHeal(s, hero, 5), 1);
});
test("Tribute removes exactly four damage and reveals from the separate Power deck only at round end", () => {
  let s = base();
  tribute(s).damage = 7;
  s.templeDoom!.powerDeck = [T.armies, T.tower];
  s.phase = "refresh";
  handle(s, fx("doomRoundEnd"));
  s = finish(s);
  assert.equal(tribute(s).damage, 4);
  assert.deepEqual(s.templeDoom!.powerDeck, [T.tower]);
  assert.ok(s.staging.some((u) => u.code === T.armies));
  assert.equal(s.encounterDeck.length, 30);
  handle(s, fx("doomRoundEnd"));
  s = finish(s);
  assert.equal(tribute(s).damage, 1);
  assert.ok(s.staging.some((u) => u.code === T.tower));
});
test("the sixth required Power reveal loses, but an empty Power deck alone does not", () => {
  let s = base();
  s.templeDoom!.powerDeck = [];
  s = finish(s);
  assert.equal(s.status, "playing");
  tribute(s).damage = 3;
  handle(s, fx("doomRoundEnd"));
  s = finish(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Power of Mordor/);
});
test("Power deck order and cards below threat dials are absent from public views", () => {
  let s = base(2);
  s = reveal(s, T.lost);
  const before = JSON.stringify(publicState(s)),
    beforePanel = JSON.stringify(templeDoomPublicState(s));
  s.templeDoom!.powerDeck.reverse();
  s.templeDoom!.questDeck.reverse();
  for (const g of s.templeDoom!.underDial) g.cards.reverse();
  assert.equal(JSON.stringify(publicState(s)), before);
  assert.equal(JSON.stringify(templeDoomPublicState(s)), beforePanel);
});
test("Lost in the Dark stores ten physical cards each, discards once per threat raise, and shuffles survivors back", () => {
  let s = base(2);
  const lengths = playerOrder(s).map((p) => seatView(s, p).deck.length);
  s = reveal(s, T.lost);
  assert.deepEqual(
    s.templeDoom!.underDial.map((g) => g.cards.length),
    [10, 10],
  );
  forOwner(s, 1, () => raiseThreat(s, 4, "encounter"));
  flush(s);
  assert.deepEqual(
    s.templeDoom!.underDial.map((g) => g.cards.length),
    [10, 9],
  );
  const lost = s.staging.find((u) => u.code === T.lost)!;
  addQuestProgress(s, lost, 8);
  s = finish(s);
  assert.equal(s.templeDoom!.underDial.length, 0);
  assert.equal(seatView(s, 0).deck.length, lengths[0]);
  assert.equal(seatView(s, 1).deck.length, lengths[1] - 1);
  assert.ok(validateSave(reload(s)));
});
test("Under the Watchful Eye uses saved discard choices and raises threat once for a multiple-card draw", () => {
  let s = base(2);
  forOwner(s, 1, () => {
    while (s.hand.length < 8) s.hand.push(make(s, "01041"));
  });
  s = reveal(s, T.eye);
  assert.equal(seatView(s, 1).hand.length, 5);
  const old = seatView(s, 1).threat;
  forOwner(s, 1, () => draw(s, 3));
  flush(s);
  assert.equal(seatView(s, 1).threat, old + 1);
  assert.equal(seatView(s, 1).hand.length, 8);
});
test("an eliminated player's hidden threat-dial cards are archived and never return to their deck", () => {
  let s = base(2);
  s = reveal(s, T.lost);
  const held = s
    .templeDoom!.underDial.find((g) => g.player === 1)!
    .cards.map((u) => u.code);
  const expectedCounts = new Map<string, number>();
  for (const code of held)
    expectedCounts.set(code, (expectedCounts.get(code) ?? 0) + 1);
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  s = finish(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(seatView(s, 1).deck.length, 0);
  assert.equal(
    s.templeDoom!.underDial.some((g) => g.player === 1),
    false,
  );
  for (const [code, count] of expectedCounts)
    assert.ok(seatView(s, 1).discard.filter((c) => c === code).length >= count);
  const archived = [...seatView(s, 1).discard];
  addQuestProgress(
    s,
    s.staging.find((u) => u.code === T.lost)!,
    8,
  );
  s = finish(s);
  assert.equal(seatView(s, 1).deck.length, 0);
  assert.deepEqual(seatView(s, 1).discard, archived);
  assert.ok(validateSave(reload(s)));
});
test("Tower's threat elimination reduction is live for every player and travel is forbidden", () => {
  let s = base(2);
  const tower = staged(s, T.tower);
  for (const p of playerOrder(s))
    forOwner(s, p, () => assert.equal(threatEliminationLevel(s), 45));
  s.phase = "travel";
  assert.match(canTravel(s, tower)!, /cannot travel/);
  progressLocation(s, tower, 50);
  assert.ok(s.staging.some((u) => u.id === tower.id));
  forOwner(s, 1, () => {
    s.threat = 45;
  });
  s = finish(s);
  assert.equal(s.table!.seats[1].eliminated, true);
});
test("Covered in Darkness retains Doomed5 and caps each player's actual card reduction per round", () => {
  let s = base(2);
  s = reveal(s, T.darkness);
  assert.equal(seatView(s, 0).threat, 25);
  assert.equal(seatView(s, 1).threat, 25);
  forOwner(s, 0, () => {
    assert.equal(reduceThreat(s, 5), 1);
    assert.equal(reduceThreat(s, 5), 0);
    assert.equal(reduceThreat(s, 3, undefined, "quest-card"), 3);
  });
  forOwner(s, 1, () => assert.equal(reduceThreat(s, 5), 1));
  s.round++;
  forOwner(s, 0, () => assert.equal(reduceThreat(s, 5), 1));
});
test("Armies prevents damage to an engaged nonunique enemy through round end, not unique enemies", () => {
  const s = base();
  staged(s, T.armies);
  const raider = staged(s, E.raider),
    khamul = staged(s, T.khamul);
  engage(s, raider);
  flush(s);
  damage(s, raider.id, 2);
  assert.equal(raider.damage, 0);
  engage(s, khamul);
  damage(s, khamul.id, 2);
  assert.equal(khamul.damage, 2);
  s.round++;
  damage(s, raider.id, 2);
  assert.equal(raider.damage, 2);
});
test("Faramir's complete response deals damage before Armies' after-engagement Forced protection", () => {
  let s = base(4);
  staged(s, T.armies);
  const raider = staged(s, E.raider);
  s.table!.turn = 3;
  selectSeat(s, 3);
  const faramir = make(s, "21005");
  s.hand.push(faramir);
  s = applyAction(reload(s), { type: "PLAY", id: faramir.id });
  s = settle(s, "use");
  assert.equal(get(s, raider.id)!.damage, 2);
  assert.equal(ownerOf(s, get(s, raider.id)!), 3);
  damage(s, raider.id, 1);
  assert.equal(get(s, raider.id)!.damage, 2);
});
test("Khamûl follows the first player and rejects remote attackers and defenders", () => {
  let s = base(2);
  const k = staged(s, T.khamul);
  s = finish(s);
  assert.equal(ownerOf(s, get(s, k.id)!), firstPlayer(s));
  assert.equal(
    TEMPLE_DOOM_HOOKS.cannotAttack!(s, seatView(s, 1).heroes[0], get(s, k.id)!),
    true,
  );
  assert.equal(
    TEMPLE_DOOM_HOOKS.cannotDefend!(s, get(s, k.id)!, seatView(s, 1).heroes[0]),
    true,
  );
  s.table!.first = 1;
  s = finish(s);
  assert.equal(ownerOf(s, get(s, k.id)!), 1);
});
test("Ulchor cannot engage before four completed main stages, then his Guards follow his engaged player", () => {
  let s = base(2);
  const guard = staged(s, T.guard);
  engage(s, boss(s));
  assert.ok(s.staging.some((u) => u.code === T.ulchor));
  stage(s, T.memory, 4);
  forOwner(s, 1, () => engage(s, boss(s)));
  s = finish(s);
  assert.equal(ownerOf(s, boss(s)), 1);
  assert.equal(ownerOf(s, get(s, guard.id)!), 1);
});
test("Tribute is unavailable while Ulchor has hit points; an actual attack reduces him to zero hit points and opens the final quest", () => {
  let s = base();
  stage(s, T.memory, 4);
  handle(s, fx("sideQuestChoose"));
  flush(s);
  assert.ok(!s.choice!.options.some((o) => o.code === T.tribute));
  s = choose(s, "main");
  engage(s, boss(s));
  s.phase = "attack";
  const hero = s.heroes[0];
  hero.tempAttack = 20;
  s = settle(
    applyAction(reload(s), {
      type: "ATTACK",
      enemyId: boss(s).id,
      attackerIds: [hero.id],
    }),
  );
  assert.ok(boss(s).damage >= stats(s, boss(s)).health);
  assert.equal(s.status, "playing");
  s.phase = "quest";
  handle(s, fx("sideQuestChoose"));
  flush(s);
  const option = s.choice!.options.find((o) => o.code === T.tribute)!;
  assert.ok(option);
  s = choose(reload(s), option.id);
  addQuestProgress(s, tribute(s), 12);
  s = finish(s);
  assert.equal(s.status, "won");
});
test("Crumbling Passage replaces all active locations; leaving deals one damage to each exhausted character", () => {
  let s = base(2);
  const prior = make(s, T.temple);
  s.activeLocation = prior;
  const old = make(s, T.opening);
  s.extraActiveLocations = [old];
  s.heroes[0].exhausted = true;
  forOwner(s, 1, () => {
    s.heroes[1].exhausted = true;
  });
  s = reveal(s, T.passage);
  const passage = s.activeLocation!;
  assert.equal(passage.code, T.passage);
  assert.equal(s.extraActiveLocations!.length, 0);
  assert.ok(s.staging.some((u) => u.id === prior.id));
  assert.ok(s.staging.some((u) => u.id === old.id));
  progressLocation(s, passage, 3);
  s = finish(s);
  assert.equal(seatView(s, 0).heroes[0].damage, 1);
  assert.equal(seatView(s, 1).heroes[1].damage, 1);
});
test("Narrow Opening counts cards played earlier in the round and allows one per player", () => {
  let s = base(2);
  forOwner(s, 0, () => s.hand.push(make(s, "01016")));
  const id = seatView(s, 0).hand[0].id;
  s = settle(applyAction(reload(s), { type: "PLAY", id }));
  s.activeLocation = make(s, T.opening);
  forOwner(s, 0, () => {
    const a = make(s, "01016");
    s.hand.push(a);
    assert.match(canPlay(s, a)!, /only one/);
  });
  s = settle(applyAction(reload(s), { type: "NEXT" }));
  forOwner(s, 1, () => {
    const a = make(s, "01073");
    s.hand.push(a);
    assert.equal(canPlay(s, a), null);
  });
});
test("Temple and Hall leaving trigger both when explored and when discarded", () => {
  let s = base();
  const temple = staged(s, T.temple);
  discardLocation(s, temple);
  s = finish(s);
  assert.equal(tribute(s).damage, 1);
  stage(s, T.memory, 2);
  const hall = staged(s, T.hall);
  progressLocation(s, hall, 5);
  flush(s);
  const id = s.heroes[0].id;
  s = choose(reload(s), id);
  assert.equal(get(s, id)!.damage, 3);
});
test("Narrow Opening's leaving effect discards one physical random card from each player's own hand", () => {
  let s = base(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => s.hand.push(make(s, p === 0 ? "01016" : "01041")));
  const opening = staged(s, T.opening);
  discardLocation(s, opening);
  s = finish(s);
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.ok(seatView(s, 0).discard.includes("01016"));
  assert.ok(seatView(s, 1).discard.includes("01041"));
});
test("Fearful Shadows blanks characters only and its distinct shadow prevents readying through refresh", () => {
  let s = base();
  s = reveal(s, T.shadows);
  assert.equal(s.heroes[0].blanked, true);
  assert.equal(boss(s).blanked, undefined);
  assert.equal(s.heroes[0].printedTraitsPreserved, true);
  shadow(s, T.shadows, s.heroes[0]);
  s.phase = "refresh";
  assert.equal(TEMPLE_DOOM_HOOKS.cannotReady!(s, s.heroes[0]), true);
  s.round++;
  check(s);
  assert.equal(s.heroes[0].blanked, undefined);
  assert.equal(TEMPLE_DOOM_HOOKS.cannotReady!(s, s.heroes[0]), false);
});
test("Twisted Tunnel's reveal discards until an enemy; its shadow discards exactly one", () => {
  let s = base();
  s.encounterDeck = [T.temple, T.shadows, E.raider, T.temple];
  s = reveal(s, T.tunnel);
  assert.ok(s.staging.some((u) => u.code === E.raider));
  assert.deepEqual(s.encounterDiscard, [T.temple, T.shadows]);
  assert.equal(s.encounterDeck.length, 1);
  s.encounterDeck = [T.temple, E.raider];
  shadow(s, T.tunnel);
  assert.deepEqual(s.encounterDeck, [E.raider]);
  shadow(s, T.tunnel);
  assert.equal(s.staging.filter((u) => u.code === E.raider).length, 2);
});
test("Ulchor's Guard shadow grants defense through the phase and clears at the phase boundary", () => {
  const s = base();
  const enemy = shadow(s, T.guard);
  assert.equal(stats(s, enemy).defense, card(enemy.code).defense! + 2);
  s.phase = "defense";
  handle(s, fx("phaseEnd"));
  assert.equal(stats(s, enemy).defense, card(enemy.code).defense);
});
test("Fanaticism chooses among tied lowest defense, retains its physical card, and grants immunity", () => {
  let s = base();
  const a = staged(s, E.raider),
    b = staged(s, E.raider);
  revealed(s, T.fanaticism);
  flush(s);
  assert.equal(s.choice!.options.length, 2);
  const physical = s.templeDoom!.resolving[0].id;
  s = choose(reload(s), b.id);
  const attached = get(s, b.id)!;
  assert.ok(attached.attachments.some((a) => a.id === physical));
  assert.equal(get(s, a.id)!.attachments.length, 0);
  assert.equal(stats(s, attached).attack, 4);
  assert.equal(stats(s, attached).defense, 4);
  assert.equal(threatOf(s, attached), 3);
  assert.equal(playerEffectImmune(s, attached, "01073"), true);
});
test("Place of Evil saves its damage-or-surge decision and retains the resolving treachery", () => {
  let s = base();
  revealed(s, T.evil);
  flush(s);
  assert.equal(tribute(s).damage, 1);
  assert.equal(s.templeDoom!.resolving.length, 1);
  s = choose(reload(s), "tribute");
  assert.equal(tribute(s).damage, 2);
  assert.equal(s.templeDoom!.resolving.length, 0);
  assert.ok(s.encounterDiscard.includes(T.evil));
});
test("Fanaticism without an eligible target and Place of Evil's surge choice each reveal one encounter", () => {
  let s = base();
  s = reveal(s, T.fanaticism);
  assert.equal(s.encounterDeck.length, 29);
  revealed(s, T.evil);
  flush(s);
  s = choose(reload(s), "surge");
  assert.equal(s.encounterDeck.length, 28);
  assert.equal(tribute(s).damage, 1);
});
test("stacked Place of Evil shadows add damage once per destroyed-character attack, alongside Ulchor", () => {
  let s = base();
  stage(s, T.memory, 4);
  const defender = make(s, "01028");
  s.allies.push(defender);
  engage(s, boss(s));
  s.phase = "defense";
  const b = boss(s);
  b.shadows = [T.evil, T.evil];
  s = settle(
    applyAction(reload(s), {
      type: "DEFEND",
      enemyId: b.id,
      defenderId: defender.id,
    }),
  );
  assert.equal(
    s.allies.some((u) => u.id === defender.id),
    false,
  );
  assert.equal(tribute(s).damage, 3);
});
test("Ulchor's Rage surges when the attack is prevented", () => {
  let s = base();
  boss(s).feinted = true;
  s = reveal(s, T.rage);
  assert.equal(s.encounterDeck.length, 29);
  assert.ok(s.staging.some((u) => u.code === T.temple));
});
test("invalid hidden decks and restriction saves are rejected without exposing their order", () => {
  const s = base();
  const bad = JSON.parse(JSON.stringify(s));
  bad.templeDoom.powerDeck.push(T.armies);
  assert.equal(validateSave(bad), false);
  const bad2 = JSON.parse(JSON.stringify(s));
  bad2.templeDoom.restrictions.push({
    id: s.heroes[0].id,
    round: s.round + 1,
    until: "refresh",
  });
  assert.equal(validateSave(bad2), false);
});
