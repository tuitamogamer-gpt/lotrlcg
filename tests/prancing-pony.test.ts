import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, stats, threatOf } from "../src/game/core";
import { addVictoryCard, check, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { reduceThreat } from "../src/game/threat-reduction";
import { forOwner, seatView } from "../src/game/table";
import {
  PP,
  PP_HIDEOUTS,
  PP_SUSPECTS,
  PRANCING_PONY_HOOKS,
  ppRecipe,
  prancingPonyPublicState,
} from "../src/game/prancing-pony";
import { PRANCING_PONY_ADVENTURES } from "../src/game/prancing-pony-scenario-data";
import {
  activate,
  allies,
  atQuest,
  base,
  choose,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./prancing-pony-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = PRANCING_PONY_HOOKS;
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
const threats = (s: GameState) =>
  (s.table?.seats ?? [{ threat: s.threat }]).map((x) => x.threat);
const defend = (s: GameState, enemy: Unit, defender?: Unit) =>
  act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
const explore = (s: GameState, code: string) => {
  const u = activate(s, code);
  progressLocation(s, u, card(code).quest ?? 9);
  flush(s);
  return s;
};
const GUARD = "01013";

test("Setup: The Prancing Pony is active and Ramshackle Manor staged; a Suspect and a Hideout lie facedown; the others and Taken by Surprise form the Investigation deck", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.prancingPony!;
      assert.equal(q.currentQuest, PP.crime);
      assert.equal(s.stage, 1);
      assert.equal(s.activeLocation?.code, PP.pony);
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [PP.manor],
      );
      assert.ok(PP_SUSPECTS.includes(q.guilty!.suspect));
      assert.ok(PP_HIDEOUTS.includes(q.guilty!.hideout));
      assert.deepEqual(
        [...q.investigation].sort(),
        [
          ...PP_SUSPECTS.filter((c) => c !== q.guilty!.suspect),
          ...PP_HIDEOUTS.filter((c) => c !== q.guilty!.hideout),
          ...Array(easy ? 1 : 2).fill(PP.surprise),
        ].sort(),
      );
      assert.deepEqual(q.setAside.sort(), [PP.rules1, PP.rules2].sort());
      // No encounter card is revealed during setup.
      assert.equal(
        s.encounterDeck.length + s.encounterDiscard.length,
        easy ? 27 : 36,
      );
      assert.deepEqual(q.checked, []);
      reload(s);
    }
  assert.equal(ppRecipe(false).id, "Q99.07");
  assert.equal(ppRecipe(true).id, "E99.07");
  assert.deepEqual(
    PRANCING_PONY_ADVENTURES[0].stages.map((x) => [x.name, x.quest]),
    [
      ["Investigating the Crime", 12],
      ["Running out of Time", 0],
      ["Apprehending the Killer", 0],
    ],
  );
});

test("Investigate X: the first player shuffles the Investigation deck and looks at the top X; the cards return in order and are checked off", () => {
  let s = base();
  explore(s, PP.manor);
  const q = s.prancingPony!;
  assert.equal(q.checked.length, 2);
  assert.deepEqual(q.checked, q.investigation.slice(0, 2));
  assert.equal(q.investigation.length, 8);
  assert.ok(
    s.log.some((l) => /^Investigate 2 \(Ramshackle Manor\)/.test(l.text)),
  );
  // Old Warehouse: 2 additional cards, or each player's threat −3.
  s = base(2);
  explore(s, PP.warehouse);
  assert.match(s.choice!.title, /^Old Warehouse · Look at 2 additional/);
  s = choose(s, "look");
  s = settle(s);
  assert.equal(s.prancingPony!.checked.length, 3);
  s = base(2);
  explore(s, PP.warehouse);
  s = choose(s, "threat");
  s = settle(s);
  assert.deepEqual(threats(s), [17, 17]);
  assert.equal(s.prancingPony!.checked.length, 1);
  // Village Stable: a looked-at Suspect can be brought out.
  s = base();
  s.prancingPony!.investigation = [PP.jake];
  explore(s, PP.stable);
  assert.match(s.choice!.title, /^Village Stable · Add it to the victory/);
  s = choose(s, "stable");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === PP.jake));
  assert.ok(s.victoryCards!.includes(PP.stable));
  assert.ok(!s.encounterDiscard.includes(PP.stable));
  assert.deepEqual(s.prancingPony!.investigation, []);
  // 3B ignores the Investigate keyword.
  s = base();
  atQuest(s, PP.killer);
  explore(s, PP.manor);
  s = settle(s);
  assert.deepEqual(s.prancingPony!.checked, []);
  reload(s);
});

