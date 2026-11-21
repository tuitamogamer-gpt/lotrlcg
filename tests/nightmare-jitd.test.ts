import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import {
  damage,
  progressLocation,
  revealed,
  takePlayerDiscard,
} from "../src/game/board";
import { fx, make, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { mainQuestUnit } from "../src/game/quest-state";
import { JD, JOURNEY_DARK_RECIPES } from "../src/game/journey-dark";
import { automatedScenarioId } from "../src/game/support";
import {
  NIGHTMARE,
  NIGHTMARE_TRD as N,
  nightmareCardOf,
  nightmareEncounterDecks,
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
  reload,
  shadow,
  valid,
} from "./nightmare-fixtures";

const ID = "journey-in-the-dark";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** Many-pillared Hall: a location without an effect beyond its threat. */
const QUIET = JD.hall;
/** Guard of the Citadel: an ally card of cost 2. */
const GUARD = "01013";
/** A quiet board on stage 2: nothing in the staging area, The Balrog set aside. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    stage: 2,
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    stageRevealing: false,
    progress: 0,
    nightmare: {},
    victoryCards: [],
    victory: 0,
    staging: [],
  });
  Object.assign(s.journeyDark!, {
    currentQuest: JD.drums,
    advancing: false,
    setAside: [JD.balrog, JD.bridge, JD.mazarbul],
    drums: 0,
    balrogUnbound: false,
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, engaged: [], hand: [], discard: [] });
      for (const h of [...s.heroes, ...s.allies])
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          committed: false,
          resources: 0,
        });
    });
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
function place(s: GameState, code: string, active = false) {
  const u = make(s, code);
  if (active) s.activeLocation = u;
  else s.staging.push(u);
  return u;
}
function enemy(s: GameState, code: string, player?: number) {
  const u = make(s, code);
  if (player === undefined) s.staging.push(u);
  else forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function run(s: GameState) {
  for (let i = 0; i < 60; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const options = (s: GameState) => s.choice!.options.map((o) => o.id);
const characters = (s: GameState, p: number): Unit[] => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const totalDamage = (s: GameState, p = 0) =>
  characters(s, p).reduce((n, u) => n + u.damage, 0);
/** The Balrog brought into the staging area by Doom, Doom, Doom's last token. */
function balrogRises(s: GameState) {
  const doom = place(s, JD.doom);
  doom.damage = 0;
  s.queue.unshift(fx("jtdBalrogRises", { player: 0 }));
  run(s);
  s.staging = s.staging.filter((u) => u.id !== doom.id);
  return s.staging.find((u) => u.code === JD.balrog)!;
}
const archery = (s: GameState) =>
  s.queue
    .filter((e) => e.kind === "heirsArchery")
    .reduce((n, e) => n + (e.value ?? 0), 0);

test("Nightmare: Journey in the Dark's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.darkCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Journey in the Dark - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Journey in the Dark scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Moria Archer\n4x Mines of Moria\n1x We Cannot Get Out\n3x Deep Fissure\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nEach hero in each player's discard pile cannot leave the discard pile.\nThe players cannot defeat stage 3B unless The Balrog is in the victory display.",
  );
  const slab = card(N.slab);
  assert.deepEqual(
    [
      slab.traits,
      slab.engagement,
      slab.threat,
      slab.attack,
      slab.defense,
      slab.health,
    ],
    ["Troll.", 32, 4, 5, 3, 5],
  );
  const zirak = card(N.zirak);
  assert.deepEqual(
    [
      zirak.traits,
      zirak.engagement,
      zirak.threat,
      zirak.attack,
      zirak.defense,
      zirak.health,
    ],
    ["Orc.", 42, 3, 4, 3, 4],
  );
  assert.equal(
    card(N.cutOff).text,
    "Peril.\nWhen Revealed: Either deal 1 damage to each character you control, or progress cannot be placed on the quest until the end of the round.",
  );
  assert.equal(
    card(N.cutOff).shadow,
    "Shadow: If this attack destroys a character, remove all progress from the quest.",
  );
  assert.equal(
    card(N.weary).shadow,
    "Shadow: Deal 1 damage to the defending character.",
  );
  for (const code of [N.whip, N.sword]) {
    assert.equal(card(code).is_unique, true);
    assert.match(card(code).text!, /^When Revealed: Attach to The Balrog/);
    assert.match(card(code).shadow!, /attacking enemy is The Balrog/);
  }
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Journey in the Dark - Nightmare",
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

test("Nightmare: Journey in the Dark's Nightmare deck matches its source recipe for one and two players", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    name: string;
    mode: string;
    campaign: boolean;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    section: string,
  ) =>
    r.cards
      .filter(
        (c) =>
          c.section === section && c.code !== N.darkCard && c.code !== JD.doom,
      )
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N0B.05")!;
  const standard = JOURNEY_DARK_RECIPES.find((r) => r.mode === "standard")!;
  const sections = [
    "sharedEncounterDeck",
    "sharedStagingArea",
    "sharedSetAside",
  ];
  const [deck, staged, aside] = nightmareEncounterDecks(
    ID,
    sections.map((x) => pile(standard, x)),
    () => 0,
  );
  // Stage 1A's setup search: the staged locations belong to the encounter deck.
  assert.deepEqual(
    count([...deck, ...staged]),
    count([
      ...pile(nightmare, "sharedEncounterDeck"),
      ...pile(nightmare, "sharedStagingArea"),
    ]),
  );
  assert.deepEqual(count(aside), count(pile(nightmare, "sharedSetAside")));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.darkCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.darkCard);
    assert.ok(valid(s));
    const all = [
      ...s.encounterDeck,
      ...s.staging.map((u) => u.code),
      ...s.encounterDiscard,
    ];
    assert.ok(!all.includes(JD.mines) && !all.includes(JD.archer));
    assert.equal(all.filter((c) => c === N.zirak).length, 4);
    assert.deepEqual(
      [...s.journeyDark!.setAside].sort(),
      [JD.balrog, JD.bridge, JD.mazarbul].sort(),
    );
  }
  assert.match(
    nightmareStatus(opening(game())).join("\n"),
    /each hero in each player's discard pile cannot leave the discard pile/,
  );
  for (const id of ["N0B.05", "N0C.05"])
    assert.equal(
      automatedScenarioId(recipes.find((r) => r.id === id)!),
      ID,
      id,
    );
});

