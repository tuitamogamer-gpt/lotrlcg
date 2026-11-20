import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { applyAction } from "../src/game/engine";
import {
  damage,
  destroy,
  progressLocation,
  readyCharacter,
} from "../src/game/board";
import { fx, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  RI,
  RI_WIZARDRY,
  hasWizardry,
  roadIsengardSaruman,
} from "../src/game/road-isengard-support";
import {
  NIGHTMARE,
  NIGHTMARE_TOS as N,
  nightmareCardOf,
  nightmareEncounterDecks,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import type { Effect, GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  damageOf,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";
import {
  FILLER,
  activate,
  allies,
  base,
  choose,
  engaged,
  hand,
  reload,
  stage,
} from "./road-isengard-fixtures";

const ID = "the-road-to-isengard";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
const hooks = (s: GameState) => batch4Scenario(s);
/** Snowbourn Scout: a 1-hit-point ally (Guard of the Citadel, the filler, costs 2). */
const SCOUT = "01016";
/** A quiet Nightmare table (the scenario's own fixture). */
function board(players = 1, stageNumber = 2) {
  const s = base(players, stageNumber);
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
}
/** Resolve queued effects, answering each choice with `answer` (or the first option). */
function run(
  s: GameState,
  answer: (s: GameState) => string | undefined = () => undefined,
) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 60, "decisions terminate");
    s = choose(s, answer(s) ?? s.choice.options[0].id);
  }
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s: GameState, code: string, p = 0) => {
  s.encounterDeck.unshift(code);
  return queue(s, { kind: "reveal", player: p });
};
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const count = (list: string[], code: string) =>
  list.filter((c) => c === code).length;

test("Nightmare: The Road to Isengard's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.isengardCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "The Road to Isengard",
      "nightmare",
      "nightmare",
      "The Road to Isengard - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /for the The Road to Isengard scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Snaga\n1x Ring-wall of Isengard\n2x Open Pit\n1x Machines of Isengard\n3x Blast of Sorcery\nThen, shuffle .*\nFinally, flip this setup card over and place it next to the quest deck\. Its effect remains active throughout the game/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: When Ent of Fangorn leaves play, remove it from the game.",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [
      x.name,
      x.traits,
      x.engagement,
      x.threat,
      x.attack,
      x.defense,
      x.health,
      x.quantity,
    ];
  };
  assert.deepEqual(stat(N.archer), [
    "Orthanc Archer",
    "Orc.",
    38,
    2,
    3,
    2,
    3,
    3,
  ]);
  assert.deepEqual(stat(N.halfOrc), [
    "Half-orc of Isengard",
    "Orc. Isengard.",
    33,
    3,
    3,
    2,
    4,
    3,
  ]);
  const where = (code: string) => {
    const x = card(code);
    return [x.type_code, x.traits, x.threat, x.quest, x.victory, x.quantity];
  };
  assert.deepEqual(where(N.shaft), [
    "location",
    "Isengard.",
    2,
    5,
    undefined,
    3,
  ]);
  assert.deepEqual(where(N.fortress), [
    "location",
    "Isengard.",
    3,
    3,
    undefined,
    3,
  ]);
  assert.match(
    card(N.shaft).text!,
    /damaged characters cannot be readied by player card effects\.\nWizardry: Each player discards a damaged character he controls\.$/,
    "the scan's 'readied' (the catalogue had 'readed')",
  );
  assert.match(card(N.archer).text!, /^Peril\. Archery 2\.\nWhen Revealed: /);
  assert.match(card(N.traitor).text!, /^Peril\. Surge\.\nWhen Revealed: /);
  for (const code of [N.halfOrc, N.fumes, N.traitor, N.daunting])
    assert.match(card(code).shadow!, /^Shadow: /, card(code).name);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Road to Isengard - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((x) => set.some((y) => y.code === x.code)).length, 9);
  // The Nightmare locations' Wizardry joins the scenario's own list.
  assert.equal(RI_WIZARDRY.length, 5);
  assert.ok(hasWizardry(N.shaft) && hasWizardry(N.fortress));
  assert.ok(!hasWizardry(N.fumes));
});

