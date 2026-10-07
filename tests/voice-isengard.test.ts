import { eventReplayPayments } from "../src/game/actions.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  availableAbilities,
  playTargets,
  publicState,
  canPlay,
} from "../src/game/engine.ts";
import { card, SCRIPTED } from "../src/game/cards.ts";
import {
  make,
  playCost,
  fx,
  stats,
  removeShadowCard,
} from "../src/game/core.ts";
import {
  check,
  discardCharacter,
  enterAlly,
  raiseThreat,
  revealed,
  spendEvent,
} from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { prepareEnemyShadows } from "../src/game/considered-engagement.ts";
import { playerAttack } from "../src/game/combat.ts";
import {
  allCharacters,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table.ts";
import {
  resolveDoomed,
  faceupShadowCards,
} from "../src/game/voice-isengard.ts";
import { MORGUL_VALE as M } from "../src/game/morgul-vale-support.ts";
import { base, choose, reload } from "./against-shadow-final-fixtures.ts";
const fixture = (players = 1) => base("mirkwood", players);
test("Grima's Doomed resolves before a legacy ally entry response can rescue the player", () => {
  let s = fixture();
  s.heroes[s.heroes.length - 1] = make(s, "07002");
  s.hand = [make(s, "01073")];
  s.threat = 49;
  s = applyAction(s, { type: "ABILITY", id: s.heroes.at(-1)!.id });
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  assert.equal(s.status, "lost");
  assert.equal(s.choice, null);
  s = fixture();
  s.heroes[s.heroes.length - 1] = make(s, "07002");
  s.hand = [make(s, "01016")];
  s.allies = [make(s, "07005")];
  s.staging = [make(s, "01099")];
  s = applyAction(s, { type: "ABILITY", id: s.heroes.at(-1)!.id });
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  assert.equal(s.threat, 21);
  assert.match(s.choice!.title, /Messenger/);
  s = reload(s);
  s = choose(s, "use");
  assert.equal(s.choice!.title, "Snowbourn Scout");
});
test("Every Voice of Isengard player design is registered with its printed identity", () => {
  for (let i = 1; i <= 15; i++) {
    const code = `07${String(i).padStart(3, "0")}`;
    assert.ok(SCRIPTED.has(code));
    assert.equal(card(code).pack_name, "The Voice of Isengard");
  }
});
test("Grima discounts the next hand play, adds Doomed and cannot activate twice", () => {
  let s = fixture();
  s.heroes = [make(s, "07002")];
  s.heroes[0].resources = 2;
  s.hand = [make(s, "07005")];
  const g = s.heroes[0];
  s = applyAction(s, { type: "ABILITY", id: g.id });
  assert.equal(playCost(s, card("07005")), 1);
  s = reload(s);
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  assert.equal(s.heroes[0].resources, 1);
  assert.equal(s.threat, 21);
  assert.equal(playCost(s, card("07005")), 2);
  assert.ok(s.choice?.title.includes("Messenger"));
  s = choose(s, "use");
  assert.equal(stats(s, s.allies[0]).will, 2);
  assert.ok(availableAbilities(s, s.heroes[0])[0].disabled);
});
test("Grima does not discount a physical discard replay even with an identical event in hand", () => {
  let s = fixture();
  s.heroes = [make(s, "07002")];
  s.heroes[0].resources = 3;
  s.hand = [make(s, "01064")];
  s.discard = ["01064"];
  s = applyAction(s, { type: "ABILITY", id: s.heroes[0].id });
  const replay = make(s, "01064");
  assert.ok(
    eventReplayPayments(s, replay).every(
      (p) => Object.values(p).reduce((a, b) => a + b, 0) === 3,
    ),
  );
  assert.equal(playCost(s, card("01064")), 2);
});
test("Doomed on a free event affects every player before its resource gain", () => {
  let s = fixture(2);
  s.hand = [make(s, "07011")];
  const before = playerOrder(s).map((p) =>
    seatView(s, p).heroes.map((h) => h.resources),
  );
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).threat, 24);
    assert.deepEqual(
      seatView(s, p).heroes.map((h) => h.resources),
      before[p].map((n) => n + 1),
    );
  }
  assert.ok(s.discard.includes("07011"));
});
test("Deep Knowledge draws two for every player and obeys Enchanted Stream", () => {
  let s = fixture(2);
  s.heroes = [make(s, "07002")];
  s.hand = [make(s, "07012")];
  const other = seatView(s, 1).hand.length;
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  assert.equal(s.hand.length, 2);
  assert.equal(seatView(s, 1).hand.length, other + 2);
  s = fixture();
  s.heroes = [make(s, "07002")];
  s.activeLocation = make(s, "01095");
  s.hand = [make(s, "07012")];
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  assert.equal(s.hand.length, 0);
  assert.equal(s.threat, 22);
});
test("Doomed has separate optional Guard, Messenger and Keys responses with round limits", () => {
  let s = fixture();
  const guard = make(s, "07004"),
    messenger = make(s, "07005");
  guard.exhausted = true;
  s.allies = [guard, messenger];
  s.heroes[0].attachments = [{ id: "keys", code: "07010", exhausted: false }];
  const before = s.heroes[0].resources;
  resolveDoomed(s, 1, "player-card");
  flush(s);
  while (s.choice) s = choose(s, "use");
  assert.equal(s.allies[0].exhausted, false);
  assert.equal(stats(s, s.allies[1]).will, 2);
  assert.equal(s.heroes[0].resources, before + 1);
  resolveDoomed(s, 2, "encounter");
  flush(s);
  s = choose(s, "use");
  assert.equal(stats(s, s.allies[1]).will, 3);
  resolveDoomed(s, 1, "encounter");
  flush(s);
  assert.equal(s.choice, null);
  s.queue = [fx("phaseEnd")];
  flush(s);
  assert.equal(stats(s, s.allies[1]).will, 3);
  s.queue = [fx("nextRound")];
  flush(s);
  assert.equal(stats(s, s.allies[1]).will, 1);
});
test("Ordinary threat increases do not activate Doomed responses", () => {
  const s = fixture();
  s.allies = [make(s, "07005")];
  raiseThreat(s, 2, "encounter");
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(stats(s, s.allies[0]).will, 1);
});
test("Keys adds resources to the attached hero under another controller", () => {
  let s = fixture(2);
  const h = seatView(s, 1).heroes[0];
  h.attachments = [{ id: "keys", code: "07010", owner: 0, exhausted: false }];
  const before = h.resources;
  resolveDoomed(s, 1, "player-card");
  flush(s);
  s = reload(s);
  s = choose(s, "use");
  assert.equal(seatView(s, 1).heroes[0].resources, before + 1);
});
test("Saruman played normally has Doomed 3 and an optional physical out-of-play target", () => {
  let s = fixture();
  s.hand = [make(s, "07003")];
  const enemy = make(s, "01096"),
    objective = make(s, "01108");
  enemy.guarding = objective.id;
  s.staging = [enemy, objective];
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  assert.equal(s.threat, 23);
  s = choose(s, enemy.id);
  assert.equal(s.staging.length, 0);
  assert.equal(s.isengard!.outOfPlay[0].cards.length, 2);
  s = reload(s);
  const source = s.allies[0];
  discardCharacter(s, source);
  flush(s);
  assert.deepEqual(
    s.staging.map((u) => u.id),
    [enemy.id, objective.id],
  );
});
test("Putting Saruman into play still resolves Doomed before his response and preserves Grima's discount", () => {
  let s = fixture();
  s.heroes = [make(s, "07002")];
  s = applyAction(s, { type: "ABILITY", id: s.heroes[0].id });
  s.staging = [make(s, "01096")];
  enterAlly(s, make(s, "07003"), false, false, false);
  flush(s);
  assert.equal(s.threat, 23);
  assert.ok(s.choice?.title.includes("Saruman"));
  assert.equal(playCost(s, card("07005")), 1);
});
test("Saruman leaves at round end, restoring cards without When Revealed or entry effects", () => {
  let s = fixture();
  s.hand = [make(s, "07003")];
  const location = make(s, "01099");
  s.staging = [location];
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  s = choose(s, location.id);
  s.queue = [fx("endRound")];
  flush(s);
  assert.ok(!s.allies.some((u) => u.code === "07003"));
  assert.equal(s.staging[0].id, location.id);
  assert.equal(s.isengard!.outOfPlay.length, 0);
});
test("Saruman cannot target unique or immune cards", () => {
  const s = fixture();
  s.staging = [make(s, "octgn:a305f78f-0d26-4a56-9d5b-7fb0210e6bd4")];
  enterAlly(s, make(s, "07003"));
  flush(s);
  assert.equal(s.choice, null);
});
test("The Wizard's Voice gives a real per-player choice and prevents only that player's attack", () => {
  let s = fixture(2);
  s.heroes = [make(s, "01005")];
  s.hand = [make(s, "07013")];
  forOwner(s, 0, () => s.engaged.push(make(s, "01096")));
  forOwner(s, 1, () => s.engaged.push(make(s, "01091")));
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  const first = s.choice!.options[0].id;
  s = choose(s, first);
  s = reload(s);
  s = choose(s, s.choice!.options[0].id);
  assert.deepEqual(seatView(s, 0).engaged[0].preventedAttacks, [0]);
  assert.deepEqual(seatView(s, 1).engaged[0].preventedAttacks, [1]);
});
test("Power of Orthanc can remove another player's Condition and deck Shackles", () => {
  let s = fixture(2);
  s.heroes = [make(s, "01007")];
  s.hand = [make(s, "07014")];
  seatView(s, 1).heroes[0].attachments = [
    { id: "web", code: "01080", exhausted: false },
  ];
  s.shackles = 1;
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  s = choose(s, "web");
  s = choose(s, "shackles-0");
  assert.equal(seatView(s, 1).heroes[0].attachments.length, 0);
  assert.equal(seatView(s, 0).shackles, 0);
});
test("Seeing-stone searches actual Doomed cards, keeps its own event out of search and shuffles", () => {
  let s = fixture();
  s.hand = [make(s, "07015")];
  s.deck = ["01013", "07012", "07003"];
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code).map((o) => o.code),
    ["07012", "07003"],
  );
  s = reload(s);
  s = choose(s, "deck-1");
  assert.ok(s.hand.some((u) => u.code === "07012"));
  assert.ok(s.discard.includes("07015"));
  assert.equal(s.deck.length, 2);
});
test("Warhorse attachment accepts Tactics OR Rohan heroes and readies after a kill", () => {
  let s = fixture();
  s.heroes = [make(s, "01005"), make(s, "01007"), make(s, "01001")];
  const horse = make(s, "07008");
  assert.deepEqual(
    playTargets(s, horse).map((u) => u.code),
    ["01005", "01007"],
  );
  s.heroes[0].attachments = [{ id: "horse", code: "07008", exhausted: false }];
  s.phase = "attack";
  const e = make(s, "01089");
  s.engaged = [e];
  playerAttack(s, e, [s.heroes[0].id]);
  flush(s);
  while (s.choice && !s.choice.title.includes("Warhorse"))
    s = choose(s, s.choice.options[0].id);
  assert.ok(s.choice?.title.includes("Warhorse"));
  s = choose(s, "use");
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.heroes[0].attachments[0].exhausted, true);
});
test("Silver Lamp deals faceup shadows, preserves visibility after exhaustion and never resolves them early", () => {
  let s = fixture();
  s.heroes[0].attachments = [{ id: "lamp", code: "07009", exhausted: false }];
  const e = make(s, "01096");
  s.engaged = [e];
  s.encounterDeck = ["01076"];
  prepareEnemyShadows(s, e);
  assert.deepEqual(
    faceupShadowCards(e).map((c) => c.code),
    ["01076"],
  );
  assert.equal(e.revealedShadowCount, 0);
  assert.equal(s.combat, null);
  s.heroes[0].exhausted = true;
  s = reload(s);
  assert.deepEqual(
    faceupShadowCards(s.engaged[0]).map((c) => c.code),
    ["01076"],
  );
  assert.ok(JSON.stringify(publicState(s)).includes('"faceupShadowCards"'));
});
test("Silver Lamp does not expose shadows dealt while its hero was exhausted", () => {
  const s = fixture();
  s.heroes[0].exhausted = true;
  s.heroes[0].attachments = [{ id: "lamp", code: "07009", exhausted: false }];
  const e = make(s, "01096");
  s.engaged = [e];
  s.encounterDeck = ["01076"];
  prepareEnemyShadows(s, e);
  s.heroes[0].exhausted = false;
  assert.equal(faceupShadowCards(e).length, 0);
  assert.ok(!JSON.stringify(publicState(s)).includes("Ungoliant’s Spawn"));
});
test("Removing a shadow keeps visibility attached to its remaining physical copy", () => {
  const s = fixture();
  s.heroes[0].attachments = [{ id: "lamp", code: "07009", exhausted: false }];
  const e = make(s, "01096");
  s.engaged = [e];
  e.shadows = ["01099"];
  s.encounterDeck = ["01076"];
  prepareEnemyShadows(s, e);
  assert.deepEqual(e.faceupShadows, [false, true]);
  removeShadowCard(e, 0);
  assert.deepEqual(e.faceupShadows, [true]);
  reload(s);
});
test("Grima's discount is consumed by a response event as well as ordinary plays", () => {
  let s = fixture();
  s.heroes = [make(s, "07002"), make(s, "01007")];
  s.hand = [make(s, "01050")];
  s = applyAction(s, { type: "ABILITY", id: s.heroes[0].id });
  spendEvent(s, "01050");
  flush(s);
  assert.equal(playCost(s, card("01050")), 1);
  assert.equal(s.threat, 21);
});
test("Encounter Doomed responses resolve before the card's When Revealed choice", () => {
  let s = fixture();
  s.allies = [make(s, "07005")];
  revealed(s, M.malice);
  flush(s);
  assert.equal(s.threat, 22);
  assert.match(s.choice!.title, /Messenger/);
  s = reload(s);
  s = choose(s, "use");
  assert.match(s.choice!.title, /Sleepless Malice/);
  assert.equal(stats(s, s.allies[0]).will, 2);
});
