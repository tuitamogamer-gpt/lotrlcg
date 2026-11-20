import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage } from "../src/game/board";
import { fx, make, spendResources, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { DRUADAN_FOREST as D } from "../src/game/druadan-forest-support";
import {
  advanceDruadanForest,
  druadanForestArchery,
  druadanForestAttackProgress,
  druadanForestShadow,
} from "../src/game/druadan-forest";
import {
  NIGHTMARE,
  NIGHTMARE_AS as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { allHeroes, forOwner, ownerOf, seatIndices } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  d,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Ancestral Clearing: a location with no "When Revealed" effect and no shadow. */
const QUIET = D.clearing;
const game = (seed = 5) => nightmareGame("the-druadan-forest", seed);
const two = (seed = 5) => nightmareForTwo("the-druadan-forest", seed);
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
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
    staging: [],
    nightmare: {},
    victoryCards: [],
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.allies = [];
      s.threat = 20;
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

test("Nightmare: The Drúadan Forest's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.druadanCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Druadan Forest - Nightmare", true],
  );
  assert.match(
    c.text!,
    /2x Lost Companion\n3x Secluded Glade\n1x Overgrown Trail\n1x Drû-buri-Drû\n/,
  );
  assert.match(
    c.back_text!,
    /^You are playing Nightmare mode\.\nHeroes do not collect resources/,
  );
  assert.equal(card(N.boss).name, "Drû-buri-Drû");
  assert.equal(card(N.boss).is_unique, true);
  assert.match(
    card(N.boss).text!,
    /other Wose enemies get \+1 \[attack\] and \+1 \[defense\]/,
  );
  assert.match(card(N.warrior).text!, /against Drúadan Warrior\.$/);
  assert.match(
    card(N.stalker).text!,
    /As an additional cost to optionally engage Drúadan Stalker/,
  );
  assert.match(card(N.mirk).text!, /each Wose enemy gets \+2 \[defense\]/);
  assert.match(card(N.stonewain).text!, /resources discarded or spent/);
  assert.match(
    card(N.drums).text!,
    /by this effect, Drums of the Wild Men gains surge/,
  );
  assert.match(
    card(N.darts).text!,
    /^Surge\.\nWhen Revealed: Attach to the enemy .*Weapon attachment/s,
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Druadan Forest - Nightmare",
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

test("Nightmare: The Drúadan Forest's Nightmare deck matches its source recipe, with 5 resources and a Garden of Poisons at setup", () => {
  const sets = scenario("the-druadan-forest").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("the-druadan-forest", standard);
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
  const recipe = recipes.find((r) => r.id === "N03.5")!;
  const want: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea", "sharedSetAside"].includes(
        c.section,
      ) &&
      c.code !== N.druadanCard
    )
      want[c.code] = (want[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), want);
  for (const [title, n] of Object.entries(
    NIGHTMARE["the-druadan-forest"]!.removals,
  ))
    assert.ok(
      card(N.druadanCard).text!.includes(
        `${n}x ${title === "Dru-buri-Dru" ? "Drû-buri-Drû" : title}`,
      ),
      title,
    );
  assert.equal(
    automatedScenarioId({
      name: "The Druadan Forest (Nightmare)",
      mode: "nightmare",
    }),
    "the-druadan-forest",
  );
  for (const s of [game(), two()]) {
    assert.equal(nightmareCardOf(s), N.druadanCard);
    assert.equal(s.druadanForest?.bossSetAside, N.boss);
    assert.ok(
      !s.encounterDeck.includes(N.boss) && !s.encounterDeck.includes(D.boss),
    );
    assert.ok(allHeroes(s).every((h) => h.resources === 5));
    assert.ok(s.staging.some((u) => u.code === D.garden));
    assert.match(nightmareStatus(s)[0], /collect no resources/);
  }
  assert.ok(valid(opening(game())));
  const n = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "the-druadan-forest",
  });
  assert.equal(n.druadanForest?.bossSetAside, D.boss);
});

