import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import {
  check,
  enemyAddedToStaging,
  progress,
  raiseThreat,
  revealed,
} from "../src/game/board";
import { get, make, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  addCurrentQuestProgress,
  addQuestProgress,
  sideQuestStart,
} from "../src/game/side-quests";
import { removeQuestTime } from "../src/game/quest-time";
import { attachmentHasTrait } from "../src/game/expansion-passives";
import { returnToStaging } from "../src/game/black-riders-hunted";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import { RHUDAUR as R, RHUDAUR_SIDES } from "../src/game/rhudaur-support";
import {
  NIGHTMARE,
  NIGHTMARE_AA as N,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import { RHUDAUR_NIGHTMARE_SETS } from "../src/game/nightmare-rhudaur";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";
import { base, choose, reload, second, settle } from "./rhudaur-fixtures";

const ID = "the-treachery-of-rhudaur";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare table (the scenario's own fixture) at stage 1. */
function board(players = 1) {
  const s = base(players);
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
/** Resolve the queue, answering each choice with `answer` (or the first option). */
function run(
  s: GameState,
  answer: (s: GameState) => string | undefined = () => undefined,
) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 80, "decisions terminate");
    s = choose(reload(s), answer(s) ?? s.choice.options[0].id);
  }
  return s;
}
const finish = (s: GameState) => {
  check(s);
  flush(s);
  return settle(s);
};
const stage = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const engaged = (s: GameState, code: string, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.engaged.push(u);
  });
  return u;
};
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
const thaurdirOf = (s: GameState) =>
  s.staging.find((u) => u.code === R.thaurdir)!;
const SETS = Object.values(RHUDAUR_NIGHTMARE_SETS);
/** Old Forest Road (1 threat), the fixture's encounter deck filler. */
const ROAD = "01099";

test("Nightmare: The Treachery of Rhudaur's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.rhudaurCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "The Treachery of Rhudaur",
      "nightmare",
      "nightmare",
      "The Treachery of Rhudaur - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Treachery of Rhudaur scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n2x Decrepit Remains\n2x Eerie Halls\n1x Dark Covenant\n2x Ruins of Arnor\n2x Tragic Discovery\n5x Cursed Dead\nThen, /,
  );
  assert.match(
    c.back_text!,
    /^You are playing Nightmare mode\.\nSetup: Set the Sift through the Debris, Decipher Ancient Texts, and Quiet the Spirits encounter sets aside, out of play\. /,
    "the scan's period (the catalogue ended the first line with a colon)",
  );
  assert.match(
    c.back_text!,
    /\nForced: After you advance to stage 2b, for each of the above sidequests that was not defeated, shuffle the encounter set that matches its title into the encounter deck, and shuffle the encounter discard pile into the encounter deck\.$/,
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.type_code, x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(N.hunter), ["enemy", 16, 2, 2, 1, 6]);
  assert.deepEqual(stat(N.thrall), ["enemy", 1, 2, 2, 2, 2]);
  assert.deepEqual(
    stat(N.apostate),
    ["enemy", 38, 5, 2, 2, 12],
    "an enemy (the catalogue typed it a treachery)",
  );
  for (const code of [N.hunter, N.thrall, N.apostate])
    assert.equal(card(code).traits, "Undead.");
  assert.deepEqual(
    [N.courtyard, N.cellar, N.antechamber].map((code) => [
      card(code).type_code,
      card(code).threat,
      card(code).quest,
      card(code).traits,
    ]),
    [
      ["location", 1, 6, "Ruins."],
      ["location", 5, 4, "Ruins."],
      ["location", 2, 5, "Ruins."],
    ],
    "Secret Antechamber is a location (the catalogue typed it a treachery)",
  );
  assert.equal(card(N.thrall).text, "Indestructible. Surge.");
  assert.equal(
    card(N.drain).text,
    "When Revealed: Deal Life Drain to Thaurdir, as a shadow card.",
    'the scan\'s "When Revealed:"',
  );
  assert.match(
    card(N.drain).shadow!,
    /^Shadow: If attacking enemy is Thaurdir, he gets \+3 \[attack\] for this attack\. If this attack destroys a character, attach Life Drain to Thaurdir\. \(Counts as a Condition attachment with the text: "Thaurdir gets \+3 hit points\."\)$/,
    'the scan\'s "for this attack"',
  );
  assert.equal(card(N.drain).traits, "Sorcery.");
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Treachery of Rhudaur - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.deepEqual(
    [N.apostate, N.antechamber, N.drain].map((code) => card(code).quantity),
    [3, 3, 3],
  );
  assert.equal(
    art.filter((x) => set.some((y) => y.code === x.code)).length,
    10,
  );
});

