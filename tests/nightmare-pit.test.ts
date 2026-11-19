import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { check, destroy, progressLocation } from "../src/game/board";
import {
  engagementCost,
  fx,
  locationQuest,
  mainStageInfo,
  make,
  stats,
  threatOf,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { KHAZAD, advanceKhazad } from "../src/game/khazad-dum";
import {
  NIGHTMARE,
  NIGHTMARE_KD as K,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { mainQuestCode } from "../src/game/quest-state";
import { hasTrait } from "../src/game/expansion-passives";
import { forOwner } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  choose,
  nightmareForTwo,
  nightmareGame,
  opening,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const pit = (seed = 5) => nightmareGame("into-the-pit", seed);
/** A quiet board in `phase`: no location active, nothing staged, engaged or discarded. */
const board = (phase: GameState["phase"], seed = 5) => {
  const s = calm(opening(pit(seed)), phase);
  s.activeLocation = null;
  delete s.extraActiveLocations;
  s.staging = [];
  s.engaged = [];
  s.encounterDiscard = [];
  for (const h of s.heroes) h.exhausted = false;
  return s;
};
const hooks = (s: GameState) => batch4Scenario(s);
const torchOf = (s: GameState) => {
  for (const u of s.heroes)
    for (const a of u.attachments) if (a.code === KHAZAD.torch) return { u, a };
  return undefined;
};
const run = (s: GameState, kind: string, data: object = {}) => {
  s.queue.push(fx(kind, data));
  flush(s);
  return s;
};
/** Exhaust Cave Torch (as Lightless Passage's travel cost does). */
const exhaustTorch = (s: GameState) => {
  const t = torchOf(s)!;
  t.a.exhausted = false;
  return run(s, "khazadExhaustTorch", { target: t.u.id, source: t.a.id });
};
/** Stage 1 defeated with the Bridge of Khazad-dûm in the victory display. */
function toStage2(s: GameState) {
  s.progress = 7;
  s.khazad!.victoryCards.push(KHAZAD.bridge);
  advanceKhazad(s);
  flush(s);
  return s;
}

test("Nightmare: Into the Pit's setup card, Goblin Ambush and Nightmare Deck carry their scans' texts", () => {
  const c = card(K.pitCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Into the Pit - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Into the Pit scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter and quest deck:\n1x Goblin Patrol\n2x Stairs of Náin\n2x Goblin Follower\n2x Crumbling Ruin\n3x Cave In\n2x Fouled Well\n2x Goblin Tunnels\n5x Goblin Swordsman\nAdd the new quest card in this Nightmare Deck to the normal quest deck, in stage order\./,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: After Cave Torch exhausts, place 1 damage token on this card. Then, if there are 5 or more damage tokens on this card, remove Cave Torch from the game.",
  );
  const q = card(K.ambush);
  assert.deepEqual(
    [q.type_code, q.back_type_code, q.cost],
    ["quest", "quest", 2],
  );
  assert.match(
    q.text!,
    /^When Revealed: The first player must search .* for X Orc enemies .* One of these choices must be Patrol Sentry and one must be Patrol Leader, if able\.$/,
  );
  assert.equal(
    q.back_text,
    "X is 1 plus the number of players in the game.\nForced: After an enemy is defeated, place 1 progress on this stage.\nProgress cannot be placed on Goblin Ambush except by the above effect.",
  );
  // The scans correct the catalog (Goblin Lurker's shadow, Shadow-Fall's
  // quoted text).
  assert.equal(
    card(K.lurker).shadow,
    "Shadow: Attacking enemy gets +1 [attack]. (+3 [attack] instead if the active location is a Dark location.)",
  );
  assert.match(card(K.shadowFall).text!, /gets \+3 quest points\."\)$/);
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(K.sentry), [20, 1, 4, 3, 5]);
  assert.deepEqual(stat(K.lurker), [50, 3, 2, 2, 4]);
  assert.deepEqual(stat(K.dweller), [0, 1, 7, 7, 8]);
  assert.deepEqual(card(K.twisting).printed_stats, { threat: "X", quest: "X" });
  assert.deepEqual([card(K.fissure).threat, card(K.fissure).quest], [3, 1]);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Into the Pit - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set.reduce(
      (n, x) =>
        n +
        (["nightmare", "quest"].includes(x.type_code) ? 0 : (x.quantity ?? 1)),
      0,
    ),
    18,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    10,
  );
});

test("Nightmare: Into the Pit's Nightmare encounter deck follows its setup card, and Cave Torch puts damage on the setup card", () => {
  const sets = scenario("into-the-pit").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("into-the-pit", standard);
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N02.1")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (c.section !== "sharedQuestDeck" && c.code !== K.pitCard)
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  // The setup card removes 2 of the 4 Goblin Followers; the recipe has none.
  expected[KHAZAD.follower] = 2;
  assert.deepEqual(count(deck), expected);
  assert.ok(
    recipe.cards.some(
      (c) => c.section === "sharedQuestDeck" && c.code === K.ambush,
    ),
  );
  const pitDeck = NIGHTMARE["into-the-pit"]!;
  for (const [title, n] of Object.entries({
    ...pitDeck.removals,
    ...pitDeck.questRemovals,
  }))
    assert.ok(card(K.pitCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "Into the Pit (Nightmare)",
      mode: "nightmare",
    }),
    "into-the-pit",
  );
  const s = opening(pit());
  assert.equal(nightmareCardOf(s), K.pitCard);
  assert.match(nightmareStatus(s)[0], /0 of 5 damage tokens on the setup card/);
  assert.ok(torchOf(s), "Cave Torch is attached at setup");
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("into-the-pit"))));
  // Each time Cave Torch exhausts, 1 damage token on the setup card.
  const t = board("planning");
  t.encounterDeck = [KHAZAD.signs, KHAZAD.signs, KHAZAD.signs];
  exhaustTorch(t);
  assert.equal(t.nightmare?.torchDamage, 1);
  assert.match(nightmareStatus(t)[0], /1 of 5 damage tokens/);
  assert.ok(valid(t));
  // Patrol Sentry engaged with a player makes an immediate attack.
  const sentry = make(t, K.sentry);
  t.engaged.push(make(t, KHAZAD.scout), sentry);
  exhaustTorch(t);
  assert.equal(t.nightmare?.torchDamage, 2);
  assert.equal(t.combat?.enemyId, sentry.id);
  assert.equal(t.combat?.immediate, true);
  // At 5 tokens, Cave Torch leaves the game.
  const u = board("planning");
  u.encounterDeck = [KHAZAD.signs, KHAZAD.signs];
  u.nightmare = { torchDamage: 4 };
  exhaustTorch(u);
  assert.equal(u.nightmare.torchDamage, 5);
  assert.equal(torchOf(u), undefined);
  assert.ok(u.removed.includes(KHAZAD.torch));
  assert.ok(valid(u));
  // Through the Cave Torch's Action as well.
  const v = board("planning");
  v.encounterDeck = [KHAZAD.signs, KHAZAD.signs];
  const dark = make(v, KHAZAD.passage);
  v.staging.push(dark);
  const torch = torchOf(v)!;
  run(v, "khazadTorchAction", {
    target: dark.id,
    value: 2,
    source: torch.a.id,
    text: torch.u.id,
  });
  assert.equal(v.nightmare?.torchDamage, 1);
  assert.equal(dark.progress, 2);
});

