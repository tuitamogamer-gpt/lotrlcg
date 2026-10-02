import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { ELF_PLAYER_CARDS } from "../src/game/elf-player-support.ts";
import { officialStarterDecks } from "../src/game/products.ts";
import { deckProblems } from "../src/game/decks.ts";
import {
  createGame,
  canPlay,
  canPlayAtNoCost,
  canCommit,
  availableAbilities,
  playTargets,
  stats,
  validateSave,
} from "../src/game/engine.ts";
import {
  make,
  get,
  canFight,
  fx,
  prepend,
  playCost,
} from "../src/game/core.ts";
import {
  enterAlly,
  discardCharacter,
  nextRound,
  phaseEndPlayer,
  engage,
  returnAlliesToHand,
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
  elfEncounterRevealed,
  elfEnemyCannotAttack,
} from "../src/game/elf-player-cards.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import type { GameState } from "../src/game/types.ts";
const retail = officialStarterDecks.find((d) => d.id === "starter-elves")!;
function game() {
  let s = act(createGame(432, retail.cards, retail.heroes, "custom"), {
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
  let s = createGame(433, retail.cards, retail.heroes, "custom", {
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
function play(s: GameState, code: string, target?: string) {
  const u = make(s, code);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}
function ability(s: GameState, id: string, attachmentId?: string) {
  return act(s, { type: "ABILITY", id, attachmentId });
}
function attach(s: GameState, host: string, code: string, owner = 0) {
  const id = `elf-a-${s.nextId++}`;
  get(s, host)!.attachments.push({ id, code, owner, exhausted: false });
  return id;
}

test("Elves complete exact retail list and nineteen added identities are registered", () => {
  assert.equal(ELF_PLAYER_CARDS.length, 19);
  for (const c of ELF_PLAYER_CARDS) assert.ok(SCRIPTED.has(c.code), c.name);
  assert.deepEqual(deckProblems(retail), []);
  assert.equal(
    Object.values(retail.cards).reduce((n, v) => n + v, 0),
    50,
  );
});
test("Elf printed-cost trait checks also preserve ordinary Core allies", () => {
  const s = game();
  assert.equal(playCost(s, card("01018")), 4);
  assert.equal(canPlay(s, make(s, "01018")), null);
});
test("Galadriel cannot quest, defend or attack, even while ready", () => {
  const s = game(),
    g = s.heroes[1];
  s.phase = "quest";
  assert.equal(canCommit(s, g), false);
  assert.equal(canFight(g), false);
  const enemy = make(s, "01082");
  s.engaged = [enemy];
  assert.ok(!defendersFor(s, enemy).some((u) => u.id === g.id));
  assert.ok(!attackersFor(s, enemy).some((u) => u.id === g.id));
});
test("Shadow of Fear blanks Galadriel's passive while Nenya keeps its Lore icon and cannot pay her exhaust cost", () => {
  let s = game();
  const g = s.heroes[1],
    nenya = attach(s, g.id, "08121");
  attach(s, g.id, KHAZAD.fear);
  s.phase = "quest";
  assert.equal(canCommit(s, g), false);
  assert.equal(canFight(g), false);
  assert.equal(get(s, g.id)!.blanked, true);
  const u = make(s, "01018");
  enterAlly(s, u);
  flush(s);
  s = skipAll(s);
  s.encounterDeck = ["01077"];
  s = act(s, { type: "TOGGLE_QUEST", id: u.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(get(s, u.id)!.exhausted, true);
  get(s, g.id)!.exhausted = false;
  s.phase = "quest";
  assert.throws(() => ability(s, g.id, nenya), /exhaust|ready/i);
  s.phase = "planning";
  s.heroes[0].resources = 0;
  s.heroes[2].resources = 0;
  assert.equal(canPlay(s, make(s, "01060")), null);
});
test("Shadow of Fear suppresses Celeborn's new responses but preserves an already granted round bonus", () => {
  let s = game();
  const c = s.heroes[0],
    u = make(s, "01060");
  enterAlly(s, u);
  flush(s);
  s = choose(s, "use");
  assert.equal(stats(s, get(s, u.id)!).will, 2);
  attach(s, c.id, KHAZAD.fear);
  stats(s, get(s, c.id)!);
  enterAlly(s, make(s, "01058"));
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(stats(s, get(s, u.id)!).will, 2);
});
test("Galadriel draws and lowers another player's threat once per round, despite being readied", () => {
  let s = table();
  const g = s.heroes[1],
    before = seatView(s, 1).threat;
  s = ability(s, g.id);
  assert.equal(get(s, g.id)!.exhausted, true);
  s = choose(s, "player-1");
  assert.equal(seatView(s, 1).threat, before - 1);
  assert.equal(seatView(s, 1).hand.length, 1);
  selectSeat(s, 0);
  get(s, g.id)!.exhausted = false;
  assert.ok(
    availableAbilities(s, get(s, g.id)!).find((a) =>
      a.label.includes("Reduce threat"),
    )!.disabled,
  );
  nextRound(s);
  assert.ok(
    !availableAbilities(s, get(s, g.id)!).find((a) =>
      a.label.includes("Reduce threat"),
    )!.disabled,
  );
});
test("Galadriel's passive includes non-Silvan and objective allies in their entry round", () => {
  let s = game();
  const ally = make(s, "01018"),
    objective = make(s, "rc135");
  enterAlly(s, ally);
  enterAlly(s, objective);
  s = skipAll((flush(s), s));
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: ally.id });
  s = act(s, { type: "TOGGLE_QUEST", id: objective.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(get(s, ally.id)!.exhausted, false);
  assert.equal(get(s, objective.id)!.exhausted, false);
});
test("Galadriel's passive entry-round marker expires at refresh to the next round", () => {
  let s = game();
  const u = make(s, "01018");
  enterAlly(s, u);
  flush(s);
  s = skipAll(s);
  nextRound(s);
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: u.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(get(s, u.id)!.exhausted, true);
});
test("Celeborn offers a global optional entry bonus through phase end, then it expires next round", () => {
  let s = table();
  selectSeat(s, 1);
  const u = make(s, "01060");
  enterAlly(s, u);
  flush(s);
  assert.match(s.choice!.title, /Celeborn/);
  s = choose(s, "use");
  assert.equal(stats(s, get(s, u.id)!).will, 2);
  assert.equal(stats(s, get(s, u.id)!).attack, 2);
  assert.equal(stats(s, get(s, u.id)!).defense, 1);
  phaseEndPlayer(s);
  assert.equal(stats(s, get(s, u.id)!).will, 2);
  nextRound(s);
  assert.equal(stats(s, get(s, u.id)!).will, 1);
});
test("Sacked Celeborn cannot trigger his response while Galadriel's constant remains active", () => {
  let s = game();
  attach(s, s.heroes[0].id, CARROCK.sacked);
  attach(s, s.heroes[1].id, CARROCK.sacked);
  const u = make(s, "01060");
  enterAlly(s, u);
  flush(s);
  assert.equal(s.choice, null);
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: u.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(get(s, u.id)!.exhausted, false);
});
test("Naith Guide allows another player's hero to quest without exhausting this round", () => {
  let s = table();
  const hero = seatView(s, 1).heroes[0];
  enterAlly(s, make(s, "08002"));
  flush(s);
  s = choose(s, "skip");
  s = choose(s, "use");
  s = choose(s, hero.id);
  selectSeat(s, 1);
  s.phase = "quest";
  s.table!.turn = 1;
  s = act(s, { type: "TOGGLE_QUEST", id: hero.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(get(s, hero.id)!.exhausted, false);
});
test("Greenwood Archer optionally readies another player's hero", () => {
  let s = table();
  const hero = seatView(s, 1).heroes[0];
  hero.exhausted = true;
  enterAlly(s, make(s, "16003"));
  flush(s);
  s = choose(s, "skip");
  s = choose(s, "use");
  s = choose(s, hero.id);
  assert.equal(get(s, hero.id)!.exhausted, false);
});
test("Handmaiden optionally reduces a chosen player's threat", () => {
  let s = table();
  const before = seatView(s, 1).threat;
  enterAlly(s, make(s, "08117"));
  flush(s);
  s = choose(s, "skip");
  s = choose(s, "use");
  s = choose(s, "player-1");
  assert.equal(seatView(s, 1).threat, before - 1);
});
test("Minstrel searches only the top five, adds an event directly and shuffles other cards", () => {
  let s = game();
  s.deck = ["01018", "08009", "01018", "01018", "01018", "22036"];
  enterAlly(s, make(s, "08063"));
  flush(s);
  s = choose(s, "skip");
  s = choose(s, "use");
  assert.ok(s.choice!.options.some((o) => o.code === "08009"));
  assert.ok(!s.choice!.options.some((o) => o.code === "22036"));
  assert.ok(validateSave(s));
  s = choose(s, "take-1");
  assert.equal(s.hand[0].code, "08009");
  assert.equal(s.deck.length, 5);
  assert.equal(s.discard.length, 0);
});
test("Orophin retrieves one exact Silvan ally from the owner's discard pile", () => {
  let s = game();
  s.discard = ["01018", "01060", "01060"];
  enterAlly(s, make(s, "08114"));
  flush(s);
  s = choose(s, "skip");
  s = choose(s, "use");
  s = choose(s, "recover-2");
  assert.deepEqual(s.discard, ["01018", "01060"]);
  assert.equal(s.hand[0].code, "01060");
});
test("Silvan Refugees have a mandatory global leaves-play cascade, with no destruction-only limitation", () => {
  const s = table();
  const own = make(s, "06037"),
    other = make(s, "01018");
  s.allies = [own, other];
  selectSeat(s, 1);
  s.allies = [make(s, "06037")];
  syncSeat(s);
  selectSeat(s, 0);
  discardCharacter(s, other);
  flush(s);
  assert.ok(!s.allies.some((u) => u.code === "06037"));
  assert.ok(!seatView(s, 1).allies.some((u) => u.code === "06037"));
  assert.ok(seatView(s, 0).discard.includes("06037"));
  assert.ok(seatView(s, 1).discard.includes("06037"));
});
test("Defender of Naith optionally readies when a controlled Silvan ally returns to hand", () => {
  let s = game();
  const defender = make(s, "08065"),
    returning = make(s, "01060");
  defender.exhausted = true;
  s.allies = [defender, returning];
  returnAlliesToHand(s, [returning]);
  flush(s);
  assert.match(s.choice!.title, /Defender of the Naith/);
  s = choose(s, "use");
  assert.equal(get(s, defender.id)!.exhausted, false);
  assert.ok(s.hand.some((u) => u.code === "01060"));
});
test("Lembas discards to its original owner and readies/heals the host controller's hero", () => {
  let s = table();
  const host = seatView(s, 1).heroes[0];
  host.exhausted = true;
  host.damage = 4;
  const id = attach(s, host.id, "08064", 0);
  selectSeat(s, 1);
  s = ability(s, host.id, id);
  assert.equal(get(s, host.id)!.exhausted, false);
  assert.equal(get(s, host.id)!.damage, 1);
  assert.ok(seatView(s, 0).discard.includes("08064"));
  assert.ok(!seatView(s, 1).discard.includes("08064"));
});
test("Lembas, Nenya and Wingfoot enforce their printed play restrictions", () => {
  const s = game();
  assert.deepEqual(
    playTargets(s, make(s, "08121")).map((u) => u.id),
    [s.heroes[1].id],
  );
  assert.deepEqual(
    playTargets(s, make(s, "08092")).map((u) => u.id),
    [s.heroes[2].id],
  );
  s.heroes = STARTERS[0].heroes.map((c) => make(s, c));
  assert.match(canPlay(s, make(s, "08064"))!, /Noldor or Silvan/);
});
test("Nenya grants Lore while exhausted and adds current willpower to another player until phase end", () => {
  let s = table();
  const g = s.heroes[1],
    target = seatView(s, 1).heroes[0],
    id = attach(s, g.id, "08121");
  g.tempWill = 2;
  s.phase = "quest";
  s = ability(s, g.id, id);
  assert.equal(get(s, g.id)!.exhausted, true);
  s = choose(s, target.id);
  assert.equal(
    stats(s, get(s, target.id)!).will,
    card(target.code).willpower! + 6,
  );
  assert.ok(validateSave(s));
  selectSeat(s, 0);
  s.phase = "planning";
  s.heroes[0].resources = 0;
  s.heroes[2].resources = 0;
  assert.equal(canPlay(s, make(s, "01060")), null);
  selectSeat(s, 1);
  phaseEndPlayer(s);
  assert.equal(stats(s, get(s, target.id)!).will, card(target.code).willpower!);
});
test("Nenya cannot target Galadriel herself and can act during the staging portion of quest", () => {
  let s = game();
  const g = s.heroes[1],
    id = attach(s, g.id, "08121"),
    beorn = make(s, "01031");
  s.allies = [beorn];
  s.phase = "staging";
  s = ability(s, g.id, id);
  assert.ok(s.choice!.options.some((o) => o.id === beorn.id));
  assert.ok(!s.choice!.options.some((o) => o.id === g.id));
});
test("O Lórien discounts the next partner Silvan play, minimum one, and is consumed by that play", () => {
  let s = table();
  const id = attach(s, s.heroes[0].id, "08058");
  s = ability(s, s.heroes[0].id, id);
  selectSeat(s, 1);
  s.table!.turn = 1;
  assert.equal(playCost(s, card("01060")), 1);
  assert.equal(playCost(s, card("01018")), 4);
  assert.equal(playCost(s, card("16003")), 1);
  s = play(s, "16003");
  s = skipAll(s);
  assert.equal(playCost(s, card("16003")), 2);
});
test("Wingfoot names a type after commitment and offers readying only when that type is revealed", () => {
  let s = game();
  const h = s.heroes[2],
    id = attach(s, h.id, "08092");
  s.encounterDeck = ["01077"];
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: h.id });
  s = act(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /Wingfoot.*committed/i);
  s = choose(s, "use");
  s = choose(s, "location");
  assert.match(s.choice!.title, /Wingfoot.*revealed/i);
  assert.ok(validateSave(s));
  s = choose(s, "use");
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.equal(
    get(s, h.id)!.attachments.find((a) => a.id === id)!.exhausted,
    true,
  );
});
test("Wingfoot skips mismatched reveals and does not respond to cards dealt without being revealed", () => {
  let s = game();
  const h = s.heroes[2],
    id = attach(s, h.id, "08092");
  h.exhausted = true;
  s.phase = "staging";
  s.used.push(`phase:wingfoot:${id}:enemy`);
  elfEncounterRevealed(s, "01077");
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(get(s, h.id)!.exhausted, true);
});
test("Daeron's Runes draws two, then requires exactly one hand discard without deck-discard responses", () => {
  let s = game();
  s.deck = ["06143", "01018", "01018"];
  s = play(s, "04108");
  assert.equal(s.hand.length, 2);
  s = choose(s, s.hand.find((u) => u.code === "06143")!.id);
  assert.equal(s.hand.length, 1);
  assert.ok(s.discard.includes("06143"));
  assert.equal(s.choice, null);
});
test("Daeron's then-discard does not follow an incomplete draw-two", () => {
  let s = game();
  s.deck = ["01018"];
  s = play(s, "04108");
  assert.equal(s.hand.length, 1);
  assert.equal(s.choice, null);
});
test("Elrond's Counsel chooses a character other than the only unique Noldor and lowers own threat", () => {
  let s = table();
  const target = seatView(s, 1).heroes[0],
    threat = s.threat;
  assert.ok(
    !playTargets(s, make(s, "04059")).some((u) => u.id === s.heroes[1].id),
  );
  s = play(s, "04059", target.id);
  assert.equal(s.threat, threat - 3);
  assert.equal(
    stats(s, get(s, target.id)!).will,
    card(target.code).willpower! + 1,
  );
});
test("Tree People pays a return cost, respects one copy per phase and puts a searched ally into play", () => {
  let s = game();
  const returning = make(s, "01060");
  s.allies = [returning];
  s.deck = ["01018", "16003", "01018", "01018", "01018", "08114"];
  s = play(s, "08009");
  s = choose(s, returning.id);
  assert.equal(s.hand[0].code, "01060");
  assert.ok(s.choice!.options.some((o) => o.code === "16003"));
  assert.ok(!s.choice!.options.some((o) => o.code === "08114"));
  s = choose(s, "take-1");
  s = skipAll(s);
  assert.ok(s.allies.some((u) => u.code === "16003"));
  assert.match(canPlay(s, make(s, "08009"))!, /one copy/);
  phaseEndPlayer(s);
  assert.equal(canPlay(s, make(s, "08009")), null);
});
test("Feigned Voices stops only the selected enemy's current player from being attacked", () => {
  let s = table();
  const returning = make(s, "01060"),
    enemy = make(s, "01082");
  s.allies = [returning];
  selectSeat(s, 1);
  s.engaged = [enemy];
  syncSeat(s);
  selectSeat(s, 0);
  s.phase = "defense";
  s = play(s, "08027");
  s = choose(s, returning.id);
  s = choose(s, enemy.id);
  assert.ok(elfEnemyCannotAttack(s, get(s, enemy.id)!, 1));
  assert.ok(!elfEnemyCannotAttack(s, get(s, enemy.id)!, 0));
  assert.ok(!get(s, enemy.id)!.feinted);
  selectSeat(s, 1);
  phaseEndPlayer(s);
  assert.ok(!elfEnemyCannotAttack(s, get(s, enemy.id)!, 1));
});
test("Host atomically returns all Silvans and plays only those physical returned cards one at a time at no cost", () => {
  let s = game();
  const ally = make(s, "01060"),
    defender = make(s, "08065"),
    oldCopy = make(s, "01060");
  s.allies = [ally, defender];
  s.hand = [oldCopy];
  s.heroes.forEach((h) => (h.resources = 2));
  s = play(s, "22036");
  assert.equal(s.allies.length, 0);
  assert.equal(s.choice!.options.length, 2);
  assert.ok(!s.choice!.options.some((o) => o.id === oldCopy.id));
  assert.ok(validateSave(s));
  const selected = s.choice!.options.find((o) => o.code === "08065")!.id;
  s = choose(s, selected);
  s = choose(s, "skip");
  s = choose(s, s.choice!.options[0].id);
  s = choose(s, "skip");
  assert.equal(s.allies.length, 2);
  assert.ok(s.hand.some((u) => u.id === oldCopy.id));
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    2,
  );
});
test("Host free play still obeys Dol Guldur's one-ally limit", () => {
  let s = game();
  s.scenarioId = "dol-guldur";
  s.stage = 1;
  s.allies = [make(s, "01060"), make(s, "08065")];
  s = play(s, "22036");
  s = choose(s, s.choice!.options[0].id);
  s = choose(s, "skip");
  assert.equal(s.allies.length, 1);
  assert.equal(s.choice, null);
  assert.equal(s.hand.length, 1);
});
test("Host no-cost play requires no matching sphere, but still enforces uniqueness", () => {
  const s = game();
  s.heroes.forEach((h) => (h.resources = 0));
  s.heroes = s.heroes.slice(0, 1);
  assert.equal(canPlayAtNoCost(s, make(s, "08117")), null);
  s.allies = [make(s, "08114")];
  assert.match(canPlayAtNoCost(s, make(s, "08114"))!, /unique/);
});
test("Host and Tree People returning Mendor resolve his campaign leaves-play loss", () => {
  let s = game();
  s.playMode = "campaign";
  s.campaign = {
    ...createGame(99, retail.cards, retail.heroes, "custom", {
      mode: "campaign",
    }).campaign!,
  };
  s.allies = [make(s, "rc135")];
  s = play(s, "22036");
  assert.equal(s.status, "lost");
  assert.ok(s.removed.includes("rc135"));
  assert.ok(!s.hand.some((u) => u.code === "rc135"));
});
test("Haldir attacks a staging enemy alone with no Dunhere bonus and no Path of Need cost exception", () => {
  let s = game();
  const h = s.heroes[2],
    enemy = make(s, "01082"),
    active = make(s, "01077");
  s.staging = [enemy];
  s.activeLocation = active;
  attach(s, active.id, "04103");
  s.phase = "defense";
  s = ability(s, h.id);
  s = choose(s, enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 0);
  assert.equal(get(s, h.id)!.exhausted, true);
  get(s, h.id)!.exhausted = false;
  assert.ok(
    availableAbilities(s, get(s, h.id)!).find((a) =>
      a.label.includes("Attack beyond"),
    )!.disabled,
  );
});
test("Haldir can attack another seat's enemy but his controller's engagement disables the action", () => {
  let s = table();
  const h = s.heroes[2],
    enemy = make(s, "01082");
  selectSeat(s, 1);
  s.engaged = [enemy];
  syncSeat(s);
  selectSeat(s, 0);
  s.phase = "defense";
  s = ability(s, h.id);
  s = choose(s, enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 0);
  get(s, h.id)!.exhausted = false;
  s.used = s.used.filter((k) => !k.startsWith("round:haldir:"));
  s.staging.push(make(s, "01081"));
  engage(s, s.staging[0]);
  assert.ok(
    availableAbilities(s, get(s, h.id)!).find((a) =>
      a.label.includes("Attack beyond"),
    )!.disabled,
  );
});