test("The Prancing Pony and Taken by Surprise: look at 2 cards or each player draws 2; a looked-at Taken by Surprise ambushes the first player and leaves the game", () => {
  let s = base(2);
  explore(s, PP.pony);
  assert.match(s.choice!.title, /^The Prancing Pony · Look at the top 2/);
  s = choose(s, "look");
  s = settle(s);
  assert.deepEqual(s.prancingPony!.checked, [PP.susie, PP.staddle]);
  assert.ok(s.victoryCards!.includes(PP.pony), "Victory 2");
  s = base(2);
  explore(s, PP.pony);
  s = choose(s, "draw");
  s = settle(s);
  assert.deepEqual(
    [0, 1].map((p) => seatView(s, p).hand.length),
    [2, 2],
  );
  // Taken by Surprise.
  s = base(2);
  s.prancingPony!.investigation = [PP.surprise, PP.susie];
  s.encounterDeck = [PP.manor, PP.footpad, PP.manor];
  s.encounterDiscard = [];
  run(s, fx("ppLookTop", { value: 2, player: 0 }));
  s = settle(s);
  const q = s.prancingPony!;
  assert.deepEqual(q.investigation, [PP.susie]);
  assert.deepEqual(q.removed, [PP.surprise]);
  assert.ok(seatView(s, 0).engaged.some((u) => u.code === PP.footpad));
  assert.ok(s.encounterDiscard.includes(PP.manor));
  reload(s);
});

test("Investigating the Crime: each player raises his threat by 2 or reveals an extra card; no more than 4 progress a round; 12 progress leads to Running out of Time, which stages X locations", () => {
  let s = base(2);
  s.phase = "resource";
  const effects = H.questBegin!(s) as ReturnType<typeof fx>[];
  assert.equal(effects.length, 2);
  run(s, ...effects);
  assert.match(s.choice!.title, /^Investigating the Crime · Raise your threat/);
  s = choose(s, "threat");
  s = choose(s, "reveal");
  assert.deepEqual(threats(s), [22, 20]);
  assert.equal(s.prancingPony!.extraReveals, 1);
  assert.equal(H.extraStagingReveals!(s), 1);
  // No more than 4 progress on the stage each round.
  s = base();
  const quest = { id: "quest", code: PP.crime } as Unit;
  const main = { ...quest };
  void main;
  run(s, fx("successfulQuestProgress", { value: 6, player: 0 }));
  assert.equal(s.progress, 4);
  run(s, fx("successfulQuestProgress", { value: 3, player: 0 }));
  assert.equal(s.progress, 4);
  s.round += 1;
  run(s, fx("successfulQuestProgress", { value: 3, player: 0 }));
  assert.equal(s.progress, 7);
  // 12 progress: 2A stages a location for each player.
  s = base(2);
  s.encounterDeck = [PP.ruffian, PP.alley, PP.footpad, PP.market, PP.manor];
  s.progress = 12;
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.prancingPony!.currentQuest, PP.time);
  assert.equal(s.stage, 2);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [PP.alley, PP.market],
  );
  assert.deepEqual(s.encounterDiscard, [PP.ruffian, PP.footpad]);
  reload(s);
});

