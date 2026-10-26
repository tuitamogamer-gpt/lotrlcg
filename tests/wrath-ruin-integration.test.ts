import assert from "node:assert/strict";
import test from "node:test";
import { card, STARTERS } from "../src/game/cards";
import {
  applyAction,
  createGame,
  publicState,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { fx, get, globalUnits, locationQuest, make } from "../src/game/core";
import { progressLocation } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  activeSeat,
  forOwner,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { WRATH_RUIN as W } from "../src/game/wrath-ruin-support";
import { WRATH_RUIN_PLAYER as P } from "../src/game/wrath-ruin-player-support";
import { wrathRuinSavedExtraUnits } from "../src/game/wrath-ruin-state";
import { base, choose, reload, settle } from "./wrath-ruin-fixtures";
import { createBurglarGame } from "./burglar-contract-fixtures";
import { hand, play, pick, ring } from "./wrath-ruin-player-fixtures";
import { consideredEngaged } from "../src/game/considered-engagement";

const reserveDeck = {
  ...Object.fromEntries(
    Array.from({ length: 17 }, (_, i) => [
      String(1013 + i).padStart(5, "0"),
      3,
    ]),
  ),
  "09007": 1,
  "17140": 1,
  "19032": 1,
  [P.bombadillo]: 1,
};

test("four Encounter designs each keep three physical reserves per player under the current published rule", () => {
  const s = createGame(1800, reserveDeck, STARTERS[0].heroes, "custom", {
    seats: STARTERS.slice(0, 2).map((d) => ({
      deckId: "custom",
      heroes: d.heroes,
      cards: reserveDeck,
    })),
  });
  for (const counts of [
    s.rangerReserves,
    s.batch4WindReserves,
    s.eredEagleReserves,
    s.wrathBombadilReserves,
  ])
    assert.deepEqual(counts, { 0: 3, 1: 3 });
  assert.ok(validateSave(s));
  const restored = restoreSave(JSON.parse(JSON.stringify(s)))!;
  assert.deepEqual(restored.wrathBombadilReserves, { 0: 3, 1: 3 });
  for (const field of [
    "rangerReserves",
    "batch4WindReserves",
    "eredEagleReserves",
    "wrathBombadilReserves",
  ] as const) {
    const invalid = structuredClone(s);
    invalid[field]![1] = 4;
    assert.equal(
      validateSave(invalid),
      false,
      `${field} still has an independent three-copy cap`,
    );
  }
});

test("older explicit mixed Encounter allocations survive reload without being filled to the new maxima", () => {
  const s = createGame(1801, reserveDeck, STARTERS[0].heroes, "custom", {
    rangerReserves: { 0: 1 },
    batch4WindReserves: { 0: 1 },
    eredEagleReserves: { 0: 1 },
    wrathBombadilReserves: { 0: 0 },
  });
  const restored = restoreSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(restored);
  assert.equal(restored.rangerReserves![0], 1);
  assert.equal(restored.batch4WindReserves![0], 1);
  assert.equal(restored.eredEagleReserves![0], 1);
  assert.equal(restored.wrathBombadilReserves![0], 0);
  assert.throws(
    () =>
      createGame(1801, reserveDeck, STARTERS[0].heroes, "custom", {
        wrathBombadilReserves: { 0: 4 },
      }),
    /zero and three/,
  );
});

test("reused Pillars pays no resources but triggers Wrath's actual threat-increase Forced effects for the acting seat", () => {
  let s = base(2);
  const enemies: string[] = [];
  for (const player of [0, 1])
    forOwner(s, player, () => {
      const u = make(s, W.easterling);
      enemies.push(u.id);
      s.engaged.push(u);
      s.deck = Array(8).fill("01018");
    });
  selectSeat(s, 1);
  s.table!.turn = 1;
  s.heroes[0].phaseResourceIcons = ["leadership"];
  const event = make(s, P.pillars);
  s.hand.push(event);
  const resources = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = applyAction(reload(s), { type: "PLAY", id: event.id });
  assert.equal(activeSeat(s), 1);
  assert.equal(seatView(s, 1).threat, 40);
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(get(s, enemies[1])!.resources, 1);
  assert.equal(get(s, enemies[0])!.resources, 0);
  assert.equal(s.wrathRuin!.threatRaised[1], s.round);
  assert.equal(s.wrathRuin!.threatRaised[0], undefined);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    resources,
  );
  assert.equal(s.hand.length, 4);
  reload(s);
});

