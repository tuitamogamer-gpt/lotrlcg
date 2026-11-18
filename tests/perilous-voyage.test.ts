import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { card, playerCards, SCRIPTED, STARTERS } from "../src/game/cards";
import { check, raiseThreat } from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  createGame,
  publicState,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { make } from "../src/game/core";
import { reduceThreat } from "../src/game/threat-reduction";
import { questExhausts } from "../src/game/expansion-passives";
import { DECK_CARDS, deckProblems } from "../src/game/decks";
import { forOwner, seatView, syncSeat } from "../src/game/table";
import {
  PERILOUS_VOYAGE as PV,
  voyageAbilityProblem,
  voyageDeckProblems,
} from "../src/game/perilous-voyage-support";
import type { GameState } from "../src/game/types";
import {
  ability,
  act,
  fixture,
  pick,
  reload,
} from "./ered-final-player-fixtures";
import art from "./perilous-voyage-art.json";

const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const HEROES = ["01001", "01002", "01004"];
/** A legal 100-card deck for Aragorn, Théodred and Gimli, with the contract. */
function voyageDeck(size = 100): Record<string, number> {
  const deck: Record<string, number> = {};
  let n = 0;
  for (const c of DECK_CARDS.filter(
    (c) =>
      ["leadership", "tactics", "neutral"].includes(c.sphere_code) &&
      !c.is_unique &&
      c.type_code !== "contract" &&
      (c.deck_limit ?? 3) >= 3,
  )) {
    if (n >= size) break;
    const count = Math.min(3, size - n);
    deck[c.code] = count;
    n += count;
  }
  deck[PV] = 1;
  return deck;
}
/** Put the contract into play with a player (a fixture shortcut). */
function voyage(s: GameState, player = 0, side: "A" | "B" = "A") {
  forOwner(s, player, () => {
    const unit = make(s, PV);
    unit.owner = player;
    (s.perilousVoyage ??= { contracts: [] }).contracts.push({
      player,
      unit,
      side,
    });
  });
  syncSeat(s);
  return s.perilousVoyage!.contracts.find((c) => c.player === player)!;
}
const contract = (s: GameState, player = 0) =>
  s.perilousVoyage!.contracts.find((c) => c.player === player)!;

test("A Perilous Voyage is a registered two-sided contract with both faces pinned; it needs at least 100 player cards", () => {
  const c = card(PV);
  assert.equal(c.type_code, "contract");
  assert.equal(c.deck_limit, 1);
  assert.ok(SCRIPTED.has(PV));
  assert.ok(DECK_CARDS.some((x) => x.code === PV));
  assert.match(c.text!, /^Your minimum deck size is 100 cards\./);
  assert.match(
    c.text!,
    /Forced: When you would be eliminated by reaching your threat elimination level, flip this card over instead\.$/,
  );
  assert.match(c.back_text!, /^Your threat cannot be reduced by non-contract/);
  assert.match(c.back_text!, /reducing its cost by 3\. Shuffle your deck\.$/);
  assert.equal(c.imagesrc, "/cards/40047.jpg");
  assert.equal(c.back_imagesrc, "/cards/40047.B.jpg");
  // The catalog's text, faithfully: both sides are read from the scans.
  const catalog = (
    JSON.parse(readFileSync("src/data/official-player-cards.json", "utf8")) as {
      code: string;
      text: string;
    }[]
  ).find((x) => x.code === PV)!;
  const plain = (v: string) =>
    v
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  assert.ok(plain(catalog.text).includes(plain(c.text!)));
  assert.ok(plain(catalog.text).includes(plain(c.back_text!)));
  assert.equal(art.length, 2);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.equal(playerCards.filter((x) => x.code === PV).length, 1);
  // Deckbuilding.
  assert.deepEqual(voyageDeckProblems(voyageDeck()), []);
  assert.match(
    voyageDeckProblems(voyageDeck(60))[0],
    /minimum deck size is 100 cards \(60 now\)/,
  );
  assert.deepEqual(deckProblems({ heroes: HEROES, cards: voyageDeck() }), []);
  assert.ok(
    deckProblems({ heroes: HEROES, cards: voyageDeck(50) }).some((p) =>
      /A Perilous Voyage/.test(p),
    ),
  );
});