test("Running out of Time: a failed quest removes a random Investigation card; progress from a successful quest offers a reveal or the accusation", () => {
  let s = base();
  atQuest(s, PP.time);
  run(s, fx("failedQuest", { value: 2, player: 0 }));
  s = settle(s);
  const q = s.prancingPony!;
  assert.equal(q.investigation.length, 7);
  assert.equal(q.removed.length, 1);
  assert.deepEqual(q.checked, [], "removed without looking");
  assert.equal(s.threat, 22);
  // Progress on the stage: reveal and remain.
  s = base();
  atQuest(s, PP.time);
  s.encounterDeck = [PP.manor, PP.manor];
  run(s, fx("successfulQuestProgress", { value: 2, player: 0 }));
  assert.match(s.choice!.title, /^Running out of Time · Reveal an encounter/);
  s = choose(s, "reveal");
  s = settle(s);
  assert.equal(s.prancingPony!.currentQuest, PP.time);
  assert.ok(s.staging.some((u) => u.code === PP.manor));
  // The explored active location's Investigate resolves first.
  s = base();
  atQuest(s, PP.time);
  activate(s, PP.manor).progress = 0;
  run(s, fx("successfulQuestProgress", { value: 5, player: 0 }));
  assert.equal(s.prancingPony!.checked.length, 2);
  assert.match(s.choice!.title, /^Running out of Time · Reveal an encounter/);
  reload(s);
});

test("The accusation: the facedown Suspect and Hideout enter the staging area; a wrong guess brings the named cards and 3 threat; 3A brings a Brigand for each other player", () => {
  // Correct.
  let s = base(2);
  atQuest(s, PP.time);
  s.encounterDeck = [PP.footpad, PP.manor, PP.outlaw];
  run(s, fx("ppAccuse", { player: 0 }));
  s = choose(s, PP.todd);
  s = choose(s, PP.ferneyHouse);
  assert.match(
    s.choice!.title,
    /^Apprehending the Killer · Search for a Brigand/,
  );
  s = choose(s, PP.outlaw);
  s = settle(s);
  let q = s.prancingPony!;
  assert.deepEqual(q.accusation, {
    suspect: PP.todd,
    hideout: PP.ferneyHouse,
    correct: true,
  });
  assert.equal(q.guilty, null);
  assert.equal(q.currentQuest, PP.killer);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [PP.todd, PP.ferneyHouse, PP.outlaw],
  );
  assert.deepEqual(threats(s), [20, 20]);
  // Wrong: Johnny and Archet Trading Post come out of the Investigation deck.
  s = base();
  atQuest(s, PP.time);
  run(s, fx("ppAccuse", { player: 0 }));
  s = choose(s, PP.johnny);
  s = choose(s, PP.archet);
  s = settle(s);
  q = s.prancingPony!;
  assert.equal(q.accusation!.correct, false);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [PP.todd, PP.ferneyHouse, PP.johnny, PP.archet].sort(),
  );
  assert.ok(!q.investigation.includes(PP.johnny));
  assert.equal(s.threat, 23);
  // Half right: only the wrong Hideout joins the guilty pair.
  s = base();
  atQuest(s, PP.time);
  run(s, fx("ppAccuse", { player: 0 }));
  s = choose(s, PP.todd);
  s = choose(s, PP.combe);
  s = settle(s);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [PP.todd, PP.ferneyHouse, PP.combe].sort(),
  );
  reload(s);
});

test("Apprehending the Killer: Suspects engage the first player; no damage while a Hideout is in play; with no Suspect left, the players win", () => {
  let s = base(2);
  atQuest(s, PP.killer);
  const todd = stage(s, PP.todd);
  const jake = engaged(s, PP.jake, 1);
  const house = stage(s, PP.ferneyHouse);
  s.phase = "encounter";
  H.encounterBegin!(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === todd.id));
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === jake.id));
  assert.equal(H.damageAmount!(s, todd, 3, {} as never), 0);
  s.staging = s.staging.filter((u) => u.id !== house.id);
  assert.equal(H.damageAmount!(s, todd, 3, {} as never), 3);
  // Defeating the last Suspect wins.
  run(s, fx("damage", { target: jake.id, value: 7 }));
  assert.equal(s.status, "playing");
  run(s, fx("damage", { target: todd.id, value: 10 }));
  assert.equal(s.status, "won");
  assert.match(s.reason!, /No Suspect remains in play/);
});

