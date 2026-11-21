import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import {
  advanceQuest,
  check,
  damage,
  engage,
  progressLocation,
} from "../src/game/board";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { allEngaged, forOwner, ownerOf } from "../src/game/table";
import {
  depthsDetach,
  depthsEffect,
  depthsGrapple,
  depthsTravelEffects,
  setupDepths,
} from "../src/game/depths";
import {
  DEPTHS as D,
  DEPTHS_RECIPES,
  depthsGrappledWith,
} from "../src/game/depths-support";
import {
  NIGHTMARE,
  NIGHTMARE_DC as N,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  valid,
} from "./nightmare-fixtures";
import { base as common } from "./against-shadow-final-fixtures";
import { reload, settle } from "./depths-fixtures";

const ID = "the-thing-in-the-depths";
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare game at stage 1 after setup (the scenario's own fixture, in Nightmare mode). */
function board(players = 1) {
  const s = common(ID, players);
  s.nightmareMode = true;
  s.nightmare = {};
  setupDepths(s);
  const q = s.depths!;
  q.initialized = true;
  const opening = q.setAside.filter((u) => [D.helm, D.raider].includes(u.code));
  q.setAside = q.setAside.filter((u) => !opening.includes(u));
  s.staging.push(...opening);
  return s;
}
/** Stage 3 after the actual Change of Plans (the boss's entry attacks resolved). */
function stage3(players = 1) {
  let s = board(players);
  s.phase = "staging";
  const helm = s.staging.find((u) => u.code === D.helm)!;
  progressLocation(s, helm, 100);
  s.staging.push(make(s, D.cargo));
  s.progress = 4;
  advanceQuest(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3, "actual stage transition completes");
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    combat: null,
    suspendedCombats: [],
  });
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
const stage = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
function engaged(s: GameState, code: string, p = 0) {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.engaged.push(u);
  });
  return u;
}
/** A known enemy grappled with a location. */
function grapple(s: GameState, code: string, location: Unit) {
  const u = make(s, code);
  s.depths!.grappled.push({ enemy: u, locationId: location.id });
  return u;
}
/** The given player reveals a known card from the top of the encounter deck. */
function reveal(s: GameState, code: string, p = 0) {
  s.encounterDeck.unshift(code);
  s.queue.push(fx("reveal", { player: p }));
  flush(s);
  return s;
}
function shadowOf(s: GameState, attacker: Unit, code: string, defender?: Unit) {
  s.combat = {
    enemyId: attacker.id,
    defenderId: defender?.id ?? null,
    defenderIds: defender ? [defender.id] : [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  attacker.shadows = [code];
  attacker.revealedShadowCount = 1;
  const handled = hooks(s).shadow!(s, code);
  flush(s);
  return handled;
}
const ally = (s: GameState, code: string) =>
  s.allies.find((u) => u.code === code)!;
/** The staging area's locations leave, with the enemies grappled with them. */
function clearLocations(s: GameState) {
  s.staging = s.staging.filter((u) => card(u.code).type_code !== "location");
  s.depths!.grappled = [];
}

test("Nightmare: The Thing in the Depths' setup card and Nightmare Deck carry their scans' texts, stats and faces", () => {
  const setup = card(N.depthsCard);
  assert.equal(setup.type_code, "nightmare");
  assert.match(
    setup.text!,
    /^Begin with the standard quest deck and encounter deck for The Thing in the Depths scenario\.\n/,
  );
  const back = setup.back_text!.split("\n");
  assert.equal(back.length, 4);
  assert.equal(back[0], "You are playing Nightmare mode.");
  assert.ok(
    back[2].includes(
      "discard cards from the top of the encounter deck until a location is discarded",
    ),
  );
  assert.ok(
    card(N.quarters).text!.startsWith(
      "While Captain's Quarters is grappled, Raider characters",
    ),
  );
  assert.ok(card(N.quarters).text!.includes("Captain Sahír (even if"));
  assert.equal(card(N.quarters).is_unique, true);
  assert.deepEqual(
    [N.slithering, N.crashing, N.duelist].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [0, 0, 4, 1, 5],
      [27, 2, 6, 1, 7],
      [36, 3, 3, 1, 3],
    ],
  );
  assert.deepEqual(
    [N.quarters, N.aftCabin].map((code) => [
      card(code).threat,
      card(code).quest,
      card(code).traits,
    ]),
    [
      [5, 5, "Ship."],
      [3, 3, "Ship. Deck."],
    ],
  );
  for (const code of [N.slithering, N.crashing])
    assert.equal(card(code).traits, "Creature. Tentacle.");
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Thing in the Depths - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set
      .filter((x) => x.type_code !== "nightmare")
      .reduce((n, x) => n + (x.quantity ?? 1), 0),
    19,
  );
  for (const code of Object.values(N).filter((c) =>
    set.some((x) => x.code === c),
  )) {
    const faces = art.filter((pin) => pin.code === code).map((pin) => pin.face);
    assert.deepEqual(
      faces,
      code === N.depthsCard ? ["front", "back"] : ["front"],
    );
    for (const pin of art.filter((x) => x.code === code))
      assert.equal(readFileSync(`public${pin.localPath}`).length, pin.bytes);
  }
});

