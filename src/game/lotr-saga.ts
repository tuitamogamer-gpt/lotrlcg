import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  spendResources,
} from "./core";
import { depositInFlightEncounterCards } from "./board";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import {
  ROAD_DARKENS_FRODO,
  SAGA_FRODO,
  TOS_ARAGORN,
  isLotrSagaScenarioId,
  isOneRing,
  isRingBearerCode,
  isTreasonSarumanScenarioId,
  fellowshipAragornCode,
  sagaRingCards,
} from "./lotr-saga-codes";
import { playerEffectImmune } from "./player-effect-immunity";
import { raiseThreat } from "./board";
import { batch4Scenario } from "./batch4-scenarios";
export * from "./lotr-saga-codes";

/**
 * The Lord of the Rings Saga rules shared by its scenarios: the first player
 * controls the Ring-bearer, a Fellowship hero carrying The One Ring, in
 * addition to that player's heroes. Control passes with the first player
 * token, with the hero's resources and attachments. If The One Ring leaves
 * play, the players lose the game. During staging the players reveal their
 * encounter cards one at a time in player order.
 */
export const lotrSaga = (s: GameState) => isLotrSagaScenarioId(s.scenarioId);
/** The hero carrying The One Ring. */
export const ringBearer = (s: GameState): Unit | undefined =>
  globalCharacters(s).find((u) => u.attachments.some((a) => isOneRing(a.code)));
export const oneRing = (s: GameState) =>
  ringBearer(s)?.attachments.find((a) => isOneRing(a.code));
export const oneRingExhausted = (s: GameState) => !!oneRing(s)?.exhausted;
/** The Treason of Saruman: the Fellowship Aragorn stands in for the Ring-bearer. */
export const treasonSaruman = (s: GameState) =>
  isTreasonSarumanScenarioId(s.scenarioId);
export const tosAragorn = (s: GameState): Unit | undefined =>
  treasonSaruman(s)
    ? globalCharacters(s).find((u) => u.code === TOS_ARAGORN)
    : undefined;
/**
 * The Treason of Saruman and The Flame of the West place a Fellowship Aragorn
 * instead of the Ring-bearer.
 */
export const aragornSaga = (s: GameState) =>
  !!fellowshipAragornCode(s.scenarioId);
export const fellowshipAragorn = (s: GameState): Unit | undefined => {
  const code = fellowshipAragornCode(s.scenarioId);
  return code ? globalCharacters(s).find((u) => u.code === code) : undefined;
};
/**
 * The Fellowship hero the first player controls: the Ring-bearer with The One
 * Ring, or the Fellowship Aragorn.
 */
export const sagaHero = (s: GameState): Unit | undefined =>
  aragornSaga(s) ? fellowshipAragorn(s) : ringBearer(s);
/** Setup: the first player gains control of Frodo Baggins and attaches The One Ring. */
export function placeRingBearer(s: GameState) {
  if (!lotrSaga(s) || sagaHero(s)) return;
  const first = s.table?.first ?? 0;
  const codes = sagaRingCards(s.scenarioId);
  forOwner(s, first, () => {
    const frodo = make(s, codes.frodo);
    frodo.owner = first;
    frodo.controller = first;
    if (codes.ring) {
      const ring = make(s, codes.ring);
      frodo.attachments.push({
        id: ring.id,
        code: codes.ring,
        exhausted: false,
      });
    }
    s.heroes.push(frodo);
  });
  log(
    s,
    codes.ring
      ? `${s.table ? `Player ${first + 1}` : "The first player"} claims The One Ring and gains control of the Ring-bearer, Frodo Baggins.`
      : `${s.table ? `Player ${first + 1}` : "The first player"} gains control of the Fellowship hero Aragorn.`,
    "good",
  );
}
/**
 * The Treason of Saruman and The Flame of the West: the Fellowship Aragorn is
 * unique, so a player's other Aragorn is set aside at setup, as the insert's
 * campaign rule has a player lose that version of Aragorn.
 */
export function sagaLineUp(scenarioId: string | undefined, heroes: string[]) {
  const aragorn = fellowshipAragornCode(scenarioId);
  if (!aragorn) return heroes;
  return heroes.filter(
    (h) => h === aragorn || card(h).name !== card(aragorn).name,
  );
}
/** Control of the Ring-bearer passes with the first player token. */
export function ringBearerFollowsFirstPlayer(s: GameState) {
  const bearer = sagaHero(s);
  if (!bearer || !s.table || !lotrSaga(s)) return;
  const from = ownerOf(s, bearer),
    to = firstPlayer(s);
  if (from === to || !globalPlayerOrder(s).includes(to)) return;
  forOwner(s, from, () => {
    s.heroes = s.heroes.filter((u) => u.id !== bearer.id);
    s.committedIds = s.committedIds.filter((id) => id !== bearer.id);
  });
  bearer.owner = to;
  bearer.controller = to;
  forOwner(s, to, () => s.heroes.push(bearer));
  log(
    s,
    aragornSaga(s)
      ? `Player ${to + 1} gains control of the Fellowship hero ${name(bearer)}, with his resources and attachments.`
      : `Player ${to + 1} gains control of the Ring-bearer, ${name(bearer)}, with The One Ring, resources and attachments.`,
  );
}
export function loseOneRing(s: GameState) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = aragornSaga(s)
    ? "Aragorn has left play. The players lose the game."
    : "The One Ring has left play. The players lose the game.";
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, s.reason, "danger");
}
/**
 * The players lose as soon as The One Ring is no longer in play; in The
 * Treason of Saruman, as soon as Aragorn leaves play.
 */
