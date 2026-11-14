import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../src/game/engine";
import { canTravel } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  make,
  stagingThreat,
  stats,
  threatOf,
} from "../src/game/core";
import { check, enterEnemyEngaged, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { playerCardImmune } from "../src/game/card-immunity";
import { syncAttachmentText } from "../src/game/attachment-text";
import { rhosgobelHeal } from "../src/game/rhosgobel";
import { firstPlayer, playerOrder, seatView } from "../src/game/table";
import { FLAME_WEST_ARAGORN, sagaHero } from "../src/game/lotr-saga";
import {
  SG,
  SIEGE_GONDOR_HOOKS,
  SIEGE_GONDOR_RECIPES,
  sgFleetResources,
  siegeGondorPublicState,
  siegeGondorStageInfo,
} from "../src/game/siege-gondor";
import {
  activate,
  allies,
  base,
  choose,
  created,
  engaged,
  fleet,
  reload,
  settle,
  stage,
} from "./siege-gondor-fixtures";
import type { GameState, Unit } from "../src/game/types";

const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s: GameState, code: string, p = 0) => {
  s.encounterDeck.unshift(code);
  s.queue.push({ kind: "reveal", player: p });
  flush(s);
  return s;
};
const run = (s: GameState, kind: string, p = 0, extra = {}) => {
  s.queue.push(fx(kind, { player: p, ...extra }));
  flush(s);
  return s;
};
/** Continue past the optional responses offered as a card is revealed. */
const pastReveal = (s: GameState) => {
  while (s.choice && /^Revealed · /.test(s.choice.title))
    s = choose(s, "resolve");
  return s;
};
/** An engaged enemy attacks with the given shadow cards (facedown). */
const defend = (
  s: GameState,
  enemy: Unit,
  defender: Unit | null,
  shadows: string[] = [],
) => {
  s.phase = "defense";
  s.combat = null;
  enemy.shadows = [...shadows];
  enemy.faceupShadows = shadows.map(() => false);
  return act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
};
/** Decline the other decisions (such as player responses) until the one matching. */
const until = (s: GameState, title: RegExp) => {
  for (let n = 0; s.choice && !title.test(s.choice.title); n++) {
    assert.ok(n < 20, s.choice.title);
    s = choose(
      s,
      (s.choice.options.find((o) => o.id === "skip") ?? s.choice.options[0]).id,
    );
  }
  assert.match(s.choice?.title ?? "", title);
  return s;
};
/** Choose the listed options in order, then settle the rest. */
const answer = (s: GameState, ...ids: string[]) => {
  for (const id of ids) s = choose(s, id);
  return s;
};
const deckSize = (easy: boolean) =>
  SIEGE_GONDOR_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!
    .cards.filter((c) => c.section === "sharedEncounterDeck")
    .reduce((n, c) => n + c.quantity, 0);
const GUARD = "01013",
  SNOWBOURN = "01016",
  BLADE = "01039",
  COURAGE = "01057";
const hp = (s: GameState, u: Unit) => stats(s, u).health - u.damage;
const victory = (s: GameState, ...codes: string[]) => {
  s.victoryCards = [...(s.victoryCards ?? []), ...codes];
};