test("Hideouts in the victory display strengthen the Suspects; their Travel effects bring Brigands and Bill Ferny", () => {
  let s = base();
  const susie = engaged(s, PP.susie);
  // Chetwood Campsite: +1 threat, attack and defense.
  const before = stats(s, susie);
  addVictoryCard(s, PP.campsite);
  assert.equal(stats(s, susie).attack, before.attack + 1);
  assert.equal(stats(s, susie).defense, before.defense + 1);
  // Bill Ferny's House: Suspects and their shadows are immune.
  assert.equal(H.immune!(s, susie), false);
  addVictoryCard(s, PP.ferneyHouse);
  assert.equal(H.immune!(s, susie), true);
  assert.equal(H.shadowImmune!(s, susie), true);
  // Archet Trading Post: no more than 5 damage each round.
  s = base();
  const orcEyes = engaged(s, PP.orcEyes);
  addVictoryCard(s, PP.archet);
  run(s, fx("damage", { target: orcEyes.id, value: 4 }));
  assert.equal(H.damageAmount!(s, orcEyes, 4, {} as never), 1);
  // Staddle Hiding Hole: only the engaged player attacks a Suspect.
  s = base(2);
  const johnny = engaged(s, PP.johnny, 0);
  addVictoryCard(s, PP.staddle);
  let theirs!: Unit;
  forOwner(s, 1, () => (theirs = s.heroes[0]));
  assert.match(
    H.attackProblem!(s, johnny, [theirs.id])!,
    /^Staddle Hiding Hole/,
  );
  assert.equal(H.attackProblem!(s, johnny, [s.heroes[0].id]), null);
  // Combe Storehouse: a Suspect that engages attacks at once.
  s = base();
  addVictoryCard(s, PP.combe);
  const jake = stage(s, PP.jake);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: jake.id });
  assert.match(s.choice!.title, /^Wolf-pelt Jake · Immediate attack/);
  // Hideouts are immune; travel searches.
  s = base();
  assert.equal(H.immune!(s, stage(s, PP.archet)), true);
  s.encounterDeck = [PP.manor, PP.informant, PP.manor];
  run(s, ...H.travelEffects!(s, stage(s, PP.archet))!);
  assert.ok(s.staging.some((u) => u.code === PP.informant));
  s = base();
  s.encounterDeck = [PP.manor];
  s.victoryCards = [PP.ferny];
  s.victory = 3;
  run(s, ...H.travelEffects!(s, stage(s, PP.ferneyHouse))!);
  assert.ok(s.staging.some((u) => u.code === PP.ferny));
  assert.deepEqual(s.victoryCards, []);
  assert.equal(s.victory, 0);
  s = base();
  s.encounterDeck = [PP.manor, PP.footpad];
  run(s, ...H.travelEffects!(s, stage(s, PP.staddle))!);
  assert.match(
    s.choice!.title,
    /^Greenway Footpad · Raise each player's threat/,
  );
  reload(s);
});

test("Suspects: Todd's excess damage raises threat, Susie hides behind other Brigands, Jake returns after killing an ally, Johnny's theft raises threat, Old Orc-eyes attacks again after a blank shadow", () => {
  // Todd the Troll: 7 attack undefended against a 5-hit-point hero.
  let s = base();
  const todd = engaged(s, PP.todd);
  todd.shadows = [PP.manor];
  const aragorn = s.heroes[0];
  const health = stats(s, aragorn).health;
  s.phase = "defense";
  s = defend(s, todd);
  s = settle(s, aragorn.id);
  assert.equal(get(s, aragorn.id), undefined, "the hero is destroyed");
  assert.equal(s.threat, 20 + 7 - health);
  // Susie the Spider: X threat; no damage while another Brigand is in play.
  s = base();
  const susie = stage(s, PP.susie);
  stage(s, PP.ruffian);
  assert.equal(threatOf(s, susie), 2);
  assert.equal(H.damageAmount!(s, susie, 3, {} as never), 0);
  // Wolf-pelt Jake returns to the staging area after destroying an ally.
  s = base();
  const [guard] = allies(s, [GUARD]);
  const jake = engaged(s, PP.jake);
  jake.shadows = [PP.manor];
  s.phase = "defense";
  s = defend(s, jake, guard);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === jake.id));
  // Johnny Goblin-fingers: a random card from hand raises threat by its cost.
  s = base();
  hand(s, ["01026"]);
  const johnny = engaged(s, PP.johnny);
  johnny.shadows = [PP.manor];
  s.phase = "defense";
  s = defend(s, johnny, s.heroes[0]);
  s = settle(s);
  assert.equal(s.hand.length, 0);
  assert.equal(s.threat, 20 + Number(card("01026").cost));
  // Old Orc-eyes: a blank shadow brings an additional attack.
  s = base();
  const orc = engaged(s, PP.orcEyes);
  orc.shadows = [PP.manor];
  s.phase = "defense";
  s = defend(s, orc, s.heroes[0]);
  assert.match(s.choice!.title, /^Old Orc-eyes · Immediate attack/);
  reload(s);
});

