import test from "node:test";
import { canPlay, playTargets } from "../src/game/engine";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  applyAction,
  createGame,
  canTravel,
  validateSave,
} from "../src/game/engine";
import { card, imageUrl, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  fx,
  get,
  make,
  stats,
  threatOf,
  stagingThreat,
  stageInfo,
} from "../src/game/core";
import {
  check,
  damage,
  discardCharacter,
  discardHandCard,
  discardPlayerDeck,
  engage,
  placeEncounter,
  progress,
  progressLocation,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table";
import { currentQuestUnit } from "../src/game/quest-state";
import {
  addCurrentQuestProgress,
  sideQuestStart,
} from "../src/game/side-quests";
import { automatedScenarioId } from "../src/game/support";
import {
  DIKE as D,
  DIKE_ENCOUNTERS,
  DIKE_QUESTS,
  DIKE_RECIPES,
} from "../src/game/deadmens-dike-support";
import {
  base,
  start,
  second,
  choose,
  reload,
  settle,
} from "./deadmens-dike-fixtures";
import type { GameState, Unit } from "../src/game/types";

function finish(s: GameState) {
  flush(s);
  return settle(s);
}
function staged(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function enemy(s: GameState, code: string = D.shade, player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function ally(s: GameState, code = "01016", player = 0) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.allies.push(u);
  });
  return u;
}
function thaurdir(s: GameState) {
  return [...s.staging, ...allEngaged(s)].find((u) => u.code === D.thaurdir)!;
}
function side(s: GameState, code: string) {
  placeEncounter(s, code, false, 0, undefined, true);
  return [...s.staging].reverse().find((u) => u.code === code)!;
}
function target(s: GameState, id: string, n?: number) {
  const option = s.choice!.options.find(
    (o) =>
      o.id === id ||
      (n !== undefined && o.id === `${id}:${n}`) ||
      o.effects.some(
        (e) =>
          e.target === id &&
          (n === undefined || e.value === n || e.count === n),
      ),
  );
  assert.ok(option, JSON.stringify(s.choice));
  return option;
}
function branch(s: GameState, pattern: RegExp) {
  const option = s.choice!.options.find((o) => pattern.test(o.label));
  assert.ok(option, JSON.stringify(s.choice));
  return choose(reload(s), option.id);
}
function defend(s: GameState, e: Unit, d: Unit, shadows: string[] = []) {
  s.phase = "defense";
  get(s, e.id)!.shadows = shadows;
  return applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: d.id,
  });
}
function selected(s: GameState, q: Unit) {
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  return choose(reload(s), q.id);
}
function committed(s: GameState, q?: Unit) {
  s.phase = "staging";
  const h = s.heroes[0];
  h.committed = true;
  h.exhausted = true;
  h.tempWill = 30;
  s.committedIds = [h.id];
  if (q) s.sideQuestSelections = { shared: { id: q.id, code: q.code } };
  return s;
}

// Original local faces and the official Lost Realm rules/FAQ are the authority.
// FAQ 1.53–1.54 distinguish WR cancellation from whole-card cancellation;
// Broken Battlements says EACH player places a counter after discarding.
test("Deadmen's Dike registers every original encounter, both quests and exact printed targets", () => {
  assert.equal(DIKE_ENCOUNTERS.length, 18);
  assert.equal(DIKE_QUESTS.length, 2);
  for (const c of [...DIKE_ENCOUNTERS, ...DIKE_QUESTS, card(D.iarion)]) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    for (const path of [imageUrl(c), c.back_imagesrc].filter(Boolean))
      assert.ok(existsSync(`public${path}`));
  }
  assert.equal(card(D.shades).back_quest, 11);
  assert.equal(card(D.wraith).back_quest, 13);
  assert.doesNotMatch(card(D.shades).back_text!, /musst/);
  assert.doesNotMatch(card(D.tombs).text!, /shuffl es/);
  assert.doesNotMatch(card(D.power).text!, /shuffl es/);
  assert.match(
    card(D.battlements).text!,
    /each player discards[\s\S]*and places 1 time counter/i,
  );
  assert.match(card(D.iarion).text!, /revealed from the encounter deck/);
  assert.match(
    card(D.thaurdir).text!,
    /Indestructible\. Cannot have attachments/,
  );
  assert.doesNotMatch(card(D.thaurdir).text!, /Immune to player card effects/);
  for (const r of DIKE_RECIPES)
    assert.equal(automatedScenarioId(r), "deadmens-dike");
  assert.equal(
    automatedScenarioId({ name: "Deadmen's Dike", mode: "nightmare" }),
    null,
  );
});
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`real ${easy ? "easy" : "standard"} setup preserves exact recipe zones for ${players} players`, () => {
      const s = start(players, easy);
      assert.equal(s.status, "playing");
      assert.equal(s.stage, 1);
      assert.equal(s.phase, "resource");
      assert.equal(s.deadmensDike!.initialized, true);
      assert.deepEqual(
        s.deadmensDike!.setAside.map((u) => u.code),
        [D.thaurdir],
      );
      assert.equal(
        allCharacters(s).filter((u) => u.code === D.iarion).length,
        1,
      );
      assert.equal(
        allEngaged(s).filter((u) => u.code === D.shade).length,
        players,
      );
      for (const p of playerOrder(s))
        assert.ok(seatView(s, p).engaged.some((u) => u.code === D.shade));
      assert.ok(s.staging.some((u) => u.code === D.square));
      assert.equal(stageInfo(s).questImage, card(D.shades).back_imagesrc);
      const recipe = DIKE_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const expected = recipe.cards
        .filter((r) =>
          ["sharedEncounterDeck", "sharedStagingArea"].includes(r.section),
        )
        .flatMap((r) => Array<string>(r.quantity).fill(r.code))
        .sort();
      assert.equal(
        recipe.cards
          .filter((r) => r.section === "sharedEncounterDeck")
          .reduce((n, r) => n + r.quantity, 0),
        easy ? 28 : 41,
      );
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...allEngaged(s).map((u) => u.code),
        ...Object.values(s.questAttachments ?? {}).flatMap((a) =>
          a.map((a) => a.code),
        ),
      ];
      assert.deepEqual(physical.sort(), expected);
      assert.ok(validateSave(s));
    });
