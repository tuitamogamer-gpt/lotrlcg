import assert from "node:assert/strict";
import test from "node:test";
import {
  card,
  playerCards,
  encounterCards,
  SCRIPTED,
  DECK,
} from "../src/game/cards";
import { createGame, validateDeckList } from "../src/game/setup";
import {
  canPlay,
  playTargets,
  applyAction,
  validateSave,
} from "../src/game/engine";
import {
  make,
  stats,
  playCost,
  fx,
  get,
  locationQuest,
} from "../src/game/core";
import {
  charactersCommitted,
  check,
  damage,
  discardAttachment,
  discardCharacter,
  engage,
  enterAlly,
  phaseEnd,
  progressLocation,
  revealed,
} from "../src/game/board";
import { handle, flush } from "../src/game/effects";
import { playerAttack } from "../src/game/combat";
import {
  allHeroes,
  forOwner,
  ownerOf,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { threatElimination } from "../src/game/tharbad-support";
import {
  SHADOW_EAST_PLAYER as P,
  SHADOW_EAST_PLAYER_CARDS,
  shadowEastRing,
  shadowEastGollum,
  shadowEastPlayerStats,
  shadowEastPlayerAttackBonus,
  shadowEastPlayerPublicState,
} from "../src/game/shadow-east-player-support";
import * as E from "../src/game/shadow-east-player";
import {
  fixture,
  ring,
  fellowship,
  act,
  pick,
  hand,
  ally,
  attach,
  play,
  reload,
  settle,
} from "./shadow-east-player-fixtures";
import type { GameState } from "../src/game/types";
const response = (s: GameState) => {
  assert.ok(
    s.choice?.options.some((o) => o.id === "use"),
    s.choice?.title,
  );
  return pick(s, "use");
};
function runtime(s: GameState, kind: string, data = {}) {
  handle(s, fx(kind, data));
  flush(s);
  return s;
}
function uniqueCompany(s: GameState, n = 6) {
  const names = new Set(s.heroes.map((h) => card(h.code).name));
  const cards = playerCards.filter(
    (c) => c.type_code === "ally" && c.is_unique && !names.has(c.name),
  );
  for (const c of cards.slice(0, n)) s.allies.push(make(s, c.code));
}

test("Shadow East registers thirteen original player designs plus physical Stinker and Gollum reverse", () => {
  assert.equal(SHADOW_EAST_PLAYER_CARDS.length, 13);
  for (const c of SHADOW_EAST_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(playerCards.filter((p) => p.code === c.code).length, 1);
  }
  assert.equal(card(P.gollum).type_code, "enemy");
  assert.equal(card(P.gollum).health, 3);
  assert.match(card(P.stinker).shadow!, /Gollum is engaged with you/);
  assert.match(card(P.pursuit).text!, /When attached location/);
});
test("Fellowship does not count toward the fifty-card minimum", () => {
  const cards = { ...DECK, [P.fellowship]: 1 };
  const size = Object.values(DECK).reduce((a, b) => a + b, 0);
  assert.ok(size >= 50);
  assert.doesNotThrow(() => validateDeckList(cards));
  const tooSmall = { ...cards };
  let remove = size - 49;
  for (const code of Object.keys(DECK)) {
    const n = Math.min(remove, tooSmall[code]);
    tooSmall[code] -= n;
    remove -= n;
    if (!remove) break;
  }
  assert.throws(() => validateDeckList(tooSmall), /50/);
});
test("Fellowship forbids non-unique entry, flips at exactly nine and retains physical identity after reload", () => {
  const s = fixture();
  fellowship(s);
  const contract = s.shadowEastPlayers!.contracts[0];
  assert.throws(() => enterAlly(s, make(s, "01013")), /cannot enter/);
  uniqueCompany(s);
  check(s);
  assert.equal(contract.side, "B");
  assert.equal(stats(s, s.heroes[0]).will, (card(P.frodo).willpower ?? 0) + 1);
  const visitor = make(s, P.merry);
  assert.throws(() => enterAlly(s, visitor), /cannot enter/);
  const restored = reload(s);
  assert.equal(
    restored.shadowEastPlayers!.contracts[0].unit.id,
    contract.unit.id,
  );
});
test("Fellowship flips back after a companion leaves and its bonus ends", () => {
  const s = fixture();
  fellowship(s);
  uniqueCompany(s);
  check(s);
  discardCharacter(s, s.allies[0]);
  check(s);
  assert.equal(s.shadowEastPlayers!.contracts[0].side, "A");
  assert.equal(shadowEastPlayerStats(s, s.heroes[0]).will, 0);
});
test("contracts remain player-specific at a multiplayer table", () => {
  const s = fixture(2);
  fellowship(s, 0, "B");
  assert.equal(shadowEastPlayerStats(s, seatView(s, 0).heroes[0]).attack, 1);
  assert.equal(shadowEastPlayerStats(s, seatView(s, 1).heroes[0]).attack, 0);
  forOwner(s, 1, () => {
    const u = make(s, "01013");
    enterAlly(s, u);
    assert.ok(s.allies.some((a) => a.id === u.id));
  });
  reload(s);
});
test("One Ring setup removes its physical card before opening hands, attaches by choice and survives saved selection", () => {
  const deck = { ...DECK, [P.ring]: 1, [P.master]: 1 };
  let s = createGame(315, deck, [P.frodo, "01004", "01012"], "custom", {
    scenarioId: "mirkwood",
  });
  assert.match(s.choice!.title, /bearer/);
  assert.equal(s.hand.length, 0);
  s = pick(s, s.heroes[0].id);
  assert.ok(shadowEastRing(s));
  assert.equal(s.deck.includes(P.ring), false);
  assert.equal(
    s.hand.some((u) => u.code === P.ring),
    false,
  );
  s = settle(s);
  reload(s);
});
test("The One Ring reduces only its controller's elimination level and is immune to ordinary discard", () => {
  const s = fixture(2),
    host = ring(s, 1),
    a = host.attachments[0];
  forOwner(s, 0, () => assert.equal(threatElimination(s), 50));
  forOwner(s, 1, () => assert.equal(threatElimination(s), 45));
  discardAttachment(s, host, a);
  assert.equal(host.attachments.length, 1);
  assert.equal(s.status, "playing");
  discardCharacter(s, host);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /One Ring/);
});
test("a bearer eliminated at forty-five loses the game for all players", () => {
  const s = fixture(2);
  ring(s, 1);
  forOwner(s, 1, () => {
    s.threat = 45;
  });
  check(s);
  assert.equal(s.status, "lost");
});
test("Master cards require the controlling player's ready Ring", () => {
  const s = fixture(2);
  ring(s, 1);
  const power = hand(s, P.power);
  assert.match(canPlay(s, power)!, /Only the player/);
  forOwner(s, 1, () => {
    const own = hand(s, P.power);
    assert.equal(canPlay(s, own), null);
    shadowEastRing(s)!.attachment.exhausted = true;
    assert.match(canPlay(s, own)!, /ready/);
  });
});
test("Ring of Power pays exhaustion and threat, readies its bearer and grants a phase-only bonus", () => {
  let s = fixture();
  const host = ring(s);
  host.exhausted = true;
  const id = host.id,
    before = s.threat;
  const u = hand(s, P.power);
  s = play(s, u.id);
  assert.equal(get(s, id)!.exhausted, false);
  assert.equal(s.threat, before + 1);
  assert.ok(shadowEastRing(s)!.attachment.exhausted);
  assert.equal(shadowEastPlayerStats(s, get(s, id)!).attack, 1);
  reload(s);
  phaseEnd(s);
  assert.equal(shadowEastPlayerStats(s, get(s, id)!).attack, 0);
});
test("The Ruling Ring prevents only that enemy attacking its controller for the combat phase", () => {
  let s = fixture(2);
  ring(s);
  s.phase = "defense";
  const u = make(s, "01082");
  s.engaged.push(u);
  const event = hand(s, P.ruling);
  assert.ok(playTargets(s, event).some((t) => t.id === u.id));
  s = play(s, event.id, u.id);
  assert.ok(seatView(s, 0).used.includes(`phase:shadow-east:ruling:${u.id}`));
  assert.equal(
    seatView(s, 1).used.includes(`phase:shadow-east:ruling:${u.id}`),
    false,
  );
  reload(s);
});
test("The Master Ring cancels the entire card before Surge and preserves the original revealing player", () => {
  let s = fixture(2);
  ring(s, 1);
  forOwner(s, 1, () => hand(s, P.master));
  s.phase = "staging";
  s.encounterDeck = ["01099", "01099"];
  const before = seatView(s, 1).threat;
  revealed(s, "01115");
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === "east-master-1"));
  s = pick(s, "east-master-1");
  s = settle(s);
  assert.equal(seatView(s, 1).threat, before + 1);
  assert.equal(s.encounterDiscard.filter((c) => c === "01115").length, 1);
  assert.equal(s.staging.filter((u) => u.code === "01099").length, 1);
  assert.equal(
    s.encounterDeck.length,
    1,
    "canceled Surge does not reveal an extra card",
  );
  reload(s);
});
test("Merry snapshots unique allies at response resolution and later allies receive no bonus", () => {
  let s = fixture();
  const first = ally(s, "01073");
  const u = hand(s, P.merry);
  s = play(s, u.id);
  s = response(s);
  assert.equal(shadowEastPlayerStats(s, get(s, first.id)!).will, 1);
  const later = ally(s, P.pippin);
  assert.equal(shadowEastPlayerStats(s, later).will, 0);
  assert.equal(shadowEastPlayerStats(s, s.heroes[0]).will, 0);
  reload(s);
});
test("Frodo pays from his own pool and readies another player's unique committed character", () => {
  let s = fixture(2);
  const frodo = s.heroes[0],
    other = seatView(s, 1).heroes[0];
  frodo.committed = true;
  frodo.exhausted = true;
  other.committed = true;
  other.exhausted = true;
  s.phase = "quest";
  const before = frodo.resources,
    threat = s.threat;
  charactersCommitted(s, [frodo]);
  flush(s);
  s = response(s);
  s = pick(s, other.id);
  assert.equal(get(s, frodo.id)!.resources, before - 1);
  assert.equal(get(s, other.id)!.exhausted, false);
  s = runtime(s, "questSuccessResponses");
  assert.equal(seatView(s, 0).threat, threat - 1);
  reload(s);
});
test("Pippin readies after a high-engagement enemy enters engagement and gains attack only against such enemies", () => {
  let s = fixture();
  const p = ally(s, P.pippin);
  p.exhausted = true;
  s.threat = 20;
  const enemy = make(s, "01082");
  s.staging.push(enemy);
  engage(s, enemy);
  flush(s);
  s = response(s);
  assert.equal(get(s, p.id)!.exhausted, false);
  assert.equal(
    shadowEastPlayerAttackBonus(s, get(s, p.id)!, get(s, enemy.id)!),
    2,
  );
  s.threat = 40;
  assert.equal(
    shadowEastPlayerAttackBonus(s, get(s, p.id)!, get(s, enemy.id)!),
    0,
  );
  reload(s);
});
test("Faramir engages an attached enemy and deals four damage through the actual response", () => {
  let s = fixture();
  const enemy = make(s, "01082");
  enemy.attachments.push({
    id: `a${s.nextId++}`,
    code: "06064",
    exhausted: false,
    owner: 0,
  });
  s.staging.push(enemy);
  const f = hand(s, P.faramir);
  s = play(s, f.id);
  s = response(s);
  s = pick(s, enemy.id);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.id === enemy.id));
  assert.equal(get(s, enemy.id)!.damage, 4);
  reload(s);
});
test("The Gathering Storm searches only the top five and consumes its discount on the first ally play", () => {
  let s = fixture();
  s.encounterDeck = ["01099", "01082", "01099", "01099", "01099", "01097"];
  const e = hand(s, P.gathering);
  s = play(s, e.id);
  assert.deepEqual(
    s.choice!.options.filter((o) => o.id !== "skip").map((o) => o.code),
    ["01082"],
  );
  s = pick(s, "1");
  assert.ok(s.staging.some((u) => u.code === "01082"));
  const original = Number(card("01013").cost);
  assert.equal(
    playCost(s, card("01013")),
    Math.max(0, original - card("01082").threat!),
  );
  const allyCard = hand(s, "01013");
  s = play(s, allyCard.id);
  assert.equal(playCost(s, card("01013")), original);
  reload(s);
});
test("Put Off Pursuit adds two quest points and finds a location before shuffling a nonunique enemy", () => {
  let s = fixture();
  const location = make(s, "01099"),
    enemy = make(s, "01082");
  s.activeLocation = location;
  s.staging.push(enemy);
  const e = hand(s, P.pursuit);
  s = play(s, e.id, location.id);
  assert.equal(
    locationQuest(s, get(s, location.id)!),
    card(location.code).quest! + 2,
  );
  s.encounterDeck = ["01115", "01099"];
  progressLocation(s, get(s, location.id)!, 20);
  flush(s);
  s = response(s);
  s = pick(s, enemy.id);
  s = settle(s);
  assert.equal(
    s.staging.some((u) => u.id === enemy.id),
    false,
  );
  assert.ok(s.staging.some((u) => u.code === "01099"));
  assert.ok(s.encounterDeck.includes("01082"));
  reload(s);
});
test("Sméagol transforms with the same physical identity, loses tokens, and Gollum returns exhausted when defeated", () => {
  let s = fixture(2);
  const hero = make(s, P.smeagol);
  hero.owner = 1;
  hero.damage = 1;
  hero.resources = 3;
  seatView(s, 1).heroes.push(hero);
  s.shadowEastPlayers = {
    contracts: [],
    pendingRings: [],
    smeagol: { id: hero.id, owner: 1, stinkersAdded: true },
  };
  E.shadowEastPlayerEncounter(s, P.stinker);
  flush(s);
  s = settle(s);
  const g = shadowEastGollum(s)!;
  assert.equal(g.id, hero.id);
  assert.equal(g.damage, 0);
  assert.equal(g.resources, 0);
  assert.equal(ownerOf(s, g), 0);
  assert.equal(
    seatView(s, 1).heroes.some((u) => u.id === hero.id),
    false,
  );
  reload(s);
  damage(s, g.id, 3, { combatDamage: true });
  flush(s);
  s = settle(s);
  const returned = seatView(s, 1).heroes.find((u) => u.id === hero.id)!;
  assert.equal(returned.code, P.smeagol);
  assert.equal(returned.exhausted, true);
  assert.equal(returned.damage, 0);
  assert.equal(s.encounterDiscard.includes(P.gollum), false);
  reload(s);
});
test("Stinker's shadow uses Gollum's engaged player and shuffles that physical shadow exactly once", () => {
  const s = fixture();
  const enemy = make(s, "01082"),
    gollum = make(s, P.gollum);
  s.engaged.push(enemy, gollum);
  enemy.shadows = [P.stinker, "01099"];
  enemy.revealedShadowCount = 1;
  s.combat = {
    enemyId: enemy.id,
    defenderIds: [],
    shadowIndex: 0,
    attackPlayer: 0,
  } as GameState["combat"];
  const before = s.threat;
  E.shadowEastPlayerShadow(s, P.stinker);
  assert.equal(s.threat, before + 4);
  assert.deepEqual(enemy.shadows, ["01099"]);
  assert.equal(s.encounterDeck.filter((c) => c === P.stinker).length, 1);
  s.combat = null;
  reload(s);
});
test("save validation rejects malformed contract state and public setup state contains no hidden deck identities", () => {
  const s = fixture();
  fellowship(s);
  ring(s);
  reload(s);
  const bad = structuredClone(s);
  bad.shadowEastPlayers!.contracts[0].side = "C" as "A";
  assert.equal(validateSave(bad), false);
  const publicState = JSON.stringify(shadowEastPlayerPublicState(s));
  assert.equal(publicState.includes("deck"), false);
});

