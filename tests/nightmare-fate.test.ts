import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import {
  FATE as F,
  FATE_NIGHTMARE as FN,
} from "../src/game/fate-numenor-support";
import { fateAddIsland } from "../src/game/fate-numenor";
import {
  NIGHTMARE,
  NIGHTMARE_GH as G,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  valid,
} from "./nightmare-fixtures";
import { base, choose, reload } from "./fate-numenor-fixtures";

const ID = "the-fate-of-numenor";
const hooks = (s: GameState) => batch4Scenario(s);
const UNCHARTED = [
  FN.temple,
  FN.graves,
  FN.graves,
  FN.flooded,
  FN.jungle,
  FN.jungle,
  FN.desecrated,
  FN.desecrated,
  FN.forsaken,
  FN.forsaken,
];
/** A quiet Nightmare game with Calphon in play and the Nightmare Deck's Uncharted deck (the scenario's own fixture). */
function board(players = 1, stage = 1) {
  const s = base(players, stage);
  s.nightmareMode = true;
  s.nightmare = {};
  const q = s.fateNumenor!;
  q.unchartedDeck = [...UNCHARTED];
  q.setAside = stage === 1 ? [make(s, FN.shrine)] : [];
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
const island = (s: GameState, code: string, progress = 0) => {
  const u = fateAddIsland(s, code)!;
  u.progress = progress;
  return u;
};
const stage = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
function engaged(s: GameState, code: string, p = 0) {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.engaged.push(u);
  });
  return u;
}
const hidden = (s: GameState, code: string) =>
  s.staging.find(
    (u) => u.code === F.lost && s.fateNumenor!.hiddenBacks[u.id] === code,
  )!;

test("Nightmare: The Fate of Númenor's setup card and Nightmare Deck carry their scans' texts, stats and faces", () => {
  const setup = card(G.fateCard);
  assert.equal(setup.type_code, "nightmare");
  assert.match(
    setup.text!,
    /^Begin with the standard quest deck and encounter deck for The Fate of Númenor scenario\.\n/,
  );
  assert.ok(
    setup.text!.includes(
      "the remainder of the standard The Fate of Númenor encounter deck.",
    ),
  );
  assert.ok(
    setup.text!.endsWith(
      "the Uncharted deck from the original scenario should be replaced with the Uncharted deck reprinted in this Nightmare Deck. This has already been taken into account in the cards listed above.",
    ),
  );
  assert.deepEqual(setup.back_text!.split("\n").length, 3);
  assert.ok(setup.back_text!.includes("so that the players do not know"));
  assert.equal(
    setup.back_imagesrc,
    "/cards/d6fa1984-6016-4b44-8466-772160706d31.B.jpg",
  );
  // The reprinted and new Uncharted locations: the location face in front,
  // the shared Lost Island side behind.
  for (const code of Object.values(FN).filter((c) => c !== FN.guardian)) {
    const c = card(code);
    const guid = code.split(":")[1];
    assert.equal(c.back_name, "Lost Island", c.name);
    assert.equal(c.back_text!.split("\n").length, 4, c.name);
    assert.equal(c.imagesrc, `/cards/${guid}.jpg`);
    assert.equal(c.back_imagesrc, `/cards/${guid}.B.jpg`);
  }
  assert.equal(card(FN.shrine).is_unique, true);
  assert.equal(card(FN.shrine).victory, 5);
  assert.equal(card(FN.jungle).text!.split("\n").length, 2);
  assert.ok(
    card(FN.desecrated).text!.startsWith(
      "Each Undead enemy gets +1 [threat] and +1 [attack].\n",
    ),
  );
  const guardian = card(G.guardian);
  assert.deepEqual(
    [
      guardian.engagement,
      guardian.threat,
      guardian.attack,
      guardian.defense,
      guardian.health,
      guardian.traits,
    ],
    [41, 4, 6, 4, 10, "Undead."],
  );
  assert.equal(card(G.steps).text!.split("\n").length, 2);
  // The scan names Corrupted Flora (the catalogue had "Corrupted Fauna").
  assert.equal(card(G.flora).name, "Corrupted Flora");
  assert.ok(card(G.flora).text!.includes("only X or fewer of his characters"));
  assert.ok(card(G.folly).shadow!.includes("+X [attack]"));
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Fate of Numenor - Nightmare",
  );
  assert.equal(set.length, 12);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    21,
  );
  assert.equal(
    art.filter((x) => set.some((y) => y.code === x.code)).length,
    20,
  );
});