test("Nightmare: no resources in the resource phase, at least 3 after stage 2B (none under a Garden of Poisons), and the Nightmare Drû-buri-Drû at stage 3 and in the victory display", () => {
  const s = board("planning");
  assert.equal(hooks(s).cannotCollectResources!(s, s.heroes[0]), true);
  s.heroes[0].resources = 0;
  s.heroes[1].resources = 4;
  s.progress = 11;
  advanceDruadanForest(s);
  assert.equal(s.stage, 2);
  assert.deepEqual(
    s.heroes.slice(0, 2).map((h) => h.resources),
    [3, 4],
  );
  // A Garden of Poisons in play: heroes cannot gain resources from card effects.
  const g = board("planning");
  g.staging.push(make(g, D.garden));
  g.heroes[0].resources = 0;
  g.progress = 11;
  advanceDruadanForest(g);
  assert.deepEqual(
    [g.stage, ...g.heroes.map((h) => h.resources)],
    [2, 0, 2, 2],
  );
  assert.match(g.log.at(-2)!.text, /0 gained; 3 heroes cannot gain/);
  // Stage 3: the set-aside Nightmare Drû-buri-Drû.
  const t = board("planning");
  t.druadanForest = { bossSetAside: N.boss };
  t.stage = 2;
  t.progress = 17;
  advanceDruadanForest(t);
  flush(t);
  assert.ok(t.staging.some((u) => u.code === N.boss));
  // The win needs it in the victory display.
  const u = board("planning");
  u.druadanForest = {};
  u.stage = 3;
  u.progress = 14;
  advanceDruadanForest(u);
  assert.equal(u.status, "playing");
  u.victoryCards = [N.boss];
  advanceDruadanForest(u);
  assert.equal(u.status, "won");
});

test("Nightmare: Drû-buri-Drû takes 1 damage (or stage 3 progress) each round and strengthens the other Wose; Devil's Mirk shields them and stops healing", () => {
  const s = board("attack");
  s.druadanForest = {}; // Drû-buri-Drû in play, no longer set aside
  const boss = add(s, N.boss, true);
  const warrior = add(s, N.warrior, true);
  damage(s, boss.id, 3);
  assert.equal(boss.damage, 1);
  damage(s, boss.id, 1);
  assert.equal(boss.damage, 1, "this round");
  s.round += 1;
  damage(s, boss.id, 2);
  assert.equal(boss.damage, 2);
  assert.deepEqual(
    [stats(s, warrior).attack, stats(s, warrior).defense],
    [6, 4],
  );
  assert.equal(stats(s, boss).attack, 5, "not itself");
  // Stage 3's willpower attacks: the progress replacing its damage counts.
  const p = board("attack");
  Object.assign(p, { stage: 3, druadanForest: {} });
  const target = add(p, N.boss, true);
  assert.equal(druadanForestAttackProgress(p, target, 4), true);
  assert.equal(target.progress, 1);
  druadanForestAttackProgress(p, target, 2);
  assert.deepEqual([target.progress, target.damage], [1, 0], "this round");
  for (const round of [1, 2]) {
    p.round += 1;
    druadanForestAttackProgress(p, target, 5);
    assert.equal(
      p.victoryCards!.includes(N.boss),
      round === 2,
      `round ${round}`,
    );
  }
  assert.ok(!p.engaged.some((x) => x.id === target.id));
  const mirk = make(s, N.mirk);
  s.activeLocation = mirk;
  assert.equal(stats(s, warrior).defense, 6);
  assert.equal(hooks(s).immune!(s, mirk), true);
  assert.equal(hooks(s).cannotHeal!(s, s.heroes[0]), false);
  s.activeLocation = null;
  s.staging.push(mirk);
  assert.equal(hooks(s).cannotHeal!(s, s.heroes[0]), true);
  assert.ok(valid(s));
});

test("Nightmare: Drúadan Warrior refuses heroes without resources, and Drúadan Stalker has archery 3 and costs 2 resources to engage", () => {
  const s = board("defense");
  const warrior = add(s, N.warrior, true);
  s.heroes[0].resources = 0;
  assert.equal(hooks(s).cannotDefend!(s, warrior, s.heroes[0]), true);
  assert.equal(hooks(s).cannotAttack!(s, s.heroes[0], warrior), true);
  assert.equal(hooks(s).cannotDefend!(s, warrior, s.heroes[1]), false);
  const stalker = add(s, N.stalker);
  assert.equal(druadanForestArchery(s, stalker), 3);
  for (const h of s.heroes) h.resources = 0;
  s.heroes[0].resources = 1;
  assert.equal(hooks(s).cannotOptionallyEngage!(s, stalker), true);
  s.heroes[1].resources = 1;
  assert.equal(hooks(s).cannotOptionallyEngage!(s, stalker), false);
  hooks(s).engaged!(s, stalker, true);
  flush(s);
  for (let i = 0; i < 4 && s.choice; i++) pick(s, s.choice.options[0].id);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    0,
    "2 resources spent",
  );
  // Its shadow: +X, X the attacker's prowl value.
  const t = board("defense");
  const w = add(t, N.warrior, true);
  shadow(t, w, N.stalker, t.heroes[0]);
  assert.equal(t.combat!.attackBonus, 2);
});

