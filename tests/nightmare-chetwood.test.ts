import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, engage, progressLocation, revealed } from "../src/game/board";
import { make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, canTravel } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { CHETWOOD as C, validateChetwood } from "../src/game/chetwood-support";
import { chetwoodAttackFinished } from "../src/game/chetwood";
import {
  sideQuestStart,
  addCurrentQuestProgress,
} from "../src/game/side-quests";
import { currentQuestCode } from "../src/game/quest-state";
import {
  NIGHTMARE,
  NIGHTMARE_TLR as N,
  nightmareCardOf,
  nightmareEncounterDecks,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatView } from "../src/game/table";
import type { Effect, GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  shadow,
  valid,
} from "./nightmare-fixtures";
import { base, choose, reload } from "./chetwood-fixtures";

const ID = "intruders-in-chetwood";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
const hooks = (s: GameState) => batch4Scenario(s);
const SCOUT = "01016";
/** A quiet Nightmare table (the scenario's own fixture). */
function board(players = 1) {
  const s = base(players);
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
}
/** Resolve queued effects, answering each choice with `pick` (or the first option). */
function run(
  s: GameState,
  pick: (s: GameState) => string | undefined = () => undefined,
) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 60, "decisions terminate");
    s = choose(reload(s), pick(s) ?? s.choice.options[0].id);
  }
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const engagedWith = (s: GameState, code: string, p = 0) => {
  const u = make(s, code);
  forOwner(s, p, () => s.engaged.push(u));
  return u;
};
const inStaging = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code);
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];

test("Nightmare: Intruders in Chetwood's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.chetwoodCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Intruders in Chetwood - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Intruders in Chetwood scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n1x Angmar Orc\n3x Angmar Marauder\n2x Chetwood Forest\n1x Outlying Homestead\n2x Borders of Bree-land\n1x Rugged Country\n1x Shrouded Hills\n3x Surprising Speed\n2x Sudden Assault\nThen, shuffle/,
  );
  assert.equal(c.back_text, "You are playing Nightmare mode.");
  const abductor = card(N.abductor);
  assert.deepEqual(
    [
      abductor.traits,
      abductor.engagement,
      abductor.threat,
      abductor.attack,
      abductor.defense,
      abductor.health,
    ],
    ["Orc.", 45, 2, 4, 4, 5],
  );
  assert.equal(
    abductor.shadow,
    "Shadow: Deal 1 damage to defending character.",
  );
  const soldier = card(N.soldier);
  assert.deepEqual(
    [
      soldier.engagement,
      soldier.threat,
      soldier.attack,
      soldier.defense,
      soldier.health,
    ],
    [28, 2, 5, 3, 5],
  );
  assert.deepEqual(
    [card(N.northern).threat, card(N.northern).quest, card(N.northern).traits],
    [4, 6, "Arnor. Forest."],
  );
  assert.match(
    card(N.outskirts).text!,
    /for Protect the Bree-landers, and reveal it\.$/,
    "the scan's hyphen (the catalogue had Breelanders)",
  );
  for (const [code, quest] of [
    [N.shadowParty, 8],
    [N.protect, 10],
  ] as const) {
    assert.equal(card(code).type_code, "encounter-side-quest");
    assert.equal(card(code).quest, quest);
    assert.equal(card(code).victory, 10);
  }
  assert.match(
    card(N.protect).text!,
    /^Surge\.\nForced: At the end of the quest phase/,
    "the side quest's flavour text is not part of its rules",
  );
  assert.match(
    card(N.shadowParty).text!,
    /^Each copy of Orc War Party cannot be engaged, cannot be dealt damage, and gets \+2 \[threat\]\.\nWhen Revealed: /,
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Intruders in Chetwood - Nightmare",
  );
  assert.equal(set.length, 10);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    11,
  );
});