test("scenario setup and encounter reveals wait until every opening hand is kept", () => {
  const d = STARTERS[0];
  let s = createGame(19, d.cards, d.heroes, d.id, {
    scenarioId: "deadmens-dike",
    seats: STARTERS.slice(0, 2).map((d) => ({
      deckId: d.id,
      heroes: [...d.heroes],
    })),
  });
  assert.equal(s.deadmensDike!.initialized, false);
  s = applyAction(reload(s), { type: "KEEP" });
  assert.equal(s.phase, "setup");
  assert.equal(s.deadmensDike!.initialized, false);
  assert.equal(allEngaged(s).length, 0);
});
test("stage one advances at eleven progress and adds the original reserved Thaurdir before stage-two reveals", () => {
  let s = base();
  const id = s.deadmensDike!.setAside[0].id;
  s.encounterDeck = [D.square];
  progress(s, 10);
  check(s);
  assert.equal(s.stage, 1);
  progress(s, 1);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(thaurdir(s).id, id);
  assert.equal(s.deadmensDike!.setAside.length, 0);
  assert.equal(s.staging.filter((u) => u.code === D.square).length, 1);
  assert.ok(validateSave(s));
});
test("progress remains on stage two while Thaurdir has HP, then defeating his remaining HP unlocks thirteen progress", () => {
  let s = second();
  const t = thaurdir(s);
  s.progress = 13;
  check(s);
  assert.equal(s.status, "playing");
  damage(s, t.id, 8);
  check(s);
  assert.equal(s.status, "playing");
  assert.ok(get(s, t.id));
  damage(s, t.id, 1);
  check(s);
  s = finish(s);
  assert.equal(s.status, "won");
  assert.ok(
    get(s, t.id),
    "Indestructible leaves the physical zero-HP enemy in play",
  );
});
test("player card damage affects Thaurdir despite Indestructible, and direct discard is not damage destruction", () => {
  let s = second();
  const t = thaurdir(s);
  s.hand = [make(s, "01073")];
  s = applyAction(reload(s), { type: "PLAY", id: s.hand[0].id });
  s = choose(reload(s), target(s, t.id).id);
  s = finish(s);
  assert.equal(get(s, t.id)!.damage, 4);
  discardCharacter(s, get(s, t.id)!);
  assert.ok(!get(s, t.id));
  s.progress = 13;
  check(s);
  assert.equal(s.status, "won", "an absent enemy has no remaining HP blocker");
});
test("Thaurdir cannot receive player attachments", () => {
  let s = second();
  const t = thaurdir(s);
  engage(s, t);
  s.heroes[2] = make(s, "01012");
  s.heroes[2].resources = 10;
  const trap = make(s, "01069");
  s.hand.push(trap);
  assert.throws(
    () => applyAction(reload(s), { type: "PLAY", id: trap.id, target: t.id }),
    /attach|target/i,
  );
  assert.equal(t.attachments.length, 0);
});
for (const stage of [1, 2])
  test(`an empty player deck immediately loses solo stage ${stage}`, () => {
    const s = stage === 1 ? base() : second();
    s.deck = [];
    check(s);
    assert.equal(s.status, "lost");
    assert.equal(s.choice, null);
    assert.equal(s.queue.length, 0);
  });
test("empty-deck elimination affects one fellowship, transfers Iârion and returns its damaged engaged enemy", () => {
  let s = base(2);
  const e = enemy(s, D.shade, 0);
  e.damage = 2;
  s.deck = [];
  check(s);
  s = finish(s);
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(firstPlayer(s), 1);
  assert.equal(seatView(s, 0).heroes.length, 0);
  assert.equal(seatView(s, 1).heroes.length, 3);
  assert.ok(seatView(s, 1).allies.some((u) => u.code === D.iarion));
  assert.equal(s.staging.find((u) => u.id === e.id)!.damage, 2);
  assert.ok(validateSave(s));
});
test("drawing the last player card also eliminates immediately instead of reshuffling discard", () => {
  let s = base();
  s.deck = ["01057"];
  s.discard = ["01013"];
  handle(s, fx("draw", { value: 1 }));
  check(s);
  s = finish(s);
  assert.equal(s.status, "lost");
  assert.deepEqual(s.deck, []);
});
test("the printed main-stage refresh discard continues while an encounter side quest is selected", () => {
  let s = base(2);
  const q = side(s, D.power);
  s.sideQuestSelections = { shared: { id: q.id, code: q.code } };
  s.phase = "refresh";
  for (const p of playerOrder(s))
    forOwner(s, p, () => (s.deck = ["01013", "01057", "01057"]));
  s = applyAction(reload(s), { type: "NEXT" });
  s = finish(s);
  for (const p of playerOrder(s))
    assert.ok(seatView(s, p).discard.includes("01013"));
});
test("Iârion leaving play loses the quest, and his stats count main plus every side quest", () => {
  const s = base();
  const i = s.allies.find((u) => u.code === D.iarion)!;
  assert.equal(stats(s, i).will, 1);
  staged(s, D.power);
  staged(s, D.world);
  assert.equal(stats(s, i).attack, 3);
  assert.equal(stats(s, i).defense, 3);
  discardCharacter(s, i);
  check(s);
  assert.equal(s.status, "lost");
});
test("Fornost Square gains exactly one token per first-player multi-card discard instruction", () => {
  let s = base(2);
  const a = staged(s, D.square),
    b = staged(s, D.square);
  discardPlayerDeck(s, 5, 0);
  s = finish(s);
  for (const id of [a.id, b.id]) {
    assert.equal(get(s, id)!.resources, 1);
    assert.equal(threatOf(s, get(s, id)!), 2);
  }
  discardPlayerDeck(s, 3, 1);
  s = finish(s);
  assert.equal(get(s, a.id)!.resources, 1);
  discardPlayerDeck(s, 1, 0);
  s = finish(s);
  assert.equal(get(s, a.id)!.resources, 2);
  assert.equal(threatOf(s, get(s, a.id)!), 3);
});
test("Fornost Square ignores draws and hand discards", () => {
  let s = base();
  const q = staged(s, D.square);
  const a = make(s, "01013");
  s.hand = [a];
  handle(s, fx("draw", { value: 1 }));
  discardHandCard(s, a.id);
  s = finish(s);
  assert.equal(get(s, q.id)!.resources, 0);
});
for (const players of [1, 2, 3, 4])
  test(`Broken Battlements Time3 resets one counter per each of ${players} players`, () => {
    let s = base(players);
    const q = side(s, D.battlements);
    assert.equal(q.timeCounters, 3);
    q.timeCounters = 1;
    s.phase = "refresh";
    for (const p of playerOrder(s))
      forOwner(s, p, () => (s.deck = Array(20).fill("01057")));
    s = applyAction(reload(s), { type: "NEXT" });
    s = finish(s);
    assert.equal(get(s, q.id)!.timeCounters, players);
    for (const p of playerOrder(s))
      assert.equal(
        seatView(s, p).discard.filter((c) => c === "01057").length,
        6,
        "fiveTime + one mainstage",
      );
    assert.ok(validateSave(s));
    s = reload(s);
    assert.equal(get(s, q.id)!.timeCounters, players);
  });
