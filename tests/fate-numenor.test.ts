import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, publicState, validateSave } from "../src/game/engine.ts";
import { card, imageUrl, SCRIPTED } from "../src/game/cards.ts";
import {
  draw,
  fx,
  locationQuest,
  make,
  stagingThreat,
  stats,
} from "../src/game/core.ts";
import {
  advanceQuest,
  check,
  damage,
  destroy,
  discardCharacter,
  discardLocation,
  engage,
  placeEncounter,
  progress,
  progressLocation,
  readyCharacter,
} from "../src/game/board.ts";
import { flush, handle } from "../src/game/effects.ts";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import { addCurrentQuestProgress } from "../src/game/side-quests.ts";
import { automatedScenarioId } from "../src/game/support.ts";
import {
  FATE as F,
  FATE_ENCOUNTERS,
  FATE_QUESTS,
  FATE_RECIPES,
  validateFateNumenor,
} from "../src/game/fate-numenor-support.ts";
import {
  fateActiveLocation,
  fateAddIsland,
  fateAbility,
  fateCannotAttach,
  fateCannotSearch,
  fateEffect,
  fateEncounter,
  fateLoseRanged,
  fatePhaseEnd,
  fatePublicState,
  fateShadow,
  fateShuffleIslands,
} from "../src/game/fate-numenor.ts";
import { base, choose, reload, start } from "./fate-numenor-fixtures.ts";
import type { GameState } from "../src/game/types.ts";
import { readDamageContext } from "../src/game/damage-context.ts";

function settle(s: GameState) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 100, "Fate choices terminate");
    const id =
      s.choice.options.find((o) => ["skip", "close", "return"].includes(o.id))
        ?.id ?? s.choice.options[0].id;
    s = choose(reload(s), id);
  }
  return s;
}
function activeLocation(s: GameState, code: string) {
  const u = make(s, code);
  s.activeLocation = u;
  return u;
}
function enemy(s: GameState, code = F.servant, p = 0) {
  const u = make(s, code);
  u.owner = p;
  forOwner(s, p, () => s.engaged.push(u));
  return u;
}
function island(s: GameState, code = F.coast) {
  return fateAddIsland(s, code)!;
}
function turnOver(s: GameState, code: string) {
  const u = island(s, code);
  u.progress = 4;
  s.staging = s.staging.filter((l) => l.id !== u.id);
  s.activeLocation = u;
  fateActiveLocation(s, u);
  flush(s);
  return u;
}