test("Setup: The Corsair Fleet and Great Corsair Ship join the staging area, each player searches for a Ship location and the first player controls Aragorn, in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      let s = created(players, easy, 701 + players);
      const aragorn = sagaHero(s)!;
      assert.equal(aragorn.code, FLAME_WEST_ARAGORN);
      assert.ok(
        seatView(s, firstPlayer(s)).heroes.some((h) => h.id === aragorn.id),
      );
      assert.deepEqual(s.siegeGondor!.setAside, [SG.rules]);
      assert.deepEqual(
        s.staging.map((u) => u.code).sort(),
        [SG.fleet, SG.greatShip].sort(),
      );
      assert.equal(sgFleetResources(s), 0);
      assert.equal(s.encounterDeck.length, deckSize(easy));
      assert.equal(siegeGondorStageInfo(s)!.quest, 20);
      for (const p of playerOrder(s)) {
        assert.match(
          s.choice!.title,
          /^Attack on Pelargir · Search the encounter deck for a Ship location/,
        );
        assert.deepEqual(
          s.choice!.options.map((o) => o.id).sort(),
          [SG.galley, SG.dromon].sort(),
          `${p}`,
        );
        s = choose(s, p % 2 ? SG.galley : SG.dromon);
      }
      s = settle(s);
      assert.equal(s.encounterDeck.length, deckSize(easy) - players);
      assert.equal(
        s.staging.filter((u) => u.code === SG.galley || u.code === SG.dromon)
          .length,
        players,
      );
      assert.equal(s.round, 1);
    }
  assert.equal(deckSize(false), 30);
  assert.equal(deckSize(true), 24);
});

test("The Corsair Fleet: at the beginning of the staging step it gains a resource and each player reveals an encounter card or assigns X damage among his characters", () => {
  let s = base(2);
  fleet(s).resources = 1;
  s.encounterDeck = Array(10).fill(SG.corsair);
  s.phase = "quest";
  s = act(s, { type: "COMMIT" });
  s = act(s, { type: "COMMIT" });
  assert.equal(sgFleetResources(s), 2);
  assert.match(s.choice!.title, /^The Corsair Fleet · Choose one/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["reveal", "damage"],
  );
  const [h0, h1] = seatView(s, 0).heroes.filter(
    (h) => h.code !== FLAME_WEST_ARAGORN,
  );
  s = choose(s, "damage");
  assert.match(s.choice!.title, /Assign damage · 2 remaining/);
  s = answer(s, h0.id, h1.id);
  assert.equal(get(s, h0.id)!.damage, 1);
  assert.equal(get(s, h1.id)!.damage, 1);
  // The second player reveals an extra encounter card before the staging step.
  assert.match(s.choice!.title, /^The Corsair Fleet · Choose one/);
  const before = s.staging.length;
  s = choose(s, "reveal");
  s = pastReveal(s);
  s = settle(s);
  // One extra card and one card for each player.
  assert.equal(
    s.staging.filter((u) => u.code === SG.corsair).length,
    3,
    JSON.stringify(s.staging.map((u) => u.code)),
  );
  assert.ok(s.staging.length >= before + 3);
  // Great Corsair Ship's threat is X.
  const ship = s.staging.find((u) => u.code === SG.greatShip)!;
  assert.equal(threatOf(s, ship), 2);
  fleet(s).resources = 5;
  assert.equal(threatOf(s, ship), 5);
  assert.equal(siegeGondorPublicState(s)!.fleet, 5);
  // With no encounter card left to reveal, the damage is assigned alone.
  s = base(1);
  s.encounterDeck = [];
  s.encounterDiscard = [];
  s = run(s, "sgFleet", 0, { target: fleet(s).id });
  assert.match(
    s.choice!.title,
    /^The Corsair Fleet · Assign damage · 1 remaining/,
  );
});

