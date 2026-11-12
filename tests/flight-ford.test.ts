import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  make,
  stats,
  threatOf,
} from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import { playerOrder, seatView } from "../src/game/table";
import {
  ONE_RING,
  SAGA_FRODO,
  oneRing,
  ringBearer,
} from "../src/game/lotr-saga";
import {
  FF,
  FLIGHT_FORD_HOOKS as H,
  FLIGHT_FORD_RECIPES,
  flightFordPublicState,
  flightFordStageInfo,
} from "../src/game/flight-ford";
import {
  allies,
  base,
  choose,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./flight-ford-fixtures";
import { KD } from "../src/game/knife-dark-support";
import type { Effect, GameState } from "../src/game/types";

const run = (s: GameState) => {
  flush(s);
  return s;
};
const play = (s: GameState, ...effects: Effect[]) => {
  s.queue.push(...effects);
  return run(s);
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** Reveal one encounter card as the given player during staging. */
const reveal = (
  s: GameState,
  code: string,
  rest: string[] = [],
  player = 0,
) => {
  s.phase = "staging";
  s.encounterDeck = [code, ...rest];
  handle(s, fx("reveal", { player }));
  return run(s);
};
const life = (s: GameState) => s.flightFord!.life;
/** Begin an attack by an engaged enemy against the first player. */
const attacking = (s: GameState, enemyId: string, defender?: string) => {
  s.combat = {
    enemyId,
    defenderId: defender ?? null,
    defenderIds: defender ? [defender] : [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  return s.combat;
};

test("Setup: An Evil Wound on the Ring-bearer at 15 life, The Last Bridge and 1 Fell Rider per player in the staging area, the other Fell Riders in the encounter deck, Ford of Bruinen and The Witch-king set aside and a burden deck of five", () => {
  for (const [easy, deckSize] of [
    [false, 38],
    [true, 25],
  ] as const) {
    const recipe = FLIGHT_FORD_RECIPES.find(
      (r) => r.mode === (easy ? "easy" : "standard"),
    )!;
    assert.equal(
      recipe.cards
        .filter((c) => c.section === "sharedEncounterDeck")
        .reduce((n, c) => n + c.quantity, 0),
      deckSize,
    );
    for (const players of [1, 2, 4]) {
      const s = start(players, easy, 70 + players);
      assert.equal(s.encounterDeck.length, deckSize + 4 - players);
      assert.equal(
        s.encounterDeck.filter((c) => c === FF.fell).length,
        4 - players,
      );
      assert.deepEqual(
        s.staging.map((u) => u.code).sort(),
        [FF.bridge, ...Array(players).fill(FF.fell)].sort(),
      );
      assert.deepEqual(
        [...s.flightFord!.setAside].sort(),
        [FF.ford, FF.witchKing].sort(),
      );
      assert.equal(s.flightFord!.burdens.length, 5);
      assert.equal(s.flightFord!.life, 15);
      const bearer = ringBearer(s)!;
      assert.equal(bearer.code, SAGA_FRODO);
      assert.deepEqual(
        bearer.attachments.map((a) => a.code).sort(),
        [ONE_RING, FF.wound].sort(),
      );
      assert.equal(s.flightFord!.currentQuest, FF.pursued);
    }
  }
});

test("An Evil Wound: damage to the Ring-bearer reduces his life instead; he cannot be healed; the players lose at zero life", () => {
  const s = base();
  const frodo = ringBearer(s)!;
  play(s, fx("damage", { target: frodo.id, value: 3, player: 0 }));
  assert.equal(get(s, frodo.id)!.damage, 0);
  assert.equal(life(s), 12);
  assert.equal(H.cannotHeal!(s, frodo), true);
  assert.equal(H.cannotHeal!(s, s.heroes[0]), false);
  s.flightFord!.life = 2;
  play(s, fx("damage", { target: frodo.id, value: 5, player: 0 }));
  assert.equal(life(s), 0);
  assert.equal(s.status, "lost");
  assert.match(s.reason ?? "", /life has reached zero/);
});

test("Stage 1B: the players cannot advance unless The Last Bridge is in the victory display; each stage reduces the Ring-bearer's life by 1 at the end of the round", () => {
  let s = base();
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 20, player: 0 }));
  run(s);
  assert.equal(s.stage, 1, "The Last Bridge is not in the victory display");
  s.victoryCards = [FF.bridge];
  handle(s, fx("successfulQuestProgress", { value: 1, player: 0 }));
  run(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.flightFord!.currentQuest, FF.race);
  const t = base();
  play(t, ...H.roundEnd!(t));
  assert.equal(life(t), 14);
});

test("The Last Bridge: X threat for X players and immune to player card effects; travelling there reveals the top burden as if from the encounter deck, and its surge reveals an encounter card", () => {
  for (const players of [1, 3]) {
    const s = base(players);
    const bridge = stage(s, FF.bridge);
    assert.equal(threatOf(s, bridge), players);
    assert.equal(H.immune!(s, bridge), true);
  }
  let s = base();
  const bridge = stage(s, FF.bridge);
  s.flightFord!.burdens = [FF.panicked, FF.fear];
  s.encounterDeck = [FF.oldRoad, FF.oldRoad];
  s.phase = "travel";
  const threat = s.threat;
  s = act(s, { type: "TRAVEL", id: bridge.id });
  s = settle(s);
  assert.equal(s.activeLocation!.id, bridge.id);
  assert.deepEqual(s.flightFord!.burdens, [FF.fear]);
  assert.equal(
    s.threat,
    threat + 3,
    "Panicked: the first player raises threat by 3",
  );
  assert.ok(s.encounterDiscard.includes(FF.panicked));
  assert.ok(
    s.staging.some((u) => u.code === FF.oldRoad),
    "Surge reveals an encounter card",
  );
});

test("Stage 2B adds Ford of Bruinen and The Witch-king; it has 15 quest points, 30 while a Nazgûl enemy is in play; defeating it wins the game", () => {
  let s = base();
  play(s, fx("ffNextStage", { player: 0 }));
  assert.equal(s.stage, 2);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [FF.ford, FF.witchKing].sort(),
  );
  assert.deepEqual(s.flightFord!.setAside, []);
  assert.equal(flightFordStageInfo(s)!.quest, 30);
  s.staging = s.staging.filter((u) => u.code !== FF.witchKing);
  assert.equal(flightFordStageInfo(s)!.quest, 15);
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 15, player: 0 }));
  run(s);
  s = settle(s);
  assert.equal(s.status, "won");
  assert.match(s.reason ?? "", /Race to Rivendell/);
});

