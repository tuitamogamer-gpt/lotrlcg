import { applyAction as act } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  availableAbilities as abilities,
  createGame,
  playTargets,
  stats,
  threatOf,
  validateSave,
} from "../src/game/engine";
import { card, cards, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  advanceQuest,
  damage,
  destroy,
  enterAlly,
  nextRound,
  placeEncounter,
  progress,
  resolveReveal,
  shadow,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { make, pay, questWill } from "../src/game/core";
import { seatView, selectSeat, syncSeat } from "../src/game/table";
import {
  CARROCK as C,
  CARROCK_ENCOUNTERS,
  CARROCK_TROLLS,
  carrockEffect,
  isSacked,
} from "../src/game/carrock";
import type { Card, GameState, Unit } from "../src/game/types";
import importedPlayers from "../src/data/official-player-cards.json";
const leadership = STARTERS.find((d) => d.id === "leadership")!;
const spirit = STARTERS.find((d) => d.id === "spirit")!;

function base() {
  let s = createGame(72, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "conflict-at-the-carrock",
  });
  s = act(s, { type: "KEEP" });
  s.queue = [];
  s.choice = null;
  s.hand = [];
  s.encounterDiscard = [];
  return s;
}
const unit = (s: GameState, code: string) => make(s, code);
const sack = (s: GameState, hero: Unit) =>
  hero.attachments.push({
    id: `sack-${s.nextId++}`,
    code: C.sacked,
    exhausted: false,
  });
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  return s;
}

test("Carrock registers every physical encounter and exact standard/easy setup for 1–4 players", () => {
  assert.equal(CARROCK_ENCOUNTERS.length, 13);
  for (const c of CARROCK_ENCOUNTERS) assert.ok(SCRIPTED.has(c.code), c.name);
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = createGame(
        2,
        leadership.cards,
        leadership.heroes,
        leadership.id,
        {
          scenarioId: "conflict-at-the-carrock",
          easy,
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
      assert.equal(s.encounterDeck.length, (easy ? 28 : 44) + players);
      assert.equal(
        s.encounterDeck.filter((c) => c === C.sacked).length,
        (easy ? 0 : 1) + players,
      );
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [C.carrock],
      );
      assert.ok(!s.encounterDeck.some((c) => CARROCK_TROLLS.includes(c)));
      assert.ok(!s.encounterDeck.includes(C.carrock));
      assert.equal(
        s.encounterDeck.filter((c) => c === C.muckAdder).length,
        easy ? 2 : 4,
      );
      assert.equal(
        s.encounterDeck.filter((c) => c === C.langflood).length,
        easy ? 2 : 4,
      );
      assert.equal(
        s.encounterDeck.filter((c) => c === C.frightenedBeast).length,
        easy ? 1 : 3,
      );
      assert.equal(
        s.encounterDeck.filter((c) => c === C.roastedSlowly).length,
        easy ? 0 : 2,
      );
      assert.ok(validateSave(s));
      if (easy) assert.ok(s.heroes.every((h) => h.resources === 1));
    }
});

test("the seventh quest progress forces Carrock active, discards prior location and introduces all four Trolls", () => {
  const s = base();
  s.activeLocation = unit(s, "01113");
  s.activeLocation.progress = 1;
  s.progress = 7;
  const deckBefore = [...s.encounterDeck];
  advanceQuest(s);
  assert.equal(s.stage, 2);
  assert.equal(s.progress, 0, "excess progress does not carry over to stage 2");
  assert.equal(s.activeLocation?.code, C.carrock);
  assert.ok(
    s.encounterDiscard.includes("01113"),
    "discard is not exploring Banks of the Anduin",
  );
  assert.deepEqual(
    s.encounterDeck,
    deckBefore,
    "discarding does not trigger Banks of the Anduin's exploration return",
  );
  assert.deepEqual(
    s.staging.map((u) => u.code),
    CARROCK_TROLLS,
  );
  assert.ok(validateSave(s));
});

