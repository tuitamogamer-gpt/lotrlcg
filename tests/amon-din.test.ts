import assert from "node:assert/strict";
import test from "node:test";
import { applyAction as act } from "./pass-resource-window.ts";
import { createGame, restoreSave, validateSave } from "../src/game/engine.ts";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import {
  advanceQuest,
  check,
  damage,
  discardCharacter,
  placeEncounter,
  progress,
  progressLocation,
  revealed,
  shadow,
} from "../src/game/board.ts";
import { fx, get, make, stats } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import {
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import {
  AMON_DIN as A,
  AMON_DIN_ENCOUNTERS,
  AMON_DIN_QUESTS,
  AMON_DIN_RECIPES,
} from "../src/game/amon-din-support.ts";
import type { GameState, Unit } from "../src/game/types.ts";
const d = STARTERS.find((d) => d.id === "leadership")!;
function raw(players = 1, easy = false, seed = 724) {
  return createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "encounter-at-amon-din",
    easy,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function settleSetup(s: GameState) {
  for (
    let n = 0;
    n < 60 && s.phase === "setup" && s.status === "playing";
    n++
  ) {
    if (s.choice)
      s = choose(
        s,
        s.choice.options.find((o) => o.id === "skip")?.id ??
          s.choice.options[0].id,
      );
    else s = act(s, { type: "KEEP" });
  }
  return s;
}
function base(players = 1): GameState {
  let s = settleSetup(raw(players));
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    encounterDeck: Array(40).fill("01099"),
    encounterDiscard: [],
    stage: 1,
    progress: 0,
    victory: 0,
    victoryCards: [],
    amonDin: { questVillagers: 5, ghulatSetAside: true },
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.hand = [];
      s.discard = [];
      s.allies = [];
      s.engaged = [];
      s.used = [];
      s.deck = Array(30).fill("01043");
      s.committedIds = [];
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          resources: 8,
          exhausted: false,
          committed: false,
          attachments: [],
        });
      // Dedicated cancellation cases opt Eleanor in; ordinary fixtures pass every cancellation window.
      for (const h of s.heroes) if (h.code === "01008") h.exhausted = true;
    });
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  placeEncounter(s, A.rescued);
  placeEncounter(s, A.dead);
  forOwner(s, 0, () => s.allies.push(make(s, A.alcaron)));
  return s;
}
const obj = (s: GameState, code: string) =>
  s.staging.find((u) => u.code === code)!;
const rescued = (s: GameState) => obj(s, A.rescued);
const dead = (s: GameState) => obj(s, A.dead);
const alcaron = (s: GameState) =>
  allCharacters(s).find((u) => u.code === A.alcaron)!;
function location(s: GameState, code = A.burning, active = false) {
  placeEncounter(s, code);
  const u = s.staging.findLast((u) => u.code === code)!;
  if (active) {
    s.staging = s.staging.filter((l) => l.id !== u.id);
    s.activeLocation = u;
  }
  return u;
}
function enemy(s: GameState, code: string, player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function reveal(s: GameState, code: string) {
  revealed(s, code);
  flush(s);
  return s;
}
function reload(s: GameState) {
  syncSeat(s);
  const json = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(json), "Pending Amon Dîn state must validate");
  const restored = restoreSave(json);
  assert.ok(restored);
  return restored;
}
function stage2(s: GameState) {
  s.stage = 2;
  s.amonDin = { questVillagers: 0, ghulatSetAside: false };
}
function combat(s: GameState, u: Unit, defender: Unit | null = null) {
  s.combat = {
    enemyId: u.id,
    defenderId: defender?.id ?? null,
    attackBonus: 0,
  };
}

