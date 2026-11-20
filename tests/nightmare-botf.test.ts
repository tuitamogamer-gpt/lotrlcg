import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  BF,
  BREAKING_FELLOWSHIP_RECIPES,
  bfToughness,
} from "../src/game/breaking-fellowship";
import { automatedScenarioId } from "../src/game/support";
import {
  NIGHTMARE,
  NIGHTMARE_TRD as N,
  nightmareCardOf,
  nightmareEncounterDecks,
  nightmareStatus,
} from "../src/game/nightmare";
import {
  forOwner,
  globalPlayerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";
import { base, choose, reload } from "./breaking-fellowship-fixtures";

const ID = "breaking-of-the-fellowship";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
const GUARD = "01013";
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare table before the players separate (the scenario's own fixture). */
function board(players = 1, stage = 2) {
  const s = base(players, stage);
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
}
/** A two-player Nightmare table after stage 2B, each player at their own stage. */
function divided() {
  let s = board(2, 2);
  s.phase = "refresh";
  s.queue.push(...hooks(s).roundEnd!(s));
  flush(s);
  for (let n = 0; s.choice && n < 40; n++)
    s = choose(s, s.choice.options[0].id);
  assert.ok(s.breakingFellowship!.split);
  selectSeat(s, 0);
  return s;
}
const run = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  for (let i = 0; i < 60; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
};
const staged = (s: GameState, code: string, p?: number) => {
  let u!: Unit;
  const put = () => {
    u = make(s, code);
    s.staging.push(u);
  };
  if (p === undefined) put();
  else forOwner(s, p, put);
  return u;
};
const engagedWith = (s: GameState, code: string, p = 0) => {
  const u = make(s, code);
  forOwner(s, p, () => s.engaged.push(u));
  return u;
};
const characters = (s: GameState, p = 0): Unit[] => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const options = (s: GameState) => s.choice!.options.map((o) => o.id);
const archery = (s: GameState) =>
  s.queue
    .filter((e) => e.kind === "heirsArchery")
    .reduce((n, e) => n + (e.value ?? 0), 0);
const stagingCodes = (s: GameState, p: number) => {
  let codes: string[] = [];
  forOwner(s, p, () => (codes = s.staging.map((u) => u.code)));
  return codes;
};

test("Nightmare: Breaking of the Fellowship's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.breakingCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Breaking of the Fellowship - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Breaking of the Fellowship scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n4x Uruk-hai Archer\n2x River Anduin\n1x Slopes of Amon Hen\n2x Black Feathered Arrows\nThen, shuffle/,
  );
  assert.equal(c.back_text, "You are playing Nightmare mode.");
  const archer = card(N.isengardArcher);
  assert.deepEqual(
    [
      archer.traits,
      archer.engagement,
      archer.threat,
      archer.attack,
      archer.defense,
      archer.health,
    ],
    ["Orc. Uruk-hai.", 44, 2, 4, 2, 4],
  );
  assert.match(
    archer.text!,
    /^Toughness 1\. Archery 2\.\n/,
    "the scan's Archery (the catalogue had Archer)",
  );
  const tracker = card(N.isengardTracker);
  assert.deepEqual(
    [
      tracker.engagement,
      tracker.threat,
      tracker.attack,
      tracker.defense,
      tracker.health,
    ],
    [35, 3, 5, 1, 3],
  );
  assert.equal(
    card(N.discord).shadow,
    "Shadow: Until the end of the round, defending character cannot ready.",
  );
  assert.match(
    card(N.langflood).text!,
    /each round\.\nForced: When Langflood River/,
  );
  assert.match(
    card(N.emynMuil).text!,
    /Toughness 1\.\nTravel: A player at this stage/,
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Breaking of the Fellowship - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((a) => set.some((x) => x.code === a.code)).length, 9);
});

