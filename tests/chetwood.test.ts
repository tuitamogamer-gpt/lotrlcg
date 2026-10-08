import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  applyAction,
  createGame,
  publicState,
  validateSave,
  canTravel,
  playTargets,
} from "../src/game/engine";
import { card, imageUrl, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  get,
  make,
  fx,
  stats,
  threatOf,
  stageInfo,
  shuffle,
} from "../src/game/core";
import {
  check,
  damage,
  destroy,
  progress,
  revealed,
  placeEncounter,
  engage,
} from "../src/game/board";
import { handle, flush } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  currentQuestCode,
  currentQuestUnit,
  mainQuestCode,
} from "../src/game/quest-state";
import {
  addCurrentQuestProgress,
  removeCurrentQuestProgress,
  sideQuestStart,
} from "../src/game/side-quests";
import { reduceThreat } from "../src/game/threat-reduction";
import { automatedScenarioId } from "../src/game/support";
import {
  CHETWOOD as C,
  CHETWOOD_ENCOUNTERS,
  CHETWOOD_QUESTS,
  CHETWOOD_RECIPES,
} from "../src/game/chetwood-support";
import {
  chetwoodEncounter,
  chetwoodShadow,
  chetwoodCardEntered,
  chetwoodRefreshEnd,
  chetwoodQuestCount,
} from "../src/game/chetwood";
import { base, choose, reload } from "./chetwood-fixtures";
import type { GameState, Unit } from "../src/game/types";

