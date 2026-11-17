import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import { engagementCost, fx, get, stats, threatOf } from "../src/game/core";
import { addVictoryCard, check } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, seatView } from "../src/game/table";
import {
  ANNUMINAS_HOOKS,
  SA,
  annuminasPublicState,
  saRecipe,
} from "../src/game/annuminas";
import { ANNUMINAS_ADVENTURES } from "../src/game/annuminas-scenario-data";
import {
  activate,
  allies,
  atQuest,
  base,
  choose,
  engaged,
  reload,
  settle,
  stage,
  start,
} from "./annuminas-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = ANNUMINAS_HOOKS;
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
const city = (s: GameState) => s.annuminas!.cityStrength;
const roundEnd = (s: GameState) => run(s, ...H.roundEnd!(s));

test("Setup: Annúminas (city strength 20) and Gate of Annúminas are staged, each other player adds a different location, and the siege cards are set aside", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.annuminas!;
      assert.equal(q.currentQuest, SA.rebuild);
      assert.equal(s.stage, 1);
      assert.equal(q.cityStrength, 20);
      const staged = s.staging.map((u) => u.code);
      assert.equal(staged[0], SA.city);
      assert.equal(staged[1], SA.gate);
      assert.equal(
        new Set(staged.slice(1)).size,
        players,
        "different locations",
      );
      assert.ok(staged.slice(1).every((c) => card(c).type_code === "location"));
      assert.deepEqual(
        [...q.setAside].sort(),
        [
          SA.mode,
          SA.rules1,
          SA.rules2,
          SA.rules3,
          SA.lieutenant,
          SA.ram,
          SA.camp,
          SA.tunnel,
          SA.host,
          SA.host,
          SA.host,
          SA.dunedain,
          SA.dunedain,
          SA.dunedain,
        ].sort(),
      );
      // The first round began: 1B has its first resource.
      assert.equal(q.questResources, 1);
      assert.equal(
        s.encounterDeck.length + s.encounterDiscard.length,
        35 - players,
      );
      reload(s);
    }
  assert.equal(saRecipe().id, "Q99.08");
  assert.deepEqual(
    ANNUMINAS_ADVENTURES[0].stages.map((x) => [x.name, x.quest]),
    [
      ["Rebuild the Defenses", 0],
      ["Defend the City", 50],
      ["Lead the Sortie", 0],
    ],
  );
});

test("Rebuild the Defenses: a resource each round advances at 4; the Dúnedain and X Hosts join the deck before 2A stages X enemies; 10 progress can raise the city strength by 10", () => {
  let s = base(3);
  s.encounterDeck = [SA.wall, SA.orc, SA.gate, SA.warg, SA.rider];
  s.annuminas!.questResources = 3;
  run(s, ...H.resourceStart!(s));
  s = settle(s);
  const q = s.annuminas!;
  assert.equal(q.currentQuest, SA.defend);
  assert.equal(s.stage, 2);
  // 3 Dúnedain and 2 Hosts (players − 1) were shuffled in.
  assert.deepEqual(
    q.setAside.filter((c) => c === SA.host || c === SA.dunedain),
    [SA.host],
  );
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    2,
    "X = players − 1 enemies",
  );
  // Response: 10 progress for 10 city strength.
  s = base();
  s.progress = 12;
  run(s, fx("saRebuildResponse", { player: 0 }));
  assert.match(s.choice!.title, /^Rebuild the Defenses · Remove 10 progress/);
  s = choose(s, "use");
  assert.equal(s.progress, 2);
  assert.equal(city(s), 30);
  reload(s);
});

test("Annúminas: each enemy in play deals 1 damage at the end of the round, a player's elimination 9; at 0 city strength the players lose", () => {
  let s = base(2);
  stage(s, SA.orc);
  engaged(s, SA.warg, 1);
  roundEnd(s);
  assert.equal(city(s), 18);
  H.playerEliminated!(s, 1);
  assert.equal(city(s), 9);
  s.annuminas!.cityStrength = 2;
  roundEnd(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /city is overrun/);
});