test("Setup: the contract begins in play on Side A with its player and leaves the 100-card deck; a smaller deck cannot use it", () => {
  const deck = voyageDeck();
  const s = createGame(7, deck, HEROES, "custom", { scenarioId: "mirkwood" });
  const c = s.perilousVoyage!.contracts[0];
  assert.equal(c.player, 0);
  assert.equal(c.side, "A");
  assert.equal(c.unit.code, PV);
  assert.ok(!s.deck.includes(PV));
  assert.equal(s.deck.length + s.hand.length, 100);
  assert.deepEqual(
    restoreSave(JSON.parse(JSON.stringify(s)))?.perilousVoyage,
    s.perilousVoyage,
  );
  assert.throws(
    () =>
      createGame(7, { ...voyageDeck(99) }, HEROES, "custom", {
        scenarioId: "mirkwood",
      }),
    /minimum deck size is 100 cards/,
  );
  // In a table, only the player whose deck holds it controls one.
  const t = createGame(7, deck, HEROES, "custom", {
    scenarioId: "mirkwood",
    seats: [
      { heroes: HEROES, deckId: "custom", cards: deck },
      { heroes: [...STARTERS[2].heroes], deckId: STARTERS[2].id },
    ],
  });
  assert.deepEqual(
    t.perilousVoyage?.contracts.map((x) => [x.player, x.side]),
    [[0, "A"]],
  );
});

test("Side A: your threat cannot be reduced by player card effects (quest and encounter effects still reduce it)", () => {
  const s = fixture(1);
  voyage(s);
  s.threat = 30;
  assert.equal(reduceThreat(s, 3, "01073"), 0);
  assert.equal(s.threat, 30);
  assert.ok(s.log.at(-1)!.text.includes("A Perilous Voyage"));
  assert.equal(reduceThreat(s, 2, undefined, "quest-card"), 2);
  assert.equal(reduceThreat(s, 1, undefined, "encounter"), 1);
  assert.equal(s.threat, 27);
  // The contract's own effect is a player card effect too on Side A.
  assert.equal(reduceThreat(s, 2, { code: PV }), 0);
});

test("Side A's Action: exhaust the contract and raise your threat by 1 to look at the top 2 cards, draw 1 and place the other on the bottom", () => {
  let s = fixture(1);
  const c = voyage(s);
  s.deck = ["01013", "01026", "01029", "01030"];
  s.threat = 25;
  assert.equal(voyageAbilityProblem(s, c.unit.id), null);
  s = ability(s, c.unit.id);
  assert.equal(s.threat, 26);
  assert.equal(contract(s).unit.exhausted, true);
  assert.match(
    s.choice!.title,
    /^A Perilous Voyage · Draw 1 of the top 2 cards/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    ["01013", "01026"],
  );
  s = pick(s, "top-1");
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["01026"],
  );
  assert.deepEqual(s.deck, ["01029", "01030", "01013"]);
  // Exhausted: once until it readies in the refresh phase.
  assert.match(voyageAbilityProblem(s, contract(s).unit.id)!, /Exhaust/);
  assert.throws(() => ability(s, contract(s).unit.id), /Exhaust/);
  // An empty deck has nothing to look at.
  const e = fixture(1);
  const ce = voyage(e);
  e.deck = [];
  assert.match(voyageAbilityProblem(e, ce.unit.id)!, /deck is empty/);
  // Side B has no Action.
  const b = fixture(1);
  const cb = voyage(b, 0, "B");
  assert.match(voyageAbilityProblem(b, cb.unit.id)!, /Side B has no Action/);
});

test("Side A's Forced: reaching the threat elimination level flips the contract instead; Side B reduces the threat by 10 and searches the deck (add a card to hand), then shuffles", () => {
  let s = fixture(1);
  voyage(s);
  s.deck = ["01013", "01026", "01029", "01030", "01013"];
  s.threat = 48;
  raiseThreat(s, 3, "encounter");
  check(s);
  flush(s);
  assert.equal(s.status, "playing", "the player is not eliminated");
  assert.equal(contract(s).side, "B");
  assert.equal(s.threat, 41, "51 - 10");
  assert.match(
    s.choice!.title,
    /^A Perilous Voyage · Search your deck for a card/,
  );
  assert.deepEqual(s.choice!.options.map((o) => o.code).sort(), [
    "01013",
    "01026",
    "01029",
    "01030",
  ]);
  s = pick(s, "01029");
  assert.match(
    s.choice!.title,
    /^A Perilous Voyage · Add it to your hand or play it/,
  );
  s = pick(s, "hand");
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["01029"],
  );
  assert.deepEqual([...s.deck].sort(), ["01013", "01013", "01026", "01030"]);
  // Side B: the threat cannot be reduced by non-contract player card effects.
  assert.equal(reduceThreat(s, 3, "01073"), 0);
  assert.equal(reduceThreat(s, 2, undefined, "quest-card"), 2);
  // Side B: heroes do not exhaust to quest.
  assert.ok(s.heroes.every((h) => !questExhausts(s, h)));
  // Reaching the elimination level again eliminates the player.
  s.threat = 50;
  check(s);
  assert.equal(s.status, "lost");
});

