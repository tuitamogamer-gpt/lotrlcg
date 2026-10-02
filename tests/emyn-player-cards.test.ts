import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { EMYN_PLAYER_CARDS } from "../src/game/emyn-player-support.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playTargets,
  stats,
} from "../src/game/engine.ts";
import {
  damage,
  discardCharacter,
  enterAlly,
  phaseEnd,
  returnAlly,
} from "../src/game/board.ts";
import { playerAttack } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import { emynPlayerRevealReduction } from "../src/game/emyn-player-cards.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import type { GameState, Unit } from "../src/game/types.ts";

let nextId = 800_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `emyn-player-${nextId++}`,
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
  const s = act(createGame(471, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(472, d.cards, d.heroes, d.id, {
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

test("The Hills of Emyn Muil registers its complete ten-card player set", () => {
  assert.equal(EMYN_PLAYER_CARDS.length, 10);
  for (const c of EMYN_PLAYER_CARDS) assert.ok(SCRIPTED.has(c.code), c.code);
});
test("Brand's Ranged participation in another player's successful attack offers a ready character from that player", () => {
  let s = table();
  const brand = unit("02072", 1),
    defender = seatView(s, 0).heroes[0],
    enemy = unit("01074");
  seatView(s, 1).heroes.push(brand);
  s.engaged.push(enemy);
  s.phase = "attack";
  playerAttack(s, enemy, [defender.id, brand.id]);
  flush(s);
  assert.equal(s.choice?.title, "Brand son of Bain · Defeated enemy");
  assert.equal(s.table!.active, 1);
  assert.ok(s.choice?.options.some((o) => o.id === defender.id));
  assert.ok(!s.choice?.options.some((o) => o.id === brand.id));
  s = choose(s, defender.id);
  assert.equal(
    seatView(s, 0).heroes.find((u) => u.id === defender.id)!.exhausted,
    false,
  );
  assert.equal(
    seatView(s, 1).heroes.find((u) => u.id === brand.id)!.exhausted,
    true,
  );
});
test("Brand cannot trigger on his own engaged enemy or an attack that does not defeat it", () => {
  for (const kill of [false, true]) {
    const s = game("tactics"),
      brand = unit("02072"),
      enemy = unit(kill ? "01074" : "01082");
    s.heroes.push(brand);
    s.engaged.push(enemy);
    s.phase = "attack";
    playerAttack(s, enemy, [brand.id]);
    flush(s);
    assert.notEqual(s.choice?.title, "Brand son of Bain · Defeated enemy");
  }
});
test("Keen-eyed Took can reveal every living deck without moving the top cards", () => {
  let s = table();
  const took = unit("02073"),
    decks = ["01013", "01028", "01058"];
  for (let i = 0; i < 3; i++) {
    selectSeat(s, i);
    s.deck = [decks[i], "01073"];
    syncSeat(s);
  }
  selectSeat(s, 0);
  enterAlly(s, took, false, false);
  flush(s);
  assert.equal(s.choice?.title, "Keen-eyed Took · Entered play");
  s = choose(s, "reveal");
  assert.deepEqual(
    s.choice?.options.map((o) => o.code),
    decks,
  );
  s = choose(s, "revealed-1");
  assert.deepEqual(
    [0, 1, 2].map((i) => seatView(s, i).deck[0]),
    decks,
  );
});
test("Keen-eyed Took's return action works while exhausted and discards each deck's top card", () => {
  let s = table();
  const took = unit("02073");
  took.exhausted = true;
  s.allies.push(took);
  const tops = [0, 1, 2].map((i) => seatView(s, i).deck[0]);
  syncSeat(s);
  s = act(s, { type: "ABILITY", id: took.id });
  assert.ok(s.hand.some((u) => u.code === "02073"));
  assert.ok(!s.allies.some((u) => u.id === took.id));
  for (let i = 0; i < 3; i++)
    assert.ok(seatView(s, i).discard.includes(tops[i]));
});
test("Keen-eyed Took cannot pay a return cost if all deck-discard effects would do nothing", () => {
  const s = game(),
    took = unit("02073");
  s.allies.push(took);
  s.deck = [];
  assert.equal(availableAbilities(s, took)[0].disabled, true);
  assert.throws(() => act(s, { type: "ABILITY", id: took.id }), /top card/);
});
test("Keen-eyed Took's deck discard opens Hidden Cache's resource response", () => {
  let s = game();
  const took = unit("02073");
  s.allies.push(took);
  s.deck = ["06143", "01073"];
  const hero = s.heroes[0],
    before = hero.resources;
  s = act(s, { type: "ABILITY", id: took.id });
  assert.equal(s.choice?.title, "Hidden Cache · Discarded from deck");
  s = choose(s, hero.id);
  assert.equal(s.heroes[0].resources, before + 2);
  assert.ok(s.discard.includes("06143"));
});
test("Rear Guard is a Quest Action, discards a controlled Leadership ally, and boosts only currently committed heroes", () => {
  let s = table();
  const ally = unit("01013"),
    ownHero = s.heroes[0],
    otherHero = seatView(s, 2).heroes[0];
  s.allies.push(ally);
  s.phase = "quest";
  ownHero.committed = true;
  otherHero.committed = true;
  const nonHero = unit("01014");
  nonHero.committed = true;
  s.allies.push(nonHero);
  const wills = [
    stats(s, ownHero).will,
    stats(s, otherHero).will,
    stats(s, nonHero).will,
  ];
  s = play(s, "02074", ally.id);
  assert.ok(!seatView(s, 0).allies.some((u) => u.id === ally.id));
  assert.equal(stats(s, seatView(s, 0).heroes[0]).will, wills[0] + 1);
  assert.equal(stats(s, seatView(s, 2).heroes[0]).will, wills[1] + 1);
  assert.equal(stats(s, seatView(s, 0).allies[0]).will, wills[2]);
  assert.equal(seatView(s, 0).heroes[1].tempWill ?? 0, 0);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, seatView(s, 0).heroes[0]).will, wills[0]);
});
test("Rear Guard rejects planning and cannot discard another player's Leadership ally", () => {
  const s = table();
  seatView(s, 2).allies.push(unit("01013", 2));
  assert.match(canPlay(s, unit("02074"))!, /Quest Action/);
  s.phase = "quest";
  s.heroes[0].committed = true;
  assert.match(canPlay(s, unit("02074"))!, /you control/);
});
test("Thorondor's optional response triggers both on put-into-play and ordinary discard", () => {
  let s = game("tactics"),
    bird = unit("02075"),
    enemy = unit("01082");
  s.staging.push(enemy);
  enterAlly(s, bird, false, false);
  flush(s);
  s = choose(s, enemy.id);
  assert.equal(s.staging[0].damage, 2);
  const current = s.allies.find((u) => u.id === bird.id)!;
  discardCharacter(s, current);
  flush(s);
  s = choose(s, enemy.id);
  assert.equal(s.staging[0].damage, 4);
  assert.ok(s.discard.includes("02075"));
});
test("Thorondor can decline, triggers after destruction, and cannot target an engaged enemy", () => {
  let s = game("tactics");
  const bird = unit("02075"),
    enemy = unit("01082"),
    engaged = unit("01074");
  s.staging.push(enemy);
  s.engaged.push(engaged);
  enterAlly(s, bird, false, true);
  flush(s);
  assert.ok(!s.choice?.options.some((o) => o.id === engaged.id));
  s = choose(s, "skip");
  damage(s, bird.id, 2);
  flush(s);
  s = choose(s, enemy.id);
  assert.equal(s.staging[0].damage, 2);
  assert.equal(s.engaged[0].damage, 0);
});
test("Thorondor's leave response follows its previous controller and Restricted attachments are illegal", () => {
  let s = table();
  const bird = unit("02075", 2),
    enemy = unit("01082");
  seatView(s, 2).allies.push(bird);
  s.staging.push(enemy);
  assert.ok(!playTargets(s, unit("19003")).some((u) => u.id === bird.id));
  returnAlly(s, bird);
  flush(s);
  assert.equal(s.table!.active, 2);
  s = choose(s, enemy.id);
  assert.equal(s.staging[0].damage, 2);
  assert.ok(seatView(s, 2).hand.some((u) => u.code === "02075"));
});
test("Meneldor's Flight returns any player's Eagle ally and triggers Thorondor's leave response", () => {
  let s = table();
  selectSeat(s, 1);
  const bird = unit("02075", 2),
    enemy = unit("01082");
  seatView(s, 2).allies.push(bird);
  s.staging.push(enemy);
  syncSeat(s);
  assert.ok(playTargets(s, unit("02076")).some((u) => u.id === bird.id));
  s = play(s, "02076", bird.id);
  assert.equal(s.table!.active, 2);
  s = choose(s, enemy.id);
  assert.ok(seatView(s, 2).hand.some((u) => u.code === "02075"));
  assert.equal(s.staging[0].damage, 2);
  assert.ok(seatView(s, 1).discard.includes("02076"));
});
test("The Riddermark's Finest exhausts and discards to explore either staging or active locations", () => {
  for (const active of [false, true]) {
    let s = game("spirit");
    const finest = unit("02077"),
      location = unit("01095");
    s.allies.push(finest);
    if (active) s.activeLocation = location;
    else s.staging.push(location);
    s = act(s, { type: "ABILITY", id: finest.id });
    assert.ok(s.discard.includes("02077"));
    s = choose(s, location.id);
    assert.equal(s.activeLocation, null);
    assert.ok(!s.staging.some((u) => u.id === location.id));
    assert.ok(s.encounterDiscard.includes("01095"));
  }
});
test("An exhausted Riddermark's Finest cannot act and immune locations are not legal targets", () => {
  const s = game("spirit"),
    finest = unit("02077");
  finest.exhausted = true;
  s.allies.push(finest);
  s.staging.push(unit("01095"));
  assert.equal(availableAbilities(s, finest)[0].disabled, true);
  finest.exhausted = false;
  s.staging = [unit(CARROCK.carrock)];
  assert.equal(availableAbilities(s, finest)[0].disabled, true);
});
test("Ride to Ruin discards an exhausted controlled Rohan ally and places three progress", () => {
  let s = game("spirit");
  const ally = unit("02006"),
    location = unit("01088");
  ally.exhausted = true;
  s.allies.push(ally);
  s.staging.push(location);
  s = play(s, "02078", ally.id);
  assert.ok(s.discard.includes("02006"));
  s = choose(s, location.id);
  assert.equal(s.staging[0].progress, 3);
});
test("Gildor exchanges a chosen viewed card with hand then reorders only the original top three", () => {
  let s = game("lore");
  const gildor = unit("02079"),
    hand = unit("01062");
  s.allies.push(gildor);
  s.hand = [hand];
  s.deck = ["01058", "01059", "01061", "01073", "01012"];
  s = act(s, { type: "ABILITY", id: gildor.id });
  assert.deepEqual(
    s.choice?.options.map((o) => o.code),
    ["01058", "01059", "01061"],
  );
  s = choose(s, "deck-1");
  s = choose(s, hand.id);
  assert.ok(s.hand.some((u) => u.code === "01059"));
  assert.ok(!s.hand.some((u) => u.id === hand.id));
  s = choose(s, "order-2");
  s = choose(s, "order-1");
  s = choose(s, "order-0");
  assert.deepEqual(s.deck, ["01061", "01062", "01058", "01073", "01012"]);
  assert.equal(s.allies[0].exhausted, true);
});
test("Gildor resolves a short deck as fully as possible and can reorder with no hand card", () => {
  let s = game("lore");
  const gildor = unit("02079");
  s.allies.push(gildor);
  s.hand = [];
  s.deck = ["01058", "01061"];
  s = act(s, { type: "ABILITY", id: gildor.id });
  assert.equal(s.choice?.options.length, 2);
  s = choose(s, "deck-0");
  s = choose(s, "order-1");
  s = choose(s, "order-0");
  assert.deepEqual(s.deck, ["01061", "01058"]);
  assert.equal(s.hand.length, 0);
});
test("Gildor's Counsel stacks across players to reduce actual staging, to a minimum of one", () => {
  let s = table();
  s.phase = "quest";
  s.heroes[0].attachments.push({
    id: "wisdom",
    code: "02034",
    exhausted: false,
  });
  s = play(s, "02080");
  selectSeat(s, 2);
  s = play(s, "02080");
  selectSeat(s, 0);
  assert.equal(emynPlayerRevealReduction(s, 3), 1);
  assert.match(canPlay(s, unit("02080"))!, /below one/);
  s.encounterDeck = ["01082", "01074", "01096"];
  s.committedIds = [s.heroes[0].id];
  s = act(s, { type: "COMMIT" });
  if (s.choice) s = choose(s, "skip");
  s = act(s, { type: "COMMIT" });
  s = act(s, { type: "COMMIT" });
  assert.equal(s.phase, "staging");
  assert.equal(s.staging.length, 1);
  assert.deepEqual(s.encounterDeck, ["01074", "01096"]);
});
test("Gildor's Counsel cannot be played after an empty commitment or during planning", () => {
  let s = table();
  assert.match(canPlay(s, unit("02080"))!, /before characters/);
  s.phase = "quest";
  s.committedIds = [];
  s = act(s, { type: "COMMIT" });
  assert.match(canPlay(s, unit("02080"))!, /before characters/);
});
test("Gildor's Counsel cannot reduce a normal solo reveal and cannot increase a zero-card reveal", () => {
  let s = game("lore");
  s.phase = "quest";
  assert.match(canPlay(s, unit("02080"))!, /below one/);
  s.scenarioId = "anduin";
  s.stage = 2;
  s = play(s, "02080");
  assert.equal(emynPlayerRevealReduction(s, 2), 1);
  assert.equal(emynPlayerRevealReduction(s, 0), 0);
  phaseEnd(s);
  flush(s);
  assert.equal(emynPlayerRevealReduction(s, 2), 2);
});
test("Song of Travel grants a Spirit icon without creating resources", () => {
  let s = game();
  const hero = s.heroes[0],
    resources = hero.resources;
  s = play(s, "02081", hero.id);
  assert.equal(s.heroes[0].resources, resources - 1);
  assert.equal(canPlay(s, unit("01044")), null);
});