test("Broken Battlements travel discards each player's top card and preserves printed Time3", () => {
  let s = base(2);
  const q = side(s, D.battlements);
  assert.equal(q.timeCounters, 3);
  s.phase = "travel";
  for (const p of playerOrder(s))
    forOwner(s, p, () => (s.deck = ["01013", "01057", "01057"]));
  assert.equal(canTravel(s, q), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: q.id });
  s = finish(s);
  assert.equal(s.activeLocation!.id, q.id);
  assert.equal(s.activeLocation!.timeCounters, 3);
  for (const p of playerOrder(s))
    assert.deepEqual(seatView(s, p).discard, ["01013"]);
});
test("Norbury Tombs travel returns the topmost enemy, including a non-Undead, without revealing it", () => {
  let s = base();
  const q = side(s, D.tombs);
  s.phase = "travel";
  assert.match(canTravel(s, q)!, /enemy.*discard/i);
  s.encounterDiscard = [D.cursed, D.square, "01096", D.fog];
  assert.equal(canTravel(s, q), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: q.id });
  s = finish(s);
  assert.equal(s.activeLocation!.id, q.id);
  assert.ok(s.staging.some((u) => u.code === "01096"));
  assert.deepEqual(s.encounterDiscard, [D.cursed, D.square, D.fog]);
  assert.equal(s.deadmensDike!.undeadRevealRound, -1);
});
for (const accept of [false, true])
  test(`Norbury Tombs' active exploration Response can be ${accept ? "accepted" : "declined"} and recycles each top five`, () => {
    let s = base(2);
    const q = make(s, D.tombs);
    s.activeLocation = q;
    for (const p of playerOrder(s))
      forOwner(
        s,
        p,
        () =>
          (s.discard = ["01013", "01016", "01050", "01026", "01057", "01049"]),
      );
    progressLocation(s, q, 5);
    flush(s);
    assert.match(s.choice!.title, /Norbury/);
    s = choose(reload(s), accept ? "resolve" : "skip");
    s = finish(s);
    for (const p of playerOrder(s)) {
      assert.deepEqual(
        seatView(s, p).discard,
        accept
          ? ["01013"]
          : ["01013", "01016", "01050", "01026", "01057", "01049"],
      );
      assert.equal(seatView(s, p).deck.length, accept ? 35 : 30);
    }
    assert.ok(s.encounterDiscard.includes(D.tombs));
  });
test("exploring staged Norbury Tombs never offers its active-only Response", () => {
  let s = base();
  const q = staged(s, D.tombs);
  s.discard = ["01013"];
  progressLocation(s, q, 5);
  s = finish(s);
  assert.deepEqual(s.discard, ["01013"]);
  assert.equal(s.deck.length, 30);
});
test("Haunted Keep grants surge to the round's first revealed Undead only", () => {
  let s = base();
  s.activeLocation = make(s, D.keep);
  s.encounterDeck = [D.square, D.gate];
  revealed(s, D.cursed);
  s = finish(s);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(s.staging.filter((u) => u.code === D.square).length, 1);
  revealed(s, D.lord);
  s = finish(s);
  assert.equal(s.encounterDeck.length, 1);
  s.round++;
  revealed(s, D.cursed);
  s = finish(s);
  assert.equal(s.encounterDeck.length, 0);
});
test("an Undead reveal before Haunted Keep becomes active still consumes the round's first reveal", () => {
  let s = base();
  s.encounterDeck = [D.square];
  revealed(s, D.cursed);
  s = finish(s);
  s.activeLocation = make(s, D.keep);
  revealed(s, D.cursed);
  s = finish(s);
  assert.deepEqual(s.encounterDeck, [D.square]);
});
test("returning Cursed Dead from discard is put into play, never another Keep reveal or recursive WR", () => {
  let s = base();
  s.activeLocation = make(s, D.keep);
  s.encounterDiscard = [D.cursed, D.cursed, D.lord];
  s.encounterDeck = [D.square, D.gate];
  revealed(s, D.cursed);
  s = finish(s);
  assert.equal(s.staging.filter((u) => u.code === D.cursed).length, 3);
  assert.ok(s.encounterDiscard.includes(D.lord));
  assert.ok(!s.encounterDiscard.includes(D.cursed));
  assert.deepEqual(s.encounterDeck, [D.gate]);
});
test("Dead Lord engages the topmost Undead with its controller, preserving non-Undead discard cards", () => {
  let s = base(2);
  const e = staged(s, D.lord);
  s.encounterDiscard = [D.cursed, D.shade, "01096", D.fog];
  forOwner(s, 1, () => engage(s, e));
  s = finish(s);
  assert.deepEqual(
    seatView(s, 1)
      .engaged.map((u) => u.code)
      .sort(),
    [D.lord, D.shade].sort(),
  );
  assert.equal(seatView(s, 0).engaged.length, 0);
  assert.deepEqual(s.encounterDiscard, [D.cursed, "01096", D.fog]);
});
test("Dead Lords returning other Dead Lords chain engagement Forced effects until the discard has no Undead", () => {
  let s = base();
  s.encounterDiscard = [D.cursed, D.lord, D.square];
  const e = staged(s, D.lord);
  engage(s, e);
  s = finish(s);
  assert.deepEqual(
    s.engaged.map((u) => u.code).sort(),
    [D.lord, D.lord, D.cursed].sort(),
  );
  assert.deepEqual(s.encounterDiscard, [D.square]);
});
test("Thaurdir's Damned mills exactly two cards then assigns their combined printed cost only to its engaged player", () => {
  let s = base(2);
  const e = staged(s, D.damned),
    h = seatView(s, 1).heroes[0];
  forOwner(s, 1, () => {
    s.deck = ["01013", "01016", ...Array(10).fill("01057")];
    engage(s, e);
  });
  flush(s);
  assert.match(s.choice!.title, /Assign 3/);
  assert.ok(
    s.choice!.options.every((o) =>
      o.effects.every(
        (e) =>
          !e.target || seatView(s, 1).heroes.some((h) => h.id === e.target),
      ),
    ),
  );
  s = choose(reload(s), target(s, h.id, 3).id);
  s = finish(s);
  assert.equal(get(s, h.id)!.damage, 3);
  assert.deepEqual(seatView(s, 1).discard, ["01013", "01016"]);
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.damage, 0),
    0,
  );
});
test("Damned printed X costs count zero and zero-cost discards require no damage allocation", () => {
  let s = base();
  s.deck = ["01051", "01038", ...Array(10).fill("01057")];
  const e = staged(s, D.damned);
  assert.equal(card("01051").cost, "X");
  assert.equal(Number(card("01038").cost), 0);
  engage(s, e);
  s = finish(s);
  assert.equal(
    allCharacters(s).reduce((n, u) => n + u.damage, 0),
    0,
  );
  assert.deepEqual(s.discard, ["01051", "01038"]);
});
for (const split of [false, true])
  test(`Damned damage assigned to Frodo in ${split ? "two parts" : "one part"} is one cancelable damage event`, () => {
    let s = base();
    s.heroes[0] = make(s, "02025");
    const h = s.heroes[0];
    s.deck = ["01013", "01038", ...Array(10).fill("01057")];
    engage(s, staged(s, D.damned));
    flush(s);
    s = choose(reload(s), target(s, h.id, split ? 1 : 2).id);
    if (split) s = choose(reload(s), target(s, h.id, 1).id);
    assert.ok(s.choice!.options.some((o) => o.id === "cancel-damage"));
    s = choose(reload(s), "cancel-damage");
    s = finish(s);
    assert.equal(get(s, h.id)!.damage, 0);
    assert.equal(s.threat, 22);
  });