test("Nightmare: The Thing in the Depths' encounter deck and set aside encounter set match the source recipe", () => {
  assert.deepEqual(NIGHTMARE[ID]!.removals, {
    "Corsair Infiltrator": 2,
    "Crew Quarters": 1,
    "Crushing Arm": 1,
    "Grasping Arm": 1,
    "Giant Arm": 1,
  });
  const recipe = DEPTHS_RECIPES.find((r) => r.mode === "standard")!;
  const section = (name: string) =>
    tally(
      recipe.cards
        .filter((r) => r.section === name)
        .flatMap((r) => Array<string>(r.quantity).fill(r.code)),
    );
  for (const s of [opening(nightmareGame(ID)), opening(nightmareForTwo(ID))]) {
    assert.equal(nightmareCardOf(s), N.depthsCard);
    assert.ok(valid(s));
    const deck = section("sharedEncounterDeck");
    deck[D.crew] -= 1;
    delete deck[D.infiltrator];
    Object.assign(deck, {
      [N.quarters]: 1,
      [N.aftCabin]: 3,
      [N.tumultuous]: 3,
      [N.duelist]: 3,
    });
    assert.deepEqual(tally([...s.encounterDeck, ...s.encounterDiscard]), deck);
    const beast = section("sharedEncounterDeck2");
    for (const code of [D.crushing, D.grasping, D.giant]) beast[code] -= 1;
    Object.assign(beast, {
      [N.slithering]: 3,
      [N.crashing]: 3,
      [N.maelstrom]: 3,
    });
    assert.deepEqual(tally(s.depths!.beastDeck), beast);
    assert.match(
      nightmareStatus(s)[0],
      /^The Thing in the Depths · Nightmare mode: after The Thing in the Depths enters play/,
    );
  }
});

test("Nightmare: Slithering Arm grapples the location with the most grappled enemies, Crashing Arm the one with the fewest; ties are the first player's choice", () => {
  let s = board();
  const helm = s.staging.find((u) => u.code === D.helm)!;
  const deck = stage(s, D.weather);
  const hold = stage(s, D.cargo);
  grapple(s, D.thrashing, deck);
  grapple(s, D.giant, deck);
  grapple(s, D.giant, hold);
  const slithering = make(s, N.slithering);
  depthsGrapple(s, slithering);
  assert.equal(depthsGrappledWith(s, deck.id).length, 3, "the most");
  const crashing = make(s, N.crashing);
  depthsGrapple(s, crashing);
  assert.ok(
    depthsGrappledWith(s, helm.id).some((u) => u.id === crashing.id),
    "the fewest: Helm of the Stormcaller, with none",
  );
  // A tie between the two with one each.
  s = board();
  const a = stage(s, D.weather),
    b = stage(s, D.cargo);
  for (const l of [a, b, s.staging.find((u) => u.code === D.helm)!])
    grapple(s, D.giant, l);
  depthsGrapple(s, make(s, N.slithering));
  assert.equal(options(s).length, 3);
  assert.match(s.choice!.description!, /enemies grappled with them/);
  assert.ok(valid(s));
});