test("Nightmare: Journey in the Dark's setup card keeps heroes in the discard pile and stage 3B undefeated until The Balrog is in the victory display", () => {
  const s = board("planning");
  const hero = s.heroes[0].code;
  s.discard = [hero, GUARD];
  assert.throws(() => takePlayerDiscard(s, 0), /cannot leave the discard pile/);
  s.queue.unshift(fx("reshufflePlayer", { player: 0 }));
  run(s);
  assert.deepEqual(s.discard, [hero]);
  assert.ok(s.deck.includes(GUARD));
  // Stage 3B.
  const t = board("quest");
  Object.assign(t, { stage: 3, progress: 99 });
  t.journeyDark!.currentQuest = JD.bridgeStage;
  t.journeyDark!.setAside = [JD.mazarbul];
  hooks(t).advance!(t);
  assert.equal(t.status, "playing");
  assert.equal(hooks(t).cannotDefeatStage!(t, 3), true);
  t.victoryCards = [JD.balrog];
  hooks(t).advance!(t);
  assert.equal(t.status, "won");
});

test("Nightmare: Slab-bearer cannot have attachments, and when destroyed it discards the encounter deck's top card, an enemy joining the staging area", () => {
  const s = board("combat");
  const slab = enemy(s, N.slab, 0);
  assert.equal(hooks(s).cannotAttach!(s, slab, "01001"), true);
  s.encounterDeck = [JD.orc, QUIET];
  damage(s, slab.id, 99);
  run(s);
  assert.ok(s.staging.some((u) => u.code === JD.orc));
  const t = board("combat");
  const other = enemy(t, N.slab, 0);
  t.encounterDeck = [QUIET, JD.orc];
  damage(t, other.id, 99);
  run(t);
  assert.ok(t.encounterDiscard.includes(QUIET));
  assert.ok(!t.staging.some((u) => u.code === JD.orc));
});

