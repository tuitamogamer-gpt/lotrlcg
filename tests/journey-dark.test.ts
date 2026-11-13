import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, stagingThreat, threatOf, stats } from "../src/game/core";
import { check, damage, engage, progress } from "../src/game/board";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { flush } from "../src/game/effects";
import { consideredEngaged } from "../src/game/considered-engagement";
import { playerOrder, seatView } from "../src/game/table";
import { ringBearer } from "../src/game/lotr-saga";
import {
  ROAD_DARKENS_FRODO,
  ROAD_DARKENS_ONE_RING,
} from "../src/game/lotr-saga-codes";
import {
  JD,
  JOURNEY_DARK_HOOKS,
  journeyDarkPublicState,
} from "../src/game/journey-dark";
import {
  activate,
  allies,
  balrog,
  base,
  choose,
  engaged,
  reload,
  settle,
  stage,
  start,
} from "./journey-dark-fixtures";
import type { Effect, GameState, Unit } from "../src/game/types";

const H = JOURNEY_DARK_HOOKS;
const run = (s: GameState, ...effects: Effect[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** Reveal encounter cards as the given player during staging. */
const reveal = (s: GameState, codes: string[], player = 0) => {
  s.phase = "staging";
  s.encounterDeck = [...codes, ...s.encounterDeck];
  run(s, fx("reveal", { player }));
  return s;
};
const defend = (s: GameState, enemy: Unit, defender?: Unit) =>
  act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
const doom = (s: GameState) => s.staging.find((u) => u.code === JD.doom)!;
const GUARD = "01013";

test("Setup: Doom, Doom, Doom with 10 tokens, a different location per player, the Balrog, the Great Bridge and Chamber of Mazarbul set aside", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.journeyDark!;
      assert.deepEqual(
        [...q.setAside].sort(),
        [JD.balrog, JD.bridge, JD.mazarbul].sort(),
      );
      assert.equal(s.stage, 1);
      assert.equal(doom(s).damage, 10);
      const locations = s.staging.filter(
        (u) => card(u.code).type_code === "location",
      );
      assert.equal(locations.length, players);
      assert.equal(
        new Set(locations.map((u) => card(u.code).name)).size,
        players,
        "different locations",
      );
      // 30 or 22 encounter cards plus the 4 recipe locations, less the setup.
      assert.equal(s.encounterDeck.length, (easy ? 26 : 34) - players);
      const bearer = ringBearer(s)!;
      assert.equal(bearer.code, ROAD_DARKENS_FRODO);
      assert.ok(
        bearer.attachments.some((a) => a.code === ROAD_DARKENS_ONE_RING),
      );
      reload(s);
    }
});

test("Doom, Doom, Doom: optional engagements on 1B and each quest phase remove tokens; with none left the Balrog enters and attacks the first player", () => {
  let s = base(2, 1, 3);
  // 1B: an optional engagement removes 1 token; a forced one does not.
  const orc = stage(s, JD.orc);
  engage(s, orc, true);
  flush(s);
  assert.equal(doom(s).damage, 2);
  const troll = stage(s, JD.troll);
  engage(s, troll);
  flush(s);
  assert.equal(doom(s).damage, 2);
  // The end of the quest phase removes 1 token; the Balrog stays aside.
  s = base(1, 1, 2);
  H.endQuest!(s);
  flush(s);
  assert.equal(doom(s).damage, 1);
  assert.ok(s.journeyDark!.setAside.includes(JD.balrog));
  // The last token: the Balrog enters the staging area and attacks at once.
  H.endQuest!(s);
  flush(s);
  assert.equal(doom(s).damage, 0);
  assert.ok(!s.journeyDark!.setAside.includes(JD.balrog));
  const b = s.staging.find((u) => u.code === JD.balrog)!;
  assert.ok(b);
  assert.ok(s.combat?.immediate, "the Balrog attacks");
  assert.equal(s.combat!.enemyId, b.id);
  s = settle(s);
  // The Balrog attacks each later quest phase while it is in play.
  const attacks = s.log.filter((l) =>
    /The Balrog makes an attack/.test(l.text),
  ).length;
  H.endQuest!(s);
  flush(s);
  s = settle(s);
  assert.equal(
    s.log.filter((l) => /The Balrog makes an attack/.test(l.text)).length,
    attacks + 1,
  );
  assert.equal(journeyDarkPublicState(s)!.balrog, "staging");
  reload(s);
});

