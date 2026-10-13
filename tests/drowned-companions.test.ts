import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, availableAbilities } from "../src/game/engine";
import { card } from "../src/game/cards";
import { get, stats } from "../src/game/core";
import { check, damage, destroy, revealed } from "../src/game/board";
import {
  allCharacters,
  forOwner,
  ownerOf,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  drownedAbilityProblem,
  drownedCannotSearch,
} from "../src/game/drowned-companions";
import { DROWNED as D } from "../src/game/drowned-support";
import { WEATHER } from "../src/game/weather-hills-support";
import { base, add, stage2, choose, reload, settle } from "./drowned-fixtures";
import type { GameState } from "../src/game/types";

const captain = (s: GameState, code: string) =>
  allCharacters(s).find((u) => u.code === code)!;
const select = (s: GameState, id: string) => choose(reload(s), id);
function defend(
  s: GameState,
  code: string,
  shadows: string[],
  defenderId: string | null,
  player = 0,
) {
  const enemy = add(s, code, "engaged", player);
  enemy.shadows = shadows;
  s.phase = "defense";
  if (s.table) s.table.turn = player;
  selectSeat(s, player);
  return {
    id: enemy.id,
    state: applyAction(reload(s), {
      type: "DEFEND",
      enemyId: enemy.id,
      defenderId,
    }),
  };
}

test("Drowned Cadaver public engagement bottoms only the engaged player's cheap physical cards in saved chosen order", () => {
  let s = base(2);
  const retained = add(s, "01073", "hand", 1),
    first = add(s, "01016", "hand", 1),
    second = add(s, "01050", "hand", 1);
  const remote = add(s, "01016", "hand", 0),
    enemy = add(s, D.cadaver);
  s.phase = "encounter";
  s.table!.turn = 1;
  selectSeat(s, 1);
  s = applyAction(reload(s), { type: "ENGAGE", id: enemy.id });
  assert.deepEqual(
    new Set(s.choice!.options.map((o) => o.id)),
    new Set([first.id, second.id]),
  );
  s = select(s, second.id);
  s = select(s, first.id);
  s = settle(s);
  assert.deepEqual(seatView(s, 1).deck.slice(-2), [second.code, first.code]);
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.id),
    [retained.id],
  );
  assert.ok(seatView(s, 0).hand.some((u) => u.id === remote.id));
  assert.equal(ownerOf(s, get(s, enemy.id)!), 1);
});

test("Drowned Cadaver search prohibition reaches the public Master of the Forge action and only its engaged seat", () => {
  let s = base(2);
  const cadaver = add(s, D.cadaver, "engaged", 1),
    localForge = add(s, "04134", "allies"),
    remoteForge = add(s, "04134", "allies", 1);
  assert.equal(drownedCannotSearch(s, 0), false);
  assert.equal(drownedCannotSearch(s, 1), true);
  assert.ok(availableAbilities(s, localForge).some((a) => !a.disabled));
  s.table!.turn = 1;
  selectSeat(s, 1);
  const before = [...s.deck];
  assert.ok(availableAbilities(s, remoteForge).every((a) => a.disabled));
  assert.throws(
    () => applyAction(reload(s), { type: "ABILITY", id: remoteForge.id }),
    /search/i,
  );
  assert.deepEqual(s.deck, before);
  assert.equal(remoteForge.exhausted, false);
  destroy(s, cadaver);
  s = settle(s);
  assert.equal(drownedCannotSearch(s, 1), false);
  assert.ok(
    availableAbilities(s, get(s, remoteForge.id)!).some((a) => !a.disabled),
  );
});

test("Drowned Throngs uses actual engaged owner and resolves its low-cost bottom discard before destruction Responses", () => {
  let s = base(2);
  const enemy = add(s, D.throngs, "engaged", 1);
  forOwner(s, 1, () => {
    s.deck = ["01073", "01016"];
    s.discard = ["01016"];
  });
  s.deck = ["01026", "01073"];
  enemy.attachments.push({
    id: `a${s.nextId++}`,
    code: "09012",
    exhausted: false,
    owner: 0,
  });
  damage(s, enemy.id, 99);
  assert.equal(s.encounterDeck[0], D.throngs);
  assert.deepEqual(seatView(s, 1).deck, ["01073"]);
  assert.deepEqual(seatView(s, 1).discard, ["01016", "01016"]);
  assert.deepEqual(s.deck, ["01026", "01073"]);
  assert.ok(!s.encounterDiscard.includes(D.throngs));
  s = settle(s);
  reload(s);
});

