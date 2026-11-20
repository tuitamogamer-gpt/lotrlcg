import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, make, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import { bagginsBilbo } from "../src/game/hobbit-saga";
import { DDCD, DDCD_RECIPES } from "../src/game/dungeons-deep-support";
import { OMM } from "../src/game/misty-mountains-support";
import {
  NIGHTMARE,
  NIGHTMARE_OHUH as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices } from "../src/game/table";
import type { GameState } from "../src/game/types";
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

/** Goblin Driver: a quiet card for the encounter deck (no riddle). */
const QUIET = OMM.driver;
const ID = "dungeons-deep-and-caverns-dim";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board at stage 1: Gollum and Bilbo in the riddle area. */
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
    nightmare: { lowerGateAside: 1 },
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.threat = 20;
      s.hand = [];
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          committed: false,
        });
    });
  bagginsBilbo(s)!.resources = 0;
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
const gollum = (s: GameState) =>
  s.dungeonsDeep!.riddleArea.find((u) => u.code === DDCD.gollum)!;
/** Answer the pending choices in order (option ids). */
function answer(s: GameState, ...ids: string[]) {
  for (const id of ids) {
    run(s);
    assert.ok(s.choice, `a choice for ${id}`);
    s = pick(s, id);
  }
  return run(s);
}

test("Nightmare: Dungeons Deep and Caverns Dim's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.ddcdCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "nightmare",
      "nightmare",
      "Dungeons Deep and Caverns Dim - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /3x Goblin Miners\n3x Goblin Axeman\n3x The Goblins' Caves\n3x Grip, grab! Pinch, nab!\n1x Not fair! Not fair!\n/,
  );
  assert.match(
    c.back_text!,
    /^You are playing Nightmare mode\.\nGollum cannot take damage\.\nSetup: Search the encounter deck for The Lower Gate and set it aside, out of play\.\nForced: When stage 3B is revealed, add The Lower Gate to the staging area\.$/,
  );
  const gate = card(N.lowerGate);
  assert.deepEqual([gate.is_unique, gate.threat, gate.quest], [true, 4, 8]);
  assert.match(card(N.weHates).text!, /Riddle: The first player names a Trait/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Dungeons Deep and Caverns Dim - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((a) => set.some((x) => x.code === a.code)).length, 9);
});

test("Nightmare: Dungeons Deep and Caverns Dim's Nightmare deck matches its source recipe, with The Lower Gate set aside", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const pile = (
    cards: { code: string; quantity: number; section: string }[],
    ...sections: string[]
  ) =>
    cards
      .filter((c) => sections.includes(c.section))
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const nightmare = recipes.find((r) => r.id === "N0A.3")!.cards;
  const standard = DDCD_RECIPES.find((r) => r.mode === "standard")!.cards;
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, pile(standard, "sharedEncounterDeck"))),
    count(pile(nightmare, "sharedEncounterDeck", "sharedSetAside")),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.ddcdCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [game(), two()]) {
    assert.equal(nightmareCardOf(s), N.ddcdCard);
    assert.deepEqual(
      count(s.encounterDeck),
      count(pile(nightmare, "sharedEncounterDeck")),
    );
    assert.equal(s.nightmare?.lowerGateAside, 1);
    assert.match(nightmareStatus(s)[0], /Gollum cannot take damage/);
  }
  assert.ok(valid(opening(game())));
});

test("Nightmare: Gollum cannot take damage, and The Lower Gate arrives with stage 3B to cap the quest's progress and arm the Creatures and Goblins", () => {
  const s = board("planning");
  const g = gollum(s);
  damage(s, g.id, 3);
  assert.equal(g.damage, 0);
  // Stage 3B: The Lower Gate enters the staging area.
  run(s, [fx("ddcdNextStage", { player: 0 })]);
  assert.equal(s.stage, 3);
  assert.ok(s.staging.some((u) => u.code === N.lowerGate));
  assert.equal(s.nightmare?.lowerGateAside, undefined);
  assert.match(nightmareStatus(s)[0], /has entered the staging area/);
  // No more than 4 progress on the current quest each round.
  const quest = mainQuestUnit(s)!;
  const before = s.progress;
  addCurrentQuestProgress(s, 3, quest);
  addCurrentQuestProgress(s, 3, quest);
  assert.equal(s.progress, before + 4);
  s.round += 1;
  addCurrentQuestProgress(s, 3, quest);
  assert.equal(s.progress, before + 7);
  // Creatures +1 [attack], Goblins +1 [defense].
  const wolf = add(s, N.wickedWolf);
  const sentries = add(s, N.sentries);
  assert.equal(stats(s, wolf).attack, 5);
  assert.equal(stats(s, sentries).defense, 5);
  assert.ok(valid(s));
});