test("Nightmare: Zirakzigil Archer discards a random card and assigns its cost in damage, and each copy in the staging area has Archery 2", () => {
  const s = board("staging");
  s.hand.push(make(s, GUARD));
  revealed(s, N.zirak);
  run(s);
  for (let i = 0; i < 2 && s.choice; i++) {
    pick(s, s.choice.options[0].id);
    run(s);
  }
  assert.equal(s.hand.length, 0);
  assert.ok(s.discard.includes(GUARD));
  assert.equal(totalDamage(s), 2, "Guard of the Citadel costs 2");
  // Without a card in hand, no damage.
  const t = board("staging");
  revealed(t, N.zirak);
  run(t);
  assert.equal(totalDamage(t), 0);
  // Archery 2 for each copy in the staging area.
  const u = board("combat");
  enemy(u, N.zirak);
  enemy(u, N.zirak);
  enemy(u, N.zirak, 0);
  hooks(u).combatBegin!(u);
  assert.equal(archery(u), 4);
});

test("Nightmare: Glowing Fissure's threat counts the damaged characters, and a player who commits characters deals 1 damage to one of them for each copy", () => {
  const s = board("quest", opening(two()));
  const fissure = place(s, N.glowing);
  place(s, N.glowing, true);
  assert.equal(hooks(s).threatBonus!(s, fissure), 1);
  characters(s, 1)[0].damage = 1;
  assert.equal(hooks(s).threatBonus!(s, fissure), 2);
  const hero = characters(s, 0)[0];
  hooks(s).charactersCommitted!(s, [hero]);
  run(s);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(
      options(s),
      characters(s, 0).map((u) => u.id),
    );
    pick(s, hero.id);
    run(s);
  }
  assert.equal(hero.damage, 2, "one for each copy in play");
  assert.equal(characters(s, 1)[0].damage, 1, "the other player is untouched");
});

test("Nightmare: Darkened Mine keeps progress off the staging area's locations, and its shadow discards a random card", () => {
  const s = board("quest");
  place(s, N.mine);
  const staged = place(s, QUIET);
  const active = place(s, QUIET, true);
  progressLocation(s, staged, 2);
  progressLocation(s, active, 2);
  assert.equal(staged.progress, 0);
  assert.equal(active.progress, 2);
  s.staging = [staged];
  progressLocation(s, staged, 2);
  assert.equal(
    staged.progress,
    2,
    "once no Darkened Mine is in the staging area",
  );
  const t = board("combat");
  t.hand.push(make(t, GUARD));
  const attacker = enemy(t, JD.orc, 0);
  shadow(t, attacker, N.mine, characters(t, 0)[0], 0);
  run(t);
  assert.equal(t.hand.length, 0);
});

test("Nightmare: Fiery Whip and Flaming Sword wait on The Balrog out of play, then give it defense, Archery 4, attack and Regenerate 4 until it loses its keywords", () => {
  const s = board("staging");
  revealed(s, N.whip);
  run(s);
  assert.deepEqual(s.nightmare?.darkWeapons, [N.whip]);
  assert.ok(!s.encounterDiscard.includes(N.whip));
  assert.match(nightmareStatus(s).join("\n"), /1 Weapon wait/);
  const balrog = balrogRises(s);
  assert.deepEqual(
    balrog.attachments.map((a) => a.code),
    [N.whip],
  );
  assert.equal(s.nightmare?.darkWeapons, undefined);
  const printed = card(JD.balrog);
  assert.equal(stats(s, balrog).defense, (printed.defense ?? 0) + 1);
  revealed(s, N.sword);
  run(s);
  assert.equal(stats(s, balrog).attack, (printed.attack ?? 0) + 1);
  calm(s, "combat");
  hooks(s).combatBegin!(s);
  assert.equal(archery(s), 4);
  s.queue = [];
  balrog.damage = 6;
  s.queue.unshift(...hooks(s).refreshEndForced!(s));
  run(s);
  assert.equal(balrog.damage, 2);
  // The Great Bridge: The Balrog loses all keywords (its +1s remain).
  s.journeyDark!.balrogUnbound = true;
  hooks(s).combatBegin!(s);
  assert.equal(archery(s), 0);
  assert.deepEqual(hooks(s).refreshEndForced!(s), []);
  assert.equal(stats(s, balrog).defense, (printed.defense ?? 0) + 1);
  // As a shadow card of The Balrog's attack.
  const t = board("combat");
  t.journeyDark!.setAside = [JD.bridge, JD.mazarbul];
  const attacker = enemy(t, JD.balrog);
  shadow(t, attacker, N.sword, characters(t, 0)[0], 0);
  run(t);
  assert.deepEqual(
    attacker.attachments.map((a) => a.code),
    [N.sword],
  );
  assert.deepEqual(attacker.shadows, []);
  const orc = enemy(t, JD.orc, 0);
  shadow(t, orc, N.whip, characters(t, 0)[0], 0);
  run(t);
  assert.deepEqual(orc.attachments, [], "only The Balrog takes them");
});

