/**
 * The Fords of Isen's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (after the players advance to a new quest stage, each player with
 * fewer than 3 cards in hand draws 3 cards) and its Nightmare encounter
 * cards, composed with the scenario's own rules (src/game/fords-isen.ts)
 * through batch4Scenario while a Nightmare mode game is played. The
 * scenario's time counters, draw reactions and damage division serve the
 * Nightmare cards too. Effects use the "nfi" prefix.
 */
import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card } from "./cards";
import { draw, fx, get, log, prepend } from "./core";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  globalPlayerOrder,
  playerOrder,
  seatView,
} from "./table";
import { NIGHTMARE_VOI as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareFordsState {
  /** Eastern Shore: the players who played an event this round. */
  fordsEvents?: { round: number; players: number[] };
}

const fiLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "fords-of-isen";
const handOf = (s: GameState, p: number) => seatView(s, p).hand.length;
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
/** The player an enemy is engaged with, if any. */
const engagedWith = (s: GameState, u: Unit) =>
  globalPlayerOrder(s).find((p) =>
    seatView(s, p).engaged.some((x) => x.id === u.id),
  );

// ------------------------------------------------------------- the setup card

/** "Forced: After the players advance to a new quest stage, each player with fewer than 3 cards in his hand draws 3 cards." */
function fiStageRevealed(s: GameState, stage: number) {
  if (!fiLive(s) || stage < 2) return;
  const players = playerOrder(s).filter((p) => handOf(s, p) < 3);
  if (!players.length) return;
  log(
    s,
    "The Fords of Isen · Nightmare: each player with fewer than 3 cards in hand draws 3 cards.",
  );
  prepend(s, ...players.map((player) => fx("nfiDraw", { value: 3, player })));
}

// ------------------------------------------------------------- the cards

/** Dunland Assassin: "cannot be optionally engaged by a player with 3 or more cards in his hand." */
const fiCannotOptionallyEngage = (s: GameState, u: Unit) =>
  fiLive(s) && live(s, u, N.assassin) && handOf(s, activeSeat(s)) >= 3;
/** Dunland Assassin, in the staging area: "Forced: After the first player draws any number of cards, Dunland Assassin makes an immediate attack against him." */
function fiCardsDrawn(s: GameState, player: number, count: number) {
  if (!fiLive(s) || count <= 0 || player !== firstPlayer(s)) return;
  const assassins = staged(s, N.assassin);
  if (!assassins.length) return;
  log(
    s,
    "Dunland Assassin: the first player drew; it makes an immediate attack against them.",
    "danger",
  );
  prepend(
    s,
    ...assassins.map((u) =>
      fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
    ),
  );
}
/**
 * Savage Hillman: "While the engaged player has 3 or more cards in hand,
 * Savage Hillman cannot take damage. While the engaged player has 5 or more
 * cards in hand, Savage Hillman gets +2 [attack]."
 */
function savageHand(s: GameState, u: Unit) {
  if (!fiLive(s) || !live(s, u, N.savage)) return 0;
  const p = engagedWith(s, u);
  return p === undefined ? 0 : handOf(s, p);
}
function fiDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (amount <= 0 || savageHand(s, u) < 3) return amount;
  log(
    s,
    "Savage Hillman cannot take damage while the engaged player has 3 or more cards in hand.",
  );
  return 0;
}
const fiStats = (s: GameState, u: Unit) =>
  savageHand(s, u) >= 5 ? { attack: 2 } : {};
/** Western Shore: "X is the number of cards in the first player's hand. While Western Shore is in the staging area, each enemy gets -X engagement cost." */
const fiThreatBonus = (s: GameState, u: Unit) =>
  fiLive(s) && live(s, u, N.western) ? handOf(s, firstPlayer(s)) : 0;
const fiEngagementBonus = (s: GameState, u: Unit) =>
  fiLive(s) && isEnemy(u)
    ? -staged(s, N.western).length * handOf(s, firstPlayer(s))
    : 0;
/** Eastern Shore: "While Eastern Shore is in the staging area, each player cannot play more than 1 event each round." */
function fiEventPlayed(s: GameState, u: Unit) {
  if (!fiLive(s)) return;
  const q = (s.nightmare ??= {});
  const t =
    q.fordsEvents?.round === s.round
      ? q.fordsEvents
      : { round: s.round, players: [] };
  const p = u.owner ?? activeSeat(s);
  if (!t.players.includes(p)) t.players.push(p);
  q.fordsEvents = t;
}
function fiPlayProblem(s: GameState, code: string) {
  if (
    !fiLive(s) ||
    card(code).type_code !== "event" ||
    !staged(s, N.eastern).length
  )
    return null;
  const t = s.nightmare?.fordsEvents;
  return t?.round === s.round && t.players.includes(activeSeat(s))
    ? "Eastern Shore: each player cannot play more than 1 event each round."
    : null;
}
/** Isen River: "While Isen River is in the staging area, each player cannot discard cards from his hand." */
const fiCannotDiscardHand = (s: GameState) =>
  fiLive(s) && staged(s, N.isenRiver).length > 0;