function settle(s: GameState) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 150, "decisions terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function side(s: GameState, code: string) {
  const u = make(s, code);
  chetwoodCardEntered(s, u, true);
  s.staging.push(u);
  return u;
}
function select(s: GameState, u: Unit) {
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  return choose(s, u.id);
}
function enemy(s: GameState, code = C.orc, player?: number) {
  const u = make(s, code);
  if (player === undefined) s.staging.push(u);
  else forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(19, d.cards, d.heroes, d.id, {
    scenarioId: "intruders-in-chetwood",
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
    assert.ok(i < 50);
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return s;
}

test("Chetwood registers 18 original encounters, one 30-point quest and all twenty original faces", () => {
  assert.equal(CHETWOOD_ENCOUNTERS.length, 18);
  assert.equal(CHETWOOD_QUESTS.length, 1);
  let count = 0;
  for (const c of [...CHETWOOD_ENCOUNTERS, ...CHETWOOD_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code));
    for (const image of [imageUrl(c), c.back_imagesrc].filter(Boolean)) {
      assert.ok(existsSync(`public${image}`));
      count++;
    }
  }
  assert.equal(count, 20);
  assert.equal(card(C.quest).back_quest, 30);
  assert.equal(card(C.rearguard).victory, 10);
  assert.equal(card(C.iarion).is_unique, true);
  for (const r of CHETWOOD_RECIPES)
    assert.equal(automatedScenarioId(r), "intruders-in-chetwood");
  assert.equal(
    automatedScenarioId({ name: "Intruders in Chetwood", mode: "nightmare" }),
    null,
  );
  assert.equal(
    automatedScenarioId({
      name: "Intruders in Chetwood (Campaign)",
      mode: "campaign",
    }),
    null,
  );
});
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Chetwood real ${easy ? "easy" : "standard"} setup for ${players} players keeps exact physical recipes`, () => {
      const s = start(players, easy);
      assert.equal(s.phase, "resource");
      assert.equal(s.stage, 1);
      assert.equal(stageInfo(s).quest, 30);
      assert.equal(stageInfo(s).questImage, card(C.quest).back_imagesrc);
      assert.equal(s.chetwood!.setupLocations.length, players);
      assert.equal(new Set(s.chetwood!.setupLocations).size, players);
      assert.equal(s.encounterDeck.length, (easy ? 24 : 36) - players);
      assert.equal(s.staging.filter((u) => u.code === C.party).length, 1);
      assert.equal(
        allCharacters(s).filter((u) => u.code === C.iarion).length,
        1,
      );
      const actual = [...s.encounterDeck, ...s.staging.map((u) => u.code)];
      const source = CHETWOOD_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const expected = source.cards
        .filter((r) =>
          ["sharedEncounterDeck", "sharedStagingArea"].includes(r.section),
        )
        .flatMap((r) => Array(r.quantity).fill(r.code));
      assert.deepEqual(actual.sort(), expected.sort());
      assert.ok(validateSave(s));
    });
test("Iârion follows the first player and all three X stats count main and both kinds of side quest", () => {
  const s = base(2),
    ally = allCharacters(s).find((u) => u.code === C.iarion)!;
  assert.equal(stats(s, ally).will, 1);
  side(s, C.ambush);
  side(s, "09014");
  assert.deepEqual(
    [stats(s, ally).will, stats(s, ally).attack, stats(s, ally).defense],
    [3, 3, 3],
  );
  s.table!.first = 1;
  check(s);
  assert.ok(seatView(s, 1).allies.some((u) => u.id === ally.id));
  assert.ok(!seatView(s, 0).allies.some((u) => u.id === ally.id));
});
test("quest-stage victory waits for every War Party and controlled Iârion", () => {
  let s = base();
  const party = enemy(s, C.party, 0);
  progress(s, 40);
  assert.equal(s.status, "playing");
  assert.equal(s.progress, 40);
  destroy(s, party);
  check(s);
  assert.equal(s.status, "won");
  s = base();
  placeEncounter(s, C.rescue, false, 0, undefined, true);
  s.progress = 30;
  check(s);
  assert.equal(s.status, "playing");
  s = select(
    s,
    s.staging.find((u) => u.code === C.rescue)!,
  );
  addCurrentQuestProgress(s, 6);
  s = settle(s);
  check(s);
  assert.equal(s.status, "won");
});
test("Iârion's ordinary destruction immediately loses the scenario", () => {
  const s = base(),
    ally = s.allies[0];
  damage(s, ally.id, 4);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Iârion/);
});
test("Orc War Party prevents every staged enemy's damage, while engaged enemies remain vulnerable", () => {
  const s = base(),
    party = enemy(s, C.party),
    other = enemy(s),
    engaged = enemy(s, C.orc, 0);
  damage(s, party.id, 3);
  damage(s, other.id, 2);
  damage(s, engaged.id, 1);
  assert.equal(party.damage, 0);
  assert.equal(other.damage, 0);
  assert.equal(engaged.damage, 1);
  engage(s, party);
  damage(s, other.id, 1);
  assert.equal(other.damage, 1);
  assert.ok(!playTargets(s, make(s, "09012")).some((u) => u.id === party.id));
});
test("automatic engagement is disabled but optional engagement remains legal", () => {
  let s = base(),
    u = enemy(s);
  s.threat = 49;
  s.phase = "encounter";
  handle(s, fx("engagementRound"));
  s = settle(s);
  assert.ok(s.staging.some((x) => x.id === u.id));
  s = applyAction(s, { type: "ENGAGE", id: u.id });
  assert.ok(s.engaged.some((x) => x.id === u.id));
});
test("end-of-refresh adds one threat per staged enemy to every player", () => {
  let s = base(3);
  enemy(s);
  enemy(s);
  enemy(s, C.party, 0);
  side(s, C.ambush);
  chetwoodRefreshEnd(s);
  s = settle(s);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 22);
});
test("encounter side quests enter staging, cannot have their When Revealed canceled and can be selected", () => {
  let s = base();
  s.hand.push(make(s, "01050"));
  revealed(s, C.wilderness);
  flush(s);
  assert.ok(!s.choice?.options.some((o) => /cancel/.test(o.id)));
  assert.equal(s.hand.length, 0);
  assert.equal(s.chetwood!.hiddenHands[s.staging[0].id].length, 1);
  s = select(s, s.staging[0]);
  assert.equal(currentQuestCode(s), C.wilderness);
  assert.equal(mainQuestCode(s), C.quest);
  assert.ok(validateSave(s));
});
test("revealing a side quest offers Iârion's optional ready after its When Revealed", () => {
  let s = base();
  const id = s.allies[0].id;
  s.allies[0].exhausted = true;
  revealed(s, C.rearguard);
  flush(s);
  assert.match(s.choice!.title, /Iârion/);
  s = choose(reload(s), "ready");
  assert.equal(get(s, id)?.exhausted, false);
});
test("Rescue Iârion preserves his physical identity and damage, then returns him exhausted to the current first player", () => {
  let s = base(2);
  const ally = s.allies[0];
  ally.damage = 2;
  ally.committed = true;
  s.committedIds.push(ally.id);
  revealed(s, C.rescue);
  s = settle(s);
  assert.equal(s.chetwood!.captive!.unit.id, ally.id);
  assert.ok(!allCharacters(s).some((u) => u.id === ally.id));
  assert.equal(s.staging[0].timeCounters, 4);
  assert.equal(s.status, "playing");
  s.table!.first = 1;
  s = select(reload(s), s.staging[0]);
  addCurrentQuestProgress(s, 8);
  s = settle(s);
  const returned = seatView(s, 1).allies.find((u) => u.id === ally.id)!;
  assert.equal(returned.damage, 2);
  assert.equal(returned.exhausted, true);
  assert.equal(returned.committed, false);
  assert.equal(s.chetwood!.captive, undefined);
  assert.ok(s.victoryCards?.includes(C.rescue));
  assert.equal(s.victory, 10);
  assert.equal(s.progress, 0);
});
test("Rescue Iârion's Time expires even when the main quest is current", () => {
  let s = base();
  revealed(s, C.rescue);
  s = settle(s);
  s.staging[0].timeCounters = 1;
  s.phase = "refresh";
  handle(s, fx("phaseEnd"));
  s = settle(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /time|Iârion/);
});
test("Lost in the Wilderness hides exact hand cards and returns borrowed cards to their owners", () => {
  let s = base(2);
  const a = make(s, "01050"),
    b = make(s, "01050"),
    borrowed = make(s, "01057");
  a.owner = 0;
  b.owner = 1;
  borrowed.owner = 0;
  s.hand.push(a);
  forOwner(s, 1, () => s.hand.push(b, borrowed));
  revealed(s, C.wilderness);
  s = settle(s);
  const quest = s.staging[0];
  assert.equal(s.chetwood!.hiddenHands[quest.id].length, 3);
  const publicJson = JSON.stringify(publicState(s));
  assert.ok(!publicJson.includes(a.id));
  assert.ok(!publicJson.includes(borrowed.id));
  assert.equal(seatView(s, 0).hand.length + seatView(s, 1).hand.length, 0);
  s = select(reload(s), quest);
  addCurrentQuestProgress(s, 4);
  s = settle(s);
  assert.deepEqual(
    seatView(s, 0)
      .hand.map((u) => u.id)
      .sort(),
    [a.id, borrowed.id].sort(),
  );
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.id),
    [b.id],
  );
  assert.equal(s.chetwood!.hiddenHands[quest.id], undefined);
});
test("Orc Rearguard caps quest progress after the active location, including later direct progress", () => {
  let s = base();
  side(s, C.rearguard);
  s.activeLocation = make(s, "01099");
  progress(s, 12);
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 3);
  addCurrentQuestProgress(s, 2);
  assert.equal(s.progress, 3);
  removeCurrentQuestProgress(s, 2);
  addCurrentQuestProgress(s, 2);
  assert.equal(s.progress, 1);
  s = reload(s);
  s.round++;
  addCurrentQuestProgress(s, 2);
  assert.equal(s.progress, 3);
});
test("Rearguard progress limits survive switching away and back to the same physical quest", () => {
  const s = base();
  side(s, C.rearguard);
  const rescue = side(s, C.rescue);
  s.phase = "quest";
  addCurrentQuestProgress(s, 3);
  handle(s, fx("chetSwitchQuest", { target: rescue.id, code: rescue.code }));
  addCurrentQuestProgress(s, 2);
  assert.equal(rescue.progress, 2);
  handle(
    s,
    fx("chetSwitchQuest", { target: `quest:${C.quest}`, code: C.quest }),
  );
  addCurrentQuestProgress(s, 1);
  assert.equal(s.progress, 3);
  handle(s, fx("chetSwitchQuest", { target: rescue.id, code: rescue.code }));
  addCurrentQuestProgress(s, 5);
  assert.equal(rescue.progress, 3);
});
test("Rearguard counts earlier progress in the round and loses the limit once defeated", () => {
  let s = base();
  addCurrentQuestProgress(s, 4);
  const r = side(s, C.rearguard);
  addCurrentQuestProgress(s, 1);
  assert.equal(s.progress, 4);
  s = select(s, r);
  addCurrentQuestProgress(s, 3);
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.code === C.rearguard));
  assert.equal(s.victory, 10);
  s.phase = "travel";
  addCurrentQuestProgress(s, 5);
  assert.equal(s.progress, 9);
});
test("Rearguard reveals exactly one extra card at staging end when it is current", () => {
  let s = base();
  s = select(s, side(s, C.rearguard));
  s.encounterDeck = [C.orc, "01099"];
  handle(s, fx("questReady"));
  flush(s);
  assert.match(s.choice!.title, /Angmar Orc/);
  s = choose(s, "reveal");
  assert.equal(s.encounterDeck.length, 0);
  assert.equal(s.phase, "staging");
  assert.equal(s.staging.filter((u) => u.code === C.orc).length, 1);
});
test("Orc Ambush boosts every Orc and searches actual deck/discard copies for each player without When Revealed", () => {
  let s = base(2);
  s.encounterDeck = [C.orc, "01099"];
  s.encounterDiscard = [C.marauder];
  revealed(s, C.ambush);
  flush(s);
  assert.match(s.choice!.title, /Search for an Orc/);
  s = choose(reload(s), "deck-0");
  assert.match(s.choice!.title, /Search for an Orc/);
  s = choose(reload(s), "discard-0");
  assert.equal(s.choice, null);
  assert.equal(seatView(s, 0).engaged[0].code, C.orc);
  assert.equal(seatView(s, 1).engaged[0].code, C.marauder);
  const orc = seatView(s, 0).engaged[0];
  assert.equal(stats(s, orc).attack, 3);
  assert.equal(stats(s, orc).defense, 4);
  assert.equal(threatOf(s, orc), 3);
  assert.equal(s.encounterDiscard.length, 0);
  assert.deepEqual(s.encounterDeck, ["01099"]);
});
test("Outlying Homestead prevents all threat reduction only while staged", () => {
  const s = base(),
    l = side(s, C.homestead);
  assert.equal(reduceThreat(s, 5), 0);
  assert.equal(s.threat, 20);
  s.staging = [];
  s.activeLocation = l;
  assert.equal(reduceThreat(s, 5), 5);
  assert.equal(s.threat, 15);
});
test("Rugged Country and Shrouded Hills use actual quest cards and current selection", () => {
  let s = base();
  const l = side(s, C.country),
    hills = side(s, C.hills),
    q = side(s, C.ambush);
  assert.equal(chetwoodQuestCount(s), 2);
  assert.equal(threatOf(s, l), 2);
  assert.equal(threatOf(s, hills), 2);
  s = select(s, q);
  assert.equal(threatOf(s, get(s, l.id)!), 4);
});
test("Shrouded Hills surges only with one quest card in play", () => {
  let s = base();
  s.encounterDeck = ["01099"];
  revealed(s, C.hills);
  s = settle(s);
  assert.equal(s.encounterDeck.length, 0);
  s = base();
  side(s, "09014");
  s.encounterDeck = ["01099"];
  revealed(s, C.hills);
  s = settle(s);
  assert.equal(s.encounterDeck.length, 1);
});
test("Pressing Needs can switch to another physical quest and back to the main quest", () => {
  let s = base();
  const q = side(s, "09014");
  s.phase = "quest";
  revealed(s, C.needs);
  flush(s);
  assert.equal(s.threat, 22);
  s = choose(reload(s), q.id);
  assert.equal(currentQuestCode(s), "09014");
  revealed(s, C.needs);
  flush(s);
  s = choose(reload(s), `quest:${C.quest}`);
  assert.equal(currentQuestCode(s), C.quest);
  assert.equal(s.threat, 24);
});
test("Pressing Needs searches and actually reveals a side quest from discard", () => {
  let s = base();
  s.hand.push(make(s, "01057"));
  s.encounterDiscard = [C.wilderness];
  revealed(s, C.needs);
  flush(s);
  s = choose(reload(s), "search");
  s = choose(
    reload(s),
    s.choice!.options.find((o) => o.code === C.wilderness)!.id,
  );
  assert.equal(s.hand.length, 0);
  assert.ok(s.staging.some((u) => u.code === C.wilderness));
  assert.ok(!s.encounterDiscard.includes(C.wilderness));
});
test("Side-quest defeat responses wait for forced hidden-card returns", () => {
  let s = base();
  const hidden = make(s, "01057");
  s.hand.push(hidden);
  revealed(s, C.wilderness);
  s = settle(s);
  const q = s.staging[0];
  q.attachments.push({
    id: `a${s.nextId++}`,
    code: "10122",
    exhausted: false,
    owner: 0,
  });
  s = select(s, q);
  addCurrentQuestProgress(s, 4);
  assert.equal(s.hand.length, 0);
  flush(s);
  assert.match(s.choice!.title, /The Long Defeat/);
  assert.equal(s.hand[0].id, hidden.id);
  assert.ok(s.discard.includes("10122"));
  assert.equal(reload(s).hand[0].id, hidden.id);
});
test("Chetwood rejects malformed Time, progress history and duplicate captured identities in saves", () => {
  let s = base();
  revealed(s, C.rescue);
  s = settle(s);
  assert.ok(validateSave(s));
  const invalid = structuredClone(s);
  invalid.staging[0].timeCounters = 5;
  assert.equal(validateSave(invalid), false);
  const wrong = structuredClone(s);
  wrong.chetwood!.progressPlaced = { bad: -1 };
  assert.equal(validateSave(wrong), false);
  const duplicate = structuredClone(s);
  duplicate.allies.push(duplicate.chetwood!.captive!.unit);
  assert.equal(validateSave(duplicate), false);
});