test("Nightmare: Breaking of the Fellowship's Nightmare deck matches its source recipe for one and two players", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    name: string;
    mode: string;
    campaign: boolean;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    section: string,
  ) =>
    r.cards
      .filter((c) => c.section === section && c.code !== N.breakingCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N0B.06")!;
  const standard = BREAKING_FELLOWSHIP_RECIPES.find(
    (r) => r.mode === "standard",
  )!;
  const sections = [
    "sharedEncounterDeck",
    "sharedStagingArea",
    "sharedSetAside",
  ];
  const piles = nightmareEncounterDecks(
    ID,
    sections.map((x) => pile(standard, x)),
    () => 0,
  );
  sections.forEach((x, i) =>
    assert.deepEqual(count(piles[i]), count(pile(nightmare, x)), x),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.breakingCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.breakingCard);
    assert.ok(valid(s));
    assert.equal(s.encounterDeck.length, 40);
    assert.ok(!s.encounterDeck.includes(BF.archer));
    assert.equal(
      s.encounterDeck.filter((c) => c === N.isengardTracker).length,
      4,
    );
  }
  assert.match(
    nightmareStatus(opening(game())).join("\n"),
    /removed the printed standard encounter cards/,
  );
  for (const id of ["N0B.06", "N0C.06"])
    assert.equal(
      automatedScenarioId(recipes.find((r) => r.id === id)!),
      id === "N0B.06" ? ID : null,
      id,
    );
});

test("Nightmare: Isengard Archer has Toughness 1 and Archery 2, makes each player at its stage deal 2 damage as it enters the staging area, and its shadow damages an ally", () => {
  const s = board(2, 2);
  const archer = staged(s, N.isengardArcher);
  assert.equal(bfToughness(s, archer), 1);
  damage(s, archer.id, 3);
  assert.equal(archer.damage, 2, "Toughness 1");
  s.phase = "combat";
  hooks(s).combatBegin!(s);
  assert.equal(archery(s), 2);
  s.queue = [];
  // Entering the staging area: both players at the shared stage.
  s.phase = "staging";
  s.encounterDeck = [N.isengardArcher, ...s.encounterDeck];
  run(s, fx("reveal", { player: 0 }));
  for (const p of globalPlayerOrder(s)) {
    assert.deepEqual(
      options(s),
      characters(s, p).map((u) => u.id),
    );
    pick(s, characters(s, p)[0].id);
  }
  assert.deepEqual(
    globalPlayerOrder(s).map((p) => characters(s, p)[0].damage),
    [2, 2],
  );
  // Its shadow: 2 damage to an ally the defending player controls.
  const t = board(1, 2);
  const ally = make(t, GUARD);
  t.allies.push(ally);
  const attacker = engagedWith(t, BF.captain);
  shadow(t, attacker, N.isengardArcher, t.heroes[0], 0);
  run(t);
  assert.deepEqual(options(t), [ally.id]);
  pick(t, ally.id);
  assert.equal(ally.damage, 2);
});

test("Nightmare: Isengard Tracker has Toughness 2 and Archery 1, moves to the first player's staging area after a kill, and its shadow moves the attacker there", () => {
  const s = divided();
  // The first player keeps their staging area; the other player's Tracker
  // moves there.
  const [first, other] = globalPlayerOrder(s);
  const tracker = engagedWith(s, N.isengardTracker, other);
  assert.equal(bfToughness(s, tracker), 2);
  const victim = characters(s, other)[0];
  s.combat = {
    enemyId: tracker.id,
    defenderId: victim.id,
    defenderIds: [victim.id],
    attackBonus: 0,
    attackPlayer: other,
  } as never;
  forOwner(s, other, () =>
    damage(s, victim.id, 99, { combatDamage: true, enemyId: tracker.id }),
  );
  assert.ok(s.combat!.nmDestroyed);
  // As the attack ends, at the defending player's seat.
  let after: Effect[] = [];
  forOwner(s, other, () => (after = hooks(s).attackFinished!(s, s.combat!)));
  run(s, ...after);
  assert.ok(stagingCodes(s, first).includes(N.isengardTracker));
  assert.ok(!seatView(s, other).engaged.some((u) => u.id === tracker.id));
  // Archery 1 in the staging area.
  const t = board(1, 2);
  staged(t, N.isengardTracker);
  t.phase = "combat";
  hooks(t).combatBegin!(t);
  assert.equal(archery(t), 1);
  // Its shadow.
  const u = board(1, 2);
  const attacker = engagedWith(u, BF.captain);
  shadow(u, attacker, N.isengardTracker, u.heroes[0], 0);
  assert.equal(u.combat!.btfGrowing, true);
});

