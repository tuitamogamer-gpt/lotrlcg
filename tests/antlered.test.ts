import assert from "node:assert/strict";
import test from "node:test";
import {
  createGame,
  applyAction,
  validateSave,
  canPlay,
  canPlayAtNoCost,
  publicState,
} from "../src/game/engine.ts";
import { card, imageUrl, STARTERS, SCRIPTED } from "../src/game/cards.ts";
import {
  make,
  fx,
  get,
  locationQuest,
  stagingThreat,
  canPay,
} from "../src/game/core.ts";
import {
  check,
  damage,
  destroy,
  discardCharacter,
  engage,
  placeEncounter,
  progressLocation,
  spendEvent,
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
import { automatedScenarioId } from "../src/game/support.ts";
import {
  ANTLERED as A,
  ANTLERED_ENCOUNTERS,
  ANTLERED_QUESTS,
  ANTLERED_RECIPES,
  RAVEN_CODES,
  printedLocationTime,
} from "../src/game/antlered-support.ts";
import {
  antleredRemoveLocationTime,
  antleredRefreshTime,
  antleredEncounter,
  antleredShadow,
  antleredRoutePiles,
  antleredCardEntered,
  antleredEndRound,
  ravenDraw,
} from "../src/game/antlered.ts";
import { base, choose, reload } from "./antlered-fixtures.ts";
import type { GameState, Unit } from "../src/game/types.ts";
const raven = (name: string) => RAVEN_CODES.find((c) => card(c).name === name)!;
function settle(s: GameState) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 160, "choices terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function loc(
  s: GameState,
  code = A.battlefield,
  active = false,
  time?: number,
) {
  const u = make(s, code);
  antleredCardEntered(s, u, true);
  if (time !== undefined) u.timeCounters = time;
  if (active) s.activeLocation = u;
  else s.staging.push(u);
  return u;
}
function enemy(s: GameState, code = A.warrior, player?: number) {
  const u = make(s, code);
  if (player === undefined) s.staging.push(u);
  else forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function hand(s: GameState, n: number, player = 0) {
  forOwner(s, player, () => {
    s.hand = Array.from({ length: n }, () => make(s, "01050"));
  });
}
function protect(s: GameState) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => s.heroes.forEach((h) => (h.tempDefense = 20)));
}
function attack(s: GameState, u: Unit, shadows: string[], d: Unit) {
  s.phase = "defense";
  u.shadows = shadows;
  return settle(
    applyAction(reload(s), { type: "DEFEND", enemyId: u.id, defenderId: d.id }),
  );
}
function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(27, d.cards, d.heroes, d.id, {
    scenarioId: "the-antlered-crown",
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
    assert.ok(validateSave(s));
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return s;
}
test("Antlered Crown imports 12 encounters, 3 quests, 18 local faces and exact normal/easy recipes", () => {
  assert.equal(ANTLERED_ENCOUNTERS.length, 12);
  assert.equal(ANTLERED_QUESTS.length, 3);
  let faces = 0;
  for (const c of [...ANTLERED_ENCOUNTERS, ...ANTLERED_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code));
    assert.match(imageUrl(c), /^\/cards\//);
    faces++;
    if (c.back_imagesrc) {
      assert.match(imageUrl({ ...c, imagesrc: c.back_imagesrc }), /^\/cards\//);
      faces++;
    }
  }
  assert.equal(faces, 18);
  for (const r of ANTLERED_RECIPES) {
    assert.equal(automatedScenarioId(r), "the-antlered-crown");
    assert.equal(
      r.cards
        .filter((c) => c.section !== "sharedQuestDeck")
        .reduce((n, c) => n + c.quantity, 0),
      r.mode === "easy" ? 36 : 47,
    );
  }
});
for (const easy of [false, true])
  for (let players = 1; players <= 4; players++)
    test(`Antlered Crown ${players}-player ${easy ? "easy" : "normal"} setup preserves both decks and distinct starting enemies`, () => {
      const s = start(players, easy),
        q = s.antlered!;
      assert.ok(validateSave(s));
      assert.equal(s.encounterDeck.length, easy ? 21 : 28);
      assert.equal(q.ravenDeck.length, (easy ? 10 : 14) - players);
      assert.equal(q.setupEnemies.length, players);
      assert.equal(new Set(q.setupEnemies).size, players);
      assert.ok(s.encounterDeck.every((c) => !RAVEN_CODES.includes(c)));
      assert.equal(s.activeLocation?.code, A.battlefield);
      assert.equal(s.activeLocation?.timeCounters, 3);
      assert.equal(
        s.staging.find((u) => u.code === A.warcamp)?.timeCounters,
        3,
      );
      assert.equal(q.time, 3);
      assert.equal(q.setAside.length, 2);
      assert.equal(
        allCharacters(s).find((u) => u.code === A.turch)?.code,
        A.turch,
      );
      assert.equal(
        ownerOf(
          s,
          allCharacters(s).find((u) => u.code === A.turch)!,
        ),
        firstPlayer(s),
      );
    });
test("revealed locations receive Time; an added location does not", () => {
  const s = base();
  placeEncounter(s, A.village, false, 0, undefined, true);
  placeEncounter(s, A.country);
  assert.equal(s.staging[0].timeCounters, 2);
  assert.equal(s.staging[1].timeCounters, 0);
  assert.ok(validateSave(s));
});
test("stage two adds one Raven enemy per player without When Revealed", () => {
  let s = base(2);
  const c = raven("Dunland Tribesman");
  s.antlered!.ravenDeck = [c, c];
  s.antlered!.ravenDiscard = [c];
  s.progress = 10;
  check(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.antlered!.time, 3);
  assert.equal(s.staging.filter((u) => u.code === c).length, 2);
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.equal(s.antlered!.ravenDeck.length, 1);
  assert.equal(s.antlered!.ravenDiscard.length, 0);
  assert.ok(validateSave(s));
});
test("stage three adds physical chief/camp and P minus one enemies without revealing them", () => {
  let s = base(3, 2);
  const ids = s.antlered!.setAside.map((u) => u.id);
  s.antlered!.ravenDeck = Array(3).fill(raven("Dunland Tribesman"));
  s.progress = 15;
  check(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.antlered!.time, 2);
  assert.equal(s.staging.length, 4);
  assert.ok(ids.every((id) => s.staging.some((u) => u.id === id)));
  assert.equal(s.staging.find((u) => u.code === A.camp)?.timeCounters, 0);
  assert.equal(s.antlered!.ravenDeck.length, 1);
  assert.ok(playerOrder(s).every((p) => seatView(s, p).hand.length === 0));
});
test("stage-two quest points apply only in staging and survive location blanking", () => {
  const s = base(1, 2),
    l = loc(s, A.village);
  l.blanked = true;
  assert.equal(locationQuest(s, l), 5);
  s.staging = [];
  s.activeLocation = l;
  assert.equal(locationQuest(s, l), 3);
});
test("Raven enemies and Raven shadows return to their original pile", () => {
  const s = base(),
    code = raven("Dunlending Bandit"),
    u = enemy(s, code, 0);
  s.antlered!.ravenDeck = [raven("Dunland Prowler")];
  u.shadows = [A.country, raven("Dunland Raider")];
  destroy(s, u);
  assert.deepEqual(s.encounterDiscard, [A.country]);
  assert.deepEqual(s.antlered!.ravenDiscard, [raven("Dunland Raider"), code]);
});
test("empty Raven deck immediately reshuffles its discard even outside quest phase", () => {
  const s = base();
  s.phase = "travel";
  s.antlered!.ravenDeck = [RAVEN_CODES[0]];
  s.antlered!.ravenDiscard = [RAVEN_CODES[1]];
  assert.equal(ravenDraw(s), RAVEN_CODES[0]);
  assert.deepEqual(s.antlered!.ravenDeck, [RAVEN_CODES[1]]);
  assert.deepEqual(s.antlered!.ravenDiscard, []);
});
test("Raven routing keeps cards out of a refilled main encounter deck", () => {
  let s = base();
  s.phase = "staging";
  s.encounterDeck = [];
  s.encounterDiscard = [RAVEN_CODES[0], A.country];
  effect(s, fx("reveal"));
  s = settle(s);
  assert.ok(s.antlered!.ravenDeck.includes(RAVEN_CODES[0]));
  assert.ok(s.staging.some((u) => u.code === A.country));
  assert.ok(!s.staging.some((u) => u.code === RAVEN_CODES[0]));
});
test("revealing a Raven Prowler resolves Surge from the main encounter deck", () => {
  let s = base();
  hand(s, 3);
  s.antlered!.ravenDeck = [raven("Dunland Prowler"), raven("Dunland Raider")];
  s.encounterDeck = [A.country];
  effect(s, fx("crownRavenReveal"));
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === raven("Dunland Prowler")));
  assert.ok(s.staging.some((u) => u.code === A.country));
  assert.equal(s.antlered!.ravenDeck.length, 1);
});
test("adding a Raven Prowler skips Surge and preserves both remaining decks", () => {
  const s = base();
  hand(s, 5);
  s.antlered!.ravenDeck = [raven("Dunland Prowler")];
  s.encounterDeck = [A.country];
  effect(s, fx("crownRavenAdd"));
  assert.equal(s.staging.length, 1);
  assert.deepEqual(s.encounterDeck, [A.country]);
  assert.equal(s.queue.length, 0);
});
test("Raven reveal resolves Tribesman draw for every player", () => {
  let s = base(2);
  s.antlered!.ravenDeck = [raven("Dunland Tribesman")];
  effect(s, fx("crownRavenReveal"));
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 1);
});
test("War-camp puts one Raven enemy engaged with each player without revealing", () => {
  let s = base(2);
  const l = loc(s, A.warcamp, false, 1),
    c = raven("Dunland Tribesman");
  s.antlered!.ravenDeck = [c, c];
  antleredRemoveLocationTime(s, [l.id]);
  s = settle(s);
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).engaged[0].code, c);
    assert.equal(seatView(s, p).hand.length, 0);
  }
  assert.equal(get(s, l.id)?.timeCounters, 0);
});
test("War-camp still resolves the engaged Raven enemy's Forced effect", () => {
  let s = base();
  hand(s, 2);
  const l = loc(s, A.warcamp, false, 1);
  s.antlered!.ravenDeck = [raven("Dunland Raider")];
  antleredRemoveLocationTime(s, [l.id]);
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, u) => n + u.damage, 0) +
      s.allies.reduce((n, u) => n + u.damage, 0),
    2,
  );
});
test("Country expires once, using each player's own hand size", () => {
  let s = base(2);
  hand(s, 2);
  hand(s, 4, 1);
  const l = loc(s, A.country, false, 1);
  antleredRemoveLocationTime(s, [l.id]);
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 24);
  antleredRemoveLocationTime(s, [l.id]);
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 22);
});
test("Battlefield damage can be split between characters and survives reload", () => {
  let s = base();
  hand(s, 3);
  const l = loc(s, A.battlefield, false, 1);
  antleredRemoveLocationTime(s, [l.id]);
  flush(s);
  const first = s.heroes[0].id,
    second = s.heroes[1].id;
  s = choose(reload(s), first + ":1");
  s = choose(reload(s), second + ":2");
  s = settle(s);
  assert.equal(get(s, first)?.damage, 1);
  assert.equal(get(s, second)?.damage, 2);
});
test("Camp exhausts only damaged characters across fellowships and resets to three", () => {
  let s = base(2);
  const l = loc(s, A.camp, false, 1);
  s.heroes[0].damage = 1;
  seatView(s, 1).heroes[0].damage = 1;
  antleredRemoveLocationTime(s, [l.id]);
  s = settle(s);
  assert.ok(s.heroes[0].exhausted);
  assert.ok(seatView(s, 1).heroes[0].exhausted);
  assert.equal(s.heroes[1].exhausted, false);
  assert.equal(get(s, l.id)?.timeCounters, 3);
});
test("blanked location loses a removed time counter but does not trigger its Forced text", () => {
  let s = base();
  hand(s, 3);
  const l = loc(s, A.country, false, 1);
  l.blanked = true;
  antleredRemoveLocationTime(s, [l.id]);
  s = settle(s);
  assert.equal(s.threat, 20);
  assert.equal(get(s, l.id)?.timeCounters, 0);
});
test("refresh decrements all Time cards before ordering simultaneous deadlines", () => {
  let s = base();
  hand(s, 2);
  const l = loc(s, A.country, false, 1);
  s.antlered!.time = 1;
  antleredRefreshTime(s);
  flush(s);
  assert.equal(s.antlered!.time, 0);
  assert.equal(l.timeCounters, 0);
  assert.equal(s.choice?.options.length, 2);
  s = settle(s);
  assert.equal(s.antlered!.time, 3);
  assert.equal(s.threat, 22);
});
test("stage-one deadline removes location time and resolves its last-counter effect", () => {
  let s = base();
  hand(s, 2);
  const l = loc(s, A.country, false, 1);
  s.antlered!.time = 1;
  removeQuestTime(s);
  s = settle(s);
  assert.equal(get(s, l.id)?.timeCounters, 0);
  assert.equal(s.threat, 22);
  assert.equal(s.antlered!.time, 3);
});
test("stage-two deadline reveals one Raven card regardless of player count", () => {
  let s = base(3, 2);
  s.antlered!.ravenDeck = Array(3).fill(raven("Dunland Tribesman"));
  s.antlered!.time = 1;
  removeQuestTime(s);
  s = settle(s);
  assert.equal(s.staging.length, 1);
  assert.equal(s.antlered!.ravenDeck.length, 2);
  assert.equal(s.antlered!.time, 3);
});
test("stage-three deadline makes engaged enemies attack and resets to two", () => {
  let s = base(2, 3);
  protect(s);
  enemy(s, A.skirmisher, 0);
  enemy(s, A.skirmisher, 1);
  s.encounterDeck = [A.camp, A.camp];
  s.antlered!.time = 1;
  removeQuestTime(s);
  s = settle(s);
  assert.equal(s.antlered!.time, 2);
  assert.equal(s.status, "playing");
  assert.ok(allCharacters(s).filter((u) => u.exhausted).length >= 1);
});
test("Raising the Cry resolves last-counter effects before refilling zero-time locations", () => {
  let s = base();
  hand(s, 2);
  const l = loc(s, A.country, false, 1),
    c = loc(s, A.camp, false, 0);
  antleredEncounter(s, A.cry);
  s = settle(s);
  assert.equal(s.threat, 22);
  assert.equal(get(s, l.id)?.timeCounters, 4);
  assert.equal(get(s, c.id)?.timeCounters, 3);
});
test("Raising the Cry gains Surge with only an active location", () => {
  let s = base();
  loc(s, A.battlefield, true, 3);
  s.encounterDeck = [A.country];
  antleredEncounter(s, A.cry);
  s = settle(s);
  assert.equal(s.activeLocation?.timeCounters, 2);
  assert.equal(s.staging[0].code, A.country);
  assert.equal(s.staging[0].timeCounters, 4);
});
test("Raven Warrior allocates time across locations and resolves all deadlines after allocation", () => {
  let s = base();
  hand(s, 3);
  const a = loc(s, A.country, false, 1),
    b = loc(s, A.village, false, 2),
    u = enemy(s);
  s.antlered!.ravenDeck = [raven("Dunlending Bandit")];
  engage(s, u);
  flush(s);
  assert.equal(a.timeCounters, 1);
  s = choose(reload(s), a.id);
  assert.equal(s.threat, 20);
  s = choose(reload(s), b.id);
  s = choose(reload(s), b.id);
  s = settle(s);
  assert.equal(s.threat, 23);
  assert.equal(get(s, a.id)?.timeCounters, 0);
  assert.equal(get(s, b.id)?.timeCounters, 0);
  assert.ok(s.staging.some((u) => u.code === raven("Dunlending Bandit")));
});
test("Raven Warrior removes as many counters as exist when the hand is larger", () => {
  let s = base();
  hand(s, 5);
  const l = loc(s, A.battlefield, false, 1);
  engage(s, enemy(s));
  s = settle(s);
  assert.equal(get(s, l.id)?.timeCounters, 0);
  assert.equal(s.status, "playing");
});
test("Skirmisher cannot choose to remove a nonexistent active counter", () => {
  const s = base();
  loc(s, A.country, true, 0);
  antleredEncounter(s, A.skirmisher);
  assert.deepEqual(
    s.choice?.options.map((o) => o.id),
    ["reveal"],
  );
});
test("Skirmisher removal immediately triggers the active location deadline", () => {
  let s = base();
  hand(s, 2);
  loc(s, A.country, true, 1);
  antleredEncounter(s, A.skirmisher);
  s = choose(reload(s), "time");
  s = settle(s);
  assert.equal(s.threat, 22);
  assert.equal(s.activeLocation?.timeCounters, 0);
});
test("Fierce Folk draws three per player then blocks paid, free and response events", () => {
  let s = base(2);
  antleredEncounter(s, A.folk);
  s = settle(s);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      assert.equal(s.hand.length, 3);
      const u = make(s, "01050");
      s.hand.push(u);
      assert.match(canPlay(s, u)!, /Fierce Folk/);
      assert.match(canPlayAtNoCost(s, u)!, /Fierce Folk/);
      assert.equal(canPay(s, card("01050")), false);
      assert.throws(() => spendEvent(s, "01050"), /Fierce Folk/);
    });
  s.round++;
  assert.notEqual(
    canPlay(s, make(s, "01050")),
    "Fierce Folk prevents playing events until the end of this round.",
  );
});
test("cancelled Fierce Folk still resolves Doomed but neither draw nor event lock", () => {
  let s = base();
  s.hand = [make(s, "01050")];
  s.heroes[0].code = "01007";
  s.encounterDeck = [A.folk];
  effect(s, fx("reveal"));
  flush(s);
  const cancel = s.choice?.options.find((o) => o.id === "cancel");
  assert.ok(cancel, JSON.stringify(s.choice));
  s = choose(reload(s), cancel.id);
  s = settle(s);
  assert.equal(s.threat, 23);
  assert.equal(s.antlered!.eventsBlockedRound, undefined);
  assert.equal(s.hand.length, 0);
});
test("Driven Back removes only staging progress and adds that much total threat", () => {
  const s = base(),
    a = loc(s, A.country),
    b = loc(s, A.village),
    active = loc(s, A.battlefield, true);
  a.progress = 2;
  b.progress = 1;
  active.progress = 4;
  const before = stagingThreat(s);
  antleredEncounter(s, A.back);
  assert.equal(a.progress, 0);
  assert.equal(b.progress, 0);
  assert.equal(active.progress, 4);
  assert.equal(stagingThreat(s), before + 3);
});
test("Driven Back with no removed progress gains Surge", () => {
  let s = base();
  s.encounterDeck = [A.country];
  antleredEncounter(s, A.back);
  s = settle(s);
  assert.equal(s.staging[0].code, A.country);
});
test("Turch is immune to player effects and can defend twice without exhausting", () => {
  let s = base();
  const t = s.allies.find((u) => u.code === A.turch)!;
  assert.ok(playerCardImmune(t));
  const a = enemy(s, A.skirmisher, 0),
    b = enemy(s, A.skirmisher, 0);
  s = attack(s, a, [A.camp], t);
  assert.equal(get(s, t.id)?.exhausted, false);
  s = attack(s, get(s, b.id)!, [A.camp], get(s, t.id)!);
  assert.equal(get(s, t.id)?.exhausted, false);
  assert.equal(get(s, t.id)?.damage, 2);
});
test("Chief Turch follows the first player with his physical state intact", () => {
  const s = base(2),
    t = s.allies[0];
  t.damage = 1;
  s.table!.first = 1;
  check(s);
  assert.equal(ownerOf(s, t), 1);
  assert.equal(seatView(s, 1).allies[0].id, t.id);
  assert.equal(seatView(s, 1).allies[0].damage, 1);
  assert.equal(seatView(s, 0).allies.length, 0);
});
for (const mode of ["destroy", "discard"] as const)
  test(`Turch leaving by ${mode} loses the game`, () => {
    const s = base(),
      t = s.allies[0];
    if (mode === "destroy") damage(s, t.id, 5);
    else discardCharacter(s, t);
    check(s);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Turch/);
  });
