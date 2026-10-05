import test from "node:test";
import assert from "node:assert/strict";
import { applyAction as act } from "./pass-resource-window.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playTargets,
  restoreSave,
  stats,
  validateSave,
} from "../src/game/engine.ts";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import {
  advanceQuest,
  check,
  damage,
  discardAttachment,
  engage,
  nextRound,
  phaseEnd,
  progressLocation,
  resolveReveal,
  shadow,
} from "../src/game/board.ts";
import {
  draw,
  fx,
  get,
  make,
  putPlayerDeck,
  questWill,
  shuffle,
  stagingThreat,
  takePlayerDeck,
  has,
} from "../src/game/core.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  attackersFor,
  defendersFor,
  globalCharacters,
  globalEachSeat,
  globalPlayerOrder,
  hasKeyword,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
  forOwner,
} from "../src/game/table.ts";
import {
  FOUNDATIONS_STONE as F,
  FOUNDATIONS_STONE_ENCOUNTERS,
  FOUNDATIONS_STONE_QUESTS,
  FOUNDATIONS_STAGE_FOUR,
  foundationsArea,
  foundationsAllAreaUnits,
  foundationsAreaView,
  foundationsSyncArea,
  foundationsSelectArea,
  foundationsRecipe,
  foundationsState,
  foundationsAbilityProblem,
  foundationsEnemyX,
} from "../src/game/foundations-stone.ts";
import { KHAZAD as K } from "../src/game/khazad-dum.ts";
import { currentQuestCode } from "../src/game/quest-state.ts";
import type { GameState, Unit } from "../src/game/types.ts";

const leader = STARTERS.find((d) => d.id === "leadership")!;
let serial = 7_800_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `foundations-test-${serial++}`,
  code,
  owner,
  exhausted: false,
  damage: 0,
  progress: 0,
  resources: 0,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