test("Nightmare: Goblin Ambush replaces Goblin Patrol as stage 2", () => {
  // Solo: X is 2, Patrol Sentry and Patrol Leader.
  const s = board("planning");
  s.encounterDeck = [KHAZAD.signs, K.sentry, KHAZAD.scout, KHAZAD.leader];
  toStage2(s);
  assert.equal(s.stage, 2);
  assert.equal(mainQuestCode(s), K.ambush);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [K.sentry, KHAZAD.leader].sort(),
  );
  assert.equal(s.stageRevealing, false);
  const info = mainStageInfo(s);
  assert.deepEqual([info.name, info.quest], ["Goblin Ambush", 2]);
  // Progress only as enemies are defeated; revealed enemies stay in play.
  addCurrentQuestProgress(s, 5);
  assert.equal(s.progress, 0);
  destroy(s, s.staging[0]);
  assert.equal(s.progress, 1);
  advanceKhazad(s);
  assert.equal(s.stage, 2);
  const t = reveal(s, KHAZAD.scout);
  assert.ok(t.staging.some((u) => u.code === KHAZAD.scout));
  destroy(
    t,
    t.staging.find((u) => u.code === KHAZAD.scout)!,
  );
  // The second defeated enemy defeats the stage at once.
  assert.equal(t.stage, 3);
  assert.equal(t.progress, 0);
  assert.ok(valid(t));
  // Two players: X is 3; the first player chooses the third Orc enemy (from
  // the deck or the discard pile).
  const two = calm(opening(nightmareForTwo("into-the-pit")), "planning");
  two.staging = [];
  for (const p of [0, 1]) forOwner(two, p, () => (two.engaged = []));
  two.encounterDeck = [K.sentry, KHAZAD.leader, KHAZAD.signs];
  two.encounterDiscard = [KHAZAD.scout, K.lurker];
  toStage2(two);
  assert.match(two.choice!.title, /^Goblin Ambush · Choose an Orc enemy/);
  assert.deepEqual(
    two.choice!.options.map((o) => o.id).sort(),
    [KHAZAD.scout, K.lurker].sort(),
  );
  const three = choose(two, K.lurker);
  assert.deepEqual(
    three.staging.map((u) => u.code).sort(),
    [K.sentry, KHAZAD.leader, K.lurker].sort(),
  );
  assert.equal(mainStageInfo(three).quest, 3);
  assert.ok(valid(three));
});

