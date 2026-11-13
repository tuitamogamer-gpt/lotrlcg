import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  stagingThreat,
  threatOf,
} from "../src/game/core";
import { check, damage, engage, progressLocation } from "../src/game/board";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { progress } from "../src/game/board";
import { flush } from "../src/game/effects";
import { consideredEngaged } from "../src/game/considered-engagement";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import { ringBearer } from "../src/game/lotr-saga";
import {
  ROAD_DARKENS_FRODO,
  ROAD_DARKENS_ONE_RING,
  isOneRing,
} from "../src/game/lotr-saga-codes";
import {
  RING_SOUTH_HOOKS,
  RS,
  ringSouthPublicState,
} from "../src/game/ring-south";
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
} from "./ring-south-fixtures";
import type { Effect, GameState, Unit } from "../src/game/types";

const H = RING_SOUTH_HOOKS;
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
const GUARD = "01013",
  SNEAK = "01023",
  SCOUT = "01016",
  STEWARD = "01026";

test("Setup: Lust for the Ring, Redhorn Pass, Doors of Durin and the Watcher are set aside; the Road Darkens Ring-bearer joins the first player", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.ringSouth!;
      assert.deepEqual(
        [...q.setAside].sort(),
        [RS.lust, RS.pass, RS.doors, RS.watcher].sort(),
      );
      assert.equal(s.stage, 1);
      assert.equal(s.encounterDeck.length, easy ? 23 : 30);
      const bearer = ringBearer(s)!;
      assert.equal(bearer.code, ROAD_DARKENS_FRODO);
      assert.ok(
        bearer.attachments.some((a) => a.code === ROAD_DARKENS_ONE_RING),
      );
      assert.ok(
        seatView(s, playerOrder(s)[0]).heroes.some((h) => h.id === bearer.id),
      );
      reload(s);
    }
});

test("The Council of Elrond: 4 faceup cards in player order are played, kept, discarded and shuffled; then Lust or threat, and stage 2A", () => {
  let s = base(2, 1);
  deck(s, [GUARD, SNEAK, SCOUT], 0);
  deck(s, [STEWARD, SCOUT, SNEAK], 1);
  s.encounterDeck = [RS.hollin, RS.hollin, RS.hollin, ...s.encounterDeck];
  run(s, fx("phaseEnd"));
  const q = s.ringSouth!;
  // Player order: 1 card each, twice.
  assert.deepEqual(
    q.council.map((c) => [c.owner, c.unit.code]),
    [
      [0, GUARD],
      [1, STEWARD],
      [0, SNEAK],
      [1, SCOUT],
    ],
  );
  assert.match(s.choice!.title, /to be played for 0 cost/);
  const guard = q.council[0].unit;
  s = choose(s, guard.id);
  s = settle(s);
  // The rest resolves with the first option each time (hand, discard, shuffle,
  // then Lust for the Ring); Guard of the Citadel entered play for its owner.
  assert.ok(seatView(s, 0).allies.some((a) => a.code === GUARD));
  assert.equal(s.ringSouth!.council.length, 0);
  assert.equal(s.stage, 2);
  assert.ok(!s.ringSouth!.setAside.includes(RS.lust));
  assert.ok(
    s.encounterDeck.includes(RS.lust) ||
      s.encounterDiscard.includes(RS.lust) ||
      s.staging.some((u) => u.code === RS.lust) ||
      globalLust(s),
  );
  assert.equal(s.activeLocation?.code, RS.pass);
  // 2A: reveals until the staging area holds 2 threat per player.
  assert.ok(stagingThreat(s) >= 4);
  // Choosing threat instead: each player raises his threat by 5.
  s = base(1, 1);
  deck(s, [GUARD, SNEAK, SCOUT, SCOUT]);
  run(s, fx("phaseEnd"));
  s = settle(s, "threat");
  assert.equal(seatView(s, 0).threat, 25);
  assert.ok(s.ringSouth!.setAside.includes(RS.lust));
  reload(s);
});
function globalLust(s: GameState) {
  return playerOrder(s).some((p) =>
    seatView(s, p).heroes.some((h) =>
      h.attachments.some((a) => a.code === RS.lust),
    ),
  );
}