test("final stage needs one quest progress and every Troll, including a non-unique Hill Troll, defeated", () => {
  const s = base();
  s.stage = 2;
  s.activeLocation = unit(s, C.carrock);
  const hill = unit(s, "01082");
  s.staging = [hill];
  progress(s, 7);
  assert.equal(s.progress, 1);
  assert.equal(s.status, "playing");
  destroy(s, hill);
  assert.equal(s.status, "won");
  assert.match(s.reason, /Carrock|Troll/i);
  const waiting = base();
  waiting.stage = 2;
  waiting.staging = [];
  advanceQuest(waiting);
  assert.equal(
    waiting.status,
    "playing",
    "Trolls alone are not sufficient without the quest progress",
  );
});

test("Carrock immunity blocks travel, attachment/target effects and redirected Legolas progress", () => {
  let s = base();
  const carrock = s.staging[0];
  s.phase = "travel";
  assert.throws(
    () => act(s, { type: "TRAVEL", id: carrock.id }),
    /Carrock|travel|immune/i,
  );
  const power = unit(s, "01056");
  assert.ok(!playTargets(s, power).some((u) => u.id === carrock.id));
  const scout = unit(s, "01016");
  enterAlly(s, scout, false, true);
  if (s.choice) assert.ok(!s.choice.options.some((o) => o.id === carrock.id));
  s.choice = null;
  s.queue = [];
  s.stage = 2;
  s.progress = 0;
  s.staging = [unit(s, C.louis)];
  s.activeLocation = carrock;
  handle(s, { kind: "questProgress", value: 2 });
  assert.equal(
    carrock.progress,
    0,
    "FAQ: active immune location ignores Legolas response",
  );
  assert.equal(
    s.progress,
    0,
    "FAQ: blocked response does not bypass the location",
  );
  progress(s, 2);
  assert.equal(
    carrock.progress,
    2,
    "ordinary successful questing remains effective",
  );
});

test("Morris and Stuart enhance every Troll across seats, while Carrock and River Langflood update dynamically", () => {
  const s = createGame(5, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "conflict-at-the-carrock",
    seats: [leadership, spirit].map((d) => ({
      deckId: d.id,
      heroes: [...d.heroes],
    })),
  });
  s.phase = "planning";
  const morris = unit(s, C.morris),
    stuart = unit(s, C.stuart),
    hill = unit(s, "01082"),
    river = unit(s, C.langflood);
  s.engaged = [morris];
  syncSeat(s);
  selectSeat(s, 1);
  s.engaged = [stuart];
  syncSeat(s);
  selectSeat(s, 0);
  s.staging = [hill, river];
  s.activeLocation = unit(s, C.carrock);
  assert.equal(stats(s, hill).attack, 8);
  assert.equal(stats(s, hill).defense, 5);
  assert.equal(threatOf(s, river), 5);
  selectSeat(s, 1);
  s.engaged = [];
  syncSeat(s);
  selectSeat(s, 0);
  assert.equal(stats(s, hill).defense, 4);
  assert.equal(threatOf(s, river), 4);
  s.activeLocation = river;
  s.staging = [hill];
  assert.equal(threatOf(s, river), 2);
  assert.equal(stats(s, hill).attack, 7);
});

test("Sacked cannot be canceled, preserves current questing and prevents new commits/combat/hero abilities/resources", () => {
  let s = base();
  const h = s.heroes[0];
  h.committed = true;
  s.phase = "staging";
  s.hand = [unit(s, "01050")];
  s.heroes[0].resources = 5;
  reveal(s, C.sacked);
  assert.ok(
    s.choice && !s.choice.options.some((o) => /cancel|eleanor/.test(o.id)),
  );
  s = choose(s, h.id);
  assert.ok(s.heroes[0].committed);
  assert.ok(questWill(s) >= card(h.code).willpower!);
  s.phase = "quest";
  assert.throws(
    () => act(s, { type: "TOGGLE_QUEST", id: h.id }),
    /Sacked|commit|character/i,
  );
  const before = s.heroes[0].resources;
  nextRound(s);
  assert.equal(s.heroes[0].resources, before);
  s.phase = "defense";
  s.engaged = [unit(s, "01082")];
  assert.throws(
    () =>
      act(s, { type: "DEFEND", enemyId: s.engaged[0].id, defenderId: h.id }),
    /Sacked|defend|ready/i,
  );
  s.phase = "attack";
  assert.throws(
    () =>
      act(s, { type: "ATTACK", enemyId: s.engaged[0].id, attackerIds: [h.id] }),
    /Sacked|attack|ready/i,
  );
  const gloin = s.heroes.find((x) => x.code === "01003")!;
  sack(s, gloin);
  const resources = gloin.resources;
  damage(s, gloin.id, 1);
  assert.equal(
    gloin.resources,
    resources,
    "Gloin cannot trigger his own damage response",
  );
});

