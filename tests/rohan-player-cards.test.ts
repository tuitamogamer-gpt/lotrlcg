import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { ROHAN_PLAYER_CARDS } from "../src/game/rohan-player-support.ts";
import { officialStarterDecks } from "../src/game/products.ts";
import { deckProblems } from "../src/game/decks.ts";
import {
  createGame,
  canPlay,
  playTargets,
  availableAbilities,
  stats,
  validateSave,
} from "../src/game/engine.ts";
import {
  make,
  get,
  playCost,
  fx,
  prepend,
  eligiblePayers,
} from "../src/game/core.ts";
import {
  discardCharacter,
  returnAlly,
  enterAlly,
  phaseEnd,
  damage,
  nextRound,
  discardAttachment,
} from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import {
  selectSeat,
  seatView,
  syncSeat,
  defendersFor,
  attackersFor,
} from "../src/game/table.ts";
import {
  effectiveTraits,
  effectiveKeyword,
} from "../src/game/expansion-passives.ts";
import {
  rohanCharactersLeft,
  rohanQuestSucceeded,
  rohanRoundEnd,
} from "../src/game/rohan-player-cards.ts";
import { RETURN } from "../src/game/return-mirkwood.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import { SHADOW_FLAME as S } from "../src/game/shadow-flame-support.ts";
import type { GameState } from "../src/game/types.ts";
const retail = officialStarterDecks.find((d) => d.id === "starter-rohan")!;
function game() {
  let s = act(createGame(461, retail.cards, retail.heroes, "custom"), {
    type: "KEEP",
  });
  s.staging = [];
  s.queue = [];
  s.choice = null;
  s.hand = [];
  s.deck = Array(20).fill("01018");
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}
function table() {
  let s = createGame(462, retail.cards, retail.heroes, "custom", {
    seats: [
      { heroes: retail.heroes, deckId: "custom", cards: retail.cards },
      { heroes: STARTERS[0].heroes, deckId: STARTERS[0].id },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  for (const i of [0, 1]) {
    selectSeat(s, i);
    s.hand = [];
    s.deck = Array(20).fill("01018");
    s.heroes.forEach((h) => (h.resources = 10));
    syncSeat(s);
  }
  selectSeat(s, 0);
  s.staging = [];
  s.queue = [];
  s.choice = null;
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function skipAll(s: GameState) {
  for (let i = 0; s.choice && i < 80; i++) s = choose(s, "skip");
  assert.equal(s.choice, null);
  return s;
}
function play(
  s: GameState,
  code: string,
  target?: string,
  payment?: Record<string, number>,
) {
  const u = make(s, code);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target, payment });
}
function attach(
  s: GameState,
  u: GameState["heroes"][number],
  code: string,
  owner = 0,
) {
  const a = { id: `rohan-a-${s.nextId++}`, code, exhausted: false, owner };
  u.attachments.push(a);
  return a.id;
}

test("Riders of Rohan exact fifty-card main list and fifteen new identities are registered", () => {
  assert.equal(ROHAN_PLAYER_CARDS.length, 15);
  for (const c of ROHAN_PLAYER_CARDS) assert.ok(SCRIPTED.has(c.code), c.name);
  assert.deepEqual(deckProblems(retail), []);
  assert.equal(
    Object.values(retail.cards).reduce((n, v) => n + v, 0),
    50,
  );
  assert.equal(card("17058").deck_limit, 1);
});
test("Lothíriel's Rohan trait follows any live Éomer and is removed when Éomer leaves", () => {
  const s = game(),
    l = s.heroes[2];
  assert.ok(effectiveTraits(l).includes("Rohan"));
  s.heroes = s.heroes.filter((u) => u.code !== "07001");
  stats(s, l);
  assert.ok(!effectiveTraits(l).includes("Rohan"));
  s.allies = [make(s, "07001")];
  stats(s, l);
  assert.ok(effectiveTraits(l).includes("Rohan"));
});
test("Guthlaf's cost and sentinel inspect every player's heroes", () => {
  const s = table();
  assert.equal(playCost(s, card("06110")), 2);
  const g = make(s, "06110");
  selectSeat(s, 1);
  s.allies = [g];
  syncSeat(s);
  selectSeat(s, 0);
  stats(s, g);
  assert.ok(effectiveKeyword(g, "Sentinel"));
  assert.ok(defendersFor(s, make(s, "01081")).some((u) => u.id === g.id));
});
test("Firefoot and Red Arrow have exact host restrictions and live bonuses", () => {
  const s = game(),
    e = s.heroes[0],
    h = s.heroes[1],
    l = s.heroes[2];
  attach(s, e, "08004");
  attach(s, h, "17058");
  assert.equal(stats(s, e).attack, 5);
  assert.equal(stats(s, h).will, 3);
  assert.ok(playTargets(s, make(s, "08004")).some((u) => u.id === l.id));
  assert.ok(!playTargets(s, make(s, "17058")).some((u) => u.id === e.id));
});
test("Éomer's global optional leaves-play boost persists through phases and is once per round", () => {
  let s = table();
  selectSeat(s, 1);
  const ally = make(s, "01018");
  s.allies = [ally];
  syncSeat(s);
  discardCharacter(s, ally);
  flush(s);
  assert.match(s.choice!.title, /Éomer/);
  s = choose(s, "use");
  assert.equal(stats(s, get(s, s.heroes[0].id)!).attack, 5);
  const eomer = get(s, seatView(s, 0).heroes[0].id)!;
  selectSeat(s, 1);
  s.allies = [make(s, "01018")];
  discardCharacter(s, s.allies[0]);
  flush(s);
  assert.equal(s.choice, null);
  selectSeat(s, 0);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, eomer).attack, 5);
  nextRound(s);
  assert.equal(stats(s, eomer).attack, 3);
});
test("Éomer's existing bonus survives blanking but no printed response is offered while blank", () => {
  let s = game(),
    e = s.heroes[0],
    ally = make(s, "01018");
  s.allies = [ally];
  discardCharacter(s, ally);
  flush(s);
  s = choose(s, "use");
  attach(s, get(s, e.id)!, KHAZAD.fear);
  assert.equal(stats(s, get(s, e.id)!).attack, 5);
  s.allies = [make(s, "01018")];
  s.used = s.used.filter((k) => !k.startsWith("round:eomer-used"));
  discardCharacter(s, s.allies[0]);
  flush(s);
  assert.equal(s.choice, null);
});
test("Horn of the Mark follows host controller and responds to a matching character from another seat", () => {
  let s = table();
  const host = seatView(s, 1).heroes[1],
    id = attach(s, host, "22035", 0),
    ally = make(s, "07006");
  s.allies = [ally];
  discardCharacter(s, ally);
  flush(s);
  if (s.choice?.title.includes("Éomer")) s = choose(s, "skip");
  assert.match(s.choice!.title, /Horn/);
  s = choose(s, "use");
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.equal(
    get(s, host.id)!.attachments.find((a) => a.id === id)!.exhausted,
    true,
  );
  s = skipAll(s);
});
test("Enemies leaving play do not trigger character-only Éomer responses", () => {
  const s = game();
  rohanCharactersLeft(s, [], 0);
  flush(s);
  assert.equal(s.choice, null);
  s.engaged = [make(s, "01081")];
  damage(s, s.engaged[0].id, 99);
  flush(s);
  assert.equal(s.choice, null);
});
test("Horse-breeder searches ten cards on entering without a play trigger and adds the Mount directly", () => {
  let s = game();
  s.deck = [...Array(9).fill("01018"), "08004", "08004"];
  const breeder = make(s, "07007");
  enterAlly(s, breeder);
  flush(s);
  s = choose(s, "use");
  assert.ok(validateSave(s));
  assert.equal(s.choice!.options.filter((o) => o.code === "08004").length, 1);
  s = choose(s, "take-9");
  assert.equal(s.hand[0].code, "08004");
  assert.equal(s.deck.length, 10);
  assert.equal(s.discard.length, 0);
});
test("Westfold Outrider can pay an exhausted discard cost and engage another player's enemy", () => {
  let s = table();
  const ally = make(s, "07006");
  ally.exhausted = true;
  s.allies = [ally];
  selectSeat(s, 1);
  const enemy = make(s, "01081");
  s.engaged = [enemy];
  syncSeat(s);
  selectSeat(s, 0);
  s = act(s, { type: "ABILITY", id: ally.id });
  s = choose(s, enemy.id);
  assert.ok(s.engaged.some((u) => u.id === enemy.id));
  assert.equal(seatView(s, 1).engaged.length, 0);
  assert.ok(s.discard.includes("07006"));
  s = skipAll(s);
});
test("Lothíriel commits a matching hand ally exhausted and returns it to the owner's deck after quest", () => {
  let s = game();
  const l = s.heroes[2],
    ally = make(s, "02030"),
    gandalf = make(s, "01073");
  s.hand = [ally, gandalf];
  s.encounterDeck = ["01077"];
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: l.id });
  s = act(s, { type: "COMMIT" });
  s = choose(s, "use");
  assert.ok(!s.choice!.options.some((o) => o.id === gandalf.id));
  s = choose(s, ally.id);
  assert.equal(get(s, ally.id)!.exhausted, true);
  assert.equal(get(s, ally.id)!.committed, true);
  s = act(s, { type: "NEXT" });
  s = skipAll(s);
  assert.ok(!get(s, ally.id));
  assert.ok(s.deck.includes("02030"));
  assert.ok(s.hand.some((u) => u.id === gandalf.id));
});
test("Lothíriel cannot select nonmatching allies when Éomer is absent", () => {
  let s = game();
  s.heroes = s.heroes.filter((u) => u.code !== "07001");
  const l = s.heroes.find((u) => u.code === "22027")!;
  s.hand = [make(s, "02030")];
  s.encounterDeck = ["01077"];
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: l.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(s.choice, null);
});
test("Hirgon successful-quest response pays a discounted Tactics ally through actual resource choices", () => {
  let s = game();
  const h = s.heroes[1],
    ally = make(s, "07006");
  s.hand = [ally];
  h.committed = true;
  s.phase = "staging";
  rohanQuestSucceeded(s);
  flush(s);
  s = choose(s, "use");
  s = choose(s, ally.id);
  assert.match(s.choice!.title, /resource pool/);
  const before = s.heroes[0].resources;
  s = choose(s, s.heroes[0].id);
  assert.ok(s.allies.some((u) => u.id === ally.id));
  assert.equal(s.heroes[0].resources, before - 1);
  const threat = s.threat;
  s = choose(s, "raise");
  assert.equal(s.threat, threat + 1);
  assert.equal(stats(s, get(s, ally.id)!).attack, 3);
  assert.equal(stats(s, get(s, ally.id)!).defense, 2);
  assert.ok(validateSave(s));
});
test("Hirgon's reduction has minimum one and combines Guthlaf's global discount", () => {
  let s = game();
  const h = s.heroes[1],
    ally = make(s, "06110");
  s.hand = [ally];
  h.committed = true;
  s.phase = "staging";
  rohanQuestSucceeded(s);
  flush(s);
  s = choose(s, "use");
  s = choose(s, ally.id);
  assert.equal(s.choice!.description, "1 matching resource remaining.");
});
test("Hirgon only responds after he committed and cannot play for Gollum's barred guard", () => {
  const s = game();
  s.hand = [make(s, "07006")];
  s.phase = "staging";
  rohanQuestSucceeded(s);
  flush(s);
  assert.equal(s.choice, null);
  s.heroes[1].committed = true;
  s.scenarioId = "return-to-mirkwood";
  s.stage = 3;
  s.allies = [make(s, RETURN.gollum)];
  rohanQuestSucceeded(s);
  flush(s);
  assert.equal(s.choice, null);
});
test("Red Arrow requires Valour, removes the physical attachment into victory and searches only five", () => {
  let s = game();
  const h = s.heroes[1],
    id = attach(s, h, "17058");
  h.committed = true;
  s.phase = "staging";
  s.threat = 39;
  s.deck = ["01018", "01018", "01018", "01018", "07006", "01073"];
  rohanQuestSucceeded(s);
  flush(s);
  assert.equal(s.choice, null);
  s.threat = 40;
  rohanQuestSucceeded(s);
  flush(s);
  s = choose(s, "use");
  assert.ok(!get(s, h.id)!.attachments.some((a) => a.id === id));
  assert.ok(s.victoryCards!.includes("17058"));
  assert.ok(!s.discard.includes("17058"));
  assert.ok(!s.choice!.options.some((o) => o.code === "01073"));
  assert.ok(validateSave(s));
  s = choose(s, "ally-4");
  assert.ok(s.allies.some((u) => u.code === "07006"));
});
test("Westfold Lancer discards as a response cost and damages a non-unique staging enemy", () => {
  let s = game();
  const lancer = make(s, "22142"),
    enemy = make(s, "01082");
  lancer.committed = true;
  s.allies = [lancer];
  s.staging = [enemy];
  s.phase = "staging";
  rohanQuestSucceeded(s);
  flush(s);
  s = choose(s, "use");
  s = choose(s, enemy.id);
  assert.ok(s.discard.includes("22142"));
  assert.equal(get(s, enemy.id)!.damage, 2);
  s = skipAll(s);
});
test("Wait no Longer is reachable only in the quest-beginning response window and reduces staging", () => {
  let s = game();
  assert.match(canPlay(s, make(s, "17005"))!, /automatically/);
  s.hand = [make(s, "17005")];
  s.encounterDeck = ["01077", "01081", "01077", "01077", "01077", "01089"];
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Wait no Longer/);
  s = choose(s, "use");
  assert.ok(!s.choice!.options.some((o) => o.code === "01089"));
  s = choose(s, "enemy-1");
  assert.equal(s.engaged[0].code, "01081");
  assert.equal(s.choice, null);
  s = act(s, { type: "COMMIT" });
  assert.equal(s.staging.length, 0);
  assert.equal(s.encounterDeck.length, 5);
});
test("An incomplete Wait no Longer search does not apply its then-reveal reduction", () => {
  let s = game();
  s.hand = [make(s, "17005")];
  s.encounterDeck = Array(5).fill("01077");
  s = act(s, { type: "NEXT" });
  s = choose(s, "use");
  assert.equal(s.choice, null);
  s = act(s, { type: "COMMIT" });
  assert.equal(s.staging.length, 1);
});
test("Muster treats only Rohan heroes as Spirit payers for this card", () => {
  let s = game();
  s.heroes.forEach((h) => (h.resources = 0));
  s.heroes[0].resources = 1;
  s.heroes[2].resources = 3;
  assert.deepEqual(
    eligiblePayers(s, card("22062")).map((u) => u.code),
    ["07001", "22027"],
  );
  assert.equal(canPlay(s, make(s, "22062")), null);
  assert.match(canPlay(s, make(s, "01050"))!, /automatically/);
  s = play(s, "22062", undefined, { [s.heroes[0].id]: 1, [s.heroes[2].id]: 3 });
  assert.equal(s.heroes[0].resources, 0);
  assert.equal(s.heroes[2].resources, 0);
});
test("Muster searches the original ten, caps four, prevents duplicate uniques and discards survivors at round end", () => {
  let s = game();
  s.deck = [
    "02030",
    "02030",
    "07006",
    "07006",
    "07007",
    "01018",
    "01018",
    "01018",
    "01018",
    "01018",
    "02030",
  ];
  s = play(s, "22062");
  s = choose(s, "ally-0");
  assert.ok(!s.choice!.options.some((o) => o.id === "ally-1"));
  assert.ok(!s.choice!.options.some((o) => o.id === "ally-10"));
  s = choose(s, "ally-2");
  s = choose(s, "ally-3");
  s = choose(s, "done");
  assert.equal(s.allies.length, 3);
  assert.equal(s.deck.length, 8);
  assert.ok(validateSave(s));
  rohanRoundEnd(s);
  flush(s);
  s = skipAll(s);
  assert.equal(s.allies.length, 0);
  assert.equal(s.discard.filter((c) => c === "07006").length, 2);
});
test("Riddermark Knight optionally gains two attack for only its declared attack and then leaves play", () => {
  let s = game();
  const knight = make(s, "17112"),
    enemy = make(s, "01081");
  s.allies = [knight];
  s.engaged = [enemy];
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [knight.id] });
  assert.match(s.choice!.title, /Knight/);
  s = choose(s, "use");
  assert.ok(!get(s, enemy.id));
  assert.ok(s.discard.includes("17112"));
  assert.ok(!s.used.some((k) => k === `attack:riddermark:${knight.id}`));
  s = skipAll(s);
});
test("Firefoot assigns exact excess to a chosen non-unique engaged enemy after its hero attacks alone", () => {
  let s = game();
  const e = s.heroes[0],
    id = attach(s, e, "08004"),
    target = make(s, "01081"),
    spill = make(s, "01082");
  target.damage = 1;
  s.engaged = [target, spill];
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: target.id, attackerIds: [e.id] });
  assert.match(s.choice!.title, /Firefoot/);
  s = choose(s, "use");
  s = choose(s, spill.id);
  assert.equal(
    get(s, e.id)!.attachments.find((a) => a.id === id)!.exhausted,
    true,
  );
  assert.equal(get(s, spill.id)!.damage, 4);
});
test("Forth Eorlingas permits multiple own Rohan heroes against staging without Dúnhere's bonus", () => {
  let s = game();
  const e = s.heroes[0],
    l = s.heroes[2],
    enemy = make(s, "01082");
  s.staging = [enemy];
  s.phase = "attack";
  s = play(s, "06138");
  assert.ok(attackersFor(s, enemy).some((u) => u.id === e.id));
  assert.ok(attackersFor(s, enemy).some((u) => u.id === l.id));
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [e.id, l.id] });
  assert.equal(get(s, enemy.id)!.damage, 1);
});
test("Horn of the Mark uses last-known granted traits before the departing character's attachments are discarded", () => {
  let s = game(),
    host = s.heroes[0],
    ally = make(s, "01018");
  attach(s, host, "22035");
  attach(s, host, "10093");
  attach(s, ally, "10093");
  s.allies = [ally];
  discardCharacter(s, ally);
  flush(s);
  if (s.choice?.title.includes("Éomer")) s = choose(s, "skip");
  assert.match(s.choice!.title, /Horn/);
  s = choose(s, "use");
  assert.equal(s.hand.length, 1);
  assert.ok(s.discard.includes("10093"));
});
test("Oath of Eorl's real two-player combat sequence attacks early, saves, defends, and skips a second normal attack turn", () => {
  let s = table();
  const early = make(s, "01090"),
    later = make(s, "01081"),
    eomer = s.heroes[0],
    hirgon = s.heroes[1];
  s.engaged = [early];
  s.hand = [make(s, "17085")];
  selectSeat(s, 1);
  s.engaged = [later];
  syncSeat(s);
  selectSeat(s, 0);
  s.phase = "encounter";
  s.encounterDeck = Array(3).fill("01077");
  s = act(s, { type: "NEXT" });
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Oath of Eorl/);
  s = choose(s, "use");
  assert.equal(s.phase, "attack");
  assert.deepEqual(s.earlyAttackPlayers, [0]);
  assert.ok(validateSave(s));
  s = act(s, { type: "ATTACK", enemyId: early.id, attackerIds: [eomer.id] });
  assert.equal(get(s, early.id)!.damage, 0);
  assert.ok(get(s, early.id)!.attackedBy?.includes(0));
  s = act(s, { type: "END_ATTACKS" });
  assert.equal(s.phase, "defense");
  s = act(s, { type: "DEFEND", enemyId: early.id, defenderIds: [hirgon.id] });
  assert.equal(get(s, hirgon.id)!.damage, 2);
  assert.equal(s.table!.turn, 1);
  s = act(s, {
    type: "DEFEND",
    enemyId: later.id,
    defenderIds: [seatView(s, 1).heroes[0].id],
  });
  assert.equal(s.phase, "attack");
  assert.equal(s.table!.turn, 1);
  assert.ok(get(s, early.id)!.attackedBy?.includes(0));
  assert.ok(validateSave(s));
  s = act(s, { type: "END_ATTACKS" });
  assert.equal(s.phase, "refresh");
});
test("Oath of Eorl requires distinct unique Rohan and Gondor characters and does not open during ordinary actions", () => {
  let s = game();
  assert.match(canPlay(s, make(s, "17085"))!, /automatically/);
  s.heroes = [s.heroes[2]];
  s.hand = [make(s, "17085")];
  s.phase = "encounter";
  s = act(s, { type: "NEXT" });
  assert.equal(s.choice, null);
  assert.notEqual(s.earlyAttackPlayers?.length, 1);
});
test("Two Oath players receive one early attack turn each, then both normal attack turns are skipped", () => {
  let s = table();
  s.hand = [make(s, "17085")];
  selectSeat(s, 1);
  s.hand = [make(s, "17085")];
  attach(s, s.heroes[0], "01026", 1);
  attach(s, s.heroes[2], "02104", 1);
  syncSeat(s);
  selectSeat(s, 0);
  s.phase = "encounter";
  s = act(s, { type: "NEXT" });
  s = act(s, { type: "NEXT" });
  s = choose(s, "use");
  s = choose(s, "use");
  assert.deepEqual(s.earlyAttackPlayers, [0, 1]);
  s = act(s, { type: "END_ATTACKS" });
  assert.deepEqual(s.earlyAttackPlayers, [1]);
  assert.equal(s.table!.active, 1);
  assert.ok(validateSave(s));
  s = act(s, { type: "END_ATTACKS" });
  assert.equal(s.phase, "refresh");
  assert.equal(s.earlyAttackPlayers, undefined);
});