export function lotrSagaCheck(s: GameState) {
  if (lotrSaga(s) && s.status === "playing" && !sagaHero(s)) loseOneRing(s);
}
/** Saga staging: each player reveals their own encounter card in player order. */
export function sagaRevealPlayer(s: GameState, index: number, first: number) {
  if (!lotrSaga(s)) return first;
  return playerOrder(s)[index] ?? first;
}
/** Fellowship heroes are placed by the Saga; players never choose them. */
export const isFellowshipHero = (code: string) =>
  isRingBearerCode(code) || card(code).sphere_code === "fellowship";

// ---------------------------------------------------------------------------
// Frodo Baggins: cancel the effects of an encounter card just revealed.

const frodo = (s: GameState) =>
  globalCharacters(s).find((u) => u.code === SAGA_FRODO && !u.blanked);
/** Response options offered when an encounter card is revealed from the deck. */
export function ringBearerRevealOptions(
  s: GameState,
  code: string,
  revealOrigin: Effect["revealOrigin"],
  resume: Effect,
): Option[] {
  if (!lotrSaga(s) || revealOrigin !== "encounter") return [];
  if (/cannot be cancel/i.test(card(code).text ?? "")) return [];
  const hero = frodo(s);
  const ring = hero?.attachments.find((a) => isOneRing(a.code));
  if (!hero || !ring || ring.exhausted || ring.blanked || hero.resources < 1)
    return [];
  const player = ownerOf(s, hero);
  return [
    {
      id: `saga-frodo-${player}`,
      label:
        "Frodo Baggins · Spend 1 resource and exhaust The One Ring to cancel this card, shuffle it back and reveal another",
      code: SAGA_FRODO,
      ability: { player, source: hero.id, code: SAGA_FRODO, type: "response" },
      effects: [
        fx("sagaFrodoCancel", {
          code,
          target: hero.id,
          source: resume.source,
          revealOrigin: resume.revealOrigin,
          player: resume.player ?? activeSeat(s),
          effects: [resume],
        }),
      ],
    },
  ];
}
// ---------------------------------------------------------------------------
// The Road Darkens' Frodo Baggins: after he exhausts to defend, the attack
// deals no damage.

/** Responses after defenders are declared: Frodo exhausted to defend this attack. */
export function roadDarkensFrodoDefended(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
  exhaustedIds: string[],
): Effect[] {
  if (!lotrSaga(s)) return [];
  const hero = defenders.find(
    (d) =>
      d.code === ROAD_DARKENS_FRODO &&
      !d.blanked &&
      exhaustedIds.includes(d.id),
  );
  if (!hero) return [];
  const ring = hero.attachments.find((a) => isOneRing(a.code));
  if (!ring || ring.exhausted || ring.blanked || hero.resources < 1) return [];
  // "Target the attacking enemy": an enemy immune to player card effects cannot be chosen.
  if (playerEffectImmune(s, enemy, ROAD_DARKENS_FRODO)) return [];
  return [
    fx("sagaFrodoDefenseOffer", {
      target: hero.id,
      source: enemy.id,
      player: ownerOf(s, hero),
    }),
  ];
}
export function lotrSagaEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "sagaFrodoDefenseOffer": {
      const hero = get(s, e.target);
      const ring = hero?.attachments.find((a) => isOneRing(a.code));
      if (
        !hero ||
        !ring ||
        ring.exhausted ||
        hero.resources < 1 ||
        s.combat?.enemyId !== e.source
      )
        return true;
      const player = e.player ?? activeSeat(s);
      forOwner(s, player, () =>
        choose(
          s,
          `Frodo Baggins · Response${s.table ? ` · ${seatName(s, player)}` : ""}`,
          [
            {
              id: "use",
              label:
                "Exhaust The One Ring and spend 1 resource: this attack deals no damage and each player raises his threat by 2",
              code: ROAD_DARKENS_FRODO,
              ability: {
                player,
                source: hero.id,
                code: ROAD_DARKENS_FRODO,
                type: "response",
              },
              effects: [
                fx("sagaFrodoDefense", {
                  target: hero.id,
                  source: e.source,
                  player,
                }),
              ],
            },
            { id: "skip", label: "Do not respond", effects: [] },
          ],
          "After Frodo Baggins exhausts to defend an attack.",
        ),
      );
      return true;
    }
    case "sagaFrodoDefense": {
      const hero = get(s, e.target);
      const ring = hero?.attachments.find((a) => isOneRing(a.code));
      if (!hero || !ring || ring.exhausted || hero.resources < 1) return true;
      spendResources(s, hero, 1);
      ring.exhausted = true;
      if (s.combat && s.combat.enemyId === e.source) s.combat.noDamage = true;
      log(
        s,
        "Frodo Baggins exhausts The One Ring: this attack deals no damage, and each player raises his threat by 2.",
        "good",
      );
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 2, "player-card"));
      batch4Scenario(s).oneRingExhausted?.(s);
      return true;
    }
    case "sagaFrodoCancel": {
      const hero = get(s, e.target);
      const ring = hero?.attachments.find((a) => isOneRing(a.code));
      if (!hero || !ring || ring.exhausted || hero.resources < 1 || !e.code) {
        prepend(s, ...(e.effects ?? []));
        return true;
      }
      spendResources(s, hero, 1);
      ring.exhausted = true;
      s.encounterDeck.push(e.code);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Frodo Baggins exhausts The One Ring: ${card(e.code).name} is canceled and shuffled back into the encounter deck. ${s.table ? seatName(s, e.player ?? activeSeat(s)) : "You"} reveal${s.table ? "s" : ""} another card.`,
        "good",
      );
      prepend(
        s,
        fx("reveal", {
          source: e.source,
          revealOrigin: e.revealOrigin,
          player: e.player,
        }),
      );
      return true;
    }
    default:
      return false;
  }
}