test("Amon Dîn registers the printed original cards and exact original/easy recipes", () => {
  assert.equal(AMON_DIN_ENCOUNTERS.length, 13);
  assert.equal(AMON_DIN_QUESTS.length, 2);
  for (const c of [...AMON_DIN_ENCOUNTERS, ...AMON_DIN_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.equal(card(c.code).name, c.name);
  }
  assert.match(
    AMON_DIN_QUESTS.find((c) => c.code === A.savagery)!.back_text!,
    /Villagers 5/,
  );
  for (const recipe of AMON_DIN_RECIPES) {
    const total = Object.values(recipe.sections.sharedEncounterDeck).reduce(
      (n, q) => n + q,
      0,
    );
    assert.equal(total, recipe.mode === "easy" ? 26 : 33);
    const s = raw(1, recipe.mode === "easy", 2);
    assert.equal(s.activeLocation?.code, A.burning);
    assert.equal(s.activeLocation?.resources, 4);
    assert.equal(s.amonDin?.questVillagers, 5);
    assert.equal(
      s.staging.filter((u) => [A.rescued, A.dead].includes(u.code)).length,
      2,
    );
    assert.ok(!s.encounterDeck.includes(A.ghulat));
    assert.ok(alcaron(s));
    if (recipe.mode === "easy") {
      assert.ok(!s.encounterDeck.includes(A.eagle));
      assert.ok(!s.encounterDeck.includes(A.homestead));
      assert.ok(
        !s.encounterDeck.includes("octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9064"),
      );
    }
  }
});
test("Villagers enter once per location instance and remain when it changes zones in play", () => {
  const s = base();
  const l = location(s, A.hamlet);
  assert.equal(l.resources, 3);
  s.staging = s.staging.filter((u) => u.id !== l.id);
  s.activeLocation = l;
  assert.equal(l.resources, 3);
  placeEncounter(s, A.secluded, true);
  assert.equal(s.staging.find((u) => u.code === A.secluded)?.resources, 2);
});
test("Quest progress buffers the active location before rescuing stage-one villagers", () => {
  const s = base();
  const l = location(s, A.burning, true);
  progress(s, 8);
  flush(s);
  assert.equal(s.activeLocation, null);
  assert.equal(s.amonDin?.questVillagers, 2);
  assert.equal(rescued(s).resources, 7);
  assert.equal(dead(s).damage, 0);
  assert.ok(s.victoryCards?.includes(l.code));
  assert.equal(s.progress, 0);
});
test("Stage one rescues at most five villagers and discards excess progress on advance", () => {
  const s = base();
  progress(s, 20);
  flush(s);
  assert.equal(s.stage, 2);
  assert.equal(s.progress, 0);
  assert.equal(s.amonDin?.questVillagers, 0);
  assert.equal(rescued(s).resources, 5);
  assert.equal(s.staging.filter((u) => u.code === A.ghulat).length, 1);
  assert.equal(s.amonDin?.ghulatSetAside, false);
});
test("Exploring a staging-area location rescues its villagers and adds its victory card", () => {
  const s = base();
  const l = location(s, A.secluded);
  progressLocation(s, l, 3);
  flush(s);
  assert.equal(rescued(s).resources, 2);
  assert.equal(dead(s).damage, 0);
  assert.ok(!get(s, l.id));
  assert.equal(s.victory, 1);
});
test("Orc Ravager offers Alcaron's optional saved-token destination and reloads the exact choice", () => {
  let s = base();
  const burning = location(s, A.burning, true),
    hamlet = location(s, A.hamlet);
  s = reveal(s, A.ravager);
  assert.ok(s.choice?.title.includes("Alcaron"));
  assert.equal(s.activeLocation?.resources, 3);
  s = reload(s);
  s = choose(s, hamlet.id);
  assert.equal(get(s, burning.id)?.resources, 3);
  assert.equal(get(s, hamlet.id)?.resources, 4);
  assert.equal(dead(s).damage, 0);
  assert.equal(alcaron(s).exhausted, true);
});
test("Declining Alcaron records a death; unavailable active-location tokens grant Ravager surge", () => {
  let s = base();
  location(s, A.burning, true);
  s = reveal(s, A.ravager);
  s = choose(s, "skip");
  assert.equal(dead(s).damage, 1);
  assert.equal(alcaron(s).exhausted, false);
  s.activeLocation!.resources = 0;
  s.encounterDeck = [A.secluded];
  s = reveal(s, A.ravager);
  assert.ok(s.staging.some((u) => u.code === A.secluded));
});
test("Trapped Inside discards once per player as one event; Alcaron saves exactly one", () => {
  let s = base(3);
  const l = location(s, A.burning, true);
  s = reveal(s, A.trapped);
  assert.equal(s.activeLocation?.resources, 1);
  assert.equal(s.choice?.options.filter((o) => o.id === l.id).length, 1);
  s = reload(s);
  s = choose(s, l.id);
  assert.equal(s.activeLocation?.resources, 2);
  assert.equal(dead(s).damage, 2);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 22);
});
test("Trapped Inside surges if no actual token was removed", () => {
  let s = base(2);
  s.encounterDeck = [A.burning];
  s = reveal(s, A.trapped);
  assert.ok(s.staging.some((u) => u.code === A.burning));
  assert.equal(dead(s).damage, 0);
});
test("Gondorian Hamlet triggers on encounter treachery revelation while staged, not while active", () => {
  let s = base();
  alcaron(s).exhausted = true;
  const staged = location(s, A.hamlet),
    active = location(s, A.hamlet, true);
  rescued(s).resources = 1;
  s.encounterDeck = [A.ravager];
  s = reveal(s, A.panicked);
  assert.equal(get(s, staged.id)?.resources, 3);
  assert.equal(get(s, active.id)?.resources, 3);
  assert.equal(dead(s).damage, 0);
  s = choose(s, staged.id);
  assert.equal(get(s, staged.id)?.resources, 3);
  assert.equal(rescued(s).resources, 0);
  assert.equal(dead(s).damage, 1);
});
test("Hamlet's Forced trigger follows a treachery's canceled When Revealed effect", () => {
  let s = base();
  const l = location(s, A.burning, true),
    hamlet = location(s, A.hamlet);
  alcaron(s).exhausted = true;
  const spirit = make(s, "01007");
  spirit.resources = 3;
  s.heroes.push(spirit);
  s.hand = [make(s, "01050")];
  s = reveal(s, A.trapped);
  assert.equal(get(s, hamlet.id)?.resources, 3);
  assert.equal(dead(s).damage, 0);
  assert.equal(s.activeLocation?.resources, 4);
  s = reload(s);
  s = choose(s, "cancel");
  assert.equal(get(s, l.id)?.resources, 4);
  assert.equal(get(s, hamlet.id)?.resources, 2);
  assert.equal(dead(s).damage, 1);
  assert.ok(s.discard.includes("01050"));
});
test("Burnt Homestead raises threat before Hamlet discards a villager after the reveal", () => {
  let s = base();
  alcaron(s).exhausted = true;
  const hamlet = location(s, A.hamlet);
  s.encounterDeck = [A.secluded];
  s = reveal(s, A.homestead);
  assert.equal(s.threat, 20);
  assert.equal(get(s, hamlet.id)?.resources, 2);
  assert.equal(dead(s).damage, 1);
  assert.ok(s.staging.some((u) => u.code === A.secluded));
});
test("Eleanor resolves the original Hamlet trigger before revealing its replacement", () => {
  let s = base();
  alcaron(s).exhausted = true;
  const hamlet = location(s, A.hamlet);
  s.heroes.push(make(s, "01008"));
  s.encounterDeck = [A.homestead, A.secluded];
  s = reveal(s, A.trapped);
  assert.equal(s.threat, 22);
  assert.equal(get(s, hamlet.id)?.resources, 3);
  s = choose(s, "eleanor");
  assert.equal(s.threat, 23);
  assert.equal(get(s, hamlet.id)?.resources, 1);
  assert.equal(dead(s).damage, 2);
  assert.ok(s.staging.some((u) => u.code === A.secluded));
});
test("Panicked moves real rescued tokens in player order without creating deaths", () => {
  let s = base(2);
  const l = location(s, A.secluded);
  rescued(s).resources = 1;
  s.encounterDeck = [A.ravager];
  s = reveal(s, A.panicked);
  assert.equal(s.table?.active, 0);
  s = reload(s);
  s = choose(s, l.id);
  assert.equal(rescued(s).resources, 0);
  assert.equal(get(s, l.id)?.resources, 3);
  assert.equal(dead(s).damage, 0);
  assert.ok(
    !s.staging.some((u) => u.code === A.ravager),
    "No surge after a partial successful move",
  );
});
test("Panicked has each player select a staging location and retains second-player choice across reload", () => {
  let s = base(2);
  const l = location(s, A.secluded);
  rescued(s).resources = 2;
  s = reveal(s, A.panicked);
  s = choose(s, l.id);
  assert.equal(s.table?.active, 1);
  s = reload(s);
  s = choose(s, l.id);
  assert.equal(get(s, l.id)?.resources, 4);
  assert.equal(dead(s).damage, 0);
});
test("Panicked surges when no staging location can receive a villager", () => {
  let s = base();
  rescued(s).resources = 3;
  location(s, A.burning, true);
  s.encounterDeck = [A.secluded];
  s = reveal(s, A.panicked);
  assert.equal(rescued(s).resources, 3);
  assert.ok(s.staging.some((u) => u.code === A.secluded));
});
test("Burnt Homestead raises every player's threat by existing deaths and still surges", () => {
  let s = base(2);
  dead(s).damage = 3;
  s.encounterDeck = [A.secluded];
  s = reveal(s, A.homestead);
  assert.equal(seatView(s, 0).threat, 23);
  assert.equal(seatView(s, 1).threat, 23);
  assert.ok(s.staging.some((u) => u.code === A.secluded));
});
test("Secluded Farmhouse travel reveals and fully resolves a card before the same location becomes active", () => {
  let s = base();
  const l = location(s, A.secluded);
  s.phase = "travel";
  s.encounterDeck = [A.ravager, A.burning];
  s = act(s, { type: "TRAVEL", id: l.id });
  assert.equal(s.activeLocation?.id, l.id);
  assert.equal(s.activeLocation?.resources, 2);
  assert.ok(s.staging.some((u) => u.code === A.ravager));
  assert.ok(
    s.staging.some((u) => u.code === A.burning),
    "Ravager surges before travel because there was no active location",
  );
});
test("Craven Eagle lets the first player resolve lowest-HP ties, then the chosen controller prevent", () => {
  let s = base(2);
  const own = s.heroes[0];
  own.damage = stats(s, own).health - 1;
  const other = seatView(s, 1).heroes[0];
  other.damage = stats(s, other).health - 1;
  forOwner(s, 1, () => {
    s.hand = [
      make(s, "01043"),
      make(s, "01044"),
      make(s, "01045"),
      make(s, "01046"),
    ];
  });
  s = reveal(s, A.eagle);
  assert.equal(s.table?.active, 0);
  assert.ok(s.choice?.options.some((o) => o.id === own.id));
  assert.ok(s.choice?.options.some((o) => o.id === other.id));
  s = choose(s, other.id);
  assert.equal(s.table?.active, 1);
  const saved = reload(s);
  const a = choose(s, "prevent"),
    b = choose(saved, "prevent");
  assert.ok(get(a, other.id));
  assert.equal(seatView(a, 1).hand.length, 1);
  assert.equal(seatView(a, 1).discard.length, 3);
  assert.deepEqual(
    seatView(a, 1).hand.map((u) => u.id),
    seatView(b, 1).hand.map((u) => u.id),
  );
  assert.deepEqual(seatView(a, 1).discard, seatView(b, 1).discard);
});
test("Craven Eagle can discard Lord Alcaron and cause the printed immediate defeat", () => {
  let s = base();
  alcaron(s).damage = 2;
  s = reveal(s, A.eagle);
  s = choose(s, alcaron(s).id);
  assert.ok(!s.choice?.options.some((o) => o.id === "prevent"));
  s = choose(s, "discard");
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Alcaron/);
});
test("Ghulat's real attack adds a death before computing its variable attack", () => {
  let s = base();
  stage2(s);
  dead(s).damage = 2;
  const e = enemy(s, A.ghulat);
  s.phase = "defense";
  const h = s.heroes[0];
  h.tempDefense = 10;
  assert.equal(stats(s, e).attack, 2);
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: h.id });
  assert.equal(dead(s).damage, 3);
  assert.equal(stats(s, get(s, e.id)!).attack, 3);
  assert.equal(get(s, h.id)?.damage, 0);
});
test("Prevented attacks do not trigger Ghulat's death token", () => {
  const s = base();
  stage2(s);
  const e = enemy(s, A.ghulat);
  e.feinted = true;
  s.phase = "defense";
  s.queue = [fx("prepareCombat")];
  flush(s);
  assert.equal(dead(s).damage, 0);
});
test("Stage-two undefended attacks discard available rescued villagers without damaging a hero", () => {
  let s = base();
  stage2(s);
  rescued(s).resources = 2;
  alcaron(s).exhausted = true;
  const e = enemy(s, A.ravager);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: null });
  assert.equal(rescued(s).resources, 0);
  assert.equal(dead(s).damage, 2);
  assert.ok(s.heroes.every((u) => u.damage === 0));
  assert.equal(s.choice, null);
});
test("Marauding Orc and its conditional shadow each resolve only after an attack actually destroys a character", () => {
  let s = base();
  stage2(s);
  rescued(s).resources = 3;
  alcaron(s).exhausted = true;
  const e = enemy(s, A.marauder),
    ally = make(s, "01015");
  s.allies.push(ally);
  e.shadows = [A.marauder];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: ally.id });
  assert.ok(!get(s, ally.id));
  assert.equal(dead(s).damage, 2);
  assert.equal(rescued(s).resources, 2);
  assert.ok(s.heroes.every((u) => u.damage === 0));
});
test("Marauding shadow does nothing if the attack does not destroy its defender", () => {
  let s = base();
  stage2(s);
  rescued(s).resources = 3;
  const e = enemy(s, A.marauder),
    h = s.heroes[0];
  h.tempDefense = 10;
  e.shadows = [A.marauder, A.trapped];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: h.id });
  assert.equal(dead(s).damage, 0);
  assert.equal(rescued(s).resources, 3);
});
test("Variable shadows use current deaths; Ravager grants +2 only while undefended", () => {
  const s = base();
  stage2(s);
  dead(s).damage = 4;
  const e = enemy(s, A.ravager);
  combat(s, e);
  shadow(s, A.ravager);
  assert.equal(s.combat?.attackBonus, 2);
  shadow(s, A.panicked);
  assert.equal(s.combat?.attackBonus, 6);
  shadow(s, A.homestead);
  assert.equal(s.threat, 24);
  combat(s, e, s.heroes[0]);
  shadow(s, A.ravager);
  assert.equal(s.combat?.attackBonus, 1);
});
test("Burning Farmhouse's end-round discard happens after readying and can use Alcaron", () => {
  let s = base();
  const l = location(s, A.burning);
  alcaron(s).exhausted = true;
  s.phase = "refresh";
  s.queue = [fx("refreshReady")];
  flush(s);
  // A normal NEXT from refresh performs the end-of-round effects after readying.
  if (!s.choice) s = act(s, { type: "NEXT" });
  assert.ok(s.choice?.title.includes("Alcaron"));
  s = reload(s);
  s = choose(s, l.id);
  assert.equal(get(s, l.id)?.resources, 4);
  assert.equal(dead(s).damage, 0);
  assert.equal(alcaron(s).exhausted, true);
});
test("Alcaron follows the first player without losing attachments, damage, exhaustion or identity", () => {
  const s = base(2),
    u = alcaron(s);
  u.damage = 1;
  u.exhausted = true;
  u.attachments.push({
    id: "alcaron-attachment",
    code: "01040",
    exhausted: false,
    owner: 0,
  });
  s.table!.first = 1;
  check(s);
  assert.equal(ownerOf(s, u), 1);
  const restored = reload(s),
    moved = alcaron(restored);
  assert.equal(moved.id, u.id);
  assert.equal(moved.damage, 1);
  assert.equal(moved.exhausted, true);
  assert.equal(moved.attachments[0].id, "alcaron-attachment");
  assert.equal(restored.status, "playing");
});
test("Alcaron leaving by direct discard loses even outside combat", () => {
  const s = base();
  discardCharacter(s, alcaron(s));
  assert.equal(s.status, "lost");
});
test("Destroying Alcaron and eliminating his controller both cause the printed defeat", () => {
  let s = base();
  damage(s, alcaron(s).id, 3);
  assert.equal(s.status, "lost");
  s = base(2);
  s.threat = 50;
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Alcaron/);
});
test("Ghulat blocks a completed stage until defeated; success requires strictly more rescued than dead", () => {
  const s = base();
  stage2(s);
  s.progress = 15;
  rescued(s).resources = 5;
  dead(s).damage = 4;
  const ghulat = enemy(s, A.ghulat);
  advanceQuest(s);
  assert.equal(s.status, "playing");
  damage(s, ghulat.id, 7);
  flush(s);
  assert.equal(s.status, "won");
  assert.match(s.reason, /5.*4/);
  assert.equal(s.victory, 2);
});
test("A tied or worse final villager count is a defeat", () => {
  for (const [alive, died] of [
    [0, 0],
    [4, 4],
    [3, 4],
  ]) {
    const s = base();
    stage2(s);
    rescued(s).resources = alive;
    dead(s).damage = died;
    s.progress = 15;
    advanceQuest(s);
    assert.equal(s.status, "lost", `${alive}:${died}`);
  }
});
test("Malformed quest villager counts and impossible set-aside state cannot be restored", () => {
  const s = base();
  for (const questVillagers of [-1, 6, 1.5, "5"]) {
    const invalid = JSON.parse(JSON.stringify(s));
    invalid.amonDin.questVillagers = questVillagers;
    assert.equal(validateSave(invalid), false);
  }
  const invalid = JSON.parse(JSON.stringify(s));
  invalid.stage = 2;
  invalid.amonDin.questVillagers = 0;
  assert.equal(validateSave(invalid), false);
});