test("Nightmare: Aft Cabin raises each Deck location's grappled enemies to 3 threat, and an enemy detached from it gets +3 defense for the round; Crashing Arm is dealt 3 shadow cards when detached", () => {
  const s = board();
  const deck = stage(s, D.weather);
  const hold = stage(s, D.cargo);
  grapple(s, D.giant, deck);
  grapple(s, D.giant, hold);
  const printed = (u: Unit) => card(u.code).threat ?? 0;
  assert.equal(threatOf(s, deck), printed(deck) + 2);
  const aft = stage(s, N.aftCabin);
  assert.equal(threatOf(s, deck), printed(deck) + 3, "a Deck location");
  assert.equal(threatOf(s, hold), printed(hold) + 2, "not a Deck location");
  const crashing = grapple(s, N.crashing, aft);
  const giant = grapple(s, D.giant, aft);
  assert.equal(threatOf(s, aft), 3 + 6);
  const before = s.encounterDeck.length;
  depthsDetach(s, aft);
  flush(s);
  for (let i = 0; i < 5 && s.choice; i++) {
    s.queue.unshift(...s.choice.options[0].effects);
    s.choice = null;
    flush(s);
  }
  for (const u of [crashing, giant]) {
    const staged = s.staging.find((x) => x.id === u.id)!;
    assert.ok(staged, `${card(u.code).name} detaches`);
    assert.equal(
      stats(s, staged).defense,
      (card(u.code).defense ?? 0) + 3,
      "+3 defense",
    );
  }
  assert.equal(get(s, crashing.id)!.shadows.length, 3, "3 shadow cards");
  assert.equal(before - s.encounterDeck.length, 3);
  assert.ok(valid(s));
  s.round++;
  assert.equal(stats(s, get(s, giant.id)!).defense, card(D.giant).defense);
});

test("Nightmare: a grappled Captain's Quarters leaves Raider characters without resources; its Travel cost gives Captain Sahír 2 resources and each other Raider card 1", () => {
  let s = stage3();
  const sahir = ally(s, D.sahirAlly),
    naasiyah = ally(s, D.naasiyahAlly);
  sahir.resources = 3;
  naasiyah.resources = 2;
  const quarters = stage(s, N.quarters);
  assert.equal(stats(s, sahir).will, 3);
  grapple(s, D.giant, quarters);
  assert.equal(stats(s, sahir).will, 0, "considered to have no resources");
  assert.equal(stats(s, sahir).attack, 0);
  // Na'asiyah cannot spend a resource she is considered not to have.
  queue(
    s,
    fx("depthsNaasiyahBoost", {
      target: naasiyah.id,
      source: "x",
      text: "attack",
      player: ownerOf(s, naasiyah),
    }),
  );
  flush(s);
  assert.equal(naasiyah.resources, 2);
  s.depths!.grappled = [];
  assert.equal(stats(s, sahir).will, 3);
  // Travel: Captain Sahír (set aside at stage 1) and each other Raider.
  s = board();
  const raider = s.staging.find((u) => u.code === D.raider)!;
  raider.resources = 0;
  const quarters1 = stage(s, N.quarters);
  const effects = depthsTravelEffects(s, quarters1)!;
  assert.ok(effects.some((e) => e.kind === "ndpQuarters"));
  queue(s, fx("ndpQuarters", { player: 0 }));
  flush(s);
  const aside = s.depths!.setAside;
  assert.equal(aside.find((u) => u.code === D.sahir)!.resources, 2);
  assert.equal(aside.find((u) => u.code === D.naasiyah)!.resources, 0);
  assert.equal(raider.resources, 1);
  assert.ok(valid(s));
});

