import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  availableAbilities,
  createGame,
  publicState,
  stageInfo,
} from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import { fx, get, stagingThreat, stats, threatOf } from "../src/game/core";
import { check, damage, nextRound, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import {
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import { sagaHero, tosAragorn } from "../src/game/lotr-saga";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import { UH, URUK_HAI_RECIPES, urukHaiPublicState } from "../src/game/uruk-hai";
import {
  activate,
  allies,
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./uruk-hai-fixtures";
import type { GameState } from "../src/game/types";

const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s: GameState, code: string, p = 0) => {
  s.encounterDeck.unshift(code);
  s.queue.push({ kind: "reveal", player: p });
  flush(s);
  return s;
};
const run = (s: GameState, kind: string, p = 0) => {
  s.queue.push(fx(kind, { player: p }));
  flush(s);
  return s;
};
const SNOWBOURN = "01016",
  GUARD = "01013",
  GLEOWINE = "01062",
  STEWARD = "01026",
  TEST_OF_WILL = "01050";
const count = (list: string[], code: string) =>
  list.filter((c) => c === code).length;

test("Setup: Eastemnet active, Uglúk and To Isengard! staged, a Captive for each player and the pursuit value at 10, in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.urukHai!;
      assert.equal(s.stage, 1);
      assert.equal(q.currentQuest, UH.follow);
      assert.equal(q.pursuit, 10);
      assert.equal(card(s.activeLocation!.code).name, "Eastemnet");
      assert.deepEqual(
        s.staging.map((u) => u.code).sort(),
        [UH.isengard, UH.ugluk].sort(),
      );
      assert.equal(s.encounterDeck.length, easy ? 25 : 34);
      assert.equal(count(s.encounterDeck, UH.grishnakh), easy ? 0 : 1);
      // One Captive for each player, none of them a Fellowship hero.
      assert.deepEqual(
        q.captives.map((c) => c.owner),
        playerOrder(s),
      );
      for (const c of q.captives) {
        assert.notEqual(card(c.unit.code).sphere_code, "fellowship");
        assert.ok(!seatView(s, c.owner).heroes.some((h) => h.id === c.unit.id));
      }
      // The first player controls the Fellowship Aragorn; the leadership
      // starter's own Aragorn is set aside.
      assert.ok(seatView(s, 0).heroes.some((h) => h.code === TOS_ARAGORN));
      assert.equal(sagaHero(s)?.code, TOS_ARAGORN);
      assert.ok(!seatView(s, 0).startingHeroes.includes("01001"));
      assert.ok(
        s.log.some((l) => /Aragorn is set aside/.test(l.text)),
        "the set-aside Aragorn is logged",
      );
      assert.equal(stageInfo(s).quest, 10);
      reload(s);
    }
});

test("Setup refuses Saruman and Gríma, allows other Frodo heroes and needs a hero besides Aragorn", () => {
  const d = STARTERS[2];
  const make = (heroes: string[]) =>
    createGame(1, d.cards, d.heroes, d.id, {
      scenarioId: "the-uruk-hai",
      seats: [{ deckId: d.id, heroes }],
    });
  assert.throws(() => make(["07002", "01007"]), /Saruman or Gríma/);
  assert.throws(() => make(["22054", "01007"]), /Saruman or Gríma/);
  assert.throws(() => make(["01001"]), /besides Aragorn/);
  const frodo = make(["02025", "01007"]);
  assert.ok(frodo.heroes.some((h) => h.code === "02025"));
  assert.ok(frodo.heroes.some((h) => h.code === TOS_ARAGORN));
});

test("Each player chooses a non-Fellowship hero to be a Captive", () => {
  const d = STARTERS[0];
  let s = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "the-uruk-hai",
  });
  for (let n = 0; s.phase === "setup" && !s.choice && n < 20; n++)
    s = applyAction(reload(s), { type: "KEEP" });
  assert.match(
    s.choice!.title,
    /^Follow the Orcs · Choose a hero to be a Captive/,
  );
  assert.deepEqual(s.choice!.options.map((o) => card(o.code!).name).sort(), [
    "Glóin",
    "Théodred",
  ]);
  const gloin = s.choice!.options.find((o) => card(o.code!).name === "Glóin")!;
  s = choose(s, gloin.id);
  s = settle(s);
  assert.deepEqual(
    s.urukHai!.captives.map((c) => card(c.unit.code).name),
    ["Glóin"],
  );
  assert.deepEqual(s.heroes.map((h) => card(h.code).name).sort(), [
    "Aragorn",
    "Théodred",
  ]);
});