test("Stage 1 to 2: 14 progress advances and adds Chamber of Mazarbul; 2B needs Mazarbul explored and 3 resource tokens per player", () => {
  let s = base(2, 1);
  s.progress = 14;
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.ok(s.staging.some((u) => u.code === JD.mazarbul));
  assert.ok(!s.journeyDark!.setAside.includes(JD.mazarbul));
  // 9 progress is not enough while Chamber of Mazarbul is in play.
  s.progress = 20;
  s.journeyDark!.drums = 6;
  check(s);
  assert.equal(s.stage, 2);
  // Without Mazarbul, the tokens still decide: 5 of 6 is not enough.
  s.staging = s.staging.filter((u) => u.code !== JD.mazarbul);
  s.journeyDark!.drums = 5;
  check(s);
  assert.equal(s.stage, 2);
  // Each defeated enemy places a token; the 6th lets the players advance.
  const orc = engaged(s, JD.orc);
  damage(s, orc.id, 3);
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  reload(s);
});

test("Drums in the Deep: with no enemy in the staging area at the beginning of the quest phase, the first player reveals an additional card", () => {
  const s = base(2, 2);
  H.questBegin!(s);
  assert.equal(H.extraStagingReveals!(s), 1);
  const t = base(2, 2);
  stage(t, JD.orc);
  H.questBegin!(t);
  assert.equal(H.extraStagingReveals!(t), 0);
  // The Balrog in the staging area is an enemy there.
  const u = base(1, 2);
  balrog(u);
  H.questBegin!(u);
  assert.equal(H.extraStagingReveals!(u), 0);
  // Not on other stages.
  const v = base(1, 1);
  H.questBegin!(v);
  assert.equal(H.extraStagingReveals!(v), 0);
});

test("Chamber of Mazarbul: each player searches for a different enemy to travel there, Orc-chieftain first; it blocks advancing and is immune", () => {
  let s = base(2, 2);
  const chamber = stage(s, JD.mazarbul);
  s.encounterDeck = [JD.hall, JD.chieftain, JD.orc, JD.orc];
  s.encounterDiscard = [JD.troll];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: chamber.id });
  assert.match(s.choice!.title, /^Chamber of Mazarbul · Search/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    [JD.chieftain],
    "the first player must take Orc-chieftain",
  );
  s = choose(s, `deck-${JD.chieftain}`);
  // The second player needs a different enemy.
  assert.ok(s.choice!.options.every((o) => o.code !== JD.chieftain));
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [`deck-${JD.orc}`, `discard-${JD.troll}`].sort(),
  );
  s = choose(s, `discard-${JD.troll}`);
  s = settle(s);
  assert.equal(s.activeLocation?.code, JD.mazarbul);
  assert.ok(!s.encounterDiscard.includes(JD.troll));
  // The encounter phase begins: Orc-chieftain engages the first player.
  assert.equal(s.phase, "encounter");
  assert.deepEqual(
    s.staging
      .filter((u) => card(u.code).type_code === "enemy")
      .map((u) => u.code),
    [JD.troll],
  );
  assert.ok(seatView(s, 0).engaged.some((u) => u.code === JD.chieftain));
  assert.ok(/immune to player card effects/i.test(card(JD.mazarbul).text!));
  reload(s);
});

