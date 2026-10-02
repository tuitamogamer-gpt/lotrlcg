import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { WATCHER_PLAYER_CARDS } from "../src/game/watcher-player-support.ts";
import {
  availableAbilities,
  createGame,
  playTargets,
} from "../src/game/engine.ts";
import {
  discardCharacter,
  enterAlly,
  exhaustCharacter,
  nextRound,
  phaseEnd,
  returnAlly,
  revealed,
} from "../src/game/board.ts";
import { playerAttack } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import { stats } from "../src/game/core.ts";
import {
  effectiveKeyword,
  passiveRule,
} from "../src/game/expansion-passives.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import { validateSave } from "../src/game/save.ts";
import {
  watcherPlayerAttackBonus,
  watcherPlayerCharacterExhausted,
  watcherPlayerDefended,
  watcherPlayerLocationEntered,
  watcherPlayerPlayProblem,
} from "../src/game/watcher-player-cards.ts";
import { CARROCK } from "../src/game/carrock.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 1_010_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `watcher-player-${nextId++}`,
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
  const s = act(createGame(631, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(632, d.cards, d.heroes, d.id, {
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

test("Watcher in the Water registers all ten player designs with exact handlers", () => {
  assert.equal(WATCHER_PLAYER_CARDS.length, 10);
  for (const c of WATCHER_PLAYER_CARDS) assert.ok(SCRIPTED.has(c.code), c.code);
});
test("Lore Aragorn resets to the immutable initial threat once per game during refresh", () => {
  let s = game("lore");
  const hero = s.heroes[0];
  hero.code = "04053";
  s.phase = "refresh";
  s.startingThreat = 31;
  s.threat = 48;
  s = act(s, { type: "ABILITY", id: hero.id });
  assert.equal(s.threat, 31);
  assert.ok(availableAbilities(s, s.heroes[0])[0].disabled);
  nextRound(s);
  s.phase = "refresh";
  s.threat = 40;
  assert.ok(availableAbilities(s, s.heroes[0])[0].disabled);
});
test("Aragorn's legacy fallback uses starting heroes, including heroes who have left play", () => {
  let s = game("lore");
  const hero = s.heroes[0];
  hero.code = "04053";
  s.startingHeroes = ["04053", "01011", "01012"];
  delete s.startingThreat;
  s.heroes.pop();
  s.phase = "refresh";
  s.threat = 45;
  s = act(s, { type: "ABILITY", id: hero.id });
  assert.equal(s.threat, 12 + card("01011").threat! + card("01012").threat!);
});
test("Aragorn uses the acting player's initial threat in a multiplayer game", () => {
  let s = table();
  selectSeat(s, 2);
  s.heroes[0].code = "04053";
  s.startingThreat = 27;
  s.threat = 44;
  s.phase = "refresh";
  syncSeat(s);
  s = act(s, { type: "ABILITY", id: s.heroes[0].id });
  assert.equal(seatView(s, 2).threat, 27);
  assert.ok(!seatView(s, 0).used.includes("game:aragorn-refresh"));
});
test("Aragorn cannot trigger outside refresh, with blanked text or without a threat reduction", () => {
  const s = game("lore"),
    hero = s.heroes[0];
  hero.code = "04053";
  assert.ok(availableAbilities(s, hero)[0].disabled);
  s.phase = "refresh";
  s.threat = s.startingThreat!;
  assert.ok(availableAbilities(s, hero)[0].disabled);
  s.threat = 45;
  hero.attachments.push({
    id: "sack-aragorn",
    code: CARROCK.sacked,
    exhausted: false,
  });
  assert.ok(availableAbilities(s, hero).every((a) => a.disabled));
});
test("Grave Cairn captures the departing character's modified attack before removing attachments", () => {
  let s = game(),
    departing = unit("01013"),
    target = s.heroes[0];
  departing.attachments.push({ id: "axe", code: "03007", exhausted: false });
  departing.tempAttack = 2;
  s.allies.push(departing);
  s.hand.push(unit("04054"));
  const attack = stats(s, departing).attack,
    before = stats(s, target).attack;
  returnAlly(s, departing);
  flush(s);
  s = choose(s, "play");
  s = choose(s, target.id);
  assert.equal(stats(s, s.heroes[0]).attack, before + attack);
  assert.ok(s.hand.some((u) => u.code === "01013"));
  assert.ok(s.discard.includes("04054"));
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, s.heroes[0]).attack, before + attack);
  nextRound(s);
  assert.equal(stats(s, s.heroes[0]).attack, before);
});
test("Grave Cairn can be played by a different player after a character is discarded", () => {
  let s = table(),
    ally = unit("01013");
  s.allies.push(ally);
  seatView(s, 1).heroes[0].attachments.push({
    id: "king",
    code: "02010",
    exhausted: false,
  });
  seatView(s, 1).hand.push(unit("04054", 1));
  const target = seatView(s, 2).heroes[0],
    before = stats(s, target).attack;
  syncSeat(s);
  discardCharacter(s, ally);
  flush(s);
  assert.equal(s.table!.active, 1);
  s = choose(s, "play");
  s = choose(s, target.id);
  assert.equal(
    stats(s, seatView(s, 2).heroes[0]).attack,
    before + card("01013").attack!,
  );
});
test("Multiple Grave Cairn copies may respond to the same departure and stack", () => {
  let s = game(),
    ally = unit("01013"),
    target = s.heroes[0];
  s.allies.push(ally);
  s.hand.push(unit("04054"), unit("04054"));
  const before = stats(s, target).attack;
  discardCharacter(s, ally);
  flush(s);
  s = choose(s, "play");
  s = choose(s, target.id);
  s = choose(s, "play");
  s = choose(s, target.id);
  assert.equal(
    stats(s, s.heroes[0]).attack,
    before + 2 * card("01013").attack!,
  );
});
test("Response events are unavailable as ordinary actions", () => {
  const s = game();
  assert.ok(watcherPlayerPlayProblem(s, "04054"));
  assert.ok(watcherPlayerPlayProblem(s, "04060"));
});
test("Watcher of the Bruinen defends without exhausting and pays its Forced after the attack ends", () => {
  let s = game("tactics"),
    watcher = unit("04056"),
    enemy = unit("01089");
  s.allies.push(watcher);
  s.hand.push(unit("01020"));
  s.engaged.push(enemy);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: watcher.id });
  assert.equal(s.choice?.title, "Watcher of the Bruinen · After defending");
  assert.equal(s.allies[0].exhausted, false);
  assert.equal(s.allies[0].damage, 0);
  s = choose(s, s.hand[0].id);
  assert.ok(s.discard.includes("01020"));
  assert.equal(s.allies[0].code, "04056");
});
test("Bruinen's Forced discard is not destruction and does not trigger Horn of Gondor", () => {
  const s = game("tactics"),
    watcher = unit("04056");
  s.allies.push(watcher);
  s.heroes[0].attachments.push({ id: "horn", code: "01042", exhausted: false });
  const before = s.heroes[0].resources;
  watcherPlayerDefended(s, watcher);
  flush(s);
  assert.equal(s.allies.length, 0);
  assert.ok(s.discard.includes("04056"));
  assert.equal(s.heroes[0].resources, before);
});
test("Bruinen can pay its controller's hand after a Sentinel defense for another player", () => {
  let s = table(),
    watcher = unit("04056", 2),
    enemy = unit("01089", 0);
  seatView(s, 2).allies.push(watcher);
  seatView(s, 2).hand.push(unit("01020", 2));
  s.engaged.push(enemy);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: watcher.id });
  assert.equal(s.table!.active, 2);
  s = choose(s, seatView(s, 2).hand[0].id);
  assert.ok(seatView(s, 2).discard.includes("01020"));
  assert.equal(seatView(s, 0).discard.includes("01020"), false);
});
test("Rivendell Bow permits Noldor, Silvan and either Aragorn, limits one and is not Restricted", () => {
  const s = game("tactics"),
    aragorn = unit("01001"),
    arwen = unit("04058"),
    legolas = s.heroes[1];
  s.heroes.push(aragorn);
  s.allies.push(arwen);
  const ids = playTargets(s, unit("04057")).map((u) => u.id);
  assert.ok(ids.includes(aragorn.id));
  assert.ok(ids.includes(arwen.id));
  assert.ok(ids.includes(legolas.id));
  assert.ok(!ids.includes(s.heroes[0].id));
  assert.equal(passiveRule("04057")?.restricted, undefined);
  aragorn.attachments.push({ id: "bow", code: "04057", exhausted: false });
  assert.ok(!playTargets(s, unit("04057")).some((u) => u.id === aragorn.id));
});
test("Bow adds attack only to printed ranged characters attacking another player's engaged enemy", () => {
  const s = table(),
    legolas = seatView(s, 1).heroes[1],
    enemy = unit("01082", 0),
    aragorn = s.heroes[0];
  legolas.attachments.push({ id: "bow", code: "04057", exhausted: false });
  aragorn.attachments.push({ id: "bow2", code: "04057", exhausted: false });
  s.engaged.push(enemy);
  assert.equal(watcherPlayerAttackBonus(s, legolas, enemy), 1);
  assert.equal(watcherPlayerAttackBonus(s, aragorn, enemy), 0);
  assert.equal(effectiveKeyword(aragorn, "Ranged"), true);
  enemy.owner = 1;
  seatView(s, 1).engaged.push(s.engaged.pop()!);
  assert.equal(watcherPlayerAttackBonus(s, legolas, enemy), 0);
});
test("Arwen responds to actual exhaustion and grants round-long defense and Sentinel to another player", () => {
  let s = table(),
    arwen = unit("04058"),
    target = seatView(s, 1).heroes[0];
  s.allies.push(arwen);
  const before = stats(s, target).defense;
  syncSeat(s);
  assert.equal(exhaustCharacter(s, arwen), true);
  flush(s);
  s = choose(s, target.id);
  assert.equal(stats(s, seatView(s, 1).heroes[0]).defense, before + 1);
  assert.equal(effectiveKeyword(seatView(s, 1).heroes[0], "Sentinel"), true);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, seatView(s, 1).heroes[0]).defense, before + 1);
  nextRound(s);
  assert.equal(stats(s, seatView(s, 1).heroes[0]).defense, before);
  assert.equal(effectiveKeyword(seatView(s, 1).heroes[0], "Sentinel"), false);
});
test("Arwen's commitment uses the shared exhaustion response without revealing until it resolves", () => {
  let s = game("spirit"),
    arwen = unit("04058");
  s.allies.push(arwen);
  s.phase = "quest";
  s.committedIds = [arwen.id];
  s = act(s, { type: "COMMIT" });
  assert.equal(s.choice?.title, "Arwen Undómiel · Exhausted");
  s = choose(s, s.heroes[0].id);
  assert.ok(s.allies[0].committed);
  assert.equal(effectiveKeyword(s.heroes[0], "Sentinel"), true);
});
test("Arwen can grant her own defense after exhausting as a defender, before damage", () => {
  let s = game("spirit"),
    arwen = unit("04058"),
    enemy = unit("01089");
  enemy.shadows = ["01095"];
  s.allies.push(arwen);
  s.engaged.push(enemy);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: arwen.id });
  assert.equal(s.choice?.title, "Arwen Undómiel · Exhausted");
  s = choose(s, arwen.id);
  assert.equal(s.allies[0].damage, 0);
  assert.equal(stats(s, s.allies[0]).defense, 2);
});
test("Arwen triggers when exhausted to pay Hail of Stones", () => {
  let s = game("tactics"),
    arwen = unit("04058"),
    enemy = unit("01082");
  s.allies.push(arwen);
  s.staging.push(enemy);
  s = play(s, "04032", enemy.id);
  s = choose(s, arwen.id);
  s = choose(s, "exhaust");
  assert.equal(s.choice?.title, "Arwen Undómiel · Exhausted");
  s = choose(s, s.heroes[0].id);
  assert.equal(s.staging[0].damage, 1);
  assert.equal(effectiveKeyword(s.heroes[0], "Sentinel"), true);
});
test("Arwen does not trigger again while already exhausted, when entering exhausted or when blanked", () => {
  const s = game("spirit"),
    arwen = unit("04058");
  arwen.exhausted = true;
  enterAlly(s, arwen, false, false);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(exhaustCharacter(s, arwen), false);
  arwen.exhausted = false;
  arwen.blanked = true;
  watcherPlayerCharacterExhausted(s, arwen);
  flush(s);
  assert.equal(s.choice, null);
});
test("Arwen's lasting keyword survives save and rejects unknown persisted keywords", () => {
  let s = game("spirit"),
    arwen = unit("04058");
  s.allies.push(arwen);
  exhaustCharacter(s, arwen);
  flush(s);
  s = choose(s, s.heroes[0].id);
  assert.equal(validateSave(JSON.parse(JSON.stringify(s))), true);
  s.heroes[0].roundKeywords = ["Surge"];
  assert.equal(validateSave(s), false);
});
test("Short Cut exhausts a controlled Hobbit, shuffles the entered location and reveals a replacement", () => {
  let s = game("lore"),
    hobbit = s.heroes[0];
  hobbit.code = "02001";
  s.hand.push(unit("04060"));
  s.encounterDeck = ["01089"];
  revealed(s, "01088");
  flush(s);
  assert.equal(s.choice?.title, "Short Cut · Location entered play");
  s = choose(s, "play");
  s = choose(s, hobbit.id);
  assert.equal(s.heroes[0].exhausted, true);
  assert.ok(s.discard.includes("04060"));
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(s.staging.length, 1);
  assert.ok(!s.encounterDiscard.includes("01088"));
});
test("Short Cut can react to a put-into-play active location and preserves the other active location", () => {
  let s = game("lore"),
    hobbit = s.heroes[0],
    target = unit("01088"),
    other = unit("01095");
  hobbit.code = "02001";
  s.hand.push(unit("04060"));
  s.activeLocation = target;
  s.extraActiveLocations = [other];
  s.encounterDeck = ["01089"];
  watcherPlayerLocationEntered(s, target);
  flush(s);
  s = choose(s, "play");
  s = choose(s, hobbit.id);
  assert.equal(s.activeLocation?.id, other.id);
  assert.ok(!s.log.some((l) => /travels to/.test(l.text)));
});
test("Short Cut cannot pay with another player's Hobbit or an exhausted Hobbit", () => {
  const s = table(),
    location = unit("01088");
  seatView(s, 2).heroes[0].code = "02001";
  s.hand.push(unit("04060"));
  s.staging.push(location);
  watcherPlayerLocationEntered(s, location);
  flush(s);
  assert.equal(s.choice, null);
  selectSeat(s, 2);
  s.heroes[0].exhausted = true;
  s.hand.push(unit("04060", 2));
  watcherPlayerLocationEntered(s, location);
  flush(s);
  assert.equal(s.choice, null);
});