test("Nightmare: The Fate of Númenor's encounter deck, Uncharted deck and Shrine to Morgoth match the source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N06.2")!;
  const section = (name: string) =>
    recipe.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(G.fateCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [nightmareGame(ID, 4), nightmareForTwo(ID, 4)]) {
    const q = s.fateNumenor!;
    assert.deepEqual(
      tally(s.encounterDeck),
      tally(section("sharedEncounterDeck")),
    );
    assert.deepEqual(
      tally([...q.unchartedDeck, ...Object.values(q.hiddenBacks)]),
      tally(section("sharedEncounterDeck2")),
    );
    // Set aside: the reprinted Shrine to Morgoth (with Calphon, who enters
    // play at setup, and the scenario's rules card).
    assert.ok(section("sharedSetAside").includes(FN.shrine));
    assert.ok(section("sharedSetAside").includes(F.calphon));
    assert.deepEqual(
      q.setAside.map((u) => u.code),
      [FN.shrine],
    );
    assert.equal(nightmareCardOf(s), G.fateCard);
    assert.match(nightmareStatus(s)[0], /non-Uncharted locations/);
    assert.ok(valid(s));
  }
});

test("Nightmare: progress cannot be placed on the staging area's non-Uncharted locations", () => {
  const s = board();
  const steps = stage(s, G.steps);
  const lost = island(s, FN.temple);
  assert.equal(hooks(s).locationProgressBlocked!(s, steps), true);
  assert.equal(hooks(s).locationProgressBlocked!(s, lost), false);
  progressLocation(s, steps, 1);
  progressLocation(s, lost, 2);
  assert.equal(steps.progress, 0);
  assert.equal(lost.progress, 2);
  // A revealed location in the staging area is not Uncharted either.
  const revealed = stage(s, FN.flooded);
  progressLocation(s, revealed, 1);
  assert.equal(revealed.progress, 0);
  // The active location receives progress.
  s.activeLocation = make(s, FN.graves);
  assert.equal(hooks(s).locationProgressBlocked!(s, s.activeLocation), false);
});

test("Nightmare: travelling to Shrine to Morgoth with 3 or fewer double-sided locations in the victory display shuffles it back among the Lost Islands, and the players travel elsewhere", () => {
  let s = board(1, 2);
  s.phase = "travel";
  const shrine = island(s, FN.shrine, 2);
  island(s, FN.temple, 3);
  island(s, FN.graves, 1);
  s.victoryCards = [FN.flooded, FN.jungle, FN.desecrated];
  s = act(s, { type: "TRAVEL", id: shrine.id });
  assert.equal(s.activeLocation, null);
  assert.equal(s.staging.filter((u) => u.code === F.lost).length, 3);
  assert.ok(!get(s, shrine.id), "the shuffled islands are new cards");
  assert.ok(s.staging.every((u) => u.progress === 0));
  assert.equal(s.nightmare!.fateMustTravel, true);
  assert.throws(() => act(s, { type: "NEXT" }), /must travel/);
  s = act(s, { type: "TRAVEL", id: hidden(s, FN.temple).id });
  assert.equal(s.activeLocation!.code, FN.temple);
  assert.equal(s.nightmare!.fateMustTravel, undefined);
  assert.ok(valid(s));
  // With 4 double-sided locations in the victory display, the Shrine is
  // travelled to (and turns over).
  s = board(1, 2);
  s.phase = "travel";
  const second = island(s, FN.shrine);
  s.victoryCards = [FN.flooded, FN.jungle, FN.desecrated, FN.forsaken];
  s = act(s, { type: "TRAVEL", id: second.id });
  assert.equal(s.activeLocation!.code, FN.shrine);
  // A face-up Shrine (turned by Calphon's Folly) returns to its Lost Island
  // side; alone in the staging area, no new location is required.
  s = board(1, 2);
  s.phase = "travel";
  const faceUp = stage(s, FN.shrine);
  s = act(s, { type: "TRAVEL", id: faceUp.id });
  assert.equal(s.activeLocation, null);
  assert.equal(hidden(s, FN.shrine).code, F.lost);
  assert.equal(s.nightmare!.fateMustTravel, undefined);
  assert.ok(valid(s));
});