test("Stages 2B and 3B: the players must travel; engagements damage the active location; 3A searches with Great Warg Chief first; new locations get damage", () => {
  let s = base(1, 2);
  const pass = activate(s, RS.pass);
  const hollin = stage(s, RS.hollin);
  // An engagement damages the active location.
  const warg = stage(s, RS.howling);
  engage(s, warg);
  flush(s);
  assert.equal(get(s, pass.id)!.damage, 1);
  // With no active location, travel is required.
  s.activeLocation = null;
  s.phase = "travel";
  assert.ok(H.mustTravel!(s));
  assert.throws(() => act(s, { type: "NEXT" }), /must travel/);
  assert.equal(canTravel(s, hollin), null);
  // 8 progress defeats 2B; 3A searches each player's enemy, Great Warg Chief first.
  s = base(2, 2);
  s.encounterDeck = [RS.hollin, RS.chief, RS.howling, RS.hound];
  s.progress = 8;
  check(s);
  flush(s);
  assert.equal(s.stage, 3);
  assert.match(s.choice!.title, /^The Hunt is Up! · Search for an enemy/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    [RS.chief],
    "the first player must take Great Warg Chief",
  );
  s = choose(s, `deck-${RS.chief}`);
  assert.ok(s.choice!.options.length > 1);
  s = settle(s);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    2,
  );
  // 3B: a location entering play gets 1 damage.
  s.phase = "staging";
  s = reveal(s, [RS.eregion]);
  s = settle(s);
  assert.equal(s.staging.find((u) => u.code === RS.eregion)!.damage, 1);
});

test("Stage 4: Doors of Durin and the Watcher; the Ring-bearer is held facedown; 6 damage frees him; progress order; 9 damage loses; exploring the Doors wins", () => {
  let s = base(1, 3);
  s.progress = 12;
  check(s);
  flush(s);
  s = settle(s);
  const q = s.ringSouth!;
  assert.equal(s.stage, 4);
  assert.equal(s.activeLocation?.code, RS.doors);
  const watcher = s.staging.find((u) => u.code === RS.watcher)!;
  assert.ok(q.underWatcher, "the Ring-bearer is under the Watcher");
  assert.ok(!ringBearer(s));
  assert.equal(s.status, "playing", "The One Ring stays in play");
  assert.ok(consideredEngaged(s, watcher, 0));
  assert.ok(H.indestructible!(s, watcher));
  // Progress cannot go on the Doors while the first player lacks the Ring-bearer.
  addCurrentQuestProgress(s, 0);
  progress(s, 3, false, true);
  assert.equal(s.activeLocation!.progress, 0);
  // 6 damage on the Watcher frees him, exhausted with 1 damage.
  damage(s, watcher.id, 6);
  flush(s);
  const bearer = ringBearer(s)!;
  assert.ok(bearer && bearer.exhausted && bearer.damage === 1);
  assert.equal(s.ringSouth!.underWatcher, null);
  // A second active location: progress fills it before the Doors.
  s.phase = "travel";
  const hollin = stage(s, RS.hollin);
  assert.equal(canTravel(s, hollin), null);
  s = act(s, { type: "TRAVEL", id: hollin.id });
  s = settle(s);
  assert.equal(s.extraActiveLocations?.length, 1);
  progress(s, 6, false, true);
  assert.equal(
    s.extraActiveLocations?.length ?? 0,
    0,
    "Hills of Hollin explored first",
  );
  assert.equal(s.activeLocation!.progress, 2);
  // Engagements now damage each active location; 9 damage on the Doors loses.
  s.activeLocation!.damage = 8;
  const foe = stage(s, RS.howling);
  engage(s, foe);
  flush(s);
  s = settle(s);
  check(s);
  assert.equal(s.status, "lost");
  // Exploring the Doors of Durin wins.
  s = base(1, 4);
  s.ringSouth!.setAside = [RS.lust];
  const doors = activate(s, RS.doors);
  progressLocation(s, doors, 9);
  assert.equal(s.status, "won");
});

