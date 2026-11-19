import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage } from "../src/game/board";
import { make, questStat, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { HEIRS_NUMENOR as H } from "../src/game/heirs-numenor-support";
import {
  advanceHeirs,
  heirsArcheryTotal,
  heirsQuestKeyword,
} from "../src/game/heirs-numenor";
import {
  NIGHTMARE,
  NIGHTMARE_HON as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import {
  nightmareArcheryOf,
  nightmareIthilienGoal,
} from "../src/game/nightmare-ithilien";
import { forOwner, seatIndices } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  d,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Pelargir Docks: a location with no "When Revealed" effect and no shadow. */
const QUIET = H.docks;
const SCOUT = "01016"; // Snowbourn Scout, an ally
const game = (seed = 5) => nightmareGame("into-ithilien", seed);
const two = (seed = 5) => nightmareForTwo("into-ithilien", seed);
/** A quiet board in `phase` at `stage`: an empty staging area, threat 20. */
function board(
  phase: GameState["phase"],
  stage = 1,
  s: GameState = opening(game()),
) {
  calm(s, phase);
  Object.assign(s, {
    stage,
    stageRevealing: false,
    progress: 0,
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(20).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: [],
  });
  s.nightmare = { eliteAside: 2 };
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.allies = [];
      s.threat = 20;
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const bonus = (s: GameState) => hooks(s).archeryBonus!(s);
const add = (s: GameState, code: string, engaged = false) => {
  const u = make(s, code);
  (engaged ? s.engaged : s.staging).push(u);
  return u;
};
const run = (s: GameState, effects: GameState["queue"]) => {
  s.queue.unshift(...effects);
  flush(s);
  return s;
};
const elites = (s: GameState) =>
  s.staging.filter((u: Unit) => u.code === N.elite).length;

test("Nightmare: Into Ithilien's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.ithilienCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Into Ithilien - Nightmare", true],
  );
  // The scans give the setup card's removal list (the catalog had a generic
  // text), "Mûmak Elite" with its circumflex, Mûmak Elite's "Archery X" (the
  // catalog had "Arechery"), Haradrim Captain's "Attacking enemy" and
  // "instead" (the catalog had "Attaching" and "in stead"), Dense Thickets'
  // "attack (damage" and Savage Fray's switch "from battle to siege".
  assert.equal(
    c.text,
    "Begin with the standard quest deck and encounter deck for the Into Ithilien scenario.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n1x Blocking Wargs\n2x Watcher in the Wood\n3x Secluded Glade\n3x Forest Bat\n3x Southron Mercenaries\n1x Overgrown Trail\nThen, shuffle the encounter cards in this Nightmare Deck into the remainder of the standard Into Ithilien encounter deck.\nFinally, flip this setup card over and place it next to the quest deck. Its effect remains active throughout the game, which is now ready to begin.",
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nSetup: Set both copies of Mûmak Elite aside, out of play.\nForced: When quest stages 2A or 4A are revealed, add 1 of the previously set aside copies of Mûmak Elite to the staging area.",
  );
  assert.equal(
    card(N.elite).text,
    "Cannot have attachments. Archery X.\nX is the number of players in the game.\nMûmak Elite cannot take more than 3 damage each round.",
  );
  assert.deepEqual(
    [N.captain, N.thickets, N.arrows].map((x) => card(x).shadow),
    [
      "Shadow: Attacking enemy gets +1 [attack] (+3 [attack] instead if it has the Harad trait).",
      "Shadow: Excess damage dealt by this attack (damage that is dealt beyond the remaining hit points of the character damaged by this attack) must be assigned to a Ranger objective in play.",
      "Shadow: Attacking enemy gets +X [attack]. X is that enemy's archery value.",
    ],
  );
  assert.equal(
    card(N.fray).text,
    "Doomed 2.\nWhen Revealed: If the current quest has a keyword, until the end of the round, switch that keyword from battle to siege, or siege to battle, if able. If the current quest does not have a keyword, Savage Fray gains surge.",
  );
  const stat = (x: string) => {
    const k = card(x);
    return [k.engagement, k.threat, k.attack, k.defense, k.health, k.traits];
  };
  assert.deepEqual(stat(N.elite), [38, 5, 7, 5, 12, "Harad. Creature."]);
  assert.deepEqual(stat(N.marksman), [36, 2, 2, 2, 5, "Harad."]);
  assert.deepEqual(stat(N.captain), [44, 4, 4, 3, 6, "Harad."]);
  assert.deepEqual(
    [N.overlook, N.thickets, N.cormallen].map((x) => [
      card(x).threat,
      card(x).quest,
      card(x).traits,
    ]),
    [
      [3, 4, "Forest."],
      [1, 8, "Forest."],
      [3, 5, "Plains. Riverland."],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Into Ithilien - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    10,
  );
});

test("Nightmare: Into Ithilien's Nightmare deck matches its source recipe, the Mûmak Elites set aside", () => {
  const sets = scenario("into-ithilien").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("into-ithilien", standard);
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N03.2")!;
  const section = (...names: string[]) => {
    const out: Record<string, number> = {};
    for (const c of recipe.cards)
      if (names.includes(c.section) && c.code !== N.ithilienCard)
        out[c.code] = (out[c.code] ?? 0) + c.quantity;
    return out;
  };
  assert.deepEqual(
    count(deck),
    section(
      "sharedEncounterDeck",
      "sharedStagingArea",
      "sharedActiveLocation",
      "sharedSetAside",
    ),
  );
  assert.deepEqual(section("sharedSetAside"), { [N.elite]: 2 });
  for (const [title, n] of Object.entries(NIGHTMARE["into-ithilien"]!.removals))
    assert.ok(card(N.ithilienCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "Into Ithilien (Nightmare)",
      mode: "nightmare",
    }),
    "into-ithilien",
  );
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.ithilienCard);
    assert.equal(s.nightmare?.eliteAside, 2);
    assert.ok(!s.encounterDeck.includes(N.elite));
    assert.ok(!s.staging.some((u) => u.code === N.elite));
    assert.match(nightmareStatus(s)[0], /\(2 still aside\)/);
    assert.match(nightmareIthilienGoal(s)!, /2 set aside/);
    assert.ok(valid(s));
  }
  const n = opening(
    createGame(5, d.cards, d.heroes, d.id, { scenarioId: "into-ithilien" }),
  );
  assert.equal(n.nightmare?.eliteAside, undefined);
  assert.equal(nightmareIthilienGoal(n), undefined);
});

