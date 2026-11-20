import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { check, progressLocation, revealed } from "../src/game/board";
import { get, make, questStat, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { addQuestProgress, sideQuestStart } from "../src/game/side-quests";
import { attachmentHasTrait } from "../src/game/expansion-passives";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import { CARN as C } from "../src/game/carn-dum-support";
import {
  NIGHTMARE,
  NIGHTMARE_AA as N,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  valid,
} from "./nightmare-fixtures";
import {
  ally,
  base,
  boss,
  choose,
  enemy,
  reload,
  second,
  settle,
  staged,
} from "./carn-dum-fixtures";

const ID = "the-battle-of-carn-dum";
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
/** A shadow card's effect during an attack by `attacker` (with its other shadow cards). */
function shadowOf(
  s: GameState,
  attacker: Unit,
  code: string,
  others: string[] = [],
  defender?: Unit,
  attackPlayer = 0,
) {
  s.combat = {
    enemyId: attacker.id,
    defenderId: defender?.id ?? null,
    defenderIds: defender ? [defender.id] : [],
    attackBonus: 0,
    attackPlayer,
  } as never;
  attacker.shadows = [code, ...others];
  attacker.revealedShadowCount = 1;
  return hooks(s).shadow!(s, code);
}
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
/** Old Forest Road: no shadow effect. */
const ROAD = "01099";
/** Steward of Gondor, an attachment. */
const STEWARD = "01026";

test("Nightmare: The Battle of Carn Dûm's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.carnCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "The Battle of Carn Dûm",
      "nightmare",
      "nightmare",
      "The Battle of Carn Dum - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Battle of Carn Dûm scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n1x Vile Affliction\n1x Furious Charge\n1x Orc Ambush\n1x Angmar Orc\n3x Angmar Marauder\n3x Terror of the North\n2x Accursed Battlefield\n1x Blight of Carn Dûm\nThen, /,
    "paragraphs and accents (the catalogue had one paragraph and Carn Dum)",
  );
  assert.match(
    c.text!,
    /\nKeyword: Siege\nIf a quest card has the siege keyword, when characters are committed to that quest, they count their total \[defense\] instead of their total \[willpower\] when resolving the quest\. Enemies and locations in the staging area still use their \[threat\] in opposition to this quest attempt\.$/,
  );
  assert.equal(c.back_text, "You are playing Nightmare mode.");
  const stat = (code: string) => {
    const x = card(code);
    return [x.type_code, x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(N.orcWight), ["enemy", 30, 2, 3, 2, 4]);
  assert.equal(card(N.orcWight).traits, "Orc. Undead.");
  assert.deepEqual(stat(N.elite), ["enemy", 45, 2, 5, 4, 6]);
  assert.equal(card(N.elite).traits, "Orc.");
  assert.deepEqual(
    [N.tower, N.gates].map((code) => [card(code).threat, card(code).quest]),
    [
      [3, 4],
      [5, 2],
    ],
  );
  assert.equal(
    card(N.gates).text,
    "Forced: After Gates of Carn Dûm is explored, deal it as a shadow card to the enemy in the staging area with the lowest engagement cost.",
    'the scan\'s "as a shadow card" (the catalogue lacked "a")',
  );
  assert.equal(card(N.decay).traits, "Sorcery.");
  assert.equal(card(N.blackMare).is_unique, true);
  assert.deepEqual(
    [N.flanks, N.rally, N.sever].map((code) => [
      card(code).type_code,
      card(code).quest,
      card(code).victory,
      card(code).text!.split("\n")[0],
    ]),
    [
      ["encounter-side-quest", 6, 10, "Siege."],
      ["encounter-side-quest", 8, 10, "Surge."],
      ["encounter-side-quest", 6, 10, "Battle."],
    ],
  );
  assert.equal(
    card(N.sever).text,
    "Battle.\nThaurdir gets +2 [threat], +2 [attack], and cannot take damage.",
    "no flavour text (the catalogue kept it)",
  );
  assert.equal(card(N.rally).text!.split("\n").length, 3);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Battle of Carn Dum - Nightmare",
  );
  assert.equal(set.length, 11);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((x) => set.some((y) => y.code === x.code)).length,
    12,
  );
});

