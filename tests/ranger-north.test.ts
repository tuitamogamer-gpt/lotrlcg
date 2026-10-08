import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  canPlay,
  createGame,
  validateSave,
} from "../src/game/engine";
import { DECK_CARDS, deckProblems, parseRingsDbDeck } from "../src/game/decks";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import { fx, get, make } from "../src/game/core";
import {
  check,
  destroy,
  nextRound,
  returnAlly,
  returnAlliesToHand,
} from "../src/game/board";
import { flush, handle as effect } from "../src/game/effects";
import { prepareEnemyShadows } from "../src/game/considered-engagement";
import { beginEnemyAttack } from "../src/game/combat";
import {
  activeSeat,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import { effectiveKeyword } from "../src/game/expansion-passives";
import { base, choose, reload } from "./against-shadow-final-fixtures";
import {
  RANGER_NORTH as R,
  RANGER_SUMMONS as S,
  rangerReserve,
} from "../src/game/ranger-north";
import { hasEncounterKeyword } from "../src/game/encounter-keyword";
import { SHADOW_FLAME as B } from "../src/game/shadow-flame-support";
import type { GameState } from "../src/game/types";

function fixture(players = 1) {
  const s = base("mirkwood", players);
  s.heroes[0] = make(s, "09002");
  s.startingHeroes = s.heroes.map((h) => h.code);
  for (const p of playerOrder(s))
    forOwner(s, p, () =>
      s.heroes.forEach((h) => {
        h.resources = 10;
        h.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
      }),
    );
  return s;
}
function play(s: GameState) {
  const u = make(s, S);
  s.hand.push(u);
  return applyAction(s, { type: "PLAY", id: u.id });
}
function reveal(s: GameState) {
  s.encounterDeck = [R, "01099"];
  effect(s, fx("reveal"));
  flush(s);
  return s;
}

test("Encounter allies are registered but excluded from the player deck pool and minimum", () => {
  assert.ok(SCRIPTED.has(R) && SCRIPTED.has(S));
  assert.ok(hasEncounterKeyword(card(R)));
  assert.ok(!hasEncounterKeyword(card(S)));
  assert.ok(!DECK_CARDS.some((c) => c.code === R));
  assert.ok(DECK_CARDS.some((c) => c.code === S));
  const deck = { ...STARTERS[0].cards, [R]: 3 };
  assert.throws(
    () => createGame(1, deck, STARTERS[0].heroes, "custom"),
    /50|scripted/,
  );
  assert.ok(
    deckProblems({ heroes: STARTERS[0].heroes, cards: deck }).some((p) =>
      p.includes("Ranger of the North"),
    ),
  );
});
test("each player starts with three independent set-aside Rangers, optionally fewer via setup", () => {
  const s = fixture(4);
  assert.deepEqual(s.rangerReserves, { 0: 3, 1: 3, 2: 3, 3: 3 });
  const d = STARTERS[0],
    limited = createGame(1, d.cards, d.heroes, d.id, {
      rangerReserves: { 0: 1 },
    });
  assert.equal(rangerReserve(limited), 1);
  assert.throws(
    () => createGame(1, d.cards, d.heroes, d.id, { rangerReserves: { 0: 4 } }),
    /zero and three/,
  );
});
test("Summons pays a resource, shuffles one Ranger and removes its own physical event", () => {
  let s = fixture();
  s.discard = [S, "01013"];
  const before = s.encounterDeck.length,
    resources = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s);
  assert.equal(s.encounterDeck.length, before + 1);
  assert.equal(s.encounterDeck.filter((c) => c === R).length, 1);
  assert.equal(rangerReserve(s), 2);
  assert.deepEqual(s.discard, [S, "01013"]);
  assert.deepEqual(s.removed, [S]);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    resources - 1,
  );
  assert.equal(rangerReserve(reload(s)), 2);
});
test("reserves are spent only by their own player and never refresh between rounds", () => {
  let s = fixture(2);
  s = play(s);
  assert.equal(rangerReserve(s, 1), 3);
  nextRound(s);
  s.phase = "planning";
  assert.equal(rangerReserve(s), 2);
  selectSeat(s, 1);
  s.table!.turn = 1;
  s.heroes[0].code = "09002";
  s = play(s);
  assert.equal(rangerReserve(s, 0), 2);
  assert.equal(rangerReserve(s, 1), 2);
});
test("Summons requires a controlled Dunedain hero, planning and a remaining reserve", () => {
  const s = fixture(),
    u = make(s, S);
  s.hand = [u];
  s.rangerReserves![0] = 0;
  assert.match(canPlay(s, u)!, /no Rangers/);
  s.rangerReserves![0] = 3;
  s.heroes.forEach((h) => (h.code = "01003"));
  assert.match(canPlay(s, u)!, /Dúnedain/);
  s.heroes[0].code = "09002";
  s.phase = "quest";
  assert.match(canPlay(s, u)!, /Planning Action/);
});
test("canceling Summons spends the event but neither the reserve nor self-removal resolves", () => {
  let s = fixture();
  const bane = make(s, B.bane);
  bane.attachments.push({
    id: `a${s.nextId++}`,
    code: B.counter,
    exhausted: false,
  });
  s.staging.push(bane);
  s.encounterDeck = ["01093"];
  s = play(s);
  assert.equal(rangerReserve(s), 3);
  assert.ok(s.discard.includes(S));
  assert.ok(!s.removed.includes(S));
  assert.ok(!s.encounterDeck.includes(R));
});
test("a revealed Ranger cannot be canceled, then Surges after control and aid are resolved", () => {
  let s = fixture();
  s.hand = [make(s, "01050")];
  s.staging = [make(s, "01082")];
  s = reveal(s);
  assert.match(s.choice!.title, /Choose a fellowship/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["player-0"],
  );
  assert.equal(s.encounterDeck.length, 1);
  const enemy = s.staging.find((u) => u.code === "01082")!;
  s = choose(reload(s), "player-0");
  assert.equal(s.allies[0].code, R);
  assert.equal(s.encounterDeck.length, 1);
  s = choose(reload(s), `damage-${enemy.id}`);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.equal(s.encounterDeck.length, 0);
  assert.ok(s.staging.some((u) => u.code === "01099"));
  assert.equal(s.hand[0].code, "01050");
});
test("the first player chooses control independently of the revealing player", () => {
  let s = fixture(3);
  s.table!.first = 1;
  selectSeat(s, 2);
  s.phase = "staging";
  s = reveal(s);
  assert.equal(activeSeat(s), 1);
  s = choose(reload(s), "player-2");
  assert.equal(seatView(s, 2).allies[0].code, R);
  assert.equal(seatView(s, 2).allies[0].owner, 2);
  assert.equal(s.encounterDeck.length, 0);
});
test("Ranger aid can choose an active location and resolves before the next encounter", () => {
  let s = fixture();
  s.activeLocation = make(s, "01099");
  const id = s.activeLocation.id;
  s = reveal(s);
  s = choose(s, "player-0");
  s = choose(s, `progress-${id}`);
  assert.equal(s.activeLocation!.progress, 2);
  assert.ok(s.staging.some((u) => u.code === "01099"));
});
test("Ranger retains Ranged and Sentinel as an ordinary controlled ally", () => {
  let s = fixture();
  s = reveal(s);
  s = choose(s, "player-0");
  assert.ok(effectiveKeyword(s.allies[0], "Ranged"));
  assert.ok(effectiveKeyword(s.allies[0], "Sentinel"));
});
test("a Ranger dealt as a shadow enters encounter discard without When Revealed or Surge", () => {
  const s = fixture();
  s.phase = "defense";
  const enemy = make(s, "01096");
  s.engaged = [enemy];
  s.encounterDeck = [R, "01099"];
  prepareEnemyShadows(s, enemy);
  beginEnemyAttack(s, enemy, [s.heroes[0].id]);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.allies.length, 0);
  assert.equal(s.encounterDeck.length, 1);
  effect(s, fx("endCombat"));
  flush(s);
  assert.ok(s.encounterDiscard.includes(R));
  assert.ok(!s.removed.includes(R));
});
for (const mode of ["destroy", "discard", "hand", "deck", "batch"] as const)
  test(`Encounter Ranger leaving play through ${mode} is removed and never replenishes reserve`, () => {
    const s = fixture(),
      ranger = make(s, R);
    s.allies = [ranger];
    s.rangerReserves![0] = 2;
    if (mode === "destroy") destroy(s, ranger);
    else if (mode === "discard") destroy(s, ranger, false);
    else if (mode === "hand") returnAlly(s, ranger);
    else if (mode === "deck") returnAlly(s, ranger, true);
    else returnAlliesToHand(s, [ranger]);
    assert.equal(s.allies.length, 0);
    assert.deepEqual(s.removed, [R]);
    assert.ok(!s.discard.includes(R));
    assert.ok(!s.encounterDiscard.includes(R));
    assert.ok(!s.deck.includes(R));
    assert.ok(!s.hand.some((u) => u.code === R));
    assert.equal(rangerReserve(s), 2);
  });
