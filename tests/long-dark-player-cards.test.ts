import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { LONG_DARK_PLAYER_CARDS } from "../src/game/long-dark-player-support.ts";
import {
  availableAbilities,
  createGame,
  playTargets,
} from "../src/game/engine.ts";
import {
  enemyAddedToStaging,
  nextRound,
  phaseEnd,
  revealed,
} from "../src/game/board.ts";
import { playerAttack } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import { fx, playCost, prepend, stats } from "../src/game/core.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import {
  longDarkPlayerCardPlayed,
  longDarkPlayerEnemyCannotAttack,
  longDarkPlayerIgnoreEngagement,
  longDarkPlayerTravelled,
} from "../src/game/long-dark-player-cards.ts";
import { RHOS } from "../src/game/rhosgobel.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 1_030_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `long-dark-player-${nextId++}`,
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
  const s = act(createGame(641, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(642, d.cards, d.heroes, d.id, {
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

test("The Long Dark registers every one of its ten player designs", () => {
  assert.equal(LONG_DARK_PLAYER_CARDS.length, 10);
  for (const c of LONG_DARK_PLAYER_CARDS)
    assert.ok(SCRIPTED.has(c.code), c.code);
});
test("Háma recovers a Tactics event after attacker declaration, then discards a hand card", () => {
  let s = game("tactics"),
    hama = s.heroes[0],
    enemy = unit("01082"),
    junk = unit("01020");
  hama.code = "04076";
  s.engaged.push(enemy);
  s.hand.push(junk);
  s.discard = ["01034"];
  playerAttack(s, enemy, [hama.id]);
  flush(s);
  assert.equal(s.choice?.title, "Háma · Declared attacker");
  s = choose(s, "event-0");
  s = choose(s, junk.id);
  assert.ok(s.hand.some((u) => u.code === "01034"));
  assert.ok(s.discard.includes("01020"));
  assert.ok(s.used.includes("game:hama:1"));
});
test("Háma has three uses for the whole game group, retained across rounds", () => {
  let s = table();
  selectSeat(s, 1);
  s.heroes[0].code = "04076";
  seatView(s, 0).used.push("game:hama:1", "game:hama:2");
  s.discard = ["01034"];
  const enemy = unit("01082", 1);
  s.engaged.push(enemy);
  syncSeat(s);
  playerAttack(s, enemy, [s.heroes[0].id]);
  flush(s);
  s = choose(s, "event-0");
  s = choose(s, s.hand[0].id);
  nextRound(s);
  selectSeat(s, 1);
  s.heroes[0].exhausted = false;
  playerAttack(s, s.engaged[0], [s.heroes[0].id]);
  flush(s);
  assert.notEqual(s.choice?.title, "Háma · Declared attacker");
});
test("Háma cannot return a non-Tactics event or trigger blanked printed text", () => {
  const s = game("tactics"),
    hama = s.heroes[0],
    enemy = unit("01082");
  hama.code = "04076";
  s.engaged.push(enemy);
  s.discard = ["01020"];
  playerAttack(s, enemy, [hama.id]);
  flush(s);
  assert.notEqual(s.choice?.title, "Háma · Declared attacker");
});
test("Erestor discards before drawing, needs no exhaustion and acts once per round", () => {
  let s = game(),
    erestor = unit("04077"),
    hand = unit("01020");
  erestor.exhausted = true;
  s.allies.push(erestor);
  s.hand.push(hand);
  s.deck = ["01013", "01014"];
  s = act(s, { type: "ABILITY", id: erestor.id });
  s = choose(s, hand.id);
  assert.ok(s.discard.includes("01020"));
  assert.equal(s.hand[0].code, "01013");
  assert.ok(availableAbilities(s, s.allies[0])[0].disabled);
  nextRound(s);
  assert.equal(availableAbilities(s, s.allies[0])[0].disabled, false);
});
test("Fresh Tracks works on revealed enemies and may use multiple copies on one addition", () => {
  let s = game();
  s.hand.push(unit("04078"), unit("04078"));
  revealed(s, "01089");
  flush(s);
  s = choose(s, "play");
  s = choose(s, "play");
  assert.equal(s.staging[0].damage, 2);
  assert.equal(longDarkPlayerIgnoreEngagement(s, s.staging[0]), true);
  assert.equal(s.discard.filter((c) => c === "04078").length, 2);
});
test("Fresh Tracks also responds to an existing enemy moved back to staging", () => {
  let s = game(),
    enemy = unit("01089");
  s.staging.push(enemy);
  s.hand.push(unit("04078"));
  enemyAddedToStaging(s, enemy);
  flush(s);
  assert.equal(s.choice?.title, "Fresh Tracks · Enemy added to staging");
  s = choose(s, "play");
  assert.equal(s.staging[0].damage, 1);
});
test("Fresh Tracks excludes automatic checks but still permits optional engagement", () => {
  let s = game(),
    enemy = unit("01089");
  s.staging.push(enemy);
  s.hand.push(unit("04078"));
  enemyAddedToStaging(s, enemy);
  flush(s);
  s = choose(s, "play");
  s.phase = "encounter";
  prepend(s, fx("engagementRound"));
  flush(s);
  assert.equal(s.staging[0].id, enemy.id);
  s = act(s, { type: "ENGAGE", id: enemy.id });
  assert.equal(s.engaged[0].id, enemy.id);
  nextRound(s);
  assert.equal(longDarkPlayerIgnoreEngagement(s, s.engaged[0]), false);
});
test("Erebor Battle Master counts only other controlled Dwarf allies with the errata cap of four", () => {
  const s = game(),
    master = unit("04079");
  s.allies.push(master, ...Array.from({ length: 5 }, () => unit("03011")));
  s.heroes[0].code = "03001";
  assert.equal(stats(s, master).attack, card("04079").attack! + 4);
  s.allies = s.allies.slice(0, 2);
  assert.equal(stats(s, master).attack, card("04079").attack! + 1);
});
test("Ring Mail retains Dwarf/Hobbit target and Restricted stat rules", () => {
  const s = game("lore"),
    hero = s.heroes[0];
  hero.code = "02001";
  assert.ok(playTargets(s, unit("04080")).some((u) => u.id === hero.id));
  hero.attachments.push({ id: "mail", code: "04080", exhausted: false });
  assert.equal(stats(s, hero).defense, card(hero.code).defense! + 1);
  assert.equal(stats(s, hero).health, card(hero.code).health! + 1);
});
test("Out of Sight snapshots currently engaged enemies and its player's attack restriction", () => {
  let s = game("spirit"),
    enemy = unit("01089"),
    later = unit("01089");
  s.engaged.push(enemy);
  s.threat = 20;
  assert.equal(playCost(s, card("04081")), 2);
  s = play(s, "04081");
  s.engaged.push(later);
  assert.equal(longDarkPlayerEnemyCannotAttack(s, s.engaged[0], 0), true);
  assert.equal(longDarkPlayerEnemyCannotAttack(s, later, 0), false);
  assert.equal(longDarkPlayerEnemyCannotAttack(s, s.engaged[0], 1), false);
  s.phase = "defense";
  assert.throws(
    () =>
      act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: s.heroes[0].id }),
    /This enemy cannot attack again/,
  );
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.heroes[0].damage, 0);
  phaseEnd(s);
  assert.equal(longDarkPlayerEnemyCannotAttack(s, s.engaged[0], 0), false);
});
test("Ever My Heart Rises follows actual Mountain travel, not a location swap", () => {
  let s = game(),
    dwarf = unit("03011"),
    mountain = unit("01088");
  s.allies.push(dwarf);
  dwarf.exhausted = true;
  dwarf.attachments.push({ id: "heart", code: "04082", exhausted: false });
  const before = s.threat;
  longDarkPlayerTravelled(s, mountain);
  flush(s);
  assert.equal(s.choice, null);
  longDarkPlayerTravelled(s, unit(KHAZAD.branching));
  flush(s);
  s = choose(s, "ready");
  assert.equal(s.allies[0].exhausted, false);
  assert.equal(s.threat, before - 1);
});
test("A Song's Lore resource icon also grants the Lore sphere for attachment restrictions", () => {
  const s = game(),
    hero = s.heroes[0];
  hero.attachments.push({ id: "wisdom", code: "02034", exhausted: false });
  assert.equal(
    playTargets(s, unit("04085")).some((u) => u.id === hero.id),
    true,
  );
  assert.equal(
    playTargets(s, unit("02033")).some((u) => u.id === hero.id),
    true,
  );
});
test("Warden heals two different characters across players and pays two Lore resources separately to ready", () => {
  let s = table();
  selectSeat(s, 2);
  const warden = unit("04083", 2),
    a = s.heroes[0],
    b = seatView(s, 0).heroes[0];
  a.damage = 2;
  b.damage = 2;
  s.allies.push(warden);
  syncSeat(s);
  const before = s.heroes[0].resources;
  s = act(s, { type: "ABILITY", id: warden.id });
  s = choose(s, a.id);
  assert.ok(!s.choice!.options.some((o) => o.id === a.id));
  s = choose(s, b.id);
  assert.equal(seatView(s, 2).heroes[0].damage, 1);
  assert.equal(seatView(s, 0).heroes[0].damage, 1);
  s = choose(s, "pay");
  s = choose(s, a.id);
  s = choose(s, a.id);
  assert.equal(seatView(s, 2).allies[0].exhausted, false);
  assert.equal(seatView(s, 2).heroes[0].resources, before - 2);
});
test("Warden requires an actual healable character and may decline its optional ready", () => {
  let s = game("lore"),
    warden = unit("04083");
  s.allies.push(warden);
  assert.ok(availableAbilities(s, warden)[0].disabled);
  s.heroes[0].damage = 1;
  s = act(s, { type: "ABILITY", id: warden.id });
  s = choose(s, s.heroes[0].id);
  s = choose(s, "heal");
  s = choose(s, "skip");
  assert.equal(s.allies[0].exhausted, true);
  assert.equal(s.heroes[0].damage, 0);
});
test("Warden removal after healing Wilyador prevents its optional ready payment", () => {
  let s = game("lore"),
    warden = unit("04083"),
    wily = unit(RHOS.wilyador);
  wily.damage = 2;
  s.allies.push(warden, wily);
  s.scenarioId = "journey-to-rhosgobel";
  s.stage = 2;
  s = act(s, { type: "ABILITY", id: warden.id });
  s = choose(s, wily.id);
  s = choose(s, "heal");
  assert.ok(!s.allies.some((u) => u.code === "04083"));
  assert.ok(s.removed.includes("04083"));
  assert.notEqual(s.choice?.title, "Warden of Healing · Then ready?");
});
test("Word of Command exhausts a controlled Istari and searches the entire deck without drawing", () => {
  let s = game("lore"),
    gandalf = unit("01073");
  s.allies.push(gandalf);
  s.deck = ["01020", "01013", "01014", "01015", "01016", "04083"];
  s = play(s, "04084", gandalf.id);
  assert.ok(s.choice?.options.some((o) => o.id === "card-5"));
  s = choose(s, "card-5");
  assert.ok(s.hand.some((u) => u.code === "04083"));
  assert.equal(s.allies[0].exhausted, true);
  assert.equal(s.deck.length, 5);
});
test("Word of Command may find no card, but still pays its Istari and shuffles", () => {
  let s = game("lore"),
    gandalf = unit("01073");
  s.allies.push(gandalf);
  s.deck = ["01020"];
  s = play(s, "04084", gandalf.id);
  s = choose(s, "none");
  assert.equal(s.hand.length, 0);
  assert.equal(s.deck.length, 1);
  assert.equal(s.allies[0].exhausted, true);
});
test("Love of Tales responds to another player's actual Song play with its host's controller", () => {
  let s = table(),
    hero = seatView(s, 2).heroes[0];
  hero.attachments.push({
    id: "tales",
    code: "04085",
    exhausted: false,
    owner: 0,
  });
  syncSeat(s);
  const before = hero.resources;
  s = play(s, "02010", s.heroes[0].id);
  assert.equal(s.table!.active, 2);
  assert.equal(s.choice?.title, "Love of Tales · Song played");
  s = choose(s, "resource");
  assert.equal(seatView(s, 2).heroes[0].resources, before + 1);
  assert.equal(seatView(s, 2).heroes[0].attachments[0].exhausted, true);
});
test("Love of Tales cannot gain resources on Sacked heroes or respond from an exhausted attachment", () => {
  const s = game("lore"),
    hero = s.heroes[0];
  hero.attachments.push(
    { id: "tales", code: "04085", exhausted: false },
    { id: "sack", code: CARROCK.sacked, exhausted: false },
  );
  stats(s, hero);
  longDarkPlayerCardPlayed(s, card("02010"), 0);
  flush(s);
  assert.equal(s.choice, null);
  hero.attachments.pop();
  hero.attachments[0].exhausted = true;
  longDarkPlayerCardPlayed(s, card("02010"), 0);
  flush(s);
  assert.equal(s.choice, null);
});
