import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import decks from "../public/published-decks.json";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { GONDOR_PLAYER_CARDS } from "../src/game/gondor-player-support.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { EMYN } from "../src/game/emyn-muil.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playCost,
  stats,
  validateSave,
} from "../src/game/engine.ts";
import {
  destroy,
  engage,
  enterAlly,
  nextRound,
  phaseEnd,
} from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { gondorResourcesGained } from "../src/game/gondor-player-cards.ts";
import { seatView, syncSeat } from "../src/game/table.ts";
import type { GameState, Unit } from "../src/game/types.ts";

const recipe = decks.find((d) => d.id === "starter-gondor")!;
let nextId = 400_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `gondor-player-${nextId++}`,
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
function game() {
  const s = act(createGame(371, recipe.cards, recipe.heroes, "custom"), {
    type: "KEEP",
  });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 5;
  });
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing choice ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function chooseCode(s: GameState, code: string) {
  const o = s.choice?.options.find((o) => o.code === code);
  assert.ok(o, `Missing choice for ${code}`);
  return choose(s, o.id);
}
function play(s: GameState, code: string, target?: string) {
  const u = unit(code, s.table?.active ?? 0);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}
function skipAll(s: GameState) {
  let count = 0;
  while (s.choice) {
    assert.ok(count++ < 20);
    s = choose(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function table() {
  const d = STARTERS[3];
  let s = createGame(372, recipe.cards, recipe.heroes, "custom", {
    seats: [
      { heroes: recipe.heroes, cards: recipe.cards, deckId: "custom" },
      { heroes: ["01012"], deckId: d.id },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 5;
  });
  syncSeat(s);
  return s;
}

test("Defenders of Gondor's exact official 50-card recipe and three heroes are fully scripted and save correctly", () => {
  assert.equal(GONDOR_PLAYER_CARDS.length, 16);
  for (const code of [...recipe.heroes, ...Object.keys(recipe.cards)])
    assert.ok(SCRIPTED.has(code), code);
  assert.equal(
    Object.values(recipe.cards).reduce((n, copies) => n + (copies ?? 0), 0),
    50,
  );
  const s = createGame(373, recipe.cards, recipe.heroes, "custom");
  assert.equal(s.hand.length + s.deck.length, 50);
  assert.ok(validateSave(s));
});

test("Boromir's resource-dependent attack aura applies to Gondor allies throughout the table", () => {
  const s = table(),
    boromir = s.heroes[0],
    ally = unit("05007", 1);
  seatView(s, 1).allies.push(ally);
  assert.equal(stats(s, ally).attack, (card(ally.code).attack ?? 0) + 1);
  boromir.resources = 0;
  assert.equal(stats(s, ally).attack, card(ally.code).attack);
});

test("Citadel Custodian counts all Gondor allies in play and its reduced cost never falls below zero", () => {
  const s = table();
  s.allies.push(unit("05007"), unit("05003"));
  seatView(s, 1).allies.push(unit("05007", 1));
  assert.equal(playCost(s, card("05004")), 2);
  s.allies.push(unit("05007"), unit("05003"), unit("22028"));
  assert.equal(playCost(s, card("05004")), 0);
});

test("Soldier of Gondor searches only the original top five and takes one ally below Valour", () => {
  let s = game();
  s.threat = 39;
  s.deck = ["05003", "01016", "05007", "05002", "01073", "05004"];
  s = play(s, "22002");
  s = choose(s, "search");
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code).map((o) => o.code),
    ["05003", "05007"],
  );
  s = chooseCode(s, "05003");
  assert.equal(s.choice, null);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["05003"],
  );
  assert.ok(s.deck.includes("05004"));
});

test("Valour Soldier searches any number of Gondor allies and triggers when put into play", () => {
  let s = game();
  s.threat = 40;
  s.deck = ["05003", "01016", "05007", "05002", "01073", "05004"];
  enterAlly(s, unit("22002"), true, false);
  flush(s);
  s = choose(s, "search");
  s = chooseCode(s, "05003");
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code).map((o) => o.code),
    ["05007"],
  );
  s = chooseCode(s, "05007");
  assert.equal(s.choice, null);
  assert.equal(s.hand.length, 2);
  assert.ok(s.deck.includes("05004"));
});