test("Nightmare: The Battle of Carn Dûm's Nightmare encounter deck matches its source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N05.8")!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section && c.code !== N.carnCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.carnCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    const players = playerOrder(s).length;
    assert.equal(nightmareCardOf(s), N.carnCard);
    // The Garrisons the setup does not stage return to the encounter deck.
    assert.deepEqual(
      tally(s.encounterDeck),
      tally([
        ...pile("sharedEncounterDeck"),
        ...Array<string>(4 - players).fill(C.garrison),
      ]),
    );
    assert.equal(s.staging.filter((u) => u.code === C.thaurdir).length, 1);
    assert.equal(
      s.staging.filter((u) => u.code === C.garrison).length,
      players,
    );
    assert.equal(s.activeLocation?.code, C.battlefield);
    assert.match(
      nightmareStatus(s)[0],
      /^The Battle of Carn Dûm · Nightmare mode: .*siege keyword/,
    );
    assert.ok(valid(s));
  }
});

test("Nightmare: Orc Wight is dealt 2 shadow cards as it enters play (not when it returns to the staging area), and its shadow returns an attacker with another shadow card to the staging area", () => {
  let s = board();
  s.encounterDeck = [ROAD, ROAD, ROAD, ROAD];
  revealed(s, N.orcWight);
  s = run(s);
  const wight = s.staging.find((u) => u.code === N.orcWight)!;
  assert.equal(wight.shadows.length, 2);
  assert.deepEqual(s.nightmare!.carnWights, [wight.id]);
  // Engaged, then back in the staging area: no new shadow cards.
  s.staging = s.staging.filter((u) => u.id !== wight.id);
  s.engaged.push(wight);
  queue(s, { kind: "ncdReturn", target: wight.id });
  s = run(s);
  assert.ok(s.staging.some((u) => u.id === wight.id));
  assert.equal(get(s, wight.id)!.shadows.length, 2, "its shadow cards stay");
  // Its shadow: the attacker has another shadow card, so it returns.
  s = board();
  const foe = enemy(s);
  shadowOf(s, foe, N.orcWight, [ROAD], s.heroes[0]);
  assert.equal(s.combat!.nmReturnAfter, 1);
  queue(s, ...hooks(s).attackFinished!(s, s.combat!));
  s.combat = null;
  s = run(s);
  assert.ok(s.staging.some((u) => u.id === foe.id));
  assert.ok(!s.engaged.some((u) => u.id === foe.id));
  assert.ok(
    get(s, foe.id)!.shadows.includes(ROAD),
    "its other shadow card stays",
  );
  // Alone, it returns nothing.
  s = board();
  const lone = enemy(s);
  shadowOf(s, lone, N.orcWight, [], s.heroes[0]);
  assert.equal(s.combat!.nmReturnAfter, undefined);
  assert.deepEqual(hooks(s).attackFinished!(s, s.combat!), []);
});