test("Nightmare: Change of Plans removes each Corsair Duelist with the Corsair Raiders set, and The Thing in the Depths attacks each player as it enters play", () => {
  let s = board(2);
  s.phase = "staging";
  // One of the encounter deck's three Duelists in the staging area, one in
  // the discard pile.
  s.encounterDeck.splice(s.encounterDeck.indexOf(N.duelist), 1);
  const duelist = stage(s, N.duelist);
  s.encounterDeck.splice(s.encounterDeck.indexOf(N.duelist), 1);
  s.encounterDiscard.push(N.duelist);
  const helm = s.staging.find((u) => u.code === D.helm)!;
  progressLocation(s, helm, 100);
  s.staging.push(make(s, D.cargo));
  s.progress = 4;
  advanceQuest(s);
  flush(s);
  // The boss's entry attacks (one for each player) resolve before stage 3.
  s = settle(s);
  assert.equal(s.stage, 3);
  const removed = s.depths!.removed.filter((c) => c === N.duelist).length;
  const removedUnits = s.depths!.removedUnits.filter(
    (u) => u.code === N.duelist,
  ).length;
  assert.equal(removed + removedUnits, 3, "each Corsair Duelist is removed");
  assert.ok(!s.staging.some((u) => u.id === duelist.id));
  const boss = s.staging.find((u) => u.code === D.thing)!;
  assert.ok(boss, "the boss is in the staging area");
  assert.ok(
    s.log.some((l) =>
      (typeof l === "string" ? l : (l as { text: string }).text).includes(
        "attacks each player in turn order",
      ),
    ),
  );
  assert.ok(valid(s));
});

test("Nightmare: The Thing in the Depths' entry queues one boss attack per player, in turn order, before stage 3", () => {
  const s = board(2);
  s.queue = [];
  depthsEffect(s, fx("depthsStageTwo", { player: 0 }));
  assert.ok(s.staging.some((u) => u.code === D.thing));
  assert.deepEqual(
    s.queue.map((e) => [e.kind, e.player]),
    [
      ["depthsBossAttack", 0],
      ["depthsBossAttack", 1],
      ["depthsStageThree", 0],
    ],
  );
  // The standard game queues none.
  const standard = board(2);
  standard.nightmareMode = false;
  standard.nightmare = undefined;
  standard.queue = [];
  depthsEffect(standard, fx("depthsStageTwo", { player: 0 }));
  assert.deepEqual(
    standard.queue.map((e) => e.kind),
    ["depthsStageThree"],
  );
});

test("Nightmare: at stage 3 a quest phase begins by revealing a discarded location while fewer locations than players are in play", () => {
  let s = stage3(2);
  clearLocations(s);
  s.activeLocation = null;
  s.encounterDeck.unshift(N.tumultuous, D.lashing, N.aftCabin, N.maelstrom);
  const effects = hooks(s).questBegin!(s) as Effect[];
  assert.deepEqual(
    effects.map((e) => e.kind),
    ["ndpLocation"],
  );
  queue(s, ...effects);
  flush(s);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === N.aftCabin),
    "revealed",
  );
  assert.deepEqual(s.encounterDiscard.slice(-2), [N.tumultuous, D.lashing]);
  assert.equal(s.encounterDeck[0], N.maelstrom);
  // Two locations for two players: nothing.
  stage(s, D.weather);
  assert.deepEqual(hooks(s).questBegin!(s) ?? [], []);
  assert.ok(valid(s));
});