test("Stage 3: the Great Bridge enters; each player reveals 1 card and removes 1 token; no more than 5 progress a round; the Bridge blocks the victory", () => {
  let s = base(2, 2, 5);
  s.journeyDark!.drums = 6;
  s.encounterDeck = [JD.hall, JD.hall, ...s.encounterDeck];
  s.progress = 9;
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.ok(s.staging.some((u) => u.code === JD.bridge));
  assert.equal(doom(s).damage, 3, "1 token per player");
  assert.equal(s.staging.filter((u) => u.code === JD.hall).length, 2);
  // 3B: at most 5 progress on the stage each round.
  s = base(1, 3);
  s.round = 4;
  addCurrentQuestProgress(s, 4);
  addCurrentQuestProgress(s, 4);
  assert.equal(s.progress, 5);
  assert.equal(journeyDarkPublicState(s)!.bridgePlaced, 5);
  s.round = 5;
  addCurrentQuestProgress(s, 7);
  assert.equal(s.progress, 10);
  // 15 progress cannot defeat the stage while The Great Bridge is in play.
  const bridge = stage(s, JD.bridge);
  s.progress = 15;
  check(s);
  assert.equal(s.status, "playing");
  s.staging = s.staging.filter((u) => u.id !== bridge.id);
  check(s);
  assert.equal(s.status, "won");
  assert.match(s.reason!, /Bridge of Khazad-dûm/);
});

test("The Balrog: considered engaged with the first player, attacked only by him, never optionally engaged, Indestructible with immune shadows", () => {
  let s = base(2, 3, 0);
  const b = balrog(s);
  assert.ok(consideredEngaged(s, b, 0));
  assert.ok(!consideredEngaged(s, b, 1));
  assert.ok(H.cannotOptionallyEngage!(s, b));
  assert.ok(H.indestructible!(s, b));
  assert.ok(H.shadowImmune!(s, b));
  assert.equal(stats(s, b).attack, 8);
  // Only the first player can declare attackers against it.
  s.phase = "attack";
  assert.equal(H.attackProblem!(s, b, []), null);
  s = reload(s);
  const t = s;
  t.table!.active = 1;
  assert.match(
    H.attackProblem!(t, b, []) ?? "",
    /Only the first player can declare attackers/,
  );
  // 25 damage does not destroy it while it keeps Indestructible.
  s = base(1, 3, 0);
  const bal = balrog(s);
  damage(s, bal.id, 30);
  check(s);
  assert.ok(get(s, bal.id));
});

test("The Great Bridge: when explored, a discarded hero deals its threat cost to the Balrog, which loses all keywords and can be defeated", () => {
  let s = base(2, 3, 0);
  const b = balrog(s);
  b.damage = 14;
  const bridge = activate(s, JD.bridge);
  const hero = seatView(s, 1).heroes[0];
  const x = card(hero.code).threat!;
  bridge.progress = 4;
  progress(s, 1);
  flush(s);
  assert.match(s.choice!.title, /^The Great Bridge · Response/);
  assert.ok(s.choice!.options.some((o) => o.id === "skip"));
  s = choose(s, hero.id);
  s = settle(s);
  assert.ok(!seatView(s, 1).heroes.some((h) => h.id === hero.id));
  assert.ok(seatView(s, 1).discard.includes(hero.code), "discarded from play");
  assert.ok(s.journeyDark!.balrogUnbound);
  assert.ok(!H.indestructible!(s, get(s, b.id) ?? b));
  // With 25 damage the Balrog is defeated and goes to the victory display.
  const left = get(s, b.id);
  if (x + 14 >= 25) assert.equal(left, undefined);
  else {
    damage(s, b.id, 25);
    check(s);
    flush(s);
    assert.equal(get(s, b.id), undefined);
  }
  assert.ok(s.victoryCards!.includes(JD.balrog));
  assert.ok(s.victoryCards!.includes(JD.bridge));
  assert.equal(journeyDarkPublicState(s)!.balrog, "defeated");
  // Without the Balrog in play, no response is offered.
  s = base(1, 3, 3);
  const lone = activate(s, JD.bridge);
  lone.progress = 4;
  progress(s, 1);
  flush(s);
  assert.equal(s.choice, null);
  reload(s);
});

