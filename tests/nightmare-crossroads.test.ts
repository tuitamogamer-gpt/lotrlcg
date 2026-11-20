import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { check } from "../src/game/board";
import { engagementCost, fx, get, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { playerCardImmune } from "../src/game/card-immunity";
import { playerOrder, seatView } from "../src/game/table";
import { JTC, blackGateLimit } from "../src/game/cross-roads";
import {
  NIGHTMARE,
  NIGHTMARE_LOS as L,
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
  valid,
} from "./nightmare-fixtures";
import {
  activate,
  allies,
  base,
  choose,
  engaged,
  reload,
  settle,
  stage,
} from "./cross-roads-fixtures";

const ID = "journey-to-the-cross-roads";
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare table (the scenario's own fixture). */
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
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
/** The given player reveals a known card from the top of the encounter deck. */
function reveal(s: GameState, code: string, p = 0) {
  s.encounterDeck.unshift(code);
  s.queue.push(fx("reveal", { player: p }));
  flush(s);
  return s;
}
/** A combat with `attacker` (shadow `code` resolved) against the defending player. */
function shadowOf(s: GameState, attacker: Unit, code: string, defender?: Unit) {
  s.combat = {
    enemyId: attacker.id,
    defenderId: defender?.id ?? null,
    defenderIds: defender ? [defender.id] : [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  attacker.shadows = [code];
  attacker.revealedShadowCount = 1;
  const handled = hooks(s).shadow!(s, code);
  flush(s);
  return handled;
}
const plain = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Guard of the Citadel. */
const GUARD = "01013";
/** Citadel Plate: "Attached hero gets +4 Hit Points." */
const PLATE = "01040";

test("Nightmare: Journey to the Cross-roads' setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(L.crossroadsCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "Journey to the Cross-roads",
      "nightmare",
      "nightmare",
      "Journey to the Cross-roads - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Journey to the Cross-roads scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n1x Captain of Harad\n1x Henneth Annun\n2x Southward Road\n4x Hills of Ithilien\n3x The Dark Lord's Summons\nThen, /,
    'paragraphs, "Cross-roads" and "standard encounter deck" (the catalogue had none of them); "Henneth Annun" as printed',
  );
  assert.match(c.text!, /remains active throughout the game/);
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nSetup: Place 1 Southron Warrior per player facedown under The Cross-roads, then shuffle the facedown cards under The Cross-roads. Set any remaining Southron Warriors aside, out of play.",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(L.warrior), [46, 3, 4, 2, 5]);
  assert.deepEqual(stat(L.rearguard), [38, 4, 6, 4, 8]);
  for (const [code, threat, quest] of [
    [L.glade, 4, 4],
    [L.fern, 5, 5],
    [L.shadowy, 2, 8],
  ] as const)
    assert.deepEqual(
      [card(code).threat, card(code).quest, card(code).traits],
      [threat, quest, "Forest."],
    );
  assert.equal(
    card(L.glade).name,
    "Wooded Glade",
    'the catalogue had "WoodedGlade"',
  );
  assert.equal(
    card(L.rearguard).text,
    "Cannot have attachments or be placed under The Black Gate.\nSouthron Rearguard gets -1 engagement cost for each progress token on stage 1B.",
  );
  assert.equal(
    card(L.rearguard).shadow,
    "Shadow: Return attacking enemy to staging area.",
    'printed without the catalogue\'s "the"',
  );
  assert.match(
    card(L.shadowy).text!,
    /for each facedown card under The Black Gate\.\nTravel: The first player reveals/,
  );
  assert.match(
    card(L.ware).text!,
    /^Peril\. Surge\.\nWhen Revealed: Either place this card facedown under The Black Gate, or put top the card under The Cross-roads into play engaged with you\.$/,
    "the printed misprint is kept",
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Journey to the Cross-roads - Nightmare",
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
});

test("Nightmare: Journey to the Cross-roads' Nightmare encounter deck matches its source recipe, with 1 Southron Warrior per player under The Cross-roads", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N0B.11")!;
  const section = (name: string) =>
    recipe.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  assert.deepEqual(tally(section("sharedSetAside")), { [L.warrior]: 4 });
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(
      card(L.crossroadsCard).text!.includes(`${n}x ${plain(title)}`),
      title,
    );
  for (const s of [opening(nightmareGame(ID)), opening(nightmareForTwo(ID))]) {
    const players = playerOrder(s).length;
    assert.equal(nightmareCardOf(s), L.crossroadsCard);
    const inPlay = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...playerOrder(s).flatMap((p) =>
        seatView(s, p).engaged.map((u) => u.code),
      ),
    ].filter((code) => code !== JTC.blackGate && code !== JTC.crossroads);
    assert.deepEqual(tally(inPlay), tally(section("sharedEncounterDeck")));
    assert.deepEqual(
      tally(s.crossRoads!.underCrossroads),
      tally([
        ...section("sharedEncounterDeck2"),
        ...Array<string>(players).fill(L.warrior),
      ]),
    );
    assert.match(
      nightmareStatus(s)[0],
      new RegExp(
        `^Journey to the Cross-roads · Nightmare mode: during setup, ${players} Southron Warriors? (was|were) shuffled facedown under The Cross-roads \\(the other ${4 - players === 1 ? "one is" : `${4 - players} are`} set aside, out of play\\)\\.$`,
      ),
    );
    assert.ok(valid(s));
  }
});

test("Nightmare: Southron Warrior has Archery 2, discards an ally of the player it engages, and its shadow gives +1 [attack] (+2 against a damaged defender)", () => {
  let s = board();
  const [guard] = allies(s, [GUARD, GUARD]);
  const warrior = stage(s, L.warrior);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: warrior.id });
  assert.match(
    s.choice!.title,
    /^Southron Warrior · Discard an ally you control/,
  );
  assert.equal(s.choice!.options.length, 2);
  s = settle(choose(s, guard.id));
  assert.deepEqual(
    s.allies.map((u) => u.code),
    [GUARD],
  );
  assert.ok(
    s.discard.some((c) => (typeof c === "string" ? c : c.code) === GUARD),
  );
  // Without an ally: nothing to discard.
  s = board();
  const lone = stage(s, L.warrior);
  s.phase = "encounter";
  s = settle(act(s, { type: "ENGAGE", id: lone.id }));
  assert.ok(
    s.log.some((l) => /Southron Warrior: you control no ally/.test(l.text)),
  );
  // Archery 2 from the staging area.
  s = board();
  stage(s, L.warrior);
  hooks(s).combatBegin!(s);
  assert.equal(s.queue.find((e) => e.kind === "heirsArchery")?.value, 2);
  // The shadow.
  s = board();
  const hero = s.heroes[0];
  shadowOf(s, engaged(s, JTC.man), L.warrior, hero);
  assert.equal(s.combat!.attackBonus, 1);
  s = board();
  s.heroes[0].damage = 1;
  shadowOf(s, engaged(s, JTC.man), L.warrior, s.heroes[0]);
  assert.equal(s.combat!.attackBonus, 2);
  s = board();
  shadowOf(s, engaged(s, JTC.man), L.warrior);
  assert.equal(s.combat!.attackBonus, 1, "undefended");
});

