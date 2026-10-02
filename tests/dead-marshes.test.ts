import { applyAction as act } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  availableAbilities,
  canPlay,
  createGame,
  restoreSave,
  stats,
  validateSave,
} from "../src/game/engine";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  advanceQuest,
  check,
  destroy,
  progressLocation,
  resolveReveal,
  shadow,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { fx, make } from "../src/game/core";
import {
  allCharacters,
  allHeroes,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { CARROCK } from "../src/game/carrock";
import {
  DEAD as D,
  DEAD_MARSHES_ENCOUNTERS,
  DEAD_MARSHES_QUESTS,
  deadMarshesAddResources,
  deadMarshesEscapeCandidates,
  deadMarshesEscapeStrength,
  deadMarshesRoundEnd,
} from "../src/game/dead-marshes";
import { SCENARIOS } from "../src/game/scenarios";
import type { GameState, Unit } from "../src/game/types";
import recipes from "../public/scenarios.json";

const leadership = STARTERS.find((d) => d.id === "leadership")!;
const spirit = STARTERS.find((d) => d.id === "spirit")!;
const lore = STARTERS.find((d) => d.id === "lore")!;
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
const objective = (s: GameState) => s.staging.find((u) => u.code === D.gollum)!;
const attach = (s: GameState, u: Unit, code: string) => {
  const a = { id: `a${s.nextId++}`, code, exhausted: false };
  u.attachments.push(a);
  return a;
};
function settle(s: GameState) {
  for (let i = 0; i < 100; i++) {
    if (s.choice) {
      const options = s.choice.options;
      s = choose(
        s,
        options.find((o) =>
          ["done", "accept", "resolve", "skip", "none"].includes(o.id),
        )?.id ?? options[0].id,
      );
    } else if (s.escapeTest) s = act(s, { type: "RESOLVE_ESCAPE" });
    else if (s.phase === "setup") s = act(s, { type: "KEEP" });
    else return s;
  }
  throw new Error("Setup did not finish");
}
function base(deck = leadership, players = 1) {
  const seats = [deck, ...STARTERS.filter((d) => d.id !== deck.id)].slice(
    0,
    players,
  );
  let s = settle(
    createGame(3, deck.cards, deck.heroes, deck.id, {
      scenarioId: "dead-marshes",
      ...(players > 1
        ? { seats: seats.map((d) => ({ deckId: d.id, heroes: [...d.heroes] })) }
        : {}),
    }),
  );
  s.queue = [];
  s.choice = null;
  delete s.escapeTest;
  s.staging = [make(s, D.gollum)];
  s.encounterDeck = [D.worm, D.worm, D.worm];
  s.encounterDiscard = [];
  s.activeLocation = null;
  s.phase = "quest";
  selectSeat(s, 0);
  if (s.table) {
    s.table.turn = 0;
    s.table.passed = [];
  }
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.hand = [];
    });
  for (const h of allHeroes(s)) {
    h.exhausted = false;
    h.committed = false;
    h.resources = 5;
  }
  return s;
}
function begin(s: GameState, code = D.nightfall, player = 0, count = 2) {
  handle(s, fx("deadBeginEscape", { code, player, count }));
  flush(s);
  return s;
}
function commit(s: GameState, ...ids: string[]) {
  for (const id of ids) s = choose(s, id);
  return choose(s, "done");
}
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  if (s.choice?.options.some((o) => o.id === "resolve"))
    s = choose(s, "resolve");
  return s;
}
function serialized(s: GameState) {
  syncSeat(s);
  return structuredClone(s);
}

