import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canPlay,
  canTravel,
  publicState,
} from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  damage as dealDamage,
  fx,
  get,
  stats,
  threatOf,
} from "../src/game/core";
import { check, damage, engage, progressLocation } from "../src/game/board";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { flush, handle } from "../src/game/effects";
import { consideredEngaged } from "../src/game/considered-engagement";
import { rhosgobelHealingAllowed } from "../src/game/rhosgobel";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import { ONE_RING, ringBearer } from "../src/game/lotr-saga";
import {
  OF,
  OF_STAGE_TWO,
  OLD_FOREST_HOOKS,
  ofVictoryTotal,
  oldForestPublicState,
} from "../src/game/old-forest";
import {
  activate,
  allies,
  base,
  choose,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
  victory,
  willow,
} from "./old-forest-fixtures";
import type { Effect, GameState, Unit } from "../src/game/types";

const H = OLD_FOREST_HOOKS;
const run = (s: GameState, ...effects: Effect[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const roundEnd = (s: GameState) => run(s, ...H.roundEnd!(s));
/** Reveal encounter cards as the given player during staging. */
const reveal = (s: GameState, codes: string[], player = 0) => {
  s.phase = "staging";
  s.encounterDeck = [...codes, ...s.encounterDeck];
  handle(s, fx("reveal", { player }));
  flush(s);
  return s;
};
const defend = (s: GameState, enemy: Unit, defender?: Unit) =>
  act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
const GUARD = "01013",
  SNEAK = "01023",
  STEWARD = "01026",
  SCOUT = "01016";

test("Setup: each player adds a different location, 1B draws 1 card each and the players advance to a random stage 2A", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.oldForest!;
      const names = s.staging.map((u) => card(u.code).name);
      assert.equal(s.staging.length, players, `${players}: one location each`);
      assert.ok(s.staging.every((u) => card(u.code).type_code === "location"));
      assert.equal(new Set(names).size, players, "different locations");
      assert.deepEqual(
        [...q.setAside].sort(),
        [OF.willow, OF.withywindle].sort(),
      );
      assert.equal(s.stage, 2);
      assert.ok(OF_STAGE_TWO.includes(q.currentQuest));
      assert.deepEqual(
        [...q.stageTwo, q.currentQuest].sort(),
        [...OF_STAGE_TWO].sort(),
      );
      // 38 (easy 31) encounter cards; each player took one location.
      assert.equal(s.encounterDeck.length, (easy ? 31 : 38) - players);
      // Opening hand 6, then 1 from stage 1B and the resource phase draw.
      for (const p of playerOrder(s))
        assert.equal(seatView(s, p).hand.length, 8);
      assert.equal(s.round, 1);
      const bearer = ringBearer(s)!;
      assert.ok(bearer.attachments.some((a) => a.code === ONE_RING));
      assert.ok(
        seatView(s, playerOrder(s)[0]).heroes.some((h) => h.id === bearer.id),
      );
      reload(s);
    }
});

test("Stage 2B: after successful questing below the victory goal, the players advance to a different random stage 2A", () => {
  let s = base(1, OF.dark);
  run(s, fx("successfulQuestProgress", { value: 3, player: 0 }));
  const q = s.oldForest!;
  assert.equal(s.stage, 2);
  assert.notEqual(q.currentQuest, OF.dark);
  assert.ok(
    q.stageTwo.includes(OF.dark),
    "the previous stage 2 returns to the quest deck",
  );
  assert.equal(q.stageTwo.length, 3);
  assert.equal(s.progress, 0, "its progress is discarded");
  // 2A: fewer locations in the staging area than players, so the first player searches.
  assert.match(s.choice!.title, /^The Living Forest · Search for a location/);
  s = choose(s, `deck-${OF.gulley}`);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [OF.gulley],
  );
  assert.equal(s.encounterDeck.length, 19);
  // Unsuccessful questing never advances.
  s = base(1, OF.dark);
  s.lastQuest = { will: 1, threat: 3, net: -2, stat: "will" };
  run(s, fx("failedQuest", { value: 2, player: 0 }));
  assert.equal(s.oldForest!.currentQuest, OF.dark);
  // A stage 2 with enough locations does not search.
  s = base(2, OF.closing);
  stage(s, OF.gulley);
  stage(s, OF.strange);
  run(s, fx("successfulQuestProgress", { value: 1, player: 0 }));
  assert.ok(!s.choice);
  assert.notEqual(s.oldForest!.currentQuest, OF.closing);
});

