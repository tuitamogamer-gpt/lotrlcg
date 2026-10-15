import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canTravel,
  optionalEngagementProblem,
} from "../src/game/engine";
import {
  fx,
  get,
  make,
  stats,
  threatOf,
  engagementCost,
  pay,
  playCost,
} from "../src/game/core";
import { damage, enterAlly, revealed, shadow } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  forOwner,
  ownerOf,
  seatView,
  selectSeat,
} from "../src/game/table";
import { isShipObjective } from "../src/game/ships";
import { card } from "../src/game/cards";
import { CITY as C } from "../src/game/city-support";
import {
  cityStats,
  cityTravelStart,
  cityThreatBonus,
  cityAllyProblem,
} from "../src/game/city-encounters";
import { base, choose, reload, settle, setStage } from "./city-fixtures";
import type { GameState, Unit } from "../src/game/types";

function add(
  s: GameState,
  code: string,
  area: "staging" | "engaged" | "allies" = "staging",
  player = 0,
) {
  const u = make(s, code);
  if (area === "staging") s.staging.push(u);
  else
    forOwner(s, player, () => {
      u.owner = player;
      s[area].push(u);
    });
  return u;
}
function finish(s: GameState) {
  flush(s);
  return settle(s);
}
function reveal(s: GameState, code: string) {
  revealed(s, code);
  flush(s);
  return s;
}
function combat(
  s: GameState,
  enemy: Unit,
  defender: Unit | null = null,
  player = 0,
) {
  s.phase = "defense";
  s.combat = {
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
    attackPlayer: player,
    attackBonus: 0,
  };
  selectSeat(s, player);
}

test("Watch Tower adds a resource per unblanked staging copy on reveal and Boarding, never on Patrol return", () => {
  let s = base(2);
  add(s, C.watch);
  s.activeLocation = make(s, C.watch);
  reveal(s, C.slaver);
  const slaver = s.staging.find((u) => u.code === C.slaver)!;
  assert.equal(slaver.resources, 1);
  assert.equal(stats(s, slaver).attack, 3);
  assert.equal(threatOf(s, slaver), 3);
  s.city!.corsairDeck = [C.slaver];
  handle(s, fx("voyageBoard", { player: 1 }));
  assert.equal(seatView(s, 1).engaged[0].resources, 1);
  s = reveal(s, C.patrol);
  s = finish(s);
  assert.equal(s.staging.filter((u) => u.code === C.slaver).length, 2);
  assert.ok(
    s.staging
      .filter((u) => u.code === C.slaver)
      .every((u) => u.resources === 1),
  );
  reload(s);
});

test("Slaver receives one resource per payment instruction across several hero pools; token movement does not trigger it", () => {
  let s = base(2);
  const slaver = add(s, C.slaver, "engaged", 1),
    remote = add(s, C.slaver, "engaged", 0);
  forOwner(s, 1, () => {
    s.heroes[0].resources = 2;
    const cost = playCost(s, card("01073"));
    s.heroes[1].resources = cost - 2;
    pay(s, card("01073"), { [s.heroes[0].id]: 2, [s.heroes[1].id]: cost - 2 });
  });
  assert.equal(slaver.resources, 1);
  assert.equal(remote.resources, 0);
  combat(s, slaver, seatView(s, 1).heroes[0], 1);
  shadow(s, C.harbor);
  flush(s);
  s = choose(reload(s), seatView(s, 1).heroes[2].id);
  assert.equal(
    get(s, slaver.id)!.resources,
    2,
    "a moved hero resource is not another spend",
  );
  assert.equal(ownerOf(s, get(s, slaver.id)!), 1);
});

test("City X reads the highest Raider pool and Harbor defense reaches Corsairs in every fellowship", () => {
  const s = base(2),
    city = add(s, C.city),
    slaver = add(s, C.slaver, "engaged", 1),
    raider = add(s, C.raider);
  slaver.resources = 3;
  raider.resources = 5;
  assert.equal(threatOf(s, city), 5);
  s.activeLocation = make(s, C.harbor);
  assert.equal(stats(s, slaver).defense, 5);
  s.activeLocation.blanked = true;
  assert.equal(cityStats(s, slaver).defense, 0);
  city.blanked = true;
  assert.equal(cityThreatBonus(s, city), 0);
});

