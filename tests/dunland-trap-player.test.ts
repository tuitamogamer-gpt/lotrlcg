import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  availableAbilities,
  canPlay,
  playTargets,
} from "../src/game/engine";
import { card, SCRIPTED } from "../src/game/cards";
import { deckProblems } from "../src/game/decks";
import {
  eventReplayPayments,
  playCardFromEffect,
  playEventFromDiscardEffect,
} from "../src/game/actions";
import {
  damage,
  destroy,
  discardCharacter,
  enterAlly,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { get, make, playCost, stats } from "../src/game/core";
import {
  activeSeat,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import { base, choose, reload } from "./against-shadow-final-fixtures";
import { SHADOW_FLAME as S } from "../src/game/shadow-flame-support";
import { KHAZAD } from "../src/game/khazad-dum";
import { EMYN } from "../src/game/emyn-muil";
import { HEIRS_NUMENOR } from "../src/game/heirs-numenor-support";
import type { GameState, Unit } from "../src/game/types";

const fixture = (n = 1) => base("mirkwood", n);
const attach = (s: GameState, u: Unit, code: string, owner = ownerOf(s, u)) => {
  const a = {
    id: `test-attachment-${s.nextId++}`,
    code,
    exhausted: false,
    owner,
  };
  u.attachments.push(a);
  return a;
};
function tactic(s: GameState) {
  s.heroes[1] = make(s, "01006");
  s.heroes[1].resources = 10;
  s.startingHeroes = s.heroes.map((u) => u.code);
}
function close(s: GameState, amount: number) {
  const copy = s.choice!.options.find((o) => o.code === "08005")!;
  s = choose(s, copy.id);
  return choose(s, `cancel-${amount}`);
}

test("The Dunland Trap registers all ten exact designs and Gil-Galad's deck limit", () => {
  for (let i = 1; i <= 10; i++) {
    const code = `08${String(i).padStart(3, "0")}`;
    assert.ok(SCRIPTED.has(code));
    assert.equal(card(code).pack_name, "The Dunland Trap");
  }
  assert.equal(card("08007").deck_limit, 1);
  assert.ok(
    deckProblems({ heroes: ["01007"], cards: { "08007": 2 } }).some((p) =>
      p.includes("at most 1"),
    ),
  );
});
test("Swift and Silent readies your own exhausted hero, returns the actual first copy and discards the second", () => {
  let s = fixture();
  const hero = s.heroes[0];
  hero.exhausted = true;
  const one = make(s, "08003"),
    two = make(s, "08003");
  s.hand = [one, two];
  s = applyAction(s, { type: "PLAY", id: one.id, target: hero.id });
  assert.equal(get(s, hero.id)!.exhausted, false);
  assert.deepEqual(new Set(s.hand.map((u) => u.id)), new Set([one.id, two.id]));
  s = reload(s);
  get(s, hero.id)!.exhausted = true;
  s = applyAction(s, { type: "PLAY", id: two.id, target: hero.id });
  assert.deepEqual(
    s.hand.map((u) => u.id),
    [one.id],
  );
  assert.deepEqual(s.discard, ["08003"]);
});
test("Swift and Silent checks post-Doomed threat and never readies another player's hero", () => {
  let s = fixture(2);
  s.heroes[2] = make(s, "07002");
  s.heroes[0].exhausted = true;
  forOwner(s, 1, () => {
    s.heroes[0].exhausted = true;
  });
  const event = make(s, "08003");
  s.hand = [event];
  assert.deepEqual(
    playTargets(s, event).map((u) => u.id),
    [s.heroes[0].id],
  );
  s = applyAction(s, { type: "ABILITY", id: s.heroes[2].id });
  s = applyAction(s, { type: "PLAY", id: event.id, target: s.heroes[0].id });
  assert.equal(s.threat, 21);
  assert.equal(s.hand.length, 0);
  assert.ok(s.discard.includes("08003"));
});
test("a canceled Swift still consumes the round's first play", () => {
  let s = fixture();
  s.heroes[0].exhausted = true;
  const enemy = make(s, S.bane);
  attach(s, enemy, S.counter);
  s.staging = [enemy];
  s.encounterDeck = [S.flame, "01099"];
  s.hand = [make(s, "08003")];
  s = applyAction(s, {
    type: "PLAY",
    id: s.hand[0].id,
    target: s.heroes[0].id,
  });
  assert.equal(s.heroes[0].exhausted, true);
  s.hand = [make(s, "08003")];
  s = applyAction(s, {
    type: "PLAY",
    id: s.hand[0].id,
    target: s.heroes[0].id,
  });
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.hand.length, 0);
  assert.equal(s.discard.filter((c) => c === "08003").length, 2);
});
test("a Swift discard replay returns its resolving physical copy and preserves another copy in hand", () => {
  const s = fixture();
  s.heroes[0].exhausted = true;
  const hand = make(s, "08003");
  s.hand = [hand];
  s.discard = ["08003"];
  playEventFromDiscardEffect(s, 0, { target: s.heroes[0].id, bottom: true });
  flush(s);
  assert.equal(s.hand.length, 2);
  assert.ok(s.hand.some((u) => u.id === hand.id));
  assert.equal(new Set(s.hand.map((u) => u.id)).size, 2);
  assert.equal(s.discard.length, 0);
});

test("Close Call can prevent lethal damage and raises every player's threat by the chosen X", () => {
  let s = fixture(2);
  forOwner(s, 1, () => {
    s.hand = [make(s, "08005")];
  });
  const hero = s.heroes[0];
  assert.equal(damage(s, hero.id, 6), false);
  flush(s);
  assert.equal(hero.damage, 0);
  s = reload(s);
  s = close(s, 2);
  assert.equal(get(s, hero.id)!.damage, 4);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 22);
  assert.ok(seatView(s, 1).discard.includes("08005"));
});
test("Close Call can be skipped without raising threat or losing a card", () => {
  let s = fixture();
  tactic(s);
  s.hand = [make(s, "08005")];
  damage(s, s.heroes[0].id, 2);
  flush(s);
  s = choose(s, "skip");
  assert.equal(s.heroes[0].damage, 2);
  assert.equal(s.threat, 20);
  assert.equal(s.hand[0].code, "08005");
});
test("Close Call forbids ordinary play, ally targets, illegal X and a missing Tactics sphere", () => {
  const s = fixture();
  s.hand = [make(s, "08005")];
  assert.match(canPlay(s, s.hand[0])!, /response|sphere/i);
  damage(s, s.heroes[0].id, 1);
  flush(s);
  assert.equal(s.choice, null);
  tactic(s);
  const ally = make(s, "01018");
  s.allies = [ally];
  damage(s, ally.id, 1);
  flush(s);
  assert.equal(s.choice, null);
  damage(s, s.heroes[0].id, 1);
  flush(s);
  const pending = choose(s, s.hand[0].id);
  assert.deepEqual(
    pending.choice!.options.map((o) => o.id),
    ["cancel-1"],
  );
  assert.throws(() => choose(pending, "cancel-2"));
});
test("Close Call resolves Doomed responses before canceled damage and adds Grima's keyword", () => {
  let s = fixture();
  tactic(s);
  s.heroes[2] = make(s, "07002");
  const target = s.heroes[0].id;
  const guard = make(s, "07004");
  guard.exhausted = true;
  s.allies = [guard];
  s.hand = [make(s, "08005")];
  s = applyAction(s, { type: "ABILITY", id: s.heroes[2].id });
  damage(s, target, 3);
  flush(s);
  s = close(s, 1);
  assert.equal(s.threat, 22);
  assert.match(s.choice!.title, /Orthanc/);
  assert.equal(get(s, target)!.damage, 0);
  s = reload(s);
  s = choose(s, "use");
  assert.equal(get(s, guard.id)!.exhausted, false);
  assert.equal(get(s, target)!.damage, 2);
});
test("canceled Close Call keeps its paid Doomed and leaves the full damage", () => {
  let s = fixture();
  tactic(s);
  const enemy = make(s, S.bane);
  attach(s, enemy, S.counter);
  s.staging = [enemy];
  s.encounterDeck = [S.flame, "01099"];
  s.hand = [make(s, "08005")];
  damage(s, s.heroes[0].id, 2);
  flush(s);
  s = close(s, 2);
  assert.equal(s.threat, 22);
  assert.equal(s.heroes[0].damage, 2);
  assert.equal(s.hand.length, 0);
});
test("an event player's Doomed elimination still resumes damage to a surviving fellowship", () => {
  let s = fixture(2);
  forOwner(s, 1, () => {
    s.hand = [make(s, "08005")];
    s.threat = 49;
  });
  const target = s.heroes[0].id;
  damage(s, target, 2);
  flush(s);
  s = close(s, 1);
  assert.ok(s.table!.seats[1].eliminated);
  assert.equal(s.status, "playing");
  assert.equal(get(s, target)!.damage, 2);
  assert.equal(s.queue.length, 0);
});
test("Close Call obeys encounter cancellation restrictions, but can cancel combat damage", () => {
  const s = fixture();
  tactic(s);
  s.hand = [make(s, "08005")];
  s.activeLocation = make(s, "02016");
  damage(s, s.heroes[0].id, 1);
  flush(s);
  assert.equal(s.choice, null);
  damage(s, s.heroes[0].id, 1, { enemyId: "enemy", combatDamage: true });
  flush(s);
  assert.match(s.choice!.title, /Close Call/);
});