test("Stage 2B to 3A: X = 5 victory points per player, counting Wall of Trees as X; 3A adds Old Man Willow and Withywindle and reveals players - 1 cards", () => {
  let s = base(2, OF.brambles);
  // 2 + 2 + 2 + 1 + Wall of Trees (2 players) = 9 of 10.
  victory(s, [OF.gulley, OF.gulley, OF.oppressive, OF.strange, OF.wall]);
  assert.equal(ofVictoryTotal(s), 9);
  run(s, fx("successfulQuestProgress", { value: 2, player: 0 }));
  assert.equal(s.stage, 2);
  s = base(2, OF.brambles);
  victory(s, [
    OF.gulley,
    OF.gulley,
    OF.oppressive,
    OF.strange,
    OF.strange,
    OF.wall,
  ]);
  assert.equal(ofVictoryTotal(s), 10);
  s.encounterDeck = [OF.misleading, OF.gulley, ...s.encounterDeck];
  run(s, fx("successfulQuestProgress", { value: 2, player: 0 }));
  s = settle(s);
  const q = s.oldForest!;
  assert.equal(s.stage, 3);
  assert.equal(q.currentQuest, OF.wicked);
  assert.deepEqual(q.setAside, []);
  assert.deepEqual([...q.stageTwo].sort(), [...OF_STAGE_TWO].sort());
  assert.ok(s.staging.some((u) => u.code === OF.willow));
  assert.ok(s.staging.some((u) => u.code === OF.withywindle));
  // 1 reveal for 2 players: Misleading Path, whose surge revealed Deep Gulley.
  assert.ok(s.staging.some((u) => u.code === OF.misleading));
  assert.ok(s.staging.some((u) => u.code === OF.gulley));
  assert.equal(s.progress, 0);
  reload(s);
});

test("Wall of Trees: X threat and Victory X equal the number of players; progress goes on it before the current quest", () => {
  for (const players of [1, 3]) {
    const s = base(players, OF.dark);
    const wall = stage(s, OF.wall);
    assert.equal(threatOf(s, wall), players);
    addCurrentQuestProgress(s, 3);
    assert.equal(get(s, wall.id)!.progress, 3);
    assert.equal(s.progress, 0);
    addCurrentQuestProgress(s, 2);
    assert.equal(get(s, wall.id), undefined, "explored");
    assert.deepEqual(s.victoryCards, [OF.wall]);
    assert.equal(s.progress, 1);
    assert.equal(ofVictoryTotal(s), players);
    assert.equal(s.victory, players);
  }
  // Two walls: the first fills before the second.
  const s = base(1, OF.dark);
  const a = stage(s, OF.wall),
    b = stage(s, OF.wall);
  addCurrentQuestProgress(s, 6);
  assert.equal(get(s, a.id), undefined);
  assert.equal(get(s, b.id)!.progress, 2);
  assert.equal(s.progress, 0);
});

test("Dark Bad Place, Choked with Brambles, Shifting Trees and Closing in Around Them", () => {
  // Dark Bad Place: at the end of the planning phase each player exhausts a hero.
  let s = base(2, OF.dark);
  run(s, fx("phaseEnd"));
  s = settle(s);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).heroes.filter((h) => h.exhausted).length, 1);
  // Choked with Brambles: all progress leaves each location in play.
  s = base(1, OF.brambles);
  const active = activate(s, OF.gulley);
  active.progress = 2;
  const waiting = stage(s, OF.strange);
  waiting.progress = 1;
  roundEnd(s);
  assert.equal(s.activeLocation!.progress, 0);
  assert.equal(get(s, waiting.id)!.progress, 0);
  // Shifting Trees: a random location leaves the victory display.
  s = base(1, OF.shifting);
  victory(s, [OF.gulley, OF.strange]);
  s.victory = 3;
  roundEnd(s);
  assert.equal(s.victoryCards!.length, 1);
  assert.equal(s.encounterDiscard.length, 1);
  assert.equal(s.victory, 3 - (s.encounterDiscard[0] === OF.gulley ? 2 : 1));
  // Closing in Around Them and an active Withywindle each reveal 1 more card.
  s = base(1, OF.closing);
  assert.equal(H.extraStagingReveals!(s), 1);
  activate(s, OF.withywindle);
  assert.equal(H.extraStagingReveals!(s), 2);
  s = base(1, OF.dark);
  assert.equal(H.extraStagingReveals!(s), 0);
  assert.equal(H.roundEnd!(s).length, 0);
});

