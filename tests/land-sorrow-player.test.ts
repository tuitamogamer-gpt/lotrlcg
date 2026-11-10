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
import { fx, get, make, playCost, stats } from "../src/game/core";
import {
  discardAttachment,
  discardCharacter,
  enterAlly,
  readyCharacter,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { isHero } from "../src/game/card-types";
import { deckProblems } from "../src/game/decks";
import {
  activeSeat,
  forOwner,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table";
import {
  SORROW_PLAYER as P,
  landSorrowPlayerAttackBonus,
  landSorrowPlayerAttackKilled,
  landSorrowPlayerQuestSucceeded,
  landSorrowPlayerRoundEnd,
  messengerDeckProblems,
  messengerThreat,
} from "../src/game/land-sorrow-player";
import { SORROW as S } from "../src/game/land-sorrow-support";
import { base, choose, reload, settle } from "./land-sorrow-fixtures";
import type { GameState, Unit } from "../src/game/types";
import players from "../src/data/land-sorrow-player-cards.json";
const hand = (s: GameState, code: string, p = activeSeat(s)) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.hand.push(u);
  });
  return u;
};
const ally = (s: GameState, code: string, p = activeSeat(s)) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.allies.push(u);
  });
  return u;
};
const attach = (host: Unit, code: string, s: GameState, owner = 0) => {
  const a = { id: `a${s.nextId++}`, code, owner, exhausted: false };
  host.attachments.push(a);
  return a;
};
const queue = (s: GameState, kind: string, extra = {}) => {
  handle(s, fx(kind, extra));
  flush(s);
};
const KING_DECK: Record<string, number> = {
  ...Object.fromEntries(
    playerCards
      .filter(
        (c) =>
          SCRIPTED.has(c.code) &&
          c.type_code === "event" &&
          c.sphere_code === "leadership" &&
          c.deck_limit !== 0,
      )
      .slice(0, 17)
      .map((c) => [c.code, 3]),
  ),
  "01014": 1,
  [P.king]: 1,
};
test("All eleven Land of Sorrow player designs are registered and scripted", () => {
  assert.equal(players.length, 11);
  const pack = playerCards.filter((c) =>
    c.packs?.some((p) => (typeof p === "string" ? p : p.pack_code) === "TLoS"),
  );
  assert.equal(pack.length, 11);
  assert.ok(pack.every((c) => SCRIPTED.has(c.code)));
  assert.equal(card(P.king).type_code, "contract");
  assert.equal(card(P.gwaihir).type_code, "hero");
});
test("Messenger of the King limits heroes, adds the ally's printed stats to threat and turns the ally into a once-per-phase hero", () => {
  const two = STARTERS[0].heroes.slice(0, 2);
  assert.deepEqual(messengerDeckProblems(two, KING_DECK), []);
  assert.ok(
    deckProblems({ heroes: STARTERS[0].heroes, cards: KING_DECK }).some((p) =>
      /at most two heroes/.test(p),
    ),
  );
  let s = createGame(77, KING_DECK, two, "custom", {
    scenarioId: "the-land-of-sorrow",
  });
  assert.match(s.choice!.title, /Messenger of the King/);
  const threat = s.threat;
  s = choose(s, "01014");
  for (let n = 0; n < 50 && (s.choice || s.phase === "setup"); n++)
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  const faramir = s.heroes.find((h) => h.code === "01014")!;
  assert.ok(faramir, "the chosen ally is a hero in play");
  assert.ok(isHero(faramir));
  assert.equal(s.threat >= threat + messengerThreat("01014"), true);
  assert.equal(messengerThreat("01014"), 8);
  assert.ok(!s.deck.includes(P.king));
  assert.ok(faramir.attachments.some((a) => a.code === P.king));
  assert.equal(s.landSorrowPlayers!.contracts[0].side, "B");
  faramir.exhausted = true;
  readyCharacter(s, faramir);
  assert.equal(faramir.exhausted, false);
  faramir.exhausted = true;
  readyCharacter(s, faramir);
  assert.equal(faramir.exhausted, true, "second ready in one phase fails");
  const a = faramir.attachments.find((a) => a.code === P.king)!;
  discardAttachment(s, faramir, a);
  assert.ok(
    faramir.attachments.some((x) => x.code === P.king),
    "immune",
  );
  s = reload(s);
  const host = s.heroes.find((h) => h.code === "01014")!;
  discardCharacter(s, host);
  flush(s);
  assert.ok(s.removed.includes(P.king));
  assert.equal(s.landSorrowPlayers!.contracts.length, 0);
  reload(s);
});
test("Gwaihir skips refresh readying and readies once per phase when an Eagle ally enters or leaves play", () => {
  let s = base();
  const g = make(s, P.gwaihir);
  g.exhausted = true;
  s.heroes[0] = g;
  syncSeat(s);
  queue(s, "refreshReady");
  s = settle(s);
  assert.equal(get(s, g.id)!.exhausted, true);
  s.phase = "planning";
  const eagle = make(s, P.emissary);
  enterAlly(s, eagle, false, false, false);
  flush(s);
  s = choose(s, "ready");
  assert.equal(get(s, g.id)!.exhausted, false);
  get(s, g.id)!.exhausted = true;
  discardCharacter(s, get(s, eagle.id)!);
  flush(s);
  assert.equal(s.choice, null, "limit once per phase");
  s.used = s.used.filter((k) => !k.startsWith("phase:"));
  const second = make(s, P.wilyador);
  s.allies.push(second);
  discardCharacter(s, second);
  flush(s);
  assert.match(
    s.choice!.title,
    /Gwaihir/,
    "an Eagle leaving play in a new phase",
  );
  s = choose(s, "ready");
  assert.equal(get(s, g.id)!.exhausted, false);
});
test("Hobbit Archer attacks harder against enemies above your threat", () => {
  const s = base();
  const archer = ally(s, P.archer),
    low = make(s, S.slaver),
    high = make(s, S.ulwarth);
  s.threat = 25;
  assert.equal(landSorrowPlayerAttackBonus(s, archer, low), 0);
  assert.equal(landSorrowPlayerAttackBonus(s, archer, high), 1);
});
test("Red Book needs a Hobbit hero, boosts committed Hobbits and adds a resource after a successful quest", () => {
  let s = base();
  const hobbit = make(s, "21002");
  s.heroes[0] = hobbit;
  syncSeat(s);
  const book = hand(s, P.book);
  assert.deepEqual(
    playTargets(s, book).map((u) => u.id),
    [hobbit.id],
  );
  const a = attach(hobbit, P.book, s);
  const will = stats(s, hobbit).will;
  hobbit.committed = true;
  assert.equal(stats(s, hobbit).will, will + 1);
  const resources = hobbit.resources;
  landSorrowPlayerQuestSucceeded(s);
  flush(s);
  s = choose(s, "use");
  s = settle(s);
  assert.equal(get(s, hobbit.id)!.resources, resources + 1);
  assert.equal(
    get(s, hobbit.id)!.attachments.find((x) => x.id === a.id)!.exhausted,
    true,
  );
});
test("Dale Messenger heals the chosen player's characters with player attachments", () => {
  let s = base(2);
  const [p0, p1] = playerOrder(s);
  const target = seatView(s, p1).heroes[0];
  target.damage = 2;
  attach(target, P.pipe, s, p1);
  seatView(s, p1).heroes[1].damage = 1;
  const m = make(s, P.messenger);
  forOwner(s, p0, () => enterAlly(s, m, false, false, false));
  flush(s);
  s = choose(s, `player-${p1}`);
  s = settle(s);
  assert.equal(get(s, target.id)!.damage, 1);
  assert.equal(seatView(s, p1).heroes[1].damage, 1);
});
test("Song of Healing discards a hand card to heal its hero", () => {
  let s = base();
  const h = s.heroes[0];
  h.damage = 2;
  const a = attach(h, P.song, s);
  const card0 = hand(s, "01013");
  s = applyAction(reload(s), { type: "ABILITY", id: h.id, attachmentId: a.id });
  s = choose(s, card0.id);
  assert.equal(get(s, h.id)!.damage, 1);
  assert.ok(s.discard.includes("01013"));
});
test("Eagle Emissary pays a Tactics resource or is discarded after questing successfully", () => {
  let s = base();
  const e = ally(s, P.emissary);
  e.committed = true;
  landSorrowPlayerQuestSucceeded(s);
  flush(s);
  assert.match(s.choice!.title, /Eagle Emissary/);
  s = choose(s, "discard");
  assert.ok(!s.allies.some((u) => u.id === e.id));
  assert.ok(s.discard.includes(P.emissary));
});
test("Bilbo's Plan only plays after you destroy an enemy and trades the next enemy for a cheaper non-unique location", () => {
  let s = base();
  for (const h of s.heroes) h.phaseResourceIcons = ["tactics"];
  const plan = hand(s, P.plan);
  assert.match(canPlay(s, plan)!, /response window/);
  const fields = make(s, S.fields);
  s.staging.push(fields);
  s.encounterDiscard = [S.cruelty, S.guard];
  s.encounterDeck = [];
  landSorrowPlayerAttackKilled(s, make(s, S.raider), [s.heroes[0].id]);
  flush(s);
  s = choose(s, plan.id);
  s = settle(s, fields.id);
  assert.ok(s.staging.some((u) => u.code === S.guard));
  assert.ok(!s.staging.some((u) => u.id === fields.id));
  assert.ok(s.encounterDiscard.includes(S.fields));
});
test("Spare Pipe adds a hit point and searches the top five cards for an event", () => {
  let s = base();
  for (const h of s.heroes) h.phaseResourceIcons = ["spirit"];
  const pipe = hand(s, P.pipe);
  s.deck = ["01073", "01023", "01013", "01024", "01025", ...s.deck];
  s = applyAction(reload(s), {
    type: "PLAY",
    id: pipe.id,
    target: s.heroes[0].id,
  });
  s = settle(s, "search");
  const health = card(s.heroes[0].code).health!;
  assert.equal(stats(s, s.heroes[0]).health, health + 1);
});
test("Smoke and Think reduces the next card by one per Pipe you control", () => {
  let s = base();
  for (const h of s.heroes) h.phaseResourceIcons = ["spirit", "leadership"];
  attach(s.heroes[0], P.pipe, s);
  attach(s.heroes[1], "17088", s);
  const smoke = hand(s, P.smoke);
  s = applyAction(reload(s), { type: "PLAY", id: smoke.id });
  s = settle(s);
  assert.deepEqual(s.landSorrowPlayers!.smoke, [{ player: 0, amount: 2 }]);
  const faramir = hand(s, "01014");
  assert.equal(playCost(s, card(faramir.code)), 2);
  s = applyAction(reload(s), { type: "PLAY", id: faramir.id });
  s = settle(s);
  assert.deepEqual(s.landSorrowPlayers!.smoke, []);
});
test("Wilyador is discarded at round end unless the players spend a resource", () => {
  let s = base(2);
  const w = ally(s, P.wilyador);
  const effects = landSorrowPlayerRoundEnd(s);
  assert.equal(effects.length, 1);
  s.queue.push(...effects);
  flush(s);
  const payer = s.choice!.options.find((o) => o.id !== "discard")!;
  s = choose(s, payer.id);
  assert.ok(s.allies.some((u) => u.id === w.id));
  s.queue.push(...landSorrowPlayerRoundEnd(s));
  flush(s);
  s = choose(s, "discard");
  assert.ok(!s.allies.some((u) => u.id === w.id));
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});