test("Nightmare: The Treachery of Rhudaur's Nightmare encounter deck matches its source recipe, with the three side quests' sets set aside", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N05.7")!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.rhudaurCard).text!.includes(`${n}x ${title}`), title);
  assert.deepEqual(
    Object.keys(RHUDAUR_NIGHTMARE_SETS).map((c) => card(c).name),
    ["Sift Through the Debris", "Decipher Ancient Texts", "Quiet the Spirits"],
  );
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.rhudaurCard);
    assert.deepEqual(
      tally(s.encounterDeck),
      tally(pile("sharedEncounterDeck")),
    );
    assert.deepEqual(
      tally(s.nightmare!.rhudaurAside!),
      tally(pile("sharedEncounterDeck2")),
    );
    assert.equal(
      s.staging.filter((u) => RHUDAUR_SIDES.includes(u.code)).length,
      3,
    );
    assert.equal(s.activeLocation?.code, R.hall);
    assert.deepEqual(
      s.rhudaur!.setAside.map((u) => u.code),
      [R.thaurdir],
    );
    assert.match(
      nightmareStatus(s)[0],
      /^The Treachery of Rhudaur · Nightmare mode: .* set aside \(9 cards\);/,
    );
    assert.ok(valid(s));
  }
  // A standard game keeps no Nightmare state.
  assert.equal(base().nightmare?.rhudaurAside, undefined);
});

test("Nightmare: after the players advance to stage 2B, the set of each side quest that was not defeated is shuffled into the encounter deck with the discard pile", () => {
  let s = board();
  s.nightmare!.rhudaurAside = SETS.flatMap((c) => [c, c, c]);
  // Sift Through the Debris is defeated (its Clue found); the others are not.
  const debris = s.staging.find((u) => u.code === R.debris)!;
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = choose(reload(s), debris.id);
  addCurrentQuestProgress(s, card(R.debris).quest!);
  s = finish(s);
  s.encounterDiscard = [ROAD, ROAD];
  s.phase = "refresh";
  s.rhudaur!.time = 1;
  removeQuestTime(s);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.ok(s.staging.some((u) => u.code === R.thaurdir));
  assert.deepEqual(
    s.nightmare!.rhudaurAside,
    [N.antechamber, N.antechamber, N.antechamber],
    "the defeated side quest's set stays out of play",
  );
  for (const code of [N.drain, N.apostate])
    assert.equal(s.encounterDeck.filter((c) => c === code).length, 3);
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(s.encounterDeck.filter((c) => c === ROAD).length, 32);
  assert.match(nightmareStatus(s)[0], /\(3 cards\)/);
  assert.ok(valid(s));
  // Each side quest defeated: no set joins, but the discard pile is still
  // shuffled into the encounter deck.
  s = board();
  s.nightmare!.rhudaurAside = SETS.flatMap((c) => [c, c, c]);
  s.encounterDiscard = [ROAD];
  for (const q of [...s.staging].filter((u) =>
    RHUDAUR_SIDES.includes(u.code),
  )) {
    addQuestProgress(s, q, card(q.code).quest!);
    s = finish(s);
  }
  assert.equal(s.stage, 2);
  assert.equal(s.nightmare!.rhudaurAside!.length, 9);
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(s.encounterDeck.filter((c) => c === ROAD).length, 31);
  assert.ok(valid(s));
});