test("Trader transfer preserves identity, owner and exhaustion; the recipient chooses the resource movement", () => {
  let s = fixture(2);
  const trader = make(s, "08006");
  trader.exhausted = true;
  trader.damage = 1;
  s.allies = [trader];
  const target = s.heroes[0].id,
    donor = seatView(s, 1).heroes[0].id;
  const before = get(s, target)!.resources;
  s = applyAction(s, { type: "ABILITY", id: trader.id });
  s = choose(s, "player-1");
  assert.equal(activeSeat(s), 1);
  assert.equal(ownerOf(s, get(s, trader.id)!), 1);
  assert.equal(get(s, trader.id)!.owner, 0);
  assert.equal(get(s, trader.id)!.exhausted, true);
  assert.equal(get(s, trader.id)!.damage, 1);
  s = reload(s);
  s = choose(s, `${donor}-${target}`);
  assert.equal(get(s, target)!.resources, before + 1);
  assert.equal(get(s, donor)!.resources, 9);
  selectSeat(s, 1);
  assert.ok(availableAbilities(s, get(s, trader.id)!)[0].disabled);
});
test("declining the Trader's resource sends him to his original owner's discard", () => {
  let s = fixture(2);
  const trader = make(s, "08006");
  s.allies = [trader];
  s = applyAction(s, { type: "ABILITY", id: trader.id });
  s = choose(s, "player-1");
  s = choose(s, "discard");
  assert.equal(get(s, trader.id), undefined);
  assert.ok(seatView(s, 0).discard.includes("08006"));
  assert.ok(!seatView(s, 1).discard.includes("08006"));
});
test("a Trader without a donor resource still transfers and must be discarded", () => {
  let s = fixture(2);
  const trader = make(s, "08006");
  s.allies = [trader];
  forOwner(s, 1, () =>
    s.heroes.forEach((h) => {
      h.resources = 0;
    }),
  );
  s = applyAction(s, { type: "ABILITY", id: trader.id });
  s = choose(s, "player-1");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["discard"],
  );
});
test("Trader ability is unavailable in solo and while blanked", () => {
  const s = fixture();
  const trader = make(s, "08006");
  s.allies = [trader];
  assert.ok(availableAbilities(s, trader)[0].disabled);
  const m = fixture(2);
  const blank = make(m, "08006");
  attach(m, blank, KHAZAD.fear);
  m.allies = [blank];
  assert.ok(
    !availableAbilities(m, blank).length ||
      availableAbilities(m, blank)[0].disabled,
  );
});