test("Sacked suppresses both affordable A Test of Will and ready Eleanor, and selects the first player's hero", () => {
  let s = createGame(9, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "conflict-at-the-carrock",
    seats: [leadership, spirit].map((d) => ({
      deckId: d.id,
      heroes: [...d.heroes],
    })),
  });
  s.phase = "staging";
  s.queue = [];
  s.choice = null;
  selectSeat(s, 1);
  s.hand = [unit(s, "01050")];
  s.heroes[0].resources = 3;
  assert.ok(s.heroes.some((h) => h.code === "01008" && !h.exhausted));
  reveal(s, C.sacked);
  assert.match(s.choice!.title, /Sacked/);
  assert.ok(!s.choice!.options.some((o) => /cancel|eleanor/.test(o.id)));
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    seatView(s, 0).heroes.map((h) => h.id),
  );
  s = choose(s, seatView(s, 0).heroes[1].id);
  assert.ok(isSacked(seatView(s, 0).heroes[1]));
  assert.ok(seatView(s, 1).heroes.every((h) => !isSacked(h)));
});

test("Sacked blocks hero actions but allows attached-card actions and spending existing resources", () => {
  const d = spirit;
  let s = createGame(7, d.cards, d.heroes, d.id, {
    scenarioId: "conflict-at-the-carrock",
  });
  s = act(s, { type: "KEEP" });
  s.queue = [];
  s.choice = null;
  const eowyn = s.heroes[0];
  sack(s, eowyn);
  assert.ok(abilities(s, eowyn).every((a) => a.id || a.disabled));
  assert.throws(
    () => act(s, { type: "ABILITY", id: eowyn.id }),
    /Sacked|effect|ability/i,
  );
  eowyn.exhausted = true;
  eowyn.attachments.push({ id: "courage", code: "01057", exhausted: false });
  s = act(s, { type: "ABILITY", id: eowyn.id, attachmentId: "courage" });
  assert.equal(s.heroes[0].exhausted, false);
  assert.ok(isSacked(s.heroes[0]));
});

test("Sacked blocks resource gains from card effects as well as the resource phase, but permits spending", () => {
  const s = base();
  const hero = s.heroes[0];
  sack(s, hero);
  hero.resources = 4;
  hero.attachments.push({ id: "steward", code: "01026", exhausted: false });
  handle(s, { kind: "resource", target: hero.id, value: 2 });
  assert.equal(
    hero.resources,
    4,
    "FAQ1.25: collecting includes gaining through card effects",
  );
  assert.throws(
    () => act(s, { type: "ABILITY", id: hero.id, attachmentId: "steward" }),
    /Sacked|resource|cannot/i,
  );
  hero.attachments.push({ id: "horn", code: "01042", exhausted: false });
  const ally = unit(s, "01016");
  s.allies.push(ally);
  destroy(s, ally);
  assert.equal(hero.resources, 4, "Horn cannot add resources to a Sacked hero");
  pay(s, card("01016"), { [hero.id]: 1 });
  assert.equal(hero.resources, 3, "existing resources can still pay for cards");
});

test("Sacked shadows attach only for Troll attacks and target the first player", () => {
  let s = base();
  const troll = unit(s, C.louis);
  troll.shadows = [C.sacked];
  s.engaged = [troll];
  s.combat = { enemyId: troll.id, defenderId: s.heroes[0].id, attackBonus: 0 };
  shadow(s, C.sacked);
  assert.ok(s.choice);
  assert.deepEqual(
    troll.shadows,
    [],
    "attached shadow must not be discarded again at combat end",
  );
  s = choose(s, s.heroes[0].id);
  assert.ok(isSacked(s.heroes[0]));
  const noTroll = base();
  const adder = unit(noTroll, C.muckAdder);
  adder.shadows = [C.sacked];
  noTroll.engaged = [adder];
  noTroll.combat = {
    enemyId: adder.id,
    defenderId: noTroll.heroes[0].id,
    attackBonus: 0,
  };
  shadow(noTroll, C.sacked);
  assert.equal(noTroll.choice, null);
  assert.deepEqual(adder.shadows, [C.sacked]);
});