test("Nightmare: Thaurdir's Hunter asks before its defenders are declared: a time counter from the main quest, or an undefended attack that leaves the defender ready", () => {
  for (const answer of ["time", "undefended"]) {
    let s = board();
    const hunter = engaged(s, N.hunter);
    s.phase = "defense";
    const hero = s.heroes[0];
    s = applyAction(reload(s), {
      type: "DEFEND",
      enemyId: hunter.id,
      defenderId: hero.id,
    });
    assert.deepEqual(options(s), ["time", "undefended"]);
    assert.equal(get(s, hero.id)!.exhausted, false, "nothing declared yet");
    s = settle(choose(reload(s), answer));
    const damage = seatView(s, 0).heroes.reduce((n, h) => n + h.damage, 0);
    if (answer === "time") {
      assert.equal(s.rhudaur!.time, 4);
      assert.equal(get(s, hero.id)!.exhausted, true, "it defended");
      assert.equal(damage, Math.max(0, 2 - stats(s, hero).defense));
    } else {
      assert.equal(s.rhudaur!.time, 5);
      assert.equal(get(s, hero.id)!.exhausted, false);
      assert.equal(damage, 2, "undefended");
    }
    assert.ok(valid(s));
  }
  // Without a time counter (stage 2), the attack is undefended.
  let s = second(board());
  const hunter = engaged(s, N.hunter);
  s.phase = "defense";
  const hero = s.heroes[0];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: hunter.id,
    defenderId: hero.id,
  });
  s = settle(s);
  assert.equal(get(s, hero.id)!.exhausted, false);
  assert.ok(s.log.some((l) => /treated as undefended/.test(l.text)));
  // An immediate attack: undefended, no character can defend it.
  s = board();
  const foe = engaged(s, N.hunter);
  s.combat = {
    enemyId: foe.id,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
    immediate: true,
  } as never;
  hooks(s).enemyAttackStarted!(s, foe, 0);
  flush(s);
  s = pick(s, "undefended");
  assert.equal(s.combat!.nmUndefended, true);
  assert.equal(hooks(s).cannotDefend!(s, foe, s.heroes[0]), true);
});

test("Nightmare: Thaurdir's Hunter's shadow on an undefended attack removes a time counter or 5 progress from a quest", () => {
  let s = board();
  const foe = engaged(s, R.wight);
  shadow(s, foe, N.hunter, s.heroes[0]);
  flush(s);
  assert.equal(s.choice, null, "a defended attack");
  s = board();
  const side = s.staging.find((u) => u.code === R.texts)!;
  side.progress = 6;
  const enemy = engaged(s, R.wight);
  shadow(s, enemy, N.hunter);
  flush(s);
  assert.deepEqual(options(s), ["time", `progress-${side.id}`]);
  s = pick(s, `progress-${side.id}`);
  assert.equal(side.progress, 1);
  assert.equal(s.rhudaur!.time, 5);
  // No quest has progress: the time counter goes without a choice.
  s = board();
  const other = engaged(s, R.wight);
  shadow(s, other, N.hunter);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.rhudaur!.time, 4);
});

test("Nightmare: Undead Thrall surges and is Indestructible; its shadow puts it into play engaged with the defending player with a shadow card", () => {
  let s = board();
  s.encounterDeck = [ROAD, ROAD, ROAD];
  revealed(s, N.thrall);
  s = run(s);
  const thrall = s.staging.find((u) => u.code === N.thrall)!;
  assert.ok(thrall);
  assert.equal(s.encounterDeck.length, 2, "Surge");
  assert.equal(hooks(s).indestructible!(s, thrall), true);
  s = board(2);
  s.encounterDeck = [ROAD, ROAD];
  const foe = engaged(s, R.wight, 1);
  shadow(s, foe, N.thrall, undefined, 1);
  assert.deepEqual(foe.shadows, []);
  const entered = seatView(s, 1).engaged.find((u) => u.code === N.thrall)!;
  assert.ok(entered, "engaged with the defending player");
  assert.deepEqual(entered.shadows, [ROAD]);
  assert.ok(!seatView(s, 0).engaged.some((u) => u.code === N.thrall));
});

test("Nightmare: Forgotten Courtyard gains a resource as each Undead enemy enters play (not when one returns to the staging area) and 1 threat for each resource", () => {
  const s = board();
  const yard = stage(s, N.courtyard);
  const active = make(s, N.courtyard);
  s.activeLocation = active;
  assert.equal(hooks(s).threatBonus!(s, yard), 0);
  const wight = stage(s, R.wight);
  enemyAddedToStaging(s, wight);
  assert.deepEqual([yard.resources, active.resources], [1, 1]);
  assert.equal(hooks(s).threatBonus!(s, yard), 1);
  // Not an Undead enemy.
  const orc = stage(s, "01048");
  assert.ok(!/Undead/.test(card(orc.code).traits ?? ""));
  enemyAddedToStaging(s, orc);
  assert.equal(yard.resources, 1);
  // An Undead enemy put into play engaged.
  shadow(s, engaged(s, R.wight), N.thrall, s.heroes[0]);
  assert.equal(yard.resources, 2);
  // An enemy returning to the staging area is already in play.
  s.staging = s.staging.filter((u) => u.id !== wight.id);
  s.engaged.push(wight);
  returnToStaging(s, wight);
  assert.equal(yard.resources, 2);
  assert.equal(hooks(s).threatBonus!(s, yard), 2);
  assert.ok(valid(s));
});

