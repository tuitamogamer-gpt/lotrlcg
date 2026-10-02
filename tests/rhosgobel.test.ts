import { applyAction as act } from "./pass-resource-window.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  canPlay,
  createGame,
  playTargets,
  restoreSave,
  stats,
  threatOf,
  validateSave,
} from "../src/game/engine";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  advanceQuest,
  check,
  damage,
  destroy,
  progress,
  progressLocation,
  resolveReveal,
  returnAlly,
  shadow,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { fx, isGuarded, make } from "../src/game/core";
import {
  allCharacters,
  forOwner,
  ownerOf,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  RHOS as R,
  RHOSGOBEL_ENCOUNTERS,
  RHOSGOBEL_QUESTS,
  rhosgobelCanFight,
  rhosgobelHealingAllowed,
  rhosgobelHeal,
} from "../src/game/rhosgobel";
import { SCENARIOS } from "../src/game/scenarios";
import type { GameState, Unit } from "../src/game/types";
import recipes from "../public/scenarios.json";

const leadership = STARTERS.find((d) => d.id === "leadership")!;
const lore = STARTERS.find((d) => d.id === "lore")!;
const tactics = STARTERS.find((d) => d.id === "tactics")!;
function base(deck = leadership, players = 1) {
  let s = createGame(737, deck.cards, deck.heroes, deck.id, {
    scenarioId: "journey-to-rhosgobel",
    ...(players > 1
      ? {
          seats: [leadership, tactics].map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  s.queue = [];
  s.choice = null;
  s.hand = [];
  s.encounterDiscard = [];
  s.phase = "planning";
  selectSeat(s, 0);
  if (s.table) {
    s.table.turn = 0;
    s.table.passed = [];
  }
  return s;
}
const unit = (s: GameState, code: string) => make(s, code);
const eagle = (s: GameState) =>
  allCharacters(s).find((u) => u.code === R.wilyador)!;
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  return s;
}
function attach(s: GameState, u: Unit, code: string) {
  const a = { id: `a${s.nextId++}`, code, exhausted: false };
  u.attachments.push(a);
  return a;
}
function final(s: GameState, wounds: number, count: number, removeRhos = true) {
  s.stage = 2;
  s.progress = 12;
  eagle(s).damage = wounds;
  if (removeRhos) s.staging = s.staging.filter((u) => u.code !== R.rhosgobel);
  for (let i = 0; i < count; i++)
    attach(s, s.heroes[i % s.heroes.length], R.athelas);
  advanceQuest(s);
  flush(s);
  return s;
}

test("Rhosgobel registers nine original encounters and exactly matches 1–4player normal/easy setup", () => {
  assert.equal(RHOSGOBEL_ENCOUNTERS.length, 9);
  for (const c of RHOSGOBEL_ENCOUNTERS) assert.ok(SCRIPTED.has(c.code), c.name);
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = createGame(
        7,
        leadership.cards,
        leadership.heroes,
        leadership.id,
        {
          scenarioId: "journey-to-rhosgobel",
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
      const recipe = recipes.find((q) => q.id === (easy ? "E01.6" : "Q01.6"))!;
      const actual: Record<string, number> = {};
      for (const c of s.encounterDeck) actual[c] = (actual[c] ?? 0) + 1;
      assert.deepEqual(actual, recipe.sections.sharedEncounterDeck);
      assert.equal(s.encounterDeck.length, easy ? 37 : 53);
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [R.rhosgobel],
      );
      assert.equal(eagle(s).damage, 2);
      assert.equal(eagle(s).resources, 0);
      assert.equal(ownerOf(s, eagle(s)), 0);
      assert.equal(threatOf(s, s.staging[0]), players);
      assert.ok(validateSave(s));
    }
});

test("every new quest stage uses the exact imported printed reverse face", () => {
  const q = SCENARIOS.find((q) => q.id === "journey-to-rhosgobel")!;
  assert.deepEqual(
    q.stages.map((x) => x.quest),
    [8, 12, 0],
  );
  for (const s of q.stages) {
    assert.equal(
      RHOSGOBEL_QUESTS.find((c) => c.code === s.cardCode)?.type_code,
      "quest",
    );
    assert.match(s.questImage!, /\.B\.jpg$/);
  }
});

test("Wilyador is an ordinary controlled Eagle ally for questing and legal Eagle combat", () => {
  let s = base();
  const npc = eagle(s);
  s.phase = "quest";
  s.staging = [];
  s.encounterDeck = [R.grove];
  assert.deepEqual(stats(s, npc), {
    will: 1,
    attack: 1,
    defense: 1,
    health: 20,
  });
  s = act(s, { type: "TOGGLE_QUEST", id: npc.id });
  s = act(s, { type: "COMMIT" });
  assert.ok(eagle(s).committed);
  assert.ok(eagle(s).exhausted);
  assert.ok(rhosgobelCanFight(unit(s, R.bats), eagle(s)));
});

test("Rhosgobel cannot be traveled to until stage one completes, but staging progress can explore it early", () => {
  let s = base();
  s.phase = "travel";
  assert.throws(
    () => act(s, { type: "TRAVEL", id: s.staging[0].id }),
    /stage one|stage 1/i,
  );
  s.progress = 8;
  advanceQuest(s);
  assert.equal(s.stage, 2);
  assert.equal(s.progress, 0);
  s = act(s, { type: "TRAVEL", id: s.staging[0].id });
  assert.equal(s.activeLocation?.code, R.rhosgobel);
  assert.ok(rhosgobelHealingAllowed(s, eagle(s)));
  const early = base();
  progressLocation(early, early.staging[0], 4);
  assert.equal(early.stage, 1);
  assert.equal(early.victory, 4);
  assert.ok(rhosgobelHealingAllowed(early, eagle(early)));
  assert.ok(!early.encounterDiscard.includes(R.rhosgobel));
});

test("stage two advances at twelve and stage three resolves five healing separately for each controlled Athelas", () => {
  const s = base();
  s.stage = 2;
  s.progress = 11;
  advanceQuest(s);
  assert.equal(s.stage, 2);
  final(s, 15, 3);
  assert.equal(s.stage, 3);
  assert.equal(s.status, "won");
  assert.equal(eagle(s).damage, 0);
  assert.match(s.reason, /Wilyador|Eagle|Rhosgobel/i);
});

test("stage three loses immediately if Athelas leaves any damage, or Rhosgobel still blocks all healing", () => {
  const insufficient = final(base(), 16, 3);
  assert.equal(insufficient.status, "lost");
  assert.equal(eagle(insufficient).damage, 1);
  const blocked = final(base(), 2, 4, false);
  assert.equal(blocked.status, "lost");
  assert.equal(eagle(blocked).damage, 2);
  const alreadyHealed = final(base(), 0, 0);
  assert.equal(alreadyHealed.status, "won");
});
test("each separate final Athelas treatment offers Elrond before the printed final outcome check", () => {
  let s = base(lore);
  s.heroes[2] = make(s, "04128");
  final(s, 12, 2);
  assert.equal(s.status, "playing");
  assert.equal(eagle(s).damage, 7);
  assert.equal(s.choice!.title, "Elrond · After another card heals");
  s = choose(s, "heal");
  assert.equal(eagle(s).damage, 1);
  assert.equal(s.status, "playing");
  assert.equal(s.choice!.title, "Elrond · After another card heals");
  assert.ok(validateSave(s));
  s = restoreSave(JSON.parse(JSON.stringify(s)))!;
  s = choose(s, "heal");
  assert.equal(eagle(s).damage, 0);
  assert.equal(s.status, "won");
  assert.equal(s.choice, null);
});
test("declining the final Athelas Elrond response retains the remaining wound and loses", () => {
  let s = base(lore);
  s.heroes[2] = make(s, "04128");
  final(s, 6, 1);
  assert.equal(eagle(s).damage, 1);
  assert.equal(s.status, "playing");
  s = choose(s, "skip");
  assert.equal(s.status, "lost");
  assert.equal(eagle(s).damage, 1);
});
test("final treatment's quest-card source permits another player's Elrond, but blocked healing never creates a response", () => {
  let s = base(leadership, 2);
  forOwner(s, 1, () => {
    s.heroes[2] = make(s, "04128");
  });
  final(s, 6, 1);
  assert.equal(s.table!.active, 1);
  s = choose(s, "heal");
  assert.equal(s.status, "won");
  assert.equal(eagle(s).damage, 0);
  const blocked = base(lore);
  blocked.heroes[2] = make(blocked, "04128");
  final(blocked, 6, 2, false);
  assert.equal(blocked.status, "lost");
  assert.equal(blocked.choice, null);
  assert.equal(eagle(blocked).damage, 6);
});

test("only controlled Athelas counts at the final treatment, including objectives controlled by other seats", () => {
  const s = base(leadership, 2);
  s.staging.push(unit(s, R.athelas));
  forOwner(s, 1, () => {
    attach(s, s.heroes[0], R.athelas);
  });
  final(s, 10, 1);
  assert.equal(s.status, "won");
  assert.equal(eagle(s).damage, 0);
  const unclaimed = base();
  unclaimed.staging.push(unit(unclaimed, R.athelas));
  final(unclaimed, 2, 0);
  assert.equal(unclaimed.status, "lost");
});

test("Wilyador leaving play loses immediately through destruction, return-to-hand or controller elimination", () => {
  const destroyed = base(leadership, 2);
  damage(destroyed, eagle(destroyed).id, 18);
  assert.equal(destroyed.status, "lost");
  assert.match(destroyed.reason, /Wilyador|Eagle/i);
  const returned = base();
  returnAlly(returned, eagle(returned));
  check(returned);
  assert.equal(returned.status, "lost");
  const eliminated = base(leadership, 2);
  eliminated.threat = 50;
  check(eliminated);
  assert.equal(eliminated.status, "lost");
  assert.equal(seatView(eliminated, 1).heroes.length, 3);
});

test("Wilyador suffers two damage each end of round and follows the next first player without losing state", () => {
  let s = base(leadership, 2);
  const npcId = eagle(s).id;
  handle(s, fx("refreshReady"));
  flush(s);
  s = act(s, { type: "NEXT" });
  assert.equal(s.round, 2);
  assert.equal(eagle(s).damage, 4);
  assert.equal(eagle(s).id, npcId);
  assert.equal(s.table?.first, 1);
  assert.equal(ownerOf(s, eagle(s)), 1);
  assert.ok(!seatView(s, 0).allies.some((u) => u.code === R.wilyador));
  assert.ok(validateSave(s));
  assert.equal(ownerOf(restoreSave(s)!, eagle(restoreSave(s)!)), 1);
  eagle(s).damage = 18;
  handle(s, fx("refreshReady"));
  flush(s);
  s = act(s, { type: "NEXT" });
  assert.equal(s.status, "lost");
});

test("Rhosgobel blocks all Eagle healing while staged; elsewhere a single effect heals at most five", () => {
  const s = base();
  const npc = eagle(s);
  npc.damage = 13;
  s.discard = ["01063"];
  assert.equal(rhosgobelHeal(s, npc, 13, { code: "01063" }), 0);
  assert.equal(npc.damage, 13);
  assert.deepEqual(s.discard, ["01063"]);
  s.staging = [];
  assert.equal(rhosgobelHeal(s, npc, 13, { code: "01063" }), 5);
  assert.equal(npc.damage, 8);
  assert.deepEqual(s.discard, ["01063"], "stage one does not remove healers");
  const hero = s.heroes[0];
  hero.damage = 4;
  assert.equal(rhosgobelHeal(s, hero, 20), 4);
});

test("a successful stage-two event heal removes exactly its resolved copy, while zero healing removes nothing", () => {
  const s = base();
  s.stage = 2;
  s.staging = [];
  const npc = eagle(s);
  npc.damage = 9;
  s.discard = ["01063", "01016", "01063"];
  assert.equal(rhosgobelHeal(s, npc, 9, { code: "01063" }), 5);
  assert.deepEqual(s.discard, ["01063", "01016"]);
  assert.deepEqual(s.removed, ["01063"]);
  npc.damage = 0;
  assert.equal(rhosgobelHeal(s, npc, 9, { code: "01063" }), 0);
  assert.deepEqual(s.discard, ["01063", "01016"]);
});

test("stage-two hero/ally/attachment healers themselves are removed without destruction or Horn rewards", () => {
  const s = base(lore);
  s.stage = 2;
  s.staging = [];
  const npc = eagle(s);
  npc.damage = 15;
  const glorfindel = s.heroes.find((h) => h.code === "01011")!,
    survivor = s.heroes.find((h) => h.id !== glorfindel.id)!;
  attach(s, survivor, "01042");
  const resources = survivor.resources;
  const preservation = attach(s, glorfindel, "01072");
  rhosgobelHeal(s, npc, 2, { source: preservation.id });
  assert.ok(!glorfindel.attachments.length);
  assert.ok(s.removed.includes("01072"));
  rhosgobelHeal(s, npc, 1, { source: glorfindel.id });
  assert.ok(!s.heroes.some((h) => h.id === glorfindel.id));
  assert.ok(s.removed.includes("01011"));
  assert.equal(survivor.resources, resources);
  assert.ok(!s.discard.includes("01011"));
  const radagast = unit(s, "02059");
  s.allies.push(radagast);
  rhosgobelHeal(s, npc, 5, { source: radagast.id });
  assert.ok(!s.allies.some((a) => a.id === radagast.id));
  assert.ok(s.removed.includes("02059"));
  assert.equal(survivor.resources, resources);
});

test("the real Lore of Imladris event obeys the cap and stage-two removal through the PLAY action", () => {
  let s = base(lore);
  s.stage = 2;
  s.staging = [];
  s.phase = "planning";
  eagle(s).damage = 12;
  s.heroes.forEach((h) => {
    h.resources = 3;
  });
  const event = unit(s, "01063");
  s.discard.push("01063");
  s.hand = [event];
  s = act(s, { type: "PLAY", id: event.id, target: eagle(s).id });
  assert.equal(eagle(s).damage, 7);
  assert.ok(s.removed.includes("01063"));
  assert.equal(s.discard.filter((code) => code === "01063").length, 1);
});

test("healing from another player's hero removes that healer from its owner, not Wilyador's controller", () => {
  let s = createGame(17, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "journey-to-rhosgobel",
    seats: [leadership, lore].map((d) => ({
      deckId: d.id,
      heroes: [...d.heroes],
    })),
  });
  s = act(s, { type: "KEEP" });
  s.stage = 2;
  s.phase = "planning";
  s.queue = [];
  s.choice = null;
  s.staging = [];
  selectSeat(s, 1);
  const glorfindel = s.heroes.find((h) => h.code === "01011")!;
  glorfindel.resources = 2;
  s = act(s, { type: "ABILITY", id: glorfindel.id });
  s = choose(s, eagle(s).id);
  assert.equal(eagle(s).damage, 1);
  assert.equal(seatView(s, 0).heroes.length, 3);
  assert.equal(seatView(s, 1).heroes.length, 2);
  assert.ok(seatView(s, 1).removed.includes("01011"));
});

test("player attachment target filters and direct play forbid attaching Self Preservation to Wilyador", () => {
  const s = base(lore);
  s.phase = "planning";
  s.heroes.forEach((h) => {
    h.resources = 3;
  });
  const preservation = unit(s, "01072");
  s.hand = [preservation];
  assert.ok(!playTargets(s, preservation).some((u) => u.code === R.wilyador));
  assert.throws(
    () => act(s, { type: "PLAY", id: preservation.id, target: eagle(s).id }),
    /target|attachment|Wilyador/i,
  );
  assert.equal(
    canPlay(s, preservation),
    null,
    "the attachment remains playable onto another character",
  );
});

test("Athelas normally receives a guard; claiming exhausts a ready hero and costs no threat", () => {
  let s = base();
  s.phase = "planning";
  s.encounterDeck = ["01089"];
  reveal(s, R.athelas);
  const objective = s.staging.find((u) => u.code === R.athelas)!;
  assert.ok(isGuarded(s, objective));
  assert.throws(
    () => act(s, { type: "CLAIM", id: objective.id, heroId: s.heroes[0].id }),
    /unguarded|free/i,
  );
  const guard = s.staging.find((u) => u.guarding === objective.id)!;
  destroy(s, guard);
  flush(s);
  const threat = s.threat,
    heroId = s.heroes[0].id;
  s = act(s, { type: "CLAIM", id: objective.id, heroId });
  assert.equal(s.threat, threat);
  assert.ok(s.heroes[0].exhausted);
  assert.ok(s.heroes[0].attachments.some((a) => a.code === R.athelas));
  s.staging.push(unit(s, R.athelas));
  assert.throws(
    () => act(s, { type: "CLAIM", id: s.staging.at(-1)!.id, heroId }),
    /ready|exhaust/i,
  );
});

test("claimed Athelas is discarded when its hero leaves and Forest Grove can find it again", () => {
  let s = base();
  attach(s, s.heroes[0], R.athelas);
  destroy(s, s.heroes[0]);
  flush(s);
  assert.ok(!s.staging.some((u) => u.code === R.athelas));
  assert.ok(s.encounterDiscard.includes(R.athelas));
  s.encounterDeck = [R.bats];
  const grove = unit(s, R.grove);
  s.staging.push(grove);
  progressLocation(s, grove, 3);
  flush(s);
  s = choose(s, "use");
  const objective = s.staging.find((u) => u.code === R.athelas)!;
  assert.ok(objective);
  assert.equal(isGuarded(s, objective), false);
  assert.ok(!s.encounterDiscard.includes(R.athelas));
});

test("Forest Grove optionally finds Athelas from the deck or discard, without revealing or guarding it", () => {
  for (const fromDiscard of [false, true]) {
    let s = base();
    s.encounterDeck = fromDiscard ? [R.bats] : [R.athelas, R.bats];
    s.encounterDiscard = fromDiscard ? [R.athelas] : [];
    const grove = unit(s, R.grove);
    s.staging.push(grove);
    progressLocation(s, grove, 3);
    flush(s);
    assert.ok(s.choice?.options.some((o) => o.id === "use"));
    s = choose(s, "use");
    const objective = s.staging.find((u) => u.code === R.athelas)!;
    assert.ok(objective);
    assert.equal(isGuarded(s, objective), false);
    assert.deepEqual(s.encounterDeck, [R.bats]);
  }
});

test("Forest Grove's exploration response resolves before overflow progress triggers the final treatment", () => {
  let s = base();
  s.stage = 2;
  s.progress = 10;
  s.staging = [];
  eagle(s).damage = 5;
  s.encounterDeck = [R.athelas, R.bats];
  s.activeLocation = unit(s, R.grove);
  s.activeLocation.progress = 2;
  progress(s, 3);
  flush(s);
  assert.equal(s.stage, 2);
  assert.equal(s.progress, 12);
  assert.equal(s.choice?.title, "Forest Grove");
  s = choose(s, "use");
  assert.equal(
    s.status,
    "lost",
    "the searched objective is still unclaimed when the final quest immediately resolves",
  );
  assert.ok(
    s.staging.some((u) => u.code === R.athelas),
    "the response searches before the final quest resolves",
  );
});

test("Festering Wounds targets all wounded characters across players, including Wilyador", () => {
  const s = base(leadership, 2);
  s.phase = "staging";
  s.heroes[0].damage = 1;
  syncSeat(s);
  forOwner(s, 1, () => {
    s.heroes[0].damage = 1;
  });
  reveal(s, R.wounds);
  assert.equal(eagle(s).damage, 4);
  assert.equal(seatView(s, 0).heroes[0].damage, 3);
  assert.equal(seatView(s, 1).heroes[0].damage, 3);
  assert.equal(seatView(s, 0).heroes[1].damage, 0);
});

test("Exhaustion targets all exhausted characters, and Insects target physical attachment-free characters", () => {
  const s = base(leadership, 2);
  s.phase = "staging";
  s.heroes[0].exhausted = true;
  eagle(s).exhausted = true;
  forOwner(s, 1, () => {
    s.heroes[0].exhausted = true;
  });
  reveal(s, R.exhaustion);
  assert.equal(eagle(s).damage, 4);
  assert.equal(seatView(s, 0).heroes[0].damage, 2);
  assert.equal(seatView(s, 1).heroes[0].damage, 2);
  attach(s, s.heroes[1], "01027");
  reveal(s, R.insects);
  assert.equal(eagle(s).damage, 5);
  assert.equal(s.heroes[1].damage, 0);
  assert.equal(s.heroes[2].damage, 1);
});

test("Radagast's Request is optional and wounds Wilyador by player count before revealing one of three", () => {
  let s = base(leadership, 2);
  s.stage = 2;
  s.encounterDeck = [R.grove, R.flock, R.bats, "01095"];
  handle(s, { kind: "startQuest" });
  flush(s);
  assert.equal(s.choice?.title, "Radagast's Request");
  s = choose(s, "use");
  assert.equal(eagle(s).damage, 4);
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    [R.grove, R.flock, R.bats],
  );
  s = choose(s, "rhos-look-1");
  assert.ok(s.staging.some((u) => u.code === R.flock));
  assert.ok(s.encounterDiscard.includes(R.grove));
  assert.ok(s.encounterDiscard.includes(R.bats));
  assert.deepEqual(s.encounterDeck, ["01095"]);
  assert.equal(s.phase, "quest");
  const skipped = base();
  skipped.stage = 2;
  const deck = [...skipped.encounterDeck];
  handle(skipped, { kind: "startQuest" });
  flush(skipped);
  const noCost = choose(skipped, "skip");
  assert.equal(eagle(noCost).damage, 2);
  assert.deepEqual(noCost.encounterDeck, deck);
});

test("the Request can kill Wilyador before its encounter lookup, and stage one never offers it", () => {
  let s = base();
  s.stage = 2;
  eagle(s).damage = 19;
  const before = [...s.encounterDeck];
  handle(s, { kind: "startQuest" });
  flush(s);
  s = choose(s, "use");
  assert.equal(s.status, "lost");
  assert.deepEqual(s.encounterDeck, before);
  const early = base();
  handle(early, { kind: "startQuest" });
  flush(early);
  assert.equal(early.choice, null);
});

test("Bats and Flock accept Eagles or Ranged characters and reject other attackers and defenders", () => {
  for (const code of [R.bats, R.flock]) {
    let s = base();
    const enemy = unit(s, code);
    s.engaged = [enemy];
    s.phase = "defense";
    enemy.shadows = [];
    assert.equal(rhosgobelCanFight(enemy, s.heroes[0]), false);
    assert.throws(
      () =>
        act(s, {
          type: "DEFEND",
          enemyId: enemy.id,
          defenderId: s.heroes[0].id,
        }),
      /defend|Eagle|Ranged/i,
    );
    s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: eagle(s).id });
    assert.ok(eagle(s).exhausted);
    const ranged = unit(s, "02057");
    s.allies.push(ranged);
    assert.ok(rhosgobelCanFight(enemy, ranged));
    s.phase = "attack";
    enemy.attackedBy = [];
    s.combat = null;
    s.choice = null;
    s.queue = [];
    assert.throws(
      () =>
        act(s, {
          type: "ATTACK",
          enemyId: enemy.id,
          attackerIds: [s.heroes[0].id],
        }),
      /attack|Eagle|Ranged/i,
    );
    s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [ranged.id] });
    assert.ok(
      !s.engaged.some((u) => u.id === enemy.id) ||
        s.engaged.find((u) => u.id === enemy.id)!.damage > 0,
    );
  }
});