test("Drowned Throngs destroyed in staging has no engaged-player discard; costly and empty bottoms never recycle", () => {
  let s = base();
  s.deck = ["01026"];
  destroy(s, add(s, D.throngs));
  s = settle(s);
  assert.deepEqual(s.deck, ["01026"]);
  assert.ok(s.encounterDiscard.includes(D.throngs));
  s = base();
  s.deck = ["01026", "01073"];
  destroy(s, add(s, D.throngs, "engaged"));
  s = settle(s);
  assert.deepEqual(s.deck, ["01026"]);
  assert.equal(s.discard.at(-1), "01073");
  assert.ok(s.encounterDiscard.includes(D.throngs));
  s = base();
  s.deck = [];
  destroy(s, add(s, D.throngs, "engaged"));
  s = settle(s);
  assert.ok(s.encounterDiscard.includes(D.throngs));
  assert.ok(!s.encounterDeck.includes(D.throngs));
});

test("Drowned Dead actual lethal defense bottoms only the killed borrowed ally to its physical owner, retaining duplicate discards", () => {
  let s = base(2);
  const killed = add(s, "01018", "allies", 0),
    survivor = add(s, "01018", "allies", 1);
  killed.owner = 1;
  killed.controller = 0;
  const ownerDeck = [...seatView(s, 1).deck],
    controllerDeck = [...s.deck];
  forOwner(s, 1, () => s.discard.push(killed.code));
  const attack = defend(s, D.drowned, [D.undertow], killed.id);
  s = settle(attack.state);
  assert.ok(!get(s, killed.id));
  assert.ok(get(s, survivor.id));
  assert.deepEqual(seatView(s, 1).deck, [...ownerDeck, killed.code]);
  assert.deepEqual(seatView(s, 1).discard, [killed.code]);
  assert.deepEqual(seatView(s, 0).deck, controllerDeck);
  assert.deepEqual(s.drowned!.bottomOnDestroy, []);
  reload(s);
});

test("Drowned Dead's printed shadow applies bottom replacement to another enemy's real lethal attack", () => {
  let s = base();
  const ally = add(s, "01016", "allies");
  s = settle(defend(s, D.throngs, [D.drowned], ally.id).state);
  assert.ok(!get(s, ally.id));
  assert.equal(s.deck.at(-1), ally.code);
  assert.ok(!s.discard.includes(ally.code));
  assert.deepEqual(s.drowned!.bottomOnDestroy, []);
  reload(s);
});

test("Drowned Curse damages each eligible low-cost ally across seats, bottoms only lethal copies, and excludes costly/effective-hero/objective cards", () => {
  let s = base(2);
  const lethal = add(s, "01016", "allies", 1),
    healthy = add(s, "01013", "allies", 0),
    costly = add(s, "01018", "allies", 1),
    sword = add(s, "04058", "allies", 0);
  lethal.damage = card(lethal.code).health! - 1;
  sword.attachments.push({
    id: `a${s.nextId++}`,
    code: "10149",
    exhausted: false,
    owner: 0,
  });
  s.allies = s.allies.filter((u) => u.id !== sword.id);
  s.heroes.push(sword);
  const objectiveIds = [
    captain(s, D.sahirAlly).id,
    captain(s, D.naasiyahAlly).id,
  ];
  revealed(s, D.curse);
  s = settle(s);
  assert.ok(!get(s, lethal.id));
  assert.equal(seatView(s, 1).deck.at(-1), lethal.code);
  assert.equal(get(s, healthy.id)!.damage, 1);
  assert.equal(get(s, costly.id)!.damage, 0);
  assert.equal(get(s, sword.id)!.damage, 0);
  objectiveIds.forEach((id) => assert.equal(get(s, id)!.damage, 0));
  assert.equal(s.status, "playing");
  reload(s);
});

test("Drowned Curse actual shadow discards the defending player's bottom and resolves exactly one fresh-shadow additional attack", () => {
  let s = base(2);
  const defender = seatView(s, 1).heroes[0];
  forOwner(s, 1, () => (s.deck = ["01073", "01016"]));
  s.deck = ["01026"];
  s.encounterDeck = [D.undertow, "01099", "01099"];
  const result = defend(s, D.throngs, [D.curse], defender.id, 1);
  s = result.state;
  assert.match(s.choice!.title, /Immediate/);
  assert.ok(seatView(s, 1).discard.includes("01016"));
  assert.deepEqual(seatView(s, 0).deck, ["01026"]);
  assert.ok(s.encounterDiscard.includes(D.curse));
  assert.deepEqual(get(s, result.id)!.shadows, [D.undertow]);
  s = settle(reload(s));
  assert.equal(s.combat, null);
  assert.equal(s.encounterDeck.length, 2);
  reload(s);
});