test("Great Corsair Ship: no travel before 3 Ship locations are in the victory display; travel brings a Corsair enemy per player, one of them Corsair Captain if able", () => {
  let s = base(2);
  const ship = s.staging.find((u) => u.code === SG.greatShip)!;
  s.phase = "travel";
  victory(s, SG.galley, SG.dromon);
  assert.match(String(canTravel(s, ship)), /at least 3 Ship locations/);
  victory(s, SG.dromon);
  assert.ok(!canTravel(s, ship));
  s.encounterDeck = [SG.corsair, SG.pirate, SG.port, SG.captain];
  s.encounterDiscard = [SG.crew, SG.captain];
  s = act(s, { type: "TRAVEL", id: ship.id });
  assert.match(
    s.choice!.title,
    /^Great Corsair Ship · Search for a Corsair enemy/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [
      `deck-${SG.corsair}`,
      `deck-${SG.pirate}`,
      `deck-${SG.captain}`,
      `discard-${SG.crew}`,
      `discard-${SG.captain}`,
    ].sort(),
  );
  s = choose(s, `deck-${SG.pirate}`);
  // The last player must take Corsair Captain: none was chosen yet.
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [`deck-${SG.captain}`, `discard-${SG.captain}`].sort(),
  );
  s = choose(s, `discard-${SG.captain}`);
  s = settle(s);
  assert.equal(s.activeLocation?.code, SG.greatShip);
  assert.ok(s.staging.some((u) => u.code === SG.pirate));
  assert.ok(s.staging.some((u) => u.code === SG.captain));
  assert.deepEqual(s.encounterDiscard, [SG.crew]);
  assert.equal(s.encounterDeck.length, 3);
  assert.equal(siegeGondorPublicState(s)!.greatShipActive, true);
  // A Captain taken first leaves the last player free.
  s = base(2);
  const ship2 = s.staging.find((u) => u.code === SG.greatShip)!;
  s.phase = "travel";
  victory(s, SG.galley, SG.galley, SG.dromon);
  s.encounterDeck = [SG.corsair, SG.captain];
  s = act(s, { type: "TRAVEL", id: ship2.id });
  s = choose(s, `deck-${SG.captain}`);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [`deck-${SG.corsair}`],
  );
});

test("Attack on Pelargir: Ship locations in the staging area are immune to player card effects, and the stage is defeated (and the game won) only once Great Corsair Ship has left play", () => {
  let s = base(1);
  const galley = stage(s, SG.galley);
  const port = stage(s, SG.port);
  syncAttachmentText(s);
  assert.ok(playerCardImmune(galley));
  assert.ok(playerCardImmune(s.staging.find((u) => u.code === SG.greatShip)!));
  assert.ok(!playerCardImmune(port));
  s.staging = s.staging.filter((u) => u.id !== galley.id);
  s.activeLocation = galley;
  syncAttachmentText(s);
  assert.ok(!playerCardImmune(galley), "the active Ship is not immune");
  // 20 progress, but Great Corsair Ship is in the staging area.
  s.progress = 20;
  SIEGE_GONDOR_HOOKS.advance!(s);
  assert.equal(s.status, "playing");
  // Great Corsair Ship becomes active and is explored: the players win.
  s = base(1);
  const ship = s.staging.find((u) => u.code === SG.greatShip)!;
  s.staging = s.staging.filter((u) => u.id !== ship.id);
  s.activeLocation = ship;
  s.progress = 20;
  SIEGE_GONDOR_HOOKS.advance!(s);
  assert.equal(s.status, "playing", "the active Great Corsair Ship is in play");
  s.phase = "quest";
  progressLocation(s, ship, 5);
  flush(s);
  check(s);
  assert.ok((s.victoryCards ?? []).includes(SG.greatShip));
  assert.equal(s.status, "won");
  assert.match(s.reason, /Attack on Pelargir is defeated/);
  assert.ok(s.log.some((l) => /^Victory! Attack on Pelargir/.test(l.text)));
});