/** Isen River: "Forced: After Isen River becomes the active location, each player draws a card." */
function fiTravelEntered(s: GameState, u: Unit) {
  if (!fiLive(s) || !live(s, u, N.isenRiver)) return;
  if (!allActiveLocations(s).some((l) => l.id === u.id)) return;
  log(s, "Isen River becomes the active location: each player draws a card.");
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("nfiDraw", { value: 1, player })),
  );
}
/** Vengeful Hillman: "Forced: After Vengeful Hillman attacks and destroys a character, remove 1 progress from the current quest for each card in the defending player's hand." */
function fiCharacterDestroyed(s: GameState, _u: Unit, ctx: DamageContext) {
  const c = s.combat;
  if (!fiLive(s) || !c || !ctx.combatDamage || ctx.enemyId !== c.enemyId)
    return;
  const enemy = get(s, c.enemyId);
  if (!enemy || !live(s, enemy, N.vengeful) || c.nmKillResolved) return;
  c.nmKillResolved = true;
  const hand = handOf(s, c.attackPlayer ?? firstPlayer(s));
  if (hand)
    prepend(
      s,
      fx("nfiRemoveProgress", { value: hand, player: firstPlayer(s) }),
    );
}

function fiEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!fiLive(s) || code !== N.brutal) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Brutal Assault: "Each player assigns X damage among characters he
  // controls, where X is the number of cards in his hand."
  prepend(
    s,
    ...playerOrder(s)
      .filter((p) => handOf(s, p) > 0)
      .map((player) =>
        fx("fordsDivideDamage", {
          value: handOf(s, player),
          code,
          effects: [],
          player,
        }),
      ),
  );
  return true;
}

function fiShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !fiLive(s)) return false;
  const attacked = c.attackPlayer ?? firstPlayer(s);
  switch (code) {
    // Vengeful Hillman: "Attacking enemy gets +2 [attack]."
    case N.vengeful:
      c.attackBonus += 2;
      return true;
    // Western Shore: "If you have 5 or more cards in your hand, this attack
    // is considered undefended."
    case N.western:
      if (handOf(s, attacked) >= 5) {
        c.defenderId = null;
        c.defenderIds = [];
        log(
          s,
          "Western Shore: the defending player has 5 or more cards in hand; this attack is considered undefended.",
          "danger",
        );
      }
      return true;
    // Eastern Shore: "Attacking enemy gets +1 [attack]. If this attack
    // destroys a character, remove 1 time counter from the current quest."
    case N.eastern:
      c.attackBonus += 1;
      c.fordsTimeOnKill = (c.fordsTimeOnKill ?? 0) + 1;
      return true;
    // Brutal Assault: "Assign X damage among characters you control. X is
    // the number of cards in your hand."
    case N.brutal: {
      const hand = handOf(s, attacked);
      if (hand)
        prepend(
          s,
          fx("fordsDivideDamage", {
            value: hand,
            code,
            effects: [],
            player: attacked,
          }),
        );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareFordsEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nfi")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nfiDraw":
      forOwner(s, p, () => draw(s, e.value ?? 1));
      return true;
    case "nfiRemoveProgress": {
      const removed = Math.min(s.progress, e.value ?? 0);
      s.progress -= removed;
      log(
        s,
        `Vengeful Hillman: ${removed} progress ${removed === 1 ? "is" : "are"} removed from the current quest${seatLabel(s, p)}.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_FORDS_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stageRevealed: fiStageRevealed,
  cannotOptionallyEngage: fiCannotOptionallyEngage,
  cardsDrawn: fiCardsDrawn,
  damageAmount: fiDamageAmount,
  stats: fiStats,
  threatBonus: fiThreatBonus,
  engagementBonus: fiEngagementBonus,
  eventPlayed: fiEventPlayed,
  playProblem: fiPlayProblem,
  cannotDiscardHand: fiCannotDiscardHand,
  travelEntered: fiTravelEntered,
  characterDestroyed: fiCharacterDestroyed,
  encounter: fiEncounter,
  shadow: fiShadow,
  effect: nightmareFordsEffect,
  sharedEffect: (e) => e.kind === "nfiRemoveProgress",
};

// ------------------------------------------------------------- saves

export function validNightmareFords(s: GameState) {
  const t = s.nightmare?.fordsEvents;
  const seats = s.table?.seats.length ?? 1;
  return (
    t === undefined ||
    (!!t &&
      Number.isInteger(t.round) &&
      t.round >= 0 &&
      Array.isArray(t.players) &&
      t.players.every((p) => Number.isInteger(p) && p >= 0 && p < seats))
  );
}
