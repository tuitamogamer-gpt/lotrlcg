import { applyAction as act } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  canCommit,
  canPlay,
  canTravel,
  createGame,
  playTargets,
  validateSave,
  restoreSave,
} from "../src/game/engine";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  advanceQuest,
  check,
  damage,
  destroy,
  exhaustCharacter,
  enterAlly,
  nextRound,
  progressLocation,
  resolveReveal,
  returnAlly,
  shadow,
  addVictoryCard,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { fx, make, stats, questWill } from "../src/game/core";
import {
  allActiveLocations,
  allCharacters,
  allHeroes,
  defendersFor,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  REDHORN as R,
  REDHORN_ENCOUNTERS,
  REDHORN_QUESTS,
  redhornBeforeQuestResolution,
  redhornCanMakeActive,
  redhornRoundEnd,
} from "../src/game/redhorn-gate";
import { KHAZAD as K } from "../src/game/khazad-dum";
import type { GameState, Unit } from "../src/game/types";
import recipes from "../public/scenarios.json";
const leadership = STARTERS.find((d) => d.id === "leadership")!;
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function settle(s: GameState) {
  for (let i = 0; i < 250 && s.status === "playing"; i++) {
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
function base(players = 1) {
  let s: GameState | undefined;
  for (let seed = 1; seed < 60; seed++) {
    const c = settle(
      createGame(seed, leadership.cards, leadership.heroes, leadership.id, {
        scenarioId: "redhorn-gate",
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
    if (c.status === "playing" && c.phase !== "setup") {
      s = c;
      break;
    }
  }
  assert.ok(s);
  s.phase = "planning";
  s.stage = 1;
  s.progress = 0;
  s.victory = 0;
  s.victoryCards = [];
  s.queue = [];
  s.choice = null;
  s.staging = [];
  s.encounterDiscard = [];
  s.encounterDeck = Array(20).fill("01089");
  s.activeLocation = null;
  delete s.extraActiveLocations;
  s.redhorn = { setAside: Array(5).fill(R.snowstorm), snowstorms: 0 };
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.hand = [];
      s.allies = s.allies.filter((u) => u.code === R.arwen);
      s.engaged = [];
      s.used = [];
      s.committedIds = [];
    });
  for (const h of allCharacters(s)) {
    h.exhausted = false;
    h.committed = false;
    h.damage = 0;
    h.resources = 5;
    h.attachments = [];
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
function combat(s: GameState, shadowCode: string, defender: Unit) {
  const e = make(s, R.goblin);
  s.engaged.push(e);
  e.shadows = [shadowCode];
  e.revealedShadowCount = 1;
  s.phase = "defense";
  s.combat = {
    enemyId: e.id,
    defenderId: defender.id,
    defenderIds: [defender.id],
    attackBonus: 0,
  };
  return e;
}
const arwen = (s: GameState) =>
  allCharacters(s).find((u) => u.code === R.arwen)!;

test("Redhorn registers fourteen exact encounter designs and three double-sided quest stages", () => {
  assert.equal(REDHORN_ENCOUNTERS.length, 14);
  assert.equal(REDHORN_QUESTS.length, 3);
  for (const c of [...REDHORN_ENCOUNTERS, ...REDHORN_QUESTS])
    assert.ok(SCRIPTED.has(c.code), c.name);
  assert.deepEqual(
    REDHORN_QUESTS.map((q) => Number(q.back_quest)).sort((a, b) => a - b),
    [9, 11, 13],
  );
});
test("normal/easy setup uses exact 1–4-player recipes with five Snowstorms set aside, Caradhras staged and Arwen controlled before initial reveals", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = createGame(
        3,
        leadership.cards,
        leadership.heroes,
        leadership.id,
        {
          scenarioId: "redhorn-gate",
          easy,
          guided: true,
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
      const counts: Record<string, number> = {};
      for (const c of s.encounterDeck) counts[c] = (counts[c] ?? 0) + 1;
      assert.deepEqual(
        counts,
        recipes.find((q) => q.id === `${easy ? "E" : "Q"}02.4`)!.sections
          .sharedEncounterDeck,
      );
      assert.equal(s.encounterDeck.length, easy ? 28 : 37);
      assert.equal(s.redhorn!.setAside.length, 5);
      assert.equal(s.staging[0].code, R.caradhras);
      assert.equal(ownerOf(s, arwen(s)), 0);
      assert.equal(s.queue.filter((e) => e.kind === "reveal").length, players);
    }
});
test("Arwen exhaustion offers optional resource to any eligible hero, including another player, only after actual exhaustion", () => {
  let s = base(2),
    a = arwen(s),
    h = seatView(s, 1).heroes[0];
  assert.equal(exhaustCharacter(s, a), true);
  assert.equal(exhaustCharacter(s, a), false);
  flush(s);
  assert.match(s.choice!.title, /Arwen/);
  const resources = h.resources;
  s = choose(s, h.id);
  assert.equal(seatView(s, 1).heroes[0].resources, resources + 1);
  assert.equal(s.queue.length, 0);
});
test("Arwen follows the first-player token with damage, exhaustion and attachments preserved", () => {
  const s = base(2),
    a = arwen(s);
  a.damage = 1;
  a.exhausted = true;
  attachment(s, a, "01027");
  s.phase = "refresh";
  handle(s, fx("refreshReady"));
  flush(s);
  assert.equal(s.table!.first, 1);
  handle(s, fx("endRound"));
  flush(s);
  assert.equal(s.table!.first, 1);
  assert.equal(ownerOf(s, arwen(s)), 1);
  assert.equal(arwen(s).damage, 1);
  assert.equal(arwen(s).attachments.length, 1);
});
test("Arwen leaving play by destruction, discard or return-to-hand loses immediately; controller elimination cannot transfer her away", () => {
  for (const leave of ["destroy", "discard", "return", "eliminate"]) {
    const s = base(2),
      a = arwen(s);
    if (leave === "destroy") destroy(s, a);
    else if (leave === "discard") destroy(s, a, false);
    else if (leave === "return") returnAlly(s, a);
    else {
      forOwner(s, 0, () => (s.threat = 50));
      check(s);
    }
    assert.equal(s.status, "lost", leave);
    assert.match(s.reason, /Arwen/);
  }
});
test("another printed Arwen cannot be played or put into play during the escort", () => {
  const s = base();
  s.heroes.push(make(s, "01007"));
  s.heroes.at(-1)!.resources = 5;
  s.hand = [make(s, "04058")];
  assert.match(canPlay(s, s.hand[0])!, /Arwen|unique/);
  assert.throws(() => enterAlly(s, make(s, "04058")), /Arwen|unique/i);
});
test("Freezing Cold lowers willpower, prohibits ordinary commitment and a second unblanked copy discards the hero", () => {
  let s = base();
  const id = s.heroes[0].id;
  s = reveal(s, R.cold);
  s = choose(s, id);
  assert.equal(stats(s, s.heroes[0]).will, 0);
  s.phase = "quest";
  assert.equal(canCommit(s, s.heroes[0]), false);
  s.phase = "planning";
  s = reveal(s, R.cold);
  s = choose(s, id);
  assert.ok(!s.heroes.some((h) => h.id === id));
  assert.ok(s.discard.includes("01001"));
  assert.equal(s.status, "playing");
});
test("the final stage discards all zero-willpower characters immediately without destruction-only Horn responses", () => {
  const s = base(),
    h = s.heroes[0],
    ally = make(s, "01018");
  s.allies.push(ally);
  attachment(s, h, "01042");
  attachment(s, h, R.cold);
  const resources = h.resources;
  s.stage = 3;
  check(s);
  assert.ok(!s.heroes.some((u) => u.id === h.id));
  assert.ok(!s.allies.some((u) => u.id === ally.id));
  assert.equal(resources, 5);
  assert.ok(s.discard.includes("01018"));
  assert.equal(s.status, "playing");
});
test("Snowstorm reductions stack on questing characters, affect later forced commitments and expire at phase end", () => {
  let s = base(),
    h = s.heroes[0];
  h.committed = true;
  s = reveal(s, R.snowstorm);
  assert.equal(stats(s, h).will, 1);
  const future = s.heroes[1];
  future.committed = true;
  assert.equal(stats(s, future).will, 0);
  s = reveal(s, R.snowstorm);
  assert.equal(stats(s, h).will, 0);
  handle(s, fx("phaseEnd"));
  assert.equal(stats(s, h).will, 2);
  assert.equal(s.redhorn!.snowstorms, 0);
});
test("Caradhras only reduces questing characters while active, and no non-quest effect may make it active", () => {
  let s = base(),
    h = s.heroes[0],
    c = make(s, R.caradhras);
  s.staging = [c];
  s.phase = "travel";
  assert.match(canTravel(s, c)!, /quest|Caradhras/);
  assert.equal(redhornCanMakeActive(c), false);
  assert.equal(redhornCanMakeActive(c, true), true);
  s.activeLocation = c;
  s.staging = [];
  assert.equal(stats(s, h).will, 2);
  h.committed = true;
  assert.equal(stats(s, h).will, 1);
});
test("Avalanche exhausts every ready character and commits them by card effect during quest, including a Freezing Cold hero", () => {
  let s = base();
  const frozen = s.heroes[0];
  attachment(s, frozen, R.cold);
  s.phase = "staging";
  s.heroes[1].exhausted = true;
  s = reveal(s, R.avalanche);
  assert.ok(s.heroes[0].committed);
  assert.ok(!s.heroes[1].committed);
  assert.ok(arwen(s).committed);
  assert.ok(allCharacters(s).every((h) => h.exhausted));
  s = settle(s);
  const planning = base();
  reveal(planning, R.avalanche);
  assert.ok(allCharacters(planning).every((h) => !h.committed));
});
test("Fell Voices returns the top two Snow cards of any type, lets first player order them and surges unless both are treacheries", () => {
  let s = base();
  s.encounterDiscard = [R.snowstorm, R.cold, R.celebdil];
  s = reveal(s, R.voices);
  assert.match(s.choice!.title, /Fell Voices/);
  s = choose(s, "0");
  assert.ok(s.staging.some((l) => l.code === R.celebdil));
  assert.equal(s.encounterDeck[0], R.cold);
  assert.ok(s.encounterDiscard.includes(R.snowstorm));
  const two = base();
  two.encounterDiscard = [R.snowstorm, R.cold];
  const r = reveal(two, R.voices);
  const done = choose(r, "0");
  assert.deepEqual(done.encounterDeck.slice(0, 2), [R.cold, R.snowstorm]);
  assert.equal(done.staging.length, 0);
});
test("Fallen Stones clears every progress token or resolves exactly two additional revelations", () => {
  let s = base();
  s.progress = 2;
  s.activeLocation = make(s, R.celebdil);
  s.activeLocation.progress = 1;
  const staged = make(s, R.fanuidhol);
  staged.progress = 3;
  s.staging = [staged];
  s = reveal(s, R.stones);
  s = choose(s, "remove");
  assert.equal(s.progress, 0);
  assert.ok(
    [...allActiveLocations(s), ...s.staging].every((l) => l.progress === 0),
  );
  const extra = base();
  extra.encounterDeck = [R.goblin, R.troll];
  const choice = reveal(extra, R.stones);
  const done = choose(choice, "reveal");
  assert.equal(done.staging.length, 2);
});
test("Mountain Goblin and Troll attack follow only Mountain locations currently staged, and their shadow checks active Mountain", () => {
  const s = base(),
    e = make(s, R.goblin),
    t = make(s, R.troll),
    l = make(s, R.celebdil);
  s.staging = [e, t, l];
  assert.equal(stats(s, e).attack, (card(e.code).attack ?? 0) + 1);
  s.activeLocation = l;
  s.staging = [e, t];
  assert.equal(stats(s, e).attack, card(e.code).attack);
  combat(s, R.goblin, s.heroes[0]);
  shadow(s, R.goblin);
  assert.equal(s.combat!.attackBonus, 2);
});
test("Snow Warg forbids ally defenders and wounds a declared hero before optional defense responses", () => {
  let s = base(),
    w = make(s, R.warg),
    ally = make(s, "01013");
  s.allies.push(ally);
  s.engaged = [w];
  s.phase = "defense";
  assert.ok(!defendersFor(s, w).some((u) => u.id === ally.id));
  assert.throws(
    () => act(s, { type: "DEFEND", enemyId: w.id, defenderId: ally.id }),
    /defend|ready/,
  );
  const h = s.heroes[0];
  w.shadows = [];
  s = act(s, { type: "DEFEND", enemyId: w.id, defenderId: h.id });
  assert.ok(s.heroes.find((u) => u.id === h.id)!.damage >= 1);
});
test("Snowstorm shadow lowers defending character willpower until phase end and discards it at zero even before stage three", () => {
  const s = base(),
    h = s.heroes[1];
  combat(s, R.snowstorm, h);
  shadow(s, R.snowstorm);
  flush(s);
  assert.ok(!s.heroes.some((u) => u.id === h.id));
  assert.ok(s.discard.includes(h.code));
  assert.equal(s.status, "playing");
});
test("Rocky Crags travel damages a chosen character from every surviving player before entering", () => {
  let s = base(2),
    crags = make(s, R.crags);
  s.staging = [crags];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: crags.id });
  const h0 = seatView(s, 0).heroes[0],
    h1 = seatView(s, 1).heroes[0];
  s = choose(s, h0.id);
  s = choose(s, h1.id);
  assert.equal(seatView(s, 0).heroes[0].damage, 2);
  assert.equal(seatView(s, 1).heroes[0].damage, 2);
  assert.equal(s.activeLocation!.id, crags.id);
});
test("Dimrill Stair shuffles discarded and victory locations, subtracts their points, reduces each threat and removes all Freezing Cold only after at least two locations", () => {
  let s = base(2),
    stair = make(s, R.stair);
  s.staging = [stair];
  s.encounterDiscard = [R.celebdil, R.snowstorm];
  addVictoryCard(s, R.caradhras);
  for (const h of allHeroes(s).slice(0, 2)) attachment(s, h, R.cold);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: stair.id });
  assert.equal(s.victory, 0);
  assert.deepEqual(s.victoryCards, []);
  assert.equal(seatView(s, 0).threat, 9);
  assert.equal(seatView(s, 1).threat, 9);
  assert.ok(
    allHeroes(s).every((h) => !h.attachments.some((a) => a.code === R.cold)),
  );
  assert.ok(s.encounterDeck.includes(R.caradhras));
  assert.ok(s.encounterDiscard.includes(R.snowstorm));
  const only = base();
  const location = make(only, R.stair);
  only.staging = [location];
  only.encounterDiscard = [R.celebdil];
  attachment(only, only.heroes[0], R.cold);
  only.phase = "travel";
  const done = act(only, { type: "TRAVEL", id: location.id });
  assert.equal(done.threat, 20);
  assert.ok(done.heroes[0].attachments.length);
});
test("Celebdil removes two progress at round end only while active and never goes negative", () => {
  const s = base(),
    a = make(s, R.celebdil),
    b = make(s, R.celebdil);
  a.progress = 3;
  b.progress = 3;
  s.activeLocation = a;
  s.staging = [b];
  redhornRoundEnd(s);
  assert.equal(a.progress, 1);
  assert.equal(b.progress, 3);
  redhornRoundEnd(s);
  assert.equal(a.progress, 0);
});
test("Fanuidhol makes each committed hero choose its own one-resource payment before quest resolution", () => {
  let s = base(2);
  s.activeLocation = make(s, R.fanuidhol);
  const h0 = seatView(s, 0).heroes[0],
    h1 = seatView(s, 1).heroes[0];
  h0.committed = true;
  h1.committed = true;
  assert.equal(questWill(s), 0);
  assert.equal(redhornBeforeQuestResolution(s), true);
  flush(s);
  s = choose(s, "pay");
  s = choose(s, "skip");
  assert.equal(seatView(s, 0).heroes[0].resources, 4);
  assert.equal(seatView(s, 1).heroes[0].resources, 5);
  assert.equal(questWill(s), stats(s, seatView(s, 0).heroes[0]).will);
  assert.equal(redhornBeforeQuestResolution(s), false);
});
test("stage one adds players-plus-one Snowstorms, and Snowdrifts forces Caradhras active before final-stage rules", () => {
  let s = base(3);
  s.progress = 9;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 2);
  assert.equal(s.redhorn!.setAside.length, 1);
  assert.equal(s.encounterDeck.filter((c) => c === R.snowstorm).length, 4);
  const l = make(s, R.celebdil);
  s.activeLocation = l;
  s.staging = [make(s, R.caradhras)];
  s.encounterDiscard = [R.snowstorm];
  s.progress = 11;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 3);
  assert.equal(s.activeLocation!.code, R.caradhras);
  assert.ok(s.encounterDiscard.includes(l.code));
  assert.ok(!s.encounterDiscard.includes(R.snowstorm));
  assert.equal(s.progress, 0);
});
test("Caradhras returns from the victory display at Snowdrifts completion, removing its points and previous progress", () => {
  const s = base();
  s.stage = 2;
  addVictoryCard(s, R.caradhras);
  s.progress = 11;
  advanceQuest(s);
  flush(s);
  assert.equal(s.activeLocation!.code, R.caradhras);
  assert.equal(s.activeLocation!.progress, 0);
  assert.equal(s.victory, 0);
  assert.deepEqual(s.victoryCards, []);
});
test("Snowdrifts chooses a singular active location to discard when several are active, preserving the other", () => {
  let s = base();
  s.stage = 2;
  s.progress = 11;
  const a = make(s, R.celebdil),
    b = make(s, R.fanuidhol);
  s.activeLocation = a;
  s.extraActiveLocations = [b];
  s.staging = [make(s, R.caradhras)];
  advanceQuest(s);
  flush(s);
  s = choose(s, a.id);
  assert.equal(s.stage, 3);
  assert.ok(allActiveLocations(s).some((l) => l.id === b.id));
  assert.ok(allActiveLocations(s).some((l) => l.code === R.caradhras));
  assert.ok(s.encounterDiscard.includes(a.code));
});
test("final victory requires both thirteen quest progress and at least five victory points", () => {
  const s = base();
  s.stage = 3;
  s.progress = 13;
  s.victory = 4;
  advanceQuest(s);
  assert.equal(s.status, "playing");
  s.victory = 5;
  advanceQuest(s);
  assert.equal(s.status, "won");
  const low = base();
  low.stage = 3;
  low.progress = 12;
  low.victory = 5;
  advanceQuest(low);
  assert.equal(low.status, "playing");
});
test("active-location progress shadows use first-player choice for several active locations", () => {
  let s = base();
  const a = make(s, R.celebdil),
    b = make(s, R.fanuidhol);
  a.progress = 1;
  b.progress = 3;
  s.activeLocation = a;
  s.extraActiveLocations = [b];
  combat(s, R.crags, s.heroes[0]);
  shadow(s, R.crags);
  flush(s);
  s = choose(s, b.id);
  assert.equal(s.combat!.attackBonus, 3);
});
test("snow, payment choices, set-aside cards and Arwen controller survive multiplayer save/reload", () => {
  let s = base(2);
  s.redhorn!.snowstorms = 1;
  s.activeLocation = make(s, R.fanuidhol);
  seatView(s, 0).heroes[0].committed = true;
  redhornBeforeQuestResolution(s);
  flush(s);
  syncSeat(s);
  assert.ok(validateSave(s));
  s = restoreSave(s)!;
  assert.equal(s.redhorn!.setAside.length, 5);
  assert.equal(s.redhorn!.snowstorms, 1);
  assert.match(s.choice!.title, /Fanuidhol/);
  s = choose(s, "pay");
  assert.equal(ownerOf(s, arwen(s)), 0);
});
test("the eleventh Snowdrifts token creates Caradhras as a buffer before surplus placement, without carrying progress to the final quest", () => {
  const s = base();
  s.stage = 2;
  s.progress = 15;
  const c = make(s, R.caradhras);
  c.progress = 2;
  s.staging = [c];
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 3);
  assert.equal(s.activeLocation!.progress, 6);
  assert.equal(s.progress, 0);
});
test("two Snowstorms during the final stage discard Arwen and lose before her optional exhaustion resource can resolve", () => {
  let s = base();
  s.stage = 3;
  arwen(s).committed = true;
  s = reveal(s, R.snowstorm);
  assert.equal(s.status, "playing");
  s = reveal(s, R.snowstorm);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Arwen/);
  assert.equal(s.choice, null);
});