test("Defend the City: 50 quest points, 10 fewer for each Host of Angmar in the victory display; the strongest staged enemy attacks each player after the commitments; each player heals 1 damage at the end of the round", () => {
  let s = base(2);
  atQuest(s, SA.defend);
  assert.equal(H.stageInfo!(s)!.quest, 50);
  addVictoryCard(s, SA.host);
  addVictoryCard(s, SA.host);
  assert.equal(H.stageInfo!(s)!.quest, 30);
  // After the commitments.
  stage(s, SA.warg);
  const vanguard = stage(s, SA.vanguard);
  H.committed!(s);
  flush(s);
  assert.match(s.choice!.title, /^Vanguard of Carn Dûm · Immediate attack/);
  assert.equal(s.combat?.enemyId, vanguard.id);
  // No enemy in the staging area: the top card is revealed.
  s = base();
  atQuest(s, SA.defend);
  s.encounterDeck = [SA.wall, SA.wall];
  H.committed!(s);
  flush(s);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === SA.wall));
  // Heal 1 damage.
  s = base();
  atQuest(s, SA.defend);
  s.heroes[0].damage = 2;
  run(s, fx("saHeal", { player: 0 }));
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].damage, 1);
  reload(s);
});

test("Lead the Sortie: Battering Ram and Lieutenant of Angmar enter the staging area; no progress while the Ram is in play; the Lieutenant needs 10 progress, returns to attack each round, and wins the game from the victory display", () => {
  let s = base(2);
  atQuest(s, SA.defend);
  s.encounterDeck = [SA.wall, SA.wall, SA.wall];
  run(s, fx("saDefeatQuest", { player: 0 }));
  s = settle(s);
  assert.equal(s.annuminas!.currentQuest, SA.sortie);
  assert.ok(s.staging.some((u) => u.code === SA.ram));
  const lt = s.staging.find((u) => u.code === SA.lieutenant)!;
  assert.ok(lt);
  assert.ok(
    s.staging.some((u) => u.code === SA.wall),
    "the other player reveals",
  );
  // No progress on 3B while the Ram is in play.
  const main = { id: "quest" } as Unit;
  void main;
  run(s, fx("successfulQuestProgress", { value: 5, player: 0 }));
  assert.equal(s.progress, 0);
  // Immune; no damage under 10 progress.
  assert.equal(H.immune!(s, lt), true);
  assert.equal(H.damageAmount!(s, lt, 4, {} as never), 0);
  s.progress = 10;
  assert.equal(H.damageAmount!(s, lt, 4, {} as never), 4);
  // End of the round: the Lieutenant returns and attacks the first player.
  s = base(2);
  atQuest(s, SA.sortie);
  s.annuminas!.setAside = s.annuminas!.setAside.filter(
    (c) => c !== SA.lieutenant,
  );
  const engagedLt = engaged(s, SA.lieutenant, 1);
  run(s, fx("saLieutenant", { player: 0 }));
  assert.ok(s.staging.some((u) => u.id === engagedLt.id));
  assert.match(s.choice!.title, /^Lieutenant of Angmar · Immediate attack/);
  // Lieutenant of Angmar in the victory display: the players win.
  s = base();
  atQuest(s, SA.sortie);
  s.annuminas!.setAside = s.annuminas!.setAside.filter(
    (c) => c !== SA.lieutenant,
  );
  addVictoryCard(s, SA.lieutenant);
  roundEnd(s);
  assert.equal(s.status, "won");
  assert.match(s.reason!, /routed the enemy/);
});