test("Pillars of the Kings uses its exact threat discount and draws four, one, or zero cards", () => {
  for (const [threat, drawn, paid] of [
    [29, 4, 0],
    [30, 4, 0],
    [31, 1, 0],
    [39, 1, 0],
    [41, 0, 4],
  ]) {
    let s = game();
    s.threat = threat;
    s.deck = Array(6).fill("05007");
    const resources = s.heroes.reduce((n, h) => n + h.resources, 0);
    s = play(s, "22003");
    assert.equal(s.threat, 40);
    assert.equal(s.hand.length, drawn);
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      resources - paid,
    );
  }
  const s = game();
  s.threat = 40;
  assert.match(canPlay(s, unit("22003")) ?? "", /not change/);
});

test("Angbor's Valour attack and questing exception follow his controller's threat", () => {
  for (const threat of [39, 40]) {
    let s = game();
    s.threat = threat;
    s.phase = "quest";
    const angbor = unit("22028");
    s.allies.push(angbor);
    assert.equal(
      stats(s, angbor).attack,
      (card(angbor.code).attack ?? 0) + 1 + (threat >= 40 ? 2 : 0),
    ); // Boromir adds one.
    s = act(s, { type: "TOGGLE_QUEST", id: angbor.id });
    s.encounterDeck = [];
    s = act(s, { type: "COMMIT" });
    assert.equal(s.allies[0].exhausted, threat < 40);
    assert.equal(s.allies[0].committed, true);
  }
});

test("Need Drives Them readies only characters controlled by players at Valour", () => {
  let s = table();
  s.threat = 39;
  s.table!.seats[1].threat = 40;
  s.heroes.forEach((h) => {
    h.exhausted = true;
  });
  seatView(s, 1).heroes[0].exhausted = true;
  s = play(s, "22029");
  assert.ok(seatView(s, 0).heroes.every((h) => h.exhausted));
  assert.equal(seatView(s, 1).heroes[0].exhausted, false);
});

test("Envoy of Pelargir adds a resource to a Gondor or Noble hero even when put into play", () => {
  let s = game();
  const target = s.heroes[1],
    before = target.resources;
  enterAlly(s, unit("05018"), true, false);
  flush(s);
  assert.equal(s.choice?.title, "Envoy of Pelargir");
  s = choose(s, target.id);
  assert.equal(s.heroes[1].resources, before + 1);
});

test("Ship Captain moves one resource from a hero you control to another pool without creating resources", () => {
  let s = table();
  const donor = s.heroes[0],
    recipient = seatView(s, 1).heroes[0];
  const otherResources = recipient.resources;
  s = play(s, "06135");
  const remaining = s.heroes[0].resources;
  s = choose(s, "move");
  s = choose(s, donor.id);
  assert.ok(!s.choice!.options.some((o) => o.id === donor.id));
  s = choose(s, recipient.id);
  assert.equal(seatView(s, 0).heroes[0].resources, remaining - 1);
  assert.equal(seatView(s, 1).heroes[0].resources, otherResources + 1);
});

test("Errand-rider exhausts once to transfer a resource, including from an exhausted donor", () => {
  let s = game();
  const rider = unit("05003"),
    donor = s.heroes[0],
    recipient = s.heroes[1];
  s.allies.push(rider);
  donor.exhausted = true;
  donor.resources = 1;
  const before = recipient.resources;
  s = act(s, { type: "ABILITY", id: rider.id });
  s = choose(s, donor.id);
  s = choose(s, recipient.id);
  assert.equal(s.allies[0].exhausted, true);
  assert.equal(s.heroes[0].resources, 0);
  assert.equal(s.heroes[1].resources, before + 1);
  assert.equal(availableAbilities(s, s.allies[0])[0].disabled, true);
});