test("Damned's damage choices never overassign a character's remaining HP", () => {
  const s = base();
  const h = s.heroes[0];
  h.damage = 4;
  s.deck = ["01013", "01016", ...Array(10).fill("01057")];
  engage(s, staged(s, D.damned));
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === `${h.id}:1`));
  assert.ok(!s.choice!.options.some((o) => o.id === `${h.id}:2`));
});
for (const allyTop of [false, true])
  test(`Baleful Shade attack mills before damage and ${allyTop ? "gets +2 from an ally" : "does not gain +2 from an attachment"}`, () => {
    let s = base();
    const e = enemy(s),
      h = s.heroes[0];
    s.deck = [allyTop ? "01016" : "01057", ...Array(10).fill("01057")];
    s = finish(defend(s, e, h));
    assert.equal(get(s, h.id)!.damage, allyTop ? 2 : 0);
    assert.deepEqual(s.discard, [allyTop ? "01016" : "01057"]);
  });
test("Restless Evil boosts every currently present Undead across both seats and staging, then expires", () => {
  let s = base(2);
  const a = enemy(s, D.cursed, 0),
    b = enemy(s, D.lord, 1),
    c = staged(s, D.damned),
    ordinary = staged(s, "01096");
  const prior = stats(s, ordinary);
  revealed(s, D.restless);
  s = finish(s);
  for (const e of [a, b, c]) {
    const u = get(s, e.id)!;
    assert.equal(stats(s, u).attack, (card(e.code).attack ?? 0) + 1);
    assert.equal(stats(s, u).defense, (card(e.code).defense ?? 0) + 1);
    assert.equal(threatOf(s, u), (card(e.code).threat ?? 0) + 1);
  }
  assert.equal(stats(s, get(s, ordinary.id)!).attack, prior.attack);
  const later = staged(s, D.cursed);
  assert.equal(
    stats(s, later).attack,
    3,
    "later enemies are not the targets of an earlier lasting effect",
  );
  assert.equal(stats(s, later).defense, card(later.code).defense!);
  assert.equal(threatOf(s, later), card(later.code).threat!);
  s.phase = "refresh";
  s = applyAction(reload(s), { type: "NEXT" });
  s = finish(s);
  for (const e of [a, b, c]) {
    const u = get(s, e.id)!;
    assert.equal(stats(s, u).attack, card(u.code).attack!);
    assert.equal(stats(s, u).defense, card(u.code).defense!);
    assert.equal(threatOf(s, u), card(u.code).threat!);
  }
});
test("Restless Evil surges when no Undead is in play, ignoring the set-aside boss", () => {
  let s = base();
  s.encounterDeck = [D.square];
  revealed(s, D.restless);
  s = finish(s);
  assert.equal(s.staging.filter((u) => u.code === D.square).length, 1);
  assert.equal(s.encounterDeck.length, 0);
});
for (const discard of [false, true])
  test(`Unnatural Fog ${discard ? "mills controlled questers" : "removes controlled questers"} and preserves Doomed2`, () => {
    let s = base();
    const a = ally(s);
    const h = s.heroes[0];
    h.committed = true;
    h.exhausted = true;
    a.committed = true;
    a.exhausted = true;
    s.committedIds = [h.id, a.id];
    const before = s.deck.length;
    revealed(s, D.fog);
    flush(s);
    s = choose(reload(s), discard ? "discard" : "remove");
    s = finish(s);
    assert.equal(s.threat, 22);
    assert.equal(s.deck.length, before - (discard ? 2 : 0));
    for (const id of [h.id, a.id]) {
      assert.equal(get(s, id)!.committed, discard);
      assert.equal(get(s, id)!.exhausted, true);
    }
    assert.equal(s.heroes[1].committed, false);
  });