test("Foes affects only staging Raiders present at resolution, scales with their later resources, and stacks until phase end", () => {
  let s = base(2);
  s.phase = "staging";
  const a = add(s, C.slaver),
    b = add(s, C.raider),
    remote = add(s, C.slaver, "engaged", 1);
  b.resources = 1;
  remote.resources = 6;
  s = reveal(s, C.foes);
  s = choose(reload(s), a.id);
  assert.equal(
    cityThreatBonus(s, get(s, a.id)!),
    4,
    "Slaver gets printed resource threat and Foes resource threat",
  );
  assert.equal(cityThreatBonus(s, get(s, b.id)!), 1);
  assert.equal(cityThreatBonus(s, get(s, remote.id)!), 6);
  const later = add(s, C.raider);
  later.resources = 7;
  assert.equal(
    cityThreatBonus(s, later),
    0,
    "a later entry never acquires the lasting effect",
  );
  s = reveal(s, C.foes);
  s = choose(reload(s), b.id);
  assert.equal(cityThreatBonus(s, get(s, b.id)!), 6);
  s = reload(s);
  s.phase = "travel";
  assert.equal(cityThreatBonus(s, get(s, b.id)!), 0);
});

test("Umbar Patrol preserves returned physical enemies and prohibits only optional engagement through this round", () => {
  let s = base(2);
  const first = add(s, C.slaver, "engaged", 0),
    second = add(s, C.raider, "engaged", 1);
  s = reveal(s, C.patrol);
  s = finish(s);
  assert.ok(s.staging.some((u) => u.id === first.id));
  assert.ok(s.staging.some((u) => u.id === second.id));
  s.phase = "encounter";
  assert.match(
    optionalEngagementProblem(s, get(s, first.id)!) ?? "",
    /Patrol|optionally/i,
  );
  s.round++;
  assert.equal(optionalEngagementProblem(s, get(s, first.id)!), null);
  reload(s);
});

test("Umbar Patrol searches deck and discard only when no enemy is left in staging", () => {
  let s = setStage(base(), 3);
  s.encounterDeck = [C.harbor];
  s.encounterDiscard = [C.slaver];
  s = reveal(s, C.patrol);
  assert.ok(s.choice?.options.some((o) => o.code === C.slaver));
  s = choose(reload(s), s.choice!.options.find((o) => o.code === C.slaver)!.id);
  assert.ok(s.staging.some((u) => u.code === C.slaver));
  assert.ok(!s.encounterDiscard.includes(C.slaver));
  assert.ok(s.encounterDiscard.includes(C.patrol));
});

test("Serpent's Tail deals physical shadow cards to all Ship enemies and its off-course reduction lasts one round", () => {
  const s = base(2),
    staged = add(s, C.slave),
    engaged = add(s, C.slave, "engaged", 1),
    land = add(s, C.slaver);
  s.encounterDeck = [C.watch, C.waters, C.harbor];
  s.sailing!.heading = 1;
  reveal(s, C.serpent);
  assert.deepEqual(staged.shadows, [C.watch]);
  assert.deepEqual(engaged.shadows, [C.waters]);
  assert.deepEqual(land.shadows, []);
  assert.equal(engagementCost(s, staged), 22);
  handle(s, fx("endRound"));
  flush(s);
  assert.equal(staged.tempEngagement ?? 0, 0);
});

test("Fury increments each engaged Raider then assigns the resulting damage in its owner's fellowship", () => {
  let s = base(2);
  add(s, C.slaver, "engaged", 0).resources = 1;
  add(s, C.slaver, "engaged", 1).resources = 2;
  add(s, C.raider).resources = 10;
  const before = [0, 1].map((p) =>
    seatView(s, p).heroes.reduce((n, u) => n + u.damage, 0),
  );
  s = reveal(s, C.fury);
  while (s.choice) {
    const p = s.table?.active ?? 0;
    s = choose(reload(s), seatView(s, p).heroes.find((u) => u.damage < 2)!.id);
  }
  assert.equal(
    seatView(s, 0).heroes.reduce((n, u) => n + u.damage, 0) - before[0],
    2,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, u) => n + u.damage, 0) - before[1],
    3,
  );
  assert.equal(s.staging.find((u) => u.code === C.raider)!.resources, 10);
  reload(s);
});