test("Squire of the Citadel offers a resource when leaving play; Prince Imrahil readies once per round", () => {
  let s = game();
  const prince = s.heroes[1],
    boromir = s.heroes[0];
  prince.exhausted = true;
  const squire = unit("06108");
  s.allies.push(squire);
  destroy(s, squire);
  flush(s);
  s = choose(s, boromir.id);
  s = choose(s, "ready-imrahil");
  assert.equal(s.heroes[0].resources, 6);
  assert.equal(s.heroes[1].exhausted, false);
  phaseEnd(s);
  flush(s);
  s.heroes[1].exhausted = true;
  const ally = unit("05003");
  s.allies.push(ally);
  destroy(s, ally);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.heroes[1].exhausted, true);
  nextRound(s);
  s.heroes[1].exhausted = true;
  const next = unit("05003");
  s.allies.push(next);
  destroy(s, next);
  flush(s);
  assert.equal(s.choice?.title, "Prince Imrahil");
});

test("Heir of Mardil responds to Steward and moved resources but excludes framework collection", () => {
  let s = game();
  const hero = s.heroes[1];
  hero.exhausted = true;
  hero.attachments = [
    { id: "heir", code: "08113", exhausted: false },
    { id: "steward", code: "01026", exhausted: false },
  ];
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "steward" });
  assert.equal(s.choice?.title, "Heir of Mardil");
  s = choose(s, "heir");
  assert.equal(s.heroes[1].exhausted, false);
  assert.equal(s.heroes[1].resources, 7);
  s.heroes[1].exhausted = true;
  s.heroes[1].attachments[0].exhausted = false;
  nextRound(s);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.heroes[1].exhausted, true);
  const rider = unit("05003");
  s.allies.push(rider);
  s = act(s, { type: "ABILITY", id: rider.id });
  s = choose(s, s.heroes[0].id);
  s = choose(s, s.heroes[1].id);
  assert.equal(s.choice?.title, "Heir of Mardil");
  s = choose(s, "heir");
  assert.equal(s.heroes[1].exhausted, false);
});

test("Blank Heir of Mardil text cannot respond to a resource gain", () => {
  const s = game(),
    hero = s.heroes[1];
  hero.exhausted = true;
  hero.attachments.push({
    id: "blank-heir",
    code: "08113",
    exhausted: false,
    blanked: true,
  });
  hero.resources++;
  gondorResourcesGained(s, hero, 1, true);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(hero.exhausted, true);
});

test("Mablung responds to any engagement once per phase; Captain responds only to optional engagement and lasts the round", () => {
  let s = game();
  s.phase = "encounter";
  const mablung = s.heroes[2],
    enemy = unit("01089");
  mablung.attachments.push({ id: "captain", code: "08140", exhausted: false });
  s.staging = [enemy];
  s = act(s, { type: "ENGAGE", id: enemy.id });
  s = choose(s, "mablung-resource");
  s = choose(s, "captain");
  assert.equal(s.heroes[2].resources, 6);
  assert.equal(stats(s, s.heroes[2]).attack, (card("08084").attack ?? 0) + 1);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, s.heroes[2]).defense, (card("08084").defense ?? 0) + 1);
  nextRound(s);
  assert.equal(stats(s, s.heroes[2]).attack, card("08084").attack);
  s.phase = "encounter";
  s.heroes[2].attachments[0].exhausted = false;
  engage(s, unit("01096"));
  flush(s);
  s = choose(s, "mablung-resource");
  assert.equal(s.choice, null);
  assert.equal(s.heroes[2].attachments[0].exhausted, false);
  engage(s, unit("01089"));
  flush(s);
  assert.equal(s.choice, null);
});

test("Foe-hammer requires a hero attack kill and exhausts the chosen Weapon to draw three", () => {
  let s = game();
  s.phase = "attack";
  const hero = s.heroes[2],
    enemy = unit("01089");
  hero.attachments.push({ id: "axe", code: "01041", exhausted: false });
  s.engaged = [enemy];
  s.hand = [unit("131015")];
  s.deck = ["05003", "05007", "05018", "01073"];
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [hero.id] });
  assert.match(s.choice?.title ?? "", /Foe-hammer/);
  s = choose(s, "foe-hammer-axe");
  assert.equal(s.heroes[2].attachments[0].exhausted, true);
  assert.equal(s.hand.length, 3);
  assert.ok(s.discard.includes("131015"));
  assert.ok(s.encounterDiscard.includes(enemy.code));
});