test("Nightmare: Langflood River caps this stage's progress at 4 each round while it is staged, and moves to the staging area to the left when explored", () => {
  const s = board(1, 1);
  staged(s, N.langflood);
  const quest = mainQuestUnit(s)!;
  assert.equal(hooks(s).progress!(s, 3, quest), 3);
  assert.equal(hooks(s).progress!(s, 3, quest), 1);
  assert.equal(hooks(s).progress!(s, 3, quest), 0);
  s.round += 1;
  assert.equal(hooks(s).progress!(s, 5, quest), 4);
  // Explored: added to the staging area to the left (the next player's).
  const t = divided();
  const river = make(t, N.langflood);
  t.encounterDiscard.push(N.langflood);
  hooks(t).explored!(t, river, true);
  run(t);
  assert.ok(stagingCodes(t, 1).includes(N.langflood));
  assert.ok(!t.encounterDiscard.includes(N.langflood));
  // Before the players separate, it stays discarded.
  const u = board(1, 1);
  u.encounterDiscard.push(N.langflood);
  hooks(u).explored!(u, make(u, N.langflood), true);
  run(u);
  assert.ok(u.encounterDiscard.includes(N.langflood));
});

test("Nightmare: Western Emyn Muil gives Toughness 1 to each Uruk-hai enemy at its stage, and its travel cost engages the highest toughness enemy", () => {
  const s = divided();
  const archer = staged(s, N.isengardArcher);
  const captain = staged(s, BF.captain);
  const elsewhere = staged(s, N.isengardArcher, 1);
  staged(s, N.emynMuil);
  assert.equal(bfToughness(s, archer), 2);
  staged(s, N.emynMuil);
  assert.equal(bfToughness(s, archer), 3);
  assert.equal(
    bfToughness(s, captain),
    2 + 2,
    "Uruk-hai Captain is Uruk-hai too",
  );
  assert.equal(bfToughness(s, elsewhere), 1, "another stage is unaffected");
  const emyn = make(s, N.emynMuil);
  assert.equal(hooks(s).travelProblem!(s, emyn), null);
  run(s, ...hooks(s).travelEffects!(s, emyn)!);
  assert.deepEqual(options(s), [captain.id]);
  pick(s, captain.id);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === captain.id));
  const t = board(1, 2);
  assert.match(
    hooks(t).travelProblem!(t, make(t, N.emynMuil)) ?? "",
    /must engage the highest toughness enemy/,
  );
});

test("Nightmare: Arrows in the Night adds 6 archery at its stage for the round, less each card discarded, and its shadow discards a random card", () => {
  const s = board(1, 2);
  s.hand.push(make(s, GUARD), make(s, GUARD), make(s, GUARD));
  revealed(s, N.arrowsNight);
  run(s);
  pick(s, s.hand[0].id);
  pick(s, s.hand[0].id);
  pick(s, "done");
  assert.equal(s.hand.length, 1);
  assert.equal(hooks(s).areaArchery!(s, "shared"), 4);
  s.phase = "combat";
  s.queue = [];
  staged(s, N.isengardArcher);
  hooks(s).combatBegin!(s);
  assert.equal(archery(s), 4 + 2);
  s.queue = [];
  s.round += 1;
  assert.equal(hooks(s).areaArchery!(s, "shared"), 0);
  const t = board(1, 2);
  t.hand.push(make(t, GUARD));
  const attacker = engagedWith(t, BF.captain);
  shadow(t, attacker, N.arrowsNight, t.heroes[0], 0);
  run(t);
  assert.equal(t.hand.length, 0);
});