test("The Road Darkens' Frodo: after he exhausts to defend, The One Ring makes the attack deal no damage; Lust for the Ring answers", () => {
  let s = base(2, 2);
  const bearer = ringBearer(s)!;
  bearer.resources = 1;
  const enemy = engaged(s, RS.howling);
  s.phase = "defense";
  // Lust for the Ring on a hero of the second player.
  const other = seatView(s, 1).heroes[0];
  other.attachments.push({ id: "lust", code: RS.lust, exhausted: false });
  s = defend(s, enemy, bearer);
  assert.match(s.choice!.title, /^Frodo Baggins · Response/);
  s = choose(s, "use");
  s = settle(s);
  assert.equal(get(s, bearer.id)!.damage, 0, "no damage");
  assert.ok(
    get(s, bearer.id)!.attachments.find((a) => isOneRing(a.code))!.exhausted,
  );
  // +2 from Frodo, +1 from Lust for the Ring.
  assert.equal(seatView(s, 0).threat, 23);
  assert.equal(seatView(s, 1).threat, 23);
  assert.equal(H.willpowerOverride!(s, get(s, other.id)!), 0);
  // Without a resource, there is no response.
  s = base(1, 2);
  const frodo = ringBearer(s)!;
  const foe = engaged(s, RS.howling);
  s.phase = "defense";
  s = defend(s, foe, frodo);
  assert.ok(!s.choice || !/Frodo Baggins/.test(s.choice.title));
});

test("Great Warg Chief, Hound of Sauron, Howling Warg and Crebain from Dunland", () => {
  // Great Warg Chief: discard until a Warg; it enters play engaged.
  let s = base(1, 2);
  activate(s, RS.hollin);
  s.encounterDeck = [RS.hollin, RS.snow, RS.hound, RS.howling];
  const chief = stage(s, RS.chief);
  engage(s, chief);
  flush(s);
  assert.ok(s.engaged.some((u) => u.code === RS.hound));
  assert.deepEqual(s.encounterDiscard, [RS.hollin, RS.snow]);
  assert.ok(H.cannotAttach!(s, chief, STEWARD));
  // Hound of Sauron: -5 engagement per enemy in the staging area; its shadow.
  s = base(1, 2);
  const hound = stage(s, RS.hound);
  stage(s, RS.howling);
  assert.equal(engagementCost(s, hound), 40);
  let enemy = engaged(s, RS.howling);
  enemy.shadows = [RS.hound];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /Hound of Sauron: the attacking enemy gets \+1 attack/.test(l.text),
    ),
  );
  // Howling Warg: its attack places 1 damage on the active location.
  s = base(1, 2);
  const pass = activate(s, RS.pass);
  enemy = engaged(s, RS.howling);
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.equal(s.activeLocation!.damage >= 1, true);
  void pass;
  // Crebain from Dunland: exhaust a hero or engage it; its engagement reveals a card.
  s = base(1, 2);
  s = reveal(s, [RS.crebain, RS.hollin]);
  assert.match(s.choice!.title, /^Crebain from Dunland/);
  s = choose(s, "engage");
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === RS.crebain));
  assert.ok(
    s.staging.some((u) => u.code === RS.hollin),
    "the top card was revealed",
  );
});

test("Hills: Tree-crowned Hill, Hills of Hollin, Redhorn Foothills, Eregion and Redhorn Pass, with X equal to their damage", () => {
  // Tree-crowned Hill: -1 threat to enemies while active; explored exhausts X characters.
  let s = base(1, 2);
  const hill = activate(s, RS.hill);
  const warg = stage(s, RS.howling);
  assert.equal(threatOf(s, warg), 1);
  hill.damage = 2;
  progressLocation(s, hill, 6);
  flush(s);
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 2);
  // Hills of Hollin: +5 engagement in the staging area; explored raises threat.
  s = base(1, 2);
  const hollin = activate(s, RS.hollin);
  const hound = stage(s, RS.hound);
  assert.equal(engagementCost(s, hound), 50);
  hollin.damage = 3;
  progressLocation(s, hollin, 4);
  flush(s);
  assert.equal(s.threat, 23);
  // Redhorn Foothills: an enemy added to the staging area gets -5 this round.
  s = base(1, 2);
  const foot = activate(s, RS.foothills);
  s = reveal(s, [RS.howling]);
  s = settle(s);
  assert.equal(
    engagementCost(
      s,
      s.staging.find((u) => u.code === RS.howling)!,
    ),
    33,
  );
  foot.damage = 2;
  hand(s, [GUARD, SNEAK, SCOUT]);
  progressLocation(s, s.activeLocation!, 5);
  flush(s);
  assert.equal(s.hand.length, 1);
  // Eregion: the players discard X allies; its shadow discards an attachment.
  s = base(1, 2);
  const eregion = activate(s, RS.eregion);
  allies(s, [GUARD, SCOUT, GUARD]);
  eregion.damage = 2;
  progressLocation(s, eregion, 4);
  flush(s);
  s = settle(s);
  assert.equal(s.allies.length, 1);
  // Redhorn Pass: each player assigns X damage among his characters.
  s = base(1, 2);
  const pass = activate(s, RS.pass);
  pass.damage = 2;
  progressLocation(s, pass, 6);
  flush(s);
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
});