test("Nightmare: Intruders in Chetwood's Nightmare deck matches its source recipe, and its locations can be setup locations", () => {
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
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    section: string,
  ) =>
    r.cards
      .filter((c) => c.section === section && c.code !== N.chetwoodCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N05.1")!;
  const standard = recipes.find((r) => r.id === "Q05.1")!;
  const [deck] = nightmareEncounterDecks(
    ID,
    [pile(standard, "sharedEncounterDeck")],
    () => 0,
  );
  assert.deepEqual(count(deck), count(pile(nightmare, "sharedEncounterDeck")));
  assert.deepEqual(pile(nightmare, "sharedStagingArea"), [C.party]);
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.chetwoodCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.chetwoodCard);
    assert.ok(valid(s));
    const all = [...s.encounterDeck, ...s.staging.map((u) => u.code)];
    assert.equal(all.length, 40);
    for (const gone of [C.marauder, C.borders, C.speed, C.assault])
      assert.ok(!all.includes(gone), card(gone).name);
    assert.equal(all.filter((c) => c === N.abductor).length, 3);
    assert.match(nightmareStatus(s)[0], /^Intruders in Chetwood · Nightmare/);
  }
  // A Nightmare location may be a player's setup location.
  let s = game(3);
  for (let i = 0; i < 120 && s.phase === "setup"; i++) {
    if (s.choice) {
      const own = s.choice.options.find((o) => o.code === N.northern);
      s = choose(reload(s), own?.id ?? s.choice.options[0].id);
    } else if (s.flow?.pending)
      s = applyAction(reload(s), {
        type: "CONTINUE",
        stepId: s.flow.pending.id,
      });
    else s = applyAction(reload(s), { type: "KEEP" });
  }
  assert.ok(s.chetwood!.setupLocations.includes(N.northern));
  assert.ok(inStaging(s, N.northern).length);
  assert.ok(valid(s));
  const standardGame = JSON.parse(JSON.stringify(s)) as GameState;
  delete standardGame.nightmareMode;
  assert.equal(
    validateChetwood(
      standardGame,
      () => true,
      () => true,
    ),
    false,
    "only a Nightmare game's setup locations come from its Nightmare Deck",
  );
});

test("Nightmare: Shadow the War Party returns engaged War Parties, which cannot be engaged or damaged and get +2 threat", () => {
  let s = board();
  const party = staged(s, C.party);
  const caught = engagedWith(s, C.party);
  const orc = staged(s, C.orc);
  revealed(s, N.shadowParty);
  s = run(s);
  assert.equal(inStaging(s, N.shadowParty).length, 1);
  assert.deepEqual(
    inStaging(s, C.party).map((u) => u.id),
    [party.id, caught.id],
  );
  assert.equal(s.engaged.length, 0);
  const p = s.staging.find((u) => u.id === party.id)!;
  assert.equal(threatOf(s, p), 5);
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.id === orc.id)!,
    ),
    2,
  );
  assert.ok(hooks(s).cannotEngage!(s, p));
  engage(s, p, true);
  assert.equal(s.engaged.length, 0);
  // An engaged War Party is otherwise vulnerable (its own protection covers
  // the staging area); Shadow the War Party keeps it from being damaged.
  const held = engagedWith(s, C.party);
  assert.equal(damage(s, held.id, 3), false);
  assert.equal(held.damage, 0);
  const shadowQuest = inStaging(s, N.shadowParty)[0];
  s.staging = s.staging.filter((u) => u.id !== shadowQuest.id);
  assert.equal(damage(s, held.id, 3), true);
  assert.equal(held.damage, 3);
  s.staging.push(shadowQuest);
  s.engaged = [];
  // Chetwood Forest's travel cost and Orc Ambush's search skip it.
  s.staging = s.staging.filter((u) => u.id !== orc.id);
  const forest = staged(s, C.forest);
  s.phase = "travel";
  assert.equal(
    canTravel(s, forest),
    "Chetwood Forest requires a staging enemy to engage.",
  );
  s.staging = s.staging.filter((u) => u.id !== forest.id);
  s.phase = "planning";
  s.encounterDeck = [C.party, N.soldier];
  revealed(s, C.ambush);
  flush(s);
  assert.match(s.choice!.title, /Orc Ambush · Search for an Orc/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    [N.soldier],
  );
});

test("Nightmare: Protect the Bree-landers surges, and at the end of each quest phase without its progress gains a resource and raises each player's threat by its resources", () => {
  let s = board(2);
  const deck = s.encounterDeck.length;
  revealed(s, N.protect);
  s = run(s);
  const protect = inStaging(s, N.protect)[0];
  assert.ok(protect);
  assert.equal(s.encounterDeck.length, deck - 1, "its surge reveals a card");
  const threats = () => [0, 1].map((p) => seatView(s, p).threat);
  s.phase = "quest";
  hooks(s).endQuest!(s);
  s = run(s);
  assert.equal(s.staging.find((u) => u.id === protect.id)!.resources, 1);
  assert.deepEqual(threats(), [21, 21]);
  s.round++;
  s.phase = "quest";
  hooks(s).endQuest!(s);
  s = run(s);
  assert.equal(s.staging.find((u) => u.id === protect.id)!.resources, 2);
  assert.deepEqual(threats(), [23, 23]);
  // Progress placed on it this quest phase spares the players.
  s.round++;
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = choose(s, protect.id);
  assert.equal(currentQuestCode(s), N.protect);
  addCurrentQuestProgress(s, 2);
  hooks(s).endQuest!(s);
  s = run(s);
  assert.equal(s.staging.find((u) => u.id === protect.id)!.resources, 2);
  assert.deepEqual(threats(), [23, 23]);
  assert.ok(valid(s));
});