test("Firefoot accepts a Rohan hero or a Tactics hero, including a gained Tactics resource icon", () => {
  const s = table();
  const aragorn = seatView(s, 1).heroes[0];
  assert.ok(!playTargets(s, make(s, "08004")).some((u) => u.id === aragorn.id));
  attach(s, aragorn, "02104", 1);
  assert.ok(playTargets(s, make(s, "08004")).some((u) => u.id === aragorn.id));
  const gimli = make(s, "01004");
  selectSeat(s, 1);
  s.heroes.push(gimli);
  syncSeat(s);
  selectSeat(s, 0);
  assert.ok(playTargets(s, make(s, "08004")).some((u) => u.id === gimli.id));
});

test("Firefoot excess is combat damage and cannot bypass a resolved Lightless Passage shadow", () => {
  let s = game();
  const hero = s.heroes[0],
    first = make(s, "01081"),
    secondary = make(s, "01082");
  attach(s, hero, "08004");
  first.damage = 1;
  secondary.shadows = [KHAZAD.passage];
  secondary.revealedShadowCount = 1;
  secondary.shadowCancelsCombatDamage = true;
  s.engaged = [first, secondary];
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: first.id, attackerIds: [hero.id] });
  s = choose(s, "use");
  s = choose(s, secondary.id);
  assert.equal(get(s, secondary.id)!.damage, 0);
  assert.ok(
    get(s, hero.id)!.attachments.find((a) => a.code === "08004")!.exhausted,
  );
});
test("an enemy destroyed by Firefoot excess offers the attacking hero's kill responses", () => {
  let s = game();
  const hero = make(s, "01005");
  s.heroes[0] = hero;
  attach(s, hero, "08004");
  const count = attach(s, hero, "04005");
  hero.attachments.find((a) => a.id === count)!.resourceTokens = 0;
  const first = make(s, "01081"),
    secondary = make(s, "01089");
  first.damage = 1;
  secondary.damage = 2;
  s.engaged = [first, secondary];
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: first.id, attackerIds: [hero.id] });
  s = choose(s, "use");
  s = choose(s, secondary.id);
  assert.ok(!get(s, secondary.id));
  assert.equal(
    get(s, hero.id)!.attachments.find((a) => a.id === count)!.resourceTokens,
    2,
  );
  s = choose(s, `01005:${hero.id}`);
  s = choose(s, `01005:${hero.id}`);
  assert.equal(s.progress, 4);
  assert.equal(s.choice, null);
});