test("The Fall of Gil-Galad moves only the attached physical Song to victory and reduces its controller's threat", () => {
  let s = fixture(2);
  const hero = s.heroes[0];
  attach(s, hero, "08007", 1);
  forOwner(s, 1, () => s.discard.push("08007"));
  destroy(s, hero);
  flush(s);
  s = reload(s);
  s = choose(s, "victory");
  assert.equal(seatView(s, 0).threat, 8);
  assert.equal(seatView(s, 1).threat, 20);
  assert.deepEqual(seatView(s, 1).discard, ["08007"]);
  assert.deepEqual(s.victoryCards, ["08007"]);
  assert.equal(s.victory, 0);
});
test("the Song can be declined and never responds to a non-destruction discard", () => {
  let s = fixture();
  attach(s, s.heroes[0], "08007");
  destroy(s, s.heroes[0]);
  flush(s);
  s = choose(s, "skip");
  assert.ok(s.discard.includes("08007"));
  assert.equal(s.threat, 20);
  const other = fixture();
  attach(other, other.heroes[0], "08007");
  discardCharacter(other, other.heroes[0]);
  flush(other);
  assert.equal(other.choice, null);
  assert.equal(other.threat, 20);
});
test("a blanked Song does not trigger and the last hero's destruction still eliminates the player", () => {
  const s = fixture();
  attach(s, s.heroes[0], "08007");
  s.activeLocation = make(s, EMYN.amonLhaw);
  destroy(s, s.heroes[0]);
  flush(s);
  assert.equal(s.choice, null);
  const one = fixture();
  one.heroes = [one.heroes[0]];
  attach(one, one.heroes[0], "08007");
  destroy(one, one.heroes[0]);
  flush(one);
  assert.equal(one.status, "lost");
  assert.equal(one.choice, null);
});

