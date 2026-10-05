import assert from "node:assert/strict";
import test from "node:test";
import { applyAction as act } from "./pass-resource-window.ts";
import {
  availableAbilities,
  canTravel,
  createGame,
  optionalEngagementProblem,
  restoreSave,
  validateSave,
} from "../src/game/engine.ts";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import {
  advanceQuest,
  check,
  damage,
  destroy,
  exhaustCharacter,
  placeEncounter,
  progress,
  progressLocation,
  readyCharacter,
  revealed,
  shadow,
} from "../src/game/board.ts";
import { fx, get, locationQuest, make, stats } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import {
  allCharacters,
  allEngaged,
  allHeroes,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import {
  STEWARD_FEAR as S,
  STREETS as G,
  STEWARD_FEAR_ENCOUNTERS,
  STEWARD_FEAR_QUESTS,
  STREETS_GONDOR_ENCOUNTERS,
  STEWARD_CLUES,
  STEWARD_PLOTS,
  STEWARD_VILLAINS,
  STEWARD_FEAR_RECIPES,
} from "../src/game/steward-fear-support.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import { HEIRS_NUMENOR as H } from "../src/game/heirs-numenor-support.ts";
import type { GameState, Unit } from "../src/game/types.ts";
const d = STARTERS.find((d) => d.id === "leadership")!;
function raw(players = 1, easy = false) {
  return createGame(721, d.cards, d.heroes, d.id, {
    scenarioId: "the-stewards-fear",
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
function base(players = 1) {
  let s = raw(players);
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    encounterDeck: Array(40).fill("01099"),
    encounterDiscard: [],
    progress: 0,
    stage: 1,
    victory: 0,
    victoryCards: [],
    stewardFear: {
      underworldDeck: [],
      underneath: {},
      removedHidden: [],
      questResources: 0,
      pendingUnderworld: [],
    },
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
    });
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function reload(s: GameState) {
  syncSeat(s);
  const json = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(json));
  const restored = restoreSave(json);
  assert.ok(restored);
  return restored;
}
function reveal(
  s: GameState,
  code: string,
  origin: "encounter" | "underworld" = "encounter",
) {
  revealed(s, code, undefined, origin);
  flush(s);
  return s;
}
function enemy(s: GameState, code: string, player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function attachment(s: GameState, u: Unit, code: string) {
  const a = { id: `test-a${s.nextId++}`, code, exhausted: false };
  u.attachments.push(a);
  return a;
}
function resolveSimple(s: GameState) {
  for (let i = 0; i < 100 && s.choice && s.status === "playing"; i++)
    s = choose(
      s,
      s.choice.options.find((o) => ["skip", "resolve", "return"].includes(o.id))
        ?.id ?? s.choice.options[0].id,
    );
  return s;
}
const multiset = (codes: string[]) =>
  Object.fromEntries(
    [...new Set(codes)]
      .sort()
      .map((c) => [c, codes.filter((x) => x === c).length]),
  );

test("Steward and shared Streets register all printed designs and canonical quest sides", () => {
  assert.equal(STEWARD_FEAR_ENCOUNTERS.length, 18);
  assert.equal(STEWARD_FEAR_QUESTS.length, 3);
  assert.equal(STREETS_GONDOR_ENCOUNTERS.length, 5);
  for (const c of [
    ...STEWARD_FEAR_ENCOUNTERS,
    ...STEWARD_FEAR_QUESTS,
    ...STREETS_GONDOR_ENCOUNTERS,
  ])
    assert.ok(SCRIPTED.has(c.code), c.name);
  assert.equal(card(S.confrontation).quest, 15);
  for (const code of [S.conspiracy, S.grandDesign])
    assert.equal(card(code).quest, undefined);
});
test("original/easy one-to-four-player setup preserves exact official recipe cards across hidden zones", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = raw(players, easy),
        q = s.stewardFear!,
        recipe = STEWARD_FEAR_RECIPES.find(
          (r) => r.id === (easy ? "E03.4" : "Q03.4"),
        )!;
      const expected = recipe.cards
        .filter((c) => c.section !== "sharedQuestDeck")
        .flatMap((c) => Array(c.quantity).fill(c.code));
      const actual = [
        ...s.encounterDeck,
        ...q.underworldDeck,
        ...Object.values(q.underneath).flat(),
        ...q.removedHidden,
        q.hiddenPlot!,
        q.hiddenVillain!,
        q.rootsSetAside!,
        s.activeLocation!.code,
      ];
      assert.deepEqual(multiset(actual), multiset(expected));
      assert.equal(
        q.underworldDeck.length +
          (q.underneath[s.activeLocation!.id]?.length ?? 0),
        easy ? 11 : 12,
      );
      assert.equal(q.underneath[s.activeLocation!.id].length, players);
      assert.equal(s.activeLocation?.code, S.fourthStar);
      assert.ok(STEWARD_PLOTS.includes(q.hiddenPlot!));
      assert.ok(STEWARD_VILLAINS.includes(q.hiddenVillain!));
      assert.equal(q.removedHidden.length, 4);
      assert.equal(q.questResources, 0);
      assert.equal(s.staging.length, 0);
      assert.ok(
        !s.log.some(
          (l) =>
            q.removedHidden.some((c) => l.text.includes(card(c).name)) ||
            l.text.includes(card(q.hiddenPlot!).name) ||
            l.text.includes(card(q.hiddenVillain!).name),
        ),
      );
      assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
    }
});
test("Underworld enters on physical locations and its departure game rule survives later text blanking", () => {
  let s = base();
  s.stewardFear!.underworldDeck = [G.pickpocket, S.prisoner];
  s = reveal(s, S.houses);
  const l = s.staging.find((u) => u.code === S.houses)!;
  assert.deepEqual(s.stewardFear!.underneath[l.id], [G.pickpocket, S.prisoner]);
  attachment(s, l, KHAZAD.fear);
  progressLocation(s, l, 4);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === G.pickpocket));
  assert.ok(s.staging.some((u) => u.code === S.prisoner));
  assert.equal(s.stewardFear!.underneath[l.id], undefined);
});
test("Sewers adds its own facedown card and chooses the physical active location for the additional card", () => {
  let s = base();
  const active = make(s, S.storehouse);
  s.activeLocation = active;
  s.stewardFear!.underworldDeck = [G.pickpocket, H.bandit, S.map];
  s = reveal(s, S.sewers);
  const sewer = s.staging.find((u) => u.code === S.sewers)!;
  assert.deepEqual(s.stewardFear!.underneath[sewer.id], [G.pickpocket]);
  assert.ok(s.choice?.title.includes("Sewers"));
  s = reload(s);
  s = choose(s, active.id);
  assert.deepEqual(s.stewardFear!.underneath[active.id], [H.bandit]);
  assert.deepEqual(s.stewardFear!.underworldDeck, [S.map]);
});
test("Underworld does not refill or leak encounter cards when empty", () => {
  const s = base();
  placeEncounter(s, S.houses);
  const l = s.staging[0];
  assert.deepEqual(s.stewardFear!.underneath[l.id], []);
  assert.equal(s.encounterDeck.length, 40);
  progressLocation(s, l, 4);
  flush(s);
  assert.equal(s.staging.length, 0);
});
test("Underworld revelations are ordered, saveable, and do not apply Thalin's encounter-deck response", () => {
  let s = base(2);
  const location = make(s, S.storehouse);
  s.activeLocation = location;
  const thalin = make(s, "01006");
  forOwner(s, 1, () => (s.heroes = [thalin]));
  thalin.committed = true;
  s.stewardFear!.underneath[location.id] = [G.pickpocket, S.scrap];
  s.flow = { nextId: 1, pending: null, history: [], mode: "hidden" };
  progressLocation(s, location, 2);
  flush(s);
  assert.ok(s.flow.pending);
  assert.equal(s.staging.length, 0);
  assert.equal(s.flow.pending.cards[0].code, G.pickpocket);
  assert.equal(s.stewardFear!.pendingUnderworld[0], S.scrap);
  s = reload(s);
  s = act(s, { type: "CONTINUE", stepId: s.flow!.pending!.id });
  assert.equal(s.staging.find((u) => u.code === G.pickpocket)?.damage, 0);
  for (
    let i = 0;
    i < 10 &&
    s.flow?.pending &&
    !s.flow.pending.cards.some((c) => c.code === S.scrap);
    i++
  )
    s = act(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id });
  assert.ok(s.flow?.pending?.cards.some((c) => c.code === S.scrap));
  while (s.flow?.pending)
    s = act(s, { type: "CONTINUE", stepId: s.flow.pending.id });
  assert.ok(s.staging.some((u) => u.code === S.scrap));
  assert.equal(s.stewardFear!.questResources, 1);
});
test("quest progress is ignored on stages one and two; only active explored locations add resource tokens", () => {
  const s = base();
  progress(s, 20);
  assert.equal(s.progress, 0);
  assert.equal(s.stewardFear!.questResources, 0);
  const staging = make(s, S.storehouse);
  s.staging.push(staging);
  progressLocation(s, staging, 2);
  flush(s);
  assert.equal(s.stewardFear!.questResources, 0);
  const active = make(s, S.storehouse);
  s.activeLocation = active;
  progress(s, 20);
  flush(s);
  assert.equal(s.progress, 0);
  assert.equal(s.stewardFear!.questResources, 1);
});
test("Clue claims exhaust an actual controlled ready hero, retain victory, and advance by printed resource values", () => {
  let s = base(2);
  const h = s.heroes[0],
    scrap = make(s, S.scrap);
  s.staging.push(scrap);
  s = act(s, { type: "CLAIM", id: scrap.id, heroId: h.id });
  assert.equal(get(s, h.id)?.exhausted, true);
  assert.equal(s.threat, 20);
  assert.equal(s.stewardFear!.questResources, 1);
  assert.deepEqual(s.victoryCards, [S.scrap]);
  const prisoner = make(s, S.prisoner);
  s.staging.push(prisoner);
  assert.throws(() => act(s, { type: "CLAIM", id: prisoner.id, heroId: h.id }));
  s = act(s, { type: "CLAIM", id: prisoner.id, heroId: s.heroes[1].id });
  assert.equal(s.stewardFear!.questResources, 3);
  assert.equal(s.victory, 2);
  selectSeat(s, 1);
  const borrowed = seatView(s, 0).heroes[2];
  const again = make(s, S.scrap);
  s.staging.push(again);
  assert.throws(() =>
    act(s, { type: "CLAIM", id: again.id, heroId: borrowed.id }),
  );
});
test("Secret Map has distinct claim/use actions, no resource tokens, and moves the actual attachment into victory", () => {
  let s = base();
  const map = make(s, S.map),
    h = s.heroes[0],
    l = make(s, S.storehouse);
  s.activeLocation = l;
  s.staging.push(map);
  s = act(s, { type: "CLAIM", id: map.id, heroId: h.id });
  assert.equal(s.stewardFear!.questResources, 0);
  assert.equal(s.heroes[0].attachments[0].id, map.id);
  assert.equal(s.victory, 0);
  assert.ok(
    availableAbilities(s, s.heroes[0]).some(
      (a) => a.id === map.id && !a.disabled,
    ),
  );
  s = act(s, { type: "ABILITY", id: h.id, attachmentId: map.id });
  s = reload(s);
  s = choose(s, l.id);
  assert.equal(s.activeLocation, null);
  assert.equal(s.heroes[0].attachments.length, 0);
  assert.deepEqual(s.victoryCards, [S.map]);
  assert.equal(s.stewardFear!.questResources, 1);
});
test("Secret Map cannot place player effect progress on Market Square", () => {
  let s = base();
  attachment(s, s.heroes[0], S.map);
  s.activeLocation = make(s, G.market);
  assert.ok(
    availableAbilities(s, s.heroes[0]).find(
      (a) => a.id === s.heroes[0].attachments[0].id,
    )?.disabled,
  );
  assert.throws(() =>
    act(s, {
      type: "ABILITY",
      id: s.heroes[0].id,
      attachmentId: s.heroes[0].attachments[0].id,
    }),
  );
});
test("four quest resources reveal only selected Plot, replace active location without revealing cards below returned location", () => {
  const s = base();
  const old = make(s, S.houses);
  s.activeLocation = old;
  s.stewardFear!.underneath[old.id] = [G.pickpocket];
  Object.assign(s.stewardFear!, {
    questResources: 4,
    hiddenPlot: S.counsels,
    rootsSetAside: S.roots,
    hiddenVillain: S.bane,
    underworldDeck: [S.scrap],
  });
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 2);
  assert.equal(s.stewardFear!.questResources, 0);
  assert.equal(s.activeLocation?.code, S.roots);
  assert.ok(s.staging.some((u) => u.id === old.id));
  assert.deepEqual(s.stewardFear!.underneath[old.id], [G.pickpocket]);
  assert.ok(s.staging.some((u) => u.code === S.counsels));
  assert.ok(!s.staging.some((u) => u.code === G.pickpocket));
  assert.equal(s.stewardFear!.hiddenPlot, undefined);
  assert.deepEqual(s.stewardFear!.underneath[s.activeLocation!.id], [S.scrap]);
});
test("Roots of Mindolluin increases only staging location quest points; Dissident counts actual Underworld traits", () => {
  const s = base();
  s.activeLocation = make(s, S.roots);
  const store = make(s, S.storehouse),
    star = make(s, S.fourthStar),
    e = enemy(s, S.dissident);
  s.staging.push(store, star);
  assert.equal(locationQuest(s, store), 4);
  assert.equal(locationQuest(s, star), 7);
  assert.equal(locationQuest(s, s.activeLocation), 5);
  assert.equal(
    stats(s, e).attack,
    4,
    "Roots and Storehouse, not Fourth Star's keyword",
  );
  attachment(s, s.activeLocation, KHAZAD.fear);
  assert.equal(
    stats(s, e).attack,
    3,
    "full printed text blanking removes traits",
  );
  assert.equal(locationQuest(s, store), 2);
  attachment(s, e, KHAZAD.fear);
  assert.equal(stats(s, e).attack, 2);
});
test("stage three shuffles remaining deck, keeps cards beneath locations, and requires both fifteen progress and defeated Villain", () => {
  const s = base();
  s.stage = 2;
  Object.assign(s.stewardFear!, {
    questResources: 4,
    hiddenVillain: S.bane,
    underworldDeck: [S.scrap, G.pickpocket],
  });
  const l = make(s, S.storehouse);
  s.staging.push(l);
  s.stewardFear!.underneath[l.id] = [H.traitor];
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 3);
  assert.equal(s.stewardFear!.underworldDeck.length, 0);
  assert.ok(s.encounterDeck.includes(G.pickpocket));
  assert.deepEqual(s.stewardFear!.underneath[l.id], [H.traitor]);
  s.progress = 15;
  check(s);
  assert.equal(s.status, "playing");
  const v = s.staging.find((u) => u.code === S.bane)!;
  destroy(s, v);
  assert.equal(s.status, "won");
});
test("Fourth Star response is optional per player after every exploration", () => {
  let s = base(2);
  const l = make(s, S.fourthStar);
  s.activeLocation = l;
  const n0 = s.hand.length,
    n1 = seatView(s, 1).hand.length;
  progressLocation(s, l, 5);
  flush(s);
  assert.equal(s.table?.active, 0);
  s = choose(s, "draw");
  assert.equal(seatView(s, 0).hand.length, n0 + 1);
  assert.equal(s.table?.active, 1);
  s = choose(s, "skip");
  assert.equal(seatView(s, 1).hand.length, n1);
  assert.equal(s.stewardFear!.questResources, 1);
});
test("Houses of the Dead exhausts all fellowships only when becoming active", () => {
  let s = base(2);
  s.phase = "travel";
  placeEncounter(s, S.houses);
  assert.ok(allCharacters(s).every((h) => !h.exhausted));
  s = act(s, { type: "TRAVEL", id: s.staging[0].id });
  assert.ok(allCharacters(s).every((h) => h.exhausted));
});
test("City Street travel restriction and Market Square explicit payments apply outside Steward's Fear", () => {
  let s = base(2);
  s.phase = "travel";
  placeEncounter(s, G.cityStreet, true);
  placeEncounter(s, G.market, true);
  const street = s.staging.find((u) => u.code === G.cityStreet)!,
    market = s.staging.find((u) => u.code === G.market)!;
  assert.match(canTravel(s, market)!, /City Street/);
  assert.equal(canTravel(s, street), null);
  s.staging = s.staging.filter((u) => u.id !== street.id);
  forOwner(s, 1, () => s.heroes.forEach((h) => (h.resources = 0)));
  assert.match(canTravel(s, market)!, /every player/);
  forOwner(s, 1, () => (s.heroes[0].resources = 2));
  const h0 = seatView(s, 0).heroes[1],
    h1 = seatView(s, 1).heroes[0];
  s = act(s, { type: "TRAVEL", id: market.id });
  assert.equal(s.activeLocation, null);
  s = choose(s, h0.id);
  s = reload(s);
  s = choose(s, h1.id);
  assert.equal(s.activeLocation?.id, market.id);
  assert.equal(seatView(s, 0).heroes[1].resources, 7);
  assert.equal(seatView(s, 1).heroes[0].resources, 1);
});
test("Local Trouble uses printed threat and tie choice, excludes copies, then follows actual exhaustion/readiness", () => {
  let s = base(2);
  s = reveal(s, G.localTrouble);
  assert.ok(s.choice?.title.includes("Highest printed"));
  const max = Math.max(...allHeroes(s).map((h) => card(h.code).threat ?? 0));
  assert.ok(s.choice!.options.every((o) => card(o.code!).threat === max));
  const id = s.choice!.options[0].id;
  s = reload(s);
  s = choose(s, id);
  const hero = get(s, id)!;
  const controller = allHeroes(s).find((h) => h.id === id)!;
  const before = seatView(s, hero.owner ?? 0).threat;
  exhaustCharacter(s, controller);
  exhaustCharacter(s, controller);
  readyCharacter(s, controller);
  readyCharacter(s, controller);
  assert.equal(seatView(s, hero.owner ?? 0).threat, before + 2);
  s = reveal(s, G.localTrouble);
  assert.ok(s.choice!.options.every((o) => o.id !== id));
});
test("Lost in the City cannot be cancelled and each player searches actual City cards including discard", () => {
  let s = base(2);
  forOwner(s, 0, () => {
    s.hand = [make(s, "01050")];
    s.heroes.push(make(s, "01008"));
  });
  s.encounterDeck = [S.storehouse, S.dissident];
  s.encounterDiscard = [G.market];
  s.stewardFear!.underworldDeck = [G.pickpocket];
  s = reveal(s, G.lostCity);
  assert.ok(!s.choice?.title.startsWith("Revealed:"));
  assert.equal(s.choice?.options.length, 2);
  s = choose(s, "deck-0");
  const store = s.staging.find((u) => u.code === S.storehouse)!;
  assert.deepEqual(s.stewardFear!.underneath[store.id], [G.pickpocket]);
  s = reload(s);
  s = choose(s, "discard-0");
  assert.ok(s.staging.some((u) => u.code === G.market));
  assert.ok(s.encounterDiscard.includes(G.lostCity));
  assert.equal(s.hand.filter((u) => u.code === "01050").length, 1);
});
test("Unwelcome Discovery discards a Clue instead of adding it, then resolves its printed Surge", () => {
  let s = base();
  s.stewardFear!.underworldDeck = [S.prisoner];
  s.encounterDeck = [S.storehouse];
  reveal(s, S.discovery);
  s = resolveSimple(s);
  assert.ok(s.encounterDiscard.includes(S.prisoner));
  assert.ok(!s.staging.some((u) => u.code === S.prisoner));
  assert.ok(s.staging.some((u) => u.code === S.storehouse));
});
test("False Lead ends the quest phase without success/failure or further queued encounter reveals", () => {
  let s = base();
  s.phase = "quest";
  s.heroes[0].committed = true;
  s.encounterDeck = [S.falseLead, S.knife];
  s = act(s, { type: "COMMIT" });
  s = resolveSimple(s);
  assert.equal(s.phase, "travel");
  assert.equal(s.progress, 0);
  assert.equal(s.stewardFear!.questResources, 0);
  assert.deepEqual(s.encounterDeck, [S.knife]);
  assert.ok(s.heroes.every((h) => !h.committed));
});
test("False Lead revealed outside quest phase by Castamir does not change combat phase", () => {
  const s = base();
  s.phase = "attack";
  reveal(s, S.falseLead);
  assert.equal(s.phase, "attack");
  assert.ok(s.encounterDiscard.includes(S.falseLead));
});
test("A Knife in the Back damages a chosen first-player hero using selected ally current attack then discards physical ally", () => {
  let s = base(2);
  const a = make(s, "01017");
  a.tempAttack = 3;
  s.allies.push(a);
  const own = s.heroes[0];
  attachment(s, own, "01040");
  forOwner(s, 1, () => s.allies.push(make(s, "01043")));
  s = reveal(s, S.knife);
  assert.equal(s.table?.active, 0);
  assert.ok(
    s.choice?.options.every((o) =>
      seatView(s, 0).heroes.some((h) => h.id === o.id),
    ),
  );
  const power = stats(s, a).attack;
  s = reload(s);
  s = choose(s, own.id);
  assert.equal(get(s, own.id)?.damage, power);
  assert.ok(!get(s, a.id));
  assert.ok(seatView(s, 0).discard.includes(a.code));
  assert.equal(seatView(s, 1).allies.length, 1);
});
test("Knife surges if no first-player ally was discarded", () => {
  const s = base(2);
  forOwner(s, 1, () => s.allies.push(make(s, "01043")));
  s.encounterDeck = [S.storehouse];
  reveal(s, S.knife);
  assert.ok(s.staging.some((u) => u.code === S.storehouse));
  assert.equal(seatView(s, 1).allies.length, 1);
});
test("Pickpocket attack discards one selected resource and actual random hand card, with empty-pool partial resolution", () => {
  let s = base();
  const e = enemy(s, G.pickpocket),
    h = s.heroes[1];
  s.phase = "defense";
  s.hand = [make(s, "01043"), make(s, "01044")];
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: h.id });
  assert.ok(s.choice?.title.includes("Pickpocket"));
  s = reload(s);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].resources, 7);
  assert.equal(s.hand.length, 1);
  assert.equal(s.discard.length, 1);
  assert.equal(s.heroes[1].damage, 0);
});
test("Daughter cannot optionally engage; her after-attack choice is owned by attacked player and persists", () => {
  let s = base(2);
  s.phase = "encounter";
  placeEncounter(s, S.daughter);
  const e = s.staging[0];
  assert.match(optionalEngagementProblem(s, e)!, /cannot be optionally/);
  s.staging = [];
  forOwner(s, 1, () => s.engaged.push(e));
  s.phase = "defense";
  selectSeat(s, 1);
  s.table!.turn = 1;
  e.owner = 1;
  const h = s.heroes[0];
  h.tempDefense = 8;
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: h.id });
  assert.ok(s.choice?.title.includes("Prevent her return"));
  assert.equal(s.table?.active, 1);
  s = reload(s);
  s = choose(s, "prevent");
  assert.equal(seatView(s, 1).threat, 24);
  assert.ok(allEngaged(s).some((u) => u.id === e.id));
  assert.equal(seatView(s, 0).threat, 20);
});
test("Daughter returns the same enemy to staging when declined and obeys Feint prevention", () => {
  let s = base();
  const e = enemy(s, S.daughter);
  s.phase = "defense";
  s.heroes[0].tempDefense = 8;
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
  s = choose(s, "return");
  assert.ok(s.staging.some((u) => u.id === e.id));
  assert.equal(s.engaged.length, 0);
  assert.equal(s.threat, 20);
  s = base();
  const prevented = enemy(s, S.daughter);
  prevented.feinted = true;
  s.phase = "defense";
  assert.throws(() =>
    act(s, {
      type: "DEFEND",
      enemyId: prevented.id,
      defenderId: s.heroes[0].id,
    }),
  );
  assert.ok(!s.choice?.title.includes("Daughter"));
});
test("Telemnar attack mills each player's actual deck, and real played event prompts first-player immediate attack", () => {
  let s = base(2);
  const e = enemy(s, S.bane, 1);
  e.owner = 1;
  s.phase = "planning";
  const event = make(s, "01022");
  s.hand = [event];
  const before = playerOrder(s).map((p) => seatView(s, p).deck.length);
  s = act(s, { type: "PLAY", id: event.id });
  assert.ok(s.choice?.title.includes("Immediate attack"));
  assert.equal(s.table?.active, 0);
  assert.equal(s.resolvingEvents?.[0].unit.id, event.id);
  assert.ok(
    allCharacters(s).every((u) => !u.tempAttack),
    "Mandatory attack precedes the event buff",
  );
  s = choose(s, s.choice!.options[0].id);
  s = resolveSimple(s);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).deck.length, before[p] - 3);
  assert.ok(seatView(s, 0).discard.includes("01022"));
  assert.equal(s.combat, null);
});
test("Castamir attack reveals resolves and discards its actual encounter including Underworld location departures", () => {
  let s = base();
  const e = enemy(s, S.castamir);
  s.phase = "defense";
  s.heroes[0].tempDefense = 8;
  s.encounterDeck = [S.storehouse];
  s.stewardFear!.underworldDeck = [S.prisoner];
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id });
  s = resolveSimple(s);
  assert.ok(s.encounterDiscard.includes(S.storehouse));
  assert.ok(!s.staging.some((u) => u.code === S.storehouse));
  assert.ok(s.staging.some((u) => u.code === S.prisoner));
  assert.equal(s.stewardFear!.questResources, 0);
});
test("Castamir's after-revelation attack triggers even if treachery's When Revealed is cancelled", () => {
  let s = base();
  const castamir = enemy(s, S.castamir);
  s.heroes[0].tempDefense = 10;
  const spirit = make(s, "01007");
  spirit.resources = 3;
  s.heroes.push(spirit);
  const cancel = make(s, "01050");
  s.hand = [cancel];
  s = reveal(s, S.knife);
  assert.ok(s.choice?.options.some((o) => o.id === "cancel"));
  s = choose(reload(s), "cancel");
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(s.combat?.enemyId, castamir.id);
  s = choose(s, s.heroes[0].id);
  s = resolveSimple(s);
  assert.equal(s.discard.filter((c) => c === "01050").length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === S.knife).length, 1);
  assert.equal(
    s.encounterDeck.length,
    38,
    "Exactly one mandatory attack draws one shadow and one after-attack reveal",
  );
});
test("Unholy Alliance adds one reveal per staging, and hero attack death loses while ordinary discard does not", () => {
  let s = base();
  placeEncounter(s, S.alliance);
  s.phase = "quest";
  s.encounterDeck = [S.storehouse, G.market, S.knife];
  s = act(s, { type: "COMMIT" });
  s = resolveSimple(s);
  assert.ok(s.staging.some((u) => u.code === S.storehouse));
  assert.ok(s.staging.some((u) => u.code === G.market));
  assert.deepEqual(s.encounterDeck, [S.knife]);
  s = base();
  placeEncounter(s, S.alliance);
  const e = enemy(s, G.pickpocket),
    h = s.heroes[0];
  damage(s, h.id, 10, { enemyId: e.id, combatDamage: true });
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Unholy Alliance/);
});
test("Poisoned Counsels raises every fellowship threat; Up in Flames grows resource count, mills every deck and loses on empty", () => {
  let s = base(2);
  placeEncounter(s, S.counsels);
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
  s = base(2);
  placeEncounter(s, S.flames);
  const plotId = s.staging[0].id;
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  assert.equal(get(s, plotId)?.resources, 1);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).deck.length, 28);
  const saved = reload(s);
  saved.phase = "refresh";
  forOwner(saved, 1, () => (saved.deck = ["01043", "01044"]));
  s = act(saved, { type: "NEXT" });
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Up in Flames/);
});
test("all seven Streets/Steward shadows apply exact defended/undefended and post-destruction conditions", () => {
  const s = base(),
    e = enemy(s, G.pickpocket);
  s.phase = "defense";
  s.combat = {
    enemyId: e.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
  };
  shadow(s, S.storehouse);
  shadow(s, G.cityStreet);
  assert.equal(s.combat.attackBonus, 4);
  s.stewardFear!.questResources = 3;
  shadow(s, S.dissident);
  assert.equal(s.stewardFear!.questResources, 2);
  const a = attachment(s, s.heroes[0], "01026");
  shadow(s, G.pickpocket);
  assert.ok(!s.heroes[0].attachments.some((x) => x.id === a.id));
  s.hand = [make(s, "01043"), make(s, "01044")];
  shadow(s, G.lostCity);
  assert.equal(s.hand.length, 0);
  shadow(s, G.market);
  assert.ok(s.heroes.every((h) => h.resources === 0));
  shadow(s, S.falseLead);
  damage(s, s.heroes[0].id, 10, { enemyId: e.id, combatDamage: true });
  assert.equal(s.stewardFear!.questResources, 0);
});
test("blanked encounter texts remove abilities but Underworld game-rule departures continue", () => {
  let s = base();
  const e = enemy(s, S.bane);
  attachment(s, e, KHAZAD.fear);
  s.phase = "planning";
  const event = make(s, "01022");
  s.hand = [event];
  s = act(s, { type: "PLAY", id: event.id });
  assert.equal(s.choice, null);
  const daughter = make(s, S.daughter);
  attachment(s, daughter, KHAZAD.fear);
  s.staging.push(daughter);
  s.phase = "encounter";
  assert.equal(optionalEngagementProblem(s, daughter), null);
});