test("Nightmare: The Road to Isengard's Nightmare encounter deck matches its source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const tally = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    section: string,
  ) =>
    r.cards
      .filter((c) => c.section === section && c.code !== N.isengardCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N0B.09")!;
  const standard = recipes.find((r) => r.id === "Q0B.09")!;
  const [deck] = nightmareEncounterDecks(
    ID,
    [pile(standard, "sharedEncounterDeck")],
    () => 0,
  );
  assert.equal(deck.length, 41);
  assert.deepEqual(tally(deck), tally(pile(nightmare, "sharedEncounterDeck")));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(
      card(N.isengardCard).text!.includes(`${n}x ${title}`),
      `${n}x ${title}`,
    );
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.isengardCard);
    assert.ok(valid(s));
    const cards = [...s.encounterDeck, ...s.encounterDiscard];
    assert.equal(count(cards, RI.blast), 0, "no Blast of Sorcery");
    assert.equal(count(cards, N.archer), 3);
    assert.equal(
      count(
        s.staging.map((u) => u.code),
        RI.ent,
      ),
      4,
    );
    assert.match(
      nightmareStatus(s)[0],
      /^The Road to Isengard · Nightmare mode/,
    );
  }
});

test("Nightmare: the setup card removes Ent of Fangorn from the game when it leaves play", () => {
  // An Ent of Fangorn under a player's control, discarded by Plain of
  // Isengard's Wizardry.
  let s = board(1, 1);
  const ent = s.staging.find((u) => u.code === RI.ent)!;
  s.staging = s.staging.filter((u) => u.id !== ent.id);
  s.allies.push(ent);
  s = run(queue(s, fx("riWizardry", { code: RI.plain, player: 0 })));
  assert.ok(!s.allies.some((u) => u.id === ent.id));
  assert.equal(count(s.encounterDiscard, RI.ent), 0);
  assert.equal(count(s.removedEncounter ?? [], RI.ent), 1);
  assert.ok(
    s.log.some((l) =>
      /Ent of Fangorn left play, so it is removed from the game/.test(l.text),
    ),
  );
  assert.ok(valid(s));
  // Destroyed by damage, it is removed too.
  s = board(1, 1);
  const other = s.staging.find((u) => u.code === RI.ent)!;
  s.staging = s.staging.filter((u) => u.id !== other.id);
  s.allies.push(other);
  damage(s, other.id, stats(s, other).health);
  flush(s);
  assert.equal(count(s.encounterDiscard, RI.ent), 0);
  assert.equal(count(s.removedEncounter ?? [], RI.ent), 1);
  // A standard game discards it.
  const t = base(1, 1);
  const own = t.staging.find((u) => u.code === RI.ent)!;
  t.staging = t.staging.filter((u) => u.id !== own.id);
  t.allies.push(own);
  destroy(t, own, false, "discard", false);
  assert.equal(count(t.encounterDiscard, RI.ent), 1);
});

test("Nightmare: Orthanc Archer's Archery 2 joins the scenario's archery total, and its When Revealed discards a random card to assign X damage, X its printed cost", () => {
  let s = board(1, 2);
  stage(s, N.archer);
  hooks(s).combatBegin!(s);
  assert.equal(s.queue.find((e) => e.kind === "heirsArchery")?.value, 2);
  // Peril: the revealing player discards Guard of the Citadel (cost 2).
  s = board(1, 2);
  hand(s, [FILLER]);
  s = run(reveal(s, N.archer));
  assert.ok(s.staging.some((u) => u.code === N.archer));
  assert.equal(s.hand.length, 0);
  assert.deepEqual(s.discard, [FILLER]);
  assert.equal(damageOf(s), 2);
  // With no card in hand, X is 0.
  s = board(1, 2);
  s = run(reveal(s, N.archer));
  assert.equal(damageOf(s), 0);
  assert.ok(
    s.log.some((l) => /Orthanc Archer: you have no card in hand/.test(l.text)),
  );
});

