import assert from "node:assert/strict";
import {
  createGame,
  applyAction,
  restoreSave,
  validateSave,
} from "../src/game/engine.ts";
import { STARTERS } from "../src/game/cards.ts";
import { make, shuffle } from "../src/game/core.ts";
import {
  firstPlayer,
  forOwner,
  playerOrder,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import { FATE as F, FATE_RECIPES } from "../src/game/fate-numenor-support.ts";
import type { GameState } from "../src/game/types.ts";
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(53, d.cards, d.heroes, d.id, {
    scenarioId: "the-fate-of-numenor",
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
  for (let i = 0; s.phase === "setup" && i < 80; i++)
    s = applyAction(
      s,
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  assert.notEqual(s.phase, "setup");
  return s;
}
export function base(players = 1, stage = 1) {
  const s = start(players);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDeck: Array(30).fill("01099"),
    encounterDiscard: [],
    stage,
    stageRevealing: false,
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.allies = [];
      s.engaged = [];
      s.hand = [];
      s.discard = [];
      s.used = [];
      s.committedIds = [];
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          resources: 10,
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
  const recipe = FATE_RECIPES.find((r) => r.mode === "standard")!;
  s.fateNumenor = {
    initialized: true,
    unchartedDeck: shuffle(
      s,
      recipe.cards
        .filter((r) => r.section === "sharedEncounterDeck2")
        .flatMap((r) => Array<string>(r.quantity).fill(r.code)),
    ),
    setAside: stage === 1 ? [make(s, F.shrine)] : [],
    hiddenBacks: {},
    lookedBy: {},
    fogPhase: null,
    fogThreat: 0,
    bottomOnDestroy: [],
    curseDamageIds: [],
  };
  const guide = make(s, F.calphon);
  guide.owner = firstPlayer(s);
  forOwner(s, firstPlayer(s), () => s.allies.push(guide));
  return s;
}
export function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return applyAction(s, { type: "CHOOSE", id });
}
export function reload(s: GameState) {
  syncSeat(s);
  const saved = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(saved), "Fate save validates");
  return restoreSave(saved)!;
}