test("Nightmare: Goblin Lurker, Shadow Dweller, Patrol Sentry and their shadows", () => {
  // Goblin Lurker: no optional engagement; +3 [attack] and -40 engagement
  // cost while the active location is Dark.
  const s = board("encounter");
  const lurker = make(s, K.lurker);
  s.staging.push(lurker);
  assert.ok(hooks(s).cannotOptionallyEngage!(s, lurker));
  assert.deepEqual(
    [stats(s, lurker).attack, engagementCost(s, lurker)],
    [2, 50],
  );
  s.activeLocation = make(s, KHAZAD.passage);
  assert.deepEqual(
    [stats(s, lurker).attack, engagementCost(s, lurker)],
    [5, 10],
  );
  // Shadow Dweller makes no engagement checks while Cave Torch is in play.
  const t = board("encounter");
  const dweller = make(t, K.dweller);
  t.staging.push(dweller);
  run(t, "automaticEngagement", { player: 0 });
  assert.ok(t.staging.some((u) => u.id === dweller.id));
  const torch = torchOf(t)!;
  torch.u.attachments = torch.u.attachments.filter((a) => a.id !== torch.a.id);
  run(t, "automaticEngagement", { player: 0 });
  assert.ok(t.engaged.some((u) => u.id === dweller.id));
  // The shadows.
  const u = board("defense");
  const orc = make(u, KHAZAD.scout);
  u.engaged.push(orc);
  shadow(u, orc, K.lurker, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 1);
  u.activeLocation = make(u, KHAZAD.shaft);
  shadow(u, orc, K.lurker, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 3);
  shadow(u, orc, K.sentry, u.heroes[0]);
  assert.deepEqual(orc.shadows, []);
  assert.ok(u.staging.some((x) => x.code === K.sentry));
  const deck = u.encounterDeck.length;
  shadow(u, orc, K.dweller, u.heroes[0]);
  assert.deepEqual(orc.shadows, []);
  assert.equal(u.encounterDeck.length, deck + 1);
  assert.ok(u.encounterDeck.includes(K.dweller));
  shadow(u, orc, K.shadowFall, u.heroes[0]);
  assert.equal(orc.tempDefense, 3);
});

