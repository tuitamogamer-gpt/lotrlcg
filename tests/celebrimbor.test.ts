import { automatedScenarioId } from "../src/game/support.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createGame,
  applyAction,
  validateSave,
  canTravel,
  optionalEngagementProblem,
  publicState,
} from "../src/game/engine.ts";
import { card, imageUrl, STARTERS, SCRIPTED } from "../src/game/cards.ts";
import { make, fx, get, stats, threatOf } from "../src/game/core.ts";
import {
  check,
  damage,
  destroy,
  discardCharacter,
  discardAttachment,
  progress,
  progressLocation,
  engage,
  placeEncounter,
  returnAlly,
} from "../src/game/board.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import {
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  allCharacters,
  syncSeat,
} from "../src/game/table.ts";
import { removeQuestTime } from "../src/game/quest-time.ts";
import { playerCardImmune } from "../src/game/card-immunity.ts";
import { attachToQuest } from "../src/game/quest-state.ts";
import {
  CELEBRIMBOR as C,
  CELEBRIMBOR_ENCOUNTERS,
  CELEBRIMBOR_QUESTS,
  CELEBRIMBOR_RECIPES,
  CELEBRIMBOR_LOCATIONS,
} from "../src/game/celebrimbor-support.ts";
import {
  celebrimborDamageLocation,
  celebrimborMould,
  celebrimborScourAll,
  celebrimborShadow,
  celebrimborEncounter,
  celebrimborProgressPlaced,
} from "../src/game/celebrimbor.ts";
import { base, choose, reload } from "./celebrimbor-fixtures.ts";
import type { GameState, Unit } from "../src/game/types.ts";
function settle(s: GameState) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 120, "choice resolution terminates");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function loc(s: GameState, code = C.tower, active = false) {
  const u = make(s, code);
  if (active) s.activeLocation = u;
  else s.staging.push(u);
  return u;
}
function enemy(s: GameState, code = C.bellach, player?: number) {
  const u = make(s, code);
  if (player === undefined) s.staging.push(u);
  else forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function mould(s: GameState, u = s.heroes[0]) {
  const a = { id: make(s, C.mould).id, code: C.mould, exhausted: false };
  u.attachments.push(a);
  return a;
}
function searched(s: GameState, n = 1) {
  for (let i = 0; i < n; i++) s.celebrimbor!.search.push(make(s, C.tower));
}
function protect(s: GameState) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => s.heroes.forEach((h) => (h.tempDefense = 20)));
}
function attack(s: GameState, e: Unit, shadows: string[], defender: Unit) {
  s.phase = "defense";
  e.shadows = shadows;
  return settle(
    applyAction(reload(s), {
      type: "DEFEND",
      enemyId: e.id,
      defenderId: defender.id,
    }),
  );
}
function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(27, d.cards, d.heroes, d.id, {
    scenarioId: "celebrimbors-secret",
    easy,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  for (let i = 0; s.phase === "setup"; i++) {
    assert.ok(i < 80);
    s = applyAction(
      s,
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return s;
}

test("Celebrimbor imports 13 encounters, 2 quests, 17 local faces and exact 49/39 recipes", () => {
  assert.equal(CELEBRIMBOR_ENCOUNTERS.length, 13);
  assert.equal(CELEBRIMBOR_QUESTS.length, 2);
  let faces = 0;
  for (const c of [...CELEBRIMBOR_ENCOUNTERS, ...CELEBRIMBOR_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code));
    assert.match(imageUrl(c), /^\/cards\//);
    faces++;
    if (c.back_imagesrc) {
      assert.match(imageUrl({ ...c, imagesrc: c.back_imagesrc }), /^\/cards\//);
      faces++;
    }
  }
  assert.equal(faces, 17);
  for (const r of CELEBRIMBOR_RECIPES)
    assert.equal(
      r.cards
        .filter((c) => c.section !== "sharedQuestDeck")
        .reduce((n, c) => n + c.quantity, 0),
      r.mode === "easy" ? 39 : 49,
    );
});
for (const easy of [false, true])
  for (let players = 1; players <= 4; players++)
    test(`Celebrimbor ${players}-player ${easy ? "easy" : "normal"} setup chooses distinct locations after mulligans`, () => {
      const s = start(players, easy);
      assert.ok(validateSave(s));
      assert.equal(s.encounterDeck.length, (easy ? 35 : 45) - players);
      assert.equal(s.celebrimbor!.time, 3);
      assert.equal(new Set(s.celebrimbor!.setupLocations).size, players);
      assert.equal(s.staging.filter((u) => u.code === C.bellach).length, 1);
      assert.equal(
        s.staging.find((u) => u.code === C.chamber)!.attachments[0].code,
        C.mould,
      );
      assert.equal(s.staging.find((u) => u.code === C.plaza)!.damage, 1);
      assert.equal(
        threatOf(
          s,
          s.staging.find((u) => u.code === C.chamber)!,
        ),
        players,
      );
      for (const p of playerOrder(s))
        assert.ok(
          seatView(s, p).heroes.every((h) => h.resources === (easy ? 2 : 1)),
        );
    });
test("Original and easy catalog recipes map to the registered scenario", () => {
  for (const r of CELEBRIMBOR_RECIPES)
    assert.equal(automatedScenarioId(r), "celebrimbors-secret");
});
test("Mulligans keep the full player decks and do not expose setup selections before all hands are kept", () => {
  const d = STARTERS[0];
  let s = createGame(22, d.cards, d.heroes, d.id, {
    scenarioId: "celebrimbors-secret",
  });
  assert.equal(s.staging.length, 0);
  assert.equal(s.celebrimbor!.initialized, false);
  s = applyAction(reload(s), { type: "MULLIGAN" });
  assert.equal(s.phase, "setup");
  assert.equal(s.celebrimbor!.initialized, false);
  s = applyAction(reload(s), { type: "KEEP" });
  assert.match(s.choice!.title, /different/);
  assert.equal(s.celebrimbor!.time, 0);
});
test("Bellach has Search threat and scenario-granted immunity that cannot be blanked", () => {
  const s = base(),
    b = enemy(s);
  searched(s, 3);
  check(s);
  assert.equal(threatOf(s, b), 3);
  assert.equal(playerCardImmune(b), true);
  b.blanked = true;
  assert.equal(playerCardImmune(b), true);
  s.phase = "encounter";
  assert.match(optionalEngagementProblem(s, b)!, /Bellach/);
  engage(s, b);
  assert.ok(s.staging.includes(b));
});
test("Twelve progress unlocks Bellach on stage two without winning before the Mould is reclaimed", () => {
  const s = base(1, 2),
    b = enemy(s);
  check(s);
  assert.equal(playerCardImmune(b), true);
  progress(s, 12);
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(playerCardImmune(b), false);
  s.phase = "encounter";
  assert.equal(optionalEngagementProblem(s, b), null);
  engage(s, b);
  assert.ok(s.engaged.includes(b));
});
test("Printed location quest points, not modifiers, determine capture under Search", () => {
  const s = base(),
    l = loc(s);
  l.progress = 3;
  l.damage = 2;
  l.attachments.push({ id: "map", code: "01045", exhausted: true });
  celebrimborDamageLocation(s, l, 2);
  assert.equal(get(s, l.id), undefined);
  assert.equal(s.celebrimbor!.search.length, 1);
  const p = s.celebrimbor!.search[0];
  assert.equal(p.id, l.id);
  assert.equal(p.damage, 0);
  assert.equal(p.progress, 0);
  assert.equal(p.attachments.length, 0);
  assert.ok(s.discard.includes("01045"));
  assert.ok(!s.encounterDiscard.includes(C.tower));
  assert.ok(validateSave(s));
});
test("Damage can capture the active location, removes attachments and never grants exploration victory", () => {
  const s = base(),
    l = loc(s, C.foundation, true);
  celebrimborDamageLocation(s, l, 10);
  assert.equal(s.activeLocation, null);
  assert.equal(s.celebrimbor!.search[0].code, C.foundation);
  assert.equal(s.victory, 0);
});
test("Capturing The Secret Chamber immediately loses and cancels queued continuation", () => {
  const s = base(),
    l = loc(s, C.chamber);
  mould(s, l);
  s.queue = [fx("celebResetTime")];
  celebrimborDamageLocation(s, l, 6);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Secret Chamber/);
  assert.equal(s.queue.length, 0);
});
test("The Secret Chamber travel pays exactly 3 quest progress and still buffers ordinary quest progress", () => {
  let s = base(),
    l = loc(s, C.chamber);
  mould(s, l);
  s.phase = "travel";
  assert.match(canTravel(s, l)!, /3 quest/);
  s.progress = 5;
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  assert.equal(s.progress, 2);
  assert.equal(s.activeLocation!.id, l.id);
  progress(s, 6);
  check(s);
  assert.match(s.choice!.title, /Claim/);
  s = choose(reload(s), s.heroes[1].id);
  assert.equal(celebrimborMould(s)!.id, s.heroes[1].id);
  assert.ok(s.victoryCards!.includes(C.chamber));
});
test("The first player explicitly claims the physical Mould without changing its identity", () => {
  let s = base(2),
    l = loc(s, C.chamber, true);
  const a = mould(s, l);
  s.table!.first = 1;
  progressLocation(s, l, 6);
  check(s);
  assert.ok(
    s.choice!.options.every((o) => o.effects.every((e) => e.player === 1)),
  );
  s = choose(reload(s), seatView(s, 1).heroes[0].id);
  assert.equal(ownerOf(s, celebrimborMould(s)!), 1);
  assert.equal(celebrimborMould(s)!.attachments[0].id, a.id);
});
test("The Mould bearer leaving play loses even when it is a discard rather than destruction", () => {
  const s = base();
  mould(s);
  discardCharacter(s, s.heroes[0]);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /bearer/);
});
test("Fourteen progress cannot advance without the Mould", () => {
  const s = base();
  progress(s, 20);
  check(s);
  assert.equal(s.stage, 1);
  assert.equal(s.status, "playing");
});
test("Stage two resolves Scour, Bellach’s attack against the Mould controller, then physically transfers it", () => {
  let s = base(2),
    b = enemy(s);
  const h = seatView(s, 1).heroes[0],
    a = mould(s, h);
  s.encounterDeck = [];
  protect(s);
  progress(s, 14);
  flush(s);
  s = choose(reload(s), h.id);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.celebrimbor!.time, 3);
  assert.equal(s.stageRevealing, false);
  assert.equal(celebrimborMould(s), undefined);
  assert.equal(get(s, b.id)!.attachments[0].id, a.id);
  assert.ok(seatView(s, 1).heroes.some((h) => h.exhausted));
  assert.ok(seatView(s, 0).heroes.every((h) => !h.exhausted));
});
test("Defeating Bellach allows a mandatory reclaim choice and wins with 12 stage-two progress", () => {
  let s = base(1, 2),
    b = enemy(s, C.bellach, 0);
  mould(s, b);
  s.progress = 12;
  s.phase = "attack";
  check(s);
  s.heroes[0].tempAttack = 20;
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: b.id,
    attackerIds: [s.heroes[0].id],
  });
  assert.match(s.choice!.title, /Claim/);
  s = choose(reload(s), s.heroes[1].id);
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards!.includes(C.bellach));
});
test("A Long Defeat response resolves before stage-one attachments are discarded", () => {
  let s = base();
  enemy(s);
  mould(s);
  protect(s);
  s.encounterDeck = [];
  s.heroes[0].damage = 1;
  attachToQuest(s, C.ruins, {
    id: "long-defeat",
    code: "10122",
    exhausted: false,
  });
  progress(s, 14);
  flush(s);
  assert.match(s.choice!.title, /Long Defeat/);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.ok(s.discard.includes("10122"));
});
test("Scour snapshots current sources and the first player orders them before resetting Time", () => {
  let s = base();
  enemy(s);
  const tower = loc(s, C.tower, true);
  s.encounterDeck = [C.scout];
  s.celebrimbor!.time = 1;
  removeQuestTime(s);
  flush(s);
  assert.equal(s.celebrimbor!.time, 0);
  assert.match(s.choice!.title, /Scour/);
  s = choose(
    reload(s),
    s.choice!.options.find((o) => o.code === C.bellach)!.id,
  );
  s = choose(reload(s), `deck:${C.scout}`);
  s = settle(s);
  assert.equal(s.celebrimbor!.time, 3);
  assert.equal(get(s, tower.id)!.damage, 2);
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.code === C.scout));
});
test("Bellach searches deck and discard, adds without When Revealed or Surge and preserves duplicate quantities", () => {
  let s = base(2);
  enemy(s);
  s.encounterDeck = [C.scout, C.scout];
  s.encounterDiscard = [C.prowler];
  celebrimborScourAll(s);
  flush(s);
  s = choose(reload(s), `deck:${C.scout}`);
  s = choose(reload(s), `discard:${C.prowler}`);
  s = settle(s);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    3,
  );
  assert.equal(s.choice, null);
});
test("Ancient Foundation does not stack and assigns exactly one damage per location", () => {
  let s = base();
  loc(s, C.foundation);
  loc(s, C.foundation);
  const t = loc(s, C.chamber);
  celebrimborScourAll(s);
  flush(s);
  assert.match(s.choice!.title, /Assign 3/);
  for (let i = 0; i < 3; i++) s = choose(reload(s), t.id);
  s = settle(s);
  assert.equal(get(s, t.id)!.damage, 3);
  assert.equal(s.celebrimbor!.search.length, 0);
});
test("Prowling Orc selects the highest threat, resolves engagement and attacks before damaging the active location", () => {
  let s = base(2);
  const e = enemy(s, C.prowler),
    l = loc(s, C.remains, true);
  forOwner(s, 1, () => (s.threat = 25));
  protect(s);
  s.encounterDeck = [C.search];
  celebrimborScourAll(s);
  flush(s);
  s = choose(reload(s), seatView(s, 1).heroes[0].id);
  s = settle(s);
  assert.equal(ownerOf(s, get(s, e.id)!), 1);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === e.id));
  assert.equal(get(s, l.id)!.damage, 1);
  assert.ok(seatView(s, 1).heroes.some((h) => h.exhausted));
});
test("The first player resolves a highest-threat tie for Prowling Orc", () => {
  let s = base(2);
  const e = enemy(s, C.prowler);
  protect(s);
  s.encounterDeck = [C.search];
  celebrimborScourAll(s);
  flush(s);
  assert.match(s.choice!.title, /tied/);
  s = choose(reload(s), "player-1");
  s = settle(s);
  assert.equal(ownerOf(s, get(s, e.id)!), 1);
});
test("A prevented Prowling Orc attack never damages the active location", () => {
  let s = base(),
    e = enemy(s, C.prowler, 0),
    l = loc(s, C.tower, true);
  e.feinted = true;
  effect(s, fx("immediateAttack", { target: e.id }));
  s = settle(s);
  assert.equal(get(s, l.id)!.damage, 0);
});
test("Ruined Plaza takes damage on actual staging entry, including setup and return from active", () => {
  let s = base(),
    l = loc(s, C.plaza);
  check(s);
  s = settle(s);
  assert.equal(get(s, l.id)!.damage, 1);
  check(s);
  s = settle(s);
  assert.equal(get(s, l.id)!.damage, 1);
  const actual = get(s, l.id)!;
  s.staging = s.staging.filter((u) => u.id !== l.id);
  s.activeLocation = actual;
  check(s);
  s.activeLocation = null;
  s.staging.push(actual);
  check(s);
  s = settle(s);
  assert.equal(get(s, l.id), undefined);
  assert.equal(s.celebrimbor!.search.length, 1);
});
test("City Remains triggers the topmost Scour in discard once for any amount of progress", () => {
  let s = base(),
    city = loc(s, C.remains),
    active = loc(s, C.tower, true);
  s.encounterDiscard = [C.foundation, C.scout, C.spies];
  progressLocation(s, city, 2);
  s = settle(s);
  assert.equal(get(s, active.id)!.damage, 1);
  assert.equal(s.encounterDiscard.length, 3);
});
test("A City Remains exploration still resolves its Scour trigger", () => {
  let s = base(),
    city = loc(s, C.remains),
    active = loc(s, C.tower, true);
  s.encounterDiscard = [C.scout];
  progressLocation(s, city, 3);
  s = settle(s);
  assert.equal(get(s, city.id), undefined);
  assert.equal(get(s, active.id)!.damage, 1);
});
test("City Remains returns a physical Collapsed Tower from discard and places two damage without Surge", () => {
  let s = base(),
    city = loc(s, C.remains);
  s.encounterDiscard = [C.tower, C.spies];
  s.encounterDeck = [C.desecrated];
  progressLocation(s, city, 1);
  s = settle(s);
  assert.equal(s.staging.find((u) => u.code === C.tower)!.damage, 2);
  assert.deepEqual(s.encounterDiscard, [C.spies]);
  assert.deepEqual(s.encounterDeck, [C.desecrated]);
});
test("City Remains returns Prowling Orc from discard, engages and attacks", () => {
  let s = base(),
    city = loc(s, C.remains);
  protect(s);
  s.encounterDiscard = [C.prowler];
  s.encounterDeck = [C.search];
  progressLocation(s, city, 1);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === C.prowler));
  assert.ok(s.heroes.some((h) => h.exhausted));
  assert.ok(!s.encounterDiscard.includes(C.prowler));
});
test("Ancient Foundation travel pays damage before entry and can be captured during its own travel cost", () => {
  let s = base(),
    l = loc(s, C.foundation);
  l.damage = 3;
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  assert.equal(s.activeLocation, null);
  assert.equal(s.celebrimbor!.search[0].id, l.id);
  assert.equal(get(s, l.id), undefined);
});
test("Bellach’s Scout offers damage only with an active location and otherwise reveals an extra card", () => {
  let s = base();
  s.encounterDeck = [C.scout, C.foundation];
  effect(s, fx("reveal"));
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["reveal"],
  );
  s = choose(reload(s), "reveal");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === C.scout));
  assert.ok(s.staging.some((u) => u.code === C.foundation));
});
test("Desecrated Ruins deals three damage or surges, and cancellation prevents both clauses", () => {
  let s = base(),
    l = loc(s, C.foundation, true);
  s.encounterDeck = [C.desecrated];
  effect(s, fx("reveal"));
  s = settle(s);
  assert.equal(get(s, l.id)!.damage, 3);
  s = base();
  s.encounterDeck = [C.desecrated, C.foundation];
  effect(s, fx("reveal"));
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === C.foundation));
  s = base();
  s.heroes[0].code = "01007";
  s.hand = [make(s, "01050")];
  s.encounterDeck = [C.desecrated, C.foundation];
  effect(s, fx("reveal"));
  flush(s);
  s = choose(reload(s), "cancel");
  s = settle(s);
  assert.deepEqual(s.encounterDeck, [C.foundation]);
});
test("Discovered transfers actual random hand cards with original ownership without a discard reaction", () => {
  let s = base(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => (s.hand = [make(s, "01013")]));
  const ids = playerOrder(s).map((p) => seatView(s, p).hand[0].id);
  celebrimborEncounter(s, C.discovered);
  s = choose(reload(s), "hand");
  s = settle(s);
  assert.deepEqual(
    s.celebrimbor!.search.map((u) => u.id),
    ids,
  );
  assert.deepEqual(
    s.celebrimbor!.search.map((u) => u.owner),
    [0, 1],
  );
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).hand.length, 0);
    assert.equal(seatView(s, p).discard.length, 0);
  }
  assert.ok(validateSave(s));
});
test("Spies exhausts up to X ready characters for each player and does not surge when any exhausted", () => {
  let s = base(2);
  searched(s, 2);
  forOwner(s, 1, () => s.heroes.forEach((h) => (h.exhausted = true)));
  s.encounterDeck = [C.spies, C.foundation];
  effect(s, fx("reveal"));
  s = settle(s);
  assert.equal(seatView(s, 0).heroes.filter((h) => h.exhausted).length, 2);
  assert.deepEqual(s.encounterDeck, [C.foundation]);
});
test("Spies surges when zero characters can be exhausted, including an empty Search", () => {
  for (const count of [0, 2]) {
    let s = base();
    searched(s, count);
    s.heroes.forEach((h) => (h.exhausted = true));
    s.encounterDeck = [C.spies, C.foundation];
    effect(s, fx("reveal"));
    s = settle(s);
    assert.ok(s.staging.some((u) => u.code === C.foundation));
  }
});
test("Refresh lets the first player order Search threat before or after the expiring quest", () => {
  let s = base(),
    tower = loc(s, C.tower, true);
  tower.damage = 2;
  s.phase = "refresh";
  s.celebrimbor!.time = 1;
  effect(s, fx("phaseEnd"));
  flush(s);
  assert.equal(s.choice!.options.length, 2);
  const search = s.choice!.options.find((o) => o.code === C.search)!;
  s = choose(reload(s), search.id);
  s = settle(s);
  assert.equal(s.threat, 20);
  assert.equal(s.celebrimbor!.search.length, 1);
  assert.equal(s.celebrimbor!.time, 3);
  s = base();
  const t = loc(s, C.tower, true);
  t.damage = 2;
  s.phase = "refresh";
  s.celebrimbor!.time = 1;
  effect(s, fx("phaseEnd"));
  flush(s);
  s = choose(reload(s), s.choice!.options.find((o) => o.code === C.ruins)!.id);
  s = settle(s);
  assert.equal(s.threat, 21);
});
test("The Search threat increase applies to every living player and Bellach scales immediately", () => {
  let s = base(3),
    b = enemy(s);
  searched(s, 4);
  effect(s, fx("celebSearchThreat"));
  s = settle(s);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 24);
  assert.equal(threatOf(s, get(s, b.id)!), 4);
  assert.equal(publicState(s).orcsSearch, 4);
});
test("Collapsed Tower shadows put actual excess attack damage on the active location", () => {
  let s = base(),
    l = loc(s, C.foundation, true),
    e = enemy(s, C.prowler, 0),
    a = make(s, "01013");
  s.allies.push(a);
  s = attack(s, e, [C.tower], a);
  assert.equal(s.celebrimbor!.search.length, 1);
  assert.equal(s.celebrimbor!.search[0].id, l.id);
});
test("Ruined Plaza shadow permits damage allocation across multiple controlled characters", () => {
  let s = base(),
    e = enemy(s, C.scout, 0);
  searched(s, 2);
  s.combat = { enemyId: e.id, attackBonus: 0, defenderId: s.heroes[0].id };
  celebrimborShadow(s, C.plaza);
  flush(s);
  s = choose(reload(s), `${s.heroes[0].id}:1`);
  s = choose(reload(s), `${s.heroes[1].id}:1`);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.heroes[1].damage, 1);
});
test("Discovered shadow moves the destroyed physical defender under Search, leaving an older identical discard", () => {
  let s = base(),
    e = enemy(s, C.scout, 0),
    a = make(s, "01013");
  s.allies.push(a);
  s.discard = ["01013"];
  s = attack(s, e, [C.discovered], a);
  assert.deepEqual(s.discard, ["01013"]);
  assert.equal(s.celebrimbor!.search[0].id, a.id);
  assert.equal(s.celebrimbor!.search[0].owner, 0);
  assert.equal(s.celebrimbor!.search[0].damage, 0);
  assert.ok(validateSave(s));
});
test("Discovered shadow captures a borrowed ally without removing a different copy from its owner's discard", () => {
  let s = base(2),
    e = enemy(s, C.scout, 0),
    a = make(s, "01013");
  a.owner = 1;
  s.allies.push(a);
  forOwner(s, 1, () => (s.discard = ["01013"]));
  s = attack(s, e, [C.discovered], a);
  assert.deepEqual(seatView(s, 1).discard, ["01013"]);
  assert.equal(s.celebrimbor!.search[0].owner, 1);
});
test("City Remains shadow raises every player's threat only after the attack destroys a character", () => {
  let s = base(2),
    e = enemy(s, C.scout, 0),
    a = make(s, "01013");
  s.allies.push(a);
  searched(s, 2);
  s = attack(s, e, [C.remains], a);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 22);
  s = base();
  e = enemy(s, C.scout, 0);
  searched(s, 2);
  s.heroes[0].tempDefense = 20;
  s = attack(s, e, [C.remains], s.heroes[0]);
  assert.equal(s.threat, 20);
});
test("Desecrated Ruins shadow uses the destroyed ally's printed cost", () => {
  let s = base(),
    e = enemy(s, C.scout, 0),
    a = make(s, "01013"),
    l = loc(s, C.foundation, true);
  s.allies.push(a);
  s = attack(s, e, [C.desecrated], a);
  assert.equal(get(s, l.id)!.damage, 2);
});
test("Spies shadow discards player attachments and never the objective Mould", () => {
  let s = base(),
    e = enemy(s, C.scout, 0);
  mould(s);
  s.heroes[0].attachments.push({ id: "horn", code: "01042", exhausted: false });
  s.combat = { enemyId: e.id, attackBonus: 0, defenderId: s.heroes[0].id };
  celebrimborShadow(s, C.spies);
  flush(s);
  assert.equal(s.choice!.options.length, 1);
  s = choose(reload(s), "horn");
  s = settle(s);
  assert.ok(celebrimborMould(s));
  assert.ok(s.discard.includes("01042"));
});
test("Search physical IDs, tokens, counters and pending shadow flags are validated", () => {
  const s = base();
  searched(s);
  assert.ok(validateSave(s));
  for (const change of [
    (s: GameState) => (s.celebrimbor!.time = -1),
    (s: GameState) => (s.celebrimbor!.search[0].damage = 1),
    (s: GameState) =>
      s.celebrimbor!.search.push(structuredClone(s.celebrimbor!.search[0])),
    (s: GameState) => (s.celebrimbor!.search[0].id = s.heroes[0].id),
    (s: GameState) => (s.celebrimbor!.setupLocations = [C.tower, C.tower]),
  ]) {
    const bad = structuredClone(s);
    change(bad);
    assert.equal(validateSave(bad), false);
  }
});