test("Tome replay triggers Telemnar before the physical event ability and keeps its bottom destination after reload", () => {
  let s = base();
  const bane = enemy(s, S.bane),
    hero = s.heroes[0];
  hero.tempDefense = 10;
  const tome = attachment(s, hero, "06109");
  s.discard = ["01022"];
  s.deck = Array(20).fill("01043");
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: tome.id });
  s = choose(s, "discard-0");
  s = choose(s, "pay-0");
  assert.match(s.choice!.title, /Immediate attack/);
  assert.ok(!allCharacters(s).some((u) => u.tempAttack));
  const pending = s.resolvingEvents![0];
  assert.equal(pending.destination, "bottom");
  const id = pending.unit.id;
  s = choose(reload(s), hero.id);
  s = resolveSimple(s);
  assert.equal(s.deck.at(-1), "01022");
  assert.ok(!s.discard.includes("01022"));
  assert.ok(!s.resolvingEvents?.some((e) => e.unit.id === id));
  assert.equal(get(s, bane.id)!.damage, 0);
});
test("Vilya real play triggers Telemnar before event ability; put into play has no event-play trigger", () => {
  let s = base();
  enemy(s, S.bane);
  s.heroes[0].tempDefense = 10;
  const elrond = make(s, "04128");
  s.heroes.push(elrond);
  const vilya = attachment(s, elrond, "04137");
  s.deck = ["01022", ...Array(20).fill("01043")];
  s = act(s, { type: "ABILITY", id: elrond.id, attachmentId: vilya.id });
  s = choose(reload(s), "play");
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(s.resolvingEvents![0].unit.code, "01022");
  assert.ok(!s.heroes.some((u) => u.tempAttack));
  s = choose(s, s.heroes[0].id);
  s = resolveSimple(s);
  assert.ok(s.discard.includes("01022"));
  s = base();
  enemy(s, S.bane);
  const host = make(s, "04128");
  s.heroes.push(host);
  const a = attachment(s, host, "04137");
  s.deck = ["01016", ...Array(20).fill("01043")];
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: a.id });
  s = choose(s, "put");
  assert.ok(!s.choice?.title.includes("Immediate attack"));
  s = resolveSimple(s);
  assert.ok(s.allies.some((u) => u.code === "01016"));
});
test("Response event play triggers Telemnar once before cancellation and keeps physical identity while paused", () => {
  let s = base();
  enemy(s, S.bane);
  s.heroes[0].tempDefense = 10;
  const spirit = make(s, "01007");
  spirit.resources = 3;
  s.heroes.push(spirit);
  const event = make(s, "01050");
  s.hand = [event];
  s = reveal(s, S.knife);
  assert.ok(s.choice?.options.some((o) => o.id === "cancel"));
  s = choose(s, "cancel");
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(s.resolvingEvents![0].unit.id, event.id);
  assert.ok(!s.discard.includes("01050"));
  s = choose(reload(s), s.heroes[0].id);
  s = resolveSimple(s);
  assert.equal(s.discard.filter((c) => c === "01050").length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === S.knife).length, 1);
});
test("Local Trouble charges accepted hero action and response, skips declined response, and distinguishes resource loss", () => {
  let s = base();
  const [aragorn, theodred] = s.heroes;
  attachment(s, aragorn, G.localTrouble);
  attachment(s, theodred, G.localTrouble);
  s.phase = "quest";
  s.committedIds = [aragorn.id, theodred.id];
  s = act(s, { type: "COMMIT" });
  assert.equal(s.threat, 22, "Each actual exhaustion charges once");
  s = choose(s, aragorn.id);
  assert.equal(
    s.threat,
    23,
    "Théodred accepted printed response charges his controller",
  );
  s = choose(reload(s), "ready");
  assert.equal(
    s.threat,
    25,
    "Aragorn printed response and actual readiness charge separately",
  );
  s = base();
  const hero = s.heroes[1];
  attachment(s, hero, G.localTrouble);
  s.phase = "quest";
  s.committedIds = [hero.id];
  s = act(s, { type: "COMMIT" });
  assert.equal(s.threat, 21);
  s = choose(s, "skip");
  assert.equal(s.threat, 21);
  s = base();
  const glor = make(s, "01011");
  glor.resources = 3;
  s.heroes.push(glor);
  attachment(s, glor, G.localTrouble);
  const pick = enemy(s, G.pickpocket);
  s.phase = "defense";
  s.heroes[0].tempDefense = 10;
  s = act(s, { type: "DEFEND", enemyId: pick.id, defenderId: s.heroes[0].id });
  s = choose(s, glor.id);
  s = resolveSimple(s);
  assert.equal(
    s.threat,
    20,
    "Discarding Glorfindel's resource is not triggering his printed ability",
  );
});
test("Lieutenant repeats Streets When Revealed without duplicate discarded treachery or Condition", () => {
  let s = base();
  s.encounterDiscard = [G.localTrouble];
  s.queue = [fx("resolvePrintedWhenRevealed", { code: G.localTrouble })];
  flush(s);
  const chosen = s.choice!.options[0].id;
  s = choose(reload(s), chosen);
  assert.equal(
    s.encounterDiscard.filter((c) => c === G.localTrouble).length,
    0,
  );
  assert.equal(
    s.heroes
      .flatMap((h) => h.attachments)
      .filter((a) => a.code === G.localTrouble).length,
    1,
  );
  s = base();
  s.encounterDiscard = [G.lostCity];
  s.encounterDeck = [G.market];
  s.queue = [fx("resolvePrintedWhenRevealed", { code: G.lostCity })];
  flush(s);
  s = choose(s, "deck-0");
  assert.equal(s.encounterDiscard.filter((c) => c === G.lostCity).length, 1);
  assert.ok(s.staging.some((u) => u.code === G.market));
});
test("Market Square only offers resource pools that can actually spend under Orc Vanguard", () => {
  let s = base();
  s.phase = "travel";
  s.staging = [make(s, H.vanguard), make(s, G.market)];
  assert.match(canTravel(s, s.staging[1])!, /spend 1 resource/);
  const tactics = make(s, "01004");
  tactics.resources = 1;
  s.heroes.push(tactics);
  assert.equal(canTravel(s, s.staging[1]), null);
  s = act(s, { type: "TRAVEL", id: s.staging[1].id });
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [tactics.id],
  );
  s = choose(s, tactics.id);
  assert.equal(get(s, tactics.id)!.resources, 0);
});

