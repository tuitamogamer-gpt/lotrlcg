import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { STEWARD_PLAYER_CARDS } from "../src/game/steward-player-support.ts";
import { canPlay, createGame, playTargets } from "../src/game/engine.ts";
import { damage, discardCharacter, phaseEnd } from "../src/game/board.ts";
import { canPay, eligiblePayers, playCost, stats } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { hasResourceIcon } from "../src/game/expansion-passives.ts";
import { stewardPlayerCanPay } from "../src/game/steward-player-cards.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import { validateSave } from "../src/game/save.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 1_130_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `steward-player-${nextId++}`,
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
  const s = act(createGame(701, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(702, d.cards, d.heroes, d.id, {
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
    s.heroes.forEach((h) => (h.resources = 10));
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

test("The Steward's Fear registers all ten exact player designs", () => {
  assert.equal(STEWARD_PLAYER_CARDS.length, 10);
  for (const c of STEWARD_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(card(c.code).text, c.text);
  }
});
test("Each Outlands aura includes its own source and stacks across existing controlled copies", () => {
  const s = game(),
    warrior = unit("06002"),
    knight = unit("06004"),
    swordsman = unit("06006"),
    herdsman = unit("06008");
  s.heroes[0].code = "06001";
  s.allies.push(warrior, knight, swordsman, herdsman, unit("06002"));
  assert.equal(stats(s, warrior).defense, card(warrior.code).defense! + 2);
  assert.equal(stats(s, knight).attack, card(knight.code).attack! + 1);
  assert.equal(stats(s, swordsman).will, card(swordsman.code).willpower! + 1);
  assert.equal(stats(s, herdsman).health, card(herdsman.code).health! + 1);
  const hero = stats(s, s.heroes[0]);
  assert.equal(hero.defense, card("06001").defense! + 2);
  assert.equal(hero.attack, card("06001").attack! + 1);
  assert.equal(hero.will, card("06001").willpower! + 1);
  assert.equal(hero.health, card("06001").health! + 1);
});
test("Outlands stat bonuses are continuous and apply to a later Outlands entrant", () => {
  const s = game(),
    source = unit("06002");
  s.allies.push(source);
  const future = unit("05014");
  s.allies.push(future);
  assert.equal(stats(s, future).defense, card(future.code).defense! + 1);
  discardCharacter(s, source);
  assert.equal(stats(s, future).defense, card(future.code).defense);
});
test("Outlands auras affect only their controller's characters after control transfers", () => {
  const s = table(),
    source = unit("06002", 0),
    own = unit("05014", 0),
    other = unit("05014", 1);
  s.allies.push(source, own);
  seatView(s, 1).allies.push(other);
  assert.equal(stats(s, own).defense, 2);
  assert.equal(stats(s, other).defense, 1);
  s.allies = s.allies.filter((u) => u.id !== source.id);
  syncSeat(s);
  seatView(s, 1).allies.push(source);
  assert.equal(stats(s, own).defense, 1);
  assert.equal(stats(s, other).defense, 2);
});
test("Anfalas Herdsman's departure removes hit points and destroys characters with lethal remaining damage", () => {
  const s = game(),
    herdsman = unit("06008"),
    hunter = unit("05014");
  s.allies.push(herdsman, hunter);
  hunter.damage = 1;
  assert.equal(stats(s, hunter).health, 2);
  discardCharacter(s, herdsman);
  assert.ok(!s.allies.some((u) => u.id === hunter.id));
  assert.ok(s.discard.includes(hunter.code));
});
test("An Outlands-granting attachment makes a Gondor ally receive the four exact auras", () => {
  const s = game(),
    ally = unit("05018");
  ally.attachments.push({ id: "outlands", code: "06082", exhausted: false });
  s.allies.push(
    ally,
    unit("06002"),
    unit("06004"),
    unit("06006"),
    unit("06008"),
  );
  const values = stats(s, ally);
  assert.equal(values.attack, card(ally.code).attack! + 1);
  assert.equal(values.defense, card(ally.code).defense! + 1);
  assert.equal(values.will, card(ally.code).willpower! + 1);
  assert.equal(values.health, card(ally.code).health! + 1);
});
test("Hirluin pays for off-sphere Outlands allies without gaining their resource icons", () => {
  let s = game(),
    hero = s.heroes[0];
  hero.code = "06001";
  s.heroes.slice(1).forEach((h) => (h.resources = 0));
  const before = hero.resources;
  assert.equal(hasResourceIcon(hero, "spirit"), false);
  assert.ok(eligiblePayers(s, card("06006")).some((h) => h.id === hero.id));
  s = play(s, "06006");
  assert.equal(s.heroes[0].resources, before - 2);
  assert.ok(s.allies.some((u) => u.code === "06006"));
  assert.equal(canPay(s, card("02056")), false);
});
test("Hirluin's constant payment permission survives Sacked and is removed by text blanking", () => {
  const s = game(),
    hero = s.heroes[0];
  hero.code = "06001";
  hero.attachments.push({
    id: "sacked",
    code: CARROCK.sacked,
    exhausted: false,
  });
  assert.equal(canPay(s, card("06006")), true);
  hero.attachments.push({ id: "fear", code: KHAZAD.fear, exhausted: false });
  assert.equal(canPay(s, card("06006")), false);
});
test("Hirluin's special permission is limited to Outlands allies", () => {
  const s = game(),
    hero = s.heroes[0];
  hero.code = "06001";
  assert.equal(canPay(s, card("05014")), true);
  assert.equal(canPay(s, card("01058")), false);
  assert.equal(stewardPlayerCanPay(s, hero, card("06007"), 1), false);
});
test("Gaining Strength discards two and gains three on the same controlled hero, triggering Heir once", () => {
  let s = game(),
    hero = s.heroes[0];
  hero.resources = 2;
  hero.exhausted = true;
  hero.attachments.push({ id: "heir", code: "08113", exhausted: false });
  s = play(s, "06003", hero.id);
  assert.equal(s.heroes[0].resources, 3);
  assert.equal(s.choice?.title, "Heir of Mardil");
  s = choose(s, "heir");
  assert.equal(s.heroes[0].exhausted, false);
});
test("Gaining Strength excludes another player's heroes and Sacked recipients", () => {
  const s = table(),
    own = s.heroes[0],
    foreign = seatView(s, 1).heroes[0];
  own.attachments.push({
    id: "sacked",
    code: CARROCK.sacked,
    exhausted: false,
  });
  const targets = playTargets(s, unit("06003"));
  assert.ok(!targets.some((u) => u.id === own.id));
  assert.ok(!targets.some((u) => u.id === foreign.id));
  assert.ok(targets.some((u) => u.id === s.heroes[1].id));
});
test("Mithrandir's Advice counts printed Lore heroes and adds no card for a Song icon", () => {
  let s = game("lore");
  s.heroes[0].code = "01001";
  s.heroes[0].attachments.push({ id: "song", code: "02034", exhausted: false });
  s.deck = ["01013", "01014", "01015", "01016"];
  s = play(s, "06009");
  assert.equal(s.hand.length, 2);
  assert.deepEqual(s.deck, ["01015", "01016"]);
});
test("Advice's printed icon count survives hero text blanking and Sacked", () => {
  let s = game("lore");
  s.heroes[0].attachments.push({
    id: "fear",
    code: KHAZAD.fear,
    exhausted: false,
  });
  s.heroes[1].attachments.push({
    id: "sacked",
    code: CARROCK.sacked,
    exhausted: false,
  });
  s.deck = ["01013", "01014", "01015", "01016"];
  s = play(s, "06009");
  assert.equal(s.hand.length, 3);
});
test("A Good Harvest creates payment permission for one named sphere without giving resource icons", () => {
  let s = game();
  s = play(s, "06010");
  s = choose(s, "lore");
  assert.equal(hasResourceIcon(s.heroes[0], "lore"), false);
  assert.equal(canPay(s, card("05014")), true);
  assert.equal(canPay(s, card("06006")), false);
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, "05014");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  phaseEnd(s);
  assert.equal(canPay(s, card("05014")), false);
});
test("Good Harvest does not provide the resource match for a zero-cost or fully reduced event", () => {
  let s = game();
  s = play(s, "06010");
  s = choose(s, "lore");
  assert.equal(canPay(s, card("04108")), false);
  s.threat = 20;
  assert.equal(playCost(s, card("04009")), 0);
  assert.equal(canPay(s, card("04009")), false);
  s.threat = 21;
  assert.equal(canPay(s, card("04009")), true);
});
test("The named Good Harvest sphere permits mixed payment from existing Sacked and other hero pools", () => {
  let s = game();
  s.heroes[0].attachments.push({
    id: "sacked",
    code: CARROCK.sacked,
    exhausted: false,
  });
  s = play(s, "06010");
  s = choose(s, "lore");
  const u = unit("05014");
  s.hand.push(u);
  const a = s.heroes[0],
    b = s.heroes[1],
    beforeA = a.resources,
    beforeB = b.resources;
  s = act(s, { type: "PLAY", id: u.id, payment: { [a.id]: 1, [b.id]: 1 } });
  assert.equal(s.heroes[0].resources, beforeA - 1);
  assert.equal(s.heroes[1].resources, beforeB - 1);
});
test("Good Harvest is scoped to its own player and multiple named effects coexist", () => {
  let s = table();
  s = play(s, "06010");
  s = choose(s, "lore");
  assert.equal(canPay(s, card("05014")), true);
  selectSeat(s, 1);
  assert.equal(canPay(s, card("05014")), false);
  selectSeat(s, 0);
  s = play(s, "06010");
  s = choose(s, "spirit");
  assert.equal(canPay(s, card("05014")), true);
  assert.equal(canPay(s, card("06006")), true);
});
test("Gondorian Shield and Ring of Barahir retain their conditional exact passive rules", () => {
  const s = game(),
    hero = s.heroes[0];
  hero.attachments.push(
    { id: "shield", code: "06005", exhausted: false },
    { id: "ring", code: "06007", exhausted: false },
  );
  const base = card(hero.code);
  assert.equal(stats(s, hero).defense, base.defense! + 1);
  assert.equal(stats(s, hero).health, base.health! + 1);
  assert.equal(hasResourceIcon(hero, "lore"), true);
  hero.attachments.push({ id: "steward", code: "01026", exhausted: false });
  assert.equal(stats(s, hero).defense, base.defense! + 2);
});
test("A pending named-sphere choice and the resolved phase permission survive save validation", () => {
  let s = game();
  s = play(s, "06010");
  assert.ok(validateSave(s));
  s = choose(s, "lore");
  assert.ok(validateSave(s));
});

test("Hirluin's spending permission does not create a resource icon for a zero-cost Outlands ally", () => {
  const s = game(),
    hero = s.heroes[0];
  hero.code = "06001";
  assert.equal(stewardPlayerCanPay(s, hero, card("06006"), 0), false);
  assert.equal(stewardPlayerCanPay(s, hero, card("06006"), 2), true);
  assert.equal(hasResourceIcon(hero, "spirit"), false);
});