test("Umbar War Galley and Corsair Dromon: -10 engagement cost or Archery 1 for Corsair enemies while active; their travel discards from the top until a Corsair enemy and adds it to the staging area", () => {
  let s = base(1);
  const corsair = stage(s, SG.corsair);
  const captain = stage(s, SG.captain);
  assert.equal(engagementCost(s, corsair), 29);
  assert.equal(engagementCost(s, captain), 49);
  activate(s, SG.galley);
  assert.equal(engagementCost(s, corsair), 19);
  // Corsair Captain: -30 more while the active location is a Ship.
  assert.equal(engagementCost(s, captain), 9);
  // Galley travel: the discard pile is shuffled in, then discard until a Corsair enemy.
  s = base(1);
  const galley = stage(s, SG.galley);
  s.phase = "travel";
  s.encounterDeck = [SG.port, SG.quays];
  s.encounterDiscard = [SG.sails];
  assert.match(
    String(canTravel(s, galley)),
    /no Corsair enemy in the encounter deck or discard pile/,
  );
  s.encounterDiscard = [SG.sails, SG.pirate];
  s = settle(act(s, { type: "TRAVEL", id: galley.id }));
  assert.equal(s.activeLocation?.code, SG.galley);
  assert.ok(s.staging.some((u) => u.code === SG.pirate));
  assert.ok(!s.encounterDeck.includes(SG.pirate));
  assert.equal(
    s.encounterDeck.length + s.encounterDiscard.length,
    3,
    "the other cards are discarded or stay in the deck",
  );
  // Corsair Dromon: Archery 1 for each Corsair enemy in the staging area.
  s = base(1);
  stage(s, SG.corsair);
  stage(s, SG.crew);
  activate(s, SG.dromon);
  SIEGE_GONDOR_HOOKS.combatBegin!(s);
  flush(s);
  assert.match(s.choice!.title, /^Assign Archery damage · 2 remaining/);
  // Not while another location is active.
  s = base(1);
  stage(s, SG.corsair);
  activate(s, SG.port);
  SIEGE_GONDOR_HOOKS.combatBegin!(s);
  flush(s);
  assert.equal(s.choice, null);
});

test("Port of Pelargir: in the staging area no more than 1 damage is healed from each character each round; its shadow keeps a damaged character from readying", () => {
  const s = base(1);
  const hero = s.heroes.find((h) => h.code !== FLAME_WEST_ARAGORN)!;
  hero.damage = 3;
  stage(s, SG.port);
  assert.equal(rhosgobelHeal(s, hero, 2), 1);
  assert.equal(hero.damage, 2);
  assert.equal(rhosgobelHeal(s, hero, 1), 0);
  assert.equal(hero.damage, 2);
  s.round++;
  assert.equal(rhosgobelHeal(s, hero, 3), 1);
  // Without Port of Pelargir in the staging area, healing is not limited.
  s.staging = s.staging.filter((u) => u.code !== SG.port);
  assert.equal(rhosgobelHeal(s, hero, 3), 1);
  assert.equal(hero.damage, 0);
  // The shadow: the damaged defender cannot ready until the end of the round.
  let t = base(1);
  const defender = t.heroes.find((h) => h.code !== FLAME_WEST_ARAGORN)!;
  const enemy = engaged(t, SG.corsair);
  t = defend(t, enemy, defender, [SG.port]);
  t = settle(t);
  const hurt = get(t, defender.id)!;
  assert.ok(hurt.damage > 0);
  assert.ok(SIEGE_GONDOR_HOOKS.cannotReady!(t, hurt));
  const other = t.heroes.find((h) => h.id !== hurt.id)!;
  assert.ok(!SIEGE_GONDOR_HOOKS.cannotReady!(t, other));
  t.round++;
  assert.ok(!SIEGE_GONDOR_HOOKS.cannotReady!(t, hurt));
});

test("Pelargir Quays: a damage token at the end of each round; at 4 it is discarded and 4 damage is assigned among characters in play", () => {
  let s = base(2);
  const quays = stage(s, SG.quays);
  for (let round = 1; round <= 3; round++) {
    s.queue.push(...SIEGE_GONDOR_HOOKS.roundEnd!(s));
    flush(s);
  }
  assert.equal(quays.damage, 3);
  assert.equal(siegeGondorPublicState(s)!.quays, 3);
  s.queue.push(...SIEGE_GONDOR_HOOKS.roundEnd!(s));
  flush(s);
  assert.ok(!s.staging.some((u) => u.id === quays.id));
  assert.ok(s.encounterDiscard.includes(SG.quays));
  // Characters of every player can take the damage.
  const mine = seatView(s, 0).heroes.find(
    (h) => h.code !== FLAME_WEST_ARAGORN,
  )!;
  const theirs = seatView(s, 1).heroes[0];
  for (const id of [mine.id, mine.id, theirs.id, theirs.id]) {
    assert.match(s.choice!.title, /^Pelargir Quays · Assign damage/);
    s = choose(s, id);
  }
  assert.equal(get(s, mine.id)!.damage, 2);
  assert.equal(get(s, theirs.id)!.damage, 2);
  // While it is the active location, the tokens still gather.
  s = base(1);
  const active = activate(s, SG.quays);
  s.queue.push(...SIEGE_GONDOR_HOOKS.roundEnd!(s));
  flush(s);
  assert.equal(active.damage, 1);
});

