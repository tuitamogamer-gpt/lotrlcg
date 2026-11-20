import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { beginResources, damage, revealed } from "../src/game/board";
import { fx, make, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { advanceFangorn, fangornCombatStart } from "../src/game/fangorn";
import { FANGORN as F } from "../src/game/fangorn-support";
import { syncAttachmentText } from "../src/game/attachment-text";
import { playerCardImmune } from "../src/game/card-immunity";
import { removeCurrentQuestProgress } from "../src/game/side-quests";
import { scenario } from "../src/game/scenarios";
import { automatedScenarioId } from "../src/game/support";
import {
  NIGHTMARE,
  NIGHTMARE_VOI as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices, seatView } from "../src/game/table";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Into Fangorn: a location whose only effect waits for the refresh phase. */
const QUIET = F.heart;
const ATTACHMENT = "01027"; // Celebrían's Stone
const ID = "into-fangorn";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board at stage 1 with 4 time counters and nothing engaged. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: [],
    stage: 1,
    progress: 0,
    nightmare: {},
    victoryCards: [],
    victory: 0,
    fangorn: { time: 4 },
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, engaged: [], hand: [], allies: [] });
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const add = (s: GameState, code: string, engaged = false) => {
  const u = make(s, code);
  (engaged ? s.engaged : s.staging).push(u);
  return u;
};
function run(s: GameState, effects: GameState["queue"] = []) {
  s.queue.unshift(...effects);
  for (let i = 0; i < 40; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const options = (s: GameState) => s.choice!.options.map((o) => o.id);
/** A hero holding Mugash. */
function captive(s: GameState, hero: Unit = s.heroes[0]) {
  hero.attachments.push({
    id: `m${s.nextId++}`,
    code: F.mugash,
    exhausted: false,
  });
  return hero;
}

test("Nightmare: Into Fangorn's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.fangornCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Into Fangorn - Nightmare", true],
  );
  assert.match(
    c.text!,
    /3x Deadly Huorn\n3x Tangled Woods\n3x Turned Around\n/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare Mode.\nSetup: Each player searches the encounter deck for a Huorn enemy and puts it into play engaged with him. Shuffle the encounter deck.\nThe players cannot defeat stage 1B or 2B unless Edge of Fangorn is in the victory display.",
  );
  // DragnCards keeps the rules side as the front: the removal list is the .B face.
  assert.match(c.imagesrc!, /d495b495-db4b-496a-9294-c956afd1db9f\.B\.jpg$/);
  assert.match(c.back_imagesrc!, /d495b495-db4b-496a-9294-c956afd1db9f\.jpg$/);
  for (const code of [N.huornOfFangorn, N.blocking, N.wicked])
    assert.match(card(code).text!, /^Hinder\. Cannot have attachments\.\n/);
  assert.match(
    card(N.blocking).text!,
    /adds its \[threat\] to the staging area/,
  );
  assert.equal(
    card(N.huornOfFangorn).shadow,
    "Shadow: Deal 1 damage to defending character.",
  );
  assert.match(
    card(N.tangledForest).text!,
    /assign X damage among characters in play/,
  );
  assert.match(
    card(N.entwood).text!,
    /each Huorn enemy in the staging area gains: "Immune to player card effects\."\nTravel:/,
  );
  assert.match(card(N.darkCorner).text!, /loses the hinder keyword\.\nForced:/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Into Fangorn - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    10,
  );
});