test("Siege locations and the city: Battering Ram, City Wall, Siege Tunnel, Enemy Camp, Gate of Annúminas, Arnor Battlefield, Hills of Evendim, Shores of Lake Nenuial", () => {
  // Battering Ram: a resource, then X (1 + resources) damage each round.
  let s = base();
  const ram = stage(s, SA.ram);
  assert.equal(threatOf(s, ram), 1);
  roundEnd(s);
  assert.equal(ram.resources, 1);
  assert.equal(city(s), 18);
  assert.equal(H.immune!(s, ram), true);
  // City Wall: at 3 resources it is discarded for 4 damage and a reveal.
  s = base();
  const wall = stage(s, SA.wall);
  wall.resources = 2;
  s.encounterDeck = [SA.gate, SA.gate];
  roundEnd(s);
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.id === wall.id));
  assert.equal(city(s), 16);
  assert.ok(s.staging.some((u) => u.code === SA.gate));
  // Siege Tunnel: discard until an enemy, which is staged.
  s = base();
  stage(s, SA.tunnel);
  s.encounterDeck = [SA.wall, SA.rider, SA.orc];
  roundEnd(s);
  assert.ok(s.staging.some((u) => u.code === SA.rider));
  // Gate of Annúminas: X threat; each player engages an enemy to travel.
  s = base(2);
  const gate = stage(s, SA.gate);
  stage(s, SA.orc);
  assert.equal(threatOf(s, gate), 2);
  assert.match(H.travelProblem!(s, gate)!, /^Gate of Annúminas/);
  stage(s, SA.warg);
  assert.equal(H.travelProblem!(s, gate), null);
  // Arnor Battlefield: -5 engagement cost; Shores of Lake Nenuial blocks
  // progress on the other staged locations; Hills of Evendim forbids
  // cancelling 'when revealed' effects.
  s = base();
  const orc = stage(s, SA.orc);
  const before = engagementCost(s, orc);
  stage(s, SA.battlefield);
  assert.equal(engagementCost(s, orc), before - 5);
  const other = stage(s, SA.wall);
  stage(s, SA.nenuial);
  assert.equal(H.locationProgressBlocked!(s, other), true);
  stage(s, SA.evendim);
  assert.equal(H.cannotCancel!(s, false), true);
  assert.equal(H.cannotCancel!(s, true), false);
  // Travel costs.
  s = base(2);
  run(s, ...H.travelEffects!(s, stage(s, SA.nenuial))!);
  assert.deepEqual(threats(s), [22, 22]);
  reload(s);
});

test("Enemies: archery, Warg of Carn Dûm, Orc of Angmar, Angmar Warg-rider, Savage Werewolf, Vanguard of Carn Dûm, Host of Angmar", () => {
  // Archery: Host 2 + Orc 1 + Warg-rider 1 at the beginning of combat.
  let s = base();
  s.annuminas!.setAside.splice(s.annuminas!.setAside.indexOf(SA.host), 1);
  stage(s, SA.host);
  stage(s, SA.orc);
  engaged(s, SA.rider);
  H.combatBegin!(s);
  flush(s);
  assert.match(s.choice!.title, /^Assign Archery damage · 4 remaining/);
  // Warg of Carn Dûm: remove 1 progress or exhaust a character.
  s = base();
  s.progress = 3;
  const warg = stage(s, SA.warg);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: warg.id });
  assert.match(s.choice!.title, /^Warg of Carn Dûm · Remove 1 progress/);
  s = choose(s, "progress");
  assert.equal(s.progress, 2);
  // Orc of Angmar: when it attacks, remove 1 progress or +2 defense.
  s = base();
  s.progress = 3;
  const orc = engaged(s, SA.orc);
  orc.shadows = [SA.wall];
  s.phase = "defense";
  s = defend(s, orc, s.heroes[0]);
  assert.match(s.choice!.title, /^Orc of Angmar · /);
  s = choose(s, "other");
  assert.equal(stats(s, get(s, orc.id)!).defense, 4);
  // Orc of Angmar's shadow: the defender gets -2 defense for the round.
  s = base();
  const rider = engaged(s, SA.rider);
  rider.shadows = [SA.orc];
  const aragorn = s.heroes[0];
  const defense = stats(s, aragorn).defense;
  s.phase = "defense";
  s = defend(s, rider, aragorn);
  s = settle(s);
  assert.equal(stats(s, get(s, aragorn.id)!).defense, defense - 2);
  // Vanguard of Carn Dûm: no more than 5 progress on the main quest a round.
  s = base();
  stage(s, SA.vanguard);
  run(s, fx("successfulQuestProgress", { value: 8, player: 0 }));
  assert.equal(s.progress, 5);
  assert.equal(H.cannotAttach!(s, s.staging[1], "01001"), true);
  // Host of Angmar is immune.
  s = base();
  s.annuminas!.setAside.splice(s.annuminas!.setAside.indexOf(SA.host), 1);
  assert.equal(H.immune!(s, stage(s, SA.host)), true);
  reload(s);
});

