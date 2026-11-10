import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canPlay,
  createGame,
  playTargets,
  validateSave,
} from "../src/game/engine";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { engage } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { deckProblems, parseRingsDbDeck } from "../src/game/decks";
import { availableAbilities } from "../src/game/actions";
import { activeSeat, forOwner, playerOrder, seatView } from "../src/game/table";
import {
  NURN_PLAYER as P,
  bondDeckProblems,
  bondHeroLimit,
  fortressNurnPlayerQuestSucceeded,
  fortressNurnPlayerStagingEnd,
  woodmanLocations,
} from "../src/game/fortress-nurn-player";
import { NURN as N } from "../src/game/fortress-nurn-support";
import { base, choose, reload, settle } from "./fortress-nurn-fixtures";
import type { GameState, Unit } from "../src/game/types";
import players from "../src/data/fortress-nurn-player-cards.json";
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
const SPHERE_CARDS = (sphere: string, n: number) =>
  playerCards
    .filter(
      (c) =>
        SCRIPTED.has(c.code) &&
        c.sphere_code === sphere &&
        ["event", "attachment", "ally"].includes(c.type_code) &&
        (c.deck_limit ?? 3) >= 2,
    )
    .reduce<Record<string, number>>((deck, c) => {
      const used = Object.values(deck).reduce((a, b) => a + b, 0);
      if (used < n && !Object.keys(deck).some((k) => card(k).name === c.name))
        deck[c.code] = Math.min(2, n - used);
      return deck;
    }, {});
