import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  playTargets,
  validateSave,
} from "../src/game/engine";
import { card, playerCards, STARTERS, SCRIPTED } from "../src/game/cards";
import { fx, get, make, playCost, stats } from "../src/game/core";
import { allyEntryResponses, check } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { forOwner, playerOrder, seatView, selectSeat } from "../src/game/table";
import {
  restrictedLimit,
  restrictedSlots,
} from "../src/game/expansion-passives";
import {
  ULFAST_PLAYER as P,
  huntersAbilityProblem,
  huntersDeckProblems,
  huntersHealingTargets,
} from "../src/game/ulfast-player-support";
import { ulfastPlayerAttackEffects } from "../src/game/ulfast-player";
import { WEATHER } from "../src/game/weather-hills-support";
import { deckProblems } from "../src/game/decks";
import {
  fixture,
  act,
  hand,
  attach,
  play,
  pick,
  reload,
  settle,
  ring,
} from "./shadow-east-player-fixtures";
import type { GameState } from "../src/game/types";

import { contract } from "./ulfast-player-fixtures";
const eligible = playerCards
  .filter((c) => c.type_code === "attachment" && c.code !== "21001")
  .slice(0, 17);
const deck = {
  ...Object.fromEntries(eligible.map((c, i) => [c.code, i === 16 ? 2 : 3])),
  [P.hunters]: 1,
};
for (const players of [1, 2, 3, 4])
  test(`Three Hunters native ${players}-player setup removes exactly one contract per deck and saves each owner`, () => {
    const d = STARTERS[0];
    let s = createGame(998, deck, d.heroes, "custom", {
      seats: STARTERS.slice(0, players).map((d) => ({
        deckId: "custom",
        cards: deck,
        heroes: d.heroes,
      })),
    });
    s = settle(s);
    while (s.phase === "setup") s = settle(act(s, { type: "KEEP" }));
    assert.equal(s.ulfastPlayers!.contracts.length, players);
    for (const p of playerOrder(s)) {
      const v = seatView(s, p);
      assert.ok(!v.deck.includes(P.hunters));
      assert.ok(!v.hand.some((u) => u.code === P.hunters));
      assert.equal(s.ulfastPlayers!.contracts[p].player, p);
      assert.equal(restrictedLimit(v.heroes[0], s), 3);
    }
    reload(s);
  });