test("Dead Marshes registers every original design, exact normal/easy quantities and source-derived quest faces", () => {
  assert.equal(DEAD_MARSHES_ENCOUNTERS.length, 9);
  for (const c of DEAD_MARSHES_ENCOUNTERS)
    assert.ok(SCRIPTED.has(c.code), c.name);
  for (const stage of SCENARIOS.find((q) => q.id === "dead-marshes")!.stages) {
    const printed = DEAD_MARSHES_QUESTS.find((c) => c.code === stage.cardCode)!;
    assert.equal(stage.questImage, printed.back_imagesrc);
  }
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const recipe = recipes.find((q) => q.id === (easy ? "E01.8" : "Q01.8"))!;
      // Avoid interruption by an escape treachery so the setup multiset is directly observable.
      let s: GameState | undefined;
      for (let seed = 1; seed < 1000; seed++) {
        const candidate = createGame(
          seed,
          leadership.cards,
          leadership.heroes,
          leadership.id,
          {
            scenarioId: "dead-marshes",
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
        if (
          !candidate.choice &&
          !candidate.escapeTest &&
          candidate.encounterDeck.length === (easy ? 36 : 53) - players &&
          candidate.staging.length === players + 1 &&
          objective(candidate)?.resources === 0
        ) {
          s = candidate;
          break;
        }
      }
      assert.ok(s);
      const actual: Record<string, number> = {};
      for (const c of [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.filter((u) => u.code !== D.gollum).map((u) => u.code),
      ])
        actual[c] = (actual[c] ?? 0) + 1;
      assert.deepEqual(actual, recipe.sections.sharedEncounterDeck);
      assert.equal(objective(s).resources, 0);
      assert.ok(validateSave(s));
      assert.equal(allHeroes(s)[0].resources, easy ? 1 : 0);
    }
});

test("characters exhaust for escape, retain quest flags and do not trigger Aragorn or Theodred quest responses", () => {
  let s = base();
  const [aragorn, theodred] = s.heroes;
  const resources = [aragorn.resources, theodred.resources];
  aragorn.committed = true;
  s = begin(s);
  s = choose(s, aragorn.id);
  s = choose(s, theodred.id);
  assert.ok(s.heroes[0].exhausted);
  assert.equal(s.heroes[0].committed, true);
  assert.equal(s.heroes[1].committed, false);
  assert.deepEqual(
    s.heroes.slice(0, 2).map((h) => h.resources),
    resources,
  );
  assert.match(s.choice!.title, /Escape/);
  assert.ok(!s.queue.some((e) => ["aragorn", "theodred"].includes(e.kind)));
});

test("a single player's test accepts only that player's ready characters; party test invites seats in first-player order", () => {
  let s = base(leadership, 3);
  s.table!.first = 1;
  s = begin(s, D.nightfall, 2);
  assert.equal(s.table!.active, 2);
  const eligible = deadMarshesEscapeCandidates(s);
  assert.deepEqual(
    eligible.map((u) => u.id),
    seatView(s, 2).heroes.map((u) => u.id),
  );
  assert.throws(() => choose(s, seatView(s, 0).heroes[0].id), /Invalid choice/);
  s = commit(s);
  assert.equal(s.table!.active, 1);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  for (const h of allHeroes(s)) h.exhausted = false;
  s = begin(s, D.gollum, 1, 3);
  assert.deepEqual(s.escapeTest!.participants, playerOrder(s));
  for (const player of [1, 2, 0]) {
    assert.equal(s.table!.active, player);
    s = commit(s, seatView(s, player).heroes[0].id);
  }
  assert.equal(s.escapeTest!.phase, "actions");
  assert.equal(s.escapeTest!.committedIds.length, 3);
});

test("printed Escape values are totaled, all other dealt effects ignored, and a tie always fails", () => {
  for (const boost of [0, 1]) {
    let s = base(spirit);
    s.encounterDeck = [D.nightfall, D.worm, "01089"]; // 2+2; ignore Nightfall's own test.
    s.heroes[0].tempWill = boost;
    s = begin(s);
    s = commit(s, s.heroes[0].id);
    const threat = s.threat;
    s = act(s, { type: "RESOLVE_ESCAPE" });
    assert.equal(objective(s).resources, boost ? 0 : 1);
    assert.equal(s.threat, threat + (boost ? 0 : 2));
    assert.equal(s.escapeTest, undefined);
    assert.equal(s.choice, null);
    assert.deepEqual(s.encounterDiscard, [D.nightfall, D.worm]);
  }
  let s = base();
  s.encounterDeck = ["01089", "01089"];
  s = commit(begin(s));
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(objective(s).resources, 1, "zero versus zero is still a tie");
});

test("Heart of the Marshes adds one Escape per dealt card, including cards with no printed Escape", () => {
  for (const active of [false, true]) {
    let s = base();
    const heart = make(s, D.heart);
    if (active) s.activeLocation = heart;
    else s.staging.push(heart);
    s.encounterDeck = ["01089", "01089"];
    s.heroes[0].tempWill = -1; // Aragorn contributes 1.
    s = commit(begin(s), s.heroes[0].id);
    s = act(s, { type: "RESOLVE_ESCAPE" });
    assert.equal(objective(s).resources, active ? 1 : 0);
  }
});

test("escape actions window uses current modified willpower and allows Éowyn's exhausted-character action", () => {
  let s = base(spirit);
  s.encounterDeck = [D.worm, D.worm];
  s.hand = [make(s, "01020")];
  const eowynId = s.heroes[0].id;
  s = commit(begin(s), eowynId);
  assert.equal(deadMarshesEscapeStrength(s), 4);
  assert.ok(availableAbilities(s, s.heroes[0]).some((a) => !a.disabled));
  s = act(s, { type: "ABILITY", id: eowynId });
  s = choose(s, s.hand[0].id);
  assert.equal(deadMarshesEscapeStrength(s), 5);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(objective(s).resources, 0);
});

test("Faramir and other players' actions can improve the selected player's escape after commitment", () => {
  let s = base(leadership, 2);
  const faramir = make(s, "01014");
  s.allies.push(faramir);
  s.encounterDeck = [D.worm, D.worm];
  s = begin(s, D.nightfall, 1);
  const character = seatView(s, 1).heroes[0];
  character.tempWill = 4 - stats(s, character).will;
  s = commit(s, character.id);
  assert.equal(deadMarshesEscapeStrength(s), 4);
  s = act(s, { type: "SELECT_SEAT", seat: 0 });
  s = act(s, { type: "ABILITY", id: faramir.id });
  s = choose(s, "player-1");
  assert.equal(deadMarshesEscapeStrength(s), 5);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(objective(s).resources, 0);
});

test("Valiant Sacrifice triggered during escape resolves without consuming the suspended encounter continuation", () => {
  let s = base();
  const ally = make(s, "01013");
  s.allies.push(ally);
  s.hand = [make(s, "01024")];
  s.deck = ["01013", "01013"];
  s.queue = [fx("resource", { target: s.heroes[0].id, value: 1 })];
  s = commit(begin(s), s.heroes[0].id);
  const before = s.heroes[0].resources;
  destroy(s, ally);
  flush(s);
  assert.ok(s.choice);
  s = choose(s, s.choice!.options.find((o) => o.id !== "skip")!.id);
  assert.equal(s.hand.length, 2);
  assert.equal(s.heroes[0].resources, before - 1);
  assert.equal(s.escapeTest!.continuation.length, 1);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(s.heroes[0].resources, before);
});

test("escape window blocks normal progression and ally/attachment plays, but allows readying events", () => {
  let s = base();
  const heroId = s.heroes[0].id;
  s.hand = [make(s, "01021"), make(s, "01013")];
  s = commit(begin(s), heroId);
  assert.throws(() => act(s, { type: "NEXT" }), /escape/);
  assert.throws(() => act(s, { type: "COMMIT" }), /escape/);
  assert.match(canPlay(s, s.hand[1])!, /events/);
  s = act(s, { type: "PLAY", id: s.hand[0].id, target: s.heroes[1].id });
  s = choose(s, heroId);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(deadMarshesEscapeStrength(s), 2);
  assert.ok(
    !deadMarshesEscapeCandidates(s, 0).some((u) => u.id === heroId),
    "readying cannot recommit the same character",
  );
});

test("Sacked forbids quest commitment but still permits exhausting the hero for an escape test", () => {
  let s = base();
  const heroId = s.heroes[0].id;
  attach(s, s.heroes[0], CARROCK.sacked);
  s = begin(s);
  assert.ok(s.choice!.options.some((o) => o.id === heroId));
  s = commit(s, heroId);
  assert.equal(deadMarshesEscapeStrength(s), 2);
});

test("Through the Mist uses attack instead of willpower, including current temporary bonuses", () => {
  let s = base(spirit);
  s.encounterDeck = [D.worm, D.worm];
  s.heroes[0].tempAttack = 4;
  s = reveal(s, D.mist);
  assert.equal(s.escapeTest!.attack, true);
  s = commit(s, s.heroes[0].id);
  assert.equal(deadMarshesEscapeStrength(s), 5);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(objective(s).resources, 0);
  assert.equal(s.escapeTest, undefined);
});

test("Nightfall and Mist failure place one token and raise every surviving player's threat by the printed amount", () => {
  for (const code of [D.nightfall, D.mist]) {
    let s = base(leadership, 3);
    const before = s.table!.seats.map((_, i) => seatView(s, i).threat);
    s = commit(reveal(s, code));
    s = act(s, { type: "RESOLVE_ESCAPE" });
    assert.equal(objective(s).resources, 1);
    for (let i = 0; i < 3; i++)
      assert.equal(
        seatView(s, i).threat,
        before[i] + (code === D.nightfall ? 2 : 1),
      );
    assert.ok(s.encounterDiscard.includes(code));
  }
});

test("The Lights of the Dead resolves each player's separate test and only raises that failing player's threat", () => {
  let s = base(leadership, 3);
  s.table!.first = 1;
  s.encounterDeck = [D.worm, D.worm, D.worm, D.worm, D.worm, D.worm, "01089"];
  const before = s.table!.seats.map((_, i) => seatView(s, i).threat);
  s = reveal(s, D.lights);
  for (const player of [1, 2, 0]) {
    assert.deepEqual(s.escapeTest!.participants, [player]);
    assert.equal(s.table!.active, player);
    s = commit(s);
    s = act(s, { type: "RESOLVE_ESCAPE" });
    assert.equal(seatView(s, player).threat, before[player] + 1);
  }
  assert.equal(objective(s).resources, 3);
  assert.equal(s.escapeTest, undefined);
  assert.equal(s.encounterDiscard.filter((c) => c === D.lights).length, 1);
});

test("escape initiator and dealt cards stay out of the discard pile until their own resolution ends", () => {
  let s = base();
  s.encounterDeck = [D.worm];
  s.encounterDiscard = ["01089"];
  s = reveal(s, D.nightfall);
  assert.ok(!s.encounterDiscard.includes(D.nightfall));
  s = commit(s, s.heroes[0].id, s.heroes[1].id);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.match(
    s.log.find((l) => /Escape test:/.test(l.text))!.text,
    /against 2 Escape from 2 cards/,
  );
  const available = [...s.encounterDeck, ...s.encounterDiscard];
  assert.equal(available.filter((c) => c === D.worm).length, 1);
  assert.equal(available.filter((c) => c === "01089").length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === D.nightfall).length, 1);
});