test("Follow the Orcs: X is the pursuit value; defeating it reveals an Uruk-hai enemy for each player", () => {
  let s = base(2);
  s.urukHai!.pursuit = 12;
  assert.equal(stageInfo(s).quest, 12);
  s.encounterDeck = [UH.plains, UH.fighter, UH.plains];
  s.encounterDiscard = [UH.fighter];
  s.progress = 11;
  forOwner(s, 0, () => check(s));
  flush(s);
  assert.equal(s.stage, 1);
  s.progress = 12;
  forOwner(s, 0, () => check(s));
  flush(s);
  assert.equal(s.stage, 2);
  assert.equal(s.urukHai!.currentQuest, UH.rescue);
  assert.match(
    s.choice!.title,
    /^Rescue the Captives · Reveal an Uruk-hai enemy/,
  );
  s = choose(s, `deck-${UH.fighter}`);
  assert.match(
    s.choice!.title,
    /^Rescue the Captives · Reveal an Uruk-hai enemy/,
  );
  s = choose(s, `discard-${UH.fighter}`);
  s = settle(s);
  assert.equal(
    count(
      s.staging.map((u) => u.code),
      UH.fighter,
    ),
    2,
  );
  assert.deepEqual(s.encounterDiscard, []);
  assert.equal(s.progress, 0);
});

test("Follow the Orcs: Uglúk cannot leave the staging area or take damage, and each staged enemy adds 1 at the end of the combat phase", () => {
  let s = base(1);
  const ugluk = s.staging.find((u) => u.code === UH.ugluk)!;
  s.threat = 40;
  s.phase = "encounter";
  run(s, "startEncounter");
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.id === ugluk.id),
    "Uglúk is not engaged",
  );
  damage(s, ugluk.id, 4);
  assert.equal(get(s, ugluk.id)!.damage, 0);
  stage(s, UH.snaga);
  s.phase = "attack";
  run(s, "uhCombatPursuit");
  assert.equal(s.urukHai!.pursuit, 12);
  // At stage 2 Uglúk can be engaged and damaged, with Toughness 3.
  s = base(1, 2);
  const free = s.staging.find((u) => u.code === UH.ugluk)!;
  damage(s, free.id, 5);
  assert.equal(get(s, free.id)!.damage, 2);
  run(s, "uhCombatPursuit");
  assert.equal(s.urukHai!.pursuit, 10, "1B's forced effect is gone");
});

test("To Isengard!: the pursuit value rises at the end of the refresh phase; at 30 or with no Captive the players lose", () => {
  let s = base(1);
  s.phase = "refresh";
  s.queue.push({ kind: "endRound", player: 0 });
  flush(s);
  s = settle(s);
  assert.equal(s.urukHai!.pursuit, 11);
  assert.equal(s.status, "playing");
  s = base(1);
  s.urukHai!.pursuit = 29;
  s.phase = "refresh";
  s.queue.push({ kind: "endRound", player: 0 });
  flush(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /pursuit value is 30/);
  s = base(1);
  s.urukHai!.captives = [];
  forOwner(s, 0, () => check(s));
  assert.equal(s.status, "lost");
  assert.match(s.reason, /no Captives in play/);
});

test("Aragorn passes with the first player token, readies a hero for 2 of his resources, and his loss loses the game", () => {
  let s = base(2);
  const aragorn = tosAragorn(s)!;
  // Action: spend 2 resources from Aragorn's pool to ready a hero.
  const gloin = s.heroes.find((h) => h.code !== TOS_ARAGORN)!;
  gloin.exhausted = true;
  const ability = availableAbilities(s, aragorn).find((a) =>
    a.label.startsWith("Aragorn"),
  )!;
  assert.equal(ability.disabled, false);
  s = act(s, { type: "ABILITY", id: aragorn.id });
  assert.match(s.choice!.title, /^Aragorn · Ready a hero/);
  s = choose(s, gloin.id);
  assert.equal(get(s, gloin.id)!.exhausted, false);
  assert.equal(get(s, aragorn.id)!.resources, 0);
  assert.ok(
    availableAbilities(s, get(s, aragorn.id)!).find((a) =>
      a.label.startsWith("Aragorn"),
    )!.disabled,
  );
  // The first player token passes: Aragorn goes with it.
  s.phase = "combat" as never;
  s.queue.push({ kind: "refreshEnd", player: 0 });
  flush(s);
  s = settle(s);
  assert.equal(firstPlayer(s), 1);
  assert.ok(seatView(s, 1).heroes.some((h) => h.code === TOS_ARAGORN));
  assert.ok(!seatView(s, 0).heroes.some((h) => h.code === TOS_ARAGORN));
  // If Aragorn leaves play, the players lose the game.
  s = base(1);
  s.heroes = s.heroes.filter((h) => h.code !== TOS_ARAGORN);
  forOwner(s, 0, () => check(s));
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Aragorn has left play/);
});