test("Nightmare: while Charred Cellar is the active location, a player whose threat an encounter card raises deals 2 damage to a character they control", () => {
  let s = board();
  const cellar = stage(s, N.cellar);
  forOwner(s, 0, () => raiseThreat(s, 2, "encounter"));
  flush(s);
  assert.equal(s.choice, null, "in the staging area its text is inactive");
  s.staging = s.staging.filter((u) => u.id !== cellar.id);
  s.activeLocation = cellar;
  forOwner(s, 0, () => raiseThreat(s, 2, "quest-failure"));
  flush(s);
  assert.equal(s.choice, null, "not an encounter card effect");
  forOwner(s, 0, () => raiseThreat(s, 2, "encounter"));
  flush(s);
  assert.match(s.choice!.title, /^Charred Cellar/);
  const target = s.heroes[1];
  s = choose(reload(s), target.id);
  assert.equal(get(s, target.id)!.damage, 2);
  // Malevolent Forces raises a threat: the Cellar's Forced effect follows.
  s.heroes[0].committed = true;
  revealed(s, N.forces);
  flush(s);
  assert.match(s.choice!.title, /^Charred Cellar/);
});

test("Nightmare: Malevolent Forces removes the questing character with the highest willpower and raises its controller's threat by it; its shadow heals each Undead enemy when the attack destroys a character", () => {
  let s = board(2);
  const heroes = playerOrder(s).flatMap((p) => seatView(s, p).heroes);
  const byWill = [...heroes].sort(
    (a, b) => stats(s, b).will - stats(s, a).will,
  );
  const [strong, weak] = [byWill[0], byWill[byWill.length - 1]];
  assert.ok(stats(s, strong).will > stats(s, weak).will);
  strong.committed = true;
  weak.committed = true;
  const owner = playerOrder(s).find((p) =>
    seatView(s, p).heroes.some((h) => h.id === strong.id),
  )!;
  const threat = playerOrder(s).map((p) => seatView(s, p).threat);
  revealed(s, N.forces);
  s = run(s);
  assert.equal(get(s, strong.id)!.committed, false);
  assert.equal(get(s, weak.id)!.committed, true);
  assert.equal(
    seatView(s, owner).threat,
    threat[owner] + stats(s, strong).will,
  );
  assert.equal(seatView(s, 1 - owner).threat, threat[1 - owner]);
  assert.ok(s.encounterDiscard.includes(N.forces));
  // The shadow.
  s = board();
  const foe = engaged(s, R.wight);
  const hurt = stage(s, N.hunter);
  hurt.damage = 3;
  foe.damage = 1;
  const victim = s.heroes[0];
  shadow(s, foe, N.forces, victim);
  assert.equal(s.combat!.nmUndeadHealOnKill, 1);
  hooks(s).characterDestroyed!(s, victim, {
    combatDamage: true,
    enemyId: foe.id,
  });
  flush(s);
  assert.deepEqual([hurt.damage, foe.damage], [0, 0]);
});

test("Nightmare: a player engaged with Apostate of Angmar cannot attack Thaurdir; its shadow discards the top encounter card for +X attack", () => {
  let s = second(board(2));
  const boss = thaurdirOf(s);
  engaged(s, N.apostate, 0);
  const [mine, theirs] = [seatView(s, 0).heroes[0], seatView(s, 1).heroes[0]];
  assert.equal(hooks(s).cannotAttack!(s, mine, boss), true);
  assert.equal(hooks(s).cannotAttack!(s, theirs, boss), false);
  assert.equal(
    hooks(s).cannotAttack!(s, mine, engaged(s, R.wight, 0)),
    false,
    "only Thaurdir",
  );
  s = board();
  s.encounterDeck = [N.apostate, ROAD];
  const foe = engaged(s, R.wight);
  shadow(s, foe, N.apostate, s.heroes[0]);
  assert.equal(s.combat!.attackBonus, 5);
  assert.deepEqual(s.encounterDeck, [ROAD]);
  assert.ok(s.encounterDiscard.includes(N.apostate));
});

