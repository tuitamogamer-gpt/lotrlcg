import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS, encounterCards } from "../src/game/cards.ts";
import { SCENARIOS, OBJECTIVES } from "../src/game/scenarios.ts";
import {
  createGame,
  continueCampaign,
  retryAdventure,
  restoreSave,
  validateSave,
  stats,
  stagingThreat,
  canPlay,
  playTargets,
  objectiveFree,
} from "../src/game/engine.ts";
import type { GameState, Unit, ScenarioId } from "../src/game/types.ts";
let id = 80000;
function unit(code: string): Unit {
  return {
    id: `test${id++}`,
    code,
    damage: 0,
    progress: 0,
    resources: 0,
    exhausted: false,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  };
}
function settle(s: GameState) {
  for (let n = 0; s.choice && s.status === "playing"; n++) {
    assert.ok(n < 100, "No stuck choice queue");
    const o =
      s.choice.options.find((o) => o.id === "resolve") ??
      s.choice.options.find((o) => o.id === "skip") ??
      s.choice.options[0];
    s = act(s, { type: "CHOOSE", id: o.id });
  }
  return s;
}
function game(scenarioId: ScenarioId = "mirkwood", campaign = false) {
  const d = STARTERS[0];
  return settle(
    createGame(42, d.cards, d.heroes, d.id, {
      scenarioId,
      playMode: campaign ? "campaign" : "normal",
    }),
  );
}
function reveal(code: string) {
  let s = game();
  s.phase = "quest";
  s.encounterDeck = [code];
  s.staging = [];
  s.hand = [];
  s.queue = [];
  s.choice = null;
  return settle(act(s, { type: "COMMIT" }));
}
function finishMirkwood(branch: "beorn" | "spider" = "beorn") {
  let s = act(game("mirkwood", true), { type: "KEEP" });
  s.stage = 3;
  s.branch = branch;
  s.staging = [];
  s.phase = "staging";
  if (branch === "beorn") {
    s.heroes[0].committed = true;
    s.heroes[0].tempWill = 12;
    return act(s, { type: "NEXT" });
  }
  s.phase = "attack";
  const spider = unit("01076");
  s.engaged = [spider];
  s.heroes[0].tempAttack = 30;
  return act(s, {
    type: "ATTACK",
    enemyId: spider.id,
    attackerIds: [s.heroes[0].id],
  });
}
function finishAnduin() {
  let s = settle(
    continueCampaign(finishMirkwood(), undefined, undefined, true, 42),
  );
  s = act(s, { type: "KEEP" });
  s.phase = "staging";
  s.stage = 3;
  s.staging = [];
  s.engaged = [];
  s.queue = [];
  s.choice = null;
  s.heroes[1].damage = 2;
  s.heroes[0].attachments.push({ id: "valor", code: "rc133", exhausted: true });
  return act(s, { type: "NEXT" });
}
test("the exact encounter decks include all 45 Core Set definitions and the 11 Hunt for Gollum cards", () => {
  assert.equal(
    encounterCards.filter((c) => c.pack_name === "Core Set").length,
    45,
  );
  assert.equal(
    encounterCards.filter((c) => c.pack_name === "The Hunt for Gollum").length,
    11,
  );
  const counts = SCENARIOS.filter((q) =>
    ["mirkwood", "anduin", "dol-guldur", "hunt-for-gollum"].includes(q.id),
  ).map((q) =>
    encounterCards
      .filter((c) => (q.sets as readonly string[]).includes(c.encounter_set!))
      .reduce((n, c) => n + c.quantity!, 0),
  );
  assert.deepEqual(counts, [36, 47, 41, 48]);
});
test("Anduin setup reveals one card and ensures a Hill Troll; no campaign cards in normal mode", () => {
  const s = game("anduin");
  assert.ok(s.staging.some((u) => u.code === "01082"));
  assert.equal(s.campaign, null);
  assert.equal(s.allies.length, 0);
  assert.ok(!s.encounterDeck.some((c) => c.startsWith("rc")));
  assert.ok(validateSave(s));
});
test("Anduin stage one cannot advance until all Hill Trolls are gone", () => {
  let s = act(game("anduin"), { type: "KEEP" });
  s.stage = 1;
  s.progress = 8;
  s.staging = [unit("01082")];
  s = act(s, { type: "NEXT" });
  assert.equal(s.stage, 1);
  s.phase = "attack";
  s.engaged = s.staging;
  s.staging = [];
  s.heroes[0].tempAttack = 20;
  s = act(s, {
    type: "ATTACK",
    enemyId: s.engaged[0].id,
    attackerIds: [s.heroes[0].id],
  });
  assert.equal(s.stage, 2);
  assert.equal(s.progress, 0);
});
test("Anduin river reveals two cards and skips only automatic engagements", () => {
  let s = act(game("anduin"), { type: "KEEP" });
  s.stage = 2;
  s.staging = [];
  s.encounterDeck = ["01082", "01082"];
  s.phase = "quest";
  s.hand = [];
  s = act(s, { type: "COMMIT" });
  assert.equal(s.staging.length, 2);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: s.staging[0].id });
  s = act(s, { type: "NEXT" });
  assert.equal(s.engaged.length, 1);
  assert.equal(s.staging.length, 1);
});
test("Anduin ambush reveals twice before victory and skips later staging reveals", () => {
  let s = act(game("anduin"), { type: "KEEP" });
  s.phase = "staging";
  s.stage = 2;
  s.progress = 15;
  s.staging = [];
  s.encounterDeck = ["01082", "01087"];
  s.heroes[0].committed = true;
  s = act(s, { type: "NEXT" });
  assert.equal(s.stage, 3);
  assert.equal(s.status, "playing");
  assert.equal(s.staging.length, 2);
  s.phase = "quest";
  s.encounterDeck = ["01084"];
  s = act(s, { type: "COMMIT" });
  assert.deepEqual(s.encounterDeck, ["01084"]);
  s.phase = "attack";
  const troll = s.staging.find((u) => u.code === "01082")!;
  s.staging = s.staging.filter((u) => u !== troll);
  s.engaged = [troll];
  s.heroes[0].tempAttack = 20;
  s = act(s, {
    type: "ATTACK",
    enemyId: troll.id,
    attackerIds: [s.heroes[0].id],
  });
  assert.equal(s.status, "won");
});
test("Hill Troll excess combat damage increases threat", () => {
  let s = act(game("anduin"), { type: "KEEP" });
  s.phase = "defense";
  const troll = unit("01082");
  s.engaged = [troll];
  s.staging = [];
  const scout = unit("01016");
  s.allies = [scout];
  const threat = s.threat;
  s = settle(
    act(s, { type: "DEFEND", enemyId: troll.id, defenderId: scout.id }),
  );
  assert.equal(s.threat, threat + 4);
  assert.equal(s.allies.length, 0);
});
test("surge, doomed, and Thalin defeat-before-surge are resolved", () => {
  let s = game();
  s.phase = "quest";
  s.staging = [];
  s.hand = [];
  s.encounterDeck = ["01106", "01082"];
  const threat = s.threat;
  s = act(s, { type: "COMMIT" });
  assert.equal(s.threat, threat + 1);
  assert.equal(s.staging.length, 2);
  const d = STARTERS[1];
  s = createGame(42, d.cards, d.heroes, d.id);
  s.phase = "quest";
  s.staging = [];
  s.encounterDeck = ["01115", "01082"];
  s.committedIds = [s.heroes[2].id];
  s = act(s, { type: "COMMIT" });
  assert.equal(s.staging.length, 0);
  assert.ok(s.encounterDeck.includes("01115"));
  assert.ok(s.encounterDeck.includes("01082"));
});
test("The East Bight is mandatory, and The Brown Lands explores on travel", () => {
  let s = act(game(), { type: "KEEP" });
  s.phase = "travel";
  s.staging = [unit("01088"), unit("01087")];
  assert.throws(() => act(s, { type: "NEXT" }), /East Bight/);
  assert.throws(
    () => act(s, { type: "TRAVEL", id: s.staging[1].id }),
    /East Bight/,
  );
  s.staging.shift();
  s = act(s, { type: "TRAVEL", id: s.staging[0].id });
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes("01087"));
});
test("Banks return to the top and Gladden Fields grants victory points", () => {
  for (const code of ["01113", "01114"]) {
    let s = act(game(), { type: "KEEP" });
    s.phase = "staging";
    s.staging = [];
    s.activeLocation = unit(code);
    s.heroes[0].committed = true;
    s.heroes[0].tempWill = 4;
    s = act(s, { type: "NEXT" });
    assert.equal(s.activeLocation, null);
    if (code === "01113") assert.equal(s.encounterDeck[0], code);
    else {
      assert.equal(s.victory, 3);
      assert.ok(!s.encounterDiscard.includes(code));
    }
  }
});
test("Goblin Sniper restricts optional engagement and deals damage at combat end", () => {
  let s = act(game("anduin"), { type: "KEEP" });
  s.phase = "encounter";
  s.staging = [unit("01083"), unit("01082")];
  assert.throws(
    () => act(s, { type: "ENGAGE", id: s.staging[0].id }),
    /Sniper/,
  );
  s.phase = "attack";
  s = act(s, { type: "END_ATTACKS" });
  assert.ok(s.choice?.title.includes("Assign 1"));
  s = settle(s);
  assert.equal(s.heroes[0].damage, 1);
});
test("Wargs return to staging after a blank shadow; Marsh Adder raises threat", () => {
  let s = act(game("anduin"), { type: "KEEP" });
  s.phase = "defense";
  const w = unit("01085");
  w.shadows = ["01087"];
  s.engaged = [w];
  s = act(s, { type: "DEFEND", enemyId: w.id, defenderId: s.heroes[0].id });
  assert.ok(s.staging.some((u) => u.id === w.id));
  s.phase = "defense";
  const adder = unit("01084");
  s.engaged = [adder];
  const before = s.threat;
  s = act(s, { type: "DEFEND", enemyId: adder.id, defenderId: s.heroes[1].id });
  assert.equal(s.threat, before + 1);
});
test("Despair shadow removes defense from the attack", () => {
  let s = act(game(), { type: "KEEP" });
  s.phase = "defense";
  const orc = unit("01089");
  orc.shadows = ["01086"];
  s.engaged = [orc];
  s.hand = [];
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: s.heroes[0].id });
  assert.equal(s.heroes[0].damage, 2);
});
test("Wolf Rider shadow interrupts, receives a shadow, then returns to the top at combat end", () => {
  let s = act(game(), { type: "KEEP" });
  s.phase = "defense";
  const orc = unit("01089");
  orc.shadows = ["01081"];
  s.engaged = [orc];
  s.encounterDeck = ["01087"];
  s.hand = [];
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: s.heroes[0].id });
  assert.match(s.choice!.title, /Wolf Rider/);
  assert.ok(validateSave(s));
  s = act(s, { type: "CHOOSE", id: s.heroes[1].id });
  s = settle(s);
  assert.ok(!s.encounterDeck.includes("01081"));
  assert.equal(s.suspendedCombats.length, 0);
  assert.equal(s.combat, null);
  assert.equal(s.phase, "attack");
  s = settle(act(s, { type: "END_ATTACKS" }));
  assert.equal(s.encounterDeck[0], "01081");
});
test("Massing at Night shadow resolves its extra shadow before damage", () => {
  let s = act(game(), { type: "KEEP" });
  s.phase = "defense";
  const e = unit("01089");
  e.shadows = ["01112"];
  s.engaged = [e];
  s.encounterDeck = ["01086"];
  s.hand = [];
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
  assert.equal(s.heroes[0].damage, 2);
  assert.equal(s.engaged[0].shadows.length, 2);
});
test("Dol Guldur sets aside a hero and the Nazgûl and guards all three objectives", () => {
  const s = game("dol-guldur");
  assert.equal(s.heroes.length, 2);
  assert.ok(s.prisoner);
  assert.equal(s.staging.filter((u) => OBJECTIVES.includes(u.code)).length, 3);
  assert.ok(!s.encounterDeck.includes("01102"));
  assert.ok(!s.staging.some((u) => u.code === "01102"));
  assert.ok(validateSave(s));
  const next = act(s, { type: "KEEP" });
  assert.equal(next.prisoner!.resources, 0);
  assert.ok(next.heroes.every((h) => h.resources === 1));
});
test("objectives require clearing their guard, claim cost, and restricted slots", () => {
  let s = act(game("dol-guldur"), { type: "KEEP" });
  const o = unit("01108"),
    guard = unit("01089");
  guard.guarding = o.id;
  s.staging = [o, guard];
  assert.equal(objectiveFree(s, o), false);
  assert.throws(() =>
    act(s, { type: "CLAIM", id: o.id, heroId: s.heroes[0].id }),
  );
  s.staging.pop();
  const before = s.threat;
  s = act(s, { type: "CLAIM", id: o.id, heroId: s.heroes[0].id });
  assert.equal(s.threat, before + 2);
  assert.equal(s.heroes[0].attachments[0].code, "01108");
  s.phase = "defense";
  s.engaged = [unit("01089")];
  assert.throws(() =>
    act(s, {
      type: "DEFEND",
      enemyId: s.engaged[0].id,
      defenderId: s.heroes[0].id,
    }),
  );
  s.phase = "attack";
  assert.throws(() =>
    act(s, {
      type: "ATTACK",
      enemyId: s.engaged[0].id,
      attackerIds: [s.heroes[0].id],
    }),
  );
});
test("Dol Guldur gates advancement, rescues with damage, and introduces the Nazgûl", () => {
  let s = act(game("dol-guldur"), { type: "KEEP" });
  s.phase = "staging";
  s.progress = 9;
  s.staging = [];
  s = act(s, { type: "NEXT" });
  assert.equal(s.stage, 1);
  s.staging = [unit("01108")];
  s = act(s, { type: "CLAIM", id: s.staging[0].id, heroId: s.heroes[0].id });
  assert.equal(s.stage, 2);
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.heroes[0].tempWill = 20;
  s = act(s, { type: "NEXT" });
  assert.equal(s.prisoner, null);
  assert.equal(s.heroes.length, 3);
  assert.ok(s.heroes.some((h) => h.damage === 1));
  assert.ok(s.staging.some((u) => u.code === "01102"));
  assert.equal(s.stage, 2);
  for (const code of ["01109", "01110"]) {
    const o = unit(code);
    s.staging.push(o);
    s = act(s, { type: "CLAIM", id: o.id, heroId: s.heroes[1].id });
  }
  assert.equal(s.stage, 3);
});
test("Dol Guldur permits one played ally, but does not count allies put into play", () => {
  let s = act(game("dol-guldur"), { type: "KEEP" });
  s.hand = [unit("01013"), unit("01016")];
  s.heroes.forEach((h) => (h.resources = 10));
  s = act(s, { type: "PLAY", id: s.hand[0].id });
  assert.match(canPlay(s, s.hand[0])!, /one ally/);
  s.stage = 3;
  assert.equal(canPlay(s, s.hand[0]), null);
});
test("Nazgûl rejects Forest Snare and discards a character only after an uncancelled shadow effect", () => {
  let s = act(game("dol-guldur"), { type: "KEEP" });
  s.phase = "planning";
  const nazgul = unit("01102");
  s.engaged = [nazgul];
  assert.equal(playTargets(s, unit("01069")).length, 0);
  s.phase = "defense";
  nazgul.shadows = ["01104"];
  s.hand = [];
  s = act(s, {
    type: "DEFEND",
    enemyId: nazgul.id,
    defenderId: s.heroes[0].id,
  });
  assert.match(s.choice!.title, /Nazgûl/);
});
test("Iron Shackles replaces an entire draw and then discards", () => {
  let s = reveal("01105");
  assert.equal(s.shackles, 1);
  assert.ok(!s.encounterDiscard.includes("01105"));
  s.phase = "refresh";
  s.staging = [];
  s = act(s, { type: "NEXT" });
  assert.equal(s.hand.length, 0);
  assert.equal(s.shackles, 0);
  assert.ok(s.encounterDiscard.includes("01105"));
});
test("Tower Gate and the last Dol Guldur quest turn player cards into Orc Guards", () => {
  let s = act(game("dol-guldur"), { type: "KEEP" });
  s.phase = "travel";
  s.staging = [unit("01107")];
  const top = s.deck[0];
  s = act(s, { type: "TRAVEL", id: s.staging[0].id });
  assert.equal(s.engaged[0].code, "orc-guard");
  assert.equal(s.engaged[0].facedownCard, top);
  s.phase = "attack";
  s.heroes[0].tempAttack = 10;
  s = act(s, {
    type: "ATTACK",
    enemyId: s.engaged[0].id,
    attackerIds: [s.heroes[0].id],
  });
  assert.ok(s.discard.includes(top));
  assert.ok(!s.encounterDiscard.includes("orc-guard"));
  s.phase = "planning";
  s.stage = 3;
  s = act(s, { type: "NEXT" });
  assert.equal(s.engaged[0].code, "orc-guard");
});
test("Dungeon Jailor can shuffle an unclaimed guarded objective, freeing its guard", () => {
  let s = act(game("dol-guldur"), { type: "KEEP" });
  s.phase = "staging";
  const objective = unit("01108"),
    jailor = unit("01101");
  jailor.guarding = objective.id;
  s.staging = [objective, jailor];
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Jailor/);
  s = settle(s);
  assert.ok(s.encounterDeck.includes("01108"));
  assert.equal(s.staging[0].guarding, undefined);
});
test("Torch and Key penalties apply at the end of the round, Gladden at refresh", () => {
  let s = act(game("dol-guldur"), { type: "KEEP" });
  s.phase = "attack";
  s.heroes[0].attachments = [
    { id: "torch", code: "01109", exhausted: false },
    { id: "key", code: "01110", exhausted: false },
  ];
  s.activeLocation = unit("01114");
  const threat = s.threat;
  s = settle(act(s, { type: "END_ATTACKS" }));
  assert.equal(s.threat, threat + 2);
  s = act(s, { type: "NEXT" });
  assert.equal(s.threat, threat + 4);
  assert.equal(s.heroes[0].damage, 1);
});
test("Dol Guldur final progress waits for the Nazgûl to be defeated", () => {
  let s = act(game("dol-guldur"), { type: "KEEP" });
  s.stage = 3;
  s.progress = 7;
  s.phase = "attack";
  s.staging = [];
  s.engaged = [unit("01102")];
  s.heroes[0].tempAttack = 20;
  s = act(s, {
    type: "ATTACK",
    enemyId: s.engaged[0].id,
    attackerIds: [s.heroes[0].id],
  });
  assert.equal(s.status, "won");
  assert.equal(s.nazgulDefeated, true);
});
test("campaign cannot start in a later chapter; normal mode has no carry-over", () => {
  const d = STARTERS[0];
  assert.throws(
    () =>
      createGame(1, d.cards, d.heroes, d.id, {
        playMode: "campaign",
        scenarioId: "anduin",
      }),
    /begins/,
  );
  assert.equal(game("mirkwood", true).allies[0].code, "rc135");
  assert.equal(game().allies.length, 0);
});
test("Mendor readies and draws after a quest stage is defeated", () => {
  let s = act(game("mirkwood", true), { type: "KEEP" });
  s.phase = "staging";
  s.staging = [];
  s.progress = 7;
  s.heroes[0].committed = true;
  s.allies[0].exhausted = true;
  const hand = s.hand.length;
  s = act(s, { type: "NEXT" });
  assert.equal(s.stage, 2);
  assert.equal(s.hand.length, hand + 1);
  assert.equal(s.allies[0].exhausted, false);
});
test("losing Mendor loses the first two campaign quests and retries preserve only previous results", () => {
  let s = act(game("mirkwood", true), { type: "KEEP" });
  const m = s.allies[0];
  s.phase = "defense";
  s.engaged = [unit("01082")];
  s = act(s, { type: "DEFEND", enemyId: s.engaged[0].id, defenderId: m.id });
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Mendor/);
  const retry = retryAdventure(s, 42);
  assert.equal(retry.campaign!.completed.length, 0);
  assert.equal(retry.allies[0].code, "rc135");
  assert.ok(!retry.campaign!.boons.length);
});
test("both Mirkwood branches record the correct boon and burden exactly once", () => {
  for (const branch of ["beorn", "spider"] as const) {
    const s = finishMirkwood(branch);
    assert.equal(s.status, "won");
    assert.deepEqual(s.campaign!.boons, ["rc132"]);
    assert.deepEqual(s.campaign!.burdens, [
      branch === "beorn" ? "rc136" : "rc137",
    ]);
    assert.equal(s.campaign!.completed.length, 1);
    const next = settle(continueCampaign(s, undefined, undefined, true, 42));
    assert.equal(next.scenarioId, "anduin");
    assert.equal(next.playMode, "campaign");
    assert.ok(
      [...next.deck, ...next.hand.map((h) => h.code)].includes("rc132"),
    );
    assert.ok(
      [
        ...next.encounterDeck,
        ...next.encounterDiscard,
        ...next.staging.map((u) => u.code),
      ].includes(s.campaign!.burdens[0]),
    );
    assert.ok(validateSave(next));
  }
});
test("Support is optional during setup, lasts the whole round, and can be played once", () => {
  const won = finishMirkwood();
  let s = settle(continueCampaign(won, undefined, undefined, false, 42));
  assert.ok(![...s.deck, ...s.hand.map((h) => h.code)].includes("rc132"));
  s = act(s, { type: "KEEP" });
  s.hand = [unit("rc132"), unit("rc132")];
  s = act(s, { type: "PLAY", id: s.hand[0].id });
  assert.equal(stats(s, s.allies[0]).attack, 3);
  s = act(s, { type: "NEXT" });
  assert.equal(stats(s, s.allies[0]).will, 3);
  assert.match(canPlay(s, s.hand[0])!, /once/);
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  assert.equal(stats(s, s.allies[0]).attack, 1);
});
test("Valor and Scarred are earned at their Hill Troll triggers", () => {
  let s = settle(
    continueCampaign(finishMirkwood(), undefined, undefined, true, 42),
  );
  s = act(s, { type: "KEEP" });
  s.phase = "attack";
  s.staging = [];
  s.engaged = [unit("01082")];
  s.heroes[0].tempAttack = 20;
  s = act(s, {
    type: "ATTACK",
    enemyId: s.engaged[0].id,
    attackerIds: [s.heroes[0].id],
  });
  assert.equal(s.choice!.title, "Earn Valor");
  s = act(s, { type: "CHOOSE", id: s.heroes[0].id });
  assert.equal(s.heroes[0].attachments[0].code, "rc133");
  s.phase = "defense";
  s.engaged = [unit("01082")];
  const ally = unit("01016");
  s.allies.push(ally);
  s = act(s, { type: "DEFEND", enemyId: s.engaged[0].id, defenderId: ally.id });
  assert.equal(s.choice!.title, "Scarred by the Hill Troll");
  s = act(s, { type: "CHOOSE", id: s.heroes[0].id });
  assert.equal(s.campaignScarred, true);
});
test("Valor heals and damages on attacker declaration; Scarred reacts to destruction", () => {
  let s = act(game(), { type: "KEEP" });
  s.phase = "attack";
  s.engaged = [unit("01082")];
  const h = s.heroes[0];
  h.damage = 2;
  h.attachments = [{ id: "v", code: "rc133", exhausted: false }];
  s = act(s, { type: "ATTACK", enemyId: s.engaged[0].id, attackerIds: [h.id] });
  assert.match(s.choice!.title, /Valor/);
  s = act(s, { type: "CHOOSE", id: "use" });
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.engaged[0].damage, 1);
  assert.equal(s.heroes[0].attachments[0].exhausted, true);
  s.phase = "defense";
  s.engaged[0].attacked = false;
  s.heroes[0].attachments.push({ id: "sc", code: "rc138", exhausted: false });
  const ally = unit("01016");
  s.allies = [ally];
  const threat = s.threat;
  s = act(s, { type: "DEFEND", enemyId: s.engaged[0].id, defenderId: ally.id });
  assert.equal(s.threat, threat + 5);
});
test("Anduin logs permanent boons and the most-damaged prisoner; Dol Guldur restores them", () => {
  const s = finishAnduin();
  assert.equal(s.status, "won");
  assert.equal(s.campaign!.prisoner, s.heroes[1].code);
  assert.deepEqual(s.campaign!.permanent[s.heroes[0].code], ["rc133"]);
  let next = continueCampaign(s, undefined, undefined, true, 42);
  assert.equal(next.choice!.title, "Appointed by Fate");
  next = act(next, { type: "CHOOSE", id: next.heroes[0].id });
  next = settle(next);
  assert.equal(next.prisoner!.code, s.heroes[1].code);
  assert.ok(next.captiveMendor);
  assert.ok(next.heroes[0].attachments.some((a) => a.code === "rc133"));
  assert.ok(validateSave(next));
  next = act(next, { type: "KEEP" });
  assert.equal(next.heroes[0].resources, 2);
  next.staging = [unit("01108")];
  next = act(next, {
    type: "CLAIM",
    id: next.staging[0].id,
    heroId: next.heroes[0].id,
  });
  assert.equal(next.captiveMendor, null);
  assert.equal(next.allies[0].damage, 1);
});
test("fallen heroes cannot return; replacements and voluntary changes add permanent threat", () => {
  const s = finishMirkwood();
  s.campaign!.fallen = [s.campaign!.heroes[0]];
  assert.throws(() => continueCampaign(s), /fallen/);
  const heroes = [STARTERS[1].heroes[0], ...s.campaign!.heroes.slice(1)];
  const n = continueCampaign(s, heroes, undefined, true, 42);
  assert.equal(n.campaign!.threatPenalty, 1);
  assert.equal(
    n.threat,
    heroes.reduce((sum, h) => sum + card(h).threat!, 0) + 1,
  );
  const original = finishMirkwood();
  assert.throws(
    () => continueCampaign(original, STARTERS[1].heroes),
    /one other hero/,
  );
});
test("Dol Guldur completion records Mendor survival and campaign total", () => {
  let s = settle(
    continueCampaign(finishAnduin(), undefined, undefined, true, 42),
  );
  s = act(s, { type: "KEEP" });
  const m = s.captiveMendor!;
  s.captiveMendor = null;
  s.allies.push(m);
  s.phase = "staging";
  s.stage = 3;
  s.progress = 7;
  s.nazgulDefeated = true;
  s.staging = [];
  s = act(s, { type: "NEXT" });
  assert.equal(s.status, "won");
  assert.equal(s.campaign!.completed.length, 3);
  assert.equal(s.campaign!.mendorSaved, true);
  assert.ok(s.campaign!.boons.includes("rc135"));
  assert.throws(() => continueCampaign(s));
});
test("burden Swarm exhausts two characters; Venom exhausts damage or hurts the most-damaged hero", () => {
  let s = act(game(), { type: "KEEP" });
  s.phase = "encounter";
  s.staging = [unit("rc136")];
  s = settle(act(s, { type: "ENGAGE", id: s.staging[0].id }));
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 2);
  s = game();
  s.phase = "quest";
  s.heroes[0].damage = 1;
  s.encounterDeck = ["rc137", "01087"];
  s.hand = [];
  s.staging = [];
  s = act(s, { type: "COMMIT" });
  s = act(s, { type: "CHOOSE", id: "exhaust" });
  assert.equal(s.heroes[0].exhausted, true);
  assert.ok(s.staging.some((u) => u.code === "01087"));
});
test("old saves migrate; new campaign saves and pending choices round-trip, malformed logs are rejected", () => {
  const old: any = game();
  old.version = 1;
  delete old.scenarioId;
  delete old.campaign;
  delete old.playMode;
  const restored = restoreSave(old)!;
  assert.equal(restored.scenarioId, "mirkwood");
  assert.equal(restored.playMode, "normal");
  assert.ok(validateSave(restored));
  const c = continueCampaign(finishAnduin(), undefined, undefined, true, 42);
  assert.deepEqual(
    restoreSave(JSON.parse(JSON.stringify(c))),
    JSON.parse(JSON.stringify(c)),
  );
  const bad: any = structuredClone(c);
  bad.campaign.completed[0].scenarioId = "dol-guldur";
  assert.equal(validateSave(bad), false);
});
test("objectives contribute no staging threat even under Driven by Shadow", () => {
  const s = game("dol-guldur");
  s.staging = [unit("01108")];
  s.staging[0].tempThreat = 1;
  assert.equal(stagingThreat(s), 0);
});

