import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS, SCRIPTED, card } from "../src/game/cards.ts";
import {
  HUNT_PLAYER_CARDS,
  HUNT_PLAYER_CODES,
} from "../src/game/hunt-player-support.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playTargets,
  stats,
} from "../src/game/engine.ts";
import {
  nextRound,
  revealed,
  enterAlly,
  placeEncounter,
} from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { seatView, syncSeat, selectSeat } from "../src/game/table.ts";
import type { Action, GameState, Unit } from "../src/game/types.ts";

let nextId = 200_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `hunt-test-${nextId++}`,
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
  const s = act(createGame(171, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.deck = ["01016", "01043", "01044", "01059"];
  s.heroes.forEach((h) => {
    h.resources = 5;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(172, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: ["01001"], deckId: "leadership" },
      { heroes: ["01005"], deckId: "tactics" },
      { heroes: ["01007"], deckId: "spirit" },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  s.staging = [];
  for (let i = 0; i < 3; i++) {
    const p = seatView(s, i);
    p.hand = [];
    p.deck = ["01016", "01043", "01044", "01059"];
    p.heroes[0].resources = 5;
    if (i !== s.table!.active)
      Object.assign(s.table!.seats[i], { hand: p.hand, deck: p.deck });
  }
  syncSeat(s);
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing choice ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function chooseCard(s: GameState, code: string) {
  const option = s.choice?.options.find((o) => o.code === code);
  assert.ok(option, `Missing choice for ${code}`);
  return choose(s, option.id);
}
function play(s: GameState, code: string, target?: string) {
  const u = unit(code, s.table?.active ?? 0);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target } as Action);
}
function reveal(s: GameState, code: string) {
  revealed(s, code);
  flush(s);
  return s;
}

test("The Hunt for Gollum registers all ten exact player definitions without changing original starters", () => {
  assert.equal(HUNT_PLAYER_CARDS.length, 10);
  assert.deepEqual(
    [...HUNT_PLAYER_CODES],
    Array.from({ length: 10 }, (_, i) => `02${String(i + 1).padStart(3, "0")}`),
  );
  for (const code of HUNT_PLAYER_CODES) assert.ok(SCRIPTED.has(code), code);
  for (const d of STARTERS) {
    assert.equal(
      Object.values(d.cards).reduce((sum, n) => sum + n, 0),
      30,
    );
    assert.ok(Object.keys(d.cards).every((code) => code.startsWith("01")));
  }
});

test("Bilbo adds to the first player's framework draw, regardless of Bilbo's controller", () => {
  const s = table();
  const bilbo = unit("02001", 2);
  seatView(s, 2).heroes.push(bilbo);
  s.table!.first = 1;
  nextRound(s);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 2);
  assert.equal(seatView(s, 2).hand.length, 1);
  // Drawing is one framework effect, so Iron Shackles cancels both cards.
  selectSeat(s, 1);
  s.shackles = 1;
  s.hand = [];
  syncSeat(s);
  nextRound(s);
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.equal(seatView(s, 1).shackles, 0);
});

test("Campfire Tales draws for every living player and pays from its player's pool", () => {
  let s = table();
  s = play(s, "02003");
  assert.equal(seatView(s, 0).heroes[0].resources, 4);
  assert.equal(seatView(s, 1).heroes[0].resources, 5);
  assert.equal(seatView(s, 2).heroes[0].resources, 5);
  for (let i = 0; i < 3; i++) assert.equal(seatView(s, i).hand.length, 1);
  assert.ok(seatView(s, 0).discard.includes("02003"));
});

test("Eagles search selects any number of Eagle cards, including events, within only the original top five", () => {
  let s = game("tactics");
  s.deck = ["02004", "01016", "02005", "01043", "02010", "02004", "01059"];
  s = play(s, "02005");
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code).map((o) => o.code),
    ["02004", "02005"],
  );
  s = chooseCard(s, "02004");
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code).map((o) => o.code),
    ["02005"],
  );
  s = chooseCard(s, "02005");
  assert.equal(s.choice, null);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["02004", "02005"],
  );
  assert.equal(s.deck.filter((code) => code === "02004").length, 1);
  assert.equal(s.deck.length, 5);
});

test("Eagles search may take zero cards and shuffles the whole remaining deck deterministically", () => {
  const initial = game("tactics");
  initial.deck = ["02004", "01016", "01043", "02010", "01059", "01044"];
  const original = [...initial.deck];
  let a = play(structuredClone(initial), "02005");
  let b = play(structuredClone(initial), "02005");
  a = choose(a, "skip");
  b = choose(b, "skip");
  assert.deepEqual(a.deck, b.deck);
  assert.deepEqual([...a.deck].sort(), original.sort());
  assert.equal(a.hand.length, 0);
  assert.notEqual(a.seed, initial.seed);
});

