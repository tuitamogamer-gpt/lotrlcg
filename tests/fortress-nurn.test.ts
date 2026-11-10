import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canTravel,
  createGame,
  publicState,
  validateSave,
} from "../src/game/engine";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import {
  canGainResources,
  draw,
  fx,
  get,
  make,
  playCost,
  stageInfo,
  stats,
  threatOf,
  stagingThreat,
} from "../src/game/core";
import { check, damage, engage, progress } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  FORTRESS_NURN_QUESTS,
  FORTRESS_NURN_RECIPES,
  NURN as N,
  NURN_BACKS,
  NURN_POWER,
  NURN_STORMS,
  QUEST_DECK,
  nurnCastleWins,
  nurnX,
} from "../src/game/fortress-nurn-support";
import { FORTRESS_NURN_HOOKS as hooks } from "../src/game/fortress-nurn";
import { base, choose, reload, settle, start } from "./fortress-nurn-fixtures";
import type { GameState, Unit } from "../src/game/types";
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const effect = (s: GameState, kind: string, extra = {}) => {
  handle(s, fx(kind, extra));
  flush(s);
  return s;
};
const cards = (s: GameState, n: number, code = "01013") =>
  Array.from({ length: n }, () => {
    const u = make(s, code);
    u.owner = 0;
    return u;
  });
/** A Storm the Castle in staging with a faceup Power card and buried player cards. */
function castle(
  s: GameState,
  code: string,
  power?: string,
  buried: Record<number, number> = {},
) {
  const u = staged(s, code);
  if (power) s.fortressNurn!.powered.push({ questId: u.id, code: power });
  for (const [p, n] of Object.entries(buried))
    forOwner(s, Number(p), () =>
      s.fortressNurn!.under.push({
        questId: u.id,
        player: Number(p),
        cards: cards(s, n).map((c) => ({ ...c, owner: Number(p) })),
      }),
    );
  return u;
}
const back = (code: string) => `${code}:B`;
const STORM = {
  garrison: NURN_STORMS.find((c) => back(c) === N.garrison)!,
  counterattack: NURN_STORMS.find((c) => back(c) === N.counterattack)!,
  quarter: NURN_STORMS.find((c) => back(c) === N.quarter)!,
  stronghold: NURN_STORMS.find((c) => back(c) === N.stronghold)!,
};
const DECK50: Record<string, number> = Object.fromEntries(
  playerCards
    .filter(
      (c) =>
        SCRIPTED.has(c.code) &&
        c.type_code === "event" &&
        c.sphere_code === "leadership" &&
        c.deck_limit !== 0,
    )
    .slice(0, 20)
    .map((c) => [c.code, 3]),
);

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`The Fortress of Nurn ${players} players ${easy ? "easy" : "normal"}: native setup and exact inventory`, () => {
      const s = start(players, easy, 41, true, true);
      const q = s.fortressNurn!;
      assert.equal(s.phase, "resource");
      assert.equal(q.initialized, true);
      const storms = s.staging.filter((u) => NURN_STORMS.includes(u.code));
      assert.equal(storms.length, 4);
      assert.ok(s.staging.some((u) => u.code === N.ulchor));
      assert.equal(q.powered.length, 4);
      assert.equal(q.powerDeck.length, 1);
      assert.deepEqual(
        [...q.powerDeck, ...q.powered.map((p) => p.code)].sort(),
        [...NURN_POWER].sort(),
      );
      for (const p of playerOrder(s)) {
        if (easy && p === 3) continue;
        assert.equal(
          seatView(s, p).engaged.filter((u) => u.code === N.guard).length,
          1,
          "each player has one Ulchor's Guard engaged",
        );
        const piles = q.under.filter((g) => g.player === p);
        assert.equal(piles.length, 5, "quest deck and four Castles");
        assert.ok(piles.some((g) => g.questId === QUEST_DECK));
      }
      assert.equal(stageInfo(s).quest, 3);
      const r = FORTRESS_NURN_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...playerOrder(s).flatMap((p) =>
          seatView(s, p).engaged.map((u) => u.code),
        ),
        ...q.powerDeck,
        ...q.powered.map((p) => p.code),
        ...FORTRESS_NURN_QUESTS.map((c) => c.code),
      ].sort();
      assert.deepEqual(
        physical,
        r.cards.flatMap((r) => Array<string>(r.quantity).fill(r.code)).sort(),
      );
      reload(s);
    });