test("Nightmare: Thaurdir's Elite with exactly 3 shadow cards discards them and makes each player discard an ally; its shadow raises the threat by 4 or discards an ally", () => {
  let s = board(2);
  const elite = staged(s, N.elite);
  const a0 = ally(s, "01016", 0);
  ally(s, "01016", 1);
  elite.shadows = [ROAD, ROAD, ROAD];
  check(s);
  s = run(s);
  assert.deepEqual(get(s, elite.id)!.shadows, []);
  assert.equal(s.encounterDiscard.filter((c) => c === ROAD).length, 3);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).allies.length),
    [0, 0],
  );
  assert.ok(seatView(s, 0).discard.includes(a0.code));
  // Not again while the count stays at 3.
  s = board();
  const held = staged(s, N.elite);
  held.shadows = [ROAD, ROAD, ROAD];
  s.nightmare!.carnElites = [held.id];
  check(s);
  flush(s);
  assert.equal(get(s, held.id)!.shadows.length, 3);
  // Its shadow: the threat, or an ally.
  s = board();
  const foe = enemy(s);
  const friend = ally(s);
  shadowOf(s, foe, N.elite, [], s.heroes[0]);
  flush(s);
  assert.deepEqual(options(s), ["threat", friend.id]);
  const threat = s.threat;
  s = pick(s, "threat");
  assert.equal(s.threat, threat + 4);
  s = board();
  shadowOf(s, enemy(s), N.elite, [], s.heroes[0]);
  flush(s);
  assert.equal(s.choice, null, "no ally to discard");
  assert.equal(s.threat, 24);
});

test("Nightmare: Stronghold Tower keeps shadow effects from being canceled while staged and costs each player 2 damage to travel to", () => {
  let s = board(2);
  assert.equal(hooks(s).cannotCancel!(s, true, ROAD), false);
  const tower = staged(s, N.tower);
  assert.equal(hooks(s).cannotCancel!(s, true, ROAD), true);
  assert.equal(
    hooks(s).cannotCancel!(s, false, N.decay),
    false,
    "only shadow effects",
  );
  s.activeLocation = null;
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: tower.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, tower.id);
  assert.deepEqual(
    playerOrder(s).map((p) =>
      [...seatView(s, p).heroes, ...seatView(s, p).allies].reduce(
        (n, u) => n + u.damage,
        0,
      ),
    ),
    [2, 2],
  );
});

test("Nightmare: Gates of Carn Dûm, explored, is dealt as a shadow card to the staged enemy with the lowest engagement cost; its shadow adds 1 attack and protects the attacker this round", () => {
  let s = board();
  const garrison = staged(s, C.garrison);
  const elite = staged(s, N.elite);
  const gates = make(s, N.gates);
  s.activeLocation = gates;
  progressLocation(s, gates, 2);
  flush(s);
  // Thaurdir (50) ties the Garrison (40, +10 while he is a Captain); the
  // Elite costs 55.
  assert.deepEqual(options(s).sort(), [boss(s).id, garrison.id].sort());
  s = choose(reload(s), garrison.id);
  s = settle(s);
  assert.ok(!s.encounterDiscard.includes(N.gates));
  assert.deepEqual(get(s, garrison.id)!.shadows, [N.gates]);
  assert.deepEqual(get(s, elite.id)!.shadows, []);
  // No enemy in the staging area: it stays in the discard pile.
  s = board();
  s.staging = [];
  const lone = make(s, N.gates);
  s.activeLocation = lone;
  progressLocation(s, lone, 2);
  s = run(s);
  assert.ok(s.encounterDiscard.includes(N.gates));
  // Its shadow.
  s = board();
  const foe = enemy(s);
  shadowOf(s, foe, N.gates, [], s.heroes[0]);
  assert.equal(s.combat!.attackBonus, 1);
  assert.equal(foe.roundCannotTakeDamage, true);
});