test("Wisp may exhaust any player's Lore hero including an added Lore icon, otherwise places two tokens", () => {
  let s = base(leadership, 2);
  const recipient = seatView(s, 1).heroes[0];
  attach(s, recipient, "02034"); // Song of Wisdom.
  s = reveal(s, D.wisp);
  assert.ok(s.choice!.options.some((o) => o.id === recipient.id));
  s = choose(s, recipient.id);
  assert.equal(objective(s).resources, 1);
  assert.equal(seatView(s, 1).heroes[0].exhausted, true);
  s = reveal(s, D.wisp);
  s = choose(s, "accept");
  assert.equal(objective(s).resources, 3);
});

test("Bog counts itself plus only staging locations; Fens places its token after travel", () => {
  let s = base(lore);
  s.staging.push(make(s, D.heart), make(s, D.worm));
  s.activeLocation = make(s, D.fens);
  s = reveal(s, D.bog);
  assert.equal(objective(s).resources, 2);
  s.activeLocation = null;
  s.phase = "travel";
  const fens = make(s, D.fens);
  s.staging.push(fens);
  s = act(s, { type: "TRAVEL", id: fens.id });
  assert.equal(s.activeLocation?.id, fens.id);
  assert.equal(objective(s).resources, 3);
});

test("exploring Impassable Bog awards its seven Victory points and never discards it into a future escape test", () => {
  const s = base();
  const bog = make(s, D.bog);
  s.staging.push(bog);
  progressLocation(s, bog, 12);
  flush(s);
  assert.equal(s.victory, 7);
  assert.ok(!s.staging.some((u) => u.id === bog.id));
  assert.ok(!s.encounterDiscard.includes(D.bog));
});