test("Drowned Curse high-cost and empty bottom shadows do not produce a phantom additional attack", () => {
  for (const deck of [["01016", "01073"], []]) {
    let s = base();
    s.deck = deck;
    s.encounterDeck = [D.undertow, "01099"];
    s = settle(defend(s, D.throngs, [D.curse], s.heroes[0].id).state);
    assert.equal(s.combat, null);
    assert.equal(s.encounterDeck.length, 2);
  }
});

test("Drowned companion UI exposes exactly one deposit Action and real controller payment persists across reload", () => {
  let s = base(2);
  const sahir = captain(s, D.sahirAlly),
    hero = s.heroes[0];
  sahir.resources = 0;
  const actions = availableAbilities(s, sahir);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].disabled, false);
  assert.match(
    drownedAbilityProblem(s, captain(s, D.naasiyahAlly))!,
    /controller/,
  );
  s = applyAction(reload(s), { type: "ABILITY", id: sahir.id });
  assert.ok(
    s.choice!.options.every((o) => s.heroes.some((h) => h.id === o.id)),
  );
  s = select(s, hero.id);
  s = settle(s);
  assert.equal(get(s, hero.id)!.resources, 9);
  assert.equal(get(s, sahir.id)!.resources, 1);
  assert.equal(stats(s, get(s, sahir.id)!).will, 1);
  assert.equal(stats(s, get(s, sahir.id)!).attack, 1);
  assert.match(drownedAbilityProblem(s, get(s, sahir.id)!)!, /already/);
  get(s, sahir.id)!.resources = 9;
  assert.equal(stats(s, get(s, sahir.id)!).will, 6);
  assert.equal(stats(s, get(s, sahir.id)!).attack, 6);
});

test("Drowned companion once-per-round deposit follows the physical card through first-player control transfer", () => {
  let s = base(2);
  const sahir = captain(s, D.sahirAlly),
    hero = s.heroes[0];
  sahir.resources = 0;
  s = applyAction(reload(s), { type: "ABILITY", id: sahir.id });
  s = select(s, hero.id);
  s = settle(s);
  s.table!.first = 1;
  s.table!.turn = 1;
  check(s);
  selectSeat(s, 1);
  s = reload(s);
  assert.equal(ownerOf(s, get(s, sahir.id)!), 1);
  assert.match(drownedAbilityProblem(s, get(s, sahir.id)!) ?? "", /already/);
  assert.equal(get(s, sahir.id)!.resources, 1);
  // Even a retained marker on the previous controller must expire with the round.
  s.round++;
  assert.equal(drownedAbilityProblem(s, get(s, sahir.id)!), null);
});

test("Drowned companion control follows first and last players while preserving all physical tokens", () => {
  let s = base(3);
  const sahir = captain(s, D.sahirAlly),
    naasiyah = captain(s, D.naasiyahAlly);
  sahir.resources = 3;
  sahir.damage = 1;
  naasiyah.resources = 2;
  naasiyah.exhausted = true;
  s.table!.first = 1;
  check(s);
  s = reload(s);
  assert.equal(ownerOf(s, get(s, sahir.id)!), 1);
  assert.equal(ownerOf(s, get(s, naasiyah.id)!), 0);
  assert.equal(get(s, sahir.id)!.resources, 3);
  assert.equal(get(s, sahir.id)!.damage, 1);
  assert.equal(get(s, naasiyah.id)!.resources, 2);
  assert.equal(get(s, naasiyah.id)!.exhausted, true);
});