test("both Eagle-enemy shadows route all undefended attack damage to Wilyador", () => {
  for (const code of [R.bats, R.flock]) {
    const s = base();
    const enemy = unit(s, "01089");
    s.engaged = [enemy];
    s.combat = { enemyId: enemy.id, defenderId: null, attackBonus: 0 };
    shadow(s, code);
    handle(s, { kind: "enemyDamage" });
    flush(s);
    assert.equal(eagle(s).damage, 4);
    assert.equal(s.heroes[0].damage, 0);
  }
});

test("Festering shadow damages wounded characters globally, with double damage for undefended attacks", () => {
  for (const defended of [false, true]) {
    const s = base(leadership, 2),
      enemy = unit(s, R.bats);
    s.engaged = [enemy];
    s.heroes[0].damage = 1;
    s.combat = {
      enemyId: enemy.id,
      defenderId: defended ? s.heroes[1].id : null,
      attackBonus: 0,
    };
    shadow(s, R.wounds);
    flush(s);
    assert.equal(eagle(s).damage, defended ? 3 : 4);
    assert.equal(s.heroes[0].damage, defended ? 2 : 3);
    assert.equal(s.heroes[1].damage, 0);
  }
});

test("Exhaustion shadow damages every exhausted character; Insects only damages the unique most-wounded", () => {
  const s = base(),
    enemy = unit(s, R.bats);
  s.engaged = [enemy];
  s.combat = { enemyId: enemy.id, defenderId: s.heroes[0].id, attackBonus: 0 };
  s.heroes[0].exhausted = true;
  shadow(s, R.exhaustion);
  flush(s);
  assert.equal(s.heroes[0].damage, 1);
  shadow(s, R.insects);
  flush(s);
  assert.equal(eagle(s).damage, 5);
  s.heroes[0].damage = 5;
  shadow(s, R.insects);
  flush(s);
  assert.equal(eagle(s).damage, 5);
  assert.equal(s.heroes[0].damage, 5);
});