test("Nightmare: a set-aside Mûmak Elite enters the staging area as stages 2A and 4A are revealed", () => {
  // Through the scenario's own advance: stage 1 completed without Celador.
  const s = board("travel");
  s.progress = 15;
  advanceHeirs(s);
  assert.equal(s.stage, 2);
  assert.equal(elites(s), 1);
  assert.equal(s.nightmare!.eliteAside, 1);
  assert.match(nightmareIthilienGoal(s)!, /1 set aside/);
  // Stage 3 adds none; stage 4 adds the other.
  const t = board("travel");
  hooks(t).stageRevealed!(t, 3);
  assert.equal(elites(t), 0);
  hooks(t).stageRevealed!(t, 4);
  hooks(t).stageRevealed!(t, 2);
  hooks(t).stageRevealed!(t, 4);
  assert.equal(elites(t), 2, "no more than the 2 set aside");
  assert.equal(t.nightmare!.eliteAside, 0);
  assert.equal(nightmareIthilienGoal(t), undefined);
  assert.ok(valid(t));
});

test("Nightmare: Into Ithilien's archery adds Mûmak Elite, Haradrim Marksman in battle, Haradrim Captain's Harad enemies and Ithilien Overlook", () => {
  const s = board("planning");
  assert.equal(bonus(s), 0);
  add(s, N.elite);
  assert.equal(bonus(s), 1, "X is the number of players");
  const marks = add(s, N.marksman);
  assert.ok(heirsQuestKeyword(s, "Battle"));
  assert.equal(bonus(s), 3, "archery 2 in battle");
  s.stage = 2; // Siege
  assert.equal(bonus(s), 1);
  s.stage = 1;
  add(s, N.captain);
  // 3 Harad enemies in the staging area (Elite, Marksman, Captain).
  assert.equal(bonus(s), 6);
  s.engaged.push(...s.staging.splice(0, 1));
  assert.equal(bonus(s), 5, "an engaged Elite keeps its archery");
  const overlook = add(s, N.overlook);
  assert.equal(bonus(s), 7);
  s.staging = s.staging.filter((u) => u.id !== overlook.id);
  s.activeLocation = overlook;
  assert.equal(bonus(s), 7, "as the active location");
  assert.equal(heirsArcheryTotal(s), 7);
  void marks;
  const t = board("planning", 1, opening(two()));
  add(t, N.elite);
  assert.equal(bonus(t), 2, "two players");
});