test("Nightmare: at the end of the refresh phase at stage 3, each Tentacle enemy in play resolves its Grapple keyword; without a staged location it stays", () => {
  let s = stage3();
  clearLocations(s);
  const deck = stage(s, D.weather);
  const staged = stage(s, D.thrashing);
  const held = engaged(s, D.giant, 0);
  const effects = hooks(s).refreshEndForced!(s);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].kind, "fangornOrder");
  queue(s, ...effects);
  flush(s);
  s = settle(s);
  const grappled = depthsGrappledWith(s, deck.id).map((u) => u.id);
  assert.ok(grappled.includes(staged.id));
  assert.ok(grappled.includes(held.id), "the engaged Giant Arm grapples too");
  assert.ok(!allEngaged(s).some((u) => u.id === held.id));
  // Without a location in the staging area, an engaged Tentacle stays.
  clearLocations(s);
  s.depths!.grappled = [];
  const other = engaged(s, D.crushing, 0);
  queue(s, ...hooks(s).refreshEndForced!(s));
  flush(s);
  assert.ok(allEngaged(s).some((u) => u.id === other.id));
  // Not before stage 3.
  assert.deepEqual(hooks(board()).refreshEndForced!(board()), []);
  assert.ok(valid(s));
});

test("Nightmare: Slithering Arm makes an immediate attack as it engages; its shadow resolves its Grapple keyword or leaves the attack undefended", () => {
  let s = stage3();
  const slithering = stage(s, N.slithering);
  engage(s, slithering);
  assert.equal(s.queue[0].kind, "immediateAttack");
  assert.equal(s.queue[0].target, slithering.id);
  // Its shadow: the shadow card itself grapples a location.
  s = stage3();
  clearLocations(s);
  const location = stage(s, D.cargo);
  const attacker = engaged(s, D.thrashing, 0);
  const hero = s.heroes[0];
  shadowOf(s, attacker, N.slithering, hero);
  assert.deepEqual(options(s), ["grapple", "undefended"]);
  s.queue.unshift(...s.choice!.options[0].effects);
  s.choice = null;
  flush(s);
  assert.equal(attacker.shadows.length, 0, "the shadow card left");
  assert.equal(
    depthsGrappledWith(s, location.id).filter((u) => u.code === N.slithering)
      .length,
    1,
  );
  // ...or the attack is undefended.
  s = stage3();
  const other = engaged(s, D.thrashing, 0);
  shadowOf(s, other, N.slithering, s.heroes[0]);
  s.queue.unshift(...s.choice!.options[1].effects);
  s.choice = null;
  flush(s);
  assert.deepEqual(s.combat!.defenderIds, []);
  assert.equal(s.combat!.defenderId, null);
  assert.ok(valid(s));
});

test("Nightmare: Deep Maelstrom reveals a card for each location that is not grappled, or gains Doomed 5; it cannot be canceled, and its shadow counts the grappled enemies", () => {
  let s = stage3();
  clearLocations(s);
  const a = stage(s, D.weather);
  const b = stage(s, D.cargo);
  grapple(s, D.giant, b);
  s.encounterDeck.unshift(N.aftCabin, D.quarter);
  s = reveal(s, N.maelstrom);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === N.aftCabin),
    "1 card revealed",
  );
  assert.equal(s.encounterDeck[0], D.quarter);
  assert.equal(hooks(s).cannotCancel!(s, false, N.maelstrom), true);
  assert.equal(hooks(s).cannotCancel!(s, false, N.tumultuous), false);
  // Every location grappled: Doomed 5.
  grapple(s, D.giant, a);
  for (const l of s.staging.filter(
    (u) =>
      card(u.code).type_code === "location" &&
      !depthsGrappledWith(s, u.id).length,
  ))
    grapple(s, D.giant, l);
  const threat = s.threat;
  s = reveal(s, N.maelstrom);
  s = settle(s);
  assert.equal(s.threat, threat + 5);
  // Its shadow.
  const attacker = engaged(s, D.thrashing, 0);
  shadowOf(s, attacker, N.maelstrom);
  assert.equal(s.combat!.attackBonus, s.depths!.grappled.length);
  assert.equal(s.combat!.attackBonus, 3, "three grappled locations");
});