test("Nightmare: Into Fangorn's Nightmare deck matches its source recipe; each player engages a Huorn from the encounter deck at setup", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const recipe = recipes.find((r) => r.id === "N04.3")!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const sets = scenario(ID).sets;
  const standard = encounterCards
    .filter((c) => sets.includes(c.encounter_set ?? ""))
    .flatMap((c) => Array<string>(c.quantity ?? 1).fill(c.code));
  // The recipe stages Edge of Fangorn and Mugash, as the scenario's setup does.
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, standard)),
    count([
      ...pile("sharedEncounterDeck"),
      ...pile("sharedStagingArea").filter((c) => c !== N.fangornCard),
    ]),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.fangornCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.fangornCard);
    for (const p of seatIndices(s)) {
      const engaged = seatView(s, p).engaged;
      assert.equal(engaged.length, 1, `player ${p + 1} engages a Huorn`);
      assert.match(card(engaged[0].code).traits ?? "", /Huorn/);
    }
    assert.deepEqual(
      s.staging.slice(0, 2).map((u) => u.code),
      [F.edge, F.mugash],
    );
    assert.ok(valid(s));
  }
  // The search only looks at the encounter deck.
  const s = board("planning");
  s.encounterDeck = [QUIET, N.wicked, F.angry, N.wicked];
  s.encounterDiscard = [N.blocking];
  run(s, [fx("nfgSetupSearch", { player: 0 })]);
  assert.deepEqual(options(s), [N.wicked, F.angry]);
  pick(s, N.wicked);
  assert.equal(s.engaged[0]?.code, N.wicked);
  assert.equal(s.encounterDeck.filter((c) => c === N.wicked).length, 1);
  assert.equal(
    automatedScenarioId({
      name: "Into Fangorn (Nightmare)",
      mode: "nightmare",
    }),
    ID,
  );
  assert.match(
    nightmareStatus(s)[0],
    /unless Edge of Fangorn is in the victory display \(it is not yet\)/,
  );
});

test("Nightmare: Into Fangorn's stages 1B and 2B wait for Edge of Fangorn in the victory display", () => {
  const s = board("refresh");
  captive(s);
  s.progress = 9;
  advanceFangorn(s);
  assert.ok(!s.queue.some((e) => e.kind === "fangornAdvance"), "stage 1B held");
  assert.equal(hooks(s).cannotDefeatStage!(s, 2), true);
  assert.equal(
    hooks(s).cannotDefeatStage!(s, 3),
    false,
    "stage 3B is not held",
  );
  s.victoryCards = [F.edge];
  advanceFangorn(s);
  assert.ok(s.queue.some((e) => e.kind === "fangornAdvance"));
  assert.equal(hooks(s).cannotDefeatStage!(s, 2), false);
});

test("Nightmare: Huorn of Fangorn and Wicked Huorn join the scenario's Huorns at the beginning of the resource phase", () => {
  const s = board("resource");
  const hero = s.heroes[0];
  const stone = make(s, ATTACHMENT);
  hero.attachments.push({ id: stone.id, code: ATTACHMENT, exhausted: false });
  add(s, N.huornOfFangorn, true);
  add(s, N.wicked, true);
  add(s, F.dark, true);
  beginResources(s);
  run(s);
  assert.match(s.choice!.title, /Choose the next Forced effect/);
  assert.equal(s.choice!.options.length, 3);
  // Huorn of Fangorn: an attachment the engaged player controls is discarded.
  pick(s, s.choice!.options.find((o) => o.code === N.huornOfFangorn)!.id);
  run(s);
  assert.match(s.choice!.title, /Choose an attachment you control to discard/);
  pick(s, stone.id);
  assert.equal(hero.attachments.length, 0);
  run(s);
  // Wicked Huorn: a hero the engaged player controls is exhausted.
  pick(s, s.choice!.options.find((o) => o.code === N.wicked)!.id);
  run(s);
  assert.match(s.choice!.title, /Wicked Huorn · Exhaust a hero/);
  pick(s, s.heroes[1].id);
  assert.equal(s.heroes[1].exhausted, true);
  // Without a Nightmare Huorn, the scenario's own order is left alone.
  const t = board("resource");
  add(t, F.dark, true);
  assert.deepEqual(hooks(t).resourceStart!(t), []);
});