test("Encounter cards: Ramshackle Manor, Dark Alley, Market Square, Old Warehouse and Village Stable", () => {
  // Ramshackle Manor: player card threat reduction is limited to 1.
  let s = base();
  stage(s, PP.manor);
  assert.equal(reduceThreat(s, 3, "01001", "player-card"), 1);
  assert.equal(reduceThreat(s, 3, PP.warehouse, "encounter"), 3);
  run(s, ...H.travelEffects!(s, s.staging[0])!);
  assert.equal(s.threat, 17);
  // Dark Alley: enemies in the staging area cannot take damage.
  s = base();
  stage(s, PP.alley);
  const ruffian = stage(s, PP.ruffian);
  assert.equal(H.damageAmount!(s, ruffian, 2, {} as never), 0);
  s.encounterDeck = [PP.manor, PP.footpad];
  run(s, ...H.travelEffects!(s, s.staging[0])!);
  assert.ok(s.staging.some((u) => u.code === PP.footpad));
  // Market Square: progress on a staging location raises threat; travel costs.
  s = base();
  const market = stage(s, PP.market);
  H.locationProgressPlaced!(s, market, 1);
  assert.equal(s.threat, 21);
  for (const h of s.heroes) h.resources = 0;
  assert.match(H.travelProblem!(s, market)!, /^Market Square/);
  s.heroes[1].resources = 2;
  assert.equal(H.travelProblem!(s, market), null);
  run(s, ...H.travelEffects!(s, market)!);
  assert.equal(s.heroes[1].resources, 1);
  // Village Stable: each player discards a random card to travel.
  s = base();
  const stable = stage(s, PP.stable);
  assert.match(H.travelProblem!(s, stable)!, /^Village Stable/);
  hand(s, ["01026"]);
  run(s, ...H.travelEffects!(s, stable)!);
  assert.equal(s.hand.length, 0);
  reload(s);
});

test("Encounter cards: Bill Ferny, Bree-land Informant, Lawless Ruffian, Greenway Footpad, Chetwood Outlaw", () => {
  let s = base();
  const ferny = stage(s, PP.ferny);
  assert.equal(H.cannotOptionallyEngage!(s, ferny), true);
  // The first treachery each round gains doomed 1 and cannot be canceled.
  assert.equal(H.revealedDoomed!(s, PP.smoke, undefined), 1);
  assert.equal(H.revealedDoomed!(s, PP.smoke, undefined), 0);
  // Lawless Ruffian: +2 attack against a player with 35 threat.
  s = base();
  const ruffian = engaged(s, PP.ruffian);
  const attack = stats(s, ruffian).attack;
  s.threat = 35;
  assert.equal(stats(s, ruffian).attack, attack + 2);
  // Greenway Footpad: each player's threat +2, or an attack.
  s = base(2);
  s.encounterDeck = [PP.footpad];
  run(s, fx("reveal", { player: 0 }));
  assert.match(
    s.choice!.title,
    /^Greenway Footpad · Raise each player's threat/,
  );
  s = choose(s, "threat");
  s = settle(s);
  assert.deepEqual(threats(s), [22, 22]);
  // Chetwood Outlaw: optional engagement raises threat by 4.
  s = base();
  const outlaw = stage(s, PP.outlaw);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: outlaw.id });
  s = settle(s);
  assert.equal(s.threat, 24);
  // Bree-land Informant: a blank shadow lets the player look at the bottom.
  s = base();
  const informant = engaged(s, PP.informant);
  informant.shadows = [PP.manor];
  s.phase = "defense";
  s = defend(s, informant, s.heroes[0]);
  s = settle(s, s.heroes[0].id);
  assert.equal(s.threat, 21);
  assert.equal(s.heroes[0].resources, 9);
  assert.deepEqual(s.prancingPony!.checked, [PP.campsite]);
  assert.ok(!seatView(s, 0).engaged.some((u) => u.id === informant.id));
  assert.ok(s.encounterDiscard.includes(PP.informant));
  reload(s);
});