test("Nightmare: Overgrown Steps adds 1 threat to each staged Lost Island and costs each player 2 threat to travel there", () => {
  let s = board(2);
  const lost = island(s, FN.temple);
  const before = threatOf(s, lost);
  const steps = stage(s, G.steps);
  stage(s, G.steps);
  assert.equal(threatOf(s, lost), before + 2);
  assert.equal(threatOf(s, steps), 2);
  s.phase = "travel";
  const threats = playerOrder(s).map((p) => seatView(s, p).threat);
  s = act(s, { type: "TRAVEL", id: steps.id });
  assert.equal(s.activeLocation!.id, steps.id);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    threats.map((t) => t + 2),
  );
});

test("Nightmare: Desecrated Grounds strengthens the Undead and damages exhausted characters; Forsaken City makes them immune and attack", () => {
  let s = board();
  const dead = engaged(s, F.drowned);
  const troll = engaged(s, "01082");
  const attack = stats(s, dead).attack;
  const threat = threatOf(s, dead);
  const grounds = make(s, FN.desecrated);
  s.activeLocation = grounds;
  assert.equal(stats(s, dead).attack, attack + 1);
  assert.equal(threatOf(s, dead), threat + 1);
  assert.equal(stats(s, troll).attack, card("01082").attack);
  const [tired, rested] = s.heroes;
  tired.exhausted = true;
  queue(s, fx("fateFlipped", { target: grounds.id, code: FN.desecrated }));
  flush(s);
  assert.equal(tired.damage, 1);
  assert.equal(rested.damage, 0);
  // Forsaken City.
  s = board();
  const cadaver = engaged(s, F.cadaver);
  engaged(s, "01082");
  const city = make(s, FN.forsaken);
  s.activeLocation = city;
  assert.equal(hooks(s).immune!(s, cadaver), true);
  queue(s, fx("fateFlipped", { target: city.id, code: FN.forsaken }));
  flush(s);
  assert.match(s.choice!.title, /^Soulless Cadaver · Immediate attack/);
  assert.ok(
    !s.queue.some((e) => e.kind === "immediateAttack"),
    "the Hill Troll is not Undead",
  );
  assert.ok(valid(s));
});

test("Nightmare: Guardian of the Golden King leaves only as many attackers as the first player's bottom card costs", () => {
  let s = board();
  s.phase = "attack";
  const guardian = engaged(s, G.guardian);
  s.deck = ["01073", "01023"];
  // Counted, the first two attackers would destroy it.
  s.heroes[0].tempAttack = 20;
  s.heroes[1].tempAttack = 20;
  const kept = s.heroes[2];
  const expected = Math.max(
    0,
    stats(s, kept).attack - stats(s, guardian).defense,
  );
  s = act(s, {
    type: "ATTACK",
    enemyId: guardian.id,
    attackerIds: s.heroes.map((h) => h.id),
  });
  assert.match(
    s.choice!.title,
    /^Guardian of the Golden King · The bottom card/,
  );
  assert.equal(s.choice!.options[0].code, "01023");
  s = choose(reload(s), "resolve");
  assert.match(
    s.choice!.title,
    /^Guardian of the Golden King · Remove a character/,
  );
  assert.deepEqual(
    options(s),
    s.heroes.map((h) => h.id),
  );
  s = choose(reload(s), s.heroes[0].id);
  s = choose(reload(s), s.heroes[1].id);
  assert.equal(
    get(s, guardian.id)!.damage,
    expected,
    "only the kept attacker counts",
  );
  assert.ok(
    s.heroes.every((h) => h.exhausted),
    "the removed attackers stay exhausted",
  );
  assert.ok(valid(s));
});