test("Mustering selects one Rohan ally from the top ten, excluding heroes and deeper allies", () => {
  let s = game("spirit");
  s.deck = ["01009", ...Array(8).fill("01059"), "02006", "01044"];
  s = play(s, "02007");
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code).map((o) => o.code),
    ["02006"],
  );
  s = chooseCard(s, "02006");
  assert.equal(s.choice, null);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["02006"],
  );
  assert.equal(s.deck.length, 10);
  assert.ok(s.deck.includes("01044"));
});

test("Rivendell Minstrel offers an optional full-deck Song search only when played from hand", () => {
  let s = game("lore");
  s.deck = [...Array(12).fill("01016"), "02010", "01043"];
  s = play(s, "02008");
  assert.equal(s.choice?.title, "Rivendell Minstrel");
  s = choose(s, "search");
  s = chooseCard(s, "02010");
  assert.equal(s.hand[0].code, "02010");
  assert.equal(s.allies[0].code, "02008");
  assert.equal(s.deck.length, 13);
  const putIntoPlay = game("lore");
  const seed = putIntoPlay.seed;
  enterAlly(putIntoPlay, unit("02008"), true, false);
  flush(putIntoPlay);
  assert.equal(putIntoPlay.choice, null);
  assert.equal(putIntoPlay.seed, seed);
});

test("Rivendell Minstrel can decline its response without searching or shuffling", () => {
  let s = game("lore");
  const deck = [...s.deck],
    seed = s.seed;
  s = play(s, "02008");
  s = choose(s, "skip");
  assert.deepEqual(s.deck, deck);
  assert.equal(s.seed, seed);
});

test("Dúnedain Mark stacks attack and moves by spending the attached hero's own resource", () => {
  let s = game("lore");
  const host = s.heroes[0],
    destination = s.heroes[1];
  host.attachments.push({
    id: "mark",
    code: "02002",
    exhausted: false,
    owner: 0,
  });
  host.attachments.push({
    id: "mark-two",
    code: "02002",
    exhausted: false,
    owner: 0,
  });
  host.resources = 1;
  assert.equal(stats(s, host).attack, (card(host.code).attack ?? 0) + 2);
  assert.equal(
    availableAbilities(s, host).find((a) => a.id === "mark")?.disabled,
    false,
  );
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: "mark" });
  assert.ok(!s.choice!.options.some((o) => o.id === host.id));
  s = choose(s, destination.id);
  assert.equal(s.heroes[0].resources, 0);
  assert.equal(s.heroes[1].resources, 5);
  assert.equal(stats(s, s.heroes[0]).attack, (card(host.code).attack ?? 0) + 1);
  assert.equal(
    stats(s, s.heroes[1]).attack,
    (card(destination.code).attack ?? 0) + 1,
  );
  assert.equal(s.heroes[1].attachments[0].id, "mark");
  assert.equal(
    availableAbilities(s, s.heroes[0]).find((a) => a.id === "mark-two")
      ?.disabled,
    true,
  );
});

test("Westfold Horse-breaker can be exhausted and discards itself to ready another player's hero", () => {
  let s = table();
  const breaker = unit("02006", 0);
  breaker.exhausted = true;
  breaker.attachments.push({
    id: "condition",
    code: "01080",
    exhausted: false,
  });
  s.allies.push(breaker);
  seatView(s, 1).heroes[0].exhausted = true;
  const destination = seatView(s, 1).heroes[0].id;
  syncSeat(s);
  assert.equal(availableAbilities(s, breaker)[0].disabled, false);
  s = act(s, { type: "ABILITY", id: breaker.id });
  s = choose(s, destination);
  assert.equal(seatView(s, 0).allies.length, 0);
  assert.ok(seatView(s, 0).discard.includes("02006"));
  assert.ok(s.encounterDiscard.includes("01080"));
  assert.equal(seatView(s, 1).heroes[0].exhausted, false);
});

test("Winged Guardian keeps Sentinel, rejects restricted attachments and pays after a defended attack", () => {
  let s = game("tactics");
  const guardian = unit("02004"),
    enemy = unit("01075");
  s.allies.push(guardian);
  s.engaged = [enemy];
  s.phase = "defense";
  s.heroes.forEach((h) => {
    h.resources = 0;
  });
  s.heroes[1].resources = 1;
  assert.ok(!playTargets(s, unit("19003")).some((u) => u.id === guardian.id));
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: guardian.id });
  assert.equal(s.allies[0].damage, 0);
  assert.equal(s.choice?.title, "Winged Guardian · Forced");
  const payer = s.heroes[1].id;
  s = choose(s, `pay-${payer}`);
  assert.equal(s.heroes[1].resources, 0);
  assert.ok(s.allies.some((u) => u.id === guardian.id));
});

test("Winged Guardian is discarded when no Tactics resource exists, and does not charge after being destroyed", () => {
  for (const enemyCode of ["01075", "01082"]) {
    let s = game("tactics");
    const guardian = unit("02004"),
      enemy = unit(enemyCode);
    s.allies = [guardian];
    s.engaged = [enemy];
    s.phase = "defense";
    s.heroes.forEach((h) => {
      h.resources = enemyCode === "01082" ? 2 : 0;
    });
    s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: guardian.id });
    assert.equal(s.allies.length, 0);
    assert.ok(s.discard.includes("02004"));
    assert.equal(s.choice, null);
    assert.deepEqual(
      s.heroes.map((h) => h.resources),
      Array(3).fill(enemyCode === "01082" ? 2 : 0),
    );
  }
});