test("Grimbeorn uses eight Leadership resources, may use Oak Grove and never exhausts against Trolls", () => {
  let s = base();
  const grim = unit(s, C.grimbeorn);
  s.staging.push(grim);
  const h = s.heroes[0];
  h.resources = 8;
  for (let i = 0; i < 8; i++) {
    s = act(s, { type: "ABILITY", id: grim.id });
    s = choose(s, h.id);
  }
  assert.equal(s.heroes[0].resources, 0);
  const ally = s.allies.find((u) => u.code === C.grimbeorn)!;
  assert.equal(ally.resources, 8);
  assert.ok(!s.staging.some((u) => u.id === grim.id));
  s.phase = "defense";
  const louis = unit(s, C.louis);
  louis.shadows = ["01087"];
  s.engaged = [louis];
  s = act(s, { type: "DEFEND", enemyId: louis.id, defenderId: ally.id });
  assert.equal(s.allies.find((u) => u.id === ally.id)!.exhausted, false);
  const oak = base();
  oak.activeLocation = unit(oak, C.oakGrove);
  oak.heroes[2].resources = 1;
  const objective = unit(oak, C.grimbeorn);
  oak.staging.push(objective);
  carrockEffect(oak, { kind: "carrockContribute", target: objective.id });
  assert.ok(oak.choice?.options.some((o) => o.id === oak.heroes[2].id));
});

test("Grimbeorn accepts Song of Kings and Sword that Was Broken resource icons, but not a plain Spirit resource", () => {
  let s = createGame(9, spirit.cards, spirit.heroes, spirit.id, {
    scenarioId: "conflict-at-the-carrock",
  });
  s = act(s, { type: "KEEP" });
  s.queue = [];
  s.choice = null;
  s.hand = [];
  const grim = unit(s, C.grimbeorn);
  s.staging.push(grim);
  s.heroes.forEach((h) => {
    h.resources = 1;
  });
  assert.throws(() => act(s, { type: "ABILITY", id: grim.id }), /Leadership/);
  for (const resourceIcon of ["02010", "04055"]) {
    s.heroes[0].attachments = [
      { id: `resource-${resourceIcon}`, code: resourceIcon, exhausted: false },
    ];
    s.heroes[0].resources = 1;
    s = act(s, { type: "ABILITY", id: grim.id });
    assert.deepEqual(
      s.choice!.options.map((o) => o.id),
      [s.heroes[0].id],
    );
    s = choose(s, s.heroes[0].id);
    assert.equal(s.heroes[0].resources, 0);
  }
  assert.equal(s.staging.find((u) => u.id === grim.id)?.resources, 2);
});

test("Bee Pastures searches the deck or discard, with an optional response", () => {
  for (const fromDiscard of [false, true]) {
    let s = base();
    s.phase = "travel";
    s.staging = [unit(s, C.beePastures)];
    s.encounterDeck = fromDiscard ? ["01087"] : [C.grimbeorn, "01087"];
    s.encounterDiscard = fromDiscard ? [C.grimbeorn] : [];
    const bee = s.staging[0];
    s = act(s, { type: "TRAVEL", id: bee.id });
    assert.match(s.choice!.title, /Bee Pastures/);
    s = choose(s, "find");
    while (s.choice) s = choose(s, "skip");
    assert.ok(s.staging.some((u) => u.code === C.grimbeorn));
    assert.ok(!s.encounterDeck.includes(C.grimbeorn));
    assert.ok(!s.encounterDiscard.includes(C.grimbeorn));
  }
});