test("Nightmare: Blocking Huorn adds its threat while engaged, and its shadow brings it into play engaged with the defending player", () => {
  const s = board("planning");
  const blocking = add(s, N.blocking, true);
  assert.equal(hooks(s).stagingThreat!(s), threatOf(s, blocking));
  s.engaged = [];
  assert.equal(hooks(s).stagingThreat!(s), 0);
  const t = board("attack", opening(two()));
  const attacker = forOwnerAdd(t, 1, F.angry);
  shadow(t, attacker, N.blocking, undefined, 1);
  assert.deepEqual(attacker.shadows, [], "the shadow card leaves the attacker");
  assert.equal(attacker.revealedShadowCount, 0);
  assert.deepEqual(
    seatView(t, 1).engaged.map((u) => u.code),
    [F.angry, N.blocking],
  );
});
function forOwnerAdd(s: GameState, p: number, code: string) {
  let u!: Unit;
  forOwner(s, p, () => (u = add(s, code, true)));
  return u;
}

test("Nightmare: Entwood shields staged Huorns from player cards and its Travel cost engages the costliest", () => {
  const s = board("travel");
  const entwood = add(s, N.entwood);
  const staged = add(s, N.wicked);
  const low = add(s, N.huornOfFangorn);
  const engaged = add(s, N.blocking, true);
  syncAttachmentText(s);
  assert.equal(playerCardImmune(staged), true);
  assert.equal(playerCardImmune(engaged), false);
  assert.equal(hooks(s).travelProblem!(s, entwood), null);
  run(s, hooks(s).travelEffects!(s, entwood));
  assert.ok(
    s.engaged.some((u) => u.id === staged.id),
    "the 33-cost Wicked Huorn",
  );
  assert.ok(s.staging.some((u) => u.id === low.id));
  // Two Huorns tied: the first player chooses.
  const t = board("travel");
  const wood = add(t, N.entwood);
  const a = add(t, N.wicked);
  add(t, N.wicked);
  run(t, hooks(t).travelEffects!(t, wood));
  assert.match(
    t.choice!.title,
    /Entwood · Engage the highest engagement cost Huorn/,
  );
  pick(t, a.id);
  assert.ok(t.engaged.some((u) => u.id === a.id));
  // No Huorn in the staging area: the cost cannot be paid.
  const u = board("travel");
  const lone = add(u, N.entwood);
  assert.match(
    hooks(u).travelProblem!(u, lone) ?? "",
    /requires a Huorn enemy/,
  );
});

test("Nightmare: Dark Corner of Fangorn silences Hinder from the staging area and, once active, sends each engaged Huorn to attack", () => {
  const s = board("combat");
  add(s, N.huornOfFangorn, true);
  s.progress = 3;
  fangornCombatStart(s);
  assert.ok(s.queue.some((e) => e.kind === "fangornHinder"));
  const t = board("combat");
  add(t, N.huornOfFangorn, true);
  add(t, N.darkCorner);
  fangornCombatStart(t);
  assert.ok(!t.queue.some((e) => e.kind === "fangornHinder"), "no hinder");
  // Active: each engaged Huorn makes an immediate attack.
  const u = board("travel");
  const corner = make(u, N.darkCorner);
  const first = add(u, N.huornOfFangorn, true);
  const second = add(u, F.angry, true);
  u.activeLocation = corner;
  hooks(u).travelEntered!(u, corner, true);
  run(u);
  assert.match(u.choice!.title, /Choose the next Huorn to attack/);
  assert.deepEqual(
    u.choice!.options.map((o) => o.effects[0].target),
    [first.id, second.id],
  );
});

test("Nightmare: Tangled Forest turns removed quest progress into damage among characters in play, once for all copies", () => {
  const s = board("combat", opening(two()));
  add(s, N.tangledForest);
  add(s, N.tangledForest);
  s.progress = 5;
  assert.equal(removeCurrentQuestProgress(s, 2), 2);
  run(s);
  assert.match(
    s.choice!.title,
    /Tangled Forest · Assign 2 damage among characters in play/,
  );
  // Both players' characters can take it; damage waits for every assignment.
  const other = seatView(s, 1).heroes[0];
  assert.ok(s.choice!.options.some((o) => o.id.startsWith(other.id)));
  pick(s, `${s.heroes[0].id}:1`);
  assert.equal(s.heroes[0].damage, 0);
  pick(s, `${other.id}:1`);
  run(s);
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(seatView(s, 1).heroes[0].damage, 1);
  assert.equal(s.choice, null, "a single trigger for both copies");
  // Hinder's progress removal triggers it too.
  const t = board("combat");
  add(t, N.tangledForest);
  add(t, N.huornOfFangorn, true);
  t.progress = 3;
  fangornCombatStart(t);
  run(t);
  assert.equal(t.progress, 2);
  assert.match(t.choice!.title, /Assign 1 damage/);
});