test("Spies shadow includes controlled Trap and quest attachments and excludes another player's attachments", () => {
  let s = base(2),
    e = enemy(s, C.scout, 0);
  e.attachments.push(
    { id: "our-trap", code: "01069", exhausted: false, owner: 0 },
    { id: "their-trap", code: "01069", exhausted: false, owner: 1 },
  );
  attachToQuest(s, C.ruins, {
    id: "our-song",
    code: "10122",
    exhausted: false,
    owner: 0,
  });
  s.combat = { enemyId: e.id, attackBonus: 0, defenderId: s.heroes[0].id };
  celebrimborShadow(s, C.spies);
  flush(s);
  assert.deepEqual(s.choice!.options.map((o) => o.id).sort(), [
    "our-song",
    "our-trap",
  ]);
  s = choose(reload(s), "our-song");
  s = settle(s);
  assert.ok(seatView(s, 0).discard.includes("10122"));
  assert.equal(get(s, e.id)!.attachments.length, 2);
});
test("Discovered shadow does not capture a defender killed by a later direct-damage shadow", () => {
  let s = base(),
    e = enemy(s, C.scout, 0),
    a = make(s, "01013");
  a.damage = 1;
  s.allies.push(a);
  searched(s);
  s.phase = "defense";
  e.shadows = [C.discovered, C.plaza];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: a.id,
  });
  assert.match(s.choice!.title, /Assign/);
  s = choose(reload(s), `${a.id}:1`);
  s = settle(s);
  assert.equal(s.celebrimbor!.search.length, 1);
  assert.ok(s.discard.includes(a.code));
});
test("A captured defender increases Search before a City Remains shadow's subsequent threat effect", () => {
  let s = base(2),
    e = enemy(s, C.scout, 0),
    a = make(s, "01013");
  s.allies.push(a);
  searched(s);
  s = attack(s, e, [C.discovered, C.remains], a);
  assert.equal(s.celebrimbor!.search.length, 2);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 22);
});
test("Bellach's stage transition attack cannot steal the Mould after its bearer is killed", () => {
  let s = base(),
    b = enemy(s),
    h = s.heroes[0];
  mould(s, h);
  s.encounterDeck = [C.search];
  h.damage = 4;
  progress(s, 14);
  flush(s);
  s = choose(reload(s), h.id);
  s = settle(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /bearer/);
  assert.ok(!get(s, b.id)!.attachments.some((a) => a.code === C.mould));
});
test("The Mould remains on its actual hero when first player rotates", () => {
  let s = base(2);
  mould(s, s.heroes[0]);
  s.table!.first = 1;
  check(s);
  assert.equal(ownerOf(s, celebrimborMould(s)!), 0);
});
test("Discovered requires every player to have a hand card before offering that full alternative", () => {
  const s = base(2);
  s.hand = [make(s, "01013")];
  celebrimborEncounter(s, C.discovered);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["scour"],
  );
});
test("A blanked Scour card is not included in the initial simultaneous snapshot", () => {
  let s = base();
  const tower = loc(s, C.tower, true);
  tower.blanked = true;
  celebrimborScourAll(s);
  s = settle(s);
  assert.equal(get(s, tower.id)!.damage, 0);
  assert.equal(s.choice, null);
});
test("Saved Search state rejects retained resources, attachments and negative shadow counters", () => {
  const s = base();
  searched(s);
  for (const change of [
    (x: GameState) => (x.celebrimbor!.search[0].resources = 1),
    (x: GameState) =>
      x.celebrimbor!.search[0].attachments.push({
        id: "illegal",
        code: "01042",
        exhausted: false,
      }),
    (x: GameState) =>
      (x.combat = {
        enemyId: enemy(x, C.scout, 0).id,
        attackBonus: 0,
        celebExcessCopies: -1,
      }),
  ]) {
    const bad = structuredClone(s);
    change(bad);
    assert.equal(validateSave(bad), false);
  }
});

test("Random hand cards placed facedown under Search are not named in the public log or state", () => {
  let s = base();
  s.hand = [make(s, "01013")];
  const last = s.log.at(-1)!.id;
  celebrimborEncounter(s, C.discovered);
  s = choose(reload(s), "hand");
  s = settle(s);
  assert.ok(
    s.log
      .filter((x) => x.id > last)
      .every((x) => !x.text.includes("Guard of the Citadel")),
  );
  assert.ok(
    !JSON.stringify(publicState(s)).includes(s.celebrimbor!.search[0].id),
  );
  assert.equal(s.celebrimbor!.search.length, 1);
});