test("Corsair Captain and Corsair of Umbar: the Captain cannot be optionally engaged and makes an immediate attack as it engages while a Ship is active; Corsair of Umbar gets +2/+2", () => {
  let s = base(1);
  const captain = stage(s, SG.captain);
  assert.ok(SIEGE_GONDOR_HOOKS.cannotOptionallyEngage!(s, captain));
  const corsair = stage(s, SG.corsair);
  assert.equal(stats(s, corsair).attack, 2);
  activate(s, SG.dromon);
  assert.equal(stats(s, corsair).attack, 4);
  assert.equal(stats(s, corsair).defense, 3);
  s.staging = s.staging.filter((u) => u.id !== captain.id);
  enterEnemyEngaged(s, captain, 0);
  flush(s);
  assert.ok(
    s.combat?.immediate || /Immediate attack/i.test(s.choice?.title ?? ""),
    JSON.stringify(s.choice?.title),
  );
  assert.ok(
    s.log.some((l) =>
      /Corsair Captain engages while the active location is a Ship/.test(
        l.text,
      ),
    ),
  );
  // No immediate attack while the active location is not a Ship.
  s = base(1);
  const quiet = make(s, SG.captain);
  activate(s, SG.port);
  enterEnemyEngaged(s, quiet, 0);
  flush(s);
  assert.equal(s.combat, null);
  // The shadow: +1 attack, +2 while a Ship is active.
  s = base(1);
  const [scout] = allies(s, [SNOWBOURN]);
  const enemy = engaged(s, SG.pirate);
  activate(s, SG.galley);
  s = defend(s, enemy, scout, [SG.corsair]);
  assert.ok(
    s.log.some((l) =>
      /gets \+2 attack \(the active location is a Ship\)/.test(l.text),
    ),
  );
});

test("Umbar Pirate Crew and Haradrim Pirate: no attachments, exhaust or damage as they engage, and their shadows", () => {
  let s = base(1);
  const crew = stage(s, SG.crew);
  assert.ok(SIEGE_GONDOR_HOOKS.cannotAttach!(s, crew, BLADE));
  const [scout, guard] = allies(s, [SNOWBOURN, GUARD]);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: crew.id });
  assert.match(s.choice!.title, /^Umbar Pirate Crew · Exhaust a character/);
  s = choose(s, guard.id);
  assert.ok(get(s, guard.id)!.exhausted);
  assert.ok(!get(s, scout.id)!.exhausted);
  // Haradrim Pirate: 1 damage, 2 while a Ship is active.
  s = base(1);
  const [ally] = allies(s, [GUARD, SNOWBOURN]);
  activate(s, SG.dromon);
  const pirate = stage(s, SG.pirate);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: pirate.id });
  assert.match(s.choice!.title, /^Haradrim Pirate · Deal 2 damage/);
  s = choose(s, s.heroes.find((h) => h.code !== FLAME_WEST_ARAGORN)!.id);
  assert.equal(s.heroes.find((h) => h.code !== FLAME_WEST_ARAGORN)!.damage, 2);
  assert.ok(get(s, ally.id));
  // The Crew's shadow returns the attacker to the staging area (a Ship is active).
  s = base(1);
  const [defender] = allies(s, [SNOWBOURN]);
  const attacker = engaged(s, SG.corsair);
  activate(s, SG.galley);
  s = defend(s, attacker, defender, [SG.crew]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === attacker.id));
  // Not while the active location is not a Ship.
  s = base(1);
  const [d2] = allies(s, [SNOWBOURN]);
  const a2 = engaged(s, SG.corsair);
  activate(s, SG.port);
  s = defend(s, a2, d2, [SG.crew]);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.id === a2.id));
  // The Pirate's shadow: -1 defense for each damage on the defending character.
  s = base(1);
  const hero = s.heroes.find((h) => h.code !== FLAME_WEST_ARAGORN)!;
  hero.damage = 1;
  const defense = stats(s, hero).defense;
  const a3 = engaged(s, SG.corsair);
  s = defend(s, a3, hero, [SG.pirate]);
  s = settle(s);
  assert.ok(s.log.some((l) => /-1 defense for each damage/.test(l.text)));
  assert.equal(
    get(s, hero.id)!.damage,
    1 + Math.max(0, 2 - Math.max(0, defense - 1)),
  );
});

