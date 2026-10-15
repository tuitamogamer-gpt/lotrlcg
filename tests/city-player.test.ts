import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, SCRIPTED } from "../src/game/cards";
import {
  applyAction,
  availableAbilities,
  canPlay,
  playTargets,
} from "../src/game/engine";
import { get, make, playCost, stats, takePlayerDeck } from "../src/game/core";
import {
  collectResources,
  destroy,
  enterAlly,
  phaseEnd,
  returnAlliesToHand,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  allCharacters,
  allHeroes,
  forOwner,
  seatView,
  selectSeat,
} from "../src/game/table";
import { effectiveTraits, hasTrait } from "../src/game/expansion-passives";
import {
  CITY_PLAYER as P,
  CITY_PLAYER_CARDS,
  CITY_SOLDIER_DISCOUNT,
  cityPlayerAttackBonus,
} from "../src/game/city-player-support";
import {
  cityPlayerFixture as fixture,
  cityPlayerHand as hand,
  cityPlayerAlly as ally,
  cityPlayerAttach as attach,
} from "./city-player-fixtures";
import { choose, reload } from "./against-shadow-final-fixtures";
import { CARROCK } from "../src/game/carrock";
import {
  cityPlayerAbilityProblem,
  cityPlayerEvent,
} from "../src/game/city-player";
import type { GameState } from "../src/game/types";
const pick = (s: GameState, id: string) => choose(reload(s), id);
const settle = (state: GameState) => {
  let s = state;
  for (let n = 0; s.choice && n < 50; n++)
    s = pick(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options.find((o) => o.id === "continue")?.id ??
        s.choice.options[0].id,
    );
  return s;
};
function act(s: GameState, id: string) {
  return applyAction(reload(s), { type: "ABILITY", id });
}
function phase(s: GameState) {
  phaseEnd(s);
  flush(s);
  return settle(s);
}
function summon(s: GameState, index = 0) {
  const h = s.heroes[0];
  s.phase = "defense";
  s = act(s, h.id);
  assert.match(s.choice!.title, /Prince Imrahil/);
  return pick(s, `deck-${index}`);
}
test("City preserves nine original player designs and 25 physical cards", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.deepEqual(
    CITY_PLAYER_CARDS,
    catalog.filter((c: { code: string }) =>
      Object.values(P).includes(c.code as typeof P.imrahil),
    ),
  );
  assert.equal(CITY_PLAYER_CARDS.length, 9);
  assert.equal(
    CITY_PLAYER_CARDS.reduce((n, c) => n + (c.quantity ?? 0), 0),
    25,
  );
  for (const c of CITY_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.equal(card(c.code).text, c.text);
  }
});
test("Imrahil requires a Combat Action, own resource and once per round", () => {
  let s = fixture(),
    h = s.heroes[0];
  assert.ok(availableAbilities(s, h)[0].disabled);
  s.phase = "defense";
  h.resources = 0;
  assert.ok(availableAbilities(s, h)[0].disabled);
  h.resources = 2;
  s.deck = ["01018", "01023"];
  s = act(s, h.id);
  assert.equal(get(s, h.id)!.resources, 1);
  assert.ok(availableAbilities(s, get(s, h.id)!)[0].disabled);
  s = pick(s, "none");
  assert.equal(s.deck.length, 2);
  assert.equal(s.allies.length, 0);
});
test("Imrahil searches precisely the top five and excludes wrong traits and unique collisions", () => {
  let s = fixture();
  s.deck = ["01013", "01023", "01017", "01073", P.knight, P.soldier];
  // Guard of the Citadel shares Gondor; Faramir shares Noble/Gondor.
  ally(s, "01014");
  s.phase = "attack";
  s = act(s, s.heroes[0].id);
  const choices = s.choice!.options;
  assert.ok(choices.some((o) => o.id === "deck-0"));
  assert.ok(choices.some((o) => o.id === "deck-4"));
  assert.ok(!choices.some((o) => o.id === "deck-1"));
  assert.ok(!choices.some((o) => o.id === "deck-5"));
  assert.ok(!choices.some((o) => o.code === "01073"));
});
test("Imrahil puts a physical ally into play without paying or playing it and shuffles that instance at phase end", () => {
  let s = fixture();
  s.deck = [P.knight, "01023", "01024"];
  const h = s.heroes[0],
    before = h.resources;
  s = summon(s);
  const knight = s.allies.find((u) => u.code === P.knight)!;
  assert.ok(knight);
  assert.equal(get(s, h.id)!.resources, before - 1);
  assert.equal(s.alliesPlayed, 0);
  assert.equal(s.deck.length, 2);
  attach(s, knight, "01040");
  s = reload(s);
  s = phase(s);
  assert.ok(!get(s, knight.id));
  assert.equal(s.deck.filter((c) => c === P.knight).length, 1);
  assert.ok(s.discard.includes("01040"));
  let recovered;
  for (let i = 0; i < s.deck.length; i++)
    if (s.deck[i] === P.knight) {
      recovered = takePlayerDeck(s, i);
      break;
    }
  assert.equal(recovered!.code, P.knight);
  assert.equal(recovered!.damage, 0);
  assert.equal(s.deck.filter((c) => c === P.knight).length, 0);
});
test("Imrahil shuffle follows the ally's physical owner after control changes", () => {
  let s = fixture(2);
  s.deck = [P.knight];
  s = summon(s);
  const knight = s.allies.find((u) => u.code === P.knight)!;
  s.allies = s.allies.filter((u) => u.id !== knight.id);
  forOwner(s, 1, () => s.allies.push(knight));
  s = phase(reload(s));
  assert.ok(seatView(s, 0).deck.includes(P.knight));
  assert.ok(!seatView(s, 1).deck.includes(P.knight));
});
test("Imrahil departure does not pull a card out of discard or a later entry with the same physical id", () => {
  let s = fixture();
  s.deck = [P.knight];
  s = summon(s);
  const knight = s.allies.find((u) => u.code === P.knight)!;
  destroy(s, knight, false);
  s = settle(s);
  assert.ok(s.discard.includes(P.knight));
  s = phase(s);
  assert.ok(!s.deck.includes(P.knight));
  // Even a physical card explicitly re-entered after leaving is a fresh instance.
  s = fixture();
  s.deck = [P.knight];
  s = summon(s);
  const second = s.allies.find((u) => u.code === P.knight)!;
  returnAlliesToHand(s, [second]);
  s = settle(s);
  const returned = s.hand.find((u) => u.code === P.knight)!;
  s.hand = s.hand.filter((u) => u.id !== returned.id);
  returned.id = second.id;
  enterAlly(s, returned);
  s = phase(s);
  assert.ok(allCharacters(s).some((u) => u.id === second.id));
});
test("Imrahil compares gained Outlands trait and excludes ineligible unique allies", () => {
  let s = fixture();
  const h = s.heroes[0];
  attach(s, h, P.prince);
  assert.ok(effectiveTraits(h).includes("Outlands"));
  s.deck = ["06008", "01014"];
  ally(s, "01014");
  s.phase = "defense";
  s = act(s, h.id);
  assert.ok(s.choice!.options.some((o) => o.id === "deck-0"));
  assert.ok(!s.choice!.options.some((o) => o.id === "deck-1"));
});
test("Knight of the White Tower rejects a split payment and accepts a single eligible hero", () => {
  let s = fixture(),
    knight = hand(s, P.knight),
    a = s.heroes[0],
    b = s.heroes[1];
  a.resources = 2;
  b.resources = 2;
  s.heroes[2].resources = 0;
  assert.match(canPlay(s, knight)!, /single hero/);
  a.resources = 4;
  assert.throws(
    () =>
      applyAction(s, {
        type: "PLAY",
        id: knight.id,
        payment: { [a.id]: 2, [b.id]: 2 },
      }),
    /single hero/,
  );
  s = applyAction(s, { type: "PLAY", id: knight.id, payment: { [a.id]: 4 } });
  assert.ok(s.allies.some((u) => u.id === knight.id));
});
test("Soldier's optional enter-play response survives pending save and discounts next Tactics play", () => {
  let s = fixture();
  const soldier = hand(s, P.soldier),
    next = hand(s, P.soldier);
  s = applyAction(s, { type: "PLAY", id: soldier.id });
  assert.match(s.choice!.title, /Soldier of Dol Amroth/);
  s = pick(s, "use");
  assert.equal(playCost(s, card(P.soldier)), 1);
  s = applyAction(reload(s), { type: "PLAY", id: next.id });
  assert.equal(
    playCost(s, card(P.soldier)),
    2,
    "discount consumed before the new Soldier response",
  );
  s = pick(s, "skip");
  assert.ok(!s.used.includes(CITY_SOLDIER_DISCOUNT));
});
test("Soldier responses stack, expire with phase, and do not discount non-Tactics cards", () => {
  let s = fixture();
  const a = make(s, P.soldier),
    b = make(s, P.soldier);
  enterAlly(s, a);
  enterAlly(s, b);
  flush(s);
  s = pick(s, "use");
  s = pick(s, "use");
  assert.equal(playCost(s, card(P.imrahil)), 0);
  assert.equal(playCost(s, card(P.soldier)), 0);
  assert.equal(playCost(s, card(P.knight)), 4);
  s = phase(s);
  assert.equal(playCost(s, card(P.soldier)), 2);
});
test("Soldier discount is consumed even when the next Tactics event costs zero", () => {
  let s = fixture();
  s.used.push(CITY_SOLDIER_DISCOUNT);
  const event = hand(s, "01038");
  s.phase = "attack";
  s = applyAction(s, { type: "PLAY", id: event.id, target: s.heroes[0].id });
  s = settle(s);
  assert.ok(!s.used.includes(CITY_SOLDIER_DISCOUNT));
});
test("Soldier response from Imrahil applies despite not playing the ally from hand", () => {
  let s = fixture();
  s.deck = [P.soldier];
  s = summon(s);
  assert.match(s.choice!.title, /Soldier/);
  s = pick(s, "use");
  assert.equal(playCost(s, card(P.soldier)), 1);
  const soldier = s.allies.find((u) => u.code === P.soldier)!;
  destroy(s, soldier, false);
  s = settle(s);
  assert.equal(
    playCost(s, card(P.soldier)),
    1,
    "lasting discount remains after its source leaves",
  );
});
test("Súlien lets another player spend only that player's Lore and exhausts the shared physical ally", () => {
  let s = fixture(2);
  const sulien = ally(s, P.sulien),
    location = make(s, "01099");
  s.staging = [location];
  const caster = seatView(s, 1).heroes[0];
  selectSeat(s, 1);
  s = act(s, sulien.id);
  assert.match(s.choice!.title, /Súlien/);
  assert.ok(
    s.choice!.options.every((o) =>
      seatView(s, 1).heroes.some((h) => h.id === o.id),
    ),
  );
  s = pick(s, caster.id);
  assert.equal(get(s, caster.id)!.resources, 9);
  assert.equal(get(s, sulien.id)!.exhausted, true);
  assert.equal(get(s, location.id)!.tempThreat, -1);
});
test("Súlien reduces each affected staging location, excludes active locations and expires at phase end", () => {
  let s = fixture(),
    sulien = ally(s, P.sulien),
    a = make(s, "01099"),
    b = make(s, "01094"),
    active = make(s, "01099"),
    immune = make(s, CARROCK.carrock);
  immune.immuneToPlayerEffects = true;
  s.staging = [a, b, immune];
  s.activeLocation = active;
  s = act(s, sulien.id);
  s = pick(s, s.heroes[0].id);
  assert.equal(get(s, a.id)!.tempThreat, -1);
  assert.equal(get(s, b.id)!.tempThreat, -1);
  assert.ok(!get(s, immune.id)!.tempThreat);
  assert.ok(!get(s, active.id)!.tempThreat);
  s = phase(s);
  assert.equal(get(s, a.id)!.tempThreat, 0);
});
test("Súlien rejects exhausted source, no triggering-player Lore, immunity and all-immune locations", () => {
  const s = fixture(2),
    sulien = ally(s, P.sulien);
  s.staging = [make(s, "01099")];
  sulien.exhausted = true;
  assert.ok(availableAbilities(s, sulien)[0].disabled);
  sulien.exhausted = false;
  sulien.immuneToPlayerEffects = true;
  assert.ok(cityPlayerAbilityProblem(s, sulien));
  delete sulien.immuneToPlayerEffects;
  selectSeat(s, 1);
  for (const h of s.heroes) h.resources = 0;
  assert.ok(availableAbilities(s, sulien)[0].disabled);
});
test("Inspiring Presence uses printed threat cost, affects every lower-threat hero, and optional group Leadership", () => {
  let s = fixture(2),
    chosen = s.heroes[0],
    event = hand(s, P.presence);
  const lower = allHeroes(s).filter((h) => (card(h.code).threat ?? 0) < 11),
    equal = allHeroes(s).filter((h) => (card(h.code).threat ?? 0) >= 11);
  s = applyAction(s, { type: "PLAY", id: event.id, target: chosen.id });
  for (const h of lower) assert.equal(get(s, h.id)!.tempDefense, 2);
  for (const h of equal) assert.ok(!get(s, h.id)!.tempDefense);
  assert.match(s.choice!.title, /Group may spend 2 Leadership/);
  const a = seatView(s, 0).heroes[1],
    b = seatView(s, 1).heroes[0];
  const option = s.choice!.options.find(
    (o) =>
      o.effects[0]?.ids?.includes(a.id) && o.effects[0]?.ids?.includes(b.id),
  )!;
  assert.ok(option);
  const initialA = get(s, a.id)!.resources,
    initialB = get(s, b.id)!.resources;
  s = pick(s, option.id);
  assert.equal(get(s, a.id)!.resources, initialA - 1);
  assert.equal(get(s, b.id)!.resources, initialB - 1);
  for (const h of lower) assert.equal(get(s, h.id)!.tempAttack, 2);
  s = phase(s);
  for (const h of lower) {
    assert.equal(get(s, h.id)!.tempAttack, 0);
    assert.equal(get(s, h.id)!.tempDefense, 0);
  }
});
test("Inspiring Presence can decline its additional cost and cannot target another player's hero", () => {
  let s = fixture(2),
    event = hand(s, P.presence);
  assert.ok(
    !playTargets(s, event).some((h) => h.id === seatView(s, 1).heroes[0].id),
  );
  s = applyAction(s, { type: "PLAY", id: event.id, target: s.heroes[0].id });
  s = pick(s, "skip");
  assert.ok(allHeroes(s).some((h) => h.tempDefense === 2));
  assert.ok(allHeroes(s).every((h) => !h.tempAttack));
});
test("Inspiring Presence's Then payment is unavailable when a lower-threat hero is immune", () => {
  const s = fixture(2);
  seatView(s, 1).heroes[0].immuneToPlayerEffects = true;
  cityPlayerEvent(s, P.presence, s.heroes[0].id);
  assert.equal(s.choice, null);
  assert.ok(!seatView(s, 1).heroes[0].tempDefense);
});
test("Guardian enters by effect, chooses only its controller's engaged enemies, and clears physical shadows", () => {
  let s = fixture(2);
  const enemy = make(s, "01089"),
    other = make(s, "01082");
  s.engaged = [enemy];
  forOwner(s, 1, () => s.engaged.push(other));
  enemy.shadows = ["01099"];
  enemy.revealedShadowCount = 1;
  enemy.faceupShadows = [true];
  const guardian = make(s, P.guardian);
  enterAlly(s, guardian);
  flush(s);
  assert.match(s.choice!.title, /Guardian of Ithilien/);
  assert.ok(s.choice!.options.some((o) => o.id === enemy.id));
  assert.ok(!s.choice!.options.some((o) => o.id === other.id));
  s = pick(s, enemy.id);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.ok(!s.engaged.some((u) => u.id === enemy.id));
  assert.ok(s.encounterDiscard.includes("01099"));
  assert.deepEqual(get(s, enemy.id)!.shadows, []);
});
test("Guardian return is optional and excludes enemy immunity", () => {
  let s = fixture();
  const enemy = make(s, "01089");
  enemy.immuneToPlayerEffects = true;
  s.engaged = [enemy];
  enterAlly(s, make(s, P.guardian));
  flush(s);
  assert.equal(s.choice, null);
  delete enemy.immuneToPlayerEffects;
  enterAlly(s, make(s, P.guardian));
  flush(s);
  s = pick(s, "skip");
  assert.ok(s.engaged.some((u) => u.id === enemy.id));
});
test("Ranger Spear requires Ranger character, is Restricted, and its extra attack depends on the actual enemy attachment", () => {
  const s = fixture(),
    spear = hand(s, P.spear),
    ranger = ally(s, P.guardian),
    enemy = make(s, "01089");
  assert.ok(playTargets(s, spear).some((u) => u.id === ranger.id));
  assert.ok(!playTargets(s, spear).some((u) => u.id === s.heroes[0].id));
  attach(s, ranger, P.spear);
  assert.equal(stats(s, ranger).attack, 2);
  assert.equal(cityPlayerAttackBonus(s, ranger, enemy), 0);
  attach(s, enemy, "05017");
  assert.equal(cityPlayerAttackBonus(s, ranger, enemy), 1);
  ranger.attachments[0].blanked = true;
  assert.equal(cityPlayerAttackBonus(s, ranger, enemy), 0);
});
test("Ranger Spear adds the conditional point to actual combat damage", () => {
  let s = fixture();
  s.phase = "attack";
  const ranger = ally(s, P.guardian),
    enemy = make(s, "01082");
  attach(s, ranger, P.spear);
  attach(s, enemy, "05017");
  enemy.damage = 0;
  s.engaged = [enemy];
  s = applyAction(s, {
    type: "ATTACK",
    enemyId: enemy.id,
    attackerIds: [ranger.id],
  });
  s = settle(s);
  assert.equal(get(s, enemy.id)!.damage, 0, "1 printed +2 Spear −3 defense");
  // Without the conditional point, 3 attack would not be reached.
  assert.ok(s.log.some((line) => /3 attack/.test(line.text)));
});
test("Prince of Dol Amroth attaches to supported original Imrahil heroes and grants Outlands", () => {
  for (const code of [P.imrahil, "02050"]) {
    let s = fixture();
    s.heroes[0] = { ...s.heroes[0], code };
    s.startingHeroes = s.heroes.map((h) => h.code);
    const title = hand(s, P.prince),
      hero = s.heroes[0];
    assert.ok(playTargets(s, title).some((h) => h.id === hero.id));
    assert.ok(!playTargets(s, title).some((h) => h.id === s.heroes[1].id));
    s = applyAction(reload(s), { type: "PLAY", id: title.id, target: hero.id });
    assert.ok(hasTrait(get(s, hero.id)!, "Outlands"));
  }
});
test("Prince extra resource requires four Outlands spheres controlled by the Imrahil controller", () => {
  let s = fixture(2),
    h = s.heroes[0];
  attach(s, h, P.prince);
  for (const code of ["06002", "06004", "06006", "06008"]) ally(s, code);
  const initial = h.resources;
  collectResources(s);
  s = settle(s);
  assert.equal(get(s, h.id)!.resources, initial + 2);
  const lore = s.allies.find((u) => card(u.code).sphere_code === "lore")!;
  s.allies = s.allies.filter((u) => u.id !== lore.id);
  forOwner(s, 1, () => s.allies.push(lore));
  const before = get(s, h.id)!.resources;
  collectResources(s);
  s = settle(s);
  assert.equal(get(s, h.id)!.resources, before + 1);
});
test("Prince extra collection respects blanking and never grants resources to an ally Imrahil", () => {
  let s = fixture(),
    h = s.heroes[0];
  const a = attach(s, h, P.prince);
  a.blanked = true;
  for (const code of ["06002", "06004", "06006", "06008"]) ally(s, code);
  const before = h.resources;
  collectResources(s);
  s = settle(s);
  assert.equal(get(s, h.id)!.resources, before + 1);
});
test("Four-seat Súlien action uses only the active fourth player's Lore resource pool", () => {
  let s = fixture(4);
  const sulien = ally(s, P.sulien);
  s.staging = [make(s, "01099")];
  selectSeat(s, 3);
  if (s.table) s.table.turn = 3;
  const payer = s.heroes[0];
  s = act(s, sulien.id);
  assert.ok(
    s.choice!.options.every((o) =>
      seatView(s, 3).heroes.some((h) => h.id === o.id),
    ),
  );
  s = pick(s, payer.id);
  assert.equal(get(s, payer.id)!.resources, 9);
  assert.equal(get(s, sulien.id)!.exhausted, true);
});
test("Inspiring Presence grants to heroes at all four seats with strict printed threat comparison", () => {
  let s = fixture(4);
  const event = hand(s, P.presence),
    chosen = s.heroes[0];
  const lower = allHeroes(s).filter((h) => (card(h.code).threat ?? 0) < 11);
  s = applyAction(s, { type: "PLAY", id: event.id, target: chosen.id });
  for (const h of lower) assert.equal(get(s, h.id)!.tempDefense, 2);
  s = pick(s, "skip");
  assert.equal(
    allHeroes(s).filter((h) => h.tempDefense === 2).length,
    lower.length,
  );
});
test("Imrahil paid search finishes using last known shared traits if he leaves before its continuation", () => {
  let s = fixture();
  s.phase = "attack";
  s.deck = [P.knight];
  const h = s.heroes[0];
  s = act(s, h.id);
  destroy(s, get(s, h.id)!, false);
  // The already initiated ability resolves independently of its source.
  s = pick(s, "deck-0");
  assert.ok(s.allies.some((u) => u.code === P.knight));
});
test("Súlien's lasting location modifier remains after she leaves play and ends with phase", () => {
  let s = fixture();
  const sulien = ally(s, P.sulien),
    location = make(s, "01099");
  s.staging = [location];
  s = act(s, sulien.id);
  s = pick(s, s.heroes[0].id);
  destroy(s, get(s, sulien.id)!, false);
  s = settle(s);
  assert.equal(get(s, location.id)!.tempThreat, -1);
  s = phase(s);
  assert.equal(get(s, location.id)!.tempThreat, 0);
});

test("Prince follows its bearer controller rather than the physical attachment owner", () => {
  let s = fixture(2);
  const hero = s.heroes[0];
  attach(s, hero, P.prince, 1);
  for (const code of ["06002", "06004", "06006", "06008"]) ally(s, code, 1);
  const before = hero.resources;
  collectResources(s);
  s = settle(s);
  assert.equal(get(s, hero.id)!.resources, before + 1);
  const titled = get(s, hero.id)!;
  const outlands = [...seatView(s, 1).allies];
  forOwner(s, 1, () => (s.allies = []));
  s.allies.push(...outlands);
  const after = titled.resources;
  collectResources(s);
  s = settle(s);
  assert.equal(get(s, hero.id)!.resources, after + 2);
});
