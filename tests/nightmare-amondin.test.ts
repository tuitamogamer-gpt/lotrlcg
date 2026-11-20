import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, engage, progressLocation } from "../src/game/board";
import { make, stagingThreat } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { AMON_DIN as A } from "../src/game/amon-din-support";
import {
  NIGHTMARE,
  NIGHTMARE_AS as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { allHeroes, forOwner, seatIndices } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Secluded Farmhouse: a location with no "When Revealed" effect and no shadow. */
const QUIET = A.secluded;
const game = (seed = 5) => nightmareGame("encounter-at-amon-din", seed);
const two = (seed = 5) => nightmareForTwo("encounter-at-amon-din", seed);
const rescued = (s: GameState) => s.staging.find((u) => u.code === A.rescued)!;
const dead = (s: GameState) => s.staging.find((u) => u.code === A.dead)!;
/**
 * A quiet board at stage 1: Rescued Villagers with `villagers` tokens, no
 * deaths, Lord Alcaron exhausted (so a discarded villager dies at once).
 */
function board(
  phase: GameState["phase"],
  villagers = 3,
  s: GameState = opening(game()),
) {
  calm(s, phase);
  const objectives = s.staging.filter(
    (u) => u.code === A.rescued || u.code === A.dead,
  );
  Object.assign(s, {
    stage: 1,
    stageRevealing: false,
    progress: 0,
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(10).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: objectives,
    nightmare: {},
    victoryCards: [],
  });
  rescued(s).resources = villagers;
  rescued(s).attachments = [];
  dead(s).damage = 0;
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.allies = s.allies.filter((u) => u.code === A.alcaron);
      s.threat = 20;
      for (const u of s.allies) u.exhausted = true;
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          resources: 2,
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
const run = (s: GameState, effects: GameState["queue"]) => {
  s.queue.unshift(...effects);
  flush(s);
  return s;
};
/** Answer the pending choice with the option whose label matches. */
const answer = (s: GameState, label: RegExp) =>
  pick(s, s.choice!.options.find((o) => label.test(o.label))!.id);

test("Nightmare: Encounter at Amon Dîn's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.amonCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Encounter at Amon Din - Nightmare", true],
  );
  assert.match(
    c.text!,
    /2x Burning Farmhouse\n2x Gondorian Hamlet\n1x Marauding Orc\n1x Orc Rabble\n3x Orc Ravager\n2x Craven Eagle\n2x Trapped Inside\n2x Panicked!\n2x Scourge of Mordor\n/,
  );
  assert.match(
    c.back_text!,
    /^You are playing Nightmare mode\.\nGhulat cannot take damage unless there are at least 15 progress tokens on Protect the Villagers\.\nSetup: Place 1 villager token on Rescued Villagers\.\nForced: At the beginning of the quest phase/,
  );
  assert.equal(card(N.homestead).name, "Besieged Homestead");
  assert.equal(card(N.pillaging).name, "Pillaging Orc");
  assert.match(
    card(N.village).text!,
    /it gains: "Forced: After an enemy engages a player, discard 1 villager token from Overrun Village\."\nTravel: Place 1 damage token on Dead Villagers\.$/,
  );
  assert.match(
    card(N.saveUs).text!,
    /search the encounter deck and discard pile/,
  );
  assert.match(
    card(N.sundered).text!,
    /^Surge\. Doomed 1\.\nWhen Revealed: Attach to Rescued Villagers\./,
  );
  assert.deepEqual(
    [N.raiders, N.pillaging].map((x) => {
      const k = card(x);
      return [k.engagement, k.threat, k.attack, k.defense, k.health];
    }),
    [
      [32, 4, 5, 2, 6],
      [34, 2, 4, 3, 5],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Encounter at Amon Din - Nightmare",
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

test("Nightmare: Encounter at Amon Dîn's Nightmare deck matches its source recipe, with a villager on Rescued Villagers at setup", () => {
  const sets = scenario("encounter-at-amon-din").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("encounter-at-amon-din", standard);
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
  const recipe = recipes.find((r) => r.id === "N03.6")!;
  const want: Record<string, number> = {};
  // Every pile but the quest deck: the encounter deck, the set-aside Ghulat,
  // the staged objectives, the active Burning Farmhouse and Lord Alcaron.
  for (const c of recipe.cards)
    if (c.code !== N.amonCard && c.section !== "sharedQuestDeck")
      want[c.code] = (want[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), want);
  for (const [title, n] of Object.entries(
    NIGHTMARE["encounter-at-amon-din"]!.removals,
  ))
    assert.ok(card(N.amonCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "Encounter at Amon Dîn (Nightmare)",
      mode: "nightmare",
    }),
    "encounter-at-amon-din",
  );
  for (const s of [game(), two()]) {
    assert.equal(nightmareCardOf(s), N.amonCard);
    assert.ok(
      s.log.some((l) =>
        /1 villager token is placed on Rescued Villagers/.test(l.text),
      ),
    );
    assert.match(nightmareStatus(s)[0], /Ghulat cannot take damage/);
  }
  // Before the setup's reveals touch it, Rescued Villagers holds 1.
  const g = nightmareGame("encounter-at-amon-din", 11);
  assert.ok(rescued(g).resources <= 1);
  assert.ok(valid(opening(game())));
});

test("Nightmare: Ghulat takes no damage before 15 progress on Protect the Villagers, and each quest phase costs a villager or a card", () => {
  const s = board("attack");
  Object.assign(s, { stage: 2, progress: 14 });
  Object.assign(s, { amonDin: { questVillagers: 0, ghulatSetAside: false } });
  const ghulat = add(s, A.ghulat, true);
  damage(s, ghulat.id, 3);
  assert.equal(ghulat.damage, 0);
  s.progress = 15;
  damage(s, ghulat.id, 3);
  assert.equal(ghulat.damage, 3);
  assert.ok(valid(s));
  // The beginning of the quest phase: a villager, or a revealed card.
  let q = board("quest", 2);
  run(q, hooks(q).questBegin!(q) as GameState["queue"]);
  q = answer(q, /Discard 1 villager token/);
  assert.deepEqual([rescued(q).resources, dead(q).damage], [1, 1]);
  let r = board("quest", 2);
  run(r, hooks(r).questBegin!(r) as GameState["queue"]);
  r = answer(r, /Reveal an encounter card/);
  assert.equal(rescued(r).resources, 2);
  assert.ok(r.staging.some((u) => u.code === QUIET));
  // No villager left: the card is revealed.
  const t = board("quest", 0);
  run(t, hooks(t).questBegin!(t) as GameState["queue"]);
  assert.equal(t.choice, null);
  assert.ok(t.staging.some((u) => u.code === QUIET));
});

test("Nightmare: Orc Raiders and Pillaging Orc take a villager or attack and reveal, and their shadows add an attack and shadow cards", () => {
  // Orc Raiders: a villager, or an immediate attack against the first player.
  let s = board("staging", 1);
  s = reveal(
    s,
    N.raiders,
    (x) => x.choice!.options.find((o) => o.id === "discard")?.id,
  );
  assert.deepEqual([rescued(s).resources, dead(s).damage], [0, 1]);
  assert.equal(s.combat, null);
  const t = board("staging", 0);
  revealIn(t, N.raiders);
  assert.equal(
    t.combat?.enemyId,
    t.staging.find((u) => u.code === N.raiders)?.id,
  );
  // Pillaging Orc: a villager, or an additional encounter card.
  let u = board("staging", 2);
  u = reveal(
    u,
    N.pillaging,
    (x) => x.choice!.options.find((o) => o.id === "reveal")?.id,
  );
  assert.equal(rescued(u).resources, 2);
  assert.ok(u.staging.some((x) => x.code === QUIET));
  // Orc Raiders' shadow: an additional attack after this one.
  const v = board("defense");
  const foe = add(v, A.marauder, true);
  shadow(v, foe, N.raiders, v.heroes[0]);
  const again = hooks(v).attackFinished!(v, v.combat!);
  assert.deepEqual(
    again.map((e) => [e.kind, e.target]),
    [["immediateAttack", foe.id]],
  );
  assert.deepEqual(hooks(v).attackFinished!(v, v.combat!), []);
  // Pillaging Orc's shadow: 1 shadow card per villager on the active location.
  const w = board("defense");
  const orc = add(w, A.marauder, true);
  w.activeLocation = make(w, QUIET);
  w.activeLocation.resources = 2;
  shadow(w, orc, N.pillaging, w.heroes[0]);
  flush(w);
  assert.equal(orc.shadows.length, 3);
});
/** An encounter card revealed without answering its choices. */
function revealIn(s: GameState, code: string) {
  reveal(s, code, () => undefined);
  return s;
}

test("Nightmare: Besieged Homestead and Overrun Village lose their villagers, and their Travel effects bring an enemy and a death", () => {
  // Progress on a location in the staging area: 1 villager per Homestead.
  const s = board("planning");
  const homestead = add(s, N.homestead);
  const village = add(s, N.village);
  homestead.resources = 2;
  village.resources = 2;
  progressLocation(s, village, 1);
  flush(s);
  assert.deepEqual([village.resources, dead(s).damage], [1, 1]);
  s.activeLocation = make(s, N.homestead);
  progressLocation(s, homestead, 1);
  flush(s);
  assert.deepEqual([homestead.resources, dead(s).damage], [0, 3]);
  // Besieged Homestead's Travel: an enemy revealed and engaged.
  let t = board("travel");
  t.encounterDeck = [QUIET, A.marauder, QUIET];
  const travel = hooks(t).travelEffects!(t, make(t, N.homestead))!;
  run(t, travel);
  t = pick(t, t.choice!.options[0].id);
  assert.ok(t.engaged.some((u) => u.code === A.marauder));
  assert.ok(!t.encounterDeck.includes(A.marauder));
  assert.equal(t.nightmare?.engageNext, undefined);
  // Overrun Village: an enemy engaging discards a villager; its Travel kills one.
  const u = board("encounter");
  const overrun = add(u, N.village);
  overrun.resources = 2;
  const foe = add(u, A.marauder);
  engage(u, foe);
  flush(u);
  assert.deepEqual([overrun.resources, dead(u).damage], [1, 1]);
  run(u, hooks(u).travelEffects!(u, overrun)!);
  assert.equal(dead(u).damage, 2);
});

test("Nightmare: Trapped Villagers kills 3 villagers and raises the staging area's threat for the round, its shadow counting a destroyed ally", () => {
  let s = board("staging");
  const before = stagingThreat(s);
  s = reveal(s, N.trapped);
  assert.equal(dead(s).damage, 3);
  assert.equal(stagingThreat(s), before + 3);
  s.round += 1;
  assert.equal(stagingThreat(s), before);
  // Its shadow: +2 [attack], and a destroyed ally places a damage token.
  const t = board("defense");
  const foe = add(t, A.marauder, true);
  const ally = make(t, "01016");
  t.allies.push(ally);
  t.hand = []; // no Valiant Sacrifice response
  shadow(t, foe, N.trapped, ally);
  assert.equal(t.combat!.attackBonus, 2);
  damage(t, ally.id, 10, { combatDamage: true, enemyId: foe.id });
  flush(t);
  run(t, hooks(t).attackFinished!(t, t.combat!));
  assert.equal(dead(t).damage, 1);
});

test("Nightmare: Run for your Lives! and Save Us! cost villagers, damage and enemies, with their shadows", () => {
  // Run for your Lives!: a villager, then X damage (X the dead villagers).
  let s = board("staging", 2);
  dead(s).damage = 1;
  s = reveal(s, N.run);
  const dealt = allHeroes(s).reduce((n: number, h: Unit) => n + h.damage, 0);
  assert.deepEqual([rescued(s).resources, dead(s).damage, dealt], [1, 2, 2]);
  // Its shadow: a villager, or the attack is undefended.
  let t = board("defense", 1);
  const foe = add(t, A.marauder, true);
  shadow(t, foe, N.run, t.heroes[0]);
  flush(t);
  t = answer(t, /considered undefended/);
  assert.deepEqual(t.combat!.defenderIds, []);
  const u = board("defense", 0);
  const orc = add(u, A.marauder, true);
  shadow(u, orc, N.run, u.heroes[0]);
  flush(u);
  assert.deepEqual([u.choice, u.combat!.defenderIds], [null, []]);
  // Save Us!: 2 villagers, or an enemy from the encounter deck or discard pile.
  let v = board("staging", 2);
  v.encounterDiscard = [A.marauder];
  v = reveal(
    v,
    N.saveUs,
    (x) => x.choice!.options.find((o) => o.id === `search:${A.marauder}`)?.id,
  );
  assert.ok(v.staging.some((x) => x.code === A.marauder));
  assert.ok(!v.encounterDiscard.includes(A.marauder));
  let w = board("staging", 2);
  w = reveal(
    w,
    N.saveUs,
    (x) => x.choice!.options.find((o) => o.id === "discard")?.id,
  );
  assert.deepEqual([rescued(w).resources, dead(w).damage], [0, 2]);
  // Its shadow: +1 [attack] and another shadow card.
  const z = board("defense");
  const raider = add(z, A.marauder, true);
  shadow(z, raider, N.saveUs, z.heroes[0]);
  flush(z);
  assert.deepEqual([z.combat!.attackBonus, raider.shadows.length], [1, 2]);
});

test("Nightmare: Those Now Sundered surges onto Rescued Villagers and takes a villager each round, and the Nightmare state survives saves", () => {
  let s = board("staging", 2);
  const threat = s.threat;
  s = reveal(s, N.sundered);
  assert.equal(
    rescued(s).attachments.filter((a) => a.code === N.sundered).length,
    1,
  );
  assert.equal(s.threat, threat + 1, "Doomed 1");
  assert.ok(
    s.staging.some((u) => u.code === QUIET),
    "surge",
  );
  assert.ok(!s.encounterDiscard.includes(N.sundered));
  run(s, hooks(s).roundEnd!(s));
  assert.deepEqual([rescued(s).resources, dead(s).damage], [1, 1]);
  assert.ok(valid(s));
  // A second copy: its own attachment, and a villager each.
  s = reveal(s, N.sundered);
  const ids = rescued(s).attachments.map((a) => a.id);
  assert.equal(new Set(ids).size, 2);
  run(s, hooks(s).roundEnd!(s));
  assert.deepEqual([rescued(s).resources, dead(s).damage], [0, 2]);
  assert.ok(valid(s));
  const t = board("planning");
  t.nightmare = {
    trapped: { round: 2, count: 1 },
    raiders: [{ enemyId: "e1", player: 0 }],
    trappedShadows: [{ enemyId: "e1", killed: true }],
    engageNext: A.marauder,
  };
  assert.ok(valid(t));
  t.nightmare = { engageNext: QUIET };
  assert.equal(valid(t), false);
  t.nightmare = { trapped: { round: 2, count: -1 } };
  assert.equal(valid(t), false);
});

test("Nightmare: seeded Encounter at Amon Dîn games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `encounter-at-amon-din seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player encounter-at-amon-din");
});