test("Frightened Beast increases all players by total staging threat or accepts a Creature sacrifice", () => {
  const s = base();
  s.staging = [unit(s, C.langflood), unit(s, C.louis)];
  const before = s.threat;
  reveal(s, C.frightenedBeast);
  assert.equal(s.threat, before + 5);
  assert.ok(s.encounterDiscard.includes(C.frightenedBeast));
  // A real printed Creature fixture tests the encounter cancellation independently
  // of that player card's own automated ability/support registry.
  const creatureCode = "02004";
  const previous = cards[creatureCode];
  cards[creatureCode] = importedPlayers.find(
    (c) => c.code === creatureCode,
  )! as Card;
  try {
    let cancel = base();
    cancel.staging = [unit(cancel, C.louis)];
    const creature = unit(cancel, creatureCode);
    cancel.allies.push(creature);
    const threat = cancel.threat;
    reveal(cancel, C.frightenedBeast);
    cancel = choose(cancel, creature.id);
    assert.equal(cancel.threat, threat);
    assert.ok(!cancel.allies.some((u) => u.id === creature.id));
    assert.ok(cancel.discard.includes(creatureCode));
  } finally {
    if (previous) cards[creatureCode] = previous;
    else delete cards[creatureCode];
  }
});

test("Frightened Beast raises every living player's threat and Louis affects Troll attacks at another seat", () => {
  let s = createGame(9, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "conflict-at-the-carrock",
    seats: [leadership, spirit].map((d) => ({
      deckId: d.id,
      heroes: [...d.heroes],
    })),
  });
  s.phase = "staging";
  s.queue = [];
  s.choice = null;
  s.hand = [];
  syncSeat(s);
  selectSeat(s, 1);
  s.hand = [];
  syncSeat(s);
  selectSeat(s, 0);
  s.staging = [unit(s, C.langflood), unit(s, C.stuart)];
  const before = [seatView(s, 0).threat, seatView(s, 1).threat];
  reveal(s, C.frightenedBeast);
  if (s.choice?.options.some((o) => o.id === "resolve"))
    s = choose(s, "resolve");
  assert.equal(seatView(s, 0).threat, before[0] + 5);
  assert.equal(seatView(s, 1).threat, before[1] + 5);
  s.staging = [];
  const louis = unit(s, C.louis);
  s.engaged = [louis];
  syncSeat(s);
  selectSeat(s, 1);
  const troll = unit(s, C.stuart);
  troll.shadows = ["01087"];
  s.engaged = [troll];
  s.heroes[0].tempDefense = 10;
  s.phase = "defense";
  s.table!.turn = 1;
  const firstBefore = seatView(s, 0).threat,
    secondBefore = s.threat;
  s = act(s, { type: "DEFEND", enemyId: troll.id, defenderId: s.heroes[0].id });
  assert.equal(seatView(s, 0).threat, firstBefore);
  assert.equal(seatView(s, 1).threat, secondBefore + 3);
});

test("Roasted Slowly destroys Sacked heroes then returns to the deck, while cancellation simply discards it", () => {
  const s = base();
  sack(s, s.heroes[0]);
  const victim = s.heroes[0].code;
  reveal(s, C.roastedSlowly);
  assert.ok(!s.heroes.some((h) => h.code === victim));
  assert.ok(s.discard.includes(victim));
  assert.ok(s.encounterDiscard.includes(C.sacked));
  assert.ok(s.encounterDeck.includes(C.roastedSlowly));
  assert.ok(!s.encounterDiscard.includes(C.roastedSlowly));
  const cancelled = base();
  sack(cancelled, cancelled.heroes[0]);
  cancelled.encounterDeck = [];
  placeEncounter(cancelled, C.roastedSlowly, true);
  assert.equal(cancelled.heroes.length, 3);
  assert.ok(cancelled.encounterDiscard.includes(C.roastedSlowly));
  assert.ok(!cancelled.encounterDeck.includes(C.roastedSlowly));
});