test("Nightmare: Half-orc of Isengard's Forced effect comes with a normal attack, declared through the defense action", () => {
  let s = board(1, 2);
  const orc = engaged(s, N.halfOrc);
  hand(s, [FILLER, FILLER]);
  s.phase = "defense";
  const hero = seatView(s, 0).heroes.find((h) => !h.exhausted)!;
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: orc.id,
    defenderId: hero.id,
  });
  assert.deepEqual(options(s), ["discard", "attack"]);
  s = choose(s, "attack");
  assert.ok(
    s.log.some((l) =>
      /Half-orc of Isengard gets \+3 \[attack\] for this attack/.test(l.text),
    ),
  );
});

test("Nightmare: Half-orc of Isengard attacks with a random discard or +3 attack, and its shadow discards a random card if the attack destroys a character", () => {
  let s = board(1, 2);
  const orc = engaged(s, N.halfOrc);
  hand(s, [FILLER, FILLER]);
  const attack = () => {
    s.combat = {
      enemyId: orc.id,
      defenderIds: [],
      attackBonus: 0,
      attackPlayer: 0,
    } as never;
    hooks(s).enemyAttackStarted!(s, orc, 0);
    flush(s);
  };
  attack();
  assert.deepEqual(options(s), ["discard", "attack"]);
  s = pick(s, "attack");
  assert.equal(s.combat!.attackBonus, 3);
  attack();
  s = pick(s, "discard");
  assert.equal(s.combat!.attackBonus, 0);
  assert.equal(s.hand.length, 1);
  assert.deepEqual(s.discard, [FILLER]);
  // With no card in hand, the attack bonus resolves alone.
  s.hand = [];
  attack();
  assert.equal(s.choice, null);
  assert.equal(s.combat!.attackBonus, 3);
  // Its shadow: a destroyed character costs the defending player a random card.
  s = board(1, 2);
  const enemy = engaged(s, RI.lieutenant);
  const [scout] = allies(s, [SCOUT]);
  hand(s, [FILLER]);
  assert.equal(shadow(s, enemy, N.halfOrc, scout), true);
  assert.equal(s.combat!.nmHandDiscardOnKill, 1);
  damage(s, scout.id, 1, { combatDamage: true, enemyId: enemy.id });
  flush(s);
  assert.equal(s.hand.length, 0);
  assert.ok(s.discard.includes(FILLER));
  assert.ok(
    s.log.some((l) =>
      /Half-orc of Isengard: Guard of the Citadel is discarded at random/.test(
        l.text,
      ),
    ),
  );
});

test("Nightmare: while Poisonous Shaft is staged damaged characters cannot be readied by player card effects, and its Wizardry has each player discard a damaged character (only the defending player through Saruman)", () => {
  let s = board(1, 2);
  stage(s, N.shaft);
  const [hurt, whole] = s.heroes;
  Object.assign(hurt, { exhausted: true, damage: 1 });
  whole.exhausted = true;
  readyCharacter(s, hurt);
  assert.equal(hurt.exhausted, true, "a player card effect cannot ready it");
  readyCharacter(s, whole);
  assert.equal(whole.exhausted, false);
  readyCharacter(s, hurt, false);
  assert.equal(hurt.exhausted, false, "the refresh phase readies it");
  // Explored as the active location: each player discards a damaged
  // character (and Breaking Isengard takes its damage).
  s = board(2, 2);
  const shaft = activate(s, N.shaft);
  const [a, b] = allies(s, [SCOUT, FILLER], 0);
  const [c] = allies(s, [FILLER], 1);
  a.damage = 0;
  b.damage = 1;
  c.damage = 1;
  forOwner(s, 0, () => (s.heroes[0].damage = 1));
  progressLocation(s, shaft, 5);
  s = run(s, (x) =>
    x.choice!.options.some((o) => o.id === b.id) ? b.id : undefined,
  );
  assert.equal(s.roadIsengard!.breaking, 1);
  assert.ok(!seatView(s, 0).allies.some((u) => u.id === b.id));
  assert.ok(seatView(s, 0).allies.some((u) => u.id === a.id));
  assert.ok(
    !seatView(s, 1).allies.some((u) => u.id === c.id),
    "one damaged character resolves alone",
  );
  assert.ok(
    s.log.some(
      (l) => l.text === "Poisonous Shaft's Wizardry effect is triggered.",
    ),
  );
  // Dealt to Saruman as a shadow card, only the defending player discards.
  s = board(2, 2);
  const [d] = allies(s, [FILLER], 0);
  const [e] = allies(s, [FILLER], 1);
  d.damage = 1;
  e.damage = 1;
  const saruman = roadIsengardSaruman(s)!;
  hooks(s).shadowDealt!(s, saruman, N.shaft);
  hooks(s).enemyAttackStarted!(s, saruman, 1);
  s = run(s);
  assert.ok(seatView(s, 0).allies.some((u) => u.id === d.id));
  assert.ok(!seatView(s, 1).allies.some((u) => u.id === e.id));
});