test("Orc-chieftain engages the first player as the encounter phase begins; allies cannot defend; Orc-chieftain and Great Cave-troll cannot have attachments", () => {
  let s = base(2, 1);
  const chief = stage(s, JD.chieftain);
  const other = engaged(s, JD.chieftain, 1);
  H.encounterBegin!(s);
  flush(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === chief.id));
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === other.id));
  assert.ok(!seatView(s, 1).engaged.some((u) => u.id === other.id));
  const [guard] = allies(s, [GUARD]);
  assert.ok(H.cannotDefend!(s, chief, guard));
  assert.ok(!H.cannotDefend!(s, chief, s.heroes[0]));
  assert.ok(H.cannotAttach!(s, chief, "01040"));
  assert.ok(H.cannotAttach!(s, stage(s, JD.troll), "01040"));
  assert.ok(!H.cannotAttach!(s, stage(s, JD.orc), "01040"));
  s = reload(s);
});

test("Great Cave-troll: excess combat damage removes progress from the current quest", () => {
  let s = base(1, 1);
  s.progress = 6;
  const troll = engaged(s, JD.troll);
  troll.shadows = [];
  const [guard] = allies(s, [GUARD]);
  // 6 attack against 0 defense and 2 hit points: 4 excess damage.
  assert.equal(stats(s, guard).defense, 0);
  assert.equal(stats(s, guard).health, 2);
  s.phase = "defense";
  s = defend(s, troll, guard);
  s = settle(s);
  assert.equal(get(s, guard.id), undefined);
  assert.equal(s.progress, 2);
  assert.ok(
    s.log.some((l) => /Great Cave-troll deals 4 excess damage/.test(l.text)),
  );
});

test("Uruk from Mordor attacks the first player when revealed; its shadow adds 1 attack and an additional attack after a kill", () => {
  let s = base(2, 1);
  s = reveal(s, [JD.uruk], 1);
  assert.ok(s.combat?.immediate);
  assert.equal(s.combat!.attackPlayer, 0, "against the first player");
  s = settle(s);
  // Shadow: +1 attack; a destroyed character brings an additional attack.
  s = base(1, 1);
  const orc = engaged(s, JD.orc);
  orc.shadows = [JD.uruk];
  const [guard] = allies(s, [GUARD]);
  guard.damage = stats(s, guard).health - 1;
  s.encounterDeck = [JD.hall, JD.hall, ...s.encounterDeck];
  s.phase = "defense";
  s = defend(s, orc, guard);
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /Uruk from Mordor: the attacking enemy gets \+1/.test(l.text),
    ),
  );
  assert.ok(
    s.log.filter((l) => /^Moria Orc attacks for/.test(l.text)).length >= 2,
    "an additional attack",
  );
});

test("Moria Orc: remove a Doom token or reveal another card; its shadow raises threat per engaged enemy", () => {
  let s = base(1, 1, 4);
  s = reveal(s, [JD.orc]);
  assert.match(s.choice!.title, /^Moria Orc · Choose/);
  s = choose(s, "doom");
  assert.equal(doom(s).damage, 3);
  s = base(1, 1, 0);
  s.encounterDeck = [JD.orc, JD.hall, ...s.encounterDeck];
  s = reveal(s, []);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === JD.hall),
    "a card is revealed",
  );
  // Shadow: +1 threat for each enemy engaged with the defending player.
  s = base(1, 1);
  const a = engaged(s, JD.orc);
  engaged(s, JD.troll);
  a.shadows = [JD.orc];
  s.phase = "defense";
  s = defend(s, a, s.heroes[1]);
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 22);
});