test("Remove-token shadows include stage-three progress and preserve an explicit token-type choice", () => {
  let s = base();
  s.stage = 3;
  s.progress = 8;
  const e = enemy(s, G.pickpocket);
  s.combat = {
    enemyId: e.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
  };
  shadow(s, S.dissident);
  assert.equal(s.progress, 7);
  s.stewardFear!.questResources = 2;
  shadow(s, S.dissident);
  assert.match(s.choice!.title, /Remove 1 quest token/);
  s = choose(reload(s), "resource");
  assert.equal(s.progress, 7);
  assert.equal(s.stewardFear!.questResources, 1);
  shadow(s, S.falseLead);
  damage(s, s.heroes[0].id, 10, { enemyId: e.id, combatDamage: true });
  assert.equal(s.progress, 0);
  assert.equal(s.stewardFear!.questResources, 0);
});

test("Stage two returns every active location without duplicate zones or premature Underworld departure", () => {
  let s = base();
  const a = make(s, S.storehouse),
    b = make(s, S.sewers);
  s.activeLocation = a;
  s.extraActiveLocations = [b];
  s.stewardFear!.underneath = { [a.id]: [G.pickpocket], [b.id]: [H.bandit] };
  s.stewardFear!.hiddenPlot = S.counsels;
  s.stewardFear!.rootsSetAside = S.roots;
  s.stewardFear!.questResources = 4;
  advanceQuest(s);
  flush(s);
  assert.equal(s.extraActiveLocations.length, 0);
  assert.equal(s.activeLocation?.code, S.roots);
  assert.deepEqual(
    s.staging.filter((u) => [a.id, b.id].includes(u.id)).map((u) => u.id),
    [a.id, b.id],
  );
  assert.deepEqual(s.stewardFear!.underneath[a.id], [G.pickpocket]);
  assert.deepEqual(s.stewardFear!.underneath[b.id], [H.bandit]);
  s = reload(s);
  assert.equal(s.stage, 2);
});
test("Blanked Market Square permits Secret Map progress while retaining the actual attachment destination", () => {
  let s = base();
  const hero = s.heroes[0];
  const map = attachment(s, hero, S.map);
  const market = make(s, G.market);
  attachment(s, market, KHAZAD.fear);
  s.activeLocation = market;
  stats(s, market);
  assert.equal(market.blanked, true);
  assert.equal(
    availableAbilities(s, hero).find((a) => a.id === map.id)?.disabled,
    false,
  );
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: map.id });
  s = choose(s, market.id);
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes(G.market));
  assert.equal(s.stewardFear!.questResources, 1);
  assert.ok(s.victoryCards.includes(S.map));
});