test("Side B's search can play the card instead, reducing its cost by 3: an ally paid hero by hero, an ally that becomes free, and an attachment with a target", () => {
  // Brok Ironfist: 6 - 3 = 3 resources from leadership heroes.
  let s = fixture(1);
  voyage(s);
  s.deck = ["01019", "01013", "01026"];
  s.threat = 50;
  check(s);
  flush(s);
  s = pick(s, "01019");
  const play = s.choice!.options.find((o) => o.id === "play")!;
  assert.match(
    play.label,
    /Play Brok Ironfist, reducing its cost by 3 \(pay 3\)/,
  );
  s = pick(s, "play");
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  for (let i = 0; i < 3; i++) {
    assert.match(s.choice!.title, /^A Perilous Voyage · Pay for Brok Ironfist/);
    s = pick(s, s.heroes[i % s.heroes.length].id);
  }
  assert.ok(s.allies.some((u) => u.code === "01019"));
  assert.equal(before - s.heroes.reduce((n, h) => n + h.resources, 0), 3);
  assert.equal(s.deck.length, 2);
  assert.ok(!s.deck.includes("01019"));
  // Guard of the Citadel: 2 - 3, nothing to pay.
  let g = fixture(1);
  voyage(g);
  g.deck = ["01013", "01026"];
  g.threat = 50;
  check(g);
  flush(g);
  g = pick(g, "01013");
  assert.match(
    g.choice!.options.find((o) => o.id === "play")!.label,
    /\(pay 0\)/,
  );
  const spent = g.heroes.map((h) => h.resources);
  g = pick(g, "play");
  assert.ok(g.allies.some((u) => u.code === "01013"));
  assert.deepEqual(
    g.heroes.map((h) => h.resources),
    spent,
  );
  // Steward of Gondor: choose the hero it attaches to.
  let a = fixture(1);
  voyage(a);
  a.deck = ["01026", "01013"];
  a.threat = 50;
  check(a);
  flush(a);
  a = pick(a, "01026");
  a = pick(a, "play");
  assert.match(
    a.choice!.title,
    /^A Perilous Voyage · Choose a target for Steward of Gondor/,
  );
  const host = a.heroes[2].id;
  a = pick(a, host);
  assert.ok(
    a.heroes
      .find((h) => h.id === host)!
      .attachments.some((x) => x.code === "01026"),
  );
});

test("Multiplayer: only the contract's own player flips; the contract readies in the refresh phase and leaves with an eliminated player", () => {
  let s = fixture(2);
  voyage(s, 1);
  forOwner(s, 1, () => {
    s.deck = ["01013", "01026"];
    s.threat = 49;
  });
  forOwner(s, 0, () => {
    s.threat = 30;
  });
  syncSeat(s);
  forOwner(s, 1, () => raiseThreat(s, 2, "encounter"));
  check(s);
  flush(s);
  assert.equal(contract(s, 1).side, "B");
  assert.equal(seatView(s, 1).threat, 41);
  assert.equal(seatView(s, 0).threat, 30);
  assert.match(s.choice!.title, /^A Perilous Voyage · Search your deck/);
  assert.equal(s.choice!.player ?? 1, 1);
  s = pick(s, "01026");
  s = pick(s, "hand");
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.code),
    ["01026"],
  );
  // The other player has no contract to flip and is eliminated normally.
  forOwner(s, 0, () => {
    s.threat = 50;
  });
  syncSeat(s);
  check(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.status, "playing");
  // Readies with the refresh phase.
  const r = fixture(1);
  const c = voyage(r);
  c.unit.exhausted = true;
  r.queue.push({ kind: "refreshReady" });
  flush(r);
  assert.equal(contract(r).unit.exhausted, false);
  // Eliminated by other means, the player's contract is removed.
  const t = fixture(2);
  voyage(t, 1, "B");
  forOwner(t, 1, () => {
    t.threat = 50;
  });
  syncSeat(t);
  check(t);
  assert.equal(t.table!.seats[1].eliminated, true);
  assert.equal(t.perilousVoyage!.contracts.length, 0);
});

test("Saves: the contract round-trips, the public state describes it and malformed state is rejected", () => {
  const s = fixture(1);
  voyage(s, 0, "B");
  const restored = reload(s);
  assert.deepEqual(restored.perilousVoyage, s.perilousVoyage);
  const view = publicState(s) as unknown as {
    perilousVoyage: { side: string; code: string; player: number }[];
  };
  assert.deepEqual(
    view.perilousVoyage.map((c) => [c.player, c.code, c.side]),
    [[0, PV, "B"]],
  );
  const bad = JSON.parse(JSON.stringify(s));
  bad.perilousVoyage.contracts[0].side = "C";
  assert.equal(validateSave(bad), false);
  const bad2 = JSON.parse(JSON.stringify(s));
  bad2.perilousVoyage.contracts[0].unit.code = "01001";
  assert.equal(validateSave(bad2), false);
  const bad3 = JSON.parse(JSON.stringify(s));
  bad3.perilousVoyage.contracts.push(bad3.perilousVoyage.contracts[0]);
  assert.equal(validateSave(bad3), false);
  void act;
});