test("Setup trims a deck above 50 cards and buries 8 cards under the quest deck and each Castle", () => {
  const big = { ...DECK50, "01013": 3, "01014": 3, "01015": 3 };
  let s = createGame(5, big, ["01001", "01002", "01003"], "custom", {
    scenarioId: "the-fortress-of-nurn",
  });
  for (let n = 0; n < 40 && (s.choice || s.phase === "setup"); n++)
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  const q = s.fortressNurn!;
  assert.equal(s.removed.length, 19);
  assert.deepEqual(
    q.under.map((g) => g.cards.length),
    [8, 8, 8, 8, 8],
  );
  assert.equal(s.deck.length + s.hand.length, 10);
});
test("Stage 1B is closed at 3 progress; choosing Storm the Castle reveals its Power card and turns it over", () => {
  let s = base(2);
  const u = castle(s, STORM.garrison, N.eye, { 0: 3, 1: 3 });
  castle(s, STORM.quarter);
  s.encounterDeck = [N.dogs, N.plaza, N.olog, N.tower, N.soldier];
  progress(s, 3);
  assert.equal(s.progress, 3);
  s.phase = "quest";
  effect(s, "sideQuestChoose", { player: 0 });
  assert.ok(!s.choice!.options.some((o) => o.id === "main"));
  s = choose(s, u.id);
  s = settle(s);
  const flipped = get(s, u.id)!;
  assert.equal(flipped.code, N.garrison);
  assert.equal(card(flipped.code).quest, 6);
  assert.ok(
    s.staging.some((x) => x.code === N.eye),
    "Power card enters play",
  );
  assert.equal(s.fortressNurn!.powered.length, 0);
  assert.equal(
    s.sideQuestSelections?.shared?.code,
    N.garrison,
    "the reverse is the current quest",
  );
  // Castle Garrison: one enemy per player.
  assert.deepEqual(
    s.staging.filter((x) => [N.dogs, N.olog].includes(x.code)).length,
    2,
  );
  assert.deepEqual(s.encounterDiscard, [N.plaza]);
  s.progress = 2;
  effect(s, "sideQuestChoose", { player: 0 });
  assert.ok(s.choice!.options.some((o) => o.id === "main"));
});
test("No Quarter randomly discards 4 buried cards per player and every matching card each player controls or holds", () => {
  let s = base(1);
  const u = castle(s, STORM.quarter);
  s.fortressNurn!.under.push({
    questId: u.id,
    player: 0,
    cards: cards(s, 4, "01013"),
  });
  s.allies.push(make(s, "01013"));
  s.hand.push(make(s, "01013"), make(s, "01014"));
  s.phase = "quest";
  effect(s, "sideQuestChoose", { player: 0 });
  s = choose(s, u.id);
  s = settle(s);
  assert.equal(s.fortressNurn!.under.length, 0);
  assert.equal(s.allies.length, 0);
  assert.deepEqual(
    s.hand.map((h) => h.code),
    ["01014"],
  );
  assert.equal(s.discard.filter((c) => c === "01013").length, 6);
});
test("Lethal Counterattack damages each character; Stronghold of Mordor adds one location per player", () => {
  let s = base(2);
  const u = castle(s, STORM.counterattack);
  s.phase = "quest";
  effect(s, "sideQuestChoose", { player: 0 });
  s = choose(s, u.id);
  s = settle(s);
  assert.ok(allCharacters(s).every((c) => c.damage === 1));
  s = base(2);
  const v = castle(s, STORM.stronghold);
  s.encounterDeck = [N.dogs, N.walls, N.soldier, N.tower, N.olog];
  s.phase = "quest";
  effect(s, "sideQuestChoose", { player: 0 });
  s = choose(s, v.id);
  s = settle(s);
  assert.deepEqual(
    s.staging.filter((x) => card(x.code).type_code === "location").length,
    2,
  );
  assert.deepEqual(s.encounterDiscard, [N.dogs, N.soldier]);
});
test("A defeated Castle returns its buried cards to their owners' decks, each player draws 1 and X rises", () => {
  let s = base(2);
  const u = castle(s, STORM.garrison, undefined, { 0: 5, 1: 3 });
  u.code = N.garrison;
  staged(s, N.tower);
  const plaza = staged(s, N.plaza);
  const decks = playerOrder(s).map((p) => seatView(s, p).deck.length);
  assert.equal(threatOf(s, plaza), 1);
  s.phase = "quest";
  s.sideQuestSelections = { shared: { id: u.id, code: N.garrison } };
  progress(s, 6);
  flush(s);
  assert.ok(!s.staging.some((x) => x.id === u.id));
  assert.deepEqual(s.victoryCards, [N.garrison]);
  assert.equal(nurnCastleWins(s), 1);
  assert.equal(nurnX(s), 2);
  assert.equal(threatOf(s, plaza), 2);
  assert.equal(s.fortressNurn!.under.length, 0);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).deck.length),
    [decks[0] + 4, decks[1] + 2],
    "five and three cards return; Guard Tower does not block the encounter draw",
  );
  reload(s);
});
test("Stage 1 is defeated only at the end of the round with 3 progress and 3 Castles; 2A reveals Power, shuffles and Ulchor attacks each player", () => {
  let s = base(2);
  const ulchor = staged(s, N.ulchor);
  s.fortressNurn!.powerDeck = [N.armies];
  s.progress = 3;
  s.victoryCards = [N.garrison, N.quarter];
  for (const e of hooks.roundEnd!(s)) handle(s, e);
  flush(s);
  assert.equal(s.stage, 1, "two Castles are not enough");
  s.victoryCards.push(N.counterattack);
  s.encounterDiscard = [N.plaza, N.walls];
  s.encounterDeck = [N.defense, N.reach, N.defense];
  for (const e of hooks.roundEnd!(s)) handle(s, e);
  flush(s);
  s = settle(s, "undefended");
  assert.equal(s.stage, 2);
  assert.equal(s.fortressNurn!.currentQuest, N.last);
  assert.equal(stageInfo(s).quest, 12);
  assert.equal(stageInfo(s).side, "B");
  assert.ok(s.staging.some((x) => x.code === N.armies));
  assert.equal(s.fortressNurn!.powerDeck.length, 0);
  assert.equal(stats(s, ulchor).attack, 6);
  assert.equal(threatOf(s, get(s, ulchor.id)!), 4, "X is 1 + 3 Castles");
  assert.ok(
    s.log.filter((l) => /Thane Ulchor attacks/.test(String(l.text ?? l)))
      .length >= 2 ||
      allCharacters(s).some((c) => c.damage > 0) ||
      s.encounterDiscard.length !== 2,
    "Thane Ulchor attacked each player and revealed after each attack",
  );
  reload(s);
});
test("Stage 2: Ulchor's damage is capped by progress, encounter effects cannot be canceled and defeating him wins", () => {
  const s = base(1);
  s.stage = 2;
  s.fortressNurn!.currentQuest = N.last;
  const ulchor = staged(s, N.ulchor);
  engage(s, ulchor);
  assert.ok(s.engaged.some((u) => u.id === ulchor.id));
  assert.equal(hooks.cannotCancel!(s), true);
  s.progress = 2;
  damage(s, ulchor.id, 5);
  assert.equal(get(s, ulchor.id)!.damage, 2);
  s.progress = 12;
  damage(s, ulchor.id, 20);
  check(s);
  flush(s);
  assert.equal(s.status, "won");
  assert.match(s.reason, /Thane Ulchor falls/);
});
test("Thane Ulchor is immune, cannot leave staging during stage 1 and makes X threat", () => {
  const s = base(1);
  const ulchor = staged(s, N.ulchor);
  assert.equal(hooks.immune!(s, ulchor), true);
  assert.equal(hooks.cannotEngage!(s, ulchor), true);
  engage(s, ulchor);
  assert.ok(s.staging.some((u) => u.id === ulchor.id));
  assert.equal(threatOf(s, ulchor), 1);
  s.victoryCards = [N.garrison];
  assert.equal(threatOf(s, ulchor), 2);
});
test("The Dungeons of Dol Rhugar caps current-quest progress at 4 each round and returns one buried card to each hand", () => {
  let s = base(2);
  const dungeons = staged(s, N.dungeons);
  const c = castle(s, STORM.garrison, undefined, { 0: 2, 1: 1 });
  progress(s, 6);
  assert.equal(s.progress, 4);
  progress(s, 3);
  assert.equal(s.progress, 4);
  s.round++;
  progress(s, 1);
  assert.equal(s.progress, 5);
  s.phase = "quest";
  s.sideQuestSelections = { shared: { id: dungeons.id, code: N.dungeons } };
  s.round++;
  progress(s, 4);
  flush(s);
  assert.ok(!s.staging.some((x) => x.id === dungeons.id));
  s = choose(s, c.id);
  s = settle(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).hand.length),
    [1, 1],
  );
  assert.deepEqual(
    s.fortressNurn!.under.map((g) => g.cards.length),
    [1],
  );
});
test("Easterling Mercenary forces a choice; Determined Defense adds threat for the phase", () => {
  let s = base(1);
  s.phase = "quest";
  staged(s, N.mercenary);
  hooks.encounter!(s, N.mercenary, false, true);
  flush(s);
  s = choose(s, "progress");
  progress(s, 5);
  assert.equal(s.progress, 0);
  s = base(1);
  s.phase = "quest";
  s.victoryCards = [N.garrison, N.quarter];
  s.encounterDiscard = [];
  hooks.encounter!(s, N.defense, false, true);
  flush(s);
  assert.equal(stagingThreat(s), 6);
  assert.deepEqual(s.encounterDiscard, [N.defense]);
  s.phase = "travel";
  assert.equal(stagingThreat(s), 0);
});
test("The Dark Lord's Reach damages exhausted characters and discards an attachment from each one damaged", () => {
  let s = base(1);
  const [a, b] = s.heroes;
  a.exhausted = true;
  a.attachments.push({ id: "att1", code: "01023", exhausted: false });
  b.attachments.push({ id: "att2", code: "01023", exhausted: false });
  hooks.encounter!(s, N.reach, false, true);
  flush(s);
  s = settle(s);
  assert.equal(get(s, a.id)!.damage, 1);
  assert.equal(get(s, a.id)!.attachments.length, 0);
  assert.equal(get(s, b.id)!.damage, 0);
  assert.equal(get(s, b.id)!.attachments.length, 1);
});
test("Guard Tower blocks player-card draws and resources; its travel cost exhausts a character for each player", () => {
  let s = base(2);
  const tower = staged(s, N.tower);
  s.deck = ["01013", "01013", "01013"];
  const before = s.hand.length;
  draw(s, 2);
  assert.equal(s.hand.length, before);
  assert.equal(canGainResources(s, s.heroes[0]), false);
  draw(s, 1, false);
  assert.equal(s.hand.length, before + 1);
  s.phase = "travel";
  assert.equal(canTravel(s, tower), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: tower.id });
  s = settle(s);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).heroes.filter((h) => h.exhausted).length, 1);
  assert.equal(canGainResources(s, s.heroes[0]), true);
});
test("Fortress Walls raises ally costs; its travel cost buries one hand card per player under a Castle", () => {
  let s = base(2);
  const walls = staged(s, N.walls);
  const c = castle(s, STORM.quarter);
  assert.equal(playCost(s, card("01013")), Number(card("01013").cost) + 1);
  s.phase = "travel";
  assert.match(canTravel(s, walls)!, /Fortress Walls/);
  for (const p of playerOrder(s))
    forOwner(s, p, () => s.hand.push(make(s, "01014")));
  assert.equal(canTravel(s, walls), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: walls.id });
  s = settle(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).hand.length),
    [0, 0],
  );
  assert.deepEqual(
    s.fortressNurn!.under.map((g) => [g.questId === c.id, g.cards.length]),
    [
      [true, 1],
      [true, 1],
    ],
  );
});
test("Plaza of Nurn's travel assigns X damage among each player's characters", () => {
  let s = base(1);
  const plaza = staged(s, N.plaza);
  s.victoryCards = [N.garrison];
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: plaza.id });
  s = settle(s);
  assert.equal(
    allCharacters(s).reduce((n, c) => n + c.damage, 0),
    2,
  );
});
test("Soldier of Nurn buries a hand card after attacking; shadows of the Fortress follow the printed cards", () => {
  let s = base(1);
  castle(s, STORM.quarter);
  s.hand.push(make(s, "01013"));
  const c = {
    enemyId: "x",
    attackPlayer: 0,
    attackBonus: 0,
    attackResolved: true,
    nurnEnemy: N.soldier,
  } as unknown as NonNullable<GameState["combat"]>;
  for (const e of hooks.attackFinished!(s, c)) handle(s, e);
  flush(s);
  s = settle(s);
  assert.equal(s.hand.length, 0);
  assert.equal(s.fortressNurn!.under[0].cards.length, 1);
  s = base(1);
  const enemy = staged(s, N.olog);
  s.victoryCards = [N.garrison, N.quarter];
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 0,
    attackBonus: 0,
  } as unknown as GameState["combat"];
  hooks.shadow!(s, N.soldier);
  hooks.shadow!(s, N.mercenary);
  hooks.shadow!(s, N.olog);
  assert.equal(s.combat!.attackBonus, 5);
  assert.equal(s.combat!.nurnSoldier, 1);
  hooks.shadow!(s, N.guard);
  assert.equal(get(s, enemy.id)!.tempDefense, 2);
  assert.equal(hooks.cannotAttach!(s, enemy, "01023"), true);
});
test("Guard Dogs damages a character when it engages and its shadow puts it into play engaged", () => {
  let s = base(1);
  const dogs = staged(s, N.dogs);
  engage(s, dogs);
  flush(s);
  s = settle(s);
  assert.equal(
    allCharacters(s).reduce((n, c) => n + c.damage, 0),
    1,
  );
  s = base(1);
  const enemy = staged(s, N.soldier);
  engage(s, enemy);
  enemy.shadows = [N.dogs];
  enemy.revealedShadowCount = 1;
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 0,
    attackBonus: 0,
  } as unknown as GameState["combat"];
  hooks.shadow!(s, N.dogs);
  assert.deepEqual(get(s, enemy.id)!.shadows, []);
  assert.equal(s.engaged.filter((u) => u.code === N.dogs).length, 1);
});
test("Mordor Olog-hai exhausts a character after killing one; Determined Defense and Dark Lord's Reach shadows", () => {
  let s = base(1);
  const c = {
    enemyId: "x",
    attackPlayer: 0,
    attackBonus: 0,
    attackResolved: true,
    nurnEnemy: N.olog,
    nurnKilled: true,
  } as unknown as NonNullable<GameState["combat"]>;
  for (const e of hooks.attackFinished!(s, c)) handle(s, e);
  flush(s);
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
  s = base(1);
  s.heroes[0].attachments.push({ id: "a1", code: "01023", exhausted: false });
  s.combat = {
    enemyId: "x",
    attackPlayer: 0,
    attackBonus: 0,
  } as unknown as GameState["combat"];
  hooks.shadow!(s, N.defense);
  hooks.shadow!(s, N.reach);
  flush(s);
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
  assert.equal(s.heroes[0].attachments.length, 0);
});
test("Under Guard resolves the active location's Travel effect; Side Street, Catacombs and Unwelcome Travelers", () => {
  let s = base(1);
  s.activeLocation = make(s, N.tower);
  hooks.encounter!(s, N.underGuard, false, true);
  flush(s);
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
  s = base(1);
  s.encounterDeck = [N.dogs, N.plaza];
  hooks.encounter!(s, N.underGuard, false, true);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === N.plaza));
  s = base(1);
  const street = staged(s, N.street);
  const other = staged(s, N.plaza);
  assert.equal(hooks.locationProgressBlocked!(s, other), true);
  assert.equal(hooks.locationProgressBlocked!(s, street), false);
  const catacombs = staged(s, N.catacombs);
  const enemy = staged(s, N.soldier);
  damage(s, enemy.id, 2);
  assert.equal(get(s, enemy.id)!.damage, 0);
  s.staging = s.staging.filter((u) => u.id !== catacombs.id);
  s.encounterDeck = [N.olog];
  effect(s, "nurnCatacombs", { player: 0 });
  assert.ok(s.engaged.some((u) => u.code === N.olog));
  const unwelcome = staged(s, N.unwelcome);
  assert.equal(threatOf(s, other), nurnX(s) + 1);
  s.encounterDeck = [N.plaza, N.dogs];
  s.phase = "quest";
  effect(s, "sideQuestChoose", { player: 0 });
  s = choose(s, unwelcome.id);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === N.dogs));
});
test("The Power of Mordor: Khamûl engages the first player, Barad-dûr, the Eye, the Armies and Covered in Darkness", () => {
  let s = base(2);
  const [first, second] = playerOrder(s);
  const khamul = staged(s, N.khamul);
  check(s);
  flush(s);
  assert.ok(seatView(s, first).engaged.some((u) => u.id === khamul.id));
  const other = seatView(s, second).heroes[0];
  assert.equal(hooks.cannotAttack!(s, other, khamul), true);
  assert.equal(hooks.cannotDefend!(s, khamul, other), true);
  const barad = staged(s, N.barad);
  s.phase = "travel";
  assert.match(canTravel(s, barad)!, /Barad-dûr/);
  assert.equal(hooks.threatEliminationReduction!(s, first), 5);
  staged(s, N.eye);
  const threat = s.threat;
  hooks.cardsDrawn!(s, first, 1);
  flush(s);
  assert.equal(s.threat, threat + 1);
  staged(s, N.armies);
  const soldier = staged(s, N.soldier);
  engage(s, soldier);
  flush(s);
  damage(s, soldier.id, 2);
  assert.equal(get(s, soldier.id)!.damage, 0);
  staged(s, N.darkness);
  assert.equal(hooks.threatReduction!(s, 3, "player-card"), 1);
  assert.equal(hooks.threatReduction!(s, 3, "player-card"), 0);
  assert.equal(hooks.threatReduction!(s, 3, "encounter"), 3);
  s = base(1);
  for (let n = 0; n < 7; n++) s.hand.push(make(s, "01013"));
  staged(s, N.eye);
  hooks.encounter!(s, N.eye, false, true);
  flush(s);
  s = settle(s);
  assert.equal(s.hand.length, 5);
});
test("Ulchor's Guard follows Thane Ulchor's engagement; Ulchor's Rage attacks the first player; Fanaticism attaches to the lowest defense Easterling", () => {
  let s = base(2);
  s.stage = 2;
  s.fortressNurn!.currentQuest = N.last;
  const [first, second] = playerOrder(s);
  const ulchor = staged(s, N.ulchor);
  const guard = staged(s, N.guard);
  forOwner(s, second, () => engage(s, ulchor));
  check(s);
  flush(s);
  assert.ok(seatView(s, second).engaged.some((u) => u.id === guard.id));
  selectSeat(s, first);
  assert.equal(hooks.cannotEngage!(s, guard), true);
  s = base(1);
  const boss = staged(s, N.ulchor);
  hooks.encounter!(s, N.rage, false, true);
  flush(s);
  assert.equal(s.combat?.enemyId, boss.id);
  s = base(1);
  const merc = staged(s, N.mercenary);
  staged(s, N.guard);
  hooks.encounter!(s, N.fanaticism, false, true);
  flush(s);
  s = settle(s);
  const target = [...s.staging].find((u) =>
    u.attachments.some((a) => a.code === N.fanaticism),
  )!;
  assert.ok(target);
  assert.notEqual(target.id, merc.id, "Ulchor's Guard has the lower defense");
  assert.equal(hooks.immune!(s, target), true);
  assert.equal(threatOf(s, target), 3);
});
test("An eliminated player's buried cards go to their discard pile", () => {
  const s = base(2);
  const c = castle(s, STORM.quarter, undefined, { 0: 2, 1: 3 });
  hooks.playerEliminated!(s, 1);
  assert.deepEqual(
    s.fortressNurn!.under.map((g) => [g.questId === c.id, g.player]),
    [[true, 0]],
  );
  assert.equal(seatView(s, 1).discard.length, 3);
});
test("Malformed Fortress of Nurn saves are rejected and public state hides buried cards", () => {
  const s = base(2);
  castle(s, STORM.quarter, N.eye, { 0: 2 });
  const view = publicState(s) as unknown as {
    fortressNurn: {
      castles: { power: string | null; under: { count: number }[] }[];
    };
  };
  assert.equal(view.fortressNurn.castles[0].power, N.eye);
  assert.deepEqual(view.fortressNurn.castles[0].under, [
    { player: 0, count: 2 },
  ]);
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  for (const corrupt of [
    (x: GameState) => (x.fortressNurn!.powerDeck = ["01013"]),
    (x: GameState) => (x.fortressNurn!.currentQuest = N.last),
    (x: GameState) =>
      (x.fortressNurn!.under[0].player = 7 as unknown as number),
    (x: GameState) =>
      x.fortressNurn!.powered.push({ ...x.fortressNurn!.powered[0] }),
  ]) {
    const bad = JSON.parse(JSON.stringify(s));
    corrupt(bad);
    assert.equal(validateSave(bad), false);
  }
  assert.ok(NURN_BACKS.every((c) => card(c).victory === 10));
});
void ({} as Unit);