test("Fury replacement prevents Durin's Axe kill response and preserves the same enemy through a native attack", () => {
  let s = base();
  const hero = s.heroes[0],
    victim = make(s, W.raider),
    other = make(s, W.warrior);
  hero.tempAttack = 20;
  hero.attachments.push({
    id: `a${s.nextId++}`,
    code: P.axe,
    exhausted: false,
    owner: 0,
    controller: 0,
  });
  const furyId = `a${s.nextId++}`;
  victim.attachments.push({ id: furyId, code: W.fury, exhausted: false });
  s.engaged = [victim, other];
  s.phase = "attack";
  const unprotected = structuredClone(s);
  unprotected.engaged[0].attachments = [];
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: victim.id,
    attackerIds: [hero.id],
  });
  assert.equal(get(s, victim.id)!.damage, 0);
  assert.equal(get(s, victim.id)!.attachments.length, 0);
  assert.ok(s.encounterDiscard.includes(W.fury));
  assert.ok(!s.encounterDiscard.includes(W.raider));
  assert.equal(get(s, other.id)!.damage, 0);
  assert.ok(!s.choice?.title.includes("Durin"));
  reload(s);
  let killed = applyAction(reload(unprotected), {
    type: "ATTACK",
    enemyId: victim.id,
    attackerIds: [hero.id],
  });
  assert.equal(get(killed, victim.id), undefined);
  assert.match(killed.choice!.title, /Durin/);
  killed = choose(killed, other.id);
  assert.equal(get(killed, other.id)!.damage, 1);
});

test("Burglar loot and Wrath capture share a saved When window without losing or duplicating the explored location", () => {
  let s = createBurglarGame(1, "wrath-and-ruin");
  s.phase = "travel";
  s.queue = [];
  s.choice = null;
  s.activeLocation = null;
  s.staging = [];
  s.engaged = [];
  s.wrathRuin!.controlled = [];
  const location = make(s, W.square);
  s.staging.push(location);
  // Make the next actual loot draw a legal attachment for a starting hero.
  const loot = s.burglarContract!.contracts[0].loot;
  const axe = loot.findIndex((u) => u.code === "01040");
  [loot[0], loot[axe]] = [loot[axe], loot[0]];
  const attachmentId = loot[0].id;
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: location.id }));
  assert.equal(s.activeLocation!.id, location.id);
  assert.ok(s.activeLocation!.attachments.some((a) => a.id === attachmentId));
  assert.equal(locationQuest(s, s.activeLocation!), 4);
  progressLocation(s, s.activeLocation!, 4);
  flush(s);
  assert.match(s.choice!.title, /order|resolve|explor/i);
  assert.ok(s.wrathRuin!.pendingExplored.some((u) => u.id === location.id));
  assert.equal(
    get(s, location.id),
    undefined,
    "the suspended When host is not an ordinary in-play target",
  );
  s = reload(s);
  const capture = s.choice!.options.find((o) =>
    o.effects.some((e) => e.kind === "wrathCapture"),
  );
  assert.ok(capture, JSON.stringify(s.choice));
  s = choose(s, capture.id);
  s = settle(s, `attach:${s.heroes[0].id}`);
  assert.equal(s.wrathRuin!.pendingExplored.length, 0);
  assert.equal(
    s.wrathRuin!.controlled.filter((u) => u.id === location.id).length,
    1,
  );
  assert.equal(globalUnits(s).filter((u) => u.id === location.id).length, 1);
  assert.equal(
    wrathRuinSavedExtraUnits(s).filter((u) => u.id === location.id).length,
    0,
  );
  assert.equal(s.burglarContract!.guarded.length, 0);
  assert.equal(s.burglarContract!.claims.length, 0);
  assert.equal(
    s.heroes.flatMap((h) => h.attachments).filter((a) => a.id === attachmentId)
      .length,
    1,
  );
  reload(s);
});

test("save rejects physical ID aliases between controlled locations and hidden contract loot", () => {
  const s = createBurglarGame(1, "wrath-and-ruin");
  const location = make(s, W.square);
  location.owner = 0;
  s.wrathRuin!.controlled.push(location);
  syncSeat(s);
  assert.ok(validateSave(s));
  const bad = structuredClone(s);
  bad.burglarContract!.contracts[0].loot[0].id = location.id;
  assert.equal(validateSave(bad), false);
  const duplicateZone = structuredClone(s);
  duplicateZone.wrathRuin!.pendingExplored.push(structuredClone(location));
  assert.equal(validateSave(duplicateZone), false);
  const alteredHiddenOrder = structuredClone(s);
  alteredHiddenOrder.burglarContract!.contracts[0].loot.reverse();
  assert.deepEqual(publicState(s), publicState(alteredHiddenOrder));
});