test("each Giant Marsh Worm in staging or engaged heals two at end of round, capped at zero damage", () => {
  let s = base(leadership, 2);
  const a = make(s, D.worm),
    b = make(s, D.worm),
    c = make(s, D.worm);
  a.damage = 4;
  b.damage = 1;
  c.damage = 3;
  s.staging.push(a);
  s.engaged.push(b);
  seatView(s, 1).engaged.push(c);
  deadMarshesRoundEnd(s);
  assert.deepEqual([a.damage, b.damage, c.damage], [2, 0, 1]);
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  assert.equal(s.staging.find((u) => u.id === a.id)!.damage, 0);
});

test("Gollum immediately escapes at eight tokens, then returns with no tokens and no guard when revealed", () => {
  let s = base();
  const oldId = objective(s).id;
  objective(s).resources = 7;
  deadMarshesAddResources(s, 1);
  assert.ok(!objective(s));
  assert.ok(s.encounterDeck.includes(D.gollum));
  s.encounterDeck = [D.worm];
  s = reveal(s, D.gollum);
  assert.ok(objective(s));
  assert.notEqual(objective(s).id, oldId);
  assert.equal(objective(s).resources, 0);
  assert.deepEqual(
    s.encounterDeck,
    [D.worm],
    "Gollum has no Guarded keyword and deals no guard",
  );
  assert.ok(!s.staging.some((u) => u.guarding === objective(s).id));
  assert.throws(
    () =>
      act(s, { type: "CLAIM", id: objective(s).id, heroId: s.heroes[0].id }),
    /objective|claim|free/,
  );
});