test("Nightmare: Wicked Wolf exhausts a character for a riddle shadow and sends its attacker back; Lower Gate Sentries hold Bilbo's Magic Ring down", () => {
  let s = board("attack");
  const wolf = add(s, N.wickedWolf, true);
  wolf.shadows.push(DDCD.likes);
  hooks(s).shadowDealt!(s, wolf, DDCD.likes);
  run(s);
  const hero = s.heroes.find((h) => h.id !== bagginsBilbo(s)!.id)!;
  s = pick(s, hero.id);
  assert.ok(hero.exhausted);
  // A shadow card without a riddle does nothing.
  const t = board("attack");
  const w2 = add(t, N.wickedWolf, true);
  hooks(t).shadowDealt!(t, w2, QUIET);
  run(t);
  assert.equal(t.choice, null);
  // Its shadow: the attacker returns to the staging area.
  const u = board("attack");
  shadow(u, add(u, OMM.runners, true), N.wickedWolf);
  assert.equal(u.combat!.returnToStaging, true);
  // Lower Gate Sentries: the Ring stays exhausted; its shadow +1 (+3).
  const v = board("refresh");
  const ring = bagginsBilbo(v)!.attachments.find((a) => a.code === DDCD.ring)!;
  ring.exhausted = true;
  add(v, N.sentries);
  run(v, [fx("refreshReady")]);
  assert.equal(ring.exhausted, true);
  v.staging = [];
  run(v, [fx("refreshReady")]);
  assert.equal(ring.exhausted, false);
  const w = board("attack");
  shadow(w, add(w, OMM.runners, true), N.sentries);
  assert.equal(w.combat!.attackBonus, 1);
  const x = board("attack");
  bagginsBilbo(x)!.attachments.find((a) => a.code === DDCD.ring)!.exhausted =
    true;
  shadow(x, add(x, OMM.runners, true), N.sentries);
  assert.equal(x.combat!.attackBonus, 3);
});

test("Nightmare: Pine Slopes taxes every Baggins resource spent, and Fallen Stones crushes the ready characters unless Bilbo pays", () => {
  const s = board("planning");
  add(s, N.pine);
  const bilbo = bagginsBilbo(s)!;
  bilbo.resources = 3;
  hooks(s).resourcesSpent!(s, bilbo, 2);
  run(s);
  assert.equal(s.threat, 22);
  // Its shadow: 2 additional shadow cards.
  const t = board("attack");
  const enemy = add(t, OMM.runners, true);
  shadow(t, enemy, N.pine);
  run(t);
  assert.equal(enemy.shadows.length, 3);
  // Fallen Stones' Travel: 3 damage to each ready character, 1 less per
  // Baggins resource.
  let u = board("travel");
  const stones = add(u, N.stones);
  const b = bagginsBilbo(u)!;
  b.resources = 2;
  const heroes = u.heroes.filter((h) => h.id !== b.id);
  heroes[0].exhausted = true;
  run(u, hooks(u).travelEffects!(u, stones));
  u = answer(u, "spend-2");
  assert.equal(b.resources, 0);
  assert.equal(heroes[0].damage, 0, "an exhausted hero");
  assert.ok(heroes.slice(1).every((h) => h.damage === 1));
});

test("Nightmare: the Nightmare riddles name a card title, a sphere, cost and type, and a Trait", () => {
  // Fallen Stones: a card title, the top 5 cards.
  let s = board("staging");
  forOwner(s, 0, () => {
    s.deck = Array(6).fill("01016");
  });
  revealed(s, N.stones);
  s = answer(s, "answer", "title-Snowbourn Scout");
  assert.equal(s.dungeonsDeep!.riddleProgress, 5);
  assert.ok(s.encounterDiscard.includes(N.stones));
  // Where isss It?: a sphere, a cost and a card type, the top 3 cards.
  let t = board("staging");
  forOwner(t, 0, () => {
    t.deck = Array(4).fill("01016");
  });
  revealed(t, N.whereIsIt);
  t = answer(t, "answer", "sphere-leadership", "cost-1", "type-ally");
  assert.equal(t.dungeonsDeep!.riddleProgress, 3);
  assert.ok(t.encounterDiscard.includes(N.whereIsIt));
  // We Hates It!: a Trait, the top card.
  let u = board("staging");
  forOwner(u, 0, () => {
    u.deck = ["01016", "01016"];
  });
  revealed(u, N.weHates);
  u = answer(u, "answer", "trait-Scout");
  assert.equal(u.dungeonsDeep!.riddleProgress, 1);
  assert.ok(valid(u));
});

test("Nightmare: Where isss It? takes Bilbo's resources or sets Gollum on him; We Hates It! sharpens Gollum for stage 3", () => {
  // Resolved normally with 2 Baggins resources: the discard option.
  let s = board("staging");
  add(s, N.pine);
  bagginsBilbo(s)!.resources = 2;
  revealed(s, N.whereIsIt);
  s = answer(s, "resolve", "discard");
  assert.equal(bagginsBilbo(s)!.resources, 0);
  assert.equal(s.threat, 22, "Pine Slopes counts the discarded resources");
  // Without them, Gollum attacks Bilbo.
  let t = board("staging");
  revealed(t, N.whereIsIt);
  t = answer(t, "resolve");
  assert.ok(
    t.choice?.title.startsWith("Gollum attacks Bilbo Baggins") ||
      bagginsBilbo(t)!.damage > 0,
  );
  // We Hates It!: attached to Gollum, +2 [attack] at stage 3.
  let u = board("staging");
  revealed(u, N.weHates);
  u = answer(u, "resolve");
  const g = gollum(u);
  assert.ok(g.attachments.some((a) => a.code === N.weHates));
  assert.ok(valid(u));
  const base = stats(u, g).attack;
  u.stage = 3;
  assert.equal(stats(u, g).attack, base + 2);
});

test("Nightmare: Dungeons Deep and Caverns Dim's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    lowerGateAside: 1,
    ddcdGate: { round: 1, quest: "q", placed: 2 },
  };
  assert.ok(valid(s));
  s.nightmare = { ddcdGate: { round: 1, quest: "q", placed: -1 } };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