test("Fell Folk of Umbar (Peril): return the engaged Corsair enemies, or discard until a Corsair enemy and engage it", () => {
  let s = base(1);
  const corsair = engaged(s, SG.corsair);
  s.encounterDeck = [SG.port, SG.crew, SG.quays];
  s = reveal(s, SG.fellFolk);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Fell Folk of Umbar · Choose one/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["return", "discard"],
  );
  s = choose(s, "return");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === corsair.id));
  assert.ok(!s.engaged.some((u) => u.id === corsair.id));
  // With no Corsair engaged, the discard resolves alone.
  s = base(1);
  s.encounterDeck = [SG.port, SG.crew, SG.quays];
  s = reveal(s, SG.fellFolk);
  s = pastReveal(s);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === SG.crew));
  assert.ok(s.encounterDiscard.includes(SG.port));
  assert.deepEqual(s.encounterDeck, [SG.quays]);
  assert.ok(s.encounterDiscard.includes(SG.fellFolk));
});

test("Black Sails: Doomed 1, +1 threat for each Ship location in the staging area until the end of the phase, and a Ship location if no non-unique Ship is there", () => {
  let s = base(2);
  s.phase = "quest";
  const galley = stage(s, SG.galley);
  const ship = s.staging.find((u) => u.code === SG.greatShip)!;
  fleet(s).resources = 1;
  const threats = playerOrder(s).map((p) => seatView(s, p).threat);
  s.encounterDeck = [SG.port, SG.port];
  s = reveal(s, SG.sails);
  s = pastReveal(s);
  s = settle(s);
  assert.equal(threatOf(s, galley), 3 + 1);
  assert.equal(threatOf(s, ship), 1 + 1);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).threat, threats[p] + 1, "Doomed 1");
  // A second copy stacks; a Ship that leaves the staging area loses it.
  s = reveal(s, SG.sails);
  s = pastReveal(s);
  s = settle(s);
  assert.equal(threatOf(s, galley), 5);
  // Until the end of the phase.
  s.phase = "travel";
  assert.equal(threatOf(s, galley), 3);
  // Only Great Corsair Ship (unique): search the deck and discard pile.
  s = base(1);
  s.phase = "quest";
  s.encounterDeck = [SG.port, SG.galley];
  s.encounterDiscard = [SG.dromon];
  s = reveal(s, SG.sails);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Black Sails · Search for a Ship location/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [`deck-${SG.galley}`, `discard-${SG.dromon}`].sort(),
  );
  s = choose(s, `discard-${SG.dromon}`);
  s = settle(s);
  const dromon = s.staging.find((u) => u.code === SG.dromon)!;
  assert.ok(dromon);
  assert.equal(threatOf(s, dromon), 2, "the new Ship does not get +1");
  assert.ok(!s.encounterDiscard.includes(SG.dromon));
});