test("Nightmare: Orc Abductor reveals Rescue Iârion from the victory display at the end of the round while staged, and its shadow damages the defender", () => {
  let s = board();
  const abductor = staged(s, N.abductor);
  s.victoryCards = [C.rescue];
  s.victory = 10;
  const deck = [...s.encounterDeck];
  queue(s, ...hooks(s).roundEnd!(s));
  s = run(s);
  assert.equal(s.victory, 0);
  assert.deepEqual(s.victoryCards, []);
  const rescue = inStaging(s, C.rescue)[0];
  assert.equal(rescue.timeCounters, 4);
  assert.equal(s.chetwood!.captive?.unit.code, C.iarion);
  assert.equal(
    s.encounterDeck.length,
    deck.length,
    "the deck is only shuffled",
  );
  // Engaged, it has no end-of-round effect.
  assert.equal(hooks(s).roundEnd!(s).length, 1);
  s.staging = s.staging.filter((u) => u.id !== abductor.id);
  s.engaged.push(abductor);
  assert.deepEqual(hooks(s).roundEnd!(s), []);
  const attacker = engagedWith(s, C.orc);
  const hero = s.heroes[0];
  assert.ok(shadow(s, attacker, N.abductor, hero));
  flush(s);
  assert.equal(hero.damage, 1);
});

test("Nightmare: Greenway Path reveals Shadow the War Party from the discard pile at the end of the round, and its shadow returns the attacker to the staging area", () => {
  let s = board();
  staged(s, N.greenway);
  const party = engagedWith(s, C.party);
  s.encounterDiscard = [N.shadowParty];
  queue(s, ...hooks(s).roundEnd!(s));
  s = run(s);
  assert.equal(inStaging(s, N.shadowParty).length, 1);
  assert.deepEqual(s.encounterDiscard, []);
  assert.ok(inStaging(s, C.party).some((u) => u.id === party.id));
  const orc = engagedWith(s, C.orc);
  assert.ok(shadow(s, orc, N.greenway));
  assert.equal(s.combat!.chetwoodReturnAfterAttack, true);
  chetwoodAttackFinished(s, s.combat!);
  s.combat = null;
  flush(s);
  assert.ok(s.staging.some((u) => u.id === orc.id));
  assert.equal(s.engaged.length, 0);
});

test("Nightmare: Northern Chetwood reveals Lost in the Wilderness after progress while still in play, and its shadow discards a random card for each point of damage", () => {
  let s = board();
  for (let i = 0; i < 4; i++) s.hand.push(make(s, SCOUT));
  const loc = make(s, N.northern);
  s.activeLocation = loc;
  s.encounterDeck = [C.wilderness, ...s.encounterDeck];
  progressLocation(s, loc, 2);
  s = run(s);
  assert.equal(inStaging(s, C.wilderness).length, 1);
  assert.equal(s.hand.length, 0);
  assert.equal(
    s.chetwood!.hiddenHands[inStaging(s, C.wilderness)[0].id].length,
    4,
  );
  // Explored by the progress, it is no longer in play.
  s.staging = s.staging.filter((u) => u.code !== C.wilderness);
  s.encounterDeck = [C.wilderness, ...s.encounterDeck];
  const other = make(s, N.northern);
  other.progress = 4;
  s.activeLocation = other;
  progressLocation(s, other, 2);
  s = run(s);
  assert.equal(s.activeLocation, null);
  assert.equal(inStaging(s, C.wilderness).length, 0);
  assert.equal(s.encounterDeck[0], C.wilderness);
  for (let i = 0; i < 3; i++) s.hand.push(make(s, SCOUT));
  const orc = engagedWith(s, C.orc);
  assert.ok(shadow(s, orc, N.northern, s.heroes[0]));
  s.combat!.damageDealt = 2;
  queue(s, ...hooks(s).attackFinished!(s, s.combat!));
  s.combat = null;
  flush(s);
  assert.equal(s.hand.length, 1);
  assert.equal(s.discard.length, 2);
});

test("Nightmare: Outskirts of Archet's travel reveals Protect the Bree-landers, and its shadow raises the defending player's threat by 3 when the attack destroys a character", () => {
  let s = board();
  const outskirts = staged(s, N.outskirts);
  s.encounterDeck = [N.protect, ...s.encounterDeck];
  const effects = hooks(s).travelEffects!(s, outskirts)!;
  assert.equal(effects.length, 1);
  s.staging = s.staging.filter((u) => u.id !== outskirts.id);
  s.activeLocation = outskirts;
  s = run(queue(s, ...effects));
  assert.equal(inStaging(s, N.protect).length, 1);
  assert.ok(!s.encounterDeck.includes(N.protect));
  const orc = engagedWith(s, C.orc);
  const scout = make(s, SCOUT);
  s.allies.push(scout);
  assert.ok(shadow(s, orc, N.outskirts, scout));
  assert.equal(s.combat!.attackBonus, 1);
  damage(s, scout.id, 1, { combatDamage: true, enemyId: orc.id });
  flush(s);
  assert.ok(!s.allies.some((u) => u.id === scout.id));
  assert.equal(s.threat, 23);
  assert.equal(s.combat!.nmThreatOnKill, 0, "once for this attack");
});