test("Counter-Spell cancels Wait no Longer without its enemy search or reveal reduction", () => {
  let s = game();
  const balrog = make(s, S.bane);
  balrog.attachments.push({
    id: "counter-wait",
    code: S.counter,
    exhausted: false,
  });
  s.staging = [balrog];
  s.hand = [make(s, "17005")];
  s.encounterDeck = [S.fires, "01081", "01077", "01077", "01077"];
  const funds = s.heroes.reduce((n, h) => n + h.resources, 0),
    cost = playCost(s, card("17005"));
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Wait no Longer/);
  s = choose(s, "use");
  assert.equal(s.choice, null);
  assert.equal(s.engaged.length, 0);
  assert.ok(!s.used.includes("phase:wait-no-longer"));
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    funds - cost,
  );
  assert.ok(s.discard.includes("17005"));
  assert.equal(s.encounterDeck[0], "01081");
  s = act(s, { type: "COMMIT" });
  assert.ok(s.staging.some((u) => u.code === "01081"));
});
test("Counter-Spell cancels Oath of Eorl without starting an early attack turn", () => {
  let s = game();
  const balrog = make(s, S.bane);
  balrog.attachments.push({
    id: "counter-oath",
    code: S.counter,
    exhausted: false,
  });
  s.staging = [balrog];
  s.hand = [make(s, "17085")];
  s.phase = "encounter";
  s.encounterDeck = [S.fires, "01077", "01077"];
  const funds = s.heroes.reduce((n, h) => n + h.resources, 0),
    cost = playCost(s, card("17085"));
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Oath of Eorl/);
  s = choose(s, "use");
  assert.ok(!s.used.includes("phase:oath-of-eorl"));
  assert.ok(!s.earlyAttackPlayers?.length);
  assert.equal(s.phase, "defense");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    funds - cost,
  );
  assert.ok(s.discard.includes("17085"));
  assert.ok(s.encounterDiscard.includes(S.fires));
});
test("Westfold Outrider offers only movable enemies that may engage this player", () => {
  let s = game();
  const outrider = make(s, "07006"),
    blocked = make(s, "01089"),
    bane = make(s, S.bane);
  s.allies.push(outrider);
  s.staging = [blocked, bane];
  s.used.push(`round:pippin:${blocked.id}:0`);
  assert.ok(availableAbilities(s, outrider)[0].disabled);
  const allowed = make(s, "01081");
  s.staging.push(allowed);
  s = act(s, { type: "ABILITY", id: outrider.id });
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [allowed.id],
  );
  s = choose(s, allowed.id);
  assert.deepEqual(
    s.engaged.map((u) => u.id),
    [allowed.id],
  );
  assert.ok(s.staging.some((u) => u.id === blocked.id));
  assert.ok(s.staging.some((u) => u.id === bane.id));
  assert.ok(s.discard.includes("07006"));
});
