import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canPlay,
  createGame,
  playTargets,
  validateSave,
} from "../src/game/engine";
import { card, playerCards, SCRIPTED, STARTERS } from "../src/game/cards";
import { fx, get, make, stats } from "../src/game/core";
import {
  charactersCommitted,
  enterAlly,
  nextRound,
  progressLocation,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  activeSeat,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { deckProblems } from "../src/game/decks";
import { resolveEventAbility } from "../src/game/event-resolution";
import {
  ASH_PLAYER as P,
  ashPlayerResourceDraw,
  councilDeckProblems,
  councilPublic,
} from "../src/game/ash-mountains-player";
import {
  fixture,
  act,
  hand,
  ally,
  attach,
  play,
  pick,
  reload,
  settle,
  ring,
} from "./shadow-east-player-fixtures";
import type { GameState } from "../src/game/types";
import { council, COUNCIL_DECK } from "./ash-mountains-player-fixtures";
test("Council deck validation rejects duplicate titles across printings and permits a legal singleton deck", () => {
  assert.deepEqual(councilDeckProblems(COUNCIL_DECK), []);
  assert.ok(
    councilDeckProblems({ ...COUNCIL_DECK, "01013": 2 }).some((x) =>
      /one card titled/.test(x),
    ),
  );
  assert.deepEqual(
    deckProblems({
      id: "custom-council",
      name: "Council",
      heroes: STARTERS[0].heroes,
      cards: COUNCIL_DECK,
    }),
    [],
  );
});
for (const players of [1, 2, 3, 4])
  test(`Council native ${players}-seat setup removes one physical contract per player before the opening hand`, () => {
    const starter = STARTERS[0];
    let s = createGame(81, COUNCIL_DECK, starter.heroes, "custom-council", {
      scenarioId: "mirkwood",
      seats: STARTERS.slice(0, players).map((d) => ({
        deckId: "custom-council",
        heroes: d.heroes,
        cards: COUNCIL_DECK,
      })),
    });
    assert.equal(s.ashPlayers!.contracts.length, players);
    for (const p of playerOrder(s)) {
      assert.equal(seatView(s, p).deck.length, 44);
      assert.equal(seatView(s, p).hand.length, 6);
      assert.ok(!seatView(s, p).deck.includes(P.council));
      assert.ok(!seatView(s, p).hand.some((u) => u.code === P.council));
    }
    reload(s);
  });
test("Wandering Exile readies after commitment only after its controller discards a legal hand card", () => {
  let s = fixture();
  const u = ally(s, P.exile),
    c = hand(s, "01013");
  u.exhausted = true;
  u.committed = true;
  s.committedIds = [u.id];
  charactersCommitted(s, [u]);
  flush(s);
  assert.match(s.choice!.title, /Wandering Exile/);
  s = pick(s, c.id);
  assert.equal(get(s, u.id)!.exhausted, false);
  assert.equal(get(s, u.id)!.committed, true);
  assert.ok(s.discard.includes(c.code));
  reload(s);
});
test("Northern Bowmaster restricts playing from hand but allows putting into play", () => {
  const s = fixture(),
    u = hand(s, P.bowmaster);
  assert.match(canPlay(s, u)!, /engaged/);
  s.engaged.push(make(s, "01082"));
  assert.equal(canPlay(s, u), null);
  s.engaged = [];
  s.hand = s.hand.filter((c) => c.id !== u.id);
  enterAlly(s, u, false, false, false);
  assert.ok(s.allies.some((c) => c.id === u.id));
  reload(s);
});
test("Stone is Restricted, gives its attached hero willpower, and draws for the attachment controller", () => {
  const s = fixture(2),
    h = seatView(s, 1).heroes[0],
    before = stats(s, h).will;
  const a = attach(s, h, P.stone);
  a.owner = 0;
  a.controller = 0;
  assert.equal(stats(s, h).will, before + 2);
  assert.equal(ashPlayerResourceDraw(s, 1), 1);
  assert.equal(ashPlayerResourceDraw(s, 0), 0);
  a.facedown = true;
  assert.equal(ashPlayerResourceDraw(s, 1), 0);
  assert.equal(stats(s, h).will, before);
  reload(s);
});
test("Stone uses Guarded (location), retains its physical identity, and becomes available only after exploring the guard", () => {
  let s = fixture();
  const stone = hand(s, P.stone),
    hero = s.heroes[0];
  s.encounterDeck = ["01082", "01100"];
  s = play(s, stone.id);
  s = settle(s);
  const guard = s.staging.find((u) => u.code === "01100")!;
  assert.ok(guard);
  assert.ok(!hero.attachments.some((a) => a.code === P.stone));
  assert.ok(
    guard.attachments.some((a) => a.id === stone.id && a.code === P.stone),
  );
  progressLocation(s, guard, 20);
  flush(s);
  assert.match(s.choice!.title, /Stone|guarded|Guarded/i);
  s = pick(s, hero.id);
  s = settle(s);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.id === stone.id));
  reload(s);
});
test("Well Preserved targets only the Ring-bearer, adds one hit point, and pays Ring exhaustion and threat before healing at round begin", () => {
  let s = fixture(),
    h = ring(s),
    before = stats(s, h).health;
  const a = hand(s, P.preserved);
  assert.deepEqual(
    playTargets(s, a).map((u) => u.id),
    [h.id],
  );
  s = play(s, a.id, h.id);
  s = settle(s);
  h = get(s, h.id)!;
  assert.equal(stats(s, h).health, before + 1);
  h.damage = 2;
  const threat = s.threat,
    res = h.resources;
  nextRound(s);
  flush(s);
  assert.match(s.choice!.title, /Well Preserved/);
  assert.equal(get(s, h.id)!.resources, res);
  s = pick(s, "heal");
  s = settle(s);
  h = get(s, h.id)!;
  assert.equal(h.damage, 0);
  assert.equal(s.threat, threat + 1);
  assert.equal(h.attachments.find((a) => a.code === "21001")!.exhausted, true);
  assert.equal(h.resources, res + 1);
  reload(s);
});
test("Well Preserved cannot heal through immunity or an exhausted Ring and respects its limit of one", () => {
  let s = fixture(),
    h = ring(s);
  attach(s, h, P.preserved);
  h.damage = 2;
  h.attachments.find((a) => a.code === "21001")!.exhausted = true;
  const another = hand(s, P.preserved);
  assert.deepEqual(playTargets(s, another), []);
  nextRound(s);
  flush(s);
  assert.ok(!s.choice?.title.includes("Well Preserved"));
  assert.equal(get(s, h.id)!.damage, 2);
  reload(s);
});
test("Reckless Attack applies Doomed 2 to all players and each chooses only their engaged eligible enemy", () => {
  let s = fixture(2);
  const ids: string[] = [];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const u = make(s, "01082");
      ids.push(u.id);
      s.engaged.push(u);
    });
  const threats = playerOrder(s).map((p) => seatView(s, p).threat),
    e = hand(s, P.reckless);
  s = play(s, e.id);
  assert.equal(activeSeat(s), 0);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [ids[0]],
  );
  s = pick(s, ids[0]);
  assert.equal(activeSeat(s), 1);
  s = pick(s, ids[1]);
  s = settle(s);
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).threat, threats[p] + 2);
    assert.equal(get(s, ids[p])!.damage, 2);
  }
  reload(s);
});
test("Defiant Challenge offers each player an optional ready of their own character", () => {
  let s = fixture(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => (s.heroes[0].exhausted = true));
  const first = s.heroes[0].id,
    other = seatView(s, 1).heroes[0].id;
  s = play(s, hand(s, P.defiant).id);
  s = pick(s, first);
  s = pick(s, "skip");
  s = settle(s);
  assert.equal(get(s, first)!.exhausted, false);
  assert.equal(get(s, other)!.exhausted, true);
  reload(s);
});
test("Odo searches only the top five for Hobbit allies, retains the selected identity, and shuffles the rest", () => {
  let s = fixture();
  s.deck = ["01013", "01043", "01022", "01023", "01024", "01043"];
  const e = hand(s, P.odo);
  s = play(s, e.id);
  assert.match(s.choice!.title, /Odo/);
  s = pick(s, "search");
  assert.equal(s.choice!.options.filter((o) => o.id !== "skip").length, 1);
  s = pick(s, "1");
  assert.ok(s.hand.some((u) => u.code === "01043"));
  assert.equal(s.deck.length, 5);
  reload(s);
});
test("Odo can fail to find an ally and still shuffles", () => {
  let s = fixture();
  s.deck = ["01013", "01022", "01023", "01024", "01025"];
  s = play(s, hand(s, P.odo).id);
  s = pick(s, "search");
  const seed = s.seed;
  s = pick(s, "skip");
  assert.notEqual(s.seed, seed);
  assert.equal(s.deck.length, 5);
  reload(s);
});
test("Council waits for event resolution and offers each reward only once per round, including saved hero choices", () => {
  let s = fixture();
  council(s);
  const threat = s.threat;
  s = play(s, hand(s, "01064").id);
  s = settle(s, "self");
  // settle chooses skip; exercise subsequent independent event responses explicitly.
  s = play(s, hand(s, "01064").id);
  while (s.choice && !s.choice.title.includes("Council"))
    s = pick(
      s,
      s.choice.options.find((o) => o.id === "self")?.id ??
        s.choice.options[0].id,
    );
  assert.match(s.choice!.title, /Council/);
  assert.ok(s.discard.includes("01064"));
  s = pick(s, "threat");
  assert.equal(s.threat, threat - 1);
  s = play(s, hand(s, "01064").id);
  while (s.choice && !s.choice.title.includes("Council"))
    s = pick(s, s.choice.options[0].id);
  assert.ok(!s.choice!.options.some((o) => o.id === "threat"));
  const n = s.hand.length;
  s = pick(s, "draw");
  assert.equal(s.hand.length, n + 1);
  s = play(s, hand(s, "01064").id);
  while (s.choice && !s.choice.title.includes("Council"))
    s = pick(s, s.choice.options[0].id);
  s = pick(s, "resource");
  const h = s.heroes[0],
    r = h.resources;
  s = pick(s, h.id);
  assert.equal(get(s, h.id)!.resources, r + 1);
  assert.deepEqual(councilPublic(s)![0].used, ["threat", "draw", "resource"]);
  nextRound(s);
  flush(s);
  assert.deepEqual(councilPublic(s)![0].used, []);
  reload(s);
});
test("Council does not trigger for an event played from the discard pile", () => {
  const s = fixture();
  council(s);
  const u = make(s, "01064");
  resolveEventAbility(s, u, () => {}, false, false);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(s.discard.includes(u.code));
  reload(s);
});
test("Council rewards belong to the event's controller and serialize independently for each seat", () => {
  let s = fixture(2);
  council(s, 0);
  council(s, 1);
  selectSeat(s, 1);
  const hero = s.heroes[0];
  s = play(s, hand(s, "01064", 1).id);
  while (s.choice && !s.choice.title.includes("Council"))
    s = pick(s, s.choice.options[0].id);
  assert.equal(activeSeat(s), 1);
  s = pick(s, "resource");
  assert.ok(
    s.choice!.options.every((o) =>
      seatView(s, 1).heroes.some((h) => h.id === o.id),
    ),
  );
  const r = get(s, hero.id)!.resources;
  s = pick(s, hero.id);
  assert.equal(get(s, hero.id)!.resources, r + 1);
  assert.deepEqual(
    councilPublic(s)!.map((c) => c.used),
    [[], ["resource"]],
  );
  reload(s);
});
test("Malformed Council saves reject duplicate contracts and mismatched ownership", () => {
  const s = fixture(2);
  council(s, 0);
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  raw.ashPlayers.contracts[0].unit.owner = 1;
  assert.equal(validateSave(raw), false);
  const duplicate = JSON.parse(JSON.stringify(s));
  duplicate.ashPlayers.contracts.push(duplicate.ashPlayers.contracts[0]);
  assert.equal(validateSave(duplicate), false);
});
test("Helm discards all hero tokens before the saved collection choice, preserves exhaustion, and transfers only eligible attachments", () => {
  let s = fixture();
  const h = s.heroes[1];
  h.exhausted = true;
  h.damage = 3;
  h.resources = 9;
  h.progress = 2;
  const blade = attach(s, h, "01039"),
    armor = attach(s, h, "03007");
  const before = s.threat;
  s = play(s, hand(s, P.helm).id);
  assert.match(s.choice!.title, /Choose a hero/);
  s = pick(s, h.id);
  assert.equal(get(s, h.id)!.resources, 0);
  assert.equal(get(s, h.id)!.damage, 0);
  assert.equal(get(s, h.id)!.progress, 0);
  assert.ok(!s.choice!.options.some((o) => o.code === h.code));
  assert.ok(s.choice!.options.every((o) => Number(card(o.code!).threat) <= 11));
  s = pick(s, "01007");
  s = settle(s);
  const next = s.heroes.find((u) => u.code === "01007")!;
  assert.equal(next.exhausted, true);
  assert.equal(next.damage, 0);
  assert.equal(next.resources, 0);
  assert.equal(s.threat, before);
  assert.ok(next.attachments.some((a) => a.id === blade.id));
  assert.ok(!next.attachments.some((a) => a.id === armor.id));
  assert.ok(s.discard.includes(armor.code));
  assert.ok(s.ashPlayers!.returnedHeroes!.some((u) => u.id === h.id));
  reload(s);
});
test("Helm honors global hero uniqueness and cannot transfer the immune One Ring", () => {
  let s = fixture(2);
  const h = ring(s);
  attach(s, h, P.preserved);
  council(s);
  h.damage = 1;
  s = play(s, hand(s, P.helm).id);
  s = pick(s, h.id);
  for (const hero of seatView(s, 1).heroes)
    assert.ok(
      !s.choice!.options.some(
        (o) => card(o.code!).name === card(hero.code).name,
      ),
    );
  s = pick(s, "01008");
  s = settle(s);
  const next = s.heroes.find((u) => u.code === "01008")!;
  assert.ok(!next.attachments.some((a) => a.code === "21001"));
  assert.equal(s.status, "lost");
  assert.match(s.reason, /One Ring/);
  reload(s);
});
test("Reused Valiant Sword retains Noble-only and threat-dependent attack rules", () => {
  const s = fixture(),
    h = s.heroes[0],
    before = stats(s, h).attack;
  attach(s, h, "22083");
  s.threat = 39;
  assert.equal(stats(s, h).attack, before + 1);
  s.threat = 40;
  assert.equal(stats(s, h).attack, before + 2);
});