test("Winged Guardian's Sentinel defense uses only its controller's Tactics resources", () => {
  let s = table();
  const guardian = unit("02004", 1),
    enemy = unit("01075", 0);
  seatView(s, 1).allies.push(guardian);
  s.engaged = [enemy];
  s.phase = "defense";
  syncSeat(s);
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: guardian.id });
  assert.equal(s.table!.active, 1);
  assert.deepEqual(
    s.choice!.options.filter((o) => o.id.startsWith("pay-")).map((o) => o.code),
    ["01005"],
  );
  s = choose(s, `pay-${seatView(s, 1).heroes[0].id}`);
  assert.equal(seatView(s, 1).heroes[0].resources, 4);
  assert.equal(seatView(s, 0).heroes[0].resources, 5);
});

test("Song of Kings grants the shared hero pool a Leadership icon without creating resources", () => {
  let s = game("lore");
  const hero = s.heroes[0];
  s = play(s, "02010", hero.id);
  assert.equal(s.heroes[0].resources, 4);
  s.heroes[1].resources = s.heroes[2].resources = 0;
  s = play(s, "02003");
  assert.equal(s.heroes[0].resources, 3);
  assert.equal(s.hand.length, 1);
});

test("Strider's Path is a reveal response and returns the prior active location with its progress intact", () => {
  const s = game("lore");
  s.phase = "staging";
  const path = unit("02009");
  s.hand = [path];
  assert.match(canPlay(s, path) ?? "", /response/i);
  const previous = unit("01095");
  previous.progress = 1;
  s.activeLocation = previous;
  reveal(s, "01077");
  assert.match(s.choice?.title ?? "", /Strider's Path/);
  const heroResources = s.heroes.map((h) => h.resources);
  let after = choose(s, "strider-0");
  assert.equal(after.activeLocation?.code, "01077");
  assert.equal(after.phase, "staging");
  assert.ok(
    after.staging.some((u) => u.id === previous.id && u.progress === 1),
  );
  assert.ok(after.heroes.every((h) => !h.exhausted));
  assert.equal(
    after.heroes.reduce((n, h) => n + h.resources, 0),
    heroResources.reduce((n, v) => n + v, 0) - 1,
  );
  assert.ok(after.discard.includes("02009"));
});
test("Strider's Path does not respond to a location put into play without revelation", () => {
  const s = game("lore");
  s.phase = "staging";
  s.hand = [unit("02009")];
  placeEncounter(s, "01077");
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.code === "01077"));
  assert.ok(s.hand.some((u) => u.code === "02009"));
});

test("Strider's Path bypasses Travel costs but keeps after-travel Forced effects", () => {
  let s = game("lore");
  s.phase = "staging";
  s.hand = [unit("02009")];
  reveal(s, "01087");
  s = choose(s, "strider-0");
  // The Brown Lands is explored by its own Forced after-travel progress.
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes("01087"));
  assert.equal(s.phase, "staging");
});

test("Strider's Path keeps optional location travel responses in the current phase", () => {
  let s = game("lore");
  s.phase = "staging";
  s.hand = [unit("02009")];
  s.heroes[0].exhausted = true;
  const hero = s.heroes[0].id;
  reveal(s, "01099");
  s = choose(s, "strider-0");
  assert.equal(s.choice?.title, "Old Forest Road");
  s = choose(s, hero);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.activeLocation?.code, "01099");
  assert.equal(s.phase, "staging");
});

test("Searches and active abilities cannot silently accept unimplemented card identities", () => {
  assert.ok(!HUNT_PLAYER_CODES.has("02030"));
  const s = game();
  const noTarget = unit("02006");
  s.allies = [noTarget];
  assert.equal(availableAbilities(s, noTarget)[0].disabled, true);
  assert.throws(
    () => act(s, { type: "ABILITY", id: noTarget.id }),
    /exhausted/,
  );
});

test("Sacked does not disable Bilbo's constant resource draw modifier", async () => {
  const { CARROCK } = await import("../src/game/carrock.ts");
  const { KHAZAD } = await import("../src/game/khazad-dum.ts");
  const { huntResourceDrawBonus } =
    await import("../src/game/expansion-player-cards.ts");
  const s = game("lore"),
    hero = s.heroes[0];
  hero.code = "02001";
  hero.attachments.push({
    id: "bilbo-sacked",
    code: CARROCK.sacked,
    exhausted: false,
  });
  stats(s, hero);
  assert.equal(huntResourceDrawBonus(s, 0), 1);
  hero.attachments.push({
    id: "bilbo-fear",
    code: KHAZAD.fear,
    exhausted: false,
  });
  stats(s, hero);
  assert.equal(huntResourceDrawBonus(s, 0), 0);
});