test("Rescue the Captives: each defeated enemy reduces the pursuit value; the players win once Uglúk is gone", () => {
  let s = base(1, 2);
  const ugluk = s.staging.find((u) => u.code === UH.ugluk)!;
  const [snaga] = [engaged(s, UH.snaga)];
  damage(s, snaga.id, 3);
  flush(s);
  assert.equal(get(s, snaga.id), undefined);
  assert.equal(s.urukHai!.pursuit, 9);
  s.progress = 9;
  forOwner(s, 0, () => check(s));
  flush(s);
  assert.equal(s.status, "playing", "Uglúk is in play");
  damage(s, ugluk.id, 9);
  flush(s);
  assert.equal(get(s, ugluk.id), undefined);
  assert.equal(s.urukHai!.pursuit, 8);
  forOwner(s, 0, () => check(s));
  flush(s);
  assert.equal(s.status, "won");
});

test("Grishnákh takes a Captive, deals it 1 damage at the end of each quest phase, and returns it when defeated", () => {
  let s = base(2);
  s.phase = "staging";
  reveal(s, UH.grishnakh, 0);
  assert.match(s.choice!.title, /^Grishnákh · Attach a Captive to him/);
  const captive = s.urukHai!.captives[1];
  s = choose(s, captive.unit.id);
  s = settle(s);
  const grishnakh = s.staging.find((u) => u.code === UH.grishnakh)!;
  assert.equal(s.urukHai!.captives[1].holder, grishnakh.id);
  run(s, "finishQuestPhase");
  s = settle(s);
  assert.equal(s.urukHai!.captives[1].unit.damage, 1);
  // Defeated: the Captive goes back underneath To Isengard!.
  s.phase = "planning";
  damage(s, grishnakh.id, 9);
  flush(s);
  assert.equal(s.urukHai!.captives[1].holder, undefined);
  assert.equal(s.urukHai!.captives.length, 2);
  // A Captive destroyed by Grishnákh's damage is discarded; the last one loses.
  s = base(1);
  s.phase = "staging";
  reveal(s, UH.grishnakh, 0);
  s = settle(s);
  const only = s.urukHai!.captives[0];
  only.unit.damage = (card(only.unit.code).health ?? 0) - 1;
  run(s, "finishQuestPhase");
  assert.equal(s.urukHai!.captives.length, 0);
  assert.ok(s.discard.includes(only.unit.code));
  assert.equal(s.status, "lost");
});

test("Uglúk: Toughness 3, no attachments, and no ally attacks or defends against him", () => {
  let s = base(1, 2);
  const ugluk = s.staging.find((u) => u.code === UH.ugluk)!;
  s.staging = s.staging.filter((u) => u.id !== ugluk.id);
  s.engaged.push(ugluk);
  const [guard] = allies(s, [GUARD]);
  s.phase = "defense";
  assert.throws(() =>
    act(s, { type: "DEFEND", enemyId: ugluk.id, defenderId: guard.id }),
  );
  s.phase = "attack";
  assert.throws(() =>
    act(s, { type: "ATTACK", enemyId: ugluk.id, attackerIds: [guard.id] }),
  );
  damage(s, ugluk.id, 2);
  assert.equal(get(s, ugluk.id)!.damage, 0);
});