test("Nightmare: Death and Decay discards the top 3 cards of each deck and each attachment titled like a card in its controller's discard pile, or gains surge after Thaurdir's Sorcery effect", () => {
  let s = board();
  const hero = s.heroes[0];
  hero.attachments.push({
    id: "a-steward",
    code: STEWARD,
    exhausted: false,
    owner: 0,
  });
  s.deck = [STEWARD, "01057", "01057", "01057", "01057"];
  s.encounterDeck = [ROAD, ROAD, ROAD, ROAD];
  revealed(s, N.decay);
  s = run(s);
  assert.equal(s.deck.length, 2);
  assert.ok(!hero.attachments.some((a) => a.code === STEWARD));
  assert.ok(
    s.log.some((l) =>
      /Death and Decay: 1 attachment is discarded/.test(l.text),
    ),
  );
  // Nothing matches: it surges, after Thaurdir's Forced effect.
  s = board();
  const garrison = staged(s, C.garrison);
  s.encounterDeck = [ROAD, ROAD, ROAD, ROAD, ROAD];
  revealed(s, N.decay);
  s = run(s);
  const order = s.log.map((l) => l.text);
  const surge = order.findIndex((t) => /gains surge/.test(t));
  assert.ok(surge >= 0);
  assert.ok(
    get(s, garrison.id)!.shadows.length >= 1,
    "Thaurdir dealt a shadow card to each enemy",
  );
  assert.ok(
    s.encounterDeck.length <= 5 - 2,
    "a shadow card for each enemy, then the surge's reveal",
  );
});

test("Nightmare: Howling of Wargs deals a shadow card to each staged enemy or finds a side quest; its shadow feeds the defending player's enemies that have not attacked", () => {
  let s = board();
  const garrison = staged(s, C.garrison);
  s.encounterDeck = [ROAD, ROAD, ROAD, ROAD];
  s.encounterDiscard = [N.rally];
  revealed(s, N.howling);
  flush(s);
  assert.deepEqual(options(s), ["shadows", "search"]);
  s = choose(reload(s), "shadows");
  s = settle(s);
  assert.equal(get(s, garrison.id)!.shadows.length, 1);
  assert.equal(
    boss(s).shadows.length,
    1,
    "Thaurdir is an enemy in the staging area",
  );
  // The side quest instead: added to the staging area (no surge).
  s = board();
  s.encounterDeck = [ROAD, ROAD, ROAD];
  s.encounterDiscard = [N.rally];
  revealed(s, N.howling);
  flush(s);
  s = choose(reload(s), "search");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === N.rally));
  assert.equal(s.encounterDeck.length, 3, "added, not revealed");
  // No side quest to find: the shadow cards alone.
  s = board();
  s.encounterDeck = [ROAD, ROAD];
  revealed(s, N.howling);
  flush(s);
  assert.equal(s.choice, null);
  // Its shadow.
  s = board();
  s.encounterDeck = [ROAD, ROAD, ROAD];
  const attacker = enemy(s);
  const waiting = enemy(s, C.garrison);
  const done = enemy(s, C.garrison);
  done.attacked = true;
  s.phase = "defense";
  shadowOf(s, attacker, N.howling, [], s.heroes[0]);
  assert.deepEqual(
    [attacker, waiting, done].map((u) => u.shadows.length),
    [1, 1, 0],
  );
});

test("Nightmare: Black Mare attaches to Thaurdir for 3 more hit points, stays despite his text, and raises each player's threat by 1 when he flips", () => {
  let s = board(2);
  const thaurdir = boss(s);
  const health = stats(s, thaurdir).health;
  revealed(s, N.blackMare);
  s = run(s);
  const mare = boss(s).attachments.find((a) => a.code === N.blackMare)!;
  assert.ok(mare);
  assert.ok(attachmentHasTrait(mare, "Mount"));
  assert.equal(stats(s, boss(s)).health, health + 3);
  check(s);
  assert.equal(
    boss(s).attachments.length,
    1,
    "despite Cannot have attachments",
  );
  assert.ok(!s.encounterDiscard.includes(N.blackMare));
  // The flip: the first player orders Thaurdir's Forced effect and the Mare's.
  const threat = playerOrder(s).map((p) => seatView(s, p).threat);
  queue(s, { kind: "carnFlip", target: boss(s).id, player: 0 });
  flush(s);
  assert.equal(boss(s).flipped, true);
  assert.equal(s.choice?.options.length, 2);
  s = choose(
    reload(s),
    s.choice!.options.find((o) => /Black Mare/.test(o.label))!.id,
  );
  s = settle(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    threat.map((t) => t + 1),
  );
  // Its shadow attaches it too.
  s = board();
  const foe = enemy(s);
  shadowOf(s, foe, N.blackMare, [ROAD], s.heroes[0]);
  assert.deepEqual(foe.shadows, [ROAD]);
  assert.equal(
    boss(s).attachments.filter((a) => a.code === N.blackMare).length,
    1,
  );
});