test("Foe-hammer can resolve multiple copies using different ready Weapons, and never triggers on an ally kill", () => {
  let s = game();
  s.phase = "attack";
  const hero = s.heroes[2],
    enemy = unit("01089");
  hero.attachments = ["axe-one", "axe-two"].map((id) => ({
    id,
    code: "01041",
    exhausted: false,
  }));
  s.engaged = [enemy];
  s.hand = [unit("131015"), unit("131015")];
  s.deck = Array(7).fill("05003");
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [hero.id] });
  s = choose(s, "foe-hammer-axe-one");
  s = choose(s, "foe-hammer-axe-two");
  assert.equal(s.hand.length, 6);
  assert.ok(s.heroes[2].attachments.every((a) => a.exhausted));
  let allyKill = game();
  allyKill.phase = "attack";
  const ally = unit("05007"),
    wolf = unit("01081");
  allyKill.allies = [ally];
  allyKill.engaged = [wolf];
  allyKill.hand = [unit("131015")];
  allyKill.heroes[2].attachments.push({
    id: "unused-axe",
    code: "01041",
    exhausted: false,
  });
  allyKill = skipAll(
    act(allyKill, { type: "ATTACK", enemyId: wolf.id, attackerIds: [ally.id] }),
  );
  assert.equal(allyKill.hand[0].code, "131015");
  assert.equal(allyKill.choice, null);
});

test("Behind Strong Walls is offered during a defended attack and readies its Gondor defender with a phase defense bonus", () => {
  let s = game();
  s.phase = "defense";
  const defender = s.heroes[2],
    enemy = unit("01089");
  s.engaged = [enemy];
  s.hand = [unit("05008")];
  assert.match(canPlay(s, s.hand[0]) ?? "", /defending|window|automatically/i);
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: defender.id });
  assert.match(s.choice?.title ?? "", /Behind Strong Walls/);
  s = choose(s, `walls-0-${defender.id}`);
  assert.equal(s.heroes[2].exhausted, false);
  assert.equal(
    stats(s, s.heroes[2]).defense,
    (card(defender.code).defense ?? 0) + 1,
  );
  assert.equal(s.heroes[2].damage, 0);
  assert.ok(s.discard.includes("05008"));
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, s.heroes[2]).defense, card(defender.code).defense);
});

test("Sacked blocks Steward and resource receipts while permitting spending and resource donation", () => {
  let s = game();
  const donor = s.heroes[0],
    forbidden = s.heroes[1],
    recipient = s.heroes[2];
  donor.attachments = [
    { id: "sack-boromir", code: CARROCK.sacked, exhausted: false },
    { id: "steward", code: "01026", exhausted: false },
  ];
  forbidden.attachments.push({
    id: "sack-prince",
    code: CARROCK.sacked,
    exhausted: false,
  });
  assert.throws(
    () => act(s, { type: "ABILITY", id: donor.id, attachmentId: "steward" }),
    /cannot collect resources/,
  );
  const rider = unit("05003");
  s.allies.push(rider);
  s = act(s, { type: "ABILITY", id: rider.id });
  s = choose(s, donor.id);
  assert.ok(!s.choice!.options.some((o) => o.id === forbidden.id));
  s = choose(s, recipient.id);
  assert.equal(s.heroes[0].resources, 4);
  assert.equal(s.heroes[2].resources, 6);
  enterAlly(s, unit("05018"));
  flush(s);
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code).map((o) => o.code),
    ["08084"],
  );
  s = choose(s, recipient.id);
  assert.equal(s.heroes[2].resources, 7);
  s = play(s, "22003"); // Resource collection restrictions do not prevent playing events.
  assert.equal(s.threat, 40);
});

test("Amon Lhaw blanks a Weapon's trait and prevents Foe-hammer from using that attachment", () => {
  let s = game();
  s.phase = "attack";
  const hero = s.heroes[2],
    enemy = unit("01081");
  hero.attachments.push({ id: "axe", code: "01041", exhausted: false });
  s.activeLocation = unit(EMYN.amonLhaw);
  s.engaged = [enemy];
  s.hand = [unit("131015")];
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [hero.id] });
  assert.equal(s.choice, null);
  assert.equal(s.hand[0].code, "131015");
  assert.equal(s.heroes[2].attachments[0].exhausted, false);
});