test("Derufin's actual ranged kill lets him discard to reduce the engaged player's printed-threat amount", () => {
  let s = fixture(2);
  s.phase = "attack";
  const d = ally(s, P.derufin);
  d.tempAttack = 10;
  const u = make(s, "01082");
  u.owner = 1;
  seatView(s, 1).engaged.push(u);
  const before = seatView(s, 1).threat;
  playerAttack(s, u, [d.id]);
  flush(s);
  s = response(s);
  s = settle(s);
  assert.equal(get(s, d.id), undefined);
  assert.ok(seatView(s, 0).discard.includes(P.derufin));
  assert.equal(seatView(s, 1).threat, before - card(u.code).threat!);
  reload(s);
});
test("Sméagol's actual travel response pays threat for one card and survives the saved response", () => {
  let s = fixture();
  const h = make(s, P.smeagol);
  s.heroes.push(h);
  const location = make(s, "01099");
  s.staging.push(location);
  s.phase = "travel";
  const threat = s.threat,
    handCount = s.hand.length;
  s = act(s, { type: "TRAVEL", id: location.id });
  s = response(s);
  assert.equal(s.threat, threat + 1);
  assert.equal(s.hand.length, handCount + 1);
  reload(s);
});
test("One Ring's searched Master is outside the six-card mulligan and keeps its physical identity", () => {
  let s = createGame(
    318,
    { ...DECK, [P.ring]: 1, [P.master]: 1 },
    [P.frodo, "01004", "01012"],
    "custom",
    { scenarioId: "mirkwood" },
  );
  s = pick(s, s.heroes[0].id);
  const search = s.choice!.options.find((o) => o.code === P.master)!;
  s = pick(s, search.id);
  assert.equal(s.hand.length, 7);
  const id = s.hand.find((u) => u.code === P.master)!.id;
  assert.deepEqual(s.shadowEastPlayers!.setupHandIds?.[0], [id]);
  s = act(s, { type: "MULLIGAN" });
  assert.equal(s.hand.length, 7);
  assert.ok(s.hand.some((u) => u.id === id));
  reload(s);
});
test("two Ring copies use a first-player controller choice and remove only the unchosen physical copy", () => {
  const deck = { ...DECK, [P.ring]: 1, [P.master]: 1 };
  let s = createGame(319, deck, [P.frodo, "01004", "01012"], "custom", {
    scenarioId: "mirkwood",
    seats: [
      { deckId: "custom", cards: deck, heroes: [P.frodo, "01004", "01012"] },
      { deckId: "custom", cards: deck, heroes: ["01001", "01002", "01003"] },
    ],
  });
  assert.match(s.choice!.title, /controller/);
  s = pick(s, "1");
  assert.equal(s.table!.active, 1);
  s = pick(s, seatView(s, 1).heroes[0].id);
  s = pick(s, "skip");
  assert.equal(shadowEastRing(s)!.player, 1);
  assert.equal(seatView(s, 0).removed.filter((c) => c === P.ring).length, 1);
  assert.equal(seatView(s, 1).removed.includes(P.ring), false);
  reload(s);
});
test("Sméagol setup adds exactly two Stinkers after the encounter recipe is initialized", () => {
  let s = createGame(320, DECK, [P.smeagol, "01004", "01012"], "custom", {
    scenarioId: "mirkwood",
  });
  assert.equal(s.encounterDeck.filter((c) => c === P.stinker).length, 2);
  reload(s);
  assert.throws(
    () =>
      createGame(320, DECK, [P.smeagol, "01004", "01012"], "custom", {
        scenarioId: "hunt-for-gollum",
      }),
    /Sméagol/,
  );
});
test("the last Sméagol flipping to Gollum does not eliminate his owner", () => {
  const s = fixture(),
    h = make(s, P.smeagol);
  s.heroes = [h];
  s.startingHeroes = [P.smeagol];
  s.shadowEastPlayers = {
    contracts: [],
    pendingRings: [],
    smeagol: { id: h.id, owner: 0, stinkersAdded: true },
  };
  E.shadowEastPlayerEncounter(s, P.stinker);
  check(s);
  assert.equal(s.status, "playing");
  assert.ok(shadowEastGollum(s));
  reload(s);
});
test("Gollum ignores non-Gollum card damage but ordinary combat damage can defeat him", () => {
  const s = fixture(),
    h = make(s, P.smeagol);
  s.heroes.push(h);
  s.shadowEastPlayers = {
    contracts: [],
    pendingRings: [],
    smeagol: { id: h.id, owner: 0, stinkersAdded: true },
  };
  E.shadowEastPlayerEncounter(s, P.stinker);
  const g = shadowEastGollum(s)!;
  damage(s, g.id, 2);
  assert.equal(g.damage, 0);
  damage(s, g.id, 2, { combatDamage: true });
  assert.equal(g.damage, 2);
  reload(s);
});
test("whole-card Master Ring cancellation accepts encounter side quests but never an explicit uncancelable card", () => {
  const s = fixture();
  ring(s);
  hand(s, P.master);
  const candidates = encounterCards.filter(
    (c) => c.type_code === "encounter-side-quest",
  );
  assert.ok(candidates.length);
  const resume = fx("revealCard", {
    code: candidates[0].code,
    player: 0,
    revealOrigin: "encounter",
  });
  assert.equal(
    E.shadowEastPlayerRevealOptions(s, candidates[0].code, resume).length,
    1,
  );
  const sacked = encounterCards.find((c) => c.name === "Sacked!")!;
  assert.ok(sacked);
  assert.equal(
    E.shadowEastPlayerRevealOptions(
      s,
      sacked.code,
      fx("revealCard", { code: sacked.code }),
    ).length,
    0,
  );
});