test("Nightmare: Protect the Flanks deals X damage among characters at the end of the combat phase (X the shadow cards on staged enemies), and its siege makes the questers count their defense", () => {
  let s = board(2);
  const flanks = staged(s, N.flanks);
  staged(s, C.garrison).shadows = [ROAD, ROAD];
  boss(s).shadows = [ROAD];
  const damage = () =>
    playerOrder(s)
      .flatMap((p) => [...seatView(s, p).heroes, ...seatView(s, p).allies])
      .reduce((n, u) => n + u.damage, 0);
  hooks(s).combatEnd!(s);
  s = run(s);
  assert.equal(damage(), 3);
  // Siege, as the current quest; Accursed Battlefield's Battle takes over.
  s = board();
  const quest = staged(s, N.flanks);
  s.activeLocation = null;
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = choose(reload(s), quest.id);
  assert.equal(questStat(s), "defense");
  s.activeLocation = make(s, C.battlefield);
  assert.equal(questStat(s), "attack");
  void flanks;
});

test("Nightmare: Rally the Fighters surges, makes shadow cards immune to player card effects, and its defeat may discard 1 shadow card from each enemy", () => {
  let s = board();
  s.encounterDeck = [ROAD, ROAD];
  revealed(s, N.rally);
  s = run(s);
  const rally = s.staging.find((u) => u.code === N.rally)!;
  assert.ok(rally);
  assert.equal(s.encounterDeck.length, 1, "Surge");
  const garrison = staged(s, C.garrison);
  assert.equal(hooks(s).shadowImmune!(s, garrison), true);
  garrison.shadows = [ROAD, N.gates];
  boss(s).shadows = [ROAD];
  addQuestProgress(s, rally, 8);
  flush(s);
  assert.deepEqual(options(s), ["discard", "skip"]);
  s = choose(reload(s), "discard");
  s = settle(s);
  assert.deepEqual(get(s, garrison.id)!.shadows, [ROAD]);
  assert.deepEqual(boss(s).shadows, []);
  assert.equal(hooks(s).shadowImmune!(s, get(s, garrison.id)!), false);
});

test("Nightmare: Sever the Head gives Thaurdir +2 threat and +2 attack and keeps him from taking damage, and its battle makes the questers count their attack", () => {
  let s = second(board());
  const thaurdir = boss(s);
  const [threat, attack] = [threatOf(s, thaurdir), stats(s, thaurdir).attack];
  const sever = staged(s, N.sever);
  assert.equal(threatOf(s, thaurdir), threat + 2);
  assert.equal(stats(s, thaurdir).attack, attack + 2);
  assert.equal(
    hooks(s).damageAmount!(s, thaurdir, 3, { combatDamage: true }),
    0,
  );
  s.activeLocation = null;
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = choose(reload(s), sever.id);
  assert.equal(questStat(s), "attack");
});

test("Nightmare: The Battle of Carn Dûm's Nightmare state survives saves, malformed state is refused, and seeded games finish with valid saves", () => {
  const s = opening(game());
  (s.nightmare ??= {}).carnWights = ["c1"];
  s.nightmare.carnElites = ["c2"];
  assert.deepEqual(reload(s).nightmare, s.nightmare);
  assert.ok(valid(s));
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s)) as GameState;
    f(x);
    return valid(x);
  };
  assert.equal(
    broken((x) => (x.nightmare!.carnWights = ["c1", "c1"])),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.carnElites = [3 as never])),
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