test("Uglúk's Uruk-hai, Isengard Uruk and Snaga when revealed", () => {
  let s = base(1);
  s.phase = "staging";
  reveal(s, UH.uruks, 0);
  assert.match(s.choice!.title, /^Uglúk's Uruk-hai · Choose one/);
  s = choose(s, "pursuit");
  assert.equal(s.urukHai!.pursuit, 13);
  s = base(1);
  s.phase = "staging";
  s.encounterDeck = [UH.plains, ...s.encounterDeck];
  reveal(s, UH.uruks, 0);
  s = choose(s, "reveal");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === UH.plains));
  // Isengard Uruk: assign 3 damage among characters you control.
  s = base(1);
  const [guard] = allies(s, [GUARD]);
  s.phase = "staging";
  reveal(s, UH.uruk, 0);
  s = choose(s, "damage");
  for (let n = 0; n < 3; n++) s = choose(s, n < 1 ? guard.id : s.heroes[0].id);
  assert.equal(get(s, guard.id)!.damage, 1);
  assert.equal(get(s, s.heroes[0].id)!.damage, 2);
  // Snaga: discard a random card and gain its printed cost as threat.
  s = base(1);
  hand(s, [GUARD]);
  s.phase = "staging";
  reveal(s, UH.snaga, 0);
  s = settle(s);
  const snaga = s.staging.find((u) => u.code === UH.snaga)!;
  assert.deepEqual(s.hand, []);
  assert.ok(s.discard.includes(GUARD));
  assert.equal(threatOf(s, snaga), 1 + 2);
  nextRound(s);
  assert.equal(threatOf(s, get(s, snaga.id)!), 1);
});

test("The Wold and Eastemnet raise the pursuit value when travelled to and reward exploring them; Plains of Rohan and Banks of Entwash", () => {
  let s = base(2);
  const wold = stage(s, UH.wold);
  stage(s, UH.eastemnet);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: wold.id });
  s = settle(s);
  assert.equal(s.urukHai!.pursuit, 11);
  deck(s, [GUARD]);
  deck(s, [GUARD], 1);
  progressLocation(s, s.activeLocation!, 2);
  flush(s);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 1);
  s.phase = "planning";
  const east = activate(s, UH.eastemnet);
  progressLocation(s, east, 3);
  flush(s);
  assert.ok(seatView(s, 1).heroes.every((h) => h.resources === 11));
  // Plains of Rohan: X is the number of locations in the staging area.
  s = base(1);
  const plains = stage(s, UH.plains);
  stage(s, UH.wold);
  assert.equal(threatOf(s, plains), 2);
  // Banks of Entwash: +1 pursuit after progress is placed on it.
  const banks = activate(s, UH.banks);
  progressLocation(s, banks, 1);
  flush(s);
  assert.equal(s.urukHai!.pursuit, 11);
});

test("Rest by Night? ends the quest phase or damages every committed character, and cannot be canceled", () => {
  let s = base(1);
  hand(s, [TEST_OF_WILL]);
  const hero = s.heroes.find((h) => h.code !== TOS_ARAGORN)!;
  hero.committed = true;
  s.committedIds = [hero.id];
  s.phase = "quest";
  reveal(s, UH.rest, 0);
  assert.match(s.choice!.title, /^Rest by Night\? · Choose one/);
  s = choose(s, "damage");
  s = settle(s);
  assert.equal(get(s, hero.id)!.damage, 1);
  s = base(1);
  s.phase = "quest";
  s.queue.push({ kind: "questReady", player: 0 });
  reveal(s, UH.rest, 0);
  s = choose(s, "end");
  s = settle(s);
  assert.equal(s.urukHai!.pursuit, 13);
  assert.ok(s.log.some((l) => /quest phase ends immediately/.test(l.text)));
  assert.ok(!s.log.some((l) => /^Quest (fails|succeeds)/.test(l.text)));
  assert.equal(s.phase, "travel");
});

test("Strange Weariness, Unseen Barrier and Fighting Uruk-hai", () => {
  let s = base(1);
  const hero = s.heroes.find((h) => h.code !== TOS_ARAGORN)!;
  hero.committed = true;
  const before = stats(s, hero).will;
  s.phase = "quest";
  reveal(s, UH.weariness, 0);
  s = settle(s);
  assert.equal(stats(s, get(s, hero.id)!).will, before - 1);
  // Unseen Barrier: no more than 3 progress on the current quest this round.
  s = base(1);
  s.phase = "quest";
  reveal(s, UH.barrier, 0);
  s = settle(s);
  addCurrentQuestProgress(s, 5);
  flush(s);
  assert.equal(s.progress, 3);
  addCurrentQuestProgress(s, 1);
  assert.equal(s.progress, 3);
  // Fighting Uruk-hai: an Uruk-hai enemy engages you and adds its threat.
  s = base(1);
  s.encounterDeck = [UH.plains, UH.fighter];
  s.phase = "quest";
  const staged = stagingThreat(s);
  reveal(s, UH.fighting, 0);
  s = choose(s, `deck-${UH.fighter}`);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === UH.fighter));
  assert.equal(stagingThreat(s), staged + 3);
  nextRound(s);
  assert.equal(stagingThreat(s), staged);
});