test("Gollum dealt for escape or shadow is discarded rather than automatically returning to staging", () => {
  let s = base();
  s.staging = [];
  s.encounterDeck = [D.gollum, D.worm, "01089"];
  s = commit(begin(s), s.heroes[0].id, s.heroes[1].id);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(objective(s), undefined);
  assert.ok(s.encounterDiscard.includes(D.gollum));
  const enemy = make(s, D.worm);
  s.engaged.push(enemy);
  enemy.shadow = [D.gollum];
  s.combat = {
    enemyId: enemy.id,
    defenderId: null,
    shadows: [D.gollum],
    bonus: 0,
    cancelled: false,
    cancelledEffect: false,
    skipDamage: false,
  } as GameState["combat"];
  shadow(s, D.gollum);
  flush(s);
  assert.equal(objective(s), undefined);
});

test("quest end offers an action window, then party test, then clears quest flags and enters travel exactly once", () => {
  let s = base(leadership, 2);
  s.encounterDeck = [D.worm, D.worm];
  for (const h of allHeroes(s)) {
    h.committed = true;
    h.exhausted = true;
  }
  const courage = attach(s, s.heroes[0], "01057");
  handle(s, fx("finishQuestPhase"));
  flush(s);
  assert.equal(s.escapeTest!.phase, "preparing");
  assert.equal(s.phase, "quest");
  const heroId = s.heroes[0].id;
  s = act(s, { type: "ABILITY", id: heroId, attachmentId: courage.id });
  s = act(s, { type: "RESOLVE_ESCAPE" });
  s = commit(s, heroId);
  s = commit(s);
  assert.ok(allCharacters(s).some((u) => u.committed));
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(objective(s).resources, 2);
  assert.equal(s.phase, "travel");
  assert.equal(s.escapeTest, undefined);
  assert.ok(allCharacters(s).every((u) => !u.committed));
});

test("without Gollum in play there is no quest-end escape test and no final capture", () => {
  const s = base();
  s.staging = [];
  s.stage = 2;
  s.progress = 3;
  advanceQuest(s);
  flush(s);
  assert.equal(s.status, "playing");
  assert.equal(s.stage, 1);
  assert.equal(s.progress, 0);
  handle(s, fx("finishQuestPhase"));
  flush(s);
  assert.equal(s.escapeTest, undefined);
  assert.equal(s.phase, "travel");
});