test("Regiments of Crows, Snowdrifts, Bitter Cold and Storm of Howls", () => {
  // Regiments of Crows: 3 damage on each active location.
  let s = base(1, 2);
  activate(s, RS.pass);
  s = reveal(s, [RS.crows]);
  s = settle(s);
  assert.equal(s.activeLocation!.damage, 3);
  // Its shadow: undefended damage goes to the active location.
  s = base(1, 2);
  activate(s, RS.hollin);
  let enemy = engaged(s, RS.howling);
  enemy.shadows = [RS.crows];
  s.phase = "defense";
  s = defend(s, enemy);
  s = settle(s);
  assert.ok(
    s.activeLocation!.damage >= 3,
    "Howling Warg 3 attack (+1 from its Forced)",
  );
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    0,
  );
  // Snowdrifts: attaches to the active location; no more than 3 progress per round.
  s = base(1, 2);
  activate(s, RS.foothills);
  s = reveal(s, [RS.snow]);
  s = settle(s);
  assert.ok(s.activeLocation!.attachments.some((a) => a.code === RS.snow));
  progress(s, 5, false, true);
  assert.equal(s.activeLocation!.progress, 3);
  assert.equal(s.progress, 2, "the rest goes to the quest");
  // Without an active location it surges.
  s = base(1, 2);
  s = reveal(s, [RS.snow, RS.hollin]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === RS.hollin));
  // Bitter Cold: discard each ally or raise threat by 1 per ally.
  s = base(1, 2);
  allies(s, [GUARD, SCOUT]);
  s = reveal(s, [RS.cold]);
  s = choose(s, "threat");
  s = settle(s);
  assert.equal(s.threat, 22);
  assert.equal(s.allies.length, 2);
  // Storm of Howls: the highest-engagement Warg attacks, or -20 engagement.
  s = base(1, 2);
  const hound = stage(s, RS.hound);
  stage(s, RS.howling);
  s = reveal(s, [RS.storm]);
  s = choose(s, "engage");
  s = settle(s);
  assert.equal(engagementCost(s, get(s, hound.id)!), 20);
  s = base(1, 2);
  stage(s, RS.howling);
  s = reveal(s, [RS.storm]);
  s = choose(s, "attack");
  assert.ok(s.combat || s.choice, "an immediate attack begins");
  // With no Warg in the staging area it surges.
  s = base(1, 2);
  s = reveal(s, [RS.storm, RS.hollin]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === RS.hollin));
  void forOwner;
});

test("Saves and the scenario panel", () => {
  let s = base(2, 4);
  s.ringSouth!.setAside = [RS.lust];
  activate(s, RS.doors).damage = 3;
  const watcher = stage(s, RS.watcher);
  watcher.damage = 2;
  s = reload(s);
  const q = ringSouthPublicState(s)!;
  assert.equal(q.doorsDamage, 3);
  assert.equal(q.watcherDamage, 2);
  assert.deepEqual(publicState(s).ringSouth, q);
  const raw = JSON.parse(JSON.stringify(s));
  raw.ringSouth.setAside.push("not-a-card");
  assert.throws(() => reload(raw));
});