test("Ford of Bruinen: immune; travelling there reveals the top encounter card; after it leaves play as an explored location every engaged enemy is discarded", () => {
  let s = base();
  s.stage = 2;
  s.flightFord!.currentQuest = FF.race;
  s.flightFord!.setAside = [];
  const ford = stage(s, FF.ford);
  assert.equal(H.immune!(s, ford), true);
  s.encounterDeck = [FF.oldRoad, FF.oldRoad];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: ford.id });
  s = settle(s);
  assert.equal(s.activeLocation!.id, ford.id);
  assert.ok(
    s.staging.some((u) => u.code === FF.oldRoad),
    "a card is revealed",
  );
  const rider = engaged(s, FF.fell);
  const wraith = engaged(s, FF.ringwraith);
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 6, player: 0 }));
  run(s);
  s = settle(s);
  assert.ok(s.victoryCards!.includes(FF.ford), "Victory 5");
  assert.equal(s.engaged.length, 0);
  assert.ok(s.encounterDiscard.includes(rider.code));
  assert.ok(s.encounterDiscard.includes(wraith.code));
});

test("Fell Rider: at the beginning of the encounter phase the first player engages it or reduces the Ring-bearer's life by 1; no non-Morgul attachments", () => {
  let s = base();
  const rider = stage(s, FF.fell);
  s.phase = "travel";
  s = act(s, { type: "NEXT" });
  for (let n = 0; n < 5 && !/Fell Rider/.test(s.choice?.title ?? ""); n++)
    s = s.choice ? choose(s, s.choice.options[0].id) : act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Fell Rider/);
  s = choose(s, "life");
  assert.equal(life(s), 14);
  assert.ok(s.staging.some((u) => u.id === rider.id));
  let t = base();
  const r2 = stage(t, FF.fell);
  play(t, fx("ffFellRider", { target: r2.id, player: 0 }));
  t = choose(t, "engage");
  assert.ok(t.engaged.some((u) => u.id === r2.id));
  assert.equal(life(t), 15);
  assert.equal(H.cannotAttach!(t, get(t, r2.id)!, "01041"), true);
  assert.equal(H.cannotAttach!(t, get(t, r2.id)!, FF.steed), false);
});