test("Nightmare: each staged Fortress of Isengard gives each Orc enemy +1 threat, attack and defense, and its Wizardry returns the topmost enemy of the discard pile to the staging area (Machines of Isengard triggers it too)", () => {
  let s = board(1, 2);
  const archer = engaged(s, N.archer);
  const lieutenant = engaged(s, RI.lieutenant);
  stage(s, N.fortress);
  stage(s, N.fortress);
  assert.equal(stats(s, archer).attack, 3 + 2);
  assert.equal(stats(s, archer).defense, 2 + 2);
  assert.equal(threatOf(s, archer), 2 + 2);
  assert.equal(stats(s, lieutenant).attack, card(RI.lieutenant).attack);
  // Its Wizardry: the topmost enemy (the last discarded).
  s = board(1, 2);
  s.encounterDiscard = [RI.orc, RI.wolf, RI.vapour];
  s = run(queue(s, fx("riWizardry", { code: N.fortress, player: 0 })));
  assert.ok(s.staging.some((u) => u.code === RI.wolf));
  assert.deepEqual(s.encounterDiscard, [RI.orc, RI.vapour]);
  // Machines of Isengard triggers the active location's Wizardry effect.
  s = board(1, 2);
  activate(s, N.fortress);
  s.encounterDiscard = [RI.grima];
  s.phase = "quest";
  s = run(reveal(s, RI.machines));
  assert.ok(s.staging.some((u) => u.code === RI.grima));
  assert.ok(!s.staging.some((u) => u.code === RI.ringWall), "no surge");
  // With no enemy in the discard pile, nothing returns.
  s = board(1, 2);
  s = run(queue(s, fx("riWizardry", { code: N.fortress, player: 0 })));
  assert.ok(
    s.log.some((l) => /no enemy in the encounter discard pile/.test(l.text)),
  );
});

test("Nightmare: Fire and Foul Fumes has each player assign X damage among questing characters, X the active location's threat, and surges without one; its shadow assigns X damage among the defender's characters", () => {
  let s = board(2, 2);
  activate(s, N.fortress);
  const questers = playerOrder(s).map((p) => {
    const h = seatView(s, p).heroes[0];
    h.committed = true;
    return h;
  });
  s = run(reveal(s, N.fumes));
  for (const h of questers)
    assert.equal(
      h.damage,
      Math.min(3, stats(s, h).health),
      "3 damage to the only questing character",
    );
  assert.ok(s.encounterDiscard.includes(N.fumes));
  // No active location: it gains surge.
  s = board(1, 2);
  s.phase = "quest";
  s = run(reveal(s, N.fumes));
  assert.equal(damageOf(s), 0);
  assert.ok(
    s.staging.some((u) => u.code === RI.ringWall),
    "the surge reveals a card",
  );
  // Its shadow: X damage among the defending player's characters.
  s = board(1, 2);
  activate(s, N.shaft);
  const enemy = engaged(s, RI.lieutenant);
  assert.equal(shadow(s, enemy, N.fumes, s.heroes[0]), true);
  s = run(s);
  assert.equal(damageOf(s), 2);
  // Without an active location, X is 0.
  s = board(1, 2);
  const other = engaged(s, RI.lieutenant);
  shadow(s, other, N.fumes, s.heroes[0]);
  s = run(s);
  assert.equal(damageOf(s), 0);
});