test("Drowned Na'asiyah defense accepts repeated saved paid boosts and clears only this attack's additions", () => {
  let s = base();
  const n = captain(s, D.naasiyahAlly);
  n.resources = 2;
  n.tempDefense = 1;
  s = defend(s, D.drowned, [D.undertow], n.id).state;
  assert.match(s.choice!.title, /Na'asiyah/);
  s = select(s, "defense");
  assert.equal(s.drowned!.combatBoosts.length, 1);
  s = select(s, "defense");
  s = select(s, "continue");
  s = settle(s);
  assert.equal(get(s, n.id)!.resources, 0);
  assert.equal(get(s, n.id)!.damage, 0);
  assert.equal(get(s, n.id)!.tempDefense, 1);
  assert.deepEqual(s.drowned!.combatBoosts, []);
  reload(s);
});

test("Drowned Na'asiyah attack spends resources only after choices and clears boosts when the target is destroyed", () => {
  let s = base();
  const n = captain(s, D.naasiyahAlly),
    enemy = add(s, D.drowned, "engaged");
  n.resources = 2;
  s.phase = "attack";
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: enemy.id,
    attackerIds: [n.id],
  });
  assert.equal(get(s, n.id)!.resources, 2);
  s = select(s, "attack");
  s = select(s, "attack");
  s = select(s, "continue");
  s = settle(s);
  assert.ok(!get(s, enemy.id));
  assert.equal(get(s, n.id)!.resources, 0);
  assert.equal(get(s, n.id)!.tempAttack ?? 0, 0);
  assert.deepEqual(s.drowned!.combatBoosts, []);
  reload(s);
});

test("Drowned objective companion leaving causes loss in both stages, while printed Betrayal removes Sahir without losing", () => {
  const s = base();
  destroy(s, captain(s, D.sahirAlly));
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Sahir|Sahír/);
  let next = stage2(2);
  assert.equal(next.status, "playing");
  assert.ok(!allCharacters(next).some((u) => u.code === D.sahirAlly));
  assert.equal(
    next.drowned!.removedUnits.filter((u) => u.code === D.sahir).length,
    1,
  );
  assert.ok(!next.encounterDiscard.includes(D.sahir));
  next = reload(next);
  destroy(next, captain(next, D.naasiyahAlly));
  assert.equal(next.status, "lost");
  assert.match(next.reason, /Na'asiyah/);
});

test("Drowned blanked companion departure is removed physically without causing later missing-companion loss", () => {
  let s = base();
  const n = captain(s, D.naasiyahAlly);
  n.damage = 1;
  s.questAttachments = {
    [D.grotto]: [
      { id: `a${s.nextId++}`, code: WEATHER.cold, exhausted: false },
    ],
  };
  destroy(s, n, false);
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.drowned!.removedUnits.filter((u) => u.id === n.id).length, 1);
  assert.ok(!s.encounterDiscard.includes(n.code));
  assert.ok(s.removed.includes(n.code));
  s = reload(s);
  check(s);
  assert.equal(s.status, "playing");
});

test("Drowned enemy Sahir spends shields to cancel damage and gains two resources after a survived real attack", () => {
  let s = base();
  const enemy = add(s, D.sahir, "engaged");
  enemy.resources = 2;
  damage(s, enemy.id, 3);
  assert.equal(enemy.resources, 0);
  assert.equal(enemy.damage, 1);
  const hero = s.heroes[0];
  hero.tempDefense = 10;
  enemy.shadows = [D.undertow];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: hero.id,
  });
  s = settle(s);
  assert.equal(get(s, enemy.id)!.resources, 2);
  assert.equal(get(s, hero.id)!.damage, 0);
});

test("Drowned Na'asiyah can deposit an own hero resource during her actual attack and then spend it for a boost", () => {
  let s = base();
  const n = captain(s, D.naasiyahAlly),
    hero = s.heroes[0],
    enemy = add(s, D.throngs, "engaged");
  n.resources = 0;
  s.deck = ["01073"];
  s.phase = "attack";
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: enemy.id,
    attackerIds: [n.id],
  });
  assert.ok(s.choice!.options.some((o) => o.id === "deposit"));
  s = select(s, "deposit");
  s = select(s, hero.id);
  assert.equal(get(s, hero.id)!.resources, 9);
  assert.equal(get(s, n.id)!.resources, 1);
  s = select(s, "attack");
  s = settle(s);
  assert.ok(!get(s, enemy.id));
  assert.equal(get(s, n.id)!.resources, 0);
  assert.match(drownedAbilityProblem(s, get(s, n.id)!)!, /already/);
  assert.deepEqual(s.drowned!.combatBoosts, []);
  reload(s);
});

test("Drowned enemy Sahir gains four resource shields after an actual attack destroys a defending ally", () => {
  let s = base();
  const ally = add(s, "01016", "allies");
  const result = defend(s, D.sahir, [D.undertow], ally.id);
  s = settle(result.state);
  assert.ok(!get(s, ally.id));
  assert.equal(get(s, result.id)!.resources, 4);
  damage(s, result.id, 5);
  assert.equal(get(s, result.id)!.resources, 0);
  assert.equal(get(s, result.id)!.damage, 1);
  reload(s);
});
