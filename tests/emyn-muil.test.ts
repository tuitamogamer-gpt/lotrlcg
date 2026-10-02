import { applyAction as act } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  availableAbilities,
  canPlay,
  createGame,
  playTargets,
  stats,
  threatOf,
  validateSave,
} from "../src/game/engine";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  advanceQuest,
  check,
  enterAlly,
  progressLocation,
  resolveReveal,
  shadow,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { canPay, make, playCost } from "../src/game/core";
import {
  hasResourceIcon,
  questExhausts,
  restrictedSlots,
} from "../src/game/expansion-passives";
import { seatView, selectSeat, syncSeat } from "../src/game/table";
import { CARROCK, isSacked } from "../src/game/carrock";
import {
  EMYN as E,
  EMYN_MUIL_ENCOUNTERS,
  emynMuilQuestStart,
  emynMuilRevealSurge,
} from "../src/game/emyn-muil";
import type { GameState, Unit } from "../src/game/types";
import recipes from "../public/scenarios.json";
const leadership = STARTERS.find((d) => d.id === "leadership")!;
const spirit = STARTERS.find((d) => d.id === "spirit")!;
function base(deck = leadership) {
  let s = createGame(131, deck.cards, deck.heroes, deck.id, {
    scenarioId: "hills-of-emyn-muil",
  });
  s = act(s, { type: "KEEP" });
  s.queue = [];
  s.choice = null;
  s.hand = [];
  s.encounterDiscard = [];
  return s;
}
const unit = (s: GameState, code: string) => make(s, code);
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  return s;
}
function activate(s: GameState, code: string) {
  s.phase = "travel";
  s.activeLocation = null;
  s.staging = [unit(s, code)];
  return act(s, { type: "TRAVEL", id: s.staging[0].id });
}
const attach = (s: GameState, u: Unit, code: string) =>
  u.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });

test("Emyn Muil registers all12printed encounters and matches normal/easy encounter recipes for1–4players", () => {
  assert.equal(EMYN_MUIL_ENCOUNTERS.length, 12);
  for (const c of EMYN_MUIL_ENCOUNTERS) assert.ok(SCRIPTED.has(c.code), c.name);
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = createGame(
        19,
        leadership.cards,
        leadership.heroes,
        leadership.id,
        {
          scenarioId: "hills-of-emyn-muil",
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
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [E.amonHen, E.amonLhaw],
      );
      const recipe = recipes.find((q) => q.id === (easy ? "E01.7" : "Q01.7"))!;
      const actual: Record<string, number> = {};
      for (const code of s.encounterDeck)
        actual[code] = (actual[code] ?? 0) + 1;
      assert.deepEqual(actual, recipe.sections.sharedEncounterDeck);
      assert.equal(s.encounterDeck.length, easy ? 38 : 53);
      assert.equal(threatOf(s, s.staging[0]), 2 * players);
      assert.ok(validateSave(s));
    }
});

test("one progress, twenty victory and no Emyn Muil locations are all independently necessary", () => {
  const s = base();
  s.progress = 1;
  s.victory = 20;
  advanceQuest(s);
  assert.equal(s.status, "playing");
  s.activeLocation = s.staging.pop()!;
  s.staging = [];
  advanceQuest(s);
  assert.equal(s.status, "playing", "active Emyn Muil also blocks victory");
  s.activeLocation = null;
  s.progress = 0;
  advanceQuest(s);
  assert.equal(s.status, "playing");
  s.progress = 1;
  s.victory = 19;
  advanceQuest(s);
  assert.equal(s.status, "playing");
  s.victory = 20;
  s.staging = [unit(s, "01089"), unit(s, "01095")];
  advanceQuest(s);
  assert.equal(
    s.status,
    "won",
    "non-Emyn enemies/locations need not be cleared",
  );
  assert.match(s.reason, /Emyn|hill|trail/i);
});

test("explored victory locations never enter discard, and the final location completes the quest", () => {
  const s = base();
  s.progress = 1;
  s.victory = 15;
  s.staging = [];
  const lhaw = unit(s, E.amonLhaw);
  s.activeLocation = lhaw;
  progressLocation(s, lhaw, 5);
  check(s);
  assert.equal(s.victory, 20);
  assert.equal(s.status, "won");
  assert.ok(!s.encounterDiscard.includes(E.amonLhaw));
});