test("Fog resolves separate per-player branches and disallows incomplete milling when removal is possible", () => {
  let s = base(2);
  const h0 = seatView(s, 0).heroes[0],
    h1 = seatView(s, 1).heroes[0],
    a = ally(s, "01016", 1);
  h0.committed = true;
  h1.committed = true;
  a.committed = true;
  forOwner(s, 0, () => (s.committedIds = [h0.id]));
  forOwner(s, 1, () => {
    s.committedIds = [h1.id, a.id];
    s.deck = ["01057"];
  });
  revealed(s, D.fog);
  flush(s);
  s = choose(reload(s), "discard");
  assert.ok(!s.choice!.options.some((o) => o.id === "discard"));
  s = choose(reload(s), "remove");
  s = finish(s);
  assert.equal(get(s, h0.id)!.committed, true);
  assert.equal(get(s, h1.id)!.committed, false);
  assert.equal(get(s, a.id)!.committed, false);
  assert.equal(seatView(s, 0).deck.length, 29);
  assert.equal(seatView(s, 1).deck.length, 1);
});
test("Dark Sorcery checks every ally against its controller's discard titles, never heroes or another player's pile", () => {
  let s = base(2);
  const a = ally(s, "01013", 0),
    b = ally(s, "01013", 1),
    c = ally(s, "01016", 0);
  s.discard = ["01013", s.heroes[0].code];
  revealed(s, D.sorcery);
  s = finish(s);
  assert.ok(!get(s, a.id));
  assert.ok(get(s, b.id));
  assert.ok(get(s, c.id));
  assert.ok(get(s, s.heroes[0].id));
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
});
test("Terror's threat is twice the global union of types, stacks per copy and expires next round", () => {
  let s = base(2);
  const tail = Array(10).fill("01057");
  forOwner(s, 0, () => (s.deck = ["01013", "01050", "01026", ...tail]));
  forOwner(s, 1, () => (s.deck = ["01016", "01057", "09014", ...tail]));
  revealed(s, D.terror);
  s = finish(s);
  assert.equal(stagingThreat(s), 8);
  forOwner(s, 0, () => (s.deck = ["01013", "01013", "01013", ...tail]));
  forOwner(s, 1, () => (s.deck = ["01016", "01016", "01016", ...tail]));
  revealed(s, D.terror);
  s = finish(s);
  assert.equal(stagingThreat(s), 10);
  s = reload(s);
  assert.equal(stagingThreat(s), 10);
  s.phase = "refresh";
  s = applyAction(reload(s), { type: "NEXT" });
  s = finish(s);
  assert.equal(stagingThreat(s), 0);
});
test("Heavy Curse attaches to the selected physical side quest and increases play cost only for matching owner discard titles", () => {
  let s = base(2);
  const q = side(s, D.power);
  s = selected(s, q);
  s.encounterDeck = [D.square];
  s.discard = ["01013"];
  revealed(s, D.curse);
  s = finish(s);
  assert.equal(currentQuestUnit(s)!.id, q.id);
  assert.ok(get(s, q.id)!.attachments.some((a) => a.code === D.curse));
  s.phase = "planning";
  const a = make(s, "01013");
  s.hand = [a];
  const resources = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = applyAction(reload(s), { type: "PLAY", id: a.id });
  s = finish(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    resources - 3,
  );
  let other!: Unit;
  forOwner(s, 1, () => {
    other = make(s, "01013");
    s.hand = [other];
    s.heroes[0] = make(s, "01001");
    s.heroes[0].resources = 10;
  });
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(s.phase, "planning");
  assert.equal(s.table!.turn, 1);
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = applyAction(reload(s), { type: "PLAY", id: other.id });
  s = finish(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
});
test("Heavy Curse copies on main and side quests stack, and a defeated side discards its Condition", () => {
  let s = base();
  s.encounterDeck = [D.square, D.square, D.square];
  revealed(s, D.curse);
  s = finish(s);
  const q = side(s, D.power);
  s = selected(s, q);
  revealed(s, D.curse);
  s = finish(s);
  s.phase = "planning";
  s.discard = ["01013"];
  const a = make(s, "01013");
  s.hand = [a];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = applyAction(reload(s), { type: "PLAY", id: a.id });
  s = finish(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 4,
  );
  s = committed(s, get(s, q.id)!);
  s = applyAction(reload(s), { type: "NEXT" });
  s = finish(s);
  assert.ok(s.victoryCards!.includes(D.power));
  assert.ok(s.encounterDiscard.includes(D.curse));
  assert.equal(
    s.questAttachments![D.shades].filter((a) => a.code === D.curse).length,
    1,
  );
});

test("a revealed Sorcery heals Thaurdir before his fresh immediate attack on the current first player", () => {
  let s = second(base(2));
  s.table!.first = 1;
  const t = thaurdir(s);
  t.damage = 5;
  t.shadows = [D.cursed];
  t.attacked = true;
  forOwner(s, 1, () => (s.heroes[0].tempDefense = 20));
  s.encounterDeck = [D.square, D.tombs];
  revealed(s, D.fog);
  flush(s);
  assert.equal(thaurdir(s).damage, 2);
  assert.equal(s.combat!.attackPlayer, 1);
  assert.deepEqual(thaurdir(s).shadows, [D.square]);
  s = choose(reload(s), seatView(s, 1).heroes[0].id);
  s = finish(s);
  assert.equal(s.combat, null);
  assert.deepEqual(thaurdir(s).shadows, [D.cursed]);
  assert.equal(thaurdir(s).attacked, true);
  assert.equal(seatView(s, 0).heroes[0].damage, 0);
  assert.equal(seatView(s, 1).heroes[0].damage, 0);
});

for (const cancel of ["01050", "01008"])
  test(`FAQ1.53: ${card(cancel).name} cancels Dark Sorcery's WR, while Doomed2 and Thaurdir's reveal Forced still resolve`, () => {
    let s = second(base());
    const h = make(s, "01008");
    h.resources = 10;
    h.tempDefense = 20;
    s.heroes[2] = h;
    if (cancel === "01050") s.hand = [make(s, cancel)];
    const a = ally(s);
    s.discard = [a.code];
    thaurdir(s).damage = 5;
    s.encounterDeck = [D.square, D.square, D.square];
    revealed(s, D.sorcery);
    flush(s);
    const c = s.choice!.options.find((o) => o.code === cancel)!;
    assert.ok(c, JSON.stringify(s.choice));
    s = choose(reload(s), c.id);
    assert.ok(get(s, a.id), "cancelled WR cannot discard the ally");
    assert.equal(s.threat, 22, "Doomed is not part of WR cancellation");
    assert.equal(thaurdir(s).damage, 2);
    assert.equal(s.combat!.enemyId, thaurdir(s).id);
    s.heroes[0].tempDefense = 20;
    s = choose(reload(s), s.heroes[0].id);
    s = finish(s);
    assert.ok(get(s, a.id));
  });

test("a Sorcery shadow never heals Thaurdir or creates a second immediate attack", () => {
  let s = second(base());
  const t = thaurdir(s);
  t.damage = 7;
  const e = enemy(s, "01096");
  const h = s.heroes[0];
  h.tempDefense = 20;
  s = finish(defend(s, e, h, [D.sorcery]));
  assert.equal(thaurdir(s).damage, 7);
  assert.equal(s.combat, null);
  assert.equal(s.encounterDeck.length, 30);
});

for (const take of ["discard", "return"])
  test(`Thaurdir's real attack destroys an ally, then its controller may ${take === "discard" ? "mill three" : "return the same damaged boss"}`, () => {
    let s = second(base(2));
    const t = thaurdir(s);
    s.staging = [];
    forOwner(s, 1, () => s.engaged.push(t));
    t.damage = 4;
    const a = ally(s, "01016", 1);
    s = applyAction(reload(s), { type: "SELECT_SEAT", seat: 1 });
    s.table!.turn = 1;
    s = defend(s, t, get(s, a.id)!, [D.square]);
    assert.match(s.choice!.title, /Fell Wraith/);
    assert.deepEqual(
      s.choice!.options.map((o) => o.id),
      ["discard", "return"],
    );
    s = choose(reload(s), take);
    s = finish(s);
    assert.equal(get(s, a.id), undefined);
    assert.equal(thaurdir(s).damage, 4);
    assert.equal(seatView(s, 0).deck.length, 30);
    assert.equal(seatView(s, 1).deck.length, take === "discard" ? 27 : 30);
    assert.equal(
      s.staging.some((u) => u.id === t.id),
      take === "return",
    );
    assert.deepEqual(thaurdir(s).shadows, take === "return" ? [] : [D.square]);
  });

test("an engaged Thaurdir must return when its victim's deck cannot pay three cards in full", () => {
  let s = second(base());
  const t = thaurdir(s);
  s.staging = [];
  s.engaged.push(t);
  s.deck = ["01057", "01057"];
  const a = ally(s);
  s = defend(s, t, a);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["return"],
  );
  s = choose(reload(s), "return");
  assert.equal(s.deck.length, 2);
  assert.ok(s.staging.some((u) => u.id === t.id));
});