test("Nightmare: Corrupted Flora removes questing characters by each player's bottom card and damages those left", () => {
  let s = board();
  s.phase = "quest";
  for (const h of s.heroes) h.committed = true;
  s.committedIds = s.heroes.map((h) => h.id);
  s.deck = ["01073", "01023"];
  hooks(s).encounter!(s, G.flora);
  flush(s);
  assert.equal(s.discard.at(-1), "01023", "the bottom card is discarded");
  assert.match(
    s.choice!.title,
    /^Corrupted Flora · Remove a character from the quest \(3 questing, at most 1\)/,
  );
  s = choose(reload(s), s.heroes[0].id);
  s = choose(reload(s), s.heroes[1].id);
  assert.deepEqual(
    s.heroes.map((h) => [h.committed, h.damage]),
    [
      [false, 0],
      [false, 0],
      [true, 1],
    ],
  );
  assert.ok(valid(s));
});

test("Nightmare: Calphon's Folly flips a Lost Island, resolves its Forced effect as if active or switches it with the active location; its shadow adds the active location's threat", () => {
  let s = board();
  const temple = island(s, FN.temple);
  const graves = island(s, FN.graves);
  const steps = make(s, G.steps);
  s.activeLocation = steps;
  hooks(s).encounter!(s, G.folly);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Calphon's Folly · Flip an Uncharted location/,
  );
  assert.deepEqual(options(s), [temple.id, graves.id]);
  s = choose(reload(s), temple.id);
  assert.equal(s.activeLocation!.code, FN.temple);
  assert.ok(s.staging.some((u) => u.id === steps.id));
  // A Forced effect resolves as if the location were active (Drowned Graves
  // discards the top cards of the encounter deck).
  hooks(s).encounter!(s, G.folly);
  flush(s);
  s = choose(reload(s), graves.id);
  assert.ok(s.staging.some((u) => u.id === graves.id && u.code === FN.graves));
  assert.equal(s.encounterDiscard.filter((c) => c === "01099").length, 3);
  // Lush Jungle stays in the staging area unless the heroes exhaust.
  s = board();
  const jungle = island(s, FN.jungle);
  hooks(s).encounter!(s, G.folly);
  flush(s);
  s = choose(reload(s), jungle.id);
  assert.deepEqual(options(s), ["exhaust", "return"]);
  assert.equal(
    s.choice!.options[1].label,
    "Leave Lush Jungle in the staging area",
  );
  s = choose(reload(s), "return");
  assert.ok(s.staging.some((u) => u.id === jungle.id && u.code === FN.jungle));
  assert.equal(
    stats(s, s.heroes[0]).attack,
    card(s.heroes[0].code).attack! - 1,
  );
  // Without an active location, a location without a Forced effect stays in
  // the staging area.
  s = board();
  const flooded = island(s, FN.flooded);
  hooks(s).encounter!(s, G.folly);
  flush(s);
  s = choose(reload(s), flooded.id);
  assert.equal(s.activeLocation, null);
  assert.ok(
    s.staging.some((u) => u.id === flooded.id && u.code === FN.flooded),
  );
  // Its shadow.
  s = board();
  s.activeLocation = make(s, FN.flooded);
  s.combat = { enemyId: "x", attackBonus: 0 } as never;
  assert.equal(hooks(s).shadow!(s, G.folly), true);
  assert.equal(s.combat!.attackBonus, 3);
});

test("Nightmare: The Fate of Númenor Nightmare games keep valid saves to their end", () => {
  for (const seed of [1, 2, 3])
    for (const s of [nightmareGame(ID, seed), nightmareForTwo(ID, seed)]) {
      const end = autoplay(s, 2500);
      assert.ok(valid(end), `seed ${seed}`);
    }
});