test("Nightmare: Eilenach needs a resource on each hero, Stonewain Valley takes the first player's spent and discarded resources", () => {
  const s = board("travel");
  const eilenach = add(s, N.eilenach);
  assert.equal(hooks(s).travelProblem!(s, eilenach), null);
  s.heroes[2].resources = 0;
  assert.match(hooks(s).travelProblem!(s, eilenach)!, /each hero must have/);
  // Its shadow.
  const t = board("defense");
  const foe = add(t, N.warrior, true);
  t.heroes[0].resources = 0;
  shadow(t, foe, N.eilenach, t.heroes[0]);
  flush(t);
  assert.equal(t.heroes[0].damage, 1);
  // Stonewain Valley.
  const u = board("planning");
  const valley = add(u, N.stonewain);
  spendResources(u, u.heroes[0], 2);
  assert.equal(valley.resources, 2);
  assert.equal(threatOf(u, valley), 3);
  // Discarded: a prowl's or a payment's resource, Stars in Sky's shadow.
  run(u, [fx("druadanDiscardResource", { target: u.heroes[1].id })]);
  assert.deepEqual([u.heroes[1].resources, valley.resources], [1, 3]);
  const v = board("defense");
  const vale = add(v, N.stonewain);
  const wose = add(v, N.warrior, true);
  shadow(v, wose, D.stars, v.heroes[0]); // the scenario's own shadow, below
  assert.equal(druadanForestShadow(v, D.stars), true);
  assert.deepEqual([v.heroes[0].resources, vale.resources], [0, 2]);
  // The second player's resources stay in the bank.
  const w = board("planning", opening(two()));
  const glen = add(w, N.stonewain);
  const other = allHeroes(w).find((h) => ownerOf(w, h) === 1)!;
  run(w, [fx("druadanDiscardResource", { target: other.id })]);
  forOwner(w, 1, () => spendResources(w, other, 1));
  assert.deepEqual([other.resources, glen.resources], [0, 0]);
});

test("Nightmare: Drums of the Wild Men triggers prowl and returns engaged Wose enemies, and Poison-darts arms the costliest enemy", () => {
  let s = board("staging");
  add(s, N.warrior, true);
  s = reveal(s, N.drums);
  assert.equal(s.engaged.length, 0);
  assert.ok(s.staging.some((u) => u.code === N.warrior));
  assert.ok(
    s.heroes.reduce((n, h) => n + h.resources, 0) <= 4,
    "prowl 2 discarded",
  );
  // No Wose returned: surge.
  let t = board("staging");
  t = reveal(t, N.drums);
  assert.ok(
    t.staging.some((u) => u.code === QUIET),
    "surge",
  );
  // Poison-darts.
  let u = board("staging");
  const low = add(u, N.warrior);
  const high = add(u, N.stalker, true);
  u = reveal(u, N.darts);
  const armed = u.engaged.find((x) => x.id === high.id)!;
  assert.equal(armed.attachments.length, 1);
  assert.equal(stats(u, armed).attack, 5);
  assert.equal(druadanForestArchery(u, armed), 5);
  assert.equal(u.staging.find((x) => x.id === low.id)!.attachments.length, 0);
  // No enemy in play: discarded.
  let v = board("staging");
  v = reveal(v, N.darts);
  assert.ok(v.encounterDiscard.includes(N.darts));
});

test("Nightmare: The Drúadan Forest's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = { bossDamage: { round: 2, taken: 1 } };
  assert.ok(valid(s));
  s.nightmare = { bossDamage: { round: 2, taken: -1 } } as never;
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `the-druadan-forest seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player the-druadan-forest");
});