const BOND_DECK: Record<string, number> = {
  ...SPHERE_CARDS("leadership", 10),
  ...SPHERE_CARDS("lore", 10),
  ...SPHERE_CARDS("spirit", 10),
  ...SPHERE_CARDS("tactics", 10),
  ...SPHERE_CARDS("neutral", 10),
  [P.bond]: 1,
};
const BOND_HEROES = ["01001", "01005", "01007", "01010"];
test("The Fortress of Nurn player designs are registered; Thorongil stays unsupported", () => {
  assert.equal(players.length, 7);
  const pack = playerCards.filter((c) =>
    c.packs?.some((p) => (typeof p === "string" ? p : p.pack_code) === "TFoN"),
  );
  assert.deepEqual(pack.map((c) => c.code).sort(), [
    "22137",
    "22138",
    "22139",
    "22140",
    "22141",
    "22142",
    "22143",
    "22144",
    "22145",
    "22147",
  ]);
  assert.ok(pack.every((c) => SCRIPTED.has(c.code)));
  assert.ok(!SCRIPTED.has("22146"));
  assert.equal(card(P.bond).type_code, "contract");
});
test("Aragorn exhausts to lower a staging location's threat by his willpower and explores it at 0", () => {
  let s = base();
  const aragorn = make(s, P.aragorn);
  aragorn.owner = 0;
  s.heroes[0] = aragorn;
  const plaza = make(s, N.plaza);
  const walls = make(s, N.walls);
  s.staging.push(plaza, walls);
  assert.deepEqual(
    availableAbilities(s, aragorn).map((a) => a.disabled),
    [false],
  );
  s = applyAction(reload(s), { type: "ABILITY", id: aragorn.id });
  s = choose(s, plaza.id);
  const p = get(s, plaza.id)!;
  assert.equal(threatOf(s, p), 0);
  assert.equal(p.progress, 1);
  assert.equal(get(s, aragorn.id)!.exhausted, true);
  get(s, aragorn.id)!.exhausted = false;
  assert.match(
    availableAbilities(s, get(s, aragorn.id)!)[0] &&
      String(
        (availableAbilities(s, get(s, aragorn.id)!)[0] as { disabled: boolean })
          .disabled,
      ),
    /true/,
    "limit once per round",
  );
  const w = get(s, walls.id)!;
  assert.equal(threatOf(s, w), 3);
});
test("Knowledge of the Enemy adds one resource per engaged enemy, once per round, in the planning phase", () => {
  let s = base();
  for (const h of s.heroes) h.phaseResourceIcons = ["leadership"];
  const e1 = make(s, N.soldier),
    e2 = make(s, N.dogs);
  s.engaged.push(e1, e2);
  const k1 = hand(s, P.knowledge),
    k2 = hand(s, P.knowledge);
  const hero = s.heroes[1];
  assert.ok(playTargets(s, k1).some((u) => u.id === hero.id));
  const before = hero.resources;
  s = applyAction(reload(s), { type: "PLAY", id: k1.id, target: hero.id });
  s = settle(s);
  assert.equal(get(s, hero.id)!.resources, before + 2);
  assert.match(canPlay(s, get(s, k2.id) ?? k2)!, /only play 1/);
  s.phase = "quest";
  assert.match(canPlay(s, k2)!, /Planning Action/);
});
test("Haleth searches the top five cards for an attachment after questing successfully", () => {
  let s = base();
  const haleth = ally(s, P.haleth);
  haleth.committed = true;
  s.deck = ["01013", "01040", "01014", "01015", "01016", "01017"];
  fortressNurnPlayerQuestSucceeded(s);
  flush(s);
  s = choose(s, "search");
  const pick = s.choice!.options.find((o) => o.code === "01040")!;
  s = choose(s, pick.id);
  assert.ok(s.hand.some((h) => h.code === "01040"));
  assert.equal(s.deck.length, 5);
});
test("Woodman Lore readies up to X Woodman characters, X counting locations with player attachments", () => {
  let s = base();
  for (const h of s.heroes) h.phaseResourceIcons = ["lore"];
  const w1 = ally(s, P.haleth);
  w1.exhausted = true;
  const loc = make(s, N.plaza);
  loc.attachments.push({ id: "pa1", code: "01023", exhausted: false });
  s.staging.push(loc, make(s, N.walls));
  assert.equal(woodmanLocations(s), 1);
  const lore = hand(s, P.lore);
  s = applyAction(reload(s), { type: "PLAY", id: lore.id });
  s = settle(s);
  assert.equal(get(s, w1.id)!.exhausted, false);
});
test("Misty Mountain Journeyman can only be played from hand while engaged with an enemy", () => {
  const s = base();
  for (const h of s.heroes) h.phaseResourceIcons = ["spirit"];
  const j = hand(s, P.journeyman);
  assert.match(canPlay(s, j)!, /engaged with an enemy/);
  s.engaged.push(make(s, N.soldier));
  assert.equal(canPlay(s, j), null);
});
test("A Desperate Path resolves the next treachery's When Revealed, then readies and boosts the player's questing characters", () => {
  let s = base(2);
  const [first] = playerOrder(s);
  for (const h of seatView(s, first).heroes) {
    h.phaseResourceIcons = ["spirit"];
    h.committed = true;
    h.exhausted = true;
  }
  const path = hand(s, P.path, first);
  assert.match(canPlay(s, path)!, /response window/);
  s.phase = "quest";
  s.encounterDeck = [N.dogs, N.defense, N.plaza];
  const will = stats(s, seatView(s, first).heroes[0]).will;
  fortressNurnPlayerStagingEnd(s);
  flush(s);
  s = choose(s, path.id);
  s = settle(s);
  const h = seatView(s, first).heroes[0];
  assert.equal(h.exhausted, false);
  assert.equal(stats(s, h).will, will + 1);
  assert.deepEqual(s.encounterDiscard.sort(), [N.defense, N.dogs].sort());
  assert.ok(s.fortressNurn!.phaseThreat.length, "Determined Defense resolved");
  assert.ok(seatView(s, first).discard.includes(P.path));
});
test("Bond of Friendship: four heroes of different spheres, exactly 50 cards with ten of each sphere and two copies per title", () => {
  assert.equal(bondHeroLimit(BOND_DECK), 4);
  assert.equal(bondHeroLimit({ "01013": 3 }), 3);
  assert.deepEqual(bondDeckProblems(BOND_HEROES, BOND_DECK), []);
  assert.deepEqual(deckProblems({ heroes: BOND_HEROES, cards: BOND_DECK }), []);
  assert.ok(
    bondDeckProblems(["01001", "01002", "01004", "01005"], BOND_DECK).some(
      (p) => /different sphere/.test(p),
    ),
  );
  const three = { ...BOND_DECK };
  const first = Object.keys(three).find((c) => c !== P.bond)!;
  three[first] = 3;
  assert.ok(
    bondDeckProblems(BOND_HEROES, three).some((p) => /2 copies/.test(p)),
  );
  assert.ok(
    deckProblems({ heroes: BOND_HEROES, cards: { "01013": 3 } }).some((p) =>
      /at most three heroes/.test(p),
    ),
  );
  const report = parseRingsDbDeck(
    {
      name: "Bond",
      heroes: Object.fromEntries(BOND_HEROES.map((h) => [h, 1])),
      slots: BOND_DECK,
    },
    "https://ringsdb.com/decklist/view/2",
  );
  assert.equal(report.deck.heroes.length, 4);
  let s = createGame(3, BOND_DECK, BOND_HEROES, "custom", {
    scenarioId: "the-fortress-of-nurn",
  });
  assert.equal(s.heroes.length, 4);
  assert.ok(!s.deck.includes(P.bond));
  assert.equal(s.fortressNurnPlayers!.contracts.length, 1);
  for (let n = 0; n < 40 && (s.choice || s.phase === "setup"); n++)
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  assert.equal(s.startingHeroes.length, 4);
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  assert.throws(
    () =>
      createGame(3, BOND_DECK, ["01001", "01002", "01004", "01005"], "custom", {
        scenarioId: "the-fortress-of-nurn",
      }),
    /different sphere/,
  );
});
void engage;
void handle;
void fx;