test("Saruman's Orders: each player returns an engaged enemy or reveals a card", () => {
  let s = base(2);
  const snaga = engaged(s, UH.snaga, 0);
  s.phase = "quest";
  s.encounterDeck = [UH.plains, ...s.encounterDeck];
  reveal(s, UH.orders, 0);
  assert.match(s.choice!.title, /^Saruman's Orders · Choose/);
  s = choose(s, `return-${snaga.id}`);
  assert.match(s.choice!.title, /^Saruman's Orders · Choose · Gimli/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["reveal"],
  );
  s = choose(s, "reveal");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === snaga.id));
  assert.ok(s.staging.some((u) => u.code === UH.plains));
});

test("Shadows: a kill raises the pursuit value or returns the attacker; Banks of Entwash; Uruk-hai Fighter", () => {
  for (const code of [UH.plains, UH.barrier]) {
    let s = base(1);
    const snaga = engaged(s, UH.snaga);
    const [scout] = allies(s, [SNOWBOURN]);
    snaga.shadows = [code];
    s.phase = "defense";
    s = act(s, { type: "DEFEND", enemyId: snaga.id, defenderId: scout.id });
    s = settle(s);
    assert.equal(get(s, scout.id), undefined);
    assert.equal(s.urukHai!.pursuit, 11, card(code).name);
  }
  // Saruman's Orders: the attacker returns to the staging area after a kill.
  let s = base(1);
  const snaga = engaged(s, UH.snaga);
  const [scout] = allies(s, [SNOWBOURN]);
  snaga.shadows = [UH.orders];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: snaga.id, defenderId: scout.id });
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === snaga.id));
  // Uruk-hai Fighter returns to the staging area after it destroys a character.
  s = base(1);
  const fighter = engaged(s, UH.fighter);
  const [scout2] = allies(s, [SNOWBOURN]);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: fighter.id, defenderId: scout2.id });
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === fighter.id));
  // Banks of Entwash: the attack is considered undefended.
  s = base(1);
  const orc = engaged(s, UH.snaga);
  const [guard] = allies(s, [GUARD]);
  orc.shadows = [UH.banks];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: guard.id });
  assert.match(s.choice!.title, /^Banks of Entwash · Choose one/);
  s = choose(s, "undefended");
  s = settle(s, "undefended");
  assert.equal(get(s, guard.id)!.damage, 0);
  // Uruk-hai Fighter's shadow discards an attachment you control.
  s = base(1);
  const orc2 = engaged(s, UH.snaga);
  const steward = hand(s, [STEWARD])[0];
  s.hand = [];
  s.heroes[0].attachments.push({
    id: steward.id,
    code: STEWARD,
    exhausted: false,
  });
  orc2.shadows = [UH.fighter];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc2.id, defenderId: s.heroes[0].id });
  assert.match(
    s.choice!.title,
    /^Uruk-hai Fighter · Discard a non-objective attachment/,
  );
  s = choose(s, steward.id);
  s = settle(s);
  assert.ok(s.discard.includes(STEWARD));
});

test("Archery: the staged enemies' archery at the beginning of the combat phase", () => {
  let s = base(1);
  stage(s, UH.uruk);
  stage(s, UH.snaga);
  run(s, "combatStartEffects");
  assert.match(s.choice!.title, /^Assign Archery damage · 3 remaining/);
});

test("Saves validate, and the panel data shows the pursuit value and the Captives", () => {
  let s = base(2);
  s.phase = "staging";
  reveal(s, UH.grishnakh, 0);
  s = choose(s, s.urukHai!.captives[0].unit.id);
  const restored = reload(s);
  const view = publicState(restored) as unknown as {
    urukHai: { pursuit: number; captives: { holder?: string }[] };
  };
  assert.equal(view.urukHai.pursuit, 10);
  assert.ok(view.urukHai.captives[0].holder);
  assert.deepEqual(urukHaiPublicState(restored), view.urukHai);
  assert.equal(
    URUK_HAI_RECIPES.find((r) => r.mode === "standard")!.id,
    "Q0B.07",
  );
  selectSeat(restored, 1);
  reload(restored);
});