test("victory waits until pending encounter and travel effects have finished", () => {
  const s = base();
  s.progress = 1;
  s.victory = 20;
  s.staging = [];
  s.encounterDeck = [E.highlands];
  s.queue = [{ kind: "reveal" }];
  advanceQuest(s);
  assert.equal(s.status, "playing");
  flush(s);
  assert.equal(s.status, "playing");
  assert.ok(s.staging.some((u) => u.code === E.highlands));
});

test("AmonX, OuterRidge threat and HorseThieves attack track current staging locations", () => {
  const s = base();
  const thief = unit(s, E.horseThieves);
  s.staging.push(thief);
  assert.equal(stats(s, thief).attack, 3);
  s.activeLocation = unit(s, E.outerRidge);
  assert.equal(threatOf(s, s.staging[0]), 3);
  assert.equal(threatOf(s, s.staging[1]), 3);
  assert.equal(threatOf(s, thief), 3);
  s.staging.pop();
  s.staging = [thief, unit(s, "01095")];
  assert.equal(stats(s, thief).attack, 2);
  s.staging[1].suppressed = true;
  assert.equal(threatOf(s, s.staging[1]), 0);
});

test("OrcHorseThieves Doomed2 affects every player even without when-revealed text", () => {
  const s = createGame(3, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "hills-of-emyn-muil",
    seats: [leadership, spirit].map((d) => ({
      deckId: d.id,
      heroes: [...d.heroes],
    })),
  });
  s.phase = "staging";
  s.choice = null;
  s.queue = [];
  const before = [seatView(s, 0).threat, seatView(s, 1).threat];
  reveal(s, E.horseThieves);
  assert.equal(seatView(s, 0).threat, before[0] + 2);
  assert.equal(seatView(s, 1).threat, before[1] + 2);
});

test("AmonHen forbids event actions and responses, while Eleanor remains a legal hero response", () => {
  let s = base(spirit);
  s.activeLocation = unit(s, E.amonHen);
  s.staging = [];
  s.phase = "staging";
  s.heroes.forEach((h) => {
    h.resources = 4;
  });
  s.hand = [unit(s, "01050"), unit(s, "01048"), unit(s, "01047")];
  assert.match(canPlay(s, s.hand[0])!, /Amon|event/i);
  assert.equal(canPay(s, card("01050")), false);
  reveal(s, E.rockslide);
  assert.ok(s.choice?.options.some((o) => o.id === "eleanor"));
  assert.ok(!s.choice?.options.some((o) => o.id === "cancel"));
  s.choice = null;
  s.queue = [];
  s.phase = "planning";
  s = activate(s, E.amonLhaw);
  s.phase = "planning";
  assert.equal(
    canPay(s, card("01050")),
    true,
    "restriction ends when Amon Hen leaves the active slot",
  );
});

test("EastWall charges2 extra matching resources only for non-Rohan characters played normally", () => {
  const s = base();
  s.activeLocation = unit(s, E.eastWall);
  assert.equal(
    playCost(s, card("01016")),
    Number(card("01016").cost),
    "Snowbourn Scout is Rohan",
  );
  assert.equal(playCost(s, card("01017")), Number(card("01017").cost) + 2);
  assert.equal(playCost(s, card("01073")), 7);
  assert.equal(playCost(s, card("01022")), Number(card("01022").cost));
  s.phase = "planning";
  s.heroes[0].resources = 1;
  const guard = unit(s, "01017");
  s.hand = [guard];
  assert.match(canPlay(s, guard)!, /resources/i);
});

test("RaurosFalls forces every eligible ready character to quest and leaves exhausted/ineligible characters out", () => {
  let s = base();
  s.activeLocation = unit(s, E.falls);
  s.phase = "quest";
  s.staging = [];
  s.heroes[0].exhausted = true;
  attach(s, s.heroes[2], CARROCK.sacked);
  const ally = unit(s, "01016");
  s.allies.push(ally);
  s.committedIds = [];
  assert.throws(() => act(s, { type: "COMMIT" }), /every|Rauros|Falls/i);
  s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[1].id });
  s = act(s, { type: "TOGGLE_QUEST", id: ally.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(s.heroes[0].committed, false);
  assert.equal(s.heroes[1].committed, true);
  assert.equal(s.heroes[2].committed, false);
  assert.equal(s.allies[0].committed, true);
});