test("Stage 3B: Old Man Willow stays in the staging area, engaged with each player; his attacks discard a random victory location; Withywindle blocks the win", () => {
  let { s, tree, river } = willow(2);
  for (const p of [0, 1]) assert.ok(consideredEngaged(s, tree, p));
  assert.ok(H.cannotEngage!(s, tree));
  assert.ok(H.cannotOptionallyEngage!(s, tree));
  assert.ok(H.cannotLeave!(s, tree, false));
  assert.ok(H.indestructible!(s, tree));
  damage(s, tree.id, 30);
  assert.ok(
    s.staging.some((u) => u.id === tree.id),
    "indestructible",
  );
  // His attack: the random location's victory points raise the defender's threat.
  victory(s, [OF.oppressive]);
  s.victory = 2;
  s.phase = "defense";
  s.encounterDeck = [OF.gulley, OF.gulley, ...s.encounterDeck];
  s = defend(s, get(s, tree.id)!, s.heroes[0]);
  s = settle(s);
  assert.deepEqual(s.victoryCards, []);
  assert.equal(s.victory, 0);
  assert.equal(seatView(s, 0).threat, 22);
  assert.ok(s.encounterDiscard.includes(OF.oppressive));
  // He attacks the other player too, with a new shadow card.
  assert.equal(s.table!.active, 1);
  assert.equal(s.phase, "defense");
  const before = s.encounterDeck.length;
  s = defend(s, get(s, tree.id)!);
  s = settle(s);
  assert.ok(
    s.log.some((l) => /Old Man Willow attacks: no location/.test(l.text)),
  );
  assert.equal(s.encounterDeck.length, before - 1, "a fresh shadow card");
  assert.equal(seatView(s, 1).threat, 20);
  // 18 progress do not win while Withywindle is in play.
  ({ s, tree, river } = willow(1));
  s.progress = 18;
  check(s);
  assert.equal(s.status, "playing");
  progressLocation(s, get(s, river.id)!, 5);
  assert.ok((s.victoryCards ?? []).includes(OF.withywindle));
  check(s);
  assert.equal(s.status, "won");
});

test("Long Trailer attacks the first player when the active location is explored; Grasping Root, Army of Flies and Deep Gulley on engagement", () => {
  let s = base(1);
  const trailer = stage(s, OF.trailer);
  const active = activate(s, OF.strange);
  progressLocation(s, active, 3);
  flush(s);
  assert.equal(s.combat?.enemyId, trailer.id, "immediate attack");
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.id === trailer.id),
    "it stays in the staging area",
  );
  // Grasping Root: X damage among the engaged player's characters (X = victory locations).
  s = base(1);
  victory(s, [OF.gulley, OF.strange]);
  const root = stage(s, OF.root);
  engage(s, root);
  flush(s);
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0) +
      s.allies.reduce((n, a) => n + a.damage, 0),
    2,
  );
  // Army of Flies: a non-objective attachment is discarded; The One Ring stays.
  s = base(1);
  const aragorn = s.heroes[0];
  aragorn.attachments.push({ id: "steward", code: STEWARD, exhausted: false });
  engage(s, stage(s, OF.flies));
  flush(s);
  s = settle(s);
  assert.equal(get(s, aragorn.id)!.attachments.length, 0);
  assert.ok(ringBearer(s));
  // Deep Gulley: an optional engagement raises threat by the enemy's attack per Gulley.
  s = base(1);
  stage(s, OF.gulley);
  stage(s, OF.gulley);
  const forced = stage(s, OF.trailer);
  engage(s, forced);
  flush(s);
  assert.equal(s.threat, 20, "not on a forced engagement");
  s = base(1);
  stage(s, OF.gulley);
  stage(s, OF.gulley);
  const chosen = stage(s, OF.trailer);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: chosen.id });
  s = settle(s);
  assert.equal(s.threat, 28);
});