test("Chief cannot be damaged while his Camp is in play, even when Camp text is blank", () => {
  const s = base(1, 3),
    c = enemy(s, A.chief),
    l = loc(s, A.camp);
  l.blanked = true;
  assert.equal(damage(s, c.id, 9), false);
  assert.equal(c.damage, 0);
  s.staging = s.staging.filter((u) => u.id !== l.id);
  assert.equal(damage(s, c.id, 9), true);
  assert.ok(s.victoryCards?.includes(A.chief));
  assert.equal(s.status, "playing");
  antleredEndRound(s);
  assert.equal(s.status, "won");
});
test("Chief's no-attachment text rejects attachments during board checks", () => {
  const s = base(1, 3),
    u = enemy(s, A.chief);
  u.attachments.push({
    id: make(s, "01056").id,
    code: "01056",
    exhausted: false,
    owner: 0,
  });
  check(s);
  assert.equal(u.attachments.length, 0);
  assert.ok(s.discard.includes("01056"));
});
test("Chief attack removes active time before the defender is chosen", () => {
  let s = base(1, 3);
  hand(s, 2);
  loc(s, A.country, true, 1);
  const u = enemy(s, A.chief, 0);
  s.encounterDeck = [A.camp];
  effect(s, fx("immediateAttack", { target: u.id }));
  flush(s);
  assert.equal(s.threat, 22);
  assert.equal(s.activeLocation?.timeCounters, 0);
  assert.match(s.choice?.title ?? "", /attack/i);
});
test("Country shadow uses printed Time X even at zero current counters", () => {
  let s = base();
  loc(s, A.country, true, 0);
  protect(s);
  const u = enemy(s, A.skirmisher, 0);
  s = attack(s, u, [A.country], s.heroes[0]);
  assert.equal(
    allCharacters(s).reduce((n, u) => n + u.damage, 0),
    4,
  );
});
test("Skirmisher shadow uses printed Time X rather than remaining counters", () => {
  let s = base();
  loc(s, A.country, true, 0);
  const u = enemy(s, A.skirmisher, 0);
  s.heroes[0].tempDefense = 2;
  s.phase = "defense";
  u.shadows = [A.skirmisher];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: u.id,
    defenderId: s.heroes[0].id,
  });
  assert.ok(s.status === "playing");
  s = settle(s);
  assert.equal(s.heroes[0].damage, 3);
});
test("Village shadow inserts and resolves two Raven shadows during the same attack", () => {
  let s = base();
  protect(s);
  const u = enemy(s, A.skirmisher, 0);
  s.antlered!.ravenDeck = [
    raven("Dunland Tribesman"),
    raven("Dunlending Bandit"),
  ];
  s = attack(s, u, [A.village], s.heroes[0]);
  assert.equal(get(s, u.id)?.shadows.length, 3);
  assert.equal(get(s, u.id)?.revealedShadowCount, 3);
  assert.equal(s.antlered!.ravenDeck.length, 0);
  effect(s, fx("endCombat"));
  s = settle(s);
  assert.ok(
    s.antlered!.ravenDeck.length + s.antlered!.ravenDiscard.length === 2,
  );
  assert.ok(!s.encounterDiscard.some((c) => RAVEN_CODES.includes(c)));
});
test("Battlefield shadow deals direct damage to the defender before combat damage", () => {
  let s = base();
  protect(s);
  const u = enemy(s, A.skirmisher, 0);
  s = attack(s, u, [A.battlefield], s.heroes[0]);
  assert.equal(s.heroes[0].damage, 1);
});
test("Fierce Folk shadow removes active time only when combat destroys a character", () => {
  let s = base();
  hand(s, 2);
  loc(s, A.country, true, 1);
  const ally = make(s, "01016");
  s.allies.push(ally);
  const u = enemy(s, A.warrior, 0);
  s = attack(s, u, [A.folk], ally);
  assert.equal(s.activeLocation?.timeCounters, 0);
  assert.equal(s.threat, 22);
});
test("Crown state hides deck contents from public state and rejects malformed counters/piles", () => {
  const s = base();
  s.antlered!.ravenDeck = [RAVEN_CODES[0]];
  assert.equal(publicState(s).ravenDeck, 1);
  assert.ok(!JSON.stringify(publicState(s)).includes(RAVEN_CODES[0]));
  s.antlered!.ravenDeck = [A.country];
  assert.equal(validateSave(s), false);
  s.antlered!.ravenDeck = [];
  const l = loc(s, A.country);
  l.timeCounters = 5;
  assert.equal(validateSave(s), false);
  l.timeCounters = 4;
  assert.ok(validateSave(s));
});