test("AmonLhaw blanks attachment bonuses/icons/actions/conditions and restores them when returned to staging", () => {
  let s = base();
  const hero = s.heroes[0];
  for (const c of [
    "01027",
    "01040",
    "01041",
    "01026",
    "02010",
    "01071",
    CARROCK.sacked,
  ])
    attach(s, hero, c);
  const before = stats(s, hero);
  assert.ok(isSacked(hero));
  s = activate(s, E.amonLhaw);
  const h = s.heroes[0];
  assert.equal(
    h.attachments.length,
    7,
    "blanking never discards an attachment",
  );
  assert.equal(stats(s, h).will, card(h.code).willpower);
  assert.equal(stats(s, h).attack, card(h.code).attack);
  assert.equal(stats(s, h).health, card(h.code).health);
  assert.equal(isSacked(h), false);
  assert.equal(restrictedSlots(h), 0);
  assert.ok(
    availableAbilities(s, h)
      .filter((a) => a.id)
      .every((a) => a.disabled),
  );
  assert.throws(
    () =>
      act(s, {
        type: "ABILITY",
        id: h.id,
        attachmentId: h.attachments.find((a) => a.code === "01026")!.id,
      }),
    /blank|Amon|ability/i,
  );
  s.phase = "staging";
  reveal(s, E.chasm);
  assert.equal(s.activeLocation, null);
  assert.equal(stats(s, s.heroes[0]).will, before.will);
  assert.equal(stats(s, s.heroes[0]).health, before.health);
  assert.ok(isSacked(s.heroes[0]));
  assert.ok(validateSave(s));
});

test("blanking can remove CitadelPlate health immediately and destroy a now-lethally damaged hero", () => {
  let s = base();
  const victim = s.heroes[0];
  attach(s, victim, "01040");
  victim.damage = 6;
  assert.equal(stats(s, victim).health, 9);
  s = activate(s, E.amonLhaw);
  assert.ok(!s.heroes.some((h) => h.id === victim.id));
  assert.ok(s.discard.includes(victim.code));
  assert.ok(s.discard.includes("01040"));
});

test("AmonLhaw blanks Song icons and quest-exhaustion passives without changing printed hero spheres", () => {
  let s = base(spirit);
  const hero = s.heroes[0];
  attach(s, hero, "02010");
  attach(s, hero, "12091");
  assert.equal(hasResourceIcon(hero, "leadership"), true);
  s.heroes.pop();
  assert.equal(questExhausts(s, hero), false);
  s = activate(s, E.amonLhaw);
  assert.equal(hasResourceIcon(s.heroes[0], "leadership"), false);
  assert.equal(hasResourceIcon(s.heroes[0], "spirit"), true);
  assert.equal(questExhausts(s, s.heroes[0]), true);
});

test("blanked attachment traits cannot satisfy Miner of the Iron Hills' Condition target", () => {
  let s = base();
  attach(s, s.heroes[0], CARROCK.sacked);
  s = activate(s, E.amonLhaw);
  const miner = unit(s, "01061");
  enterAlly(s, miner);
  flush(s);
  assert.ok(!s.choice?.options.some((o) => o.code === CARROCK.sacked));
  assert.ok(s.heroes[0].attachments.some((a) => a.code === CARROCK.sacked));
});

test("ImpassableChasm clears active-location progress and preserves attached cards when returning it", () => {
  const s = base();
  s.activeLocation = unit(s, E.falls);
  s.activeLocation.progress = 3;
  attach(s, s.activeLocation, "02056");
  const previous = s.activeLocation;
  reveal(s, E.chasm);
  assert.equal(s.activeLocation, null);
  assert.equal(s.staging.find((u) => u.id === previous.id)?.progress, 0);
  assert.equal(previous.attachments.length, 1);
  assert.ok(s.encounterDiscard.includes(E.chasm));
});

