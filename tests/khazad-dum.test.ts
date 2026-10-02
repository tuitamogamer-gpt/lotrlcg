import { applyAction as act } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  availableAbilities,
  canCommit,
  canPlay,
  canTravel,
  createGame,
  playTargets,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  advanceQuest,
  check,
  damage,
  destroy,
  engage,
  nextRound,
  progress,
  progressLocation,
  resolveReveal,
  shadow,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  fx,
  make,
  stats,
  stageInfo,
  threatOf,
  questWill,
} from "../src/game/core";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  attackersFor,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  KHAZAD as K,
  KHAZAD_ENCOUNTERS,
  KHAZAD_QUESTS,
  khazadBeforeStaging,
  khazadQuestEnd,
  khazadStageInfo,
  khazadStagingEnd,
} from "../src/game/khazad-dum";
import {
  beginEnemyAttack,
  combatDamage,
  resolvePlayerAttack,
} from "../src/game/combat";
import type { GameState, ScenarioId, Unit } from "../src/game/types";
import recipes from "../public/scenarios.json";
const leadership = STARTERS.find((d) => d.id === "leadership")!;
const tactics = STARTERS.find((d) => d.id === "tactics")!;
const spirit = STARTERS.find((d) => d.id === "spirit")!;
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function settle(s: GameState) {
  for (let i = 0; i < 150 && s.status === "playing"; i++) {
    if (s.choice)
      s = choose(
        s,
        s.choice.options.find((o) => ["skip", "resolve"].includes(o.id))?.id ??
          s.choice.options[0].id,
      );
    else if (s.phase === "setup") s = act(s, { type: "KEEP" });
    else break;
  }
  return s;
}
function base(
  scenarioId: ScenarioId = "the-seventh-level",
  players = 1,
  deck = leadership,
) {
  let s: GameState | undefined;
  for (let seed = 1; seed < 50; seed++) {
    const candidate = settle(
      createGame(seed, deck.cards, deck.heroes, deck.id, {
        scenarioId,
        ...(players > 1
          ? {
              seats: [deck, ...STARTERS.filter((d) => d.id !== deck.id)]
                .slice(0, players)
                .map((d) => ({ deckId: d.id, heroes: [...d.heroes] })),
            }
          : {}),
      }),
    );
    if (candidate.status === "playing" && candidate.phase !== "setup") {
      s = candidate;
      break;
    }
  }
  assert.ok(s);
  s.phase = "planning";
  s.stage = 1;
  s.progress = 0;
  s.victory = 0;
  s.queue = [];
  s.choice = null;
  s.staging = [];
  s.encounterDiscard = [];
  s.encounterDeck = Array(20).fill("01089");
  s.activeLocation = null;
  delete s.extraActiveLocations;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.hand = [];
      s.allies = [];
      s.engaged = [];
      s.used = [];
    });
  for (const h of allHeroes(s)) {
    h.exhausted = false;
    h.committed = false;
    h.damage = 0;
    h.resources = 8;
    h.attachments = [];
  }
  s.khazad = { victoryCards: [], questDeck: [] };
  if (scenarioId === "flight-from-moria") {
    s.stage = 2;
    s.victory = 2;
    s.khazad = {
      victoryCards: [K.presence],
      questDeck: KHAZAD_QUESTS.filter(
        (q) =>
          q.encounter_set === "Flight from Moria" &&
          q.code !== K.presence &&
          q.code !== K.wrong,
      ).map((q) => q.code),
      activeQuest: K.wrong,
      questSide: "A",
    };
    s.staging.push(make(s, K.nameless));
  }
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  return s;
}
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  if (
    s.choice?.title.startsWith("Revealed:") &&
    s.choice.options.some((o) => o.id === "resolve")
  )
    s = choose(s, "resolve");
  return s;
}
function attachment(s: GameState, u: Unit, code: string) {
  const a = {
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    owner: ownerOf(s, u),
  };
  u.attachments.push(a);
  return a;
}
function enemy(s: GameState, code: string, player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function combat(
  s: GameState,
  code: string,
  shadowCode: string,
  defended = false,
) {
  const u = enemy(s, code);
  u.shadows = [shadowCode];
  u.revealedShadowCount = 1;
  s.phase = "defense";
  s.combat = {
    enemyId: u.id,
    defenderId: defended ? s.heroes[0].id : null,
    defenderIds: defended ? [s.heroes[0].id] : [],
    attackBonus: 0,
  };
  return u;
}
function flight(s: GameState, code: string, side: "A" | "B" = "B") {
  s.stage = 2;
  s.khazad!.activeQuest = code;
  s.khazad!.questSide = side;
  s.khazad!.questDeck = KHAZAD_QUESTS.filter(
    (q) =>
      q.encounter_set === "Flight from Moria" &&
      q.code !== K.presence &&
      q.code !== code,
  ).map((q) => q.code);
  s.progress = 0;
  delete s.khazad!.narrowIds;
}

test("Khazad registers all fifty encounter designs and thirteen exact quest designs, with corrected reverse-side victory", () => {
  assert.equal(KHAZAD_ENCOUNTERS.length, 50);
  assert.equal(KHAZAD_QUESTS.length, 13);
  for (const c of [...KHAZAD_ENCOUNTERS, ...KHAZAD_QUESTS])
    assert.ok(SCRIPTED.has(c.code), c.name);
  for (const [code, value] of [
    [K.presence, 2],
    [K.council, 2],
    [K.up, 1],
    [K.down, 1],
    [K.narrow, 1],
  ] as const)
    assert.equal(KHAZAD_QUESTS.find((c) => c.code === code)!.victory, value);
});
test("Into Pit and Seventh normal/easy setup choices precede reveals and retain 1–4player exact recipes", () => {
  for (const [scenarioId, id, objective, location] of [
    ["into-the-pit", "02.1", K.torch, K.east],
    ["the-seventh-level", "02.2", K.book, undefined],
  ] as const)
    for (const easy of [false, true])
      for (const players of [1, 2, 3, 4]) {
        let s = createGame(
          1,
          leadership.cards,
          leadership.heroes,
          leadership.id,
          {
            scenarioId,
            easy,
            ...(players > 1
              ? {
                  seats: STARTERS.slice(0, players).map((d) => ({
                    deckId: d.id,
                    heroes: [...d.heroes],
                  })),
                }
              : {}),
          },
        );
        assert.ok(s.choice);
        assert.equal(s.staging.length, 0);
        assert.equal(s.activeLocation?.code, location);
        const counts: Record<string, number> = {};
        for (const c of s.encounterDeck) counts[c] = (counts[c] ?? 0) + 1;
        assert.deepEqual(
          counts,
          recipes.find((q) => q.id === `${easy ? "E" : "Q"}${id}`)!.sections
            .sharedEncounterDeck,
        );
        s.encounterDeck = Array(players + 1).fill("01089");
        s = choose(s, s.choice!.options[0].id);
        assert.equal(
          allHeroes(s)
            .flatMap((h) => h.attachments)
            .filter((a) => a.code === objective).length,
          1,
        );
        assert.equal(s.staging.length, players);
      }
});
test("East-gate blocks both engagement types and every card effect; exploration opens First Hall, then Bridge", () => {
  let s = base("into-the-pit");
  const gate = make(s, K.east);
  s.activeLocation = gate;
  const e = make(s, K.scout);
  s.staging.push(e);
  s.phase = "encounter";
  assert.throws(
    () => act(s, { type: "ENGAGE", id: e.id }),
    /optional|location|East/,
  );
  handle(s, fx("automaticEngagement"));
  assert.equal(s.engaged.length, 0);
  handle(s, fx("locationProgress", { target: gate.id, value: 9 }));
  assert.equal(gate.progress, 0);
  s = reveal(s, K.gap);
  assert.ok(
    allActiveLocations(s).some((l) => l.id === gate.id),
    "Dreadful Gap cannot displace immune East-gate",
  );
  s.activeLocation = gate;
  delete s.extraActiveLocations;
  s.staging = [];
  progressLocation(s, gate, 7);
  flush(s);
  const hall = s.staging.find((l) => l.code === K.hall)!;
  assert.ok(hall);
  assert.equal(s.victory, 1);
  s.phase = "travel";
  const before = s.threat;
  s = act(s, { type: "TRAVEL", id: hall.id });
  assert.equal(s.threat, before + 3);
  progressLocation(s, s.activeLocation!, 2);
  flush(s);
  const bridge = s.staging.find((l) => l.code === K.bridge)!;
  assert.ok(bridge);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: bridge.id });
  s.hand = [make(s, "01023")];
  assert.match(canPlay(s, s.hand[0])!, /Bridge|play/);
  s.progress = 7;
  advanceQuest(s);
  assert.equal(s.stage, 1);
  progressLocation(s, s.activeLocation!, 3);
  check(s);
  advanceQuest(s);
  flush(s);
  assert.ok(s.khazad!.victoryCards.includes(K.bridge));
  assert.equal(s.stage, 2);
  assert.match(s.choice!.title, /Goblin Patrol/);
});
test("Goblin Patrol searches all players, forces at least one available Leader and accepts eleven progress or no enemies", () => {
  let s = base("into-the-pit", 2);
  s.progress = 7;
  s.khazad!.victoryCards.push(K.bridge);
  s.encounterDeck = [K.scout, K.leader];
  s.encounterDiscard = [K.swordsman];
  advanceQuest(s);
  flush(s);
  s = choose(s, K.scout);
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    [K.leader],
  );
  s = choose(s, K.leader);
  assert.equal(s.stage, 2);
  assert.equal(s.staging.length, 2);
  assert.equal(s.encounterDeck.length, 0);
  assert.ok(!s.staging.some((u) => u.code === K.swordsman));
  s.phase = "quest";
  s = reveal(s, K.follower);
  assert.ok([...s.encounterDeck, ...s.encounterDiscard].includes(K.follower));
  assert.ok(!allEngaged(s).some((u) => u.code === K.follower));
  s.progress = 11;
  advanceQuest(s);
  assert.equal(s.stage, 3);
  const resources = allHeroes(s).map((h) => h.resources);
  nextRound(s);
  assert.deepEqual(
    allHeroes(s).map((h) => h.resources),
    resources,
  );
  s.progress = 12;
  advanceQuest(s);
  assert.equal(s.status, "won");
  const clear = base("into-the-pit");
  clear.stage = 2;
  advanceQuest(clear);
  assert.equal(clear.stage, 3);
});
test("Patrol Leader checks each actual damage instance and cancellation suppresses lethal attack responses", () => {
  const s = base("into-the-pit", 1, tactics),
    leader = enemy(s, K.leader);
  s.encounterDeck = [K.scout, K.roads];
  const legolas = s.heroes.find((h) => h.code === "01005")!;
  legolas.tempAttack = 10;
  resolvePlayerAttack(s, leader, [legolas.id], 0);
  assert.equal(leader.damage, 0);
  assert.equal(s.progress, 0);
  assert.ok(!s.queue.some((e) => e.kind === "attackProgress"));
  damage(s, leader.id, 1);
  assert.equal(leader.damage, 1);
  assert.ok(s.encounterDiscard.includes(K.roads));
  assert.equal(s.encounterDeck.length, 0);
  combat(s, K.leader, K.leader);
  shadow(s, K.leader);
  const current = allEngaged(s).at(-1)!;
  const before = s.encounterDeck.length;
  damage(s, current.id, 5);
  assert.equal(current.damage, 0);
  assert.equal(s.encounterDeck.length, before);
});
test("Torch action, cancellation and Lightless Passage cost all exhaust the actual Torch and discard without revealing", () => {
  for (const action of ["action", "cancel", "travel"]) {
    let s = base("into-the-pit");
    const h = s.heroes[0],
      a = attachment(s, h, K.torch),
      l = make(s, action === "travel" ? K.passage : K.shaft);
    s.staging = [l];
    s.encounterDeck = [K.follower, K.signs];
    if (action === "action") {
      s = act(s, { type: "ABILITY", id: h.id, attachmentId: a.id });
      s = choose(s, `${l.id}:3`);
      assert.equal(s.staging.find((u) => u.id === l.id)!.progress, 3);
    } else if (action === "cancel") {
      s = reveal(s, K.burning);
      s = choose(s, a.id);
      assert.equal(s.staging.find((u) => u.id === l.id)!.tempThreat ?? 0, 0);
    } else {
      s.phase = "travel";
      s = act(s, { type: "TRAVEL", id: l.id });
      s = choose(s, a.id);
      assert.equal(s.activeLocation!.id, l.id);
    }
    assert.equal(allHeroes(s)[0].attachments[0].exhausted, true);
    assert.ok(s.staging.some((u) => u.code === K.follower));
    assert.equal(allEngaged(s).length, 0);
    assert.equal(
      s.encounterDeck.length,
      1,
      "Torch's discarded follower does not reveal or engage",
    );
  }
});
test("Torch leaving play is removed rather than discarded or returned to staging", () => {
  const s = base("into-the-pit"),
    h = s.heroes[0];
  attachment(s, h, K.torch);
  destroy(s, h, false);
  assert.ok(s.removed.includes(K.torch));
  assert.ok(!s.encounterDiscard.includes(K.torch));
  assert.ok(!s.staging.some((u) => u.code === K.torch));
});
test("Branching Paths boosts Dark locations per staged copy and preserves the chosen bottom order", () => {
  let s = base("into-the-pit"),
    a = make(s, K.branching),
    b = make(s, K.branching),
    dark = make(s, K.shaft);
  s.staging = [a, b, dark];
  assert.equal(threatOf(s, dark), 7);
  s.encounterDeck = [K.scout, K.well, K.hall, K.roads];
  progressLocation(s, a, 3);
  flush(s);
  s = choose(s, "0");
  assert.match(s.choice!.title, /Order/);
  s = choose(s, "1");
  assert.deepEqual(s.encounterDeck, [K.roads, K.hall, K.well]);
  assert.ok(s.staging.some((u) => u.code === K.scout));
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.code === K.shaft)!,
    ),
    6,
  );
});
test("Burning Low affects exactly current staged enemies/locations until phase end and its shadow adds two attack", () => {
  let s = base("into-the-pit");
  const dark = make(s, K.shaft),
    other = make(s, K.hall),
    gob = make(s, K.scout);
  s.staging = [dark, other, gob];
  s = reveal(s, K.burning);
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.id === dark.id)!,
    ),
    8,
  );
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.id === other.id)!,
    ),
    3,
  );
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.id === gob.id)!,
    ),
    4,
  );
  s.staging.push(make(s, K.scout));
  assert.equal(threatOf(s, s.staging.at(-1)!), 3);
  handle(s, fx("phaseEnd"));
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.id === dark.id)!,
    ),
    5,
  );
  combat(s, K.scout, K.burning);
  shadow(s, K.burning);
  assert.equal(s.combat!.attackBonus, 2);
});
test("Cave In removes quest and selected active progress, gains Surge only when none removed, and ignores East-gate", () => {
  let s = base("into-the-pit"),
    a = make(s, K.shaft),
    b = make(s, K.hall);
  a.progress = 2;
  b.progress = 1;
  s.activeLocation = a;
  s.extraActiveLocations = [b];
  s.progress = 3;
  s = reveal(s, K.caveIn);
  s = choose(s, b.id);
  assert.equal(s.progress, 0);
  assert.equal(allActiveLocations(s).find((l) => l.id === a.id)!.progress, 2);
  assert.equal(allActiveLocations(s).find((l) => l.id === b.id)!.progress, 0);
  assert.equal(s.staging.length, 0);
  const empty = reveal(base("into-the-pit"), K.caveIn);
  assert.equal(empty.staging.length, 1);
  const immune = base("into-the-pit");
  immune.activeLocation = make(immune, K.east);
  immune.activeLocation.progress = 2;
  reveal(immune, K.caveIn);
  assert.equal(immune.activeLocation.progress, 2);
});
test("Crumbling Ruin discards a character rather than destroying it, compares printed X as zero and still discards when none ready", () => {
  let s = base("into-the-pit"),
    h = s.heroes[0];
  h.damage = 4;
  s.deck = ["01024"];
  s = reveal(s, K.ruin);
  s = choose(s, h.id);
  assert.ok(!s.heroes.some((u) => u.id === h.id));
  assert.ok(s.discard.includes(h.code));
  const x = base("into-the-pit");
  x.deck = ["01051"];
  const hero = x.heroes[0];
  const r = reveal(x, K.ruin);
  const done = choose(r, hero.id);
  assert.ok(done.heroes.some((u) => u.id === hero.id));
  const exhausted = base("into-the-pit");
  for (const h of exhausted.heroes) h.exhausted = true;
  exhausted.deck = ["01023"];
  reveal(exhausted, K.ruin);
  assert.deepEqual(exhausted.deck, []);
  assert.ok(exhausted.discard.includes("01023"));
});
test("Dreadful Gap quest points follow current character count, moves one active location with progress and immediately travels", () => {
  let s = base("into-the-pit"),
    a = make(s, K.hall);
  a.progress = 1;
  s.activeLocation = a;
  s = reveal(s, K.gap);
  assert.equal(s.activeLocation!.code, K.gap);
  assert.ok(s.staging.some((u) => u.id === a.id));
  assert.equal(s.staging.find((u) => u.id === a.id)!.progress, 1);
  const gap = s.activeLocation!;
  progressLocation(s, gap, 2);
  assert.ok(s.activeLocation);
  s.allies.push(make(s, "01013"));
  progressLocation(s, gap, 1);
  assert.ok(s.activeLocation);
  progressLocation(s, gap, 1);
  assert.equal(s.activeLocation, null);
  assert.equal(s.victory, 3);
});
test("Fouled Well asks each player independently for a random hand discard and surges if any player declines", () => {
  let s = base("into-the-pit", 2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => (s.hand = [make(s, "01023"), make(s, "01024")]));
  s = reveal(s, K.well);
  s = choose(s, "discard");
  s = choose(s, "skip");
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 2);
  assert.equal(s.staging.length, 2);
});
test("Goblin Follower engages the last player; Scouts and Turbulent Waters enforce optional engagement restrictions", () => {
  let s = reveal(base("the-seventh-level", 3), K.follower);
  assert.ok(seatView(s, 2).engaged.some((u) => u.code === K.follower));
  assert.equal(seatView(s, 0).engaged.length, 0);
  const scout = make(s, K.scout);
  s.staging.push(scout);
  s.phase = "encounter";
  s.threat = 25;
  assert.throws(() => act(s, { type: "ENGAGE", id: scout.id }), /25|Scout/);
  s.threat = 24;
  s.activeLocation = make(s, K.waters);
  assert.throws(
    () => act(s, { type: "ENGAGE", id: scout.id }),
    /optional|location/,
  );
});
test("Goblin Tunnels remove progress only on real Goblin revelation; Archer damages first player's chosen character", () => {
  let s = base("the-seventh-level", 2);
  s.staging = [make(s, K.tunnels), make(s, K.tunnels), make(s, K.archer)];
  s.progress = 5;
  const h = s.heroes[0];
  s = reveal(s, K.swordsman);
  assert.equal(s.progress, 3);
  assert.match(s.choice!.title, /Archer/);
  s = choose(s, h.id);
  assert.equal(seatView(s, 0).heroes[0].damage, 1);
  s.encounterDeck = [K.swordsman];
  handle(s, fx("khazadTorchDiscard"));
  assert.equal(s.progress, 3, "placement does not reveal");
});
test("Goblin Spearman/Swordsman undefended bonuses and shadows physically move the shadow into staging", () => {
  for (const code of [K.spearman, K.swordsman]) {
    const s = base();
    const e = combat(s, code, code);
    shadow(s, code);
    assert.equal(e.shadows.length, 0);
    assert.equal(e.revealedShadowCount, 0);
    assert.ok(s.staging.some((u) => u.code === code));
  }
});
test("Shadow effects for Bitter Wind, Stairs, Signs, Mountain Warg, Tunnels and Follower resolve their exact branches", () => {
  for (const code of [
    K.bitter,
    K.stairs,
    K.signs,
    K.warg,
    K.tunnels,
    K.follower,
  ]) {
    let s = base();
    combat(s, K.swordsman, code);
    const threat = s.threat;
    shadow(s, code);
    flush(s);
    if (code === K.bitter) assert.ok(s.heroes.every((h) => h.resources === 6));
    if (code === K.stairs) {
      s = choose(s, s.heroes[0].id);
      assert.equal(s.heroes[0].exhausted, true);
    }
    if (code === K.signs) assert.equal(s.threat, threat + 2);
    if (code === K.tunnels) assert.equal(s.combat!.attackBonus, 3);
    if (code === K.follower) assert.equal(s.combat!.attackBonus, 2);
    if (code === K.warg) assert.equal(s.combat!.attackBonus, 1);
  }
});
test("Black Uruks discards any questing attachment chosen by first player; shadow adds and resolves two extra shadows before damage", () => {
  let s = base("the-seventh-level", 2);
  const h = seatView(s, 1).heroes[0];
  h.committed = true;
  const a = attachment(s, h, "01041");
  s = reveal(s, K.uruks);
  s = choose(s, a.id);
  assert.equal(seatView(s, 1).heroes[0].attachments.length, 0);
  const extra = base();
  const e = combat(extra, K.scout, K.uruks);
  extra.encounterDeck = [K.signs, K.burning];
  shadow(extra, K.uruks);
  flush(extra);
  assert.equal(e.shadows.length, 3);
  assert.equal(e.revealedShadowCount, 3);
  assert.equal(extra.threat, 22);
  assert.equal(extra.combat!.attackBonus, 2);
});
test("Cave-troll excess combat damage is allocated one at a time to different surviving characters", () => {
  let s = base();
  const troll = enemy(s, K.caveTroll);
  const victim = make(s, "01013");
  s.allies = [victim];
  combatDamage(s, victim, troll, 4);
  flush(s);
  assert.match(s.choice!.title, /Excess/);
  const hero = s.heroes[0];
  s = choose(s, hero.id);
  s = choose(s, hero.id);
  assert.equal(s.heroes[0].damage, 2);
  assert.ok(!s.allies.length);
});
test("Hidden Threat counts staging enemies and asks the last player to discard a controlled attachment", () => {
  let s = base("the-seventh-level", 2);
  s.staging = [make(s, K.scout), make(s, K.swordsman)];
  const h = seatView(s, 1).heroes[0],
    a = attachment(s, h, "01041");
  s = reveal(s, K.hidden);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
  s = choose(s, a.id);
  assert.equal(seatView(s, 1).heroes[0].attachments.length, 0);
});
test("Knees and Armoury attack boosts apply exactly while staged and engagement boosts last until round end", () => {
  const s = base();
  s.staging = [make(s, K.knees), make(s, K.armoury)];
  const e = make(s, K.scout);
  s.staging.push(e);
  assert.equal(stats(s, e).attack, 2);
  engage(s, e);
  assert.equal(stats(s, e).attack, 3);
  s.staging = [];
  assert.equal(stats(s, e).attack, 2);
  handle(s, fx("endRound"));
  flush(s);
  assert.equal(stats(s, e).attack, 1);
});
test("Plundered Armoury optionally attaches a legal Weapon or Armour without playing/paying and Warg Lair draws per player", () => {
  let s = base();
  const armoury = make(s, K.armoury);
  s.staging = [armoury];
  s.hand = [make(s, "01039")];
  progressLocation(s, armoury, 2);
  flush(s);
  assert.match(s.choice!.title, /Armoury/);
  const option = s.choice!.options.find((o) => o.code === "01039")!;
  const res = s.heroes[0].resources;
  s = choose(s, option.id);
  assert.equal(s.hand.length, 0);
  assert.ok(
    s.heroes.some((h) => h.attachments.some((a) => a.code === "01039")),
  );
  assert.equal(s.heroes[0].resources, res);
  const lair = make(s, K.lair);
  s.staging.push(lair);
  const n = s.hand.length;
  progressLocation(s, lair, 3);
  flush(s);
  s = choose(s, "draw");
  assert.equal(s.hand.length, n + 1);
});
test("Many Roads shuffles only discarded locations and surges; Chance Encounter moves the top discarded enemy without revealing", () => {
  let s = base();
  s.encounterDiscard = [K.hall, K.scout, K.shaft];
  s.encounterDeck = [K.signs];
  s = reveal(s, K.chance);
  assert.ok(s.engaged.some((e) => e.code === K.scout));
  assert.equal(s.choice, null);
  s.encounterDeck = ["01089"];
  s = reveal(s, K.roads);
  assert.ok(!s.encounterDiscard.includes(K.hall));
  assert.ok(!s.encounterDiscard.includes(K.shaft));
  assert.equal(s.encounterDeck.length, 2);
});
test("Massing reveals one additional card per player after Doomed; Drummer, Stray and Roots variables follow living players", () => {
  let s = base("flight-from-moria", 3);
  s.staging = [];
  s.encounterDeck = Array(6).fill("01089");
  s = reveal(s, K.massing);
  assert.equal(s.staging.length, 3);
  assert.equal(seatView(s, 0).threat, 21);
  const drum = make(s, K.drummer),
    stray = make(s, K.stray),
    roots = make(s, K.roots);
  s.staging = [drum, stray, roots];
  assert.equal(threatOf(s, drum), 4);
  assert.equal(threatOf(s, stray), 6);
  assert.equal(stats(s, stray).attack, 3);
  assert.equal(threatOf(s, roots), 3);
  forOwner(s, 2, () => (s.threat = 50));
  check(s);
  assert.equal(threatOf(s, stray), 4);
  assert.equal(stats(s, stray).attack, 2);
});
test("Dark and Dreadful wounds every exhausted character, doubles at Dark active, and its shadow discards/damages defenders correctly", () => {
  let s = base();
  s.heroes[0].exhausted = true;
  s.activeLocation = make(s, K.shaft);
  s = reveal(s, K.dreadful);
  assert.equal(s.heroes[0].damage, 2);
  assert.equal(s.heroes[1].damage, 0);
  const d = base();
  combat(d, K.scout, K.dreadful, true);
  shadow(d, K.dreadful);
  flush(d);
  assert.equal(d.heroes[0].damage, 1);
  const p = base();
  const ally = make(p, "01013");
  p.allies.push(ally);
  combat(p, K.scout, K.pitfall);
  p.combat!.defenderId = ally.id;
  p.combat!.defenderIds = [ally.id];
  shadow(p, K.pitfall);
  flush(p);
  assert.equal(p.allies.length, 0);
});
test("Sudden Pitfall and A Foe Beyond never offer cancellation; Undisturbed Bones damages one ally by own ally count", () => {
  let s = base();
  s.hand = [make(s, "01050")];
  s.heroes[0].committed = true;
  s.phase = "quest";
  s = reveal(s, K.pitfall);
  assert.ok(!s.choice!.options.some((o) => o.id.includes("cancel")));
  const id = s.heroes[0].id;
  s = choose(s, id);
  assert.ok(!s.heroes.some((u) => u.id === id));
  const b = base();
  b.allies = [make(b, "01013"), make(b, "01014")];
  const r = reveal(b, K.bones);
  const done = choose(r, r.allies[1].id);
  assert.equal(done.allies[1].damage, 2);
});
test("Book grants quest commitment without exhaustion, prevents attacks but allows defense, returns on detachment and is removed at stage two", () => {
  let s = base();
  const h = s.heroes[0];
  attachment(s, h, K.book);
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: h.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(s.heroes[0].exhausted, false);
  const e = enemy(s, K.scout);
  assert.ok(!attackersFor(s, e).some((u) => u.id === h.id));
  s.queue = [];
  s.choice = null;
  s.phase = "planning";
  s.progress = 15;
  advanceQuest(s);
  assert.equal(s.stage, 2);
  assert.ok(s.removed.includes(K.book));
  assert.ok(
    !allHeroes(s)
      .flatMap((h) => h.attachments)
      .some((a) => a.code === K.book),
  );
});
test("Fate of Balin reveals extra enemies with their real effects and discards treacheries/locations without Doomed, Surge or WR", () => {
  let s = base("the-seventh-level", 2);
  s.stage = 2;
  s.encounterDeck = [K.signs, K.follower, K.scout];
  khazadStagingEnd(s);
  flush(s);
  assert.equal(s.threat, 20);
  assert.ok(s.encounterDiscard.includes(K.signs));
  assert.ok(seatView(s, 1).engaged.some((e) => e.code === K.follower));
  assert.deepEqual(s.encounterDeck, [K.scout]);
});
test("Watchful Eyes attaches only once to a first-player hero and reveals at combat end only if bearer exhausted", () => {
  let s = base();
  s = reveal(s, K.eyes);
  s = choose(s, s.heroes[0].id);
  assert.ok(s.heroes[0].attachments.some((a) => a.code === K.eyes));
  s.heroes[0].exhausted = true;
  s.phase = "attack";
  s.encounterDeck = [K.scout];
  s = act(s, { type: "END_ATTACKS" });
  assert.ok(s.staging.some((u) => u.code === K.scout));
});
test("Shadow of Fear prevents exhausting and readying, blanks hero text and allows spending three resources to discard itself", () => {
  let s = base("flight-from-moria");
  s = reveal(s, K.fear);
  s = choose(s, s.heroes[0].id);
  const h = s.heroes[0];
  assert.equal(canCommit({ ...s, phase: "quest" }, h), false);
  h.exhausted = true;
  handle(s, fx("ready", { target: h.id }));
  assert.equal(h.exhausted, true);
  h.exhausted = false;
  s.phase = "planning";
  const a = h.attachments[0];
  s = act(s, { type: "ABILITY", id: h.id, attachmentId: a.id });
  assert.equal(s.heroes[0].resources, 5);
  assert.equal(s.heroes[0].attachments.length, 0);
});
test("Zigil Mineshaft encounter action raises every player's threat as a cost and explores through current quest points", () => {
  let s = base("into-the-pit", 2);
  const l = make(s, K.shaft);
  s.staging = [l];
  for (let i = 0; i < 5; i++) s = act(s, { type: "ABILITY", id: l.id });
  assert.ok(!s.staging.some((u) => u.id === l.id));
  assert.equal(seatView(s, 0).threat, 25);
  assert.equal(seatView(s, 1).threat, 25);
});
test("Flight setup includes exactly one Foe Beyond per player, adds Presence's victory after initial reveals and leaves new route facedown", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = settle(
        createGame(8, leadership.cards, leadership.heroes, leadership.id, {
          scenarioId: "flight-from-moria",
          easy,
          ...(players > 1
            ? {
                seats: STARTERS.slice(0, players).map((d) => ({
                  deckId: d.id,
                  heroes: [...d.heroes],
                })),
              }
            : {}),
        }),
      );
      assert.equal(s.status, "playing");
      assert.equal(s.stage, 2);
      assert.equal(s.khazad!.questSide, "A");
      assert.equal(s.khazad!.questDeck.length, 6);
      assert.ok(s.khazad!.victoryCards.includes(K.presence));
      assert.equal(s.victory, 2);
      assert.ok(s.staging.some((u) => u.code === K.nameless));
      assert.ok(validateSave(s));
    }
});
test("Nameless Fear follows total victory immediately, ignores attachments/card effects and never engages", () => {
  let s = base("flight-from-moria");
  const fear = s.staging[0];
  assert.equal(stats(s, fear).attack, 2);
  assert.equal(threatOf(s, fear), 2);
  s.victory = 7;
  assert.equal(stats(s, fear).attack, 7);
  assert.equal(stats(s, fear).defense, 7);
  s.phase = "encounter";
  assert.throws(
    () => act(s, { type: "ENGAGE", id: fear.id }),
    /Nameless|engage/,
  );
  s.hand = [make(s, "01069")];
  s.phase = "planning";
  assert.ok(!playTargets(s, s.hand[0]).some((u) => u.id === fear.id));
});
test("A Foe Beyond uses current Fear attack against the last player's chosen hero; shadow only damages an existing defender", () => {
  let s = base("flight-from-moria", 2);
  s.victory = 3;
  s = reveal(s, K.foe);
  assert.ok(
    s.choice!.options.every((o) =>
      seatView(s, 1).heroes.some((h) => h.id === o.id),
    ),
  );
  s = choose(s, seatView(s, 1).heroes[0].id);
  assert.equal(seatView(s, 1).heroes[0].damage, 3);
  const shadowed = base("flight-from-moria");
  combat(shadowed, K.scout, K.foe, true);
  shadow(shadowed, K.foe);
  flush(shadowed);
  assert.equal(shadowed.heroes[0].damage, 2);
});
test("Flight only flips a new route at beginning of staging and Wrong Turn reveals extra cards before normal staging", () => {
  const s = base("flight-from-moria");
  assert.equal(khazadStageInfo(s)!.side, "A");
  s.encounterDeck = [K.scout, K.scout];
  khazadBeforeStaging(s);
  flush(s);
  assert.equal(khazadStageInfo(s)!.name, "A Wrong Turn");
  assert.equal(khazadStageInfo(s)!.quest, 1);
  assert.equal(s.staging.filter((u) => u.code === K.scout).length, 1);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(stageInfo(s).cardCode, K.wrong);
});
test("Wrong Turn completion adds victory then reveals a new facedown route; bypass adds no victory and resets only quest progress", () => {
  const s = base("flight-from-moria");
  flight(s, K.wrong);
  s.khazad!.questDeck = [K.up, K.darkness];
  s.phase = "quest";
  s.progress = 1;
  advanceQuest(s);
  assert.equal(s.victory, 4);
  assert.equal(s.khazad!.activeQuest, K.up);
  assert.equal(s.khazad!.questSide, "A");
  const location = make(s, K.shaft);
  location.progress = 2;
  s.activeLocation = location;
  flight(s, K.up);
  s.khazad!.questDeck = [K.darkness, K.blocked];
  s.progress = 4;
  handle(s, fx("khazadBypass"));
  assert.equal(s.khazad!.activeQuest, K.darkness);
  assert.equal(s.progress, 0);
  assert.equal(location.progress, 2);
  assert.equal(s.khazad!.questDeck.at(-1), K.up);
  assert.equal(s.victory, 4);
});
test("Blocked by Shadow offers immediate new route or independent treachery elimination in player order, and wins at nine progress", () => {
  let s = base("flight-from-moria", 2);
  flight(s, K.blocked, "A");
  s.encounterDeck = [K.bones, K.scout];
  khazadBeforeStaging(s);
  flush(s);
  s = choose(s, "risk");
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.table!.seats[1].eliminated, false);
  assert.equal(s.khazad!.activeQuest, K.blocked);
  s.progress = 9;
  s.phase = "quest";
  advanceQuest(s);
  assert.equal(s.status, "won");
});
test("Hasty Council chooses one of the top two routes, puts the other beneath deck, then adds its own victory after new WR", () => {
  let s = base("flight-from-moria");
  flight(s, K.council, "A");
  s.khazad!.questDeck = [K.blocked, K.darkness, K.up];
  s.encounterDiscard = [K.foe, K.well];
  s.encounterDeck = [K.scout];
  khazadBeforeStaging(s);
  flush(s);
  assert.match(s.choice!.title, /Hasty Council/);
  s = choose(s, K.blocked);
  assert.match(s.choice!.title, /Blocked/);
  assert.equal(s.victory, 2, "Council's Then waits for chosen quest WR");
  s = choose(s, "risk");
  assert.equal(s.victory, 4);
  assert.ok(s.khazad!.victoryCards.includes(K.council));
  assert.deepEqual(s.khazad!.questDeck, [K.up, K.darkness]);
  assert.ok(!s.encounterDiscard.includes(K.foe));
});
test("Narrow Paths keeps exactly one questing character per player, searches Tools after first progress, and wins no game itself", () => {
  let s = base("flight-from-moria", 2);
  flight(s, K.narrow, "A");
  for (const h of allHeroes(s)) h.committed = true;
  const will0 = questWill(s);
  s.encounterDeck = [K.tools, K.scout];
  khazadBeforeStaging(s);
  flush(s);
  const h0 = seatView(s, 0).heroes[0],
    h1 = seatView(s, 1).heroes[0];
  s = choose(s, h0.id);
  s = choose(s, h1.id);
  assert.equal(questWill(s), stats(s, h0).will + stats(s, h1).will);
  assert.ok(questWill(s) < will0);
  s.phase = "quest";
  progress(s, 1);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === K.tools));
  assert.equal(s.queue.length, 0);
  s.progress = 3;
  advanceQuest(s);
  assert.equal(s.status, "playing");
  assert.equal(s.victory, 3);
  assert.equal(s.khazad!.questSide, "A");
});
test("Heading opposite route returns from victory only at quest end while current heading is active and adjusts Fear stats", () => {
  const s = base("flight-from-moria");
  flight(s, K.down);
  s.victory = 3;
  s.khazad!.victoryCards.push(K.up);
  khazadQuestEnd(s);
  assert.equal(s.victory, 2);
  assert.ok(!s.khazad!.victoryCards.includes(K.up));
  assert.ok(s.khazad!.questDeck.includes(K.up));
});
test("Abandoned Tools is guarded, claimed by hero exhaustion, returns if detached, and only its refresh action progresses Darkness", () => {
  let s = base("flight-from-moria");
  flight(s, K.darkness);
  s.phase = "quest";
  progress(s, 20);
  flush(s);
  assert.equal(s.progress, 0);
  const objective = make(s, K.tools);
  s.staging.push(objective);
  const h = s.heroes[0];
  s.phase = "planning";
  s = act(s, { type: "CLAIM", id: objective.id, heroId: h.id });
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(s.threat, 20);
  const a = s.heroes[0].attachments[0];
  assert.throws(
    () => act(s, { type: "ABILITY", id: h.id, attachmentId: a.id }),
    /refresh/,
  );
  s.phase = "refresh";
  for (let i = 0; i < 4; i++) {
    s.heroes[0].exhausted = false;
    s = act(s, { type: "ABILITY", id: h.id, attachmentId: a.id });
  }
  assert.equal(s.status, "won");
});
test("New Devilry shuffles current route and immediately reveals a replacement; shadow raises only undefended threat", () => {
  let s = base("flight-from-moria");
  flight(s, K.darkness);
  s.khazad!.questDeck = [K.up];
  s = reveal(s, K.devilry);
  assert.equal(s.khazad!.questSide, "B");
  assert.equal(s.stage, 2);
  assert.equal(s.khazad!.questDeck.length, 1);
  const d = base("flight-from-moria");
  combat(d, K.scout, K.devilry);
  shadow(d, K.devilry);
  assert.equal(d.threat, 22);
});
test("multi-player dynamic quest state and face/progress/victory survive save/reload during a route choice", () => {
  let s = base("flight-from-moria", 2);
  flight(s, K.blocked, "A");
  khazadBeforeStaging(s);
  flush(s);
  syncSeat(s);
  assert.ok(validateSave(s));
  s = restoreSave(s)!;
  assert.equal(khazadStageInfo(s)!.name, "Blocked by Shadow");
  s = choose(s, "route");
  assert.equal(s.status, "playing");
  assert.equal(s.khazad!.questSide, "B");
});
test("Foe Beyond and Devilry use modified Fear attack and threat, including encounter bonuses", () => {
  let s = base("flight-from-moria");
  s.staging.push(make(s, K.armoury));
  s = reveal(s, K.foe);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].damage, 3);
  const d = base("flight-from-moria", 2);
  d.staging.push(make(d, K.drummer));
  combat(d, K.scout, K.devilry);
  shadow(d, K.devilry);
  assert.equal(d.threat, 24);
});
test("Goblin Archer in staging may be attacked by Ranged characters, while other staging enemies retain normal restrictions", () => {
  let s = base("the-seventh-level", 1, tactics);
  s.phase = "attack";
  const archer = make(s, K.archer);
  s.staging = [archer];
  const legolas = s.heroes.find((h) => h.code === "01005")!;
  assert.deepEqual(
    attackersFor(s, archer).map((u) => u.id),
    [legolas.id],
  );
  s = act(s, { type: "ATTACK", enemyId: archer.id, attackerIds: [legolas.id] });
  assert.equal(s.staging.find((u) => u.id === archer.id)!.damage, 0);
  assert.equal(s.progress, 0);
});
test("Great Cave-troll accepts a player's own Ranged attack and rejects cross-player Ranged damage", () => {
  const s = base("the-seventh-level", 2, tactics),
    troll = enemy(s, K.greatTroll, 0);
  const legolas = seatView(s, 0).heroes.find((h) => h.code === "01005")!;
  assert.ok(attackersFor(s, troll).some((u) => u.id === legolas.id));
  selectSeat(s, 1);
  assert.ok(
    attackersFor(s, troll).some((u) => u.id === legolas.id),
    "normal attack by enemy's owner is not Ranged participation",
  );
  const cross = make(s, "01005");
  s.allies.push(cross);
  assert.ok(!attackersFor(s, troll).some((u) => u.id === cross.id));
});
test("Mountain Warg returns after a no-effect shadow attack, but remains after a printed effect", () => {
  let s = base(),
    w = enemy(s, K.warg);
  w.shadows = [K.scout];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: w.id, defenderId: s.heroes[0].id });
  assert.ok(s.staging.some((u) => u.id === w.id));
  assert.ok(!s.engaged.some((u) => u.id === w.id));
  const effect = base(),
    other = enemy(effect, K.warg);
  other.shadows = [K.burning];
  effect.phase = "defense";
  const done = act(effect, {
    type: "DEFEND",
    enemyId: other.id,
    defenderId: effect.heroes[0].id,
  });
  assert.ok(done.engaged.some((u) => u.id === other.id));
});
test("Chieftain shadow completes the current attack before starting a fresh shadow and defense choice", () => {
  let s = base(),
    e = enemy(s, K.scout);
  e.shadows = [K.chieftain];
  s.encounterDeck = [K.burning];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
  assert.match(s.choice!.title, /again|defender|Additional attack/i);
  assert.deepEqual(s.engaged.find((u) => u.id === e.id)!.shadows, [K.burning]);
  assert.equal(s.phase, "defense");
  s = choose(s, "undefended");
  assert.match(s.choice!.title, /damage/i);
  s = choose(s, s.heroes[1].id);
  assert.equal(s.heroes[1].damage, 3);
  assert.equal(s.phase, "attack");
});
test("Lightless Passage and Patrol Leader cancellation suppress damage dealt to the attacker by attack responses", () => {
  const s = base(),
    e = combat(s, K.scout, K.passage, true);
  shadow(s, K.passage);
  const old = s.heroes[0].damage;
  combatDamage(s, e, s.heroes[0], 3);
  assert.equal(e.damage, 0);
  assert.equal(s.heroes[0].damage, old);
});
test("Misty Mountain and Deeps printed keywords, travel exhaustion, resource discard and non-reveal searches all work", () => {
  let s = base("into-the-pit", 2);
  s = reveal(s, K.bitter);
  assert.ok(seatView(s, 0).heroes.every((h) => h.resources === 5));
  assert.ok(seatView(s, 1).heroes.every((h) => h.resources === 8));
  const stairs = make(s, K.stairs);
  s.staging.push(stairs);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: stairs.id });
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(s.activeLocation!.id, stairs.id);
  const lair = base();
  lair.encounterDeck = [K.warg, K.scout];
  const got = reveal(lair, K.lair);
  assert.ok(got.staging.some((u) => u.code === K.warg));
  assert.ok(!got.engaged.length);
  const upper = reveal(base(), K.upper);
  assert.equal(upper.threat, 22);
  const horn = base();
  horn.encounterDeck = [K.scout, K.scout];
  const heard = reveal(horn, K.horn);
  assert.equal(heard.staging.length, 3);
  assert.equal(heard.encounterDeck.length, 0);
});