test("Nightmare: Very Weary damages a questing character of each player and lowers each damaged character's willpower for the phase; its shadow damages the defender", () => {
  const s = board("staging", opening(two()));
  const questers = seatIndices(s).map((p) => characters(s, p)[0]);
  for (const q of questers) q.committed = true;
  const idle = characters(s, 0)[1];
  idle.damage = 1;
  const before = questers.map((q) => stats(s, q).will);
  revealed(s, N.weary);
  run(s);
  for (const q of questers) {
    assert.deepEqual(options(s), [q.id]);
    pick(s, q.id);
    run(s);
  }
  assert.deepEqual(
    questers.map((q) => q.damage),
    [1, 1],
  );
  assert.deepEqual(
    questers.map((q) => stats(s, q).will),
    before.map((w) => w - 2),
  );
  assert.equal(
    stats(s, idle).will,
    Math.max(0, (card(idle.code).willpower ?? 0) - 2),
    "a damaged character that is not questing too",
  );
  s.phase = "combat";
  assert.deepEqual(
    questers.map((q) => stats(s, q).will),
    before,
  );
  const t = board("combat");
  const attacker = enemy(t, JD.orc, 0);
  const defender = characters(t, 0)[0];
  shadow(t, attacker, N.weary, defender, 0);
  run(t);
  assert.equal(defender.damage, 1);
});

test("Nightmare: Cut Off damages each character of the revealing player or keeps progress off the quest for the round; its shadow's kill removes all progress", () => {
  const s = board("staging");
  revealed(s, N.cutOff);
  run(s);
  assert.deepEqual(options(s), ["damage", "progress"]);
  pick(s, "progress");
  run(s);
  const quest = mainQuestUnit(s)!;
  assert.equal(hooks(s).progress!(s, 3, quest), 0);
  s.round += 1;
  assert.equal(hooks(s).progress!(s, 3, quest), 3);
  const t = board("staging");
  revealed(t, N.cutOff);
  run(t);
  pick(t, "damage");
  run(t);
  assert.ok(characters(t, 0).every((u) => u.damage === 1));
  // Its shadow.
  const u = board("combat");
  u.progress = 5;
  const attacker = enemy(u, JD.orc, 0);
  const victim = characters(u, 0)[0];
  shadow(u, attacker, N.cutOff, victim, 0);
  assert.equal(u.combat!.nmClearOnKill, 1);
  damage(u, victim.id, 99, { combatDamage: true, enemyId: attacker.id });
  run(u);
  assert.ok(u.combat!.jtdDestroyed);
  u.queue.unshift(...hooks(u).attackFinished!(u, u.combat!));
  run(u);
  assert.equal(u.progress, 0);
});

test("Nightmare: Journey in the Dark's Nightmare state survives saves, and malformed state is refused", () => {
  const s = board("staging");
  revealed(s, N.whip);
  run(s);
  revealed(s, N.weary);
  run(s);
  s.choice = null;
  s.nightmare!.darkCutOff = s.round;
  assert.ok(valid(s));
  const back = reload(s);
  assert.deepEqual(back.nightmare, s.nightmare);
  const broken = (f: (x: GameState) => void) => {
    const x = reload(s);
    f(x);
    return valid(x);
  };
  assert.equal(
    broken((x) => (x.nightmare!.darkWeapons = [N.whip, N.whip])),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.darkWeapons = [N.weary])),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.darkCutOff = -1)),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.darkWeary = [{ round: 1 } as never])),
    false,
  );
});

test("Nightmare: Journey in the Dark's seeded Nightmare games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