test("Misleading Path forces travel and its shadow discards allies in hand; Strange Woods stops healing and its kill shadow raises threat", () => {
  let s = base(1);
  const path = stage(s, OF.misleading);
  const woods = stage(s, OF.strange);
  s.phase = "travel";
  assert.ok(canTravel(s, woods), "travel elsewhere is refused");
  assert.equal(canTravel(s, path), null);
  assert.throws(() => act(s, { type: "NEXT" }), /must travel/);
  s = act(s, { type: "TRAVEL", id: path.id });
  assert.equal(s.activeLocation?.code, OF.misleading);
  // Shadow: the defending player discards each ally card in hand.
  s = base(1);
  hand(s, [GUARD, SNEAK, SCOUT]);
  const enemy = engaged(s, OF.root);
  enemy.shadows = [OF.misleading];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [SNEAK],
  );
  // Strange Woods: no healing while it is in the staging area.
  s = base(1);
  stage(s, OF.strange);
  assert.ok(!rhosgobelHealingAllowed(s, s.heroes[0]));
  // Shadow: +1 attack; a destroyed character raises each player's threat by 2.
  s = base(2);
  const foe = engaged(s, OF.root);
  foe.shadows = [OF.strange];
  const guard = allies(s, [GUARD])[0];
  s.phase = "defense";
  s = defend(s, foe, guard);
  s = settle(s);
  assert.equal(get(s, guard.id), undefined);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
});

test("Oppressive Forest allows 1 card per player each round; its shadow joins an empty staging area", () => {
  let s = base(2);
  stage(s, OF.oppressive);
  s.phase = "planning";
  const [guard, scout] = hand(s, [GUARD, SCOUT]);
  assert.equal(canPlay(s, guard), null);
  s = act(s, { type: "PLAY", id: guard.id });
  s = settle(s);
  assert.match(
    canPlay(s, get(s, scout.id) ?? scout) ?? "",
    /Oppressive Forest/,
  );
  // The other player may still play a card.
  forOwner(s, 1, () => assert.equal(H.playProblem!(s, SCOUT), null));
  // Shadow: with no location in the staging area, it is added there.
  s = base(1);
  const enemy = engaged(s, OF.root);
  enemy.shadows = [OF.oppressive];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === OF.oppressive));
  assert.ok(!s.encounterDiscard.includes(OF.oppressive));
});

test("Swaying Without Wind returns a victory location or surges; Falling Branches hits a quester per player", () => {
  let s = base(1);
  victory(s, [OF.gulley, OF.strange]);
  s.victory = 3;
  s = reveal(s, [OF.swaying]);
  s = choose(s, OF.gulley);
  s = settle(s);
  assert.deepEqual(s.victoryCards, [OF.strange]);
  assert.equal(s.victory, 1);
  assert.ok(s.staging.some((u) => u.code === OF.gulley));
  // With an empty victory display it gains surge.
  s = base(1);
  s = reveal(s, [OF.swaying, OF.strange]);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === OF.strange),
    "surge revealed the next card",
  );
  assert.ok(s.encounterDiscard.includes(OF.swaying));
  // Falling Branches: each player removes a questing character; an ally takes 3.
  s = base(2);
  const guard = allies(s, [GUARD])[0];
  guard.committed = true;
  forOwner(s, 1, () => (s.heroes[0].committed = true));
  const hero = seatView(s, 1).heroes[0];
  s = reveal(s, [OF.branches]);
  s = settle(s);
  assert.equal(
    get(s, guard.id),
    undefined,
    "Guard of the Citadel (2 hp) takes 3",
  );
  assert.equal(get(s, hero.id)!.damage, 2);
  assert.ok(!get(s, hero.id)!.committed);
  // Shadow: +1 attack, +2 against an ally.
  s = base(1);
  let enemy = engaged(s, OF.flies);
  enemy.shadows = [OF.branches];
  const target = allies(s, [GUARD])[0];
  s.phase = "defense";
  s = defend(s, enemy, target);
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /Falling Branches: the attacking enemy gets \+2 attack/.test(l.text),
    ),
  );
  s = base(1);
  enemy = engaged(s, OF.flies);
  enemy.shadows = [OF.branches];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[2]);
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /Falling Branches: the attacking enemy gets \+1 attack/.test(l.text),
    ),
  );
});