test("Shadows and treacheries: Bill Ferny, Lawless Ruffian, Greenway Footpad, Chetwood Outlaw, Smoke and Mirrors, Rising Body Count, Deadly Accusations, Hired Muscle", () => {
  // Bill Ferny's shadow: 4 threat or undefended.
  let s = base();
  let enemy = engaged(s, PP.ruffian);
  enemy.shadows = [PP.ferny];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  assert.match(s.choice!.title, /^Bill Ferny · Raise your threat by 4/);
  s = choose(s, "threat");
  s = settle(s);
  assert.equal(s.threat, 24);
  // Greenway Footpad's shadow: +2 attack at 35 threat.
  s = base();
  s.threat = 35;
  enemy = engaged(s, PP.ruffian);
  enemy.shadows = [PP.footpad];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  // Ruffian 3 + 2 (threat 35) + 2 − Aragorn's 2 = 5.
  assert.ok(
    s.log.some(
      (l) => l.text === "Lawless Ruffian attacks for 7 − 2 defense = 5 damage.",
    ),
  );
  // Chetwood Outlaw's shadow: the attacker returns to the staging area.
  s = base();
  enemy = engaged(s, PP.ruffian);
  enemy.shadows = [PP.outlaw];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = choose(s, "return");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  // Smoke and Mirrors: X cards discarded add their threat for the phase.
  s = base();
  activate(s, PP.manor);
  s.encounterDeck = [PP.smoke, PP.alley, PP.market, PP.manor, PP.footpad];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.equal(s.prancingPony!.smoke!.value, 4 + 2 + 2);
  // Deadly Accusations: X = 1 + Investigate 2.
  s = base(2);
  activate(s, PP.manor);
  s.encounterDeck = [PP.accusations, PP.manor];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.deepEqual(threats(s), [23, 23]);
  // Rising Body Count: into the Investigation deck.
  s = base();
  s.encounterDeck = [PP.body, PP.manor];
  run(s, fx("reveal", { player: 0 }));
  s = choose(s, "shuffle");
  s = settle(s);
  assert.ok(s.prancingPony!.investigation.includes(PP.body));
  assert.ok(!s.encounterDiscard.includes(PP.body));
  // Hired Muscle: attached to a Brigand, which returns to the staging area.
  s = base();
  const target = engaged(s, PP.ruffian);
  s.encounterDeck = [PP.muscle, PP.manor];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  const back = s.staging.find((u) => u.id === target.id)!;
  assert.ok(back.attachments.some((a) => a.code === PP.muscle));
  assert.equal(threatOf(s, back), 3);
  // Defeated: look at the bottom card of the Investigation deck.
  run(s, fx("damage", { target: back.id, value: 9 }));
  s = settle(s);
  assert.deepEqual(s.prancingPony!.checked, [PP.campsite]);
  reload(s);
});

test("Saves and the scenario panel", () => {
  const s = base(2);
  s.prancingPony!.checked = [PP.susie, PP.combe];
  s.prancingPony!.removed = [PP.surprise];
  const restored = reload(s);
  assert.deepEqual(restored.prancingPony, s.prancingPony);
  const view = prancingPonyPublicState(restored)!;
  assert.equal(view.side, "1B");
  assert.equal(view.stage, 1);
  assert.equal(view.investigation, 8);
  assert.equal(view.removed, 1);
  assert.deepEqual(view.checked, [PP.susie, PP.combe]);
  assert.equal(view.hidden, true);
  assert.equal(view.accusation, null);
  assert.deepEqual(publicState(restored).prancingPony, view);
  assert.ok(
    !JSON.stringify(view).includes(PP.todd),
    "the facedown Suspect stays hidden",
  );
  // A save whose stage does not match its quest card is rejected.
  const raw = JSON.parse(JSON.stringify(s));
  raw.stage = 3;
  assert.throws(() => reload(raw));
  void canTravel;
});