test("Gollum is removed when his original owner is eliminated even while engaged with another player", () => {
  const s = fixture(2),
    h = make(s, P.smeagol);
  h.owner = 1;
  seatView(s, 1).heroes.push(h);
  s.shadowEastPlayers = {
    contracts: [],
    pendingRings: [],
    smeagol: { id: h.id, owner: 1, stinkersAdded: true },
  };
  E.shadowEastPlayerEncounter(s, P.stinker);
  flush(s);
  const gollum = shadowEastGollum(s)!;
  assert.equal(ownerOf(s, gollum), 0);
  gollum.shadows = ["01099"];
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  check(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(shadowEastGollum(s), undefined);
  assert.ok(seatView(s, 1).removed.includes(P.smeagol));
  assert.ok(s.encounterDiscard.includes("01099"));
  assert.equal(s.status, "playing");
  reload(s);
});
test("the Ring's public controller and elimination limit follow an actual change of its bearer's control", () => {
  const s = fixture(2),
    h = ring(s, 0);
  forOwner(s, 0, () => {
    s.heroes = s.heroes.filter((u) => u.id !== h.id);
  });
  forOwner(s, 1, () => {
    s.heroes.push(h);
  });
  check(s);
  assert.equal(shadowEastRing(s)!.player, 1);
  assert.equal(s.shadowEastPlayers!.ring!.player, 1);
  forOwner(s, 0, () => assert.equal(threatElimination(s), 50));
  forOwner(s, 1, () => assert.equal(threatElimination(s), 45));
  reload(s);
});

test("Master Ring option discovery never changes the revealing actor, including an eliminated seat", () => {
  const s = fixture(2);
  ring(s);
  hand(s, P.master);
  s.table!.seats[1].eliminated = true;
  selectSeat(s, 1);
  const before = s.table!.active;
  const options = E.shadowEastPlayerRevealOptions(
    s,
    "01099",
    fx("revealCard", { code: "01099", player: 1 }),
  );
  assert.equal(options.length, 1);
  assert.equal(s.table!.active, before);
  assert.equal(options[0].effects[0].effects![0].player, 1);
});
test("Sméagol discards attachments immediately when his cannot-have-attachments text becomes active again", () => {
  const s = fixture(),
    h = make(s, P.smeagol);
  s.heroes.push(h);
  h.blanked = true;
  const attachment = {
    id: `a${s.nextId++}`,
    code: "01026",
    owner: 0,
    exhausted: false,
  };
  h.attachments.push(attachment);
  E.shadowEastPlayerCheck(s);
  assert.equal(h.attachments.length, 1);
  delete h.blanked;
  E.shadowEastPlayerCheck(s);
  assert.equal(h.attachments.length, 0);
  assert.ok(s.discard.includes("01026"));
  reload(s);
});