test("Fate imports original/easy recipes, two quests, 17 official encounter definitions and generic hidden face", () => {
  assert.equal(FATE_ENCOUNTERS.length, 18);
  assert.equal(FATE_QUESTS.length, 2);
  for (const c of [...FATE_ENCOUNTERS, ...FATE_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code));
    assert.match(imageUrl(c), /^\/cards\//);
  }
  for (const r of FATE_RECIPES)
    assert.equal(automatedScenarioId(r), "the-fate-of-numenor");
  assert.equal(card(F.lost).threat, 2);
  assert.equal(card(F.lost).printed_stats?.quest, "-");
});
test("Fate original and easy setup preserves all Uncharted cards for 1–4 players", () => {
  for (const easy of [false, true])
    for (const n of [1, 2, 3, 4]) {
      const s = reload(start(n, easy)),
        q = s.fateNumenor!;
      assert.equal(s.staging.length, n > 2 ? 3 : 2);
      assert.ok(s.staging.every((u) => u.code === F.lost));
      assert.equal(
        q.unchartedDeck.length + Object.keys(q.hiddenBacks).length,
        10,
      );
      assert.equal(s.encounterDeck.length, easy ? 17 : 24);
      assert.equal(q.setAside[0].code, F.shrine);
      assert.equal(
        ownerOf(
          s,
          allCharacters(s).find((u) => u.code === F.calphon)!,
        ),
        firstPlayer(s),
      );
      assert.equal(playerOrder(s).length, n);
    }
});
test("Lost Island has no quest points, keeps excess progress and forbids player attachments", () => {
  const s = base(),
    u = island(s);
  assert.equal(locationQuest(s, u), Infinity);
  progressLocation(s, u, 99);
  assert.equal(u.progress, 99);
  assert.ok(s.staging.includes(u));
  assert.equal(s.progress, 0);
  assert.ok(fateCannotAttach(s, u));
});
test("Explore the Island gains only printed location quest points; quest and player progress are blocked", () => {
  const s = base();
  progress(s, 10);
  addCurrentQuestProgress(s, 10);
  assert.equal(s.progress, 0);
  const u = activeLocation(s, F.plateau);
  progressLocation(s, u, 3);
  assert.equal(s.progress, 3);
});
test("Travelling to Lost Island removes all progress, reveals its real side and adds another island", () => {
  let s = base();
  const u = island(s, F.temple);
  u.progress = 7;
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: u.id });
  assert.equal(s.activeLocation?.code, F.temple);
  assert.equal(s.activeLocation?.progress, 0);
  assert.equal(s.staging.filter((u) => u.code === F.lost).length, 1);
  assert.ok(!s.fateNumenor!.hiddenBacks[u.id]);
});
test("Peeking costs 4 progress and never triggers the location's flipped effect", () => {
  let s = base();
  const u = island(s, F.shrine);
  u.progress = 4;
  assert.ok(fateAbility(s, u));
  flush(s);
  s = reload(s);
  assert.equal(s.staging[0].code, F.lost);
  assert.equal(s.staging[0].progress, 0);
  assert.equal(s.choice?.options[0].code, F.shrine);
  assert.equal(allEngaged(s).length, 0);
  s = choose(s, "close");
  assert.equal(s.fateNumenor!.lookedBy[u.id][0], 0);
});
test("Hidden island codes stay private until the active player has looked; shuffling forgets all associations", () => {
  const s = base(2),
    u = island(s, F.shrine),
    before = u.id;
  assert.ok(!JSON.stringify(publicState(s)).includes(F.shrine));
  fateEffect(s, fx("fateLook", { target: u.id, player: 0 }));
  s.choice = null;
  assert.equal(fatePublicState(s)!.islands[0].looked, F.shrine);
  selectSeat(s, 1);
  assert.equal(fatePublicState(s)!.islands[0].looked, undefined);
  fateShuffleIslands(s);
  assert.notEqual(s.staging[0].id, before);
  assert.deepEqual(s.fateNumenor!.lookedBy, {});
  assert.equal(s.staging[0].progress, 0);
});
test("Explored double-sided locations recycle in stage one and enter victory in stage two", () => {
  for (const stage of [1, 2]) {
    const s = base(1, stage),
      n = s.fateNumenor!.unchartedDeck.length,
      u = activeLocation(s, F.temple);
    progressLocation(s, u, 3);
    assert.equal(s.encounterDiscard.includes(F.temple), false);
    assert.equal(
      s.fateNumenor!.unchartedDeck.length,
      n + (stage === 1 ? 1 : 0),
    );
    assert.equal(s.victoryCards?.includes(F.temple) ?? false, stage === 2);
  }
});
test("Discarding a Lost Island returns its actual hidden side to Uncharted deck", () => {
  const s = base(),
    u = island(s, F.coast),
    n = s.fateNumenor!.unchartedDeck.length;
  discardLocation(s, u);
  assert.equal(s.encounterDiscard.includes(F.lost), false);
  assert.equal(s.fateNumenor!.unchartedDeck.length, n + 1);
  assert.ok(!s.fateNumenor!.hiddenBacks[u.id]);
});
test("Stage two adds two islands and the hidden Shrine; only exploring Shrine wins", () => {
  let s = base();
  const u = island(s, F.coast);
  u.progress = 4;
  s.progress = 20;
  advanceQuest(s);
  flush(s);
  s = reload(s);
  assert.equal(s.stage, 2);
  assert.equal(s.staging.length, 4);
  assert.equal(
    Object.values(s.fateNumenor!.hiddenBacks).filter((c) => c === F.shrine)
      .length,
    1,
  );
  assert.equal(s.progress, 0);
  s.activeLocation = make(s, F.shrine);
  progressLocation(s, s.activeLocation, 8);
  assert.equal(s.status, "won");
});
test("Calphon follows first player and losing him ends the game", () => {
  const s = base(2);
  s.table!.first = 1;
  check(s);
  const guide = allCharacters(s).find((u) => u.code === F.calphon)!;
  assert.equal(ownerOf(s, guide), 1);
  discardCharacter(s, guide);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Calphon/);
});
test("Calphon swaps the bottom card with a chosen physical hand card and preserves ownership", () => {
  let s = base();
  s.deck = ["01050", "01073"];
  const h = make(s, "01051");
  s.hand = [h];
  const guide = s.allies[0];
  assert.ok(fateAbility(s, guide));
  flush(s);
  s = choose(reload(s), h.id);
  assert.deepEqual(s.deck, ["01050", "01051"]);
  assert.equal(s.hand[0].code, "01073");
  assert.ok(s.allies[0].exhausted);
});
test("Lush Jungle returns to staging unless all heroes exhaust and removes ranged there", () => {
  let s = base(2);
  turnOver(s, F.jungle);
  s = choose(reload(s), "return");
  assert.equal(s.activeLocation, null);
  assert.equal(
    stats(s, s.heroes[0]).attack,
    (card(s.heroes[0].code).attack ?? 0) - 1,
  );
  assert.ok(fateLoseRanged(s, s.heroes[0]));
  s = base(2);
  turnOver(s, F.jungle);
  s = choose(reload(s), "exhaust");
  assert.ok(
    playerOrder(s).every((p) =>
      seatView(s, p).heroes.every((h) => h.exhausted),
    ),
  );
});
test("Forbidden Coast gives separate optional draws and mandatory bottom choices per player", () => {
  let s = base(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.deck = ["01050"];
      s.hand = [make(s, "01051")];
    });
  turnOver(s, F.coast);
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.deepEqual(seatView(s, 0).deck, ["01050", "01051"]);
  assert.deepEqual(seatView(s, 1).deck, ["01050", "01051"]);
});
test("Flooded Ruins contributes active threat and Cursed Temple stops low willpower refresh readying", () => {
  const s = base();
  activeLocation(s, F.flooded);
  assert.equal(stagingThreat(s), 3);
  s.activeLocation = make(s, F.temple);
  s.phase = "refresh";
  const guide = s.allies[0];
  guide.exhausted = true;
  readyCharacter(s, guide);
  assert.ok(guide.exhausted);
  const hero = s.heroes.find((h) => stats(s, h).will >= 2)!;
  hero.exhausted = true;
  readyCharacter(s, hero);
  assert.equal(hero.exhausted, false);
});
test("Drowned Graves discards players plus two cards and each player adds a different discarded copy", () => {
  let s = base(2);
  s.encounterDeck = [F.servant, F.cadaver, F.plateau, F.fog];
  turnOver(s, F.graves);
  s = settle(s);
  assert.equal(s.encounterDeck.length, 0);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    2,
  );
  assert.equal(
    s.encounterDiscard.filter((c) => [F.servant, F.cadaver].includes(c)).length,
    0,
  );
});
test("Shrine exhausts cheap allies, engages an Undead for every player and forbids draws/searches", () => {
  let s = base(2, 2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.allies.push(make(s, "01016"));
    });
  s.encounterDeck = [F.servant, F.cadaver];
  turnOver(s, F.shrine);
  s = settle(s);
  assert.equal(allEngaged(s).length, 2);
  assert.ok(
    allCharacters(s)
      .filter((u) => u.code === "01016")
      .every((u) => u.exhausted),
  );
  const n = s.hand.length;
  draw(s, 3);
  assert.equal(s.hand.length, n);
  assert.ok(fateCannotSearch(s));
  handle(s, fx("sideQuestGatherSearch"));
  assert.equal(s.choice, null);
});
test("Servant rotates a low-cost top card and gains attack through the round", () => {
  let s = base();
  s.deck = ["01050", "01073"];
  const u = make(s, F.servant);
  s.staging.push(u);
  engage(s, u);
  s = settle(s);
  assert.deepEqual(s.deck, ["01073", "01050"]);
  assert.equal(allEngaged(s)[0].roundAttack, 2);
});
test("Soulless Cadaver lets owner order low-cost hand cards onto bottom and prohibits only their search", () => {
  let s = base(2);
  forOwner(s, 1, () => {
    s.hand = [make(s, "01050"), make(s, "01073"), make(s, "01051")];
    s.deck = ["01052"];
  });
  const u = make(s, F.cadaver);
  s.staging.push(u);
  forOwner(s, 1, () => engage(s, u));
  s = settle(s);
  assert.ok(fateCannotSearch(s, 1));
  assert.equal(fateCannotSearch(s, 0), false);
  assert.deepEqual(
    seatView(s, 1).hand.map((h) => h.code),
    ["01073"],
  );
  assert.deepEqual(seatView(s, 1).deck, ["01052", "01050", "01051"]);
});
test("Throngs return to encounter top only after low-cost bottom card is discarded", () => {
  let s = base();
  s.deck = ["01073", "01050"];
  const u = enemy(s, F.throngs);
  destroy(s, u);
  s = settle(s);
  assert.equal(s.encounterDeck[0], F.throngs);
  assert.deepEqual(s.deck, ["01073"]);
  assert.deepEqual(s.discard, ["01050"]);
});
test("Drowned Dead combat destruction places borrowed ally on its physical owner's bottom", () => {
  const s = base(2),
    u = enemy(s, F.drowned),
    ally = make(s, "01016");
  ally.owner = 1;
  s.allies.push(ally);
  damage(s, ally.id, 9, { enemyId: u.id, combatDamage: true });
  flush(s);
  assert.equal(seatView(s, 1).deck.at(-1), "01016");
  assert.equal(seatView(s, 1).discard.includes("01016"), false);
});
test("Curse damages only cheap non-objective allies and places destroyed copies on owner bottom", () => {
  let s = base();
  const cheap = make(s, "01016");
  s.allies.push(cheap);
  const guide = s.allies[0];
  const pricey = make(s, "01073");
  s.allies.push(pricey);
  fateEncounter(s, F.curse);
  s = settle(s);
  assert.equal(s.deck.at(-1), cheap.code);
  assert.equal(s.discard.includes(cheap.code), false);
  assert.equal(s.allies.find((u) => u.id === guide.id)?.damage, 0);
  assert.equal(s.allies.find((u) => u.id === pricey.id)?.damage, 0);
});
test("Lingering Malevolence discards each higher-cost hand card using bottom printed cost", () => {
  let s = base();
  s.deck = ["01073", "01050"];
  s.hand = [make(s, "01051"), make(s, "01073")];
  fateEncounter(s, F.malevolence);
  s = settle(s);
  assert.deepEqual(
    s.hand.map((h) => h.code),
    ["01051"],
  );
  assert.deepEqual(s.discard, ["01050", "01073"]);
});
test("Ruins resets progress, adds island, shuffles identities, and cancelled effect leaves islands unchanged", () => {
  let s = base();
  const u = island(s);
  u.progress = 4;
  const id = u.id;
  placeEncounter(s, F.ruins, true);
  assert.equal(s.staging.length, 1);
  assert.equal(s.staging[0].progress, 4);
  fateEncounter(s, F.ruins);
  s = settle(s);
  assert.equal(s.staging.length, 2);
  assert.ok(s.staging.every((u) => u.progress === 0 && u.id !== id));
});
test("Mysterious Fog supports group exhaustion or stacking phase threat which expires", () => {
  let s = base(2);
  island(s);
  s.phase = "staging";
  fateEncounter(s, F.fog);
  flush(s);
  s = choose(reload(s), "threat");
  assert.equal(stagingThreat(s), 3);
  fatePhaseEnd(s);
  assert.equal(stagingThreat(s), 2);
  fateEncounter(s, F.fog);
  s = settle(s);
  assert.ok(allCharacters(s).filter((u) => u.exhausted).length >= 2);
});
test("Aimless Wandering removes total willpower then optionally pays Doomed to inspect only", () => {
  let s = base();
  island(s, F.shrine);
  s.phase = "staging";
  s.heroes[0].committed = true;
  fateEncounter(s, F.wandering);
  flush(s);
  s = choose(reload(s), s.heroes[0].id);
  assert.equal(s.heroes[0].committed, false);
  s = choose(reload(s), "doomed");
  s = choose(reload(s), s.staging[0].id);
  assert.equal(s.threat, 22);
  assert.equal(s.choice?.options[0].code, F.shrine);
});
test("All bottom-deck shadows use defending player and preserve suspended choices", () => {
  for (const [code, mode] of [
    [F.plateau, "attack"],
    [F.malevolence, "attack"],
    [F.fog, "exhaust"],
    [F.curse, "extra"],
  ]) {
    let s = base();
    s.deck = ["01073", "01050"];
    const u = enemy(s);
    s.combat = {
      enemyId: u.id,
      defenderId: null,
      attackBonus: 0,
      attackPlayer: 0,
    } as NonNullable<GameState["combat"]>;
    assert.ok(fateShadow(s, code));
    s = settle(s);
    assert.deepEqual(s.deck, ["01073"]);
    if (mode === "attack") assert.equal(s.combat!.attackBonus, 2);
    if (mode === "extra") assert.equal(s.combat!.extraAttacks, 1);
  }
});
test("Fate restoration rejects missing/extra hidden backs and invalid Uncharted codes", () => {
  const s = base();
  island(s);
  syncSeat(s);
  assert.ok(validateSave(s));
  const valid = (v: unknown) => !!v;
  assert.ok(validateFateNumenor(s, valid));
  const corrupt = JSON.parse(JSON.stringify(s));
  corrupt.fateNumenor.hiddenBacks.fake = F.shrine;
  assert.equal(validateSave(corrupt), false);
  const second = JSON.parse(JSON.stringify(s));
  second.fateNumenor.unchartedDeck[0] = "01050";
  assert.equal(validateSave(second), false);
});
test("Player effects that make an island active turn it over without paying travel costs", () => {
  const s = base(),
    u = island(s, F.temple);
  u.progress = 7;
  s.staging = [];
  s.activeLocation = u;
  check(s);
  flush(s);
  assert.equal(s.activeLocation.code, F.temple);
  assert.equal(s.activeLocation.progress, 0);
  assert.equal(s.staging.length, 1);
  assert.ok(!s.fateNumenor!.hiddenBacks[u.id]);
});
test("Sword-thain heroes are unaffected by Curse/Shrine ally instructions and retain hero death", () => {
  let s = base();
  const hero = make(s, "01060");
  hero.attachments = [
    { id: `c${s.nextId++}`, code: "10149", exhausted: false },
  ];
  s.heroes.push(hero);
  fateEncounter(s, F.curse);
  s = settle(s);
  assert.equal(s.heroes.find((h) => h.id === hero.id)?.damage, 0);
  s.activeLocation = make(s, F.shrine);
  fateEffect(s, fx("fateFlipped", { target: s.activeLocation.id }));
  assert.equal(s.heroes.find((h) => h.id === hero.id)?.exhausted, false);
  s.queue = [];
  const attacker = enemy(s, F.drowned);
  damage(s, hero.id, 9, { enemyId: attacker.id, combatDamage: true });
  assert.equal(s.deck.includes(hero.code), false);
  assert.ok(s.discard.includes(hero.code));
});
test("Drowned Graves never substitutes an older discard copy for its exhausted effect pool", () => {
  let s = base(3);
  s.encounterDiscard = [F.servant];
  s.encounterDeck = [F.servant, F.plateau, F.fog, F.plateau, F.fog];
  turnOver(s, F.graves);
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === F.servant).length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === F.servant).length, 1);
  assert.equal(s.fateNumenor!.gravesPool, undefined);
});
test("Throngs destroyed in staging has no engaged player and does not discard a deck card", () => {
  let s = base();
  s.deck = ["01073", "01050"];
  const throngs = make(s, F.throngs);
  s.staging.push(throngs);
  destroy(s, throngs);
  s = settle(s);
  assert.deepEqual(s.deck, ["01073", "01050"]);
  assert.deepEqual(s.discard, []);
  assert.ok(s.encounterDiscard.includes(F.throngs));
  assert.notEqual(s.encounterDeck[0], F.throngs);
});
test("Throngs destroyed while engaged discards that player's bottom card, not the active player's", () => {
  let s = base(2);
  s.deck = ["01073"];
  forOwner(s, 1, () => {
    s.deck = ["01073", "01050"];
  });
  const throngs = enemy(s, F.throngs, 1);
  destroy(s, throngs);
  s = settle(s);
  assert.deepEqual(seatView(s, 0).deck, ["01073"]);
  assert.deepEqual(seatView(s, 1).deck, ["01073"]);
  assert.deepEqual(seatView(s, 1).discard, ["01050"]);
  assert.equal(s.encounterDeck[0], F.throngs);
});
test("Queued Curse damage retains its cause when its recipient changes to an expensive ally", () => {
  let s = base();
  const cheap = make(s, "01016"),
    expensive = make(s, "01073");
  expensive.damage = (card(expensive.code).health ?? 0) - 1;
  s.allies.push(cheap, expensive);
  fateEncounter(s, F.curse);
  const curse = s.queue.shift()!;
  handle(s, curse);
  const damageEffect = s.queue.find(
    (e) => e.kind === "damage" && e.target === cheap.id,
  )!;
  assert.equal(readDamageContext(damageEffect).fateBottomOnDestroy, true);
  // Replacements change the recipient, while the causing effect stays intact.
  damageEffect.target = expensive.id;
  s = settle(reload(s));
  assert.equal(s.deck.at(-1), expensive.code);
  assert.equal(s.discard.includes(expensive.code), false);
  assert.equal(s.allies.find((a) => a.id === cheap.id)?.damage, 0);
});
test("Curse cause survives a queued replacement and Dori's owner-scoped choice across saves", () => {
  let s = base(2),
    cheap = make(s, "01016"),
    dori = make(s, "131009");
  dori.damage = (card(dori.code).health ?? 0) - 1;
  s.allies.push(cheap);
  forOwner(s, 1, () => {
    dori.owner = 1;
    s.allies.push(dori);
  });
  fateEncounter(s, F.curse);
  handle(s, s.queue.shift()!);
  const assignment = s.queue.find(
    (e) => e.kind === "damage" && e.target === cheap.id,
  )!;
  assignment.target = s.heroes[0].id;
  flush(s);
  assert.match(s.choice!.title, /Dori/);
  s = choose(reload(s), dori.id);
  s = settle(s);
  assert.equal(seatView(s, 1).deck.at(-1), dori.code);
  assert.equal(seatView(s, 1).discard.includes(dori.code), false);
  assert.equal(seatView(s, 0).heroes[0].damage, 0);
});
test("An unrelated ally destruction during Curse's pending effects does not inherit its replacement", () => {
  const s = base(),
    cheap = make(s, "01016");
  s.allies.push(cheap);
  s.fateNumenor!.curseDamageIds = [cheap.id];
  damage(s, cheap.id, 1);
  assert.ok(s.discard.includes(cheap.code));
  assert.notEqual(s.deck.at(-1), cheap.code);
});
test("Curse's source survives an Honour Guard response save and applies only to uncancelled damage", () => {
  for (const prevent of [false, true]) {
    let s = base(),
      cheap = make(s, "01016"),
      guard = make(s, "10004");
    s.allies.push(cheap, guard);
    fateEncounter(s, F.curse);
    flush(s);
    assert.match(s.choice!.title, /Prevent damage/);
    const option = prevent ? `${guard.id}-normal` : "skip";
    s = choose(reload(s), option);
    s = settle(s);
    assert.equal(
      s.allies.some((u) => u.id === cheap.id),
      prevent,
    );
    assert.equal(s.deck.at(-1) === cheap.code, !prevent);
    assert.equal(s.discard.includes(cheap.code), false);
    assert.equal(s.allies.find((u) => u.id === guard.id)?.exhausted, prevent);
  }
});
test("Eliminating Calphon's controller records the loss before the resulting state is saved", () => {
  const s = base(2);
  s.threat = 50;
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Calphon/);
  syncSeat(s);
  assert.ok(validateSave(s));
});
