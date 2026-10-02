import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { FOUNDATIONS_PLAYER_CARDS } from "../src/game/foundations-player-support.ts";
import {
  availableAbilities,
  createGame,
  playTargets,
} from "../src/game/engine.ts";
import { exhaustCharacter, phaseEnd, revealed } from "../src/game/board.ts";
import { playerAttack } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import { stats } from "../src/game/core.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import { foundationsPlayerPlayProblem } from "../src/game/foundations-player-cards.ts";
import { REDHORN } from "../src/game/redhorn-gate.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 1_050_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `foundations-player-${nextId++}`,
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
  const s = act(createGame(651, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(652, d.cards, d.heroes, d.id, {
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

test("Foundations registers all ten player designs and retains their printed text", () => {
  assert.equal(FOUNDATIONS_PLAYER_CARDS.length, 10);
  for (const c of FOUNDATIONS_PLAYER_CARDS)
    assert.ok(SCRIPTED.has(c.code), c.code);
});
test("Spirit Glorfindel raises threat only when actually exhausting to commit", () => {
  let s = game("spirit"),
    hero = s.heroes[0];
  hero.code = "04101";
  s.phase = "quest";
  const before = s.threat;
  s.committedIds = [hero.id];
  s = act(s, { type: "COMMIT" });
  assert.equal(s.threat, before + 1);
});
test("Light of Valinor prevents Glorfindel's actual exhaustion and its Forced threat", () => {
  let s = game("spirit"),
    hero = s.heroes[0];
  hero.code = "04101";
  hero.attachments.push({ id: "light", code: "04107", exhausted: false });
  s.phase = "quest";
  const before = s.threat;
  s.committedIds = [hero.id];
  s = act(s, { type: "COMMIT" });
  assert.equal(s.threat, before);
  assert.equal(s.heroes[0].exhausted, false);
});
test("Exhausting Glorfindel for another cost during quest does not trigger his commitment Forced", () => {
  const s = game("spirit"),
    hero = s.heroes[0];
  hero.code = "04101";
  s.phase = "quest";
  const before = s.threat;
  exhaustCharacter(s, hero);
  flush(s);
  assert.equal(s.threat, before);
});
test("Avalanche's actual exhaustion and commitment also trigger Glorfindel once", () => {
  let s = game("spirit"),
    hero = s.heroes[0];
  hero.code = "04101";
  s.phase = "staging";
  const before = s.threat;
  revealed(s, REDHORN.avalanche);
  flush(s);
  if (s.choice?.options.some((o) => o.id === "resolve"))
    s = choose(s, "resolve");
  assert.equal(s.threat, before + 1);
  assert.ok(s.heroes[0].committed);
});
test("Trollshaw Scout participates in an attack without exhausting and then discards a hand card", () => {
  let s = game("tactics"),
    scout = unit("04104"),
    enemy = unit("01082"),
    hand = unit("01020");
  s.allies.push(scout);
  s.hand.push(hand);
  s.engaged.push(enemy);
  s.phase = "attack";
  playerAttack(s, enemy, [scout.id]);
  flush(s);
  assert.equal(s.choice?.title, "Trollshaw Scout · After attacking");
  assert.equal(s.allies[0].exhausted, false);
  s = choose(s, hand.id);
  assert.ok(s.discard.includes("01020"));
  assert.equal(s.allies[0].code, "04104");
});
test("Trollshaw's empty-hand Forced discard is not a destruction", () => {
  const s = game("tactics"),
    scout = unit("04104"),
    enemy = unit("01082");
  s.allies.push(scout);
  s.engaged.push(enemy);
  s.heroes[0].attachments.push({ id: "horn", code: "01042", exhausted: false });
  const before = s.heroes[0].resources;
  s.phase = "attack";
  playerAttack(s, enemy, [scout.id]);
  flush(s);
  assert.ok(!s.allies.length);
  assert.ok(s.discard.includes("04104"));
  assert.equal(s.heroes[0].resources, before);
});
test("Trollshaw's ranged participation pays its own controller's hand", () => {
  let s = table(),
    scout = unit("04104", 2),
    enemy = unit("01082", 0),
    hand = unit("01020", 2);
  seatView(s, 2).allies.push(scout);
  seatView(s, 2).hand.push(hand);
  s.engaged.push(enemy);
  s.phase = "attack";
  playerAttack(s, enemy, [s.heroes[0].id, scout.id]);
  flush(s);
  assert.equal(s.table!.active, 2);
  s = choose(s, hand.id);
  assert.ok(seatView(s, 2).discard.includes("01020"));
  assert.equal(seatView(s, 0).discard.includes("01020"), false);
});
test("Heavy Stroke uses one Dwarf's legal share of combined attack damage", () => {
  let s = game("tactics"),
    gimli = s.heroes[0],
    legolas = s.heroes[1],
    enemy = unit("01082");
  gimli.tempAttack = 2;
  s.engaged.push(enemy);
  s.hand.push(unit("04105"));
  s.phase = "attack";
  playerAttack(s, enemy, [gimli.id, legolas.id]);
  flush(s);
  s = choose(s, "play");
  s = choose(s, gimli.id);
  assert.ok(!s.choice?.options.some((o) => o.id === "damage-5"));
  s = choose(s, "damage-4");
  assert.equal(s.engaged[0].damage, 8);
});
test("Heavy Stroke's supplemental card-effect kill does not grant Dwalin's attack-kill threat reduction", () => {
  let s = game("tactics"),
    dwalin = s.heroes[0],
    enemy = unit("01089");
  dwalin.code = "03001";
  s.engaged.push(enemy);
  s.hand.push(unit("04105"));
  s.phase = "attack";
  const before = s.threat;
  playerAttack(s, enemy, [dwalin.id]);
  flush(s);
  s = choose(s, "play");
  s = choose(s, dwalin.id);
  s = choose(s, "damage-2");
  assert.equal(s.engaged.length, 0);
  assert.equal(s.threat, before);
});
test("Heavy Stroke limits each physical event copy and is unavailable as a standalone action", () => {
  let s = game("tactics"),
    gimli = s.heroes[0],
    enemy = unit("01082");
  gimli.tempAttack = 2;
  s.engaged.push(enemy);
  const first = unit("04105"),
    second = unit("04105");
  s.hand.push(first, second);
  s.phase = "attack";
  playerAttack(s, enemy, [gimli.id]);
  flush(s);
  s = choose(s, "play");
  s = choose(s, gimli.id);
  s = choose(s, "damage-1");
  assert.equal(s.choice?.title, "Heavy Stroke · Dwarf combat damage");
  s = choose(s, "play");
  s = choose(s, gimli.id);
  s = choose(s, "damage-1");
  assert.equal(s.engaged[0].damage, 3);
  assert.ok(s.used.includes(`phase:heavy-stroke:${first.id}`));
  assert.ok(s.used.includes(`phase:heavy-stroke:${second.id}`));
  assert.ok(foundationsPlayerPlayProblem(s, "04105"));
  phaseEnd(s);
  assert.ok(!s.used.some((key) => key.startsWith("phase:heavy-stroke:")));
});
test("Háma returning the same physical Heavy Stroke preserves its already-used phase limit", () => {
  let s = game("tactics"),
    gimli = s.heroes[0],
    hama = s.heroes[2],
    enemy = unit("01082"),
    copy = unit("04105"),
    payment = unit("01020");
  hama.code = "04076";
  gimli.tempAttack = 2;
  s.engaged.push(enemy);
  s.hand.push(copy, payment);
  s.phase = "attack";
  playerAttack(s, enemy, [gimli.id]);
  flush(s);
  s = choose(s, "play");
  s = choose(s, gimli.id);
  s = choose(s, "damage-1");
  s.heroes[0].exhausted = false;
  playerAttack(s, s.engaged[0], [s.heroes[0].id, s.heroes[2].id]);
  flush(s);
  s = choose(s, `event-${s.discard.indexOf("04105")}`);
  assert.equal(s.hand.find((u) => u.code === "04105")?.id, copy.id);
  s = choose(s, payment.id);
  assert.notEqual(s.choice?.title, "Heavy Stroke · Dwarf combat damage");
  assert.equal(s.hand.find((u) => u.code === "04105")?.id, copy.id);
});
test("Heavy Stroke keeps its physical phase limit through Will of the West, Word of Command and another Hands Upon the Bow attack", () => {
  let s = game("tactics"),
    gimli = s.heroes[0],
    enemy = unit("01082"),
    staging = unit("01082"),
    copy = unit("04105"),
    gandalf = unit("01073");
  gimli.tempAttack = 2;
  gimli.attachments.push(
    { id: "heavy-ranged", code: "02097", exhausted: false },
    { id: "heavy-ready", code: "01057", exhausted: false },
    { id: "heavy-lore", code: "02034", exhausted: false },
    { id: "heavy-spirit", code: "02081", exhausted: false },
  );
  s.engaged.push(enemy);
  s.staging.push(staging);
  s.allies.push(gandalf);
  s.hand.push(copy);
  s.deck = ["01013", "01014"];
  s.phase = "attack";
  playerAttack(s, enemy, [gimli.id]);
  flush(s);
  s = choose(s, "play");
  s = choose(s, gimli.id);
  s = choose(s, "damage-1");
  s = play(s, "01049");
  assert.ok(s.deck.includes("04105"));
  assert.ok(!s.discard.includes("04105"));
  s = play(s, "04084", gandalf.id);
  s = choose(s, `card-${s.deck.indexOf("04105")}`);
  assert.equal(s.hand.find((u) => u.code === "04105")?.id, copy.id);
  s = act(s, { type: "ABILITY", id: gimli.id, attachmentId: "heavy-ready" });
  s = play(s, "04131", gimli.id);
  s = choose(s, staging.id);
  assert.equal(s.staging[0].damage, 2);
  assert.notEqual(s.choice?.title, "Heavy Stroke · Dwarf combat damage");
  assert.ok(s.hand.some((u) => u.code === "04105" && u.id === copy.id));
});
test("Imladris Stargazer orders another player's exact top five and preserves the tail", () => {
  let s = table(),
    stargazer = unit("04106");
  s.allies.push(stargazer);
  seatView(s, 2).deck.splice(
    0,
    seatView(s, 2).deck.length,
    "01013",
    "01014",
    "01015",
    "01016",
    "01073",
    "01020",
  );
  syncSeat(s);
  s = act(s, { type: "ABILITY", id: stargazer.id });
  s = choose(s, "player-2");
  assert.ok(!s.choice?.options.some((o) => o.code === "01020"));
  s = choose(s, "card-4");
  s = choose(s, "card-3");
  s = choose(s, "card-2");
  s = choose(s, "card-1");
  s = choose(s, "card-0");
  assert.deepEqual(seatView(s, 2).deck, [
    "01073",
    "01016",
    "01015",
    "01014",
    "01013",
    "01020",
  ]);
  assert.equal(seatView(s, 0).allies[0].exhausted, true);
});
test("Stargazer handles a short deck and duplicate printed identities", () => {
  let s = game("spirit"),
    stargazer = unit("04106");
  s.allies.push(stargazer);
  s.deck = ["01013", "01013", "01014"];
  s = act(s, { type: "ABILITY", id: stargazer.id });
  s = choose(s, "player-0");
  s = choose(s, "card-2");
  s = choose(s, "card-1");
  s = choose(s, "card-0");
  assert.deepEqual(s.deck, ["01014", "01013", "01013"]);
});
test("An exhausted Stargazer or no player deck disables its action", () => {
  const s = game("spirit"),
    stargazer = unit("04106");
  s.allies.push(stargazer);
  stargazer.exhausted = true;
  assert.ok(availableAbilities(s, stargazer)[0].disabled);
  stargazer.exhausted = false;
  s.deck = [];
  assert.ok(availableAbilities(s, stargazer)[0].disabled);
});
test("The shared Daeron's Runes handler draws two before discarding one", () => {
  let s = game("lore");
  s.deck = ["01013", "01014", "01015"];
  s = play(s, "04108");
  assert.equal(s.hand.length, 2);
  s = choose(s, s.hand[0].id);
  assert.equal(s.hand.length, 1);
  assert.ok(s.discard.includes("04108"));
});
test("Path of Need and Light of Valinor preserve their exact target rules", () => {
  const s = game("spirit"),
    hero = s.heroes[0],
    location = unit("01088");
  hero.code = "04101";
  s.staging.push(location);
  assert.ok(playTargets(s, unit("04107")).some((u) => u.id === hero.id));
  assert.ok(playTargets(s, unit("04103")).some((u) => u.id === location.id));
  hero.attachments.push({ id: "light", code: "04107", exhausted: false });
  assert.equal(stats(s, hero).will, card(hero.code).willpower!);
});