for (const threat of [20, 21])
  test(`Ithilien Lookout has Secrecy 2 at threat ${threat}`, () => {
    const s = fixture();
    s.threat = threat;
    assert.equal(playCost(s, card("08008")), threat === 20 ? 1 : 3);
  });
test("Lookout enters without revealing hidden information until its optional response is accepted", () => {
  let s = fixture();
  const lookout = make(s, "08008");
  s.encounterDeck = ["01096", "01099"];
  enterAlly(s, lookout);
  flush(s);
  assert.equal(s.peek, null);
  assert.ok(!s.choice!.options.some((o) => o.code === "01096"));
  s = choose(s, "look");
  s = reload(s);
  assert.equal(s.peek, "01096");
  s = choose(s, "discard");
  assert.deepEqual(s.encounterDeck, ["01099"]);
  assert.deepEqual(s.encounterDiscard, ["01096"]);
  assert.equal(s.peek, null);
  assert.equal(s.staging.length, 0);
});
test("Lookout leaves locations in place and can decline its response", () => {
  let s = fixture();
  s.encounterDeck = ["01099"];
  enterAlly(s, make(s, "08008"));
  flush(s);
  s = choose(s, "look");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["keep"],
  );
  s = choose(s, "keep");
  assert.deepEqual(s.encounterDeck, ["01099"]);
  enterAlly(s, make(s, "08008"));
  flush(s);
  s = choose(s, "skip");
  assert.equal(s.peek, null);
});
test("Lookout does not trigger while blanked or with an empty encounter deck", () => {
  for (const empty of [true, false]) {
    const s = fixture();
    if (empty) s.encounterDeck = [];
    const u = make(s, "08008");
    u.blanked = !empty;
    enterAlly(s, u);
    flush(s);
    assert.equal(s.choice, null);
  }
});

for (const n of [1, 2, 3, 4])
  test(`The White Council costs ${n} resources for ${n} players, including discard replays`, () => {
    const s = fixture(n);
    assert.equal(playCost(s, card("08010")), n);
    assert.ok(
      eventReplayPayments(s, make(s, "08010")).every(
        (p) => Object.values(p).reduce((a, b) => a + b, 0) === n,
      ),
    );
  });