test("Nightmare: Southron Rearguard's engagement cost drops with stage 1B's progress; it cannot have attachments or go under The Black Gate, and its shadow returns the attacker to the staging area", () => {
  let s = board();
  const guard = stage(s, L.rearguard);
  assert.equal(engagementCost(s, guard), 38);
  s.progress = 12;
  assert.equal(engagementCost(s, guard), 26);
  assert.equal(hooks(s).cannotAttach!(s, guard, "01069"), true);
  // The Black Gate takes the Man of Harad, not the Rearguard.
  s = board();
  stage(s, JTC.man);
  const rearguard = stage(s, L.rearguard);
  s.phase = "planning";
  while (s.phase === "planning") s = settle(act(s, { type: "NEXT" }));
  assert.deepEqual(s.crossRoads!.underBlackGate, [JTC.man]);
  assert.ok(s.staging.some((u) => u.id === rearguard.id));
  assert.ok(
    s.log.some((l) =>
      /The Black Gate: Southron Rearguard cannot be placed under The Black Gate/.test(
        l.text,
      ),
    ),
  );
  // Fierce Southrons cannot choose it; Arrows Thick in the Air's shadow attacks again.
  s = board();
  stage(s, L.rearguard);
  s = reveal(s, JTC.southrons);
  assert.deepEqual(options(s), ["attack"]);
  s = board();
  const attacker = engaged(s, L.rearguard);
  shadowOf(s, attacker, JTC.arrows);
  assert.equal(s.choice, null);
  assert.equal(s.combat!.extraAttacks, 1);
  // Its shadow.
  s = board();
  shadowOf(s, engaged(s, JTC.man), L.rearguard);
  assert.equal(s.combat!.returnToStaging, true);
});

