import { wanderer, WANDERER_DECK } from "./wainriders-player-fixtures";
import { WEATHER } from "../src/game/weather-hills-support";
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canPlay,
  createGame,
  playTargets,
  validateSave,
} from "../src/game/engine";
import { card, STARTERS } from "../src/game/cards";
import { canPay, fx, get, make, stats } from "../src/game/core";
import {
  charactersCommitted,
  phaseEnd,
  enterAlly,
  check,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  activeSeat,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import { reduceThreat } from "../src/game/threat-reduction";
import { resolveDoomed } from "../src/game/voice-isengard";
import { deckProblems } from "../src/game/decks";
import {
  WAINRIDERS_PLAYER as P,
  wandererNoMatch,
  wainridersNoEngagement,
} from "../src/game/wainriders-player-support";
import {
  wainridersPlayerAttackKilled,
  wainridersPlayerAbilityProblem,
  wainridersPlayerEvent,
} from "../src/game/wainriders-player";
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
function saruman(s: GameState, p = 0) {
  let hero!: GameState["heroes"][number];
  forOwner(s, p, () => {
    hero = make(s, P.saruman);
    hero.resources = 10;
    s.heroes = [hero];
    s.startingHeroes = [hero.code];
  });
  return hero;
}
const ability = (s: GameState, id: string, attachmentId?: string) =>
  act(s, { type: "ABILITY", id, attachmentId });
test("Saruman pays printed Doomed events in other spheres, caps only his controller's player-card threat reduction, and respects blanking", () => {
  const s = fixture(2),
    h = saruman(s);
  assert.equal(canPay(s, card(P.horns)), true);
  assert.equal(canPay(s, card("01046")), false);
  s.threat = 35;
  assert.equal(reduceThreat(s, 6), 1);
  assert.equal(reduceThreat(s, 6, undefined, "quest-card"), 6);
  forOwner(s, 1, () => {
    s.threat = 35;
    assert.equal(reduceThreat(s, 6), 6);
  });
  h.damage = 1;
  s.questAttachments = {
    "01119": [{ id: `a${s.nextId++}`, code: WEATHER.cold, exhausted: false }],
  };
  assert.equal(canPay(s, card(P.horns)), false);
  assert.equal(reduceThreat(s, 6), 6);
  reload(s);
});
test("Saruman's optional ready response follows a played Doomed card and does not trigger when an ally is put into play", () => {
  let s = fixture(),
    h = saruman(s);
  h.exhausted = true;
  const e = hand(s, P.sighted);
  s = play(s, e.id);
  assert.match(s.choice!.title, /Saruman/);
  s = pick(s, "ready");
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.match(s.choice!.title, /Far-sighted/);
  s = settle(s);
  get(s, h.id)!.exhausted = true;
  const soldier = make(s, P.soldier);
  enterAlly(s, soldier, false, false, false);
  flush(s);
  assert.equal(get(s, h.id)!.exhausted, true);
  assert.ok(!s.choice?.title.includes("Saruman"));
  reload(s);
});
test("Saruman's Staff pays exhaustion before a saved mode choice; a full Doomed reduction still permits Saruman's ready response", () => {
  let s = fixture(),
    h = saruman(s);
  h.exhausted = true;
  const a = attach(s, h, P.staff);
  s = ability(s, h.id, a.id);
  assert.equal(get(s, h.id)!.attachments[0].exhausted, true);
  s = pick(s, "reduce");
  const e = hand(s, P.horns);
  hand(s, "01013");
  const before = s.threat;
  s = play(s, e.id);
  assert.equal(s.threat, before);
  assert.match(s.choice!.title, /Saruman/);
  s = pick(s, "ready");
  assert.equal(get(s, h.id)!.exhausted, false);
  s = settle(s);
  assert.ok(!s.used.includes("phase:wain-staff"));
  reload(s);
});
test("Staff search keeps exact physical top-five card and shuffles, while discounts expire at phase end", () => {
  let s = fixture(),
    h = saruman(s),
    a = attach(s, h, P.staff);
  s.deck = ["01013", P.sighted, "01022", "01023", "01024", P.horns];
  s = ability(s, h.id, a.id);
  s = pick(s, "search");
  assert.equal(s.choice!.options.filter((o) => o.id !== "skip").length, 1);
  s = pick(s, "deck-1");
  assert.ok(s.hand.some((u) => u.code === P.sighted));
  assert.equal(s.deck.includes(P.sighted), false);
  s.used.push("phase:wain-staff");
  phaseEnd(s);
  assert.equal(s.used.includes("phase:wain-staff"), false);
  reload(s);
});
test("Soldier of Isengard can transfer to a player actually raised by Doomed, retaining its physical owner and attachments", () => {
  let s = fixture(2);
  const u = ally(s, P.soldier),
    a = attach(s, u, "01039");
  resolveDoomed(s, 1, "encounter");
  flush(s);
  assert.match(s.choice!.title, /Soldier of Isengard/);
  assert.equal(activeSeat(s), 0);
  s = pick(s, "give");
  const moved = seatView(s, 1).allies.find((x) => x.id === u.id)!;
  assert.ok(moved);
  assert.equal(moved.owner, 0);
  assert.equal(ownerOf(s, moved), 1);
  assert.equal(moved.attachments[0].id, a.id);
  reload(s);
});
test("Power of Command requires the controlled Ring, pays costs first, and grants only other own unique characters phase willpower", () => {
  let s = fixture(2);
  const h = ring(s),
    a = attach(s, h, P.command);
  const unique = ally(s, "01073"),
    ordinary = ally(s, "01013"),
    other = seatView(s, 1).heroes[0];
  const before = [
    stats(s, h).will,
    stats(s, unique).will,
    stats(s, ordinary).will,
    stats(s, other).will,
  ];
  assert.equal(playTargets(s, hand(s, P.command)).length, 0);
  h.committed = true;
  s.phase = "quest";
  charactersCommitted(s, [h]);
  flush(s);
  s = pick(s, "use");
  assert.equal(
    get(s, h.id)!.attachments.find((x) => x.code === "21001")!.exhausted,
    true,
  );
  assert.equal(stats(s, get(s, h.id)!).will, before[0]);
  assert.equal(stats(s, get(s, unique.id)!).will, before[1] + 1);
  assert.equal(stats(s, get(s, ordinary.id)!).will, before[2]);
  assert.equal(stats(s, get(s, other.id)!).will, before[3]);
  phaseEnd(s);
  assert.equal(stats(s, get(s, unique.id)!).will, before[1]);
  reload(s);
});
test("Horns offers each seat one real hand ally and shuffles survivors into their owners' decks at phase end", () => {
  let s = fixture(2);
  const a = hand(s, "01013"),
    b = hand(s, "01017", 1),
    e = hand(s, P.horns);
  s = play(s, e.id);
  s = pick(s, a.id);
  assert.ok(get(s, a.id));
  assert.equal(activeSeat(s), 1);
  s = pick(s, b.id);
  assert.ok(get(s, b.id));
  phaseEnd(s);
  flush(s);
  s = settle(s);
  assert.ok(!get(s, a.id) && !get(s, b.id));
  assert.ok(seatView(s, 0).deck.includes("01013"));
  assert.ok(seatView(s, 1).deck.includes("01017"));
  assert.equal(s.wainridersPlayers!.horns.length, 0);
  reload(s);
});
test("Far-sighted reveals five cards privately in exact order without moving or reshuffling them", () => {
  let s = fixture(2);
  const order = s.encounterDeck.slice();
  const other = seatView(s, 1).hand.map((u) => u.id);
  wainridersPlayerEvent(s, P.sighted);
  flush(s);
  for (let i = 0; i < Math.min(5, order.length); i++) {
    assert.equal(s.choice!.options[0].code, order[i]);
    s = pick(s, "continue");
  }
  assert.deepEqual(s.encounterDeck, order);
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.id),
    other,
  );
  reload(s);
});
test("Nori recycles only the current top discard to the bottom, and its response remains optional", () => {
  let s = fixture(),
    u = ally(s, P.nori);
  s.discard = ["01013", "01022"];
  const top = s.deck[0];
  wainridersPlayerAttackKilled(s, [u.id]);
  flush(s);
  s = pick(s, "return");
  assert.equal(s.deck[0], top);
  assert.equal(s.deck.at(-1), "01022");
  assert.deepEqual(s.discard, ["01013"]);
  reload(s);
});
test("Rohirrim Scout pays discard before choosing and prevents only that player's automatic engagement checks for the round", () => {
  let s = fixture(2),
    u = ally(s, P.scout),
    e = make(s, "01096");
  s.staging = [e];
  s = ability(s, u.id);
  assert.ok(!get(s, u.id));
  s = pick(s, e.id);
  assert.equal(wainridersNoEngagement(s, get(s, e.id)!, 0), true);
  assert.equal(wainridersNoEngagement(s, get(s, e.id)!, 1), false);
  s.round++;
  assert.equal(wainridersNoEngagement(s, get(s, e.id)!, 0), false);
  reload(s);
});
for (const players of [1, 2, 3, 4])
  test(`Grey Wanderer native ${players}-player setup puts a cost-one attachment into play before opening hands and saves its separate contract`, () => {
    const ds = STARTERS.slice(0, players);
    let s = createGame(812, WANDERER_DECK, [ds[0].heroes[0]], "custom", {
      seats: ds.map((d) => ({
        deckId: "custom",
        cards: WANDERER_DECK,
        heroes: [d.heroes[0]],
      })),
    });
    for (let n = 0; s.choice || s.flow?.pending; n++) {
      assert.ok(n < 100);
      s = act(
        s,
        s.flow?.pending
          ? { type: "CONTINUE", stepId: s.flow.pending.id }
          : {
              type: "CHOOSE",
              id:
                s.choice!.options.find((o) =>
                  o.effects.some((e) => e.target === s.heroes[0].id),
                )?.id ??
                s.choice!.options.find((o) => o.id !== "skip")?.id ??
                "skip",
            },
      );
    }
    for (const c of s.wainridersPlayers!.contracts) {
      assert.equal(c.side, "B");
      const v = seatView(s, c.player);
      assert.equal(v.heroes.length, 1);
      assert.equal(v.hand.length, 6);
      assert.ok(!v.deck.includes(P.wanderer));
      assert.ok(
        playerOrder(s)
          .flatMap((p) => seatView(s, p).heroes)
          .flatMap((h) => h.attachments)
          .some((a) => a.owner === c.player),
      );
    }
    reload(s);
  });