test("Charge's scoped engagement lets reused Thorin target the staged enemy, survives saves and ends after that attack", () => {
  let s = base(2);
  s.phase = "staging";
  s.deck = ["01018", "01016"];
  s.heroes[0] = make(s, P.thorin);
  s.heroes[0].resources = 10;
  s.heroes[0].phaseResourceIcons = ["tactics"];
  s.startingHeroes = s.heroes.map((h) => h.code);
  const controlled = make(s, W.square);
  controlled.owner = 0;
  s.wrathRuin!.controlled.push(controlled);
  const thorin = s.heroes[0],
    enemy = make(s, W.champion),
    other = make(s, "01083");
  s.staging = [enemy, other];
  s = play(s, hand(s, P.charge).id);
  s = pick(s, enemy.id);
  s = pick(s, thorin.id);
  s = pick(s, "attack");
  assert.match(s.choice!.title, /Thorin/);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.equal(s.engaged.length, 0);
  assert.ok(consideredEngaged(s, get(s, enemy.id)!, 0));
  assert.equal(consideredEngaged(s, get(s, enemy.id)!, 1), false);
  assert.equal(consideredEngaged(s, get(s, other.id)!, 0), false);
  const malformed = structuredClone(s);
  malformed.playerAttackContexts![0].player = 9;
  assert.equal(validateSave(malformed), false);
  s = pick(reload(s), "use");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [enemy.id],
  );
  s = pick(reload(s), enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.ok(s.discard.includes("01018"));
  assert.equal(s.playerAttackContexts, undefined);
  assert.equal(consideredEngaged(s, get(s, enemy.id)!, 0), false);
  assert.equal(s.engaged.length, 0);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.ok(
    s.wrathRuin!.controlled.some((u) => u.id === controlled.id),
    "the attack never triggers Champion's engagement Forced effect",
  );
  assert.equal(s.combat, null);
  if (s.choice) s = pick(s, "finish");
  reload(s);
});

test("Captured Tower blocks whole-card Master Ring, When Revealed cancellation and shadow cancellation through native windows", () => {
  const setup = () => {
    const s = base();
    const bearer = ring(s);
    bearer.phaseResourceIcons = ["lore", "spirit"];
    hand(s, "21009");
    hand(s, "01050");
    hand(s, "01048");
    s.activeLocation = make(s, W.tower);
    return s;
  };
  let s = setup();
  s.phase = "staging";
  s.encounterDeck = [W.fighting];
  const allowed = structuredClone(s);
  allowed.activeLocation = null;
  handle(allowed, fx("reveal"));
  flush(allowed);
  assert.ok(allowed.choice!.options.some((o) => o.id === "east-master-0"));
  handle(s, fx("reveal"));
  flush(s);
  assert.ok(
    !s.choice?.options.some(
      (o) => o.id.startsWith("east-master") || o.code === "01050",
    ),
  );
  s = settle(s);
  assert.ok(s.hand.some((u) => u.code === "21009"));
  assert.ok(s.hand.some((u) => u.code === "01050"));
  const combat = setup(),
    bearer = combat.heroes[0],
    enemy = make(combat, W.raider);
  bearer.attachments.push({
    id: `a${combat.nextId++}`,
    code: P.strength,
    exhausted: false,
    owner: 0,
    controller: 0,
  });
  enemy.shadows = [W.fighting];
  combat.engaged = [enemy];
  combat.phase = "defense";
  let defended = applyAction(reload(combat), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: bearer.id,
  });
  assert.ok(
    !defended.choice?.options.some(
      (o) => o.code === "01048" || o.id.startsWith("wrath-strength"),
    ),
  );
  defended = settle(defended);
  assert.ok(defended.hand.some((u) => u.code === "01048"));
  assert.equal(
    get(defended, bearer.id)!.attachments.find((a) => a.code === "21001")!
      .exhausted,
    false,
  );
});

test("Charge killing with another player's Ranged Derufin reduces the acting player's threat after a saved response", () => {
  let s = base(2);
  s.phase = "staging";
  const hero = s.heroes[0];
  hero.phaseResourceIcons = ["tactics"];
  hero.tempAttack = 10;
  let derufinId = "";
  forOwner(s, 1, () => {
    const ally = make(s, "21006");
    derufinId = ally.id;
    s.allies.push(ally);
  });
  const enemy = make(s, W.raider);
  s.staging = [enemy];
  s = play(s, hand(s, P.charge).id);
  s = pick(s, enemy.id);
  s = pick(s, hero.id);
  s = pick(s, derufinId);
  s = pick(s, "attack");
  assert.match(s.choice!.title, /Derufin/);
  assert.equal(activeSeat(s), 1);
  assert.equal(get(s, enemy.id), undefined);
  s = pick(reload(s), "use");
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 20 - card(W.raider).threat!);
  assert.equal(seatView(s, 1).threat, 20);
  assert.ok(seatView(s, 1).discard.includes("21006"));
  assert.equal(s.playerAttackContexts, undefined);
});

test("native Tracker and Guide commitment responses retain player-card provenance: only active-location progress is allowed", () => {
  let s = base();
  const tracker = make(s, "01045"),
    guide = make(s, "01044"),
    staged = make(s, W.square),
    active = make(s, W.house);
  s.allies = [tracker, guide];
  s.staging = [staged];
  s.activeLocation = active;
  s.encounterDeck = [W.house];
  s.phase = "quest";
  s.committedIds = [tracker.id, guide.id];
  s = settle(applyAction(reload(s), { type: "COMMIT" }));
  assert.equal(
    get(s, staged.id)!.progress,
    0,
    "Inside the Walls forbids Tracker's player-card progress in staging",
  );
  assert.equal(
    s.activeLocation!.progress,
    1,
    "Lórien Guide may still place progress on the active location",
  );
  assert.equal(s.playerAbilitySources, undefined);
  reload(s);
});