test("Moria Archer: X threat, Archery 2 in the staging area and X damage to the revealing player's characters", () => {
  let s = base(3, 1);
  s = reveal(s, [JD.archer], 1);
  const archer = s.staging.find((u) => u.code === JD.archer)!;
  assert.equal(threatOf(s, archer), 3);
  let picks = 0;
  while (s.choice && /Assign 1 damage/.test(s.choice.title)) {
    s = choose(s, s.choice.options[0].id);
    picks++;
  }
  assert.equal(picks, 3);
  // Archery 2 per Moria Archer in the staging area at the beginning of combat.
  s = base(1, 1);
  stage(s, JD.archer);
  stage(s, JD.archer);
  H.combatBegin!(s);
  assert.equal(s.queue[0].kind, "heirsArchery");
  assert.equal(s.queue[0].value, 4);
});

test("Mines of Moria and Many-pillared Hall: progress on Mines first; each Hall gets +1 threat per Hall in play; their shadows", () => {
  let s = base(1, 1);
  const mines = stage(s, JD.mines);
  addCurrentQuestProgress(s, 6);
  assert.equal(s.progress, 2, "4 progress explores Mines of Moria first");
  assert.ok(!s.staging.some((u) => u.id === mines.id));
  const hall = stage(s, JD.hall);
  assert.equal(threatOf(s, hall), 2);
  stage(s, JD.hall);
  activate(s, JD.hall);
  assert.equal(threatOf(s, hall), 4);
  // Mines of Moria's shadow: discard an attachment (2 at threat 35 or more).
  s = base(1, 1);
  const orc = engaged(s, JD.orc);
  orc.shadows = [JD.mines];
  s.heroes[1].attachments.push({ id: "a1", code: "01040", exhausted: false });
  s.heroes[2].attachments.push({ id: "a2", code: "01040", exhausted: false });
  s.threat = 35;
  s.phase = "defense";
  s = defend(s, orc, s.heroes[1]);
  s = settle(s);
  assert.equal(
    seatView(s, 0)
      .heroes.flatMap((h) => h.attachments)
      .filter((a) => a.code === "01040").length,
    0,
  );
  // Many-pillared Hall's shadow: +1 attack, +2 at threat 35 or more.
  s = base(1, 1);
  const o2 = engaged(s, JD.orc);
  o2.shadows = [JD.hall];
  s.threat = 35;
  s.phase = "defense";
  s = defend(s, o2, s.heroes[1]);
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /Many-pillared Hall: the attacking enemy gets \+2 attack/.test(l.text),
    ),
  );
});

test("Darkened Stairway and Ancient Guardroom: a discarded location enters; -1 attack while active; the travel cost discards and raises threat", () => {
  let s = base(1, 1);
  const stairway = activate(s, JD.stairway);
  s.encounterDeck = [JD.mines, ...s.encounterDeck];
  stairway.progress = 1;
  progress(s, 1);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === JD.mines));
  s = base(1, 1);
  const s2 = activate(s, JD.stairway);
  s.encounterDeck = [JD.orc, ...s.encounterDeck];
  s2.progress = 1;
  progress(s, 1);
  flush(s);
  assert.ok(s.encounterDiscard.includes(JD.orc));
  // Ancient Guardroom: -1 attack to each enemy in play while active.
  s = base(1, 1);
  const orc = engaged(s, JD.orc);
  activate(s, JD.guardroom);
  assert.equal(stats(s, orc).attack, 2);
  // Travel: discard the top card; each player raises his threat by its threat.
  s = base(2, 1);
  const room = stage(s, JD.guardroom);
  s.encounterDeck = [JD.stairway, ...s.encounterDeck];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: room.id });
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 24);
  assert.equal(seatView(s, 1).threat, 24);
  assert.ok(s.encounterDiscard.includes(JD.stairway));
  // With an empty encounter deck the cost cannot be paid.
  s = base(1, 1);
  const r2 = stage(s, JD.guardroom);
  s.encounterDeck = [];
  s.phase = "travel";
  assert.match(canTravel(s, r2) ?? "", /no encounter card to discard/);
});