test("quest adds surge to only the first treachery; Chasm can independently add a second surge", () => {
  const s = base();
  s.phase = "staging";
  s.staging = [];
  s.encounterDeck = [E.highlands, E.outerRidge];
  reveal(s, E.chasm);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [E.highlands, E.outerRidge],
  );
  assert.deepEqual(
    s.encounterDeck,
    [E.chasm],
    "the empty encounter deck refills from discard during questing",
  );
  assert.equal(s.emynMuilTreacherySeen, true);
  emynMuilQuestStart(s);
  s.staging = [unit(s, E.highlands)];
  assert.equal(emynMuilRevealSurge(s, E.footing), false);
  s.staging = [];
  assert.equal(
    emynMuilRevealSurge(s, E.rockslide),
    false,
    "first treachery already occurred with a location present",
  );
  emynMuilQuestStart(s);
  assert.equal(emynMuilRevealSurge(s, E.footing), true);
  s.phase = "travel";
  emynMuilQuestStart(s);
  assert.equal(emynMuilRevealSurge(s, E.footing), false);
});

test("canceling Rockslide's when-revealed leaves the quest's added surge intact", () => {
  let s = base(spirit);
  s.phase = "staging";
  s.staging = [];
  s.encounterDeck = [E.highlands];
  s.hand = [unit(s, "01050")];
  s.heroes[0].resources = 2;
  s.heroes[0].committed = true;
  reveal(s, E.rockslide);
  assert.ok(s.choice?.options.some((o) => o.id === "cancel"));
  s = choose(s, "cancel");
  assert.equal(s.heroes[0].damage, 0);
  assert.ok(s.staging.some((u) => u.code === E.highlands));
  assert.ok(
    s.encounterDeck.includes(E.rockslide),
    "the canceled card refills the empty encounter deck after surge",
  );
  assert.equal(s.emynMuilTreacherySeen, true);
});

test("Rockslide damages every committed character across players and ignores uncommitted characters", () => {
  const s = createGame(3, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "hills-of-emyn-muil",
    seats: [leadership, spirit].map((d) => ({
      deckId: d.id,
      heroes: [...d.heroes],
    })),
  });
  s.phase = "staging";
  s.queue = [];
  s.choice = null;
  s.heroes[0].committed = true;
  s.hand = [];
  syncSeat(s);
  selectSeat(s, 1);
  s.hand = [];
  s.heroes[0].committed = true;
  const eleanor = s.heroes.find((h) => h.code === "01008")!;
  eleanor.exhausted = true;
  syncSeat(s);
  selectSeat(s, 0);
  reveal(s, E.rockslide);
  assert.equal(seatView(s, 0).heroes[0].damage, 2);
  assert.equal(seatView(s, 1).heroes[0].damage, 2);
  assert.equal(seatView(s, 0).heroes[1].damage, 0);
  assert.equal(seatView(s, 1).heroes[1].damage, 0);
});

test("SlickFooting removes only available location progress and mills each player's deck by the total removed", () => {
  const s = createGame(3, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "hills-of-emyn-muil",
    seats: [leadership, spirit].map((d) => ({
      deckId: d.id,
      heroes: [...d.heroes],
    })),
  });
  s.phase = "staging";
  s.queue = [];
  s.choice = null;
  s.staging[0].progress = 2;
  s.staging[1].progress = 0;
  s.activeLocation = unit(s, E.falls);
  s.activeLocation.progress = 1;
  s.deck = ["01016", "01017", "01018"];
  s.hand = [];
  syncSeat(s);
  selectSeat(s, 1);
  s.deck = ["01043", "01044", "01045"];
  s.hand = [];
  s.heroes.find((h) => h.code === "01008")!.exhausted = true;
  syncSeat(s);
  selectSeat(s, 0);
  reveal(s, E.footing);
  assert.equal(s.staging[0].progress, 1);
  assert.equal(s.staging[1].progress, 0);
  assert.equal(s.activeLocation?.progress, 0);
  assert.deepEqual(seatView(s, 0).deck, ["01018"]);
  assert.deepEqual(seatView(s, 1).deck, ["01045"]);
  assert.ok(seatView(s, 0).discard.includes("01016"));
  assert.ok(seatView(s, 1).discard.includes("01043"));
});