test("Nightmare: Ithilien Overlook keeps archery damage on one character until it is destroyed", () => {
  const s = board("attack");
  const overlook = add(s, N.overlook);
  run(s, [{ kind: "heirsArchery", value: 3, player: 0 }] as never);
  assert.match(s.choice!.title, /Assign Archery damage · 3 remaining/);
  const first = s.heroes[0];
  pick(s, first.id);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [first.id],
  );
  pick(s, first.id);
  pick(s, first.id);
  assert.equal(first.damage, 3);
  // Without Ithilien Overlook, the next point may go elsewhere.
  s.staging = s.staging.filter((u) => u.id !== overlook.id);
  run(s, [{ kind: "heirsArchery", value: 2, player: 0 }] as never);
  pick(s, first.id);
  assert.ok(s.choice!.options.length > 1);
});

test("Nightmare: Haradrim Marksman threatens in battle and strikes in siege, where allies cannot defend it", () => {
  const s = board("defense");
  const marks = add(s, N.marksman);
  assert.equal(threatOf(s, marks), 4);
  s.stage = 2;
  assert.equal(threatOf(s, marks), 2);
  assert.equal(stats(s, marks).attack, 4);
  const ally = make(s, SCOUT);
  s.allies.push(ally);
  assert.equal(hooks(s).cannotDefend!(s, marks, ally), true);
  assert.equal(hooks(s).cannotDefend!(s, marks, s.heroes[0]), false);
  s.stage = 1;
  assert.equal(stats(s, marks).attack, 2);
  assert.equal(hooks(s).cannotDefend!(s, marks, ally), false);
});

test("Nightmare: Haradrim Captain hardens engaged Harad enemies and its shadow favours them", () => {
  const s = board("defense");
  const captain = add(s, N.captain);
  const engaged = add(s, H.elite, true);
  const staged = add(s, N.marksman);
  assert.equal(stats(s, engaged).defense, (card(H.elite).defense ?? 0) + 1);
  assert.equal(stats(s, staged).defense, 2, "not in the staging area");
  add(s, N.captain);
  assert.equal(stats(s, engaged).defense, (card(H.elite).defense ?? 0) + 2);
  void captain;
  shadow(s, engaged, N.captain, s.heroes[0]);
  assert.equal(s.combat!.attackBonus, 3, "a Harad attacker");
  const t = board("defense");
  const other = add(t, H.spider, true);
  shadow(t, other, N.captain, t.heroes[0]);
  assert.equal(t.combat!.attackBonus, 1);
});

test("Nightmare: Mûmak Elite cannot have attachments and takes no more than 3 damage each round", () => {
  const s = board("attack");
  const elite = add(s, N.elite, true);
  assert.equal(hooks(s).cannotAttach!(s, elite, "x"), true);
  damage(s, elite.id, 5);
  assert.equal(elite.damage, 3);
  damage(s, elite.id, 2);
  assert.equal(elite.damage, 3, "no more this round");
  assert.ok(valid(s));
  s.round += 1;
  damage(s, elite.id, 4);
  assert.equal(elite.damage, 6);
});

test("Nightmare: Dense Thickets raises each Forest location's threat and sends its excess damage to a Ranger objective", () => {
  const s = board("staging");
  const thickets = add(s, N.thickets),
    overlook = add(s, N.overlook),
    fields = add(s, N.cormallen);
  assert.equal(threatOf(s, thickets), 2);
  assert.equal(threatOf(s, overlook), 4);
  assert.equal(
    threatOf(s, fields),
    5,
    "Cormallen Fields in battle, not a Forest",
  );
  add(s, N.thickets);
  assert.equal(threatOf(s, overlook), 5);
  // Its shadow: the excess damage of a destroying attack.
  const t = board("defense");
  // Ithilien Guardian: Celador would also take 1 for the destroyed hero.
  const guardian = add(t, H.guardian);
  const foe = add(t, N.marksman, true);
  const hero = t.heroes[1];
  shadow(t, foe, N.thickets, hero);
  const health = stats(t, hero).health;
  damage(t, hero.id, health + 2, { combatDamage: true, enemyId: foe.id });
  flush(t);
  assert.equal(guardian.damage, 2, "2 excess points on Ithilien Guardian");
  hooks(t).attackFinished!(t, t.combat!);
  assert.equal(t.nightmare!.thickets, undefined);
});