test("travelling to a stage-two location removes the quest-point bonus and explores it immediately", () => {
  let s = base(1, 2);
  s.phase = "travel";
  const l = loc(s, A.village);
  l.progress = 3;
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: l.id }));
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes(A.village));
  assert.ok(!s.staging.some((u) => u.id === l.id));
});
test("leaving stage two explores staging locations already at their printed quest points", () => {
  let s = base(1, 2);
  const l = loc(s, A.village);
  l.progress = 3;
  s.progress = 15;
  check(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.ok(s.encounterDiscard.includes(A.village));
  assert.ok(!s.staging.some((u) => u.id === l.id));
});
test("ordinary combat defeat of Raven Chief waits for the round-end victory window", () => {
  let s = base(1, 3);
  s.phase = "attack";
  const u = enemy(s, A.chief, 0);
  u.damage = 8;
  s.heroes[0].tempAttack = 10;
  s = settle(
    applyAction(reload(s), {
      type: "ATTACK",
      enemyId: u.id,
      attackerIds: [s.heroes[0].id],
    }),
  );
  assert.ok(s.victoryCards?.includes(A.chief));
  assert.equal(s.status, "playing");
  effect(s, fx("endRound"));
  s = settle(s);
  assert.equal(s.status, "won");
});
test("defeating Chief does not save players if Turch leaves before round end", () => {
  const s = base(1, 3),
    u = enemy(s, A.chief);
  damage(s, u.id, 9);
  damage(s, s.allies[0].id, 5);
  antleredEndRound(s);
  assert.equal(s.status, "lost");
});
test("a prevented Chief attack neither removes time nor triggers its location", () => {
  let s = base(1, 3);
  hand(s, 2);
  loc(s, A.country, true, 1);
  const u = enemy(s, A.chief, 0);
  u.feinted = true;
  effect(s, fx("immediateAttack", { target: u.id }));
  s = settle(s);
  assert.equal(s.threat, 20);
  assert.equal(s.activeLocation?.timeCounters, 1);
});
test("Fierce Folk lock starts after drawing and its forced draw reactions resolve", () => {
  let s = base();
  const berserker = enemy(s, raven("Dunland Berserker"), 0);
  protect(s);
  s.encounterDeck = [A.camp];
  antleredEncounter(s, A.folk);
  flush(s);
  assert.ok(s.choice);
  assert.equal(s.antlered!.eventsBlockedRound, undefined);
  assert.ok(get(s, berserker.id));
  s = settle(s);
  assert.equal(s.antlered!.eventsBlockedRound, s.round);
  assert.equal(s.hand.length, 3);
});
test("Raven Warrior shadow can discard a controlled trap attached to an enemy", () => {
  let s = base();
  protect(s);
  const u = enemy(s, A.skirmisher, 0),
    trap = make(s, "01056");
  u.attachments.push({
    id: trap.id,
    code: trap.code,
    exhausted: false,
    owner: 0,
    controller: 0,
  });
  s = attack(s, u, [A.warrior], s.heroes[0]);
  assert.equal(get(s, u.id)?.attachments.length, 0);
  assert.ok(s.discard.includes("01056"));
});
test("Village extra shadows honor Silver Lamp when a different ready hero carries it", () => {
  let s = base();
  protect(s);
  s.heroes[1].attachments.push({
    id: make(s, "07009").id,
    code: "07009",
    exhausted: false,
  });
  const u = enemy(s, A.skirmisher, 0);
  s.antlered!.ravenDeck = [
    raven("Dunland Tribesman"),
    raven("Dunlending Bandit"),
  ];
  s = attack(s, u, [A.village], s.heroes[0]);
  assert.deepEqual(get(s, u.id)?.faceupShadows, [false, true, true]);
});
test("Raising the Cry cancellation keeps every location counter unchanged and prevents conditional Surge", () => {
  let s = base();
  const l = loc(s, A.country, true, 1);
  s.heroes[0].code = "01007";
  s.hand = [make(s, "01050")];
  s.encounterDeck = [A.cry, A.village];
  effect(s, fx("reveal"));
  flush(s);
  s = choose(reload(s), "cancel");
  s = settle(s);
  assert.equal(get(s, l.id)?.timeCounters, 1);
  assert.deepEqual(s.encounterDeck, [A.village]);
});
test("stage two's front-side additions do not gain location bonuses until stage ready", () => {
  const s = base(1, 2),
    l = loc(s, A.country);
  s.stageRevealing = true;
  assert.equal(locationQuest(s, l), 6);
  s.stageRevealing = false;
  assert.equal(locationQuest(s, l), 8);
});

test("a normal Chief attack resolves Camp exhaustion before its defender is finally declared", () => {
  let s = base(1, 3);
  s.phase = "defense";
  const l = loc(s, A.camp, true, 1),
    chief = enemy(s, A.chief, 0);
  const initiallySelected = s.heroes[0];
  initiallySelected.damage = 1;
  chief.shadows = [A.camp];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: chief.id,
    defenderId: initiallySelected.id,
  });
  assert.equal(get(s, l.id)?.timeCounters, 3);
  assert.equal(get(s, initiallySelected.id)?.exhausted, true);
  assert.equal(s.combat, null);
  assert.match(s.choice?.title ?? "", /Declare defenders/);
  assert.ok(!s.choice?.options.some((o) => o.id === initiallySelected.id));
  s.heroes[1].tempDefense = 20;
  s = choose(reload(s), s.heroes[1].id);
  s = settle(s);
  assert.equal(get(s, l.id)?.timeCounters, 3, "attack-start is not repeated");
  assert.equal(
    get(s, chief.id)?.revealedShadowCount,
    1,
    "the already dealt shadow is retained",
  );
});
test("normal Chief defense allows Stand Together after the Time effect", () => {
  let s = base(1, 3);
  s.phase = "defense";
  s.standTogether = true;
  const chief = enemy(s, A.chief, 0);
  chief.shadows = [A.camp];
  loc(s, A.country, true, 2);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: chief.id,
    defenderIds: [s.heroes[0].id, s.heroes[1].id],
  });
  s = choose(reload(s), s.heroes[0].id);
  s = choose(reload(s), s.heroes[1].id);
  s = choose(reload(s), "defend");
  s = settle(s);
  assert.ok(s.heroes[0].exhausted && s.heroes[1].exhausted);
  assert.equal(s.activeLocation?.timeCounters, 1);
});

test("A Elbereth! Gilthoniel! sends a departing Raven enemy to its origin discard instead of the main deck", () => {
  let s = base();
  s.heroes[0].code = "01007";
  s.hand = [make(s, "04132")];
  const code = raven("Dunlending Bandit"),
    u = enemy(s, code, 0);
  s.antlered!.ravenDeck = [raven("Dunland Prowler")];
  effect(s, fx("shadowFlameElberethBottom", { target: u.id }));
  s = settle(s);
  assert.ok(!get(s, u.id));
  assert.ok(s.antlered!.ravenDiscard.includes(code));
  assert.ok(!s.encounterDeck.includes(code));
  assert.ok(!s.encounterDiscard.includes(code));
});