test("Grey Wanderer rejects multiple starting heroes, waives only the first non-unique planning card's match, and tracks each player's first play separately", () => {
  const d = STARTERS[0];
  assert.throws(
    () => createGame(1, WANDERER_DECK, d.heroes, "custom"),
    /one starting hero/,
  );
  assert.ok(
    deckProblems({ heroes: d.heroes, cards: WANDERER_DECK }).some((x) =>
      x.includes("one starting hero"),
    ),
  );
  let s = fixture(2);
  wanderer(s);
  wanderer(s, 1);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes[0].phaseResourceIcons = [];
    });
  assert.ok(wandererNoMatch(s, card("01013")));
  assert.equal(wandererNoMatch(s, card("01073")), false);
  const a = hand(s, "01013");
  s = settle(play(s, a.id));
  assert.equal(wandererNoMatch(s, card("01022")), false);
  forOwner(s, 1, () => assert.ok(wandererNoMatch(s, card("01013"))));
  phaseEnd(s);
  s.phase = "quest";
  assert.equal(wandererNoMatch(s, card("01013")), false);
  s.phase = "planning";
  assert.ok(wandererNoMatch(s, card("01013")));
  reload(s);
});
test("Grey Wanderer pays threat and exhaustion before two distinct saved choices, then readies and heals its starting hero", () => {
  let s = fixture();
  saruman(s);
  const c = wanderer(s),
    h = s.heroes[0];
  h.damage = 3;
  h.exhausted = true;
  const before = s.threat;
  s = ability(s, c.unit.id);
  assert.equal(s.threat, before + 1);
  assert.equal(s.wainridersPlayers!.contracts[0].unit.exhausted, true);
  s = pick(s, "ready");
  assert.ok(!s.choice!.options.some((o) => o.id === "ready"));
  s = pick(s, "heal");
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.equal(get(s, h.id)!.damage, 0);
  assert.match(
    wainridersPlayerAbilityProblem(s, get(s, c.unit.id)!)!,
    /exhausted/,
  );
  reload(s);
});
test("Grey Wanderer resources respect actual gains and contracts ready in refresh; malformed physical duplicates do not restore", () => {
  let s = fixture(),
    c = wanderer(s),
    h = s.heroes[0];
  const before = h.resources;
  s = ability(s, c.unit.id);
  s = pick(s, "resources");
  s = pick(s, "heal");
  assert.equal(get(s, h.id)!.resources, before + 2);
  handle(s, fx("refreshReady"));
  flush(s);
  s = settle(s);
  assert.equal(s.wainridersPlayers!.contracts[0].unit.exhausted, false);
  const bad = structuredClone(s);
  bad.wainridersPlayers!.contracts.push(bad.wainridersPlayers!.contracts[0]);
  assert.equal(validateSave(bad), false);
  reload(s);
});