test("Nightmare: Tumultuous Waters exhausts each character with 1 or less willpower, then empties each ready hero and objective-ally; its shadow leaves such a defender's attack undefended", () => {
  let s = stage3();
  const sahir = ally(s, D.sahirAlly); // 0 printed willpower
  const naasiyah = ally(s, D.naasiyahAlly); // 1 willpower
  sahir.resources = 0;
  naasiyah.resources = 1;
  for (const h of s.heroes) h.resources = 2;
  s = reveal(s, N.tumultuous);
  s = settle(s);
  assert.equal(get(s, sahir.id)!.exhausted, true);
  assert.equal(get(s, naasiyah.id)!.exhausted, true);
  assert.equal(get(s, naasiyah.id)!.resources, 1, "exhausted first");
  for (const h of s.heroes)
    assert.equal(
      h.resources,
      h.exhausted ? 2 : 0,
      `${card(h.code).name}: a ready hero loses its resources`,
    );
  // Its shadow.
  s = stage3();
  const attacker = engaged(s, D.thrashing, 0);
  const low = ally(s, D.naasiyahAlly);
  shadowOf(s, attacker, N.tumultuous, low);
  assert.deepEqual(s.combat!.defenderIds, []);
  s = stage3();
  const strong = s.heroes.find((h) => stats(s, h).will >= 2)!;
  shadowOf(s, engaged(s, D.thrashing, 0), N.tumultuous, strong);
  assert.deepEqual(s.combat!.defenderIds, [strong.id]);
  assert.ok(valid(s));
});

test("Nightmare: Corsair Duelist enters play with 2 resources, loses 1 and its damage instead of being defeated, and its shadow adds the attacker's resources", () => {
  let s = board();
  s = reveal(s, N.duelist);
  s = settle(s);
  const duelist = s.staging.find((u) => u.code === N.duelist)!;
  assert.equal(duelist.resources, 2);
  damage(s, duelist.id, 3);
  check(s);
  assert.ok(s.staging.some((u) => u.id === duelist.id));
  assert.equal(duelist.damage, 0);
  assert.equal(duelist.resources, 1);
  damage(s, duelist.id, 5);
  check(s);
  assert.equal(duelist.resources, 0);
  damage(s, duelist.id, 3);
  check(s);
  assert.ok(!s.staging.some((u) => u.id === duelist.id), "now defeated");
  // Its shadow.
  const raider = engaged(s, D.raider, 0);
  raider.resources = 3;
  shadowOf(s, raider, N.duelist);
  assert.equal(s.combat!.attackBonus, 3);
  assert.ok(valid(s));
});

test("Nightmare: The Thing in the Depths' lasting effects survive a reload, and invalid ones are rejected", () => {
  const s = board();
  s.round = 2;
  const u = stage(s, D.giant);
  s.nightmare = { depthsAft: { round: 2, ids: [u.id] } };
  assert.ok(valid(s));
  assert.deepEqual(reload(s).nightmare, s.nightmare);
  for (const bad of [
    { depthsAft: { round: 3, ids: [u.id] } },
    { depthsAft: { round: 2, ids: [] } },
    { depthsAft: { round: 2, ids: [7] } },
  ]) {
    s.nightmare = bad as never;
    assert.equal(valid(s), false, JSON.stringify(bad));
  }
  s.nightmare = { depthsAft: { round: 2, ids: [u.id] } };
  s.nightmareMode = false;
  assert.equal(valid(s), false, "only in Nightmare mode");
});

test("Nightmare: The Thing in the Depths Nightmare games keep valid saves to their end", () => {
  for (const seed of [1, 2, 3])
    for (const s of [nightmareGame(ID, seed), nightmareForTwo(ID, seed)]) {
      const end = autoplay(s, 2500);
      assert.ok(valid(end), `seed ${seed}`);
    }
});