test("Nightmare: Traitor of Many Colors surges and has Saruman attack the revealing player once he is in play; its shadow discards a random card or makes the attacker attack again", () => {
  let s = board(1, 1);
  s.phase = "quest";
  s = run(reveal(s, N.traitor));
  assert.ok(
    s.log.some(
      (l) => l.text === "Traitor of Many Colors: Saruman is not in play.",
    ),
  );
  assert.ok(
    s.staging.some((u) => u.code === RI.ringWall),
    "Surge",
  );
  s = board(2, 2);
  const saruman = roadIsengardSaruman(s)!;
  reveal(s, N.traitor, 1);
  flush(s);
  assert.ok(
    s.log.some((l) =>
      /Traitor of Many Colors: Saruman makes an immediate attack against/.test(
        l.text,
      ),
    ),
  );
  assert.deepEqual(
    [s.combat?.enemyId, s.combat?.attackPlayer, s.combat?.immediate],
    [saruman.id, 1, true],
    "Saruman attacks the revealing player",
  );
  assert.ok(
    s.queue.some((e) => e.kind === "amonSurgeWindow"),
    "its surge follows the attack",
  );
  // Its shadow.
  s = board(1, 2);
  const enemy = engaged(s, RI.lieutenant);
  hand(s, [FILLER]);
  shadow(s, enemy, N.traitor, s.heroes[0]);
  assert.deepEqual(options(s), ["discard", "attack"]);
  s = pick(s, "attack");
  assert.equal(s.combat!.extraAttacks, 1);
  shadow(s, enemy, N.traitor, s.heroes[0]);
  s = pick(s, "discard");
  assert.equal(s.hand.length, 0);
  assert.ok(!s.combat!.extraAttacks);
  // With no card in hand, the additional attack resolves alone.
  shadow(s, enemy, N.traitor, s.heroes[0]);
  assert.equal(s.choice, null);
  flush(s);
  assert.equal(s.combat!.extraAttacks, 1);
});

test("Nightmare: Daunting Power keeps characters from attacking for the round and raises each player's threat by 4 with no engaged enemy; its shadow keeps the defender from readying", () => {
  let s = board(2, 2);
  const enemy = { ...roadIsengardSaruman(s)! };
  s = run(reveal(s, N.daunting));
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [24, 24],
  );
  assert.equal(hooks(s).cannotAttack!(s, s.heroes[0], enemy), true);
  s.round += 1;
  assert.equal(hooks(s).cannotAttack!(s, s.heroes[0], enemy), false);
  // An engaged enemy (Saruman, considered engaged while Orthanc is active at
  // stage 3) prevents the threat raise.
  s = board(1, 2);
  engaged(s, RI.lieutenant);
  s = run(reveal(s, N.daunting));
  assert.equal(s.threat, 20);
  s = board(1, 3);
  const orthanc = s.staging.find((u) => u.code === RI.orthanc)!;
  s.staging = s.staging.filter((u) => u.id !== orthanc.id);
  s.activeLocation = orthanc;
  s = run(reveal(s, N.daunting));
  assert.equal(s.threat, 20);
  // Its shadow: the defending character cannot ready until the end of the round.
  s = board(1, 2);
  const attacker = engaged(s, RI.lieutenant);
  const hero = s.heroes[0];
  hero.exhausted = true;
  shadow(s, attacker, N.daunting, hero);
  readyCharacter(s, hero, false);
  assert.equal(hero.exhausted, true);
  s.round += 1;
  readyCharacter(s, hero, false);
  assert.equal(hero.exhausted, false);
});

test("Nightmare: The Road to Isengard's Nightmare state survives saves, malformed state is refused, and seeded games finish with valid saves", () => {
  let s = board(1, 2);
  s = run(reveal(s, N.daunting));
  shadow(s, engaged(s, RI.lieutenant), N.daunting, s.heroes[0]);
  s.combat = null;
  const back = reload(s);
  assert.deepEqual(back.nightmare, s.nightmare);
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s));
    f(x);
    return valid(x);
  };
  assert.equal(
    broken((x) => (x.nightmare!.isengardDaunting = 99)),
    false,
  );
  assert.equal(
    broken(
      (x) => (x.nightmare!.isengardNoReady = [{ round: 1, id: 3 as never }]),
    ),
    false,
  );
  assert.equal(
    broken((x) => delete x.nightmareMode),
    false,
    "only a Nightmare game holds the Nightmare Deck's state",
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