test("Foes and Fury gain surge only when their printed fallback condition is met", () => {
  for (const code of [C.foes, C.fury]) {
    let s = base();
    if (code === C.foes) add(s, C.slaver, "engaged");
    s.encounterDeck = [C.harbor, C.city];
    s = finish(reveal(s, code));
    assert.ok(s.staging.some((u) => u.code === C.harbor));
    assert.deepEqual(s.encounterDeck, [C.city]);
    assert.equal(s.encounterDiscard.filter((c) => c === code).length, 1);
    reload(s);
  }
  let s = base();
  add(s, C.slaver, "engaged");
  for (const u of allCharacters(s)) u.roundCannotTakeDamage = true;
  s.encounterDeck = [C.harbor];
  s = finish(reveal(s, C.fury));
  assert.deepEqual(
    s.encounterDeck,
    [C.harbor],
    "damage assigned but prevented still satisfies Fury",
  );
  assert.ok(allCharacters(s).every((u) => u.damage === 0));
});

test("Southern Belfalas reveals and engages one physical Corsair to the selected player before actual travel", () => {
  let s = base(2);
  s.phase = "travel";
  const location = add(s, C.belfalas);
  add(s, C.watch);
  s.city!.corsairDeck = [C.slaver];
  s = applyAction(reload(s), { type: "TRAVEL", id: location.id });
  s = choose(reload(s), "player:1");
  assert.equal(s.activeLocation?.id, location.id);
  assert.equal(seatView(s, 1).engaged[0].code, C.slaver);
  assert.equal(seatView(s, 1).engaged[0].resources, 1);
  assert.equal(s.city!.corsairDeck.length, 0);
  reload(s);
});

test("City travel searches either physical pile, applies Watch Tower entry, and does not reveal a searched Corsair", () => {
  let s = setStage(base(), 3);
  s.phase = "travel";
  const location = add(s, C.city);
  add(s, C.watch);
  s.encounterDeck = [C.harbor];
  s.encounterDiscard = [C.slaver];
  assert.equal(canTravel(s, location), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: location.id });
  s = choose(reload(s), "discard:0");
  assert.equal(s.activeLocation?.id, location.id);
  assert.equal(s.staging.find((u) => u.code === C.slaver)!.resources, 1);
  assert.equal(
    s.lastReveal,
    null,
    "a searched enemy is added without becoming a reveal",
  );
  assert.ok(!s.encounterDiscard.includes(C.slaver));
  reload(s);
});

test("Southern Belfalas and City of Corsairs cannot be travelled to when their travel cost has no legal card", () => {
  const s = base();
  s.phase = "travel";
  const belfalas = add(s, C.belfalas),
    city = add(s, C.city);
  s.city!.corsairDeck = [];
  s.city!.corsairDiscard = [];
  s.encounterDeck = [C.harbor];
  s.encounterDiscard = [];
  assert.match(canTravel(s, belfalas) ?? "", /Corsair/);
  assert.match(canTravel(s, city) ?? "", /Corsair/);
  s.encounterDiscard.push(C.slaver);
  assert.equal(canTravel(s, city), null);
  assert.match(
    canTravel(s, belfalas) ?? "",
    /Corsair/,
    "the active encounter discard is not the separate Corsair discard",
  );
});

test("Streets offers actual travel or a separate resource payment per unblanked copy; traveling satisfies every copy", () => {
  let s = setStage(base(), 3);
  s.phase = "travel";
  const first = add(s, C.streets),
    second = add(s, C.streets),
    raider = add(s, C.slaver);
  cityTravelStart(s);
  flush(s);
  s = choose(reload(s), `resource:${raider.id}`);
  assert.equal(get(s, raider.id)!.resources, 2);
  assert.ok(s.choice?.options.some((o) => o.id === second.id));
  s = choose(reload(s), first.id);
  assert.equal(s.activeLocation?.id, first.id);
  assert.equal(s.choice, null);
  assert.equal(s.queue.length, 0);
  reload(s);
});