test("Nightmare: A Great Host returns each engaged enemy, then reveals Orc Rearguard or has each player deal 4 damage", () => {
  let s = board(2);
  const a = engagedWith(s, C.orc, 0);
  const b = engagedWith(s, C.captain, 1);
  s.victoryCards = [C.rearguard];
  s.victory = 10;
  revealed(s, N.greatHost);
  flush(s);
  assert.deepEqual(options(s), ["rearguard", "damage"]);
  assert.ok(s.staging.some((u) => u.id === a.id));
  assert.ok(s.staging.some((u) => u.id === b.id));
  s = run(choose(reload(s), "rearguard"));
  assert.equal(inStaging(s, C.rearguard).length, 1);
  assert.equal(s.victory, 0);
  assert.ok(s.encounterDiscard.includes(N.greatHost));
  // With Orc Rearguard in play, only the damage remains.
  const heroes = [0, 1].map((p) => seatView(s, p).heroes[0].id);
  revealed(s, N.greatHost);
  s = run(s, (x) => x.choice!.options.find((o) => heroes.includes(o.id))?.id);
  for (const p of [0, 1])
    assert.equal(seatView(s, p).heroes[0].damage, 4, `player ${p + 1}`);
});

test("Nightmare: Kill Them! adds an Orc War Party from the discard pile, then removes the main quest's progress or sends each War Party against the highest threat", () => {
  let s = board();
  s.encounterDiscard = [C.party];
  s.progress = 5;
  revealed(s, N.killThem);
  flush(s);
  assert.equal(inStaging(s, C.party).length, 1);
  assert.deepEqual(options(s), ["progress", "attack"]);
  s = run(choose(reload(s), "progress"));
  assert.equal(s.progress, 0);
  // Without progress, the attack resolves alone.
  revealed(s, N.killThem);
  flush(s);
  assert.equal(inStaging(s, C.party).length, 1, "no other copy to add");
  assert.ok(
    s.combat?.enemyId === inStaging(s, C.party)[0].id ||
      s.queue.some((e) => e.kind === "immediateAttack"),
  );
  // Two players tied for the highest threat: the first player chooses.
  let t = board(2);
  staged(t, C.party);
  revealed(t, N.killThem);
  flush(t);
  assert.deepEqual(options(t), ["player-0", "player-1"]);
  t = choose(reload(t), "player-1");
  assert.ok(
    t.combat?.attackPlayer === 1 ||
      t.queue.some((e) => e.kind === "immediateAttack" && e.player === 1),
  );
});

test("Nightmare: Soldier of Angmar reveals Orc Ambush after its attack destroys an ally, and its shadow gives +2 attack", () => {
  let s = board();
  const soldier = engagedWith(s, N.soldier);
  s.encounterDiscard = [C.ambush];
  assert.ok(shadow(s, soldier, N.soldier));
  assert.equal(s.combat!.attackBonus, 2);
  assert.deepEqual(hooks(s).attackFinished!(s, s.combat!), []);
  s.combat!.chetwoodAllyKilled = true;
  const effects = hooks(s).attackFinished!(s, s.combat!);
  s.combat = null;
  s = run(queue(s, ...effects));
  assert.equal(inStaging(s, C.ambush).length, 1);
  assert.equal(stats(s, soldier).attack, 6, "Orc Ambush's +1 [attack]");
});

test("Nightmare: Intruders in Chetwood's Nightmare state survives saves, malformed state is refused, and seeded games finish with valid saves", () => {
  let s = board();
  const protect = staged(s, N.protect);
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = choose(s, protect.id);
  addCurrentQuestProgress(s, 1);
  assert.deepEqual(s.nightmare!.chetwoodBree, [
    { id: protect.id, round: s.round },
  ]);
  const back = reload(s);
  assert.deepEqual(back.nightmare, s.nightmare);
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s));
    f(x);
    return valid(x);
  };
  assert.equal(
    broken((x) => (x.nightmare!.chetwoodBree = [{ id: 3 } as never])),
    false,
  );
  assert.equal(
    broken(
      (x) => (x.nightmare!.chetwoodBree = [{ id: "c1", round: x.round + 1 }]),
    ),
    false,
  );
  assert.equal(
    broken(
      (x) =>
        (x.combat = {
          enemyId: "c1",
          attackBonus: 0,
          nmDiscardPerDamage: -1,
        } as never),
    ),
    false,
  );
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
  assert.ok(valid(g2));
});