test("an immediate staging attack cannot choose an already-staged Thaurdir return when three cards are available", () => {
  let s = second(base());
  const a = ally(s);
  s.encounterDeck = [D.square, D.square];
  revealed(s, D.fog);
  flush(s);
  s = choose(reload(s), a.id);
  assert.match(s.choice!.title, /Fell Wraith/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["discard"],
  );
  s = choose(reload(s), "discard");
  s = finish(s);
  assert.equal(s.deck.length, 27);
});

test("FAQ2.51: Dark Sorcery's direct defender discard does not count as Thaurdir destroying a character by attack strength", () => {
  let s = second(base());
  const t = thaurdir(s);
  s.staging = [];
  s.engaged.push(t);
  const a = ally(s);
  s.discard = [a.code];
  s.heroes[0].attachments.push({
    id: `a${s.nextId++}`,
    code: "01040",
    exhausted: false,
  });
  s = defend(s, t, a, [D.sorcery]);
  if (s.choice) s = choose(reload(s), s.heroes[0].id);
  s = finish(s);
  assert.equal(get(s, a.id), undefined);
  assert.equal(s.heroes[0].damage, 6);
  assert.equal(s.deck.length, 30);
  assert.equal(
    s.staging.some((u) => u.id === t.id),
    false,
  );
});

for (const matched of [false, true])
  test(`Cursed Dead shadow grants ${matched ? 2 : 1} attack using the defender's owner's discard`, () => {
    let s = base(2);
    const e = enemy(s, "01096");
    const h = s.heroes[0];
    s.discard = matched ? [h.code] : [];
    forOwner(s, 1, () => (s.discard = [h.code]));
    s = finish(defend(s, e, h, [D.cursed]));
    assert.equal(
      get(s, h.id)!.damage,
      card(e.code).attack! + (matched ? 2 : 1) - card(h.code).defense!,
    );
  });

test("Restless Evil shadow strengthens only defending player's currently engaged Undead for this round", () => {
  let s = base(2);
  const e = enemy(s, D.cursed),
    local = enemy(s, D.lord),
    remote = enemy(s, D.cursed, 1),
    stage = staged(s, D.cursed),
    ordinary = enemy(s, "01096");
  s.heroes[0].tempDefense = 20;
  s = finish(defend(s, e, s.heroes[0], [D.restless]));
  for (const u of [e, local]) {
    assert.equal(stats(s, get(s, u.id)!).attack, card(u.code).attack! + 1);
    assert.equal(stats(s, get(s, u.id)!).defense, card(u.code).defense! + 1);
  }
  for (const u of [remote, stage, ordinary])
    assert.equal(stats(s, get(s, u.id)!).attack, card(u.code).attack!);
  s.phase = "refresh";
  s = finish(applyAction(reload(s), { type: "NEXT" }));
  assert.equal(stats(s, get(s, local.id)!).attack, card(local.code).attack!);
  assert.equal(stats(s, get(s, local.id)!).defense, card(local.code).defense!);
});

for (const top of ["01013", "01051"])
  test(`Haunted Keep shadow mills one physical card and adds its printed ${card(top).cost} cost`, () => {
    let s = base();
    const e = enemy(s, "01096"),
      h = s.heroes[0];
    s.deck = [top, ...s.deck];
    s = finish(defend(s, e, h, [D.keep]));
    assert.deepEqual(s.discard, [top]);
    assert.equal(
      get(s, h.id)!.damage,
      card(e.code).attack! + (top === "01013" ? 2 : 0) - card(h.code).defense!,
    );
  });

test("Terror shadow mills three only from attacked seat and adds the union of discarded types to this attack", () => {
  let s = base(2);
  const e = enemy(s, "01096", 1);
  forOwner(s, 1, () => {
    s.deck = ["01013", "01050", "01026", ...s.deck];
  });
  s = applyAction(reload(s), { type: "SELECT_SEAT", seat: 1 });
  s.table!.turn = 1;
  const h = s.heroes[0];
  h.tempDefense = 1;
  s = finish(defend(s, e, h, [D.terror]));
  assert.equal(seatView(s, 0).discard.length, 0);
  assert.deepEqual(seatView(s, 1).discard, ["01013", "01050", "01026"]);
  assert.equal(
    get(s, h.id)!.damage,
    Math.max(0, card(e.code).attack! + 3 - (card(h.code).defense! + 1)),
  );
  assert.equal(
    s.deadmensDike!.terrorThreat,
    0,
    "shadow is not the staging-threat WR",
  );
});