test("Louis raises defending-player threat after actual Troll attacks, Rupert returns Sacked and each unique Troll offers freeing", () => {
  let s = base();
  const louis = unit(s, C.louis),
    rupert = unit(s, C.rupert);
  louis.shadows = ["01087"];
  rupert.shadows = ["01087"];
  s.engaged = [louis, rupert];
  s.encounterDiscard = [C.sacked, "01087"];
  s.phase = "defense";
  s.heroes[0].tempDefense = 10;
  const before = s.threat;
  s = act(s, {
    type: "DEFEND",
    enemyId: rupert.id,
    defenderId: s.heroes[0].id,
  });
  assert.equal(s.threat, before + 3);
  assert.ok(s.encounterDeck.includes(C.sacked));
  assert.ok(!s.encounterDiscard.includes(C.sacked));
  const rescued = base();
  sack(rescued, rescued.heroes[0]);
  const morris = unit(rescued, C.morris);
  rescued.staging.push(morris);
  destroy(rescued, morris);
  flush(rescued);
  assert.match(rescued.choice!.title, /Troll.*defeated/);
  const freed = choose(rescued, rescued.heroes[0].attachments[0].id);
  assert.ok(!isSacked(freed.heroes[0]));
  assert.ok(freed.encounterDiscard.includes(C.sacked));
});

test("Muck Adder discards a surviving damaged character, but never after an attack that deals zero", () => {
  for (const noDamage of [false, true]) {
    let s = base();
    const adder = unit(s, C.muckAdder);
    adder.shadows = ["01087"];
    const defender = s.heroes[1];
    defender.tempDefense = noDamage ? 2 : -1;
    s.engaged = [adder];
    s.phase = "defense";
    s = act(s, { type: "DEFEND", enemyId: adder.id, defenderId: defender.id });
    assert.equal(
      s.heroes.some((h) => h.id === defender.id),
      noDamage,
    );
    assert.equal(s.discard.includes(defender.code), !noDamage);
  }
});

test("Muck Adder shadow reduces defense only this attack and Roasted shadow heals only Trolls", () => {
  const s = base();
  const enemy = unit(s, C.louis);
  enemy.damage = 3;
  s.engaged = [enemy];
  s.combat = { enemyId: enemy.id, defenderId: s.heroes[0].id, attackBonus: 0 };
  shadow(s, C.muckAdder);
  assert.equal(s.combat?.defensePenalty, 1);
  assert.equal(s.heroes[0].tempDefense ?? 0, 0);
  shadow(s, C.roastedSlowly);
  assert.equal(enemy.damage, 1);
  enemy.code = C.muckAdder;
  shadow(s, C.roastedSlowly);
  assert.equal(enemy.damage, 1);
});

test("claimed Grimbeorn retains his controller when the first-player token passes, and can be saved", () => {
  let s = createGame(7, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "conflict-at-the-carrock",
    seats: [leadership, spirit].map((d) => ({
      deckId: d.id,
      heroes: [...d.heroes],
    })),
  });
  const grim = unit(s, C.grimbeorn);
  grim.resources = 8;
  grim.damage = 2;
  s.allies.push(grim);
  syncSeat(s);
  s.phase = "refresh";
  s.queue = [];
  s.choice = null;
  handle(s, { kind: "refreshReady" });
  flush(s);
  assert.equal(s.table!.first, 1);
  s = act(s, { type: "NEXT" });
  assert.equal(s.table!.first, 1);
  assert.ok(!seatView(s, 1).allies.some((u) => u.id === grim.id));
  assert.equal(seatView(s, 0).allies.find((u) => u.id === grim.id)?.damage, 2);
  assert.equal(
    seatView(s, 0).allies.find((u) => u.id === grim.id)?.resources,
    8,
  );
  assert.ok(validateSave(s));
});

test("destroyed or discarded Grimbeorn goes to encounter discard, so Bee Pastures can find him again", () => {
  for (const discarded of [false, true]) {
    const s = base();
    const grim = unit(s, C.grimbeorn);
    grim.resources = 8;
    s.allies.push(grim);
    s.encounterDeck = s.encounterDeck.filter((c) => c !== C.grimbeorn);
    if (discarded) handle(s, { kind: "discardCharacter", target: grim.id });
    else destroy(s, grim);
    assert.ok(!s.allies.some((u) => u.id === grim.id));
    assert.ok(s.encounterDiscard.includes(C.grimbeorn));
    assert.ok(!s.discard.includes(C.grimbeorn));
    s.queue = [];
    s.choice = null;
    carrockEffect(s, { kind: "carrockFindGrimbeorn" });
    assert.ok(s.staging.some((u) => u.code === C.grimbeorn));
    assert.ok(!s.encounterDiscard.includes(C.grimbeorn));
  }
});