test("player elimination removes controlled Rangers and discards ordinary allies", () => {
  const s = fixture(2);
  s.allies = [make(s, R), make(s, "01013")];
  s.threat = 50;
  check(s);
  assert.ok(seatView(s, 0).removed.includes(R));
  assert.ok(!seatView(s, 0).discard.includes(R));
  assert.ok(seatView(s, 0).discard.includes("01013"));
  assert.equal(seatView(s, 0).allies.length, 0);
});
test("mixed simultaneous returns remove only the Encounter ally and return ordinary allies to hand", () => {
  const s = fixture();
  s.allies = [make(s, R), make(s, "01013")];
  const returned = returnAlliesToHand(s, [...s.allies]);
  assert.equal(returned.length, 1);
  assert.equal(s.hand[0].code, "01013");
  assert.deepEqual(s.removed, [R]);
});
test("malformed reserves and Rangers hidden in player decks or hands fail save validation", () => {
  for (const invalid of [-1, 4, 1.5, NaN]) {
    const s = fixture();
    s.rangerReserves![0] = invalid;
    assert.ok(!validateSave(s));
  }
  const s = fixture();
  s.rangerReserves![4] = 3;
  assert.ok(!validateSave(s));
  const d = fixture();
  d.deck.push(R);
  assert.ok(!validateSave(d));
  const h = fixture();
  h.hand.push(make(h, R));
  assert.ok(!validateSave(h));
});
test("older saves without the reserve field retain the untouched setup allowance", () => {
  let s = fixture();
  delete s.rangerReserves;
  s = reload(s);
  assert.equal(rangerReserve(s), 3);
  s = play(s);
  assert.equal(rangerReserve(s), 2);
});

test("RingsDB reports Encounter reserves without treating them as missing automation", () => {
  const report = parseRingsDbDeck(
    {
      name: "Rangers",
      heroes: { "09002": 1 },
      slots: { "09007": 3, "09015": 3 },
    },
    "https://ringsdb.com/decklist/view/1",
  );
  assert.equal(report.deck.cards["09015"], undefined);
  assert.equal(report.deck.cards["09007"], 3);
  assert.deepEqual(report.unsupported, []);
  assert.match(report.adjustments[0], /set-aside reserve/);
});