for (const killed of [false, true])
  test(`Dead Lord shadow reveals a card only if its attack ${killed ? "destroys" : "does not destroy"} a character`, () => {
    let s = base();
    const e = enemy(s, "01096"),
      d = killed ? ally(s) : s.heroes[0];
    if (!killed) d.tempDefense = 20;
    s.encounterDeck = [D.square, D.square];
    s = finish(defend(s, e, d, [D.lord]));
    assert.equal(
      s.staging.filter((u) => u.code === D.square).length,
      killed ? 1 : 0,
    );
    assert.equal(s.encounterDeck.length, killed ? 1 : 2);
  });

test("Deadmen's Gate shadow discards a selected physical player attachment without charging its Forced Action trigger", () => {
  let s = base(2);
  const e = enemy(s, "01096"),
    h = s.heroes[0];
  h.tempDefense = 20;
  const a = { id: `a${s.nextId++}`, code: "01057", exhausted: false, owner: 0 };
  h.attachments.push(a);
  forOwner(s, 1, () =>
    s.heroes[0].attachments.push({
      id: `a${s.nextId++}`,
      code: "01057",
      exhausted: false,
      owner: 1,
    }),
  );
  s = defend(s, e, h, [D.gate]);
  assert.ok(s.choice);
  assert.ok(s.choice!.options.some((o) => o.id === a.id));
  s = choose(reload(s), a.id);
  s = finish(s);
  assert.deepEqual(get(s, h.id)!.attachments, []);
  assert.equal(seatView(s, 1).heroes[0].attachments.length, 1);
  assert.equal(s.deck.length, 30);
});

test("Baleful Shade shadow exhausts a ready character controlled by the defending player only", () => {
  let s = base(2);
  const e = enemy(s, "01096"),
    h = s.heroes[0],
    a = ally(s);
  h.tempDefense = 20;
  s = defend(s, e, h, [D.shade]);
  assert.ok(
    !s.choice!.options.some((o) => o.id === h.id),
    "defender already exhausted",
  );
  for (const remote of seatView(s, 1).heroes)
    assert.ok(!s.choice!.options.some((o) => o.id === remote.id));
  s = choose(reload(s), a.id);
  s = finish(s);
  assert.equal(get(s, a.id)!.exhausted, true);
  assert.equal(seatView(s, 1).heroes[0].exhausted, false);
});

test("The Witch-realm counts each player's engaged Undead separately while the main refresh discard still resolves", () => {
  let s = base(2);
  const q = side(s, D.world);
  enemy(s, D.cursed, 0);
  enemy(s, "01096", 0);
  enemy(s, D.cursed, 1);
  enemy(s, D.shade, 1);
  s = selected(s, q);
  s.phase = "refresh";
  s = applyAction(reload(s), { type: "NEXT" });
  assert.match(s.choice!.title, /Forced effect/);
  assert.equal(
    s.choice!.options.length,
    2,
    "first player orders simultaneous main and side effects",
  );
  s = finish(s);
  assert.equal(seatView(s, 0).discard.length, 2);
  assert.equal(seatView(s, 1).discard.length, 3);
  assert.ok(get(s, q.id));
});

test("Seal the Tomb discards three encounter cards without revealing them, then returns the new topmost Undead", () => {
  let s = base();
  const q = side(s, D.seal);
  s.encounterDiscard = [D.cursed];
  s.encounterDeck = [D.lord, D.sorcery, "01096", D.square];
  s.phase = "refresh";
  s = finish(applyAction(reload(s), { type: "NEXT" }));
  assert.ok(s.staging.some((u) => u.code === D.lord));
  assert.deepEqual(s.encounterDiscard, [D.cursed, D.sorcery, "01096"]);
  assert.deepEqual(s.encounterDeck, [D.square]);
  assert.equal(s.deadmensDike!.undeadRevealRound, -1);
  assert.equal(s.threat, 20, "discarded Sorcery has no Doomed");
  assert.ok(get(s, q.id));
  assert.equal(
    allEngaged(s).length,
    0,
    "returning Dead Lord to staging does not trigger engagement Forced",
  );
});

for (const code of [D.world, D.seal, D.power])
  test(`${card(code).name} is a physical ${code === D.world ? 5 : code === D.power ? 8 : 6}-progress side quest with Victory10, optional Iârion and Surge`, () => {
    let s = base(2);
    s.encounterDeck = [D.square, D.square, D.square];
    const i = s.allies.find((u) => u.code === D.iarion)!;
    i.exhausted = true;
    revealed(s, code);
    flush(s);
    assert.match(s.choice!.title, /Iârion/);
    const ready = s.choice!.options.find((o) => o.id === "ready")!;
    assert.ok(ready);
    s = choose(reload(s), ready.id);
    s = finish(s);
    assert.equal(get(s, i.id)!.exhausted, false);
    assert.equal(s.staging.filter((u) => u.code === D.square).length, 1);
    const q = s.staging.find((u) => u.code === code)!;
    assert.equal(
      card(code).quest,
      code === D.world ? 5 : code === D.power ? 8 : 6,
    );
    s.progress = 4;
    for (const p of playerOrder(s))
      forOwner(
        s,
        p,
        () =>
          (s.discard = ["01013", "01016", "01050", "01026", "01057", "01049"]),
      );
    s = selected(s, q);
    s = committed(s, get(s, q.id)!);
    s = finish(applyAction(reload(s), { type: "NEXT" }));
    assert.equal(get(s, q.id), undefined);
    assert.equal(s.progress, 4);
    assert.ok(s.victoryCards!.includes(code));
    assert.equal(s.victory, 10);
    for (const p of playerOrder(s)) {
      assert.equal(seatView(s, p).deck.length, code === D.power ? 35 : 30);
      assert.equal(seatView(s, p).discard.length, code === D.power ? 1 : 6);
    }
    assert.ok(validateSave(s));
  });

test("Iârion's encounter side-quest Response can be declined without readying him", () => {
  let s = base();
  const i = s.allies.find((u) => u.code === D.iarion)!;
  i.exhausted = true;
  s.encounterDeck = [D.square, D.square];
  revealed(s, D.world);
  flush(s);
  assert.match(s.choice!.title, /Iârion/);
  s = choose(reload(s), "skip");
  s = finish(s);
  assert.equal(get(s, i.id)!.exhausted, true);
});