test("Nightmare: Secret Antechamber is immune, caps the main quest's progress at 5 each round while staged, and costs each player 3 threat to travel to", () => {
  let s = second(board(2));
  const ante = stage(s, N.antechamber);
  assert.equal(hooks(s).immune!(s, ante), true);
  progress(s, 4);
  assert.equal(s.progress, 4);
  progress(s, 3);
  assert.equal(s.progress, 5, "only 1 of 3");
  s.round++;
  progress(s, 3);
  assert.equal(s.progress, 8, "a new round");
  // Travel: each player raises their threat by 3.
  s = board(2);
  s.activeLocation = null;
  const room = stage(s, N.antechamber);
  s.phase = "travel";
  const threat = playerOrder(s).map((p) => seatView(s, p).threat);
  s = applyAction(reload(s), { type: "TRAVEL", id: room.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, room.id);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    threat.map((t) => t + 3),
  );
});

test("Nightmare: Life Drain is dealt to Thaurdir as a shadow card; as his shadow it adds 3 attack, and a destroyed character attaches it to him for 3 more hit points", () => {
  let s = second(board());
  const boss = thaurdirOf(s);
  s.encounterDeck = [ROAD, ROAD, ROAD];
  revealed(s, N.drain);
  flush(s);
  // Its Sorcery trait: Thaurdir's immediate attack, with a fresh shadow card
  // (the cards he holds wait for his next attack).
  assert.match(s.choice!.title, /Thaurdir · Immediate attack/);
  assert.ok(
    s.combat!.immediatePreviousShadows!.includes(N.drain),
    "dealt as a shadow card",
  );
  s = settle(s);
  assert.ok(
    get(s, boss.id)!.shadows.includes(N.drain),
    "it waits for his next attack",
  );
  // Without Thaurdir in play, it is discarded.
  s = board();
  revealed(s, N.drain);
  flush(s);
  assert.ok(s.encounterDiscard.includes(N.drain));
  // The shadow, against Thaurdir's attack.
  s = second(board());
  const sorcerer = thaurdirOf(s);
  const health = stats(s, sorcerer).health;
  const victim = s.heroes[0];
  shadow(s, sorcerer, N.drain, victim);
  assert.equal(s.combat!.attackBonus, 3);
  hooks(s).characterDestroyed!(s, victim, {
    combatDamage: true,
    enemyId: sorcerer.id,
  });
  flush(s);
  assert.deepEqual(sorcerer.shadows, []);
  assert.deepEqual(
    sorcerer.attachments.map((a) => a.code),
    [N.drain],
  );
  assert.equal(stats(s, sorcerer).health, health + 3);
  assert.ok(
    attachmentHasTrait(sorcerer.attachments[0], "Condition"),
    "a Condition attachment",
  );
  check(s);
  assert.equal(sorcerer.attachments.length, 1, "despite his text");
  assert.ok(valid(s));
  // Another enemy's attack: no bonus, but a destroyed character still
  // attaches it to Thaurdir.
  s = second(board());
  const wight = engaged(s, R.wight);
  shadow(s, wight, N.drain, s.heroes[0]);
  assert.equal(s.combat!.attackBonus, 0);
  hooks(s).characterDestroyed!(s, s.heroes[0], {
    combatDamage: true,
    enemyId: wight.id,
  });
  flush(s);
  assert.equal(
    thaurdirOf(s).attachments.filter((a) => a.code === N.drain).length,
    1,
  );
});

test("Nightmare: The Treachery of Rhudaur's Nightmare state survives saves, malformed state is refused, and seeded games finish with valid saves", () => {
  const s = opening(game());
  s.nightmare!.rhudaurMainProgress = { round: s.round, placed: 3 };
  s.nightmare!.rhudaurEntered = ["c1"];
  assert.deepEqual(reload(s).nightmare, s.nightmare);
  assert.ok(valid(s));
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s)) as GameState;
    f(x);
    return valid(x);
  };
  assert.equal(
    broken((x) => (x.nightmare!.rhudaurAside = [ROAD])),
    false,
  );
  assert.equal(
    broken((x) => x.nightmare!.rhudaurAside!.push(N.apostate)),
    false,
    "4 Apostates",
  );
  assert.equal(
    broken(
      (x) =>
        (x.nightmare!.rhudaurMainProgress = { round: x.round + 1, placed: 1 }),
    ),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.rhudaurEntered = ["c1", "c1"])),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmareMode = false)),
    false,
    "a standard game has no Nightmare state",
  );
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 4000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(3), 5000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
  assert.ok(valid(g2));
});