test("Nightmare: Twisting Shadows, Narrow Fissure and Shadow-Fall make the Dark locations harder", () => {
  // Twisting Shadows: X [threat] and quest points, the Dark locations in
  // play; revealed, it removes their progress.
  const s = board("staging");
  const shaft = make(s, KHAZAD.shaft),
    hall = make(s, KHAZAD.hall);
  shaft.progress = 2;
  s.staging.push(shaft, hall);
  const t = reveal(s, K.twisting);
  const twisting = t.staging.find((u) => u.code === K.twisting)!;
  assert.equal(threatOf(t, twisting), 2);
  assert.equal(locationQuest(t, twisting), 2);
  assert.equal(t.staging.find((u) => u.code === KHAZAD.shaft)!.progress, 0);
  // Narrow Fissure: +2 quest points for each Dark location; no progress on
  // it while Cave Torch is ready.
  const fissure = make(t, K.fissure);
  t.staging.push(fissure);
  assert.equal(locationQuest(t, twisting), 4);
  const shaftNow = t.staging.find((u) => u.code === KHAZAD.shaft)!;
  assert.equal(locationQuest(t, shaftNow), 5 + 2);
  progressLocation(t, fissure, 1);
  assert.equal(fissure.progress, 0);
  torchOf(t)!.a.exhausted = true;
  progressLocation(t, fissure, 1);
  assert.equal(fissure.progress, 1);
  // Shadow-Fall: surge; attached to a non-Dark location, which gains the
  // Dark trait and +3 quest points.
  const u = board("staging");
  const first = make(u, KHAZAD.hall),
    passage = make(u, KHAZAD.passage);
  u.staging.push(first, passage);
  u.encounterDeck = [KHAZAD.scout, KHAZAD.scout];
  const v = reveal(u, K.shadowFall, (q) =>
    q.choice?.title.startsWith("Shadow-Fall") ? first.id : undefined,
  );
  const lit = v.staging.find((x) => x.id === first.id)!;
  assert.ok(lit.attachments.some((a) => a.code === K.shadowFall));
  check(v);
  assert.ok(hasTrait(lit, "Dark"));
  assert.equal(locationQuest(v, lit), 2 + 3);
  assert.ok(v.encounterDeck.length < 2, "surge");
  assert.ok(valid(v));
  // No non-Dark location: it is discarded.
  const w = board("staging");
  w.staging.push(make(w, KHAZAD.passage));
  w.activeLocation = make(w, KHAZAD.shaft);
  w.encounterDeck = [KHAZAD.scout, KHAZAD.scout];
  const x = reveal(w, K.shadowFall);
  assert.ok(x.encounterDiscard.includes(K.shadowFall));
  // Twisting Shadows' shadow: +1 [attack] for each Dark location.
  const y = board("defense");
  y.staging.push(make(y, KHAZAD.passage), make(y, K.twisting));
  const orc = make(y, KHAZAD.scout);
  y.engaged.push(orc);
  shadow(y, orc, K.twisting, y.heroes[0]);
  assert.equal(y.combat!.attackBonus, 2);
});

test("Nightmare: seeded Into the Pit games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(pit(seed));
    assert.notEqual(s.status, "playing", `into-the-pit seed ${seed}`);
  }
  // From stage 2, Goblin Ambush.
  const t = board("planning", 3);
  toStage2(t);
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 2");
  const two = autoplay(nightmareForTwo("into-the-pit", 7), 4000);
  assert.notEqual(two.status, "playing", "two-player into-the-pit");
});