test("Song of Sleep blanks a questing hero that cannot ready; Lost and Witless switches the active location at random", () => {
  let s = base(1);
  const aragorn = s.heroes[0];
  aragorn.committed = true;
  s = reveal(s, [OF.song]);
  s = choose(s, aragorn.id);
  s = settle(s);
  const sleeper = get(s, aragorn.id)!;
  assert.ok(sleeper.attachments.some((a) => a.code === OF.song));
  assert.ok(!sleeper.committed);
  assert.ok(H.characterBlanked!(s, sleeper));
  assert.ok(H.cannotReady!(s, sleeper));
  // Limit 1 per hero: with no other questing hero it has no target.
  sleeper.committed = true;
  s = reveal(s, [OF.song]);
  s = settle(s);
  assert.equal(
    get(s, aragorn.id)!.attachments.filter((a) => a.code === OF.song).length,
    1,
  );
  // Lost and Witless: staging progress is discarded and a random location switches in.
  s = base(1);
  const active = activate(s, OF.gulley);
  active.progress = 3;
  const waiting = stage(s, OF.strange);
  waiting.progress = 2;
  s = reveal(s, [OF.lost, OF.oppressive]);
  s = settle(s);
  assert.notEqual(s.activeLocation?.id, active.id);
  assert.ok(s.staging.some((u) => u.id === active.id && u.progress === 3));
  assert.equal(get(s, waiting.id)!.progress, 0);
  // A unique active location (Withywindle) is not switched.
  s = base(1);
  const river = activate(s, OF.withywindle);
  stage(s, OF.strange);
  s = reveal(s, [OF.lost, OF.oppressive]);
  s = settle(s);
  assert.equal(s.activeLocation?.id, river.id);
});

test("Ending and Failing raises threat at the end of the phase; its shadow returns the attacker; Tom Bombadil joins the quest for one round", () => {
  let s = base(2);
  stage(s, OF.root);
  stage(s, OF.trailer);
  s = reveal(s, [OF.ending]);
  s = settle(s);
  assert.equal(s.oldForest!.endingFailing, 1);
  // Doomed 2, then 2 enemies in the staging area at the end of the phase.
  assert.equal(seatView(s, 0).threat, 22);
  H.endQuest!(s);
  flush(s);
  assert.equal(seatView(s, 0).threat, 24);
  assert.equal(seatView(s, 1).threat, 24);
  assert.equal(s.oldForest!.endingFailing, 0);
  // Shadow: the attacking enemy returns to the staging area after its attack.
  s = base(1);
  const enemy = engaged(s, OF.flies);
  enemy.shadows = [OF.ending];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.ok(!s.engaged.some((u) => u.id === enemy.id));
  // Tom Bombadil: the chosen player controls him, ready and committed.
  s = base(2);
  s.encounterDiscard = [OF.gulley, OF.strange];
  s = reveal(s, [OF.tom]);
  s = choose(s, "player-1");
  s = settle(s);
  const tom = seatView(s, 1).allies.find((u) => u.code === OF.tom)!;
  assert.ok(tom && tom.committed && !tom.exhausted);
  assert.equal(stats(s, tom).will, 3);
  assert.ok(s.oldForest!.tom);
  const deckBefore = s.encounterDeck.length;
  roundEnd(s);
  assert.ok(!seatView(s, 1).allies.some((u) => u.code === OF.tom));
  assert.deepEqual(s.encounterDiscard, []);
  // Tom and the two discarded cards are shuffled into the encounter deck.
  assert.equal(s.encounterDeck.length, deckBefore + 3);
  assert.ok(!s.oldForest!.tom);
});

test("Saves and the scenario panel", () => {
  let s = base(2, OF.shifting);
  victory(s, [OF.gulley]);
  s.oldForest!.endingFailing = 1;
  s = reload(s);
  const q = oldForestPublicState(s)!;
  assert.equal(q.currentQuest, OF.shifting);
  assert.equal(q.victory, 2);
  assert.equal(q.victoryGoal, 10);
  assert.equal(q.stageTwo.length, 3);
  assert.equal(q.endingFailing, 1);
  assert.deepEqual(publicState(s).oldForest, q);
  // A corrupt state is refused.
  const raw = JSON.parse(JSON.stringify(s));
  raw.oldForest.stageTwo.push(OF.shifting);
  assert.throws(() => reload(raw));
});