test("Highlands pays a real encounter reveal before becoming active, including Doomed", () => {
  let s = base();
  s.phase = "travel";
  s.staging = [unit(s, E.highlands)];
  s.encounterDeck = [E.horseThieves];
  const before = s.threat;
  s = act(s, { type: "TRAVEL", id: s.staging[0].id });
  assert.equal(s.activeLocation?.code, E.highlands);
  assert.equal(s.threat, before + 2);
  assert.ok(s.staging.some((u) => u.code === E.horseThieves));
  const empty = base();
  empty.phase = "travel";
  empty.staging = [unit(empty, E.highlands)];
  empty.encounterDeck = [];
  empty.encounterDiscard = [];
  assert.throws(
    () => act(empty, { type: "TRAVEL", id: empty.staging[0].id }),
    /encounter|travel/i,
  );
});

test("Shores requires and discards an event from the first player's hand before traveling", () => {
  let s = base();
  s.phase = "travel";
  s.staging = [unit(s, E.shores)];
  s.hand = [unit(s, "01016")];
  assert.throws(
    () => act(s, { type: "TRAVEL", id: s.staging[0].id }),
    /event/i,
  );
  const event = unit(s, "01022");
  s.hand.push(event);
  s = act(s, { type: "TRAVEL", id: s.staging[0].id });
  assert.equal(s.activeLocation, null);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [event.id],
  );
  s = choose(s, event.id);
  assert.equal(s.activeLocation?.code, E.shores);
  assert.ok(s.discard.includes(event.code));
  assert.equal(
    s.heroes[0].resources,
    1,
    "discarding the event is not playing or paying for it",
  );
});

test("NorthStair moves discard cards and resolves when-revealed, without Doomed/Thalin/reveal responses", () => {
  for (const returned of [E.horseThieves, E.rockslide]) {
    let s = base();
    s.phase = "travel";
    s.staging = [unit(s, E.northStair)];
    s.encounterDiscard = [returned];
    s.heroes[0].committed = true;
    const threat = s.threat;
    s = act(s, { type: "TRAVEL", id: s.staging[0].id });
    assert.equal(s.activeLocation?.code, E.northStair);
    assert.equal(s.threat, threat);
    if (returned === E.horseThieves)
      assert.ok(s.staging.some((u) => u.code === returned));
    else {
      assert.equal(s.heroes[0].damage, 2);
      assert.ok(s.encounterDiscard.includes(returned));
    }
  }
});

test("Rockslide shadow removes all defenders and assigns the attack to a hero as undefended", () => {
  const s = base();
  const enemy = unit(s, E.horseThieves);
  s.engaged = [enemy];
  s.staging = [];
  s.combat = {
    enemyId: enemy.id,
    defenderId: s.heroes[0].id,
    defenderIds: [s.heroes[0].id, s.heroes[1].id],
    attackBonus: 0,
  };
  shadow(s, E.rockslide);
  assert.equal(s.combat.defenderId, null);
  assert.equal(s.combat.defenderIds, undefined);
  handle(s, { kind: "enemyDamage" });
  assert.match(s.choice!.title, /Assign 1 damage/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    s.heroes.map((h) => h.id),
  );
});

test("all three return shadows return an attacking enemy after damage, clear its shadows and preserve damage", () => {
  for (const c of [E.falls, E.outerRidge, E.shores]) {
    const s = base();
    const enemy = unit(s, E.horseThieves);
    enemy.damage = 2;
    enemy.shadows = [c];
    s.engaged = [enemy];
    s.staging = [];
    s.combat = {
      enemyId: enemy.id,
      defenderId: s.heroes[0].id,
      attackBonus: 0,
    };
    shadow(s, c);
    assert.equal(s.engaged.length, 1);
    assert.equal(s.staging.length, 0);
    handle(s, { kind: "enemyDone" });
    assert.equal(s.engaged.length, 0);
    assert.equal(s.staging[0].damage, 2);
    assert.deepEqual(s.staging[0].shadows, []);
    assert.ok(s.encounterDiscard.includes(c));
  }
});