test("Corsair Waters counts previous round entries, blocks alternate entry effects, and expires when no longer active", () => {
  const s = base();
  const ally = make(s, "01016");
  enterAlly(s, ally);
  s.activeLocation = make(s, C.waters);
  assert.match(cityAllyProblem(s) ?? "", /only 1 ally/);
  assert.throws(() => enterAlly(s, make(s, "01028")), /cannot enter play/);
  s.round++;
  assert.equal(cityAllyProblem(s), null);
  enterAlly(s, make(s, "01028"), true);
  assert.match(cityAllyProblem(s) ?? "", /only 1 ally/);
  s.activeLocation.blanked = true;
  assert.equal(cityAllyProblem(s), null);
  reload(s);
});

test("Slave Ship uses actual attack damage and assigns each extra point only to the defending player's non-Ship characters", () => {
  let s = base(2);
  const enemy = add(s, C.slave, "engaged", 1),
    ship = seatView(s, 1).allies.find(isShipObjective)!;
  combat(s, enemy, ship, 1);
  damage(s, ship.id, 2, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  assert.ok(s.choice);
  assert.ok(s.choice!.options.every((o) => !isShipObjective(get(s, o.id)!)));
  assert.ok(s.choice!.options.every((o) => ownerOf(s, get(s, o.id)!) === 1));
  const hero = seatView(s, 1).heroes[0];
  s = choose(reload(s), hero.id);
  s = choose(reload(s), hero.id);
  assert.equal(get(s, hero.id)!.damage, 2);
  assert.equal(get(s, ship.id)!.damage, 2);
  assert.ok(seatView(s, 0).heroes.every((u) => u.damage === 0));
  damage(s, ship.id, 1);
  flush(s);
  assert.equal(
    s.choice,
    null,
    "non-combat damage never causes the extra assignment",
  );
  reload(s);
});

test("Corsair Waters shadow permits heading only while it can shift; Streets shadow adds at most three physical cards", () => {
  let s = base(),
    enemy = add(s, C.slaver, "engaged"),
    defender = s.heroes[0];
  enemy.resources = 7;
  combat(s, enemy, defender);
  s.sailing!.heading = 3;
  shadow(s, C.waters);
  assert.equal(s.choice!.options.length, 1);
  s = choose(reload(s), "undefended");
  assert.equal(s.combat!.defenderId, null);
  s.encounterDeck = [C.watch, C.harbor, C.waters, C.slaver];
  enemy = get(s, enemy.id)!;
  shadow(s, C.streets);
  assert.deepEqual(enemy.shadows, [C.watch, C.harbor, C.waters]);
  assert.deepEqual(s.encounterDeck, [C.slaver]);
  reload(s);
});

test("Watch Tower and Southern Belfalas shadows resolve after a real attack kill and preserve pending choices across save", () => {
  let s = base(),
    enemy = add(s, C.slaver, "engaged"),
    victim = add(s, "01028", "allies"),
    survivor = add(s, "01016", "allies");
  enemy.resources = 1;
  enemy.shadows = [C.watch, C.belfalas];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: victim.id,
  });
  for (let n = 0; s.choice && n < 20; n++) {
    const pick = s.choice.title.includes("Southern Belfalas")
      ? survivor.id
      : s.choice.title.includes("Watch Tower")
        ? enemy.id
        : s.choice.options[0].id;
    s = choose(reload(s), pick);
  }
  assert.ok(!allCharacters(s).some((u) => u.id === victim.id));
  assert.ok(
    !allCharacters(s).some((u) => u.id === survivor.id),
    "Belfalas discards the remaining ally",
  );
  assert.equal(
    get(s, enemy.id)!.resources,
    3,
    "Watch Tower takes the destroyed ally's printed cost",
  );
  reload(s);
});