test("stage one advances at twelve and final capture is offered at three without a premature win", () => {
  let s = base(leadership, 2);
  s.progress = 12;
  advanceQuest(s);
  assert.equal(s.stage, 2);
  assert.equal(s.progress, 0);
  objective(s).resources = 2;
  s.progress = 3;
  advanceQuest(s);
  flush(s);
  assert.equal(s.status, "playing");
  assert.match(s.choice!.title, /Capture/);
  s = choose(s, "player-1");
  assert.equal(s.escapeTest!.capture, true);
  assert.equal(s.escapeTest!.count, 2);
  assert.deepEqual(s.escapeTest!.participants, [1]);
});

test("a successful final test captures Gollum; failed capture resets only quest progress, preserving active location and tokens", () => {
  for (const pass of [false, true]) {
    let s = base(spirit);
    s.stage = 2;
    s.progress = 3;
    objective(s).resources = 2;
    s.encounterDeck = [D.worm, D.worm, "01089"];
    const active = make(s, D.fens);
    active.progress = 1;
    s.activeLocation = active;
    const extra = make(s, D.heart);
    s.staging.push(extra);
    advanceQuest(s);
    flush(s);
    s = choose(s, "player-0");
    s = commit(s, ...(pass ? s.heroes.slice(0, 2).map((h) => h.id) : []));
    s = act(s, { type: "RESOLVE_ESCAPE" });
    assert.equal(s.status, pass ? "won" : "playing");
    if (!pass) {
      assert.equal(s.stage, 1);
      assert.equal(s.progress, 0);
      assert.equal(s.activeLocation!.progress, 1);
      assert.equal(s.activeLocation!.id, active.id);
      assert.equal(objective(s).resources, 2);
      assert.ok(s.staging.some((u) => u.id === extra.id));
      assert.equal(
        s.encounterDeck.length,
        1,
        "reset does not repeat initial setup reveals",
      );
    } else assert.match(s.reason, /Gollum/);
  }
});

test("a zero-card capture still requires positive strength, and failed capture is followed by the ordinary end-quest test", () => {
  let s = base();
  s.stage = 2;
  s.progress = 3;
  s.queue = [fx("finishQuestPhase")];
  // Stage defeat first; its Forced test precedes the later end-quest test.
  s.queue = [];
  advanceQuest(s);
  s.queue.push(fx("finishQuestPhase"));
  flush(s);
  s = choose(s, "player-0");
  assert.equal(s.escapeTest!.count, 0);
  s = commit(s);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(s.stage, 1);
  assert.equal(s.status, "playing");
  assert.equal(s.escapeTest!.phase, "preparing");
  assert.equal(s.escapeTest!.source, D.gollum);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  s = commit(s);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(objective(s).resources, 2);
  assert.equal(s.phase, "travel");
});

test("escape test saves round-trip while committing and in actions, including suspended continuation", () => {
  let s = base(leadership, 2);
  s.queue = [fx("resource", { target: s.heroes[0].id, value: 1, player: 0 })];
  s = begin(s, D.gollum, 0, 2);
  s = choose(s, s.heroes[0].id);
  assert.ok(validateSave(serialized(s)));
  let restored = restoreSave(serialized(s))!;
  assert.deepEqual(restored.escapeTest, s.escapeTest);
  restored = commit(restored);
  restored = commit(restored);
  assert.ok(validateSave(serialized(restored)));
  restored = restoreSave(serialized(restored))!;
  const before = seatView(restored, 0).heroes[0].resources;
  restored = act(restored, { type: "RESOLVE_ESCAPE" });
  assert.equal(seatView(restored, 0).heroes[0].resources, before + 1);
  const bad = serialized(s);
  bad.escapeTest!.participants = [9];
  assert.equal(validateSave(bad), false);
});

test("setup escape tests have the printed post-commit action window before players keep their opening hands", () => {
  let s = createGame(5, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "dead-marshes",
  });
  assert.equal(s.phase, "setup");
  assert.equal(s.escapeTest!.source, D.nightfall);
  s.hand = [make(s, "01021")];
  s = commit(s, s.heroes[0].id);
  assert.equal(canPlay(s, s.hand[0]), null);
  const committedId = s.heroes[0].id;
  s = act(s, { type: "PLAY", id: s.hand[0].id, target: s.heroes[1].id });
  s = choose(s, committedId);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(s.phase, "setup");
  assert.equal(s.escapeTest, undefined);
  s = act(s, { type: "KEEP" });
  assert.equal(s.phase, "planning");
});