test("The Troll's Camp: while it is the active location each hero gets +1 willpower, +1 attack and +1 defense", () => {
  const s = base();
  const aragorn = s.heroes[0];
  const before = stats(s, aragorn);
  s.activeLocation = make(s, FF.camp);
  const after = stats(s, aragorn);
  assert.deepEqual(
    [after.will, after.attack, after.defense],
    [before.will + 1, before.attack + 1, before.defense + 1],
  );
});

test("Ettenmoors: while it is active Nazgûl enemies get no shadow card in the combat phase; progress placed on it reduces the Ring-bearer's life by 1", () => {
  const s = base();
  s.activeLocation = make(s, FF.ettenmoors);
  const rider = engaged(s, FF.fell);
  assert.equal(H.skipShadowDeal!(s, rider), true);
  s.phase = "defense";
  assert.equal(H.shadowCards!(s, rider, 1), 0);
  const spy = engaged(s, KD.shady);
  assert.equal(H.skipShadowDeal!(s, spy), false, "not a Nazgûl enemy");
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 1, player: 0 }));
  run(s);
  assert.equal(life(s), 14);
});

test("Stricken Dumb: shuffle the top burden into the encounter deck and reveal another card, or raise each player's threat by 3 and end the quest phase without resolving the quest", () => {
  let s = base();
  reveal(s, FF.stricken, [FF.oldRoad, FF.oldRoad]);
  assert.match(s.choice!.title, /Stricken Dumb/);
  s = choose(s, "burden");
  s = settle(s);
  assert.deepEqual(s.flightFord!.burdens, [
    FF.fear,
    FF.eaten,
    FF.panicked,
    FF.overcome,
  ]);
  assert.ok(
    [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
    ].includes(FF.weight),
  );
  // The other option ends the quest phase: no quest resolution, travel begins.
  let t = base();
  t.phase = "quest";
  t.encounterDeck = [FF.stricken, FF.oldRoad, FF.oldRoad];
  const threat = t.threat;
  t = act(t, { type: "TOGGLE_QUEST", id: t.heroes[1].id });
  t = act(t, { type: "COMMIT" });
  for (let n = 0; n < 5 && !/Stricken Dumb/.test(t.choice?.title ?? ""); n++)
    t = choose(
      t,
      t.choice!.options.find((o) => o.id === "skip")?.id ??
        t.choice!.options[0].id,
    );
  t = choose(t, "end");
  t = settle(t);
  assert.equal(t.threat, threat + 3);
  assert.equal(t.phase, "travel");
  assert.equal(t.progress, 0);
  assert.ok(t.heroes.every((h) => !h.committed));
  assert.ok(!t.log.some((l) => /Quest (succeeds|fails)/.test(l.text)));
  // An empty burden deck leaves only the second option.
  let u = base();
  u.flightFord!.burdens = [];
  u.phase = "quest";
  reveal(u, FF.stricken, [FF.oldRoad]);
  assert.equal(u.choice, null);
});

test("The Nine are Abroad: each character's text box is blank until the end of the round; it surges while a Nazgûl enemy is in the staging area; its shadow returns the attacker", () => {
  let s = base();
  reveal(s, FF.nine, [FF.oldRoad]);
  s = settle(s);
  assert.ok(s.heroes.every((h) => h.blanked));
  assert.ok(!s.staging.some((u) => u.code === FF.oldRoad), "no surge");
  assert.equal(flightFordPublicState(s)!.blankThisRound, true);
  s.round += 1;
  assert.equal(
    H.characterBlanked!(s, s.heroes[0]),
    false,
    "until the end of the round",
  );
  let t = base();
  stage(t, FF.fell);
  reveal(t, FF.nine, [FF.oldRoad]);
  t = settle(t);
  assert.ok(
    t.staging.some((u) => u.code === FF.oldRoad),
    "surge",
  );
  const u = base();
  const rider = engaged(u, FF.fell);
  const c = attacking(u, rider.id);
  H.shadow!(u, FF.nine);
  assert.equal(c.spReturn, true);
});