test("Nightmare: Wooded Glade blanks the non-objective attachments while it is active, and its shadow discards one", () => {
  let s = board();
  const hero = s.heroes.find((h) => !h.attachments.length)!;
  const before = stats(s, hero).health;
  hero.attachments.push({ id: "plate", code: PLATE, exhausted: false });
  check(s);
  assert.equal(stats(s, hero).health, before + 4);
  activate(s, L.glade);
  check(s);
  const plate = hero.attachments.find((a) => a.id === "plate")!;
  assert.equal(plate.blanked, true);
  assert.equal(stats(s, hero).health, before, "Citadel Plate is blank");
  const ring = s.heroes
    .flatMap((h) => h.attachments)
    .find((a) => card(a.code).type_code === "objective")!;
  assert.ok(ring, "The One Ring");
  assert.ok(!ring.blanked, "an objective keeps its text");
  s = reload(s);
  // Its shadow: a non-objective attachment of the defending player.
  shadowOf(s, engaged(s, JTC.man), L.glade);
  assert.match(
    s.choice!.title,
    /^Wooded Glade · Discard a non-objective attachment you control/,
  );
  assert.deepEqual(options(s), ["plate"]);
  s = settle(choose(s, "plate"));
  assert.ok(!s.heroes.some((h) => h.attachments.some((a) => a.id === "plate")));
});

test("Nightmare: Dense Fern-brake makes the enemies in the staging area immune to player card effects while it is active, and its shadow exhausts a character", () => {
  let s = board();
  activate(s, L.fern);
  const staged = stage(s, JTC.man);
  const foe = engaged(s, JTC.captain);
  check(s);
  assert.equal(playerCardImmune(staged), true);
  assert.equal(playerCardImmune(foe), false);
  s.activeLocation = null;
  check(s);
  assert.equal(playerCardImmune(staged), false);
  // Its shadow.
  s = board();
  const hero = s.heroes[0];
  shadowOf(s, engaged(s, JTC.man), L.fern);
  assert.match(
    s.choice!.title,
    /^Dense Fern-brake · Exhaust a character you control/,
  );
  s = settle(choose(s, hero.id));
  assert.equal(get(s, hero.id)!.exhausted, true);
});

test("Nightmare: Shadowy Thicket gets +2 [threat] for each facedown card under The Black Gate, and its travel reveals the top card under The Cross-roads", () => {
  let s = board();
  const thicket = stage(s, L.shadowy);
  assert.equal(threatOf(s, thicket), 2);
  s.crossRoads!.underBlackGate = [JTC.man, JTC.captain];
  assert.equal(threatOf(s, thicket), 6);
  s.crossRoads!.underBlackGate = [];
  s.phase = "travel";
  assert.throws(
    () => act(s, { type: "TRAVEL", id: thicket.id }),
    /no facedown card under The Cross-roads/,
  );
  s.crossRoads!.underCrossroads = [JTC.archer, JTC.soldier];
  s = settle(act(s, { type: "TRAVEL", id: thicket.id }));
  assert.equal(s.activeLocation?.id, thicket.id);
  assert.ok(s.staging.some((u) => u.code === JTC.archer));
  assert.deepEqual(s.crossRoads!.underCrossroads, [JTC.soldier]);
});