test("a failed first-player Lights test may eliminate that player, but remaining players finish their tests", () => {
  let s = base(leadership, 2);
  s.threat = 49;
  syncSeat(s);
  s.encounterDeck = [D.worm, D.worm, D.worm, D.worm];
  s = commit(reveal(s, D.lights));
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.table!.first, 1);
  assert.equal(s.status, "playing");
  assert.deepEqual(s.escapeTest!.participants, [1]);
  s = commit(s);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(s.escapeTest, undefined);
  assert.equal(objective(s).resources, 2);
  assert.ok(s.encounterDiscard.includes(D.lights));
});

test("a selected character leaving during escape contributes no strength and does not leave a dangling save reference", () => {
  let s = base();
  const ally = make(s, "01013");
  s.allies.push(ally);
  s = commit(begin(s), ally.id);
  assert.equal(deadMarshesEscapeStrength(s), 1);
  destroy(
    s,
    s.allies.find((u) => u.id === ally.id)!,
  );
  flush(s);
  assert.equal(deadMarshesEscapeStrength(s), 0);
  assert.ok(validateSave(serialized(s)));
});

test("a player eliminated during the party escape actions window no longer contributes characters or a dealt card", () => {
  let s = base(leadership, 2);
  const boromir = make(s, "02095");
  s.heroes.push(boromir);
  s.threat = 49;
  syncSeat(s);
  s.queue = [fx("finishQuestPhase", { flag: true })];
  s = begin(s, D.gollum, 0, 2);
  s = commit(s, boromir.id);
  s = commit(s);
  assert.equal(s.escapeTest!.count, 2);
  s = act(s, { type: "ABILITY", id: boromir.id });
  s = choose(s, "ready");
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.table!.first, 1);
  assert.equal(deadMarshesEscapeStrength(s), 0);
  assert.equal(s.escapeTest!.count, 1);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.match(
    s.log.filter((l) => /Escape test:/.test(l.text)).at(-1)!.text,
    /from 1 card/,
  );
  assert.equal(objective(s).resources, 2);
  assert.equal(s.phase, "travel");
});

test("Elfhelm can respond to escape treachery threat, but resource tokens still remain on Gollum", () => {
  let s = base();
  const elfhelm = make(s, "02100");
  s.allies.push(elfhelm);
  s = commit(reveal(s, D.nightfall));
  const before = s.threat;
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.match(s.choice!.title, /Elfhelm/);
  s = choose(s, "reduce");
  assert.equal(s.threat, before + 1);
  assert.equal(objective(s).resources, 1);
});

test("canceling a treachery's When Revealed prevents the escape test and discards only that treachery", () => {
  let s = base(spirit);
  s.hand = [make(s, "01050")];
  resolveReveal(s, D.nightfall);
  flush(s);
  const cancel = s.choice!.options.find((o) => o.code === "01050")!;
  assert.ok(cancel);
  s = choose(s, cancel.id);
  assert.equal(s.escapeTest, undefined);
  assert.equal(objective(s).resources, 0);
  assert.ok(s.encounterDiscard.includes(D.nightfall));
  assert.equal(s.encounterDeck.length, 3);
});

test("a positive-strength zero-card capture wins, while absence of Gollum never creates a zero-card win", () => {
  let s = base();
  s.stage = 2;
  s.progress = 3;
  advanceQuest(s);
  flush(s);
  s = choose(s, "player-0");
  s = commit(s, s.heroes[0].id);
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(s.status, "won");
  assert.equal(s.encounterDeck.length, 3);
});

test("treachery threat still applies when Gollum is absent but no resource tokens can be placed", () => {
  let s = base();
  s.staging = [];
  const threat = s.threat;
  s = commit(reveal(s, D.nightfall));
  s = act(s, { type: "RESOLVE_ESCAPE" });
  assert.equal(objective(s), undefined);
  assert.equal(s.threat, threat + 2);
});