test("Pain Assailed Him: the Ring-bearer loses 1 life and has 0 willpower, attack and defense until the end of the round; its shadow costs 1 life if the attack destroys a character", () => {
  let s = base();
  reveal(s, FF.pain, [FF.oldRoad]);
  s = settle(s);
  assert.equal(life(s), 14);
  const frodo = ringBearer(s)!;
  assert.deepEqual(
    [stats(s, frodo).will, stats(s, frodo).attack, stats(s, frodo).defense],
    [0, 0, 0],
  );
  s.round += 1;
  assert.equal(stats(s, frodo).will, card(SAGA_FRODO).willpower);
  // Shadow: a character destroyed by this attack costs 1 life.
  let t = base();
  const [guard] = allies(t, ["01013"]);
  const rider = engaged(t, FF.fell);
  rider.shadows = [FF.pain];
  t.phase = "defense";
  t = act(t, { type: "DEFEND", enemyId: rider.id, defenderId: guard.id });
  t = settle(t);
  assert.ok(!t.allies.some((u) => u.id === guard.id));
  assert.equal(life(t), 14);
});

test("The Enemy is Upon Us!: each engaged enemy makes an immediate attack, else it surges; its shadow removes all progress when the attack destroys a character", () => {
  let s = base();
  engaged(s, FF.fell);
  reveal(s, FF.uponUs, [FF.oldRoad]);
  assert.match(s.choice!.title, /Immediate attack/);
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.code === FF.oldRoad), "no surge");
  let t = base();
  reveal(t, FF.uponUs, [FF.oldRoad]);
  t = settle(t);
  assert.ok(
    t.staging.some((u) => u.code === FF.oldRoad),
    "surge",
  );
  let u = base();
  u.progress = 7;
  const [guard] = allies(u, ["01013"]);
  const rider = engaged(u, FF.fell);
  rider.shadows = [FF.uponUs];
  u.phase = "defense";
  u = act(u, { type: "DEFEND", enemyId: rider.id, defenderId: guard.id });
  u = settle(u);
  assert.equal(u.progress, 0);
});

test("Weight of the Ring attaches to the Ring-bearer; at the beginning of each quest phase the first player exhausts The One Ring or reveals an additional card this phase", () => {
  let s = base();
  const frodo = ringBearer(s)!;
  reveal(s, FF.weight, [FF.oldRoad, FF.oldRoad]);
  s = settle(s);
  assert.ok(get(s, frodo.id)!.attachments.some((a) => a.code === FF.weight));
  assert.ok(
    s.staging.some((u) => u.code === FF.oldRoad),
    "Surge",
  );
  play(s, ...(H.questBegin!(s) as Effect[]));
  assert.match(s.choice!.title, /Weight of the Ring/);
  s = choose(s, "reveal");
  assert.equal(s.flightFord!.extraReveals, 1);
  assert.equal(H.extraStagingReveals!(s), 1);
  play(s, ...(H.questBegin!(s) as Effect[]));
  s = choose(s, "exhaust");
  assert.equal(s.flightFord!.extraReveals, 0, "reset each quest phase");
  assert.equal(oneRing(s)!.exhausted, true);
  play(s, ...(H.questBegin!(s) as Effect[]));
  assert.equal(s.choice, null, "The One Ring is already exhausted");
  assert.equal(s.flightFord!.extraReveals, 1);
});