test("Nightmare: Stifling Woods takes 6 progress or a time counter, and its shadow clears the quest after a destroying attack", () => {
  const s = board("staging");
  s.progress = 7;
  revealed(s, N.stifling);
  run(s);
  assert.deepEqual(options(s), ["progress", "time"]);
  pick(s, "progress");
  assert.equal(s.progress, 1);
  assert.equal(s.fangorn!.time, 4);
  // Fewer than 6 progress: the time counter goes.
  const t = board("staging");
  t.progress = 5;
  revealed(t, N.stifling);
  run(t);
  assert.equal(t.choice, null);
  assert.equal(t.fangorn!.time, 3);
  assert.equal(t.progress, 5);
  // Shadow: +1 [attack]; a destroyed character clears the quest.
  const u = board("attack");
  u.progress = 8;
  const enemy = add(u, F.angry, true);
  shadow(u, enemy, N.stifling, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 1);
  assert.equal(u.combat!.nmClearOnKill, 1);
  damage(u, u.heroes[0].id, 99, { combatDamage: true, enemyId: enemy.id });
  run(u);
  assert.equal(u.progress, 0);
});

test("Nightmare: Fangorn's Anger wounds Mugash's captor or surges with doomed 2, and its shadow sends the attacker after the captor", () => {
  const s = board("staging");
  const hero = captive(s);
  revealed(s, N.anger);
  run(s);
  assert.equal(hero.damage, 2);
  assert.ok(!hero.attachments.some((a) => a.code === F.mugash));
  assert.equal(
    s.encounterDeck[0],
    F.mugash,
    "Mugash escapes to the top of the deck",
  );
  assert.equal(s.threat, 20, "no doomed while Mugash was held");
  // Without a captive: surge and doomed 2.
  const t = board("staging");
  assert.equal(hooks(t).revealedDoomed!(t, N.anger, "encounter"), 2);
  assert.equal(hooks(t).revealedSurge!(t, N.anger), true);
  captive(t);
  assert.equal(hooks(t).revealedDoomed!(t, N.anger, "encounter"), 0);
  assert.equal(hooks(t).revealedSurge!(t, N.anger), false);
  // Shadow: after the attack, the attacker engages the captor's player.
  const u = board("attack", opening(two()));
  forOwner(u, 1, () => captive(u));
  const enemy = add(u, F.angry, true);
  shadow(u, enemy, N.anger, u.heroes[0]);
  assert.equal(u.combat!.nmEngageCarrier, 1);
  run(u, hooks(u).attackFinished!(u, u.combat!));
  assert.ok(seatView(u, 1).engaged.some((x) => x.id === enemy.id));
  assert.ok(!seatView(u, 0).engaged.some((x) => x.id === enemy.id));
});

test("Nightmare: Wicked Huorn's shadow shields the attacker for the round, and the Nightmare state survives saves; seeded games finish with valid saves", () => {
  const s = board("attack");
  const enemy = add(s, F.angry, true);
  shadow(s, enemy, N.wicked, s.heroes[0]);
  damage(s, enemy.id, 3);
  assert.equal(enemy.damage, 0);
  hooks(s).roundEnd!(s);
  s.round += 1;
  damage(s, enemy.id, 3);
  assert.equal(enemy.damage, 3);
  const t = board("planning");
  t.nightmare = { fangornShield: [{ enemy: "x1", round: 1 }] };
  assert.ok(valid(t));
  t.nightmare = { fangornShield: [{ enemy: 3, round: 1 }] as never };
  assert.equal(valid(t), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