test("Caleb3.296: a discarded Miner's Response resolves before the next Damned discard, including its Gate trigger", () => {
  let s = base();
  const square = staged(s, D.square);
  s.activeLocation = make(s, D.gate);
  s.deck = ["12066", "01038", "01050", ...s.deck];
  engage(s, enemy(s, D.damned));
  flush(s);
  assert.match(s.choice!.title, /Miner/);
  assert.deepEqual(
    s.discard,
    ["12066"],
    "second instructed discard waits for first card's Response",
  );
  const enter = s.choice!.options.find((o) => o.id !== "skip")!;
  s = choose(reload(s), enter.id);
  assert.match(s.choice!.title, /Assign 4 remaining damage/);
  assert.deepEqual(
    s.discard,
    ["01038", "01050"],
    "Gate discards the zero-cost middle card, not the final instructed card",
  );
  assert.equal(
    get(s, square.id)!.resources,
    2,
    "nested Gate and original Damned are two discard instructions",
  );
  const miner = s.allies.find((u) => u.code === "12066")!;
  assert.ok(
    s.choice!.options.some((o) => o.id === `${miner.id}:2`),
    "new ally is a legal damage allocation target",
  );
  s = choose(reload(s), `${s.heroes[0].id}:4`);
  s = finish(s);
  assert.equal(s.heroes[0].damage, 4);
});

test("Power blocks a discarded Miner from entering play, but not a Hidden Cache resource Response", () => {
  let s = base();
  side(s, D.power);
  s.activeLocation = make(s, D.gate);
  s.deck = ["12066", "06143", "01038", ...s.deck];
  const resources = s.heroes[0].resources;
  engage(s, enemy(s, D.damned));
  flush(s);
  assert.match(s.choice!.title, /Hidden Cache/);
  assert.ok(!s.allies.some((u) => u.code === "12066"));
  s = choose(reload(s), s.heroes[0].id);
  assert.equal(s.heroes[0].resources, resources + 2);
  assert.match(s.choice!.title, /Assign 3 remaining damage/);
  assert.deepEqual(s.discard, ["12066", "06143", "01038"]);
  s = choose(reload(s), `${s.heroes[0].id}:3`);
  s = finish(s);
  assert.equal(s.heroes[0].damage, 3);
});

test("discarding the final Hidden Cache eliminates before its optional resource Response can replenish anything", () => {
  let s = base();
  s.deck = ["06143"];
  const resources = s.heroes[0].resources;
  s.phase = "refresh";
  s = finish(applyAction(reload(s), { type: "NEXT" }));
  assert.equal(s.status, "lost");
  assert.equal(s.choice, null);
  assert.equal(s.heroes[0].resources, resources);
});

for (const ownerHasCopy of [false, true])
  test(`a real Message from Elrond borrowed card is taxed by its owner's ${ownerHasCopy ? "matching" : "empty"} discard, not the borrower's`, () => {
    let s = base(2);
    s.questAttachments = {
      [D.shades]: [{ id: `a${s.nextId++}`, code: D.curse, exhausted: false }],
    };
    s.discard = ownerHasCopy ? ["01013"] : [];
    forOwner(s, 1, () => {
      s.discard = ownerHasCopy ? [] : ["01013"];
      s.heroes[0] = make(s, "01001");
      s.heroes[0].resources = 2;
      s.heroes[1].resources = 0;
      s.heroes[2].resources = 0;
    });
    const passed = make(s, "01013"),
      message = make(s, "08032");
    s.hand = [passed, message];
    s.heroes[2] = make(s, "01012");
    s.heroes[2].resources = 10;
    s = applyAction(reload(s), { type: "PLAY", id: message.id });
    s = choose(reload(s), "player-0");
    s = choose(reload(s), passed.id);
    s = choose(reload(s), "player-1");
    s = finish(s);
    s = applyAction(reload(s), { type: "NEXT" });
    assert.equal(s.table!.turn, 1);
    const borrowed = s.hand.find((u) => u.id === passed.id)!;
    assert.equal(borrowed.owner, 0);
    assert.equal(
      canPlay(s, borrowed) === null,
      !ownerHasCopy,
      "preflight sees the same ownership surcharge as actual payment",
    );
    s.heroes[0].resources = 10;
    const before = s.heroes[0].resources;
    s = finish(applyAction(reload(s), { type: "PLAY", id: borrowed.id }));
    assert.equal(s.heroes[0].resources, before - (ownerHasCopy ? 3 : 2));
    assert.equal(get(s, borrowed.id)!.owner, 0);
  });

test("Heavy Curse taxes a sole physical event replayed from discard even though that copy leaves discard during initiation", () => {
  let s = base();
  s.questAttachments = {
    [D.shades]: [{ id: `a${s.nextId++}`, code: D.curse, exhausted: false }],
  };
  s.heroes[2] = make(s, "01009");
  s.heroes[2].resources = 10;
  const h = s.heroes[2],
    map = { id: `a${s.nextId++}`, code: "06087", exhausted: false };
  h.attachments.push(map);
  s.discard = ["01046"];
  s.threat = 30;
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: h.id,
    attachmentId: map.id,
  });
  s = choose(reload(s), "discard-0");
  assert.match(s.choice!.title, /Pay event cost/);
  assert.ok(
    s.choice!.options.some((o) => /4 from/.test(o.label)),
    "three printed resources plus Heavy Curse while this event is still in discard",
  );
  s = choose(reload(s), "pay-0");
  s = finish(s);
  assert.equal(get(s, h.id)!.resources, 6);
  assert.equal(s.threat, 24);
  assert.ok(!s.discard.includes("01046"));
  assert.equal(s.deck.at(-1), "01046");
});

test("scenario save validation rejects impossible rounds, boss pools and Time counters while retaining serialized real decisions", () => {
  const s = base(4);
  const q = side(s, D.battlements);
  q.timeCounters = 4;
  assert.ok(validateSave(reload(s)));
  for (const mutate of [
    (v: GameState) => {
      v.deadmensDike!.undeadRevealRound = v.round + 1;
    },
    (v: GameState) => {
      v.deadmensDike!.terrorRound = -2;
    },
    (v: GameState) => {
      v.deadmensDike!.terrorThreat = 1;
    },
    (v: GameState) => {
      v.deadmensDike!.setAside = [];
    },
    (v: GameState) => {
      v.deadmensDike!.setAside.push(make(v, D.thaurdir));
    },
    (v: GameState) => {
      get(v, q.id)!.timeCounters = 5;
    },
    (v: GameState) => {
      v.scenarioId = "weather-hills";
    },
  ]) {
    const invalid = structuredClone(reload(s));
    mutate(invalid);
    assert.equal(validateSave(invalid), false);
  }
});