test("Nightmare: Blind Wrath gives the Harad enemies in the staging area +2 [threat], -30 engagement cost and no optional engagement until the end of the round; its shadow returns the attacker after a kill", () => {
  let s = board();
  const man = stage(s, JTC.man);
  const rearguard = stage(s, L.rearguard);
  const thicket = stage(s, L.shadowy);
  const [manThreat, manCost] = [threatOf(s, man), engagementCost(s, man)];
  s = reveal(s, L.wrath);
  assert.ok(s.encounterDiscard.includes(L.wrath));
  assert.equal(threatOf(s, man), manThreat + 2);
  assert.equal(engagementCost(s, man), manCost - 30);
  assert.equal(threatOf(s, rearguard), 6);
  assert.equal(threatOf(s, thicket), 2, "a location is not affected");
  assert.equal(hooks(s).cannotOptionallyEngage!(s, man), true);
  // An enemy that arrives later is not affected; a second copy stacks.
  const late = stage(s, JTC.captain);
  assert.equal(hooks(s).cannotOptionallyEngage!(s, late), false);
  s = reveal(s, L.wrath);
  assert.equal(threatOf(s, man), manThreat + 4);
  assert.equal(engagementCost(s, late), card(JTC.captain).engagement! - 30);
  assert.ok(valid(s));
  // Until the end of the round.
  hooks(s).roundEnd!(s);
  assert.equal(s.nightmare?.crossroadsWrath, undefined);
  assert.equal(threatOf(s, man), manThreat);
  // A save keeps the round's targets; a corrupt record is refused.
  s = reveal(board(), L.wrath);
  s.nightmare!.crossroadsWrath = { round: s.round, ids: ["x"] };
  assert.ok(valid(s));
  s.nightmare!.crossroadsWrath = { round: -1, ids: [] };
  assert.equal(valid(s), false);
  // Its shadow.
  s = board();
  shadowOf(s, engaged(s, JTC.man), L.wrath);
  assert.deepEqual(
    [s.combat!.attackBonus, s.combat!.jtcReturnOnKill],
    [1, true],
  );
});

test("Nightmare: Ware! Ware! surges, then goes facedown under The Black Gate or puts the top card under The Cross-roads into play engaged with the player; its shadow engages an enemy from the staging area with a shadow card", () => {
  // Under The Black Gate.
  let s = board();
  s.encounterDeck = [JTC.foothills, JTC.foothills];
  s.crossRoads!.underCrossroads = [JTC.man];
  s = reveal(s, L.ware);
  assert.match(s.choice!.title, /^Ware! Ware! · Choose one/);
  assert.deepEqual(options(s), ["gate", "cross-roads"]);
  s = settle(choose(s, "gate"));
  assert.deepEqual(s.crossRoads!.underBlackGate, [L.ware]);
  assert.ok(!s.encounterDiscard.includes(L.ware));
  assert.equal(
    s.staging.filter((u) => u.code === JTC.foothills).length,
    1,
    "surge",
  );
  // Engaged from under The Cross-roads.
  s = board();
  s.encounterDeck = [JTC.foothills, JTC.foothills];
  s.crossRoads!.underCrossroads = [JTC.man, JTC.archer];
  s = reveal(s, L.ware);
  s = settle(choose(s, "cross-roads"));
  assert.deepEqual(
    s.engaged.map((u) => u.code),
    [JTC.man],
  );
  assert.deepEqual(s.crossRoads!.underCrossroads, [JTC.archer]);
  assert.ok(s.encounterDiscard.includes(L.ware));
  // The last facedown card The Black Gate can hold loses the game.
  s = board();
  s.encounterDeck = [JTC.foothills, JTC.foothills];
  s.crossRoads!.underBlackGate = [JTC.man, JTC.man, JTC.man];
  s = reveal(s, L.ware);
  assert.deepEqual(options(s), ["gate"]);
  assert.match(
    s.choice!.options[0].label,
    new RegExp(
      `\\(${blackGateLimit(s)} of ${blackGateLimit(s)}: the players lose\\)`,
    ),
  );
  s = settle(choose(s, "gate"));
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /^4 facedown cards are under The Black Gate/);
  // Its shadow.
  s = board();
  s.encounterDeck = [JTC.foothills, JTC.hills];
  const staged = stage(s, JTC.captain);
  stage(s, JTC.man);
  shadowOf(s, engaged(s, JTC.man), L.ware);
  assert.match(
    s.choice!.title,
    /^Ware! Ware! · Engage an enemy in the staging area/,
  );
  s = settle(choose(s, staged.id));
  const captain = s.engaged.find((u) => u.id === staged.id)!;
  assert.ok(captain, "engaged");
  assert.deepEqual(captain.shadows, [JTC.foothills]);
});

test("Nightmare: Journey to the Cross-roads Nightmare games keep valid saves to their end", () => {
  for (const seed of [1, 2, 3])
    for (const s of [nightmareGame(ID, seed), nightmareForTwo(ID, seed)]) {
      const end = autoplay(s, 2500);
      assert.ok(valid(end), `seed ${seed}`);
    }
});