test("They Are Coming!, We Cannot Get Out, Deep Fissure and Fool of a Took!", () => {
  // They Are Coming!: the discard pile is shuffled in and X enemies are found.
  let s = base(2, 1);
  s.encounterDeck = [JD.hall, JD.orc, JD.hall, JD.troll, JD.uruk];
  s.encounterDiscard = [JD.stairway];
  s = reveal(s, [JD.coming]);
  s = settle(s);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    2,
  );
  assert.ok(s.encounterDiscard.includes(JD.coming));
  // Doomed 2: each player raises his threat by 2.
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
  // We Cannot Get Out: 1 damage per exhausted character the player controls.
  s = base(1, 1);
  s.heroes[0].exhausted = true;
  s.heroes[1].exhausted = true;
  s = reveal(s, [JD.trapped]);
  let picks = 0;
  while (s.choice && /Assign 1 damage/.test(s.choice.title)) {
    s = choose(s, s.choice.options[0].id);
    picks++;
  }
  assert.equal(picks, 2);
  // Deep Fissure: a committed character leaves the quest and may be discarded.
  s = base(1, 1);
  const [guard] = allies(s, [GUARD]);
  guard.committed = true;
  s.encounterDeck = [JD.fissure, JD.mazarbul, ...s.encounterDeck];
  s = reveal(s, []);
  assert.match(s.choice!.title, /^Deep Fissure/);
  s = choose(s, guard.id);
  s = settle(s);
  // Guard of the Citadel's printed willpower 1 is less than 4.
  assert.equal(get(s, guard.id), undefined);
  assert.ok(seatView(s, 0).discard.includes(GUARD));
  // Fool of a Took!: a Doom token, or the Balrog attacks.
  s = base(1, 1, 2);
  s = reveal(s, [JD.fool]);
  s = settle(s);
  assert.equal(doom(s).damage, 1);
  assert.equal(s.threat, 21, "Doomed 1");
  s = base(1, 1, 0);
  balrog(s);
  s = reveal(s, [JD.fool]);
  assert.ok(s.combat?.immediate, "the Balrog attacks");
  s = settle(s);
  // Shadow: a kill reveals 1 card.
  s = base(1, 1);
  const orc = engaged(s, JD.orc);
  orc.shadows = [JD.fool];
  const [g2] = allies(s, [GUARD]);
  g2.damage = stats(s, g2).health - 1;
  s.encounterDeck = [JD.mines, ...s.encounterDeck];
  s.phase = "defense";
  s = defend(s, orc, g2);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === JD.mines));
});

test("We Cannot Get Out's shadow assigns damage per engaged enemy; saves, public state and the scenario panel data", () => {
  let s = base(1, 1);
  const a = engaged(s, JD.orc);
  engaged(s, JD.troll);
  a.shadows = [JD.trapped];
  s.phase = "defense";
  s = defend(s, a, s.heroes[1]);
  let picks = 0;
  while (s.choice && /Assign 1 damage/.test(s.choice.title)) {
    s = choose(s, s.choice.options[0].id);
    picks++;
  }
  assert.equal(picks, 2);
  s = settle(s);
  const p = publicState(reload(s)) as unknown as {
    journeyDark: ReturnType<typeof journeyDarkPublicState>;
  };
  assert.equal(p.journeyDark!.doom, 10);
  assert.equal(p.journeyDark!.balrog, "aside");
  assert.equal(stagingThreat(base(1, 1)), 0);
  assert.ok(playerOrder(s).length === 1);
});

test("The Balrog attacks the first player in the combat phase while it is in the staging area", () => {
  let s = base(2, 1, 0);
  const b = balrog(s);
  s.phase = "defense";
  s = reload(s);
  s.table!.active = 0;
  const hero = s.heroes.find((h) => h.id !== ringBearer(s)!.id)!;
  s = defend(s, get(s, b.id)!, hero);
  s = settle(s);
  assert.ok(
    s.log.some((l) => /^The Balrog attacks for/.test(l.text)),
    "the first player defends the Balrog's attack",
  );
  assert.ok(
    s.staging.some((u) => u.id === b.id),
    "it stays in the staging area",
  );
});