test("Nightmare: Cormallen Fields threatens in battle and must be travelled to in siege", () => {
  const s = board("travel", 2);
  const fields = add(s, N.cormallen),
    other = add(s, N.overlook);
  assert.equal(hooks(s).mustTravel!(s), true);
  assert.match(
    hooks(s).travelProblem!(s, other)!,
    /must travel to Cormallen Fields/,
  );
  assert.equal(hooks(s).travelProblem!(s, fields), null);
  s.stage = 1;
  assert.equal(hooks(s).mustTravel!(s), false);
  assert.equal(hooks(s).travelProblem!(s, other), null);
  assert.equal(threatOf(s, fields), 5);
});

test("Nightmare: Obsidian Arrows arms the quest and fires at once, and its shadow adds the attacker's archery", () => {
  let s = board("staging");
  add(s, N.elite);
  s = reveal(s, N.arrows, (x) => x.heroes[0].id);
  assert.deepEqual(s.nightmare!.arrows, { round: s.round, n: 1 });
  // 1 (Mûmak Elite) + 2 (the quest) assigned now.
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    3,
  );
  assert.ok(s.encounterDiscard.includes(N.arrows));
  assert.equal(bonus(s), 3, "until the end of the round");
  s.round += 1;
  assert.equal(bonus(s), 1);
  const t = board("defense", 1, opening(two()));
  const elite = add(t, N.elite, true);
  assert.equal(nightmareArcheryOf(t, elite), 2);
  shadow(t, elite, N.arrows, t.heroes[0]);
  assert.equal(t.combat!.attackBonus, 2);
  const assassin = add(t, H.assassin, true);
  shadow(t, assassin, N.arrows, t.heroes[0]);
  assert.equal(t.combat!.attackBonus, 2, "Umbar Assassin's archery 2");
});

test("Nightmare: Savage Fray switches battle and siege until the end of the round, or surges on a quest without a keyword", () => {
  let s = board("staging");
  assert.equal(questStat(s), "attack");
  s = reveal(s, N.fray);
  assert.equal(s.threat, 22, "Doomed 2");
  assert.equal(questStat(s), "defense");
  assert.ok(heirsQuestKeyword(s, "Siege"));
  assert.ok(!heirsQuestKeyword(s, "Battle"));
  s = reveal(s, N.fray);
  assert.equal(questStat(s), "attack", "switched back");
  s.round += 1;
  assert.equal(questStat(s), "attack");
  // Stage 2's siege becomes battle.
  let t = board("staging", 2);
  t = reveal(t, N.fray);
  assert.equal(questStat(t), "attack");
  assert.ok(valid(t));
  // Stage 3 has no keyword: surge.
  let u = board("staging", 3);
  u = reveal(u, N.fray);
  assert.equal(questStat(u), "will");
  assert.equal(u.nightmare!.fray, undefined);
  assert.ok(
    u.staging.some((x) => x.code === QUIET),
    "surge reveals the next card",
  );
});

test("Nightmare: Into Ithilien's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    eliteAside: 1,
    fray: { round: 2, n: 1 },
    arrows: { round: 2, n: 2 },
    eliteDamage: { round: 2, taken: { u1: 3 } },
    thickets: "u1",
  };
  assert.ok(valid(s));
  for (const bad of [
    { eliteAside: 3 },
    { fray: { round: 1, n: 0 } },
    { arrows: "x" },
    { eliteDamage: { round: 1, taken: { u1: -1 } } },
    { thickets: 4 },
  ]) {
    s.nightmare = bad as never;
    assert.equal(valid(s), false, JSON.stringify(bad));
  }
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `into-ithilien seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player into-ithilien");
  // From stage 2, a Mûmak Elite in the staging area.
  const t = board("planning", 2, opening(game(3)));
  t.nightmare = { eliteAside: 1 };
  add(t, N.elite);
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 2");
});