test("The White Council resolves in first-player order, with four different options and save/reload", () => {
  let s = fixture(4);
  s.table!.first = 2;
  forOwner(s, 2, () => {
    s.heroes[0].exhausted = true;
  });
  forOwner(s, 1, () => {
    s.discard = ["01073", "01073"];
  });
  s.hand = [make(s, "08010")];
  const resources = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id, amount: 999 });
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.resources, 0),
    resources - 4,
  );
  assert.equal(activeSeat(s), 2);
  s = choose(s, "ready");
  s = choose(s, seatView(s, 2).heroes[0].id);
  assert.equal(activeSeat(s), 3);
  assert.ok(!s.choice!.options.some((o) => o.id === "ready"));
  const h = seatView(s, 3).heroes[0].id;
  s = choose(s, "resource");
  s = choose(s, h);
  assert.equal(activeSeat(s), 0);
  const before = seatView(s, 0).hand.length;
  s = choose(s, "draw");
  assert.equal(seatView(s, 0).hand.length, before + 1);
  assert.equal(activeSeat(s), 1);
  s = reload(s);
  s = choose(s, "shuffle");
  s = choose(s, "discard-1");
  assert.equal(seatView(s, 1).discard.length, 1);
  assert.ok(seatView(s, 1).deck.includes("01073"));
  assert.ok(seatView(s, 0).discard.includes("08010"));
  assert.equal(s.resolvingEvents, undefined);
});
test("White Council cannot shuffle its resolving event and applies Grima's discount without changing X", () => {
  let s = fixture(2);
  s.heroes[2] = make(s, "07002");
  s.hand = [make(s, "08010")];
  s.discard = [];
  s = applyAction(s, { type: "ABILITY", id: s.heroes[2].id });
  assert.equal(playCost(s, card("08010")), 1);
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  assert.equal(s.threat, 21);
  assert.ok(!s.choice!.options.some((o) => o.id === "shuffle"));
  s = choose(s, "draw");
  s = choose(s, "resource");
  s = choose(s, seatView(s, 1).heroes[0].id);
  assert.ok(seatView(s, 0).discard.includes("08010"));
});

test("Swift played freely from the deck counts as the first play and returns its physical card", () => {
  const s = fixture();
  s.heroes[0].exhausted = true;
  s.deck = ["08003", "01018"];
  playCardFromEffect(s, make(s, "08003"), {
    putIntoPlay: false,
    target: s.heroes[0].id,
  });
  flush(s);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.hand[0].code, "08003");
  assert.deepEqual(s.deck, ["01018"]);
});

test("The Seeing-stone searches for Close Call's printed Doomed X", () => {
  let s = fixture();
  s.hand = [make(s, "07015")];
  s.deck = ["08005", "01018"];
  s = applyAction(s, { type: "PLAY", id: s.hand[0].id });
  assert.ok(s.choice!.options.some((o) => o.code === "08005"));
  s = choose(s, "deck-0");
  assert.equal(s.hand[0].code, "08005");
});

test("Trader's moved resource triggers Heir of Mardil on the receiving hero", () => {
  let s = fixture(2);
  const trader = make(s, "08006");
  s.allies = [trader];
  s.heroes[0].exhausted = true;
  attach(s, s.heroes[0], "08113");
  const target = s.heroes[0].id,
    donor = seatView(s, 1).heroes[0].id;
  s = applyAction(s, { type: "ABILITY", id: trader.id });
  s = choose(s, "player-1");
  s = choose(s, `${donor}-${target}`);
  assert.match(s.choice!.title, /Heir of Mardil/);
  s = choose(s, s.choice!.options.find((o) => o.id !== "skip")!.id);
  assert.equal(get(s, target)!.exhausted, false);
});

test("Trader moves resources that Orc Vanguard prevents the donor from spending", () => {
  let s = fixture(2);
  const trader = make(s, "08006");
  s.allies = [trader];
  s.staging = [make(s, HEIRS_NUMENOR.vanguard)];
  forOwner(s, 1, () => {
    s.heroes = [make(s, "01007")];
    s.heroes[0].resources = 1;
  });
  const target = s.heroes[0].id,
    donor = seatView(s, 1).heroes[0].id;
  s = applyAction(s, { type: "ABILITY", id: trader.id });
  s = choose(s, "player-1");
  s = choose(s, `${donor}-${target}`);
  assert.equal(get(s, donor)!.resources, 0);
  assert.equal(get(s, target)!.resources, 11);
});
