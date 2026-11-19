import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, engage } from "../src/game/board";
import { make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { HEIRS_NUMENOR as H } from "../src/game/heirs-numenor-support";
import { heirsMoveScroll } from "../src/game/heirs-numenor";
import {
  NIGHTMARE,
  NIGHTMARE_HON as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { nightmarePelargirGoal } from "../src/game/nightmare-pelargir";
import { engagementCheckThreat } from "../src/game/threat-read";
import { allHeroes, forOwner, seatIndices, seatView } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { Attachment, GameState, Unit } from "../src/game/types";
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
const DOCKS = H.docks;
const game = (seed = 5) => nightmareGame("peril-in-pelargir", seed);
const two = (seed = 5) => nightmareForTwo("peril-in-pelargir", seed);
/** A quiet board in `phase`: an empty staging area, threat 20, Alcaron's Scroll on the first player's first hero. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  const scroll = allHeroes(s)
    .flatMap((h) => h.attachments)
    .find((a) => a.code === H.scroll) as Attachment;
  assert.ok(scroll, "the setup attached Alcaron's Scroll to a hero");
  Object.assign(s, {
    stage: 1,
    stageRevealing: false,
    progress: 0,
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(20).fill(DOCKS),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: [],
    nightmare: {},
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.allies = [];
      s.threat = 20;
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          resources: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  s.heroes[0].attachments = [{ ...scroll, owner: 0 }];
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const hasScroll = (u: Unit) => u.attachments.some((a) => a.code === H.scroll);
const run = (s: GameState, effects: GameState["queue"]) => {
  s.queue.unshift(...effects);
  flush(s);
  return s;
};

test("Nightmare: Peril in Pelargir's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.pelargirCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Peril in Pelargir - Nightmare", true],
  );
  // The scans give the setup card's removal list (the catalog had a generic
  // quest deck text), "enemy" and "1 progress token" on its back (the
  // catalog had "enemeny" and "1 progress"), Cunning Informant's name in its
  // text, "Attacking enemy" in two shadows (the catalog had "Attaching") and
  // Bedlam in the Streets' title.
  assert.equal(
    c.text,
    "Begin with the standard quest deck and encounter deck for the Peril in Pelargir scenario.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n4x Collateral Damage\n2x Harbor Storehouse\n3x Pickpocket\n1x Harbor Thug\nThen, shuffle the encounter cards in this Nightmare Deck into the remainder of the standard Peril in Pelargir encounter deck.\nFinally, flip this setup card over and place it next to the quest deck. Its effect remains active throughout the game, which is now ready to begin.",
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: At the end of the combat phase, if Alcaron's Scroll is in the staging area, attach it to the enemy in play with the highest [defense].\nForced: At the beginning of the refresh phase, if Alcaron's Scroll is attached to an enemy, place 1 progress token on that enemy.\nIf at any point there are 3 or more progress tokens on an enemy, that enemy has escaped with the scroll, and the players lose the game.",
  );
  assert.equal(
    card(N.informant).text,
    "While Alcaron's Scroll is attached to a hero, Cunning Informant gets +3 [attack].\nDuring the encounter phase, if Alcaron's Scroll is attached to a hero, that hero's controller is considered to have +10 threat for the purpose of engagement checks.",
  );
  assert.equal(card(N.bedlam).name, "Bedlam in the Streets");
  assert.deepEqual(
    [N.ringleader, N.bedlam, N.alley].map((x) => card(x).shadow),
    [
      "Shadow: Attacking enemy gets +2 [attack].",
      "Shadow: Attacking enemy gets +2 [attack].",
      "Shadow: If the defending player controls a hero with Alcaron's Scroll attached, attach Alcaron's Scroll to the attacking enemy.",
    ],
  );
  assert.deepEqual(
    [N.brute, N.ringleader, N.dockside, N.alley, N.bedlam, N.ploy, N.away].map(
      (x) => card(x).text,
    ),
    [
      "When Revealed: If Alcaron's Scroll is attached to an enemy, detach it from that enemy and attach it to Harbor Brute. Move all progress tokens from that enemy to Harbor Brute.",
      "Forced: When Pelargir Ringleader engages a player, return the topmost Brigand enemy in the encounter discard pile to play, engaged with that player.",
      "While Dockside Street is in the staging area, enemies in the staging area cannot be damaged or optionally engaged.\nTravel: Exhaust the hero with Alcaron's Scroll attached to travel here.",
      "While Alcaron's Scroll is not attached to a hero, Pelargir Alley gets +3 [threat].",
      "When Revealed: Each player must either remove a hero he controls from the quest or engage an enemy in the staging area. Each enemy engaged by this effect makes an immediate attack.",
      "Surge.\nWhen Revealed: If Alcaron's Scroll is attached to a hero, choose an enemy engaged with that hero's controller, if able. Attach Alcaron's Scroll to that enemy, then add 1 progress to that enemy.",
      "Surge.\nWhen Revealed: If Alcaron's Scroll is attached to an enemy, choose one: either add 1 progress token to that enemy, or each card in the staging area gets +2 [threat] until the end of the phase.",
    ],
  );
  const stat = (x: string) => {
    const k = card(x);
    return [k.engagement, k.threat, k.attack, k.defense, k.health, k.traits];
  };
  assert.deepEqual(stat(N.informant), [21, 3, 2, 1, 3, "Brigand."]);
  assert.deepEqual(stat(N.brute), [38, 4, 4, 4, 5, "Brigand. Thug."]);
  assert.deepEqual(stat(N.ringleader), [35, 2, 3, 3, 4, "Brigand."]);
  assert.deepEqual(
    [N.dockside, N.alley].map((x) => [
      card(x).threat,
      card(x).quest,
      card(x).traits,
    ]),
    [
      [2, 6, "City."],
      [2, 5, "City."],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Peril in Pelargir - Nightmare",
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

test("Nightmare: Peril in Pelargir's Nightmare deck matches its source recipe", () => {
  const sets = scenario("peril-in-pelargir").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("peril-in-pelargir", standard);
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
  const recipe = recipes.find((r) => r.id === "N03.1")!;
  const recipeCount: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      [
        "sharedEncounterDeck",
        "sharedStagingArea",
        "sharedActiveLocation",
      ].includes(c.section) &&
      c.code !== N.pelargirCard
    )
      recipeCount[c.code] = (recipeCount[c.code] ?? 0) + c.quantity;
  // The recipe stages 4 Harbor Thugs (one for each of up to 4 players) and
  // keeps none in the encounter deck: the standard deck's 5 less the 1 the
  // setup card removes.
  assert.deepEqual(count(deck), recipeCount);
  for (const [title, n] of Object.entries(
    NIGHTMARE["peril-in-pelargir"]!.removals,
  ))
    assert.ok(card(N.pelargirCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "Peril in Pelargir (Nightmare)",
      mode: "nightmare",
    }),
    "peril-in-pelargir",
  );
  const thugs = (s: GameState) => [
    s.staging.filter((u) => u.code === H.thug).length,
    s.encounterDeck.filter((c) => c === H.thug).length,
  ];
  const solo = opening(game());
  assert.deepEqual(thugs(solo), [1, 3]);
  const duo = opening(two());
  assert.deepEqual(thugs(duo), [2, 2]);
  for (const s of [solo, duo]) {
    assert.equal(nightmareCardOf(s), N.pelargirCard);
    assert.ok(allHeroes(s).some(hasScroll));
    for (const removed of [H.collateral, H.storehouse])
      assert.ok(!s.encounterDeck.includes(removed));
    assert.match(nightmareStatus(s)[0], /escapes with the scroll/);
    assert.ok(valid(s));
  }
  // A Normal game keeps the standard deck's 4 other Harbor Thugs.
  const n = opening(
    createGame(5, d.cards, d.heroes, d.id, { scenarioId: "peril-in-pelargir" }),
  );
  assert.deepEqual(thugs(n), [1, 4]);
});

test("Nightmare: Alcaron's Scroll in the staging area joins the enemy with the highest defense after combat, gains progress each refresh and escapes at 3", () => {
  let s = board("attack");
  const informant = make(s, N.informant),
    brute = make(s, N.brute),
    ringleader = make(s, N.ringleader);
  s.staging.push(informant, brute);
  s.engaged.push(ringleader);
  // Attached to a hero: nothing at the end of combat.
  hooks(s).combatEnd!(s);
  flush(s);
  assert.ok(hasScroll(s.heroes[0]));
  heirsMoveScroll(s);
  assert.ok(s.staging.some((u) => u.code === H.scroll));
  assert.match(
    nightmarePelargirGoal(s)!,
    /claim it before the end of the combat phase/,
  );
  hooks(s).combatEnd!(s);
  flush(s);
  assert.ok(hasScroll(brute), "Harbor Brute has 4 [defense]");
  assert.ok(!s.staging.some((u) => u.code === H.scroll));
  // At the beginning of the refresh phase, 1 progress token on it.
  run(s, hooks(s).refreshStart!(s));
  assert.equal(brute.progress, 1);
  assert.match(
    nightmarePelargirGoal(s)!,
    /Harbor Brute has 1 of 3 progress tokens/,
  );
  assert.match(nightmareStatus(s)[0], /\(1 on Harbor Brute\)/);
  assert.ok(valid(s));
  run(s, hooks(s).refreshStart!(s));
  assert.equal(s.status, "playing");
  run(s, hooks(s).refreshStart!(s));
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Harbor Brute has escaped with Alcaron's Scroll/);
  // A tie for the highest [defense]: the first player chooses.
  s = board("attack");
  const a = make(s, N.ringleader),
    b = make(s, N.ringleader);
  s.staging.push(a, b);
  heirsMoveScroll(s);
  hooks(s).combatEnd!(s);
  flush(s);
  assert.match(s.choice!.title, /Attach Alcaron's Scroll to an enemy with 3/);
  pick(s, b.id);
  assert.ok(hasScroll(b) && !hasScroll(a));
  // No enemy in play: the scroll stays in the staging area.
  s = board("attack");
  heirsMoveScroll(s);
  hooks(s).combatEnd!(s);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === H.scroll));
});

test("Nightmare: Cunning Informant strikes harder while a hero has the scroll and draws its bearer's engagement checks", () => {
  const s = board("encounter", opening(two()));
  const informant = make(s, N.informant);
  s.staging.push(informant);
  assert.equal(stats(s, informant).attack, 5);
  // The scroll's bearer (the first player) is considered to have +10 threat.
  assert.equal(engagementCheckThreat(s, 0), 30);
  assert.equal(engagementCheckThreat(s, 1), 20);
  s.staging.push(make(s, N.informant));
  assert.equal(engagementCheckThreat(s, 0), 40, "each copy");
  s.phase = "planning";
  assert.equal(engagementCheckThreat(s, 0), 20, "only in the encounter phase");
  // The scroll on an enemy: no bonus.
  s.phase = "encounter";
  heirsMoveScroll(s, informant);
  assert.equal(stats(s, informant).attack, 2);
  assert.equal(engagementCheckThreat(s, 0), 20);
});

test("Nightmare: Dockside Street shields the staging area's enemies and its Travel cost exhausts the scroll's bearer", () => {
  const s = board("attack");
  const street = make(s, N.dockside),
    informant = make(s, N.informant),
    brute = make(s, N.brute);
  s.staging.push(street, informant);
  s.engaged.push(brute);
  assert.equal(hooks(s).cannotOptionallyEngage!(s, informant), true);
  assert.equal(hooks(s).cannotOptionallyEngage!(s, brute), false);
  damage(s, informant.id, 2);
  assert.equal(informant.damage, 0, "cannot be damaged in the staging area");
  damage(s, brute.id, 2);
  assert.equal(brute.damage, 2);
  s.staging = s.staging.filter((u) => u.id !== street.id);
  assert.equal(hooks(s).cannotOptionallyEngage!(s, informant), false);
  damage(s, informant.id, 1);
  assert.equal(informant.damage, 1);
  // Travel: exhaust the hero with Alcaron's Scroll attached.
  const t = board("travel");
  const dock = make(t, N.dockside);
  t.staging.push(dock);
  assert.equal(hooks(t).travelProblem!(t, dock), null);
  t.heroes[0].exhausted = true;
  assert.match(
    hooks(t).travelProblem!(t, dock)!,
    /exhaust the hero with Alcaron's Scroll/,
  );
  t.heroes[0].exhausted = false;
  run(t, hooks(t).travelEffects!(t, dock)!);
  assert.equal(t.heroes[0].exhausted, true);
  heirsMoveScroll(t);
  assert.match(hooks(t).travelProblem!(t, dock)!, /exhaust the hero/);
});

test("Nightmare: Pelargir Alley is threatening while no hero has the scroll, and its shadow takes the scroll from the defending player", () => {
  const s = board("staging");
  const alley = make(s, N.alley);
  s.staging.push(alley);
  assert.equal(threatOf(s, alley), 2);
  const brute = make(s, N.brute);
  s.engaged.push(brute);
  heirsMoveScroll(s, brute);
  assert.equal(threatOf(s, alley), 5);
  // Its shadow: the defending player controls the scroll's bearer.
  const t = board("defense", opening(two()));
  const foe = make(t, N.ringleader);
  t.engaged.push(foe);
  shadow(t, foe, N.alley, t.heroes[1], 1);
  assert.ok(hasScroll(seatView(t, 0).heroes[0]), "another player defends");
  shadow(t, foe, N.alley, t.heroes[1], 0);
  assert.ok(hasScroll(foe));
  assert.ok(valid(t));
});

test("Nightmare: Pelargir Ringleader brings back the topmost Brigand enemy from the discard pile, and two shadows add 2 [attack]", () => {
  const s = board("encounter");
  const leader = make(s, N.ringleader);
  s.staging.push(leader);
  s.encounterDiscard = [H.traitor, H.bandit, DOCKS];
  engage(s, leader);
  flush(s);
  assert.deepEqual(
    s.engaged.map((u) => u.code),
    [N.ringleader, H.bandit],
  );
  assert.deepEqual(s.encounterDiscard, [H.traitor, DOCKS]);
  // No Brigand enemy left after the Zealous Traitor returns.
  const other = make(s, N.ringleader);
  s.staging.push(other);
  engage(s, other);
  flush(s);
  assert.deepEqual(s.encounterDiscard, [DOCKS]);
  const third = make(s, N.ringleader);
  s.staging.push(third);
  engage(s, third);
  flush(s);
  assert.deepEqual(s.encounterDiscard, [DOCKS]);
  assert.ok(valid(s));
  for (const code of [N.ringleader, N.bedlam]) {
    const t = board("defense");
    const foe = make(t, N.informant);
    t.engaged.push(foe);
    shadow(t, foe, code, t.heroes[0]);
    assert.equal(t.combat!.attackBonus, 2, card(code).name);
  }
});

test("Nightmare: Harbor Brute takes the scroll and its progress tokens from another enemy", () => {
  const s = board("staging");
  const informant = make(s, N.informant);
  s.engaged.push(informant);
  heirsMoveScroll(s, informant);
  informant.progress = 2;
  const brute = make(s, N.brute);
  s.staging.push(brute);
  hooks(s).encounter!(s, N.brute, false, true);
  flush(s);
  assert.ok(hasScroll(brute) && !hasScroll(informant));
  assert.deepEqual([informant.progress, brute.progress], [0, 2]);
  // With the scroll on a hero, nothing happens.
  const t = board("staging");
  const b = make(t, N.brute);
  t.staging.push(b);
  hooks(t).encounter!(t, N.brute, false, true);
  flush(t);
  assert.ok(hasScroll(t.heroes[0]));
  assert.equal(b.progress, 0);
});

test("Nightmare: The Thieves' Ploy hands the scroll to an engaged enemy and They're Getting Away! adds progress or threat, both with surge", () => {
  let s = board("staging");
  const informant = make(s, N.informant);
  s.engaged.push(informant);
  s.encounterDeck = [DOCKS, DOCKS];
  s = reveal(s, N.ploy);
  assert.ok(hasScroll(informant));
  assert.equal(informant.progress, 1);
  assert.ok(s.encounterDiscard.includes(N.ploy));
  assert.equal(
    s.staging.filter((u) => u.code === DOCKS).length,
    1,
    "surge reveals the next card",
  );
  // No enemy engaged with the bearer's controller: nothing.
  let t = board("staging");
  t.encounterDeck = [DOCKS];
  t = reveal(t, N.ploy);
  assert.ok(hasScroll(t.heroes[0]));
  // They're Getting Away!: 1 progress token on the scroll's enemy, or +2
  // [threat] for each card in the staging area until the end of the phase.
  let u = board("staging");
  const brute = make(u, N.brute),
    dock = make(u, DOCKS);
  u.engaged.push(brute);
  u.staging.push(dock);
  heirsMoveScroll(u, brute);
  u.encounterDeck = [DOCKS, DOCKS, DOCKS];
  u = reveal(u, N.away, (x) =>
    x.choice!.options.some((o) => o.id === "progress") ? "progress" : undefined,
  );
  const b2 = u.engaged.find((x) => x.code === N.brute)!;
  assert.equal(b2.progress, 1);
  const d2 = u.staging.find((x) => x.code === DOCKS)!;
  assert.equal(threatOf(u, d2), 4, "Pelargir Docks' printed [threat]");
  u = reveal(u, N.away, (x) =>
    x.choice!.options.some((o) => o.id === "threat") ? "threat" : undefined,
  );
  const d3 = u.staging.find((x) => x.code === DOCKS)!;
  assert.equal(threatOf(u, d3), 6);
  assert.deepEqual(u.nightmare!.getaway, {
    round: u.round,
    phase: "quest",
    n: 1,
  });
  assert.ok(valid(u));
  u.phase = "travel";
  assert.equal(threatOf(u, d3), 4, "until the end of the phase");
});

test("Nightmare: Bedlam in the Streets makes each player remove a hero from the quest or engage an enemy that attacks at once", () => {
  let s = board("staging");
  const hero = s.heroes[0];
  hero.committed = true;
  const informant = make(s, N.informant);
  s.staging.push(informant);
  hooks(s).encounter!(s, N.bedlam, false, true);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [`quest:${hero.id}`, `engage:${informant.id}`],
  );
  pick(s, `engage:${informant.id}`);
  assert.ok(s.engaged.some((u) => u.id === informant.id));
  assert.match(s.choice!.title, /Immediate attack/);
  assert.ok(s.encounterDiscard.includes(N.bedlam));
  // Removing a hero from the quest: no attack.
  let t = board("staging");
  t.heroes[0].committed = true;
  t.staging.push(make(t, N.informant));
  hooks(t).encounter!(t, N.bedlam, false, true);
  flush(t);
  pick(t, `quest:${t.heroes[0].id}`);
  assert.equal(t.heroes[0].committed, false);
  assert.equal(t.choice, null);
  assert.equal(t.engaged.length, 0);
  // Two players: the second, with no questing hero, must engage.
  let u = board("staging", opening(two()));
  u.heroes[0].committed = true;
  const a = make(u, N.informant),
    b = make(u, N.brute);
  u.staging.push(a, b);
  hooks(u).encounter!(u, N.bedlam, false, true);
  flush(u);
  pick(u, `quest:${u.heroes[0].id}`);
  assert.deepEqual(
    u.choice!.options.map((o) => o.id),
    [`engage:${a.id}`, `engage:${b.id}`],
  );
  pick(u, `engage:${b.id}`);
  assert.ok(seatView(u, 1).engaged.some((x) => x.id === b.id));
  assert.match(u.choice!.title, /Immediate attack/);
});

test("Nightmare: Peril in Pelargir's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    getaway: { round: 2, phase: "quest", n: 1 },
    bedlam: [{ enemyId: "u1", player: 0 }],
  };
  assert.ok(valid(s));
  for (const bad of [
    { getaway: { round: 1, phase: "quest", n: 0 } },
    { getaway: "x" },
    { bedlam: [{ enemyId: 1, player: 0 }] },
  ]) {
    s.nightmare = bad as never;
    assert.equal(valid(s), false, JSON.stringify(bad));
  }
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `peril-in-pelargir seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player peril-in-pelargir");
  // From stage 2, the scroll on an enemy.
  const t = board("planning", opening(game(3)));
  t.stage = 2;
  const thug = make(t, H.thug);
  t.staging.push(thug);
  heirsMoveScroll(t, thug);
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 2");
});