function start(players = 1, easy = false, seed = 777) {
  return createGame(seed, leader.cards, leader.heroes, leader.id, {
    scenarioId: "foundations-of-stone",
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
}
function choose(s: GameState, id: string): GameState {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function settle(s: GameState): GameState {
  for (let n = 0; n < 150 && s.status === "playing"; n++) {
    if (s.flow?.pending)
      s = act(s, { type: "CONTINUE", stepId: s.flow.pending.id });
    else if (s.choice)
      s = choose(
        s,
        s.choice.options.find((o) =>
          ["skip", "resolve", "done", "discard"].includes(o.id),
        )?.id ?? s.choice.options[0].id,
      );
    else if (s.phase === "setup") s = act(s, { type: "KEEP" });
    else return s;
  }
  assert.equal(s.status, "playing");
  assert.ok(!s.choice);
  return s;
}
function game(players = 1) {
  const s = settle(start(players));
  Object.assign(s, {
    phase: "planning",
    choice: null,
    queue: [],
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    stage: 1,
    progress: 0,
    encounterDeck: Array(40).fill(F.bats),
    encounterDiscard: [],
    stageRevealing: false,
  });
  globalEachSeat(s, () => {
    s.hand = [];
    s.allies = [];
    s.engaged = [];
    s.used = [];
    s.threat = 20;
    s.deck = Array(20).fill("01030");
    s.discard = [];
    s.heroes.forEach((h) =>
      Object.assign(h, {
        resources: 10,
        exhausted: false,
        damage: 0,
        committed: false,
        attachments: [],
      }),
    );
  });
  selectSeat(s, 0);
  return s;
}
function split(s: GameState, quests = [F.lair, F.rocks, F.caves, F.bank]) {
  const d = foundationsState(s)!;
  d.areas = globalPlayerOrder(s).map((p, i) => ({
    id: `area-${p}`,
    players: [p],
    questCode: quests[i],
    progress: 0,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    questDebuff: 0,
    fog: 0,
    threatModifier: 0,
  }));
  d.split = true;
  d.setAside = [];
  d.activeArea = undefined;
  d.resolvedAreas = [];
  d.travelPassedAreas = [];
  s.stage = 4;
  s.stageRevealing = false;
  foundationsSelectArea(s, s.table?.active ?? 0);
  return s;
}
function save(s: GameState) {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(
    validateSave(raw),
    "Every scenario zone and pending choice must serialize.",
  );
  return restoreSave(raw)!;
}
function effect(s: GameState, kind: string, data = {}) {
  s.queue.push(fx(kind, data));
  flush(s);
  return s;
}

test("Original/easy setup uses the exact two printed encounter pools and eight quest definitions", () => {
  assert.equal(FOUNDATIONS_STONE_ENCOUNTERS.length, 9);
  assert.equal(FOUNDATIONS_STONE_QUESTS.length, 8);
  for (const c of [
    ...FOUNDATIONS_STONE_ENCOUNTERS,
    ...FOUNDATIONS_STONE_QUESTS,
  ])
    assert.ok(SCRIPTED.has(c.code), c.name);
  assert.equal(foundationsRecipe().initial.length, 41);
  assert.equal(foundationsRecipe().setAside.length, 24);
  assert.equal(foundationsRecipe(true).initial.length, 28);
  assert.equal(foundationsRecipe(true).setAside.length, 18);
  for (const easy of [false, true]) {
    const s = start(2, easy);
    assert.match(s.choice?.title ?? "", /Cave Torch/);
    assert.equal(s.encounterDeck.length, easy ? 28 : 41);
    assert.equal(foundationsState(s)!.setAside.length, easy ? 18 : 24);
    assert.ok(
      !s.encounterDeck.some((c) =>
        FOUNDATIONS_STONE_ENCOUNTERS.some((e) => e.code === c),
      ),
    );
    assert.equal(s.encounterDeck.includes(K.pitfall), !easy);
    assert.ok(!s.encounterDeck.includes(K.caveTroll));
  }
});
test("Setup Cave Torch chooses any hero, retains controller, and is removed when leaving play", () => {
  let s = start(2),
    hero = seatView(s, 1).heroes[0];
  s = choose(s, hero.id);
  s = settle(s);
  hero = get(s, hero.id)!;
  const torch = hero.attachments.find((a) => a.code === K.torch)!;
  assert.ok(torch);
  discardAttachment(s, hero, torch, true);
  assert.ok(!hero.attachments.some((a) => a.code === K.torch));
  assert.ok(
    globalPlayerOrder(s).some((p) => seatView(s, p).removed.includes(K.torch)),
  );
});
test("Water's Edge discards only the committing player's actual top two, once per actual commit", () => {
  let s = game(2);
  s.stage = 2;
  s.phase = "quest";
  s.deck = ["04104", "01030", "01031"];
  const other = [...seatView(s, 1).deck],
    hero = s.heroes[0];
  s.committedIds = [hero.id];
  s = act(s, { type: "COMMIT" });
  s = settle(s);
  assert.deepEqual(seatView(s, 0).deck, ["01031"]);
  assert.deepEqual(seatView(s, 0).discard.slice(0, 2), ["04104", "01030"]);
  assert.deepEqual(seatView(s, 1).deck, other);
  assert.equal(s.table?.turn, 1);
});
test("Washed Away removes printed Items and all old encounter cards, rebuilds deck, assigns distinct stage fours", () => {
  let s = game(4);
  s.stage = 3;
  s.stageRevealing = true;
  const hero = s.heroes[0],
    plate = { id: "washed-plate", code: "01040", exhausted: false, owner: 0 },
    trap = { id: "washed-trap", code: "05017", exhausted: false, owner: 0 };
  hero.attachments = [plate, trap];
  s.staging = [unit(K.scout), unit(K.branching)];
  s.activeLocation = unit(K.well);
  seatView(s, 1).engaged.push(unit(K.swordsman, 1));
  const oldIds = [
    ...s.staging,
    s.activeLocation!,
    ...seatView(s, 1).engaged,
  ].map((u) => u.id);
  s.encounterDeck = [K.branching, K.scout];
  s.encounterDiscard = [K.dreadful, K.gap];
  const pool = [...foundationsState(s)!.setAside];
  s = effect(s, "foundationsWashedAway", { player: 0 });
  s = settle(s);
  assert.equal(s.stage, 4);
  assert.ok(foundationsState(s)!.split);
  assert.equal(
    new Set(foundationsState(s)!.areas.map((a) => a.questCode)).size,
    4,
  );
  assert.deepEqual(
    [...foundationsState(s)!.areas.map((a) => a.questCode)].sort(),
    [...FOUNDATIONS_STAGE_FOUR].sort(),
  );
  assert.ok(seatView(s, 0).discard.includes("01040"));
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.code === "05017"));
  assert.equal(seatView(s, 1).engaged.length, 0);
  assert.ok(!foundationsAllAreaUnits(s).some((u) => oldIds.includes(u.id)));
  assert.ok(foundationsState(s)!.removedEncounter.includes(K.gap));
  assert.equal(foundationsState(s)!.setAside.length, 0);
  assert.ok(pool.length === 24);
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});
test("Each printed stage-four entry has its exact reveal, hand-discard or resource-discard instruction", () => {
  for (const q of FOUNDATIONS_STAGE_FOUR) {
    let s = split(game(), [q]);
    s.hand = [unit("01030"), unit("01031")];
    s.encounterDeck = Array(10).fill(F.bats);
    const resources = s.heroes.map((h) => h.resources);
    s = effect(s, "foundationsStageFourEntry");
    assert.equal(
      s.staging.length,
      q === F.lair
        ? 4
        : [F.rocks, F.bank].includes(q as typeof F.rocks)
          ? 2
          : 0,
    );
    assert.equal(s.hand.length, q === F.bank ? 0 : 2);
    assert.deepEqual(
      s.heroes.map((h) => h.resources),
      q === F.caves ? [0, 0, 0] : resources,
    );
  }
});
test("Private staging projections retain separate progress, active locations and replacement arrays after save", () => {
  let s = split(game(2));
  s.staging = [unit(F.nameless)];
  s.activeLocation = unit(F.treasury);
  s.progress = 3;
  s.questDebuff = 2;
  syncSeat(s);
  const original = s.staging[0];
  selectSeat(s, 1);
  assert.equal(s.staging.length, 0);
  assert.equal(s.progress, 0);
  s.staging = [unit(F.bats, 1)];
  s.progress = 4;
  syncSeat(s);
  s = save(s);
  selectSeat(s, 0);
  assert.equal(s.staging[0].id, original.id);
  assert.equal(s.progress, 3);
  assert.equal(s.activeLocation?.code, F.treasury);
  const view = {
    ...s,
    ...foundationsAreaView(s, 1),
    table: { ...s.table!, active: 1 },
  };
  foundationsSyncArea(view);
  assert.equal(foundationsArea(s, 0)!.progress, 3);
  assert.equal(foundationsAllAreaUnits(s).length, 3);
});
test("Separated players cannot target attachments/healing/events across areas, while unique titles remain global", () => {
  let s = split(game(2));
  const ally = unit("01073", 1);
  seatView(s, 1).allies.push(ally);
  seatView(s, 1).heroes[0].damage = 1;
  assert.equal(playerOrder(s).length, 1);
  assert.equal(globalPlayerOrder(s).length, 2);
  assert.ok(
    !playTargets(s, unit("01040")).some(
      (u) => u.id === seatView(s, 1).heroes[0].id,
    ),
  );
  s.hand = [unit("01073")];
  assert.match(canPlay(s, s.hand[0]) ?? "", /unique/i);
  const heal = unit("01060");
  s.hand = [heal];
  assert.ok(
    !playTargets(s, heal).some((u) => u.id === seatView(s, 1).heroes[0].id),
  );
});
test("Each separate area stages exactly its own player count and quest failures affect only that group", () => {
  let s = split(game(2));
  s.phase = "quest";
  s.encounterDeck = Array(8).fill(F.bats);
  s = act(s, { type: "COMMIT" });
  s = act(s, { type: "COMMIT" });
  assert.equal(s.phase, "staging");
  assert.equal(foundationsArea(s, 0)!.staging.length, 1);
  assert.equal(foundationsArea(s, 1)!.staging.length, 1);
  const t0 = seatView(s, 0).threat,
    t1 = seatView(s, 1).threat;
  s = act(s, { type: "NEXT" });
  assert.equal(seatView(s, 0).threat, t0 + 1);
  assert.equal(seatView(s, 1).threat, t1);
  assert.equal(s.table?.active, 1);
  s = act(save(s), { type: "NEXT" });
  assert.equal(seatView(s, 1).threat, t1 + 1);
  assert.equal(s.phase, "travel");
});
test("Success progress is independent and completing a stage-four quest waits until the travel boundary", () => {
  let s = split(game(2));
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.heroes[0].tempWill = 10;
  s = act(s, { type: "NEXT" });
  assert.ok(foundationsArea(s, 0)!.completed);
  assert.equal(foundationsState(s)!.areas.length, 2);
  assert.equal(s.stage, 4);
  assert.equal(s.phase, "staging");
  s = act(s, { type: "NEXT" });
  assert.match(s.choice?.title ?? "", /Join another/);
});
test("Joining carries staging cards, preserves engaged enemies, discards old active location and adopts target progress", () => {
  let s = split(game(2));
  s.phase = "travel";
  const d = foundationsState(s)!,
    from = d.areas[0],
    to = d.areas[1];
  from.completed = true;
  from.progress = 5;
  from.staging = [unit(F.bats)];
  from.activeLocation = unit(F.treasury);
  to.progress = 4;
  to.staging = [unit(F.nameless, 1)];
  const enemy = unit(F.bats);
  s.engaged = [enemy];
  foundationsSelectArea(s, 0);
  s = effect(s, "startTravel", { player: 0 });
  s = choose(save(s), to.id);
  assert.equal(foundationsState(s)!.areas.length, 1);
  assert.equal(s.stage, 4);
  assert.equal(s.progress, 4);
  assert.equal(s.staging.length, 2);
  assert.equal(seatView(s, 0).engaged[0].id, enemy.id);
  assert.ok(s.encounterDiscard.includes(F.treasury));
  assert.equal(s.activeLocation, null);
  assert.deepEqual(playerOrder(s), [0, 1]);
});
test("Simultaneous completed areas join in first-player order and one remaining completed area moves everyone to stage five", () => {
  let s = split(game(2));
  s.table!.first = 1;
  for (const a of foundationsState(s)!.areas) {
    a.completed = true;
    a.progress = card(a.questCode).quest!;
  }
  foundationsSelectArea(s, 0);
  s.encounterDeck = Array(10).fill(F.bats);
  s = effect(s, "startTravel", { player: 1 });
  assert.equal(s.table?.active, 1);
  s = choose(s, "area-0");
  assert.equal(s.stage, 5);
  assert.ok(!foundationsState(s)!.split);
  assert.equal(s.staging.length, 2);
  assert.equal(s.phase, "travel");
  assert.equal(currentQuestCode(s), F.depths);
});
test("Travel passes are per common area and only its first player may travel or resolve the quest", () => {
  let s = split(game(2));
  s.phase = "travel";
  s = act(s, { type: "NEXT" });
  assert.equal(s.table?.active, 1);
  assert.equal(s.phase, "travel");
  s = act(s, { type: "NEXT" });
  assert.equal(s.phase, "encounter");
  s = split(game(2));
  const d = foundationsState(s)!;
  d.areas[0].players = [0, 1];
  d.areas.splice(1);
  foundationsSelectArea(s, 0);
  selectSeat(s, 1);
  s.phase = "staging";
  assert.throws(() => act(s, { type: "NEXT" }), /first player/);
});
test("Stage-five ally commitment cap uses each player's own simultaneously chosen heroes", () => {
  let s = game(2);
  s.stage = 5;
  s.phase = "quest";
  s.allies = [unit("01030"), unit("01031")];
  s.committedIds = s.allies.map((u) => u.id);
  assert.throws(
    () => act(s, { type: "COMMIT" }),
    /no more allies|Out of the Depths/,
  );
  s.committedIds = [s.heroes[0].id, s.allies[0].id];
  s = act(s, { type: "COMMIT" });
  s = settle(s);
  assert.equal(s.table?.turn, 1);
  selectSeat(s, 1);
  s.allies = [unit("01030", 1)];
  s.committedIds = [s.allies[0].id];
  assert.throws(
    () => act(s, { type: "COMMIT" }),
    /no more allies|Out of the Depths/,
  );
});
test("Drowned Treasury's quest-end passive discards each local player's chosen character before phase ends", () => {
  let s = split(game(2));
  s.phase = "staging";
  s.activeLocation = unit(F.treasury);
  s.allies = [unit("01030")];
  const victim = s.allies[0],
    other = [...seatView(s, 1).heroes];
  foundationsSyncArea(s);
  s = effect(s, "finishQuestPhase", { player: 0 });
  assert.match(s.choice?.title ?? "", /Drowned Treasury/);
  s = choose(save(s), victim.id);
  assert.ok(seatView(s, 0).discard.includes(victim.code));
  assert.deepEqual(seatView(s, 1).heroes, other);
  assert.equal(s.phase, "travel");
});
test("Explored Treasury offers optional draw or a free objective attachment, retaining restricted-slot choices", () => {
  let s = game();
  s.stage = 5;
  foundationsState(s)!.setAside = [];
  const treasury = unit(F.treasury),
    axe = unit(F.axe);
  s.activeLocation = treasury;
  s.staging = [axe];
  const hero = s.heroes[0];
  hero.exhausted = true;
  const hand = s.hand.length;
  progressLocation(s, treasury, 3);
  flush(s);
  assert.match(s.choice?.title ?? "", /Treasury/);
  s = choose(save(s), "claim");
  s = choose(s, axe.id);
  s = choose(s, hero.id);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.id === axe.id));
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(s.hand.length, hand);
  s = game();
  s.activeLocation = unit(F.treasury);
  progressLocation(s, s.activeLocation, 3);
  flush(s);
  s = choose(s, "draw");
  assert.equal(s.hand.length, 2);
});
test("Treasury's explored Response waits for quest overflow advancement and the next stage's When Revealed effects", () => {
  let s = game();
  // Explicit timing fixture: Treasury is normally in the post-flood pool.
  s.phase = "staging";
  s.stage = 2;
  s.progress = 11;
  s.activeLocation = unit(F.treasury);
  s.activeLocation.progress = 2;
  s.heroes[0].committed = true;
  s = act(s, { type: "NEXT" });
  for (
    let i = 0;
    i < 100 && s.choice && !/Drowned Treasury/.test(s.choice.title);
    i++
  )
    s = choose(
      s,
      s.choice.options.find((o) => ["skip", "resolve", "done"].includes(o.id))
        ?.id ?? s.choice.options[0].id,
    );
  assert.match(s.choice?.title ?? "", /Drowned Treasury/);
  assert.equal(s.stage, 4);
  assert.equal(s.stageRevealing, false);
  assert.equal(foundationsState(s)!.setAside.length, 0);
  assert.ok(foundationsState(s)!.split);
  assert.ok(
    !s.heroes.some((h) => h.attachments.some((a) => a.code === K.torch)),
  );
  save(s);
});
test("Durin's equipment claims cost a real exhaustion, grants exact Dwarf bonuses and respects Restricted", () => {
  let s = game();
  s.heroes[0].code = "01004";
  const hero = s.heroes[0],
    base = stats(s, hero);
  s.staging = [unit(F.axe), unit(F.helm)];
  const axe = s.staging[0];
  s = act(s, { type: "CLAIM", id: axe.id, heroId: hero.id });
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(stats(s, get(s, hero.id)!).attack, base.attack + 3);
  assert.equal(stats(s, get(s, hero.id)!).will, base.will + 1);
  get(s, hero.id)!.exhausted = false;
  const helm = s.staging[0];
  s = act(s, { type: "CLAIM", id: helm.id, heroId: hero.id });
  assert.equal(stats(s, get(s, hero.id)!).defense, base.defense + 1);
  assert.equal(stats(s, get(s, hero.id)!).health, base.health + 2);
  assert.ok(!hasKeyword(get(s, hero.id)!, "Restricted"));
});
test("Mithril Lode is a local Refresh Action, exhausts your character and bypasses the active buffer, once per physical copy", () => {
  let s = split(game(2));
  s.phase = "refresh";
  s.activeLocation = unit(F.mithril);
  const l = s.activeLocation,
    hero = s.heroes[0];
  hero.tempWill = 2;
  const will = stats(s, hero).will;
  assert.ok(availableAbilities(s, l).some((a) => !a.disabled));
  s = act(s, { type: "ABILITY", id: l.id });
  s = choose(save(s), hero.id);
  assert.equal(s.progress, will);
  assert.equal(s.activeLocation?.progress, 0);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.match(foundationsAbilityProblem(s, l) ?? "", /used/);
  assert.equal(foundationsArea(s, 1)!.progress, 0);
  const other = unit(F.mithril);
  s.extraActiveLocations = [other];
  assert.equal(foundationsAbilityProblem(s, other), undefined);
});
test("Nameless Things attach actual top two/three cards from the engaged player's own deck and use printed costs", () => {
  for (const code of [F.nameless, F.elder]) {
    const s = game(2);
    selectSeat(s, 1);
    s.deck = ["01073", "01030", "01031", "01032"];
    const e = unit(code, 1);
    s.staging = [e];
    assert.equal(foundationsEnemyX(s, e), code === F.nameless ? 3 : 4);
    engage(s, e);
    flush(s);
    assert.equal(e.attachments.length, code === F.nameless ? 2 : 3);
    assert.equal(e.attachments[0].code, "01073");
    assert.ok(e.attachments.every((a) => a.owner === 1));
    assert.equal(stats(s, e).attack, code === F.nameless ? 8 : 14);
    assert.equal(stats(s, e).health, code === F.nameless ? 8 : 14);
    assert.equal(seatView(s, 0).deck.length, 20);
    assert.ok(
      e.attachments.every((a) => !seatView(s, 1).discard.includes(a.code)),
    );
  }
});
test("Nameless cost X/null is zero, all attached printed costs count, and defeated attached player cards return to their owner", () => {
  let s = game(2),
    e = unit(F.nameless, 1);
  s.staging = [e];
  e.attachments = [
    { id: "cost-x", code: "01067", owner: 1, exhausted: false },
    { id: "cost-null", code: "01001", owner: 1, exhausted: false },
    { id: "printed-cost", code: "05017", owner: 0, exhausted: false },
  ];
  assert.equal(stats(s, e).health, 2);
  damage(s, e.id, 2);
  assert.ok(!get(s, e.id));
  assert.ok(seatView(s, 1).discard.includes("01001"));
  assert.ok(seatView(s, 1).discard.includes("01067"));
  assert.ok(seatView(s, 0).discard.includes("05017"));
});
test("Forced-attached cards have no game text or unique title, while printed costs remain active across saves", () => {
  let s = game();
  const e = unit(F.nameless);
  s.deck = ["01040", "01073"];
  s.staging = [e];
  engage(s, e);
  flush(s);
  assert.equal(
    stats(s, e).health,
    9,
    "Citadel Plate contributes cost 4, without its +4 HP text.",
  );
  assert.ok(e.attachments.every((a) => a.namelessCard && a.blanked));
  s.hand = [unit("01073")];
  assert.equal(
    canPlay(s, s.hand[0]),
    null,
    "The attached Gandalf has no unique title.",
  );
  s = save(s);
  assert.equal(stats(s, s.engaged[0]).health, 9);
  s = game();
  s.deck = ["01069", "01031"];
  s.staging = [unit(F.nameless)];
  engage(s, s.staging[0]);
  flush(s);
  assert.equal(
    has(s.engaged[0], "01069"),
    false,
    "Forced-attached Forest Snare cannot prevent enemy attacks.",
  );
});
test("Deep Deep Dark pays Doomed and Surge, attaches one per local Nameless in chosen order from local first player's deck", () => {
  let s = split(game(2));
  s.deck = ["01073", "01030", "01031"];
  const a = unit(F.nameless),
    b = unit(F.elder);
  s.staging = [a, b];
  const other = unit(F.nameless, 1);
  foundationsArea(s, 1)!.staging = [other];
  const t0 = s.threat,
    t1 = seatView(s, 1).threat;
  resolveReveal(s, F.deep);
  flush(s);
  assert.match(s.choice?.title ?? "", /Deep Deep Dark/);
  s = choose(save(s), b.id);
  assert.equal(get(s, b.id)!.attachments[0].code, "01073");
  assert.equal(get(s, a.id)!.attachments[0].code, "01030");
  assert.equal(foundationsArea(s, 1)!.staging[0].attachments.length, 0);
  assert.equal(seatView(s, 1).threat, t1);
  assert.equal(seatView(s, 0).threat, t0 + 1);
});
test("Nameless shadows discard only the defending player's hand; other enemies ignore these shadow clauses", () => {
  for (const code of [F.deep, F.lost]) {
    const s = game(2);
    s.hand = [unit("01030")];
    seatView(s, 1).hand.push(unit("01031", 1), unit("01032", 1));
    const enemy = unit(F.nameless, 1);
    s.engaged = [enemy];
    s.combat = {
      enemyId: enemy.id,
      attackPlayer: 1,
      defenderId: null,
      attackBonus: 0,
    };
    shadow(s, code);
    flush(s);
    assert.equal(seatView(s, 1).hand.length, 0);
    assert.equal(seatView(s, 0).hand.length, 1);
  }
});
test("Moria Bats only accepts Ranged attackers/defenders and counts only other enemies engaged with its player", () => {
  const s = game(2);
  s.heroes[0].code = "01005";
  const bats = unit(F.bats);
  s.engaged = [bats, unit(F.nameless), unit(F.bats)];
  seatView(s, 1).engaged.push(unit(F.elder, 1));
  assert.equal(stats(s, bats).attack, 3);
  assert.ok(attackersFor(s, bats).every((u) => hasKeyword(u, "Ranged")));
  assert.ok(defendersFor(s, bats).every((u) => hasKeyword(u, "Ranged")));
  bats.blanked = true;
  assert.equal(foundationsEnemyX(s, bats), undefined);
});
test("Lost and Alone shuffles only local heroes, detaches equipment, keeps last-hero player alive and restores a drawn physical hero", () => {
  let s = split(game(2));
  s.heroes = s.heroes.slice(0, 1);
  s.deck = [];
  const hero = s.heroes[0];
  hero.damage = 2;
  hero.resources = 7;
  hero.attachments = [{ id: "lost-axe", code: F.axe, exhausted: false }];
  const remote = seatView(s, 1).heroes[0];
  resolveReveal(s, F.lost);
  flush(s);
  s = choose(save(s), hero.id);
  assert.equal(s.status, "playing");
  assert.equal(seatView(s, 0).heroes.length, 0);
  assert.equal(seatView(s, 1).heroes[0].id, remote.id);
  assert.ok(s.encounterDiscard.includes(F.axe));
  s = save(s);
  draw(s, 1);
  check(s);
  assert.equal(s.heroes[0].id, hero.id);
  assert.equal(s.heroes[0].damage, 0);
  assert.equal(s.heroes[0].resources, 0);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.hand.length, 0);
});
test("A lost hero consumed by Nameless is a zero-cost attachment and is killed only when it reaches discard", () => {
  let s = game();
  s.heroes = s.heroes.slice(0, 1);
  s.deck = [];
  const hero = s.heroes[0];
  resolveReveal(s, F.lost);
  flush(s);
  s = choose(s, hero.id);
  const e = unit(F.nameless);
  s.staging = [e];
  engage(s, e);
  handle(s, s.queue.shift()!);
  assert.equal(e.attachments[0].code, hero.code);
  assert.equal(e.attachments[0].id, hero.id);
  assert.equal(stats(s, e).health, 0);
  check(s);
  assert.equal(s.status, "lost");
  assert.ok(s.discard.includes(hero.code));
});
test("Lost hero identity survives phase and round expiry, Stargazer choices, a later shuffle and saving", () => {
  let s = game(2);
  const hero = s.heroes[0];
  s.deck = ["01013", "01014", "01015", "01016"];
  resolveReveal(s, F.lost);
  flush(s);
  s = choose(s, hero.id);
  // The second player's mandatory selection is separately chosen and preserved.
  s = choose(s, seatView(s, 1).heroes[0].id);
  phaseEnd(s);
  assert.ok(
    s.used.some((key) => key.startsWith("game:foundations-hero-deck:")),
  );
  const stargazer = unit("04106");
  s.allies.push(stargazer);
  s.phase = "planning";
  s = act(save(s), { type: "ABILITY", id: stargazer.id });
  s = choose(s, "player-0");
  while (s.choice?.options.some((o) => o.code !== hero.code))
    s = choose(save(s), s.choice.options.find((o) => o.code !== hero.code)!.id);
  s = choose(save(s), s.choice!.options[0].id);
  assert.equal(s.deck.at(-1), hero.code);
  nextRound(s);
  assert.ok(
    s.used.some((key) => key.startsWith("game:foundations-hero-deck:")),
  );
  selectSeat(s, 0);
  shuffle(s, s.deck);
  s = save(s);
  while (s.deck.length) draw(s, 1);
  assert.equal(s.heroes.find((h) => h.code === hero.code)?.id, hero.id);
  assert.ok(!s.hand.some((u) => u.code === hero.code));
  assert.ok(!foundationsState(s)!.lostHeroes.some((h) => h.id === hero.id));
});
test("A lost hero drawn in the same phase is a new instance without its former target-bound lasting bonuses", () => {
  let s = game(2);
  const hero = s.heroes.find((h) => h.code === "01003")!;
  s.deck = [];
  s.used.push(
    `round:durin-song:${hero.id}`,
    `phase:mutual:Gondor:${hero.id}`,
    `round:beacons:${hero.id}`,
  );
  seatView(s, 1).used.push(
    `round:arwen:${hero.id}:1`,
    `phase:against-shadow:${hero.id}`,
  );
  hero.tempWill = 8;
  hero.tempAttack = 9;
  hero.roundKeywords = ["Sentinel"];
  assert.ok(stats(s, hero).attack > card(hero.code).attack!);
  resolveReveal(s, F.lost);
  flush(s);
  s = choose(s, hero.id);
  s = choose(s, seatView(s, 1).heroes[0].id);
  selectSeat(s, 0);
  draw(s, 1);
  const returned = s.heroes.find((h) => h.id === hero.id)!;
  assert.ok(returned);
  assert.deepEqual(stats(s, returned), {
    will: 2,
    attack: 2,
    defense: 1,
    health: 4,
  });
  assert.ok(!returned.roundKeywords?.length);
  assert.ok(!returned.dynamicTraits?.includes("Gondor"));
  save(s);
});
test("Discarding a lost hero from deck does not return it to play and eliminates a fellowship without any remaining hero", () => {
  let s = game();
  s.heroes = s.heroes.slice(0, 1);
  s.deck = [];
  const hero = s.heroes[0];
  resolveReveal(s, F.lost);
  flush(s);
  s = choose(s, hero.id);
  s.stage = 2;
  s.phase = "quest";
  s.allies = [unit("01030")];
  s.committedIds = [s.allies[0].id];
  s = act(s, { type: "COMMIT" });
  assert.equal(s.status, "lost");
  assert.equal(s.heroes.length, 0);
  assert.ok(s.discard.includes(hero.code));
});
test("Eliminating an isolated player removes their abandoned area while other players continue with their own zone", () => {
  const s = split(game(2));
  s.staging = [unit(F.bats)];
  s.threat = 50;
  syncSeat(s);
  check(s);
  assert.equal(s.status, "playing");
  assert.ok(s.table?.seats[0].eliminated);
  assert.equal(foundationsState(s)!.areas.length, 1);
  assert.equal(s.table?.active, 1);
  assert.ok(!s.staging.length);
});
test("Defeating stage five wins only at eleven quest progress and preserves separate-player history in saves", () => {
  const s = game(2);
  s.stage = 5;
  foundationsState(s)!.setAside = [];
  s.progress = 10;
  advanceQuest(s);
  assert.equal(s.status, "playing");
  s.progress = 11;
  advanceQuest(s);
  assert.equal(s.status, "won");
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});
test("Save validation rejects overlapping area seats, quest assignments, projected progress and physical card IDs", () => {
  const s = split(game(2));
  s.staging.push(unit(F.bats));
  foundationsArea(s, 1)!.staging.push(unit(F.nameless, 1));
  syncSeat(s);
  const original = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(original));
  for (const corrupt of [
    (v: GameState) => {
      v.foundationsStone!.areas[1].players = [0, 1];
    },
    (v: GameState) => {
      v.foundationsStone!.areas[1].questCode =
        v.foundationsStone!.areas[0].questCode;
    },
    (v: GameState) => {
      v.foundationsStone!.areas[0].progress = 1;
    },
    (v: GameState) => {
      v.foundationsStone!.areas[1].staging[0].id = v.heroes[0].id;
    },
    (v: GameState) => {
      v.foundationsStone!.areas[1].staging[0].attachments.push({
        id: v.heroes[0].id,
        code: "01040",
        exhausted: false,
        owner: 1,
      });
    },
    (v: GameState) => {
      v.foundationsStone!.setAside = [F.bats];
    },
    (v: GameState) => {
      v.foundationsStone!.activeArea = "not-an-area";
    },
  ]) {
    const altered = structuredClone(original);
    corrupt(altered);
    assert.equal(validateSave(altered), false);
  }
});
test("An eliminated isolated fellowship's lost-hero deck bindings expire and terminal split saves remain valid", () => {
  let s = split(game(2));
  const h = s.heroes[0];
  resolveReveal(s, F.lost);
  flush(s);
  s = choose(s, h.id);
  s.threat = 50;
  check(s);
  assert.ok(s.table?.seats[0].eliminated);
  assert.ok(
    !seatView(s, 0).used.some((key) =>
      key.startsWith("game:foundations-hero-deck:"),
    ),
  );
  s = save(s);
  s.threat = 50;
  check(s);
  assert.equal(s.status, "lost");
  save(s);
});
test("Local each-player draw stays in its area, while refresh and resource framework steps cover every group", () => {
  let s = split(game(2));
  const event = unit("02003"),
    beforeOther = seatView(s, 1).deck.length;
  s.hand = [event];
  s = act(s, { type: "PLAY", id: event.id });
  assert.equal(s.deck.length, 19);
  assert.equal(seatView(s, 1).deck.length, beforeOther);
  for (const p of globalPlayerOrder(s))
    seatView(s, p).heroes.forEach((h) => {
      h.exhausted = true;
    });
  effect(s, "refreshReady");
  assert.ok(globalCharacters(s).every((u) => !u.exhausted));
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 21);
  const previousRound = s.round;
  s = act(s, { type: "NEXT" });
  s = act(s, { type: "NEXT" });
  assert.equal(s.round, previousRound + 1);
  assert.equal(seatView(s, 0).deck.length, 18);
  assert.equal(seatView(s, 1).deck.length, beforeOther - 1);
  save(s);
});
test("A physical-owner callback cannot restore an eliminated seat or overwrite the surviving area's projection", () => {
  const s = split(game(2));
  s.staging.push(unit(F.bats));
  foundationsArea(s, 1)!.progress = 3;
  s.threat = 50;
  forOwner(s, 1, () => check(s));
  assert.ok(s.table!.seats[0].eliminated);
  assert.equal(s.table!.active, 1);
  assert.equal(s.progress, 3);
  assert.equal(s.staging.length, 0);
  save(s);
});
test("Previously granted target-bound lasting effects continue across the flood even when their caster is now in another area", () => {
  let s = game(2);
  const remote = seatView(s, 1).heroes[0];
  s.used.push(
    `round:beacons:${remote.id}`,
    `round:arwen:${remote.id}:1`,
    `phase:mutual:Rohan:${remote.id}`,
  );
  assert.equal(stats(s, remote).defense, 5);
  assert.ok(remote.dynamicTraits?.includes("Rohan"));
  s = split(s);
  selectSeat(s, 1);
  const stillPresent = s.heroes.find((h) => h.id === remote.id)!;
  assert.equal(stats(s, stillPresent).defense, 5);
  assert.ok(stillPresent.dynamicTraits?.includes("Rohan"));
  save(s);
});