test("Three Hunters rejects ally decks at setup and deck validation", () => {
  const illegal = { ...deck, "01060": 1 };
  assert.equal(huntersDeckProblems(illegal).length, 1);
  assert.throws(
    () => createGame(99, illegal, STARTERS[0].heroes, "custom"),
    /cannot include ally/,
  );
  assert.ok(
    deckProblems({
      heroes: STARTERS[0].heroes,
      cards: { ...deck, unknown: 1 },
    }).some((p) => p.includes("unknown is not a scripted player card")),
  );
});
test("Three Hunters discounts the first restricted attachment played on each own hero per round", () => {
  let s = fixture(2);
  contract(s);
  const h = s.heroes[1],
    other = seatView(s, 1).heroes[0];
  assert.equal(playCost(s, card("01039"), h), 0);
  assert.equal(playCost(s, card("01039"), other), 1);
  const a = hand(s, "01039");
  s = settle(play(s, a.id, h.id));
  assert.equal(playCost(s, card("01039"), get(s, h.id)), 1);
  assert.equal(playCost(s, card("01039"), s.heroes[0]), 0);
  assert.equal(restrictedLimit(get(s, h.id)!, s), 3);
  assert.equal(restrictedLimit(other, s), 2);
  handle(s, fx("nextRound"));
  flush(s);
  s = settle(s);
  assert.equal(playCost(s, card("01039"), get(s, h.id)), 0);
});
test("Three Hunters flips only during refresh and keeps side B after losing an attachment", () => {
  let s = fixture();
  const c = contract(s),
    hero = s.heroes[0];
  for (const h of s.heroes) {
    attach(s, h, "01039");
    attach(s, h, "01040");
  }
  assert.match(huntersAbilityProblem(s, c.id)!, /Refresh/);
  s.phase = "refresh";
  assert.equal(huntersAbilityProblem(s, c.id), null);
  const before = stats(s, hero).will;
  s = act(s, { type: "ABILITY", id: c.id });
  assert.equal(s.ulfastPlayers!.contracts[0].side, "B");
  assert.equal(stats(s, get(s, hero.id)!).will, before + 2);
  assert.equal(playCost(s, card("01039"), get(s, hero.id)), 1);
  get(s, hero.id)!.attachments.pop();
  assert.equal(stats(s, get(s, hero.id)!).will, before + 1);
  assert.equal(s.ulfastPlayers!.contracts[0].side, "B");
  reload(s);
});
test("Three Hunters heal action exhausts only its owner's contract, heals each own hero and readies next refresh", () => {
  let s = fixture(2);
  const c = contract(s, 0, "B");
  contract(s, 1, "B");
  for (const p of [0, 1])
    forOwner(s, p, () => {
      for (const h of s.heroes) h.damage = 1;
    });
  s = settle(act(s, { type: "ABILITY", id: c.id }));
  assert.ok(s.ulfastPlayers!.contracts[0].unit.exhausted);
  assert.ok(seatView(s, 0).heroes.every((h) => h.damage === 0));
  assert.ok(seatView(s, 1).heroes.every((h) => h.damage === 1));
  assert.throws(() => act(s, { type: "ABILITY", id: c.id }), /exhausted/);
  selectSeat(s, 1);
  s.table!.turn = 1;
  assert.throws(
    () => act(s, { type: "ABILITY", id: c.id }),
    /own Three Hunters/,
  );
  handle(s, fx("refreshReady"));
  flush(s);
  s = settle(s);
  assert.equal(s.ulfastPlayers!.contracts[0].unit.exhausted, false);
});
test("Woodland Sentry discards a matching victory-display location only after being played from hand", () => {
  let s = fixture();
  const loc = make(s, "01097");
  s.staging.push(loc);
  s.victoryCards = [loc.code];
  const sentry = hand(s, P.sentry);
  s = play(s, sentry.id);
  assert.match(s.choice!.title, /Woodland Sentry/);
  s = pick(s, loc.id);
  assert.equal(get(s, loc.id), undefined);
  assert.ok(s.encounterDiscard.includes(loc.code));
  const another = make(s, loc.code);
  s.staging.push(another);
  const u = make(s, P.sentry);
  s.allies.push(u);
  allyEntryResponses(s, u, false, false);
  flush(s);
  assert.equal(s.choice, null);
  reload(s);
});
test("Knight of Belfalas recovers only the controller's Gondor allies even when put into play", () => {
  let s = fixture(2);
  s.discard = ["01029", "01030"];
  forOwner(s, 1, () => (s.discard = ["01029"]));
  const knight = make(s, P.knight);
  s.allies.push(knight);
  allyEntryResponses(s, knight, false, false);
  flush(s);
  assert.match(s.choice!.title, /Knight of Belfalas/);
  assert.ok(s.choice!.options.some((o) => o.code === "01029"));
  assert.ok(!s.choice!.options.some((o) => o.code === "01030"));
  s = pick(s, "0");
  assert.ok(s.hand.some((u) => u.code === "01029"));
  assert.deepEqual(seatView(s, 1).discard, ["01029"]);
  reload(s);
});
test("Keen Longbow attaches to a Lore hero, grants ranged and occupies one restricted slot", () => {
  let s = fixture();
  for (const h of s.heroes) delete h.phaseResourceIcons;
  const h = s.heroes.find((h) => card(h.code).sphere_code === "lore")!;
  const bow = hand(s, P.bow);
  const targets = playTargets(s, bow);
  assert.ok(targets.some((t) => t.id === h.id));
  assert.ok(targets.every((t) => card(t.code).sphere_code === "lore"));
  s = settle(play(s, bow.id, h.id));
  assert.equal(restrictedSlots(get(s, h.id)!), 1);
  const duplicate = hand(s, P.bow);
  assert.ok(!playTargets(s, duplicate).some((t) => t.id === h.id));
});
test("Keen Longbow saves selected discard costs and deals one damage per card before normal attack damage", () => {
  let s = fixture();
  s.phase = "attack";
  const hero = s.heroes[2];
  attach(s, hero, P.bow);
  const enemy = make(s, "01083");
  s.engaged.push(enemy);
  const ids = [hand(s, "01018").id, hand(s, "01019").id];
  const before = s.hand.length;
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [hero.id] });
  assert.match(s.choice!.title, /Keen Longbow/);
  s = pick(s, "use");
  s = pick(s, ids[0]);
  s = pick(s, ids[1]);
  assert.equal(s.hand.length, before, "selections do not pay costs yet");
  s = reload(s);
  s = pick(s, "done");
  s = settle(s);
  assert.equal(s.hand.length, before - 2);
  assert.ok(s.discard.includes("01018") && s.discard.includes("01019"));
  assert.ok(!get(s, enemy.id) || get(s, enemy.id)!.damage >= 2);
});
test("Strength and Courage targets only the Ring-bearer and doubles printed attack for one attack", () => {
  let s = fixture();
  const h = ring(s);
  const strength = hand(s, P.strength);
  assert.deepEqual(
    playTargets(s, strength).map((u) => u.id),
    [h.id],
  );
  s = settle(play(s, strength.id, h.id));
  const hero = get(s, h.id)!;
  assert.equal(stats(s, hero).attack, (card(hero.code).attack ?? 0) + 1);
  s.phase = "attack";
  const enemy = make(s, "01082");
  s.engaged.push(enemy);
  const threat = s.threat;
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [hero.id] });
  assert.match(s.choice!.title, /Strength and Courage/);
  s = pick(s, "use");
  s = settle(s);
  assert.equal(s.threat, threat + 1);
  assert.equal(
    get(s, h.id)!.attachments.find((a) => a.code === "21001")!.exhausted,
    true,
  );
  assert.deepEqual(s.ulfastPlayers!.attackBonuses, []);
  assert.equal(
    get(s, enemy.id)!.damage,
    Math.max(
      0,
      2 * (card(hero.code).attack ?? 0) + 1 - (card(enemy.code).defense ?? 0),
    ),
  );
});
test("blanked bow and exhausted One Ring do not offer unpaid attack benefits", () => {
  const s = fixture(),
    h = ring(s);
  const bow = attach(s, h, P.bow);
  bow.blanked = true;
  attach(s, h, P.strength);
  h.attachments.find((a) => a.code === "21001")!.exhausted = true;
  const enemy = make(s, "01082");
  s.engaged.push(enemy);
  hand(s, "01018");
  for (const e of ulfastPlayerAttackEffects(s, enemy, [h])) handle(s, e);
  flush(s);
  assert.equal(s.choice, null);
});
test("Three Hunters keeps three restricted attachments and requires discarding a fourth", () => {
  let s = fixture();
  contract(s);
  const h = s.heroes[1];
  for (const c of ["01039", "01040", "01041"]) attach(s, h, c);
  check(s);
  flush(s);
  assert.equal(s.choice, null);
  attach(s, h, "01042");
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Restricted/);
  s = pick(s, s.choice!.options[0].id);
  assert.equal(get(s, h.id)!.attachments.length, 3);
});
test("all eleven original Ulfast player designs resolve, with five new definitions and no duplicate contracts", () => {
  for (const c of [
    "22027",
    "22028",
    "22029",
    "22030",
    "22031",
    "22032",
    "22033",
    "22034",
    "22035",
    "22036",
    "22049",
  ])
    assert.ok(SCRIPTED.has(c));
  const s = fixture();
  const u = contract(s);
  reload(s);
  s.ulfastPlayers!.contracts.push({
    player: 0,
    unit: { ...u, id: `c${s.nextId++}` },
    side: "A",
  });
  assert.equal(validateSave(s), false);
});
test("an eliminated player's Three Hunters contract leaves play exactly once", () => {
  const s = fixture(2);
  contract(s);
  contract(s, 1);
  s.threat = 50;
  check(s);
  assert.equal(s.ulfastPlayers!.contracts.length, 1);
  assert.equal(s.ulfastPlayers!.contracts[0].player, 1);
  assert.equal(seatView(s, 0).removed.filter((c) => c === P.hunters).length, 1);
  reload(s);
});
test("an ally removed by a Forced entry effect cannot initiate its optional entry response", () => {
  const s = fixture();
  s.discard = ["01029"];
  const knight = make(s, P.knight);
  s.allies.push(knight);
  allyEntryResponses(s, knight, false, false);
  s.allies = [];
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.hand.length, 0);
});
test("Three Hunters respects hero immunity and scenario healing prohibitions before paying exhaustion", () => {
  let s = fixture();
  const c = contract(s, 0, "B");
  s.heroes[0].immuneToPlayerEffects = true;
  s.heroes[0].damage = 2;
  assert.match(huntersAbilityProblem(s, c.id)!, /can be healed/);
  s.heroes[1].damage = 1;
  assert.deepEqual(
    huntersHealingTargets(s).map((h) => h.id),
    [s.heroes[1].id],
  );
  const blocked = fixture(),
    contractCard = contract(blocked, 0, "B");
  blocked.heroes[0].damage = 1;
  blocked.staging.push(make(blocked, WEATHER.camp));
  assert.throws(
    () => act(blocked, { type: "ABILITY", id: contractCard.id }),
    /can be healed/,
  );
  assert.equal(contractCard.exhausted, false);
});
test("Raiment of War counts as two Restricted attachments for both the Three Hunters flip and willpower", () => {
  let s = fixture();
  const c = contract(s);
  s.phase = "refresh";
  for (const h of s.heroes) {
    attach(s, h, "01039");
    attach(s, h, "01040");
  }
  const gimli = s.heroes[1];
  gimli.attachments = [];
  attach(s, gimli, "12034");
  assert.equal(restrictedSlots(gimli), 2);
  assert.equal(huntersAbilityProblem(s, c.id), null);
  const before = stats(s, gimli).will;
  s = act(s, { type: "ABILITY", id: c.id });
  assert.equal(stats(s, get(s, gimli.id)!).will, before + 2);
  reload(s);
});