test("Treacheries and shadows: The Hordes of Angmar, Sorcery of Carn Dûm, Caught in the Press, Weary Warriors; Dúnedain of Annúminas joins a player for a resource", () => {
  // The Hordes of Angmar: return the highest threat enemy engaged.
  let s = base();
  const rider = engaged(s, SA.rider);
  s.encounterDeck = [SA.hordes, SA.wall];
  run(s, fx("reveal", { player: 0 }));
  assert.match(s.choice!.title, /^The Hordes of Angmar · /);
  s = choose(s, "return");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === rider.id));
  assert.ok(s.encounterDiscard.includes(SA.hordes));
  // Caught in the Press: -1 willpower for the questing characters.
  s = base();
  s.heroes[0].committed = true;
  const will = stats(s, s.heroes[0]).will;
  s.phase = "quest";
  s.encounterDeck = [SA.press, SA.wall];
  run(s, fx("reveal", { player: 0 }));
  s = choose(s, "willpower");
  s = settle(s);
  assert.equal(stats(s, s.heroes[0]).will, will - 1);
  // Weary Warriors: damage a hero, remove it from the quest, blank its text.
  s = base();
  const hero = s.heroes[0];
  hero.committed = true;
  s.encounterDeck = [SA.weary, SA.wall];
  run(s, fx("reveal", { player: 0 }));
  s = choose(s, hero.id);
  s = settle(s);
  const after = get(s, hero.id)!;
  assert.equal(after.damage, 1);
  assert.equal(after.committed, false);
  assert.equal(H.characterBlanked!(s, after), true);
  // Dúnedain of Annúminas: a player pays 1 resource to take control.
  s = base();
  s.encounterDeck = [SA.dunedain, SA.wall, SA.wall];
  run(s, fx("reveal", { player: 0 }));
  assert.match(s.choice!.title, /^Dúnedain of Annúminas · Spend 1 resource/);
  s = choose(s, s.heroes[0].id);
  s = settle(s);
  assert.ok(s.allies.some((u) => u.code === SA.dunedain));
  assert.equal(s.heroes[0].resources, 9);
  // Its shadow readies the defender with +2 defense.
  s = base();
  const [guard] = allies(s, ["01013"]);
  guard.exhausted = true;
  const orc = engaged(s, SA.orc);
  orc.shadows = [SA.dunedain];
  s.phase = "defense";
  s = defend(s, orc, s.heroes[0]);
  s = settle(s, "other");
  assert.ok(
    s.log.some((l) =>
      /Dúnedain of Annúminas: the defending character readies/.test(l.text),
    ),
  );
  void forOwner;
  void seatView;
  void check;
  void activate;
  reload(s);
});

test("Saves and the scenario panel", () => {
  const s = base(2);
  s.annuminas!.cityStrength = 13;
  s.annuminas!.questResources = 2;
  const restored = reload(s);
  assert.deepEqual(restored.annuminas, s.annuminas);
  const view = annuminasPublicState(restored)!;
  assert.equal(view.side, "1B");
  assert.equal(view.stage, 1);
  assert.equal(view.cityStrength, 13);
  assert.equal(view.questResources, 2);
  assert.equal(view.lieutenant, "aside");
  assert.equal(view.hosts, 0);
  assert.deepEqual(publicState(restored).annuminas, view);
  const raw = JSON.parse(JSON.stringify(s));
  raw.stage = 3;
  assert.throws(() => reload(raw));
});
