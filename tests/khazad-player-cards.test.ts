import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { KHAZAD_PLAYER_CARDS } from "../src/game/khazad-player-support.ts";
import {
  availableAbilities,
  createGame,
  playTargets,
} from "../src/game/engine.ts";
import { discardCharacter, enterAlly, phaseEnd } from "../src/game/board.ts";
import { playerAttack } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import { fx, stats } from "../src/game/core.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import { khazadPlayerPlayProblem } from "../src/game/khazad-player-cards.ts";
import { EMYN } from "../src/game/emyn-muil.ts";
import { CARROCK } from "../src/game/carrock.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 950_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `khazad-player-${nextId++}`,
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
  const s = act(createGame(601, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(602, d.cards, d.heroes, d.id, {
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

test("Khazad-dûm registers all thirteen player designs while preserving prior rules", () => {
  assert.equal(KHAZAD_PLAYER_CARDS.length, 13);
  for (const c of KHAZAD_PLAYER_CARDS) assert.ok(SCRIPTED.has(c.code), c.code);
});
test("Dwalin may lower only his controller's threat after an Orc dies to his attack", () => {
  let s = table();
  const dwalin = s.heroes[0];
  dwalin.code = "03001";
  dwalin.tempAttack = 1;
  const enemy = unit("01089");
  s.engaged.push(enemy);
  const threats = [s.threat, seatView(s, 1).threat];
  syncSeat(s);
  playerAttack(s, enemy, [dwalin.id]);
  flush(s);
  s = choose(s, "reduce");
  assert.equal(seatView(s, 0).threat, threats[0] - 2);
  assert.equal(seatView(s, 1).threat, threats[1]);
});
test("Dwalin does not respond to a non-Orc kill or mere card-effect destruction", () => {
  for (const code of ["01082", "01089"]) {
    const s = game("spirit"),
      dwalin = s.heroes[0];
    dwalin.code = "03001";
    dwalin.tempAttack = 20;
    const enemy = unit(code);
    s.engaged.push(enemy);
    if (code === "01082") playerAttack(s, enemy, [dwalin.id]);
    else discardCharacter(s, enemy);
    flush(s);
    assert.notEqual(s.choice?.title, "Dwalin · Orc destroyed by attack");
  }
});
test("Dwarrowdelf Axe grants attack, has Restricted Dwarf targets and deals optional post-attack damage", () => {
  let s = game("tactics"),
    dwarf = unit("03006"),
    other = s.heroes[1],
    enemy = unit("01091");
  s.allies.push(dwarf);
  s.engaged.push(enemy);
  assert.ok(playTargets(s, unit("03007")).some((u) => u.id === dwarf.id));
  assert.ok(!playTargets(s, unit("03007")).some((u) => u.id === other.id));
  const before = stats(s, dwarf).attack;
  s = play(s, "03007", dwarf.id);
  assert.equal(stats(s, s.allies[0]).attack, before + 1);
  playerAttack(s, s.engaged[0], [dwarf.id]);
  flush(s);
  const old = s.engaged[0].damage;
  s = choose(s, "damage");
  assert.equal(s.engaged[0].damage, old + 1);
});
test("Axe can finish an Orc without counting as Dwalin's attack kill", () => {
  let s = game("spirit"),
    dwalin = s.heroes[0];
  dwalin.code = "03001";
  const threat = s.threat;
  dwalin.attachments.push({
    id: "axe",
    code: "03007",
    exhausted: false,
    owner: 0,
  });
  const enemy = unit("01091");
  enemy.damage = 2;
  s.engaged.push(enemy);
  playerAttack(s, enemy, [dwalin.id]);
  flush(s);
  assert.equal(s.choice?.title, "Dwarrowdelf Axe · After attack");
  s = choose(s, "damage");
  assert.ok(!s.engaged.length);
  assert.equal(s.threat, threat);
  assert.notEqual(s.choice?.title, "Dwalin · Orc destroyed by attack");
});
test("Axe responds after a zero-damage attack but its printed effect disappears while blanked", () => {
  for (const blank of [false, true]) {
    const s = game("spirit"),
      dwarf = s.heroes[0];
    dwarf.code = "03001";
    dwarf.attachments.push({
      id: "axe",
      code: "03007",
      exhausted: false,
      owner: 0,
    });
    const enemy = unit("01082");
    s.engaged.push(enemy);
    if (blank) s.activeLocation = unit(EMYN.amonLhaw);
    playerAttack(s, enemy, [dwarf.id]);
    flush(s);
    if (blank)
      assert.notEqual(s.choice?.title, "Dwarrowdelf Axe · After attack");
    else assert.equal(s.choice?.title, "Dwarrowdelf Axe · After attack");
  }
});
test("Veteran enters with one damage through play and put-into-play without damage-assignment reactions", () => {
  let s = game("tactics");
  s = play(s, "03006");
  assert.equal(s.allies.find((u) => u.code === "03006")!.damage, 1);
  const veteran = unit("03006");
  enterAlly(s, veteran, false, false);
  flush(s);
  assert.equal(veteran.damage, 1);
  assert.ok(!s.log.some((l) => /Veteran.*takes 1 damage/.test(l.text)));
});
test("Khazâd! Khazâd! boosts a Dwarf across players until phase end", () => {
  let s = table();
  selectSeat(s, 1);
  const dwarf = unit("03011", 2);
  seatView(s, 2).allies.push(dwarf);
  s = play(s, "03008", dwarf.id);
  assert.equal(
    stats(s, seatView(s, 2).allies[0]).attack,
    card("03011").attack! + 3,
  );
  phaseEnd(s);
  flush(s);
  assert.equal(
    stats(s, seatView(s, 2).allies[0]).attack,
    card("03011").attack!,
  );
});
test("Zigil names before looking, discards two and grants one resource per matching cost", () => {
  let s = game("spirit"),
    miner = unit("03009");
  s.allies.push(miner);
  s.deck = ["01020", "02003", "01013"];
  const before = s.heroes[0].resources;
  s = act(s, { type: "ABILITY", id: miner.id });
  assert.ok(s.choice!.options.every((o) => !o.code));
  assert.deepEqual(s.deck, ["01020", "02003", "01013"]);
  s = choose(s, "cost-1");
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].resources, before + 2);
  assert.deepEqual(s.deck, ["01013"]);
  assert.deepEqual(s.discard, ["01020", "02003"]);
  assert.equal(s.allies[0].exhausted, true);
});
test("Zigil's X matches zero, short decks work and no match yields no resources", () => {
  for (const [code, number, amount] of [
    ["01051", 0, 1],
    ["01020", 6, 0],
  ] as const) {
    let s = game("spirit"),
      miner = unit("03009");
    s.allies.push(miner);
    s.deck = [code];
    const before = s.heroes[0].resources;
    s = act(s, { type: "ABILITY", id: miner.id });
    s = choose(s, `cost-${number}`);
    if (amount) s = choose(s, s.heroes[0].id);
    assert.equal(s.heroes[0].resources, before + amount);
    assert.equal(s.deck.length, 0);
  }
});
test("Zigil chooses only an unsacked controlled hero and resource gain triggers Heir", () => {
  let s = game("spirit"),
    miner = unit("03009");
  s.allies.push(miner);
  s.deck = ["01020", "02003"];
  const recipient = s.heroes[0],
    sacked = s.heroes[1];
  recipient.code = "03001";
  recipient.exhausted = true;
  recipient.attachments.push({
    id: "heir",
    code: "08113",
    exhausted: false,
    owner: 0,
  });
  sacked.attachments.push({
    id: "sack",
    code: CARROCK.sacked,
    exhausted: false,
    owner: 0,
  });
  s = act(s, { type: "ABILITY", id: miner.id });
  s = choose(s, "cost-1");
  assert.ok(!s.choice!.options.some((o) => o.id === sacked.id));
  s = choose(s, recipient.id);
  assert.equal(s.choice?.title, "Heir of Mardil");
  s = choose(s, "heir");
  assert.equal(s.heroes[0].exhausted, false);
});
test("Zigil's real deck discard offers Hidden Cache after finishing its resource effect", () => {
  let s = game("spirit"),
    miner = unit("03009");
  s.allies.push(miner);
  s.deck = ["06143", "01020"];
  s = act(s, { type: "ABILITY", id: miner.id });
  s = choose(s, "cost-1");
  s = choose(s, s.heroes[0].id);
  assert.equal(s.choice?.title, "Hidden Cache · Discarded from deck");
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].resources, 13);
});
test("An empty deck or exhausted Miner disables its action", () => {
  const s = game("spirit"),
    miner = unit("03009");
  s.allies.push(miner);
  miner.exhausted = true;
  assert.ok(availableAbilities(s, miner)[0].disabled);
  miner.exhausted = false;
  s.deck = [];
  assert.ok(availableAbilities(s, miner)[0].disabled);
});
test("Untroubled checks current active Dark or Underground and affects the existing Dwarf set for the phase", () => {
  for (const dark of [false, true]) {
    let s = game("spirit"),
      dwarf = unit("03011");
    s.allies.push(dwarf);
    if (dark) s.extraActiveLocations = [unit("01078")];
    const source = card("01078"),
      originalTraits = source.traits;
    if (dark) source.traits = "Underground. Dark.";
    try {
      s = play(s, "03010");
    } finally {
      source.traits = originalTraits;
    }
    const expected = dark ? 2 : 1;
    assert.equal(
      stats(s, s.allies[0]).will,
      card("03011").willpower! + expected,
    );
    const late = unit("03006");
    s.allies.push(late);
    assert.equal(stats(s, late).will, card("03006").willpower!);
    phaseEnd(s);
    flush(s);
    assert.equal(stats(s, late).will, card("03006").willpower!);
  }
});
test("Ancestral Knowledge exhausts a controlled Dwarf and applies Mountain bonus to a chosen active", () => {
  let s = game("lore"),
    dwarf = unit("03011"),
    old = unit("01088"),
    mountain = unit("01078");
  s.allies.push(dwarf);
  s.activeLocation = old;
  s.extraActiveLocations = [mountain];
  s = play(s, "03012", dwarf.id);
  assert.equal(s.allies[0].exhausted, true);
  s = choose(s, mountain.id);
  assert.equal(s.activeLocation?.id, old.id);
  assert.ok(!s.extraActiveLocations?.length);
  assert.ok(s.encounterDiscard.includes(mountain.code));
});
test("Ancestral cannot use an exhausted or another player's Dwarf, nor a staging location", () => {
  const s = table(),
    dwarf = unit("03011", 2);
  seatView(s, 2).allies.push(dwarf);
  s.staging.push(unit("01088"));
  assert.ok(khazadPlayerPlayProblem(s, "03012"));
  s.activeLocation = s.staging.pop()!;
  assert.ok(!playTargets(s, unit("03012")).some((u) => u.id === dwarf.id));
});
test("Ever Onward is offered before quest-failure threat, protecting any chosen player", () => {
  let s = table();
  s.phase = "staging";
  s.hand.push(unit("03005"));
  s.threat = 49;
  syncSeat(s);
  const otherBefore = seatView(s, 1).threat;
  s.queue.push(fx("failedQuest", { value: 2 }));
  flush(s);
  assert.equal(s.choice?.title, "Ever Onward · Unsuccessful quest");
  assert.equal(seatView(s, 0).threat, 49);
  s = choose(s, "play");
  s = choose(s, "player-0");
  assert.equal(seatView(s, 0).threat, 49);
  assert.equal(seatView(s, 1).threat, otherBefore + 2);
  assert.ok(!seatView(s, 0).eliminated);
});
test("Multiple Ever Onward copies protect different players and prevention does not trigger Elfhelm", () => {
  let s = table();
  s.phase = "staging";
  s.hand.push(unit("03005"), unit("03005"));
  s.allies.push(unit("02100"));
  syncSeat(s);
  const before = [s.threat, seatView(s, 1).threat, seatView(s, 2).threat];
  s.queue.push(fx("failedQuest", { value: 3 }));
  flush(s);
  s = choose(s, "play");
  s = choose(s, "player-0");
  s = choose(s, "play");
  assert.ok(!s.choice!.options.some((o) => o.id === "player-0"));
  s = choose(s, "player-1");
  assert.deepEqual(
    [seatView(s, 0).threat, seatView(s, 1).threat, seatView(s, 2).threat],
    [before[0], before[1], before[2] + 3],
  );
  assert.notEqual(s.choice?.title, "Elfhelm · Threat raised");
});
test("Ever Onward may be declined and cannot be played outside its response window", () => {
  let s = game();
  s.phase = "staging";
  s.hand.push(unit("03005"));
  const before = s.threat;
  assert.ok(khazadPlayerPlayProblem(s, "03005"));
  s.queue.push(fx("failedQuest", { value: 2 }));
  flush(s);
  s = choose(s, "skip");
  assert.equal(s.threat, before + 2);
});