test("Raiding the Coasts: each player adds 3 threat to the staging area until the end of the phase or discards his highest cost attachment; the shadow discards an attachment if a character is destroyed", () => {
  let s = base(2);
  s.phase = "quest";
  const hero0 = seatView(s, 0).heroes.find(
    (h) => h.code !== FLAME_WEST_ARAGORN,
  )!;
  hero0.attachments.push(
    { id: "blade-1", code: BLADE, exhausted: false, owner: 0 },
    { id: "courage-1", code: COURAGE, exhausted: false, owner: 0 },
  );
  const before = stagingThreat(s);
  s = reveal(s, SG.raiding);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Raiding the Coasts · Choose one/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["threat", "attachment"],
  );
  s = choose(s, "attachment");
  // The second player controls no attachment: the threat resolves alone.
  s = settle(s);
  assert.ok(Number(card(COURAGE).cost) > Number(card(BLADE).cost));
  assert.deepEqual(
    get(s, hero0.id)!.attachments.map((a) => a.code),
    [BLADE],
    "the highest cost attachment is discarded",
  );
  assert.equal(stagingThreat(s), before + 3);
  assert.equal(siegeGondorPublicState(s)!.raiding, 3);
  s.phase = "travel";
  assert.equal(stagingThreat(s), before);
  // The shadow: +1 attack, and a destroyed character costs an attachment.
  s = base(1);
  const [guard] = allies(s, [GUARD]);
  const hero = s.heroes.find((h) => h.code !== FLAME_WEST_ARAGORN)!;
  hero.attachments.push({
    id: "courage-2",
    code: COURAGE,
    exhausted: false,
    owner: 0,
  });
  const enemy = engaged(s, SG.crew);
  s = defend(s, enemy, guard, [SG.raiding]);
  s = settle(s);
  assert.ok(!get(s, guard.id));
  assert.equal(get(s, hero.id)!.attachments.length, 0);
});

test("Driven to the Brink (Peril): end the quest phase without resolving the quest, or assign X damage among questing characters; its shadow exhausts a character", () => {
  let s = base(1);
  fleet(s).resources = 2;
  const hero = s.heroes.find((h) => h.code !== FLAME_WEST_ARAGORN)!;
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: hero.id });
  s = act(s, { type: "COMMIT" });
  s = until(s, /^The Corsair Fleet · Choose one/);
  s.encounterDeck = [SG.brink, SG.corsair, SG.corsair];
  s = choose(s, "reveal");
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Driven to the Brink · Choose one/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["end", "damage"],
  );
  const progress = s.progress;
  s = choose(s, "end");
  s = settle(s);
  assert.equal(s.progress, progress, "the quest is not resolved");
  assert.ok(
    ["travel", "encounter", "defense", "attack", "refresh"].includes(s.phase),
  );
  assert.ok(
    !s.staging.some((u) => u.code === SG.corsair),
    "the staging step's reveals are skipped",
  );
  // The damage among questing characters.
  s = base(1);
  fleet(s).resources = 2;
  const quester = s.heroes.find((h) => h.code !== FLAME_WEST_ARAGORN)!;
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: quester.id });
  s = act(s, { type: "COMMIT" });
  s = until(s, /^The Corsair Fleet · Choose one/);
  s.encounterDeck = [SG.brink, SG.corsair, SG.corsair];
  s = choose(s, "reveal");
  s = pastReveal(s);
  s = choose(s, "damage");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [quester.id],
    "only questing characters",
  );
  s = answer(s, quester.id);
  assert.match(s.choice!.title, /Assign damage · 2 remaining/);
  // The shadow: exhaust a character you control.
  let t = base(1);
  const [scout, guard] = allies(t, [SNOWBOURN, GUARD]);
  const enemy = engaged(t, SG.corsair);
  t = defend(t, enemy, scout, [SG.brink]);
  assert.match(t.choice!.title, /^Driven to the Brink · Exhaust a character/);
  t = choose(t, guard.id);
  assert.ok(get(t, guard.id)!.exhausted);
});
