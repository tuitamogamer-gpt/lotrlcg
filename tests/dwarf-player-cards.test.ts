import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { DWARF_PLAYER_CARDS } from "../src/game/dwarf-player-support.ts";
import { officialStarterDecks } from "../src/game/products.ts";
import { deckProblems } from "../src/game/decks.ts";
import {
  createGame,
  availableAbilities,
  canPlay,
  playTargets,
  stats,
  threatOf,
  validateSave,
} from "../src/game/engine.ts";
import { make, get, canFight } from "../src/game/core.ts";
import {
  damage,
  discardPlayerDeck,
  enterAlly,
  nextRound,
  phaseEndPlayer,
  discardAttachment,
} from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import {
  defendersFor,
  attackersFor,
  selectSeat,
  seatView,
  syncSeat,
} from "../src/game/table.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import { CLUE } from "../src/game/scenarios.ts";
import type { GameState } from "../src/game/types.ts";

const retail = officialStarterDecks.find((d) => d.id === "starter-dwarves")!;
function game() {
  let s = act(createGame(421, retail.cards, retail.heroes, "custom"), {
    type: "KEEP",
  });
  s.hand = [];
  s.staging = [];
  s.queue = [];
  s.choice = null;
  s.deck = Array<string>(20).fill("01018");
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(422, d.cards, retail.heroes, d.id, {
    seats: [
      { heroes: retail.heroes, deckId: "leadership" },
      { heroes: ["01004", "01005"], deckId: "tactics" },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  for (const player of [0, 1]) {
    selectSeat(s, player);
    s.hand = [];
    s.deck = Array<string>(20).fill("01018");
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
function skipAll(s: GameState) {
  for (let i = 0; s.choice && i < 50; i++) s = choose(s, "skip");
  assert.equal(s.choice, null);
  return s;
}
function play(s: GameState, code: string, target?: string) {
  const u = make(s, code);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}
function ability(s: GameState, id: string, attachmentId?: string) {
  return act(s, { type: "ABILITY", id, attachmentId });
}
function attachment(s: GameState, hostId: string, code: string, owner = 0) {
  const id = `dwarf-a-${s.nextId++}`;
  get(s, hostId)!.attachments.push({ id, code, owner, exhausted: false });
  return id;
}

test("Dwarves of Durin's complete official starting list has exact registered rules", () => {
  assert.equal(DWARF_PLAYER_CARDS.length, 20);
  for (const c of DWARF_PLAYER_CARDS) assert.ok(SCRIPTED.has(c.code), c.name);
  assert.deepEqual(deckProblems(retail), []);
  assert.match(card("131013").text!, /Exhaust Thrór's Map/);
});
test("Dáin's ready bonus includes himself and other players' Dwarves and changes immediately", () => {
  const s = table(),
    dain = s.heroes[0],
    gimli = seatView(s, 1).heroes[0];
  const normal = card(gimli.code);
  assert.equal(stats(s, gimli).will, normal.willpower! + 1);
  assert.equal(stats(s, gimli).attack, normal.attack! + 1);
  assert.equal(stats(s, dain).will, card(dain.code).willpower! + 1);
  attachment(s, dain.id, CARROCK.sacked);
  assert.equal(
    stats(s, gimli).will,
    normal.willpower! + 1,
    "Sacked forbids triggered effects, not this constant bonus",
  );
  dain.exhausted = true;
  assert.equal(stats(s, gimli).will, normal.willpower);
  assert.equal(stats(s, gimli).attack, normal.attack);
});
test("Ori draws an extra card at five controlled Dwarves; another player's Dwarf does not count", () => {
  const s = table();
  s.allies.push(make(s, "03011"));
  const four = s.hand.length;
  nextRound(s);
  flush(s);
  assert.equal(seatView(s, 0).hand.length, four + 1);
  selectSeat(s, 0);
  s.allies.push(make(s, "01059"));
  syncSeat(s);
  const five = seatView(s, 0).hand.length;
  nextRound(s);
  flush(s);
  assert.equal(seatView(s, 0).hand.length, five + 2);
});
test("Bifur accepts a resource paid by another player and shares one limit across players", () => {
  let s = table();
  const bifur = s.heroes[2],
    donor = seatView(s, 1).heroes[0];
  const before = bifur.resources;
  selectSeat(s, 1);
  s = ability(s, bifur.id);
  s = choose(s, donor.id);
  assert.equal(get(s, bifur.id)!.resources, before + 1);
  assert.equal(get(s, donor.id)!.resources, 9);
  selectSeat(s, 0);
  assert.ok(
    availableAbilities(s, get(s, bifur.id)!).find((a) => /Bifur/.test(a.label))!
      .disabled,
  );
  assert.throws(() => ability(s, bifur.id));
  nextRound(s);
  flush(s);
  assert.ok(
    !availableAbilities(s, get(s, bifur.id)!).find((a) =>
      /Bifur/.test(a.label),
    )!.disabled,
  );
});
test("deck-discard responses are optional, pay no cost, and do not fire for a hand discard", () => {
  let s = game();
  s.deck = ["12066", "06143"];
  const hero = s.heroes[0];
  const before = hero.resources;
  discardPlayerDeck(s, 2);
  flush(s);
  assert.equal(s.choice?.title, "Ered Luin Miner · Discarded from deck");
  s = choose(s, "enter");
  assert.ok(s.allies.some((u) => u.code === "12066"));
  assert.equal(s.choice?.title, "Hidden Cache · Discarded from deck");
  s = choose(s, hero.id);
  assert.equal(get(s, hero.id)!.resources, before + 2);
  assert.deepEqual(s.discard, ["06143"]);
  s.discard.push("12066", "06143");
  flush(s);
  assert.equal(s.choice, null);
});
test("skipping mining preserves the cards in the discard pile and survives save validation", () => {
  let s = game();
  s.deck = ["12066", "06143"];
  discardPlayerDeck(s, 2);
  flush(s);
  assert.ok(validateSave(s));
  s = skipAll(s);
  assert.deepEqual(s.discard, ["12066", "06143"]);
  assert.equal(s.allies.length, 0);
});
test("Dori can take lethal assigned hero damage before destruction, with no damage reaching the hero", () => {
  let s = game();
  const hero = s.heroes[0],
    dori = make(s, "131009");
  s.allies.push(dori);
  const clue = attachment(s, hero.id, CLUE);
  assert.equal(damage(s, hero.id, 9), false);
  flush(s);
  assert.equal(get(s, hero.id)!.damage, 0);
  assert.ok(validateSave(s));
  s = choose(s, dori.id);
  assert.ok(s.heroes.some((h) => h.id === hero.id));
  assert.equal(get(s, hero.id)!.damage, 0);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.id === clue));
  assert.ok(!s.allies.some((u) => u.id === dori.id));
  assert.ok(s.discard.includes("131009"));
});
test("Dori skip proceeds into Frodo after Song of Mocking redirects the assignment", () => {
  let s = game();
  const protectedHero = s.heroes[0];
  s.heroes[1].code = "02025";
  const frodo = s.heroes[1],
    dori = make(s, "131009");
  s.allies.push(dori);
  attachment(s, frodo.id, "02099");
  s.used.push(`phase:mocking:42:${protectedHero.id}:${frodo.id}`);
  const threat = s.threat;
  damage(s, protectedHero.id, 3);
  flush(s);
  // Mocking has a single recipient and resolves its mandatory redirection first.
  if (s.choice?.title?.includes("Song of Mocking"))
    s = choose(s, s.choice.options[0].id);
  assert.match(s.choice!.title, /Dori.*Frodo/);
  s = choose(s, "skip");
  assert.match(s.choice!.title, /Frodo/);
  s = choose(s, "cancel-damage");
  assert.equal(get(s, protectedHero.id)!.damage, 0);
  assert.equal(get(s, frodo.id)!.damage, 0);
  assert.equal(s.threat, threat + 3);
});
test("Cram follows its host controller and is discarded to its original owner", () => {
  let s = table();
  const hero = seatView(s, 1).heroes[0];
  hero.exhausted = true;
  const cram = attachment(s, hero.id, "131011", 0);
  selectSeat(s, 1);
  s = ability(s, hero.id, cram);
  assert.equal(get(s, hero.id)!.exhausted, false);
  assert.ok(!get(s, hero.id)!.attachments.some((a) => a.id === cram));
  assert.ok(seatView(s, 0).discard.includes("131011"));
  assert.ok(!seatView(s, 1).discard.includes("131011"));
});
test("Thrór's Map exhausts in travel, replaces the active location, and bypasses travel costs", () => {
  let s = game();
  s.phase = "travel";
  const hero = s.heroes[0],
    map = attachment(s, hero.id, "131013");
  const old = make(s, "01078"),
    web = make(s, "01077");
  s.activeLocation = old;
  s.staging = [web];
  s = ability(s, hero.id, map);
  s = choose(s, web.id);
  assert.equal(s.activeLocation?.id, web.id);
  assert.ok(s.staging.some((u) => u.id === old.id));
  assert.ok(get(s, hero.id)!.attachments.find((a) => a.id === map)!.exhausted);
  assert.ok(
    s.heroes.every((h) => !h.exhausted),
    "Great Forest Web's travel cost is not paid",
  );
  assert.ok(!s.discard.includes("131013"));
});
test("Thrór's Map lets the first player replace one of two active locations", () => {
  let s = table();
  s.phase = "travel";
  const host = s.heroes[0],
    map = attachment(s, host.id, "131013");
  const first = make(s, "01078"),
    second = make(s, "01094"),
    next = make(s, "01077");
  s.activeLocation = first;
  s.extraActiveLocations = [second];
  s.staging = [next];
  s = ability(s, host.id, map);
  s = choose(s, next.id);
  assert.equal(
    s.choice?.title,
    "Thrór's Map · Choose the active location to replace",
  );
  assert.ok(validateSave(s));
  s = choose(s, second.id);
  assert.equal(s.activeLocation?.id, first.id);
  assert.equal(s.extraActiveLocations?.[0].id, next.id);
  assert.ok(s.staging.some((u) => u.id === second.id));
  assert.ok(!s.staging.some((u) => u.id === first.id));
});
test("Thrór's Map cannot activate outside travel or make The Carrock active", () => {
  const s = game(),
    hero = s.heroes[0],
    map = attachment(s, hero.id, "131013");
  s.staging = [make(s, "01077")];
  assert.throws(() => ability(s, hero.id, map));
  s.phase = "travel";
  s.staging = [make(s, CARROCK.carrock)];
  assert.throws(() => ability(s, hero.id, map));
});
test("A Very Good Tale pays two ally exhaust costs, caps two selected allies and five cost, then opens mining responses", () => {
  let s = game();
  const a = make(s, "01013"),
    b = make(s, "01017");
  s.allies = [a, b];
  s.deck = ["12066", "12066", "06143", "01013", "01059"];
  s = play(s, "131014");
  s = choose(s, a.id);
  s = choose(s, b.id);
  assert.ok(get(s, a.id)!.exhausted && get(s, b.id)!.exhausted);
  assert.equal(s.choice!.title, "A Very Good Tale · Put allies into play");
  const pickMiner = s.choice!.options.find((o) => o.code === "12066")!.id;
  s = choose(s, pickMiner);
  assert.ok(
    !s.choice!.options.some((o) => o.code === "12066"),
    "three-cost Miner no longer fits remaining two-cost budget",
  );
  s = choose(s, s.choice!.options.find((o) => o.code === "01013")!.id);
  for (let i = 0; s.choice && i < 10; i++) {
    if (s.choice.title.startsWith("Ered Luin Miner")) s = choose(s, "enter");
    else if (s.choice.title.startsWith("Hidden Cache"))
      s = choose(s, s.heroes[0].id);
    else s = choose(s, "skip");
  }
  assert.equal(
    s.allies.filter((u) => u.code === "12066").length,
    2,
    "remaining discarded Miner enters as its own response",
  );
  assert.equal(s.allies.filter((u) => u.code === "01013").length, 2);
  assert.equal(s.deck.length, 0);
  assert.ok(validateSave(s));
});
test("Good Tale can finish with zero allies; entering unique same-name allies is forbidden", () => {
  let s = game();
  s.allies = [make(s, "01013"), make(s, "01017"), make(s, "01073")];
  s.deck = Array(5).fill("01073");
  s = play(s, "131014");
  s = choose(s, s.allies[0].id);
  s = choose(s, s.allies[1].id);
  assert.equal(s.choice, null);
  assert.equal(s.allies.length, 3);
  assert.equal(s.discard.filter((c) => c === "01073").length, 5);
});
test("ally Glóin counts himself toward five and triggers only when played from hand", () => {
  let s = game();
  s.allies.push(make(s, "03011"));
  const hero = s.heroes[2],
    before = hero.resources;
  s = play(s, "132006");
  assert.equal(s.choice?.title, "Glóin · Five Dwarves");
  s = choose(s, hero.id);
  assert.equal(get(s, hero.id)!.resources, before + 2);
  const put = game();
  put.allies.push(make(put, "03011"));
  enterAlly(put, make(put, "132006"));
  flush(put);
  assert.equal(put.choice, null);
});
test("King Under the Mountain adds one card directly and discards the other with mining response", () => {
  let s = game(),
    host = s.heroes[0],
    king = attachment(s, host.id, "132018");
  s.deck = ["01018", "12066"];
  s = ability(s, host.id, king);
  assert.ok(validateSave(s));
  s = choose(s, "keep-0");
  assert.equal(s.hand[0].code, "01018");
  assert.equal(s.deck.length, 0);
  assert.equal(s.choice?.title, "Ered Luin Miner · Discarded from deck");
  s = choose(s, "enter");
  assert.ok(s.allies.some((u) => u.code === "12066"));
  assert.ok(get(s, host.id)!.attachments.find((a) => a.id === king)!.exhausted);
});
test("King Under the Mountain can look at a one-card deck and bypasses a draw prevention", () => {
  let s = game(),
    host = s.heroes[0],
    king = attachment(s, host.id, "132018");
  s.deck = ["01018"];
  s.activeLocation = make(s, "01095");
  s = ability(s, host.id, king);
  s = choose(s, "keep-0");
  assert.equal(s.hand[0].code, "01018");
  assert.equal(s.discard.length, 0);
});
test("Bombur lowers normal location threat and suppresses an Underground location for the phase", () => {
  let s = game();
  const bombur = make(s, "04035"),
    location = make(s, "01078");
  s.allies = [bombur];
  s.staging = [location];
  const base = threatOf(s, location);
  s = ability(s, bombur.id);
  s = choose(s, location.id);
  assert.equal(threatOf(s, get(s, location.id)!), base - 1);
  phaseEndPlayer(s);
  assert.equal(threatOf(s, get(s, location.id)!), base);
  const definition = card(location.code),
    prior = definition.traits;
  try {
    definition.traits = "Underground.";
    get(s, bombur.id)!.exhausted = false;
    s = ability(s, bombur.id);
    s = choose(s, location.id);
    assert.equal(threatOf(s, get(s, location.id)!), 0);
    phaseEndPlayer(s);
    assert.equal(threatOf(s, get(s, location.id)!), base);
  } finally {
    definition.traits = prior;
  }
});
test("Erebor Record Keeper pays Lore to ready another player's Dwarf and cannot fight", () => {
  let s = table();
  const keeper = make(s, "03011"),
    gimli = seatView(s, 1).heroes[0];
  s.allies = [keeper];
  gimli.exhausted = true;
  const payer = s.heroes[1],
    before = payer.resources;
  s = ability(s, keeper.id);
  s = choose(s, payer.id);
  s = choose(s, gimli.id);
  assert.ok(get(s, keeper.id)!.exhausted);
  assert.ok(!get(s, gimli.id)!.exhausted);
  assert.equal(get(s, payer.id)!.resources, before - 1);
  get(s, keeper.id)!.exhausted = false;
  const enemy = make(s, "01096");
  s.engaged = [enemy];
  assert.equal(canFight(get(s, keeper.id)!), false);
  assert.ok(!defendersFor(s, enemy).some((u) => u.id === keeper.id));
  assert.ok(!attackersFor(s, enemy).some((u) => u.id === keeper.id));
});
test("Record Keeper can ready itself after paying its exhaust cost", () => {
  let s = game();
  const keeper = make(s, "03011");
  s.allies = [keeper];
  s = ability(s, keeper.id);
  s = choose(s, s.heroes[1].id);
  s = choose(s, keeper.id);
  assert.equal(get(s, keeper.id)!.exhausted, false);
});
test("Prospector completes discard-three before recovering a card and opening mining windows", () => {
  let s = game();
  s.deck = ["12066", "06143", "01018"];
  s.discard = ["01013"];
  const prospector = make(s, "06141");
  enterAlly(s, prospector);
  flush(s);
  s = choose(s, "delve");
  assert.equal(s.choice?.title, "Ered Nimrais Prospector · Recover one card");
  s = choose(s, "recover-0");
  assert.equal(s.deck.length, 1);
  assert.equal(s.deck[0], "01013");
  s = choose(s, "enter");
  s = choose(s, s.heroes[0].id);
  assert.ok(s.allies.some((u) => u.code === "12066"));
});
test("Prospector's then-recovery requires all three discards; mining still responds to partial discard", () => {
  let s = game();
  s.deck = ["12066"];
  enterAlly(s, make(s, "06141"));
  flush(s);
  s = choose(s, "delve");
  assert.equal(s.choice?.title, "Ered Luin Miner · Discarded from deck");
  s = choose(s, "enter");
  assert.equal(s.deck.length, 0);
});
test("recovering an older duplicate Miner does not suppress the new discarded Miner's response", () => {
  let s = game();
  s.deck = ["12066", "01018", "01018"];
  s.discard = ["12066"];
  enterAlly(s, make(s, "06141"));
  flush(s);
  s = choose(s, "delve");
  s = choose(s, "recover-0");
  assert.equal(s.choice?.title, "Ered Luin Miner · Discarded from deck");
  s = choose(s, "enter");
  assert.equal(s.deck[0], "12066");
  assert.ok(s.allies.some((u) => u.code === "12066"));
});
test("Longbeard Elder looks without revealing and places quest progress through the active buffer", () => {
  let s = game();
  const elder = make(s, "04102"),
    location = make(s, "01078");
  s.allies = [elder];
  s.activeLocation = location;
  s.encounterDeck = ["01077"];
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: elder.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(s.choice?.title, "Longbeard Elder · Committed to quest");
  s = choose(s, "look");
  assert.ok(validateSave(s));
  assert.equal(s.encounterDeck[0], "01077");
  assert.ok(!s.staging.some((u) => u.code === "01077"));
  s = choose(s, "continue");
  assert.equal(s.activeLocation?.progress, 1);
  assert.equal(s.progress, 0);
  assert.ok(
    s.staging.some((u) => u.code === "01077"),
    "Normal staging reveals the card after the commitment response closes",
  );
});
test("Longbeard Elder loses one willpower when the looked-at card is not a location until phase end", () => {
  let s = game();
  const elder = make(s, "04102");
  s.allies = [elder];
  s.encounterDeck = ["01096"];
  s.phase = "quest";
  const before = stats(s, elder).will;
  s = act(s, { type: "TOGGLE_QUEST", id: elder.id });
  s = act(s, { type: "COMMIT" });
  s = choose(s, "look");
  s = choose(s, "continue");
  assert.equal(stats(s, get(s, elder.id)!).will, before - 1);
  phaseEndPlayer(s);
  assert.equal(stats(s, get(s, elder.id)!).will, before);
});
test("Legacy of Durin exhausts per physical attachment only for its controller's played Dwarf", () => {
  let s = game();
  const host = s.heroes[0],
    legacy = attachment(s, host.id, "04061");
  s = play(s, "03011");
  assert.equal(s.choice?.title, "Legacy of Durin · Dwarf played");
  s = choose(s, "draw");
  assert.equal(s.hand.length, 1);
  assert.ok(
    get(s, host.id)!.attachments.find((a) => a.id === legacy)!.exhausted,
  );
  s = play(s, "03011");
  assert.equal(s.choice, null);
  get(s, host.id)!.attachments.find((a) => a.id === legacy)!.exhausted = false;
  enterAlly(s, make(s, "03011"));
  flush(s);
  assert.equal(s.choice, null);
});
test("Legacy of Durin on another player's hero follows the host controller", () => {
  let s = table();
  const host = seatView(s, 1).heroes[0];
  const legacy = attachment(s, host.id, "04061", 0);
  enterAlly(s, make(s, "03011"), false, true);
  flush(s);
  assert.equal(
    s.choice,
    null,
    "The original owner's Dwarf does not trigger the borrowed attachment",
  );
  syncSeat(s);
  selectSeat(s, 1);
  enterAlly(s, make(s, "03011"), false, true);
  flush(s);
  assert.equal(s.choice?.title, "Legacy of Durin · Dwarf played");
  s = choose(s, "draw");
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.ok(
    get(s, host.id)!.attachments.find((a) => a.id === legacy)!.exhausted,
  );
});
test("Narvi's Belt grants a lasting resource icon that survives source departure and expires at phase end", () => {
  let s = game(),
    hero = s.heroes[1],
    belt = attachment(s, hero.id, "03003");
  s = ability(s, hero.id, belt);
  s = choose(s, "spirit");
  assert.ok(get(s, hero.id)!.phaseResourceIcons?.includes("spirit"));
  assert.ok(validateSave(s));
  discardAttachment(
    s,
    get(s, hero.id)!,
    get(s, hero.id)!.attachments.find((a) => a.id === belt)!,
  );
  assert.ok(get(s, hero.id)!.phaseResourceIcons?.includes("spirit"));
  const event = make(s, "01046");
  s.hand.push(event);
  assert.equal(canPlay(s, event), null);
  phaseEndPlayer(s);
  assert.ok(!get(s, hero.id)!.phaseResourceIcons?.length);
  assert.match(canPlay(s, event)!, /matching sphere/);
});
test("Hidden Cache from hand spends one resource and draws one; its response spends nothing", () => {
  let s = game();
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, "06143");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 1,
  );
  assert.equal(s.hand.length, 1);
  assert.ok(s.discard.includes("06143"));
});
test("Lure of Moria readies every player's Dwarves, leaving other characters exhausted", () => {
  let s = table();
  for (const h of [...s.heroes, ...seatView(s, 1).heroes]) h.exhausted = true;
  const legolas = seatView(s, 1).heroes[1];
  s = play(s, "04030");
  assert.ok(s.heroes.every((h) => !h.exhausted));
  assert.equal(seatView(s, 1).heroes[0].exhausted, false);
  assert.equal(get(s, legolas.id)!.exhausted, true);
});
test("We Are Not Idle allows zero and exhausts heroes, including Sacked cost payers, but never allies", () => {
  let s = game();
  const keeper = make(s, "03011");
  s.allies = [keeper];
  attachment(s, s.heroes[0].id, CARROCK.sacked);
  s = play(s, "04129");
  assert.ok(!s.choice!.options.some((o) => o.id === keeper.id));
  const donor = s.heroes[0],
    recipient = s.heroes[1],
    before = recipient.resources;
  s = choose(s, donor.id);
  s = choose(s, "done");
  s = choose(s, recipient.id);
  assert.equal(get(s, donor.id)!.exhausted, true);
  assert.equal(get(s, recipient.id)!.resources, before + 1);
  assert.equal(s.hand.length, 1);
  s = play(s, "04129");
  s = choose(s, "done");
  assert.equal(s.hand.length, 2);
});
test("Durin's Song stacks per use through phase transitions and ends at the next round", () => {
  let s = game();
  const hero = s.heroes[2],
    before = stats(s, hero);
  s = play(s, "03004", hero.id);
  s = play(s, "03004", hero.id);
  assert.equal(stats(s, get(s, hero.id)!).will, before.will + 4);
  assert.equal(stats(s, get(s, hero.id)!).attack, before.attack + 4);
  assert.equal(stats(s, get(s, hero.id)!).defense, before.defense + 4);
  assert.ok(validateSave(s));
  phaseEndPlayer(s);
  assert.equal(stats(s, get(s, hero.id)!).will, before.will + 4);
  nextRound(s);
  flush(s);
  assert.equal(stats(s, get(s, hero.id)!).will, before.will);
});
test("Dwarf attachment restrictions require the printed hero or Dwarf hero targets", () => {
  const s = table(),
    dwarf = s.heroes[0],
    legolas = seatView(s, 1).heroes[1];
  for (const code of ["132018", "04061", "03003"]) {
    const targets = playTargets(s, make(s, code));
    assert.ok(targets.some((u) => u.id === dwarf.id));
    assert.ok(!targets.some((u) => u.id === legolas.id));
  }
  for (const code of ["131011", "131013"])
    assert.ok(playTargets(s, make(s, code)).some((u) => u.id === legolas.id));
});

test("real Shadow of Fear disables Dáin's printed passive and Bifur's action, with bonuses restored on detachment", () => {
  const s = game(),
    dain = s.heroes.find((h) => h.code === "02116")!,
    bifur = s.heroes.find((h) => h.code === "03002")!;
  const ally = make(s, "03011");
  s.allies.push(ally);
  assert.equal(stats(s, ally).will, card(ally.code).willpower! + 1);
  dain.attachments.push({
    id: "dwarf-fear-dain",
    code: KHAZAD.fear,
    exhausted: false,
    owner: 0,
  });
  bifur.attachments.push({
    id: "dwarf-fear-bifur",
    code: KHAZAD.fear,
    exhausted: false,
    owner: 0,
  });
  assert.equal(stats(s, ally).will, card(ally.code).willpower);
  assert.ok(
    availableAbilities(s, bifur).find(
      (a) => a.label === "Move 1 resource to Bifur",
    )!.disabled,
  );
  assert.throws(() => act(s, { type: "ABILITY", id: bifur.id }));
  discardAttachment(
    s,
    dain,
    dain.attachments.find((a) => a.id === "dwarf-fear-dain")!,
  );
  assert.equal(stats(s, ally).will, card(ally.code).willpower! + 1);
});