test("Valor is optional, recalculates Gimli after healing, and cannot trigger combat-kill progress", () => {
  const d = STARTERS.find((d) => d.id === "tactics")!;
  let s = act(createGame(1, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.phase = "attack";
  s.staging = [];
  s.engaged = [unit("01082")];
  s.heroes[0].damage = 2;
  s.heroes[0].attachments = [
    { id: "valor-g", code: "rc133", exhausted: false },
  ];
  s = act(s, {
    type: "ATTACK",
    enemyId: s.engaged[0].id,
    attackerIds: [s.heroes[0].id],
  });
  const skipped = act(s, { type: "CHOOSE", id: "skip" });
  assert.equal(skipped.heroes[0].damage, 2);
  assert.equal(skipped.heroes[0].attachments[0].exhausted, false);
  s = act(s, { type: "CHOOSE", id: "use" });
  assert.equal(s.engaged[0].damage, 1); // one Valor damage, Gimli now has 3 attack versus 3 defense.
  s.phase = "attack";
  s.engaged = [unit("01083")];
  s.engaged[0].damage = 1;
  s.heroes[1].attachments = [
    { id: "valor-l", code: "rc133", exhausted: false },
  ];
  s.progress = 0;
  s = act(s, {
    type: "ATTACK",
    enemyId: s.engaged[0].id,
    attackerIds: [s.heroes[1].id],
  });
  s = act(s, { type: "CHOOSE", id: "use" });
  assert.equal(s.engaged.length, 0);
  assert.equal(s.progress, 0); // Legolas did not destroy this enemy with attack damage.
});
test("malformed legacy saves fail safely", () => {
  assert.equal(
    restoreSave({ version: 1, deckId: "custom", discard: ["invalid"] }),
    null,
  );
});