test("Nightmare: Hunting the Ring surges onto the current quest, and at the end of the round raises threat for each enemy at its stage and sends them to the first player's staging area", () => {
  const s = divided();
  forOwner(s, 1, () => {
    s.encounterDeck = [GUARD, ...s.encounterDeck];
    revealed(s, N.huntingRing);
  });
  run(s);
  assert.equal(s.nightmare!.breakingHunting!.length, 1);
  staged(s, BF.captain, 1);
  staged(s, BF.hunter, 1);
  const before = seatView(s, 1).threat;
  run(s, ...hooks(s).roundEnd!(s).filter((e) => e.kind === "nbfHunting"));
  assert.equal(seatView(s, 1).threat, before + 2);
  assert.deepEqual(s.nightmare!.breakingHunting, []);
  assert.ok(s.encounterDiscard.includes(N.huntingRing));
  assert.ok(stagingCodes(s, 0).includes(BF.captain));
  assert.ok(stagingCodes(s, 0).includes(BF.hunter));
  // Its stage left play: it is discarded with it.
  const t = board(1, 2);
  revealed(t, N.huntingRing);
  run(t);
  t.breakingFellowship!.currentQuest = BF.river;
  const threat = t.threat;
  run(t, ...hooks(t).roundEnd!(t).filter((e) => e.kind === "nbfHunting"));
  assert.equal(t.threat, threat);
  assert.ok(t.encounterDiscard.includes(N.huntingRing));
});

test("Nightmare: Discord and Distrust blocks Actions and Responses for the round with doomed 2, and its shadow keeps the defending character from readying", () => {
  const s = board(2, 2);
  const threats = globalPlayerOrder(s).map((p) => seatView(s, p).threat);
  revealed(s, N.discord);
  run(s);
  assert.deepEqual(
    globalPlayerOrder(s).map((p) => seatView(s, p).threat),
    threats.map((t) => t + 2),
    "its printed doomed 2",
  );
  assert.equal(hooks(s).abilitiesBlocked!(s, 0), true);
  assert.equal(hooks(s).abilitiesBlocked!(s, 1), true);
  s.round += 1;
  assert.equal(hooks(s).abilitiesBlocked!(s, 0), false);
  const t = board(1, 2);
  const defender = t.heroes[0];
  const attacker = engagedWith(t, BF.captain);
  shadow(t, attacker, N.discord, defender, 0);
  assert.equal(hooks(t).cannotReady!(t, defender), true);
  assert.equal(hooks(t).cannotReady!(t, t.heroes[1]), false);
  t.round += 1;
  assert.equal(hooks(t).cannotReady!(t, defender), false);
});

test("Nightmare: Breaking of the Fellowship's Nightmare archery stays at its own stage once the players separate", () => {
  const s = divided();
  const [first, other] = globalPlayerOrder(s);
  staged(s, N.isengardArcher, first);
  staged(s, N.isengardTracker, first);
  forOwner(s, other, () => revealed(s, N.arrowsNight));
  run(s);
  s.phase = "combat";
  s.queue = [];
  hooks(s).combatBegin!(s);
  assert.deepEqual(
    s.queue
      .filter((e) => e.kind === "heirsArchery")
      .map((e) => [e.player, e.value]),
    [
      [first, 3],
      [other, 6],
    ],
  );
});

test("Nightmare: Breaking of the Fellowship's Nightmare state survives saves, and malformed state is refused", () => {
  const s = board(1, 2);
  s.hand.push(make(s, GUARD));
  revealed(s, N.arrowsNight);
  run(s);
  pick(s, s.hand[0].id);
  revealed(s, N.discord);
  run(s);
  hooks(s).progress!(s, 2, mainQuestUnit(s)!);
  s.nightmare!.breakingHunting = [{ area: "shared", quest: BF.divided }];
  s.choice = null;
  const back = reload(s);
  assert.deepEqual(back.nightmare, s.nightmare);
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s));
    f(x);
    return valid(x);
  };
  assert.equal(
    broken((x) => (x.nightmare!.breakingDiscord = -1)),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.breakingArrows = [{ area: 1 } as never])),
    false,
  );
  assert.equal(
    broken(
      (x) =>
        (x.nightmare!.breakingProgress = [
          { area: "shared", round: 1, placed: -2 },
        ]),
    ),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.breakingNoReady = [{ id: 3 } as never])),
    false,
  );
});

test("Nightmare: Breaking of the Fellowship's seeded Nightmare games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