test("Fear of Discovery, Eaten Alive!, Panicked and Overcome by Terror resolve for the first player; their shadows hit the defending player", () => {
  // Fear of Discovery: exhaust the Ring-bearer or reveal another card.
  let s = base();
  reveal(s, FF.fear, [FF.oldRoad, FF.oldRoad, FF.oldRoad]);
  s = choose(s, "exhaust");
  s = settle(s);
  assert.equal(ringBearer(s)!.exhausted, true);
  // Eaten Alive!: X damage divided among the first player's heroes.
  let t = base(2);
  const first = t.table!.first;
  reveal(t, FF.eaten, [FF.oldRoad, FF.oldRoad, FF.oldRoad], first);
  const heroes = seatView(t, first).heroes;
  assert.match(
    t.choice!.title,
    /Eaten Alive! · Deal 1 damage to a hero you control \(2 to deal\)/,
  );
  t = choose(t, heroes[0].id);
  t = choose(t, heroes[0].id);
  t = settle(t);
  assert.equal(get(t, heroes[0].id)!.damage, 2);
  // Panicked: the token and the Ring-bearer pass to the next player.
  let u = base(2);
  const before = u.table!.first;
  const threat = seatView(u, before).threat;
  reveal(u, FF.panicked, [FF.oldRoad, FF.oldRoad], before);
  u = settle(u);
  assert.notEqual(u.table!.first, before);
  assert.equal(seatView(u, before).threat, threat + 3);
  assert.ok(
    seatView(u, u.table!.first).heroes.some((h) => h.code === SAGA_FRODO),
  );
  // Overcome by Terror: exhaust The One Ring, else discard 2 cards at random.
  let v = base();
  reveal(v, FF.overcome, [FF.oldRoad, FF.oldRoad]);
  v = settle(v);
  assert.equal(oneRing(v)!.exhausted, true);
  hand(v, ["01013", "01014", "01015"]);
  reveal(v, FF.overcome, [FF.oldRoad, FF.oldRoad]);
  v = settle(v);
  assert.equal(v.hand.length, 1);
  // Shadows.
  const w = base();
  hand(w, ["01013", "01014"]);
  const rider = engaged(w, FF.fell);
  const [ally] = allies(w, ["01014"]);
  attacking(w, rider.id, ally.id);
  const wThreat = w.threat;
  H.shadow!(w, FF.fear);
  assert.equal(w.threat, wThreat + 3);
  H.shadow!(w, FF.eaten);
  assert.equal(get(w, ally.id)!.damage, 1);
  H.shadow!(w, FF.overcome);
  assert.equal(w.hand.length, 1);
});

test("Shared cards in Flight to the Ford: Black Steed on a Fell Rider, Rode Like a Gale, Ringwraith, The Witch-king and Pale Blade", () => {
  let s = base();
  const rider = stage(s, FF.fell);
  const cost = engagementCost(s, rider);
  reveal(s, FF.steed, [FF.oldRoad, FF.oldRoad]);
  s = choose(s, rider.id);
  s = settle(s);
  assert.equal(engagementCost(s, get(s, rider.id)!), cost - 10);
  let t = base();
  const r2 = engaged(t, FF.fell);
  reveal(t, FF.gale, [FF.oldRoad]);
  t = settle(t);
  assert.ok(t.staging.some((u) => u.id === r2.id));
  const u = base();
  const king = stage(u, FF.witchKing);
  assert.equal(H.immune!(u, king), true);
  assert.equal(H.cannotDefend!(u, king, u.heroes[1]), true);
  oneRing(u)!.exhausted = true;
  assert.equal(engagementCost(u, king), 15);
  let v = base();
  const wraith = stage(v, FF.ringwraith);
  reveal(v, FF.blade, [FF.oldRoad, FF.oldRoad]);
  v = choose(v, wraith.id);
  v = settle(v);
  assert.equal(stats(v, get(v, wraith.id)!).attack, 6);
});

test("Saves keep the life, the burden deck and the round effects; malformed state is rejected", () => {
  const s = base();
  s.flightFord!.blank = { round: s.round, ids: [s.heroes[0].id] };
  s.flightFord!.painRound = s.round;
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw));
  for (const broken of [
    { life: 16 },
    { life: -1 },
    { burdens: [FF.weight, FF.weight] },
    { burdens: [FF.oldRoad] },
    { setAside: [FF.bridge] },
    { extraReveals: -1 },
    { blank: { round: "x", ids: [] } },
    { currentQuest: FF.race },
    { painRound: "now" },
  ]) {
    const bad = JSON.parse(JSON.stringify(s));
    Object.assign(bad.flightFord, broken);
    assert.equal(validateSave(bad), false, JSON.stringify(broken));
  }
});

test("The scenario panel's public state reports the life, the burden deck, The Last Bridge, Ford of Bruinen and the Nazgûl in play", () => {
  const s = base();
  stage(s, FF.bridge);
  engaged(s, FF.fell);
  assert.deepEqual(flightFordPublicState(s), {
    currentQuest: FF.pursued,
    life: 15,
    burdens: 5,
    fordAside: true,
    witchKingAside: true,
    bridge: "in-play",
    ford: "aside",
    nazgul: 1,
    blankThisRound: false,
    painThisRound: false,
    extraReveals: 0,
    resolving: 0,
  });
  assert.ok(canTravel);
  assert.equal(playerOrder(s).length, 1);
});
