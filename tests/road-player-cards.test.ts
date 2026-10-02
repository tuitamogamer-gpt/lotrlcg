import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { ROAD_PLAYER_CARDS } from "../src/game/road-player-support.ts";
import { availableAbilities, createGame } from "../src/game/engine.ts";
import {
  discardCharacter,
  raiseThreat,
  returnAlly,
} from "../src/game/board.ts";
import { playerAttack } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import { playCost, stats } from "../src/game/core.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import { roadPlayerPlayProblem } from "../src/game/road-player-cards.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 990_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `road-player-${nextId++}`,
  owner,
  code,
  exhausted: false,
  damage: 0,
  progress: 0,
  resources: 0,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
function game(sphere = "leadership") {
  const d = STARTERS.find((d) => d.id === sphere)!;
  const s = act(createGame(621, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(622, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: ["01001", "01002"], deckId: "leadership" },
      { heroes: ["01004", "01005"], deckId: "tactics" },
      { heroes: ["01011", "01012"], deckId: "lore" },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  for (let i = 0; i < 3; i++) {
    selectSeat(s, i);
    s.hand = [];
    s.heroes.forEach((h) => {
      h.resources = 10;
    });
    syncSeat(s);
  }
  selectSeat(s, 0);
  s.staging = [];
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function play(s: GameState, code: string, target?: string) {
  const u = unit(code, s.table?.active ?? 0);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}

test("Road to Rivendell registers the full ten-card player pack", () => {
  assert.equal(ROAD_PLAYER_CARDS.length, 10);
  for (const c of ROAD_PLAYER_CARDS) assert.ok(SCRIPTED.has(c.code), c.code);
});
test("Elladan gains his twin attack and readies after attacker declaration with his own resource", () => {
  let s = game("tactics"),
    elladan = s.heroes[0];
  elladan.code = "04028";
  s.heroes.push(unit("04001"));
  const enemy = unit("01082"),
    before = elladan.resources;
  s.engaged.push(enemy);
  assert.equal(stats(s, elladan).attack, card("04028").attack! + 2);
  playerAttack(s, enemy, [elladan.id]);
  flush(s);
  s = choose(s, "ready");
  assert.equal(s.heroes[0].resources, before - 1);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(
    s.engaged[0].damage,
    Math.max(0, card("04028").attack! + 2 - card("01082").defense!),
  );
});
test("Dúnedain Wanderer's Secrecy3 combines with its printed Ranged and Sentinel", () => {
  const s = game();
  s.threat = 20;
  assert.equal(playCost(s, card("04029")), 2);
  s.threat = 21;
  assert.equal(playCost(s, card("04029")), 5);
  assert.match(card("04029").text!, /Ranged/);
  assert.match(card("04029").text!, /Sentinel/);
});
test("Hail of Stones selects then exhausts multiple controlled characters and damages staging only", () => {
  let s = game("tactics"),
    staged = unit("01082"),
    engaged = unit("01082");
  s.staging.push(staged);
  s.engaged.push(engaged);
  const [a, b] = s.heroes;
  s = play(s, "04032", staged.id);
  s = choose(s, a.id);
  assert.equal(s.heroes[0].exhausted, false);
  s = choose(s, b.id);
  s = choose(s, "exhaust");
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(s.heroes[1].exhausted, true);
  assert.equal(s.staging[0].damage, 2);
  assert.equal(s.engaged[0].damage, 0);
});
test("Hail of Stones rejects an exhausted character and requires a staging enemy", () => {
  const s = game("tactics");
  s.heroes.forEach((h) => {
    h.exhausted = true;
  });
  s.staging.push(unit("01082"));
  assert.ok(roadPlayerPlayProblem(s, "04032"));
});
test("Rider transfers control after payment, retains ownership and may discard a shadow on its new player's enemy", () => {
  let s = table();
  const rider = unit("04033", 0);
  rider.exhausted = true;
  s.allies.push(rider);
  s.heroes[0].attachments.push({
    id: "spirit",
    code: "02081",
    exhausted: false,
    owner: 0,
  });
  const enemy = unit("01082", 1);
  enemy.shadows = ["01074", "01075"];
  enemy.revealedShadowCount = 1;
  seatView(s, 1).engaged.push(enemy);
  const before = s.heroes[0].resources;
  syncSeat(s);
  s = act(s, { type: "ABILITY", id: rider.id });
  s = choose(s, s.heroes[0].id);
  s = choose(s, "player-1");
  assert.equal(s.table!.active, 1);
  s = choose(s, `${enemy.id}-shadow-0`);
  assert.equal(seatView(s, 0).heroes[0].resources, before - 1);
  assert.equal(seatView(s, 1).allies[0].owner, 0);
  assert.equal(seatView(s, 1).allies[0].exhausted, true);
  assert.equal(seatView(s, 1).engaged[0].revealedShadowCount, 0);
  assert.ok(s.encounterDiscard.includes("01074"));
  returnAlly(s, seatView(s, 1).allies[0]);
  flush(s);
  assert.ok(seatView(s, 0).hand.some((u) => u.code === "04033"));
});
test("Rider's once-round limit follows the physical card after transfer", () => {
  let s = table();
  const rider = unit("04033", 0);
  s.allies.push(rider);
  s.heroes[0].attachments.push({
    id: "spirit",
    code: "02081",
    exhausted: false,
    owner: 0,
  });
  syncSeat(s);
  s = act(s, { type: "ABILITY", id: rider.id });
  s = choose(s, s.heroes[0].id);
  s = choose(s, "player-1");
  selectSeat(s, 1);
  s.heroes[0].attachments.push({
    id: "new-spirit",
    code: "02081",
    exhausted: false,
    owner: 1,
  });
  assert.equal(availableAbilities(s, s.allies[0])[0].disabled, true);
});
test("Song of Eärendil's entry draw is optional and belongs to its attachment controller", () => {
  let s = table();
  s.heroes[0].attachments.push({
    id: "spirit",
    code: "02081",
    exhausted: false,
    owner: 0,
  });
  const target = seatView(s, 1).heroes[0];
  target.attachments.push({
    id: "their-spirit",
    code: "02081",
    exhausted: false,
    owner: 1,
  });
  const before = seatView(s, 1).deck.length;
  s = play(s, "04034", target.id);
  assert.equal(s.table!.active, 1);
  assert.equal(s.choice?.title, "Song of Eärendil · Entered play");
  s = choose(s, "draw");
  assert.equal(seatView(s, 1).deck.length, before - 1);
});
test("Song of Eärendil may transfer one threat from another player, including framework increments", () => {
  let s = table();
  s.heroes[0].attachments.push({
    id: "earendil",
    code: "04034",
    exhausted: false,
    owner: 0,
  });
  const before = [s.threat, seatView(s, 1).threat];
  syncSeat(s);
  selectSeat(s, 1);
  raiseThreat(s, 2, "framework");
  flush(s);
  assert.equal(s.table!.active, 0);
  s = choose(s, "reduce");
  assert.equal(seatView(s, 0).threat, before[0] + 1);
  assert.equal(seatView(s, 1).threat, before[1] + 1);
});
test("Song of Eärendil does not respond to its controller's own threat increase", () => {
  const s = game("spirit");
  s.heroes[0].attachments.push({
    id: "earendil",
    code: "04034",
    exhausted: false,
    owner: 0,
  });
  raiseThreat(s, 1, "cost");
  flush(s);
  assert.equal(s.choice, null);
});
test("Out of the Wild searches only top5 non-objectives without victory and removes event to victory too", () => {
  let s = game("lore");
  s.threat = 20;
  s.encounterDeck = ["01108", "01109", "01074", "01095", "01110", "01082"];
  s.discard.push("04036");
  assert.equal(playCost(s, card("04036")), 1);
  s = play(s, "04036");
  assert.ok(
    !s.choice!.options.some((o) => o.code === "01108" || o.code === "01082"),
  );
  s = choose(s, "encounter-2");
  assert.ok(!s.encounterDeck.includes("01074"));
  assert.deepEqual(s.victoryCards, ["01074", "04036"]);
  assert.equal(s.discard.filter((code) => code === "04036").length, 1);
  assert.equal(s.encounterDeck.length, 5);
});
test("Out of the Wild can find nothing but still removes itself and shuffles", () => {
  let s = game("lore");
  s.encounterDeck = ["01108", "01109"];
  s = play(s, "04036");
  s = choose(s, "none");
  assert.deepEqual(s.victoryCards, ["04036"]);
  assert.equal(s.encounterDeck.length, 2);
});
test("The End Comes responds to a Dwarf return as well as destruction and shuffles only encounter discard", () => {
  let s = game(),
    dwarf = unit("03011");
  s.allies.push(dwarf);
  s.hand.push(unit("04037"));
  s.encounterDeck = ["01074"];
  s.encounterDiscard = ["01075", "01082"];
  returnAlly(s, dwarf);
  flush(s);
  assert.equal(s.choice?.title, "The End Comes · Dwarf left play");
  s = choose(s, "play");
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(s.encounterDeck.length, 3);
  assert.ok(s.discard.includes("04037"));
});
test("The End Comes has no response for a non-Dwarf or an empty encounter discard", () => {
  const s = game(),
    ally = unit("01013");
  s.allies.push(ally);
  s.hand.push(unit("04037"));
  s.encounterDiscard = ["01074"];
  discardCharacter(s, ally);
  flush(s);
  assert.notEqual(s.choice?.title, "The End Comes · Dwarf left play");
});
